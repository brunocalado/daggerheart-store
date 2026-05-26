/**
 * Query-based inter-client communication for the Daggerheart Store.
 * Delegates all Party Actor writes (stock, funds) to the GM client
 * via Foundry VTT v13's CONFIG.queries system, eliminating race conditions.
 *
 * Registered on the `init` hook by module.js on all clients.
 * Handlers only execute on the GM client; players call the exported
 * query helpers which route through `user.query()`.
 */

import { StockManager } from "./stock-manager.js";
import { deductGold, addGold, getActorWealth } from "./store-utils.js";
import { MODULE_ID, NEGOTIATION_FLAG_KEY, NEGOTIATION_STAGES } from "./store-constants.js";

// ---------------------------------------------------------------
// Query key constants
// ---------------------------------------------------------------
const Q = {
    decrementStock:    `${MODULE_ID}.decrementStock`,
    incrementStock:    `${MODULE_ID}.incrementStock`,
    depositToParty:    `${MODULE_ID}.depositToParty`,
    withdrawFromParty: `${MODULE_ID}.withdrawFromParty`,
    startNegotiation:  `${MODULE_ID}.startNegotiation`,
    gmRespondNeg:      `${MODULE_ID}.gmRespondNeg`,
    cancelNegotiation: `${MODULE_ID}.cancelNegotiation`,
};

// ---------------------------------------------------------------
// Registration — called once from the `init` hook on all clients.
// Foundry routes each query to the targeted user; the handler only
// executes on the GM client. Registration on all clients is required
// so Foundry recognizes the query keys as valid.
// ---------------------------------------------------------------

/**
 * Registers all query handlers in CONFIG.queries.
 * Must be called during the `init` hook on every client.
 */
