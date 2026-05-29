// backend/src/whatsapp/cost/pricing.js
//
// Per-country, per-category Meta WhatsApp pricing in micro-USD (1e-6 USD).
// Source: developers.facebook.com/docs/whatsapp/pricing  (mid-2025 conversation-based).
// We snapshot prices here at send-time so historic rows stay accurate even
// as Meta adjusts. Update this table when Meta posts a new pricing page.
//
// Authentication-category messages are heavily subsidised by Meta and
// uniformly priced across most markets ($0.005); we cover the common
// markets for utility + marketing explicitly and fall back to "rest of
// world" defaults for the rest.

const MICROS = (usd) => Math.round(usd * 1_000_000);

const REST_OF_WORLD = {
  authentication: MICROS(0.005),
  utility: MICROS(0.015),
  marketing: MICROS(0.0344),
  service: MICROS(0.0),
};

// Country → category → micro-USD per delivered conversation.
const PRICING = {
  SE: {
    authentication: MICROS(0.0381),
    utility: MICROS(0.0381),
    marketing: MICROS(0.0848),
    service: MICROS(0.0),
  },
  KE: {
    authentication: MICROS(0.005),
    utility: MICROS(0.011),
    marketing: MICROS(0.0344),
    service: MICROS(0.0),
  },
  US: {
    authentication: MICROS(0.0135),
    utility: MICROS(0.0125),
    marketing: MICROS(0.025),
    service: MICROS(0.0),
  },
  GB: {
    authentication: MICROS(0.0358),
    utility: MICROS(0.0331),
    marketing: MICROS(0.0529),
    service: MICROS(0.0),
  },
  IN: {
    authentication: MICROS(0.0014),
    utility: MICROS(0.0014),
    marketing: MICROS(0.0073),
    service: MICROS(0.0),
  },
  BR: {
    authentication: MICROS(0.0315),
    utility: MICROS(0.008),
    marketing: MICROS(0.0625),
    service: MICROS(0.0),
  },
  NG: {
    authentication: MICROS(0.005),
    utility: MICROS(0.011),
    marketing: MICROS(0.0307),
    service: MICROS(0.0),
  },
};

export function estimateCostMicros({ country, category }) {
  const cat = category || "utility";
  const table = (country && PRICING[country.toUpperCase()]) || REST_OF_WORLD;
  if (table[cat] !== undefined) return table[cat];
  return REST_OF_WORLD[cat] ?? 0;
}

export function formatCost(micros) {
  if (micros == null) return null;
  return `$${(micros / 1_000_000).toFixed(4)}`;
}
