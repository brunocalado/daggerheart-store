# 0.1.0
Fixed
Audio API: Resolved deprecation warning by migrating global AudioHelper to the new foundry.audio.AudioHelper namespace.

Text Editor API: Fixed "TextEditor is deprecated" error during purchases. Replaced legacy TextEditor.enrichHTML with native document.link for robust chat card generation.

Purchase Logic: Cleaned up _executePurchase to remove legacy API calls and improve performance when generating transaction logs.

Search fix

better style for save config button 

Changed
Refactored store-app.js to adhere to Version 13 namespacing standards.
Optimized chat message enrichment for better compatibility with future Foundry versions.

# 0.0.9
- journal with docs
- welcome screen
- chat privacy
- chat message style fix

# 0.0.8
First release