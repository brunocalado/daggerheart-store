import { PRICE_DATA, PACK_MAPPING } from "./price-data.js";
import { StockManager } from "./stock-manager.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const MODULE_ID = "daggerheart-store";

// Helper: Standard Categories Definition
const STANDARD_CATEGORIES = [
    { id: "primary", label: "Primary Weapons", key: "Primary Weapons" },
    { id: "secondary", label: "Secondary Weapons", key: "Secondary Weapons" },
    { id: "wheelchairs", label: "Wheelchairs", key: "Wheelchairs" },
    { id: "armors", label: "Armor", key: "Armors" },
    { id: "potions", label: "Potions", key: "Potions" },
    { id: "consumables", label: "Consumables", key: "Consumables" },
    { id: "loot", label: "Loot", key: "Loot" }
];

// Mapping of category keys to expected item types for filtering custom compendiums
const CATEGORY_ITEM_TYPE = {
    "Primary Weapons": "weapon",
    "Secondary Weapons": "weapon",
    "Wheelchairs": "weapon",
    "Armors": "armor",
    "Potions": "consumable",
    "Consumables": "consumable",
    "Loot": "loot"
};

// Valid item types for store display
const VALID_ITEM_TYPES = ["weapon", "armor", "consumable", "loot"];

/**
 * Converts a hex color to a very subtle background tint (10% opacity over #e8e8e8 base)
 * @param {string} hex - Hex color string (e.g., "#9b59b6")
 * @returns {string} Blended hex color for subtle background
 */
function getEpicTextColor(hex) {
    const darkBgColors = ["#9b59b6", "#e91e63", "#e74c3c", "#3498db"];
    return darkBgColors.includes(hex.toLowerCase()) ? "#e8e8e8" : "#000";
}

function getEpicBgColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const base = 0xe8;
    const mix = 0.12;
    const br = Math.round(base * (1 - mix) + r * mix);
    const bg = Math.round(base * (1 - mix) + g * mix);
    const bb = Math.round(base * (1 - mix) + b * mix);
    return `#${br.toString(16).padStart(2, "0")}${bg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`;
}

// System compendiums to exclude from custom compendium selection (already used by default)
const EXCLUDED_SYSTEM_PACKS = [
    "daggerheart.classes",
    "daggerheart.subclasses",
    "daggerheart.domains",
    "daggerheart.ancestries",
    "daggerheart.communities",
    "daggerheart.weapons",
    "daggerheart.armors",
    "daggerheart.consumables",
    "daggerheart.loot",
    "daggerheart.beastforms"
];

/**
 * Helper to determine item tier from system.tier or {{{tierX}}} tag in description
 * @param {Object} item - The item document
 * @returns {number} Tier value (1-4), defaults to 1
 */
function getItemTier(item) {
    // First try system.tier (works for weapons and armors)
    const sysTier = foundry.utils.getProperty(item, "system.tier");
    const parsedSysTier = parseInt(sysTier);
    if (parsedSysTier >= 1 && parsedSysTier <= 4) {
        return parsedSysTier;
    }

    // For loot/consumables/potions, check for {{{tierX}}} tag in description
    const desc = foundry.utils.getProperty(item, "system.description") || "";
    const tierMatch = desc.match(/\{\{\{tier([1-4])\}\}\}/i);
    if (tierMatch) {
        return parseInt(tierMatch[1]);
    }

    // Default to tier 1
    return 1;
}

/**
 * Helper to get Currency Name from System Settings
 */
function getSystemCurrency() {
    try {
        const homebrewSettings = game.settings.get(CONFIG.DH.id, CONFIG.DH.SETTINGS.gameSettings.Homebrew);
        return homebrewSettings?.currency?.coins?.label || "Coins";
    } catch (e) {
        console.warn(`${MODULE_ID} | Could not fetch system currency name, falling back to 'Coins'.`, e);
        return "Coins";
    }
}

/**
 * Helper to get Whisper recipients based on privacy settings
 */
function getChatWhisperRecipients() {
    const privacy = game.settings.get(MODULE_ID, "chatPrivacy");
    if (privacy === "private") {
        const recipients = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
        if (!recipients.includes(game.user.id)) recipients.push(game.user.id);
        return recipients;
    }
    return null;
}

/**
 * Helper to show styled confirmation dialogs
 * @param {Object} options - Dialog options
 * @param {string} options.title - Window title
 * @param {string} [options.icon] - Window icon class (e.g., "fas fa-save")
 * @param {string} options.headerText - Header text displayed in the dialog
 * @param {string} options.headerColor - Color for the header (default: #D4AF37 gold)
 * @param {string} options.message - Main message (supports HTML)
 * @param {string} options.description - Secondary description text
 * @param {Object} [options.input] - Optional input field configuration
 * @param {string} [options.input.name] - Input field name
 * @param {string} [options.input.label] - Input field label
 * @param {string} [options.input.defaultValue] - Default value
 * @param {string} [options.input.placeholder] - Placeholder text
 * @param {string} [options.input.notes] - Notes below the input
 * @param {Object} [options.buttons] - Custom button configuration
 * @param {string} [options.buttons.confirm] - Confirm button label
 * @param {string} [options.buttons.confirmIcon] - Confirm button icon
 * @returns {Promise<boolean|Object>} - Returns boolean for confirm, or object with input values
 */
async function showStoreDialog(options) {
    const {
        title,
        icon = "fas fa-check",
        headerText,
        headerColor = "#D4AF37",
        message,
        description,
        input,
        buttons = {},
        customContent = null
    } = options;

    // Build the content HTML
    let contentHtml = `<div class="store-dialog-content">`;

    if (headerText) {
        contentHtml += `<h3 class="store-dialog-header" style="color: ${headerColor};">${headerText}</h3>`;
    }

    if (message) {
        contentHtml += `<p class="store-dialog-message">${message}</p>`;
    }

    if (description) {
        contentHtml += `<p class="store-dialog-description">${description}</p>`;
    }

    contentHtml += `</div>`;

    // If there's an input field, add it
    if (input) {
        contentHtml += `
            <div class="store-dialog-input-group">
                <label>${input.label || "Value:"}</label>
                <input type="${input.type || "text"}" name="${input.name}" value="${input.defaultValue || ""}"
                       placeholder="${input.placeholder || ""}">
                ${input.notes ? `<p class="store-dialog-notes">${input.notes}</p>` : ""}
            </div>
        `;
    }

    // If there's custom content, add it
    if (customContent) {
        contentHtml += customContent;
    }

    // If input or custom content exists, use DialogV2 with custom buttons
    if (input || customContent) {
        return new Promise((resolve) => {
            new DialogV2({
                window: { title, icon },
                content: contentHtml,
                classes: ["store-dialog"],
                modal: true,
                buttons: [
                    {
                        action: "confirm",
                        label: buttons.confirm || "Confirm",
                        icon: buttons.confirmIcon || "fas fa-check",
                        callback: (event, button, dialog) => {
                            const result = { confirmed: true };
                            if (input) {
                                result.value = button.form.elements[input.name]?.value;
                            }
                            // Collect all form data for custom content
                            if (customContent && button.form) {
                                result.formData = {};
                                const formData = new FormData(button.form);
                                for (const [key, value] of formData.entries()) {
                                    result.formData[key] = value;
                                }
                            }
                            resolve(result);
                        }
                    },
                    {
                        action: "cancel",
                        label: buttons.cancel || "Cancel",
                        icon: "fas fa-times",
                        callback: () => resolve({ confirmed: false, value: null })
                    }
                ],
                close: () => resolve({ confirmed: false, value: null }),
                render: options.onRender || null
            }).render(true);
        });
    }

    // Simple confirmation dialog
    return DialogV2.confirm({
        window: { title, icon },
        content: contentHtml,
        classes: ["store-dialog"],
        rejectClose: false,
        modal: true
    });
}

/**
 * Main Store Application (Application V2)
 */
export class DaggerheartStore extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options) {
        super(options);
        this.searchQuery = "";
        this.activeTab = "primary"; // IMPORTANT: This is the source of truth for the active tab
        this.options.window.title = game.settings.get(MODULE_ID, "storeName");

