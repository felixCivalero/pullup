// backend/src/services/billing/feeEngine.js
//
// THE business model as code: PullUp's fee is a function of MOTION (a ticket
// sold, a pull-up recorded), never a function of stored data. Pure math lives
// at the top (unit-testable, no IO); the meter* helpers below are the
// flag-gated, best-effort hooks the live paths call — they must NEVER throw
// into a request path.

import {
  meterMotion,
  getPlanForHost,
  countMotionsThisMonth,
} from "../../repos/billing.js";
import { meteringEnabled } from "../../config/billing.js";

// ── Pure fee math ───────────────────────────────────────────────────────────

// Ticket fee in cents: basis points of the gross ticket motion.
// 250 bps = 2.5% — vs Eventbrite ~11% all-in; the fee IS the pitch.
export function computeTicketFee(amountCents, plan) {
  const bps = plan?.ticketFeeBps ?? 250;
  const amount = Number(amountCents) || 0;
  if (amount <= 0) return 0;
  return Math.round((amount * bps) / 10000);
}

// Pull-up fee in cents for the (n+1)th pull-up of the month: free inside the
// monthly tier, plan rate past it. Free events stay free at starter scale —
// the line incumbents structurally can't offer.
export function computePullupFee(monthCountSoFar, plan) {
  const free = plan?.pullupFreeMonthly ?? 500;
  if ((Number(monthCountSoFar) || 0) < free) return 0;
  return plan?.pullupFeeCents ?? 5;
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

// A pull-up happened — meter it. Fee respects the monthly free tier, priced
// in the PLAN's currency (the meter fee is PullUp revenue, not guest money).
export async function meterPullup({ hostId, eventId, personId }) {
  if (!meteringEnabled()) return;
  try {
    const plan = await getPlanForHost(hostId);
    const monthCount = await countMotionsThisMonth(hostId, "pullup");
    await meterMotion({
      motion: "pullup",
      dedupeKey: `pullup:${eventId}:${personId}`,
      hostId,
      eventId,
      personId,
      feeCents: computePullupFee(monthCount, plan),
      currency: plan.feeCurrency,
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
