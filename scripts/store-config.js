import { PRICE_DATA, PACK_MAPPING } from "./price-data.js";
import { StockManager } from "./stock-manager.js";
import {
    MODULE_ID, STANDARD_CATEGORIES, CATEGORY_ITEM_TYPE,
    EXCLUDED_SYSTEM_PACKS, CATEGORY_ICONS
} from "./store-constants.js";
import { getValidItemTypes, getItemTier, showStoreDialog } from "./store-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM Configuration Application (Application V2)
 */
export class StoreConfig extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options) {
        super(options);
        this.currentTab = "general";
    }

    static DEFAULT_OPTIONS = {
        id: "daggerheart-store-config",
        tag: "form",
        window: { title: "Store Configuration (GM)", icon: "fas fa-cogs", resizable: true },
        position: { width: 700, height: 740 },
        form: { handler: StoreConfig.prototype._updateSettings, closeOnSubmit: true },
        actions: {
            addCompendium: StoreConfig.prototype._onAddCompendium,
            removeCompendium: StoreConfig.prototype._onRemoveCompendium,
            addCustomTabCompendium: StoreConfig.prototype._onAddCustomTabCompendium,
            removeCustomTabCompendium: StoreConfig.prototype._onRemoveCustomTabCompendium,
            applyStockDefaults: StoreConfig.prototype._onApplyStockDefaults,
            restockAll: StoreConfig.prototype._onRestockAll,
            openInstructions: StoreConfig.prototype._onOpenInstructions
        }
    };

    static PARTS = { form: { template: "modules/daggerheart-store/templates/store-config.hbs" } };

    async _prepareContext(options) {
        const priceMod = game.settings.get(MODULE_ID, "priceModifier");
        const saleDiscount = game.settings.get(MODULE_ID, "saleDiscount");
        const sellRatio = game.settings.get(MODULE_ID, "sellRatio");

        const allowedTiers = game.settings.get(MODULE_ID, "allowedTiers");
        const hiddenCategories = game.settings.get(MODULE_ID, "hiddenCategories");
        const customCompendiums = game.settings.get(MODULE_ID, "customCompendiums") || [];
        const selectedPartyActor = game.settings.get(MODULE_ID, "partyActorId");

        const storeName = game.settings.get(MODULE_ID, "storeName");
        const customTabName = game.settings.get(MODULE_ID, "customTabName");
        const customTabCompendiums = game.settings.get(MODULE_ID, "customTabCompendiums") || [];
        const customTabTierGroup = game.settings.get(MODULE_ID, "customTabTierGroup");
        const useDefaultCompendiums = game.settings.get(MODULE_ID, "useDefaultCompendiums");

        // Epic Settings
        const epicIcon = game.settings.get(MODULE_ID, "epicIcon");
        const epicColor = game.settings.get(MODULE_ID, "epicColor");
        const epicLabel = game.settings.get(MODULE_ID, "epicLabel");
        const epicEffect = game.settings.get(MODULE_ID, "epicEffect");

        // Stock System Data
        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const hasPartyActor = !!(partyActorId && game.actors.get(partyActorId));
        const stockEnabled = game.settings.get(MODULE_ID, "stockEnabled");
        const showStockQuantity = game.settings.get(MODULE_ID, "showStockQuantity");

        const storeActor = StockManager.getStoreActor();
        const stockKey = StockManager.getStockKey();
        const categoryDefaults = storeActor?.getFlag(MODULE_ID, `${stockKey}.categoryDefaults`) ||
            StockManager._getDefaultCategorySettings();

        const partyActors = game.actors.filter(a => a.type === "party").map(a => ({ id: a.id, name: a.name })).sort((a, b) => a.name.localeCompare(b.name));

        // Filter packs that have at least one valid item type
        const validItemTypes = getValidItemTypes();
        const candidatePacks = game.packs.filter(p =>
            p.documentName === "Item" && !EXCLUDED_SYSTEM_PACKS.includes(p.collection)
        );

        const availablePacks = [];
        for (const pack of candidatePacks) {
            const index = await pack.getIndex();
            const hasValidType = index.some(entry => validItemTypes.includes(entry.type));
            if (hasValidType) {
                availablePacks.push({
                    id: pack.collection,
                    label: `${pack.metadata.label} (${pack.collection})`
                });
            }
        }
        availablePacks.sort((a, b) => a.label.localeCompare(b.label));

        // Party Actor Ownership Info
        let partyActorOwnership = "";
        let partyActorOwnershipOk = false;
        if (selectedPartyActor) {
            const partyActor = game.actors.get(selectedPartyActor);
            if (partyActor) {
                const defaultOwnership = partyActor.ownership.default ?? 0;
                const ownershipLevels = { 0: "None", 1: "Limited", 2: "Observer", 3: "Owner" };
                partyActorOwnership = ownershipLevels[defaultOwnership] || "None";
                partyActorOwnershipOk = defaultOwnership >= 3;
            }
        }

        let allCategories = foundry.utils.deepClone(STANDARD_CATEGORIES);

        const hasCustomTab = customTabCompendiums.some(p => p && p.trim() !== "");
        if (hasCustomTab) {
            allCategories.push({
                id: "custom-tab",
                label: customTabName || "General",
                key: "CustomTab"
            });
        }

        const categoryConfigList = allCategories.map(cat => ({
            key: cat.key,
            label: cat.label,
            icon: CATEGORY_ICONS[cat.key] || "fa-box",
            tiers: allowedTiers[cat.key] || {1:true, 2:true, 3:true, 4:true},
            isVisible: !hiddenCategories[cat.key]
        }));

        // Stock Category Defaults for template
        const stockCategoryDefaults = STANDARD_CATEGORIES.map(cat => ({
            key: cat.key,
            label: cat.label,
            tier1: categoryDefaults[cat.key]?.tier1 || 10,
            tier2: categoryDefaults[cat.key]?.tier2 || 5,
            tier3: categoryDefaults[cat.key]?.tier3 || 3,
            tier4: categoryDefaults[cat.key]?.tier4 || 1
        }));

        return {
            storeName: storeName,
            customTabName: customTabName,
            customTabCompendiums: customTabCompendiums,
            customTabTierGroup: customTabTierGroup,
            useDefaultCompendiums: useDefaultCompendiums,
            priceModifier: priceMod,
            saleDiscount: saleDiscount,
            sellRatioPercent: Math.round(sellRatio * 100),
            categories: categoryConfigList,
            customCompendiums: customCompendiums,
            availableCategories: STANDARD_CATEGORIES.map(c => c.key),
            availablePacks: availablePacks,
            partyActors: partyActors,
            selectedPartyActor: selectedPartyActor,
            partyActorOwnership: partyActorOwnership,
            partyActorOwnershipOk: partyActorOwnershipOk,
            stockReady: hasPartyActor && partyActorOwnershipOk,
            activeTab: this.currentTab,
            hasPartyActor: hasPartyActor,
            stockEnabled: stockEnabled,
            showStockQuantity: showStockQuantity,
            stockCategoryDefaults: stockCategoryDefaults,
            epicIcon: epicIcon,
            epicColor: epicColor,
            epicLabel: epicLabel,
            epicEffect: epicEffect
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;
        const tabs = html.querySelectorAll(".sheet-tabs .item");

        tabs.forEach(tab => {
            tab.addEventListener("click", (e) => {
                e.preventDefault();
                const tabId = e.currentTarget.dataset.tab;
                this.currentTab = tabId;

                tabs.forEach(t => t.classList.remove("active"));
                e.currentTarget.classList.add("active");

                const contents = html.querySelectorAll(".tab-content");
                contents.forEach(c => c.classList.remove("active"));
                const target = html.querySelector(`.tab-content[data-tab="${tabId}"]`);
                if (target) target.classList.add("active");
            });
        });

        // Slider logic
        const sliders = html.querySelectorAll("input[type='range']");
        sliders.forEach(range => {
            const display = range.nextElementSibling;
            if (display && display.classList.contains("range-value")) {
                range.addEventListener("input", (e) => {
                    display.innerText = `${e.target.value}%`;
                });
            }
        });

        // Party Actor ownership update
        const partySelect = html.querySelector("select[name='partyActorId']");
        if (partySelect) {
            partySelect.addEventListener("change", (e) => {
                const actorId = e.target.value;
                const ownershipInfo = html.querySelector(".ownership-info");

                let hasActor = false;
                let isOk = false;
                let ownershipText = "None";

                if (actorId) {
                    const actor = game.actors.get(actorId);
                    if (actor) {
                        hasActor = true;
                        const defaultOwnership = actor.ownership.default ?? 0;
                        const ownershipLevels = { 0: "None", 1: "Limited", 2: "Observer", 3: "Owner" };
                        ownershipText = ownershipLevels[defaultOwnership] || "None";
                        isOk = defaultOwnership >= 3;
                    }
                }

                if (ownershipInfo) {
                    if (hasActor) {
                        ownershipInfo.style.display = "flex";
                        const valueSpan = ownershipInfo.querySelector(".ownership-value");
                        const statusSpan = ownershipInfo.querySelector(".ownership-status");
                        if (valueSpan) valueSpan.textContent = ownershipText;
                        if (statusSpan) {
                            statusSpan.textContent = isOk ? "Status: OK" : "Status: WARNING (Read Docs)";
                            statusSpan.classList.remove("status-ok", "status-warning");
                            statusSpan.classList.add(isOk ? "status-ok" : "status-warning");
                        }
                    } else {
                        ownershipInfo.style.display = "none";
                    }
                }

                const stockReady = hasActor && isOk;
                const stockCard = html.querySelector(".stock-toggle-card");
                const stockCheckbox = html.querySelector("#stockEnabledCheckbox");

                if (stockCard && stockCheckbox) {
                    stockCheckbox.disabled = !stockReady;

                    if (stockReady) {
                        stockCard.classList.remove("disabled");
                    } else {
                        stockCard.classList.add("disabled");
                        stockCard.classList.remove("active");
                        stockCheckbox.checked = false;
                    }

                    const descSpan = stockCard.querySelector(".stock-description");
                    if (descSpan) {
                        descSpan.innerHTML = stockReady
                            ? "Tracks item quantities and prevents purchases when out of stock."
                            : '<em class="warning">Requires Party Actor with Owner permission.</em>';
                    }
                }
            });
        }

        // Category Cards Toggle Visual
        const categoryCards = html.querySelectorAll(".category-card");
        categoryCards.forEach(card => {
            card.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();

                const checkbox = card.querySelector("input[type='checkbox']");
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) {
                        card.classList.add("active");
                    } else {
                        card.classList.remove("active");
                    }
                }
            });
        });

        // Toggle Card Visual (Stock, Tier Group, etc.)
        const toggleCards = html.querySelectorAll(".stock-toggle-card");
        toggleCards.forEach(card => {
            card.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (card.classList.contains("disabled")) return;

                const checkbox = card.querySelector("input[type='checkbox']");
                if (checkbox && !checkbox.disabled) {
                    checkbox.checked = !checkbox.checked;
                    card.classList.toggle("active", checkbox.checked);
                }
            });
        });

        // Tier Matrix: Tier Button Toggle Visual
        const tierBtns = html.querySelectorAll(".tier-btn");
        tierBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                const checkbox = btn.querySelector("input[type='checkbox']");
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    btn.classList.toggle("active", checkbox.checked);
                    this._updateBulkCheckboxes(html);
                }
            });
        });

        // Tier Matrix: Bulk Column Toggle
        const bulkColToggles = html.querySelectorAll(".bulk-col-toggle");
        bulkColToggles.forEach(toggle => {
            toggle.addEventListener("change", (e) => {
                const tier = e.target.dataset.tier;
                const isChecked = e.target.checked;
                const tierCheckboxes = html.querySelectorAll(`input[name$=".${tier}"]`);
                tierCheckboxes.forEach(cb => {
                    cb.checked = isChecked;
                    const btn = cb.closest(".tier-btn");
                    if (btn) btn.classList.toggle("active", isChecked);
                });
                this._updateBulkRowCheckboxes(html);
            });
        });

        // Tier Matrix: Bulk Row Toggle
        const bulkRowToggles = html.querySelectorAll(".bulk-row-toggle");
        bulkRowToggles.forEach(toggle => {
            toggle.addEventListener("change", (e) => {
                const isChecked = e.target.checked;
                const row = e.target.closest("tr");
                if (row) {
                    const tierCheckboxes = row.querySelectorAll(".tier-btn input[type='checkbox']");
                    tierCheckboxes.forEach(cb => {
                        cb.checked = isChecked;
                        const btn = cb.closest(".tier-btn");
                        if (btn) btn.classList.toggle("active", isChecked);
                    });
                }
                this._updateBulkColCheckboxes(html);
            });
        });

        // Merged Compendiums: Filter category options based on selected pack's item types
        const packSelects = html.querySelectorAll("select[name^='customCompendiums.'][name$='.pack']");
        packSelects.forEach(packSelect => {
            this._filterCategoryOptions(packSelect);
            packSelect.addEventListener("change", () => {
                this._filterCategoryOptions(packSelect);
            });
        });

        // Initialize bulk checkbox states
        this._updateBulkCheckboxes(html);
    }

    /**
     * Filters category options based on item types available in the selected compendium
     */
    async _filterCategoryOptions(packSelect) {
        const packId = packSelect.value;
        const row = packSelect.closest(".compendium-row");
        if (!row) return;

        const categorySelect = row.querySelector("select[name$='.category']");
        if (!categorySelect) return;

        const currentCategory = categorySelect.value;
        const allCategories = STANDARD_CATEGORIES.map(c => c.key);

        if (!packId) {
            this._updateCategorySelectOptions(categorySelect, allCategories, currentCategory);
            return;
        }

        const pack = game.packs.get(packId);
        if (!pack) {
            this._updateCategorySelectOptions(categorySelect, allCategories, currentCategory);
            return;
        }

        const index = await pack.getIndex();
        const typesInPack = new Set(index.map(entry => entry.type));

        const validCategories = allCategories.filter(categoryKey => {
            const expectedType = CATEGORY_ITEM_TYPE[categoryKey];
            return expectedType && typesInPack.has(expectedType);
        });

        this._updateCategorySelectOptions(categorySelect, validCategories, currentCategory);
    }

    /**
     * Updates the category select options
     */
    _updateCategorySelectOptions(categorySelect, validCategories, currentValue) {
        categorySelect.innerHTML = "";

        for (const cat of validCategories) {
            const option = document.createElement("option");
            option.value = cat;
            option.textContent = cat;
            if (cat === currentValue) option.selected = true;
            categorySelect.appendChild(option);
        }

        if (!validCategories.includes(currentValue) && validCategories.length > 0) {
            categorySelect.value = validCategories[0];
        }
    }

    /**
     * Updates both row and column bulk checkboxes based on current state
     */
    _updateBulkCheckboxes(html) {
        this._updateBulkColCheckboxes(html);
        this._updateBulkRowCheckboxes(html);
    }

    /**
     * Updates column bulk checkboxes based on current tier state
     */
    _updateBulkColCheckboxes(html) {
        for (let tier = 1; tier <= 4; tier++) {
            const colToggle = html.querySelector(`.bulk-col-toggle[data-tier="${tier}"]`);
            if (colToggle) {
                const tierCheckboxes = html.querySelectorAll(`input[name$=".${tier}"]`);
                const allChecked = Array.from(tierCheckboxes).every(cb => cb.checked);
                colToggle.checked = allChecked;
            }
        }
    }

    /**
     * Updates row bulk checkboxes based on current tier state
     */
    _updateBulkRowCheckboxes(html) {
        const rowToggles = html.querySelectorAll(".bulk-row-toggle");
        rowToggles.forEach(toggle => {
            const row = toggle.closest("tr");
            if (row) {
                const tierCheckboxes = row.querySelectorAll(".tier-btn input[type='checkbox']");
                const allChecked = Array.from(tierCheckboxes).every(cb => cb.checked);
                toggle.checked = allChecked;
            }
        });
    }

    /**
     * Handles opening the instructions journal from Config
     */
    async _onOpenInstructions(event, target) {
        const uuid = "Compendium.daggerheart-store.journals.JournalEntry.fIXCeXWeDbAu3uFg.JournalEntryPage.bbQY9zgHxE3hTplw";
        const page = await fromUuid(uuid);
        if (page) {
            const journal = page.parent;
            if (journal) {
                journal.sheet.render(true, { pageId: page.id });
            }
        } else {
            ui.notifications.warn("Instructions journal not found in the compendium.");
        }
    }

    async _onAddCompendium(event, target) {
        const currentFormValues = [];
        const packSelects = this.element.querySelectorAll("select[name^='customCompendiums.'][name$='.pack']");
        packSelects.forEach((packSelect, index) => {
            const categorySelect = this.element.querySelector(`select[name='customCompendiums.${index}.category']`);
            currentFormValues.push({
                pack: packSelect.value || "",
                category: categorySelect?.value || "Loot"
            });
        });

        currentFormValues.push({ pack: "", category: "Loot" });

        await game.settings.set(MODULE_ID, "customCompendiums", currentFormValues);
        this.render();
    }

    async _onRemoveCompendium(event, target) {
        const idx = parseInt(target.dataset.index);

        const currentFormValues = [];
        const packSelects = this.element.querySelectorAll("select[name^='customCompendiums.'][name$='.pack']");
        packSelects.forEach((packSelect, index) => {
            const categorySelect = this.element.querySelector(`select[name='customCompendiums.${index}.category']`);
            currentFormValues.push({
                pack: packSelect.value || "",
                category: categorySelect?.value || "Loot"
            });
        });

        currentFormValues.splice(idx, 1);

        await game.settings.set(MODULE_ID, "customCompendiums", currentFormValues);
        this.render();
    }

    async _onAddCustomTabCompendium(event, target) {
        const currentFormValues = [];
        const packSelects = this.element.querySelectorAll("select[name^='customTabCompendiums.']");
        packSelects.forEach(select => {
            if (select.value) currentFormValues.push(select.value);
        });
        currentFormValues.push("");
        await game.settings.set(MODULE_ID, "customTabCompendiums", currentFormValues);
        this.render();
    }

    async _onRemoveCustomTabCompendium(event, target) {
        const idx = parseInt(target.dataset.index);
        const currentFormValues = [];
        const packSelects = this.element.querySelectorAll("select[name^='customTabCompendiums.']");
        packSelects.forEach(select => {
            currentFormValues.push(select.value || "");
        });
        currentFormValues.splice(idx, 1);
        await game.settings.set(MODULE_ID, "customTabCompendiums", currentFormValues);
        this.render();
    }

    async _onApplyStockDefaults(event, target) {
        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const hasPartyActor = !!(partyActorId && game.actors.get(partyActorId));

        if (!hasPartyActor) {
            return ui.notifications.error(
                "Configure a Party Actor before managing stock."
            );
        }

        const confirmed = await showStoreDialog({
            title: "Apply Stock Defaults",
            icon: "fas fa-magic",
            headerText: "Apply Defaults",
            headerColor: "#D4AF37",
            message: "This will set quantities for <b>ALL items</b> based on category/tier defaults.",
            description: "Already configured items will be overwritten. Continue?"
        });

        if (!confirmed) return;

        const storeActor = StockManager.getStoreActor();
        const categoryDefaults = {};

        const stockInputs = this.element.querySelectorAll("input.stock-tier-input");

        if (stockInputs.length > 0) {
            stockInputs.forEach(input => {
                const name = input.name;
                const match = name.match(/^stockDefaults\.(.+)\.(tier\d)$/);
                if (match) {
                    const [, categoryKey, tierKey] = match;
                    if (!categoryDefaults[categoryKey]) {
                        categoryDefaults[categoryKey] = {};
                    }
                    categoryDefaults[categoryKey][tierKey] = parseInt(input.value) || 0;
                }
            });

            if (Object.keys(categoryDefaults).length > 0) {
                const applyStockKey = StockManager.getStockKey();
                await storeActor.update({
                    [`flags.${MODULE_ID}.${applyStockKey}.categoryDefaults`]: categoryDefaults
                });
            }
        }

        const finalDefaults = Object.keys(categoryDefaults).length > 0
            ? categoryDefaults
            : (storeActor?.getFlag(MODULE_ID, `${StockManager.getStockKey()}.categoryDefaults`) || StockManager._getDefaultCategorySettings());

        const useDefaultCompendiums = game.settings.get(MODULE_ID, "useDefaultCompendiums");
        const itemUuidMap = new Map();
        for (const packId of (useDefaultCompendiums ? Object.values(PACK_MAPPING) : [])) {
            const pack = game.packs.get(packId);
            if (pack) {
                const docs = await pack.getDocuments();
                for (const doc of docs) {
                    itemUuidMap.set(doc.name, doc.uuid);
                }
            }
        }

        const getItemUuid = (itemName) => itemUuidMap.get(itemName) || null;

        const itemCount = await StockManager.batchApplyDefaults(finalDefaults, getItemUuid);

        // Also process custom compendiums (merged compendiums)
        const customCompendiums = game.settings.get(MODULE_ID, "customCompendiums") || [];
        let customItemCount = 0;

        if (customCompendiums.length > 0) {
            const stockItems = storeActor.getFlag(MODULE_ID, `${StockManager.getStockKey()}.items`) || {};

            for (const custom of customCompendiums) {
                const categoryKey = custom.category;
                const defaults = finalDefaults[categoryKey];
                if (!defaults) continue;

                const pack = game.packs.get(custom.pack);
                if (!pack) continue;

                const docs = await pack.getDocuments();
                for (const doc of docs) {
                    const expectedType = CATEGORY_ITEM_TYPE[categoryKey];
                    if (expectedType && doc.type !== expectedType) continue;

                    if (doc.type === "weapon") {
                        const isSecondary = foundry.utils.getProperty(doc, "system.secondary") === true;
                        if (isSecondary && categoryKey !== "Secondary Weapons") continue;
                        if (!isSecondary && categoryKey === "Secondary Weapons") continue;
                    }

                    if (PRICE_DATA[categoryKey]?.[doc.name]) continue;

                    const tier = getItemTier(doc);
                    const qty = defaults[`tier${tier}`] || 0;

                    const key = StockManager.sanitizeKey(doc.uuid);
                    stockItems[key] = {
                        stockpile: { q: qty, r: qty, u: false }
                    };
                    customItemCount++;
                }
            }

            if (customItemCount > 0) {
                const customStockKey = StockManager.getStockKey();
                const version = storeActor.getFlag(MODULE_ID, `${customStockKey}.version`) || 1;
                await storeActor.update({
                    [`flags.${MODULE_ID}.${customStockKey}.items`]: stockItems,
                    [`flags.${MODULE_ID}.${customStockKey}.version`]: version + 1
                });
            }
        }

        const totalItems = itemCount + customItemCount;
        ui.notifications.info(`Stock defaults applied to ${totalItems} items!`);
        this.render();
    }

    async _onRestockAll(event, target) {
        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const hasPartyActor = !!(partyActorId && game.actors.get(partyActorId));

        if (!hasPartyActor) {
            return ui.notifications.error(
                "Configure a Party Actor before managing stock."
            );
        }

        const confirmed = await showStoreDialog({
            title: "Restock All",
            icon: "fas fa-redo",
            headerText: "Restock All Items",
            headerColor: "#D4AF37",
            message: "This will restore <b>ALL items</b> to their original stock quantities.",
            description: "Items will be reset to their default values. Continue?"
        });

        if (!confirmed) return;

        await StockManager.resetAllStock();
        ui.notifications.info("All items restocked!");
        this.render();
    }

    async _updateSettings(event, form, formData) {
        const expanded = foundry.utils.expandObject(formData.object);

        const allKeys = STANDARD_CATEGORIES.map(c => c.key);
        const hasCustomTabEntries = expanded.customTabCompendiums && Object.values(expanded.customTabCompendiums).some(v => typeof v === "string" && v.trim() !== "");
        if (hasCustomTabEntries) allKeys.push("CustomTab");

        const finalHiddenMap = {};
        allKeys.forEach(key => {
            const isVisible = expanded.visibility && expanded.visibility[key];
            finalHiddenMap[key] = !isVisible;
        });

        await game.settings.set(MODULE_ID, "storeName", expanded.storeName);
        await game.settings.set(MODULE_ID, "customTabName", expanded.customTabName);

        if (expanded.customTabCompendiums) {
            const tabCompendiumArray = Object.values(expanded.customTabCompendiums).filter(v => typeof v === "string");
            await game.settings.set(MODULE_ID, "customTabCompendiums", tabCompendiumArray);
        }

        await game.settings.set(MODULE_ID, "customTabTierGroup", expanded.customTabTierGroup || false);
        await game.settings.set(MODULE_ID, "useDefaultCompendiums", expanded.useDefaultCompendiums !== false);

        await game.settings.set(MODULE_ID, "priceModifier", expanded.priceModifier);

        const epicLabelVal = (expanded.epicLabel || "Epic").slice(0, 15);
        await game.settings.set(MODULE_ID, "epicLabel", epicLabelVal);
        await game.settings.set(MODULE_ID, "epicIcon", expanded.epicIcon || "fa-star");
        await game.settings.set(MODULE_ID, "epicColor", expanded.epicColor || "#9b59b6");
        await game.settings.set(MODULE_ID, "epicEffect", expanded.epicEffect || "shine");
        await game.settings.set(MODULE_ID, "saleDiscount", expanded.saleDiscount);

        const sellRatioDecimal = expanded.sellRatioPercent / 100;
        await game.settings.set(MODULE_ID, "sellRatio", sellRatioDecimal);

        await game.settings.set(MODULE_ID, "allowedTiers", expanded.tiers || {});

        await game.settings.set(MODULE_ID, "hiddenCategories", finalHiddenMap);
        await game.settings.set(MODULE_ID, "partyActorId", expanded.partyActorId);

        if (expanded.customCompendiums) {
            const compendiumArray = Object.values(expanded.customCompendiums);
            await game.settings.set(MODULE_ID, "customCompendiums", compendiumArray);
        }

        // Stock System Settings - Validate Party Actor before enabling
        const partyActorId = expanded.partyActorId || game.settings.get(MODULE_ID, "partyActorId");
        const hasPartyActor = !!(partyActorId && game.actors.get(partyActorId));

        if (expanded.stockEnabled && !hasPartyActor) {
            ui.notifications.error(
                "Cannot enable stock system without a Party Actor configured. " +
                "Configure a Party Actor in the General tab first."
            );
            expanded.stockEnabled = false;
        }

        await game.settings.set(MODULE_ID, "stockEnabled", expanded.stockEnabled || false);

        if (expanded.stockDefaults) {
            const actor = StockManager.getStoreActor();
            if (actor) {
                const settingsStockKey = StockManager.getStockKey();
                await actor.update({
                    [`flags.${MODULE_ID}.${settingsStockKey}.categoryDefaults`]: expanded.stockDefaults
                });
            }
        }
    }
}
