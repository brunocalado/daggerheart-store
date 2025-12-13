# Daggerheart: Store

A dynamic, interactive, and fully configurable store for the **Daggerheart** system in Foundry VTT. Allow your players to purchase weapons, armor, potions, and miscellaneous items directly from an elegant visual interface, while the GM maintains full control over prices and what is displayed.

## 🌟 Key Features

### 🛍️ For Players
* **Intuitive Interface:** Browse categories (Weapons, Armor, Potions, etc.) with organized tabs.
* **Real-Time Search:** Find the desired item instantly by typing its name.
* **Visual Details:** Clear icons, names, and prices. Click on the item image to open the full compendium sheet.
* **Automated Purchase:** Clicking "Buy" automatically deducts currency from the character sheet and adds the item to the inventory.
* **Visual & Audio Feedback:** Coin sounds upon purchase and stylized chat messages confirm the transaction.
* **Items on Sale:** Spot discounted items marked with special tags and reduced prices.

### 🛠️ For the Gamemaster (GM)
* **Total Control:** Open the store for all players or a specific one with a single click using the header buttons.
* **Dynamic Pricing:**
    * **Global Multiplier:** Adjust world inflation (e.g., everything 20% more expensive or 10% cheaper).
    * **Manual Override:** Change the price of any individual item on the fly, directly within the store interface.
* **Inventory Management:**
    * **Hide Items:** Click the "eye" icon to hide items that shouldn't be available in the current region.
    * **Promotions (Sale):** Mark items as "On Sale" to apply a configurable automatic discount.
    * **Filter by Tier:** Configure which Tiers (1, 2, 3, 4) appear in each category via settings.
* **Customization:**
    * **Custom Compendiums:** Add your own item compendiums (Homebrew) to be scanned by the store.
    * **Customizable Currency:** Change the currency name (e.g., "Gold", "Credits").

## 📸 Screenshots

| Player Store | GM View (Editing) |
| :---: | :---: |
| *Clean interface with search and quick buy.* | *Price controls, hide, and sale buttons visible.* |
|<p align="center"><img width="400" src="docs/player-view.webp"></p>|<p align="center"><img width="400" src="docs/gm-view.webp"></p>|


## 🚀 Installation

Install via the Foundry VTT Module browser or use this manifest link:
`https://raw.githubusercontent.com/brunocalado/daggerheart-store/main/module.json`

## ⚙️ How to Use

### Opening the Store
* **As GM:** Open the store. You can use the system button or a macro with `Store.Open()`.
<p align="center"><img width="400" src="docs/system-button.webp"></p>
* **As GM:** You have buttons in the store window header to:
    * <i class="fas fa-globe"></i> **Show to Everyone:** Opens the store on the screen of all connected players.
    * <i class="fas fa-user"></i> **Show to Player:** Opens the store only for a specific selected player.

### Configuration (GM)
Click the gear button (<i class="fas fa-cog"></i>) in the top right corner of the store to access advanced settings:
1. **General:** Define the global price multiplier, the discount percentage for items on sale, and add custom compendiums.
2. **Categories & Tiers:** Choose which tabs (Weapons, Potions, etc.) should appear and which Item Tiers are allowed.

## ⚖️ Credits and License

* **Code License:** MIT License.
* **Assets:** Audio and images provided are [CC0 1.0 Universal Public Domain](https://creativecommons.org/publicdomain/zero/1.0/).

**Disclaimer:** This module is an independent creation and is not affiliated with Darrington Press.