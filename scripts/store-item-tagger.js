import { MODULE_ID, VALID_ITEM_TYPES, STORE_FLAGS } from "./store-constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Store Item Tagger Application
 * Allows dragging and dropping items to edit their Store tags (Price, Tier, Header).
 */
export class StoreItemTagger extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options) {
        super(options);
        this.item = null;
        this.tags = {
            price: null,
            tier: null,
            header: null
        };
    }

    static DEFAULT_OPTIONS = {
        id: "daggerheart-store-tagger",
        tag: "form",
        form: {
            closeOnSubmit: false
        },
        window: {
            title: "Daggerheart Store: Item Tagger",
            icon: "fas fa-tags",
            resizable: true
        },
        position: { width: 400, height: "auto" },
        classes: ["daggerheart-store-tagger"],
        actions: {
            saveTags: StoreItemTagger.prototype._onSaveTags,
            clearItem: StoreItemTagger.prototype._onClearItem
        }
    };

    static PARTS = {
        main: {
            template: "modules/daggerheart-store/templates/item-tagger.hbs"
        }
    };

    async _prepareContext(options) {
        return {
            item: this.item,
            tags: this.tags,
            hasItem: !!this.item
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;
        
        const dropZone = html.querySelector(".drop-zone");
        if (dropZone) {
            dropZone.addEventListener("dragover", (e) => {
                e.preventDefault();
                dropZone.classList.add("hover");
            });
            dropZone.addEventListener("dragleave", () => dropZone.classList.remove("hover"));
            dropZone.addEventListener("drop", this._onDrop.bind(this));
        }

        const itemPreview = html.querySelector(".item-preview");
        if (itemPreview) {
            itemPreview.addEventListener("dragover", (e) => {
                e.preventDefault();
                itemPreview.classList.add("drag-over");
            });
            itemPreview.addEventListener("dragleave", () => itemPreview.classList.remove("drag-over"));
            itemPreview.addEventListener("drop", this._onDrop.bind(this));
        }

        // Live Preview Listeners
        const priceInput = html.querySelector("input[name='price']");
        const tierSelect = html.querySelector("select[name='tier']");
        const headerInput = html.querySelector("input[name='header']");

        const updatePreviews = () => {
            const price = priceInput?.value;
            const tier = tierSelect?.value;
            const header = headerInput?.value;

            const pricePreview = html.querySelector(".preview-price");
            if (pricePreview) pricePreview.textContent = price ? `Price: ${price}` : "(not set)";

            const tierPreview = html.querySelector(".preview-tier");
            if (tierPreview) tierPreview.textContent = tier ? `Tier: ${tier}` : "(not set)";

            const headerPreview = html.querySelector(".preview-header");
            if (headerPreview) headerPreview.textContent = header ? `Header: ${header}` : "(not set)";
        };

        if (priceInput) priceInput.addEventListener("input", updatePreviews);
        if (tierSelect) tierSelect.addEventListener("change", updatePreviews);
        if (headerInput) headerInput.addEventListener("input", updatePreviews);
    }

    async _onDrop(event) {
        event.preventDefault();
        const dropZone = this.element.querySelector(".drop-zone");
        if (dropZone) dropZone.classList.remove("hover");
        const itemPreview = this.element.querySelector(".item-preview");
        if (itemPreview) itemPreview.classList.remove("drag-over");

        // Use the modern UX path for TextEditor in v13+.
        const data = foundry.applications.ux.TextEditor.getDragEventData(event);
        if (!data?.type || data.type !== "Item") return;

        const item = await fromUuid(data.uuid);
        if (!item) return;

        if (!VALID_ITEM_TYPES.includes(item.type)) {
            ui.notifications.warn(`Invalid item type. Only ${VALID_ITEM_TYPES.join(", ")} are allowed.`);
            return;
        }

        this.item = item;
        this._parseTags(item);
        this.render();
    }

    /**
     * Reads store metadata from item flags into local tag state.
     * Called after drop and after save to refresh the UI.
     * @param {Object} item - The item document
     */
    _parseTags(item) {
        this.tags.price  = item.getFlag(MODULE_ID, STORE_FLAGS.price)  ?? null;
        this.tags.tier   = item.getFlag(MODULE_ID, STORE_FLAGS.tier)   ?? null;
        this.tags.header = item.getFlag(MODULE_ID, STORE_FLAGS.header) ?? null;
    }

    /**
     * Writes store metadata to item flags. Never touches system.description.
     * Triggered by the "Save" action button in the tagger form.
     * @param {Event} event - The triggering DOM event
     * @param {HTMLElement} target - The action target element
     */
    async _onSaveTags(event, target) {
        if (!this.item) return;

        const formData = new FormData(event.target.closest("form"));

        let newPrice = formData.get("price");
        newPrice = newPrice ? Math.max(0, Math.floor(Number(newPrice))) : null;

        const newTier   = formData.get("tier")?.trim()   || null;
        const newHeader = formData.get("header")?.trim() || null;

        if (newPrice !== null) {
            await this.item.setFlag(MODULE_ID, STORE_FLAGS.price, newPrice);
        } else {
            await this.item.unsetFlag(MODULE_ID, STORE_FLAGS.price);
        }

        if (newTier) {
            await this.item.setFlag(MODULE_ID, STORE_FLAGS.tier, parseInt(newTier));
        } else {
            await this.item.unsetFlag(MODULE_ID, STORE_FLAGS.tier);
        }

        if (newHeader) {
            await this.item.setFlag(MODULE_ID, STORE_FLAGS.header, newHeader);
        } else {
            await this.item.unsetFlag(MODULE_ID, STORE_FLAGS.header);
        }

        ui.notifications.info(`Updated tags for ${this.item.name}`);
        this._parseTags(this.item);
        this.render();
    }

    _onClearItem() {
        this.item = null;
        this.tags = { price: null, tier: null, header: null };
        this.render();
    }
}