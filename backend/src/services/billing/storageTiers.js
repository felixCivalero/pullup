// Supabase plan → monthly base cost in cents (USD). The 30% storage markup
// (creator_billing_plans.markup_bps) is computed on this number.
//
// v1 deliberately uses the PLAN BASE PRICE (predictable, no surprises): the
// Supabase Management API's getProjectTier() returns a plan id / tier string,
// which we map here. Usage/add-on-inclusive pricing is a later refinement.
//
// Per-plan prices are overridable via STORAGE_PLAN_PRICES_JSON (e.g.
// '{"pro":2500,"team":59900}') so we can tune without a deploy.

const DEFAULT_PRICES_CENTS = {
  free: 0,
  pro: 2500, // $25/mo
  team: 59900, // $599/mo
  enterprise: 0, // custom — priced by hand, kept out of the auto line
};

function priceTable() {
  try {
    const raw = process.env.STORAGE_PLAN_PRICES_JSON;
    if (!raw) return DEFAULT_PRICES_CENTS;
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? { ...DEFAULT_PRICES_CENTS, ...o } : DEFAULT_PRICES_CENTS;
  } catch {
    return DEFAULT_PRICES_CENTS;
  }
}

// Map a Supabase tier/plan id ('free' | 'pro' | 'tier_team' | 'pro_2024' | …)
// to a monthly cost in cents. Unknown → 0 so the line stays dormant and we
// NEVER over-charge from a shape we didn't recognise.
export function planToTierCents(tier) {
  if (!tier) return 0;
  const key = String(tier).toLowerCase().trim();
  const prices = priceTable();
  if (key in prices) return Math.max(0, Math.round(Number(prices[key]) || 0));
  // tolerate decorated ids
  if (key.includes("team")) return Math.max(0, Math.round(Number(prices.team) || 0));
  if (key.includes("enterprise")) return Math.max(0, Math.round(Number(prices.enterprise) || 0));
  if (key.includes("pro")) return Math.max(0, Math.round(Number(prices.pro) || 0));
  if (key.includes("free")) return 0;
  return 0;
}
