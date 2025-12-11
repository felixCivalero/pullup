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
} from "./data.js";

import {
  getOrCreateStripeCustomer,
  createPaymentIntent,
  handleStripeWebhook,
  createStripeProduct,
  createStripePrice,
} from "./stripe.js";

dotenv.config();

const app = express();

// Allow base64 images in body
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ---------------------------
// PUBLIC: List all events
// ---------------------------
app.get("/events", async (req, res) => {
  try {
    // Fetch all events from Supabase
    const { supabase } = await import("./supabase.js");
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .order("starts_at", { ascending: false });

    if (error) {
      console.error("Error fetching events:", error);
      return res.status(500).json({ error: "Failed to fetch events" });
    }

    // Map to application format using the existing helper
    const mappedEvents = events.map((dbEvent) => mapEventFromDb(dbEvent));

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
// PUBLIC: Create event
// ---------------------------
app.post("/events", async (req, res) => {
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

  // Create the event first to get its ID
  const event = await createEvent({
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
      const updatedEvent = updateEvent(event.id, {
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
// HOST: Get single event by id or slug
// ---------------------------
app.get("/host/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Try to find by ID first (UUID format)
    let event = await findEventById(id);

    // If not found by ID, try to find by slug
    if (!event) {
      event = await findEventBySlug(id);
    }

    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

// ---------------------------
// HOST: Update event
// ---------------------------
app.put("/host/events/:id", (req, res) => {
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

  const updated = updateEvent(id, {
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
// HOST: Guest list
// ---------------------------
app.get("/host/events/:id/guests", async (req, res) => {
  try {
    const event = await findEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const guests = await getRsvpsForEvent(event.id);

    res.json({ event, guests });
  } catch (error) {
    console.error("Error fetching guests:", error);
    res.status(500).json({ error: "Failed to fetch guests" });
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
// HOST: Update RSVP
// ---------------------------
app.put("/host/events/:eventId/rsvps/:rsvpId", async (req, res) => {
  try {
    const { eventId, rsvpId } = req.params;
    const event = await findEventById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

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
});

// ---------------------------
// HOST: Delete RSVP
// ---------------------------
app.delete("/host/events/:eventId/rsvps/:rsvpId", async (req, res) => {
  try {
    const { eventId, rsvpId } = req.params;
    const event = await findEventById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

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
});

// ---------------------------
// HOST: Get all people (CRM)
// ---------------------------
app.get("/host/crm/people", async (req, res) => {
  try {
    const people = await getAllPeopleWithStats();
    res.json({ people });
  } catch (error) {
    console.error("Error fetching people:", error);
    res.status(500).json({ error: "Failed to fetch people" });
  }
});

// ---------------------------
// HOST: Update person
// ---------------------------
app.put("/host/crm/people/:personId", async (req, res) => {
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
// PAYMENTS: Create payment intent for event
// ---------------------------
app.post("/host/events/:eventId/create-payment", async (req, res) => {
  const { eventId } = req.params;
  const { email, name, rsvpId } = req.body;

  try {
    // Get event
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
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
});

// ---------------------------
// PAYMENTS: Get payments for user
// ---------------------------
app.get("/host/payments", async (req, res) => {
  try {
    // TODO: Get userId from auth middleware
    const userId = req.query.userId || req.query.personId;
    if (!userId) {
      return res.status(400).json({ error: "userId or personId required" });
    }

    const userPayments = await getPaymentsForUser(userId);
    res.json({ payments: userPayments });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// ---------------------------
// PAYMENTS: Get payments for event
// ---------------------------
app.get("/host/events/:eventId/payments", async (req, res) => {
  try {
    const { eventId } = req.params;

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
// Server
// ---------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`PullUp API running on http://localhost:${PORT}`);
});
