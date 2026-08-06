# 📖 Daggerheart: Store — Full Guide

This is the detailed setup and configuration guide for GMs and players. For a quick overview of what the module does, see the [README](../README.md).

# ⚠️ Player Setup: Linking Characters

To perform transactions in the **Daggerheart: Store**, each user must have a linked Actor (type: *character*) assigned to them within Foundry VTT.

**Configuration Steps**

1. Right-click the player's name in the **Player List** (bottom left corner of the screen).
2. Select **User Configuration**.
3. In the configuration window, locate the **Player Character** field.
4. Select the Actor that the user owns from the dropdown menu.

> **Note:** Ensure the user has ownership permissions for the selected Actor before linking.

![User Configuration Screen](https://github.com/brunocalado/daggerheart-store/blob/main/docs/config-user.webp?raw=true)

**Verification**

If the setup is done correctly, the **Player List** will display the Username followed by the Character Name in brackets.

* *Example:* **Player2 [Elara]**

![Updated Player List Example](https://github.com/brunocalado/daggerheart-store/blob/main/docs/player-list.webp?raw=true)

**Troubleshooting**

If a player opens the store without a linked Actor, a **red alert** will appear indicating they cannot make purchases. If you see the error shown below, please repeat the configuration steps above.

![Store Error Alert](https://github.com/brunocalado/daggerheart-store/blob/main/docs/user-without-actor.webp?raw=true)

# 🔓 Opening the Store

**Access Methods**

There are two ways for GMs and Players to access the store interface:

*.  **Daggerheart Menu:** Click the **Open Store** button located within the main Daggerheart menu.
![System Button](https://github.com/brunocalado/daggerheart-store/blob/main/docs/system-button.webp?raw=true)

*.  **Macro Command:** Execute the following script macro:
    `Store.Open()`

> **Tip:** The GM can create a macro with this command and assign it to players, allowing them to open the store on their own.

**GM Sharing Controls**

When the store window is active, the GM has access to special header buttons to push the interface to other users:

* **🌍 Show to Everyone:** Opens the store window for all connected players immediately.
* **👤 Show to Player:** Opens the store window for a specific, selected player only.

# 🛠️ Configuration (GM)

To access advanced settings, click the gear button (⚙️) located in the top-right corner of the store interface.

**General Settings**
* **Global Price Multiplier:** Adjusts the base price of all items globally.
* **Sale Discount:** Sets the percentage deducted from items marked as "on sale."
* **Sell Ratio:** Defines the resale value percentage players receive when selling items (e.g., 50% of the original cost).
* **Party Actor:** Links a Party Sheet to allow the use of shared funds for transactions.

**Inventory Controls**
* **Categories:** Toggle the visibility of entire item categories (e.g., hide "Guns" or "Wheelchairs").
* **Tiers:** Restrict available Tiers within specific categories (e.g., limit a small village shop to only sell Tier 1 items).

**Custom Content**
* **Custom Compendiums:** Configure the Custom Tab settings or merge items from external compendiums directly into the standard store categories.

![Settings](https://github.com/brunocalado/daggerheart-store/blob/main/docs/settings.webp?raw=true)

# 📁 Profiles (Presets)

Use the dropdown menu and header buttons to manage different store configurations:

* **Save:** Stores the current configuration (prices, hidden items, active tiers) as a new named profile.
* **Load:** Instantly applies a saved profile to the store (e.g., "Expensive City", "Goblin Merchant").
* **Delete:** Removes a profile that is no longer needed.

![alt](https://github.com/brunocalado/daggerheart-store/blob/main/docs/profiles.webp?raw=true)

# 🧪 Homebrew & Custom Content

**🗂️ Custom Shop Tabs**

You can create a dedicated tab with a custom name and specific content. This is useful for special merchants or unique item categories.

1. Create an **Item Compendium** in your world and populate it with the items you wish to sell.
2. Open the **Store Configuration** (⚙️) menu.
3. Navigate to the **Custom Compendiums** section.
4. Locate the **Custom Tab Compendiums** setting and select the compendium you created.

The items will now be listed in your new custom tab within the shop interface.

---

**🧩 Extending Default Tabs**

You can inject new content into the existing standard tabs (e.g., Weapons, Armor) without replacing the core content.

1. Create an **Item Compendium** and populate it with your custom items.
2. Open the **Store Configuration** (⚙️) menu and go to **Custom Compendiums**.
3. Add one or more compendiums to the list.
4. Select the **Target Tab** where the items from that compendium should appear.

---

**📸 Screenshot**

![Configuration Menu Screenshot](https://github.com/brunocalado/daggerheart-store/blob/main/docs/homebrew.webp?raw=true)