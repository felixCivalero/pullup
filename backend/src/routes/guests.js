// Host guest management: guest list (+CSV export), public dinner time slots,
// and RSVP mutations (update / delete / promote / promote-bulk / cancel).

import {
  findEventById,
  findEventBySlug,
  getRsvpsForEvent,
  generateDinnerTimeSlots,
  getDinnerSlotCounts,
  findRsvpById,
  updateRsvp,
  deleteRsvp,
  getUserProfile,
  canEditGuests,
  canCheckIn,
  getEventHostRole,
  findPersonById,
} from "../data.js";
import { isCheckinOnlyUpdate } from "./checkinFields.js";
import { requireAuth } from "../middleware/auth.js";
import { validateRsvpUpdateData } from "../middleware/validation.js";
import { getFrontendUrl } from "../lib/urls.js";
import { cancellationEmail } from "../emails/signupConfirmation.js";
import { emitIntent, sourceFromRequest } from "../services/intentLog.js";
import { dispatch as dispatchMessage } from "../messaging/index.js";
import { supabase } from "../supabase.js";

// A paid event must never SILENTLY give away a seat: promoting a waitlister
// there requires an explicit comp acknowledgment (else steer to the payment
// link). Free events promote as before.
function isPaidEvent(event) {
  return event?.ticketType === "paid" || Number(event?.ticketPrice) > 0;
}

