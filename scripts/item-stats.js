/*!
 * Daggerheart: Store
 * 2025 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

/**
 * Pure helpers for extracting weapon and armor stats from item documents and
 * formatting them for display. Extracted from `store-app.js` so the main class
 * can focus on lifecycle, rendering, and action handlers.
 *
 * These functions read `doc.system`, `CONFIG.DH`, and `game.i18n` but never
 * `this` — they are safe to import and call from anywhere once Foundry's
 * `init` hook has fired.
 */

import { MODULE_ID } from "./store-constants.js";
import { getItemTier } from "./store-utils.js";
import { cleanDescription, cleanDescriptionString, parseDamageTypes, configLabel } from "./item-display.js";

/**
 * Resolves the primary (hit points) damage part of an action. `damage.main` is
 * nullable, so a weapon without damage yields an empty object.
 *
 * @param {Object} attack - The action data (`system.attack`)
 * @returns {Object} The primary damage part, or an empty object when absent
 */
function getPrimaryDamagePart(attack) {
    return attack.damage.main ?? {};
}

/**
 * Generates the weapon summary string used in the inventory row.
 * @param {Item} doc - The weapon item document
 * @returns {string}
 */
export function getWeaponSummary(doc) {
    try {
        if (doc.type !== "weapon") return "";
        const system = doc.system;
        if (!system.attack) return "";

        const weaponTrait = configLabel(CONFIG.DH.ACTIONS.rollTypeTraits, system.attack.roll?.trait, "short");
        const weaponRange = configLabel(CONFIG.DH.GENERAL.range, system.attack.range);

        const part0 = getPrimaryDamagePart(system.attack);
        const val = part0.value || {};
        const weaponCustom = val.custom?.enabled === true;
        let damageSection = "";

        if (weaponCustom) {
            const formula = val.custom?.formula || "C";
            const damageType = parseDamageTypes(part0.type, true);
            damageSection = damageType ? `${formula}(${damageType})` : formula;
        } else {
            const weaponDamage = val.dice || "";
            const damageType = parseDamageTypes(part0.type, true);
            const bonusVal = val.bonus;
            let weaponBonus = "";
            if (bonusVal !== null && bonusVal !== undefined && String(bonusVal).trim() !== "") {
                weaponBonus = `+${bonusVal}`;
            }
            damageSection = `${weaponDamage}${weaponBonus}`;
            if (damageType) damageSection += `(${damageType})`;
        }

        const weaponBurden = configLabel(CONFIG.DH.GENERAL.burden, system.burden);

        const parts = [weaponTrait, weaponRange, damageSection, weaponBurden];
        return parts.filter(p => p && String(p).trim() !== "").join(" - ");
    } catch (err) {
        console.error(`${MODULE_ID} | Error generating weapon summary for ${doc.name}:`, err);
        return "";
    }
}

/**
 * Generates the armor summary string used in the inventory row.
 * @param {Item} doc - The armor item document
 * @returns {string}
 */
export function getArmorSummary(doc) {
    try {
        if (doc.type !== "armor") return "";
        const system = doc.system;
        const baseScore = system.armor?.max ?? 0;
        const baseThresholdsMajor = system.baseThresholds?.major ?? 0;
        const baseThresholdsSevere = system.baseThresholds?.severe ?? 0;
        return `Score: ${baseScore} - Thresholds: ${baseThresholdsMajor}/${baseThresholdsSevere}`;
    } catch (err) {
        console.error(`${MODULE_ID} | Error generating armor summary for ${doc.name}:`, err);
        return "";
    }
}

/**
 * Extracts weapon stats from a document.
 * @param {Item} doc - The weapon item document
 * @returns {Object}
 */
