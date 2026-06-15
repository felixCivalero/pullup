// backend/src/services/payments/settlement.js
//
// One settlement path for every non-card rail (M-Pesa, Swish, mock). Cards
// keep their existing /webhooks/stripe handler — this module is its sibling
// for v2 rails, doing the same four things in the same order:
//
//   1. flip the payment row (updatePayment also syncs rsvps.payment_status)
//   2. confirm the RSVP (PENDING_PAYMENT → CONFIRMED, attending)
//   3. send the confirmation email (paid guests get it on SETTLEMENT, not on
//      RSVP — exactly like the Stripe webhook)
//   4. meter the ticket_sale motion (flag-gated inside feeEngine)
//
// Idempotent at two layers: the webhook audit (payment_events dedupe) lets a
// retried callback short-circuit, and a payment already 'succeeded' is never
// re-settled.

import { findPaymentByProviderRef } from "../../repos/billing.js";
import { updatePayment, findRsvpById, updateRsvp, findEventById, findPersonById, getUserProfile } from "../../data.js";
import { meterTicketSale } from "../billing/feeEngine.js";
import { sendEmail } from "../emailService.js";
import { signupConfirmationEmail } from "../../emails/signupConfirmation.js";
import { getFrontendUrl } from "../../lib/urls.js";

// outcome: 'succeeded' | 'failed' | 'canceled'
export async function settleByProviderRef({ provider, providerRef, outcome, receipt = null }) {
  const payment = await findPaymentByProviderRef(provider, providerRef);
  if (!payment) return { ok: false, reason: "payment_not_found" };
  if (payment.status === "succeeded") return { ok: true, deduped: true };

  await updatePayment(payment.id, {
    status: outcome,
    ...(outcome === "succeeded" ? { paidAt: new Date().toISOString() } : {}),
    ...(receipt ? { receiptUrl: receipt } : {}),
  });

  if (outcome !== "succeeded") {
    // A failed/cancelled charge leaves the RSVP PENDING_PAYMENT — the guest
    // can retry on another rail; the stale-pending sweep is a later concern.
    return { ok: true, settled: "failed" };
  }

  // ── Confirm the booking ──────────────────────────────────────────────────
  let rsvp = null;
  let event = null;
  if (payment.rsvpId) {
    rsvp = await findRsvpById(payment.rsvpId);
    if (rsvp) {
      const isWaitlistPayment = rsvp.bookingStatus === "WAITLIST";
      await updateRsvp(
        payment.rsvpId,
        {
          bookingStatus: "CONFIRMED",
          status: "attending",
          paymentId: payment.id,
          paymentStatus: "paid",
        },
        // capacity was reserved at RSVP time for PENDING_PAYMENT; only a
        // waitlist upgrade needs the override — same rule as the Stripe hook
        { forceConfirm: isWaitlistPayment }
      );
    }
  }

  // ── Confirmation email (best-effort, never fails settlement) ────────────
  try {
    if (rsvp) {
      event = await findEventById(payment.eventId);
      const person = rsvp.personId ? await findPersonById(rsvp.personId) : null;
      const email = person?.email || rsvp.email;
      if (event && email) {
        let hostBrand = {};
        try {
          const hostProfile = await getUserProfile(event.hostId);
          hostBrand = {
            brandName: hostProfile?.brand || "",
            brandWebsite: hostProfile?.brandWebsite || "",
            contactEmail: hostProfile?.contactEmail || "",
          };
        } catch {}
        // A product purchase confirms a buy, not a spot — and carries a link
        // back to the gated delivery (download/secret/unlock served only after
        // this settlement). The buyer lands on /p/:slug?purchase=<rsvpId>.
        const isProduct = event.kind === "product";
        const productDeliveryUrl = isProduct
          ? `${getFrontendUrl()}/p/${event.slug}?purchase=${rsvp.id}`
          : "";
        await sendEmail({
          to: email,
          personId: rsvp.personId || null,
          hostProfileId: event.hostId || null,
          subject: isProduct ? "Your purchase is confirmed" : "Your spot is confirmed",
          html: signupConfirmationEmail({
            name: rsvp.name || person?.name || "there",
            eventTitle: event.title,
            date: new Date(event.startsAt).toLocaleString(),
            isWaitlist: false,
            imageUrl: event.coverImageUrl || event.imageUrl || "",
            location: event.location || "",
            locationLat: event.locationLat ?? null,
            locationLng: event.locationLng ?? null,
            showCoordinates: event.showCoordinates ?? false,
            startsAt: event.startsAt || "",
            endsAt: event.endsAt || "",
            timezone: event.timezone || "",
            plusOnes: Number(rsvp.plusOnes) || 0,
            slug: event.slug || "",
            eventId: event.id || "",
            frontendUrl: getFrontendUrl(),
            ticketPrice: event.ticketPrice ? (Number(event.ticketPrice) / 100).toFixed(2) : 0,
            ticketCurrency: event.ticketCurrency || "",
            productDeliveryUrl,
            productTitle: isProduct ? event.title : "",
            ...hostBrand,
            brand: event.brand
              ? {
                  background: event.brand.backgroundColor || null,
                  primaryColor: event.brand.buttonColor || null,
                }
              : {},
          }),
        });
      }
    }
  } catch (emailErr) {
    console.error("[settlement] confirmation email failed (non-blocking):", emailErr?.message);
  }

  // ── Meter the motion ─────────────────────────────────────────────────────
  await meterTicketSale({
    hostId: payment.hostId,
    eventId: payment.eventId,
    personId: rsvp?.personId || null,
    rsvpId: payment.rsvpId,
    paymentId: payment.id,
    amountCents: payment.metadata?.ticketAmount ?? payment.amount,
    feeCents: payment.metadata?.feeCents ?? 0,
    currency: payment.currency,
  });

  return { ok: true, settled: "succeeded" };
}
