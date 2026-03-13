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