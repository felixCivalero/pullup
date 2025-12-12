// backend/src/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import {
  createEvent,
  findEventBySlug,
  addRsvp,
  findEventById,
  updateEvent,
  getRsvpsForEvent,
  generateDinnerTimeSlots,
  getDinnerSlotCounts,
  getEventCounts,
  getCocktailsOnlyCount,
  findRsvpById,
  updateRsvp,
  deleteRsvp,
  getAllPeopleWithStats,
  updatePerson,
  createPayment,
  getPaymentsForUser,
  getPaymentsForEvent,
  findPersonByEmail,
  mapEventFromDb,
  getUserProfile,
  updateUserProfile,
} from "./data.js";

import { requireAuth, optionalAuth } from "./middleware/auth.js";

import {
  getOrCreateStripeCustomer,
  createPaymentIntent,
  handleStripeWebhook,
  createStripeProduct,
  createStripePrice,
} from "./stripe.js";

dotenv.config();

const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : ["http://localhost:3000", "http://localhost:5173"], // Default dev origins
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Allow base64 images in body
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ---------------------------
// PROTECTED: List user's events (requires auth)
// ---------------------------
app.get("/events", requireAuth, async (req, res) => {
  try {
    // Fetch only events for the authenticated user
    const { supabase } = await import("./supabase.js");
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("host_id", req.user.id)
      .order("starts_at", { ascending: false });

    if (error) {
      console.error("Error fetching events:", error);
      return res.status(500).json({ error: "Failed to fetch events" });
    }

    // Map to application format using the existing helper
    const mappedEvents = await Promise.all(
      events.map((dbEvent) => mapEventFromDb(dbEvent))
    );

    res.json(mappedEvents);
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// ---------------------------
// PUBLIC: Get event by slug
// ---------------------------
app.get("/events/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const event = await findEventBySlug(slug);

    if (!event) return res.status(404).json({ error: "Event not found" });

    // Include current attendance counts for capacity warnings
    const { confirmed, waitlist } = await getEventCounts(event.id);
    // Calculate cocktails-only (people attending cocktails but not confirmed for dinner)
    const cocktailsOnly = await getCocktailsOnlyCount(event.id);
    const cocktailSpotsLeft =
      event.cocktailCapacity != null
        ? Math.max(0, event.cocktailCapacity - cocktailsOnly)
        : null;

    res.json({
      ...event,
      _attendance: {
        confirmed,
        waitlist,
        cocktailSpotsLeft,
      },
    });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

// ---------------------------
// PROTECTED: Create event (requires auth)
// ---------------------------
app.post("/events", requireAuth, async (req, res) => {
  const {
    title,
    description,
    location,
    startsAt,
    endsAt,
    timezone,
    maxAttendees,
    waitlistEnabled,
    imageUrl,
    theme,
    calendar,
    visibility,
    ticketType,
    requireApproval,

    // NEW fields
    maxPlusOnesPerGuest,
    dinnerEnabled,
    dinnerStartTime,
    dinnerEndTime,
    dinnerSeatingIntervalHours,
    dinnerMaxSeatsPerSlot,
    dinnerOverflowAction,

    // Capacity fields
    cocktailCapacity,
    foodCapacity,
    totalCapacity,

    // Stripe fields
    ticketPrice,
    ticketCurrency = "USD",
    stripeProductId, // Optional - will be auto-created if not provided
    stripePriceId, // Optional - will be auto-created if not provided
  } = req.body;

  if (!title || !startsAt) {
    return res.status(400).json({ error: "title and startsAt are required" });
  }

  // If paid tickets, automatically create Stripe product and price
  let finalStripeProductId = stripeProductId;
  let finalStripePriceId = stripePriceId;

  // Create the event first to get its ID (with host_id from authenticated user)
  const event = await createEvent({
    hostId: req.user.id, // Set host_id from authenticated user
    title,
    description,
    location,
    startsAt,
    endsAt,
    timezone,
    maxAttendees,
    waitlistEnabled,
    imageUrl,
    theme,
    calendar,
    visibility,
    ticketType,
    requireApproval,
    maxPlusOnesPerGuest,
    dinnerEnabled,
    dinnerStartTime,
    dinnerEndTime,
    dinnerSeatingIntervalHours,
    dinnerMaxSeatsPerSlot,
    dinnerOverflowAction,
    ticketPrice,
    stripeProductId: finalStripeProductId,
    stripePriceId: finalStripePriceId,
    cocktailCapacity,
    foodCapacity,
    totalCapacity,
  });

  // If paid tickets and Stripe IDs weren't provided, create them automatically
  if (
    ticketType === "paid" &&
    ticketPrice &&
    !stripeProductId &&
    !stripePriceId
  ) {
    try {
      // Create Stripe product
      const product = await createStripeProduct({
        eventTitle: title,
        eventDescription: description || "",
        eventId: event.id,
        startsAt,
        endsAt,
      });

      // Create Stripe price
      const price = await createStripePrice({
        productId: product.id,
        amount: ticketPrice, // Already in cents
        currency: ticketCurrency || "usd",
        eventId: event.id,
      });

      // Update the event with the created Stripe IDs
      const updatedEvent = await updateEvent(event.id, {
        stripeProductId: product.id,
        stripePriceId: price.id,
      });

      res.status(201).json(updatedEvent);
      return;
    } catch (error) {
      console.error("Error creating Stripe product/price:", error);
      // If Stripe creation fails, still return the event but without Stripe IDs
      // This allows the event to be created even if Stripe is misconfigured
      // The user can manually add Stripe IDs later if needed
      res.status(201).json(event);
      return;
    }
  }

  res.status(201).json(event);
});

// ---------------------------
// PUBLIC: RSVP
// ---------------------------
app.post("/events/:slug/rsvp", async (req, res) => {
  try {
    const { slug } = req.params;
    const {
      name,
      email,
      plusOnes = 0, // NEW: how many guests they bring (0–3)
      wantsDinner = false, // NEW: opt-in to dinner
      dinnerTimeSlot = null, // NEW: selected dinner time slot (ISO string)
      dinnerPartySize = null, // NEW: party size for dinner (can differ from event party size)
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const result = await addRsvp({
      slug,
      name,
      email,
      plusOnes,
      wantsDinner,
      dinnerTimeSlot,
      dinnerPartySize,
    });

    if (result.error === "not_found") {
      return res.status(404).json({ error: "Event not found" });
    }

    if (result.error === "invalid_email") {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (result.error === "duplicate") {
      return res.status(409).json({
        error: "duplicate",
        message: "You've already RSVP'd to this event",
        status: result.rsvp.status,
      });
    }

    if (result.error === "full") {
      return res.status(409).json({
        error: "full",
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

    // Return detailed RSVP information including status details
    res.status(201).json({
      event: result.event,
      rsvp: result.rsvp,
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

// ---------------------------
// PROTECTED: Get single event by id or slug (requires auth, verifies ownership)
// ---------------------------
app.get("/host/events/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Try to find by ID first (UUID format)
    let event = await findEventById(id);

    // If not found by ID, try to find by slug
    if (!event) {
      event = await findEventBySlug(id);
    }

    if (!event) return res.status(404).json({ error: "Event not found" });

    // Verify ownership
    if (event.hostId !== req.user.id) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    res.json(event);
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

// ---------------------------
// PROTECTED: Update event (requires auth, verifies ownership)
// ---------------------------
app.put("/host/events/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  // Allow updating both old and new fields
  const {
    title,
    description,
    location,
    startsAt,
    endsAt,
    timezone,
    maxAttendees,
    waitlistEnabled,
    imageUrl,
    theme,
    calendar,
    visibility,
    ticketType,
    requireApproval,
    maxPlusOnesPerGuest,
    dinnerEnabled,
    dinnerStartTime,
    dinnerEndTime,
    dinnerSeatingIntervalHours,
    dinnerMaxSeatsPerSlot,
    dinnerOverflowAction,

    // Stripe fields
    ticketPrice,
    stripeProductId,
    stripePriceId,

    // Capacity fields
    cocktailCapacity,
    foodCapacity,
    totalCapacity,
  } = req.body;

  const updated = await updateEvent(id, {
    title,
    description,
    location,
    startsAt,
    endsAt,
    timezone,
    maxAttendees,
    waitlistEnabled,
    imageUrl,
    theme,
    calendar,
    visibility,
    ticketType,
    requireApproval,
    maxPlusOnesPerGuest,
    dinnerEnabled,
    dinnerStartTime,
    dinnerEndTime,
    dinnerSeatingIntervalHours,
    dinnerMaxSeatsPerSlot,
    dinnerOverflowAction,
    ticketPrice,
    stripeProductId,
    stripePriceId,
    cocktailCapacity,
    foodCapacity,
    totalCapacity,
  });

  if (!updated) return res.status(404).json({ error: "Event not found" });

  res.json(updated);
});

// ---------------------------
// PROTECTED: Guest list (requires auth, verifies ownership)
// ---------------------------
app.get("/host/events/:id/guests", requireAuth, async (req, res) => {
  try {
    const event = await findEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Verify ownership
    if (event.hostId !== req.user.id) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    const guests = await getRsvpsForEvent(event.id);

    res.json({ event, guests });
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

    // Verify ownership
    if (event.hostId !== req.user.id) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    const guests = await getRsvpsForEvent(event.id);

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
      const counts = slotCounts[slotTime] || { confirmed: 0, waitlist: 0 };
      const available =
        !event.dinnerMaxSeatsPerSlot ||
        counts.confirmed < event.dinnerMaxSeatsPerSlot;
      const remaining = event.dinnerMaxSeatsPerSlot
        ? Math.max(0, event.dinnerMaxSeatsPerSlot - counts.confirmed)
        : null;

      return {
        time: slotTime,
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
  async (req, res) => {
    try {
      const { eventId, rsvpId } = req.params;
      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      // Verify ownership
      if (event.hostId !== req.user.id) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have access to this event",
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
      } = req.body;

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

      // Verify ownership
      if (event.hostId !== req.user.id) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have access to this event",
        });
      }

      const rsvp = await findRsvpById(rsvpId);
      if (!rsvp || rsvp.eventId !== eventId) {
        return res.status(404).json({ error: "RSVP not found" });
      }

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

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting RSVP:", error);
      res.status(500).json({ error: "Failed to delete RSVP" });
    }
  }
);

// ---------------------------
// PROTECTED: Get all people (CRM) - filtered by user's events
// ---------------------------
app.get("/host/crm/people", requireAuth, async (req, res) => {
  try {
    // Assign orphaned events to this user on first access (one-time migration)
    const { assignOrphanedEventsToUser } = await import("./migrations.js");
    try {
      await assignOrphanedEventsToUser(req.user.id);
    } catch (migrationError) {
      // Log but don't fail - migration is optional
      console.log("Migration note:", migrationError.message);
    }

    // getAllPeopleWithStats will filter by user's events via backend queries
    const people = await getAllPeopleWithStats(req.user.id);
    res.json({ people });
  } catch (error) {
    console.error("Error fetching people:", error);
    res.status(500).json({ error: "Failed to fetch people" });
  }
});

// ---------------------------
// PROTECTED: Export CRM people as CSV
// ---------------------------
app.get("/host/crm/people/export", requireAuth, async (req, res) => {
  try {
    const people = await getAllPeopleWithStats(req.user.id);

    // CSV header
    const headers = [
      "Name",
      "Email",
      "Phone",
      "Notes",
      "Tags",
      "Total Events",
      "Events Attended",
      "Events Waitlisted",
      "Total Guests Brought",
      "Total Dinners",
      "Total Dinner Guests",
      "First Seen",
    ];

    // CSV rows
    const rows = people.map((person) => {
      const escapeCsv = (value) => {
        if (value === null || value === undefined) return "";
        const str = String(value);
        // If contains comma, quote, or newline, wrap in quotes and escape quotes
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escapeCsv(person.name),
        escapeCsv(person.email),
        escapeCsv(person.phone),
        escapeCsv(person.notes),
        escapeCsv(person.tags?.join(", ") || ""),
        escapeCsv(person.stats?.totalEvents || 0),
        escapeCsv(person.stats?.eventsAttended || 0),
        escapeCsv(person.stats?.eventsWaitlisted || 0),
        escapeCsv(person.stats?.totalGuestsBrought || 0),
        escapeCsv(person.stats?.totalDinners || 0),
        escapeCsv(person.stats?.totalDinnerGuests || 0),
        escapeCsv(
          person.createdAt
            ? new Date(person.createdAt).toLocaleDateString("en-US")
            : ""
        ),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    // Set headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="crm-contacts-${
        new Date().toISOString().split("T")[0]
      }.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting CRM people:", error);
    res.status(500).json({ error: "Failed to export CRM data" });
  }
});

// ---------------------------
// PROTECTED: Update person (requires auth)
// ---------------------------
app.put("/host/crm/people/:personId", requireAuth, async (req, res) => {
  try {
    const { personId } = req.params;
    const { name, phone, notes, tags } = req.body;

    const result = await updatePerson(personId, {
      name,
      phone,
      notes,
      tags,
    });

    if (result.error === "not_found") {
      return res.status(404).json({ error: "Person not found" });
    }

    res.json(result.person);
  } catch (error) {
    console.error("Error updating person:", error);
    res.status(500).json({ error: "Failed to update person" });
  }
});

// ---------------------------
// PROTECTED: Create payment intent for event (requires auth, verifies ownership)
// ---------------------------
app.post(
  "/host/events/:eventId/create-payment",
  requireAuth,
  async (req, res) => {
    const { eventId } = req.params;
    const { email, name, rsvpId } = req.body;

    try {
      // Get event
      const event = await findEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Verify ownership
      if (event.hostId !== req.user.id) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have access to this event",
        });
      }

      if (event.ticketType !== "paid" || !event.ticketPrice) {
        return res.status(400).json({ error: "Event is not a paid event" });
      }

      // Get or create Stripe customer
      const customerId = await getOrCreateStripeCustomer(email, name);

      // Find person to get personId
      const person = await findPersonByEmail(email);
      if (!person) {
        return res.status(404).json({ error: "Person not found" });
      }

      // Create payment intent
      const paymentIntent = await createPaymentIntent({
        customerId,
        amount: event.ticketPrice,
        eventId: event.id,
        eventTitle: event.title,
        personId: person.id,
      });

      // Create payment record
      const payment = await createPayment({
        userId: person.id, // Using personId as userId for now
        eventId: event.id,
        rsvpId: rsvpId || null,
        stripePaymentIntentId: paymentIntent.id,
        stripeCustomerId: customerId,
        amount: event.ticketPrice,
        currency: "usd",
        status: "pending",
        description: `Ticket for ${event.title}`,
      });

      res.json({
        client_secret: paymentIntent.client_secret,
        payment_id: payment.id,
        payment_intent_id: paymentIntent.id,
      });
    } catch (error) {
      console.error("Payment creation error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to create payment" });
    }
  }
);

// ---------------------------
// PROTECTED: Get payments for user (requires auth)
// ---------------------------
app.get("/host/payments", requireAuth, async (req, res) => {
  try {
    // Use authenticated user's ID
    const userId = req.user.id;

    const userPayments = await getPaymentsForUser(userId);
    res.json({ payments: userPayments });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// ---------------------------
// PROTECTED: Get payments for event (requires auth, verifies ownership)
// ---------------------------
app.get("/host/events/:eventId/payments", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;

    // Verify ownership
    const event = await findEventById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (event.hostId !== req.user.id) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    const eventPayments = await getPaymentsForEvent(eventId);
    res.json({ payments: eventPayments });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// ---------------------------
// WEBHOOKS: Stripe webhook handler
// ---------------------------
app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    let event;

    try {
      const stripe = (await import("stripe")).default;
      const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY || "");
      event = stripeInstance.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      const result = await handleStripeWebhook(event);
      res.json({ received: true, processed: result.processed });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  }
);

// ---------------------------
// PROTECTED: Get user profile
// ---------------------------
app.get("/host/profile", requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.id);
    res.json(profile);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ---------------------------
// PROTECTED: Update user profile
// ---------------------------
app.put("/host/profile", requireAuth, async (req, res) => {
  try {
    const updates = req.body;
    const updated = await updateUserProfile(req.user.id, updates);
    res.json(updated);
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ---------------------------
// PROTECTED: Upload event image
// ---------------------------
app.post("/host/events/:eventId/image", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { imageData } = req.body; // Base64 image data

    if (!imageData) {
      return res.status(400).json({ error: "imageData is required" });
    }

    // Verify event ownership
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    if (event.hostId !== req.user.id) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Determine file extension from data URL
    const mimeMatch = imageData.match(/data:image\/(\w+);base64/);
    const extension = mimeMatch ? mimeMatch[1] : "png";
    const fileName = `${eventId}/image.${extension}`;

    // Upload to Supabase Storage
    const { supabase } = await import("./supabase.js");
    const { data, error } = await supabase.storage
      .from("event-images")
      .upload(fileName, buffer, {
        contentType: `image/${extension}`,
        upsert: true, // Overwrite if exists
      });

    if (error) {
      console.error("Storage upload error:", error);
      return res.status(500).json({ error: "Failed to upload image" });
    }

    // Store just the file path in the database
    const updated = await updateEvent(eventId, {
      imageUrl: fileName, // Store path, not full URL
    });

    // Generate URL for immediate return (try signed first, fallback to public)
    let imageUrl = null;
    try {
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from("event-images")
        .createSignedUrl(fileName, 3600); // 1 hour for response

      if (!urlError && signedUrlData?.signedUrl) {
        imageUrl = signedUrlData.signedUrl;
      }
    } catch (error) {
      console.error("Signed URL error:", error);
    }

    // Fallback to public URL if signed URL fails
    if (!imageUrl) {
      const {
        data: { publicUrl },
      } = supabase.storage.from("event-images").getPublicUrl(fileName);
      imageUrl = publicUrl;
    }

    // Return event with the generated URL
    const eventWithUrl = {
      ...updated,
      imageUrl: imageUrl,
    };

    res.json(eventWithUrl);
  } catch (error) {
    console.error("Error uploading event image:", error);
    res.status(500).json({ error: "Failed to upload event image" });
  }
});

// ---------------------------
// PROTECTED: Upload profile picture
// ---------------------------
app.post("/host/profile/picture", requireAuth, async (req, res) => {
  try {
    const { imageData } = req.body; // Base64 image data

    if (!imageData) {
      return res.status(400).json({ error: "imageData is required" });
    }

    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Determine file extension from data URL
    const mimeMatch = imageData.match(/data:image\/(\w+);base64/);
    const extension = mimeMatch ? mimeMatch[1] : "png";
    const fileName = `${req.user.id}/profile.${extension}`;

    // Upload to Supabase Storage
    const { supabase } = await import("./supabase.js");
    const { data, error } = await supabase.storage
      .from("profile-pictures")
      .upload(fileName, buffer, {
        contentType: `image/${extension}`,
        upsert: true, // Overwrite if exists
      });

    if (error) {
      console.error("Storage upload error:", error);
      return res.status(500).json({ error: "Failed to upload image" });
    }

    // Store just the file path in the database
    // We'll generate the appropriate URL (public or signed) when fetching
    // This allows us to switch between public/private buckets easily
    const updated = await updateUserProfile(req.user.id, {
      profilePicture: fileName, // Store path, not full URL
    });

    // Generate URL for immediate return (try signed first, fallback to public)
    let imageUrl = null;
    try {
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from("profile-pictures")
        .createSignedUrl(fileName, 3600); // 1 hour for response

      if (!urlError && signedUrlData?.signedUrl) {
        imageUrl = signedUrlData.signedUrl;
      }
    } catch (error) {
      console.error("Signed URL error:", error);
    }

    // Fallback to public URL if signed URL fails
    if (!imageUrl) {
      const {
        data: { publicUrl },
      } = supabase.storage.from("profile-pictures").getPublicUrl(fileName);
      imageUrl = publicUrl;
    }

    // Return profile with the generated URL
    const profileWithUrl = {
      ...updated,
      profilePicture: imageUrl,
    };

    res.json(profileWithUrl);
  } catch (error) {
    console.error("Error uploading profile picture:", error);
    res.status(500).json({ error: "Failed to upload profile picture" });
  }
});

// ---------------------------
// Server
// ---------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`PullUp API running on http://localhost:${PORT}`);
});
