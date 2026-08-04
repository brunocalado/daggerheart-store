import { DaggerheartStore } from "./store-app.js";
import { StoreImportExport } from "./store-import-export.js";
import { StoreItemTagger } from "./store-item-tagger.js";
import { StoreWelcome } from "./store-welcome.js";
import { StockManager } from "./stock-manager.js";
import { migrateTags } from "./store-migration.js";
import { registerQueryHandlers, queryCancelNegotiation } from "./socket.js";
import { MODULE_ID, NEGOTIATION_FLAG_KEY, NEGOTIATION_STAGES } from "./store-constants.js";
import { GMNegotiationApp } from "./store-negotiation-gm.js";
import { addGold, getActorWealth, createStoreChatMessage } from "./store-utils.js";
const { DialogV2 } = foundry.applications.api;

Hooks.once("init", () => {
    // Settings Configuration
    game.settings.register(MODULE_ID, "storeName", {
        name: "Store Name", scope: "world", config: false, type: String, default: "Daggerheart: Store"
    });
    
    game.settings.register(MODULE_ID, "priceModifier", {
        name: "Price Multiplier (%)", scope: "world", config: false, type: Number, default: 100
    });
    
    // Currency Mode Setting
    game.settings.register(MODULE_ID, "currencyMode", {
        name: "Currency Mode",
        hint: "Define how the store handles character currency.",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "disabled": "Disabled (Manual Only)",
            "update_all": "Update All (Convert to Coins)",
            "smart": "Smart (Auto-Optimize Currency)"
        },
        default: "update_all"
    });
    
    // Sell Ratio: Hidden from sidebar settings; managed within the Store Config UI
    game.settings.register(MODULE_ID, "sellRatio", {
        name: "Sell Ratio", 
        hint: "Multiplier for selling items (0.5 = 50% of store price).",
        scope: "world", 
        config: false, 
        type: Number, 
        default: 0.5
    });

    game.settings.register(MODULE_ID, "allowedTiers", {
        name: "Allowed Tiers", scope: "world", config: false, type: Object, default: {}
    });
    game.settings.register(MODULE_ID, "hiddenCategories", {
        name: "Hidden Categories", scope: "world", config: false, type: Object, default: {}
    });
    game.settings.register(MODULE_ID, "customCompendiums", {
        name: "Custom Compendiums", scope: "world", config: false, type: Array, default: []
    });
    game.settings.register(MODULE_ID, "priceOverrides", {
        name: "Price Overrides", scope: "world", config: false, type: Object, default: {}
    });
    game.settings.register(MODULE_ID, "saleDiscount", {
        name: "Sale Discount (%)", scope: "world", config: false, type: Number, default: 10
    });
    game.settings.register(MODULE_ID, "saleItems", {
        name: "Sale Items", scope: "world", config: false, type: Object, default: {}
    });
    game.settings.register(MODULE_ID, "hiddenItems", {
        name: "Hidden Items", scope: "world", config: false, type: Object, default: {}
    });
    game.settings.register(MODULE_ID, "blockedSaleItems", {
        name: "Blocked Sale Items", scope: "world", config: false, type: Object, default: {}
    });
    game.settings.register(MODULE_ID, "blockedPurchaseItems", {
        name: "Blocked Purchase Items", scope: "world", config: false, type: Object, default: {}
    });
    game.settings.register(MODULE_ID, "lockedItems", {
        name: "Locked Items", scope: "world", config: false, type: Object, default: {}
    });
    game.settings.register(MODULE_ID, "epicItems", {
        name: "Epic Items", scope: "world", config: false, type: Object, default: {}
    });
    game.settings.register(MODULE_ID, "epicIcon", {
        name: "Epic Icon", scope: "world", config: false, type: String, default: "fa-star"
    });
    game.settings.register(MODULE_ID, "epicColor", {
        name: "Epic Color", scope: "world", config: false, type: String, default: "#9b59b6"
    });
    game.settings.register(MODULE_ID, "epicLabel", {
        name: "Epic Label", scope: "world", config: false, type: String, default: "Epic"
    });
    game.settings.register(MODULE_ID, "epicEffect", {
        name: "Epic Effect", scope: "world", config: false, type: String, default: "shine"
    });

    // Party Configuration Setting
    game.settings.register(MODULE_ID, "partyActorId", {
        name: "Party Actor ID", scope: "world", config: false, type: String, default: ""
    });

    // Use Default Compendiums
    game.settings.register(MODULE_ID, "useDefaultCompendiums", {
        name: "Use Default Compendiums", scope: "world", config: false, type: Boolean, default: true
    });

    // Custom Tab Configuration
    game.settings.register(MODULE_ID, "customTabName", {
        name: "Custom Tab Name", scope: "world", config: false, type: String, default: "General"
    });
    game.settings.register(MODULE_ID, "customTabCompendium", {
        name: "Custom Tab Compendium (Legacy)", scope: "world", config: false, type: String, default: ""
    });
    game.settings.register(MODULE_ID, "customTabCompendiums", {
        name: "Custom Tab Compendiums", scope: "world", config: false, type: Array, default: []
    });
    game.settings.register(MODULE_ID, "customTabTierGroup", {
        name: "Custom Tab Tier Grouping", scope: "world", config: false, type: Boolean, default: true
    });

    // Extra Item Types for General Tab
    game.settings.register(MODULE_ID, "extraItemTypes", {
        name: "Extra Item Types (General Tab)",
        hint: "Add custom item types so they can appear in the General tab. Separate multiple types with semicolons (;). Example: hotpot-daggerheart.ingredient; another-module.mytype — Leave empty to use only the default types (weapon, armor, consumable, loot).",
        scope: "world",
        config: true,
        type: String,
        default: ""
    });

    // --- VENDOR SETTINGS ---
    game.settings.register(MODULE_ID, "vendorName", {
        name: "Vendor Name", scope: "world", config: false, type: String, default: ""
    });
    game.settings.register(MODULE_ID, "vendorDescription", {
        name: "Vendor Description", scope: "world", config: false, type: String, default: ""
    });
    game.settings.register(MODULE_ID, "vendorImage", {
        name: "Vendor Image",
        hint: "Square image displayed next to the vendor name in the player header.",
        scope: "world", config: false, type: String, default: ""
    });
    game.settings.register(MODULE_ID, "vendorRelationships", {
        name: "Vendor Relationships", scope: "world", config: false, type: Object, default: {}
    });
    game.settings.register(MODULE_ID, "vendorRelationLevels", {
        name: "Vendor Relation Level Modifiers",
        scope: "world", config: false, type: Object,
        default: { "-2": 25, "-1": 10, "0": 0, "1": 10, "2": 25 }
    });
    game.settings.register(MODULE_ID, "vendorPresenceEnabled", {
        name: "Vendor Presence Modifier Enabled",
        scope: "world", config: false, type: Boolean, default: false
    });
    game.settings.register(MODULE_ID, "vendorPresenceModifier", {
        name: "Vendor Presence Modifier (% per point)",
        scope: "world", config: false, type: Number, default: 1.5
    });

    // --- NEGOTIATION SETTINGS ---
    game.settings.register(MODULE_ID, "negotiationsEnabled", {
        name: "Enable Price Negotiations",
        scope: "world",
        config: false,
        type: Boolean,
        default: false
    });

    // --- RANDOMIZER SETTINGS ---
    game.settings.register(MODULE_ID, "randomizerSettings", {
        name: "Randomizer Settings",
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });

    // --- PROFILES SETTINGS ---
    game.settings.register(MODULE_ID, "storeProfiles", {
        name: "Store Profiles",
        scope: "world",
        config: false,
        type: Object,
        default: { "Default": {} } 
    });

    game.settings.register(MODULE_ID, "currentProfile", {
        name: "Current Profile",
        scope: "world",
        config: false,
        type: String,
        default: "Default"
    });

    // --- CHAT SETTINGS ---
    game.settings.register(MODULE_ID, "chatPrivacy", {
        name: "Chat Privacy",
        hint: "Control visibility of store transaction messages.",
        scope: "world",
        config: true, 
        type: String,
        choices: {
            "public": "Public (Visible to everyone)",
            "private": "Private (Visible only to Player & GM)"
        },
        default: "public"
    });

    // NEW: Chat Message Color Style
    game.settings.register(MODULE_ID, "chatMessageStyle", {
        name: "Chat Message Style",
        hint: "Choose between the classic gold theme or color-coded borders based on the action (Buy=Red, Sell=Green, etc).",
        scope: "world", // Using world so everyone sees the same style, but could be client
        config: true,
        type: String,
        choices: {
            "default": "Default (Gold)",
            "colored": "Color Coded (Action Based)"
        },
        default: "colored"
    });

    // --- WELCOME SCREEN SETTING ---
    game.settings.register(MODULE_ID, "welcomeScreenShown", {
        name: "Hide Welcome Screen",
        hint: "If checked, the Daggerheart Store welcome screen will not appear on startup.",
        scope: "client", 
        config: true,    
        type: Boolean,
        default: false
    });

    // Communication Channel Setting
    game.settings.register(MODULE_ID, "openStoreRequest", {
        scope: "world",
        config: false,
        type: Object,
        default: { target: "none", time: 0 },
        onChange: _handleOpenStoreRequest
    });

    // Limited Stock System Settings
    game.settings.register(MODULE_ID, "stockEnabled", {
        name: "Enable Limited Stock",
        scope: "world",
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE_ID, "showStockQuantity", {
        name: "Show Exact Stock Quantities",
        scope: "world",
        config: false,
        type: Boolean,
        default: true
    });

    // --- IMPORT / EXPORT MENU ---
    game.settings.registerMenu(MODULE_ID, "importExport", {
        name: "Import / Export",
        label: "Import / Export",
        hint: "Export or import store configuration as a JSON file.",
        icon: "fas fa-file-import",
        type: StoreImportExport,
        restricted: true
    });

    // Register query handlers for GM-serialized writes (stock, party funds)
    registerQueryHandlers();

    // --- PRELOAD TEMPLATE PARTIALS ---
    foundry.applications.handlebars.loadTemplates([
        "modules/daggerheart-store/templates/partials/store-header.hbs",
        "modules/daggerheart-store/templates/partials/store-search-bar.hbs",
        "modules/daggerheart-store/templates/partials/store-item-row.hbs",
        "modules/daggerheart-store/templates/partials/store-gm-controls.hbs",
        "modules/daggerheart-store/templates/partials/store-player-controls.hbs",
        "modules/daggerheart-store/templates/partials/store-sell-tab.hbs",
        "modules/daggerheart-store/templates/partials/config-general-tab.hbs",
        "modules/daggerheart-store/templates/partials/config-categories-tab.hbs",
        "modules/daggerheart-store/templates/partials/config-tiers-tab.hbs",
        "modules/daggerheart-store/templates/partials/config-compendiums-tab.hbs",
        "modules/daggerheart-store/templates/partials/config-stock-tab.hbs",
        "modules/daggerheart-store/templates/partials/config-vendor-tab.hbs",
        "modules/daggerheart-store/templates/partials/vendor-tooltip.hbs",
        "modules/daggerheart-store/templates/player-negotiation.hbs",
        "modules/daggerheart-store/templates/gm-negotiation.hbs",
    ]);

    // --- HANDLEBARS HELPERS FOR COMPARISON ---
    Handlebars.registerHelper("compareClass", (direction) => {
        if (direction === "up") return "compare-better";
        if (direction === "down") return "compare-worse";
        return "";
    });

    Handlebars.registerHelper("compareIcon", (direction) => {
        if (direction === "up") return new Handlebars.SafeString('<i class="fas fa-caret-up"></i>');
        if (direction === "down") return new Handlebars.SafeString('<i class="fas fa-caret-down"></i>');
        return "";
    });

    Handlebars.registerHelper("eq", (a, b) => {
        return a == b;
    });

    Handlebars.registerHelper("toString", (val) => {
        return String(val);
    });

    Handlebars.registerHelper("tier", (val) => {
        return `{{{tier${val}}}}`;
    });
});

