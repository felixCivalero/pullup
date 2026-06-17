// Public RSVP submission — the platform's most critical write path.
// VIP tokens, waitlist upgrades, dinner slots, Stripe payments, confirmations.

import {
  findEventBySlug,
  addRsvp,
  findRsvpById,
  updateRsvp,
  deleteRsvp,
  createPayment,
  updatePayment,
  findPaymentById,
  getUserProfile,
  findVipInviteById,
  markVipInviteUsed,
} from "../data.js";
import { validateRsvpData } from "../middleware/validation.js";
import {
  getOrCreateStripeCustomer,
  createPaymentIntent,
  getStripeSecretKey,
} from "../stripe.js";
import { logger } from "../logger.js";
import { sendEmail } from "../services/emailService.js";
import {
  signupConfirmationEmail,
  reservationEmail,
} from "../emails/signupConfirmation.js";
import { verifyWaitlistToken } from "../utils/waitlistTokens.js";
import { normalisePhone } from "../utils/phone.js";
import { recordOptIn as recordPhoneOptIn } from "../whatsapp/repos/phoneOptInsRepo.js";
import { logPersonEvent } from "../services/personTimeline.js";
import { dispatch as dispatchMessage } from "../messaging/index.js";
import { getFrontendUrl } from "../lib/urls.js";
import { paymentsV2Enabled } from "../config/billing.js";
import { railsForEvent } from "../services/payments/index.js";
import { getPlanForHost } from "../repos/billing.js";
import { computeTicketAmounts, meterRsvp } from "../services/billing/feeEngine.js";

