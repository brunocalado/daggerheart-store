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
import { cleanDescription, parseDamageTypes } from "./item-display.js";

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

        const traitRaw = String(system.attack.roll?.trait || "");
        const weaponTrait = traitRaw.length >= 3 ? traitRaw.substring(0, 3).toUpperCase() : traitRaw.toUpperCase();

        const rangeRaw = system.attack.range || "";
        const rangeMap = {
            "melee": "Melee", "veryClose": "Very Close", "close": "Close",
            "far": "Far", "veryFar": "Very Far"
        };
        const weaponRange = rangeMap[rangeRaw] || (rangeRaw ? String(rangeRaw).charAt(0).toUpperCase() + String(rangeRaw).slice(1) : "");

        const partsRaw = system.attack.damage?.parts;
        const part0 = partsRaw
            ? (Array.isArray(partsRaw) ? (partsRaw[0] || {}) : (Object.values(partsRaw)[0] || {}))
            : {};
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

        const partsRaw = system.attack.damage?.parts;
        const part0 = partsRaw
            ? (Array.isArray(partsRaw) ? (partsRaw[0] || {}) : (Object.values(partsRaw)[0] || {}))
            : {};
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
export function extractArmorStats(doc) {
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
    const rawDesc = foundry.utils.getProperty(item, "system.description.value") ||
                    foundry.utils.getProperty(item, "system.description") || "";
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
