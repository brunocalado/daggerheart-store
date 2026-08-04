/**
 * Player-side negotiation window for the Daggerheart Store.
 * Opens when a player initiates a price bargain. Reacts to Party Actor flag
 * changes (via the updateActor hook) to reflect GM responses in real time.
 * Closing this window cancels the negotiation.
 */

import { MODULE_ID, NEGOTIATION_FLAG_KEY, NEGOTIATION_STAGES } from "./store-constants.js";
import { getChatWhisperRecipients, buildChatCard, getSystemCurrency, createStoreChatMessage } from "./store-utils.js";
import { queryCancelNegotiation, queryAcceptCounter, querySubmitFinalOffer } from "./socket.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class PlayerNegotiationApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "daggerheart-store-negotiation-player",
        window: {
            title:     "Negotiate Price",
            icon:      "fas fa-handshake",
            resizable: false,
            controls:  []
        },
        position: { width: 320, height: "auto" },
        classes:  ["daggerheart-store-negotiation-player"],
        actions: {
            acceptCounter: PlayerNegotiationApp.prototype._onAcceptCounter,
            submitFinal:   PlayerNegotiationApp.prototype._onSubmitFinal
        }
    };

    static BASE_APPLICATION = foundry.applications.api.ApplicationV2;

    static PARTS = {
        main: { template: "modules/daggerheart-store/templates/player-negotiation.hbs" }
    };

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    /**
     * @param {object} options
     * @param {string} options.itemUuid  - Compendium UUID of the item being negotiated
     * @param {string} options.itemName  - Display name of the item
     * @param {number} options.basePrice - The listed price before any negotiation
     * @param {string} options.type      - "buy" or "sell"
     */
    constructor(options = {}) {
        super(options);

        // Bind a named handler so it can be removed on close.
        this._onPartyUpdate = this._handlePartyActorUpdate.bind(this);
        Hooks.on("updateActor", this._onPartyUpdate);
    }

    // ---------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------

    /**
     * Cleans up the updateActor hook on window close.
     * Called from `_onRender` lifecycle via ApplicationV2.
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

        const partyActor = this._getPartyActor();
        const flag       = partyActor?.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
        if (!flag?.active || flag.playerId !== game.user.id) return;

        const confirmed = await DialogV2.confirm({
            window:  { title: "Cancel Negotiation" },
            content: "<p>Close and cancel the active negotiation?</p>"
        });
        if (!confirmed) return false;

        await queryCancelNegotiation();
    }

    // ---------------------------------------------------------------
    // Data
    // ---------------------------------------------------------------

    /**
     * Builds the Handlebars context from the current negotiation flag.
     * Called on every render triggered by flag changes.
     * @param {object} options
     * @returns {Promise<object>}
     */
    async _prepareContext(options) {
        const partyActor = this._getPartyActor();
        const flag       = partyActor?.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY) ?? {};
        const stage      = flag.stage ?? NEGOTIATION_STAGES.PENDING_GM;

        return {
            flag,
            stage,
            itemName:    flag.itemName  ?? this.options.itemName,
            basePrice:   flag.basePrice ?? this.options.basePrice,
            type:        flag.type      ?? this.options.type,
            playerOffer: flag.playerOffer ?? null,
            gmCounter:   flag.gmCounter   ?? null,
            currency:    getSystemCurrency(),
            isPendingGm:       stage === NEGOTIATION_STAGES.PENDING_GM,
            isPendingPlayer:   stage === NEGOTIATION_STAGES.PENDING_PLAYER,
            isPendingGmFinal:  stage === NEGOTIATION_STAGES.PENDING_GM_FINAL
        };
    }

    // ---------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------

    /**
     * Player accepts the GM's counter-proposal, triggering purchase at that price.
     * Called from `data-action="acceptCounter"` in the template.
     * @param {PointerEvent} event
     * @param {HTMLElement}  target
     */
    async _onAcceptCounter(event, target) {
        const partyActor = this._getPartyActor();
        const flag       = partyActor?.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
        if (!flag?.gmCounter) return;

        const result = await queryAcceptCounter(flag.gmCounter);
        if (!result.ok) {
            if (result.reason === "insufficient_funds") {
                ui.notifications.warn("You do not have enough coins to cover this offer.");
            } else {
                ui.notifications.error(`${MODULE_ID} | Could not accept counter: ${result.reason}`);
            }
        }
        // updateActor hook detects ACCEPTED → _onFlagChanged closes this app
    }

    /**
     * Player submits their final offer after receiving a GM counter-proposal.
     * Called from `data-action="submitFinal"` in the template.
     * @param {PointerEvent} event
     * @param {HTMLElement}  target
     */
    async _onSubmitFinal(event, target) {
        const input      = this.element?.querySelector("input[name='finalOffer']");
        const finalOffer = parseInt(input?.value ?? "");

        if (isNaN(finalOffer) || finalOffer <= 0) {
            return ui.notifications.warn("Please enter a valid offer amount.");
        }

        const flag = this._getPartyActor()?.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);
        if (flag?.type === "sell" && finalOffer < (flag.basePrice ?? 0)) {
            return ui.notifications.warn("Sell offer cannot be lower than the base price.");
        }

        const result = await querySubmitFinalOffer(finalOffer);
        if (!result.ok) {
            ui.notifications.error(`${MODULE_ID} | Could not submit final offer: ${result.reason}`);
        }
    }

    // ---------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------

    /**
     * Handles changes to the Party Actor negotiation flag.
     * Registered as an updateActor hook in the constructor; checks whether
     * the changed actor is the party actor and whether the negotiation flag moved.
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
     * Reacts to a negotiation flag change: closes the window on resolution
     * or re-renders to reflect the new stage.
     */
    _onFlagChanged() {
        const flag = this._getPartyActor()?.getFlag(MODULE_ID, NEGOTIATION_FLAG_KEY);

        if (flag?.stage === NEGOTIATION_STAGES.ACCEPTED && flag.playerId === game.user.id) {
            // Purchase will be executed by the module.js global updateActor hook.
            this._postNegotiationChat("accepted", flag.agreedPrice, flag);
            this.close({ force: true });
            return;
        }

        if (!flag?.active || flag?.stage === NEGOTIATION_STAGES.CANCELLED) {
            this._postNegotiationChat("cancelled", null, flag);
            this.close({ force: true });
            return;
        }

        this.render();
    }

    /**
     * Posts a negotiation result chat message respecting the store's privacy settings.
     * @param {"accepted"|"cancelled"} result
     * @param {number|null} agreedPrice - Final agreed price (only for "accepted")
     * @param {object|null} flag        - Current negotiation flag data
     */
    async _postNegotiationChat(result, agreedPrice, flag) {
        if (!flag?.playerId || flag.playerId !== game.user.id) return;

        const currency    = getSystemCurrency();
        const isBuy       = (flag?.type ?? this.options.type) === "buy";
        const itemName    = flag?.itemName ?? this.options.itemName;
        const playerName  = flag?.playerName ?? game.user.name;

        let title, borderColor, body;

        if (result === "accepted") {
            borderColor = "#27ae60";
            title       = "Negotiation Accepted";
            body        = `
                <strong>${playerName}</strong> ${isBuy ? "bought" : "sold"}
                <strong>${itemName}</strong> for
                <strong>${agreedPrice} ${currency}</strong>
                <span style="color:var(--color-text-secondary)"> (listed: ${flag?.basePrice ?? "?"})</span>`;
        } else {
            borderColor = "#C9A060";
            title       = "Negotiation Cancelled";
            body        = `The negotiation for <strong>${itemName}</strong> was cancelled.`;
        }

        const chatData = {
            content: buildChatCard({ title, borderColor, body }),
            speaker: ChatMessage.getSpeaker({ actor: game.user.character })
        };
        const whisperTo = getChatWhisperRecipients();
        if (whisperTo) chatData.whisper = whisperTo;

        await createStoreChatMessage(chatData);
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
