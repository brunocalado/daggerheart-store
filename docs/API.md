# 🧩 Daggerheart: Store developer API

What macros and other modules can use from the store: the global `Store` object to open it from a macro, and a hook to change how prices and balances are displayed. For setup and day-to-day use, see the [README](../README.md) and the [full guide](WIKI.md).

## Macros: `Store`

`Store` is available on `globalThis` once the world is ready.

| Call | Who | What it does |
|---|---|---|
| `Store.Open()` | Any user | Opens the store for the caller. A player without a linked character sees the store but cannot buy, and a chat notice is whispered to the GMs and to that player. |
| `Store.Show({ username, store })` | GM only | Opens the store on other clients. Both options are optional. |
| `Store.EditTags()` | GM only | Opens the Item Tag Editor. |

`Store.Show` options:

- `username` (string): open it only for that player. Omit to open it for every connected client.
- `store` (string): name of a store profile to load before opening. Omit to keep the active profile.

```js
// Open the store for everyone, using the "Blacksmith" profile
await Store.Show({ store: "Blacksmith" });

// Open it only for one player
await Store.Show({ username: "Player2" });
```

## Hook: `daggerheart-store.formatPrice`

Fires every time the store builds the text for a price or a balance: the store window, item cards, dialogs, negotiation windows and chat cards. Listeners are called in registration order, and a `false` return does not stop the chain.

The hook receives one mutable object:

| Field | Type | Meaning |
|---|---|---|
| `amount` | number | The value in the base unit (`system.gold.coins`). |
| `label` | boolean | `false` where only the number is shown next to a coin icon (item cards), `true` where the currency name is part of the text. |
| `text` | string | What will be displayed. Replace it. Plain text only: it is escaped in the store's windows but inserted as written in chat cards and dialogs, so do not put HTML or user input in it. |

With no listener, `text` is `"<amount> <currency name>"`, or just `"<amount>"` when `label` is `false`.

```js
Hooks.on("daggerheart-store.formatPrice", data => {
    const gold = Math.floor(data.amount / 100);
    const silver = data.amount % 100;
    data.text = `${gold} g ${silver} s`;
});
```

Input fields (offers, transfers, split payments) are not affected: they take and submit plain numbers in the base unit.
