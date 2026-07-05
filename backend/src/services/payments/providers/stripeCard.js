// backend/src/services/payments/providers/stripeCard.js
//
// The card rail (New York and everywhere else cards rule) — a thin v2 adapter
// over the EXISTING Stripe integration. Charge creation reuses src/stripe.js
// verbatim; settlement stays on the existing /webhooks/stripe handler (which
// already confirms RSVPs + emails). v2 only standardizes the charge interface
// so the frontend speaks one language across rails.

import { stripeConfigured } from "../../../config/billing.js";
import { getOrCreateStripeCustomer, createPaymentIntent, getStripeSecretKey } from "../../../stripe.js";

// A connected account mid-onboarding has an id but can't take charges yet —
// offering card then fails at PaymentIntent time with a raw Stripe error.
// Gate the OFFER on charges_enabled, cached ~5 min per account so the rail
// list stays cheap. Fail OPEN on a Stripe API hiccup: a wrongly-hidden rail
// is worse than a retryable charge error.
const readyCache = new Map(); // accountId -> { at, ready }
const READY_TTL_MS = 5 * 60 * 1000;

async function cardReadyFor(connectedAccountId) {
  if (!connectedAccountId) return false;
  const hit = readyCache.get(connectedAccountId);
  if (hit && Date.now() - hit.at < READY_TTL_MS) return hit.ready;
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(getStripeSecretKey());
    const acct = await stripe.accounts.retrieve(connectedAccountId);
    const ready = !!acct?.charges_enabled;
    readyCache.set(connectedAccountId, { at: Date.now(), ready });
    return ready;
  } catch (e) {
    console.warn("[stripeCard] readiness check failed (failing open):", e?.message);
    return true;
  }
}

export const stripeCardProvider = {
  key: "card",

  available() {
    return stripeConfigured();
  },

  readyFor: cardReadyFor,

  // Cards route through the host's connected account (the host is the
  // merchant; PullUp takes application_fee) — same shape as the legacy path.
  async createCharge({
    amountCents,
    feeCents,
    currency,
    event,
    rsvp,
    connectedAccountId,
  }) {
    if (!connectedAccountId) throw new Error("host_has_no_stripe_account");
    const customerId = await getOrCreateStripeCustomer(rsvp.email, rsvp.name);
    const paymentIntent = await createPaymentIntent({
      customerId,
      amount: amountCents,
      eventId: event.id,
      eventTitle: event.title,
      personId: rsvp.personId,
      connectedAccountId,
      applicationFeeAmount: feeCents,
      currency: (currency || "usd").toLowerCase(),
    });
    return {
      providerRef: paymentIntent.id,
      status: "pending",
      stripeCustomerId: customerId,
      instructions: {
        type: "stripe",
        clientSecret: paymentIntent.client_secret,
      },
    };
  },
};
