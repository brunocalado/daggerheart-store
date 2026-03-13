import { queryDecrementStock, queryIncrementStock } from "./socket.js";

/**
 * StockManager - Manages the limited stock system.
 * Uses Actor Flags on the configured Party Actor to store stock data.
 * Stock writes are delegated to the GM via the query system (socket.js).
 * Players do NOT need Owner permission on the Party Actor.
 *
 * Estrutura de dados:
 * stock: {
 *   version: number,
 *   items: {
 *     [sanitizedUuid]: { stockpile: { q: quantity, r: restockQuantity, u: unlimited } }
 *   },
 *   categoryDefaults: { [category]: { tier1, tier2, tier3, tier4 } }
 * }
 *
 * Nota: UUIDs são sanitizados (pontos substituídos por pipes) para evitar
 * conflitos com a notação de path do Foundry VTT.
 * Ex: "Compendium.daggerheart.weapons.Item.ABC123" -> "Compendium|daggerheart|weapons|Item|ABC123"
 */

export class StockManager {
    static MODULE_ID = "daggerheart-store";

    /**
     * Sanitiza UUID para uso como chave de objeto (substitui pontos por pipes)
     * @param {string} uuid - UUID original
     * @returns {string} UUID sanitizado
     */
    static sanitizeKey(uuid) {
        return uuid.replace(/\./g, "|");
    }

    /**
     * Restaura UUID original de uma chave sanitizada
     * @param {string} key - Chave sanitizada
     * @returns {string} UUID original
     */
    static unsanitizeKey(key) {
        return key.replace(/\|/g, ".");
    }

    /**
     * Obtém o actor de inventário da loja (Party Actor configurado)
     * @returns {Actor|null}
     */
    static getStoreActor() {
        const partyActorId = game.settings.get(this.MODULE_ID, "partyActorId");
        if (!partyActorId) return null;

        const actor = game.actors.get(partyActorId);
        if (!actor) return null;

        return actor;
    }

    /**
     * Inicializa dados de estoque no Party Actor se não existirem
     * @returns {boolean} Sucesso
     */
    static async initializeStockData() {
        const actor = this.getStoreActor();
        if (!actor) return false;

        // Só GM pode inicializar
        if (!game.user.isGM) return false;

        const existingStock = actor.getFlag(this.MODULE_ID, "stock");
        if (!existingStock) {
            try {
                await actor.setFlag(this.MODULE_ID, "stock", {
                    version: 1,
                    items: {},
                    categoryDefaults: this._getDefaultCategorySettings()
                });
                console.log(`${this.MODULE_ID} | Stock data initialized on Party Actor`);
            } catch (err) {
                console.error(`${this.MODULE_ID} | Error initializing stock data:`, err);
                return false;
            }
        }

        return true;
    }

    /**
     * Verifica se o sistema de estoque está habilitado
     * @returns {boolean}
     */
    static isStockEnabled() {
        return game.settings.get(this.MODULE_ID, "stockEnabled") ?? false;
    }

    /**
     * Obtém quantidade em estoque para um item
     * @param {string} itemUuid - UUID do item (ex: "Compendium.daggerheart.weapons.Item.PC5EyEIq7NWBV0n5")
     * @returns {number|null} Quantidade (null = ilimitado)
     */
    static getStock(itemUuid) {
        if (!this.isStockEnabled()) return null;

        const actor = this.getStoreActor();
        if (!actor) return null;

        const stockData = actor.getFlag(this.MODULE_ID, "stock.items") || {};
        const key = this.sanitizeKey(itemUuid);
        const itemStock = stockData[key];

        if (!itemStock?.stockpile || itemStock.stockpile.u) return null;
        return itemStock.stockpile.q ?? 0;
    }

    /**
     * Verifica se um item está explicitamente marcado como ilimitado
     * @param {string} itemUuid - UUID do item
     * @returns {boolean} True se ilimitado (u: true)
     */
    static isUnlimited(itemUuid) {
        if (!this.isStockEnabled()) return false;

        const actor = this.getStoreActor();
        if (!actor) return false;

        const stockData = actor.getFlag(this.MODULE_ID, "stock.items") || {};
        const key = this.sanitizeKey(itemUuid);
        const itemStock = stockData[key];

        return itemStock?.stockpile?.u === true;
    }

    /**
     * Define quantidade em estoque para um item (GM only)
     * @param {string} itemUuid - UUID do item
     * @param {number} quantity - Quantidade
     * @param {boolean} unlimited - Se true, ignora quantity
     * @returns {boolean} Sucesso
     */
    static async setStock(itemUuid, quantity, unlimited = false) {
        if (!game.user.isGM) {
            console.warn(`${this.MODULE_ID} | Only GM can set stock`);
            return false;
        }

        const actor = this.getStoreActor();
        if (!actor) return false;

        try {
            const key = this.sanitizeKey(itemUuid);
            const stockItems = actor.getFlag(this.MODULE_ID, "stock.items") || {};
            const existingRestock = stockItems[key]?.stockpile?.r;

            stockItems[key] = {
                stockpile: {
                    q: unlimited ? null : Math.max(0, quantity),
                    r: existingRestock ?? (unlimited ? 0 : Math.max(0, quantity)),
                    u: unlimited
                }
            };

            await actor.setFlag(this.MODULE_ID, "stock.items", stockItems);
            return true;
        } catch (err) {
            console.error(`${this.MODULE_ID} | Error setting stock for "${itemUuid}":`, err);
            return false;
        }
    }

    /**
     * Decrements stock for an item via GM query to avoid race conditions.
     * @param {string} itemUuid - Item UUID
     * @param {number} amount - Quantity to decrement
     * @returns {Promise<boolean>} Whether the decrement succeeded
     */
    static async decrementStock(itemUuid, amount = 1) {
        if (!this.isStockEnabled()) return true;
        const actor = this.getStoreActor();
        if (!actor) return true;

        const result = await queryDecrementStock(itemUuid, amount);
        return result.ok;
    }

