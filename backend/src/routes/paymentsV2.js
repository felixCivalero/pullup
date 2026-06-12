// backend/src/routes/paymentsV2.js
//
// The rail-agnostic checkout. A paid RSVP (PENDING_PAYMENT) gets charged here
// on whichever rail fits the event's currency — M-Pesa STK (KES), Swish (SEK),
// card via the existing Stripe integration, or mock in dev. Status polling
// reuses the existing public GET /payments/:paymentId/status.
//
// Every endpoint is live-but-inert while PAYMENTS_V2_ENABLED is off: config
// says disabled, charge returns 503, webhooks still 200 (a rail retrying into
// a 5xx would hammer us; an event for a flag-off deployment just gets audited
// and dropped).

import {
  paymentsV2Enabled,
  configuredRails,
  mockPaymentsEnabled,
} from "../config/billing.js";
import { getProvider, railsForEvent } from "../services/payments/index.js";
import { settleByProviderRef } from "../services/payments/settlement.js";
import {
  getPlanForHost,
  createRailPayment,
  recordPaymentEvent,
} from "../repos/billing.js";
import { computeTicketAmounts } from "../services/billing/feeEngine.js";
import {
  findRsvpById,
  findEventById,
  getUserProfile,
  createPayment,
} from "../data.js";

