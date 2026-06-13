// backend/src/services/billing/feeEngine.js
//
// THE business model as code: PullUp's fee is a function of MOTION (a ticket
// sold, a pull-up recorded), never a function of stored data. Pure math lives
// at the top (unit-testable, no IO); the meter* helpers below are the
// flag-gated, best-effort hooks the live paths call — they must NEVER throw
// into a request path.

import { meterMotion } from "../../repos/billing.js";
import { meteringEnabled } from "../../config/billing.js";

// ── Pure fee math ───────────────────────────────────────────────────────────
//
// PullUp earns on EXACTLY two things:
//   (1) a per-PAID-ticket transaction fee (computeTicketFee) — usage-based,
//       $0 on free tickets;
//   (2) a % markup on the creator's OWN Supabase storage tier
//       (computeStorageServiceFee) — the recurring "service on top of the
//       plug" line, dormant until the BYO graduation gives each creator a
//       billable Supabase project.
// Pull-ups and RSVPs are NEVER billed — they're counted (for the host's own
// scale dashboard) and that's all.

// Ticket fee in cents: basis points of the gross ticket motion.
// 250 bps = 2.5% — vs Eventbrite ~11% all-in; the fee IS the pitch.
export function computeTicketFee(amountCents, plan) {
  const bps = plan?.ticketFeeBps ?? 250;
  const amount = Number(amountCents) || 0;
  if (amount <= 0) return 0;
  return Math.round((amount * bps) / 10000);
}

// Storage service fee in cents: markup_bps of the creator's monthly Supabase
// bill. 3000 bps = 30% on top of what they already pay Supabase. The % is a
// cost-reflective proxy (server cost ∝ data+traffic ∝ their tier) and stays
// transparent because the creator already sees their Supabase invoice.
// storageTierCents is 0 until BYO, so this returns 0 today.
export function computeStorageServiceFee(storageTierCents, markupBps) {
  const cents = Number(storageTierCents) || 0;
  const bps = markupBps ?? 3000;
  if (cents <= 0) return 0;
  return Math.round((cents * bps) / 10000);
}

// The DPCS party math — same rules the legacy Stripe path applies, factored
// out so v2 and any future rail price a booking identically.
export function computePartySize(rsvp) {
  const wantsDinner = !!rsvp?.wantsDinner;
  const dinnerPartySize =
    rsvp?.dinnerPartySize !== null && rsvp?.dinnerPartySize !== undefined
      ? Number(rsvp.dinnerPartySize) || 0
      : 0;
  const plusOnes = Number(rsvp?.plusOnes) || 0;
  if (wantsDinner && dinnerPartySize > 0) return dinnerPartySize + plusOnes;
  return 1 + plusOnes;
}

// One booking, fully priced: what the guest pays, what the host receives,
// what PullUp earns. The service fee rides ON TOP (guest pays it) — the host
// receives the full ticket amount, exactly like the legacy path.
export function computeTicketAmounts({ event, rsvp, plan }) {
  const ticketPrice = Number(event?.ticketPrice);
  if (!ticketPrice || ticketPrice <= 0) throw new Error("invalid_ticket_price");
  const partySize = computePartySize(rsvp);
  const ticketAmount = ticketPrice * partySize;
  const feeAmount = computeTicketFee(ticketAmount, plan);
  return {
    partySize,
    ticketAmount,
    feeAmount,
    totalAmount: ticketAmount + feeAmount,
    currency: (event?.ticketCurrency || "usd").toLowerCase(),
  };
}

// ── Flag-gated live hooks (best-effort, never throw) ───────────────────────

// A pull-up happened — COUNT it (fee 0: pull-ups are never billed; the ledger
// row exists only so the host can see their own scale this month).
export async function meterPullup({ hostId, eventId, personId }) {
  if (!meteringEnabled()) return;
  try {
    await meterMotion({
      motion: "pullup",
      dedupeKey: `pullup:${eventId}:${personId}`,
      hostId,
      eventId,
      personId,
      feeCents: 0,
    });
  } catch (e) {
    console.error("[feeEngine] pullup metering failed (non-blocking):", e?.message);
  }
}

// An RSVP landed — meter the motion (fee 0: RSVPs are counted, never billed;
// the ledger still wants them for the host's month picture).
export async function meterRsvp({ hostId, eventId, personId, rsvpId }) {
  if (!meteringEnabled()) return;
  try {
    await meterMotion({
      motion: "rsvp",
      dedupeKey: `rsvp:${rsvpId}`,
      hostId,
      eventId,
      personId,
      rsvpId,
      feeCents: 0,
    });
  } catch (e) {
    console.error("[feeEngine] rsvp metering failed (non-blocking):", e?.message);
  }
}

// A ticket sale settled — meter the gross + the fee that was stamped on the
// payment at charge time (settlement passes it through; never recompute here,
// the guest already paid that exact fee).
export async function meterTicketSale({
  hostId,
  eventId,
  personId = null,
  rsvpId = null,
  paymentId,
  amountCents,
  feeCents,
  currency,
}) {
  if (!meteringEnabled()) return;
  try {
    await meterMotion({
      motion: "ticket_sale",
      dedupeKey: `ticket:${paymentId}`,
      hostId,
      eventId,
      personId,
      rsvpId,
      paymentId,
      amountCents,
      feeCents,
      currency,
    });
  } catch (e) {
    console.error("[feeEngine] ticket metering failed (non-blocking):", e?.message);
  }
}
