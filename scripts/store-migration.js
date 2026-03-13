/**
 * Migration script: converts legacy {{{...}}} description tags to Foundry item flags.
 * Exposed as game.daggerheartStore.migrateTags() for GM use.
 */

import { MODULE_ID, VALID_ITEM_TYPES, STORE_FLAGS } from "./store-constants.js";
import { parseLegacyStoreTags, stripLegacyStoreTags } from "./store-utils.js";

/**
 * Migrates a single item: writes flags from parsed legacy tags and strips tags from description.
 * @param {Item} item - The Foundry item document to migrate
 * @returns {Promise<Object>} Migration result for this item
 */
async function migrateItem(item) {
    const { price, tier, header } = parseLegacyStoreTags(item);

    if (price === null && tier === null && header === null) {
        return { name: item.name, uuid: item.uuid, skipped: true };
    }

    if (price  !== null) await item.setFlag(MODULE_ID, STORE_FLAGS.price,  price);
    if (tier   !== null) await item.setFlag(MODULE_ID, STORE_FLAGS.tier,   tier);
    if (header !== null) await item.setFlag(MODULE_ID, STORE_FLAGS.header, header);

    const rawDesc = String(
        foundry.utils.getProperty(item, "system.description") || ""
    );
    const cleanDesc = stripLegacyStoreTags(rawDesc, { price, tier, header });
    await item.update({ "system.description": cleanDesc });

    return { name: item.name, uuid: item.uuid, price, tier, header, skipped: false };
}

/**
 * Runs the full tag migration across world items, actor-owned items, and all item compendiums.
 * Locked compendiums are temporarily unlocked and re-locked automatically.
 * Idempotent: running twice causes no harm since descriptions are cleaned on first pass.
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - If true, only logs what would be migrated without writing
 * @returns {Promise<void>}
 */
export async function migrateTags({ dryRun = false } = {}) {
    if (!game.user.isGM) {
        ui.notifications.error("Only GMs can run the tag migration.");
        return;
    }

    if (dryRun) console.warn(`[${MODULE_ID}] DRY RUN — no data will be written.`);

    const results = [];

    // 1. World items
    console.log(`[${MODULE_ID}] Scanning world items...`);
    for (const item of game.items.contents) {
        if (!VALID_ITEM_TYPES.includes(item.type)) continue;
        if (dryRun) {
            const tags = parseLegacyStoreTags(item);
            if (tags.price !== null || tags.tier !== null || tags.header !== null)
                results.push({ source: "world", name: item.name, uuid: item.uuid, ...tags });
            continue;
        }
        results.push({ source: "world", ...(await migrateItem(item)) });
    }

    // 2. Actor-owned items
    console.log(`[${MODULE_ID}] Scanning actor-owned items...`);
    for (const actor of game.actors.contents) {
        for (const item of actor.items.contents) {
            if (!VALID_ITEM_TYPES.includes(item.type)) continue;
            if (dryRun) {
                const tags = parseLegacyStoreTags(item);
                if (tags.price !== null || tags.tier !== null || tags.header !== null)
                    results.push({ source: `actor:${actor.name}`, name: item.name, uuid: item.uuid, ...tags });
                continue;
            }
            results.push({ source: `actor:${actor.name}`, ...(await migrateItem(item)) });
        }
    }

    // 3. Compendium packs containing items
    const itemPacks = game.packs.filter(p => p.documentName === "Item");
    console.log(`[${MODULE_ID}] Scanning ${itemPacks.length} item compendium(s)...`);

    for (const pack of itemPacks) {
        const wasLocked = pack.locked;
        console.log(`[${MODULE_ID}] Pack: ${pack.collection} (locked: ${wasLocked})`);

        try {
            if (wasLocked && !dryRun) await pack.configure({ locked: false });

            const items = await pack.getDocuments();
            for (const item of items) {
                if (!VALID_ITEM_TYPES.includes(item.type)) continue;
                if (dryRun) {
                    const tags = parseLegacyStoreTags(item);
                    if (tags.price !== null || tags.tier !== null || tags.header !== null)
                        results.push({ source: `pack:${pack.collection}`, name: item.name, uuid: item.uuid, ...tags });
                    continue;
                }
                results.push({ source: `pack:${pack.collection}`, ...(await migrateItem(item)) });
            }
        } finally {
            if (wasLocked && !dryRun) await pack.configure({ locked: true });
        }
    }

    const migrated = results.filter(r => !r.skipped);
    const skipped  = results.filter(r =>  r.skipped);

    console.log(`[${MODULE_ID}] ===== Migration${dryRun ? " (DRY RUN)" : ""} complete =====`);
    console.log(`  Migrated : ${migrated.length}`);
    console.log(`  Skipped  : ${skipped.length} (no tags found)`);
    if (migrated.length) console.table(migrated);

    ui.notifications.info(
        `${MODULE_ID} | ${dryRun ? "[DRY RUN] Would migrate" : "Migrated"}: ` +
        `${migrated.length} items, ${skipped.length} skipped. Check console (F12) for details.`
    );
}
