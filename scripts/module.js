import { DaggerheartStore } from "./store-app.js";
import { StoreWelcome } from "./store-welcome.js";

const MODULE_ID = "daggerheart-store";
const { DialogV2 } = foundry.applications.api;

Hooks.once("init", () => {
    console.log(`${MODULE_ID} | Initializing Daggerheart Store Module (App V2)`);

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

    // Party Configuration Setting
    game.settings.register(MODULE_ID, "partyActorId", {
        name: "Party Actor ID", scope: "world", config: false, type: String, default: ""
    });

    // Custom Tab Configuration
    game.settings.register(MODULE_ID, "customTabName", {
        name: "Custom Tab Name", scope: "world", config: false, type: String, default: "General"
    });
    game.settings.register(MODULE_ID, "customTabCompendium", {
        name: "Custom Tab Compendium", scope: "world", config: false, type: String, default: "daggerheart-store.general-items"
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
function _handleOpenStoreRequest(value) {
    if (!value || !value.target) return;

    const targetUser = value.target;
    const currentUser = game.user.id;

    if (targetUser === "all" || targetUser === currentUser) {
        console.log(`${MODULE_ID} | Received Open Request for: ${targetUser}`);
        const app = getStoreInstance();
        app.render({ force: true, window: { display: "block" } });
        if (app.minimized) app.maximize();
        app.bringToFront(); 
    }
}

Hooks.once("ready", () => {
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

                await ChatMessage.create({
                    content: messageContent,
                    speaker: { alias: "Store System" },
                    whisper: recipients
                });
            }

            app.render({ force: true });
        },
        Show: async (username = null) => {
            if (!game.user.isGM) return ui.notifications.warn("Only GM can share store.");
            let targetId = "all";
            
            if (username) {
                const targetUser = game.users.getName(username);
                if (!targetUser) return ui.notifications.error(`User "${username}" not found.`);
                if (!targetUser.active) ui.notifications.warn(`User "${username}" is currently offline.`);
                targetId = targetUser.id;
            }

            console.log(`${MODULE_ID} | Triggering Store Open for:`, targetId);
            await game.settings.set(MODULE_ID, "openStoreRequest", {
                target: targetId,
                time: Date.now()
            });
            ui.notifications.info(`Store sent to: ${username || "Everyone"}`);
        }
    };

    if (game.user.isGM) {
        const welcomeHidden = game.settings.get(MODULE_ID, "welcomeScreenShown");
        if (!welcomeHidden) {
            new StoreWelcome().render(true);
        }
    }
});

Hooks.on("updateSetting", (setting) => {
    if (setting.key.startsWith(MODULE_ID) && setting.key !== `${MODULE_ID}.openStoreRequest`) {
        if (storeInstance && storeInstance.rendered) {
            console.log(`${MODULE_ID} | Configuration updated, refreshing UI.`);
            if (setting.key === `${MODULE_ID}.storeName`) {
                const newTitle = game.settings.get(MODULE_ID, "storeName");
                storeInstance.options.window.title = newTitle;
                if (storeInstance.window) storeInstance.window.title = newTitle;
            }
            storeInstance.render();
        }
    }
});

Hooks.on("renderDaggerheartMenu", (app, html, data) => {
    const element = (html instanceof jQuery) ? html[0] : html;
    const myButton = document.createElement("button");
    myButton.type = "button";
    myButton.innerHTML = `<i class="fas fa-balance-scale"></i> Open Store`;
    myButton.classList.add("dh-custom-btn"); 
    myButton.style.marginTop = "10px";
    myButton.style.width = "100%";

    myButton.onclick = (event) => {
        event.preventDefault();
        if (globalThis.Store) globalThis.Store.Open();
        else ui.notifications.warn("Store module is not ready yet.");
    };

    const fieldset = element.querySelector("fieldset");
    if (fieldset) {
        const newFieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.innerText = "Store";
        newFieldset.appendChild(legend);
        newFieldset.appendChild(myButton);
        fieldset.after(newFieldset);
    } else {
        element.appendChild(myButton);
    }
});
