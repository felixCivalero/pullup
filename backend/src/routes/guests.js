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
  isUserEventHost,
  canEditGuests,
  getEventHostRole,
  findPersonById,
} from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import { validateRsvpUpdateData } from "../middleware/validation.js";
import { getFrontendUrl } from "../lib/urls.js";
import {
  signupConfirmationEmail,
  cancellationEmail,
} from "../emails/signupConfirmation.js";
import { emitIntent, sourceFromRequest } from "../services/intentLog.js";
import { dispatch as dispatchMessage } from "../messaging/index.js";

export function registerGuestRoutes(app) {
  app.get("/host/events/:id/guests", requireAuth, async (req, res) => {
    try {
      const event = await findEventById(req.params.id);
      if (!event) return res.status(404).json({ error: "Event not found" });

      // Verify ownership (owner or co-host)
      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have access to this event",
        });
      }

      const myRole = await getEventHostRole(req.user.id, event.id);
      if (myRole === "analytics" || myRole === "viewer") {
        return res.status(403).json({
          error: "Forbidden",
          message: "Your role does not have access to guest data",
        });
      }

      const guests = await getRsvpsForEvent(event.id);
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

      // Any host can export (including viewer)
      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have access to this event",
        });
      }

      const myRole = await getEventHostRole(req.user.id, event.id);
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
            header: f.label || type.charAt(0).toUpperCase() + type.slice(1),
            accessor: (guest) => guest[key] || "",
          };
        })
        .filter(Boolean);

      // Custom (non-identity) form fields are answered per-RSVP — emit them
      // as their own columns from rsvps.custom_answers, keyed by field id.
      const customColumns = (event.formFields || [])
        .filter((f) => String(f?.type || "").toLowerCase() === "custom" && f?.id)
        .map((f) => ({
          header: f.label || "Custom",
          accessor: (guest) => (guest.customAnswers || {})[f.id] || "",
        }));

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

      const csv = [headers.join(","), ...rows].join("\n");

      // Set headers for CSV download
      res.setHeader("Content-Type", "text/csv");
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

        // Only owner, admin, or editor can update RSVPs (guest list edits)
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

        const result = await updateRsvp(
          rsvpId,
          { bookingStatus: "CONFIRMED", status: "attending" },
          { forceConfirm: true }
        );

        if (result.error) {
          return res.status(500).json({
            error: result.error,
            message: result.message || "Failed to promote RSVP",
          });
        }

        // Optionally send confirmation email
        if (shouldSendEmail) {
          try {
            const person = await findPersonById(rsvp.personId);
            const email = person?.email || rsvp.email;
            if (email) {
              const promoteHost = await getUserProfile(event.hostId).catch(() => null);
              const hostBrand = {
                brandName: promoteHost?.brand || "",
                brandWebsite: promoteHost?.brandWebsite || "",
                contactEmail: promoteHost?.contactEmail || "",
              };
              const firstName = (rsvp.name || person?.name || "there").split(/\s+/)[0] || "there";
              const promoteSig =
                promoteHost?.whatsappSignature ||
                (promoteHost?.name ? `It's me, ${promoteHost.name.split(/\s+/)[0]}` : "");

              // Dual-rail confirm — identical to a fresh RSVP confirm so a verified
              // + opted-in guest gets WhatsApp; email is the floor otherwise.
              await dispatchMessage({
                recipient: {
                  id: person?.id || null,
                  email,
                  phone_e164: person?.phone_e164 || null,
                  phone_verified_at: person?.phone_verified_at || null,
                  do_not_contact: person?.do_not_contact || false,
                },
                hostProfile: promoteHost,
                whatsapp: {
                  templateKey: "rsvp_confirm",
                  variables: {
                    guest_first_name: firstName,
                    event_title: event.title || "the event",
                    event_when: event.startsAt ? new Date(event.startsAt).toLocaleString() : "soon",
                    host_signature: promoteSig || "PullUp",
                  },
                },
                email: {
                  subject: "Your spot is confirmed",
                  htmlBody: signupConfirmationEmail({
                    name: rsvp.name || person?.name || "",
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
                    frontendUrl: getFrontendUrl(),
                    spotifyUrl: event.spotify || "",
                    ticketPrice: event.ticketPrice ? (Number(event.ticketPrice) / 100).toFixed(2) : 0,
                    ticketCurrency: event.ticketCurrency || "",
                    hideDate: event.hideDate || false,
                    hideLocation: event.hideLocation || false,
                    dateRevealHint: event.dateRevealHint || "",
                    revealHint: event.revealHint || "",
                    ...hostBrand,
                  }),
                },
                context: {
                  personId: person?.id || null,
                  hostProfileId: event.hostId || null,
                },
              });
            }
          } catch (emailErr) {
            console.error("Failed to send promotion confirmation email:", emailErr);
            // Don't block the promotion on email failure
          }
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
        const { rsvpIds, sendEmail: shouldSendEmail } = req.body || {};

        if (!Array.isArray(rsvpIds) || rsvpIds.length === 0) {
          return res.status(400).json({
            error: "invalid_input",
            message: "rsvpIds must be a non-empty array.",
          });
        }

        const event = await findEventById(eventId);
        if (!event) return res.status(404).json({ error: "Event not found" });

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

        // Fetch host branding + signature once for all sends.
        const bulkHost = await getUserProfile(event.hostId).catch(() => null);
        const hostBrand = {
          brandName: bulkHost?.brand || "",
          brandWebsite: bulkHost?.brandWebsite || "",
          contactEmail: bulkHost?.contactEmail || "",
        };
        const bulkSig =
          bulkHost?.whatsappSignature ||
          (bulkHost?.name ? `It's me, ${bulkHost.name.split(/\s+/)[0]}` : "");

        let promoted = 0;
        for (const rsvp of rsvps) {
          const result = await updateRsvp(
            rsvp.id,
            { bookingStatus: "CONFIRMED", status: "attending" },
            { forceConfirm: true }
          );

          if (!result.error) {
            promoted++;

            if (shouldSendEmail) {
              try {
                const person = await findPersonById(rsvp.personId);
                const email = person?.email || rsvp.email;
                if (email) {
                  const firstName = (rsvp.name || person?.name || "there").split(/\s+/)[0] || "there";
                  await dispatchMessage({
                    recipient: {
                      id: person?.id || null,
                      email,
                      phone_e164: person?.phone_e164 || null,
                      phone_verified_at: person?.phone_verified_at || null,
                      do_not_contact: person?.do_not_contact || false,
                    },
                    hostProfile: bulkHost,
                    whatsapp: {
                      templateKey: "rsvp_confirm",
                      variables: {
                        guest_first_name: firstName,
                        event_title: event.title || "the event",
                        event_when: event.startsAt ? new Date(event.startsAt).toLocaleString() : "soon",
                        host_signature: bulkSig || "PullUp",
                      },
                    },
                    email: {
                      subject: "Your spot is confirmed",
                      htmlBody: signupConfirmationEmail({
                        name: rsvp.name || person?.name || "",
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
                        frontendUrl: getFrontendUrl(),
                        spotifyUrl: event.spotify || "",
                        ticketPrice: event.ticketPrice ? (Number(event.ticketPrice) / 100).toFixed(2) : 0,
                        ticketCurrency: event.ticketCurrency || "",
                        hideDate: event.hideDate || false,
                        hideLocation: event.hideLocation || false,
                        dateRevealHint: event.dateRevealHint || "",
                        revealHint: event.revealHint || "",
                        ...hostBrand,
                      }),
                    },
                    context: {
                      personId: person?.id || null,
                      hostProfileId: event.hostId || null,
                    },
                  });
                }
              } catch (emailErr) {
                console.error("Failed to send bulk promotion email:", emailErr);
              }
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
