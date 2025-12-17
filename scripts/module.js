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
    // Stores all saved profiles, e.g., { "Default": { ... }, "Cheap Mode": { ... } }
    game.settings.register(MODULE_ID, "storeProfiles", {
        name: "Store Profiles",
        scope: "world",
        config: false,
        type: Object,
        default: { "Default": {} } 
    });

    // Tracks which profile is currently active in the UI
    game.settings.register(MODULE_ID, "currentProfile", {
        name: "Current Profile",
        scope: "world",
        config: false,
        type: String,
        default: "Default"
    });

    // --- WELCOME SCREEN SETTING ---
    game.settings.register(MODULE_ID, "welcomeScreenShown", {
        name: "Hide Welcome Screen",
        hint: "If checked, the Daggerheart Store welcome screen will not appear on startup.",
        scope: "client", // User-specific preference
        config: true,    // exposed in Module Settings so users can reset it
        type: Boolean,
        default: false
    });

    // Communication Channel Setting
    // Acts as a socket trigger. Changes to this setting fire the 'onChange' callback on all clients.
    game.settings.register(MODULE_ID, "openStoreRequest", {
        scope: "world",
        config: false,
        type: Object,
        default: { target: "none", time: 0 },
        onChange: _handleOpenStoreRequest // Trigger logic directly on change
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

    // Check if this client is the intended target
    if (targetUser === "all" || targetUser === currentUser) {
        
        console.log(`${MODULE_ID} | Received Open Request for: ${targetUser}`);
        const app = getStoreInstance();
        
        // Force render and maximize
        app.render({ force: true, window: { display: "block" } });
        if (app.minimized) app.maximize();
        
        // Brings the application window to the top of the stack
        app.bringToFront(); 
    }
}

Hooks.once("ready", () => {
    // Expose global API
    globalThis.Store = {
        Open: () => {
            const app = getStoreInstance();
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
            
            // Update the setting with a new timestamp to ensure onChange fires even if target is the same
            await game.settings.set(MODULE_ID, "openStoreRequest", {
                target: targetId,
                time: Date.now()
            });
            
            ui.notifications.info(`Store sent to: ${username || "Everyone"}`);
        }
    };

    // --- SHOW WELCOME SCREEN ---
    // Only for GM, and only if not previously suppressed
    if (game.user.isGM) {
        const welcomeHidden = game.settings.get(MODULE_ID, "welcomeScreenShown");
        if (!welcomeHidden) {
            new StoreWelcome().render(true);
        }
    }
});

// React to Config Settings Changes (Price, Tiers, etc.)
Hooks.on("updateSetting", (setting) => {
    // Filter out the trigger setting because it is handled by 'onChange' in register
    if (setting.key.startsWith(MODULE_ID) && setting.key !== `${MODULE_ID}.openStoreRequest`) {
        if (storeInstance && storeInstance.rendered) {
            console.log(`${MODULE_ID} | Configuration updated, refreshing UI.`);
            
            // If the store name changed, update the window title dynamically and immediately
            if (setting.key === `${MODULE_ID}.storeName`) {
                const newTitle = game.settings.get(MODULE_ID, "storeName");
                storeInstance.options.window.title = newTitle;
                
                // Directly update the window title if the window exists
                if (storeInstance.window) {
                    storeInstance.window.title = newTitle;
                }
            }
            
            storeInstance.render();
        }
    }
});

// --------------------------------------------------------------------------
// Daggerheart Menu Integration
// --------------------------------------------------------------------------
Hooks.on("renderDaggerheartMenu", (app, html, data) => {
    // Normalize the HTML element to ensure compatibility with jQuery or raw DOM objects
    const element = (html instanceof jQuery) ? html[0] : html;

    // 1. Create the button
    const myButton = document.createElement("button");
    myButton.type = "button";
    myButton.innerHTML = `<i class="fas fa-balance-scale"></i> Open Store`;
    myButton.classList.add("dh-custom-btn"); 
    
    myButton.style.marginTop = "10px";
    myButton.style.width = "100%";

    // 2. Define click behavior
    myButton.onclick = (event) => {
        event.preventDefault();
        if (globalThis.Store) {
            globalThis.Store.Open();
        } else {
            ui.notifications.warn("Store module is not ready yet.");
        }
    };

    // 3. Insert the button into the DOM
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