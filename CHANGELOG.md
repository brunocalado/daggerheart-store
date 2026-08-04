# 0.5.9

- [Fixed] The new "Party Inventory" tab could fail to render with "The partial ... store-party-sell-tab.hbs could not be found" — the partial was never registered in `module.js`'s `loadTemplates` preload list.
- [Added] The "Party Inventory" tab now only appears for players with actual Owner permission on the configured Party Actor (Observer access, the default, is no longer enough). Re-checked defensively in `_onSellPartyItem` and `_onNegotiateItem` in case permission changes mid-session.
- [Added] Both "My Inventory" and "Party Inventory" now list items under two headers: "Store Items" (unchanged — catalog- or flag-priced items) and "Other Items — Negotiation Only", covering items of an accepted type (weapon/armor/consumable/loot) with no catalog match and no price flag, e.g. something created on the fly that hasn't been priced yet. These can only be sold through the negotiation flow, where the player proposes their own offer — no direct Sell button is shown for them.

# 0.5.8

- https://github.com/brunocalado/daggerheart-store/issues/11
- [Added] "Party Inventory" tab — a second icon-only tab next to "My Inventory", shown to players whenever a Party Actor is configured in Store Config. Lists the Party Actor's items with the same catalog-priced sell rows, negotiation (bargain), and stock behavior as the personal sell tab. Selling from it credits the party's own wealth instead of the seller's, and (like all other Party Actor writes) is delegated to the GM via a new `sellFromParty` query since players only hold Observer access on that actor. `PARTY_SELL_TAB` in `store-constants.js`, `_buildPartySellTabItems`/`_onSellPartyItem` in `store-app.js`, `store-party-sell-tab.hbs`.
- [Added] Negotiating a sale from the new Party Inventory tab is tracked via an `itemSource` field ("personal" | "party") on the negotiation flag, so `module.js`'s trade-finalization hook knows to delete the item from the Party Actor (via `querySellFromParty`) rather than the player's own character. The GM's negotiation window now shows a "(Party Inventory)" tag next to the offer when applicable.

# 0.5.7

