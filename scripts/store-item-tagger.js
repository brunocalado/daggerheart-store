import { MODULE_ID, VALID_ITEM_TYPES, STORE_FLAGS } from "./store-constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Item types whose tier is stored in system.tier, not in module flags */
const SYSTEM_TIER_TYPES = ["weapon", "armor"];

/**
 * Store Item Tagger Application
 * Allows dragging and dropping items or folders to edit their Store tags (Price, Tier, Header).
 * Supports single-item mode (one item dropped) and folder-batch mode (folder dropped).
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
        /** @type {Item[]} Items loaded from a folder drop, for batch editing. */
        this.folderItems = [];
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
            clearItem: StoreItemTagger.prototype._onClearItem,
            clearFolder: StoreItemTagger.prototype._onClearFolder
        }
    };

    static BASE_APPLICATION = foundry.applications.api.ApplicationV2;

    static PARTS = {
        main: {
            template: "modules/daggerheart-store/templates/item-tagger.hbs"
        }
    };

    /**
     * Prepares context data for the Handlebars template.
     * Exposes isSystemTierType so the template can branch tier UI for weapon/armor.
     * In folder-batch mode, exposes folderItems and hasFolderItems instead.
     * @param {object} options - Render options from AppV2 lifecycle
     * @returns {Promise<object>} Template context
     */
    async _prepareContext(options) {
        return {
            item: this.item,
            tags: this.tags,
            hasItem: !!this.item,
            isSystemTierType: this.item ? SYSTEM_TIER_TYPES.includes(this.item.type) : false,
            folderItems: this.folderItems,
            hasFolderItems: this.folderItems.length > 0
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

        // View buttons — open each item's sheet for inspection (folder-batch mode only).
        html.querySelectorAll(".view-item-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const item = await fromUuid(btn.dataset.uuid);
                if (item) item.sheet.render(true);
            });
        });
    }

    /**
     * Handles drop events on the drop zone and item preview areas.
     * Dispatches to single-item or folder handlers based on drag data type.
     * Attached in _onRender via dragover/dragleave/drop listeners.
     * @param {DragEvent} event - The native DOM drag event
     */
    async _onDrop(event) {
        event.preventDefault();
        const dropZone = this.element.querySelector(".drop-zone");
        if (dropZone) dropZone.classList.remove("hover");
        const itemPreview = this.element.querySelector(".item-preview");
        if (itemPreview) itemPreview.classList.remove("drag-over");

        // Use the modern UX path for TextEditor in v13+.
        const data = foundry.applications.ux.TextEditor.getDragEventData(event);
        if (!data?.type) return;

        if (data.type === "Item") {
            await this._onDropItem(data);
        } else if (data.type === "Folder") {
            await this._onDropFolder(data);
        }
    }

    /**
     * Handles a single Item drop — loads the item and enters single-item edit mode.
     * @param {{type: string, uuid: string}} data - Normalized drag event data
     */
    async _onDropItem(data) {
        const item = await fromUuid(data.uuid);
        if (!item) return;

        if (!VALID_ITEM_TYPES.includes(item.type)) {
            ui.notifications.warn(`Invalid item type. Only ${VALID_ITEM_TYPES.join(", ")} are allowed.`);
            return;
        }

        // Clear folder mode when switching to single-item mode.
        this.folderItems = [];
        this.item = item;

        // If weapon/armor has a stale tier flag from before this fix, clean it up silently.
        if (SYSTEM_TIER_TYPES.includes(item.type)) {
            const staleFlag = item.getFlag(MODULE_ID, STORE_FLAGS.tier);
            if (staleFlag !== undefined) {
                await item.unsetFlag(MODULE_ID, STORE_FLAGS.tier);
            }
        }

        this._parseTags(item);
        this.render();
    }

    /**
     * Handles a Folder drop — loads immediate children filtered by VALID_ITEM_TYPES
     * and enters folder-batch edit mode. Supports both world folders and compendium folders.
     * No recursion: only the direct children of the dropped folder are loaded.
     * @param {{type: string, uuid: string}} data - Normalized drag event data
     */
    async _onDropFolder(data) {
        const folder = await fromUuid(data.uuid);
        if (!folder) return;

        let items;
        if (folder.pack) {
            // Compendium folder: query the pack for items directly in this folder.
            const pack = game.packs.get(folder.pack);
            items = await pack.getDocuments({ folder: folder.id });
        } else {
            // World folder: contents returns immediate children without recursion.
            items = folder.contents.filter(d => d.documentName === "Item");
        }

        const validItems = items.filter(i => VALID_ITEM_TYPES.includes(i.type));

        if (!validItems.length) {
            ui.notifications.warn(`No valid store items found in that folder. Allowed types: ${VALID_ITEM_TYPES.join(", ")}.`);
            return;
        }

        // Enter folder-batch mode; clear single-item state.
        this.item = null;
        this.tags = { price: null, tier: null, header: null };
        this.folderItems = validItems;
        this.render();
    }

    /**
     * Reads store metadata from item flags into local tag state.
     * For weapon/armor, tier is read from system.tier instead of a module flag.
     * Called after drop and after save to refresh the UI.
     * @param {Item} item - The item document
     */
    _parseTags(item) {
        this.tags.price  = item.getFlag(MODULE_ID, STORE_FLAGS.price)  ?? null;
        this.tags.header = item.getFlag(MODULE_ID, STORE_FLAGS.header) ?? null;

        if (SYSTEM_TIER_TYPES.includes(item.type)) {
            // For weapon/armor, tier comes from the system data field, never from a flag.
            const raw = item.system?.tier;
            this.tags.tier = (raw !== undefined && raw !== null && raw !== "") ? parseInt(raw) : null;
        } else {
            this.tags.tier = item.getFlag(MODULE_ID, STORE_FLAGS.tier) ?? null;
        }
    }

    /**
     * Writes store metadata to item flags. Never touches system.description.
     * Dispatches to single-item or folder-batch save path based on current mode.
     * Triggered by the "Save" action button in the tagger form.
     * @param {Event} event - The triggering DOM event
     * @param {HTMLElement} target - The action target element
     */
    async _onSaveTags(event, target) {
        const formData = new FormData(event.target.closest("form"));

        let newPrice = formData.get("price");
        newPrice = newPrice ? Math.max(0, Math.floor(Number(newPrice))) : null;

        const newTier   = formData.get("tier")?.trim()   || null;
        const newHeader = formData.get("header")?.trim() || null;

        if (this.folderItems.length > 0) {
            await this._saveFolderTags(newPrice, newTier, newHeader);
        } else if (this.item) {
            await this._saveSingleItemTags(newPrice, newTier, newHeader);
        }
    }

    /**
     * Writes tags to the currently loaded single item.
     * For weapon/armor, tier is written to system.tier; for others, to flags.
     * @param {number|null} newPrice - Parsed price value, or null to clear
     * @param {string|null} newTier  - Selected tier string ("1"–"4"), or null to clear
     * @param {string|null} newHeader - Header string, or null to clear
     */
    async _saveSingleItemTags(newPrice, newTier, newHeader) {
        if (newPrice !== null) {
            await this.item.setFlag(MODULE_ID, STORE_FLAGS.price, newPrice);
        } else {
            await this.item.unsetFlag(MODULE_ID, STORE_FLAGS.price);
        }

        if (SYSTEM_TIER_TYPES.includes(this.item.type)) {
            // Weapon/armor: write to system.tier only when a valid tier is selected; never wipe it.
            if (newTier) {
                await this.item.update({ "system.tier": parseInt(newTier) });
            }
            await this.item.unsetFlag(MODULE_ID, STORE_FLAGS.tier);
        } else {
            if (newTier) {
                await this.item.setFlag(MODULE_ID, STORE_FLAGS.tier, parseInt(newTier));
            } else {
                await this.item.unsetFlag(MODULE_ID, STORE_FLAGS.tier);
            }
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

    /**
     * Writes tags to all checked items in folder-batch mode using a single batched update.
     * Tier has three states:
     *   - "" (empty)  → leave unchanged — tier is not modified on any item.
     *   - "none"      → clear the tier flag for non-weapon/armor items; weapons/armor untouched.
     *   - "1"–"4"    → set the tier on all items (system.tier for weapons/armor, flag for others).
     * Items from the same folder always share the same collection context (one pack or world).
     * @param {number|null} newPrice  - Parsed price value, or null to clear
     * @param {string|null} newTier   - Tier selection: "1"–"4", "none", or null (leave unchanged)
     * @param {string|null} newHeader - Header string, or null to clear
     */
    async _saveFolderTags(newPrice, newTier, newHeader) {
        // Checkboxes are DOM state — collect checked UUIDs at save time.
        const checkedUuids = new Set(
            [...this.element.querySelectorAll(".folder-item-list input[type=checkbox]:checked")]
                .map(cb => cb.dataset.uuid)
        );

        const activeItems = this.folderItems.filter(i => checkedUuids.has(i.uuid));
        if (!activeItems.length) {
            ui.notifications.warn("No items are checked.");
            return;
        }

        // Build one update object per active item.
        const updates = activeItems.map(item => {
            const u = { _id: item.id };

            // Price: null clears the flag via the "-=key" Foundry deletion syntax.
            if (newPrice !== null) {
                u[`flags.${MODULE_ID}.${STORE_FLAGS.price}`] = newPrice;
            } else {
                u[`flags.${MODULE_ID}.-=${STORE_FLAGS.price}`] = null;
            }

            // Tier: three states — numeric value sets it, "none" clears it (non-weapon/armor only),
            // null/empty leaves it untouched on every item.
            if (newTier === "none") {
                // Clear tier flag for consumables/loot; weapons/armor system.tier is preserved.
                if (!SYSTEM_TIER_TYPES.includes(item.type)) {
                    u[`flags.${MODULE_ID}.-=${STORE_FLAGS.tier}`] = null;
                }
            } else if (newTier) {
                // Numeric tier: write to system.tier for weapons/armor, flag for others.
                if (SYSTEM_TIER_TYPES.includes(item.type)) {
                    u["system.tier"] = parseInt(newTier);
                } else {
                    u[`flags.${MODULE_ID}.${STORE_FLAGS.tier}`] = parseInt(newTier);
                }
            }
            // else: null/empty → no tier key added → unchanged on all items

            // Header: null clears the flag.
            if (newHeader) {
                u[`flags.${MODULE_ID}.${STORE_FLAGS.header}`] = newHeader;
            } else {
                u[`flags.${MODULE_ID}.-=${STORE_FLAGS.header}`] = null;
            }

            return u;
        });

        // All items come from the same folder, so they share one collection context.
        const firstItem = activeItems[0];
        const context = firstItem.pack ? { pack: firstItem.pack } : {};

        await Item.implementation.updateDocuments(updates, context);
        ui.notifications.info(`Updated tags for ${activeItems.length} item(s).`);
        this.render();
    }

    /**
     * Clears single-item mode and returns to the empty drop zone.
     * Also defensively resets folderItems in case both modes were somehow active.
     */
    _onClearItem() {
        this.item = null;
        this.tags = { price: null, tier: null, header: null };
        this.folderItems = [];
        this.render();
    }

    /**
     * Clears folder-batch mode and returns to the empty drop zone.
     */
    _onClearFolder() {
        this.folderItems = [];
        this.render();
    }
}