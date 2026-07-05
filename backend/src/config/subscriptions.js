// backend/src/config/subscriptions.js
//
// The subscription-tier switchboard. Follows the house rule (config/billing.js):
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
//   STRIPE_AGENCY_PRICE_ID  — the 450 SEK/month Agency tier (2+ people
//                             businesses). Same machinery, different price;
//                             functionally identical to creator for now.
//                             Absent = agency checkout answers 503, everything
//                             else unaffected.
//   STRIPE_SUBSCRIPTION_WEBHOOK_SECRET — signing secret for the subscription
//                             webhook endpoint (whsec_...). Without it the
//                             webhook route rejects everything, so set it when
//                             registering the endpoint in the dashboard.
//   SUBSCRIPTIONS_ENABLED=false — explicit kill switch that keeps hosting open
//                             even with keys present (rollback lever).
//
// Until the env is complete, everything stays exactly as today: hosting is
// open, the Billing panel shows the tier as "not live yet".

export const TIERS = Object.freeze({
  creator: Object.freeze({ name: "creator", priceSek: 125, currency: "sek", interval: "month" }),
  agency: Object.freeze({ name: "agency", priceSek: 450, currency: "sek", interval: "month" }),
});

// Which tier a plan value maps to: 'early' hosts free but is creator-shaped;
// unknown/future plan values fall back to creator.
export function tierForPlan(plan) {
  return TIERS[plan] || TIERS.creator;
}

export function subscriptionConfig() {
  const secretKey = process.env.STRIPE_SECRET_KEY || process.env.TEST_STRIPE_SECRET_KEY || null;
  const priceId = process.env.STRIPE_CREATOR_PRICE_ID || null;
  const agencyPriceId = process.env.STRIPE_AGENCY_PRICE_ID || null;
  const killSwitch = process.env.SUBSCRIPTIONS_ENABLED === "false";
  return {
    configured: !!(secretKey && priceId),
    enforced: !!(secretKey && priceId) && !killSwitch,
    secretKey,
    priceId, // creator — the default tier
    agencyPriceId,
    webhookSecret: process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || null,
  };
}

// tier name -> Stripe price id (null when that tier isn't configured).
export function priceIdForTier(tier) {
  const cfg = subscriptionConfig();
  if (tier === "agency") return cfg.agencyPriceId;
  return cfg.priceId;
}

// Stripe price id -> plan value, so a webhook can stamp WHICH tier was bought.
export function planFromPriceId(priceId) {
  if (!priceId) return null;
  const cfg = subscriptionConfig();
  if (cfg.agencyPriceId && priceId === cfg.agencyPriceId) return "agency";
  if (cfg.priceId && priceId === cfg.priceId) return "creator";
  return null;
}

// The single question the paywall asks of the deployment.
export function subscriptionsEnforced() {
  return subscriptionConfig().enforced;
}
