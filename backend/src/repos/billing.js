// backend/src/repos/billing.js
//
// The transaction layer's data: metered motions (transaction_ledger), per-host
// fee plans (creator_billing_plans), rail-agnostic payment lookups, and the
// webhook audit trail (payment_events). Every write here is idempotent by
// dedupe_key — a replay is a true no-op, never a double-billed motion.

import { supabase } from "../supabase.js";

// No plan row = the starter defaults. A row exists only once a host upgrades
// or a concierge deal is cut, so the table stays tiny and honest.
export const STARTER_PLAN = Object.freeze({
  plan: "starter",
  ticketFeeBps: 250, // 2.5% of the ticket motion
  pullupFeeCents: 5, // $0.05/pull-up past the free tier
  pullupFreeMonthly: 500,
  feeCurrency: "usd",
  carePlan: null,
  byoSupabase: false,
});

export async function getPlanForHost(hostId) {
  if (!hostId) return { ...STARTER_PLAN };
  const { data } = await supabase
    .from("creator_billing_plans")
    .select("*")
    .eq("host_id", hostId)
    .maybeSingle();
  if (!data) return { ...STARTER_PLAN };
  return {
    plan: data.plan || STARTER_PLAN.plan,
    ticketFeeBps: data.ticket_fee_bps ?? STARTER_PLAN.ticketFeeBps,
    pullupFeeCents: data.pullup_fee_cents ?? STARTER_PLAN.pullupFeeCents,
    pullupFreeMonthly:
      data.pullup_free_monthly ?? STARTER_PLAN.pullupFreeMonthly,
    feeCurrency: data.fee_currency || STARTER_PLAN.feeCurrency,
    carePlan: data.care_plan || null,
    byoSupabase: !!data.byo_supabase,
  };
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

// How many of a motion this host has accrued since the 1st of the current
// month — the free-tier counter for pull-up metering.
export async function countMotionsThisMonth(hostId, motion) {
  if (!hostId) return 0;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("transaction_ledger")
    .select("id", { count: "exact", head: true })
    .eq("host_id", hostId)
    .eq("motion", motion)
    .gte("occurred_at", monthStart.toISOString());
  return count || 0;
}

// The host-facing month picture: motions counted, money moved, fees accrued
// (grouped by currency — a Nairobi+Stockholm host legitimately has both).
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