export function registerPaymentsV2Routes(app) {
  // ---------------------------
  // PUBLIC: which rails exist on this deployment (frontend gates UI off this)
  // ---------------------------
  app.get("/payments/v2/config", (req, res) => {
    res.json({
      enabled: paymentsV2Enabled(),
      rails: configuredRails(),
      currencies: ["sek", "kes", "usd"],
    });
  });

  // ---------------------------
  // PUBLIC: charge a pending paid RSVP on a chosen rail.
  // The rsvpId is the capability (a fresh UUID the guest just received) —
  // the same trust model as the existing public payment-status endpoint.
  // ---------------------------
  app.post("/public/rsvps/:rsvpId/charge", async (req, res) => {
    if (!paymentsV2Enabled()) {
      return res.status(503).json({ error: "payments_disabled" });
    }
    try {
      const { rsvpId } = req.params;
      const { rail, phone = null } = req.body || {};

      const rsvp = await findRsvpById(rsvpId);
      if (!rsvp) return res.status(404).json({ error: "rsvp_not_found" });
      if (rsvp.paymentStatus === "paid" || rsvp.bookingStatus === "CONFIRMED") {
        return res.status(409).json({ error: "already_paid" });
      }
      if (rsvp.bookingStatus !== "PENDING_PAYMENT") {
        return res.status(409).json({ error: "not_pending_payment" });
      }

      const event = await findEventById(rsvp.eventId);
      if (!event || event.ticketType !== "paid" || !event.ticketPrice) {
        return res.status(400).json({ error: "not_a_paid_event" });
      }

      const hostProfile = await getUserProfile(event.hostId);
      const offered = railsForEvent({ event, hostProfile });
      if (!offered.includes(rail)) {
        return res.status(400).json({ error: "rail_not_available", offered });
      }

      const plan = await getPlanForHost(event.hostId);
      const amounts = computeTicketAmounts({ event, rsvp, plan });
      const provider = getProvider(rail);

      const charge = await provider.createCharge({
        amountCents: amounts.totalAmount,
        feeCents: amounts.feeAmount,
        currency: amounts.currency,
        phone,
        description: `Ticket${amounts.partySize > 1 ? `s (${amounts.partySize}x)` : ""} for ${event.title}`,
        reference: (event.slug || "pullup").slice(0, 12),
        event,
        rsvp,
        connectedAccountId: hostProfile?.stripeConnectedAccountId || null,
      });

      // Cards persist through the LEGACY shape so the existing Stripe webhook
      // settles them untouched; every other rail gets a v2 row keyed by
      // (provider, provider_ref) for our own settlement.
      let payment;
      if (rail === "card") {
        payment = await createPayment({
          userId: event.hostId,
          eventId: event.id,
          rsvpId: rsvp.id,
          stripePaymentIntentId: charge.providerRef,
          stripeCustomerId: charge.stripeCustomerId || null,
          amount: amounts.totalAmount,
          currency: amounts.currency,
          status: "pending",
          description: `Ticket for ${event.title}`,
          metadata: {
            rail: "card",
            feeCents: amounts.feeAmount,
            ticketAmount: amounts.ticketAmount,
            partySize: amounts.partySize,
          },
        });
      } else {
        payment = await createRailPayment({
          provider: rail,
          providerRef: charge.providerRef,
          hostId: event.hostId,
          eventId: event.id,
          rsvpId: rsvp.id,
          amountCents: amounts.totalAmount,
          currency: amounts.currency,
          description: `Ticket for ${event.title}`,
          metadata: {
            rail,
            feeCents: amounts.feeAmount,
            ticketAmount: amounts.ticketAmount,
            partySize: amounts.partySize,
          },
        });
      }

      return res.json({
        paymentId: payment.id,
        rail,
        status: "pending",
        amount: amounts.totalAmount,
        currency: amounts.currency,
        breakdown: {
          ticketAmount: amounts.ticketAmount,
          platformFeeAmount: amounts.feeAmount,
          customerTotalAmount: amounts.totalAmount,
          partySize: amounts.partySize,
        },
        instructions: charge.instructions,
      });
    } catch (error) {
      console.error("[paymentsV2] charge failed:", error);
      const known = [
        "invalid_kenyan_phone",
        "swish_requires_sek",
        "host_has_no_stripe_account",
        "invalid_ticket_price",
      ];
      const msg = error?.message || "charge_failed";
      const code = known.find((k) => msg.startsWith(k));
      return res
        .status(code ? 400 : 500)
        .json({ error: code || "charge_failed", message: msg });
    }
  });

  // ---------------------------
  // WEBHOOK: M-Pesa Daraja STK callback. Always 200 (Daraja retries on 5xx
  // and there is nothing a retry would fix that the audit row doesn't hold).
  // ---------------------------
  app.post("/payments/v2/webhooks/mpesa", async (req, res) => {
    try {
      const provider = getProvider("mpesa");
      const evt = provider.parseWebhook(req.body);
      if (!evt) return res.json({ ResultCode: 0, ResultDesc: "ignored" });

      const { fresh } = await recordPaymentEvent({
        provider: "mpesa",
        providerRef: evt.providerRef,
        eventType: evt.eventType,
        payload: req.body,
      });
      if (fresh && paymentsV2Enabled()) {
        await settleByProviderRef({
          provider: "mpesa",
          providerRef: evt.providerRef,
          outcome: evt.outcome,
          receipt: evt.receipt,
        });
      }
      return res.json({ ResultCode: 0, ResultDesc: "ok" });
    } catch (e) {
      console.error("[paymentsV2] mpesa webhook error:", e?.message);
      return res.json({ ResultCode: 0, ResultDesc: "ok" });
    }
  });

  // ---------------------------
  // WEBHOOK: Swish callback. The inbound JSON is a HINT — before settling we
  // re-fetch the payment request from Swish over mTLS (our own authenticated
  // channel) so a forged callback can't confirm a booking.
  // ---------------------------
  app.post("/payments/v2/webhooks/swish", async (req, res) => {
    try {
      const provider = getProvider("swish");
      const evt = provider.parseWebhook(req.body);
      if (!evt) return res.status(200).end();

      const { fresh } = await recordPaymentEvent({
        provider: "swish",
        providerRef: evt.providerRef,
        eventType: evt.eventType,
        payload: req.body,
      });
      if (fresh && paymentsV2Enabled()) {
        const verified = await provider.fetchStatus(evt.providerRef);
        if (verified && verified !== "pending") {
          await settleByProviderRef({
            provider: "swish",
            providerRef: evt.providerRef,
            outcome: verified,
          });
        }
      }
      return res.status(200).end();
    } catch (e) {
      console.error("[paymentsV2] swish webhook error:", e?.message);
      return res.status(200).end();
    }
  });

  // ---------------------------
  // DEV/TEST: settle a mock charge — the mock rail's "webhook". Hard-gated:
  // does not exist in production unless MOCK_PAYMENTS_ENABLED is set.
  // ---------------------------
  app.post("/payments/v2/mock/:providerRef/confirm", async (req, res) => {
    if (!mockPaymentsEnabled()) return res.status(404).end();
    try {
      const { providerRef } = req.params;
      const outcome = req.body?.outcome === "failed" ? "failed" : "succeeded";
      await recordPaymentEvent({
        provider: "mock",
        providerRef,
        eventType: `mock.${outcome}`,
        payload: req.body || {},
      });
      const result = await settleByProviderRef({
        provider: "mock",
        providerRef,
        outcome,
      });
      return res.json(result);
    } catch (e) {
      console.error("[paymentsV2] mock confirm error:", e?.message);
      return res.status(500).json({ error: "mock_confirm_failed" });
    }
  });
}
