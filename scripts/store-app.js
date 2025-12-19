import { PRICE_DATA, PACK_MAPPING } from "./price-data.js";

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
 * Main Store Application (Application V2)
 */
export class DaggerheartStore extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options) {
        super(options);
        this.searchQuery = ""; 
        this.activeTab = "primary"; // IMPORTANT: This is the source of truth for the active tab
        this.options.window.title = game.settings.get(MODULE_ID, "storeName");
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
            resetPrice: DaggerheartStore.prototype._onResetPrice,
            toggleSale: DaggerheartStore.prototype._onToggleSale,
            toggleHidden: DaggerheartStore.prototype._onToggleHidden,
            showToAll: DaggerheartStore.prototype._onShowToAll,
            showToPlayer: DaggerheartStore.prototype._onShowToPlayer,
            savePreset: DaggerheartStore.prototype._onSavePreset,
            loadPreset: DaggerheartStore.prototype._onLoadPreset,
            deletePreset: DaggerheartStore.prototype._onDeletePreset,
            transferFunds: DaggerheartStore.prototype._onTransferFunds // NEW ACTION
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
        if (!game.user.isGM && game.user.character) {
             await this._handleCurrencyConversion(game.user.character);
        }
        return super.render(options, _options);
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
                damageSection = "C";
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

