// backend/src/repos/billing.js
//
// The transaction layer's data: metered motions (transaction_ledger), per-host
// fee plans (creator_billing_plans), rail-agnostic payment lookups, and the
// webhook audit trail (payment_events). Every write here is idempotent by
// dedupe_key — a replay is a true no-op, never a double-billed motion.

import { supabase } from "../supabase.js";

// No plan row = the creator defaults (subscribes to host). A row exists for
// founding hosts (plan 'early', stamped by mig 118) and for anyone who has
// touched Stripe, so the table stays tiny and honest.
//
// Two revenue lines, the ONLY two: the Creator subscription (125 SEK/month
// while you host anything) and ticketFeeBps on paid tickets. A BYO creator's
// Supabase bill is between them and Supabase — PullUp adds nothing on top.
export const DEFAULT_PLAN = Object.freeze({
  plan: "creator",
  ticketFeeBps: 300, // 3% of the ticket motion — same number the live Stripe path charges
  feeCurrency: "usd",
  carePlan: null,
  byoSupabase: false,
  subscriptionStatus: "none", // none | active | past_due | canceled
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
});

function mapPlanRow(data) {
  if (!data) return { ...DEFAULT_PLAN };
  return {
    plan: data.plan || DEFAULT_PLAN.plan,
    ticketFeeBps: data.ticket_fee_bps ?? DEFAULT_PLAN.ticketFeeBps,
    feeCurrency: data.fee_currency || DEFAULT_PLAN.feeCurrency,
    carePlan: data.care_plan || null,
    byoSupabase: !!data.byo_supabase,
    subscriptionStatus: data.subscription_status || "none",
    stripeCustomerId: data.stripe_customer_id || null,
    stripeSubscriptionId: data.stripe_subscription_id || null,
    currentPeriodEnd: data.current_period_end || null,
  };
}

export async function getPlanForHost(hostId) {
  if (!hostId) return { ...DEFAULT_PLAN };
  const { data } = await supabase
    .from("creator_billing_plans")
    .select("*")
    .eq("host_id", hostId)
    .maybeSingle();
  return mapPlanRow(data);
}

// ── Subscription state (written by Stripe webhooks + checkout sync) ─────────

