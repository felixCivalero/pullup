// backend/src/services/payments/index.js
//
// The rail registry — one vocabulary for moving money, many rails under it.
// A rail "exists" when its credentials are in the env (config/billing.js);
// a rail is OFFERED for a given event by currency + host readiness:
//
//   KES → M-Pesa (Nairobi: the phone IS the wallet)
//   SEK → Swish  (Stockholm: same — the national rail)
//   any → card   (New York and the rest), iff the host connected Stripe
//   any → mock   (dev/test only) — the full flow with no merchant agreement
//
// The charge endpoint and the frontend both speak rail KEYS ('mpesa',
// 'swish', 'card', 'mock'); everything provider-specific stays behind
// createCharge()/parseWebhook().

import { mpesaProvider } from "./providers/mpesa.js";
import { swishProvider } from "./providers/swish.js";
import { stripeCardProvider } from "./providers/stripeCard.js";
import { mockProvider } from "./providers/mock.js";

const PROVIDERS = {
  mpesa: mpesaProvider,
  swish: swishProvider,
  card: stripeCardProvider,
  mock: mockProvider,
};

export function getProvider(key) {
  return PROVIDERS[key] || null;
}

// The rails offered for THIS event, preferred-first. Local rail (matched to
// the ticket currency) leads; card backs it up when the host can ACTUALLY
// take cards (charges_enabled, cached ~5min — a mid-onboarding account has an
// id but every charge would fail); mock trails in dev so every flow stays
// exercisable.
export async function railsForEvent({ event, hostProfile }) {
  const currency = (event?.ticketCurrency || "usd").toLowerCase();
  const rails = [];
  if (currency === "kes" && mpesaProvider.available()) rails.push("mpesa");
  if (currency === "sek" && swishProvider.available()) rails.push("swish");
  if (
    stripeCardProvider.available() &&
    hostProfile?.stripeConnectedAccountId &&
    (await stripeCardProvider.readyFor(hostProfile.stripeConnectedAccountId))
  ) {
    rails.push("card");
  }
  if (mockProvider.available()) rails.push("mock");
  return rails;
}
