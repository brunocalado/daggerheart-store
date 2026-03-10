import { MODULE_ID, VALID_ITEM_TYPES } from "./store-constants.js";

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
            template: "modules/daggerheart-store/templates/store-item-tagger.hbs"
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
            if (pricePreview) pricePreview.textContent = price ? `{{{${price}}}}` : "{{{Price}}}";

            const tierPreview = html.querySelector(".preview-tier");
            if (tierPreview) tierPreview.textContent = tier ? `{{{tier${tier}}}}` : "{{{tierX}}}";

            const headerPreview = html.querySelector(".preview-header");
            if (headerPreview) headerPreview.textContent = header ? `{{{${header}}}}` : "{{{Header}}}";
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

    _parseTags(item) {
        const desc = foundry.utils.getProperty(item, "system.description.value") || 
                     foundry.utils.getProperty(item, "system.description") || "";
        
        // Price: {{{123}}}
        const priceMatch = desc.match(/\{\{\{(\d+)\}\}\}/);
        this.tags.price = priceMatch ? parseInt(priceMatch[1]) : null;

        // Tier: {{{tierX}}}
        const tierMatch = desc.match(/\{\{\{tier([1-4])\}\}\}/i);
        this.tags.tier = tierMatch ? parseInt(tierMatch[1]) : null;

        // Header: {{{Text}}} (excluding numbers and tier)
        const allTags = [...desc.matchAll(/\{\{\{([^}]+)\}\}\}/g)];
        this.tags.header = null;
        
        for (const match of allTags) {
            const content = match[1];
            if (/^\d+$/.test(content)) continue;
            if (/^tier[1-4]$/i.test(content)) continue;
            this.tags.header = content;
            break; // Take first valid header
        }
    }

    async _onSaveTags(event, target) {
        if (!this.item) return;

        const formData = new FormData(event.target.closest("form"));
        let newPrice = formData.get("price");
        if (newPrice) {
            // Ensure integer and non-negative
            newPrice = Math.max(0, Math.floor(Number(newPrice))).toString();
        }
        const newTier = formData.get("tier");
        const newHeader = formData.get("header");

        let desc = foundry.utils.getProperty(this.item, "system.description.value") || 
                   foundry.utils.getProperty(this.item, "system.description") || "";

        // Remove existing tags to ensure we don't duplicate and can move them to the end
        
        // 1. Remove Price tags: {{{123}}}
        desc = desc.replace(/\{\{\{(\d+)\}\}\}/g, "");

        // 2. Remove Tier tags: {{{tierX}}}
        desc = desc.replace(/\{\{\{tier([1-4])\}\}\}/gi, "");

        // 3. Remove Header tag (only the one we detected previously)
        const oldHeader = this.tags.header;
        if (oldHeader) {
            const escaped = oldHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`\\{\\{\\{${escaped}\\}\\}\\}`);
            desc = desc.replace(re, "");
        }

        // Clean up empty paragraphs left behind by removals
        desc = desc.replace(/<p>\s*<\/p>/g, "");
        desc = desc.trim();

        // Append new tags at the end
        let tagsBlock = "";
        
        if (newPrice) {
            tagsBlock += `<p>{{{${newPrice}}}}</p>`;
        }
        if (newTier) {
            tagsBlock += `<p>{{{tier${newTier}}}}</p>`;
        }
        if (newHeader && newHeader.trim() !== "") {
            tagsBlock += `<p>{{{${newHeader.trim()}}}}</p>`;
        }

        if (tagsBlock) {
            desc += tagsBlock;
        }

        if (this.item.system.description.value !== undefined) {
            await this.item.update({ "system.description.value": desc });
        } else {
            await this.item.update({ "system.description": desc });
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