// backend/src/services/billing/subscriptions.js
//
// The Creator-tier subscription, run by Stripe Billing so we never write a
// billing engine: Checkout collects the card, the Customer Portal handles
// cancel/card changes, webhooks (+ a return-from-checkout sync that beats
// webhook lag) keep creator_billing_plans.subscription_status true. Everything
// downstream asks entitlements.canHost(), which reads that one column.
//
// State machine (Stripe status → ours):
//   active, trialing              → 'active'    (hosts)
//   past_due                      → 'past_due'  (hosts — grace while Stripe
//                                                retries the card; Settings
//                                                shows a fix-payment banner)
//   incomplete                    → 'none'      (checkout never finished)
//   canceled, unpaid, paused,
//   incomplete_expired            → 'canceled'  (read-only until resubscribe)
//
// Cancel-at-period-end (the Portal's cancel) keeps Stripe status 'active'
// until the period actually ends, so a canceling host keeps hosting exactly
// as long as they've paid for — then the deletion event lands and flips us.

import Stripe from "stripe";
import { getStripeSecretKey } from "../../stripe.js";
import { subscriptionConfig, priceIdForTier, planFromPriceId, TIERS } from "../../config/subscriptions.js";
import {
  getPlanForHost,
  setStripeCustomerId,
  updateSubscriptionState,
  findHostByStripeSubscription,
  recordPaymentEvent,
} from "../../repos/billing.js";
import { invalidateEntitlement } from "./entitlements.js";
import { getFrontendUrl } from "../../lib/urls.js";
import { supabase } from "../../supabase.js";

function stripeClient() {
  return new Stripe(getStripeSecretKey());
}

export function mapStripeStatus(s) {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due") return "past_due";
  if (s === "incomplete") return "none";
  return "canceled"; // canceled | unpaid | paused | incomplete_expired
}

// Only paths INSIDE the app may be checkout return targets — never absolute
// URLs (an open redirect through our Stripe session otherwise).
export function sanitizeReturnPath(p) {
  if (typeof p !== "string" || !p.startsWith("/") || p.startsWith("//")) return "/settings#billing";
  return p;
}

