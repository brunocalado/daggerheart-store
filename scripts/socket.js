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
import { MODULE_ID } from "./store-constants.js";

// ---------------------------------------------------------------
// Query key constants
// ---------------------------------------------------------------
const Q = {
    decrementStock:    `${MODULE_ID}.decrementStock`,
    incrementStock:    `${MODULE_ID}.incrementStock`,
    depositToParty:    `${MODULE_ID}.depositToParty`,
    withdrawFromParty: `${MODULE_ID}.withdrawFromParty`,
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
        const stockData = actor.getFlag(MODULE_ID, "stock.items") || {};
        const itemStock = stockData[key];

        if (!itemStock?.stockpile || itemStock.stockpile.u) return { ok: true };

        const currentQty = itemStock.stockpile.q ?? 0;
        if (currentQty < amount) return { ok: false, reason: "out_of_stock" };

        stockData[key].stockpile.q = currentQty - amount;
        const version = actor.getFlag(MODULE_ID, "stock.version") || 1;

        try {
            await actor.update({
                [`flags.${MODULE_ID}.stock.items`]: stockData,
                [`flags.${MODULE_ID}.stock.version`]: version + 1
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
        const stockData = actor.getFlag(MODULE_ID, "stock.items") || {};
        const itemStock = stockData[key];

        if (itemStock?.stockpile?.u) return { ok: true };

        const currentQty = itemStock?.stockpile?.q;

        try {
            if (!stockData[key] || !stockData[key].stockpile || currentQty === null || currentQty === undefined) {
                stockData[key] = { stockpile: { q: amount, r: 0, u: false } };
            } else {
                stockData[key].stockpile.q = currentQty + amount;
            }

            const version = actor.getFlag(MODULE_ID, "stock.version") || 1;
            await actor.update({
                [`flags.${MODULE_ID}.stock.items`]: stockData,
                [`flags.${MODULE_ID}.stock.version`]: version + 1
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
