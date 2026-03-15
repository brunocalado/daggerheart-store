import { PRICE_DATA, PACK_MAPPING } from "./price-data.js";
import { StockManager } from "./stock-manager.js";
import { MODULE_ID, STANDARD_CATEGORIES, CATEGORY_ITEM_TYPE } from "./store-constants.js";
import { getValidItemTypes, getItemTier, extractPriceFromDescription, showStoreDialog } from "./store-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Store Randomizer Application (Application V2)
 * Allows GM to randomize which items are visible in each category
 */
export class StoreRandomizer extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options) {
        super(options);
    }

    static DEFAULT_OPTIONS = {
        id: "daggerheart-store-randomizer",
        tag: "div",
        window: {
            title: "Store Randomizer",
            icon: "fas fa-dice",
            resizable: true
        },
        position: { width: 750, height: 700 },
        actions: {
            randomizeCategory: StoreRandomizer.prototype._onRandomizeCategory,
            randomizeAll: StoreRandomizer.prototype._onRandomizeAll,
            resetAll: StoreRandomizer.prototype._onResetAll,
            resetCategoryDefaults: StoreRandomizer.prototype._onResetCategoryDefaults,
            openInstructions: StoreRandomizer.prototype._onOpenInstructions,
            setMaxToTotal: StoreRandomizer.prototype._onSetMaxToTotal
        }
    };

    static PARTS = {
        main: {
            template: "modules/daggerheart-store/templates/store-randomizer.hbs"
        }
    };

    _onRender(context, options) {
        super._onRender(context, options);
        const inputs = this.element.querySelectorAll('.randomizer-inputs-row input[type="number"]');
        for (const input of inputs) {
            input.addEventListener("change", () => this._saveRandomizerSettings());
        }
    }

    /**
     * Gathers all randomizer input values and persists them to the setting
     */
    _saveRandomizerSettings() {
        const rows = this.element.querySelectorAll(".category-randomizer-row");
        const settings = {};
        for (const row of rows) {
            const key = row.dataset.category;
            settings[key] = {
                minItems: parseInt(row.querySelector(".rand-min-items").value) || 0,
                maxItems: parseInt(row.querySelector(".rand-max-items").value) || 0,
                qtyMin: parseInt(row.querySelector(".rand-qty-min").value) || 0,
                qtyMax: parseInt(row.querySelector(".rand-qty-max").value) || 0,
                salesMin: parseInt(row.querySelector(".rand-sales-min").value) || 0,
                salesMax: parseInt(row.querySelector(".rand-sales-max").value) || 0,
                varMin: parseInt(row.querySelector(".rand-var-min").value) || 0,
                varMax: parseInt(row.querySelector(".rand-var-max").value) || 0
            };
        }
        game.settings.set(MODULE_ID, "randomizerSettings", settings);
    }

    async _prepareContext(options) {
        const allowedTiers = game.settings.get(MODULE_ID, "allowedTiers");
        const hiddenCategories = game.settings.get(MODULE_ID, "hiddenCategories");
        const customTabCompendiums = game.settings.get(MODULE_ID, "customTabCompendiums") || [];
        const customTabName = game.settings.get(MODULE_ID, "customTabName");
        const customCompendiums = game.settings.get(MODULE_ID, "customCompendiums") || [];
        const useDefaultCompendiums = game.settings.get(MODULE_ID, "useDefaultCompendiums");

        let categories = foundry.utils.deepClone(STANDARD_CATEGORIES);

        const hasCustomTab = customTabCompendiums.some(p => p && p.trim() !== "");
        if (hasCustomTab) {
            categories.push({
                id: "custom-tab",
                label: customTabName || "General",
                key: "CustomTab"
            });
        }

        categories = categories.filter(c => !hiddenCategories[c.key]);

        // Count items for each category
        for (const cat of categories) {
            let itemCount = 0;

            if (cat.id === "custom-tab") {
                for (const packId of customTabCompendiums) {
                    if (!packId || packId.trim() === "") continue;
                    const pack = game.packs.get(packId);
                    if (pack) {
                        const docs = await pack.getDocuments();
                        itemCount += docs.filter(d => getValidItemTypes().includes(d.type)).length;
                    }
                }
            } else {
                const catConfig = allowedTiers[cat.key] || {1:true, 2:true, 3:true, 4:true};
                const priceList = PRICE_DATA[cat.key] || {};

                if (useDefaultCompendiums) {
                    const defaultPackId = PACK_MAPPING[cat.key];
                    if (defaultPackId) {
                        const pack = game.packs.get(defaultPackId);
                        if (pack) {
                            const docs = await pack.getDocuments();
                            for (const doc of docs) {
                                const originalName = (game.modules.get("babele")?.active ? doc.flags?.babele?.originalName : null) ?? doc.name;
                                if (priceList.hasOwnProperty(originalName)) {
                                    const tier = priceList[originalName].tier;
                                    if (catConfig[tier]) {
                                        itemCount++;
                                    }
                                }
                            }
                        }
                    }
                }

                for (const custom of customCompendiums) {
                    if (custom.category === cat.key) {
                        const pack = game.packs.get(custom.pack);
                        if (pack) {
                            const docs = await pack.getDocuments();
                            for (const doc of docs) {
                                const expectedType = CATEGORY_ITEM_TYPE[cat.key];
                                if (expectedType && doc.type !== expectedType) continue;

                                if (doc.type === "weapon") {
                                    const isSecondary = foundry.utils.getProperty(doc, "system.secondary") === true;
                                    if (isSecondary && cat.key !== "Secondary Weapons") continue;
                                    if (!isSecondary && cat.key === "Secondary Weapons") continue;
                                }

                                const tier = getItemTier(doc);
                                if (catConfig[tier]) {
                                    itemCount++;
                                }
                            }
                        }
                    }
                }
            }

            cat.itemCount = itemCount;

            const storeActor = StockManager.getStoreActor();
            const stockKey = StockManager.getStockKey();
            const categoryDefaults = storeActor?.getFlag(MODULE_ID, `${stockKey}.categoryDefaults`) || StockManager._getDefaultCategorySettings();
            const catDefaults = categoryDefaults[cat.key];
            if (catDefaults) {
                cat.defaultQty = Math.max(catDefaults.tier1 || 0, catDefaults.tier2 || 0, catDefaults.tier3 || 0, catDefaults.tier4 || 0);
            } else {
                cat.defaultQty = 10;
            }
        }

        // Attach saved randomizer values to each category
        const savedRandomizer = game.settings.get(MODULE_ID, "randomizerSettings") || {};
        for (const cat of categories) {
            const saved = savedRandomizer[cat.key] || {};
            cat.savedMinItems = saved.minItems ?? 0;
            cat.savedMaxItems = saved.maxItems ?? cat.itemCount;
            cat.savedQtyMin = saved.qtyMin ?? 1;
            cat.savedQtyMax = saved.qtyMax ?? cat.defaultQty;
            cat.savedSalesMin = saved.salesMin ?? 0;
            cat.savedSalesMax = saved.salesMax ?? 0;
            cat.savedVarMin = saved.varMin ?? 0;
            cat.savedVarMax = saved.varMax ?? 0;
        }

        return {
            categories: categories
        };
    }

    /**
     * Gets all items for a given category key
     */
    async _getCategoryItems(categoryKey) {
        const allowedTiers = game.settings.get(MODULE_ID, "allowedTiers");
        const customTabCompendiums = game.settings.get(MODULE_ID, "customTabCompendiums") || [];
        const customCompendiums = game.settings.get(MODULE_ID, "customCompendiums") || [];
        const priceMod = game.settings.get(MODULE_ID, "priceModifier") / 100;

        const items = [];

        if (categoryKey === "CustomTab") {
            const seenNames = new Set();
            for (const packId of customTabCompendiums) {
                if (!packId || packId.trim() === "") continue;
                const pack = game.packs.get(packId);
                if (!pack) continue;

                const docs = await pack.getDocuments();
                for (const doc of docs) {
                    if (!getValidItemTypes().includes(doc.type)) continue;
                    if (seenNames.has(doc.name)) continue;
                    seenNames.add(doc.name);

                    let basePrice = extractPriceFromDescription(doc);

                    items.push({
                        name: doc.name,
                        uuid: doc.uuid,
                        basePrice: basePrice
                    });
                }
            }
        } else {
            const catConfig = allowedTiers[categoryKey] || {1:true, 2:true, 3:true, 4:true};
            const priceList = PRICE_DATA[categoryKey] || {};

            const useDefaultCompendiums = game.settings.get(MODULE_ID, "useDefaultCompendiums");
            if (useDefaultCompendiums) {
                const defaultPackId = PACK_MAPPING[categoryKey];
                if (defaultPackId) {
                    const pack = game.packs.get(defaultPackId);
                    if (pack) {
                        const docs = await pack.getDocuments();
                        for (const doc of docs) {
                            const originalName = (game.modules.get("babele")?.active ? doc.flags?.babele?.originalName : null) ?? doc.name;
                            if (priceList.hasOwnProperty(originalName)) {
                                const tier = priceList[originalName].tier;
                                if (catConfig[tier]) {
                                    const basePrice = Math.ceil(priceList[originalName].price * priceMod);
                                    items.push({
                                        name: doc.name,
                                        uuid: doc.uuid,
                                        basePrice: basePrice
                                    });
                                }
                            } else {
                                // Fallback for items not in PRICE_DATA (e.g. custom items in default packs)
                                const tier = getItemTier(doc);
                                if (catConfig[tier]) {
                                    const extracted = extractPriceFromDescription(doc);
                                    if (extracted > 0) {
                                        items.push({
                                            name: doc.name,
                                            uuid: doc.uuid,
                                            basePrice: Math.ceil(extracted * priceMod)
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            for (const custom of customCompendiums) {
                if (custom.category === categoryKey) {
                    const pack = game.packs.get(custom.pack);
                    if (pack) {
                        const docs = await pack.getDocuments();
                        for (const doc of docs) {
                            const expectedType = CATEGORY_ITEM_TYPE[categoryKey];
                            if (expectedType && doc.type !== expectedType) continue;

                            if (doc.type === "weapon") {
                                const isSecondary = foundry.utils.getProperty(doc, "system.secondary") === true;
                                if (isSecondary && categoryKey !== "Secondary Weapons") continue;
                                if (!isSecondary && categoryKey === "Secondary Weapons") continue;
                            }

                            const originalName = (game.modules.get("babele")?.active ? doc.flags?.babele?.originalName : null) ?? doc.name;
                            const tier = getItemTier(doc);
                            if (catConfig[tier]) {
                                let basePrice = 0;
                                if (priceList.hasOwnProperty(originalName)) {
                                    basePrice = Math.ceil(priceList[originalName].price * priceMod);
                                } else {
                                    // Fallback: extract price from {{{number}}} tag
                                    const extracted = extractPriceFromDescription(doc);
                                    if (extracted > 0) {
                                        basePrice = Math.ceil(extracted * priceMod);
                                    }
                                }
                                items.push({
                                    name: doc.name,
                                    uuid: doc.uuid,
                                    basePrice: basePrice
                                });
                            }
                        }
                    }
                }
            }
        }

        return items;
    }

    /**
     * Resets input fields for a specific category to default values.
     */
    _onResetCategoryDefaults(event, target) {
        const categoryKey = target.dataset.category;
        const itemCount = parseInt(target.dataset.itemCount) || 0;
        const defaultQty = parseInt(target.dataset.defaultQty) || 10;

        let defaults = { minItems: 0, maxItems: itemCount, qtyMin: 1, qtyMax: defaultQty, salesMin: 0, salesMax: 0, varMin: 0, varMax: 0 };

        const currentProfile = game.settings.get(MODULE_ID, "currentProfile");
        if (currentProfile !== "Default") {
            const profiles = game.settings.get(MODULE_ID, "storeProfiles");
            const profileData = profiles[currentProfile];
            if (profileData?.randomizerSettings?.[categoryKey]) {
                defaults = profileData.randomizerSettings[categoryKey];
            }
        }

        const row = this.element.querySelector(`.category-randomizer-row[data-category="${categoryKey}"]`);
        if (!row) return;

        const minInput = row.querySelector(".rand-min-items");
        const maxInput = row.querySelector(".rand-max-items");
        const qtyMinInput = row.querySelector(".rand-qty-min");
        const qtyMaxInput = row.querySelector(".rand-qty-max");
        const salesMinInput = row.querySelector(".rand-sales-min");
        const salesMaxInput = row.querySelector(".rand-sales-max");
        const varMinInput = row.querySelector(".rand-var-min");
        const varMaxInput = row.querySelector(".rand-var-max");

        if (minInput) minInput.value = defaults.minItems;
        if (maxInput) maxInput.value = defaults.maxItems;
        if (qtyMinInput) qtyMinInput.value = defaults.qtyMin;
        if (qtyMaxInput) qtyMaxInput.value = defaults.qtyMax;
        if (salesMinInput) salesMinInput.value = defaults.salesMin;
        if (salesMaxInput) salesMaxInput.value = defaults.salesMax;
        if (varMinInput) varMinInput.value = defaults.varMin;
        if (varMaxInput) varMaxInput.value = defaults.varMax;

        this._saveRandomizerSettings();
    }

    /**
     * Sets Items Max to the total number of available items in the category
     */
    _onSetMaxToTotal(_event, target) {
        const categoryKey = target.dataset.category;
        const itemCount = parseInt(target.dataset.itemCount) || 0;

        const row = this.element.querySelector(`.category-randomizer-row[data-category="${categoryKey}"]`);
        if (!row) return;

        const maxInput = row.querySelector(".rand-max-items");
        if (maxInput) {
            maxInput.value = itemCount;
        }

        this._saveRandomizerSettings();
    }

    /**
     * Handles opening the instructions journal
     */
    async _onOpenInstructions(event, target) {
        const uuid = "Compendium.daggerheart-store.journals.JournalEntry.fIXCeXWeDbAu3uFg.JournalEntryPage.SqoXdZ1yaCPsXA9v";
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

    /**
     * Fisher-Yates shuffle algorithm
     * Provides uniform distribution and O(n) performance
     * @param {Array} array - Array to shuffle (modified in-place)
     * @returns {Array} - The shuffled array
     */
    _fisherYatesShuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * Randomize a single category
     */
    async _onRandomizeCategory(event, target) {
        const categoryKey = target.dataset.category;
        const row = this.element.querySelector(`.category-randomizer-row[data-category="${categoryKey}"]`);

        if (!row) return;

        const minItems = parseInt(row.querySelector(".rand-min-items").value) || 0;
        const maxItems = parseInt(row.querySelector(".rand-max-items").value) || 0;
        const qtyMin = parseInt(row.querySelector(".rand-qty-min").value) || 1;
        const qtyMax = parseInt(row.querySelector(".rand-qty-max").value) || 0;
        const salesMin = parseInt(row.querySelector(".rand-sales-min").value) || 0;
        const salesMax = parseInt(row.querySelector(".rand-sales-max").value) || 0;
        const varMin = parseInt(row.querySelector(".rand-var-min").value) || 0;
        const varMax = parseInt(row.querySelector(".rand-var-max").value) || 0;

        await this._randomizeCategory(categoryKey, minItems, maxItems, qtyMin, qtyMax, salesMin, salesMax, varMin, varMax);
    }

    /**
     * Core randomization logic for a category
     */
    async _randomizeCategory(categoryKey, minItems, maxItems, qtyMin, qtyMax, salesMin, salesMax, varMin, varMax) {
        const allItems = await this._getCategoryItems(categoryKey);

        if (allItems.length === 0) return;

        const lockedItems = game.settings.get(MODULE_ID, "lockedItems") || {};
        const items = allItems.filter(i => !lockedItems[i.name]);

        if (items.length === 0) return;

        const effectiveMax = Math.min(maxItems, items.length);
        const effectiveMin = Math.min(minItems, effectiveMax);

        const numVisible = Math.floor(Math.random() * (effectiveMax - effectiveMin + 1)) + effectiveMin;

        const shuffled = this._fisherYatesShuffle([...items]);
        const visibleItems = shuffled.slice(0, numVisible);
        const hiddenItemNames = shuffled.slice(numVisible).map(i => i.name);

        const hiddenItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "hiddenItems")) || {};
        const saleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "saleItems")) || {};
        const priceOverrides = foundry.utils.deepClone(game.settings.get(MODULE_ID, "priceOverrides")) || {};

        // Clear only unlocked items in this category
        for (const item of items) {
            delete hiddenItems[item.name];
            delete saleItems[item.name];
            delete priceOverrides[item.name];
        }

        for (const name of hiddenItemNames) {
            hiddenItems[name] = true;
        }

        // Determine sale items from visible ones
        const effectiveSalesMax = Math.min(salesMax, visibleItems.length);
        const effectiveSalesMin = Math.min(salesMin, effectiveSalesMax);
        const numSales = Math.floor(Math.random() * (effectiveSalesMax - effectiveSalesMin + 1)) + effectiveSalesMin;

        const saleShuffled = this._fisherYatesShuffle([...visibleItems]);
        const itemsOnSale = saleShuffled.slice(0, numSales);

        for (const item of itemsOnSale) {
            saleItems[item.name] = true;
        }

        // Apply price variation to visible items
        for (const item of visibleItems) {
            if (varMin > 0 || varMax > 0) {
                const variationPercent = (Math.random() * (varMin + varMax)) - varMin;
                const multiplier = 1 + (variationPercent / 100);
                const newPrice = Math.max(1, Math.round(item.basePrice * multiplier));

                if (newPrice !== item.basePrice) {
                    priceOverrides[item.name] = newPrice;
                }
            }
        }

        await game.settings.set(MODULE_ID, "hiddenItems", hiddenItems);
        await game.settings.set(MODULE_ID, "saleItems", saleItems);
        await game.settings.set(MODULE_ID, "priceOverrides", priceOverrides);

        // Apply stock quantities if qtyMax > 0 and stock system is enabled
        const stockEnabled = game.settings.get(MODULE_ID, "stockEnabled");
        if (stockEnabled && qtyMax > 0) {
            const actor = StockManager.getStoreActor();
            if (actor) {
                const stockKey = StockManager.getStockKey();
                const stockItems = actor.getFlag(MODULE_ID, `${stockKey}.items`) || {};
                const effectiveQtyMin = Math.max(1, qtyMin);
                const effectiveQtyMax = Math.max(effectiveQtyMin, qtyMax);

                for (const item of visibleItems) {
                    const qty = Math.floor(Math.random() * (effectiveQtyMax - effectiveQtyMin + 1)) + effectiveQtyMin;
                    const key = StockManager.sanitizeKey(item.uuid);
                    stockItems[key] = {
                        stockpile: { q: qty, r: qty, u: false }
                    };
                }

                const hiddenItemsForStock = shuffled.slice(numVisible);
                for (const item of hiddenItemsForStock) {
                    const key = StockManager.sanitizeKey(item.uuid);
                    stockItems[key] = {
                        stockpile: { q: 0, r: 0, u: false }
                    };
                }

                const version = actor.getFlag(MODULE_ID, `${stockKey}.version`) || 1;
                await actor.update({
                    [`flags.${MODULE_ID}.${stockKey}.items`]: stockItems,
                    [`flags.${MODULE_ID}.${stockKey}.version`]: version + 1
                });
            }
        }
    }

    /**
     * Randomize all categories at once
     */
    async _onRandomizeAll(event, target) {
        const confirm = await showStoreDialog({
            title: "Randomize All",
            icon: "fas fa-dice-d20",
            headerText: "DANGER ZONE",
            headerColor: "#D32F2F",
            message: "Are you sure you want to <b>RANDOMIZE ALL CATEGORIES</b>?",
            description: "This will overwrite current visibility, sales, and prices for all items."
        });

        if (!confirm) return;

        const rows = this.element.querySelectorAll(".category-randomizer-row");

        for (const row of rows) {
            const categoryKey = row.dataset.category;
            const minItems = parseInt(row.querySelector(".rand-min-items").value) || 0;
            const maxItems = parseInt(row.querySelector(".rand-max-items").value) || 0;
            const qtyMin = parseInt(row.querySelector(".rand-qty-min").value) || 1;
            const qtyMax = parseInt(row.querySelector(".rand-qty-max").value) || 0;
            const salesMin = parseInt(row.querySelector(".rand-sales-min").value) || 0;
            const salesMax = parseInt(row.querySelector(".rand-sales-max").value) || 0;
            const varMin = parseInt(row.querySelector(".rand-var-min").value) || 0;
            const varMax = parseInt(row.querySelector(".rand-var-max").value) || 0;

            await this._randomizeCategory(categoryKey, minItems, maxItems, qtyMin, qtyMax, salesMin, salesMax, varMin, varMax);
        }
    }

    /**
     * Reset all items to visible (clear hidden, sales, and price overrides)
     */
    async _onResetAll(event, target) {
        const confirm = await showStoreDialog({
            title: "Reset All",
            icon: "fas fa-undo",
            headerText: "DANGER ZONE",
            headerColor: "#D32F2F",
            message: "Are you sure you want to <b>RESET ALL DATA</b>?",
            description: "This action cannot be undone. All items will become visible."
        });

        if (!confirm) return;

        await game.settings.set(MODULE_ID, "hiddenItems", {});
        await game.settings.set(MODULE_ID, "saleItems", {});
        await game.settings.set(MODULE_ID, "priceOverrides", {});
        await game.settings.set(MODULE_ID, "lockedItems", {});
    }
}