export function registerGuestRoutes(app) {
  app.get("/host/events/:id/guests", requireAuth, async (req, res) => {
    try {
      const event = await findEventById(req.params.id);
      if (!event) return res.status(404).json({ error: "Event not found" });

      // One permission read: getEventHostRole returns null for non-hosts (it
      // already calls isUserEventHost internally), replacing the previous double
      // lookup (isUserEventHost + getEventHostRole).
      const myRole = await getEventHostRole(req.user.id, event.id);
      if (!myRole) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have access to this event",
        });
      }
      if (myRole === "analytics" || myRole === "viewer") {
        return res.status(403).json({
          error: "Forbidden",
          message: "Your role does not have access to guest data",
        });
      }

      const guests = await getRsvpsForEvent(event.id);

      // Attach per-guest comms receipts (which automated emails reached them) so
      // the guest list can show the host the automation actually fired.
      try {
        const { getCommsReceiptsForEvent } = await import("../services/commsReceipts.js");
        const receipts = await getCommsReceiptsForEvent(
          event.id,
          guests.map((g) => g.personId).filter(Boolean)
        );
        for (const g of guests) g.comms = (g.personId && receipts[g.personId]) || {};
      } catch (commsErr) {
        console.error("[guests] comms receipts failed (non-blocking):", commsErr?.message);
      }

      res.json({ event: { ...event, myRole }, guests });
    } catch (error) {
      console.error("Error fetching guests:", error);
      res.status(500).json({ error: "Failed to fetch guests" });
    }
  });

  // ---------------------------
  // PROTECTED: Export event guests as CSV
  // ---------------------------
  app.get("/host/events/:id/guests/export", requireAuth, async (req, res) => {
    try {
      const event = await findEventById(req.params.id);
      if (!event) return res.status(404).json({ error: "Event not found" });

      // Single permission read (getEventHostRole → null for non-hosts).
      const myRole = await getEventHostRole(req.user.id, event.id);
      if (!myRole) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have access to this event",
        });
      }
      if (myRole === "analytics" || myRole === "viewer") {
        return res.status(403).json({
          error: "Forbidden",
          message: "Your role does not have access to guest data",
        });
      }

      const guests = await getRsvpsForEvent(event.id);

      // Identity columns the host opted to collect on this event's form.
      // Order follows event.formFields so the CSV mirrors the signup form.
      // Each entry: { header, accessor: guest => value }.
      const IDENTITY_FIELD_TO_GUEST_KEY = {
        instagram: "instagram",
        twitter: "twitter",
        tiktok: "tiktok",
        linkedin: "linkedin",
        company: "company",
        birthday: "birthday",
        phone: "phone",
      };
      const identityColumns = (event.formFields || [])
        .map((f) => {
          const type = String(f?.type || "").toLowerCase();
          const key = IDENTITY_FIELD_TO_GUEST_KEY[type];
          if (!key) return null;
          return {
            type,
            header: f.label || type.charAt(0).toUpperCase() + type.slice(1),
            accessor: (guest) => guest[key] || "",
          };
        })
        .filter(Boolean);

      // The modern signup form is toggle-driven (collect_*), not formFields-driven,
      // so handles the host opted to collect via a toggle won't have a formFields
      // entry above. Append a column for each collected handle that isn't already
      // present, so the CSV matches what the form actually asked for.
      const presentTypes = new Set(identityColumns.map((c) => c.type));
      const toggleColumns = [];
      if (event.collectInstagram !== false && !presentTypes.has("instagram")) {
        toggleColumns.push({ header: "Instagram", accessor: (g) => g.instagram || "" });
      }
      if (event.collectTiktok === true && !presentTypes.has("tiktok")) {
        toggleColumns.push({ header: "TikTok", accessor: (g) => g.tiktok || "" });
      }
      identityColumns.push(...toggleColumns);

      // Free-text answers live per-RSVP in rsvps.custom_answers, keyed by the
      // question's id. Two id namespaces feed this: enrichment questions
      // (event.enrichmentQuestions, "q_..." ids) — what the live guest form uses
      // — and legacy custom form fields (event.formFields type "custom", "ff_..."
      // ids). Historically the export only read formFields, so enrichment answers
      // (e.g. an "Allergier" question) came out blank. Build one column per id
      // from BOTH sets, then sweep any orphan keys left by renamed/removed
      // questions so no submitted answer is silently dropped from the CSV.
      const answerColumnsById = new Map(); // id -> header (insertion order = column order)
      for (const q of event.enrichmentQuestions || []) {
        if (q?.id && !answerColumnsById.has(q.id)) {
          answerColumnsById.set(q.id, q.label || "Answer");
        }
      }
      for (const f of event.formFields || []) {
        if (
          String(f?.type || "").toLowerCase() === "custom" &&
          f?.id &&
          !answerColumnsById.has(f.id)
        ) {
          answerColumnsById.set(f.id, f.label || "Custom");
        }
      }
      for (const guest of guests) {
        for (const key of Object.keys(guest.customAnswers || {})) {
          if (!answerColumnsById.has(key)) answerColumnsById.set(key, key);
        }
      }
      const customColumns = [...answerColumnsById.entries()]
        .map(([id, header]) => ({
          header,
          accessor: (guest) => (guest.customAnswers || {})[id] || "",
        }))
        // Drop questions nobody on this event answered (incl. stale duplicate
        // definitions) so the CSV doesn't carry confusing all-blank columns.
        .filter((col) => guests.some((guest) => col.accessor(guest)));

      // CSV header
      const headers = [
        "Name",
        "Email",
        "Booking Status",
        "Party Size",
        "Plus Ones",
        "Wants Dinner",
        "Dinner Party Size",
        "Dinner Time Slot",
        "Dinner Status",
        "Dinner Pull Up Count",
        "Cocktails Pull Up Count",
        "RSVP Date",
        ...identityColumns.map((c) => c.header),
        ...customColumns.map((c) => c.header),
      ];

      // CSV rows
      const rows = guests.map((guest) => {
        const escapeCsv = (value) => {
          if (value === null || value === undefined) return "";
          const str = String(value);
          // If contains comma, quote, or newline, wrap in quotes and escape quotes
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        const formatDate = (dateString) => {
          if (!dateString) return "";
          return new Date(dateString).toLocaleString("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
        };

        return [
          escapeCsv(guest.name),
          escapeCsv(guest.email),
          escapeCsv(guest.bookingStatus || guest.status || ""),
          escapeCsv(guest.partySize || ""),
          escapeCsv(guest.plusOnes || 0),
          escapeCsv(guest.wantsDinner ? "Yes" : "No"),
          escapeCsv(guest.dinnerPartySize || guest.dinner?.partySize || ""),
          escapeCsv(
            guest.dinnerTimeSlot || guest.dinner?.slotTime
              ? formatDate(guest.dinnerTimeSlot || guest.dinner?.slotTime)
              : ""
          ),
          escapeCsv(
            guest.dinner?.bookingStatus ||
              (guest.dinnerStatus === "confirmed"
                ? "CONFIRMED"
                : guest.dinnerStatus === "waitlist"
                ? "WAITLIST"
                : "")
          ),
          escapeCsv(guest.dinnerPullUpCount || 0),
          escapeCsv(guest.cocktailOnlyPullUpCount || 0),
          escapeCsv(guest.createdAt ? formatDate(guest.createdAt) : ""),
          ...identityColumns.map((c) => escapeCsv(c.accessor(guest))),
          ...customColumns.map((c) => escapeCsv(c.accessor(guest))),
        ].join(",");
      });

      // UTF-8 BOM so Excel (and phone previews) decode å/ä/ö correctly —
      // without it Excel guesses a legacy codepage and mangles non-ASCII names.
      // Google Sheets ignores the BOM, so one file works everywhere.
      const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");

      // Set headers for CSV download
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="event-guests-${event.slug || event.id}-${
          new Date().toISOString().split("T")[0]
        }.csv"`
      );
      res.send(csv);
    } catch (error) {
      console.error("Error exporting guests:", error);
      res.status(500).json({ error: "Failed to export guests data" });
    }
  });

  // ---------------------------
  // PUBLIC: Get dinner time slots for event
  // ---------------------------
  app.get("/events/:slug/dinner-slots", async (req, res) => {
    try {
      const { slug } = req.params;
      const event = await findEventBySlug(slug);

      if (!event) return res.status(404).json({ error: "Event not found" });

      if (!event.dinnerEnabled) {
        return res.json({ slots: [], slotCounts: {} });
      }

      const slots = generateDinnerTimeSlots(event);
      const slotCounts = await getDinnerSlotCounts(event.id);

      // Enrich slots with availability info
      const enrichedSlots = slots.map((slotTime) => {
        // Look up per-slot configuration if available
        let configuredCapacity = null;
        let maxGuestsPerBooking = null;
        if (Array.isArray(event.dinnerSlots) && event.dinnerSlots.length > 0) {
          const match = event.dinnerSlots.find((slot) => {
            if (!slot) return false;
            const slotValue =
              typeof slot === "string" ? slot : slot.time || null;
            if (!slotValue) return false;
            try {
              return new Date(slotValue).getTime() === new Date(slotTime).getTime();
            } catch {
              return false;
            }
          });
          if (match && typeof match === "object") {
            if (typeof match.capacity === "number") {
              configuredCapacity = match.capacity;
            }
            if (typeof match.maxGuestsPerBooking === "number") {
              maxGuestsPerBooking = match.maxGuestsPerBooking;
            }
          }
        }

        const counts = slotCounts[slotTime] || { confirmed: 0, waitlist: 0 };
        const slotCapacity =
          configuredCapacity != null
            ? configuredCapacity
            : event.dinnerMaxSeatsPerSlot ?? null;
        const available =
          !slotCapacity || counts.confirmed < slotCapacity;
        const remaining = slotCapacity
          ? Math.max(0, slotCapacity - counts.confirmed)
          : null;

        return {
          time: slotTime,
          capacity: slotCapacity,
          maxGuestsPerBooking,
          available,
          remaining,
          confirmed: counts.confirmed,
          waitlist: counts.waitlist,
        };
      });

      res.json({
        slots: enrichedSlots,
        maxSeatsPerSlot: event.dinnerMaxSeatsPerSlot,
      });
    } catch (error) {
      console.error("Error fetching dinner slots:", error);
      res.status(500).json({ error: "Failed to fetch dinner slots" });
    }
  });

  // ---------------------------
  // PROTECTED: Update RSVP (requires auth, verifies ownership)
  // ---------------------------
  app.put(
    "/host/events/:eventId/rsvps/:rsvpId",
    requireAuth,
    validateRsvpUpdateData,
    async (req, res) => {
      try {
        const { eventId, rsvpId } = req.params;
        const event = await findEventById(eventId);
        if (!event) return res.status(404).json({ error: "Event not found" });

        // A check-in (pull-up counts only) needs the lighter canCheckIn so
        // reception / room curators can pull people up; any field that edits the
        // guest record (rename, move, cancel, party size, answers) still needs
        // full canEditGuests rights.
        const checkinOnly = isCheckinOnlyUpdate(req.body);
        const allowed = checkinOnly
          ? await canCheckIn(req.user.id, event.id)
          : await canEditGuests(req.user.id, event.id);
        if (!allowed) {
          return res.status(403).json({
            error: "Forbidden",
            message: "You don't have permission to edit guests for this event.",
          });
        }

        const rsvp = await findRsvpById(rsvpId);
        if (!rsvp || rsvp.eventId !== eventId) {
          return res.status(404).json({ error: "RSVP not found" });
        }

        const {
          name,
          email,
          plusOnes,
          bookingStatus,
          status, // Backward compatibility
          wantsDinner,
          dinnerTimeSlot,
          "dinner.slotTime": dinnerSlotTime,
          dinnerPartySize,
          "dinner.bookingStatus": dinnerBookingStatus,
          dinnerPullUpCount,
          cocktailOnlyPullUpCount,
          pulledUpForDinner, // Backward compatibility
          pulledUpForCocktails, // Backward compatibility
          forceConfirm, // Admin override flag
          customAnswers, // Host-edited enrichment answers (service-desk edit)
        } = req.body;

        // BUSINESS RULE: Cannot move paid/confirmed guests to waitlist
        // If guest has paid and is confirmed, they cannot be moved to waitlist
        // This would require a refund, which is a separate process
        const isPaidEvent = event.ticketType === "paid";
        const isPaidAndConfirmed =
          isPaidEvent &&
          rsvp.paymentStatus === "paid" &&
          rsvp.bookingStatus === "CONFIRMED";
        const tryingToMoveToWaitlist =
          (bookingStatus === "WAITLIST" || (status && status === "waitlist")) &&
          rsvp.bookingStatus === "CONFIRMED";

        if (isPaidAndConfirmed && tryingToMoveToWaitlist) {
          return res.status(400).json({
            error: "cannot_move_paid_guest_to_waitlist",
            message:
              "Cannot move a paid and confirmed guest to waitlist. This would require a refund. Please process a refund first if you need to remove this guest.",
          });
        }

        const result = await updateRsvp(
          rsvpId,
          {
            name,
            email,
            plusOnes,
            bookingStatus,
            status, // Backward compatibility
            wantsDinner,
            dinnerTimeSlot: dinnerTimeSlot || dinnerSlotTime,
            "dinner.slotTime": dinnerSlotTime,
            dinnerPartySize,
            "dinner.bookingStatus": dinnerBookingStatus,
            dinnerPullUpCount,
            cocktailOnlyPullUpCount,
            pulledUpForDinner, // Backward compatibility
            pulledUpForCocktails, // Backward compatibility
            customAnswers, // gated in mapRsvpToDb (!== undefined), so a normal edit
                           // that omits it never wipes the stored answers
          },
          { forceConfirm: !!forceConfirm }
        );

        if (result.error === "not_found") {
          return res.status(404).json({ error: "RSVP not found" });
        }

        if (result.error === "invalid_email") {
          return res.status(400).json({ error: "Invalid email format" });
        }

        if (result.error === "full") {
          return res.status(409).json({
            error: "full",
            message: "Event is full and waitlist is disabled",
          });
        }

        if (result.error === "database_error") {
          return res.status(500).json({
            error: "database_error",
            message: result.message || "Failed to update RSVP",
          });
        }

        emitIntent({
          hostId: req.user.id,
          tool: "update_rsvp",
          args: { eventId: req.params.eventId, rsvpId: req.params.rsvpId, ...req.body },
          source: sourceFromRequest(req),
          target: { type: "rsvp", id: req.params.rsvpId },
          result: { status: result.rsvp?.status },
        });

        res.json(result.rsvp);
      } catch (error) {
        console.error("Error updating RSVP:", error);
        res.status(500).json({ error: "Failed to update RSVP" });
      }
    }
  );

  // ---------------------------
  // PROTECTED: Delete RSVP (requires auth, verifies ownership)
  // ---------------------------
  app.delete(
    "/host/events/:eventId/rsvps/:rsvpId",
    requireAuth,
    async (req, res) => {
      try {
        const { eventId, rsvpId } = req.params;
        const event = await findEventById(eventId);
        if (!event) return res.status(404).json({ error: "Event not found" });

        // Only owner, admin, or editor can delete RSVPs
        const canEdit = await canEditGuests(req.user.id, event.id);
        if (!canEdit) {
          return res.status(403).json({
            error: "Forbidden",
            message: "You don't have permission to edit guests for this event.",
          });
        }

        const rsvp = await findRsvpById(rsvpId);
        if (!rsvp || rsvp.eventId !== eventId) {
          return res.status(404).json({ error: "RSVP not found" });
        }

        // Get person email before deletion
        const person = await findPersonById(rsvp.personId);

        const result = await deleteRsvp(rsvpId);

        if (result.error === "not_found") {
          return res.status(404).json({ error: "RSVP not found" });
        }

        if (result.error === "database_error") {
          return res.status(500).json({
            error: "database_error",
            message: result.message || "Failed to delete RSVP",
          });
        }

        // Send cancellation email to guest
        if (person?.email) {
          try {
            const cancelHost = await getUserProfile(event.hostId).catch(() => null);
            const cancelSig =
              cancelHost?.whatsappSignature ||
              (cancelHost?.name ? `It's me, ${cancelHost.name.split(/\s+/)[0]}` : "");
            await dispatchMessage({
              recipient: {
                id: person.id || null,
                email: person.email,
                phone_e164: person.phone_e164 || null,
                phone_verified_at: person.phone_verified_at || null,
                do_not_contact: person.do_not_contact || false,
              },
              hostProfile: cancelHost,
              whatsapp: {
                templateKey: "booking_cancelled",
                variables: {
                  guest_first_name: (rsvp.name || person.name || "there").split(/\s+/)[0] || "there",
                  event_title: event.title || "the event",
                  host_signature: cancelSig || "PullUp",
                },
              },
              email: {
                subject: "Your booking has been cancelled",
                htmlBody: cancellationEmail({
                  name: rsvp.name || person.name || "there",
                  eventTitle: event.title,
                  imageUrl: event.coverImageUrl || event.imageUrl || "",
                  slug: event.slug || "",
                  frontendUrl: getFrontendUrl(),
                  brandName: cancelHost?.brand || "",
                  brandWebsite: cancelHost?.brandWebsite || "",
                  contactEmail: cancelHost?.contactEmail || "",
                }),
              },
              context: {
                personId: person.id || null,
                hostProfileId: event.hostId || null,
                idempotencyKey: `cancel-${rsvp.id}`,
              },
            });
          } catch (emailErr) {
            console.error("Failed to send cancellation email:", emailErr);
          }
        }

        res.json({ success: true, emailSent: !!person?.email });
      } catch (error) {
        console.error("Error deleting RSVP:", error);
        res.status(500).json({ error: "Failed to delete RSVP" });
      }
    }
  );

  // ---------------------------
  // PROTECTED: Promote waitlisted RSVP to confirmed (requires auth, verifies ownership)
  // ---------------------------
  app.post(
    "/host/events/:eventId/rsvps/:rsvpId/promote",
    requireAuth,
    async (req, res) => {
      try {
        const { eventId, rsvpId } = req.params;
        const { sendEmail: shouldSendEmail } = req.body || {};

        const event = await findEventById(eventId);
        if (!event) return res.status(404).json({ error: "Event not found" });

        const canEdit = await canEditGuests(req.user.id, event.id);
        if (!canEdit) {
          return res.status(403).json({
            error: "Forbidden",
            message: "You don't have permission to edit guests for this event.",
          });
        }

        const rsvp = await findRsvpById(rsvpId);
        if (!rsvp || rsvp.eventId !== eventId) {
          return res.status(404).json({ error: "RSVP not found" });
        }

        if (rsvp.bookingStatus !== "WAITLIST") {
          return res.status(400).json({
            error: "not_waitlisted",
            message: "Only waitlisted RSVPs can be promoted.",
          });
        }

        // Paid event: require an explicit comp so a paid seat is never given
        // away by accident. Free events are unaffected.
        const { comp } = req.body || {};
        if (isPaidEvent(event) && !comp) {
          return res.status(402).json({
            error: "payment_required",
            message:
              "This is a paid event. Send a payment link to collect payment, or confirm you want to comp this guest (let them in free).",
          });
        }

        const result = await updateRsvp(
          rsvpId,
          { bookingStatus: "CONFIRMED", status: "attending" },
          { forceConfirm: true }
        );

        // Record the intentional comp honestly (not left as "unpaid", which
        // would otherwise prompt the guest to pay). Best-effort.
        if (!result.error && isPaidEvent(event) && comp) {
          await supabase
            .from("rsvps")
            .update({ payment_status: "comp" })
            .eq("id", rsvpId)
            .then(() => {}, () => {});
        }

        if (result.error) {
          return res.status(500).json({
            error: result.error,
            message: result.message || "Failed to promote RSVP",
          });
        }

        // Let-in reveal: send the host's composed waitlistPromote message
        // (location + room link) the moment they're clicked in. The helper
        // respects the host's Communication-panel toggle, so what goes out and
        // whether it goes at all is the host's control — not this route's flag.
        // (`shouldSendEmail` is retained for the API but no longer gates the send.)
        void shouldSendEmail;
        try {
          const person = await findPersonById(rsvp.personId);
          const promoteHost = await getUserProfile(event.hostId).catch(() => null);
          const { sendWaitlistPromotionMessages } = await import("../services/composedEventEmail.js");
          await sendWaitlistPromotionMessages({ event, rsvp, person, hostProfile: promoteHost });
        } catch (emailErr) {
          console.error("Failed to send promotion reveal email:", emailErr);
          // Don't block the promotion on email failure
        }

        res.json(result.rsvp);
      } catch (error) {
        console.error("Error promoting RSVP:", error);
        res.status(500).json({ error: "Failed to promote RSVP" });
      }
    }
  );

  // ---------------------------
  // PROTECTED: Bulk promote waitlisted RSVPs (requires auth, verifies ownership)
  // ---------------------------
  app.post(
    "/host/events/:eventId/rsvps/promote-bulk",
    requireAuth,
    async (req, res) => {
      try {
        const { eventId } = req.params;
        const { rsvpIds, comp } = req.body || {};

        if (!Array.isArray(rsvpIds) || rsvpIds.length === 0) {
          return res.status(400).json({
            error: "invalid_input",
            message: "rsvpIds must be a non-empty array.",
          });
        }

        const event = await findEventById(eventId);
        if (!event) return res.status(404).json({ error: "Event not found" });

        // Same paid-event comp guard as the single promote.
        if (isPaidEvent(event) && !comp) {
          return res.status(402).json({
            error: "payment_required",
            message:
              "This is a paid event. Send payment links to collect payment, or confirm you want to comp these guests (let them in free).",
          });
        }

        const canEdit = await canEditGuests(req.user.id, event.id);
        if (!canEdit) {
          return res.status(403).json({
            error: "Forbidden",
            message: "You don't have permission to edit guests for this event.",
          });
        }

        // Fetch all RSVPs and filter to valid waitlisted ones for this event
        const rsvps = [];
        for (const id of rsvpIds) {
          const rsvp = await findRsvpById(id);
          if (rsvp && rsvp.eventId === eventId && rsvp.bookingStatus === "WAITLIST") {
            rsvps.push(rsvp);
          }
        }

        // Sort FIFO by RSVP creation date
        rsvps.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        // Fetch host branding once for all sends (the reveal helper reads brand
        // off this profile).
        const bulkHost = await getUserProfile(event.hostId).catch(() => null);

        let promoted = 0;
        for (const rsvp of rsvps) {
          const result = await updateRsvp(
            rsvp.id,
            { bookingStatus: "CONFIRMED", status: "attending" },
            { forceConfirm: true }
          );

          if (!result.error) {
            promoted++;

            // Same let-in reveal as the single-promote route; the helper honours
            // the host's Communication-panel toggle per event.
            try {
              const person = await findPersonById(rsvp.personId);
              const { sendWaitlistPromotionMessages } = await import("../services/composedEventEmail.js");
              await sendWaitlistPromotionMessages({ event, rsvp, person, hostProfile: bulkHost });
            } catch (emailErr) {
              console.error("Failed to send bulk promotion reveal email:", emailErr);
            }
          }
        }

        res.json({ promoted, total: rsvpIds.length });
      } catch (error) {
        console.error("Error bulk promoting RSVPs:", error);
        res.status(500).json({ error: "Failed to bulk promote RSVPs" });
      }
    }
  );

  // ---------------------------
  // PROTECTED: Cancel RSVP (requires auth, verifies ownership)
  // ---------------------------
  app.post(
    "/host/events/:eventId/rsvps/:rsvpId/cancel",
    requireAuth,
    async (req, res) => {
      try {
        const { eventId, rsvpId } = req.params;

        const event = await findEventById(eventId);
        if (!event) return res.status(404).json({ error: "Event not found" });

        const canEdit = await canEditGuests(req.user.id, event.id);
        if (!canEdit) {
          return res.status(403).json({
            error: "Forbidden",
            message: "You don't have permission to edit guests for this event.",
          });
        }

        const rsvp = await findRsvpById(rsvpId);
        if (!rsvp || rsvp.eventId !== eventId) {
          return res.status(404).json({ error: "RSVP not found" });
        }

        // For paid + confirmed guests, require refund first
        const isPaid = event.ticketType === "paid" && event.ticketPrice > 0;
        if (
          isPaid &&
          rsvp.bookingStatus === "CONFIRMED" &&
          rsvp.paymentStatus === "paid"
        ) {
          return res.status(400).json({
            error: "refund_required",
            message:
              "This guest has a confirmed payment. Please process a refund before cancelling.",
          });
        }

        const result = await updateRsvp(rsvpId, {
          bookingStatus: "CANCELLED",
          status: "cancelled",
        });

        if (result.error) {
          return res.status(500).json({
            error: result.error,
            message: result.message || "Failed to cancel RSVP",
          });
        }

        // Send cancellation email to guest
        const person = await findPersonById(rsvp.personId);
        if (person?.email) {
          try {
            const cancelHost = await getUserProfile(event.hostId).catch(() => null);
            const cancelSig =
              cancelHost?.whatsappSignature ||
              (cancelHost?.name ? `It's me, ${cancelHost.name.split(/\s+/)[0]}` : "");
            await dispatchMessage({
              recipient: {
                id: person.id || null,
                email: person.email,
                phone_e164: person.phone_e164 || null,
                phone_verified_at: person.phone_verified_at || null,
                do_not_contact: person.do_not_contact || false,
              },
              hostProfile: cancelHost,
              whatsapp: {
                templateKey: "booking_cancelled",
                variables: {
                  guest_first_name: (rsvp.name || person.name || "there").split(/\s+/)[0] || "there",
                  event_title: event.title || "the event",
                  host_signature: cancelSig || "PullUp",
                },
              },
              email: {
                subject: "Your booking has been cancelled",
                htmlBody: cancellationEmail({
                  name: rsvp.name || person.name || "there",
                  eventTitle: event.title,
                  imageUrl: event.coverImageUrl || event.imageUrl || "",
                  slug: event.slug || "",
                  frontendUrl: getFrontendUrl(),
                  brandName: cancelHost?.brand || "",
                  brandWebsite: cancelHost?.brandWebsite || "",
                  contactEmail: cancelHost?.contactEmail || "",
                }),
              },
              context: {
                personId: person.id || null,
                hostProfileId: event.hostId || null,
                idempotencyKey: `cancel-${rsvp.id}`,
              },
            });
          } catch (emailErr) {
            console.error("Failed to send cancellation email:", emailErr);
          }
        }

        res.json({ ...result.rsvp, emailSent: !!person?.email });
      } catch (error) {
        console.error("Error cancelling RSVP:", error);
        res.status(500).json({ error: "Failed to cancel RSVP" });
      }
    }
  );
}
