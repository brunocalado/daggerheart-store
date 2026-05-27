/**
 * Pure helpers for sanitizing item descriptions and parsing damage strings.
 * Extracted from `store-app.js` to keep the main class focused on rendering
 * and event handling.
 *
 * These functions never reference `this`, settings, or any UI state — they are
 * safe to call from any context once Foundry's `init` hook has fired.
 */

/**
 * Cleans unsafe HTML from a description for tooltip display and truncates
 * the result to 300 characters. Store tags no longer exist in descriptions
 * after the migration to flags.
 *
 * Note: intentionally distinct from {@link cleanDescriptionString}, which
 * does not truncate.
 *
 * @param {string} html - The raw HTML description
 * @returns {string}
 */
export function cleanDescription(html) {
    if (!html) return "";
    return String(html)
        .replace(/<(?!\/?(?:p|br)\b)[^>]*>/gi, '')
        .trim()
        .substring(0, 300);
}

/**
 * Cleans a description string by removing unsafe HTML, preserving the full
 * length. Used for catalog/tooltip data where truncation is unwanted.
 *
 * Note: intentionally distinct from {@link cleanDescription}, which truncates.
 *
 * @param {string} descString - The raw description string
 * @returns {string}
 */
export function cleanDescriptionString(descString) {
    return descString
        .replace(/<(?!\/?(?:p|br)\b)[^>]*>/gi, '')
        .trim();
}

/**
 * Parses damage type from the various formats Foundry can store it in
 * (string, array, Set, object).
 *
 * @param {*} typeRaw - The raw type value
 * @param {boolean} [abbreviated=false] - If true, returns 3-char uppercase abbreviations
 * @returns {string} Joined damage type string (slash-separated)
 */
export function parseDamageTypes(typeRaw, abbreviated = false) {
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

    const fullNameMap = {
        "physical": "Physical", "phy": "Physical",
        "magic": "Magic", "mag": "Magic"
    };

    return typesList
        .map(t => {
            const s = String(t || "").trim();
            if (!s) return "";
            if (abbreviated) {
                return s.length >= 3 ? s.substring(0, 3).toUpperCase() : s.toUpperCase();
            }
            const lower = s.toLowerCase();
            return fullNameMap[lower] || (s.charAt(0).toUpperCase() + s.slice(1));
        })
        .filter(t => t)
        .join("/");
}

/**
 * Parses a damage display string (e.g. "1d8+2 (Physical)") and returns the
 * average expected damage as a comparable numeric value.
 *
 * @param {string} damageStr - The damage string
 * @returns {number|null} Average damage, or null when not parseable
 */
export function parseDamageValue(damageStr) {
    if (!damageStr || damageStr === "Custom") return null;
    const cleanStr = damageStr.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const match = cleanStr.match(/^(\d*)d(\d+)(?:\+(\d+))?$/i);
    if (!match) return null;
    const numDice = parseInt(match[1]) || 1;
    const dieSize = parseInt(match[2]);
    const bonus = parseInt(match[3]) || 0;
    return numDice * ((dieSize + 1) / 2) + bonus;
}
