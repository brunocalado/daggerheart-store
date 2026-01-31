/**
 * StockManager - Gerencia sistema de estoque limitado
 * Usa Actor Flags no Party Actor configurado para armazenar dados de estoque
 * Players precisam de permissão Owner no Party Actor para decrementar stock
 */

export class StockManager {
    static MODULE_ID = "daggerheart-store";

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
     * @param {string} itemName - Nome do item
     * @returns {number|null} Quantidade (null = ilimitado)
     */
    static getStock(itemName) {
        if (!this.isStockEnabled()) return null;

        const actor = this.getStoreActor();
        if (!actor) return null;

        const stockData = actor.getFlag(this.MODULE_ID, "stock.items") || {};
        const itemStock = stockData[itemName];

        if (!itemStock || itemStock.unlimited) return null;
        return itemStock.quantity ?? 0;
    }

    /**
     * Define quantidade em estoque para um item (GM only)
     * @param {string} itemName - Nome do item
     * @param {number} quantity - Quantidade
     * @param {boolean} unlimited - Se true, ignora quantity
     * @returns {boolean} Sucesso
     */
    static async setStock(itemName, quantity, unlimited = false) {
        if (!game.user.isGM) {
            console.warn(`${this.MODULE_ID} | Only GM can set stock`);
            return false;
        }

        const actor = this.getStoreActor();
        if (!actor) return false;

        try {
            const stockPath = `flags.${this.MODULE_ID}.stock.items.${itemName}`;

            await actor.update({
                [stockPath]: {
                    quantity: unlimited ? null : Math.max(0, quantity),
                    unlimited: unlimited,
                    restockQuantity: unlimited ? 0 : Math.max(0, quantity),
                    lastRestocked: Date.now()
                }
            });

            return true;
        } catch (err) {
            console.error(`${this.MODULE_ID} | Error setting stock for "${itemName}":`, err);
            return false;
        }
    }

    /**
     * Decrementa estoque de um item
     * Player precisa de permissão Owner no Party Actor
     * @param {string} itemName - Nome do item
     * @param {number} amount - Quantidade a decrementar
     * @returns {boolean} Sucesso
     */
    static async decrementStock(itemName, amount = 1) {
        if (!this.isStockEnabled()) return true;

        const actor = this.getStoreActor();
        if (!actor) return true; // Sem actor = permite compra

        // Verificar se o usuário pode atualizar o actor
        if (!actor.canUserModify(game.user, "update")) {
            console.warn(`${this.MODULE_ID} | User lacks permission to update Party Actor. Stock will not be decremented.`);
            // Permitir compra mesmo sem decrementar stock
            // O GM pode dar permissão Owner no Party Actor para habilitar stock tracking
            return true;
        }

        const stockData = actor.getFlag(this.MODULE_ID, "stock.items") || {};
        const itemStock = stockData[itemName];

        // Se ilimitado ou não rastreado, permitir
        if (!itemStock || itemStock.unlimited) return true;

        const currentQty = itemStock.quantity ?? 0;
        if (currentQty < amount) return false; // Sem estoque suficiente

        try {
            const version = actor.getFlag(this.MODULE_ID, "stock.version") || 1;
            const stockPath = `flags.${this.MODULE_ID}.stock`;

            await actor.update({
                [`${stockPath}.items.${itemName}.quantity`]: currentQty - amount,
                [`${stockPath}.version`]: version + 1
            });

            return true;
        } catch (err) {
            console.error(`${this.MODULE_ID} | Error decrementing stock for "${itemName}":`, err);
            return false;
        }
    }

    /**
     * Define estoque em lote para uma categoria/tier (GM only)
     */
    static async bulkSetCategoryStock(categoryKey, tier, quantity, unlimited = false) {
        if (!game.user.isGM) return false;

        try {
            const { PRICE_DATA } = await import("./price-data.js");
            const categoryItems = PRICE_DATA[categoryKey] || {};

            const updates = [];
            for (const [itemName, data] of Object.entries(categoryItems)) {
                if (data.tier === tier) {
                    updates.push(this.setStock(itemName, quantity, unlimited));
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
     * @param {Function} progressCallback - Optional callback for progress updates (current, total)
     * @returns {number} Number of items updated
     */
    static async batchApplyDefaults(categoryDefaults, progressCallback = null) {
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

                stockItems[itemName] = {
                    quantity: qty,
                    unlimited: false,
                    restockQuantity: qty,
                    lastRestocked: Date.now()
                };

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
            const updates = {};

            for (const [itemName, itemStock] of Object.entries(stockData)) {
                if (!itemStock.unlimited) {
                    updates[`flags.${this.MODULE_ID}.stock.items.${itemName}.quantity`] =
                        itemStock.restockQuantity || 0;
                    updates[`flags.${this.MODULE_ID}.stock.items.${itemName}.lastRestocked`] =
                        Date.now();
                }
            }

            if (Object.keys(updates).length > 0) {
                await actor.update(updates);
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
            "Primary Weapons": { tier1: 10, tier2: 5, tier3: 3, tier4: 1, unlimited: false },
            "Secondary Weapons": { tier1: 10, tier2: 5, tier3: 3, tier4: 1, unlimited: false },
            "Armors": { tier1: 8, tier2: 4, tier3: 2, tier4: 1, unlimited: false },
            "Wheelchairs": { tier1: 5, tier2: 3, tier3: 2, tier4: 1, unlimited: false },
            "Potions": { tier1: 20, tier2: 15, tier3: 10, tier4: 5, unlimited: false },
            "Consumables": { tier1: 15, tier2: 10, tier3: 5, tier4: 3, unlimited: false },
            "Loot": { tier1: 10, tier2: 7, tier3: 4, tier4: 2, unlimited: false }
        };
    }
}