// Append query params to an app path that may already carry ?query and/or
// #fragment (the fragment must stay LAST or the params are lost to the router).
export function appendQuery(path, params) {
  const [beforeHash, hash] = path.split("#");
  const sep = beforeHash.includes("?") ? "&" : "?";
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`) // session_id template must NOT be URL-encoded
    .join("&");
  return `${beforeHash}${sep}${qs}${hash ? `#${hash}` : ""}`;
}

async function hostEmail(hostId) {
  try {
    const { data } = await supabase.auth.admin.getUserById(hostId);
    return data?.user?.email || null;
  } catch {
    return null;
  }
}

// One Stripe customer per host, remembered on the plan row the moment it's
// minted — an abandoned checkout still reuses the same customer next time.
export async function getOrCreateSubscriptionCustomer(hostId) {
  const plan = await getPlanForHost(hostId);
  if (plan.stripeCustomerId) return plan.stripeCustomerId;
  const stripe = stripeClient();
  const email = await hostEmail(hostId);
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { pullupHostId: hostId },
  });
  await setStripeCustomerId(hostId, customer.id);
  return customer.id;
}

export async function createCheckoutSession(hostId, { returnTo, tier } = {}) {
  const cfg = subscriptionConfig();
  if (!cfg.configured) throw new Error("subscriptions_not_configured");
  // Which tier: explicit ask wins; otherwise a host already marked 'agency'
  // (e.g. onboarded from the agency waitlist) renews as agency; default creator.
  let tierName = tier && TIERS[tier] ? tier : null;
  if (!tierName) {
    const plan = await getPlanForHost(hostId);
    tierName = plan.plan === "agency" ? "agency" : "creator";
  }
  const priceId = priceIdForTier(tierName);
  if (!priceId) throw new Error("tier_not_configured");
  const stripe = stripeClient();
  const customer = await getOrCreateSubscriptionCustomer(hostId);
  const base = getFrontendUrl();
  const path = sanitizeReturnPath(returnTo);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: priceId, quantity: 1 }],
    // {CHECKOUT_SESSION_ID} is Stripe's template — the return page trades it
    // for an immediate server-side sync, so hosting unlocks without waiting
    // for the webhook.
    success_url: `${base}${appendQuery(path, { subscribed: "1", session_id: "{CHECKOUT_SESSION_ID}" })}`,
    cancel_url: `${base}${appendQuery(path, { subscribed: "0" })}`,
    client_reference_id: hostId,
    metadata: { pullupHostId: hostId },
    subscription_data: { metadata: { pullupHostId: hostId } },
    allow_promotion_codes: true,
  });
  return { url: session.url };
}

export async function createPortalSession(hostId, { returnTo } = {}) {
  const plan = await getPlanForHost(hostId);
  if (!plan.stripeCustomerId) throw new Error("no_stripe_customer");
  const stripe = stripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: plan.stripeCustomerId,
    return_url: `${getFrontendUrl()}${sanitizeReturnPath(returnTo)}`,
  });
  return { url: session.url };
}

// Write one Stripe subscription object into our state. The single funnel every
// signal goes through — webhook, checkout sync, deletion — so they can't
// disagree. Idempotent: same subscription state twice = same row.
export async function applyStripeSubscription(sub, hostIdHint = null) {
  if (!sub?.id) return { ok: false, reason: "no_subscription" };
  const hostId =
    sub.metadata?.pullupHostId ||
    (await findHostByStripeSubscription({ subscriptionId: sub.id, customerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id })) ||
    hostIdHint;
  if (!hostId) {
    console.error("[subscriptions] cannot resolve host for subscription", sub.id);
    return { ok: false, reason: "host_unresolved" };
  }
  const status = mapStripeStatus(sub.status);
  // Which tier was bought — read off the subscription's price. Never
  // overwrite 'early': a founding host stays founding whatever they buy.
  let plan = planFromPriceId(sub.items?.data?.[0]?.price?.id);
  if (plan) {
    const existing = await getPlanForHost(hostId);
    if (existing.plan === "early") plan = null;
  }
  const result = await updateSubscriptionState(hostId, {
    status,
    plan,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id || null,
    subscriptionId: sub.id,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  });
  invalidateEntitlement(hostId);
  return { ...result, hostId, status, plan };
}

// The return-from-checkout sync: the success URL carries the session id; we
// trade it for the subscription server-side. Beats webhook lag AND works even
// if the webhook endpoint was never configured.
export async function syncCheckoutSession(hostId, sessionId) {
  if (!hostId || !sessionId || typeof sessionId !== "string") return { ok: false, reason: "missing_key" };
  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  // The session must belong to this host — a stolen session id must not flip
  // someone else's plan.
  const owner = session?.metadata?.pullupHostId || session?.client_reference_id;
  if (owner !== hostId) return { ok: false, reason: "session_host_mismatch" };
  if (session.mode !== "subscription" || !session.subscription) return { ok: false, reason: "not_a_subscription" };
  const sub = typeof session.subscription === "string"
    ? await stripe.subscriptions.retrieve(session.subscription)
    : session.subscription;
  return applyStripeSubscription(sub, hostId);
}

// Webhook processing, shared by the dedicated subscription endpoint and the
// legacy /webhooks/stripe delegation. Dedupes by Stripe event id through the
// existing payment_events audit trail, so replays are true no-ops.
export async function handleSubscriptionWebhookEvent(event) {
  const { fresh } = await recordPaymentEvent({
    provider: "stripe_subscription",
    providerRef: event.id,
    eventType: event.type,
    payload: { type: event.type }, // full payloads are in Stripe; keep our audit lean
  });
  if (!fresh) return { processed: false, deduped: true };

  const obj = event.data?.object;
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      // deleted arrives with status 'canceled' on the object — same funnel.
      const r = await applyStripeSubscription(obj);
      return { processed: r.ok !== false, ...r };
    }
    case "checkout.session.completed": {
      if (obj?.mode !== "subscription" || !obj?.subscription) return { processed: false, ignored: true };
      const stripe = stripeClient();
      const sub = await stripe.subscriptions.retrieve(
        typeof obj.subscription === "string" ? obj.subscription : obj.subscription.id,
      );
      const r = await applyStripeSubscription(sub, obj.metadata?.pullupHostId || obj.client_reference_id || null);
      return { processed: r.ok !== false, ...r };
    }
    case "invoice.payment_failed":
    case "invoice.paid": {
      // A renewal outcome — re-read the subscription (its status already
      // reflects the failure/recovery) and write through the same funnel.
      const subId = typeof obj?.subscription === "string" ? obj.subscription : obj?.subscription?.id;
      if (!subId) return { processed: false, ignored: true };
      const stripe = stripeClient();
      const sub = await stripe.subscriptions.retrieve(subId);
      const r = await applyStripeSubscription(sub);
      return { processed: r.ok !== false, ...r };
    }
    default:
      return { processed: false, ignored: true };
  }
}

// Upgrade/downgrade in place: swap the live subscription's price to the other
// tier. Stripe prorates the difference automatically (credit for unused time,
// charge for the remainder at the new rate) on the next invoice. The updated
// subscription flows through the same applyStripeSubscription funnel, so the
// plan value flips immediately and the entitlement cache is invalidated.
export async function changeSubscriptionTier(hostId, tier) {
  if (!TIERS[tier]) throw new Error("unknown_tier");
  const newPriceId = priceIdForTier(tier);
  if (!newPriceId) throw new Error("tier_not_configured");
  const plan = await getPlanForHost(hostId);
  if (!plan.stripeSubscriptionId) throw new Error("no_subscription");
  if (!["active", "past_due"].includes(plan.subscriptionStatus)) throw new Error("no_subscription");
  if (plan.plan === tier) return { ok: true, unchanged: true, plan: tier };

  const stripe = stripeClient();
  const sub = await stripe.subscriptions.retrieve(plan.stripeSubscriptionId);
  const item = sub.items?.data?.[0];
  if (!item) throw new Error("subscription_item_missing");
  const updated = await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, price: newPriceId }],
    proration_behavior: "create_prorations",
  });
  return applyStripeSubscription(updated, hostId);
}

// Account deletion: nobody keeps paying for an account they've asked us to
// erase. Immediate cancel (not at period end) — the goodwill direction.
// Best-effort: a Stripe hiccup must not block the deletion request itself.
export async function cancelSubscriptionForHost(hostId) {
  try {
    const plan = await getPlanForHost(hostId);
    if (!plan.stripeSubscriptionId) return { ok: true, skipped: true };
    if (!["active", "past_due"].includes(plan.subscriptionStatus)) return { ok: true, skipped: true };
    const stripe = stripeClient();
    const sub = await stripe.subscriptions.cancel(plan.stripeSubscriptionId);
    return applyStripeSubscription(sub, hostId);
  } catch (e) {
    console.error("[subscriptions] cancel on deletion failed (non-blocking):", e?.message);
    return { ok: false, reason: e?.message };
  }
}