// Remember the host's Stripe customer id the moment it's minted, so a checkout
// abandoned halfway still reuses the same customer next time.
export async function setStripeCustomerId(hostId, customerId) {
  if (!hostId || !customerId) return { ok: false, reason: "missing_key" };
  const { error } = await supabase
    .from("creator_billing_plans")
    .upsert({ host_id: hostId, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: "host_id" });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// Idempotent by nature: writing the same subscription state twice is a no-op,
// so replayed webhooks are harmless.
export async function updateSubscriptionState(
  hostId,
  { status, customerId = null, subscriptionId = null, currentPeriodEnd = null },
) {
  if (!hostId || !status) return { ok: false, reason: "missing_key" };
  const patch = {
    host_id: hostId,
    subscription_status: status,
    subscription_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (customerId) patch.stripe_customer_id = customerId;
  if (subscriptionId) patch.stripe_subscription_id = subscriptionId;
  if (currentPeriodEnd) patch.current_period_end = currentPeriodEnd;
  const { error } = await supabase
    .from("creator_billing_plans")
    .upsert(patch, { onConflict: "host_id" });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// Webhook → host resolution: subscription events carry the subscription (or
// customer) id, not our host id.
export async function findHostByStripeSubscription({ subscriptionId = null, customerId = null }) {
  if (subscriptionId) {
    const { data } = await supabase
      .from("creator_billing_plans")
      .select("host_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    if (data?.host_id) return data.host_id;
  }
  if (customerId) {
    const { data } = await supabase
      .from("creator_billing_plans")
      .select("host_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (data?.host_id) return data.host_id;
  }
  return null;
}

// Append one metered motion. Idempotent: a duplicate dedupe_key is swallowed
// (unique-violation = the motion already landed) so webhook retries and
// concurrent scans never double-meter.
export async function meterMotion({
  motion,
  dedupeKey,
  hostId = null,
  eventId = null,
  personId = null,
  rsvpId = null,
  paymentId = null,
  quantity = 1,
  amountCents = 0,
  feeCents = 0,
  currency = "usd",
  metadata = {},
}) {
  if (!motion || !dedupeKey) return { ok: false, reason: "missing_key" };
  const { error } = await supabase.from("transaction_ledger").insert({
    motion,
    dedupe_key: dedupeKey,
    host_id: hostId,
    event_id: eventId,
    person_id: personId,
    rsvp_id: rsvpId,
    payment_id: paymentId,
    quantity,
    amount_cents: amountCents,
    fee_cents: feeCents,
    currency: (currency || "usd").toLowerCase(),
    metadata,
  });
  if (error) {
    if (error.code === "23505") return { ok: true, deduped: true };
    return { ok: false, reason: error.message };
  }
  return { ok: true, deduped: false };
}

// The host-facing month picture: motions counted (scale, never billed), ticket
// money moved + ticket fees (grouped by currency — a Nairobi+Stockholm host
// legitimately has both), and the subscription state.
export async function getBillingSummary(hostId) {
  const plan = await getPlanForHost(hostId);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data: rows } = await supabase
    .from("transaction_ledger")
    .select("motion, quantity, amount_cents, fee_cents, currency, occurred_at")
    .eq("host_id", hostId)
    .gte("occurred_at", monthStart.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(2000);

  const month = { pullups: 0, rsvps: 0, ticketSales: 0, byCurrency: {} };
  for (const r of rows || []) {
    if (r.motion === "pullup") month.pullups += r.quantity || 1;
    else if (r.motion === "rsvp") month.rsvps += r.quantity || 1;
    else if (r.motion === "ticket_sale") month.ticketSales += r.quantity || 1;
    const cur = r.currency || "usd";
    if (!month.byCurrency[cur]) month.byCurrency[cur] = { grossCents: 0, feeCents: 0 };
    month.byCurrency[cur].grossCents += r.amount_cents || 0;
    month.byCurrency[cur].feeCents += r.fee_cents || 0;
  }

  return {
    plan,
    month,
    recent: (rows || []).slice(0, 25).map((r) => ({
      motion: r.motion,
      amountCents: r.amount_cents,
      feeCents: r.fee_cents,
      currency: r.currency,
      at: r.occurred_at,
    })),
  };
}

// ── Rail-agnostic payment rows ──────────────────────────────────────────────
// The payments table stays the single source of payment truth; v2 rows carry
// provider + provider_ref instead of (or alongside) the stripe_* columns.

export async function createRailPayment({
  provider,
  providerRef,
  hostId,
  eventId,
  rsvpId = null,
  amountCents,
  currency,
  description = null,
  metadata = {},
}) {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      provider,
      provider_ref: providerRef,
      user_id: hostId,
      event_id: eventId,
      rsvp_id: rsvpId,
      amount: amountCents,
      currency: (currency || "usd").toLowerCase(),
      status: "pending",
      description,
      refunded_amount: 0,
      metadata,
    })
    .select()
    .single();
  if (error) throw new Error(`rail_payment_insert_failed: ${error.message}`);

  if (rsvpId) {
    await supabase
      .from("rsvps")
      .update({ payment_id: data.id, payment_status: "pending" })
      .eq("id", rsvpId);
  }
  return mapRailPayment(data);
}

export async function findPaymentByProviderRef(provider, providerRef) {
  if (!provider || !providerRef) return null;
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("provider", provider)
    .eq("provider_ref", providerRef)
    .maybeSingle();
  return data ? mapRailPayment(data) : null;
}

function mapRailPayment(p) {
  return {
    id: p.id,
    provider: p.provider,
    providerRef: p.provider_ref,
    hostId: p.user_id,
    eventId: p.event_id,
    rsvpId: p.rsvp_id,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    description: p.description,
    metadata: p.metadata || {},
    createdAt: p.created_at,
    paidAt: p.paid_at,
  };
}

// ── Webhook audit (the black box recorder) ─────────────────────────────────
// Returns { fresh } — false means this exact callback already landed once,
// so the caller can skip re-settlement without a settlement-side race.
export async function recordPaymentEvent({ provider, providerRef, eventType, payload }) {
  const dedupeKey = `${provider}:${providerRef || "none"}:${eventType || "event"}`;
  const { error } = await supabase.from("payment_events").insert({
    provider,
    provider_ref: providerRef || null,
    event_type: eventType || null,
    dedupe_key: dedupeKey,
    payload: payload || null,
  });
  if (error && error.code === "23505") return { fresh: false };
  if (error) {
    console.error("[billing] payment_events insert failed:", error.message);
    return { fresh: true }; // never block settlement on the audit trail
  }
  return { fresh: true };
}
