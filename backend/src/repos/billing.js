// backend/src/repos/billing.js
//
// The transaction layer's data: metered motions (transaction_ledger), per-host
// fee plans (creator_billing_plans), rail-agnostic payment lookups, and the
// webhook audit trail (payment_events). Every write here is idempotent by
// dedupe_key — a replay is a true no-op, never a double-billed motion.

import { supabase } from "../supabase.js";

// No plan row = the starter defaults. A row exists only once a host upgrades
// or a concierge deal is cut, so the table stays tiny and honest.
//
// Two revenue knobs, the ONLY two: ticketFeeBps (per paid ticket) and
// markupBps (the % on top of the creator's own Supabase storage tier).
// storageTierCents is what the creator pays Supabase that month — 0 until the
// BYO graduation gives them their own billable project, so the recurring line
// is dormant today.
export const STARTER_PLAN = Object.freeze({
  plan: "starter",
  ticketFeeBps: 250, // 2.5% of the ticket motion
  storageTierCents: 0, // their monthly Supabase bill (0 until BYO)
  markupBps: 3000, // 30% on top of that bill
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
    storageTierCents: data.storage_tier_cents ?? STARTER_PLAN.storageTierCents,
    markupBps: data.markup_bps ?? STARTER_PLAN.markupBps,
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

// The host-facing month picture: motions counted (scale, never billed), ticket
// money moved + ticket fees (grouped by currency — a Nairobi+Stockholm host
// legitimately has both), and the recurring storage service line.
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

  // The recurring line: PullUp's % on top of the creator's Supabase bill.
  // 0 today (storageTierCents is 0 until BYO); shape is ready for the panel.
  // (Inlined rather than importing feeEngine — that module imports this repo,
  // and the math is one line. Mirrors feeEngine.computeStorageServiceFee.)
  const storageFeeCents =
    plan.storageTierCents > 0
      ? Math.round((plan.storageTierCents * (plan.markupBps ?? 3000)) / 10000)
      : 0;
  const storageService = {
    tierCents: plan.storageTierCents,
    markupBps: plan.markupBps,
    feeCents: storageFeeCents,
    currency: plan.feeCurrency,
  };

  return {
    plan,
    month,
    storageService,
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