        console.log(`${MODULE_ID} | Converting currency for ${actor.name}: +${totalAdded} Coins`);

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
        ui.notifications.info(`Store: Converted treasure to ${totalAdded} coins for ${actor.name}.`);
    }

    async _prepareContext(options) {
        this.options.window.title = game.settings.get(MODULE_ID, "storeName");

        const userActor = game.user.character;
        const isGM = game.user.isGM;
        const hasActor = !!userActor;
        
        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        let partyActor = null;
        if (partyActorId) partyActor = game.actors.get(partyActorId);
        const hasPartyActor = !!partyActor;

        const userGold = userActor ? (foundry.utils.getProperty(userActor, "system.gold.coins") || 0) : 0;
        const partyGold = partyActor ? (foundry.utils.getProperty(partyActor, "system.gold.coins") || 0) : 0;
        
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
            currentProfile: currentProfile 
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

        let categories = foundry.utils.deepClone(STANDARD_CATEGORIES);

        const customTabCompendium = game.settings.get(MODULE_ID, "customTabCompendium");
        const customTabName = game.settings.get(MODULE_ID, "customTabName");

        if (customTabCompendium && customTabCompendium.trim() !== "") {
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
                const pack = game.packs.get(customTabCompendium);
                const customItems = [];

                if (pack) {
                    const docs = await pack.getDocuments();
                    for (const doc of docs) {
                        const isHidden = hiddenItems[doc.name];
                        const inventoryItem = hasActor ? userActor.items.find(i => i.name === doc.name) : null;
                        const canSell = !!inventoryItem;

                        if (isHidden && !isGM && !canSell) continue;

                        let basePrice = 0;
                        let isOverridden = false;
                        const desc = foundry.utils.getProperty(doc, "system.description.value") || 
                                     foundry.utils.getProperty(doc, "system.description") || "";
                        const descString = String(desc);
                        const priceMatch = descString.match(/\{\{\{(\d+)\}\}\}/);
                        
                        if (priceMatch) basePrice = parseInt(priceMatch[1], 10);
                        if (priceOverrides.hasOwnProperty(doc.name)) {
                            basePrice = priceOverrides[doc.name];
                            isOverridden = true;
                        } 
                        
                        const isSale = saleItems[doc.name];
                        let finalPrice = basePrice;
                        if (isSale) finalPrice = Math.ceil(basePrice * (1 - saleDiscount/100));

                        const sellPrice = Math.floor(basePrice * sellRatio);

                        const canAffordPersonal = userGold >= finalPrice;
                        const canBuyPersonal = hasActor && canAffordPersonal && (!isHidden || isGM);
                        const combinedWealth = partyGold + userGold;
                        const canBuyParty = hasPartyActor && hasActor && (combinedWealth >= finalPrice) && (!isHidden || isGM);

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

                        customItems.push({
                            id: doc.id,
                            uuid: doc.uuid,
                            name: doc.name,
                            img: doc.img,
                            price: finalPrice,
                            originalPrice: basePrice,
                            isSale: isSale,
                            isHidden: isGM && isHidden,
                            isOverridden: isOverridden,
                            canBuyPersonal: canBuyPersonal,
                            canBuyParty: canBuyParty,
                            canSell: canSell,   
                            sellPrice: sellPrice,
                            itemSummary: itemSummary,
                            isRecommended: isRecommended 
                        });
                    }
                }
                customItems.sort((a, b) => a.name.localeCompare(b.name));
                context.tabs[cat.id] = [{ id: "all", label: "", items: customItems }];
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
                    const isHidden = hiddenItems[doc.name];
                    const inventoryItem = hasActor ? userActor.items.find(i => i.name === doc.name) : null;
                    const canSell = !!inventoryItem;

                    if (isHidden && !isGM && !canSell) continue;

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
                             const sysTier = foundry.utils.getProperty(doc, "system.tier") || 
                                           foundry.utils.getProperty(doc, "system.rarity") || 1;
                             tier = parseInt(sysTier) || 1;
                        }
                    }

                    if (!knownItem) continue;
                    if (!catConfig[tier]) continue;

                    const isSale = saleItems[doc.name];
                    let finalPrice = basePrice;
                    if (isSale) finalPrice = Math.ceil(basePrice * (1 - saleDiscount/100));

                    const sellPrice = Math.floor(basePrice * sellRatio);

                    const canAffordPersonal = userGold >= finalPrice;
                    const canBuyPersonal = hasActor && canAffordPersonal && (!isHidden || isGM);
                    const combinedWealth = partyGold + userGold;
                    const canBuyParty = hasPartyActor && hasActor && (combinedWealth >= finalPrice) && (!isHidden || isGM);

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
                            isOverridden: isOverridden,
                            canBuyPersonal: canBuyPersonal,
                            canBuyParty: canBuyParty,
                            canSell: canSell,
                            sellPrice: sellPrice,
                            itemSummary: itemSummary,
                            isRecommended: isRecommended 
                        });
                    }
                }
            }

            context.tabs[cat.id] = Object.values(tierGroups)
                .filter(g => g.items.length > 0)
                .map(g => {
                    g.items.sort((a, b) => a.name.localeCompare(b.name));
                    return g;
                });
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

        const itemImages = html.querySelectorAll(".item-image");
        itemImages.forEach(img => {
            img.addEventListener("click", async (e) => {
                const uuid = e.currentTarget.dataset.uuid;
                if (!uuid) return;
                const doc = await fromUuid(uuid);
                if (doc && doc.sheet) doc.sheet.render(true);
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

        // --- PERFORMANCE TEST END ---
        // Calculates and logs the time elapsed since Store.Open() was called
        if (globalThis.__storePerformanceStart) {
            const duration = performance.now() - globalThis.__storePerformanceStart;
            console.log(`%c[Performance] Store Render took ${duration.toFixed(2)}ms`, "color: #27ae60; font-weight: bold;");
            
            // Clear the marker so simple re-renders (like switching tabs) don't trigger the log
            globalThis.__storePerformanceStart = null; 
        }
        // ----------------------------
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

        const userGold = foundry.utils.getProperty(userActor, "system.gold.coins") || 0;
        if (userGold < itemPrice) {
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
        const itemName = target.dataset.name;
        const sellPrice = parseInt(target.dataset.price);
        const userActor = game.user.character;

        if (!userActor) return ui.notifications.error("You need an assigned character to sell items.");

        const itemToDelete = userActor.items.find(i => i.name === itemName);
        if (!itemToDelete) return ui.notifications.warn(`You do not have a "${itemName}" to sell.`);

        await itemToDelete.delete();

        const currentCoins = foundry.utils.getProperty(userActor, "system.gold.coins") || 0;
        const newTotal = currentCoins + sellPrice;
        await userActor.update({ "system.gold.coins": newTotal });

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
        const userGold = foundry.utils.getProperty(userActor, "system.gold.coins") || 0;
        const partyGold = foundry.utils.getProperty(partyActor, "system.gold.coins") || 0;

        const content = `
            <div class="form-group" style="margin-bottom: 10px;">
                <label style="display:block; margin-bottom:5px;"><strong>Transfer Direction:</strong></label>
                <select name="direction" style="width: 100%;">
                    <option value="deposit">Deposit to Party (My Gold: ${userGold})</option>
                    <option value="withdraw">Withdraw from Party (Party Gold: ${partyGold})</option>
                </select>
            </div>
            <div class="form-group">
                <label style="display:block; margin-bottom:5px;"><strong>Amount (${currency}):</strong></label>
                <input type="number" name="amount" min="1" step="1" placeholder="0" style="width: 100%;">
            </div>
        `;

        new DialogV2({
            window: { title: "Transfer Funds", icon: "fas fa-exchange-alt", resizable: false },
            content: content,
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
                            if (amount > userGold) return ui.notifications.warn("Insufficient funds.");
                            
                            await userActor.update({ "system.gold.coins": userGold - amount });
                            await partyActor.update({ "system.gold.coins": partyGold + amount });
                            
                            this._createTransferChatMessage(userActor, partyActor, amount, "deposit", currency);

                        } else {
                            if (amount > partyGold) return ui.notifications.warn("Insufficient party funds.");
                            
                            await partyActor.update({ "system.gold.coins": partyGold - amount });
                            await userActor.update({ "system.gold.coins": userGold + amount });

                            this._createTransferChatMessage(userActor, partyActor, amount, "withdraw", currency);
                        }
                        
                        this.render();
                    }
                },
                { action: "cancel", label: "Cancel", icon: "fas fa-times" }
            ]
        }).render(true);
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
        const userGold = foundry.utils.getProperty(userActor, "system.gold.coins") || 0;
        const partyGold = foundry.utils.getProperty(partyActor, "system.gold.coins") || 0;
        const currency = getSystemCurrency();

        let defaultPartyPay = Math.min(partyGold, price);
        let defaultUserPay = price - defaultPartyPay;

        if (defaultUserPay > userGold) {
            return ui.notifications.warn("Combined funds are insufficient.");
        }

        const content = `
            <div class="split-payment-dialog">
                <p style="text-align:center; font-size:1.1em; margin-bottom:15px;">
                    Buying <strong>${itemName}</strong> for <strong>${price} ${currency}</strong>
                </p>
                <div class="form-group split-row">
                    <label style="flex:1;"><i class="fas fa-user"></i> You (${userGold})</label>
                    <input type="number" id="user-share" value="${defaultUserPay}" min="0" max="${userGold}" style="width:80px; text-align:center;">
                </div>
                <div class="form-group split-row" style="margin-top:5px;">
                    <label style="flex:1;"><i class="fas fa-users"></i> ${partyActor.name} (${partyGold})</label>
                    <input type="number" id="party-share" value="${defaultPartyPay}" min="0" max="${partyGold}" style="width:80px; text-align:center;">
                </div>
            </div>
        `;

        new DialogV2({
            window: { title: "Split Payment", icon: "fas fa-coins", resizable: false },
            content: content,
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

        for (const payer of payers) {
            if (payer.amount > 0) {
                const current = foundry.utils.getProperty(payer.actor, "system.gold.coins") || 0;
                await payer.actor.update({ "system.gold.coins": current - payer.amount });
            }
        }

        const itemData = itemFromPack.toObject();
        await recipient.createEmbeddedDocuments("Item", [itemData]);

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
            foundry.audio.AudioHelper.play({ 
                src: "modules/daggerheart-store/assets/audio/coins.mp3", 
                volume: 0.8,
                loop: false 
            }, false); 
        }

        this.render();
    }

    async _onOpenConfig(event, target) { new StoreConfig().render(true); }
    async _onShowToAll(event, target) { globalThis.Store.Show(); }
    async _onShowToPlayer(event, target) {
        const players = game.users.filter(u => !u.isGM && u.active);
        if (players.length === 0) return ui.notifications.warn("No active players.");
        const options = players.map(p => `<option value="${p.name}">${p.name}</option>`).join("");
        const content = `<div style="margin-bottom:10px;"><label>Select Player:</label><select name="targetPlayer" style="width:100%">${options}</select></div>`;
        new DialogV2({
            window: { title: "Show Store to Player" },
            content: content,
            buttons: [{ action: "show", label: "Show", icon: "fas fa-share", callback: (event, button, dialog) => { const select = button.form.elements.targetPlayer; globalThis.Store.Show(select.value); } }]
        }).render(true);
    }
    
    async _onSavePreset(event, target) {
        const content = `
            <div style="padding: 5px 0;">
                <label>Profile Name:</label>
                <input type="text" name="profileName" value="New Profile" style="width: 100%; margin-top: 5px; padding: 5px;">
                <p class="notes" style="font-size: 0.9em; color: #888; margin-top: 5px;">
                    This will save all current store settings (prices, sales, hidden items, configuration) to a new profile.
                </p>
            </div>
        `;

        new DialogV2({
            window: { title: "Save Store Profile", icon: "fas fa-save" },
            content: content,
            buttons: [
                {
                    action: "save",
                    label: "Save Profile",
                    icon: "fas fa-save",
                    callback: async (event, button, dialog) => {
                        const name = button.form.elements.profileName.value.trim() || "New Profile";
                        
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
                            partyActorId: game.settings.get(MODULE_ID, "partyActorId"),
                            customTabName: game.settings.get(MODULE_ID, "customTabName"),
                            customTabCompendium: game.settings.get(MODULE_ID, "customTabCompendium"),
                            sellRatio: game.settings.get(MODULE_ID, "sellRatio")
                        };

                        const profiles = foundry.utils.deepClone(game.settings.get(MODULE_ID, "storeProfiles")) || {};
                        profiles[name] = currentSettings;
                        
                        await game.settings.set(MODULE_ID, "storeProfiles", profiles);
                        await game.settings.set(MODULE_ID, "currentProfile", name);
                        
                        ui.notifications.info(`Profile "${name}" saved successfully.`);
                        this.render();
                    }
                },
                { action: "cancel", label: "Cancel", icon: "fas fa-times" }
            ]
        }).render(true);
    }

    async _onLoadPreset(event, target) {
        const selectEl = this.element.querySelector(".preset-select");
        if (!selectEl) return;
        
        const profileName = selectEl.value;
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
                partyActorId: "",
                customTabName: "General",
                customTabCompendium: "daggerheart-store.general-items",
                sellRatio: 0.5
            };
        } else {
            const profiles = game.settings.get(MODULE_ID, "storeProfiles");
            profileData = profiles[profileName];
            
            if (!profileData) return ui.notifications.error(`Profile "${profileName}" not found.`);
        }

        const settingsToUpdate = [
            "storeName", "priceModifier", "allowedTiers", 
            "hiddenCategories", "customCompendiums", "priceOverrides", 
            "saleDiscount", "saleItems", "hiddenItems", "partyActorId", 
            "customTabName", "customTabCompendium", "sellRatio"
        ];

        for (const key of settingsToUpdate) {
            if (profileData.hasOwnProperty(key)) {
                await game.settings.set(MODULE_ID, key, profileData[key]);
            }
        }

        await game.settings.set(MODULE_ID, "currentProfile", profileName);

        const msg = profileName === "Default" ? "Factory Defaults restored." : `Profile "${profileName}" loaded.`;
        ui.notifications.info(msg);
        
        this.render();
    }
    
    async _onDeletePreset(event, target) {
        const selectEl = this.element.querySelector(".preset-select");
        if (!selectEl) return;
        const profileName = selectEl.value;

        if (profileName === "Default") {
            return ui.notifications.warn("You cannot delete the Default profile.");
        }

        new DialogV2({
            window: { title: "Delete Profile", icon: "fas fa-trash" },
            content: `<p>Are you sure you want to delete the profile <strong>${profileName}</strong>? This cannot be undone.</p>`,
            buttons: [
                {
                    action: "delete",
                    label: "Delete",
                    icon: "fas fa-trash",
                    callback: async (event, button, dialog) => {
                        const profiles = foundry.utils.deepClone(game.settings.get(MODULE_ID, "storeProfiles"));
                        if (profiles[profileName]) {
                            delete profiles[profileName];
                            await game.settings.set(MODULE_ID, "storeProfiles", profiles);
                            
                            await game.settings.set(MODULE_ID, "currentProfile", "Default");
                            
                            ui.notifications.info(`Profile "${profileName}" deleted.`);
                            this.render();
                        }
                    }
                },
                { action: "cancel", label: "Cancel", icon: "fas fa-times" }
            ]
        }).render(true);
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
    }
    async _onToggleHidden(event, target) {
        const itemName = target.dataset.name; const hiddenItems = foundry.utils.deepClone(game.settings.get(MODULE_ID, "hiddenItems"));
        if (hiddenItems[itemName]) { delete hiddenItems[itemName]; } else { hiddenItems[itemName] = true; }
        await game.settings.set(MODULE_ID, "hiddenItems", hiddenItems);
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
        position: { width: 700, height: "auto" },
        form: { handler: StoreConfig.prototype._updateSettings, closeOnSubmit: true },
        actions: { addCompendium: StoreConfig.prototype._onAddCompendium, removeCompendium: StoreConfig.prototype._onRemoveCompendium }
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
        const customTabCompendium = game.settings.get(MODULE_ID, "customTabCompendium");

        const partyActors = game.actors.filter(a => a.type === "party").map(a => ({ id: a.id, name: a.name })).sort((a, b) => a.name.localeCompare(b.name));
        const availablePacks = game.packs.filter(p => p.documentName === "Item").map(p => ({ id: p.collection, label: `${p.metadata.label} (${p.collection})` })).sort((a, b) => a.label.localeCompare(b.label));
        
        let allCategories = foundry.utils.deepClone(STANDARD_CATEGORIES);

        if (customTabCompendium && customTabCompendium.trim() !== "") {
            allCategories.push({
                id: "custom-tab",
                label: customTabName || "General",
                key: "CustomTab"
            });
        }

        const categoryConfigList = allCategories.map(cat => ({
            key: cat.key,
            label: cat.label,
            tiers: allowedTiers[cat.key] || {1:true, 2:true, 3:true, 4:true},
            isVisible: !hiddenCategories[cat.key]
        }));

        return { 
            storeName: storeName,
            customTabName: customTabName,         
            customTabCompendium: customTabCompendium,
            priceModifier: priceMod, 
            saleDiscount: saleDiscount, 
            sellRatioPercent: Math.round(sellRatio * 100), // Converted to percent for display
            categories: categoryConfigList, 
            customCompendiums: customCompendiums, 
            availableCategories: STANDARD_CATEGORIES.map(c => c.key), 
            availablePacks: availablePacks, 
            partyActors: partyActors, 
            selectedPartyActor: selectedPartyActor,
            activeTab: this.currentTab 
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
    }

    async _onAddCompendium(event, target) {
        const settings = foundry.utils.deepClone(game.settings.get(MODULE_ID, "customCompendiums"));
        settings.push({ pack: "", category: "Loot" }); 
        await game.settings.set(MODULE_ID, "customCompendiums", settings); 
        this.render();
    }
    
    async _onRemoveCompendium(event, target) {
        const idx = target.dataset.index; 
        const settings = foundry.utils.deepClone(game.settings.get(MODULE_ID, "customCompendiums"));
        settings.splice(idx, 1); 
        await game.settings.set(MODULE_ID, "customCompendiums", settings); 
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
        if (expanded.customTabName) allKeys.push("CustomTab");

        const finalHiddenMap = {};
        allKeys.forEach(key => {
            const isVisible = expanded.visibility && expanded.visibility[key];
            finalHiddenMap[key] = !isVisible; 
        });

        await game.settings.set(MODULE_ID, "storeName", expanded.storeName);
        await game.settings.set(MODULE_ID, "customTabName", expanded.customTabName);
        await game.settings.set(MODULE_ID, "customTabCompendium", expanded.customTabCompendium);

        await game.settings.set(MODULE_ID, "priceModifier", expanded.priceModifier);
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
        
        ui.notifications.info("Store Configuration Saved.");
    }
}