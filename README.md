# Daggerheart Store Module (Foundry VTT)

![Daggerheart Store Banner](https://img.shields.io/badge/Foundry%20VTT-v13-orange) ![Version](https://img.shields.io/badge/Version-5.0.0-blue) ![License](https://img.shields.io/badge/License-MIT-green)

A dynamic, interactive, and fully configurable store for the **Daggerheart** system in Foundry VTT. Allow your players to purchase weapons, armor, potions, and miscellaneous items directly from an elegant visual interface, while the GM maintains full control over prices, availability, and what is displayed.

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
    * **Customizable Currency:** Change the currency name (e.g., "Gold", "Credits", "Glits").

## 📸 Screenshots

| Player Store | GM View (Editing) |
| :---: | :---: |
| *Clean interface with search and quick buy.* | *Price controls, hide, and sale buttons visible.* |

*(Add screenshots of your module here)*

## 🚀 Installation

1. Download the latest release of the module.
2. Unzip the file into the `Data/modules/daggerheart-store` folder of your Foundry VTT.
3. Restart Foundry and activate the module in your game world.

## ⚙️ How to Use

### Opening the Store
* **As GM:** You have buttons in the store window header to:
    * <i class="fas fa-globe"></i> **Show to Everyone:** Opens the store on the screen of all connected players.
    * <i class="fas fa-user"></i> **Show to Player:** Opens the store only for a specific selected player.
* **Macro:** You can also use the command `Store.Open()` in a macro or script.

### Configuration (GM)
Click the gear button (<i class="fas fa-cog"></i>) in the top right corner of the store to access advanced settings:
1. **General:** Define the global price multiplier, the discount percentage for items on sale, and add custom compendiums.
2. **Categories & Tiers:** Choose which tabs (Weapons, Potions, etc.) should appear and which Item Tiers are allowed.

## 📦 Data Structure
The module uses an internal database based on official Daggerheart rules to categorize items and set base prices. It is smart enough to:
* Identify items by name.
* Read the Tier of custom items.
* Correctly separate weapons from wheelchairs and other equipment.

## 🤝 Contribution
Feel free to open Issues or Pull Requests to improve the module. The code uses the new **Application V2** API from Foundry V13+ to ensure performance and longevity.

---
*Developed for the Daggerheart community on Foundry VTT.*