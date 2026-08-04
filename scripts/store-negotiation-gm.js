/**
 * GM-side negotiation window for the Daggerheart Store.
 * Auto-opens when a player starts a negotiation (via the module.js updateActor hook).
 * Reacts to Party Actor flag changes in real time. Closing this window cancels
 * the negotiation.
 */

import { MODULE_ID, NEGOTIATION_FLAG_KEY, NEGOTIATION_STAGES } from "./store-constants.js";
import { getSystemCurrency, getActorWealth } from "./store-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class GMNegotiationApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "daggerheart-store-negotiation-gm",
        window: {
            title:     "Negotiation Request",
            icon:      "fas fa-handshake",
            resizable: false,
            controls:  []
        },
        position: { width: 340, height: "auto" },
        classes:  ["daggerheart-store-negotiation-gm"],
        actions: {
            counter:  GMNegotiationApp.prototype._onCounter,
            accept:   GMNegotiationApp.prototype._onAccept,
            reject:   GMNegotiationApp.prototype._onReject,
            viewItem: GMNegotiationApp.prototype._onViewItem
        }
    };

    static BASE_APPLICATION = foundry.applications.api.ApplicationV2;

    static PARTS = {
        main: { template: "modules/daggerheart-store/templates/gm-negotiation.hbs" }
    };

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    constructor(options = {}) {
        super(options);

        this._onPartyUpdate = this._handlePartyActorUpdate.bind(this);
        Hooks.on("updateActor", this._onPartyUpdate);
    }

    // ---------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------

    /**
     * Cleans up the updateActor hook on window close.
     * @param {object} options
     */
    _onClose(options) {
        Hooks.off("updateActor", this._onPartyUpdate);
        super._onClose?.(options);
    }

    /**
     * Intercepts manual close to confirm cancellation.
     * Skipped for programmatic closes (options.force = true).
     * @param {object} options
     * @returns {Promise<boolean|void>} false to abort the close
     */
    async _preClose(options) {
        if (options?.force) return;

        const flag = this._getFlag();
        if (!flag?.active) return;

        const confirmed = await DialogV2.confirm({
            window:  { title: "Cancel Negotiation" },
            content: "<p>Close and cancel the active negotiation?</p>"
        });
        if (!confirmed) return false;

        // GM writes directly — no query needed.
        await this._cancelFlag();
    }

    // ---------------------------------------------------------------
    // Data
    // ---------------------------------------------------------------

    /**
     * Builds the Handlebars context from the current negotiation flag.
     * @param {object} options
     * @returns {Promise<object>}
     */
    async _prepareContext(options) {
        const flag  = this._getFlag() ?? {};
        const stage = flag.stage ?? NEGOTIATION_STAGES.PENDING_GM;

        // A failed/slow-to-resolve lookup (e.g. the item's compendium pack hasn't been
        // indexed yet on this client) must never abort the whole render — fall back to a
        // generic icon instead of leaving the window stuck unrendered.
        let itemImg = "icons/svg/item-bag.svg";
        if (flag.itemUuid) {
            try {
                const item = await fromUuid(flag.itemUuid);
                if (item?.img) itemImg = item.img;
            } catch (err) {
                console.warn(`${MODULE_ID} | GMNegotiationApp: could not resolve item image for ${flag.itemUuid}`, err);
            }
        }

        return {
            flag,
            stage,
            playerName:  flag.playerName  ?? "Unknown",
            itemName:    flag.itemName    ?? "",
            itemImg,
            itemUuid:    flag.itemUuid    ?? "",
            basePrice:   flag.basePrice   ?? 0,
            type:        flag.type        ?? "buy",
            playerOffer: flag.playerOffer ?? 0,
            gmCounter:   flag.gmCounter   ?? null,
            currency:    getSystemCurrency(),
            isPendingGm:       stage === NEGOTIATION_STAGES.PENDING_GM,
            isPendingGmFinal:  stage === NEGOTIATION_STAGES.PENDING_GM_FINAL
        };
    }

    // ---------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------

    /**
     * GM sends a counter-offer, advancing stage to PENDING_PLAYER.
     * Called from `data-action="counter"` in the template.
     * GM writes directly to the Party Actor flags.
     * @param {PointerEvent} event
     * @param {HTMLElement}  target
     */
    async _onCounter(event, target) {
        const input       = this.element?.querySelector("input[name='counterOffer']");
        const counterOffer = parseInt(input?.value ?? "");

        if (isNaN(counterOffer) || counterOffer <= 0) {
            return ui.notifications.warn("Please enter a valid counter-offer amount.");
        }

        const partyActor = this._getPartyActor();
        const flag       = partyActor?.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
        if (!flag?.active) return;

        try {
            await partyActor.setFlag(MODULE_ID, NEGOTIATION_FLAG_KEY, {
                ...flag,
                gmCounter: counterOffer,
                stage:     NEGOTIATION_STAGES.PENDING_PLAYER
            });
        } catch (err) {
            console.error(`${MODULE_ID} | GMNegotiationApp._onCounter failed:`, err);
            ui.notifications.error("Could not send counter-offer.");
        }
    }

    /**
     * GM accepts the player's current offer (initial or final), triggering purchase.
     * Called from `data-action="accept"` in the template.
     * GM writes directly to the Party Actor flags.
     * @param {PointerEvent} event
     * @param {HTMLElement}  target
     */
    async _onAccept(event, target) {
        const partyActor = this._getPartyActor();
        const flag       = partyActor?.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
        if (!flag?.active) return;

        // At PENDING_GM or PENDING_GM_FINAL the agreed price is the player's offer.
        const agreedPrice = flag.playerOffer;

        // A buy is paid from the player's own funds — the negotiation itself can go
        // ahead regardless of the player's balance, but the purchase can only be
        // finalized if they can actually cover the agreed price.
        if (flag.type === "buy") {
            const playerActor = game.users.get(flag.playerId)?.character;
            if (playerActor && getActorWealth(playerActor) < agreedPrice) {
                return ui.notifications.warn(`${flag.playerName} does not have enough coins to cover this offer.`);
            }
        }

        try {
            await partyActor.setFlag(MODULE_ID, NEGOTIATION_FLAG_KEY, {
                ...flag,
                agreedPrice,
                stage: NEGOTIATION_STAGES.ACCEPTED
            });
            // The module.js global updateActor hook handles purchase execution on the player's client.
        } catch (err) {
            console.error(`${MODULE_ID} | GMNegotiationApp._onAccept failed:`, err);
            ui.notifications.error("Could not accept the offer.");
        }
    }

    /**
     * GM rejects the player's final offer, ending the negotiation without a purchase.
     * Only available at the PENDING_GM_FINAL stage.
     * Called from `data-action="reject"` in the template.
     * GM writes directly to the Party Actor flags.
     * @param {PointerEvent} event
     * @param {HTMLElement}  target
     */
    async _onReject(event, target) {
        const partyActor = this._getPartyActor();
        const flag       = partyActor?.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
        if (!flag?.active) return;

        try {
            await this._cancelFlag();
            this.close({ force: true });
        } catch (err) {
            console.error(`${MODULE_ID} | GMNegotiationApp._onReject failed:`, err);
            ui.notifications.error("Could not reject the offer.");
        }
    }

    /**
     * Opens the item's sheet for a quick reference look.
     * Called from `data-action="viewItem"` on the item icon in the template.
     * @param {PointerEvent} event
     * @param {HTMLElement}  target
     */
    async _onViewItem(event, target) {
        const uuid = target.dataset.uuid;
        if (!uuid) return;
        const doc = await fromUuid(uuid);
        if (doc?.sheet) doc.sheet.render(true);
    }

    // ---------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------

    /**
     * Handles changes to the Party Actor negotiation flag.
     * Registered as an updateActor hook in the constructor.
     * @param {Actor}  actor
     * @param {object} changes
     */
    _handlePartyActorUpdate(actor, changes) {
        const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
        if (actor.id !== partyActorId) return;

        const negChanges = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.${NEGOTIATION_FLAG_KEY}`);
        if (negChanges === undefined) return;

        this._onFlagChanged();
    }

    /**
     * Reacts to a negotiation flag change.
     * Closes the window if the negotiation ended, re-renders otherwise.
     */
    _onFlagChanged() {
        const flag = this._getFlag();

        if (!flag?.active || flag?.stage === NEGOTIATION_STAGES.CANCELLED) {
            this.close({ force: true });
            return;
        }

        // After GM accepts (stage: ACCEPTED), the player executes the purchase.
        // The GM window can close once the flag is cleared by the player.
        if (flag?.stage === NEGOTIATION_STAGES.ACCEPTED) {
            // Stay open briefly until the purchase clears the flag.
            this.render();
            return;
        }

        this.render();
    }

    /**
     * Writes an inactive/cancelled state to the flag then removes it.
     * Used for both close-triggered cancels and the reject action.
     * @returns {Promise<void>}
     */
    async _cancelFlag() {
        const partyActor = this._getPartyActor();
        const flag       = partyActor?.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
        if (!flag) return;

        await partyActor.setFlag(MODULE_ID, NEGOTIATION_FLAG_KEY, {
            ...flag,
            active: false,
            stage:  NEGOTIATION_STAGES.CANCELLED
        });
        await partyActor.unsetFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
    }

    /**
     * Returns the current negotiation flag from the Party Actor, or null.
     * @returns {object|null}
     */
    _getFlag() {
        return this._getPartyActor()?.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY) ?? null;
    }

    /**
     * Returns the configured Party Actor, or null if none is set.
     * @returns {Actor|null}
     */
    _getPartyActor() {
        const id = game.settings.get(MODULE_ID, "partyActorId");
        return id ? (game.actors.get(id) ?? null) : null;
    }
}
