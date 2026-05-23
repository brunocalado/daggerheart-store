/**
 * Shared utility functions for the Daggerheart Store module.
 * Contains helpers used across multiple application classes
 * (store, config, randomizer, import/export).
 */

import { MODULE_ID, VALID_ITEM_TYPES, STORE_FLAGS } from "./store-constants.js";

const { DialogV2 } = foundry.applications.api;

// --- Item Helpers ---

/**
 * Returns the full list of valid item types, including any extra types from settings.
 * @returns {string[]}
 */
export function getValidItemTypes() {
    const extra = game.settings.get(MODULE_ID, "extraItemTypes") || "";
    if (!extra.trim()) return VALID_ITEM_TYPES;
    const extraTypes = extra.split(";").map(t => t.trim()).filter(t => t.length > 0);
    return [...VALID_ITEM_TYPES, ...extraTypes];
}

/**
 * Returns the store tier for an item, read from flags.
 * Falls back to system.tier if no flag is set. Defaults to 1.
 * @param {Object} item - The item document
 * @returns {number} Tier value (1-4), defaults to 1
 */
export function getItemTier(item) {
    const flagTier = item.getFlag?.(MODULE_ID, STORE_FLAGS.tier);
    const parsedFlagTier = parseInt(flagTier);
    if (parsedFlagTier >= 1 && parsedFlagTier <= 4) return parsedFlagTier;

    const sysTier = foundry.utils.getProperty(item, "system.tier");
    const parsedSysTier = parseInt(sysTier);
    if (parsedSysTier >= 1 && parsedSysTier <= 4) return parsedSysTier;

    return 1;
}

/**
 * Returns the store price for an item, read from flags.
 * Returns 0 if no price flag is set.
 * @param {Object} item - The item document
 * @returns {number} Price value or 0 if not found
 */
export function extractPriceFromDescription(item) {
    const flagPrice = item.getFlag?.(MODULE_ID, STORE_FLAGS.price);
    if (flagPrice !== undefined && flagPrice !== null) return parseInt(flagPrice, 10) || 0;
    return 0;
}

/**
 * Returns the original (pre-translation) name of a compendium document.
 * When Babele is active, translated documents store the English name in
 * flags.babele.originalName. Falls back to doc.name for untranslated items
 * or when Babele is not active.
 * @param {Object} doc - A Foundry Item document from a compendium
 * @returns {string}
 */
export function getOriginalName(doc) {
    return (game.modules.get("babele")?.active ? doc.flags?.babele?.originalName : null) ?? doc.name;
}

// --- Currency Helpers ---

/**
 * Gets the currency name from the Daggerheart system settings.
 * @returns {string}
 */
export function getSystemCurrency() {
    try {
        const homebrewSettings = game.settings.get(CONFIG.DH.id, CONFIG.DH.SETTINGS.gameSettings.Homebrew);
        return homebrewSettings?.currency?.coins?.label || "Coins";
    } catch (e) {
        console.warn(`${MODULE_ID} | Could not fetch system currency name, falling back to 'Coins'.`, e);
        return "Coins";
    }
}

/**
 * Calculates total wealth in coins across all denomination slots.
 * Used by the "smart" currency mode.
 * @param {Actor} actor - The actor to calculate wealth for
 * @returns {number} Total wealth in coins
 */
export function calculateTotalWealth(actor) {
    const gold = actor.system.gold || {};
    return (gold.chests || 0) * 1000 + (gold.bags || 0) * 100 + (gold.handfuls || 0) * 10 + (gold.coins || 0);
}

/**
 * Optimizes a coin amount into the fewest denominations (Chests > Bags > Handfuls > Coins).
 * Used by the "smart" currency mode.
 * @param {number} totalCoins - Total coins to optimize
 * @returns {{chests: number, bags: number, handfuls: number, coins: number}}
 */
export function optimizeCurrency(totalCoins) {
    let remainder = totalCoins;
    const chests = Math.floor(remainder / 1000);
    remainder %= 1000;
    const bags = Math.floor(remainder / 100);
    remainder %= 100;
    const handfuls = Math.floor(remainder / 10);
    remainder %= 10;
    return { chests, bags, handfuls, coins: remainder };
}

/**
 * Reads the actor's current wealth based on the active currency mode.
 * @param {Actor} actor - The actor
 * @returns {number} Total available wealth in coins
 */
export function getActorWealth(actor) {
    const currencyMode = game.settings.get(MODULE_ID, "currencyMode");
    if (currencyMode === "smart") return calculateTotalWealth(actor);
    return foundry.utils.getProperty(actor, "system.gold.coins") || 0;
}

/**
 * Deducts gold from an actor, respecting the active currency mode.
 * @param {Actor} actor - The actor to deduct from
 * @param {number} amount - Amount of coins to deduct
 */