// Singleton Instance Holder
let storeInstance = null;
function getStoreInstance() {
    if (!storeInstance) {
        storeInstance = new DaggerheartStore();
    }
    return storeInstance;
}

/**
 * Handles the incoming request to open the store (triggered by setting change)
 */
async function _handleOpenStoreRequest(value) {
    if (!value || !value.target) return;

    const targetUser = value.target;
    const currentUser = game.user.id;

    if (targetUser === "all" || targetUser === currentUser) {
        const app = getStoreInstance();
        // Await render so this.element is guaranteed to exist before bringToFront accesses .style
        await app.render({ force: true, window: { display: "block" } });
        if (app.minimized) await app.maximize();
        app.bringToFront();
    }
}

Hooks.once("ready", async () => {
    // Migrate legacy customTabCompendium (string) to customTabCompendiums (array)
    if (game.user.isGM) {
        const legacy = game.settings.get(MODULE_ID, "customTabCompendium");
        const current = game.settings.get(MODULE_ID, "customTabCompendiums") || [];
        if (current.length === 0) {
            if (legacy && legacy.trim() !== "") {
                // Existing world: migrate old setting value
                await game.settings.set(MODULE_ID, "customTabCompendiums", [legacy]);
                await game.settings.set(MODULE_ID, "customTabCompendium", "");
                console.log(`${MODULE_ID} | Migrated customTabCompendium to customTabCompendiums`);
            } else {
                // New world or cleared setting: set initial default
                await game.settings.set(MODULE_ID, "customTabCompendiums", ["daggerheart-store.general-items"]);
            }
        }
    }

    game.daggerheartStore = game.daggerheartStore ?? {};
    game.daggerheartStore.migrateTags = migrateTags;

    globalThis.Store = {
        Open: async () => {
            const app = getStoreInstance();
            
            // LINKED ACTOR CHECK
            if (!game.user.isGM && !game.user.character) {
                const journalUUID = "Compendium.daggerheart-store.journals.JournalEntry.fIXCeXWeDbAu3uFg";
                const link = `@UUID[${journalUUID}]{here}`;
                
                const messageContent = `
                <div class="chat-card" style="border: 2px solid #C9A060; border-radius: 8px; overflow: hidden;">
                    <header class="card-header flexrow" style="background: #191919 !important; padding: 8px; border-bottom: 2px solid #C9A060;">
                        <h3 class="noborder" style="margin: 0; font-weight: bold; color: #C9A060 !important; font-family: 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%;">
                            Store Access Issue
                        </h3>
                    </header>
                    <div class="card-content" style="background: #2a2a2a; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #eee;">
                        <p style="margin-bottom: 10px; font-family: 'Lato', sans-serif;">
                            The player <strong>${game.user.name}</strong> can’t use the store without a linked actor.
                        </p>
                        <p style="font-size: 0.9em; color: #ccc;">
                            Read the full instructions ${link}
                        </p>
                    </div>
                </div>`;

                const recipients = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
                if (!recipients.includes(game.user.id)) recipients.push(game.user.id);

                await createStoreChatMessage({
                    content: messageContent,
                    speaker: { alias: "Store System" },
                    whisper: recipients
                });
            }

            app.render({ force: true });
        },
        /**
         * Programmatically broadcasts the store open request to one or all clients.
         * Optionally loads a named profile before broadcasting, so the correct store
         * is active by the time clients receive the open request.
         * Only the GM may call this; non-GM callers receive a warning and no-op.
         * @param {object} [options={}]
         * @param {string} [options.username] - Target a specific player by name.
         *   Omit to broadcast to all connected clients.
         * @param {string} [options.store] - Profile name to load before opening.
         *   Omit to keep the currently active profile.
         * @returns {Promise<void>}
         */
        Show: async (options = {}) => {
            if (!game.user.isGM) return ui.notifications.warn("Only GM can share store.");

            const { username, store } = options;

            // Load the named profile first so it is committed to world settings before
            // the openStoreRequest fires — clients render against the already-updated state.
            if (store !== undefined) {
                const app = getStoreInstance();
                await app.applyProfileByName(store);
            }

            let targetId = "all";
            if (username) {
                const targetUser = game.users.getName(username);
                if (!targetUser) return ui.notifications.error(`User "${username}" not found.`);
                if (!targetUser.active) ui.notifications.warn(`User "${username}" is currently offline.`);
                targetId = targetUser.id;
            }

            await game.settings.set(MODULE_ID, "openStoreRequest", {
                target: targetId,
                time: Date.now()
            });
        },
        EditTags: () => {
            if (!game.user.isGM) {
                return ui.notifications.warn("Only GMs can use the Item Tagger.");
            }
            new StoreItemTagger().render(true);
        }
    };

    if (game.user.isGM) {
        const welcomeHidden = game.settings.get(MODULE_ID, "welcomeScreenShown");
        if (!welcomeHidden) {
            new StoreWelcome().render(true);
        }

        // Initialize stock data on party actor if needed
        StockManager.initializeStockData();
    }
});