        // Listen for actor item updates to refresh compare buttons
        this._onActorItemUpdate = (item, changes, _options, _userId) => {
            if (!game.user.character) return;
            if (item.parent?.id !== game.user.character.id) return;
            // Only re-render if equipped status changed
            if (changes?.system?.equipped !== undefined) {
                this.render();
            }
        };
        Hooks.on("updateItem", this._onActorItemUpdate);
    }

    _onClose(options) {
        // Remove the hook listener when the store is closed
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
        position: { width: 950, height: 700 }, // Increased width slightly for weapon stats
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
            showToAll: DaggerheartStore.prototype._onShowToAll,
            showToPlayer: DaggerheartStore.prototype._onShowToPlayer,
            savePreset: DaggerheartStore.prototype._onSavePreset,
            loadPreset: DaggerheartStore.prototype._onLoadPreset,
            deletePreset: DaggerheartStore.prototype._onDeletePreset,
            transferFunds: DaggerheartStore.prototype._onTransferFunds,
            toggleEpic: DaggerheartStore.prototype._onToggleEpic
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
        const defaultColor = "#C9A060"; // Gold

        if (style !== "colored") return defaultColor;

        switch (type) {
            case "buy": return "#c0392b";      // Red
            case "sell": return "#27ae60";     // Green
            case "party": return "#2980b9";    // Blue
            case "transfer": return "#8e44ad"; // Purple
            default: return defaultColor;
        }
    }

    async render(options, _options) {
        // Only trigger automatic conversion if the mode is set to "update_all"
        const currencyMode = game.settings.get(MODULE_ID, "currencyMode");
        
        if (currencyMode === "update_all" && !game.user.isGM && game.user.character) {
             await this._handleCurrencyConversion(game.user.character);
        }
        return super.render(options, _options);
    }

    /**
     * Helper: Calculates total wealth in coins (Smart Mode)
     */
    _calculateTotalWealth(actor) {
        const gold = actor.system.gold || {};
        const handfuls = gold.handfuls || 0;
        const bags = gold.bags || 0;
        const chests = gold.chests || 0;
        const coins = gold.coins || 0;

        return (chests * 1000) + (bags * 100) + (handfuls * 10) + coins;
    }

    /**
     * Helper: Optimizes currency into Chests > Bags > Handfuls > Coins (Smart Mode)
     */
    _optimizeCurrency(totalCoins) {
        let remainder = totalCoins;

        const chests = Math.floor(remainder / 1000);
        remainder %= 1000;

        const bags = Math.floor(remainder / 100);
        remainder %= 100;

        const handfuls = Math.floor(remainder / 10);
        remainder %= 10;

        const coins = remainder;

        return { chests, bags, handfuls, coins };
    }

    /**
     * Generates the weapon summary string based on updated rules.
     */
    _getWeaponSummary(doc) {
        try {
            if (doc.type !== "weapon") return "";
            
            const system = doc.system;
            if (!system.attack) return "";

            // 1. Weapon Trait
            const traitRaw = String(system.attack.roll?.trait || "");
            const weaponTrait = traitRaw.length >= 3 ? traitRaw.substring(0, 3).toUpperCase() : traitRaw.toUpperCase();

            // 2. Weapon Range
            const rangeRaw = system.attack.range || "";
            const rangeMap = {
                "melee": "Melee",
                "veryClose": "Very Close",
                "close": "Close",
                "far": "Far",
                "veryFar": "Very Far"
            };
            const weaponRange = rangeMap[rangeRaw] || (rangeRaw ? String(rangeRaw).charAt(0).toUpperCase() + String(rangeRaw).slice(1) : "");

            // 3. Damage Processing
            const part0 = system.attack.damage?.parts?.[0] || {};
            const val = part0.value || {};
            const weaponCustom = val.custom?.enabled === true;
            let damageSection = "";

            if (weaponCustom) {
                const formula = val.custom?.formula || "C";
                const typeRaw = part0.type;
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
                const damageType = typesList
                    .map(t => {
                        const s = String(t || "").trim();
                        if (!s) return "";
                        return s.length >= 3 ? s.substring(0, 3).toUpperCase() : s.toUpperCase();
                    })
                    .filter(t => t)
                    .join("/");
                damageSection = damageType ? `${formula}(${damageType})` : formula;
            } else {
                const weaponDamage = val.dice || ""; 
                const typeRaw = part0.type;
                let damageType = "";
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

                damageType = typesList
                    .map(t => {
                        const s = String(t || "").trim();
                        if (!s) return "";
                        return s.length >= 3 ? s.substring(0, 3).toUpperCase() : s.toUpperCase();
                    })
                    .filter(t => t) 
                    .join("/");
                
                const bonusVal = val.bonus;
                let weaponBonus = "";
                if (bonusVal !== null && bonusVal !== undefined && String(bonusVal).trim() !== "") {
                    weaponBonus = `+${bonusVal}`;
                }

                damageSection = `${weaponDamage}${weaponBonus}`;
                if (damageType) {
                    damageSection += `(${damageType})`;
                }
            }

            // 4. Burden
            const burdenRaw = String(system.burden || "");
            const burdenMap = {
                "1": "One-Handed",
                "2": "Two-Handed",
                "oneHanded": "One-Handed",
                "twoHanded": "Two-Handed"
            };
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
                return actor.items.find(x =>
                    x.type === "weapon" &&
                    x.system.equipped &&
                    !x.system.secondary &&
                    !x.name.includes("Wheelchair")
                );
            case "secondary":
                return actor.items.find(x =>
                    x.type === "weapon" &&
                    x.system.equipped &&
                    x.system.secondary &&
                    !x.name.includes("Wheelchair")
                );
            case "wheelchairs":
                // Wheelchairs compare with primary weapon (non-secondary)
                return actor.items.find(x =>
                    x.type === "weapon" &&
                    x.system.equipped &&
                    !x.system.secondary
                );
            case "armors":
                return actor.items.find(x =>
                    x.type === "armor" &&
                    x.system.equipped
                );
            default:
                return null;
        }
    }

    /**
     * Cleans HTML and price tags from a description.
     * @param {string} html - The raw HTML description
     * @returns {string}
     */
    _cleanDescription(html) {
        if (!html) return "";
        return String(html)
            .replace(/\{\{\{[^}]+\}\}\}/g, '')
            .replace(/<[^>]*>/g, '')
            .trim()
            .substring(0, 200);
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

            // Trait mapping (full names for comparison tooltip)
            const traitMap = {
                "agility": "Agility",
                "strength": "Strength",
                "finesse": "Finesse",
                "instinct": "Instinct",
                "presence": "Presence",
                "knowledge": "Knowledge",
                "agi": "Agility",
                "str": "Strength",
                "fin": "Finesse",
                "ins": "Instinct",
                "pre": "Presence",
                "kno": "Knowledge"
            };
            const traitRaw = String(system.attack.roll?.trait || "").toLowerCase();
            const trait = traitMap[traitRaw] || (traitRaw ? traitRaw.charAt(0).toUpperCase() + traitRaw.slice(1) : "");

            // Range
            const rangeRaw = system.attack.range || "";
            const rangeMap = {
                "melee": "Melee",
                "veryClose": "Very Close",
                "close": "Close",
                "far": "Far",
                "veryFar": "Very Far"
            };
            const range = rangeMap[rangeRaw] || (rangeRaw ? String(rangeRaw).charAt(0).toUpperCase() + String(rangeRaw).slice(1) : "");

            // Damage type mapping (full names)
            const damageTypeMap = {
                "physical": "Physical",
                "phy": "Physical",
                "magic": "Magic",
                "mag": "Magic"
            };

            // Damage
            const part0 = system.attack.damage?.parts?.[0] || {};
            const val = part0.value || {};
            const isCustom = val.custom?.enabled === true;
            let damageDisplay = "";
            let damageType = "";

            if (isCustom) {
                damageDisplay = "Custom";
            } else {
                const weaponDamage = val.dice || "";
                const typeRaw = part0.type;
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

                damageType = typesList
                    .map(t => {
                        const s = String(t || "").trim().toLowerCase();
                        if (!s) return "";
                        return damageTypeMap[s] || (s.charAt(0).toUpperCase() + s.slice(1));
                    })
                    .filter(t => t)
                    .join("/");

                const bonusVal = val.bonus;
                let weaponBonus = "";
                if (bonusVal !== null && bonusVal !== undefined && String(bonusVal).trim() !== "") {
                    weaponBonus = `+${bonusVal}`;
                }

                damageDisplay = `${weaponDamage}${weaponBonus}`;
                if (damageType) {
                    damageDisplay += ` (${damageType})`;
                }
            }

            // Direct damage
            const isDirect = system.attack.damage?.direct === true;

            // Burden
            const burdenRaw = String(system.burden || "");
            const burdenMap = {
                "1": "One-Handed",
                "2": "Two-Handed",
                "oneHanded": "One-Handed",
                "twoHanded": "Two-Handed"
            };
            const burden = burdenMap[burdenRaw] || burdenRaw;

            // Weapon Features
            const features = [];
            const weaponFeatures = system.weaponFeatures || [];
            for (const feature of weaponFeatures) {
                const featureValue = feature.value;
                if (featureValue) {
                    try {
                        const featureName = featureValue.charAt(0).toUpperCase() + featureValue.slice(1);
                        const featureDesc = game.i18n.localize(`${CONFIG.DH.ITEM.weaponFeatures[featureValue]?.description}`) || "";
                        if (featureDesc) {
                            features.push({ name: featureName, description: featureDesc });
                        }
                    } catch (e) {
                        // Feature not found in config, skip
                    }
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

            // Armor Features
            const features = [];
            const armorFeatures = system.armorFeatures || [];
            for (const feature of armorFeatures) {
                const featureValue = feature.value;
                if (featureValue) {
                    try {
                        const featureName = featureValue.charAt(0).toUpperCase() + featureValue.slice(1);
                        const featureDesc = game.i18n.localize(`${CONFIG.DH.ITEM.armorFeatures[featureValue]?.description}`) || "";
                        if (featureDesc) {
                            features.push({ name: featureName, description: featureDesc });
                        }
                    } catch (e) {
                        // Feature not found in config, skip
                    }
                }
            }

            return {
                baseScore: system.baseScore ?? 0,
                thresholdMajor: system.baseThresholds?.major ?? 0,
                thresholdSevere: system.baseThresholds?.severe ?? 0,
                features: features
            };
        } catch (err) {
            console.error(`${MODULE_ID} | Error extracting armor stats:`, err);
            return { baseScore: 0, thresholdMajor: 0, thresholdSevere: 0, features: [] };
        }
    }

    /**
     * Formats an item for comparison display.
     * @param {Item} item - The item to format
     * @returns {Object}
     */
    _formatItemForComparison(item) {
        if (!item) return null;

        const isWeapon = item.type === "weapon";
        const desc = foundry.utils.getProperty(item, "system.description.value") ||
                     foundry.utils.getProperty(item, "system.description") || "";
        const cleanedDescription = this._cleanDescription(desc);
        const tier = getItemTier(item);

        const base = {
            name: item.name,
            img: item.img,
            tier: tier,
            description: cleanedDescription,
            isWeapon: isWeapon
        };

        if (isWeapon) {
            const weaponStats = this._extractWeaponStats(item);
            return { ...base, ...weaponStats };
        } else {
            const armorStats = this._extractArmorStats(item);
            return { ...base, ...armorStats };
        }
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

        // Add comparison indicators if there's an equipped item
        if (equipped && storeItem) {
            this._addComparisonIndicators(equipped, storeItem);
        }

        return {
            equipped: equipped,
            storeItem: storeItem,
            hasEquipped: !!equippedItem
        };
    }

    /**
     * Adds comparison indicators (up/down arrows, colors) to the store item.
     * @param {Object} equipped - The equipped item data
     * @param {Object} storeItem - The store item data
     */
    _addComparisonIndicators(equipped, storeItem) {
        // Range order for weapons (lower index = shorter range)
        const rangeOrder = ["Melee", "Very Close", "Close", "Far", "Very Far"];

        if (storeItem.isWeapon && equipped.isWeapon) {
            // Compare range
            const equippedRangeIdx = rangeOrder.indexOf(equipped.range);
            const storeRangeIdx = rangeOrder.indexOf(storeItem.range);
            if (equippedRangeIdx !== -1 && storeRangeIdx !== -1) {
                if (storeRangeIdx > equippedRangeIdx) {
                    storeItem.rangeCompare = "up"; // Longer range is better
                } else if (storeRangeIdx < equippedRangeIdx) {
                    storeItem.rangeCompare = "down";
                }
            }

            // Compare damage (parse dice and bonus)
            const equippedDamage = this._parseDamageValue(equipped.damageDisplay);
            const storeDamage = this._parseDamageValue(storeItem.damageDisplay);
            if (equippedDamage !== null && storeDamage !== null) {
                if (storeDamage > equippedDamage) {
                    storeItem.damageCompare = "up";
                } else if (storeDamage < equippedDamage) {
                    storeItem.damageCompare = "down";
                }
            }

            // Check for lost features (keep full object with name and description)
            if (equipped.features && equipped.features.length > 0) {
                const storeFeatureNames = (storeItem.features || []).map(f => f.name.toLowerCase());
                storeItem.lostFeatures = equipped.features
                    .filter(f => !storeFeatureNames.includes(f.name.toLowerCase()));
            }

            // Mark gained features on storeItem.features
            if (storeItem.features && storeItem.features.length > 0) {
                const equippedFeatureNames = (equipped.features || []).map(f => f.name.toLowerCase());
                storeItem.features.forEach(f => {
                    f.isGained = !equippedFeatureNames.includes(f.name.toLowerCase());
                });
            }
        } else if (!storeItem.isWeapon && !equipped.isWeapon) {
            // Armor comparison
            // Compare base score (higher is better)
            if (storeItem.baseScore > equipped.baseScore) {
                storeItem.baseScoreCompare = "up";
            } else if (storeItem.baseScore < equipped.baseScore) {
                storeItem.baseScoreCompare = "down";
            }

            // Compare thresholds (higher is better for armor)
            if (storeItem.thresholdMajor > equipped.thresholdMajor) {
                storeItem.thresholdMajorCompare = "up";
            } else if (storeItem.thresholdMajor < equipped.thresholdMajor) {
                storeItem.thresholdMajorCompare = "down";
            }

            if (storeItem.thresholdSevere > equipped.thresholdSevere) {
                storeItem.thresholdSevereCompare = "up";
            } else if (storeItem.thresholdSevere < equipped.thresholdSevere) {
                storeItem.thresholdSevereCompare = "down";
            }

            // Check for lost features (keep full object with name and description)
            if (equipped.features && equipped.features.length > 0) {
                const storeFeatureNames = (storeItem.features || []).map(f => f.name.toLowerCase());
                storeItem.lostFeatures = equipped.features
                    .filter(f => !storeFeatureNames.includes(f.name.toLowerCase()));
            }

            // Mark gained features on storeItem.features
            if (storeItem.features && storeItem.features.length > 0) {
                const equippedFeatureNames = (equipped.features || []).map(f => f.name.toLowerCase());
                storeItem.features.forEach(f => {
                    f.isGained = !equippedFeatureNames.includes(f.name.toLowerCase());
                });
            }
        }
    }

    /**
     * Parses a damage display string and returns a comparable numeric value.
     * E.g., "d10+7" -> 12.5 (average of d10 is 5.5, plus 7)
     * @param {string} damageStr - The damage string
     * @returns {number|null}
     */
    _parseDamageValue(damageStr) {
        if (!damageStr || damageStr === "Custom") return null;

        // Remove damage type suffix like "(Physical)"
        const cleanStr = damageStr.replace(/\s*\([^)]*\)\s*$/, "").trim();

        // Match patterns like "d10", "d10+5", "2d6+3"
        const match = cleanStr.match(/^(\d*)d(\d+)(?:\+(\d+))?$/i);
        if (!match) return null;

        const numDice = parseInt(match[1]) || 1;
        const dieSize = parseInt(match[2]);
        const bonus = parseInt(match[3]) || 0;

        // Calculate average damage
        const avgPerDie = (dieSize + 1) / 2;
        return numDice * avgPerDie + bonus;
    }

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
            "system.gold.handfuls": 0,
            "system.gold.bags": 0,
            "system.gold.chests": 0,
            "system.gold.coins": newCoins
        });

        // Use standard Gold for conversion messages (neutral system event)
        const borderColor = "#C9A060"; 

        const messageContent = `
            <div class="chat-card" style="border: 2px solid ${borderColor}; border-radius: 8px; overflow: hidden;">
                <header class="card-header flexrow" style="background: #191919 !important; padding: 8px; border-bottom: 2px solid ${borderColor};">
                    <h3 class="noborder" style="margin: 0; font-weight: bold; color: ${borderColor} !important; font-family: 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%;">
                        Currency Exchange
                    </h3>
                </header>
                <div class="card-content" style="background: #2a2a2a; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #eee;">
                    <p style="margin-bottom: 10px; font-family: 'Lato', sans-serif;">
                        <strong>${actor.name}</strong> automatically exchanged treasures for coins.
                    </p>
                    <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.9em; color: #ccc; text-align: left; display: inline-block;">
                        ${handfuls > 0 ? `<li><i class="fas fa-hand-holding-usd"></i> ${handfuls} Handfuls → ${coinsFromHandfuls} Coins</li>` : ""}
                        ${bags > 0 ? `<li><i class="fas fa-sack-dollar"></i> ${bags} Bags → ${coinsFromBags} Coins</li>` : ""}
                        ${chests > 0 ? `<li><i class="fas fa-box-open"></i> ${chests} Chests → ${coinsFromChests} Coins</li>` : ""}
                    </ul>
                    <hr style="border-color: #444; width: 100%; margin: 15px 0;">
                    <p style="font-size: 1.2em; color: #d4af37; margin: 0;">
                        <strong>+${totalAdded} Coins</strong>
                    </p>
                    <p style="font-size: 0.8em; color: #888; margin-top: 5px;">
                        New Balance: ${newCoins}
                    </p>
                </div>
            </div>
        `;

        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor }),
            content: messageContent,
            sound: "sounds/dice.wav"
        };

        const whisperTo = getChatWhisperRecipients();
        if (whisperTo) {
            chatData.whisper = whisperTo;
        }

        await ChatMessage.create(chatData);
    }

    async _prepareContext(options) {
        this.options.window.title = game.settings.get(MODULE_ID, "storeName");
        const currencyMode = game.settings.get(MODULE_ID, "currencyMode");

        const userActor = game.user.character;
        const isGM = game.user.isGM;
        const hasActor = !!userActor;
        
        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        let partyActor = null;
        if (partyActorId) partyActor = game.actors.get(partyActorId);

        // For players, only enable party features if the party actor has "All Players Owner" permission
        let hasPartyActor = !!partyActor;
        if (hasPartyActor && !isGM) {
            const defaultOwnership = partyActor.ownership?.default ?? 0;
            hasPartyActor = defaultOwnership >= 3; // 3 = Owner
        }

        let userGold = 0;
        let partyGold = 0;

        // CALCULATE GOLD BASED ON MODE
        if (userActor) {
            if (currencyMode === "smart") {
                userGold = this._calculateTotalWealth(userActor);
            } else {
                userGold = foundry.utils.getProperty(userActor, "system.gold.coins") || 0;
            }
        }

        if (partyActor) {
            if (currencyMode === "smart") {
                partyGold = this._calculateTotalWealth(partyActor);
            } else {
                partyGold = foundry.utils.getProperty(partyActor, "system.gold.coins") || 0;
            }
        }
        
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
            isGM: isGM,
            hasActor: hasActor,
            actorName: userActor ? userActor.name : "None",
            currency: currencyName,
            hasPartyActor: hasPartyActor,
            userGold: userGold,
            partyGold: partyGold,
            tabs: {},
            categories: [],
            searchQuery: this.searchQuery,
            activeTab: this.activeTab, 
            presets: profileKeys,
            currentProfile: currentProfile,
            epicIcon: game.settings.get(MODULE_ID, "epicIcon")
        };

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

        // Stock System Validation & Setup (requires Party Actor to be configured)
        const stockEnabled = game.settings.get(MODULE_ID, "stockEnabled") && hasPartyActor;
        const showStockQuantity = game.settings.get(MODULE_ID, "showStockQuantity");

        let categories = foundry.utils.deepClone(STANDARD_CATEGORIES);

        const customTabCompendiums = game.settings.get(MODULE_ID, "customTabCompendiums") || [];
        const customTabName = game.settings.get(MODULE_ID, "customTabName");
        const customTabTierGroup = game.settings.get(MODULE_ID, "customTabTierGroup");

        const hasCustomTab = customTabCompendiums.some(p => p && p.trim() !== "");
        if (hasCustomTab) {
            categories.push({
                id: "custom-tab",
                label: customTabName || "General",
                key: "CustomTab"
            });
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
            // OPTIMIZATION: PERFORMANCE FIX
            // If this category is NOT the active tab, skip all processing.
            // This prevents loading thousands of items into DOM hidden by CSS.
            if (cat.id !== this.activeTab) {
                // Return empty list for this tab to prevent HBS errors, but data is empty
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
                        if (!VALID_ITEM_TYPES.includes(doc.type)) continue;
                        if (seenNames.has(doc.name)) continue;
                        seenNames.add(doc.name);
                        const isHidden = hiddenItems[doc.name];
                        const isSaleBlocked = blockedSaleItems[doc.name];
                        const isPurchaseBlocked = blockedPurchaseItems[doc.name];
                        let hasItem = false;
                        if (hasActor && userActor.items) {
                            hasItem = userActor.items.some(i => i.name === doc.name);
                        }
                        const canSell = hasItem && !isSaleBlocked;

                        // Skip if: hidden AND not GM (visibility = completely hide)
                        if (isHidden && !isGM) continue;

                        let basePrice = 0;
                        let isOverridden = false;
                        const desc = foundry.utils.getProperty(doc, "system.description.value") || 
                                     foundry.utils.getProperty(doc, "system.description") || "";
                        const descString = String(desc);
                        const priceMatch = descString.match(/\{\{\{(\d+)\}\}\}/);

                        if (priceMatch) basePrice = parseInt(priceMatch[1], 10);

                        // Check for header tag (non-numeric, non-tier content in {{{...}}})
                        let itemHeader = null;
                        const allTags = descString.match(/\{\{\{([^}]+)\}\}\}/g);
                        if (allTags) {
                            for (const tag of allTags) {
                                const content = tag.replace(/\{\{\{|\}\}\}/g, '').trim();
                                // Skip price tags (pure numbers) and tier tags (tierX)
                                if (/^\d+$/.test(content)) continue;
                                if (/^tier[1-4]$/i.test(content)) continue;
                                itemHeader = content;
                                break;
                            }
                        }
                        if (priceOverrides.hasOwnProperty(doc.name)) {
                            basePrice = priceOverrides[doc.name];
                            isOverridden = true;
                        } 
                        
                        const isSale = saleItems[doc.name];
                        let finalPrice = basePrice;
                        if (isSale) finalPrice = Math.ceil(basePrice * (1 - saleDiscount/100));

                        const sellPrice = Math.floor(basePrice * sellRatio);

                        const canAffordPersonal = userGold >= finalPrice;
                        const canBuyPersonal = hasActor && canAffordPersonal && !isPurchaseBlocked;
                        const combinedWealth = partyGold + userGold;
                        const canBuyParty = hasPartyActor && hasActor && (combinedWealth >= finalPrice) && !isPurchaseBlocked;

                        // Clean description: remove all {{{...}}} tags (price and header) and HTML
                        const cleanedDescription = descString
                            .replace(/\{\{\{[^}]+\}\}\}/g, '')
                            .replace(/<[^>]*>/g, '')
                            .trim();

                        let itemSummary = "";
                        if (doc.type === "weapon") {
                            itemSummary = this._getWeaponSummary(doc);
                        } else if (doc.type === "armor") {
                            itemSummary = this._getArmorSummary(doc);
                        }

                        let isRecommended = false;
                        if (hasActor && !isGM && doc.type === "weapon") {
                            const itemTrait = String(foundry.utils.getProperty(doc, "system.attack.roll.trait") || "").toLowerCase();
                            if (itemTrait && bestTraits.includes(itemTrait)) {
                                isRecommended = true;
                            }
                        }

                        // Stock System: Fetch stock data if enabled
                        let stockQuantity = null;
                        let stockStatus = "available";
                        let stockUnlimited = false;
                        if (stockEnabled) {
                            stockUnlimited = StockManager.isUnlimited(doc.uuid);
                            const qty = await StockManager.getStock(doc.uuid);
                            if (qty !== null) {
                                stockQuantity = qty;
                                if (qty === 0) {
                                    stockStatus = "out";
                                } else if (qty <= 5) {
                                    stockStatus = "low";
                                }
                            }
                        }

                        // Item Comparison: Only for players in comparable categories
                        const canCompare = !isGM && hasActor && this._isComparableCategory(cat.id);
                        const hasEquippedItem = canCompare && !!this._getEquippedItem(userActor, cat.id);

                        // Determine tier for grouping: system.tier first, then {{{tierX}}} tag
                        let itemTier = null;
                        const sysTier = foundry.utils.getProperty(doc, "system.tier");
                        const parsedTier = parseInt(sysTier);
                        if (parsedTier >= 1 && parsedTier <= 4) {
                            itemTier = parsedTier;
                        } else {
                            const tierTagMatch = descString.match(/\{\{\{tier([1-4])\}\}\}/i);
                            if (tierTagMatch) itemTier = parseInt(tierTagMatch[1]);
                        }

                        customItems.push({
                            id: doc.id,
                            uuid: doc.uuid,
                            name: doc.name,
                            img: doc.img,
                            price: finalPrice,
                            originalPrice: basePrice,
                            isSale: isSale,
                            isHidden: isGM && isHidden,
                            isSaleBlocked: isGM && isSaleBlocked,
                            isPurchaseBlocked: isGM && isPurchaseBlocked,
                            isLocked: isGM && lockedItems[doc.name],
                            isOverridden: isOverridden,
                            canBuyPersonal: canBuyPersonal,
                            canBuyParty: canBuyParty,
                            canSell: canSell,
                            sellPrice: sellPrice,
                            itemSummary: itemSummary,
                            isRecommended: isRecommended,
                            description: cleanedDescription,
                            header: itemHeader,
                            tier: itemTier,
                            stockQuantity: stockQuantity,
                            stockStatus: stockStatus,
                            stockUnlimited: stockUnlimited,
                            stockEnabled: stockEnabled,
                            showStockQty: showStockQuantity,
                            canCompare: canCompare,
                            hasEquippedItem: hasEquippedItem,
                            isEpic: !!epicItems[doc.name],
                            epicIcon: epicIcon,
                            epicColor: epicColor,
                            epicLabel: epicLabel,
                            epicTextColor: getEpicTextColor(epicColor),
                            epicBgColor: epicItems[doc.name] ? getEpicBgColor(epicColor) : null,
                            epicEffect: epicEffect
                        });
                    }
                }

                const groups = [];

                if (customTabTierGroup) {
                    // Tier grouping mode: items with system.tier go into tier headers,
                    // items without tier use header-based grouping
                    const tierLabels = {
                        1: "Tier 1 / Common",
                        2: "Tier 2 / Uncommon",
                        3: "Tier 3 / Rare",
                        4: "Tier 4 / Legendary"
                    };
                    const tierGroupMap = {};
                    const noTierHeaderGroups = {};
                    const noTierNoHeaderItems = [];

                    for (const item of customItems) {
                        if (item.tier !== null) {
                            // Build group key: tier + optional header suffix
                            const suffix = item.header ? ` - ${item.header}` : "";
                            const groupKey = `tier-${item.tier}${suffix}`;
                            const groupLabel = `${tierLabels[item.tier]}${suffix}`;
                            if (!tierGroupMap[groupKey]) {
                                tierGroupMap[groupKey] = { id: groupKey, label: groupLabel, tier: item.tier, items: [] };
                            }
                            tierGroupMap[groupKey].items.push(item);
                        } else if (item.header) {
                            if (!noTierHeaderGroups[item.header]) {
                                noTierHeaderGroups[item.header] = [];
                            }
                            noTierHeaderGroups[item.header].push(item);
                        } else {
                            noTierNoHeaderItems.push(item);
                        }
                    }

                    // Add tier groups sorted by tier, then by suffix
                    Object.values(tierGroupMap)
                        .sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label))
                        .forEach(group => {
                            group.items.sort((a, b) => a.name.localeCompare(b.name));
                            groups.push(group);
                        });

                    // Add non-tier header groups
                    Object.keys(noTierHeaderGroups).sort().forEach(header => {
                        noTierHeaderGroups[header].sort((a, b) => a.name.localeCompare(b.name));
                        groups.push({ id: header, label: header, items: noTierHeaderGroups[header] });
                    });

                    // Add non-tier non-header items
                    if (noTierNoHeaderItems.length > 0) {
                        noTierNoHeaderItems.sort((a, b) => a.name.localeCompare(b.name));
                        groups.push({ id: "no-header", label: "", items: noTierNoHeaderItems });
                    }
                } else {
                    // Default mode: group by header only
                    const headerGroups = {};
                    const noHeaderItems = [];

                    for (const item of customItems) {
                        if (item.header) {
                            if (!headerGroups[item.header]) {
                                headerGroups[item.header] = [];
                            }
                            headerGroups[item.header].push(item);
                        } else {
                            noHeaderItems.push(item);
                        }
                    }

                    if (noHeaderItems.length > 0) {
                        noHeaderItems.sort((a, b) => a.name.localeCompare(b.name));
                        groups.push({ id: "no-header", label: "", items: noHeaderItems });
                    }

                    Object.keys(headerGroups).sort().forEach(header => {
                        headerGroups[header].sort((a, b) => a.name.localeCompare(b.name));
                        groups.push({ id: header, label: header, items: headerGroups[header] });
                    });
                }

                // GM only: move hidden items to a separate group at the bottom
                if (isGM && groups.length > 0) {
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
                    context.tabs[cat.id] = filtered.length > 0 ? filtered : [{ id: "all", label: "", items: [] }];
                } else {
                    context.tabs[cat.id] = groups.length > 0 ? groups : [{ id: "all", label: "", items: [] }];
                }
                continue;
            }

            const tierGroups = {
                1: { id: 1, label: "Tier 1 / Common", items: [] },
                2: { id: 2, label: "Tier 2 / Uncommon", items: [] },
                3: { id: 3, label: "Tier 3 / Rare", items: [] },
                4: { id: 4, label: "Tier 4 / Legendary", items: [] }
            };

            const packsToScan = [];
            if (PACK_MAPPING[cat.key]) packsToScan.push({ id: PACK_MAPPING[cat.key], isDefault: true });
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
                    // For custom compendiums, filter by expected item type for this category
                    if (!packInfo.isDefault) {
                        const expectedType = CATEGORY_ITEM_TYPE[cat.key];
                        if (expectedType && doc.type !== expectedType) continue;
                    }

                    // For weapons, check system.secondary to determine correct category
                    if (doc.type === "weapon") {
                        const isSecondary = foundry.utils.getProperty(doc, "system.secondary") === true;
                        // Secondary weapons only go in Secondary Weapons tab
                        if (isSecondary && cat.key !== "Secondary Weapons") continue;
                        // Primary/Wheelchairs tabs only get non-secondary weapons
                        if (!isSecondary && cat.key === "Secondary Weapons") continue;
                    }

                    const isHidden = hiddenItems[doc.name];
                    const isSaleBlocked = blockedSaleItems[doc.name];
                    const isPurchaseBlocked = blockedPurchaseItems[doc.name];
                    let hasItem = false;
                    if (hasActor && userActor.items) {
                        hasItem = userActor.items.some(i => i.name === doc.name);
                    }
                    const canSell = hasItem && !isSaleBlocked;

                    // Skip if: hidden AND not GM (visibility = completely hide)
                    if (isHidden && !isGM) continue;

                    let basePrice = 0;
                    let tier = 1;
                    let knownItem = false;
                    let isOverridden = false;

                    if (priceList.hasOwnProperty(doc.name)) {
                        basePrice = Math.ceil(priceList[doc.name].price * priceMod);
                        tier = priceList[doc.name].tier;
                        knownItem = true;
                    }
                    
                    if (packInfo.isDefault && !knownItem) continue;

                    if (priceOverrides.hasOwnProperty(doc.name)) {
                        basePrice = priceOverrides[doc.name];
                        isOverridden = true;
                    } 

                    if (!packInfo.isDefault) {
                        knownItem = true;
                        if (!priceList.hasOwnProperty(doc.name)) {
                             // Determine tier from system.tier or {{{tierX}}} tag
                             tier = getItemTier(doc);

                             // Check for price tag {{{X}}} in description
                             if (!isOverridden) {
                                 const descForPrice = foundry.utils.getProperty(doc, "system.description.value") ||
                                                      foundry.utils.getProperty(doc, "system.description") || "";
                                 const priceTagMatch = String(descForPrice).match(/\{\{\{(\d+)\}\}\}/);
                                 if (priceTagMatch) {
                                     basePrice = Math.ceil(parseInt(priceTagMatch[1], 10) * priceMod);
                                 }
                             }
                        }
                    }

                    if (!knownItem) continue;
                    if (!catConfig[tier]) continue;

                    const isSale = saleItems[doc.name];
                    let finalPrice = basePrice;
                    if (isSale) finalPrice = Math.ceil(basePrice * (1 - saleDiscount/100));

                    const sellPrice = Math.floor(basePrice * sellRatio);

                    const canAffordPersonal = userGold >= finalPrice;
                    const canBuyPersonal = hasActor && canAffordPersonal && !isPurchaseBlocked;
                    const combinedWealth = partyGold + userGold;
                    const canBuyParty = hasPartyActor && hasActor && (combinedWealth >= finalPrice) && !isPurchaseBlocked;

                    // Get and clean description: remove {{{x}}} tags and HTML
                    const desc = foundry.utils.getProperty(doc, "system.description.value") ||
                                 foundry.utils.getProperty(doc, "system.description") || "";
                    const cleanedDescription = String(desc)
                        .replace(/\{\{\{\d+\}\}\}/g, '')
                        .replace(/<[^>]*>/g, '')
                        .trim();

                    let itemSummary = "";
                    if (doc.type === "weapon") {
                        itemSummary = this._getWeaponSummary(doc);
                    } else if (doc.type === "armor") {
                        itemSummary = this._getArmorSummary(doc);
                    }

                    let isRecommended = false;
                    if (hasActor && !isGM && doc.type === "weapon") {
                        const itemTrait = String(foundry.utils.getProperty(doc, "system.attack.roll.trait") || "").toLowerCase();
                        if (itemTrait && bestTraits.includes(itemTrait)) {
                            isRecommended = true;
                        }
                    }

                    // Stock System: Fetch stock data if enabled
                    let stockQuantity = null;
                    let stockStatus = "available";
                    let stockUnlimited = false;
                    if (stockEnabled) {
                        stockUnlimited = StockManager.isUnlimited(doc.uuid);
                        const qty = await StockManager.getStock(doc.uuid);
                        if (qty !== null) {
                            stockQuantity = qty;
                            if (qty === 0) {
                                stockStatus = "out";
                            } else if (qty <= 5) {
                                stockStatus = "low";
                            }
                        }
                    }

                    // Item Comparison: Only for players in comparable categories
                    const canCompare = !isGM && hasActor && this._isComparableCategory(cat.id);
                    const hasEquippedItem = canCompare && !!this._getEquippedItem(userActor, cat.id);

                    if (tierGroups[tier]) {
                        tierGroups[tier].items.push({
                            id: doc.id,
                            uuid: doc.uuid,
                            name: doc.name,
                            img: doc.img,
                            price: finalPrice,
                            originalPrice: basePrice,
                            isSale: isSale,
                            isHidden: isGM && isHidden,
                            isSaleBlocked: isGM && isSaleBlocked,
                            isPurchaseBlocked: isGM && isPurchaseBlocked,
                            isLocked: isGM && lockedItems[doc.name],
                            isOverridden: isOverridden,
                            canBuyPersonal: canBuyPersonal,
                            canBuyParty: canBuyParty,
                            canSell: canSell,
                            sellPrice: sellPrice,
                            itemSummary: itemSummary,
                            isRecommended: isRecommended,
                            description: cleanedDescription,
                            stockQuantity: stockQuantity,
                            stockStatus: stockStatus,
                            stockUnlimited: stockUnlimited,
                            stockEnabled: stockEnabled,
                            showStockQty: showStockQuantity,
                            canCompare: canCompare,
                            hasEquippedItem: hasEquippedItem,
                            isEpic: !!epicItems[doc.name],
                            epicIcon: epicIcon,
                            epicColor: epicColor,
                            epicLabel: epicLabel,
                            epicTextColor: getEpicTextColor(epicColor),
                            epicBgColor: epicItems[doc.name] ? getEpicBgColor(epicColor) : null,
                            epicEffect: epicEffect
                        });
                    }
                }
            }

            const standardGroups = Object.values(tierGroups)
                .filter(g => g.items.length > 0)
                .map(g => {
                    g.items.sort((a, b) => a.name.localeCompare(b.name));
                    return g;
                });

            // GM only: move hidden items to a separate group at the bottom
            if (isGM) {
                const hiddenGroup = { id: "hidden", label: '<i class="fas fa-eye-slash"></i> Hidden Items', isHiddenGroup: true, items: [] };
                for (const group of standardGroups) {
                    const hidden = group.items.filter(i => i.isHidden);
                    if (hidden.length > 0) {
                        group.items = group.items.filter(i => !i.isHidden);
                        hiddenGroup.items.push(...hidden);
                    }
                }
                const result = standardGroups.filter(g => g.items.length > 0);
                if (hiddenGroup.items.length > 0) {
                    hiddenGroup.items.sort((a, b) => a.name.localeCompare(b.name));
                    result.push(hiddenGroup);
                }
                context.tabs[cat.id] = result;
            } else {
                context.tabs[cat.id] = standardGroups;
            }
        }

        return context;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        if (this.window) this.window.title = this.options.window.title;

        const searchInputs = html.querySelectorAll(".store-search");
        searchInputs.forEach(searchInput => {
            searchInput.value = this.searchQuery;
            this._applySearch(searchInput);

            searchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value;
                this._applySearch(e.target);
            });
        });
        
        const sliders = html.querySelectorAll("input[type='range']");
        sliders.forEach(range => {
            const display = range.nextElementSibling; 
            if (display && display.classList.contains("range-value")) {
                range.addEventListener("input", (e) => {
                    display.innerText = `${e.target.value}%`;
                });
            }
        });

        const priceInputs = html.querySelectorAll(".gm-price-input");
        priceInputs.forEach(input => {
            input.addEventListener("change", this._onPriceOverrideChange.bind(this));
        });

        // Event listener for GM stock inputs
        const stockInputs = html.querySelectorAll(".gm-stock-input");
        stockInputs.forEach(input => {
            input.addEventListener("change", async (e) => {
                const itemUuid = e.target.dataset.uuid;
                const value = e.target.value.trim();

                if (value === "" || value === "∞") {
                    // Set to unlimited
                    await StockManager.setStock(itemUuid, 0, true);
                } else {
                    const qty = parseInt(value);
                    if (!isNaN(qty) && qty >= 0) {
                        await StockManager.setStock(itemUuid, qty, false);
                    }
                }
            });
        });

        const itemImages = html.querySelectorAll(".item-image");
        itemImages.forEach(img => {
            img.addEventListener("click", async (e) => {
                const uuid = e.currentTarget.dataset.uuid;
                if (!uuid) return;
                const doc = await fromUuid(uuid);
                if (doc && doc.sheet) doc.sheet.render(true);
            });
        });

        // Custom Tooltip for Item Descriptions (with delay)
        const itemNames = html.querySelectorAll(".store-item-name[data-item-desc]");
        let tooltipTimeout = null;

        itemNames.forEach(nameEl => {
            nameEl.addEventListener("mouseenter", (e) => {
                const text = e.currentTarget.dataset.itemDesc;
                if (!text) return;

                const target = e.currentTarget;

                // Clear any existing timeout
                if (tooltipTimeout) clearTimeout(tooltipTimeout);

                // Delay before showing tooltip (600ms)
                tooltipTimeout = setTimeout(() => {
                    // Remove any existing tooltip
                    document.querySelectorAll(".daggerheart-store-tooltip").forEach(t => t.remove());

                    // Create tooltip element
                    const tooltip = document.createElement("div");
                    tooltip.className = "daggerheart-store-tooltip";
                    tooltip.textContent = text;
                    document.body.appendChild(tooltip);

                    // Position tooltip near the element
                    const rect = target.getBoundingClientRect();
                    tooltip.style.left = `${rect.left}px`;
                    tooltip.style.top = `${rect.bottom + 8}px`;

                    // Adjust if tooltip goes off-screen
                    const tooltipRect = tooltip.getBoundingClientRect();
                    if (tooltipRect.right > window.innerWidth - 10) {
                        tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
                    }
                    if (tooltipRect.bottom > window.innerHeight - 10) {
                        tooltip.style.top = `${rect.top - tooltipRect.height - 8}px`;
                    }
                }, 600);
            });

            nameEl.addEventListener("mouseleave", () => {
                // Cancel pending tooltip
                if (tooltipTimeout) {
                    clearTimeout(tooltipTimeout);
                    tooltipTimeout = null;
                }
                // Remove any visible tooltip
                document.querySelectorAll(".daggerheart-store-tooltip").forEach(t => t.remove());
            });
        });

        // Item Comparison Tooltip (Players Only)
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

                // Clear any existing timeouts
                if (compareTooltipTimeout) clearTimeout(compareTooltipTimeout);
                if (compareTooltipRemoveTimeout) clearTimeout(compareTooltipRemoveTimeout);

                // Delay before showing tooltip (400ms)
                compareTooltipTimeout = setTimeout(async () => {
                    // Remove any existing comparison tooltip
                    document.querySelectorAll(".comparison-tooltip").forEach(t => t.remove());

                    // Build comparison data
                    const comparisonData = await this._buildComparisonData(itemUuid, category, actor);
                    if (!comparisonData) return;

                    // Render the template
                    const templatePath = "modules/daggerheart-store/templates/item-comparison.hbs";
                    const tooltipHtml = await foundry.applications.handlebars.renderTemplate(templatePath, comparisonData);

                    // Create tooltip element
                    const tooltipContainer = document.createElement("div");
                    tooltipContainer.innerHTML = tooltipHtml;
                    const tooltip = tooltipContainer.firstElementChild;
                    document.body.appendChild(tooltip);

                    // Position tooltip (prefer above button)
                    const rect = target.getBoundingClientRect();
                    const tooltipRect = tooltip.getBoundingClientRect();

                    // Check if there's space above
                    let top = rect.top - tooltipRect.height - 10;
                    if (top < 10) {
                        // Not enough space above, position below
                        top = rect.bottom + 10;
                    }

                    // Center horizontally on button
                    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

                    // Constrain to viewport
                    if (left < 10) left = 10;
                    if (left + tooltipRect.width > window.innerWidth - 10) {
                        left = window.innerWidth - tooltipRect.width - 10;
                    }
                    if (top + tooltipRect.height > window.innerHeight - 10) {
                        top = window.innerHeight - tooltipRect.height - 10;
                    }

                    tooltip.style.position = "fixed";
                    tooltip.style.left = `${left}px`;
                    tooltip.style.top = `${top}px`;
                    tooltip.style.zIndex = "10000";

                    // Keep tooltip visible when hovering over it
                    tooltip.addEventListener("mouseenter", () => {
                        if (compareTooltipRemoveTimeout) {
                            clearTimeout(compareTooltipRemoveTimeout);
                            compareTooltipRemoveTimeout = null;
                        }
                    });

                    tooltip.addEventListener("mouseleave", () => {
                        compareTooltipRemoveTimeout = setTimeout(() => {
                            tooltip.remove();
                        }, 200);
                    });
                }, 400);
            });

            btn.addEventListener("mouseleave", () => {
                // Cancel pending tooltip creation
                if (compareTooltipTimeout) {
                    clearTimeout(compareTooltipTimeout);
                    compareTooltipTimeout = null;
                }

                // Delay removal to allow hovering over tooltip
                compareTooltipRemoveTimeout = setTimeout(() => {
                    document.querySelectorAll(".comparison-tooltip").forEach(t => t.remove());
                }, 200);
            });
        });

        // OPTIMIZATION: Tab Switching now triggers a full Re-Render
        const tabs = html.querySelectorAll(".sheet-tabs .item");
        tabs.forEach(tab => {
            tab.addEventListener("click", (e) => {
                e.preventDefault(); 
                const tabId = e.currentTarget.dataset.tab; 
                
                // If clicking a different tab, update state and re-render
                if (this.activeTab !== tabId) {
                    this.activeTab = tabId;
                    this.render(); // This triggers _prepareContext again, fetching ONLY the new tab's data
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

    _applySearch(input) {
        const query = input.value.toLowerCase();
        const tabContent = input.closest(".tab");
        if (!tabContent) return;
        
        const rows = tabContent.querySelectorAll(".store-row");
        rows.forEach(row => {
            const name = row.querySelector(".store-item-name").innerText.toLowerCase();
            if (name.includes(query)) row.style.display = "flex"; 
            else row.style.display = "none";
        });
    }

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

        // Check stock (if enabled and Party Actor is configured)
        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const hasPartyActor = !!(partyActorId && game.actors.get(partyActorId));
        const stockEnabled = game.settings.get(MODULE_ID, "stockEnabled") && hasPartyActor;

        if (stockEnabled) {
            const stockQty = await StockManager.getStock(itemUuid);
            if (stockQty !== null && stockQty < 1) {
                return ui.notifications.warn(`${itemName} is out of stock.`);
            }
        }

        // Check funds (respecting Smart Mode for calculation)
        const currencyMode = game.settings.get(MODULE_ID, "currencyMode");
        let userWealth = 0;
        
        if (currencyMode === "smart") {
            userWealth = this._calculateTotalWealth(userActor);
        } else {
            userWealth = foundry.utils.getProperty(userActor, "system.gold.coins") || 0;
        }

        if (userWealth < itemPrice) {
            return ui.notifications.warn(`Insufficient funds.`);
        }

        await this._executePurchase({
            itemUuid, 
            itemName, 
            price: itemPrice, 
            recipient: userActor,
            payers: [{ actor: userActor, amount: itemPrice, name: userActor.name }]
        });
    }

    async _onSellItem(event, target) {
        // Check if button is disabled
        if (target.disabled) return;

        const itemName = target.dataset.name;
        const itemUuid = target.dataset.uuid;
        const sellPrice = parseInt(target.dataset.price);
        const userActor = game.user.character;

        if (!userActor) return ui.notifications.error("You need an assigned character to sell items.");

        // Check if sale is blocked by GM
        const blockedSaleItems = game.settings.get(MODULE_ID, "blockedSaleItems") || {};
        if (blockedSaleItems[itemName]) return ui.notifications.warn("This item cannot be sold.");

        const itemToDelete = userActor.items.find(i => i.name === itemName);
        if (!itemToDelete) return ui.notifications.warn(`You do not have a "${itemName}" to sell.`);

        await itemToDelete.delete();

        // Increment stock if stock control is enabled
        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const hasPartyActor = !!(partyActorId && game.actors.get(partyActorId));
        const stockEnabled = game.settings.get(MODULE_ID, "stockEnabled") && hasPartyActor;

        if (stockEnabled && itemUuid) {
            await StockManager.incrementStock(itemUuid, 1);
        }

        // Handle Currency Update (Smart vs Default)
        const currencyMode = game.settings.get(MODULE_ID, "currencyMode");

        if (currencyMode === "smart") {
            const currentTotal = this._calculateTotalWealth(userActor);
            const newTotal = currentTotal + sellPrice;
            const optimized = this._optimizeCurrency(newTotal);

            await userActor.update({
                "system.gold.chests": optimized.chests,
                "system.gold.bags": optimized.bags,
                "system.gold.handfuls": optimized.handfuls,
                "system.gold.coins": optimized.coins
            });
        } else {
            const currentCoins = foundry.utils.getProperty(userActor, "system.gold.coins") || 0;
            const newTotal = currentCoins + sellPrice;
            await userActor.update({ "system.gold.coins": newTotal });
        }

        const currency = getSystemCurrency();
        
        // GET BORDER COLOR (GREEN)
        const borderColor = this._getBorderColor("sell");

        const rawContent = `
        <div class="chat-card" style="border: 2px solid ${borderColor}; border-radius: 8px; overflow: hidden;">
            <header class="card-header flexrow" style="background: #191919 !important; padding: 8px; border-bottom: 2px solid ${borderColor};">
                <h3 class="noborder" style="margin: 0; font-weight: bold; color: ${borderColor} !important; font-family: 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%;">
                    Item Sold
                </h3>
            </header>
            <div class="card-content" style="background: #2a2a2a; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
                <span style="color: #ffffff; font-size: 1.1em; font-weight: bold; font-family: 'Lato', sans-serif;">
                    <strong>${userActor.name}</strong> sold <strong>${itemName}</strong>
                </span>
                <span style="color: #d4af37; font-size: 1.2em; font-weight: bold; margin-top: 10px;">
                    +${sellPrice} ${currency}
                </span>
            </div>
        </div>`;

        const chatData = {
            content: rawContent,
            speaker: ChatMessage.getSpeaker({ actor: userActor })
        };

        const whisperTo = getChatWhisperRecipients();
        if (whisperTo) {
            chatData.whisper = whisperTo;
        }

        await ChatMessage.create(chatData);

        if (game.audio) {
            foundry.audio.AudioHelper.play({ src: "modules/daggerheart-store/assets/audio/coins.mp3", volume: 0.8, loop: false }, false);
        }

        this.render();
    }

    async _onTransferFunds(event, target) {
        const userActor = game.user.character;
        if (!userActor) return ui.notifications.error("You need an assigned character.");

        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const partyActor = game.actors.get(partyActorId);
        if (!partyActor) return ui.notifications.error("Party actor not configured.");

        const currency = getSystemCurrency();
        const currencyMode = game.settings.get(MODULE_ID, "currencyMode");
        
        let userWealth = 0;
        let partyWealth = 0;

        if (currencyMode === "smart") {
            userWealth = this._calculateTotalWealth(userActor);
            partyWealth = this._calculateTotalWealth(partyActor);
        } else {
            userWealth = foundry.utils.getProperty(userActor, "system.gold.coins") || 0;
            partyWealth = foundry.utils.getProperty(partyActor, "system.gold.coins") || 0;
        }

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
            content: content,
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

                            if (currencyMode === "smart") {
                                const newUserTotal = userWealth - amount;
                                const newPartyTotal = partyWealth + amount;
                                const optUser = storeApp._optimizeCurrency(newUserTotal);
                                const optParty = storeApp._optimizeCurrency(newPartyTotal);

                                await userActor.update({
                                    "system.gold.chests": optUser.chests, "system.gold.bags": optUser.bags,
                                    "system.gold.handfuls": optUser.handfuls, "system.gold.coins": optUser.coins
                                });
                                await partyActor.update({
                                    "system.gold.chests": optParty.chests, "system.gold.bags": optParty.bags,
                                    "system.gold.handfuls": optParty.handfuls, "system.gold.coins": optParty.coins
                                });
                            } else {
                                await userActor.update({ "system.gold.coins": userWealth - amount });
                                await partyActor.update({ "system.gold.coins": partyWealth + amount });
                            }

                            storeApp._createTransferChatMessage(userActor, partyActor, amount, "deposit", currency);

                        } else {
                            if (amount > partyWealth) return ui.notifications.warn("Insufficient party funds.");

                            if (currencyMode === "smart") {
                                const newPartyTotal = partyWealth - amount;
                                const newUserTotal = userWealth + amount;
                                const optParty = storeApp._optimizeCurrency(newPartyTotal);
                                const optUser = storeApp._optimizeCurrency(newUserTotal);

                                await partyActor.update({
                                    "system.gold.chests": optParty.chests, "system.gold.bags": optParty.bags,
                                    "system.gold.handfuls": optParty.handfuls, "system.gold.coins": optParty.coins
                                });
                                await userActor.update({
                                    "system.gold.chests": optUser.chests, "system.gold.bags": optUser.bags,
                                    "system.gold.handfuls": optUser.handfuls, "system.gold.coins": optUser.coins
                                });
                            } else {
                                await partyActor.update({ "system.gold.coins": partyWealth - amount });
                                await userActor.update({ "system.gold.coins": userWealth + amount });
                            }

                            storeApp._createTransferChatMessage(userActor, partyActor, amount, "withdraw", currency);
                        }

                        storeApp.render();
                    }
                },
                { action: "cancel", label: "Cancel", icon: "fas fa-times" }
            ]
        });

        // Render and then attach event listeners via hook
        Hooks.once("renderDialogV2", (app, element) => {
            if (app !== dialog) return;

            const container = element.querySelector(".transfer-direction-container");
            if (!container) return;

            const buttons = container.querySelectorAll(".direction-btn");
            const hiddenInput = element.querySelector('input[name="direction"]');

            buttons.forEach(btn => {
                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    buttons.forEach(b => b.classList.remove("selected"));
                    btn.classList.add("selected");

                    if (hiddenInput) {
                        hiddenInput.value = btn.dataset.direction;
                    }
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
        
        // GET BORDER COLOR (PURPLE)
        const borderColor = this._getBorderColor("transfer");

        const rawContent = `
        <div class="chat-card" style="border: 2px solid ${borderColor}; border-radius: 8px; overflow: hidden;">
            <header class="card-header flexrow" style="background: #191919 !important; padding: 8px; border-bottom: 2px solid ${borderColor};">
                <h3 class="noborder" style="margin: 0; font-weight: bold; color: ${borderColor} !important; font-family: 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%;">
                    ${title}
                </h3>
            </header>
            <div class="card-content" style="background: #2a2a2a; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
                <span style="color: #ffffff; font-size: 1.1em; font-family: 'Lato', sans-serif;">
                    ${message}
                </span>
                <span style="color: #d4af37; font-size: 1.3em; font-weight: bold; margin-top: 10px;">
                    ${amount} ${currency}
                </span>
            </div>
        </div>`;

        const chatData = {
            content: rawContent,
            speaker: ChatMessage.getSpeaker({ actor: userActor })
        };

        const whisperTo = getChatWhisperRecipients();
        if (whisperTo) {
            chatData.whisper = whisperTo;
        }

        await ChatMessage.create(chatData);

        if (game.audio) {
            foundry.audio.AudioHelper.play({ src: "modules/daggerheart-store/assets/audio/coins.mp3", volume: 0.8, loop: false }, false);
        }
    }

    async _handleSplitPurchase(itemUuid, itemName, price, userActor, partyActor) {
        const currencyMode = game.settings.get(MODULE_ID, "currencyMode");
        const currency = getSystemCurrency();
        
        let userGold = 0;
        let partyGold = 0;

        if (currencyMode === "smart") {
            userGold = this._calculateTotalWealth(userActor);
            partyGold = this._calculateTotalWealth(partyActor);
        } else {
            userGold = foundry.utils.getProperty(userActor, "system.gold.coins") || 0;
            partyGold = foundry.utils.getProperty(partyActor, "system.gold.coins") || 0;
        }

        let defaultPartyPay = Math.min(partyGold, price);
        let defaultUserPay = price - defaultPartyPay;

        if (defaultUserPay > userGold) {
            return ui.notifications.warn("Combined funds are insufficient.");
        }

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
            content: content,
            classes: ["store-dialog", "split-payment-dialog"],
            modal: true,
            buttons: [
                {
                    action: "confirm",
                    label: "Purchase",
                    icon: "fas fa-check",
                    callback: async (event, button, dialog) => {
                        const userPay = parseInt(button.form.elements["user-share"].value) || 0;
                        const partyPay = parseInt(button.form.elements["party-share"].value) || 0;

                        if (userPay + partyPay !== price) {
                            ui.notifications.error(`Invalid payment amount. Total is ${userPay + partyPay}, but price is ${price}. Purchase cancelled.`);
                            return; 
                        }

                        if (userPay > userGold || partyPay > partyGold) {
                            ui.notifications.error("Cannot pay more than available funds. Purchase cancelled.");
                            return; 
                        }

                        await this._executePurchase({
                            itemUuid,
                            itemName,
                            price,
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
                    let remainder = price - val;
                    partyIn.value = Math.max(0, remainder);
                });

                partyIn.addEventListener("input", () => {
                    let val = parseInt(partyIn.value) || 0;
                    if (val > partyGold) val = partyGold;
                    let remainder = price - val;
                    userIn.value = Math.max(0, remainder);
                });
            }
        }).render(true);
    }

    async _executePurchase({ itemUuid, itemName, price, recipient, payers }) {
        const itemFromPack = await fromUuid(itemUuid);
        if (!itemFromPack) return ui.notifications.error("Item data not found.");

        const currency = getSystemCurrency();
        const currencyMode = game.settings.get(MODULE_ID, "currencyMode");

        for (const payer of payers) {
            if (payer.amount > 0) {
                if (currencyMode === "smart") {
                    const currentTotal = this._calculateTotalWealth(payer.actor);
                    const newTotal = currentTotal - payer.amount;
                    const optimized = this._optimizeCurrency(newTotal);

                    await payer.actor.update({
                        "system.gold.chests": optimized.chests,
                        "system.gold.bags": optimized.bags,
                        "system.gold.handfuls": optimized.handfuls,
                        "system.gold.coins": optimized.coins
                    });
                } else {
                    const current = foundry.utils.getProperty(payer.actor, "system.gold.coins") || 0;
                    await payer.actor.update({ "system.gold.coins": current - payer.amount });
                }
            }
        }

        const itemData = itemFromPack.toObject();
        await recipient.createEmbeddedDocuments("Item", [itemData]);

        // Decrement stock after successful purchase (if enabled and Party Actor configured)
        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const hasPartyActor = !!(partyActorId && game.actors.get(partyActorId));
        const stockEnabled = game.settings.get(MODULE_ID, "stockEnabled") && hasPartyActor;

        if (stockEnabled) {
            const success = await StockManager.decrementStock(itemUuid, 1);
            if (!success) {
                ui.notifications.warn(
                    "Stock depleted during purchase. Item added but stock was not updated."
                );
            }
        }

        const payerText = payers
            .filter(p => p.amount > 0)
            .map(p => `<strong>${p.name}</strong> (${p.amount})`)
            .join(" & ");
        
        const itemLink = itemFromPack.link;

        // GET BORDER COLOR (RED or BLUE)
        const usedPartyFunds = payers.some(p => p.name === "Party Funds");
        const borderColor = this._getBorderColor(usedPartyFunds ? "party" : "buy");

        const rawContent = `
        <div class="chat-card" style="border: 2px solid ${borderColor}; border-radius: 8px; overflow: hidden;">
            <header class="card-header flexrow" style="background: #191919 !important; padding: 8px; border-bottom: 2px solid ${borderColor};">
                <h3 class="noborder" style="margin: 0; font-weight: bold; color: ${borderColor} !important; font-family: 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%;">
                    Store Purchase
                </h3>
            </header>
            <div class="card-content" style="background: #2a2a2a; padding: 20px; min-height: 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; position: relative;">
                <span style="color: #ffffff !important; font-size: 1.1em; font-weight: bold; font-family: 'Lato', sans-serif; line-height: 1.4;">
                    <strong>${recipient.name}</strong> purchased ${itemLink}
                </span>
                <span style="color: #bbb; font-size: 0.9em; margin-top: 5px;">
                    Paid by: ${payerText}
                </span>
                <span style="color: #d4af37; font-size: 1.2em; font-weight: bold; margin-top: 5px;">
                    -${price} ${currency}
                </span>
            </div>
        </div>`;

        const chatData = {
            content: rawContent, 
            speaker: ChatMessage.getSpeaker({ actor: recipient })
        };

        if (!usedPartyFunds) {
            const whisperTo = getChatWhisperRecipients();
            if (whisperTo) {
                chatData.whisper = whisperTo;
            }
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

    async _onOpenConfig(event, target) { new StoreConfig().render(true); }
    async _onOpenRandomizer(event, target) { new StoreRandomizer().render(true); }
    async _onShowToAll(event, target) { globalThis.Store.Show(); }
    async _onShowToPlayer(event, target) {
        const players = game.users.filter(u => !u.isGM && u.active);
        if (players.length === 0) return ui.notifications.warn("No active players.");
        const options = players.map(p => `<option value="${p.name}">${p.name}</option>`).join("");
        const selectHtml = `
            <div class="store-dialog-input-group">
                <label>Select Player:</label>
                <select name="targetPlayer" style="width:100%">${options}</select>
            </div>
        `;

        const result = await showStoreDialog({
            title: "Show Store to Player",
            icon: "fas fa-share",
            headerText: "Share Store",
            headerColor: "#D4AF37",
            message: "Select which player should receive the store window.",
            customContent: selectHtml,
            buttons: {
                confirm: "Show",
                confirmIcon: "fas fa-share"
            }
        });

        if (result.confirmed && result.formData?.targetPlayer) {
            globalThis.Store.Show(result.formData.targetPlayer);
        }
    }
    
    async _onSavePreset(event, target) {
        const profiles = foundry.utils.deepClone(game.settings.get(MODULE_ID, "storeProfiles")) || {};
        const currentProfile = game.settings.get(MODULE_ID, "currentProfile") || "Default";
        const existingNames = Object.keys(profiles).filter(n => n !== "Default");
        const defaultSelection = (currentProfile !== "Default" && existingNames.includes(currentProfile)) ? currentProfile : "__new__";

        // Build select options
        let selectOptions = `<option value="__new__" ${defaultSelection === "__new__" ? "selected" : ""}>Add a New Profile</option>`;
        for (const name of existingNames) {
            selectOptions += `<option value="${name}" ${defaultSelection === name ? "selected" : ""}>${name}</option>`;
        }

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
            </div>
        `;

        const result = await new Promise((resolve) => {
            const dialog = new DialogV2({
                window: { title: "Save Store Profile", icon: "fas fa-save" },
                content: contentHtml,
                classes: ["store-dialog"],
                modal: true,
                buttons: [
                    {
                        action: "confirm",
                        label: isNewDefault ? "Create New" : "Overwrite Profile",
                        icon: "fas fa-save",
                        callback: (event, button, dialog) => {
                            const result = { confirmed: true, formData: {} };
                            const formData = new FormData(button.form);
                            for (const [key, value] of formData.entries()) {
                                result.formData[key] = value;
                            }
                            resolve(result);
                        }
                    },
                    {
                        action: "cancel",
                        label: "Cancel",
                        icon: "fas fa-times",
                        callback: () => resolve({ confirmed: false })
                    }
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
                    if (confirmBtn) {
                        const labelEl = confirmBtn.querySelector("label") || confirmBtn;
                        labelEl.textContent = isNew ? "Create New" : "Overwrite Profile";
                    }
                    if (isNew) {
                        nameInput.value = "";
                        nameInput.placeholder = "Enter profile name";
                    } else {
                        nameInput.value = select.value;
                        nameInput.placeholder = "Rename or keep current name";
                    }
                });
            });

            dialog.render(true);
        });

        if (!result.confirmed) return;

        const selectedProfile = result.formData?.profileSelect;
        const inputName = result.formData?.profileName?.trim();
        const isNew = selectedProfile === "__new__";

        // Determine the final profile name
        let name;
        if (isNew) {
            name = inputName;
            if (!name) return ui.notifications.error("Please enter a name for the new profile.");
        } else {
            // If renamed, use the new name; otherwise keep the original
            name = inputName || selectedProfile;
            // If renamed, remove the old profile
            if (name !== selectedProfile && profiles[selectedProfile]) {
                delete profiles[selectedProfile];
            }
        }

        if (name === "Default") {
            return ui.notifications.error("You cannot overwrite the factory 'Default' profile. Please choose another name.");
        }

        const currentSettings = {
            storeName: game.settings.get(MODULE_ID, "storeName"),
            priceModifier: game.settings.get(MODULE_ID, "priceModifier"),
            allowedTiers: game.settings.get(MODULE_ID, "allowedTiers"),
            hiddenCategories: game.settings.get(MODULE_ID, "hiddenCategories"),
            customCompendiums: game.settings.get(MODULE_ID, "customCompendiums"),
            priceOverrides: game.settings.get(MODULE_ID, "priceOverrides"),
            saleDiscount: game.settings.get(MODULE_ID, "saleDiscount"),
            saleItems: game.settings.get(MODULE_ID, "saleItems"),
            hiddenItems: game.settings.get(MODULE_ID, "hiddenItems"),
            blockedSaleItems: game.settings.get(MODULE_ID, "blockedSaleItems"),
            blockedPurchaseItems: game.settings.get(MODULE_ID, "blockedPurchaseItems"),
            lockedItems: game.settings.get(MODULE_ID, "lockedItems"),
            epicItems: game.settings.get(MODULE_ID, "epicItems"),
            epicIcon: game.settings.get(MODULE_ID, "epicIcon"),
            epicColor: game.settings.get(MODULE_ID, "epicColor"),
            epicLabel: game.settings.get(MODULE_ID, "epicLabel"),
            epicEffect: game.settings.get(MODULE_ID, "epicEffect"),
            partyActorId: game.settings.get(MODULE_ID, "partyActorId"),
            customTabName: game.settings.get(MODULE_ID, "customTabName"),
            customTabCompendiums: game.settings.get(MODULE_ID, "customTabCompendiums"),
            customTabTierGroup: game.settings.get(MODULE_ID, "customTabTierGroup"),
            sellRatio: game.settings.get(MODULE_ID, "sellRatio"),
            stockEnabled: game.settings.get(MODULE_ID, "stockEnabled"),
            showStockQuantity: game.settings.get(MODULE_ID, "showStockQuantity"),
            randomizerSettings: game.settings.get(MODULE_ID, "randomizerSettings")
        };

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
            title: "Load Profile",
            icon: "fas fa-folder-open",
            headerText: "Load Profile",
            headerColor: "#D4AF37",
            message: `Are you sure you want to load the profile <b>"${profileName}"</b>?`,
            description: "This will overwrite current store settings."
        });

        if (!confirm) return;

        let profileData;

        if (profileName === "Default") {
            profileData = {
                storeName: "Daggerheart: Store",
                priceModifier: 100,
                allowedTiers: {},
                hiddenCategories: {},
                customCompendiums: [],
                priceOverrides: {},
                saleDiscount: 10,
                saleItems: {},
                hiddenItems: {},
                blockedSaleItems: {},
                blockedPurchaseItems: {},
                lockedItems: {},
                epicItems: {},
                epicIcon: "fa-star",
                epicColor: "#9b59b6",
                epicLabel: "Epic",
                epicEffect: "shine",
                partyActorId: "",
                customTabName: "General",
                customTabCompendiums: ["daggerheart-store.general-items"],
                customTabTierGroup: true,
                sellRatio: 0.5,
                stockEnabled: false,
                showStockQuantity: true,
                randomizerSettings: {}
            };
        } else {
            const profiles = game.settings.get(MODULE_ID, "storeProfiles");
            profileData = profiles[profileName];

            if (!profileData) return ui.notifications.error(`Profile "${profileName}" not found.`);
        }

        const settingsToUpdate = [
            "storeName", "priceModifier", "allowedTiers",
            "hiddenCategories", "customCompendiums", "priceOverrides",
            "saleDiscount", "saleItems", "hiddenItems", "blockedSaleItems",
            "blockedPurchaseItems", "lockedItems", "epicItems", "epicIcon", "epicColor", "epicLabel", "epicEffect",
            "partyActorId", "customTabName", "customTabCompendiums", "customTabTierGroup", "sellRatio",
            "stockEnabled", "showStockQuantity", "randomizerSettings"
        ];

        // Migrate old profile format: customTabCompendium (string) -> customTabCompendiums (array)
        if (!profileData.customTabCompendiums && profileData.customTabCompendium) {
            profileData.customTabCompendiums = [profileData.customTabCompendium];
        }

        for (const key of settingsToUpdate) {
            if (profileData.hasOwnProperty(key)) {
                await game.settings.set(MODULE_ID, key, profileData[key]);
            }
        }

        await game.settings.set(MODULE_ID, "currentProfile", profileName);

        this.render();
    }
    
    async _onDeletePreset(event, target) {
        const selectEl = this.element.querySelector(".preset-select");
        if (!selectEl) return;
        const profileName = selectEl.value;

        if (profileName === "Default") {
            return ui.notifications.warn("You cannot delete the Default profile.");
        }

        const confirm = await showStoreDialog({
            title: "Delete Profile",
            icon: "fas fa-trash",
            headerText: "Delete Profile",
            headerColor: "#D32F2F",
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
        await game.settings.set(MODULE_ID, "saleItems", saleItems);
        this.render();
    }
    async _onToggleHidden(event, target) {
        const itemName = target.dataset.name; const hiddenItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "hiddenItems"));
        if (hiddenItems[itemName]) { delete hiddenItems[itemName]; } else { hiddenItems[itemName] = true; }
        await game.settings.set(MODULE_ID, "hiddenItems", hiddenItems);
        this.render();
    }
    async _onToggleBlockSale(event, target) {
        const itemName = target.dataset.name; const blockedSaleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "blockedSaleItems"));
        if (blockedSaleItems[itemName]) { delete blockedSaleItems[itemName]; } else { blockedSaleItems[itemName] = true; }
        await game.settings.set(MODULE_ID, "blockedSaleItems", blockedSaleItems);
        this.render();
    }
    async _onToggleBlockPurchase(event, target) {
        const itemName = target.dataset.name; const blockedPurchaseItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "blockedPurchaseItems"));
        if (blockedPurchaseItems[itemName]) { delete blockedPurchaseItems[itemName]; } else { blockedPurchaseItems[itemName] = true; }
        await game.settings.set(MODULE_ID, "blockedPurchaseItems", blockedPurchaseItems);
        this.render();
    }
    async _onToggleLock(event, target) {
        const itemName = target.dataset.name; const lockedItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lockedItems"));
        if (lockedItems[itemName]) { delete lockedItems[itemName]; } else { lockedItems[itemName] = true; }
        await game.settings.set(MODULE_ID, "lockedItems", lockedItems);
        this.render();
    }
    async _onToggleEpic(event, target) {
        const itemName = target.dataset.name; const epicItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "epicItems"));
        if (epicItems[itemName]) { delete epicItems[itemName]; } else { epicItems[itemName] = true; }
        await game.settings.set(MODULE_ID, "epicItems", epicItems);
        this.render();
    }

    async _getCurrentTabItemNames() {
        const itemNames = [];
        const rows = this.element.querySelectorAll(`.tab[data-tab="${this.activeTab}"] .store-row`);
        rows.forEach(row => {
            const btn = row.querySelector("[data-name]");
            if (btn) itemNames.push(btn.dataset.name);
        });
        return itemNames;
    }

    async _onMarkAllOnSale(event, target) {
        const itemNames = await this._getCurrentTabItemNames();
        const saleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "saleItems"));
        itemNames.forEach(name => saleItems[name] = true);
        await game.settings.set(MODULE_ID, "saleItems", saleItems);
    }

    async _onRemoveAllFromSale(event, target) {
        const itemNames = await this._getCurrentTabItemNames();
        const saleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "saleItems"));
        itemNames.forEach(name => delete saleItems[name]);
        await game.settings.set(MODULE_ID, "saleItems", saleItems);
    }

    async _onShowAllItems(event, target) {
        const itemNames = await this._getCurrentTabItemNames();
        const hiddenItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "hiddenItems"));
        itemNames.forEach(name => delete hiddenItems[name]);
        await game.settings.set(MODULE_ID, "hiddenItems", hiddenItems);
    }

    async _onHideAllItems(event, target) {
        const itemNames = await this._getCurrentTabItemNames();
        const hiddenItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "hiddenItems"));
        itemNames.forEach(name => hiddenItems[name] = true);
        await game.settings.set(MODULE_ID, "hiddenItems", hiddenItems);
    }

    async _onMakeAllPurchasable(event, target) {
        const itemNames = await this._getCurrentTabItemNames();
        const blockedPurchaseItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "blockedPurchaseItems"));
        itemNames.forEach(name => delete blockedPurchaseItems[name]);
        await game.settings.set(MODULE_ID, "blockedPurchaseItems", blockedPurchaseItems);
    }

    async _onDisableAllPurchase(event, target) {
        const itemNames = await this._getCurrentTabItemNames();
        const blockedPurchaseItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "blockedPurchaseItems"));
        itemNames.forEach(name => blockedPurchaseItems[name] = true);
        await game.settings.set(MODULE_ID, "blockedPurchaseItems", blockedPurchaseItems);
    }

    async _onMakeAllSellable(event, target) {
        const itemNames = await this._getCurrentTabItemNames();
        const blockedSaleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "blockedSaleItems"));
        itemNames.forEach(name => delete blockedSaleItems[name]);
        await game.settings.set(MODULE_ID, "blockedSaleItems", blockedSaleItems);
    }

    async _onDisableAllSale(event, target) {
        const itemNames = await this._getCurrentTabItemNames();
        const blockedSaleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "blockedSaleItems"));
        itemNames.forEach(name => blockedSaleItems[name] = true);
        await game.settings.set(MODULE_ID, "blockedSaleItems", blockedSaleItems);
    }

    async _onLockAllItems(event, target) {
        const itemNames = await this._getCurrentTabItemNames();
        const lockedItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lockedItems"));
        itemNames.forEach(name => lockedItems[name] = true);
        await game.settings.set(MODULE_ID, "lockedItems", lockedItems);
    }

    async _onUnlockAllItems(event, target) {
        const itemNames = await this._getCurrentTabItemNames();
        const lockedItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "lockedItems"));
        itemNames.forEach(name => delete lockedItems[name]);
        await game.settings.set(MODULE_ID, "lockedItems", lockedItems);
    }
}

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
        const categoryDefaults = storeActor?.getFlag(MODULE_ID, "stock.categoryDefaults") ||
            StockManager._getDefaultCategorySettings();

        const partyActors = game.actors.filter(a => a.type === "party").map(a => ({ id: a.id, name: a.name })).sort((a, b) => a.name.localeCompare(b.name));

        // Filter packs that have at least one valid item type
        const validItemTypes = VALID_ITEM_TYPES;
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

        // Icon mapping for categories
        const categoryIcons = {
            "Primary Weapons": "fa-sword",
            "Secondary Weapons": "fa-bow-arrow",
            "Wheelchairs": "fa-wheelchair",
            "Armors": "fa-shield-halved",
            "Potions": "fa-flask-round-potion",
            "Consumables": "fa-utensils",
            "Loot": "fa-gem",
            "CustomTab": "fa-store"
        };

        const categoryConfigList = allCategories.map(cat => ({
            key: cat.key,
            label: cat.label,
            icon: categoryIcons[cat.key] || "fa-box",
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
            priceModifier: priceMod,
            saleDiscount: saleDiscount,
            sellRatioPercent: Math.round(sellRatio * 100), // Converted to percent for display
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
            const display = range.nextElementSibling; // The <span> next to the input
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

                // Update ownership info display
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

                // Update stock checkbox and card state
                const stockReady = hasActor && isOk;
                const stockCard = html.querySelector(".stock-toggle-card");
                const stockCheckbox = html.querySelector("#stockEnabledCheckbox");

                if (stockCard && stockCheckbox) {
                    stockCheckbox.disabled = !stockReady;

                    // Update card disabled state
                    if (stockReady) {
                        stockCard.classList.remove("disabled");
                    } else {
                        stockCard.classList.add("disabled");
                        stockCard.classList.remove("active");
                        stockCheckbox.checked = false;
                    }

                    // Update description text
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

                // Don't toggle if disabled
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

        // Tier Matrix: Bulk Column Toggle (toggle all tiers in a column)
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

        // Tier Matrix: Bulk Row Toggle (toggle all tiers in a row/category)
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
            // Initial filter on render
            this._filterCategoryOptions(packSelect);

            // Filter on change
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

        // Store current selection
        const currentCategory = categorySelect.value;

        // Get all available categories
        const allCategories = STANDARD_CATEGORIES.map(c => c.key);

        // If no pack selected, show all categories
        if (!packId) {
            this._updateCategorySelectOptions(categorySelect, allCategories, currentCategory);
            return;
        }

        // Get pack and its index
        const pack = game.packs.get(packId);
        if (!pack) {
            this._updateCategorySelectOptions(categorySelect, allCategories, currentCategory);
            return;
        }

        const index = await pack.getIndex();

        // Find which item types exist in this pack
        const typesInPack = new Set(index.map(entry => entry.type));

        // Filter categories based on types in pack
        const validCategories = allCategories.filter(categoryKey => {
            const expectedType = CATEGORY_ITEM_TYPE[categoryKey];
            return expectedType && typesInPack.has(expectedType);
        });

        // Update the category select options
        this._updateCategorySelectOptions(categorySelect, validCategories, currentCategory);
    }

    /**
     * Updates the category select options
     */
    _updateCategorySelectOptions(categorySelect, validCategories, currentValue) {
        // Clear existing options
        categorySelect.innerHTML = "";

        // Add valid options
        for (const cat of validCategories) {
            const option = document.createElement("option");
            option.value = cat;
            option.textContent = cat;
            if (cat === currentValue) option.selected = true;
            categorySelect.appendChild(option);
        }

        // If current value is not valid, select the first available
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
        // Capture current form values before re-rendering to preserve unsaved selections
        const currentFormValues = [];
        const packSelects = this.element.querySelectorAll("select[name^='customCompendiums.'][name$='.pack']");
        packSelects.forEach((packSelect, index) => {
            const categorySelect = this.element.querySelector(`select[name='customCompendiums.${index}.category']`);
            currentFormValues.push({
                pack: packSelect.value || "",
                category: categorySelect?.value || "Loot"
            });
        });

        // Add the new empty entry
        currentFormValues.push({ pack: "", category: "Loot" });

        // Save the form values (including unsaved selections) and re-render
        await game.settings.set(MODULE_ID, "customCompendiums", currentFormValues);
        this.render();
    }
    
    async _onRemoveCompendium(event, target) {
        const idx = parseInt(target.dataset.index);

        // Capture current form values before re-rendering to preserve unsaved selections
        const currentFormValues = [];
        const packSelects = this.element.querySelectorAll("select[name^='customCompendiums.'][name$='.pack']");
        packSelects.forEach((packSelect, index) => {
            const categorySelect = this.element.querySelector(`select[name='customCompendiums.${index}.category']`);
            currentFormValues.push({
                pack: packSelect.value || "",
                category: categorySelect?.value || "Loot"
            });
        });

        // Remove the specified entry
        currentFormValues.splice(idx, 1);

        // Save the form values (including unsaved selections) and re-render
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
        // Validate Party Actor is configured
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

        // Read current form values directly from input elements
        const storeActor = StockManager.getStoreActor();
        const categoryDefaults = {};

        // Get all stock tier inputs from the form
        const stockInputs = this.element.querySelectorAll("input.stock-tier-input");

        if (stockInputs.length > 0) {
            // Parse input names like "stockDefaults.Primary Weapons.tier1"
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

            // Save the form values to the actor so they persist
            if (Object.keys(categoryDefaults).length > 0) {
                await storeActor.update({
                    [`flags.${MODULE_ID}.stock.categoryDefaults`]: categoryDefaults
                });
            }
        }

        // Fall back to saved/default values if no form inputs found
        const finalDefaults = Object.keys(categoryDefaults).length > 0
            ? categoryDefaults
            : (storeActor?.getFlag(MODULE_ID, "stock.categoryDefaults") || StockManager._getDefaultCategorySettings());

        // Build a map of item name -> uuid from all packs
        const itemUuidMap = new Map();
        for (const packId of Object.values(PACK_MAPPING)) {
            const pack = game.packs.get(packId);
            if (pack) {
                const docs = await pack.getDocuments();
                for (const doc of docs) {
                    itemUuidMap.set(doc.name, doc.uuid);
                }
            }
        }

        // Function to get UUID from item name
        const getItemUuid = (itemName) => itemUuidMap.get(itemName) || null;

        // Use batch update for PRICE_DATA items
        const itemCount = await StockManager.batchApplyDefaults(finalDefaults, getItemUuid);

        // Also process custom compendiums (merged compendiums)
        const customCompendiums = game.settings.get(MODULE_ID, "customCompendiums") || [];
        let customItemCount = 0;

        if (customCompendiums.length > 0) {
            const stockItems = storeActor.getFlag(MODULE_ID, "stock.items") || {};

            for (const custom of customCompendiums) {
                const categoryKey = custom.category;
                const defaults = finalDefaults[categoryKey];
                if (!defaults) continue;

                const pack = game.packs.get(custom.pack);
                if (!pack) continue;

                const docs = await pack.getDocuments();
                for (const doc of docs) {
                    // Filter by expected item type for this category
                    const expectedType = CATEGORY_ITEM_TYPE[categoryKey];
                    if (expectedType && doc.type !== expectedType) continue;

                    // For weapons, check system.secondary to determine correct category
                    if (doc.type === "weapon") {
                        const isSecondary = foundry.utils.getProperty(doc, "system.secondary") === true;
                        if (isSecondary && categoryKey !== "Secondary Weapons") continue;
                        if (!isSecondary && categoryKey === "Secondary Weapons") continue;
                    }

                    // Skip items that already exist in PRICE_DATA (they were handled by batchApplyDefaults)
                    if (PRICE_DATA[categoryKey]?.[doc.name]) continue;

                    // Determine tier from system.tier or {{{tierX}}} tag
                    const tier = getItemTier(doc);

                    // Get quantity from category defaults based on tier
                    const qty = defaults[`tier${tier}`] || 0;

                    // Add to stock items
                    const key = StockManager.sanitizeKey(doc.uuid);
                    stockItems[key] = {
                        stockpile: { q: qty, r: qty, u: false }
                    };
                    customItemCount++;
                }
            }

            // Update actor with custom items stock if any were processed
            if (customItemCount > 0) {
                const version = storeActor.getFlag(MODULE_ID, "stock.version") || 1;
                await storeActor.update({
                    [`flags.${MODULE_ID}.stock.items`]: stockItems,
                    [`flags.${MODULE_ID}.stock.version`]: version + 1
                });
            }
        }

        const totalItems = itemCount + customItemCount;
        ui.notifications.info(`Stock defaults applied to ${totalItems} items!`);
        this.render();
    }

    async _onRestockAll(event, target) {
        // Validate Party Actor is configured
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
        
        const hiddenCategories = {};
        if (expanded.visibility) {
            for (const [key, isVisible] of Object.entries(expanded.visibility)) {
            }
        }
        
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

        // Save custom tab compendiums array
        if (expanded.customTabCompendiums) {
            const tabCompendiumArray = Object.values(expanded.customTabCompendiums).filter(v => typeof v === "string");
            await game.settings.set(MODULE_ID, "customTabCompendiums", tabCompendiumArray);
        }

        await game.settings.set(MODULE_ID, "customTabTierGroup", expanded.customTabTierGroup || false);

        await game.settings.set(MODULE_ID, "priceModifier", expanded.priceModifier);

        // Epic Settings
        const epicLabelVal = (expanded.epicLabel || "Epic").slice(0, 15);
        await game.settings.set(MODULE_ID, "epicLabel", epicLabelVal);
        await game.settings.set(MODULE_ID, "epicIcon", expanded.epicIcon || "fa-star");
        await game.settings.set(MODULE_ID, "epicColor", expanded.epicColor || "#9b59b6");
        await game.settings.set(MODULE_ID, "epicEffect", expanded.epicEffect || "shine");
        await game.settings.set(MODULE_ID, "saleDiscount", expanded.saleDiscount);

        // Convert Percentage back to Decimal for Sell Ratio
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

        // Save category defaults to actor
        if (expanded.stockDefaults) {
            const actor = StockManager.getStoreActor();
            if (actor) {
                await actor.update({
                    [`flags.${MODULE_ID}.stock.categoryDefaults`]: expanded.stockDefaults
                });
            }
        }
    }
}

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
        position: { width: 750, height: 700 }, // Updated width to 750px
        actions: {
            randomizeCategory: StoreRandomizer.prototype._onRandomizeCategory,
            randomizeAll: StoreRandomizer.prototype._onRandomizeAll,
            resetAll: StoreRandomizer.prototype._onResetAll,
            resetCategoryDefaults: StoreRandomizer.prototype._onResetCategoryDefaults, // New action
            openInstructions: StoreRandomizer.prototype._onOpenInstructions, // New action for Instructions
            setMaxToTotal: StoreRandomizer.prototype._onSetMaxToTotal // New action to set Items Max to total
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

        let categories = foundry.utils.deepClone(STANDARD_CATEGORIES);

        const hasCustomTab = customTabCompendiums.some(p => p && p.trim() !== "");
        if (hasCustomTab) {
            categories.push({
                id: "custom-tab",
                label: customTabName || "General",
                key: "CustomTab"
            });
        }

        // Filter out hidden categories
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
                        itemCount += docs.filter(d => VALID_ITEM_TYPES.includes(d.type)).length;
                    }
                }
            } else {
                const catConfig = allowedTiers[cat.key] || {1:true, 2:true, 3:true, 4:true};
                const priceList = PRICE_DATA[cat.key] || {};

                // Count items from default pack
                const defaultPackId = PACK_MAPPING[cat.key];
                if (defaultPackId) {
                    const pack = game.packs.get(defaultPackId);
                    if (pack) {
                        const docs = await pack.getDocuments();
                        for (const doc of docs) {
                            if (priceList.hasOwnProperty(doc.name)) {
                                const tier = priceList[doc.name].tier;
                                if (catConfig[tier]) {
                                    itemCount++;
                                }
                            }
                        }
                    }
                }

                // Count items from custom compendiums
                for (const custom of customCompendiums) {
                    if (custom.category === cat.key) {
                        const pack = game.packs.get(custom.pack);
                        if (pack) {
                            const docs = await pack.getDocuments();
                            for (const doc of docs) {
                                // Filter by expected item type for this category
                                const expectedType = CATEGORY_ITEM_TYPE[cat.key];
                                if (expectedType && doc.type !== expectedType) continue;

                                // For weapons, check system.secondary to determine correct category
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

            // Get default qty from category defaults (use max tier value)
            const storeActor = StockManager.getStoreActor();
            const categoryDefaults = storeActor?.getFlag(MODULE_ID, "stock.categoryDefaults") || StockManager._getDefaultCategorySettings();
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
                    if (!VALID_ITEM_TYPES.includes(doc.type)) continue;
                    if (seenNames.has(doc.name)) continue;
                    seenNames.add(doc.name);

                    let basePrice = 0;
                    const desc = foundry.utils.getProperty(doc, "system.description.value") ||
                                 foundry.utils.getProperty(doc, "system.description") || "";
                    const descString = String(desc);
                    const priceMatch = descString.match(/\{\{\{(\d+)\}\}\}/);
                    if (priceMatch) basePrice = parseInt(priceMatch[1], 10);

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

            // Get items from default pack
            const defaultPackId = PACK_MAPPING[categoryKey];
            if (defaultPackId) {
                const pack = game.packs.get(defaultPackId);
                if (pack) {
                    const docs = await pack.getDocuments();
                    for (const doc of docs) {
                        if (priceList.hasOwnProperty(doc.name)) {
                            const tier = priceList[doc.name].tier;
                            if (catConfig[tier]) {
                                const basePrice = Math.ceil(priceList[doc.name].price * priceMod);
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

            // Get items from custom compendiums
            for (const custom of customCompendiums) {
                if (custom.category === categoryKey) {
                    const pack = game.packs.get(custom.pack);
                    if (pack) {
                        const docs = await pack.getDocuments();
                        for (const doc of docs) {
                            // Filter by expected item type for this category
                            const expectedType = CATEGORY_ITEM_TYPE[categoryKey];
                            if (expectedType && doc.type !== expectedType) continue;

                            // For weapons, check system.secondary to determine correct category
                            if (doc.type === "weapon") {
                                const isSecondary = foundry.utils.getProperty(doc, "system.secondary") === true;
                                if (isSecondary && categoryKey !== "Secondary Weapons") continue;
                                if (!isSecondary && categoryKey === "Secondary Weapons") continue;
                            }

                            const tier = getItemTier(doc);
                            if (catConfig[tier]) {
                                let basePrice = 0;
                                if (priceList.hasOwnProperty(doc.name)) {
                                    basePrice = Math.ceil(priceList[doc.name].price * priceMod);
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
     * Uses the current profile's saved randomizer values, or hardcoded defaults for the "Default" profile.
     */
    _onResetCategoryDefaults(event, target) {
        const categoryKey = target.dataset.category;
        const itemCount = parseInt(target.dataset.itemCount) || 0;
        const defaultQty = parseInt(target.dataset.defaultQty) || 10;

        // Determine defaults based on current profile
        let defaults = { minItems: 0, maxItems: itemCount, qtyMin: 1, qtyMax: defaultQty, salesMin: 0, salesMax: 0, varMin: 0, varMax: 0 };

        const currentProfile = game.settings.get(MODULE_ID, "currentProfile");
        if (currentProfile !== "Default") {
            const profiles = game.settings.get(MODULE_ID, "storeProfiles");
            const profileData = profiles[currentProfile];
            if (profileData?.randomizerSettings?.[categoryKey]) {
                defaults = profileData.randomizerSettings[categoryKey];
            }
        }

        // Find the specific row for this category
        const row = this.element.querySelector(`.category-randomizer-row[data-category="${categoryKey}"]`);

        if (!row) return;

        // Reset values
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

        // Find the specific row for this category
        const row = this.element.querySelector(`.category-randomizer-row[data-category="${categoryKey}"]`);

        if (!row) return;

        // Set max items to total count
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

        // Separate locked items from randomizable items
        const lockedItems = game.settings.get(MODULE_ID, "lockedItems") || {};
        const items = allItems.filter(i => !lockedItems[i.name]);

        if (items.length === 0) return;

        // Clamp values
        const effectiveMax = Math.min(maxItems, items.length);
        const effectiveMin = Math.min(minItems, effectiveMax);

        // Random number of visible items between min and max
        const numVisible = Math.floor(Math.random() * (effectiveMax - effectiveMin + 1)) + effectiveMin;

        // Shuffle items and pick visible ones
        const shuffled = this._fisherYatesShuffle([...items]);
        const visibleItems = shuffled.slice(0, numVisible);
        const hiddenItemNames = shuffled.slice(numVisible).map(i => i.name);

        // Get current settings
        const hiddenItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "hiddenItems")) || {};
        const saleItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "saleItems")) || {};
        const priceOverrides = foundry.utils.deepClone(game.settings.get(MODULE_ID, "priceOverrides")) || {};

        // Clear only unlocked items in this category from hidden/sale/overrides
        for (const item of items) {
            delete hiddenItems[item.name];
            delete saleItems[item.name];
            delete priceOverrides[item.name];
        }

        // Set hidden items
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
                // Random variation between -varMin% and +varMax%
                const variationPercent = (Math.random() * (varMin + varMax)) - varMin;
                const multiplier = 1 + (variationPercent / 100);
                const newPrice = Math.max(1, Math.round(item.basePrice * multiplier));

                // Only set override if price actually changed
                if (newPrice !== item.basePrice) {
                    priceOverrides[item.name] = newPrice;
                }
            }
        }

        // Save settings
        await game.settings.set(MODULE_ID, "hiddenItems", hiddenItems);
        await game.settings.set(MODULE_ID, "saleItems", saleItems);
        await game.settings.set(MODULE_ID, "priceOverrides", priceOverrides);

        // Apply stock quantities if qtyMax > 0 and stock system is enabled
        const stockEnabled = game.settings.get(MODULE_ID, "stockEnabled");
        if (stockEnabled && qtyMax > 0) {
            const actor = StockManager.getStoreActor();
            if (actor) {
                const stockItems = actor.getFlag(MODULE_ID, "stock.items") || {};
                const effectiveQtyMin = Math.max(1, qtyMin);
                const effectiveQtyMax = Math.max(effectiveQtyMin, qtyMax);

                // Set random stock quantity (qtyMin to qtyMax) for visible items
                for (const item of visibleItems) {
                    const qty = Math.floor(Math.random() * (effectiveQtyMax - effectiveQtyMin + 1)) + effectiveQtyMin;
                    const key = StockManager.sanitizeKey(item.uuid);
                    stockItems[key] = {
                        stockpile: { q: qty, r: qty, u: false }
                    };
                }

                // Set stock to 0 for hidden items
                const hiddenItems = shuffled.slice(numVisible);
                for (const item of hiddenItems) {
                    const key = StockManager.sanitizeKey(item.uuid);
                    stockItems[key] = {
                        stockpile: { q: 0, r: 0, u: false }
                    };
                }

                // Single update for all stock changes
                const version = actor.getFlag(MODULE_ID, "stock.version") || 1;
                await actor.update({
                    [`flags.${MODULE_ID}.stock.items`]: stockItems,
                    [`flags.${MODULE_ID}.stock.version`]: version + 1
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

// ─── SETTINGS KEYS USED FOR IMPORT/EXPORT ────────────────────────────────────
const EXPORTABLE_SETTINGS = [
    "storeName", "priceModifier", "allowedTiers", "hiddenCategories",
    "customCompendiums", "priceOverrides", "saleDiscount", "saleItems",
    "hiddenItems", "blockedSaleItems", "blockedPurchaseItems", "lockedItems",
    "epicItems", "epicIcon", "epicColor", "epicLabel", "epicEffect",
    "partyActorId", "customTabName", "customTabCompendiums", "customTabTierGroup",
    "sellRatio", "stockEnabled", "showStockQuantity", "randomizerSettings",
    "currencyMode", "chatPrivacy", "chatMessageStyle"
];

const OBJECT_SETTINGS = [
    "allowedTiers", "hiddenCategories", "priceOverrides", "saleItems",
    "hiddenItems", "blockedSaleItems", "blockedPurchaseItems", "lockedItems",
    "epicItems", "randomizerSettings"
];

const ARRAY_SETTINGS = ["customCompendiums", "customTabCompendiums"];

/**
 * Import / Export Application
 * Allows GMs to export and import all store configuration as JSON.
 */
export class StoreImportExport extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "daggerheart-store-import-export",
        tag: "form",
        window: {
            title: "Import / Export",
            icon: "fas fa-file-import",
            resizable: false
        },
        position: { width: 520, height: "auto" },
        classes: ["daggerheart-store-import-export"],
        actions: {
            exportData: StoreImportExport.prototype._onExport,
            importData: StoreImportExport.prototype._onImport
        }
    };

    static PARTS = {
        main: {
            template: "modules/daggerheart-store/templates/store-import-export.hbs"
        }
    };

    async _prepareContext(options) {
        return {};
    }

    // ── EXPORT ──────────────────────────────────────────────────────────────

    async _onExport(event, target) {
        const settings = {};
        for (const key of EXPORTABLE_SETTINGS) {
            settings[key] = game.settings.get(MODULE_ID, key);
        }

        // Gather profiles (exclude Default — it's hardcoded)
        const allProfiles = foundry.utils.deepClone(game.settings.get(MODULE_ID, "storeProfiles"));
        delete allProfiles["Default"];

        const exportData = {
            module: MODULE_ID,
            version: 1,
            exportDate: new Date().toISOString(),
            settings,
            profiles: allProfiles
        };

        const json = JSON.stringify(exportData, null, 2);
        const filename = `daggerheart-store-export-${new Date().toISOString().slice(0, 10)}.json`;
        foundry.utils.saveDataToFile(json, "application/json", filename);

        ui.notifications.info("Store configuration exported successfully.");
    }

    // ── IMPORT ──────────────────────────────────────────────────────────────

    async _onImport(event, target) {
        const file = await this._pickFile();
        if (!file) return;

        let data;
        try {
            const text = await file.text();
            data = JSON.parse(text);
        } catch (err) {
            return ui.notifications.error("Invalid JSON file. Could not parse.");
        }

        // Validate structure
        if (!data.module || data.module !== MODULE_ID || !data.settings) {
            return ui.notifications.error("This file is not a valid Daggerheart Store export.");
        }

        // Build profile list for the "Import Profile" option
        const profileNames = Object.keys(data.profiles || {});
        const hasProfiles = profileNames.length > 0;

        let profileSelectHtml = "";
        if (hasProfiles) {
            const opts = profileNames.map(n => `<option value="${n}">${n}</option>`).join("");
            profileSelectHtml = `
                <div class="store-dialog-input-group" style="margin-top: 8px;">
                    <label>Select a profile:</label>
                    <select name="selectedProfile">${opts}</select>
                </div>`;
        }

        // Show import options dialog using DialogV2 with 3+ buttons
        const choice = await new Promise(resolve => {
            new DialogV2({
                window: { title: "Import Options", icon: "fas fa-file-import" },
                content: `
                    <div class="store-dialog-content">
                        <h3 class="store-dialog-header" style="color: #D4AF37;">Import Store Data</h3>
                        <p class="store-dialog-message">File loaded successfully. Choose how to import:</p>
                        <p class="store-dialog-description">
                            <b>Overwrite</b> — Replace all current settings with imported data.<br>
                            <b>Merge</b> — Add imported data on top of current settings.<br>
                            ${hasProfiles ? "<b>Import Profile</b> — Add a single profile from the file." : ""}
                        </p>
                        ${hasProfiles ? profileSelectHtml : ""}
                    </div>`,
                classes: ["store-dialog"],
                modal: true,
                buttons: [
                    {
                        action: "overwrite",
                        label: "Import All (Overwrite)",
                        icon: "fas fa-file-import",
                        callback: () => resolve("overwrite")
                    },
                    {
                        action: "merge",
                        label: "Import All (Merge)",
                        icon: "fas fa-plus-circle",
                        callback: () => resolve("merge")
                    },
                    ...(hasProfiles ? [{
                        action: "profile",
                        label: "Import Profile",
                        icon: "fas fa-user-cog",
                        callback: (event, button, dialog) => {
                            const select = button.form?.querySelector("[name='selectedProfile']");
                            resolve({ mode: "profile", name: select?.value || profileNames[0] });
                        }
                    }] : []),
                    {
                        action: "cancel",
                        label: "Cancel",
                        icon: "fas fa-times",
                        callback: () => resolve(null)
                    }
                ],
                close: () => resolve(null)
            }).render(true);
        });

        if (!choice) return;

        if (choice === "overwrite") {
            await this._importOverwrite(data);
        } else if (choice === "merge") {
            await this._importMerge(data);
        } else if (choice?.mode === "profile") {
            await this._importProfile(data, choice.name);
        }
    }

    /**
     * Open a file picker dialog and return the selected File (or null).
     */
    _pickFile() {
        return new Promise(resolve => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json";
            input.addEventListener("change", () => {
                resolve(input.files?.[0] || null);
            });
            input.addEventListener("cancel", () => resolve(null));
            input.click();
        });
    }

    /**
     * Overwrite all settings with imported data.
     */
    async _importOverwrite(data) {
        const imported = data.settings || {};

        for (const key of EXPORTABLE_SETTINGS) {
            if (imported.hasOwnProperty(key)) {
                await game.settings.set(MODULE_ID, key, imported[key]);
            }
        }

        // Overwrite profiles (keep Default empty, replace everything else)
        const importedProfiles = data.profiles || {};
        const newProfiles = { "Default": {} };
        for (const [name, profileData] of Object.entries(importedProfiles)) {
            if (name === "Default") continue;
            newProfiles[name] = profileData;
        }
        await game.settings.set(MODULE_ID, "storeProfiles", newProfiles);
        await game.settings.set(MODULE_ID, "currentProfile", "Default");

        ui.notifications.info("Store configuration imported (overwrite). All settings replaced.");
    }

    /**
     * Merge imported data into current settings (additive).
     */
    async _importMerge(data) {
        const imported = data.settings || {};

        for (const key of EXPORTABLE_SETTINGS) {
            if (!imported.hasOwnProperty(key)) continue;

            if (OBJECT_SETTINGS.includes(key)) {
                // Merge objects: imported values added on top of existing
                const current = foundry.utils.deepClone(game.settings.get(MODULE_ID, key));
                const merged = Object.assign(current, imported[key]);
                await game.settings.set(MODULE_ID, key, merged);
            } else if (ARRAY_SETTINGS.includes(key)) {
                // Merge arrays: concatenate and deduplicate
                const current = game.settings.get(MODULE_ID, key) || [];
                const combined = [...new Set([...current, ...imported[key]])];
                await game.settings.set(MODULE_ID, key, combined);
            }
            // Scalar settings are NOT overwritten in merge mode
        }

        // Merge profiles
        const importedProfiles = data.profiles || {};
        if (Object.keys(importedProfiles).length > 0) {
            const currentProfiles = foundry.utils.deepClone(game.settings.get(MODULE_ID, "storeProfiles"));
            for (const [name, profileData] of Object.entries(importedProfiles)) {
                if (name === "Default") continue;
                const finalName = currentProfiles[name] ? `${name} (Imported)` : name;
                currentProfiles[finalName] = profileData;
            }
            await game.settings.set(MODULE_ID, "storeProfiles", currentProfiles);
        }

        ui.notifications.info("Store configuration imported (merge). Data added to current settings.");
    }

    /**
     * Import a single profile from the file.
     */
    async _importProfile(data, profileName) {
        const importedProfiles = data.profiles || {};
        const profileData = importedProfiles[profileName];

        if (!profileData) {
            return ui.notifications.error(`Profile "${profileName}" not found in the imported file.`);
        }

        const currentProfiles = foundry.utils.deepClone(game.settings.get(MODULE_ID, "storeProfiles"));
        const finalName = currentProfiles[profileName] ? `${profileName} (Imported)` : profileName;
        currentProfiles[finalName] = profileData;

        await game.settings.set(MODULE_ID, "storeProfiles", currentProfiles);
        ui.notifications.info(`Profile "${finalName}" imported successfully.`);
    }
}