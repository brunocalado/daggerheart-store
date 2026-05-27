/**
 * Pure helpers for vendor relationship and presence pricing math.
 * Extracted from `store-config.js`, where the same formulas were duplicated
 * across three call sites (initial render, relation-change event handler,
 * and presence-column refresh).
 *
 * Sign conventions (preserved verbatim from the original code):
 *  - Positive relation level → buyer gets a discount → multiplier < 1.
 *  - Negative relation level → buyer pays more → multiplier > 1.
 *  - Positive presence value → discount → presenceMultiplier < 1.
 *  - Negative presence value → markup → presenceMultiplier > 1.
 *
 * These helpers only return numbers and `{text, className}` badge descriptors.
 * They never touch the DOM. Each call site in `store-config.js` keeps its own
 * DOM-mutation code so its subtly different invariants stay local.
 */

const NEUTRAL_BADGE = { text: "—", className: "effect-neutral" };

/**
 * Multiplier applied to a base price by the relation level.
 * @param {number} level - Relation level (negative, zero, or positive)
 * @param {number} pct - Configured percentage for that level (e.g. 25 for 25%)
 * @returns {number}
 */
export function getRelationMultiplier(level, pct) {
    if (level < 0) return 1 + pct / 100;
    if (level > 0) return 1 - pct / 100;
    return 1;
}

/**
 * Multiplier applied to a base price by an actor's presence trait.
 * @param {number} presenceValue - The actor's presence trait value
 * @param {number} modifierPct - The configured "% per presence point" modifier
 * @returns {number}
 */
export function getPresenceMultiplier(presenceValue, modifierPct) {
    const presencePctRaw = presenceValue * modifierPct;
    return 1 - presencePctRaw / 100;
}

/**
 * Renders the relation-effect badge for the vendor relationships table.
 * @param {number} level - Relation level
 * @param {number} pct - Configured percentage for that level
 * @returns {{text: string, className: string}}
 */
export function formatRelationBadge(level, pct) {
    if (level < 0) return { text: `+${pct}%`, className: "effect-up" };
    if (level > 0) return { text: `-${pct}%`, className: "effect-down" };
    return { ...NEUTRAL_BADGE };
}

/**
 * Renders the presence-effect badge. The raw presence percentage (used both
 * for display and for the total calculation) is passed in by the caller so
 * it stays the single source of truth at the call site.
 *
 * @param {number} presenceValue - The actor's presence trait value
 * @param {number} presencePctRaw - presenceValue * modifierPct
 * @returns {{text: string, className: string}}
 */
export function formatPresenceBadge(presenceValue, presencePctRaw) {
    if (presenceValue > 0) {
        return { text: `-${Math.abs(presencePctRaw).toFixed(1)}%`, className: "effect-down" };
    }
    if (presenceValue < 0) {
        return { text: `+${Math.abs(presencePctRaw).toFixed(1)}%`, className: "effect-up" };
    }
    return { ...NEUTRAL_BADGE };
}

/**
 * Renders the combined "total" badge (relation × presence) shown when the
 * presence modifier is enabled. Returns the neutral badge when the combined
 * effect is below the 0.05% display threshold.
 *
 * @param {number} totalPct - (combinedMultiplier - 1) * 100
 * @returns {{text: string, className: string}}
 */
export function formatTotalBadge(totalPct) {
    if (Math.abs(totalPct) < 0.05) return { ...NEUTRAL_BADGE };
    if (totalPct < 0) {
        return { text: `${totalPct.toFixed(1)}%`, className: "effect-down" };
    }
    return { text: `+${totalPct.toFixed(1)}%`, className: "effect-up" };
}
