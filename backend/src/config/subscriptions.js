// backend/src/config/subscriptions.js
//
// The Creator-tier switchboard. Follows the house rule (config/billing.js):
// presence of credentials = the feature exists. The paywall turns itself on
// the moment BOTH are in the env — no code deploy, no extra flag:
//
//   STRIPE_SECRET_KEY       — the platform Stripe key (already on the box for
//                             Connect ticket payments)
//   STRIPE_CREATOR_PRICE_ID — the Price id of the 125 SEK/month Creator
//                             subscription (price_..., created in the Stripe
//                             dashboard)
//
// Optional:
//   STRIPE_SUBSCRIPTION_WEBHOOK_SECRET — signing secret for the subscription
//                             webhook endpoint (whsec_...). Without it the
//                             webhook route rejects everything, so set it when
//                             registering the endpoint in the dashboard.
//   SUBSCRIPTIONS_ENABLED=false — explicit kill switch that keeps hosting open
//                             even with keys present (rollback lever).
//
// Until the env is complete, everything stays exactly as today: hosting is
// open, the Billing panel shows the tier as "not live yet".

function bool(v) {
  return v === true || v === "true" || v === "1" || v === "yes";
}

export const CREATOR_TIER = Object.freeze({
  name: "creator",
  priceSek: 125, // the headline number, shown wherever the tier is described
  currency: "sek",
  interval: "month",
});

export function subscriptionConfig() {
  const secretKey = process.env.STRIPE_SECRET_KEY || process.env.TEST_STRIPE_SECRET_KEY || null;
  const priceId = process.env.STRIPE_CREATOR_PRICE_ID || null;
  const killSwitch = process.env.SUBSCRIPTIONS_ENABLED === "false";
  return {
    configured: !!(secretKey && priceId),
    enforced: !!(secretKey && priceId) && !killSwitch,
    secretKey,
    priceId,
    webhookSecret: process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || null,
  };
}

// The single question the paywall asks of the deployment.
export function subscriptionsEnforced() {
  return subscriptionConfig().enforced;
}
