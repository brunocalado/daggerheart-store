/**
 * Builds a name-indexed catalog of every store item across the configured
 * compendiums (default + custom categories + custom tab). Used by the sell
 * tab to validate and price the player's inventory.
 *
 * Hidden items are included by design — store visibility does not affect
 * sellability. Extracted from `store-app.js` as a pure async function that
 * takes all inputs explicitly.
 */

import { PRICE_DATA, PACK_MAPPING } from "./price-data.js";
import { extractPriceFromDescription, getOriginalName } from "./store-utils.js";
import { cleanDescriptionString } from "./item-display.js";

/**
 * @param {Object} opts
 * @param {number} opts.priceMod - Global price modifier (percentage / 100)
 * @param {Object} opts.priceOverrides - Manual price overrides, keyed by item name
 * @param {boolean} opts.useDefaultCompendiums - Whether default system compendiums are active
 * @param {Array} opts.customCompendiums - Custom per-category compendium config objects
 * @param {Array} opts.customTabCompendiums - Custom tab compendium pack IDs
 * @returns {Promise<Map<string, {basePrice: number, img: string, uuid: string, description: string}>>}
 */
export async function buildStoreCatalogIndex({ priceMod, priceOverrides, useDefaultCompendiums, customCompendiums, customTabCompendiums }) {
    const catalog = new Map();
    const seenNames = new Set();

    // --- Default system compendiums (standard category packs) ---
    if (useDefaultCompendiums) {
        const defaultPackIds = [...new Set(Object.values(PACK_MAPPING))];
        const results = await Promise.all(
            defaultPackIds.map(id => game.packs.get(id)?.getDocuments() ?? Promise.resolve([]))
        );
        for (const docs of results) {
            for (const doc of docs) {
                if (seenNames.has(doc.name)) continue;
                seenNames.add(doc.name);

                const originalName = getOriginalName(doc);
                let basePrice = 0;
                // Search all category price tables; items can appear under multiple keys
                for (const catKey of Object.keys(PRICE_DATA)) {
                    if (PRICE_DATA[catKey][originalName]) {
                        basePrice = Math.ceil(PRICE_DATA[catKey][originalName].price * priceMod);
                        break;
                    }
                }
                if (priceOverrides.hasOwnProperty(doc.name)) basePrice = priceOverrides[doc.name];

                const rawDesc = String(foundry.utils.getProperty(doc, "system.description.value") ||
                                      foundry.utils.getProperty(doc, "system.description") || "");
                catalog.set(doc.name, { basePrice, img: doc.img, uuid: doc.uuid, description: cleanDescriptionString(rawDesc) });
            }
        }
    }

    // --- Custom category compendiums + custom tab compendiums ---
    const customCategoryPackIds = (customCompendiums || [])
        .filter(c => c?.pack)
        .map(c => c.pack);
    const customTabPackIds = (customTabCompendiums || [])
        .filter(p => p?.trim());
    const allCustomPackIds = [...new Set([...customCategoryPackIds, ...customTabPackIds])];

    const customResults = await Promise.all(
        allCustomPackIds.map(id => game.packs.get(id)?.getDocuments() ?? Promise.resolve([]))
    );
    for (const docs of customResults) {
        for (const doc of docs) {
            if (seenNames.has(doc.name)) continue;
            seenNames.add(doc.name);

            let basePrice = extractPriceFromDescription(doc);
            if (priceOverrides.hasOwnProperty(doc.name)) basePrice = priceOverrides[doc.name];

            const rawDescCustom = String(foundry.utils.getProperty(doc, "system.description.value") ||
                                        foundry.utils.getProperty(doc, "system.description") || "");
            catalog.set(doc.name, { basePrice, img: doc.img, uuid: doc.uuid, description: cleanDescriptionString(rawDescCustom) });
        }
    }

    return catalog;
}
