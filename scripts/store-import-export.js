import {
    MODULE_ID, EXPORTABLE_SETTINGS, OBJECT_SETTINGS, ARRAY_SETTINGS
} from "./store-constants.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

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

    // -- EXPORT --

    async _onExport(event, target) {
        const settings = {};
        for (const key of EXPORTABLE_SETTINGS) {
            settings[key] = game.settings.get(MODULE_ID, key);
        }

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

    // -- IMPORT --

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

        if (!data.module || data.module !== MODULE_ID || !data.settings) {
            return ui.notifications.error("This file is not a valid Daggerheart Store export.");
        }

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
                const current = foundry.utils.deepClone(game.settings.get(MODULE_ID, key));
                const merged = Object.assign(current, imported[key]);
                await game.settings.set(MODULE_ID, key, merged);
            } else if (ARRAY_SETTINGS.includes(key)) {
                const current = game.settings.get(MODULE_ID, key) || [];
                const combined = [...new Set([...current, ...imported[key]])];
                await game.settings.set(MODULE_ID, key, combined);
            }
            // Scalar settings are NOT overwritten in merge mode
        }

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
