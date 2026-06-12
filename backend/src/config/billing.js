// backend/src/config/billing.js
//
// The transaction layer's switchboard. EVERYTHING here defaults to OFF /
// not-configured, so merging this code changes nothing in prod until the env
// flips. Two independent switches:
//
//   PAYMENTS_V2_ENABLED      — the rail-agnostic checkout (Swish / M-Pesa /
//                              card / mock) replaces the inline-Stripe RSVP
//                              path. Off → the legacy Stripe path runs verbatim.
//   BILLING_METERING_ENABLED — every pull-up / RSVP / ticket sale appends a
//                              metered motion to transaction_ledger. Off →
//                              zero writes, zero reads.
//
// Rails self-describe: a rail is "configured" iff its credentials exist in the
// env. The mock rail exists only outside production (or when explicitly
// enabled) so the whole flow can be exercised end-to-end with no merchant
// agreements signed.

function bool(v) {
  return v === true || v === "true" || v === "1" || v === "yes";
}

export function paymentsV2Enabled() {
  return bool(process.env.PAYMENTS_V2_ENABLED);
}

export function meteringEnabled() {
  return bool(process.env.BILLING_METERING_ENABLED);
}

export function mockPaymentsEnabled() {
  // Mock is a dev/test rail: on by default everywhere EXCEPT production,
  // where it must be summoned explicitly (e.g. for a staging probe).
  if (bool(process.env.MOCK_PAYMENTS_ENABLED)) return true;
  return process.env.NODE_ENV !== "production";
}

// ── Rail configuration (presence of credentials = the rail exists) ─────────

export function mpesaConfig() {
  const {
    MPESA_CONSUMER_KEY: consumerKey,
    MPESA_CONSUMER_SECRET: consumerSecret,
    MPESA_SHORTCODE: shortcode,
    MPESA_PASSKEY: passkey,
  } = process.env;
  const configured = !!(consumerKey && consumerSecret && shortcode && passkey);
  return {
    configured,
    consumerKey,
    consumerSecret,
    shortcode,
    passkey,
    env: process.env.MPESA_ENV === "production" ? "production" : "sandbox",
    callbackUrl:
      process.env.MPESA_CALLBACK_URL ||
      "https://pullup.se/api/payments/v2/webhooks/mpesa",
  };
}

export function swishConfig() {
  const {
    SWISH_PAYEE_ALIAS: payeeAlias, // the merchant Swish number (123 XXX XXXX)
    SWISH_CERT_PATH: certPath,
    SWISH_KEY_PATH: keyPath,
    SWISH_CA_PATH: caPath,
  } = process.env;
  const configured = !!(payeeAlias && certPath && keyPath);
  return {
    configured,
    payeeAlias,
    certPath,
    keyPath,
    caPath: caPath || null,
    env: process.env.SWISH_ENV === "production" ? "production" : "sandbox",
    callbackUrl:
      process.env.SWISH_CALLBACK_URL ||
      "https://pullup.se/api/payments/v2/webhooks/swish",
  };
}

export function stripeConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY || process.env.TEST_STRIPE_SECRET_KEY);
}

// The rails that exist for this deployment (independent of any one event —
// per-event narrowing by currency/host happens in services/payments/index.js).
export function configuredRails() {
  return {
    mpesa: mpesaConfig().configured,
    swish: swishConfig().configured,
    card: stripeConfigured(),
    mock: mockPaymentsEnabled(),
  };
}
