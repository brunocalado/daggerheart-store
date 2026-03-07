/**
 * Shared constants for the Daggerheart Store module.
 * Centralizes category definitions, type mappings, and export keys
 * to avoid duplication across multiple application files.
 */

export const MODULE_ID = "daggerheart-store";

/** Standard store categories with their display labels and data keys */
export const STANDARD_CATEGORIES = [
    { id: "primary", label: "Primary Weapons", key: "Primary Weapons" },
    { id: "secondary", label: "Secondary Weapons", key: "Secondary Weapons" },
    { id: "wheelchairs", label: "Wheelchairs", key: "Wheelchairs" },
    { id: "armors", label: "Armor", key: "Armors" },
    { id: "potions", label: "Potions", key: "Potions" },
    { id: "consumables", label: "Consumables", key: "Consumables" },
    { id: "loot", label: "Loot", key: "Loot" }
];

/** Maps category keys to the Foundry item type expected in that category */
export const CATEGORY_ITEM_TYPE = {
    "Primary Weapons": "weapon",
    "Secondary Weapons": "weapon",
    "Wheelchairs": "weapon",
    "Armors": "armor",
    "Potions": "consumable",
    "Consumables": "consumable",
    "Loot": "loot"
};

/** Base valid item types for store display */
export const VALID_ITEM_TYPES = ["weapon", "armor", "consumable", "loot"];

/** System compendiums excluded from custom compendium selection (already used by default tabs) */
export const EXCLUDED_SYSTEM_PACKS = [
    "daggerheart.classes",
    "daggerheart.subclasses",
    "daggerheart.domains",
    "daggerheart.ancestries",
    "daggerheart.communities",
    "daggerheart.weapons",
    "daggerheart.armors",
    "daggerheart.consumables",
    "daggerheart.loot",
    "daggerheart.beastforms"
];

/** Icon mapping for category cards in config UI */
export const CATEGORY_ICONS = {
    "Primary Weapons": "fa-sword",
    "Secondary Weapons": "fa-bow-arrow",
    "Wheelchairs": "fa-wheelchair",
    "Armors": "fa-shield-halved",
    "Potions": "fa-flask-round-potion",
    "Consumables": "fa-utensils",
    "Loot": "fa-gem",
    "CustomTab": "fa-store"
};

/** Settings keys included in profile save/load and import/export */
export const EXPORTABLE_SETTINGS = [
    "storeName", "priceModifier", "allowedTiers", "hiddenCategories",
    "customCompendiums", "priceOverrides", "saleDiscount", "saleItems",
    "hiddenItems", "blockedSaleItems", "blockedPurchaseItems", "lockedItems",
    "epicItems", "epicIcon", "epicColor", "epicLabel", "epicEffect",
    "partyActorId", "customTabName", "customTabCompendiums", "customTabTierGroup",
    "useDefaultCompendiums", "sellRatio", "stockEnabled", "showStockQuantity", "randomizerSettings",
    "currencyMode", "chatPrivacy", "chatMessageStyle"
];

/** Settings stored as objects (used for merge logic during import) */
export const OBJECT_SETTINGS = [
    "allowedTiers", "hiddenCategories", "priceOverrides", "saleItems",
    "hiddenItems", "blockedSaleItems", "blockedPurchaseItems", "lockedItems",
    "epicItems", "randomizerSettings"
];

/** Settings stored as arrays (used for merge logic during import) */
export const ARRAY_SETTINGS = ["customCompendiums", "customTabCompendiums"];
