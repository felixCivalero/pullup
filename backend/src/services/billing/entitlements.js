// backend/src/services/billing/entitlements.js
//
// THE paywall question, asked in exactly one place: may this host HOST —
// publish events, open community pages, sell products, send to their people?
//
// Free to be a guest, paid to be a host:
//   plan 'early'                      → yes, forever (founding hosts, mig 118)
//   subscription active               → yes (Creator tier, 125 SEK/month)
//   subscription past_due             → yes — GRACE while Stripe retries the
//                                       card; the host sees a fix-payment
//                                       banner, guests see nothing
//   anything else                     → no (typed 402 upstream)
//   deployment not configured         → yes for everyone (pre-launch state)
//
// canHost() sits on hot paths (public event pages check the OWNER's
// entitlement), so answers are cached ~60s in-process. Webhooks and checkout
// sync call invalidateEntitlement(hostId) so a fresh subscription is felt
// immediately; a lapse propagates within a cache-TTL, which is fine.

import { getPlanForHost } from "../../repos/billing.js";
import { subscriptionsEnforced } from "../../config/subscriptions.js";

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // hostId -> { at, value }

// Pure decision — unit-testable, no IO. plan is the mapped shape from
// repos/billing.getPlanForHost.
export function computeEntitlement(plan, enforced) {
  if (!enforced) {
    return { canHost: true, reason: "open", plan: plan?.plan || "creator", subscriptionStatus: plan?.subscriptionStatus || "none" };
  }
  const tier = plan?.plan || "creator";
  const status = plan?.subscriptionStatus || "none";
  if (tier === "early") {
    return { canHost: true, reason: "early", plan: tier, subscriptionStatus: status };
  }
  if (status === "active") {
    return { canHost: true, reason: "subscribed", plan: tier, subscriptionStatus: status };
  }
  if (status === "past_due") {
    return { canHost: true, reason: "grace", plan: tier, subscriptionStatus: status };
  }
  return { canHost: false, reason: "subscription_required", plan: tier, subscriptionStatus: status };
}

export async function getEntitlement(hostId) {
  if (!hostId) return computeEntitlement(null, subscriptionsEnforced());
  const hit = cache.get(hostId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  let plan = null;
  try {
    plan = await getPlanForHost(hostId);
  } catch (e) {
    // Fail OPEN: a transient DB hiccup must never take a paying host's pages
    // down. The cache is not poisoned with the fallback.
    console.error("[entitlements] plan read failed (failing open):", e?.message);
    return { canHost: true, reason: "plan_read_failed", plan: "creator", subscriptionStatus: "none" };
  }
  const value = computeEntitlement(plan, subscriptionsEnforced());
  cache.set(hostId, { at: Date.now(), value });
  return value;
}

export async function canHost(hostId) {
  return (await getEntitlement(hostId)).canHost;
}

export function invalidateEntitlement(hostId) {
  if (hostId) cache.delete(hostId);
  else cache.clear();
}

// The typed refusal every publish choke point sends — the frontend keys its
// paywall sheet off error === "subscription_required" + HTTP 402.
export function paywallResponse(res, entitlement) {
  return res.status(402).json({
    error: "subscription_required",
    paywall: true,
    plan: entitlement?.plan || "creator",
    subscriptionStatus: entitlement?.subscriptionStatus || "none",
  });
}

// Express guard for host-side write routes that require an active tier.
// Usage: app.post("/host/events/:id/publish", requireAuth, requireCanHost, ...)
export async function requireCanHost(req, res, next) {
  try {
    const ent = await getEntitlement(req.user?.id);
    if (ent.canHost) return next();
    return paywallResponse(res, ent);
  } catch (e) {
    console.error("[entitlements] guard failed (failing open):", e?.message);
    return next();
  }
}