export function extractWeaponStats(doc) {
    try {
        const system = doc.system;
        if (!system.attack) return {};

        const trait = configLabel(CONFIG.DH.ACTIONS.rollTypeTraits, system.attack.roll?.trait);
        // The id travels with the label: the comparison orders ranges by id, since the label
        // follows the client language.
        const rangeId = system.attack.range;
        const range = configLabel(CONFIG.DH.GENERAL.range, rangeId);

        const part0 = getPrimaryDamagePart(system.attack);
        const val = part0.value || {};
        const isCustom = val.custom?.enabled === true;
        let damageDisplay = "";
        let damageType = "";

        if (isCustom) {
            damageDisplay = "Custom";
        } else {
            const weaponDamage = val.dice || "";
            damageType = parseDamageTypes(part0.type, false);

            const bonusVal = val.bonus;
            let weaponBonus = "";
            if (bonusVal !== null && bonusVal !== undefined && String(bonusVal).trim() !== "") {
                weaponBonus = `+${bonusVal}`;
            }
            damageDisplay = `${weaponDamage}${weaponBonus}`;
            if (damageType) damageDisplay += ` (${damageType})`;
        }

        const isDirect = part0.direct === true;
        const burden = configLabel(CONFIG.DH.GENERAL.burden, system.burden);

        const features = [];
        // system.weaponFeatures is a getter the system marks for deprecation, so read the stored
        // itemFeatures object (keyed by id) directly.
        const weaponFeatures = Object.values(system.itemFeatures);
        // CONFIG.DH.ITEM.weaponFeatures holds only the built-in features; homebrew ones are
        // merged in by allWeaponFeatures(). Built-in label/description are i18n keys, homebrew
        // ones are plain text and GM-written HTML, and localize() passes the latter through.
        const allFeatures = CONFIG.DH.ITEM.allWeaponFeatures();
        for (const feature of weaponFeatures) {
            const config = allFeatures[feature.value];
            // Unknown id (e.g. a homebrew feature deleted after use): skip rather than show "undefined".
            if (!config?.description) continue;
            const featureName = game.i18n.localize(config.label ?? feature.value);
            const featureDesc = cleanDescriptionString(game.i18n.localize(config.description));
            if (featureDesc) features.push({ name: featureName, description: featureDesc });
        }

        return { trait, range, rangeId, damageDisplay, damageType, isDirect, burden, features };
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
export function extractArmorStats(doc) {
    try {
        const system = doc.system;
        const features = [];
        // system.armorFeatures is a getter the system marks for deprecation, so read the stored
        // itemFeatures object (keyed by id) directly.
        const armorFeatures = Object.values(system.itemFeatures);
        // CONFIG.DH.ITEM.armorFeatures holds only the built-in features; homebrew ones are
        // merged in by allArmorFeatures(). Built-in label/description are i18n keys, homebrew
        // ones are plain text and GM-written HTML, and localize() passes the latter through.
        const allFeatures = CONFIG.DH.ITEM.allArmorFeatures();
        for (const feature of armorFeatures) {
            const config = allFeatures[feature.value];
            // Unknown id (e.g. a homebrew feature deleted after use): skip rather than show "undefined".
            if (!config?.description) continue;
            const featureName = game.i18n.localize(config.label ?? feature.value);
            const featureDesc = cleanDescriptionString(game.i18n.localize(config.description));
            if (featureDesc) features.push({ name: featureName, description: featureDesc });
        }
        return {
            baseScore: system.armor?.max ?? 0,
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
 * Formats an item for comparison display (used by the comparison tooltip).
 * @param {Item} item - The item to format
 * @returns {Object|null}
 */
export function formatItemForComparison(item) {
    if (!item) return null;
    const isWeapon = item.type === "weapon";
    const rawDesc = item.system.description ?? "";
    const base = {
        name: item.name, img: item.img,
        tier: getItemTier(item),
        description: cleanDescription(rawDesc),
        isWeapon
    };
    if (isWeapon) return { ...base, ...extractWeaponStats(item) };
    return { ...base, ...extractArmorStats(item) };
}

/**
 * Builds the full tooltip HTML for an item, merging the text description and
 * any weapon/armor features into a single string safe for `data-item-desc`.
 * Uses only tags permitted by the tooltip sanitizer: <p>, <br>, <hr>, <strong>.
 *
 * @param {Item} doc - The item document
 * @param {string} cleanDesc - Pre-cleaned description HTML
 * @returns {string} Combined tooltip HTML, or empty string if nothing to show
 */
export function buildTooltipContent(doc, cleanDesc) {
    let features = [];
    if (doc.type === "weapon") {
        features = extractWeaponStats(doc).features || [];
    } else if (doc.type === "armor") {
        features = extractArmorStats(doc).features || [];
    }

    if (features.length === 0) return cleanDesc;

    const featuresHtml = features
        .map(f => `<p><strong>${f.name}:</strong> ${f.description}</p>`)
        .join("");

    if (cleanDesc) return `${cleanDesc}<hr>${featuresHtml}`;
    return featuresHtml;
}