export function registerRsvpRoutes(app) {
// ---------------------------
// PUBLIC: RSVP
// ---------------------------
app.post("/events/:slug/rsvp", validateRsvpData, async (req, res) => {
  try {
    const { slug } = req.params;
    const {
      name,
      email,
      plusOnes = 0, // NEW: how many guests they bring (0–3)
      wantsDinner = false, // NEW: opt-in to dinner
      dinnerTimeSlot = null, // NEW: selected dinner time slot (ISO string)
      dinnerPartySize = null, // NEW: party size for dinner (can differ from event party size)
      waitlistRsvpId = null, // NEW: RSVP ID for waitlist upgrade
      waitlistToken = null, // NEW: JWT token for waitlist upgrade
      vipToken = null, // NEW: JWT token for VIP invite
      marketingOptIn = false, // NEW: opt-in to newsletter from RSVP form
      visitorId = null, // Links browsing session to RSVP
      joinWaitlist = false, // If true, join waitlist when event is full
      customAnswers = {}, // Answers to event-defined custom form fields
      phone = null, // NEW: optional phone for the WhatsApp rail
      whatsappOptIn = false, // NEW: consent to be reached on WhatsApp
      acquisitionSrc = null, // NEW: entry path (e.g. "ig_comment") from the signup link
      igRef = null, // NEW: the IG object (comment/media id) that drove the signup
      igUid = null, // NEW: the commenter's IGSID, to bind their IG identity
      instagram = null, // NEW: IG handle — verified (prefilled from an IG entry) or a typed claim
    } = req.body;

    if (!email && !vipToken) {
      return res.status(400).json({ error: "email is required" });
    }

    // Handle VIP invite flow
    let vipInvite = null;
    let vipDecoded = null;
    if (vipToken && !waitlistToken && !waitlistRsvpId) {
      try {
        vipDecoded = verifyWaitlistToken(vipToken);
        if (!vipDecoded || vipDecoded.type !== "vip_invite") {
          return res.status(400).json({ error: "Invalid VIP token" });
        }

        if (!vipDecoded.inviteId || !vipDecoded.eventId || !vipDecoded.email) {
          return res.status(400).json({ error: "Invalid VIP token structure" });
        }

        // Load event and ensure it matches slug + token
        const event = await findEventBySlug(slug);
        if (!event || event.id !== vipDecoded.eventId) {
          return res.status(400).json({
            error: "vip_event_mismatch",
            message: "VIP link is for a different event",
          });
        }

        // Load invite
        const invite = await findVipInviteById(vipDecoded.inviteId);
        if (!invite) {
          return res.status(404).json({ error: "VIP invite not found" });
        }

        if (
          invite.event_id !== event.id ||
          invite.email.toLowerCase() !==
            String(vipDecoded.email).toLowerCase()
        ) {
          return res.status(400).json({
            error: "vip_invite_mismatch",
            message: "VIP invite does not match this event or email",
          });
        }

        if (invite.used_at) {
          return res.status(400).json({
            error: "vip_invite_used",
            message: "This VIP link has already been used.",
          });
        }

        const expiresAt =
          invite.expires_at ||
          (vipDecoded.expiresAt && new Date(vipDecoded.expiresAt));
        if (expiresAt && new Date(expiresAt) < new Date()) {
          return res.status(400).json({
            error: "vip_invite_expired",
            message: "This VIP link has expired.",
          });
        }

        vipInvite = invite;
      } catch (tokenError) {
        return res.status(400).json({
          error: "Invalid or expired VIP token",
          message: tokenError.message,
        });
      }
    }

    const effectiveEmail = vipInvite ? vipInvite.email : email;

    // Enforce VIP max guests (server-side)
    if (vipInvite && typeof vipInvite.max_guests === "number") {
      const maxGuests =
        vipInvite.max_guests && vipInvite.max_guests > 0
          ? vipInvite.max_guests
          : 1;

      const plus = Number(plusOnes) || 0;
      let requestedPartySize = 1 + plus;

      if (
        wantsDinner &&
        dinnerPartySize !== null &&
        dinnerPartySize !== undefined
      ) {
        const parsedDinnerPartySize = Math.max(
          1,
          Math.floor(Number(dinnerPartySize) || 1)
        );
        requestedPartySize = parsedDinnerPartySize + plus;
      }

      if (requestedPartySize > maxGuests) {
        return res.status(400).json({
          error: "vip_max_guests_exceeded",
          message: `This VIP link allows up to ${maxGuests} guests in total.`,
        });
      }
    }

    // Handle waitlist upgrade flow
    let existingWaitlistRsvp = null;
    if (waitlistRsvpId && waitlistToken) {
      try {
        // Verify token
        const decoded = verifyWaitlistToken(waitlistToken);
        if (
          decoded.type !== "waitlist_offer" ||
          decoded.rsvpId !== waitlistRsvpId ||
          decoded.email?.toLowerCase() !== email.toLowerCase()
        ) {
          return res.status(400).json({
            error: "Invalid waitlist token",
            message: "Token does not match RSVP or email",
          });
        }

        // Fetch existing waitlist RSVP
        existingWaitlistRsvp = await findRsvpById(waitlistRsvpId);
        if (
          !existingWaitlistRsvp ||
          existingWaitlistRsvp.bookingStatus !== "WAITLIST" ||
          existingWaitlistRsvp.eventId !== decoded.eventId
        ) {
          return res.status(400).json({
            error: "Invalid waitlist RSVP",
            message: "RSVP is not on waitlist or does not match event",
          });
        }

        // Verify event matches slug
        const event = await findEventBySlug(slug);
        if (!event || event.id !== decoded.eventId) {
          return res.status(400).json({
            error: "Event mismatch",
            message: "Token is for a different event",
          });
        }

        // Validate that submitted name matches original (if provided)
        if (name && existingWaitlistRsvp.name) {
          const normalizedSubmitted = name.trim().toLowerCase();
          const normalizedOriginal = existingWaitlistRsvp.name
            .trim()
            .toLowerCase();
          if (normalizedSubmitted !== normalizedOriginal) {
            return res.status(400).json({
              error: "Name mismatch",
              message: "Name must match original waitlist request",
            });
          }
        }
      } catch (tokenError) {
        return res.status(400).json({
          error: "Invalid or expired token",
          message: tokenError.message,
        });
      }
    }

    // Validate custom form fields against event's required form fields
    let resolvedCustomAnswers = {};
    if (!existingWaitlistRsvp) {
      const eventForFields = await findEventBySlug(slug);
      const fields = Array.isArray(eventForFields?.formFields)
        ? eventForFields.formFields
        : [];
      const incoming =
        customAnswers && typeof customAnswers === "object" ? customAnswers : {};
      // The form is now fixed to name/email/WhatsApp/Instagram — hosts can no
      // longer add custom fields. We DON'T enforce required custom fields anymore
      // (a leftover required field from an old event would otherwise block every
      // RSVP, since the guest form no longer renders it). We still capture any
      // answers that happen to arrive, harmlessly, for legacy events.
      for (const f of fields) {
        if (!f || !f.id || f.id.startsWith("__")) continue;
        const val = incoming[f.id];
        const trimmed = typeof val === "string" ? val.trim() : "";
        if (trimmed) resolvedCustomAnswers[f.id] = trimmed.slice(0, 1000);
      }
      // Enrichment questions (mig 077) are the host's CURRENT free-text fields —
      // their ids live in enrichment_questions, NOT form_fields, so the loop above
      // skipped them and every answer was dropped (custom_answers stayed {}).
      // Capture them here too, keyed by question id.
      const enrichQs = Array.isArray(eventForFields?.enrichmentQuestions)
        ? eventForFields.enrichmentQuestions
        : [];
      for (const q of enrichQs) {
        if (!q || !q.id) continue;
        const val = incoming[q.id];
        const trimmed = typeof val === "string" ? val.trim() : "";
        if (trimmed) resolvedCustomAnswers[q.id] = trimmed.slice(0, 1000);
      }
      // Enforce host-required anchors server-side. Name + Email are validated
      // elsewhere; WhatsApp + Instagram are required only when the host opted in.
      // A verified IG entry (igUid present) satisfies the Instagram requirement.
      if (eventForFields?.collectPhone !== false && eventForFields?.requirePhone && !(phone && String(phone).trim())) {
        return res.status(400).json({ error: "missing_required_fields", message: "WhatsApp number is required", fields: ["phone"] });
      }
      if (eventForFields?.collectInstagram !== false && eventForFields?.requireInstagram && !igUid && !(instagram && String(instagram).trim())) {
        return res.status(400).json({ error: "missing_required_fields", message: "Instagram is required", fields: ["instagram"] });
      }
    }

    // For waitlist upgrades, use existing RSVP details (all fields locked)
    const rsvpData = existingWaitlistRsvp
      ? {
          slug,
          name: existingWaitlistRsvp.name,
          email: existingWaitlistRsvp.email,
          plusOnes: existingWaitlistRsvp.plusOnes || 0,
          wantsDinner: existingWaitlistRsvp.wantsDinner || false,
          dinnerTimeSlot: existingWaitlistRsvp.dinnerTimeSlot || null,
          dinnerPartySize: existingWaitlistRsvp.dinnerPartySize || null,
          marketingOptIn: marketingOptIn || false,
          isVip: !!vipInvite,
          visitorId: visitorId || null,
        }
      : {
          slug,
          name,
          email: effectiveEmail,
          plusOnes,
          wantsDinner,
          dinnerTimeSlot,
          dinnerPartySize,
          marketingOptIn: marketingOptIn || false,
          isVip: !!vipInvite,
          visitorId: visitorId || null,
          joinWaitlist: !!joinWaitlist,
          customAnswers: resolvedCustomAnswers,
        };

    const result = await addRsvp(rsvpData);

    // ── Guest WhatsApp capture (best-effort; never blocks the RSVP). ──
    // addRsvp() doesn't persist a phone, so do it here: store the number and
    // record consent. The frontend then fires /verify/phone/start, which now
    // resolves THIS person by phone and sets phone_verified_at on redeem — the
    // gate dispatch() needs before anything ships on WhatsApp.
    if (phone && result?.rsvp?.personId) {
      try {
        const { supabase } = await import("../supabase.js");
        const norm = normalisePhone(phone, result.event?.country || null);
        if (norm.ok) {
          const personId = result.rsvp.personId;
          // Don't clobber an already-stored (possibly verified) number.
          await supabase
            .from("people")
            .update({ phone_e164: norm.e164 })
            .eq("id", personId)
            .is("phone_e164", null);
          // The form only collects a phone on WhatsApp/both events, so a phone
          // here is consent to the WhatsApp rail. Verification confirms it.
          await recordPhoneOptIn({
            phoneE164: norm.e164,
            channel: "whatsapp",
            source: "rsvp_form",
            personId,
            hostProfileId: result.event?.hostId || null,
            legalBasis: "consent",
            ipAddress: req.ip || null,
            userAgent: req.get?.("user-agent") || null,
            gdprPayload: { eventSlug: slug, whatsappOptIn: !!whatsappOptIn },
          }).catch((e) => console.error("[rsvp] recordPhoneOptIn failed:", e?.message));
        }
      } catch (e) {
        console.error("[rsvp] whatsapp capture error:", e?.message);
      }
    }

    // Acquisition stamping: when the signup came from an Instagram comment link
    // (?src=ig_comment&ig_ref=<commentId>&ig_uid=<igsid>), record how this person
    // entered the world + bind their IG identity. Only fills empties — never
    // overwrites a known channel. Best-effort; never blocks the RSVP.
    if (acquisitionSrc && result?.rsvp?.personId) {
      try {
        const { supabase } = await import("../supabase.js");
        const VALID_SRC = new Set(["ig_comment", "ig_dm", "ig_story_link", "direct", "whatsapp", "email"]);
        const channel = VALID_SRC.has(String(acquisitionSrc)) ? String(acquisitionSrc) : null;
        if (channel) {
          const patch = { acquisition_channel: channel };
          if (igRef) patch.acquisition_ref = String(igRef).slice(0, 120);
          await supabase
            .from("people")
            .update(patch)
            .eq("id", result.rsvp.personId)
            .is("acquisition_channel", null);
          // Bind the IG identity if we got one and it isn't set yet.
          if (igUid) {
            await supabase
              .from("people")
              .update({ ig_user_id: String(igUid).slice(0, 64) })
              .eq("id", result.rsvp.personId)
              .is("ig_user_id", null);
          }
        }
      } catch (e) {
        console.error("[rsvp] acquisition stamp error:", e?.message);
      }
    }

    // Instagram handle: store as people.instagram (display/claim). When the
    // signup carried a verified IGSID (igUid, from an IG entry), the hard
    // identity is already bound above; this is the human-readable handle. When
    // it's a typed handle with no igUid, it's an UNVERIFIED claim — a seed that
    // a later DM/comment can reconcile, never a hard match key. Only fills empty.
    if (instagram && result?.rsvp?.personId) {
      try {
        const { supabase } = await import("../supabase.js");
        const handle = String(instagram).trim().replace(/^@+/, "").slice(0, 64);
        if (handle) {
          await supabase
            .from("people")
            .update({ instagram: handle })
            .eq("id", result.rsvp.personId)
            .is("instagram", null);
        }
      } catch (e) {
        console.error("[rsvp] instagram stamp error:", e?.message);
      }
    }

    // ── Identity spine: record THIS RSVP's identifiers in person_identities. ──
    // The atom must be identity-resolved, not email-siloed: an RSVP carries an
    // email (the selection key, unchanged) PLUS a phone and/or IG handle. We link
    // all of them to the RSVP's person so a later WhatsApp/IG touch resolves to
    // the SAME human instead of forking a duplicate. Person SELECTION is untouched
    // (still email via addRsvp); a phone/IG already owned by someone else is
    // FLAGGED as a merge candidate, never auto-merged (typed = a soft claim).
    // Also captures the rsvp source profile. Best-effort; never blocks the RSVP.
    if (result?.rsvp?.personId && !result.error) {
      try {
        const { linkIdentitiesToPerson } = await import("../services/personResolution.js");
        const normEmail = email ? String(email).trim().toLowerCase() : null;
        const pn = phone ? normalisePhone(phone, result.event?.country || null) : null;
        const e164 = pn?.ok ? pn.e164 : null;
        const igHandle = instagram ? String(instagram).trim().replace(/^@+/, "").slice(0, 64) : null;
        const igUserId = igUid ? String(igUid).slice(0, 64) : null;
        await linkIdentitiesToPerson({
          personId: result.rsvp.personId,
          identifiers: { email: normEmail, phone: e164, igUserId, igHandle },
          profile: { name: name || null, email: normEmail, phone_e164: e164, instagram: igHandle, ig_user_id: igUserId },
          source: "rsvp",
        });
      } catch (e) {
        console.error("[rsvp] identity link error:", e?.message);
      }
    }

    // ── Append to the append-only person timeline (the Room reads this). ──
    // THE spine: without this, a live RSVP never shows in the person's Room —
    // only the one-time backfill ever populated it. Best-effort (never blocks
    // the RSVP); dedupeKey makes a re-submit a no-op instead of a duplicate row.
    if (result?.rsvp?.personId && !result.error) {
      const isWaitlist =
        result.rsvp.bookingStatus === "WAITLIST" ||
        result.rsvp.status === "waitlist";
      const evTitle = result.event?.title || "an event";
      await logPersonEvent({
        personId: result.rsvp.personId,
        hostId: result.event?.hostId || null,
        eventId: result.rsvp.eventId || result.event?.id || null,
        type: isWaitlist ? "waitlist_join" : "rsvp",
        channel: "web",
        body: isWaitlist
          ? `Joined the waitlist for ${evTitle}`
          : `RSVP'd to ${evTitle}`,
        metadata: { event_title: evTitle, source: "rsvp_endpoint" },
        dedupeKey: `rsvp:${result.rsvp.id}`,
      });
    }

    const isEventPaid =
      result.event?.ticketType === "paid" && result.event?.ticketPrice;
    const isVipFreeEntry =
      !!vipInvite && vipInvite.free_entry === true && isEventPaid;

    // Mark VIP invite as used immediately for free-entry or non-paid events
    if (
      vipInvite &&
      result.rsvp &&
      !existingWaitlistRsvp &&
      (!isEventPaid || isVipFreeEntry)
    ) {
      try {
        await markVipInviteUsed(vipInvite.id, result.rsvp.id);
      } catch (err) {
        console.error("[VIP] Failed to mark invite as used:", err);
      }
    }

    if (result.error === "not_found") {
      return res.status(404).json({ error: "Event not found" });
    }

    if (result.error === "invalid_email") {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (result.error === "duplicate") {
      // Special handling for waitlist upgrade flow
      if (existingWaitlistRsvp && waitlistRsvpId && waitlistToken) {
        // This is a waitlist link - verify the RSVP is still WAITLIST
        if (result.rsvp && result.rsvp.id === existingWaitlistRsvp.id) {
          // Check if RSVP is still WAITLIST (required for waitlist upgrade)
          if (result.rsvp.bookingStatus !== "WAITLIST") {
            return res.status(400).json({
              error: "rsvp_already_confirmed",
              message:
                "This RSVP has already been confirmed. You cannot use this waitlist link.",
              rsvp: result.rsvp,
            });
          }

          // RSVP is WAITLIST - use it and proceed to payment
          result.rsvp = existingWaitlistRsvp;

          // Ensure event is loaded (might not be set from addRsvp duplicate response)
          if (!result.event) {
            result.event = await findEventBySlug(slug);
          }

          if (!result.event) {
            return res.status(404).json({
              error: "event_not_found",
              message: "Event not found",
            });
          }

          console.log("[Waitlist Payment] Waitlist upgrade validated:", {
            rsvpId: result.rsvp.id,
            rsvpStatus: result.rsvp.bookingStatus,
            eventId: result.event.id,
            eventTicketType: result.event.ticketType,
            eventTicketPrice: result.event.ticketPrice,
          });

          // For waitlist upgrades, we MUST proceed to payment (don't return duplicate error)
          // The payment creation logic below will handle it
        } else {
          // RSVP ID mismatch - shouldn't happen if token is valid
          return res.status(400).json({
            error: "rsvp_mismatch",
            message: "RSVP does not match waitlist link",
          });
        }
      }

      // For paid events, if RSVP exists but payment is unpaid/pending, allow proceeding to payment
      // OR if this is a waitlist upgrade (existingWaitlistRsvp exists and RSVP is WAITLIST)
      const isWaitlistUpgrade =
        existingWaitlistRsvp &&
        waitlistRsvpId &&
        waitlistToken &&
        result.rsvp?.bookingStatus === "WAITLIST";

      // Also handle PENDING_PAYMENT RSVPs (user started payment flow but didn't complete)
      const isPendingPaymentRsvp =
        result.rsvp?.bookingStatus === "PENDING_PAYMENT";

      if (
        !isVipFreeEntry &&
        result.event?.ticketType === "paid" &&
        result.event?.ticketPrice &&
        (isWaitlistUpgrade || // Waitlist upgrade - always allow if RSVP is WAITLIST
          isPendingPaymentRsvp || // User returning to complete payment
          (result.rsvp?.paymentStatus &&
            (result.rsvp.paymentStatus === "unpaid" ||
              result.rsvp.paymentStatus === "pending")))
      ) {
        // Check if payment already exists for this RSVP
        let existingPayment = null;
        if (result.rsvp.paymentId) {
          try {
            existingPayment = await findPaymentById(result.rsvp.paymentId);
          } catch (err) {
            console.error("Error finding existing payment:", err);
          }
        }

        // If existing payment is still pending, try to reuse its PaymentIntent
        if (existingPayment && existingPayment.status === "pending" && existingPayment.stripePaymentIntentId) {
          try {
            const Stripe = (await import("stripe")).default;
            const stripe = new Stripe(getStripeSecretKey());
            const existingPI = await stripe.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);

            // If the PaymentIntent is still usable, return it directly
            if (existingPI.status === "requires_payment_method" || existingPI.status === "requires_confirmation") {
              console.log("[Payment] Reusing existing PaymentIntent:", {
                paymentIntentId: existingPI.id,
                status: existingPI.status,
                rsvpId: result.rsvp.id,
              });

              return res.json({
                event: result.event,
                rsvp: result.rsvp,
                payment: existingPayment,
                stripe: {
                  clientSecret: existingPI.client_secret,
                  paymentId: existingPayment.id,
                },
                paymentBreakdown: {
                  ticketAmount: existingPayment.amount - Math.round(existingPayment.amount * (parseFloat(process.env.TEST_PLATFORM_FEE_PERCENTAGE || process.env.PLATFORM_FEE_PERCENTAGE || "3") / 100 / (1 + parseFloat(process.env.TEST_PLATFORM_FEE_PERCENTAGE || process.env.PLATFORM_FEE_PERCENTAGE || "3") / 100))),
                  platformFeeAmount: Math.round(existingPayment.amount * (parseFloat(process.env.TEST_PLATFORM_FEE_PERCENTAGE || process.env.PLATFORM_FEE_PERCENTAGE || "3") / 100 / (1 + parseFloat(process.env.TEST_PLATFORM_FEE_PERCENTAGE || process.env.PLATFORM_FEE_PERCENTAGE || "3") / 100))),
                  customerTotalAmount: existingPayment.amount,
                  platformFeePercentage: parseFloat(process.env.TEST_PLATFORM_FEE_PERCENTAGE || process.env.PLATFORM_FEE_PERCENTAGE || "3"),
                },
                statusDetails: {
                  bookingStatus: result.rsvp.bookingStatus,
                },
              });
            }
            // PaymentIntent is no longer usable (cancelled, succeeded, etc.) - create a new one
            console.log("[Payment] Existing PaymentIntent not reusable:", existingPI.status);
          } catch (piError) {
            console.warn("[Payment] Could not retrieve existing PaymentIntent:", piError.message);
            // Fall through to create a new one
          }
        }

        // If no payment exists or payment is failed/unusable, create new payment
        if (
          !existingPayment ||
          existingPayment.status === "pending" ||
          existingPayment.status === "failed"
        ) {
          try {
            // Load host profile to get connected account ID
            const hostProfile = await getUserProfile(result.event.hostId);
            const connectedAccountId =
              hostProfile?.stripeConnectedAccountId || null;

            console.log("[Waitlist Payment] Payment creation check:", {
              isWaitlistUpgrade,
              hasConnectedAccount: !!connectedAccountId,
              eventId: result.event?.id,
              eventTicketType: result.event?.ticketType,
              eventTicketPrice: result.event?.ticketPrice,
              rsvpId: result.rsvp?.id,
              rsvpBookingStatus: result.rsvp?.bookingStatus,
            });

            if (connectedAccountId) {
              // Get or create Stripe customer
              const customerId = await getOrCreateStripeCustomer(
                result.rsvp.email,
                result.rsvp.name
              );

              // Calculate amounts
              // For waitlist upgrades, ensure partySize is calculated correctly using DPCS
              // partySize = dinnerPartySize (includes booker) + plusOnes (cocktails-only) if dinner selected
              // partySize = 1 (booker) + plusOnes (cocktails-only) if no dinner
              let partySize = Number(result.rsvp.partySize) || 1;

              // Recalculate partySize using DPCS to ensure correctness
              const wantsDinner = result.rsvp.wantsDinner || false;
              // Handle null/undefined dinnerPartySize - convert to 0 if not a valid number
              const dinnerPartySize =
                result.rsvp.dinnerPartySize !== null &&
                result.rsvp.dinnerPartySize !== undefined
                  ? Number(result.rsvp.dinnerPartySize) || 0
                  : 0;
              const plusOnes = Number(result.rsvp.plusOnes) || 0;

              console.log("[Waitlist Payment] RSVP values:", {
                storedPartySize: result.rsvp.partySize,
                wantsDinner,
                dinnerPartySize,
                plusOnes,
                rawDinnerPartySize: result.rsvp.dinnerPartySize,
                rawPlusOnes: result.rsvp.plusOnes,
                rsvpId: result.rsvp.id,
                rsvpData: {
                  wantsDinner: result.rsvp.wantsDinner,
                  dinnerPartySize: result.rsvp.dinnerPartySize,
                  plusOnes: result.rsvp.plusOnes,
                  partySize: result.rsvp.partySize,
                },
              });

              if (wantsDinner && dinnerPartySize > 0) {
                // Dinner selected: partySize = dinnerPartySize (includes booker) + plusOnes
                partySize = dinnerPartySize + plusOnes;
              } else {
                // No dinner: partySize = 1 (booker) + plusOnes
                partySize = 1 + plusOnes;
              }

              const ticketPrice = Number(result.event.ticketPrice);
              if (!ticketPrice || ticketPrice <= 0) {
                throw new Error("Invalid ticket price");
              }
              const ticketAmount = ticketPrice * partySize;

              console.log("[Waitlist Payment] Price calculation:", {
                calculatedPartySize: partySize,
                ticketPrice,
                ticketAmount,
                platformFeePercentage:
                  parseFloat(
                    process.env.TEST_PLATFORM_FEE_PERCENTAGE ||
                      process.env.PLATFORM_FEE_PERCENTAGE ||
                      "3"
                  ) / 100,
              });

              const platformFeePercentage =
                parseFloat(
                  process.env.TEST_PLATFORM_FEE_PERCENTAGE ||
                    process.env.PLATFORM_FEE_PERCENTAGE ||
                    "3"
                ) / 100;
              const platformFeeAmount = Math.round(
                ticketAmount * platformFeePercentage
              );
              const customerTotalAmount = ticketAmount + platformFeeAmount;

              // Create PaymentIntent
              const currency = (
                result.event.ticketCurrency || "usd"
              ).toLowerCase();
              const paymentIntent = await createPaymentIntent({
                customerId,
                amount: customerTotalAmount,
                eventId: result.event.id,
                eventTitle: result.event.title,
                personId: result.rsvp.personId,
                connectedAccountId,
                applicationFeeAmount: platformFeeAmount,
                currency,
              });

              // Create or update payment record
              let payment;
              if (existingPayment) {
                // Update existing payment
                const updateResult = await updatePayment(existingPayment.id, {
                  stripePaymentIntentId: paymentIntent.id,
                  status: "pending",
                });
                payment = updateResult.payment;
              } else {
                // Create new payment for waitlist upgrade
                // Mark in description that this is a waitlist upgrade
                console.log(
                  "[Waitlist Payment] Creating payment for waitlist RSVP:",
                  {
                    rsvpId: result.rsvp.id,
                    rsvpBookingStatus: result.rsvp.bookingStatus,
                    isWaitlistUpgrade: !!existingWaitlistRsvp,
                  }
                );

                payment = await createPayment({
                  userId: result.event.hostId,
                  eventId: result.event.id,
                  rsvpId: result.rsvp.id, // CRITICAL: Link payment to waitlist RSVP
                  stripePaymentIntentId: paymentIntent.id,
                  stripeCustomerId: customerId,
                  amount: customerTotalAmount,
                  currency,
                  status: "pending",
                  description: `Ticket${
                    partySize > 1 ? `s (${partySize}x)` : ""
                  } for ${result.event.title} (Waitlist Upgrade)`,
                });
              }

              // Update RSVP with payment ID
              await updateRsvp(result.rsvp.id, {
                paymentId: payment.id,
                paymentStatus: "pending",
              });

              return res.json({
                event: result.event,
                rsvp: {
                  ...result.rsvp,
                  paymentId: payment.id,
                  paymentStatus: "pending",
                },
                payment,
                stripe: {
                  clientSecret: paymentIntent.client_secret,
                  paymentId: payment.id,
                },
                paymentBreakdown: {
                  ticketAmount,
                  platformFeeAmount,
                  customerTotalAmount,
                  platformFeePercentage: platformFeePercentage * 100,
                },
                statusDetails: {
                  bookingStatus:
                    result.rsvp.bookingStatus ||
                    result.rsvp.status === "attending"
                      ? "CONFIRMED"
                      : "WAITLIST",
                  dinnerBookingStatus:
                    result.rsvp.dinner?.bookingStatus ||
                    (result.rsvp.dinnerStatus === "confirmed"
                      ? "CONFIRMED"
                      : result.rsvp.dinnerStatus === "waitlist"
                      ? "WAITLIST"
                      : null),
                  wantsDinner:
                    result.rsvp.dinner?.enabled || result.rsvp.wantsDinner,
                },
              });
            } else {
              // No connected account - this shouldn't happen for paid events
              console.error("[Waitlist Payment] No Stripe connected account:", {
                eventId: result.event?.id,
                hostId: result.event?.hostId,
                isWaitlistUpgrade,
                eventTicketType: result.event?.ticketType,
                eventTicketPrice: result.event?.ticketPrice,
              });

              // For waitlist upgrades, return a specific error
              if (isWaitlistUpgrade) {
                return res.status(400).json({
                  error: "waitlist_upgrade_failed",
                  message:
                    "Event host has not connected their Stripe account. Please contact the event organizer.",
                  rsvp: result.rsvp,
                });
              }
              // For normal duplicates, fall through to duplicate error
            }
          } catch (paymentError) {
            console.error(
              "Error creating payment for existing RSVP:",
              paymentError
            );

            // For waitlist upgrades, return specific error instead of generic duplicate
            if (isWaitlistUpgrade) {
              return res.status(400).json({
                error: "waitlist_upgrade_failed",
                message: `Unable to create payment: ${paymentError.message}`,
                rsvp: result.rsvp,
              });
            }
            // Fall through to return duplicate error if payment creation fails
          }
        } else {
          // Payment already exists and is succeeded - for waitlist upgrades, this is an error
          if (isWaitlistUpgrade) {
            return res.status(400).json({
              error: "payment_already_succeeded",
              message:
                "Payment for this waitlist upgrade has already been completed.",
              rsvp: result.rsvp,
              payment: existingPayment,
            });
          }
        }
      } else {
        // Not a paid event or conditions not met
        console.log("[Waitlist Payment] Payment conditions not met:", {
          isWaitlistUpgrade,
          eventTicketType: result.event?.ticketType,
          eventTicketPrice: result.event?.ticketPrice,
          rsvpPaymentStatus: result.rsvp?.paymentStatus,
        });

        // For waitlist upgrades, this shouldn't happen - event should be paid
        if (isWaitlistUpgrade) {
          return res.status(400).json({
            error: "waitlist_upgrade_failed",
            message:
              "This event is not configured for payments. Please contact support.",
            rsvp: result.rsvp,
          });
        }
      }

      // Return duplicate error for free events or if payment creation failed
      // BUT: If this is a waitlist upgrade, don't return duplicate error - we should have handled it above
      if (existingWaitlistRsvp && waitlistRsvpId && waitlistToken) {
        // This shouldn't happen if logic above is correct, but handle it gracefully
        return res.status(400).json({
          error: "waitlist_upgrade_failed",
          message:
            "Unable to process waitlist upgrade. Please contact support.",
          rsvp: result.rsvp,
        });
      }

      return res.status(409).json({
        error: "duplicate",
        message: "You've already RSVP'd to this event",
        status: result.rsvp.status,
        rsvp: result.rsvp,
      });
    }

    if (result.error === "full") {
      return res.status(409).json({
        error: "full",
        event: result.event,
      });
    }

    if (result.error === "capacity_exceeded") {
      return res.status(409).json({
        error: "capacity_exceeded",
        event: result.event,
      });
    }

    if (result.error === "invalid_slot") {
      return res.status(400).json({
        error: "invalid_slot",
        message: result.message || "Invalid dinner time slot",
      });
    }

    if (result.error === "database_error") {
      return res.status(500).json({
        error: "database_error",
        message: result.message || "Failed to create RSVP",
      });
    }

    // If this is a paid event and the host has a connected Stripe account,
    // automatically create a PaymentIntent + payment record for this RSVP.
    // BUT: Skip payment creation if RSVP is on waitlist (they'll pay later via waitlist link)
    let stripePayment = null;
    let stripeClientSecret = null;

    // Check if RSVP is on waitlist
    const isWaitlistRsvp =
      result.rsvp.bookingStatus === "WAITLIST" ||
      result.rsvp.status === "waitlist";

    // ── PAYMENTS V2 (flag-gated): the rail-agnostic checkout ──────────────
    // No charge is created at RSVP time. The RSVP stays PENDING_PAYMENT and
    // the response tells the frontend which rails this event takes (Swish /
    // M-Pesa / card / mock by currency + host readiness); the guest picks one
    // and POST /public/rsvps/:id/charge fires the actual charge. Flag off →
    // this block is dead and the legacy inline-Stripe path below runs verbatim.
    let paymentV2 = null;
    if (
      paymentsV2Enabled() &&
      !isVipFreeEntry &&
      result.event?.ticketType === "paid" &&
      result.event?.ticketPrice &&
      result.event?.hostId &&
      !isWaitlistRsvp
    ) {
      try {
        const [plan, hostProfileForRails] = await Promise.all([
          getPlanForHost(result.event.hostId),
          getUserProfile(result.event.hostId),
        ]);
        const rails = railsForEvent({
          event: result.event,
          hostProfile: hostProfileForRails,
        });
        if (rails.length === 0) {
          // Same money-hole guard as the legacy path: a paid event with no
          // way to pay must not silently confirm.
          try {
            await deleteRsvp(result.rsvp.id);
          } catch (deleteError) {
            console.error("Error deleting RSVP after no-rails:", deleteError);
          }
          return res.status(503).json({
            error: "payments_unavailable",
            message:
              "This event can't accept payments right now. Please reach out to the host.",
          });
        }
        const amounts = computeTicketAmounts({
          event: result.event,
          rsvp: result.rsvp,
          plan,
        });
        paymentV2 = {
          required: true,
          rsvpId: result.rsvp.id,
          eventId: result.event.id,
          rails,
          amount: amounts.totalAmount,
          currency: amounts.currency,
          breakdown: {
            ticketAmount: amounts.ticketAmount,
            platformFeeAmount: amounts.feeAmount,
            customerTotalAmount: amounts.totalAmount,
            partySize: amounts.partySize,
          },
        };
        result.paymentBreakdown = paymentV2.breakdown;
      } catch (v2Error) {
        console.error("[rsvp] payments v2 pricing failed:", v2Error);
        try {
          await deleteRsvp(result.rsvp.id);
        } catch (deleteError) {
          console.error("Error deleting RSVP after v2 failure:", deleteError);
        }
        return res.status(500).json({
          error: "payment_failed",
          message: v2Error.message || "Failed to prepare payment. Please try again.",
        });
      }
    }

    try {
      if (
        !paymentsV2Enabled() &&
        !isVipFreeEntry &&
        result.event?.ticketType === "paid" &&
        result.event?.ticketPrice &&
        result.event?.hostId &&
        !isWaitlistRsvp // Only create payment if NOT on waitlist
      ) {
        // Load host profile to get connected account ID
        const hostProfile = await getUserProfile(result.event.hostId);
        const connectedAccountId =
          hostProfile?.stripeConnectedAccountId || null;

        if (connectedAccountId) {
          // Get or create Stripe customer based on RSVP email
          const customerId = await getOrCreateStripeCustomer(
            result.rsvp.email,
            result.rsvp.name
          );

          // Calculate ticket amount (what host receives): ticket price per person * party size
          // Use DPCS to ensure correct party size calculation
          let partySize = Number(result.rsvp.partySize) || 1;

          // Recalculate partySize using DPCS to ensure correctness
          const wantsDinner = result.rsvp.wantsDinner || false;
          // Handle null/undefined dinnerPartySize - convert to 0 if not a valid number
          const dinnerPartySize =
            result.rsvp.dinnerPartySize !== null &&
            result.rsvp.dinnerPartySize !== undefined
              ? Number(result.rsvp.dinnerPartySize) || 0
              : 0;
          const plusOnes = Number(result.rsvp.plusOnes) || 0;

          console.log("[Payment] RSVP values:", {
            storedPartySize: result.rsvp.partySize,
            wantsDinner,
            dinnerPartySize,
            plusOnes,
            rawDinnerPartySize: result.rsvp.dinnerPartySize,
            rawPlusOnes: result.rsvp.plusOnes,
            rsvpId: result.rsvp.id,
            rsvpData: {
              wantsDinner: result.rsvp.wantsDinner,
              dinnerPartySize: result.rsvp.dinnerPartySize,
              plusOnes: result.rsvp.plusOnes,
              partySize: result.rsvp.partySize,
            },
          });

          if (wantsDinner && dinnerPartySize > 0) {
            // Dinner selected: partySize = dinnerPartySize (includes booker) + plusOnes
            partySize = dinnerPartySize + plusOnes;
          } else {
            // No dinner: partySize = 1 (booker) + plusOnes
            partySize = 1 + plusOnes;
          }

          const ticketPrice = Number(result.event.ticketPrice);
          if (!ticketPrice || ticketPrice <= 0) {
            throw new Error("Invalid ticket price");
          }
          const ticketAmount = ticketPrice * partySize;

          console.log("[Payment] Price calculation:", {
            calculatedPartySize: partySize,
            ticketPrice,
            ticketAmount,
          });

          // Calculate platform service fee (paid by customer, not deducted from host)
          // Platform fee percentage from environment variable (default: 3%)
          // In development, prefer TEST_ prefixed, fallback to regular
          const platformFeePercentage =
            parseFloat(
              process.env.TEST_PLATFORM_FEE_PERCENTAGE ||
                process.env.PLATFORM_FEE_PERCENTAGE ||
                "3"
            ) / 100;
          const platformFeeAmount = Math.round(
            ticketAmount * platformFeePercentage
          );

          // Customer pays: ticket amount + platform service fee
          const customerTotalAmount = ticketAmount + platformFeeAmount;

          console.log("[Payment] Platform fee calculation:", {
            ticketAmount,
            platformFeePercentage: `${(platformFeePercentage * 100).toFixed(
              1
            )}%`,
            platformFeeAmount,
            customerTotalAmount,
            amountToHost: ticketAmount, // Host receives full ticket amount
          });

          // Create PaymentIntent routed to host's connected account
          const currency = (result.event.ticketCurrency || "usd").toLowerCase();
          const paymentIntent = await createPaymentIntent({
            customerId,
            amount: customerTotalAmount, // Customer pays ticket + service fee
            eventId: result.event.id,
            eventTitle: result.event.title,
            personId: result.rsvp.personId,
            connectedAccountId,
            applicationFeeAmount: platformFeeAmount, // Platform fee (customer pays this)
            currency,
          });

          // Persist payment record in Supabase and link to RSVP
          // Store customer total amount (what they pay)
          const payment = await createPayment({
            // Payments are owned by the host (auth user),
            // attendees are linked via rsvpId.
            userId: result.event.hostId,
            eventId: result.event.id,
            rsvpId: result.rsvp.id,
            stripePaymentIntentId: paymentIntent.id,
            stripeCustomerId: customerId,
            amount: customerTotalAmount, // Customer pays: ticket + service fee
            currency: (result.event.ticketCurrency || "usd").toLowerCase(),
            status: "pending",
            description: `Ticket${
              partySize > 1 ? `s (${partySize}x)` : ""
            } for ${result.event.title}`,
          });

          stripePayment = payment;
          stripeClientSecret = paymentIntent.client_secret;

          // Include fee breakdown in response for frontend display
          result.paymentBreakdown = {
            ticketAmount,
            platformFeeAmount,
            customerTotalAmount,
            platformFeePercentage: platformFeePercentage * 100,
          };
        } else {
          // Paid event but the host never connected a Stripe account.
          // Without this guard the RSVP silently succeeds and the guest gets a
          // "spot confirmed" email for a ticket they never paid for (money hole).
          // Roll back the RSVP and surface a clear error instead.
          console.error(
            "[Payment] Paid event has no connected Stripe account — blocking RSVP",
            { eventId: result.event.id, hostId: result.event.hostId }
          );
          try {
            await deleteRsvp(result.rsvp.id);
          } catch (deleteError) {
            console.error(
              "Error deleting RSVP after missing payment account:",
              deleteError
            );
          }
          return res.status(503).json({
            error: "payments_unavailable",
            message:
              "This event can't accept payments right now. Please reach out to the host.",
          });
        }
      }
    } catch (paymentError) {
      console.error("Error creating Stripe payment for RSVP:", paymentError);

      // For paid events, payment creation failure should block the RSVP
      // BUT: If RSVP is on waitlist, don't block (they'll pay later via waitlist link)
      if (
        result.event.ticketType === "paid" &&
        result.event.ticketPrice > 0 &&
        !isWaitlistRsvp
      ) {
        // Rollback: delete the RSVP that was created
        try {
          await deleteRsvp(result.rsvp.id);
        } catch (deleteError) {
          console.error(
            "Error deleting RSVP after payment failure:",
            deleteError
          );
        }

        // Return error to frontend
        return res.status(500).json({
          error: "payment_failed",
          message:
            paymentError.message ||
            "Failed to create payment. Please try again.",
          details: paymentError.raw?.message || paymentError.message,
        });
      }

      // For free events, don't block the RSVP on payment issues
      // (This shouldn't happen for free events, but just in case)
    }

    // Send confirmation email — but NOT for paid events with pending payment.
    // For paid events, the confirmation email is sent from the webhook
    // handler once payment_intent.succeeded fires.
    const isPendingPayment =
      result.rsvp.bookingStatus === "PENDING_PAYMENT" ||
      (stripeClientSecret && stripePayment);

    // The unification spine: every RSVP'er becomes a real (passwordless)
    // Supabase account, linked to their people row — so they're one tap from
    // hosting later, and the rooms can key off a real session instead of a
    // typed email. Best-effort: an auth hiccup must NEVER fail the RSVP.
    try {
      const { ensureAccountForPerson } = await import("../services/account.js");
      await ensureAccountForPerson({
        personId: result.rsvp.personId || null,
        email: result.rsvp.email || name,
        name: result.rsvp.name || name || null,
      });
    } catch (acctErr) {
      logger?.warn?.("[rsvp] account ensure failed (non-blocking)", { error: acctErr?.message });
    }

    // Fetch host branding for email footers
    let hostBrand = {};
    try {
      const hostProfile = await getUserProfile(result.event.hostId);
      hostBrand = {
        brandName: hostProfile?.brand || "",
        brandWebsite: hostProfile?.brandWebsite || "",
        contactEmail: hostProfile?.contactEmail || "",
      };
    } catch {}

    if (!isPendingPayment) {
      try {
        const { supabase } = await import("../supabase.js");
        const isWaitlistEmail =
          result.rsvp.bookingStatus === "WAITLIST" ||
          result.rsvp.status === "waitlist";

        // Resolve the person record so the channel router can decide
        // WA vs email per recipient (phone_verified + opt-in => WA).
        let recipientPerson = null;
        if (result.rsvp.personId) {
          const { data: p } = await supabase
            .from("people")
            .select("id, email, phone_e164, phone_verified_at, do_not_contact, ig_user_id")
            .eq("id", result.rsvp.personId)
            .maybeSingle();
          recipientPerson = p;
        }
        const recipient = recipientPerson || {
          id: null,
          email: result.rsvp.email,
          phone_e164: null,
          phone_verified_at: null,
        };

        // Fetch the full host profile (we already have brand bits; need
        // whatsapp_enabled + whatsapp_signature too).
        const hostProfileFull = await getUserProfile(result.event.hostId);

        const friendlyDate = (() => {
          try {
            const d = new Date(result.event.startsAt);
            return d.toLocaleString("en-US", {
              weekday: "long",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
          } catch {
            return new Date(result.event.startsAt).toLocaleString();
          }
        })();

        const firstName = (result.rsvp.name || name || "").split(/\s+/)[0] || "there";
        const hostSig =
          hostProfileFull?.whatsappSignature ||
          (hostProfileFull?.name
            ? `It's me, ${hostProfileFull.name.split(/\s+/)[0]}`
            : "");

        // ── WhatsApp is KING ──────────────────────────────────────────
        // The confirmation rides the channel the HOST required, not just
        // whatever happens to be available:
        //   • WhatsApp required → WhatsApp. The rich rsvp_confirm template
        //     goes straight to the number they just gave + consented to. We
        //     don't wait on the async phone-verify (a magic link the guest
        //     taps later) — that gates account linking, not a transactional
        //     confirm to a freshly opted-in number.
        //   • email only        → email.
        //   • WhatsApp required but the send fails / no number / host has WA
        //     off → email floor ("…then email").
        // Waitlist always emails (there's no rsvp_confirm template for it).
        const { data: evReq } = await supabase
          .from("events")
          .select("require_phone")
          .eq("id", result.event.id)
          .maybeSingle();
        const waKing =
          !isWaitlistEmail &&
          !!evReq?.require_phone &&
          !!recipient.phone_e164 &&
          hostProfileFull?.whatsapp_enabled !== false &&
          !recipient.do_not_contact;

        let confirmedViaWhatsApp = false;
        if (waKing) {
          try {
            const { sendTemplate } = await import("../whatsapp/index.js");
            await sendTemplate({
              to: recipient.phone_e164,
              templateKey: "rsvp_confirm",
              variables: {
                guest_first_name: firstName,
                event_title: result.event.title || "the event",
                event_when: friendlyDate,
                host_signature: hostSig || "PullUp",
              },
              personId: result.rsvp.personId || null,
              hostProfileId: result.event.hostId || null,
              legalBasis: "consent",
            });
            confirmedViaWhatsApp = true;
          } catch (waErr) {
            logger?.warn?.(
              "[rsvp] WhatsApp-king confirm failed — falling back to email",
              { error: waErr?.message, rsvpId: result.rsvp.id }
            );
          }
        }

        // Room key: the email's Room link signs the guest straight in (they
        // have an account but no session — without this they'd hit a login
        // wall at the Room door). Best-effort; plain link is the fallback.
        let roomKeyUrl = "";
        if (!isWaitlistEmail && result.event?.id) {
          try {
            const { mintRoomKey } = await import("../services/roomKeys.js");
            const rawKey = await mintRoomKey({ email, eventId: result.event.id, personId: result.rsvp.personId || null });
            if (rawKey) roomKeyUrl = `${getFrontendUrl().replace(/\/$/, "")}/api/k/${rawKey}`;
          } catch (e) {
            console.error("[rsvp] room key mint error:", e?.message);
          }
        }

        if (!confirmedViaWhatsApp) await dispatchMessage({
          recipient,
          hostProfile: hostProfileFull,
          // WhatsApp already had its shot above when it was the required
          // channel; here we are the email floor (email-only events, or a
          // king send that failed). Don't double-ride WhatsApp.
          whatsapp: null,
          email: {
            subject: isWaitlistEmail
              ? "You’re on the waitlist"
              : "Your spot is confirmed",
            htmlBody: signupConfirmationEmail({
              name: result.rsvp.name || name,
              eventTitle: result.event.title,
              date: new Date(result.event.startsAt).toLocaleString(),
              isWaitlist: isWaitlistEmail,
              imageUrl: result.event.coverImageUrl || result.event.imageUrl || "",
              location: result.event.location || "",
              locationLat: result.event.locationLat ?? null,
              locationLng: result.event.locationLng ?? null,
              showCoordinates: result.event.showCoordinates ?? false,
              startsAt: result.event.startsAt || "",
              endsAt: result.event.endsAt || "",
              timezone: result.event.timezone || "",
              plusOnes: Number(result.rsvp.plusOnes) || 0,
              slug: result.event.slug || "",
              eventId: result.event.id || "",
              frontendUrl: getFrontendUrl(),
              roomKeyUrl,
              spotifyUrl: result.event.spotify || "",
              ticketPrice: result.event.ticketPrice ? (Number(result.event.ticketPrice) / 100).toFixed(2) : 0,
              ticketCurrency: result.event.ticketCurrency || "",
              hideDate: result.event.hideDate || false,
              hideLocation: result.event.hideLocation || false,
              dateRevealHint: result.event.dateRevealHint || "",
              revealHint: result.event.revealHint || "",
              ...hostBrand,
            }),
          },
          context: {
            personId: result.rsvp.personId || null,
            hostProfileId: result.event.hostId || null,
          },
        });

        // ── RSVP → Instagram DM trigger (additive; IG-only, never email) ──
        // If the host wired a "When someone RSVPs → DM" trigger on this event,
        // AND this guest came in through Instagram (we hold their IGSID, bound
        // at RSVP) AND their 24h IG window is open, drop the DM right in the
        // thread they started in. Closed window / no IGSID → silent no-op:
        // sendInstagramDM() never falls through to email, so it can't double
        // the confirmation that already went out above. Confirmed RSVPs only.
        if (!isWaitlistEmail && recipient.ig_user_id && result.rsvp.personId) {
          try {
            const ectRepo = await import("../instagram/repos/eventCommentTriggersRepo.js");
            const rsvpTrigger = await ectRepo.getRsvpTriggerForEvent(result.event.id);
            if (rsvpTrigger?.isLive && rsvpTrigger.replyText) {
              const slug = result.event.slug || "";
              const eventLink = slug ? `${(getFrontendUrl() || "https://pullup.se").replace(/\/$/, "")}/e/${slug}` : "";
              const dmText = eventLink ? `${rsvpTrigger.replyText}\n${eventLink}` : rsvpTrigger.replyText;
              const { sendInstagramDM } = await import("../messaging/dispatch.js");
              const r = await sendInstagramDM({
                recipient,
                text: dmText,
                humanComposed: false, // automated → limited to the 24h standard window
                personId: result.rsvp.personId,
                hostProfileId: result.event.hostId || null,
              });
              if (r?.sent) {
                const { logPersonEvent } = await import("../services/personTimeline.js");
                await logPersonEvent({
                  personId: result.rsvp.personId,
                  hostId: result.event.hostId || null,
                  type: "message_out",
                  channel: "instagram",
                  direction: "out",
                  body: dmText,
                  dedupeKey: `rsvp_dm:${result.rsvp.id}`,
                  metadata: { source: "rsvp_dm_trigger", triggerId: rsvpTrigger.id, eventId: result.event.id },
                }).catch(() => {});
                logger?.info?.("[rsvp] Instagram RSVP-DM sent", { rsvpId: result.rsvp.id, personId: result.rsvp.personId });
              } else {
                logger?.info?.("[rsvp] Instagram RSVP-DM skipped", { rsvpId: result.rsvp.id, reasons: r?.reasons });
              }
            }
          } catch (igErr) {
            logger?.warn?.("[rsvp] Instagram RSVP-DM trigger failed (non-blocking)", { error: igErr?.message, rsvpId: result.rsvp.id });
          }
        }
      } catch (emailErr) {
        logger?.error?.("Failed to send signup confirmation email", {
          error: emailErr?.message,
          rsvpId: result.rsvp.id,
        });
        // Don’t block the RSVP on email failure
      }
    } else {
      // Send reservation email for paid events with pending payment
      try {
        await sendEmail({
          to: result.rsvp.email,
          personId: result.rsvp.personId || null,
          hostProfileId: result.event.hostId || null,
          subject: "Your spot is reserved",
          html: reservationEmail({
            name: result.rsvp.name || name,
            eventTitle: result.event.title,
            imageUrl: result.event.coverImageUrl || result.event.imageUrl || "",
            location: result.event.location || "",
            locationLat: result.event.locationLat ?? null,
            locationLng: result.event.locationLng ?? null,
            showCoordinates: result.event.showCoordinates ?? false,
            startsAt: result.event.startsAt || "",
            endsAt: result.event.endsAt || "",
            timezone: result.event.timezone || "",
            plusOnes: Number(result.rsvp.plusOnes) || 0,
            slug: result.event.slug || "",
            frontendUrl: getFrontendUrl(),
            holdMinutes: 30,
            hideDate: result.event.hideDate || false,
            hideLocation: result.event.hideLocation || false,
            dateRevealHint: result.event.dateRevealHint || "",
            revealHint: result.event.revealHint || "",
            ...hostBrand,
          }),
        });
      } catch (emailErr) {
        logger?.error?.("Failed to send reservation email", {
          error: emailErr?.message,
          rsvpId: result.rsvp.id,
        });
      }
    }

    // The RSVP agreement checkbox is the guest's acceptance of our terms +
    // privacy policy — it is NOT consent to PullUp's own marketing. We
    // deliberately do NOT enrol RSVP guests into PullUp's newsletter list
    // (`newsletter_subscriptions`) here: PullUp is a separate data controller
    // and its own newsletter requires its own explicit opt-in (the dedicated
    // newsletter signup). Bundling that into a mandatory RSVP checkbox is not
    // valid GDPR consent and would mean a host's guests get PullUp marketing
    // they never asked for.
    //
    // The host, by contrast, is the controller of their own guest list and may
    // contact their attendees about their future events under legitimate
    // interest (occasional + relevant, one-click unsubscribe in every email).
    // We record that contactability on the host-scoped people row so the
    // host's CRM audience reflects it — this is a legitimate-interest marker,
    // not GDPR consent. Sending never depends on this flag (the campaign
    // sender's sendableOnly only drops no-email / unsubscribed / suppressed).
    if (marketingOptIn === true && result.rsvp?.email) {
      try {
        const { supabase } = await import("../supabase.js");
        const rsvpEmail = result.rsvp.email.trim().toLowerCase();
        const rsvpNow = new Date().toISOString();

        await supabase
          .from("people")
          .update({
            marketing_consent: true,
            marketing_consent_at: rsvpNow,
          })
          .eq("email", rsvpEmail)
          .is("marketing_consent", null);
        await supabase
          .from("people")
          .update({
            marketing_consent: true,
            marketing_consent_at: rsvpNow,
          })
          .eq("email", rsvpEmail)
          .eq("marketing_consent", false);
      } catch (nlErr) {
        console.error("[rsvp] Failed to update guest contactability:", nlErr);
        // Don't block the RSVP on this.
      }
    }

    // Meter the RSVP motion on the transaction ledger (flag-gated inside,
    // fire-and-forget — billing must never delay the guest's confirmation).
    meterRsvp({
      hostId: result.event.hostId,
      eventId: result.event.id,
      personId: result.rsvp.personId || null,
      rsvpId: result.rsvp.id,
    }).catch(() => {});

    // Return detailed RSVP information including status details
    res.status(201).json({
      event: result.event,
      rsvp: result.rsvp,
      payment: stripePayment,
      paymentV2, // rail-agnostic checkout descriptor (null unless flag on + paid event)
      paymentBreakdown: result.paymentBreakdown || null, // Fee breakdown for frontend display
      stripe:
        stripeClientSecret && stripePayment
          ? {
              clientSecret: stripeClientSecret,
              paymentId: stripePayment.id,
            }
          : null,
      statusDetails: {
        bookingStatus:
          result.rsvp.bookingStatus ||
          (result.rsvp.status === "attending" ? "CONFIRMED" : "WAITLIST"), // "CONFIRMED" | "WAITLIST"
        dinnerBookingStatus:
          result.rsvp.dinner?.bookingStatus ||
          (result.rsvp.dinnerStatus === "confirmed"
            ? "CONFIRMED"
            : result.rsvp.dinnerStatus === "waitlist"
            ? "WAITLIST"
            : null), // "CONFIRMED" | "WAITLIST" | null
        wantsDinner: result.rsvp.dinner?.enabled || result.rsvp.wantsDinner,
        // Backward compatibility
        cocktailStatus: result.rsvp.status,
        dinnerStatus: result.rsvp.dinnerStatus,
      },
    });
  } catch (error) {
    console.error("Error creating RSVP:", error);
    res.status(500).json({ error: "Failed to create RSVP" });
  }
});

}