export function registerQueryHandlers() {
    // --- Stock: Decrement (buy) ---
    CONFIG.queries[Q.decrementStock] = async ({ uuid, amount }) => {
        if (!game.user.isGM) return { ok: false, reason: "not_gm" };

        const actor = StockManager.getStoreActor();
        if (!actor) return { ok: true };

        if (!StockManager.isStockEnabled()) return { ok: true };

        const key = StockManager.sanitizeKey(uuid);
        const stockKey = StockManager.getStockKey();
        const stockData = actor.getFlag(MODULE_ID, `${stockKey}.items`) || {};
        const itemStock = stockData[key];

        if (!itemStock?.stockpile || itemStock.stockpile.u) return { ok: true };

        const currentQty = itemStock.stockpile.q ?? 0;
        if (currentQty < amount) return { ok: false, reason: "out_of_stock" };

        stockData[key].stockpile.q = currentQty - amount;
        const version = actor.getFlag(MODULE_ID, `${stockKey}.version`) || 1;

        try {
            await actor.update({
                [`flags.${MODULE_ID}.${stockKey}.items`]: stockData,
                [`flags.${MODULE_ID}.${stockKey}.version`]: version + 1
            });
            return { ok: true };
        } catch (err) {
            console.error(`${MODULE_ID} | decrementStock query failed:`, err);
            return { ok: false, reason: "update_failed" };
        }
    };

    // --- Stock: Increment (sell) ---
    CONFIG.queries[Q.incrementStock] = async ({ uuid, amount }) => {
        if (!game.user.isGM) return { ok: false, reason: "not_gm" };

        const actor = StockManager.getStoreActor();
        if (!actor) return { ok: true };

        if (!StockManager.isStockEnabled()) return { ok: true };

        const key = StockManager.sanitizeKey(uuid);
        const stockKey = StockManager.getStockKey();
        const stockData = actor.getFlag(MODULE_ID, `${stockKey}.items`) || {};
        const itemStock = stockData[key];

        if (itemStock?.stockpile?.u) return { ok: true };

        const currentQty = itemStock?.stockpile?.q;

        try {
            if (!stockData[key] || !stockData[key].stockpile || currentQty === null || currentQty === undefined) {
                stockData[key] = { stockpile: { q: amount, r: 0, u: false } };
            } else {
                stockData[key].stockpile.q = currentQty + amount;
            }

            const version = actor.getFlag(MODULE_ID, `${stockKey}.version`) || 1;
            await actor.update({
                [`flags.${MODULE_ID}.${stockKey}.items`]: stockData,
                [`flags.${MODULE_ID}.${stockKey}.version`]: version + 1
            });
            return { ok: true };
        } catch (err) {
            console.error(`${MODULE_ID} | incrementStock query failed:`, err);
            return { ok: false, reason: "update_failed" };
        }
    };

    // --- Party Funds: Deposit ---
    CONFIG.queries[Q.depositToParty] = async ({ partyActorId, amount }) => {
        if (!game.user.isGM) return { ok: false, reason: "not_gm" };

        const partyActor = game.actors.get(partyActorId);
        if (!partyActor) return { ok: false, reason: "no_party_actor" };

        try {
            await addGold(partyActor, amount);
            return { ok: true };
        } catch (err) {
            console.error(`${MODULE_ID} | depositToParty query failed:`, err);
            return { ok: false, reason: "update_failed" };
        }
    };

    // --- Party Funds: Withdraw ---
    CONFIG.queries[Q.withdrawFromParty] = async ({ partyActorId, amount }) => {
        if (!game.user.isGM) return { ok: false, reason: "not_gm" };

        const partyActor = game.actors.get(partyActorId);
        if (!partyActor) return { ok: false, reason: "no_party_actor" };

        // Re-read balance inside the handler — this is the atomic check
        const currentBalance = getActorWealth(partyActor);
        if (currentBalance < amount) return { ok: false, reason: "insufficient_funds" };

        try {
            await deductGold(partyActor, amount);
            return { ok: true, newBalance: getActorWealth(partyActor) };
        } catch (err) {
            console.error(`${MODULE_ID} | withdrawFromParty query failed:`, err);
            return { ok: false, reason: "update_failed" };
        }
    };

    // --- Negotiation: Start ---
    // Player initiates a price negotiation. Checks the global lock and writes
    // the initial negotiation state to the Party Actor flags.
    CONFIG.queries[Q.startNegotiation] = async ({ playerId, playerName, itemUuid, itemId, itemName, basePrice, type, playerOffer }) => {
        if (!game.user.isGM) return { ok: false, reason: "not_gm" };

        if (!game.settings.get(MODULE_ID, "negotiationsEnabled"))
            return { ok: false, reason: "disabled" };

        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const partyActor   = partyActorId ? game.actors.get(partyActorId) : null;
        if (!partyActor) return { ok: false, reason: "no_party_actor" };

        const existing = partyActor.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
        if (existing?.active && existing.playerId !== playerId)
            return { ok: false, reason: "negotiation_locked" };

        try {
            await partyActor.setFlag(MODULE_ID, NEGOTIATION_FLAG_KEY, {
                active:      true,
                playerId,
                playerName,
                itemUuid,
                itemId:      itemId ?? null,
                itemName,
                basePrice,
                type,
                playerOffer,
                gmCounter:   null,
                agreedPrice: null,
                stage:       NEGOTIATION_STAGES.PENDING_GM
            });
            return { ok: true };
        } catch (err) {
            console.error(`${MODULE_ID} | startNegotiation query failed:`, err);
            return { ok: false, reason: "update_failed" };
        }
    };

    // --- Negotiation: GM Respond ---
    // Handles all GM-side responses (counter, accept, reject) and the
    // player's final offer submission, which routes through the GM for the write.
    CONFIG.queries[Q.gmRespondNeg] = async ({ action, value }) => {
        if (!game.user.isGM) return { ok: false, reason: "not_gm" };

        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const partyActor   = partyActorId ? game.actors.get(partyActorId) : null;
        if (!partyActor) return { ok: false, reason: "no_party_actor" };

        const flag = partyActor.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
        if (!flag?.active) return { ok: false, reason: "no_active_negotiation" };

        try {
            switch (action) {
                case "counter":
                    await partyActor.setFlag(MODULE_ID, NEGOTIATION_FLAG_KEY, {
                        ...flag,
                        gmCounter: value,
                        stage:     NEGOTIATION_STAGES.PENDING_PLAYER
                    });
                    break;

                case "accept": {
                    // agreedPrice: use player's offer at PENDING_GM or PENDING_GM_FINAL,
                    // or the GM's own counter if accepting that.
                    const agreedPrice = (flag.stage === NEGOTIATION_STAGES.PENDING_GM || flag.stage === NEGOTIATION_STAGES.PENDING_GM_FINAL)
                        ? flag.playerOffer
                        : flag.gmCounter;
                    await partyActor.setFlag(MODULE_ID, NEGOTIATION_FLAG_KEY, {
                        ...flag,
                        agreedPrice,
                        stage: NEGOTIATION_STAGES.ACCEPTED
                    });
                    break;
                }

                case "reject":
                    // Only valid at PENDING_GM_FINAL; signals definitive refusal.
                    await partyActor.setFlag(MODULE_ID, NEGOTIATION_FLAG_KEY, {
                        ...flag,
                        active: false,
                        stage:  NEGOTIATION_STAGES.CANCELLED
                    });
                    await partyActor.unsetFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
                    break;

                case "submitFinal":
                    // Routed from the player through here so the GM client writes the flag.
                    await partyActor.setFlag(MODULE_ID, NEGOTIATION_FLAG_KEY, {
                        ...flag,
                        playerOffer: value,
                        stage:       NEGOTIATION_STAGES.PENDING_GM_FINAL
                    });
                    break;

                default:
                    return { ok: false, reason: "unknown_action" };
            }
            return { ok: true };
        } catch (err) {
            console.error(`${MODULE_ID} | gmRespondNeg query failed (action=${action}):`, err);
            return { ok: false, reason: "update_failed" };
        }
    };

    // --- Negotiation: Cancel ---
    // Clears the active negotiation flag. Called by the player on close,
    // by the GM's force-cancel button, and after purchase execution completes.
    CONFIG.queries[Q.cancelNegotiation] = async () => {
        if (!game.user.isGM) return { ok: false, reason: "not_gm" };

        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        const partyActor   = partyActorId ? game.actors.get(partyActorId) : null;
        if (!partyActor) return { ok: false, reason: "no_party_actor" };

        const flag = partyActor.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
        if (!flag?.active) return { ok: true }; // idempotent

        try {
            // Set inactive first so listeners detect stage: CANCELLED before the key is removed.
            await partyActor.setFlag(MODULE_ID, NEGOTIATION_FLAG_KEY, {
                ...flag,
                active: false,
                stage:  NEGOTIATION_STAGES.CANCELLED
            });
            await partyActor.unsetFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
            return { ok: true };
        } catch (err) {
            console.error(`${MODULE_ID} | cancelNegotiation query failed:`, err);
            return { ok: false, reason: "update_failed" };
        }
    };
}

