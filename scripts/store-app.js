import { PRICE_DATA, PACK_MAPPING } from "./price-data.js";
import { StockManager } from "./stock-manager.js";
import { StoreConfig } from "./store-config.js";
import { StoreRandomizer } from "./store-randomizer.js";
import {
    MODULE_ID, STANDARD_CATEGORIES, CATEGORY_ITEM_TYPE
} from "./store-constants.js";
import {
    getValidItemTypes, getItemTier, extractPriceFromDescription, getItemHeader,
    getSystemCurrency, getActorWealth, deductGold, addGold,
    getChatWhisperRecipients, buildChatCard,
    getEpicTextColor, getEpicBgColor,
    showStoreDialog
} from "./store-utils.js";
import { queryDepositToParty, queryWithdrawFromParty } from "./socket.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * Main Store Application (Application V2)
 */
export class DaggerheartStore extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options) {
        super(options);
        this.searchQuery = "";
        this.activeTab = "primary";
        /** @type {Object<string, boolean>} Per-user favorited items keyed by item name */
        this.favoritedItems = {};
        /** @type {boolean} Whether the favorites-only filter is active */
        this.showFavoritesOnly = false;
        this.options.window.title = game.settings.get(MODULE_ID, "storeName");

        // Listen for actor item updates to refresh compare buttons
        this._onActorItemUpdate = (item, changes, _options, _userId) => {
            if (!game.user.character) return;
            if (item.parent?.id !== game.user.character.id) return;
            if (changes?.system?.equipped !== undefined) {
                this.render();
            }
        };
        Hooks.on("updateItem", this._onActorItemUpdate);
    }

    _onClose(options) {
        if (this._onActorItemUpdate) {
            Hooks.off("updateItem", this._onActorItemUpdate);
        }
        super._onClose?.(options);
    }

    static DEFAULT_OPTIONS = {
        id: "daggerheart-store",
        tag: "form",
        window: {
            title: "Daggerheart: Store",
            icon: "fas fa-balance-scale",
            resizable: true,
            controls: []
        },
        position: { width: 950, height: 700 },
        classes: ["daggerheart-store"],
        actions: {
            buyItem: DaggerheartStore.prototype._onBuyItem,
            sellItem: DaggerheartStore.prototype._onSellItem,
            openConfig: DaggerheartStore.prototype._onOpenConfig,
            openRandomizer: DaggerheartStore.prototype._onOpenRandomizer,
            resetPrice: DaggerheartStore.prototype._onResetPrice,
            toggleSale: DaggerheartStore.prototype._onToggleSale,
            toggleHidden: DaggerheartStore.prototype._onToggleHidden,
            toggleBlockSale: DaggerheartStore.prototype._onToggleBlockSale,
            toggleBlockPurchase: DaggerheartStore.prototype._onToggleBlockPurchase,
            toggleLock: DaggerheartStore.prototype._onToggleLock,
            lockAllItems: DaggerheartStore.prototype._onLockAllItems,
            unlockAllItems: DaggerheartStore.prototype._onUnlockAllItems,
            markAllOnSale: DaggerheartStore.prototype._onMarkAllOnSale,
            removeAllFromSale: DaggerheartStore.prototype._onRemoveAllFromSale,
            showAllItems: DaggerheartStore.prototype._onShowAllItems,
            hideAllItems: DaggerheartStore.prototype._onHideAllItems,
            makeAllPurchasable: DaggerheartStore.prototype._onMakeAllPurchasable,
            disableAllPurchase: DaggerheartStore.prototype._onDisableAllPurchase,
            makeAllSellable: DaggerheartStore.prototype._onMakeAllSellable,
            disableAllSale: DaggerheartStore.prototype._onDisableAllSale,
            resetAllPrices: DaggerheartStore.prototype._onResetAllPrices,
            showToAll: DaggerheartStore.prototype._onShowToAll,
            showToPlayer: DaggerheartStore.prototype._onShowToPlayer,
            savePreset: DaggerheartStore.prototype._onSavePreset,
            loadPreset: DaggerheartStore.prototype._onLoadPreset,
            deletePreset: DaggerheartStore.prototype._onDeletePreset,
            transferFunds: DaggerheartStore.prototype._onTransferFunds,
            toggleEpic: DaggerheartStore.prototype._onToggleEpic,
            clearSearch: DaggerheartStore.prototype._onClearSearch,
            toggleFavorite: DaggerheartStore.prototype._onToggleFavorite,
            toggleFavoriteFilter: DaggerheartStore.prototype._onToggleFavoriteFilter
        }
    };

    static PARTS = {
        main: {
            template: "modules/daggerheart-store/templates/store.hbs",
            scrollable: [".content"]
        }
    };

    /**
     * Determines the border color for chat messages based on settings.
     * @param {string} type - The type of action: 'buy', 'sell', 'party', 'transfer'
     * @returns {string} Hex color code
     */
    _getBorderColor(type) {
        const style = game.settings.get(MODULE_ID, "chatMessageStyle");
        const defaultColor = "#C9A060";
        if (style !== "colored") return defaultColor;

        switch (type) {
            case "buy": return "#c0392b";
            case "sell": return "#27ae60";
            case "party": return "#2980b9";
            case "transfer": return "#8e44ad";
            default: return defaultColor;
        }
    }

    async render(options, _options) {
        const currencyMode = game.settings.get(MODULE_ID, "currencyMode");
        if (currencyMode === "update_all" && !game.user.isGM && game.user.character) {
             await this._handleCurrencyConversion(game.user.character);
        }
        return super.render(options, _options);
    }

    // --- Weapon / Armor Summaries ---

    /**
     * Generates the weapon summary string based on updated rules.
     */
    _getWeaponSummary(doc) {
        try {
            if (doc.type !== "weapon") return "";
            const system = doc.system;
            if (!system.attack) return "";

            const traitRaw = String(system.attack.roll?.trait || "");
            const weaponTrait = traitRaw.length >= 3 ? traitRaw.substring(0, 3).toUpperCase() : traitRaw.toUpperCase();

            const rangeRaw = system.attack.range || "";
            const rangeMap = {
                "melee": "Melee", "veryClose": "Very Close", "close": "Close",
                "far": "Far", "veryFar": "Very Far"
            };
            const weaponRange = rangeMap[rangeRaw] || (rangeRaw ? String(rangeRaw).charAt(0).toUpperCase() + String(rangeRaw).slice(1) : "");

            const part0 = system.attack.damage?.parts?.[0] || {};
            const val = part0.value || {};
            const weaponCustom = val.custom?.enabled === true;
            let damageSection = "";

            if (weaponCustom) {
                const formula = val.custom?.formula || "C";
                const damageType = this._parseDamageTypes(part0.type, true);
                damageSection = damageType ? `${formula}(${damageType})` : formula;
            } else {
                const weaponDamage = val.dice || "";
                const damageType = this._parseDamageTypes(part0.type, true);
                const bonusVal = val.bonus;
                let weaponBonus = "";
                if (bonusVal !== null && bonusVal !== undefined && String(bonusVal).trim() !== "") {
                    weaponBonus = `+${bonusVal}`;
                }
                damageSection = `${weaponDamage}${weaponBonus}`;
                if (damageType) damageSection += `(${damageType})`;
            }

            const burdenRaw = String(system.burden || "");
            const burdenMap = { "1": "One-Handed", "2": "Two-Handed", "oneHanded": "One-Handed", "twoHanded": "Two-Handed" };
            const weaponBurden = burdenMap[burdenRaw] || burdenRaw;

            const parts = [weaponTrait, weaponRange, damageSection, weaponBurden];
            return parts.filter(p => p && String(p).trim() !== "").join(" - ");
        } catch (err) {
            console.error(`${MODULE_ID} | Error generating weapon summary for ${doc.name}:`, err);
            return "";
        }
    }

    _getArmorSummary(doc) {
        try {
            if (doc.type !== "armor") return "";
            const system = doc.system;
            const baseScore = system.baseScore ?? 0;
            const baseThresholdsMajor = system.baseThresholds?.major ?? 0;
            const baseThresholdsSevere = system.baseThresholds?.severe ?? 0;
            return `Score: ${baseScore} - Thresholds: ${baseThresholdsMajor}/${baseThresholdsSevere}`;
        } catch (err) {
            console.error(`${MODULE_ID} | Error generating armor summary for ${doc.name}:`, err);
            return "";
        }
    }

    /**
     * Parses damage type from the various formats Foundry can store it in.
     * @param {*} typeRaw - The raw type value (string, array, Set, or object)
     * @param {boolean} abbreviated - If true, returns 3-char abbreviations; otherwise full names
     * @returns {string} Joined damage type string
     */
    _parseDamageTypes(typeRaw, abbreviated = false) {
        let typesList = [];
        if (Array.isArray(typeRaw)) {
            typesList = typeRaw;
        } else if (typeRaw instanceof Set) {
            typesList = Array.from(typeRaw);
        } else if (typeof typeRaw === "string") {
            typesList = typeRaw.includes(",") ? typeRaw.split(",") : [typeRaw];
        } else if (typeRaw && typeof typeRaw === "object") {
            typesList = Object.values(typeRaw);
        }

        const fullNameMap = {
            "physical": "Physical", "phy": "Physical",
            "magic": "Magic", "mag": "Magic"
        };

        return typesList
            .map(t => {
                const s = String(t || "").trim();
                if (!s) return "";
                if (abbreviated) {
                    return s.length >= 3 ? s.substring(0, 3).toUpperCase() : s.toUpperCase();
                }
                const lower = s.toLowerCase();
                return fullNameMap[lower] || (s.charAt(0).toUpperCase() + s.slice(1));
            })
            .filter(t => t)
            .join("/");
    }

    // --- Comparison Helpers ---

    /**
     * Checks if a category supports item comparison.
     * @param {string} categoryId - The category ID
     * @returns {boolean}
     */
    _isComparableCategory(categoryId) {
        return ["primary", "secondary", "wheelchairs", "armors"].includes(categoryId);
    }

    /**
     * Gets the currently equipped item for a given category.
     * @param {Actor} actor - The actor to check
     * @param {string} category - The category ID
     * @returns {Item|null}
     */
    _getEquippedItem(actor, category) {
        if (!actor) return null;
        switch (category) {
            case "primary":
                return actor.items.find(x => x.type === "weapon" && x.system.equipped && !x.system.secondary && !x.name.includes("Wheelchair"));
            case "secondary":
                return actor.items.find(x => x.type === "weapon" && x.system.equipped && x.system.secondary && !x.name.includes("Wheelchair"));
            case "wheelchairs":
                return actor.items.find(x => x.type === "weapon" && x.system.equipped && !x.system.secondary);
            case "armors":
                return actor.items.find(x => x.type === "armor" && x.system.equipped);
            default:
                return null;
        }
    }

    /**
     * Cleans unsafe HTML from a description for tooltip display.
     * Store tags no longer exist in descriptions after migration to flags.
     * @param {string} html - The raw HTML description
     * @returns {string}
     */
    _cleanDescription(html) {
        if (!html) return "";
        return String(html)
            .replace(/<(?!\/?(?:p|br)\b)[^>]*>/gi, '')
            .trim()
            .substring(0, 300);
    }

    /**
     * Extracts weapon stats from a document.
     * @param {Item} doc - The weapon item document
     * @returns {Object}
     */
    _extractWeaponStats(doc) {
        try {
            const system = doc.system;
            if (!system.attack) return {};

            const traitMap = {
                "agility": "Agility", "strength": "Strength", "finesse": "Finesse",
                "instinct": "Instinct", "presence": "Presence", "knowledge": "Knowledge",
                "agi": "Agility", "str": "Strength", "fin": "Finesse",
                "ins": "Instinct", "pre": "Presence", "kno": "Knowledge"
            };
            const traitRaw = String(system.attack.roll?.trait || "").toLowerCase();
            const trait = traitMap[traitRaw] || (traitRaw ? traitRaw.charAt(0).toUpperCase() + traitRaw.slice(1) : "");

            const rangeRaw = system.attack.range || "";
            const rangeMap = {
                "melee": "Melee", "veryClose": "Very Close", "close": "Close",
                "far": "Far", "veryFar": "Very Far"
            };
            const range = rangeMap[rangeRaw] || (rangeRaw ? String(rangeRaw).charAt(0).toUpperCase() + String(rangeRaw).slice(1) : "");

            const part0 = system.attack.damage?.parts?.[0] || {};
            const val = part0.value || {};
            const isCustom = val.custom?.enabled === true;
            let damageDisplay = "";
            let damageType = "";

            if (isCustom) {
                damageDisplay = "Custom";
            } else {
                const weaponDamage = val.dice || "";
                damageType = this._parseDamageTypes(part0.type, false);

                const bonusVal = val.bonus;
                let weaponBonus = "";
                if (bonusVal !== null && bonusVal !== undefined && String(bonusVal).trim() !== "") {
                    weaponBonus = `+${bonusVal}`;
                }
                damageDisplay = `${weaponDamage}${weaponBonus}`;
                if (damageType) damageDisplay += ` (${damageType})`;
            }

            const isDirect = system.attack.damage?.direct === true;
            const burdenRaw = String(system.burden || "");
            const burdenMap = { "1": "One-Handed", "2": "Two-Handed", "oneHanded": "One-Handed", "twoHanded": "Two-Handed" };
            const burden = burdenMap[burdenRaw] || burdenRaw;

            const features = [];
            const weaponFeatures = system.weaponFeatures || [];
            for (const feature of weaponFeatures) {
                const featureValue = feature.value;
                if (featureValue) {
                    try {
                        const featureName = featureValue.charAt(0).toUpperCase() + featureValue.slice(1);
                        const featureDesc = game.i18n.localize(`${CONFIG.DH.ITEM.weaponFeatures[featureValue]?.description}`) || "";
                        if (featureDesc) features.push({ name: featureName, description: featureDesc });
                    } catch (e) { /* Feature not found in config, skip */ }
                }
            }

            return { trait, range, damageDisplay, damageType, isDirect, burden, features };
        } catch (err) {
            console.error(`${MODULE_ID} | Error extracting weapon stats:`, err);
            return {};
        }
    }

    /**
     * Extracts armor stats from a document.
     * @param {Item} doc - The armor item document
     * @returns {Object}
     */
    _extractArmorStats(doc) {
        try {
            const system = doc.system;
            const features = [];
            const armorFeatures = system.armorFeatures || [];
            for (const feature of armorFeatures) {
                const featureValue = feature.value;
                if (featureValue) {
                    try {
                        const featureName = featureValue.charAt(0).toUpperCase() + featureValue.slice(1);
                        const featureDesc = game.i18n.localize(`${CONFIG.DH.ITEM.armorFeatures[featureValue]?.description}`) || "";
                        if (featureDesc) features.push({ name: featureName, description: featureDesc });
                    } catch (e) { /* Feature not found in config, skip */ }
                }
            }
            return {
                baseScore: system.baseScore ?? 0,
                thresholdMajor: system.baseThresholds?.major ?? 0,
                thresholdSevere: system.baseThresholds?.severe ?? 0,
                features
            };
        } catch (err) {
            console.error(`${MODULE_ID} | Error extracting armor stats:`, err);
            return { baseScore: 0, thresholdMajor: 0, thresholdSevere: 0, features: [] };
        }
    }

    /**
     * Formats an item for comparison display.
     * @param {Item} item - The item to format
     * @returns {Object|null}
     */
    _formatItemForComparison(item) {
        if (!item) return null;
        const isWeapon = item.type === "weapon";
        const rawDesc = foundry.utils.getProperty(item, "system.description.value") ||
                        foundry.utils.getProperty(item, "system.description") || "";
        const base = {
            name: item.name, img: item.img,
            tier: getItemTier(item),
            description: this._cleanDescription(rawDesc),
            isWeapon
        };
        if (isWeapon) return { ...base, ...this._extractWeaponStats(item) };
        return { ...base, ...this._extractArmorStats(item) };
    }

    /**
     * Builds comparison data for the tooltip.
     * @param {string} storeItemUuid - UUID of the store item
     * @param {string} category - The category ID
     * @param {Actor} actor - The player's actor
     * @returns {Promise<Object>}
     */
    async _buildComparisonData(storeItemUuid, category, actor) {
        const storeDoc = await fromUuid(storeItemUuid);
        if (!storeDoc) return null;

        const equippedItem = this._getEquippedItem(actor, category);
        const equipped = this._formatItemForComparison(equippedItem);
        const storeItem = this._formatItemForComparison(storeDoc);

        if (equipped && storeItem) this._addComparisonIndicators(equipped, storeItem);

        return { equipped, storeItem, hasEquipped: !!equippedItem };
    }

    /**
     * Adds comparison indicators (up/down arrows, colors) to the store item.
     */
    _addComparisonIndicators(equipped, storeItem) {
        const rangeOrder = ["Melee", "Very Close", "Close", "Far", "Very Far"];

        if (storeItem.isWeapon && equipped.isWeapon) {
            const equippedRangeIdx = rangeOrder.indexOf(equipped.range);
            const storeRangeIdx = rangeOrder.indexOf(storeItem.range);
            if (equippedRangeIdx !== -1 && storeRangeIdx !== -1) {
                if (storeRangeIdx > equippedRangeIdx) storeItem.rangeCompare = "up";
                else if (storeRangeIdx < equippedRangeIdx) storeItem.rangeCompare = "down";
            }

            const equippedDamage = this._parseDamageValue(equipped.damageDisplay);
            const storeDamage = this._parseDamageValue(storeItem.damageDisplay);
            if (equippedDamage !== null && storeDamage !== null) {
                if (storeDamage > equippedDamage) storeItem.damageCompare = "up";
                else if (storeDamage < equippedDamage) storeItem.damageCompare = "down";
            }

            this._compareFeatures(equipped, storeItem);
        } else if (!storeItem.isWeapon && !equipped.isWeapon) {
            if (storeItem.baseScore > equipped.baseScore) storeItem.baseScoreCompare = "up";
            else if (storeItem.baseScore < equipped.baseScore) storeItem.baseScoreCompare = "down";

            if (storeItem.thresholdMajor > equipped.thresholdMajor) storeItem.thresholdMajorCompare = "up";
            else if (storeItem.thresholdMajor < equipped.thresholdMajor) storeItem.thresholdMajorCompare = "down";

            if (storeItem.thresholdSevere > equipped.thresholdSevere) storeItem.thresholdSevereCompare = "up";
            else if (storeItem.thresholdSevere < equipped.thresholdSevere) storeItem.thresholdSevereCompare = "down";

            this._compareFeatures(equipped, storeItem);
        }
    }

    /**
     * Compares features between equipped and store item, marking gained/lost features.
     */
    _compareFeatures(equipped, storeItem) {
        if (equipped.features && equipped.features.length > 0) {
            const storeFeatureNames = (storeItem.features || []).map(f => f.name.toLowerCase());
            storeItem.lostFeatures = equipped.features
                .filter(f => !storeFeatureNames.includes(f.name.toLowerCase()));
        }
        if (storeItem.features && storeItem.features.length > 0) {
            const equippedFeatureNames = (equipped.features || []).map(f => f.name.toLowerCase());
            storeItem.features.forEach(f => {
                f.isGained = !equippedFeatureNames.includes(f.name.toLowerCase());
            });
        }
    }

    /**
     * Parses a damage display string and returns a comparable numeric value.
     * @param {string} damageStr - The damage string
     * @returns {number|null}
     */
    _parseDamageValue(damageStr) {
        if (!damageStr || damageStr === "Custom") return null;
        const cleanStr = damageStr.replace(/\s*\([^)]*\)\s*$/, "").trim();
        const match = cleanStr.match(/^(\d*)d(\d+)(?:\+(\d+))?$/i);
        if (!match) return null;
        const numDice = parseInt(match[1]) || 1;
        const dieSize = parseInt(match[2]);
        const bonus = parseInt(match[3]) || 0;
        return numDice * ((dieSize + 1) / 2) + bonus;
    }

    // --- Currency Conversion (update_all mode) ---

    async _handleCurrencyConversion(actor) {
        const gold = actor.system.gold || {};
        const handfuls = gold.handfuls || 0;
        const bags = gold.bags || 0;
        const chests = gold.chests || 0;

        if (handfuls <= 0 && bags <= 0 && chests <= 0) return;

        const coinsFromHandfuls = handfuls * 10;
        const coinsFromBags = bags * 100;
        const coinsFromChests = chests * 1000;
        const totalAdded = coinsFromHandfuls + coinsFromBags + coinsFromChests;

        const currentCoins = gold.coins || 0;
        const newCoins = currentCoins + totalAdded;

        await actor.update({
            "system.gold.handfuls": 0, "system.gold.bags": 0,
            "system.gold.chests": 0, "system.gold.coins": newCoins
        });

        const borderColor = "#C9A060";
        let detailLines = "";
        if (handfuls > 0) detailLines += `<li><i class="fas fa-hand-holding-usd"></i> ${handfuls} Handfuls \u2192 ${coinsFromHandfuls} Coins</li>`;
        if (bags > 0) detailLines += `<li><i class="fas fa-sack-dollar"></i> ${bags} Bags \u2192 ${coinsFromBags} Coins</li>`;
        if (chests > 0) detailLines += `<li><i class="fas fa-box-open"></i> ${chests} Chests \u2192 ${coinsFromChests} Coins</li>`;

        const body = `
            <p style="margin-bottom: 10px; font-family: 'Lato', sans-serif;">
                <strong>${actor.name}</strong> automatically exchanged treasures for coins.
            </p>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.9em; color: #ccc; text-align: left; display: inline-block;">
                ${detailLines}
            </ul>
            <hr style="border-color: #444; width: 100%; margin: 15px 0;">
            <p style="font-size: 1.2em; color: #d4af37; margin: 0;">
                <strong>+${totalAdded} Coins</strong>
            </p>
            <p style="font-size: 0.8em; color: #888; margin-top: 5px;">
                New Balance: ${newCoins}
            </p>`;

        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor }),
            content: buildChatCard({ title: "Currency Exchange", borderColor, body }),
            sound: "sounds/dice.wav"
        };

        const whisperTo = getChatWhisperRecipients();
        if (whisperTo) chatData.whisper = whisperTo;

        await ChatMessage.create(chatData);
    }

    // --- Item Data Builder (shared between standard and custom tab) ---

    /**
     * Builds the template data object for a single store item.
     * Centralizes the 25+ field item object to avoid duplication between standard and custom tab loops.
     * @param {Object} doc - The item document
     * @param {Object} opts - Contextual options for building the item
     * @returns {Object} Item data for the template
     */
    _buildItemData(doc, opts) {
        const {
            basePrice, isOverridden, isGM, userActor, hasActor, userGold, partyGold,
            hasPartyActor, saleItems, saleDiscount, sellRatio, hiddenItems, blockedSaleItems,
            blockedPurchaseItems, lockedItems, epicItems, epicIcon, epicColor, epicLabel,
            epicEffect, stockEnabled, showStockQuantity, bestTraits, favoritedItems = {},
            canCompare = false, hasEquippedItem = false, compareCategory = null,
            header = null, tier = null
        } = opts;

        const isHidden = hiddenItems[doc.name];
        const isSaleBlocked = blockedSaleItems[doc.name];
        const isPurchaseBlocked = blockedPurchaseItems[doc.name];
        let hasItem = false;
        if (hasActor && userActor.items) {
            hasItem = userActor.items.some(i => i.name === doc.name);
        }
        const canSell = hasItem && !isSaleBlocked;

        const isSale = saleItems[doc.name];
        let finalPrice = basePrice;
        if (isSale) finalPrice = Math.ceil(basePrice * (1 - saleDiscount / 100));

        const sellPrice = Math.floor(basePrice * sellRatio);

        const canAffordPersonal = userGold >= finalPrice;
        const canBuyPersonal = hasActor && canAffordPersonal && !isPurchaseBlocked;
        const combinedWealth = partyGold + userGold;
        const canBuyParty = hasPartyActor && hasActor && (combinedWealth >= finalPrice) && !isPurchaseBlocked;

        let itemSummary = "";
        if (doc.type === "weapon") itemSummary = this._getWeaponSummary(doc);
        else if (doc.type === "armor") itemSummary = this._getArmorSummary(doc);

        let isRecommended = false;
        if (hasActor && !isGM && doc.type === "weapon") {
            const itemTrait = String(foundry.utils.getProperty(doc, "system.attack.roll.trait") || "").toLowerCase();
            if (itemTrait && bestTraits.includes(itemTrait)) isRecommended = true;
        }

        return {
            id: doc.id,
            uuid: doc.uuid,
            name: doc.name,
            img: doc.img,
            price: finalPrice,
            originalPrice: basePrice,
            isSale,
            isHidden: isGM && isHidden,
            isSaleBlocked: isGM && isSaleBlocked,
            isPurchaseBlocked: isGM && isPurchaseBlocked,
            isLocked: isGM && lockedItems[doc.name],
            isOverridden,
            canBuyPersonal,
            canBuyParty,
            canSell,
            sellPrice,
            itemSummary,
            isRecommended,
            header,
            tier,
            canCompare,
            hasEquippedItem,
            compareCategory,
            isEpic: !!epicItems[doc.name],
            epicIcon, epicColor, epicLabel,
            epicTextColor: getEpicTextColor(epicColor),
            epicBgColor: epicItems[doc.name] ? getEpicBgColor(epicColor) : null,
            epicEffect,
            isFavorited: !isGM && !!favoritedItems[doc.name]
        };
    }

    /**
     * Fetches stock data for an item and returns stock-related fields.
     * @param {string} uuid - The item UUID
     * @param {boolean} stockEnabled - Whether stock system is active
     * @param {boolean} showStockQuantity - Whether to show exact quantities
     * @returns {Promise<Object>} Stock fields to merge into item data
     */
    async _getStockFields(uuid, stockEnabled, showStockQuantity) {
        if (!stockEnabled) {
            return { stockQuantity: null, stockStatus: "available", stockUnlimited: false, stockEnabled: false, showStockQty: showStockQuantity };
        }
        const stockUnlimited = StockManager.isUnlimited(uuid);
        const qty = await StockManager.getStock(uuid);
        let stockQuantity = null;
        let stockStatus = "available";
        if (qty !== null) {
            stockQuantity = qty;
            if (qty === 0) stockStatus = "out";
            else if (qty <= 5) stockStatus = "low";
        }
        return { stockQuantity, stockStatus, stockUnlimited, stockEnabled: true, showStockQty: showStockQuantity };
    }

    /**
     * Returns the store header for an item, read from flags via the shared helper.
     * @param {Object} item - The item document
     * @returns {string|null}
     */
    _extractHeaderTag(item) {
        return getItemHeader(item);
    }

    /**
     * Cleans a description string by removing unsafe HTML.
     * Store tags no longer exist in descriptions after migration to flags.
     * @param {string} descString - The raw description string
     * @returns {string}
     */
    _cleanDescriptionString(descString) {
        return descString
            .replace(/<(?!\/?(?:p|br)\b)[^>]*>/gi, '')
            .trim();
    }

    /**
     * Separates hidden items into a dedicated group at the bottom (GM only).
     * @param {Array} groups - The item groups array
     * @param {boolean} isGM - Whether the current user is GM
     * @returns {Array} Modified groups array
     */
    _separateHiddenGroup(groups, isGM) {
        if (!isGM || groups.length === 0) return groups;

        const hiddenGroup = { id: "hidden", label: '<i class="fas fa-eye-slash"></i> Hidden Items', isHiddenGroup: true, items: [] };
        for (const group of groups) {
            const hidden = group.items.filter(i => i.isHidden);
            if (hidden.length > 0) {
                group.items = group.items.filter(i => !i.isHidden);
                hiddenGroup.items.push(...hidden);
            }
        }
        const filtered = groups.filter(g => g.items.length > 0);
        if (hiddenGroup.items.length > 0) {
            hiddenGroup.items.sort((a, b) => a.name.localeCompare(b.name));
            filtered.push(hiddenGroup);
        }
        return filtered.length > 0 ? filtered : [{ id: "all", label: "", items: [] }];
    }

    // --- _prepareContext ---

    async _prepareContext(options) {
        this.options.window.title = game.settings.get(MODULE_ID, "storeName");

        const userActor = game.user.character;
        const isGM = game.user.isGM;

        // Sync favorites from flags at the start of every render cycle
        // so _prepareContext and _applyRowFilters use the same authoritative state
        if (!isGM) {
            this.favoritedItems = game.user.getFlag(MODULE_ID, "favorites") ?? {};
        }

        const hasActor = !!userActor;

        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        let partyActor = partyActorId ? game.actors.get(partyActorId) : null;

        let hasPartyActor = !!partyActor;
        if (hasPartyActor && !isGM) {
            const defaultOwnership = partyActor.ownership?.default ?? 0;
            hasPartyActor = defaultOwnership >= 3;
        }

        const userGold = userActor ? getActorWealth(userActor) : 0;
        const partyGold = partyActor ? getActorWealth(partyActor) : 0;

        const storeProfiles = game.settings.get(MODULE_ID, "storeProfiles") || { "Default": {} };
        const currentProfile = game.settings.get(MODULE_ID, "currentProfile") || "Default";
        const profileKeys = Object.keys(storeProfiles);
        if (!profileKeys.includes("Default")) profileKeys.unshift("Default");

        const currencyName = getSystemCurrency();

        let bestTraits = [];
        if (hasActor && !isGM) {
            const traitKeys = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];
            let maxVal = -Infinity;
            traitKeys.forEach(t => {
                const val = foundry.utils.getProperty(userActor, `system.traits.${t}.value`) || 0;
                if (val > maxVal) maxVal = val;
            });
            if (maxVal > -Infinity) {
                bestTraits = traitKeys.filter(t => {
                    const val = foundry.utils.getProperty(userActor, `system.traits.${t}.value`) || 0;
                    return val === maxVal;
                });
            }
        }

        const context = {
            isGM, hasActor,
            actorName: userActor ? userActor.name : "None",
            currency: currencyName,
            hasPartyActor,
            userGold, partyGold,
            tabs: {},
            categories: [],
            searchQuery: this.searchQuery,
            activeTab: this.activeTab,
            presets: profileKeys,
            currentProfile,
            epicIcon: game.settings.get(MODULE_ID, "epicIcon"),
            showFavoritesOnly: this.showFavoritesOnly
        };

        // Load all needed settings once
        const priceMod = game.settings.get(MODULE_ID, "priceModifier") / 100;
        const sellRatio = game.settings.get(MODULE_ID, "sellRatio") || 0.5;
        const allowedTiers = game.settings.get(MODULE_ID, "allowedTiers");
        const hiddenCategories = game.settings.get(MODULE_ID, "hiddenCategories");
        const customCompendiums = game.settings.get(MODULE_ID, "customCompendiums") || [];
        const priceOverrides = game.settings.get(MODULE_ID, "priceOverrides") || {};
        const saleDiscount = game.settings.get(MODULE_ID, "saleDiscount") || 10;
        const saleItems = game.settings.get(MODULE_ID, "saleItems") || {};
        const hiddenItems = game.settings.get(MODULE_ID, "hiddenItems") || {};
        const blockedSaleItems = game.settings.get(MODULE_ID, "blockedSaleItems") || {};
        const blockedPurchaseItems = game.settings.get(MODULE_ID, "blockedPurchaseItems") || {};
        const lockedItems = game.settings.get(MODULE_ID, "lockedItems") || {};
        const epicItems = game.settings.get(MODULE_ID, "epicItems") || {};
        const epicIcon = game.settings.get(MODULE_ID, "epicIcon");
        const epicColor = game.settings.get(MODULE_ID, "epicColor");
        const epicLabel = game.settings.get(MODULE_ID, "epicLabel");
        const epicEffect = game.settings.get(MODULE_ID, "epicEffect");

        const stockEnabled = game.settings.get(MODULE_ID, "stockEnabled") && hasPartyActor;
        const showStockQuantity = game.settings.get(MODULE_ID, "showStockQuantity");

        // Shared options object for _buildItemData
        const sharedOpts = {
            isGM, userActor, hasActor, userGold, partyGold, hasPartyActor,
            saleItems, saleDiscount, sellRatio, hiddenItems, blockedSaleItems,
            blockedPurchaseItems, lockedItems, epicItems, epicIcon, epicColor,
            epicLabel, epicEffect, stockEnabled, showStockQuantity, bestTraits,
            favoritedItems: this.favoritedItems
        };

        let categories = foundry.utils.deepClone(STANDARD_CATEGORIES);

        const customTabCompendiums = game.settings.get(MODULE_ID, "customTabCompendiums") || [];
        const customTabName = game.settings.get(MODULE_ID, "customTabName");
        const customTabTierGroup = game.settings.get(MODULE_ID, "customTabTierGroup");
        const useDefaultCompendiums = game.settings.get(MODULE_ID, "useDefaultCompendiums");

        const hasCustomTab = customTabCompendiums.some(p => p && p.trim() !== "");
        if (hasCustomTab) {
            categories.push({ id: "custom-tab", label: customTabName || "General", key: "CustomTab" });
        }

        categories = categories.filter(c => !hiddenCategories[c.key]);
        context.categories = categories;

        if (categories.length > 0) {
            const currentTabExists = categories.find(c => c.id === this.activeTab);
            if (!currentTabExists) {
                this.activeTab = categories[0].id;
                context.activeTab = this.activeTab;
            }
        }

        for (const cat of categories) {
            // OPTIMIZATION: Only process the active tab
            if (cat.id !== this.activeTab) {
                context.tabs[cat.id] = [];
                continue;
            }

            if (cat.id === "custom-tab") {
                const customItems = [];
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

                        if (hiddenItems[doc.name] && !isGM) continue;

                        const cleanBasePrice = extractPriceFromDescription(doc);
                        let basePrice = cleanBasePrice;
                        let isOverridden = false;

                        if (priceOverrides.hasOwnProperty(doc.name)) {
                            basePrice = priceOverrides[doc.name];
                            isOverridden = (basePrice !== cleanBasePrice);
                        }

                        const header = this._extractHeaderTag(doc);

                        // Determine tier for grouping via flag-based helper
                        const itemTier = getItemTier(doc);

                        // Per-item comparison (custom tab items can be any type)
                        let canCompare = false;
                        let hasEquippedItem = false;
                        let compareCategory = null;
                        if (!isGM && hasActor) {
                            if (doc.type === "weapon") {
                                const isSecondary = foundry.utils.getProperty(doc, "system.secondary") === true;
                                compareCategory = isSecondary ? "secondary" : "primary";
                                canCompare = true;
                                hasEquippedItem = !!this._getEquippedItem(userActor, compareCategory);
                            } else if (doc.type === "armor") {
                                compareCategory = "armors";
                                canCompare = true;
                                hasEquippedItem = !!this._getEquippedItem(userActor, compareCategory);
                            }
                        }

                        const stockFields = await this._getStockFields(doc.uuid, stockEnabled, showStockQuantity);
                        const itemData = this._buildItemData(doc, {
                            ...sharedOpts, basePrice, isOverridden, header, tier: itemTier,
                            canCompare, hasEquippedItem, compareCategory
                        });
                        const rawDesc = String(foundry.utils.getProperty(doc, "system.description.value") ||
                                               foundry.utils.getProperty(doc, "system.description") || "");
                        itemData.description = this._cleanDescriptionString(rawDesc);
                        Object.assign(itemData, stockFields);

                        customItems.push(itemData);
                    }
                }

                // Group custom items
                const groups = this._groupCustomItems(customItems, customTabTierGroup);
                context.tabs[cat.id] = isGM ? this._separateHiddenGroup(groups, true) :
                    (groups.length > 0 ? groups : [{ id: "all", label: "", items: [] }]);
                continue;
            }

            // Standard category processing
            const tierGroups = {
                1: { id: 1, label: "Tier 1 / Common", items: [] },
                2: { id: 2, label: "Tier 2 / Uncommon", items: [] },
                3: { id: 3, label: "Tier 3 / Rare", items: [] },
                4: { id: 4, label: "Tier 4 / Legendary", items: [] }
            };

            const packsToScan = [];
            if (useDefaultCompendiums && PACK_MAPPING[cat.key]) packsToScan.push({ id: PACK_MAPPING[cat.key], isDefault: true });
            customCompendiums.forEach(custom => {
                if (custom.category === cat.key) packsToScan.push({ id: custom.pack, isDefault: false });
            });

            const catConfig = allowedTiers[cat.key] || {1:true, 2:true, 3:true, 4:true};
            const priceList = PRICE_DATA[cat.key] || {};

            for (const packInfo of packsToScan) {
                const pack = game.packs.get(packInfo.id);
                if (!pack) continue;

                const docs = await pack.getDocuments();

                for (const doc of docs) {
                    if (!packInfo.isDefault) {
                        const expectedType = CATEGORY_ITEM_TYPE[cat.key];
                        if (expectedType && doc.type !== expectedType) continue;
                    }

                    if (doc.type === "weapon") {
                        const isSecondary = foundry.utils.getProperty(doc, "system.secondary") === true;
                        if (isSecondary && cat.key !== "Secondary Weapons") continue;
                        if (!isSecondary && cat.key === "Secondary Weapons") continue;
                    }

                    if (hiddenItems[doc.name] && !isGM) continue;

                    let cleanBasePrice = 0;
                    let basePrice = 0;
                    let tier = 1;
                    let knownItem = false;

                    if (priceList.hasOwnProperty(doc.name)) {
                        cleanBasePrice = Math.ceil(priceList[doc.name].price * priceMod);
                        basePrice = cleanBasePrice;
                        tier = priceList[doc.name].tier;
                        knownItem = true;
                    }

                    if (packInfo.isDefault && !knownItem) continue;

                    if (!packInfo.isDefault) {
                        knownItem = true;
                        if (!priceList.hasOwnProperty(doc.name)) {
                             tier = getItemTier(doc);
                             const extracted = extractPriceFromDescription(doc);
                             if (extracted > 0) {
                                 cleanBasePrice = Math.ceil(extracted * priceMod);
                                 basePrice = cleanBasePrice;
                             }
                        }
                    }

                    let isOverridden = false;
                    if (priceOverrides.hasOwnProperty(doc.name)) {
                        basePrice = priceOverrides[doc.name];
                        isOverridden = (basePrice !== cleanBasePrice);
                    }

                    if (!knownItem) continue;
                    if (!catConfig[tier]) continue;

                    const header = this._extractHeaderTag(doc);

                    const canCompare = !isGM && hasActor && this._isComparableCategory(cat.id);
                    const hasEquippedItem = canCompare && !!this._getEquippedItem(userActor, cat.id);

                    const stockFields = await this._getStockFields(doc.uuid, stockEnabled, showStockQuantity);
                    const itemData = this._buildItemData(doc, {
                        ...sharedOpts, basePrice, isOverridden, header,
                        canCompare, hasEquippedItem
                    });
                    const rawDesc = String(foundry.utils.getProperty(doc, "system.description.value") ||
                                           foundry.utils.getProperty(doc, "system.description") || "");
                    itemData.description = this._cleanDescriptionString(rawDesc);
                    Object.assign(itemData, stockFields);

                    if (tierGroups[tier]) tierGroups[tier].items.push(itemData);
                }
            }

            // Build groups with tier + header support
            const tierLabels = { 1: "Tier 1 / Common", 2: "Tier 2 / Uncommon", 3: "Tier 3 / Rare", 4: "Tier 4 / Legendary" };
            const groupMap = {};

            for (const tier of [1, 2, 3, 4]) {
                const items = tierGroups[tier].items;
                if (items.length === 0) continue;

                const hasHeaders = items.some(i => i.header);
                if (!hasHeaders) {
                    items.sort((a, b) => a.name.localeCompare(b.name));
                    groupMap[`tier-${tier}`] = { id: `tier-${tier}`, label: tierLabels[tier], tier, items };
                } else {
                    const noHeaderItems = [];
                    const headerGroups = {};
                    for (const item of items) {
                        if (item.header) {
                            if (!headerGroups[item.header]) headerGroups[item.header] = [];
                            headerGroups[item.header].push(item);
                        } else {
                            noHeaderItems.push(item);
                        }
                    }
                    if (noHeaderItems.length > 0) {
                        noHeaderItems.sort((a, b) => a.name.localeCompare(b.name));
                        groupMap[`tier-${tier}`] = { id: `tier-${tier}`, label: tierLabels[tier], tier, items: noHeaderItems };
                    }
                    Object.keys(headerGroups).sort().forEach(header => {
                        const key = `tier-${tier}-${header}`;
                        headerGroups[header].sort((a, b) => a.name.localeCompare(b.name));
                        groupMap[key] = { id: key, label: `${tierLabels[tier]} - ${header}`, tier, items: headerGroups[header] };
                    });
                }
            }

            const standardGroups = Object.values(groupMap)
                .sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label));

            context.tabs[cat.id] = isGM ? this._separateHiddenGroup(standardGroups, true) : standardGroups;
        }

        return context;
    }

    /**
     * Groups custom tab items into tier/header groups.
     * @param {Array} items - The custom items array
     * @param {boolean} useTierGrouping - Whether to group by tier
     * @returns {Array} Groups array
     */
    _groupCustomItems(items, useTierGrouping) {
        const groups = [];

        if (useTierGrouping) {
            const tierLabels = { 1: "Tier 1 / Common", 2: "Tier 2 / Uncommon", 3: "Tier 3 / Rare", 4: "Tier 4 / Legendary" };
            const tierGroupMap = {};
            const noTierHeaderGroups = {};
            const noTierNoHeaderItems = [];

            for (const item of items) {
                if (item.tier !== null) {
                    const suffix = item.header ? ` - ${item.header}` : "";
                    const groupKey = `tier-${item.tier}${suffix}`;
                    const groupLabel = `${tierLabels[item.tier]}${suffix}`;
                    if (!tierGroupMap[groupKey]) tierGroupMap[groupKey] = { id: groupKey, label: groupLabel, tier: item.tier, items: [] };
                    tierGroupMap[groupKey].items.push(item);
                } else if (item.header) {
                    if (!noTierHeaderGroups[item.header]) noTierHeaderGroups[item.header] = [];
                    noTierHeaderGroups[item.header].push(item);
                } else {
                    noTierNoHeaderItems.push(item);
                }
            }

            Object.values(tierGroupMap)
                .sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label))
                .forEach(group => { group.items.sort((a, b) => a.name.localeCompare(b.name)); groups.push(group); });

            Object.keys(noTierHeaderGroups).sort().forEach(header => {
                noTierHeaderGroups[header].sort((a, b) => a.name.localeCompare(b.name));
                groups.push({ id: header, label: header, items: noTierHeaderGroups[header] });
            });

            if (noTierNoHeaderItems.length > 0) {
                noTierNoHeaderItems.sort((a, b) => a.name.localeCompare(b.name));
                groups.push({ id: "no-header", label: groups.length > 0 ? "Other" : "", items: noTierNoHeaderItems });
            }
        } else {
            const headerGroups = {};
            const noHeaderItems = [];
            for (const item of items) {
                if (item.header) {
                    if (!headerGroups[item.header]) headerGroups[item.header] = [];
                    headerGroups[item.header].push(item);
                } else {
                    noHeaderItems.push(item);
                }
            }
            if (noHeaderItems.length > 0) {
                noHeaderItems.sort((a, b) => a.name.localeCompare(b.name));
                groups.push({ id: "no-header", label: Object.keys(headerGroups).length > 0 ? "Other" : "", items: noHeaderItems });
            }
            Object.keys(headerGroups).sort().forEach(header => {
                headerGroups[header].sort((a, b) => a.name.localeCompare(b.name));
                groups.push({ id: header, label: header, items: headerGroups[header] });
            });
        }

        return groups;
    }

    // --- _onRender ---

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        if (this.window) this.window.title = this.options.window.title;

        this._setupSearchInputs(html);
        this._setupSliders(html);
        this._setupPriceInputs(html);
        this._setupStockInputs(html);
        this._setupItemImages(html);
        this._setupDescriptionTooltips(html);
        this._setupComparisonTooltips(html);
        this._setupTabSwitching(html);
    }

    _setupSearchInputs(html) {
        const searchInputs = html.querySelectorAll(".store-search");
        searchInputs.forEach(searchInput => {
            searchInput.value = this.searchQuery;
            const tabContent = searchInput.closest(".tab");
            if (tabContent) this._applyRowFilters(tabContent);
            searchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value;
                const tab = e.target.closest(".tab");
                if (tab) this._applyRowFilters(tab);
            });
        });
    }

    _setupSliders(html) {
        const sliders = html.querySelectorAll("input[type='range']");
        sliders.forEach(range => {
            const display = range.nextElementSibling;
            if (display && display.classList.contains("range-value")) {
                range.addEventListener("input", (e) => { display.innerText = `${e.target.value}%`; });
            }
        });
    }

    _setupPriceInputs(html) {
        const priceInputs = html.querySelectorAll(".gm-price-input");
        priceInputs.forEach(input => {
            input.addEventListener("change", this._onPriceOverrideChange.bind(this));
        });
    }

    _setupStockInputs(html) {
        const stockInputs = html.querySelectorAll(".gm-stock-input");
        stockInputs.forEach(input => {
            input.addEventListener("change", async (e) => {
                const itemUuid = e.target.dataset.uuid;
                const value = e.target.value.trim();
                if (value === "" || value === "\u221E") {
                    await StockManager.setStock(itemUuid, 0, true);
                } else {
                    const qty = parseInt(value);
                    if (!isNaN(qty) && qty >= 0) await StockManager.setStock(itemUuid, qty, false);
                }
            });
        });
    }

    _setupItemImages(html) {
        const itemImages = html.querySelectorAll(".item-image");
        itemImages.forEach(img => {
            img.addEventListener("click", async (e) => {
                const uuid = e.currentTarget.dataset.uuid;
                if (!uuid) return;
                const doc = await fromUuid(uuid);
                if (doc && doc.sheet) doc.sheet.render(true);
            });
        });
    }

    _setupDescriptionTooltips(html) {
        const itemNames = html.querySelectorAll(".store-item-name[data-item-desc]");
        let tooltipTimeout = null;

        itemNames.forEach(nameEl => {
            nameEl.addEventListener("mouseenter", (e) => {
                const text = e.currentTarget.dataset.itemDesc;
                if (!text) return;
                const target = e.currentTarget;
                if (tooltipTimeout) clearTimeout(tooltipTimeout);

                tooltipTimeout = setTimeout(async () => {
                    document.querySelectorAll(".daggerheart-store-tooltip").forEach(t => t.remove());

                    let resolvedText = text;
                    const uuidPattern = /@UUID\[([^\]]+)\](?:\{([^}]+)\})?/g;
                    const matches = [...text.matchAll(uuidPattern)];
                    for (const match of matches) {
                        const [full, uuid, label] = match;
                        if (label) {
                            resolvedText = resolvedText.replace(full, label);
                        } else {
                            try {
                                const doc = await fromUuid(uuid);
                                resolvedText = resolvedText.replace(full, doc?.name ?? uuid);
                            } catch {
                                resolvedText = resolvedText.replace(full, uuid);
                            }
                        }
                    }

                    const tooltip = document.createElement("div");
                    tooltip.className = "daggerheart-store-tooltip";
                    const sanitized = resolvedText.replace(/<(?!\/?(?:p|br|b|i|em|strong|ul|ol|li|span|hr)\b)[^>]*>/gi, "");
                    tooltip.innerHTML = sanitized;
                    document.body.appendChild(tooltip);

                    const rect = target.getBoundingClientRect();
                    tooltip.style.left = `${rect.left}px`;
                    tooltip.style.top = `${rect.bottom + 8}px`;

                    const tooltipRect = tooltip.getBoundingClientRect();
                    if (tooltipRect.right > window.innerWidth - 10) tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
                    if (tooltipRect.bottom > window.innerHeight - 10) tooltip.style.top = `${rect.top - tooltipRect.height - 8}px`;
                }, 600);
            });

            nameEl.addEventListener("mouseleave", () => {
                if (tooltipTimeout) { clearTimeout(tooltipTimeout); tooltipTimeout = null; }
                document.querySelectorAll(".daggerheart-store-tooltip").forEach(t => t.remove());
            });
        });
    }

    _setupComparisonTooltips(html) {
        const compareBtns = html.querySelectorAll(".compare-btn");
        let compareTooltipTimeout = null;
        let compareTooltipRemoveTimeout = null;

        compareBtns.forEach(btn => {
            btn.addEventListener("mouseenter", async (e) => {
                const target = e.currentTarget;
                const itemUuid = target.dataset.itemUuid;
                const category = target.dataset.category;
                const actor = game.user.character;
                if (!actor) return;

                if (compareTooltipTimeout) clearTimeout(compareTooltipTimeout);
                if (compareTooltipRemoveTimeout) clearTimeout(compareTooltipRemoveTimeout);

                compareTooltipTimeout = setTimeout(async () => {
                    document.querySelectorAll(".comparison-tooltip").forEach(t => t.remove());

                    const comparisonData = await this._buildComparisonData(itemUuid, category, actor);
                    if (!comparisonData) return;

                    const templatePath = "modules/daggerheart-store/templates/item-comparison.hbs";
                    const tooltipHtml = await foundry.applications.handlebars.renderTemplate(templatePath, comparisonData);

                    const tooltipContainer = document.createElement("div");
                    tooltipContainer.innerHTML = tooltipHtml;
                    const tooltip = tooltipContainer.firstElementChild;
                    document.body.appendChild(tooltip);

                    const rect = target.getBoundingClientRect();
                    const tooltipRect = tooltip.getBoundingClientRect();
                    let top = rect.top - tooltipRect.height - 10;
                    if (top < 10) top = rect.bottom + 10;
                    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                    if (left < 10) left = 10;
                    if (left + tooltipRect.width > window.innerWidth - 10) left = window.innerWidth - tooltipRect.width - 10;
                    if (top + tooltipRect.height > window.innerHeight - 10) top = window.innerHeight - tooltipRect.height - 10;

                    tooltip.style.position = "fixed";
                    tooltip.style.left = `${left}px`;
                    tooltip.style.top = `${top}px`;
                    tooltip.style.zIndex = "10000";

                    tooltip.addEventListener("mouseenter", () => {
                        if (compareTooltipRemoveTimeout) { clearTimeout(compareTooltipRemoveTimeout); compareTooltipRemoveTimeout = null; }
                    });
                    tooltip.addEventListener("mouseleave", () => {
                        compareTooltipRemoveTimeout = setTimeout(() => { tooltip.remove(); }, 200);
                    });
                }, 400);
            });

            btn.addEventListener("mouseleave", () => {
                if (compareTooltipTimeout) { clearTimeout(compareTooltipTimeout); compareTooltipTimeout = null; }
                compareTooltipRemoveTimeout = setTimeout(() => {
                    document.querySelectorAll(".comparison-tooltip").forEach(t => t.remove());
                }, 200);
            });
        });
    }

    _setupTabSwitching(html) {
        const tabs = html.querySelectorAll(".sheet-tabs .item");
        tabs.forEach(tab => {
            tab.addEventListener("click", (e) => {
                e.preventDefault();
                const tabId = e.currentTarget.dataset.tab;
                if (this.activeTab !== tabId) {
                    this.activeTab = tabId;
                    this.render();
                }
            });
        });

        if (!html.querySelector(".sheet-tabs .item.active")) {
            let targetTab = html.querySelector(`.sheet-tabs .item[data-tab="${this.activeTab}"]`);
            let targetContent = html.querySelector(`.content .tab[data-tab="${this.activeTab}"]`);
            if (!targetTab && tabs.length > 0) {
                targetTab = tabs[0];
                targetContent = html.querySelector(".content .tab");
            }
            if (targetTab) targetTab.classList.add("active");
            if (targetContent) {
                targetContent.classList.add("active");
                targetContent.style.display = "block";
            }
        }
    }

    /**
     * Applies combined search text and favorites filter to item rows via DOM manipulation.
     * Called from _setupSearchInputs, clearSearch, toggleFavorite, and toggleFavoriteFilter.
     * @param {HTMLElement} tabContent - The .tab container element
     */
    _applyRowFilters(tabContent) {
        const query = tabContent.querySelector(".store-search")?.value.toLowerCase() ?? "";
        const favs = this.favoritedItems ?? {};
        const rows = tabContent.querySelectorAll(".store-row");
        rows.forEach(row => {
            const name = row.querySelector(".store-item-name")?.innerText.toLowerCase() ?? "";
            const matchesSearch = name.includes(query);
            const matchesFav = !this.showFavoritesOnly || !!favs[row.dataset.itemName];
            row.style.display = (matchesSearch && matchesFav) ? "flex" : "none";
        });
    }

    _onClearSearch(event, target) {
        this.searchQuery = "";
        const container = target.closest(".search-container");
        const input = container?.querySelector(".store-search");
        if (input) input.value = "";
        const tabContent = target.closest(".tab");
        if (tabContent) this._applyRowFilters(tabContent);
    }

    // --- Favorites Actions (Players Only) ---

    /**
     * Toggles an item's favorited state in user flags and updates the DOM.
     * Triggered by the bookmark button on each item row (data-action="toggleFavorite").
     * @param {Event} event - The click event
     * @param {HTMLElement} target - The button element with data-item-name
     */
    async _onToggleFavorite(event, target) {
        const itemName = target.dataset.itemName;
        if (!itemName) return;

        const current = foundry.utils.deepClone(game.user.getFlag(MODULE_ID, "favorites") ?? {});
        const isCurrentlyFavorited = !!current[itemName];

        if (isCurrentlyFavorited) {
            // Must unsetFlag on the specific sub-path — setFlag with a missing key does NOT delete it
            await game.user.unsetFlag(MODULE_ID, `favorites.${itemName}`);
            delete current[itemName];
        } else {
            current[itemName] = true;
            await game.user.setFlag(MODULE_ID, "favorites", current);
        }

        this.favoritedItems = current;
        target.classList.toggle("active", !isCurrentlyFavorited);

        if (this.showFavoritesOnly) {
            const tabContent = target.closest(".tab");
            if (tabContent) this._applyRowFilters(tabContent);
        }
    }

    /**
     * Toggles the favorites-only filter and re-applies row visibility.
     * Triggered by the filter button in the search bar (data-action="toggleFavoriteFilter").
     * @param {Event} event - The click event
     * @param {HTMLElement} target - The filter button element
     */
    _onToggleFavoriteFilter(event, target) {
        this.showFavoritesOnly = !this.showFavoritesOnly;
        target.classList.toggle("active", this.showFavoritesOnly);
        const tabContent = target.closest(".tab");
        if (tabContent) this._applyRowFilters(tabContent);
    }

    // --- Buy / Sell / Transfer Actions ---

    async _onBuyItem(event, target) {
        const itemUuid = target.dataset.uuid;
        const itemPrice = parseInt(target.dataset.price);
        const itemName = target.dataset.name;
        const buySource = target.dataset.source;
        const userActor = game.user.character;
        if (!userActor) return ui.notifications.error("You need an assigned character.");

        if (buySource === "party") {
            const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
            if (!partyActorId) return ui.notifications.error("Party sheet not configured.");
            const partyActor = game.actors.get(partyActorId);
            if (!partyActor) return ui.notifications.error("Party actor not found.");
            return this._handleSplitPurchase(itemUuid, itemName, itemPrice, userActor, partyActor);
        }

        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const hasPartyActor = !!(partyActorId && game.actors.get(partyActorId));
        const stockEnabled = game.settings.get(MODULE_ID, "stockEnabled") && hasPartyActor;

        if (stockEnabled) {
            const stockQty = await StockManager.getStock(itemUuid);
            if (stockQty !== null && stockQty < 1) return ui.notifications.warn(`${itemName} is out of stock.`);
        }

        const userWealth = getActorWealth(userActor);
        if (userWealth < itemPrice) return ui.notifications.warn(`Insufficient funds.`);

        await this._executePurchase({
            itemUuid, itemName, price: itemPrice,
            recipient: userActor,
            payers: [{ actor: userActor, amount: itemPrice, name: userActor.name }]
        });
    }

    async _onSellItem(event, target) {
        if (target.disabled) return;

        const itemName = target.dataset.name;
        const itemUuid = target.dataset.uuid;
        const sellPrice = parseInt(target.dataset.price);
        const userActor = game.user.character;
        if (!userActor) return ui.notifications.error("You need an assigned character to sell items.");

        const blockedSaleItems = game.settings.get(MODULE_ID, "blockedSaleItems") || {};
        if (blockedSaleItems[itemName]) return ui.notifications.warn("This item cannot be sold.");

        const itemToDelete = userActor.items.find(i => i.name === itemName);
        if (!itemToDelete) return ui.notifications.warn(`You do not have a "${itemName}" to sell.`);

        await itemToDelete.delete();

        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const hasPartyActor = !!(partyActorId && game.actors.get(partyActorId));
        const stockEnabled = game.settings.get(MODULE_ID, "stockEnabled") && hasPartyActor;
        if (stockEnabled && itemUuid) await StockManager.incrementStock(itemUuid, 1);

        await addGold(userActor, sellPrice);

        const currency = getSystemCurrency();
        const borderColor = this._getBorderColor("sell");
        const body = `
            <span style="color: #ffffff; font-size: 1.1em; font-weight: bold; font-family: 'Lato', sans-serif;">
                <strong>${userActor.name}</strong> sold <strong>${itemName}</strong>
            </span>
            <span style="color: #d4af37; font-size: 1.2em; font-weight: bold; margin-top: 10px;">
                +${sellPrice} ${currency}
            </span>`;

        const chatData = {
            content: buildChatCard({ title: "Item Sold", borderColor, body }),
            speaker: ChatMessage.getSpeaker({ actor: userActor })
        };
        const whisperTo = getChatWhisperRecipients();
        if (whisperTo) chatData.whisper = whisperTo;
        await ChatMessage.create(chatData);

        if (game.audio) foundry.audio.AudioHelper.play({ src: "modules/daggerheart-store/assets/audio/coins.mp3", volume: 0.8, loop: false }, false);
        this.render();
    }

    async _onTransferFunds(event, target) {
        const userActor = game.user.character;
        if (!userActor) return ui.notifications.error("You need an assigned character.");

        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const partyActor = game.actors.get(partyActorId);
        if (!partyActor) return ui.notifications.error("Party actor not configured.");

        const currency = getSystemCurrency();
        const userWealth = getActorWealth(userActor);
        const partyWealth = getActorWealth(partyActor);

        const content = `
            <div class="store-dialog-content">
                <h3 class="store-dialog-header" style="color: #8e44ad;">Transfer Funds</h3>
            </div>
            <div class="transfer-wealth-display">
                <div class="transfer-wealth-item">
                    <div class="transfer-wealth-label"><i class="fas fa-coins"></i> My Wealth</div>
                    <div class="transfer-wealth-value">${userWealth} ${currency}</div>
                </div>
                <div class="transfer-wealth-item">
                    <div class="transfer-wealth-label"><i class="fas fa-users"></i> Party Resources</div>
                    <div class="transfer-wealth-value">${partyWealth} ${currency}</div>
                </div>
            </div>
            <div class="transfer-direction-container">
                <button type="button" class="direction-btn deposit-btn selected" data-direction="deposit">
                    <i class="fas fa-arrow-right"></i> Deposit to Party
                </button>
                <button type="button" class="direction-btn withdraw-btn" data-direction="withdraw">
                    <i class="fas fa-arrow-left"></i> Withdraw from Party
                </button>
            </div>
            <input type="hidden" name="direction" value="deposit">
            <div class="store-dialog-input-group">
                <label>Amount (${currency}):</label>
                <input type="number" name="amount" min="1" step="1" placeholder="0">
            </div>
        `;

        const storeApp = this;

        const dialog = new DialogV2({
            window: { title: "Transfer Funds", icon: "fas fa-exchange-alt", resizable: false },
            content,
            classes: ["store-dialog"],
            modal: true,
            buttons: [
                {
                    action: "confirm",
                    label: "Transfer",
                    icon: "fas fa-check",
                    callback: async (event, button, dialog) => {
                        const direction = button.form.elements.direction.value;
                        const amount = parseInt(button.form.elements.amount.value) || 0;
                        if (amount <= 0) return ui.notifications.warn("Invalid amount.");

                        if (direction === "deposit") {
                            if (amount > userWealth) return ui.notifications.warn("Insufficient funds.");
                            // Deduct from own actor first (player has Owner on their own actor)
                            await deductGold(userActor, amount);
                            // Deposit to Party Actor via GM query
                            const depositResult = await queryDepositToParty(partyActor.id, amount);
                            if (!depositResult.ok) {
                                // Rollback: refund the player
                                await addGold(userActor, amount);
                                return ui.notifications.error("Failed to deposit funds. Your gold has been refunded.");
                            }
                            storeApp._createTransferChatMessage(userActor, partyActor, amount, "deposit", currency);
                        } else {
                            // Balance check happens server-side in the GM handler against live data
                            const withdrawResult = await queryWithdrawFromParty(partyActor.id, amount);
                            if (!withdrawResult.ok) {
                                if (withdrawResult.reason === "insufficient_funds") return ui.notifications.warn("Insufficient party funds.");
                                return ui.notifications.error("Failed to withdraw funds. Please try again.");
                            }
                            await addGold(userActor, amount);
                            storeApp._createTransferChatMessage(userActor, partyActor, amount, "withdraw", currency);
                        }
                        storeApp.render();
                    }
                },
                { action: "cancel", label: "Cancel", icon: "fas fa-times" }
            ]
        });

        Hooks.once("renderDialogV2", (app, element) => {
            if (app !== dialog) return;
            const container = element.querySelector(".transfer-direction-container");
            if (!container) return;
            const buttons = container.querySelectorAll(".direction-btn");
            const hiddenInput = element.querySelector('input[name="direction"]');
            buttons.forEach(btn => {
                btn.addEventListener("click", (e) => {
                    e.preventDefault(); e.stopPropagation();
                    buttons.forEach(b => b.classList.remove("selected"));
                    btn.classList.add("selected");
                    if (hiddenInput) hiddenInput.value = btn.dataset.direction;
                });
            });
        });

        dialog.render(true);
    }

    async _createTransferChatMessage(userActor, partyActor, amount, type, currency) {
        const title = type === "deposit" ? "Funds Deposited" : "Funds Withdrawn";
        const message = type === "deposit"
            ? `<strong>${userActor.name}</strong> deposited funds to <strong>${partyActor.name}</strong>.`
            : `<strong>${userActor.name}</strong> withdrew funds from <strong>${partyActor.name}</strong>.`;
        const borderColor = this._getBorderColor("transfer");

        const body = `
            <span style="color: #ffffff; font-size: 1.1em; font-family: 'Lato', sans-serif;">
                ${message}
            </span>
            <span style="color: #d4af37; font-size: 1.3em; font-weight: bold; margin-top: 10px;">
                ${amount} ${currency}
            </span>`;

        const chatData = {
            content: buildChatCard({ title, borderColor, body }),
            speaker: ChatMessage.getSpeaker({ actor: userActor })
        };
        const whisperTo = getChatWhisperRecipients();
        if (whisperTo) chatData.whisper = whisperTo;
        await ChatMessage.create(chatData);

        if (game.audio) foundry.audio.AudioHelper.play({ src: "modules/daggerheart-store/assets/audio/coins.mp3", volume: 0.8, loop: false }, false);
    }

    async _handleSplitPurchase(itemUuid, itemName, price, userActor, partyActor) {
        const currency = getSystemCurrency();
        const userGold = getActorWealth(userActor);
        const partyGold = getActorWealth(partyActor);

        let defaultPartyPay = Math.min(partyGold, price);
        let defaultUserPay = price - defaultPartyPay;
        if (defaultUserPay > userGold) return ui.notifications.warn("Combined funds are insufficient.");

        const content = `
            <div class="split-payment-content">
                <div class="split-payment-header">
                    <span class="split-payment-action">Buying</span>
                    <span class="split-payment-item">${itemName}</span>
                    <span class="split-payment-cost">Cost: ${price} <i class="fas fa-coins"></i> ${currency}</span>
                </div>
                <div class="split-payment-separator"></div>
                <div class="split-payment-source-group">
                    <div class="split-payment-row">
                        <div class="split-payment-label-group">
                            <span class="split-payment-label">${userActor.name}</span>
                            <span class="split-payment-wealth">(${userGold} ${currency})</span>
                        </div>
                        <div class="split-payment-input-wrapper">
                            <i class="fas fa-coins"></i>
                            <input type="number" id="user-share" name="user-share" value="${defaultUserPay}" min="0" max="${userGold}">
                        </div>
                    </div>
                </div>
                <div class="split-payment-source-group party">
                    <div class="split-payment-row">
                        <div class="split-payment-label-group">
                            <span class="split-payment-label">Party</span>
                            <span class="split-payment-wealth">(${partyGold} ${currency})</span>
                        </div>
                        <div class="split-payment-input-wrapper">
                            <i class="fas fa-coins"></i>
                            <input type="number" id="party-share" name="party-share" value="${defaultPartyPay}" min="0" max="${partyGold}">
                        </div>
                    </div>
                </div>
            </div>
        `;

        new DialogV2({
            window: { title: "Split Payment", icon: "fas fa-coins", resizable: false },
            content,
            classes: ["store-dialog", "split-payment-dialog"],
            modal: true,
            buttons: [
                {
                    action: "confirm", label: "Purchase", icon: "fas fa-check",
                    callback: async (event, button, dialog) => {
                        const userPay = parseInt(button.form.elements["user-share"].value) || 0;
                        const partyPay = parseInt(button.form.elements["party-share"].value) || 0;
                        if (userPay + partyPay !== price) { ui.notifications.error(`Invalid payment amount. Total is ${userPay + partyPay}, but price is ${price}. Purchase cancelled.`); return; }
                        if (userPay > userGold || partyPay > partyGold) { ui.notifications.error("Cannot pay more than available funds. Purchase cancelled."); return; }
                        await this._executePurchase({
                            itemUuid, itemName, price,
                            recipient: userActor,
                            payers: [
                                { actor: userActor, amount: userPay, name: userActor.name },
                                { actor: partyActor, amount: partyPay, name: "Party Funds" }
                            ]
                        });
                    }
                },
                { action: "cancel", label: "Cancel", icon: "fas fa-times" }
            ],
            render: (event, html) => {
                const userIn = html.querySelector("#user-share");
                const partyIn = html.querySelector("#party-share");
                userIn.addEventListener("input", () => {
                    let val = parseInt(userIn.value) || 0;
                    if (val > userGold) val = userGold;
                    partyIn.value = Math.max(0, price - val);
                });
                partyIn.addEventListener("input", () => {
                    let val = parseInt(partyIn.value) || 0;
                    if (val > partyGold) val = partyGold;
                    userIn.value = Math.max(0, price - val);
                });
            }
        }).render(true);
    }

    async _executePurchase({ itemUuid, itemName, price, recipient, payers }) {
        const itemFromPack = await fromUuid(itemUuid);
        if (!itemFromPack) return ui.notifications.error("Item data not found.");

        const currency = getSystemCurrency();

        const partyId = game.settings.get(MODULE_ID, "partyActorId");
        for (const payer of payers) {
            if (payer.amount <= 0) continue;
            // Party Actor writes go through GM query to avoid race conditions
            if (payer.actor.id === partyId) {
                const result = await queryWithdrawFromParty(payer.actor.id, payer.amount);
                if (!result.ok) {
                    return ui.notifications.error("Failed to deduct party funds. Purchase cancelled.");
                }
            } else {
                await deductGold(payer.actor, payer.amount);
            }
        }

        const itemData = itemFromPack.toObject();
        await recipient.createEmbeddedDocuments("Item", [itemData]);

        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const hasPartyActor = !!(partyActorId && game.actors.get(partyActorId));
        const stockEnabled = game.settings.get(MODULE_ID, "stockEnabled") && hasPartyActor;
        if (stockEnabled) {
            const success = await StockManager.decrementStock(itemUuid, 1);
            if (!success) ui.notifications.warn("Stock depleted during purchase. Item added but stock was not updated.");
        }

        const payerText = payers.filter(p => p.amount > 0).map(p => `<strong>${p.name}</strong> (${p.amount})`).join(" & ");
        const itemLink = itemFromPack.link;
        const usedPartyFunds = payers.some(p => p.name === "Party Funds");
        const borderColor = this._getBorderColor(usedPartyFunds ? "party" : "buy");

        const body = `
            <span style="color: #ffffff !important; font-size: 1.1em; font-weight: bold; font-family: 'Lato', sans-serif; line-height: 1.4;">
                <strong>${recipient.name}</strong> purchased ${itemLink}
            </span>
            <span style="color: #bbb; font-size: 0.9em; margin-top: 5px;">
                Paid by: ${payerText}
            </span>
            <span style="color: #d4af37; font-size: 1.2em; font-weight: bold; margin-top: 5px;">
                -${price} ${currency}
            </span>`;

        const chatData = {
            content: buildChatCard({ title: "Store Purchase", borderColor, body }),
            speaker: ChatMessage.getSpeaker({ actor: recipient })
        };
        if (!usedPartyFunds) {
            const whisperTo = getChatWhisperRecipients();
            if (whisperTo) chatData.whisper = whisperTo;
        }
        ChatMessage.create(chatData);

        if (game.audio) {
            const epicItems = game.settings.get(MODULE_ID, "epicItems") || {};
            const soundSrc = epicItems[itemName]
                ? "modules/daggerheart-store/assets/audio/epic.mp3"
                : "modules/daggerheart-store/assets/audio/coins.mp3";
            foundry.audio.AudioHelper.play({ src: soundSrc, volume: 0.8, loop: false }, false);
        }
        this.render();
    }

    // --- GM Actions ---

    async _onOpenConfig(event, target) { new StoreConfig().render(true); }
    async _onOpenRandomizer(event, target) { new StoreRandomizer().render(true); }
    async _onShowToAll(event, target) { globalThis.Store.Show(); }

    async _onShowToPlayer(event, target) {
        const players = game.users.filter(u => !u.isGM && u.active);
        if (players.length === 0) return ui.notifications.warn("No active players.");
        const options = players.map(p => `<option value="${p.name}">${p.name}</option>`).join("");
        const selectHtml = `<div class="store-dialog-input-group"><label>Select Player:</label><select name="targetPlayer" style="width:100%">${options}</select></div>`;

        const result = await showStoreDialog({
            title: "Show Store to Player", icon: "fas fa-share",
            headerText: "Share Store", headerColor: "#D4AF37",
            message: "Select which player should receive the store window.",
            customContent: selectHtml,
            buttons: { confirm: "Show", confirmIcon: "fas fa-share" }
        });
        if (result.confirmed && result.formData?.targetPlayer) globalThis.Store.Show(result.formData.targetPlayer);
    }

    async _onSavePreset(event, target) {
        const profiles = foundry.utils.deepClone(game.settings.get(MODULE_ID, "storeProfiles")) || {};
        const currentProfile = game.settings.get(MODULE_ID, "currentProfile") || "Default";
        const existingNames = Object.keys(profiles).filter(n => n !== "Default");
        const defaultSelection = (currentProfile !== "Default" && existingNames.includes(currentProfile)) ? currentProfile : "__new__";

        let selectOptions = `<option value="__new__" ${defaultSelection === "__new__" ? "selected" : ""}>Add a New Profile</option>`;
        for (const name of existingNames) selectOptions += `<option value="${name}" ${defaultSelection === name ? "selected" : ""}>${name}</option>`;

        const isNewDefault = defaultSelection === "__new__";
        const contentHtml = `
            <div class="store-dialog-content">
                <h3 class="store-dialog-header" style="color: #D4AF37;">Save Profile</h3>
                <p class="store-dialog-description">This will save all current store settings (prices, sales, hidden items, configuration).</p>
            </div>
            <div class="store-dialog-input-group save-profile-select-row">
                <label>Profile:</label>
                <select name="profileSelect" class="save-profile-select">${selectOptions}</select>
            </div>
            <div class="store-dialog-input-group">
                <label class="save-profile-name-label">${isNewDefault ? "Choose the New Profile Name:" : "Update the Name of the Current Profile:"}</label>
                <input type="text" name="profileName" class="save-profile-name-input" maxlength="22" value="${isNewDefault ? "" : defaultSelection}" placeholder="Enter profile name">
            </div>
            <div class="save-profile-overwrite-warning" style="display: ${isNewDefault ? "none" : "flex"};">
                <i class="fas fa-exclamation-triangle"></i>
                <span>The selected profile will be overwritten with the current store settings.</span>
            </div>`;

        const result = await new Promise((resolve) => {
            const dialog = new DialogV2({
                window: { title: "Save Store Profile", icon: "fas fa-save" },
                content: contentHtml, classes: ["store-dialog"], modal: true,
                buttons: [
                    { action: "confirm", label: isNewDefault ? "Create New" : "Overwrite Profile", icon: "fas fa-save",
                        callback: (event, button, dialog) => {
                            const result = { confirmed: true, formData: {} };
                            const formData = new FormData(button.form);
                            for (const [key, value] of formData.entries()) result.formData[key] = value;
                            resolve(result);
                        }
                    },
                    { action: "cancel", label: "Cancel", icon: "fas fa-times", callback: () => resolve({ confirmed: false }) }
                ],
                close: () => resolve({ confirmed: false })
            });

            Hooks.once("renderDialogV2", (app, element) => {
                if (app !== dialog) return;
                const select = element.querySelector(".save-profile-select");
                const nameInput = element.querySelector(".save-profile-name-input");
                const nameLabel = element.querySelector(".save-profile-name-label");
                const warning = element.querySelector(".save-profile-overwrite-warning");
                const confirmBtn = element.querySelector('button[data-action="confirm"]');

                select.addEventListener("change", () => {
                    const isNew = select.value === "__new__";
                    nameLabel.textContent = isNew ? "Choose the New Profile Name:" : "Update the Name of the Current Profile:";
                    warning.style.display = isNew ? "none" : "flex";
                    if (confirmBtn) { const labelEl = confirmBtn.querySelector("label") || confirmBtn; labelEl.textContent = isNew ? "Create New" : "Overwrite Profile"; }
                    if (isNew) { nameInput.value = ""; nameInput.placeholder = "Enter profile name"; }
                    else { nameInput.value = select.value; nameInput.placeholder = "Rename or keep current name"; }
                });
            });

            dialog.render(true);
        });

        if (!result.confirmed) return;

        const selectedProfile = result.formData?.profileSelect;
        const inputName = result.formData?.profileName?.trim();
        const isNew = selectedProfile === "__new__";

        let name;
        if (isNew) {
            name = inputName;
            if (!name) return ui.notifications.error("Please enter a name for the new profile.");
        } else {
            name = inputName || selectedProfile;
            if (name !== selectedProfile && profiles[selectedProfile]) delete profiles[selectedProfile];
        }
        if (name === "Default") return ui.notifications.error("You cannot overwrite the factory 'Default' profile. Please choose another name.");

        const settingsKeys = [
            "storeName", "priceModifier", "allowedTiers", "hiddenCategories",
            "customCompendiums", "priceOverrides", "saleDiscount", "saleItems",
            "hiddenItems", "blockedSaleItems", "blockedPurchaseItems", "lockedItems",
            "epicItems", "epicIcon", "epicColor", "epicLabel", "epicEffect",
            "partyActorId", "customTabName", "customTabCompendiums", "customTabTierGroup",
            "useDefaultCompendiums", "sellRatio", "stockEnabled", "showStockQuantity", "randomizerSettings"
        ];
        const currentSettings = {};
        for (const key of settingsKeys) currentSettings[key] = game.settings.get(MODULE_ID, key);

        profiles[name] = currentSettings;
        await game.settings.set(MODULE_ID, "storeProfiles", profiles);
        await game.settings.set(MODULE_ID, "currentProfile", name);
        this.render();
    }

    async _onLoadPreset(event, target) {
        const selectEl = this.element.querySelector(".preset-select");
        if (!selectEl) return;
        const profileName = selectEl.value;

        const confirm = await showStoreDialog({
            title: "Load Profile", icon: "fas fa-folder-open",
            headerText: "Load Profile", headerColor: "#D4AF37",
            message: `Are you sure you want to load the profile <b>"${profileName}"</b>?`,
            description: "This will overwrite current store settings."
        });
        if (!confirm) return;

        let profileData;
        if (profileName === "Default") {
            profileData = {
                storeName: "Daggerheart: Store", priceModifier: 100,
                allowedTiers: {}, hiddenCategories: {}, customCompendiums: [],
                priceOverrides: {}, saleDiscount: 10, saleItems: {},
                hiddenItems: {}, blockedSaleItems: {}, blockedPurchaseItems: {},
                lockedItems: {}, epicItems: {}, epicIcon: "fa-star",
                epicColor: "#9b59b6", epicLabel: "Epic", epicEffect: "shine",
                partyActorId: "", customTabName: "General",
                customTabCompendiums: ["daggerheart-store.general-items"],
                customTabTierGroup: true, useDefaultCompendiums: true,
                sellRatio: 0.5, stockEnabled: false, showStockQuantity: true,
                randomizerSettings: {}
            };
        } else {
            const profiles = game.settings.get(MODULE_ID, "storeProfiles");
            profileData = profiles[profileName];
            if (!profileData) return ui.notifications.error(`Profile "${profileName}" not found.`);
        }

        const settingsToUpdate = [
            "storeName", "priceModifier", "allowedTiers", "hiddenCategories",
            "customCompendiums", "priceOverrides", "saleDiscount", "saleItems",
            "hiddenItems", "blockedSaleItems", "blockedPurchaseItems", "lockedItems",
            "epicItems", "epicIcon", "epicColor", "epicLabel", "epicEffect",
            "partyActorId", "customTabName", "customTabCompendiums", "customTabTierGroup",
            "useDefaultCompendiums", "sellRatio", "stockEnabled", "showStockQuantity", "randomizerSettings"
        ];

        // Migrate old profile format
        if (!profileData.customTabCompendiums && profileData.customTabCompendium) {
            profileData.customTabCompendiums = [profileData.customTabCompendium];
        }

        for (const key of settingsToUpdate) {
            if (profileData.hasOwnProperty(key)) await game.settings.set(MODULE_ID, key, profileData[key]);
        }
        await game.settings.set(MODULE_ID, "currentProfile", profileName);
        this.render();
    }

    async _onDeletePreset(event, target) {
        const selectEl = this.element.querySelector(".preset-select");
        if (!selectEl) return;
        const profileName = selectEl.value;
        if (profileName === "Default") return ui.notifications.warn("You cannot delete the Default profile.");

        const confirm = await showStoreDialog({
            title: "Delete Profile", icon: "fas fa-trash",
            headerText: "Delete Profile", headerColor: "#D32F2F",
            message: `Are you sure you want to delete the profile <b>"${profileName}"</b>?`,
            description: "This action cannot be undone."
        });
        if (!confirm) return;

        const profiles = foundry.utils.deepClone(game.settings.get(MODULE_ID, "storeProfiles"));
        if (profiles[profileName]) {
            delete profiles[profileName];
            await game.settings.set(MODULE_ID, "storeProfiles", profiles);
            await game.settings.set(MODULE_ID, "currentProfile", "Default");
            this.render();
        }
    }

    // --- Per-Item Toggle Actions ---

    async _onPriceOverrideChange(event) {
        event.preventDefault(); const input = event.currentTarget; const itemName = input.dataset.name; const newPrice = parseInt(input.value);
        const overrides = foundry.utils.deepClone(game.settings.get(MODULE_ID, "priceOverrides"));
        if (isNaN(newPrice) || newPrice < 0) { delete overrides[itemName]; } else { overrides[itemName] = newPrice; }
        await game.settings.set(MODULE_ID, "priceOverrides", overrides);
    }
    async _onResetPrice(event, target) {
        const itemName = target.dataset.name; const overrides = foundry.utils.deepClone(game.settings.get(MODULE_ID, "priceOverrides"));
        if (overrides.hasOwnProperty(itemName)) { delete overrides[itemName]; await game.settings.set(MODULE_ID, "priceOverrides", overrides); }
    }
    async _onToggleSale(event, target) {
        const itemName = target.dataset.name; const saleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "saleItems"));
        if (saleItems[itemName]) { delete saleItems[itemName]; } else { saleItems[itemName] = true; }
        await game.settings.set(MODULE_ID, "saleItems", saleItems); this.render();
    }
    async _onToggleHidden(event, target) {
        const itemName = target.dataset.name; const hiddenItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "hiddenItems"));
        if (hiddenItems[itemName]) { delete hiddenItems[itemName]; } else { hiddenItems[itemName] = true; }
        await game.settings.set(MODULE_ID, "hiddenItems", hiddenItems); this.render();
    }
    async _onToggleBlockSale(event, target) {
        const itemName = target.dataset.name; const blockedSaleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "blockedSaleItems"));
        if (blockedSaleItems[itemName]) { delete blockedSaleItems[itemName]; } else { blockedSaleItems[itemName] = true; }
        await game.settings.set(MODULE_ID, "blockedSaleItems", blockedSaleItems); this.render();
    }
    async _onToggleBlockPurchase(event, target) {
        const itemName = target.dataset.name; const blockedPurchaseItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "blockedPurchaseItems"));
        if (blockedPurchaseItems[itemName]) { delete blockedPurchaseItems[itemName]; } else { blockedPurchaseItems[itemName] = true; }
        await game.settings.set(MODULE_ID, "blockedPurchaseItems", blockedPurchaseItems); this.render();
    }
    async _onToggleLock(event, target) {
        const itemName = target.dataset.name; const lockedItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lockedItems"));
        if (lockedItems[itemName]) { delete lockedItems[itemName]; } else { lockedItems[itemName] = true; }
        await game.settings.set(MODULE_ID, "lockedItems", lockedItems); this.render();
    }
    async _onToggleEpic(event, target) {
        const itemName = target.dataset.name; const epicItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "epicItems"));
        if (epicItems[itemName]) { delete epicItems[itemName]; } else { epicItems[itemName] = true; }
        await game.settings.set(MODULE_ID, "epicItems", epicItems); this.render();
    }

    // --- Bulk Actions ---

    async _getCurrentTabItemNames() {
        const itemNames = [];
        const rows = this.element.querySelectorAll(`.tab[data-tab="${this.activeTab}"] .store-row`);
        rows.forEach(row => { const btn = row.querySelector("[data-name]"); if (btn) itemNames.push(btn.dataset.name); });
        return itemNames;
    }

    async _onMarkAllOnSale(event, target) {
        const itemNames = await this._getCurrentTabItemNames(); const saleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "saleItems"));
        itemNames.forEach(name => saleItems[name] = true); await game.settings.set(MODULE_ID, "saleItems", saleItems);
    }
    async _onRemoveAllFromSale(event, target) {
        const itemNames = await this._getCurrentTabItemNames(); const saleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "saleItems"));
        itemNames.forEach(name => delete saleItems[name]); await game.settings.set(MODULE_ID, "saleItems", saleItems);
    }
    async _onShowAllItems(event, target) {
        const itemNames = await this._getCurrentTabItemNames(); const hiddenItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "hiddenItems"));
        itemNames.forEach(name => delete hiddenItems[name]); await game.settings.set(MODULE_ID, "hiddenItems", hiddenItems);
    }
    async _onHideAllItems(event, target) {
        const itemNames = await this._getCurrentTabItemNames(); const hiddenItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "hiddenItems"));
        itemNames.forEach(name => hiddenItems[name] = true); await game.settings.set(MODULE_ID, "hiddenItems", hiddenItems);
    }
    async _onMakeAllPurchasable(event, target) {
        const itemNames = await this._getCurrentTabItemNames(); const blockedPurchaseItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "blockedPurchaseItems"));
        itemNames.forEach(name => delete blockedPurchaseItems[name]); await game.settings.set(MODULE_ID, "blockedPurchaseItems", blockedPurchaseItems);
    }
    async _onDisableAllPurchase(event, target) {
        const itemNames = await this._getCurrentTabItemNames(); const blockedPurchaseItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "blockedPurchaseItems"));
        itemNames.forEach(name => blockedPurchaseItems[name] = true); await game.settings.set(MODULE_ID, "blockedPurchaseItems", blockedPurchaseItems);
    }
    async _onMakeAllSellable(event, target) {
        const itemNames = await this._getCurrentTabItemNames(); const blockedSaleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "blockedSaleItems"));
        itemNames.forEach(name => delete blockedSaleItems[name]); await game.settings.set(MODULE_ID, "blockedSaleItems", blockedSaleItems);
    }
    async _onDisableAllSale(event, target) {
        const itemNames = await this._getCurrentTabItemNames(); const blockedSaleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "blockedSaleItems"));
        itemNames.forEach(name => blockedSaleItems[name] = true); await game.settings.set(MODULE_ID, "blockedSaleItems", blockedSaleItems);
    }
    async _onLockAllItems(event, target) {
        const itemNames = await this._getCurrentTabItemNames(); const lockedItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lockedItems"));
        itemNames.forEach(name => lockedItems[name] = true); await game.settings.set(MODULE_ID, "lockedItems", lockedItems);
    }
    async _onUnlockAllItems(event, target) {
        const itemNames = await this._getCurrentTabItemNames(); const lockedItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lockedItems"));
        itemNames.forEach(name => delete lockedItems[name]); await game.settings.set(MODULE_ID, "lockedItems", lockedItems);
    }

    /**
     * Resets all price overrides across every tab, reverting items to their base prices.
     * Triggered by the "Reset All Prices" bulk-action button via AppV2 data-action binding.
     * @param {PointerEvent} event - The originating click event
     * @param {HTMLElement} target - The button element that was clicked
     * @returns {Promise<void>}
     */
    async _onResetAllPrices(event, target) {
        try {
            await game.settings.set(MODULE_ID, "priceOverrides", {});
        } catch (err) {
            console.error(`${MODULE_ID} | Failed to reset all prices`, err);
            ui.notifications.error("Failed to reset all prices.");
        }
    }
}
