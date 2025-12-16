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
 * Main Store Application (Application V2)
 */
export class DaggerheartStore extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options) {
        super(options);
        this.searchQuery = ""; 
        this.activeTab = "primary";
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
        // AJUSTE: Largura padrão reduzida para 800px para ficar mais compacta
        position: { width: 800, height: 700 }, 
        classes: ["daggerheart-store"],
        actions: {
            buyItem: DaggerheartStore.prototype._onBuyItem,
            openConfig: DaggerheartStore.prototype._onOpenConfig,
            resetPrice: DaggerheartStore.prototype._onResetPrice,
            toggleSale: DaggerheartStore.prototype._onToggleSale,
            toggleHidden: DaggerheartStore.prototype._onToggleHidden,
            showToAll: DaggerheartStore.prototype._onShowToAll,
            showToPlayer: DaggerheartStore.prototype._onShowToPlayer,
            savePreset: DaggerheartStore.prototype._onSavePreset,
            loadPreset: DaggerheartStore.prototype._onLoadPreset,
            deletePreset: DaggerheartStore.prototype._onDeletePreset
        }
    };

    static PARTS = {
        main: {
            template: "modules/daggerheart-store/templates/store.hbs",
            scrollable: [".content"]
        }
    };

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
        
        // --- Logic for Presets ---
        const storeProfiles = game.settings.get(MODULE_ID, "storeProfiles") || { "Default": {} };
        const currentProfile = game.settings.get(MODULE_ID, "currentProfile") || "Default";
        
        const profileKeys = Object.keys(storeProfiles);
        if (!profileKeys.includes("Default")) profileKeys.unshift("Default");
        
        const context = {
            isGM: isGM,
            hasActor: hasActor,
            actorName: userActor ? userActor.name : "None",
            currency: game.settings.get(MODULE_ID, "currencyName"),
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
        const allowedTiers = game.settings.get(MODULE_ID, "allowedTiers");
        const hiddenCategories = game.settings.get(MODULE_ID, "hiddenCategories");
        const customCompendiums = game.settings.get(MODULE_ID, "customCompendiums") || [];
        const priceOverrides = game.settings.get(MODULE_ID, "priceOverrides") || {};
        const saleDiscount = game.settings.get(MODULE_ID, "saleDiscount") || 10;
        const saleItems = game.settings.get(MODULE_ID, "saleItems") || {};
        const hiddenItems = game.settings.get(MODULE_ID, "hiddenItems") || {};

        // 1. Build Category List (Clone Standard)
        let categories = foundry.utils.deepClone(STANDARD_CATEGORIES);

        // 2. Add Custom Tab if configured
        const customTabCompendium = game.settings.get(MODULE_ID, "customTabCompendium");
        const customTabName = game.settings.get(MODULE_ID, "customTabName");

        if (customTabCompendium && customTabCompendium.trim() !== "") {
            categories.push({ 
                id: "custom-tab", 
                label: customTabName || "General", 
                key: "CustomTab" 
            });
        }

        // 3. Filter Hidden Categories
        categories = categories.filter(c => !hiddenCategories[c.key]);
        context.categories = categories;

        if (categories.length > 0) {
            const currentTabExists = categories.find(c => c.id === this.activeTab);
            if (!currentTabExists) {
                this.activeTab = categories[0].id;
                context.activeTab = this.activeTab;
            }
        }

        // 4. Populate Items
        for (const cat of categories) {
            if (cat.id === "custom-tab") {
                const pack = game.packs.get(customTabCompendium);
                const customItems = [];

                if (pack) {
                    const docs = await pack.getDocuments();
                    for (const doc of docs) {
                        const isHidden = hiddenItems[doc.name];
                        if (isHidden && !isGM) continue;

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

                        const canAffordPersonal = userGold >= finalPrice;
                        const canBuyPersonal = hasActor && canAffordPersonal;
                        const combinedWealth = partyGold + userGold;
                        const canBuyParty = hasPartyActor && hasActor && (combinedWealth >= finalPrice);

                        customItems.push({
                            id: doc.id,
                            uuid: doc.uuid,
                            name: doc.name,
                            img: doc.img,
                            price: finalPrice,
                            originalPrice: basePrice,
                            isSale: isSale,
                            isHidden: isHidden,
                            isOverridden: isOverridden,
                            canBuyPersonal: canBuyPersonal,
                            canBuyParty: canBuyParty
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

                    const canAffordPersonal = userGold >= finalPrice;
                    const canBuyPersonal = hasActor && canAffordPersonal;
                    const combinedWealth = partyGold + userGold;
                    const canBuyParty = hasPartyActor && hasActor && (combinedWealth >= finalPrice);

                    if (tierGroups[tier]) {
                        tierGroups[tier].items.push({
                            id: doc.id,
                            uuid: doc.uuid,
                            name: doc.name,
                            img: doc.img,
                            price: finalPrice,
                            originalPrice: basePrice,
                            isSale: isSale,
                            isHidden: isHidden,
                            isOverridden: isOverridden,
                            canBuyPersonal: canBuyPersonal,
                            canBuyParty: canBuyParty
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

        const searchInput = html.querySelector(".store-search");
        if (searchInput) {
            searchInput.value = this.searchQuery;
            this._applySearch(searchInput);
            searchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value;
                this._applySearch(e.target);
            });
        }

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

        const tabs = html.querySelectorAll(".sheet-tabs .item");
        tabs.forEach(tab => {
            tab.addEventListener("click", (e) => {
                e.preventDefault();
                const tabId = e.currentTarget.dataset.tab;
                
                this.activeTab = tabId; 
                tabs.forEach(t => t.classList.remove("active"));
                e.currentTarget.classList.add("active");
                
                const contents = html.querySelectorAll(".content .tab");
                contents.forEach(c => {
                    c.classList.remove("active");
                    c.style.display = "none"; 
                });
                
                const target = html.querySelector(`.content .tab[data-tab="${tabId}"]`); 
                if (target) {
                    target.classList.add("active");
                    target.style.display = "block";
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

    async _handleSplitPurchase(itemUuid, itemName, price, userActor, partyActor) {
        const userGold = foundry.utils.getProperty(userActor, "system.gold.coins") || 0;
        const partyGold = foundry.utils.getProperty(partyActor, "system.gold.coins") || 0;
        const currency = game.settings.get(MODULE_ID, "currencyName");

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

        const currency = game.settings.get(MODULE_ID, "currencyName");

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

        const rawContent = `
        <div class="chat-card" style="border: 2px solid #C9A060; border-radius: 8px; overflow: hidden;">
            <header class="card-header flexrow" style="background: #191919 !important; padding: 8px; border-bottom: 2px solid #C9A060;">
                <h3 class="noborder" style="margin: 0; font-weight: bold; color: #C9A060 !important; font-family: 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%;">
                    Store Purchase
                </h3>
            </header>
            <div class="card-content" style="background: #2a2a2a; padding: 20px; min-height: 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; position: relative;">
                <span style="color: #ffffff !important; font-size: 1.1em; font-weight: bold; font-family: 'Lato', sans-serif; line-height: 1.4;">
                    <strong>${recipient.name}</strong> purchased @UUID[${itemUuid}]{${itemName}}
                </span>
                <span style="color: #bbb; font-size: 0.9em; margin-top: 5px;">
                    Paid by: ${payerText}
                </span>
                <span style="color: #d4af37; font-size: 1.2em; font-weight: bold; margin-top: 5px;">
                    -${price} ${currency}
                </span>
            </div>
        </div>`;

        const enrichedContent = await TextEditor.enrichHTML(rawContent, { async: true });

        ChatMessage.create({
            content: enrichedContent,
            speaker: ChatMessage.getSpeaker({ actor: recipient })
        });

        if (game.audio) {
            AudioHelper.play({ 
                src: "modules/daggerheart-store/assets/audio/coins.mp3", 
                volume: 0.8,
                loop: false 
            }, false); 
        }

        ui.notifications.info(`Bought ${itemName}.`);
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
    
    // --- New Action Handlers: Profile System ---

    async _onSavePreset(event, target) {
        // Create Content for Dialog
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
                        
                        // Prevent overwriting the Default factory profile
                        if (name === "Default") {
                            return ui.notifications.error("You cannot overwrite the factory 'Default' profile. Please choose another name.");
                        }

                        // 1. Gather all current settings
                        const currentSettings = {
                            storeName: game.settings.get(MODULE_ID, "storeName"),
                            currencyName: game.settings.get(MODULE_ID, "currencyName"),
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
                            customTabCompendium: game.settings.get(MODULE_ID, "customTabCompendium")
                        };

                        // 2. Fetch existing profiles
                        const profiles = foundry.utils.deepClone(game.settings.get(MODULE_ID, "storeProfiles")) || {};
                        
                        // 3. Save new profile
                        profiles[name] = currentSettings;
                        
                        // 4. Update Settings
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
        // 1. Get selected profile from the dropdown in the UI
        const selectEl = this.element.querySelector(".preset-select");
        if (!selectEl) return;
        
        const profileName = selectEl.value;
        let profileData;

        // 2. Determine Profile Data
        if (profileName === "Default") {
            // Hardcoded Factory Defaults
            profileData = {
                storeName: "Daggerheart: Store",
                currencyName: "Coins",
                priceModifier: 100,
                allowedTiers: {}, // Assuming empty object is handled as 'All Allowed' in prepareContext
                hiddenCategories: {},
                customCompendiums: [],
                priceOverrides: {},
                saleDiscount: 10,
                saleItems: {},
                hiddenItems: {},
                partyActorId: "",
                customTabName: "General",
                customTabCompendium: "daggerheart-store.general-items"
            };
        } else {
            // Fetch from saved profiles
            const profiles = game.settings.get(MODULE_ID, "storeProfiles");
            profileData = profiles[profileName];
            
            if (!profileData) return ui.notifications.error(`Profile "${profileName}" not found.`);
        }

        // 3. Apply settings
        // We iterate and await to ensure all settings are applied before re-rendering
        const settingsToUpdate = [
            "storeName", "currencyName", "priceModifier", "allowedTiers", 
            "hiddenCategories", "customCompendiums", "priceOverrides", 
            "saleDiscount", "saleItems", "hiddenItems", "partyActorId", 
            "customTabName", "customTabCompendium"
        ];

        for (const key of settingsToUpdate) {
            // For Default profile, we always have the keys. For saved, we check.
            if (profileData.hasOwnProperty(key)) {
                await game.settings.set(MODULE_ID, key, profileData[key]);
            }
        }

        // 5. Update Current Profile Tracker
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
                            
                            // Reset to Default
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
        const allowedTiers = game.settings.get(MODULE_ID, "allowedTiers");
        const hiddenCategories = game.settings.get(MODULE_ID, "hiddenCategories");
        const customCompendiums = game.settings.get(MODULE_ID, "customCompendiums") || [];
        const selectedPartyActor = game.settings.get(MODULE_ID, "partyActorId");
        
        const storeName = game.settings.get(MODULE_ID, "storeName");
        const customTabName = game.settings.get(MODULE_ID, "customTabName");
        const customTabCompendium = game.settings.get(MODULE_ID, "customTabCompendium");

        const partyActors = game.actors.filter(a => a.type === "party").map(a => ({ id: a.id, name: a.name })).sort((a, b) => a.name.localeCompare(b.name));
        const availablePacks = game.packs.filter(p => p.documentName === "Item").map(p => ({ id: p.collection, label: `${p.metadata.label} (${p.collection})` })).sort((a, b) => a.label.localeCompare(b.label));
        
        // --- 1. Construct Full Category List for UI ---
        // Start with standard categories
        let allCategories = foundry.utils.deepClone(STANDARD_CATEGORIES);

        // Add Custom Tab to the list so it appears in config
        if (customTabCompendium && customTabCompendium.trim() !== "") {
            allCategories.push({
                id: "custom-tab",
                label: customTabName || "General",
                key: "CustomTab"
            });
        }

        // Map categories for template consumption
        // We use !isHidden for the UI "Visible" checkbox
        const categoryConfigList = allCategories.map(cat => ({
            key: cat.key,
            label: cat.label,
            // Default Tiers: If no setting exists, all enabled.
            tiers: allowedTiers[cat.key] || {1:true, 2:true, 3:true, 4:true},
            // Visibility: Checkbox means "Visible", so we check if NOT hidden
            isVisible: !hiddenCategories[cat.key]
        }));

        return { 
            storeName: storeName,
            customTabName: customTabName,         
            customTabCompendium: customTabCompendium,
            priceModifier: priceMod, 
            saleDiscount: saleDiscount, 
            
            // This now contains ALL categories (standard + custom), never empty.
            categories: categoryConfigList, 
            
            customCompendiums: customCompendiums, 
            availableCategories: STANDARD_CATEGORIES.map(c => c.key), // For dropdowns
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
        
        // --- 1. Handle Visibility Logic Inversion ---
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
            finalHiddenMap[key] = !isVisible; // If visible (checked), hidden is false. If not checked, hidden is true.
        });

        // --- SAVE NEW SETTINGS ---
        await game.settings.set(MODULE_ID, "storeName", expanded.storeName);
        await game.settings.set(MODULE_ID, "customTabName", expanded.customTabName);
        await game.settings.set(MODULE_ID, "customTabCompendium", expanded.customTabCompendium);

        await game.settings.set(MODULE_ID, "priceModifier", expanded.priceModifier);
        await game.settings.set(MODULE_ID, "saleDiscount", expanded.saleDiscount);
        
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