// ---------------------------------------------------------------
// Query caller helpers — used by player clients (and GM, since
// GM can also call these; the GM path skips the network round-trip
// and executes the handler locally via Foundry's query routing).
// ---------------------------------------------------------------

/**
 * Requests the GM to decrement stock for an item.
 * @param {string} uuid - Item UUID
 * @param {number} amount - Quantity to decrement
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function queryDecrementStock(uuid, amount = 1) {
    if (game.user.isGM) {
        return await CONFIG.queries[Q.decrementStock]({ uuid, amount });
    }

    const gm = game.users.activeGM;
    if (!gm) {
        console.warn(`${MODULE_ID} | No active GM. Stock will not be decremented.`);
        return { ok: true };
    }

    try {
        return await gm.query(Q.decrementStock, { uuid, amount }, { timeout: 10000 });
    } catch (err) {
        console.error(`${MODULE_ID} | queryDecrementStock timed out or failed:`, err);
        return { ok: false, reason: "timeout" };
    }
}

/**
 * Requests the GM to increment stock for an item.
 * @param {string} uuid - Item UUID
 * @param {number} amount - Quantity to increment
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function queryIncrementStock(uuid, amount = 1) {
    if (game.user.isGM) {
        return await CONFIG.queries[Q.incrementStock]({ uuid, amount });
    }

    const gm = game.users.activeGM;
    if (!gm) {
        console.warn(`${MODULE_ID} | No active GM. Stock will not be incremented.`);
        return { ok: true };
    }

    try {
        return await gm.query(Q.incrementStock, { uuid, amount }, { timeout: 10000 });
    } catch (err) {
        console.error(`${MODULE_ID} | queryIncrementStock timed out or failed:`, err);
        return { ok: false, reason: "timeout" };
    }
}

/**
 * Requests the GM to deposit funds into the Party Actor.
 * @param {string} partyActorId - Party Actor ID
 * @param {number} amount - Amount to deposit
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function queryDepositToParty(partyActorId, amount) {
    if (game.user.isGM) {
        return await CONFIG.queries[Q.depositToParty]({ partyActorId, amount });
    }

    const gm = game.users.activeGM;
    if (!gm) return { ok: false, reason: "no_gm" };

    try {
        return await gm.query(Q.depositToParty, { partyActorId, amount }, { timeout: 10000 });
    } catch (err) {
        console.error(`${MODULE_ID} | queryDepositToParty timed out or failed:`, err);
        return { ok: false, reason: "timeout" };
    }
}

/**
 * Requests the GM to withdraw funds from the Party Actor.
 * Balance check happens inside the GM handler against live data.
 * @param {string} partyActorId - Party Actor ID
 * @param {number} amount - Amount to withdraw
 * @returns {Promise<{ok: boolean, reason?: string, newBalance?: number}>}
 */