Hooks.on("updateSetting", (setting) => {
    if (setting.key.startsWith(MODULE_ID) && setting.key !== `${MODULE_ID}.openStoreRequest`) {
        if (storeInstance && storeInstance.rendered) {
            if (setting.key === `${MODULE_ID}.storeName`) {
                const newTitle = game.settings.get(MODULE_ID, "storeName");
                storeInstance.options.window.title = newTitle;
                if (storeInstance.window) storeInstance.window.title = newTitle;
            }
            storeInstance.render();
        }
    }
});

Hooks.on("updateActor", async (actor, changes, options, userId) => {
    // Check if this is the configured Party Actor (used for stock and negotiations)
    const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
    if (!partyActorId || actor.id !== partyActorId) return;

    const moduleFlags = foundry.utils.getProperty(changes, `flags.${MODULE_ID}`) || {};

    // --- Stock: refresh store UI when stock data changes ---
    // The changes object may arrive flat (dot-notation keys) or nested,
    // so check both: hasProperty for nested, and key prefix scan for flat.
    const stockPrefix = "stock_";
    const stockChanged = Object.keys(moduleFlags).some(k => k.startsWith(stockPrefix))
        || Object.keys(changes).some(k => k.startsWith(`flags.${MODULE_ID}.${stockPrefix}`));
    if (stockChanged && storeInstance?.rendered) {
        console.log(`${MODULE_ID} | Stock updated, refreshing store UI`);
        storeInstance.render();
    }

    // --- Negotiations: react to flag changes ---
    const negChanged = Object.prototype.hasOwnProperty.call(moduleFlags, NEGOTIATION_FLAG_KEY)
        || Object.keys(changes).some(k => k === `flags.${MODULE_ID}.${NEGOTIATION_FLAG_KEY}`
            || k.startsWith(`flags.${MODULE_ID}.${NEGOTIATION_FLAG_KEY}.`));
    if (!negChanged) return;

    const fullFlag = actor.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);

    // GM: auto-open GMNegotiationApp when a new negotiation starts.
    // foundry.applications.instances is the v14 registry of all open ApplicationV2 windows.
    if (game.user.isGM && fullFlag?.active) {
        const existing = foundry.applications.instances.get("daggerheart-store-negotiation-gm");
        if (!existing) {
            const gmApp = new GMNegotiationApp();
            try {
                await gmApp.render(true);
            } catch (err) {
                console.error(`${MODULE_ID} | Failed to open GMNegotiationApp:`, err);
            }
        } else {
            existing.render();
            existing.bringToFront?.();
        }
    }

    // Player: execute buy/sell and clean up when the GM accepts.
    if (!game.user.isGM
        && fullFlag?.stage === NEGOTIATION_STAGES.ACCEPTED
        && fullFlag?.playerId === game.user.id
    ) {
        const userActor = game.user.character;
        if (userActor && storeInstance) {
            if (fullFlag.type === "buy") {
                // Safety net: the client-side checks block unaffordable offers up front, but
                // the player's wealth may have dropped in the meantime (e.g. another purchase
                // while this negotiation was pending GM review). Re-check before spending.
                if (getActorWealth(userActor) < fullFlag.agreedPrice) {
                    ui.notifications.error("You no longer have enough coins to cover this offer. Purchase cancelled.");
                } else {
                    await storeInstance._executePurchase({
                        itemUuid:  fullFlag.itemUuid,
                        itemName:  fullFlag.itemName,
                        price:     fullFlag.agreedPrice,
                        recipient: userActor,
                        payers:    [{ actor: userActor, amount: fullFlag.agreedPrice, name: userActor.name }]
                    });
                }
            } else {
                // Sell: delete the owned item and credit the agreed price.
                const itemToDelete = fullFlag.itemId
                    ? userActor.items.get(fullFlag.itemId)
                    : userActor.items.find(i => i.name === fullFlag.itemName);
                if (itemToDelete) await itemToDelete.delete();

                const stockEnabled = game.settings.get(MODULE_ID, "stockEnabled");
                if (stockEnabled && fullFlag.itemUuid) {
                    const { StockManager } = await import("./stock-manager.js");
                    await StockManager.incrementStock(fullFlag.itemUuid, 1);
                }

                await addGold(userActor, fullFlag.agreedPrice);
            }
        }

        // Clear the flag via query so the GM client performs the write.
        await queryCancelNegotiation();
    }
});

