// Phase A of the storage-markup revenue model.
//
// Once a day: for every live BYO creator, read their real usage via their
// Supabase Metrics API, price it into a continuous cost basis, persist it as
// creator_billing_plans.storage_tier_cents, and meter the month's 30% markup
// into transaction_ledger (accrual). The metering
// dedupe_key is 'storage:<host>:<YYYY-MM>', so the daily tick keeps each tier
// fresh for the billing UI but bills exactly once per month.
//
// Self-gated: a no-op unless BOTH BYO_SUPABASE_ENABLED and
// BILLING_METERING_ENABLED are on. Collection (charging the creator — a host
// Stripe subscription) is Phase B; Phase A only computes, persists, and accrues.

import { byoEnabled } from "../config/byo.js";
import { meteringEnabled } from "../config/billing.js";
import { listBillableCreatorDatabases } from "../repos/creatorDatabases.js";
import { getProjectUsage } from "../services/byo/projectUsage.js";
import { usageToCostCents } from "../services/billing/storageTiers.js";
import { meterStorageFee } from "../services/billing/feeEngine.js";
import { getPlanForHost, updateStorageTierCents } from "../repos/billing.js";

// UTC year-month, e.g. "2026-06". The metering dedupe bucket.
export function currentMonthKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

export async function runStorageBilling({ now = new Date() } = {}) {
  if (!byoEnabled() || !meteringEnabled()) return { skipped: true, reason: "disabled" };

  const monthKey = currentMonthKey(now);
  let creators = [];
  try {
    creators = await listBillableCreatorDatabases();
  } catch (e) {
    console.error("[storageBilling] could not list creators:", e?.message);
    return { ok: false, reason: "list_failed" };
  }

  let synced = 0;
  let metered = 0;
  let failed = 0;

  for (const c of creators) {
    try {
      // Read the creator's real usage via their Metrics API (best-effort — a
      // failure leaves the line at 0, never over-charges) → a continuous cost
      // basis → persist it.
      const usage = await getProjectUsage(c.projectRef, c.serviceKey);
      const cents = usageToCostCents({
        storedBytes: (usage?.dbBytes || 0) + (usage?.storageBytes || 0),
        egressBytes: usage?.egressBytes || 0,
      });
      await updateStorageTierCents(c.hostId, cents);
      synced++;

      const plan = await getPlanForHost(c.hostId);
      const res = await meterStorageFee({
        hostId: c.hostId,
        storageTierCents: cents,
        markupBps: plan.markupBps,
        currency: plan.feeCurrency,
        monthKey,
      });
      if (res?.ok && !res.deduped) metered++;
    } catch (e) {
      failed++;
      console.error(`[storageBilling] host ${c.hostId} failed (non-blocking):`, e?.message);
    }
  }

  return { ok: true, monthKey, creators: creators.length, synced, metered, failed };
}
