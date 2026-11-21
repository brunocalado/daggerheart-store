/*!
 * Daggerheart: Store
 * 2025 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

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
 * the result to 300 characters.
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
 * Localized text of a Daggerheart config entry (`CONFIG.DH.*`), e.g. a trait or range label.
 * Built-in entries hold i18n keys; homebrew ones (damage type names) hold plain text, which
 * localize() returns unchanged. An id the config does not know comes back as-is.
 *
 * @param {Object} config - The config table, keyed by id
 * @param {string|null|undefined} id - The stored id
 * @param {string} [key="label"] - Which text of the entry to use ("label", "short", "abbreviation")
 * @returns {string} The text, or "" when there is no id
 */
export function configLabel(config, id, key = "label") {
    if (!id) return "";
    const text = config[id]?.[key];
    return text ? game.i18n.localize(text) : String(id);
}

/**
 * Formats the damage types of a damage part (a Set of type ids such as
 * `physical` / `magical`) with the system's names, which homebrew settings can rename.
 *
 * @param {Set<string>} typeSet - The damage part's `type`
 * @param {boolean} [abbreviated=false] - If true, returns uppercase abbreviations
 * @returns {string} Joined damage type string (slash-separated)
 */
export function parseDamageTypes(typeSet, abbreviated = false) {
    const types = CONFIG.DH.GENERAL.damageTypes;
    return Array.from(typeSet ?? [])
        .map(id => abbreviated
            ? configLabel(types, id, "abbreviation").toUpperCase()
            : configLabel(types, id))
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
