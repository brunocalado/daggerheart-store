# Daggerheart: Store

A dynamic, interactive, and fully configurable store for the **Daggerheart** system in Foundry VTT. Allow your players to purchase weapons, armor, potions, and miscellaneous items directly from an elegant visual interface, while the GM maintains full control over prices and what is displayed.

## 🌟 Key Features

### 🛍️ For Players
* **Intuitive Interface:** Browse categories (Weapons, Armor, Potions, etc.) with organized tabs.
* **Real-Time Search:** Find the desired item instantly by typing its name.
* **Visual Details:** Clear icons, names, and prices. Click on the item image to open the full compendium sheet.
* **Automated Purchase:** Clicking "Buy" automatically deducts currency from the character sheet and adds the item to the inventory.
* **Party Funds & Split Payment:** If enabled, view Party Wealth and split the cost of purchases between your character's funds and the Party's treasury.
* **Visual & Audio Feedback:** Coin sounds upon purchase and stylized chat messages confirm the transaction.
* **Items on Sale:** Spot discounted items marked with special tags and reduced prices.

### 🛠️ For the Gamemaster (GM)
* **Store Profiles:** Save and load different store configurations (Presets) to quickly switch settings between different towns, merchants, or campaign acts.
* **Total Control:** Open the store for all players or a specific one with a single click using the header buttons.
* **Dynamic Pricing:**
    * **Global Multiplier:** Adjust world inflation (e.g., everything 20% more expensive or 10% cheaper).
    * **Manual Override:** Change the price of any individual item on the fly, directly within the store interface.
* **Inventory Management:**
    * **Hide Items:** Click the "eye" icon to hide items that shouldn't be available in the current region.
    * **Promotions (Sale):** Mark items as "On Sale" to apply a configurable automatic discount.
    * **Filter by Tier:** Configure which Tiers (1, 2, 3, 4) appear in each category via settings.
* **Customization:**
    * **Party Actor:** Link a Party Actor to the store to enable group purchases.
    * **Custom Compendiums:** Add your own item compendiums (Homebrew) to be scanned by the store.
    * **Custom Tab:** Configure a dedicated tab linked to a specific compendium for special merchant inventories.
    * **Customizable Currency:** Change the currency name (e.g., "Gold", "Credits").

### Standard Prices
The loot/consumables are classified as Common, Uncommon, Rare, and Legendary, which correspond to Tier 1, 2, 3, and 4. Therefore, using the table on page 165, I applied the same pricing to them. Weapons and armor are priced according to the same table.

## 📸 Screenshots

### Player Store

Clean interface with search, quick buy, and party fund options.

<p align="center"><img width="700" src="docs/player-view.webp"></p>

### GM View (Editing)

Price controls, hide, sale buttons, and profile management visible.

<p align="center"><img width="700" src="docs/gm-view.webp"></p>


## 🚀 Installation

Install via the Foundry VTT Module browser or use this manifest link:
- `https://raw.githubusercontent.com/brunocalado/daggerheart-store/main/module.json`

## ⚙️ How to Use

### Opening the Store
* **As GM:** Open the store. You can use the system button or a macro with `Store.Open()`.
<p align="center"><img width="400" src="docs/system-button.webp"></p>

* **As GM:** You have buttons in the store window header to:
    * <i class="fas fa-globe"></i> **Show to Everyone:** Opens the store on the screen of all connected players.
    * <i class="fas fa-user"></i> **Show to Player:** Opens the store only for a specific selected player.

### Configuration (GM)
Click the gear button (<i class="fas fa-cog"></i>) in the top right corner of the store to access advanced settings:
1. **General:** Define the global price multiplier, the discount percentage, link a Party Actor, and manage profiles.
2. **Categories & Tiers:** Choose which tabs (Weapons, Potions, etc.) should appear and which Item Tiers are allowed.
3. **Custom Compendiums:** Configure the Custom Tab and merge external compendiums into standard categories.

### Profiles (Presets)
Use the dropdown menu and buttons in the store header to:
* **Save:** Store the current configuration (prices, visibility, settings) as a new profile.
* **Load:** Instantly apply a saved profile.
* **Delete:** Remove an obsolete profile.

## ⚖️ Credits and License

* **Code License:** MIT License.
* **Assets:** AI Audio and images provided are [CC0 1.0 Universal Public Domain](https://creativecommons.org/publicdomain/zero/1.0/).

**Disclaimer:** This module is an independent creation and is not affiliated with Darrington Press.

# 🗡️ My Daggerheart Modules

### 📦 [daggerheart-extra-content](https://github.com/brunocalado/daggerheart-extra-content)
> Resources for Daggerheart

### 📏 [daggerheart-distances](https://github.com/brunocalado/daggerheart-distances)
> Visualizes Daggerheart combat ranges with customizable rings and hover distance calculations.

### 🛒 [daggerheart-store](https://github.com/brunocalado/daggerheart-store)
> A dynamic, interactive, and fully configurable store for the Daggerheart system in Foundry VTT. Allow your players to purchase weapons, armor, potions, and miscellaneous items directly from an elegant visual interface, while the GM maintains full control over prices and what is displayed.

### 😱 [daggerheart-fear-tracker](https://github.com/brunocalado/daggerheart-fear-tracker)
> Adds an animated slider bar with configurable fear tokens to the UI. Includes sync with Daggerheart system resources.

### 💀 [daggerheart-death-moves](https://github.com/brunocalado/daggerheart-death-moves)
> Enhances the Death Move moment with immersive audio, visual effects, and a dramatic interface for choosing between Avoid Death, Blaze of Glory, or Risk it All.

### 🤖 [daggerheart-fear-macros](https://github.com/brunocalado/daggerheart-fear-macros)
> Automatically executes macros when the Daggerheart system Fear resource is changed.

### 🤖 [daggerheart-fear-macros](https://github.com/brunocalado/daggerheart-fear-macros)
> Automatically executes macros when the Daggerheart system Fear resource is changed.

### 🤖 [daggerheart-fear-macros](https://github.com/brunocalado/daggerheart-fear-macros)
> Automatically executes macros when the Daggerheart system Fear resource is changed.

## 🗺️ Adventures

### 💣 [suicide-squad-daggerheart-adventure](https://github.com/brunocalado/suicide-squad-daggerheart-adventure)
> Torn from your past lives, you are a squad of criminals forced to serve a ruthless master. A deadly curse ensures your obedience, turning you into disposable pawns for an impossible mission. You are tasked with hunting a target of unimaginable importance in a land on the brink of war. Operating in the shadows where every step is watched, you must fight for survival and decide whether to obey your orders or risk everything to change your fate.

### ✨ [i-wish-daggerheart-adventure](https://github.com/brunocalado/i-wish-daggerheart-adventure)
> A wealthy merchant has been cursed and is doomed to die within a few weeks. The only hope of breaking the curse lies in a legendary artifact said to rest deep within a mountain. With time running out, the merchant is organizing one final expedition to retrieve the item—or die trying. He has summoned a group of remarkable individuals to undertake this perilous mission.