    /**
     * Increments stock for an item via GM query to avoid race conditions.
     * @param {string} itemUuid - Item UUID
     * @param {number} amount - Quantity to increment
     * @returns {Promise<boolean>} Whether the increment succeeded
     */
    static async incrementStock(itemUuid, amount = 1) {
        if (!this.isStockEnabled()) return true;
        const actor = this.getStoreActor();
        if (!actor) return true;

        const result = await queryIncrementStock(itemUuid, amount);
        return result.ok;
    }

    /**
     * Define estoque em lote para uma categoria/tier (GM only)
     * @param {string} categoryKey - Chave da categoria
     * @param {number} tier - Tier do item
     * @param {number} quantity - Quantidade
     * @param {boolean} unlimited - Se ilimitado
     * @param {Function} getItemUuid - Função para obter UUID do item pelo nome
     * @returns {boolean} Sucesso
     */
    static async bulkSetCategoryStock(categoryKey, tier, quantity, unlimited = false, getItemUuid) {
        if (!game.user.isGM) return false;

        try {
            const { PRICE_DATA } = await import("./price-data.js");
            const categoryItems = PRICE_DATA[categoryKey] || {};

            const updates = [];
            for (const [itemName, data] of Object.entries(categoryItems)) {
                if (data.tier === tier) {
                    const uuid = getItemUuid ? getItemUuid(itemName) : null;
                    if (uuid) {
                        updates.push(this.setStock(uuid, quantity, unlimited));
                    }
                }
            }

            await Promise.all(updates);
            return true;
        } catch (err) {
            console.error(`${this.MODULE_ID} | Error in bulk set for ${categoryKey} tier ${tier}:`, err);
            return false;
        }
    }

    /**
     * Batch apply stock defaults - single actor update for all items
     * @param {Object} categoryDefaults - Default quantities by category/tier
     * @param {Function} getItemUuid - Function to get item UUID from name and category
     * @param {Function} progressCallback - Optional callback for progress updates (current, total)
     * @returns {number} Number of items updated
     */
    static async batchApplyDefaults(categoryDefaults, getItemUuid, progressCallback = null) {
        if (!game.user.isGM) return 0;

        const actor = this.getStoreActor();
        if (!actor) return 0;

        const { PRICE_DATA } = await import("./price-data.js");

        // Build all updates in memory first
        const stockItems = {};
        let itemCount = 0;

        // Count total items first for progress
        let totalItems = 0;
        for (const categoryData of Object.values(PRICE_DATA)) {
            totalItems += Object.keys(categoryData).length;
        }

        for (const [categoryKey, categoryData] of Object.entries(PRICE_DATA)) {
            const defaults = categoryDefaults[categoryKey];
            if (!defaults) continue;

            for (const [itemName, itemData] of Object.entries(categoryData)) {
                const tier = itemData.tier;
                const qty = defaults[`tier${tier}`] || 0;
                const uuid = getItemUuid ? getItemUuid(itemName, categoryKey) : null;

                if (uuid) {
                    const key = this.sanitizeKey(uuid);
                    stockItems[key] = {
                        stockpile: { q: qty, r: qty, u: false }
                    };
                }

                itemCount++;

                // Report progress
                if (progressCallback) {
                    progressCallback(itemCount, totalItems);
                }
            }
        }

        // Single actor update with all items
        try {
            const version = actor.getFlag(this.MODULE_ID, "stock.version") || 1;
            await actor.update({
                [`flags.${this.MODULE_ID}.stock.items`]: stockItems,
                [`flags.${this.MODULE_ID}.stock.version`]: version + 1
            });

            return itemCount;
        } catch (err) {
            console.error(`${this.MODULE_ID} | Error in batch apply defaults:`, err);
            return 0;
        }
    }

    /**
     * Reseta estoque para quantidades originais (restock completo) - GM only
     */
    static async resetAllStock() {
        if (!game.user.isGM) return;

        const actor = this.getStoreActor();
        if (!actor) return;

        try {
            const stockData = actor.getFlag(this.MODULE_ID, "stock.items") || {};
            let hasChanges = false;

            for (const [key, itemStock] of Object.entries(stockData)) {
                if (!itemStock.stockpile?.u) {
                    stockData[key].stockpile.q = itemStock.stockpile?.r || 0;
                    hasChanges = true;
                }
            }

            if (hasChanges) {
                const version = actor.getFlag(this.MODULE_ID, "stock.version") || 1;
                await actor.update({
                    [`flags.${this.MODULE_ID}.stock.items`]: stockData,
                    [`flags.${this.MODULE_ID}.stock.version`]: version + 1
                });
            }
        } catch (err) {
            console.error(`${this.MODULE_ID} | Error during full restock:`, err);
        }
    }

    /**
     * Retorna configurações padrão de estoque por categoria
     * @private
     */
    static _getDefaultCategorySettings() {
        return {
            "Primary Weapons": { tier1: 10, tier2: 5, tier3: 3, tier4: 1 },
            "Secondary Weapons": { tier1: 10, tier2: 5, tier3: 3, tier4: 1 },
            "Armors": { tier1: 8, tier2: 4, tier3: 2, tier4: 1 },
            "Wheelchairs": { tier1: 5, tier2: 3, tier3: 2, tier4: 1 },
            "Potions": { tier1: 20, tier2: 15, tier3: 10, tier4: 5 },
            "Consumables": { tier1: 15, tier2: 10, tier3: 5, tier4: 3 },
            "Loot": { tier1: 10, tier2: 7, tier3: 4, tier4: 2 }
        };
    }
}
