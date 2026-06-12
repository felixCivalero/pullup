// backend/src/services/payments/providers/stripeCard.js
//
// The card rail (New York and everywhere else cards rule) — a thin v2 adapter
// over the EXISTING Stripe integration. Charge creation reuses src/stripe.js
// verbatim; settlement stays on the existing /webhooks/stripe handler (which
// already confirms RSVPs + emails). v2 only standardizes the charge interface
// so the frontend speaks one language across rails.

import { stripeConfigured } from "../../../config/billing.js";
import { getOrCreateStripeCustomer, createPaymentIntent } from "../../../stripe.js";

export const stripeCardProvider = {
  key: "card",

  available() {
    return stripeConfigured();
  },

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