export async function deductGold(actor, amount) {
    const currencyMode = game.settings.get(MODULE_ID, "currencyMode");
    if (currencyMode === "smart") {
        const currentTotal = calculateTotalWealth(actor);
        const optimized = optimizeCurrency(currentTotal - amount);
        await actor.update({
            "system.gold.chests": optimized.chests,
            "system.gold.bags": optimized.bags,
            "system.gold.handfuls": optimized.handfuls,
            "system.gold.coins": optimized.coins
        });
    } else {
        const current = foundry.utils.getProperty(actor, "system.gold.coins") || 0;
        await actor.update({ "system.gold.coins": current - amount });
    }
}

/**
 * Adds gold to an actor, respecting the active currency mode.
 * @param {Actor} actor - The actor to credit
 * @param {number} amount - Amount of coins to add
 */
export async function addGold(actor, amount) {
    const currencyMode = game.settings.get(MODULE_ID, "currencyMode");
    if (currencyMode === "smart") {
        const currentTotal = calculateTotalWealth(actor);
        const optimized = optimizeCurrency(currentTotal + amount);
        await actor.update({
            "system.gold.chests": optimized.chests,
            "system.gold.bags": optimized.bags,
            "system.gold.handfuls": optimized.handfuls,
            "system.gold.coins": optimized.coins
        });
    } else {
        const current = foundry.utils.getProperty(actor, "system.gold.coins") || 0;
        await actor.update({ "system.gold.coins": current + amount });
    }
}

// --- Chat Helpers ---

/**
 * Gets whisper recipients based on the privacy setting.
 * @returns {string[]|null} Array of user IDs to whisper to, or null for public
 */
export function getChatWhisperRecipients() {
    const privacy = game.settings.get(MODULE_ID, "chatPrivacy");
    if (privacy === "private") {
        const recipients = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
        if (!recipients.includes(game.user.id)) recipients.push(game.user.id);
        return recipients;
    }
    return null;
}

/**
 * Builds a styled chat card HTML string used for all store transaction messages.
 * Centralizes the card template to avoid duplication across buy/sell/transfer actions.
 * @param {Object} options
 * @param {string} options.title - Header text (e.g. "Store Purchase", "Item Sold")
 * @param {string} options.borderColor - Border/header accent color
 * @param {string} options.body - Inner HTML content for the card body
 * @returns {string} Complete chat card HTML
 */
export function buildChatCard({ title, borderColor, body }) {
    return `
    <div class="chat-card" style="border: 2px solid ${borderColor}; border-radius: 8px; overflow: hidden;">
        <header class="card-header flexrow" style="background: #191919 !important; padding: 8px; border-bottom: 2px solid ${borderColor};">
            <h3 class="noborder" style="margin: 0; font-weight: bold; color: ${borderColor} !important; font-family: 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%;">
                ${title}
            </h3>
        </header>
        <div class="card-content" style="background: #2a2a2a; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #eee;">
            ${body}
        </div>
    </div>`;
}

// --- Epic Item Helpers ---

/**
 * Returns a text color suitable for contrast against the epic background tint.
 * @param {string} hex - Hex color string (e.g., "#9b59b6")
 * @returns {string} Text color hex
 */
export function getEpicTextColor(hex) {
    const darkBgColors = ["#9b59b6", "#e91e63", "#e74c3c", "#3498db"];
    return darkBgColors.includes(hex.toLowerCase()) ? "#e8e8e8" : "#000";
}

/**
 * Converts a hex color to a very subtle background tint (12% opacity over #e8e8e8 base).
 * @param {string} hex - Hex color string
 * @returns {string} Blended hex color for subtle background
 */
export function getEpicBgColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const base = 0xe8;
    const mix = 0.12;
    const br = Math.round(base * (1 - mix) + r * mix);
    const bg = Math.round(base * (1 - mix) + g * mix);
    const bb = Math.round(base * (1 - mix) + b * mix);
    return `#${br.toString(16).padStart(2, "0")}${bg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`;
}

// --- Header Helper ---

/**
 * Returns the store header for an item, read from flags.
 * @param {Object} item - The item document
 * @returns {string|null} Header string or null if not set
 */
export function getItemHeader(item) {
    return item.getFlag?.(MODULE_ID, STORE_FLAGS.header) ?? null;
}

// --- Migration-Only Helpers ---

/**
 * MIGRATION USE ONLY.
 * Parses legacy description tags from an item. Do not call at runtime.
 * @param {Object} item - The item document
 * @returns {{price: number|null, tier: number|null, header: string|null}}
 */