Hooks.on("preDeleteActor", (actor, options, userId) => {
    const partyActorId = game.settings.get(MODULE_ID, "partyActorId");

    if (!partyActorId || actor.id !== partyActorId) {
        return true;
    }

    DialogV2.prompt({
        window: {
            title: "Cannot Delete Party Actor",
            icon: "fas fa-exclamation-triangle"
        },
        content: `
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ff9800; margin-bottom: 15px;"></i>
                <h3 style="color: #ff9800; margin-bottom: 10px;">Protected Actor</h3>
                <p style="margin-bottom: 10px;">
                    The actor <strong>"${actor.name}"</strong> is currently configured as the <strong>Party Actor</strong> in Daggerheart Store.
                </p>
                <p style="color: #ccc; font-size: 0.9em; line-height: 1.4;">
                    To delete this actor, you must first:<br>
                    1. Open the Store Configuration<br>
                    2. Go to the "General" tab<br>
                    3. Set "Party Actor" to "None"
                </p>
            </div>
        `,
        ok: {
            label: "I Understand",
            icon: "fas fa-check"
        }
    });

    return false;
});

Hooks.on("deleteActor", (actor, options, userId) => {
    const partyActorId = game.settings.get(MODULE_ID, "partyActorId");

    if (partyActorId && actor.id === partyActorId) {
        game.settings.set(MODULE_ID, "partyActorId", "");
        console.log(`${MODULE_ID} | Party actor was deleted, configuration automatically cleared.`);
        ui.notifications.warn(`Party Actor "${actor.name}" was deleted. Store configuration has been reset.`);
    }
});