- [Fixed] Negotiated purchases could complete with a negative balance — a player could negotiate a price they couldn't afford and have the GM accept it, silently sending the actor's gold below zero. Negotiating below your current balance is still allowed (that's the point of bargaining), but finalizing the deal is now blocked once the agreed price exceeds the player's actual funds. Checked when the GM clicks Accept (`GMNegotiationApp._onAccept`) and when the player accepts a GM counter-offer (`socket.js` `gmRespondNeg` "accept" case), with a re-check right before purchase execution (`module.js`) as a safety net against funds changing mid-negotiation.
- [Changed] Redesigned the player's "make an offer" dialog (`_onNegotiateItem` in `store-app.js`) — replaced the generic input dialog with a custom layout showing the item's icon and name, a Buying/Selling badge, the listed price, and the offer input inside a bordered box. Clicking the item icon opens its sheet for a quick look. `data-img` added to the bargain button in `store-player-controls.hbs` and `store-sell-tab.hbs` so the dialog can display the item's icon.
- [Changed] Redesigned the GM's negotiation window (`gm-negotiation.hbs`, `store-negotiation-gm.js`, `styles/negotiation.css`) — top title now reads "`<PlayerName>` wants to buy/sell", followed by the item's icon (clickable to open its sheet) and name, then the listed price. The redundant Buying/Selling badge was removed. The player's offer + Accept button, and the counter-offer input + Send Counter button, are now each grouped on a single row inside a bordered/background box instead of stacked as separate full-width rows.
- [Fixed] Both negotiation windows (`GMNegotiationApp`, `PlayerNegotiationApp`) were stuck at a much larger width than intended — they inherited the main store window's CSS class (`.daggerheart-store`), whose `min-width: 870px !important` silently overrode any width set on the negotiation windows. Removed that class from both; they now size correctly.
- [Fixed] Chat messages created by the store (purchases, sales, transfers, negotiation results) could log a `Failed data migration for DhpChatMessage` console error from the Daggerheart system, triggered by `ChatMessage.create()` calls missing a `rolls` field. Added `createStoreChatMessage()` in `store-utils.js`, which always includes `rolls: []`, and switched every `ChatMessage.create()` call in the module to use it. (A second, related instance of this warning was traced to a Daggerheart system bug in core `ChatMessage._preCreate` handling — reproducible with all other modules disabled, so it isn't fixable from this module; reported upstream.)

# 0.5.6

- [Changed] **Maintainability Refactor** — extracted ~700 lines of pure helper functions from `store-app.js` into 5 focused modules to reduce AI context load and improve code organization. No behavioral changes.
- [Added] `item-display.js` — pure string sanitizers and damage parsers (`cleanDescription`, `cleanDescriptionString`, `parseDamageTypes`, `parseDamageValue`). Used by stat extraction and tooltip building.
- [Added] `item-stats.js` — weapon and armor stat extraction, comparison formatting (`getWeaponSummary`, `getArmorSummary`, `extractWeaponStats`, `extractArmorStats`, `formatItemForComparison`, `buildTooltipContent`).
- [Added] `item-comparison.js` — item comparison helpers for the tooltip feature (`isComparableCategory`, `getEquippedItem`, `compareFeatures`, `addComparisonIndicators`, `buildComparisonData`).
- [Added] `vendor-pricing.js` — vendor relationship and presence pricing math extracted and deduplicated (`getRelationMultiplier`, `getPresenceMultiplier`, `formatRelationBadge`, `formatPresenceBadge`, `formatTotalBadge`). Removed 3 duplicated formula blocks from `store-config.js`.
- [Added] `item-catalog.js` — store catalog index builder (`buildStoreCatalogIndex`). Extracted from `store-app.js` as a pure async function.
- [Changed] `store-app.js` reduced from 2304 to 1883 lines (-18%) by extracting pure helpers while preserving all action-bound methods and state-dependent render logic.
- [Changed] `store-config.js` reduced from 958 to 910 lines (-5%) by consolidating 3 duplicated vendor-pricing formula blocks into parameterized helpers.
- [Changed] Updated all call sites in `store-app.js` and `store-config.js` to import and use the new focused modules. Removed all stale `this._methodName` references.

# 0.5.5

- [Added] **Price Negotiations** — players can initiate a bargaining session with the GM. Player clicks "Bargain" button on an item (buy or sell), enters an opening offer, opens `PlayerNegotiationApp` window. GM receives `GMNegotiationApp` automatically. GM can counter, player can accept counter or submit final offer, GM accepts or rejects final. Global lock prevents concurrent negotiations. Feature is toggle-able in Store Config.
- [Added] `PlayerNegotiationApp` (ApplicationV2) — reactive window showing negotiation state (pending_gm, pending_player, pending_gm_final). Closes on resolution or player-initiated cancellation. Updates in real-time via Party Actor flag changes.
- [Added] `GMNegotiationApp` (ApplicationV2) — reactive window for GM to counter, accept, or reject player offers. Auto-opens when player initiates negotiation. Updates in real-time.
- [Added] Three new queries in socket.js: `startNegotiation` (player initiates), `gmRespondNeg` (GM counter/accept/reject/final-offer-submit), `cancelNegotiation` (cleanup). Five helper functions exported for player and GM use.
- [Added] Negotiation state stored as flag on Party Actor: `flags.daggerheart-store.negotiation` with schema: `{ active, playerId, playerName, itemUuid, itemId, itemName, basePrice, type, playerOffer, gmCounter, agreedPrice, stage }`.
- [Added] Module-level `updateActor` hook monitors Party Actor negotiation flag. Auto-opens GM window when negotiation starts. Executes purchase/sale on player's client when GM accepts (buy via `_executePurchase`, sell via item delete + gold add). Cleans up flag after execution.
- [Added] Four new templates: `player-negotiation.hbs`, `gm-negotiation.hbs`, bargain button partials in `store-player-controls.hbs` and `store-sell-tab.hbs`, GM cancel button in `store-header.hbs`, negotiations toggle in `config-stock-tab.hbs`.
- [Added] New stylesheet `styles/negotiation.css` with `.bargain-btn` (mirrors .buy-btn size/style, gold palette) and window styles for both apps.
- [Added] Setting `negotiationsEnabled` (world scope, boolean, default false) — toggleable in Store Config, respects Party Actor availability.
- [Changed] `store-constants.js`: added `NEGOTIATION_FLAG_KEY`, `NEGOTIATION_STAGES` enum, `negotiationsEnabled` to `EXPORTABLE_SETTINGS`.
- [Changed] `module.json`: added `styles/negotiation.css` to styles array.


# 0.5.4

- https://github.com/brunocalado/daggerheart-store/issues/10
- [Added] Integration with dh-unidentified module — when active and an item has `flags["dh-unidentified"].identified === false`, the store displays masked name, image, and description instead of the real ones. Uses `maskedName`, `maskedImg`, and `maskedDescription` from the item flags. Works in both catalog view and "My Inventory" sell tab.
- [Fixed] Batch edit Price and Header fields now default to "Leave unchanged" — they no longer force-overwrite or clear flags on checked items unless explicitly set. Each field has a three-state select: "Leave unchanged" (skips the field), "Set value" (writes the entered value to all checked items), "Clear" (removes the flag). Matches the existing behaviour of the Tier field. Fixes #10.

# 0.5.3

- [Fixed] Weapon damage dice, bonus, and damage type no longer appear blank in store item rows and the compare tooltip. The Daggerheart system changed `system.attack.damage.parts` from an array to a named object (`{ hitPoints: { value, type } }`); the module now reads the first value from the object regardless of whether it's an array or object.
- [Fixed] Store broadcast crash when opening store for all users — made `_handleOpenStoreRequest` async and await `render()` and `maximize()` to ensure element exists before `bringToFront()` accesses it, preventing "Cannot read properties of undefined (reading 'style')" error
- [Fixed] Armor base score now reads correctly from `system.armor.max` (was reading deprecated `system.baseScore`, always showing 0). Item hover summary and compare feature now display the correct armor score and threshold values.
- https://github.com/brunocalado/daggerheart-store/issues/9
- [Added] My Inventory tab now shows items that have a store `price` flag set by the GM, even if they are not registered in the store catalog — valid types (weapon, armor, consumable, loot) with a price flag appear as sellable alongside catalog items. The catalog always takes priority; flag-based items are a fallback. Items sold this way do not affect stock.
- [Fixed] Selling an item now deletes the exact item by ID instead of the first name match, preventing incorrect deletions when a character has multiple items with the same name.
- https://github.com/brunocalado/daggerheart-store/issues/8

# 0.5.2

- [Added] Item Tagger now supports **folder drag-and-drop** for batch tagging — drag a world or compendium folder to load all its items (filtered by valid types) into a checklist, uncheck items as needed, set shared price/tier/header values, and save to all checked items in one operation
- [Added] Batch tier mode now has three states: "Leave unchanged" (skips tier on all items), "None (clear)" (removes tier flag from consumables/loot, preserves weapon/armor system.tier), or a tier value 1–4
- [Added] View button per item in folder batch mode — click the eye icon to open an item's sheet for inspection without closing the tagger
- [Changed] Item Tagger checkbox increased from 14px to 18px and properly center-aligned with item icons for better visual hierarchy
- [Changed] Item type text in folder list now uses lighter color (#aaa) for improved readability
- https://github.com/brunocalado/daggerheart-store/issues/7

# 0.5.1

- [Added] Weapon and armor features now appear in the item name hover tooltip. If both a description and features exist, a separator line divides them. If only features exist (no description), hovering still shows the tooltip.


# 0.5.0

- v14 only
- [Added] `Store.Show()` API now supports profile and player targeting — `Store.Show({ store: "ProfileName", username: "PlayerName" })` loads a profile and sends the store to specific players or all. `Store.Show()` with no arguments remains compatible.
- [Changed] `Store.Show()` method signature changed from `Show(username)` to `Show(options = {})` where options can include `{ username, store }`. Non-GM callers still receive a warning and no-op.
- [Changed] Extracted profile-loading logic into public method `applyProfileByName(profileName)` on `DaggerheartStore` class — used by both UI "Load Profile" button and `Store.Show({ store: "..." })` API.
- [Fixed] `MODULE_ID` now always imported from `store-constants.js` — single source of truth for module ID (was re-declared in 2 files)
- [Fixed] Removed jQuery instanceof compatibility check from hook handler — v14 ApplicationV2 always delivers HTMLElement directly
- [Fixed] Added `BASE_APPLICATION` to all 6 ApplicationV2 subclasses for proper v14 hook dispatch and DEFAULT_OPTIONS merging
- [Changed] CSS class `.comparison-tooltip` renamed to `.dhs-comparison-tooltip` — prevents namespace collision with other modules
- [Changed] CSS class `.store-dialog` renamed to `.dhs-dialog` — prevents namespace collision with other modules
- [Changed] Extracted hardcoded colors to CSS variables: `--dhs-compare-better`, `--dhs-compare-worse`, `--dhs-purple` — improves maintainability and theme consistency
- [Added] Presence Modifier — new toggle in the Vendor tab that applies a configurable % discount/surcharge per point of the character's Presence trait (positive Presence = discount, negative = surcharge). Applied after relationship modifier in the price calculation pipeline.
- [Added] Character Relationships redesign — section moved to last in the Vendor tab, now has column headers (Character | Status | Rel. Bonus | Presence | Total) and shows combined multiplicative price effect when Presence Modifier is enabled.
- [Added] Dedicated **Sell tab** (icon-only `fa-sack-dollar`, first tab for players) — lists all player inventory items that exist in the store catalog, including GM-hidden items; respects `blockedSaleItems`
- [Changed] Sell button removed from all standard/custom category item rows — selling is now centralised in the Sell tab
- [Added] `_buildSellTabItems` — builds the sell tab item list by iterating the player's inventory and cross-referencing the full store catalog index
- [Added] `_buildStoreCatalogIndex` — aggregates all configured compendiums (default + custom categories + custom tab) into a single `Map<name, {basePrice, img, uuid}>` used by the sell tab
- https://github.com/brunocalado/daggerheart-store/issues/4
- https://github.com/brunocalado/daggerheart-store/issues/3

# 0.4.4

- [Performance] Store Randomizer open time reduced by ~63% — _prepareContext compendium loading parallelized via Promise.all (before: 1412ms → after: 525ms)

# 0.4.3
- Updated Docs
- [Fixed] Players without Owner on the party actor can now see party gold, use "Buy with Party", transfer funds, and view stock — all party writes are routed through GM queries (socket.js), so write ownership on the party actor is no longer required on the client side

# 0.4.2
- [Fixed] Babele compatibility: item name lookup against `PRICE_DATA` now uses `doc.flags.babele.originalName` when Babele is active, preventing all items from failing to match when translations are enabled

# 0.4.0
- Vendor identity

# 0.3.6
- [Fixed] FilePicker callback no longer causes stale DOM references when selecting vendor images
- [Changed] Vendor tooltip now uses HBS template rendered via `renderTemplate`, matching the comparison tooltip visual style
- [Changed] Relationship labels in player view now display colored emojis per level (Hostile/Distrustful/Neutral/Friendly/Allied)
- [Added] `maxlength` constraints on vendor text fields (Store Name: 50, Vendor Name: 30, Description: 1000)

# 0.3.5
- [Added] Vendor tab in Store Configuration with vendor identity fields (name, description) and `storeName` moved from General tab
- [Added] Per-character relationship system (Hostile/Distrustful/Neutral/Friendly/Allied) with configurable price modifiers
- [Added] Relationship price modifier applied after all existing price transformations for player characters
- [Added] Vendor Image setting with FilePicker in the Vendor tab (browse, preview, clear)
- [Added] Vendor identity block in the player store header showing image, name, and info tooltip
- [Added] Vendor info tooltip on hover displaying image, description (HTML-safe), and relationship status
- [Changed] Vendor Identity form uses CSS grid layout for consistent label/input alignment
- [Changed] Character Relationships rows now show a colored price-effect badge (+25%, -10%, etc.) next to the dropdown
- [Changed] Relationship Modifiers table polished with colored level badges, arrow icons, and `%` suffix on inputs
- [Changed] Player header now shows vendor identity instead of "Character: name" when a vendor name is set
- [Removed] Redundant live-preview span from Relationship Modifiers percentage inputs

# 0.3.4
- [Fixed] Stock data collision when multiple store profiles share the same Party Actor — stock is now namespaced per profile (`stock_<ProfileName>`)
- [Added] One-time migration moves legacy `stock` flag to `stock_Default` so existing worlds retain their data

# 0.3.3
- [Changed] Pack loading in `_prepareContext` now fetches compendium documents in parallel via `Promise.all` for both standard and custom-tab loops
- [Changed] SALE badge redesigned as a vertical pill (S/A/L/E stacked) matching epic badge structure
- [Fixed] SALE badge now appears after item summary instead of before it
- [Fixed] Race condition on stock decrement/increment and party fund transfers when multiple players act simultaneously
- [Added] GM-serialized query system (`scripts/socket.js`) using Foundry v13 `CONFIG.queries` for all shared Party Actor writes

# 0.3.2
- [Fixed] Favorites filter showing phantom items due to `unsetFlag` wiping the entire favorites object and causing a race condition
- [Fixed] Favorite bookmark icons not matching filter state due to stale `favoritedItems` read in `_onRender`

# 0.3.1
- [Fixed] Item Tagger now reads/writes `system.tier` for weapon and armor items instead of incorrectly using a module flag
- [Fixed] Stale tier flags on weapon/armor items are cleaned up automatically on drop

# 0.3.0
YOU MUST READ THIS: https://github.com/brunocalado/daggerheart-store/wiki/Tag-Migration-Guide

- [Changed] Store metadata (price, tier, header) migrated from inline `{{{...}}}` description tags to Foundry item flags (`flags.daggerheart-store.*`)
- [Added] Migration macro: `await game.daggerheartStore.migrateTags()` converts all existing items (world, actor-owned, compendiums) and strips legacy tags from descriptions
- [Added] Dry-run mode: `await game.daggerheartStore.migrateTags({ dryRun: true })` previews migration without writing data
- [Changed] Item Tagger now reads/writes flags exclusively; no longer touches `system.description`

# 0.2.5
- Item Tag Editor
- Reset All Prices for All Items Button
- Changed price detection fixed
- [Fixed] Custom compendium items getting price 0/1 during randomization instead of respecting {{{price}}} tags
- [Changed] Centralized price extraction from description into `extractPriceFromDescription()` helper (DRY)

# 0.2.4
- Small CSS fix

# 0.2.3
- Small fix, removed deprecated

# 0.2.2
- Player Favorites
- tooltip description will take in an account line breaks
- UUID will not show up in the description
- Clear Search Button added
- You can disable SRD compendiums. This make easier to homebrew.
- CSS split
- Templates refactored
- Codebase restructured

# 0.2.1
- CSS Refactor
- Support for weird entity types in settings.

# 0.2.0
- Preview will show up in the general tab
- Tag headers are supported in the other tabs
- Items without a header will be added to a header to improve visuals

# 0.1.9
- Weapon damage description with custom damage will be display damage instead of C

# 0.1.8
- Hidden items go to bottom. Looks better

# 0.1.7
- Epic items will be saved to profiles.
- Shortcut to restore maximum items in the randomizer.
- Randomizer will save your options to your profile.
- Randomizer will remember your changes.
- New Feature: Import/Export

# 0.1.6
- you can add multiple compendiums to custom tab
- only weapon armor loot consumable can be added to custom tab
- custom tab will identify item tier if available.
- You can now block a item from be affected by Randomizer
- bug fix: click the itens buttons required to double click sometimes
- epic itens
- visual effects for epic itens
- general tab visual improv
- tags {{{header}}} {{{tierX}}} work together
- You can update and rename profiles
- Docs for tags

# 0.1.5
- You can organize homebrew loot consumable potions using the tag {{{tierX}}} where X should be 1 2 3 or 4

# 0.1.4
- cost tags can be used in merged compendiums
- You can apply stock defaults to custom items from new compendiums now 

# 0.1.3
- Numerous CSS enhancements
- New Feature: Inventory Stock Management
- New Feature: Equipment Comparison (Current vs. New)
- Refined transfer templates
- Load profile confirmation dialog
- System Compendiums filter for Custom Compendiums
- Item type filters for Custom Compendiums
- Custom Compendiums now populate correct categories
- Stock quantity display follows MMO model

# 0.1.2
- Removed transparency. +Performance
- Improved CSS isolation to prevent the module from affecting unintended elements.
- Restructured GM toggle buttons:
  - Visibility button: hides items completely from players
  - Block Purchase button (NEW): prevents players from buying the item
  - Block Sale button: prevents players from selling the item
- The Store Randomizer allows the GM to dynamically generate the store's inventory. Instead of manually hiding or pricing items, you can set parameters for each category and let the module "roll" the stock for you.
- Store Randomizer will use Fisher-Yates
- Items with description will have an tooltip 
- Bug fix: Add compendiums to merged compendiums will trigger an scroll
- New batch actions for GM: Mark All as On Sale, Remove All from Sale, Show All, Hide All, Make All Purchasable, Disable Purchase for All, Set All as Saleable, Remove All from Sale
- you can create headers for items in the general tab

# 0.1.1
- Performance fix: the store loads 3,04 faster.
Before update
[Performance] Store Render took 930.00ms
After update
[Performance] Store Render took 306.10ms
- welcome screen improve
- currency mode setting: choose how the actor coins should be handled

# 0.1.0
- Audio API and Text Editor API: Resolved deprecation warning 
- Search fix
- better style for save config button 
- transfer feature
- elurian now shows (system typo)
- alert with chat message if the player don't have a linked actor
- color code for chat messages

# 0.0.9
- journal with docs
- welcome screen
- chat privacy
- chat message style fix

# 0.0.8
First release