export function parseLegacyStoreTags(item) {
    const desc = String(
        foundry.utils.getProperty(item, "system.description") || ""
    );

    const priceMatch = desc.match(/\{\{\{(\d+)\}\}\}/);
    const price = priceMatch ? parseInt(priceMatch[1]) : null;

    const tierMatch = desc.match(/\{\{\{tier([1-4])\}\}\}/i);
    const tier = tierMatch ? parseInt(tierMatch[1]) : null;

    const allTags = [...desc.matchAll(/\{\{\{([^}]+)\}\}\}/g)];
    let header = null;
    for (const match of allTags) {
        const content = match[1];
        if (/^\d+$/.test(content)) continue;
        if (/^tier[1-4]$/i.test(content)) continue;
        header = content;
        break;
    }

    return { price, tier, header };
}

/**
 * MIGRATION USE ONLY.
 * Removes store-specific {{{...}}} tags from a description HTML string.
 * Only strips patterns that match known store tag formats (price, tier, header).
 * Does NOT strip arbitrary {{{...}}} content unrelated to the store.
 * @param {string} desc - The raw description HTML
 * @param {{price: number|null, tier: number|null, header: string|null}} tags - Parsed tag values
 * @returns {string} Cleaned description
 */
export function stripLegacyStoreTags(desc, { price, tier, header }) {
    let result = desc;

    if (price  !== null) result = result.replace(/\{\{\{\d+\}\}\}/g, "");
    if (tier   !== null) result = result.replace(/\{\{\{tier[1-4]\}\}\}/gi, "");
    if (header !== null) {
        const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(new RegExp(`\\{\\{\\{${escaped}\\}\\}\\}`), "");
    }

    return result.replace(/<p>\s*<\/p>/g, "").trim();
}

// --- Dialog Helper ---

/**
 * Shows a styled confirmation/input dialog used throughout the store UI.
 * @param {Object} options - Dialog options
 * @param {string} options.title - Window title
 * @param {string} [options.icon] - Window icon class
 * @param {string} options.headerText - Header text displayed in the dialog
 * @param {string} [options.headerColor="#D4AF37"] - Color for the header
 * @param {string} options.message - Main message (supports HTML)
 * @param {string} [options.description] - Secondary description text
 * @param {Object} [options.input] - Optional input field configuration
 * @param {Object} [options.buttons] - Custom button configuration
 * @param {string} [options.customContent] - Additional HTML content
 * @param {Function} [options.onRender] - Render callback
 * @returns {Promise<boolean|Object>} Boolean for confirm, or object with input values
 */
export async function showStoreDialog(options) {
    const {
        title,
        icon = "fas fa-check",
        headerText,
        headerColor = "#D4AF37",
        message,
        description,
        input,
        buttons = {},
        customContent = null
    } = options;

    let contentHtml = `<div class="store-dialog-content">`;
    if (headerText) contentHtml += `<h3 class="store-dialog-header" style="color: ${headerColor};">${headerText}</h3>`;
    if (message) contentHtml += `<p class="store-dialog-message">${message}</p>`;
    if (description) contentHtml += `<p class="store-dialog-description">${description}</p>`;
    contentHtml += `</div>`;

    if (input) {
        contentHtml += `
            <div class="store-dialog-input-group">
                <label>${input.label || "Value:"}</label>
                <input type="${input.type || "text"}" name="${input.name}" value="${input.defaultValue || ""}"
                       placeholder="${input.placeholder || ""}">
                ${input.notes ? `<p class="store-dialog-notes">${input.notes}</p>` : ""}
            </div>
        `;
    }

    if (customContent) contentHtml += customContent;

    if (input || customContent) {
        return new Promise((resolve) => {
            new DialogV2({
                window: { title, icon },
                content: contentHtml,
                classes: ["dhs-dialog"],
                modal: true,
                buttons: [
                    {
                        action: "confirm",
                        label: buttons.confirm || "Confirm",
                        icon: buttons.confirmIcon || "fas fa-check",
                        callback: (event, button, dialog) => {
                            const result = { confirmed: true };
                            if (input) result.value = button.form.elements[input.name]?.value;
                            if (customContent && button.form) {
                                result.formData = {};
                                const formData = new FormData(button.form);
                                for (const [key, value] of formData.entries()) result.formData[key] = value;
                            }
                            resolve(result);
                        }
                    },
                    {
                        action: "cancel",
                        label: buttons.cancel || "Cancel",
                        icon: "fas fa-times",
                        callback: () => resolve({ confirmed: false, value: null })
                    }
                ],
                close: () => resolve({ confirmed: false, value: null }),
                render: options.onRender || null
            }).render(true);
        });
    }

    return DialogV2.confirm({
        window: { title, icon },
        content: contentHtml,
        classes: ["dhs-dialog"],
        rejectClose: false,
        modal: true
    });
}
