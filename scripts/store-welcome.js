const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const MODULE_ID = "daggerheart-store";

/**
 * Welcome Screen Application
 * Displays introductory information and links to the manual.
 */
export class StoreWelcome extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "daggerheart-store-welcome",
        tag: "form",
        window: {
            title: "Welcome",
            icon: "fas fa-door-open",
            resizable: false,
            controls: []
        },
        position: { width: 500, height: "auto" },
        classes: ["daggerheart-store-welcome"],
        actions: {
            openJournal: StoreWelcome.prototype._onOpenJournal,
            closeWelcome: StoreWelcome.prototype._onCloseWelcome
        }
    };

    static PARTS = {
        main: {
            template: "modules/daggerheart-store/templates/welcome.hbs"
        }
    };

    async _prepareContext(options) {
        return {
            // UUID provided in requirements
            journalUuid: "Compendium.daggerheart-store.journals.JournalEntry.fIXCeXWeDbAu3uFg"
        };
    }

    /**
     * Opens the linked Journal Entry from the compendium
     */
    async _onOpenJournal(event, target) {
        const uuid = target.dataset.uuid;
        try {
            const doc = await fromUuid(uuid);
            if (doc) {
                doc.sheet.render(true);
            } else {
                ui.notifications.warn(`${MODULE_ID} | Journal Entry not found. Please ensure the module content is active.`);
            }
        } catch (err) {
            console.error(`${MODULE_ID} | Error loading journal:`, err);
            ui.notifications.error("Could not load the Read Me journal.");
        }
    }

    /**
     * Closes the window and saves the preference if checkbox is checked
     */
    async _onCloseWelcome(event, target) {
        const form = this.element;
        const checkbox = form.querySelector("input[name='doNotShow']");
        
        if (checkbox && checkbox.checked) {
            await game.settings.set(MODULE_ID, "welcomeScreenShown", true);
            ui.notifications.info("Daggerheart Store: Welcome screen hidden for future sessions.");
        }
        
        this.close();
    }
}