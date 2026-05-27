/**
 * Helpers for comparing a store item against the actor's currently-equipped
 * counterpart. Powers the comparison tooltip in the store UI.
 *
 * These functions are pure (no `this` access) and operate on Foundry document
 * references and the plain-object outputs of `item-stats.js`.
 */

import { parseDamageValue } from "./item-display.js";
import { formatItemForComparison } from "./item-stats.js";

/**
 * Checks if a category supports item comparison.
 * @param {string} categoryId - The category ID
 * @returns {boolean}
 */
export function isComparableCategory(categoryId) {
    return ["primary", "secondary", "wheelchairs", "armors"].includes(categoryId);
}

/**
 * Gets the currently equipped item for a given category on an actor.
 * @param {Actor} actor - The actor to check
 * @param {string} category - The category ID
 * @returns {Item|null}
 */
export function getEquippedItem(actor, category) {
    if (!actor) return null;
    switch (category) {
        case "primary":
            return actor.items.find(x => x.type === "weapon" && x.system.equipped && !x.system.secondary && !x.name.includes("Wheelchair"));
        case "secondary":
            return actor.items.find(x => x.type === "weapon" && x.system.equipped && x.system.secondary && !x.name.includes("Wheelchair"));
        case "wheelchairs":
            return actor.items.find(x => x.type === "weapon" && x.system.equipped && !x.system.secondary);
        case "armors":
            return actor.items.find(x => x.type === "armor" && x.system.equipped);
        default:
            return null;
    }
}

/**
 * Compares features between equipped and store item, marking gained/lost
 * features. Mutates `storeItem` in place (adds `lostFeatures` and sets
 * `isGained` on each entry of `storeItem.features`).
 *
 * @param {Object} equipped - Equipped item descriptor from formatItemForComparison
 * @param {Object} storeItem - Store item descriptor from formatItemForComparison
 */
export function compareFeatures(equipped, storeItem) {
    if (equipped.features && equipped.features.length > 0) {
        const storeFeatureNames = (storeItem.features || []).map(f => f.name.toLowerCase());
        storeItem.lostFeatures = equipped.features
            .filter(f => !storeFeatureNames.includes(f.name.toLowerCase()));
    }
    if (storeItem.features && storeItem.features.length > 0) {
        const equippedFeatureNames = (equipped.features || []).map(f => f.name.toLowerCase());
        storeItem.features.forEach(f => {
            f.isGained = !equippedFeatureNames.includes(f.name.toLowerCase());
        });
    }
}

/**
 * Adds comparison indicators (up/down arrows) to the store item. Mutates
 * `storeItem` in place by setting `*Compare` fields ("up" / "down") on the
 * stats that differ from the equipped counterpart.
 *
 * @param {Object} equipped - Equipped item descriptor from formatItemForComparison
 * @param {Object} storeItem - Store item descriptor from formatItemForComparison
 */
export function addComparisonIndicators(equipped, storeItem) {
    const rangeOrder = ["Melee", "Very Close", "Close", "Far", "Very Far"];

    if (storeItem.isWeapon && equipped.isWeapon) {
        const equippedRangeIdx = rangeOrder.indexOf(equipped.range);
        const storeRangeIdx = rangeOrder.indexOf(storeItem.range);
        if (equippedRangeIdx !== -1 && storeRangeIdx !== -1) {
            if (storeRangeIdx > equippedRangeIdx) storeItem.rangeCompare = "up";
            else if (storeRangeIdx < equippedRangeIdx) storeItem.rangeCompare = "down";
        }

        const equippedDamage = parseDamageValue(equipped.damageDisplay);
        const storeDamage = parseDamageValue(storeItem.damageDisplay);
        if (equippedDamage !== null && storeDamage !== null) {
            if (storeDamage > equippedDamage) storeItem.damageCompare = "up";
            else if (storeDamage < equippedDamage) storeItem.damageCompare = "down";
        }

        compareFeatures(equipped, storeItem);
    } else if (!storeItem.isWeapon && !equipped.isWeapon) {
        if (storeItem.baseScore > equipped.baseScore) storeItem.baseScoreCompare = "up";
        else if (storeItem.baseScore < equipped.baseScore) storeItem.baseScoreCompare = "down";

        if (storeItem.thresholdMajor > equipped.thresholdMajor) storeItem.thresholdMajorCompare = "up";
        else if (storeItem.thresholdMajor < equipped.thresholdMajor) storeItem.thresholdMajorCompare = "down";

        if (storeItem.thresholdSevere > equipped.thresholdSevere) storeItem.thresholdSevereCompare = "up";
        else if (storeItem.thresholdSevere < equipped.thresholdSevere) storeItem.thresholdSevereCompare = "down";

        compareFeatures(equipped, storeItem);
    }
}

/**
 * Builds comparison data for the tooltip.
 * @param {string} storeItemUuid - UUID of the store item
 * @param {string} category - The category ID
 * @param {Actor} actor - The player's actor
 * @returns {Promise<Object|null>}
 */
export async function buildComparisonData(storeItemUuid, category, actor) {
    const storeDoc = await fromUuid(storeItemUuid);
    if (!storeDoc) return null;

    const equippedItem = getEquippedItem(actor, category);
    const equipped = formatItemForComparison(equippedItem);
    const storeItem = formatItemForComparison(storeDoc);

    if (equipped && storeItem) addComparisonIndicators(equipped, storeItem);

    return { equipped, storeItem, hasEquipped: !!equippedItem };
}