export async function queryWithdrawFromParty(partyActorId, amount) {
    if (game.user.isGM) {
        return await CONFIG.queries[Q.withdrawFromParty]({ partyActorId, amount });
    }

    const gm = game.users.activeGM;
    if (!gm) return { ok: false, reason: "no_gm" };

    try {
        return await gm.query(Q.withdrawFromParty, { partyActorId, amount }, { timeout: 10000 });
    } catch (err) {
        console.error(`${MODULE_ID} | queryWithdrawFromParty timed out or failed:`, err);
        return { ok: false, reason: "timeout" };
    }
}

// ---------------------------------------------------------------
// Negotiation query helpers
// ---------------------------------------------------------------

/**
 * Requests the GM to start a new price negotiation and set the Party Actor flag.
 * @param {{ playerId: string, playerName: string, itemUuid: string, itemId: string|null,
 *           itemName: string, basePrice: number, type: string, playerOffer: number }} params
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function queryStartNegotiation(params) {
    if (game.user.isGM) {
        return await CONFIG.queries[Q.startNegotiation](params);
    }

    const gm = game.users.activeGM;
    if (!gm) return { ok: false, reason: "no_gm" };

    try {
        return await gm.query(Q.startNegotiation, params, { timeout: 15000 });
    } catch (err) {
        console.error(`${MODULE_ID} | queryStartNegotiation timed out or failed:`, err);
        return { ok: false, reason: "timeout" };
    }
}

/**
 * Sends a negotiation response action to the GM handler.
 * Used for GM-side counter/accept/reject and player-side submitFinal.
 * @param {string} action - "counter" | "accept" | "reject" | "submitFinal"
 * @param {number|null} [value] - The offer or counter value (required for counter/submitFinal)
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function queryGMRespondNeg(action, value = null) {
    if (game.user.isGM) {
        return await CONFIG.queries[Q.gmRespondNeg]({ action, value });
    }

    const gm = game.users.activeGM;
    if (!gm) return { ok: false, reason: "no_gm" };

    try {
        return await gm.query(Q.gmRespondNeg, { action, value }, { timeout: 15000 });
    } catch (err) {
        console.error(`${MODULE_ID} | queryGMRespondNeg (${action}) timed out or failed:`, err);
        return { ok: false, reason: "timeout" };
    }
}

/**
 * Player submits their final offer after receiving a GM counter-proposal.
 * @param {number} finalOffer
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function querySubmitFinalOffer(finalOffer) {
    return queryGMRespondNeg("submitFinal", finalOffer);
}

/**
 * Player accepts the GM's counter-proposal.
 * Advances stage to ACCEPTED with the counter value as agreedPrice.
 * @param {number} agreedPrice - The GM counter value being accepted
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function queryAcceptCounter(agreedPrice) {
    return queryGMRespondNeg("accept", agreedPrice);
}

/**
 * Cancels the active negotiation and clears the Party Actor flag.
 * Idempotent — safe to call even when no negotiation is active.
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function queryCancelNegotiation() {
    if (game.user.isGM) {
        return await CONFIG.queries[Q.cancelNegotiation]();
    }

    const gm = game.users.activeGM;
    if (!gm) return { ok: false, reason: "no_gm" };

    try {
        return await gm.query(Q.cancelNegotiation, {}, { timeout: 10000 });
    } catch (err) {
        console.error(`${MODULE_ID} | queryCancelNegotiation timed out or failed:`, err);
        return { ok: false, reason: "timeout" };
    }
}