Hooks.on("renderDaggerheartMenu", (app, html, data) => {
    // v14 ApplicationV2 always delivers HTMLElement; the jQuery fallback is a v13 remnant.
    const element = html instanceof HTMLElement ? html : html[0];
    const myButton = document.createElement("button");
    myButton.type = "button";
    myButton.innerHTML = `<i class="fas fa-balance-scale"></i> Open Store`;
    myButton.classList.add("dh-custom-btn"); 
    myButton.style.marginTop = "0px";
    myButton.style.width = "100%";

    myButton.onclick = (event) => {
        event.preventDefault();
        if (globalThis.Store) globalThis.Store.Open();
        else ui.notifications.warn("Store module is not ready yet.");
    };

    let taggerButton;
    if (game.user.isGM) {
        taggerButton = document.createElement("button");
        taggerButton.type = "button";
        taggerButton.innerHTML = `<i class="fas fa-tags"></i> Item Tagger`;
        taggerButton.classList.add("dh-custom-btn");
        taggerButton.style.marginTop = "5px";
        taggerButton.style.width = "100%";
        taggerButton.onclick = (event) => {
            event.preventDefault();
            if (globalThis.Store) globalThis.Store.EditTags();
        };
    }

    const fieldset = element.querySelector("fieldset");
    if (fieldset) {
        const newFieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.innerText = "Store";
        newFieldset.appendChild(legend);
        newFieldset.appendChild(myButton);
        if (taggerButton) newFieldset.appendChild(taggerButton);
        fieldset.after(newFieldset);
    } else {
        element.appendChild(myButton);
        if (taggerButton) element.appendChild(taggerButton);
    }
});
