// backend/src/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import {
  events,
  createEvent,
  findEventBySlug,
  addRsvp,
  findEventById,
  updateEvent,
  getRsvpsForEvent,
  generateDinnerTimeSlots,
  getDinnerSlotCounts,
  findRsvpById,
  updateRsvp,
  deleteRsvp,
  getAllPeopleWithStats,
  updatePerson,
  createPayment,
  getPaymentsForUser,
  getPaymentsForEvent,
  findPersonByEmail,
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
// Health check
// ---------------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "pullup-api" });
});

// ---------------------------
// PUBLIC: List all events
// ---------------------------
app.get("/events", (req, res) => {
  res.json(events);
});

// ---------------------------
// PUBLIC: Get event by slug
// ---------------------------
app.get("/events/:slug", (req, res) => {
  const { slug } = req.params;
  const event = findEventBySlug(slug);

  if (!event) return res.status(404).json({ error: "Event not found" });

  res.json(event);
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
  const event = createEvent({
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
app.post("/events/:slug/rsvp", (req, res) => {
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

  const result = addRsvp({
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

  // Return detailed RSVP information including status details
  res.status(201).json({
    event: result.event,
    rsvp: result.rsvp,
    statusDetails: {
      cocktailStatus: result.rsvp.status, // "attending" | "waitlist"
      dinnerStatus: result.rsvp.dinnerStatus, // "confirmed" | "waitlist" | "cocktails" | "cocktails_waitlist" | null
      wantsDinner: result.rsvp.wantsDinner,
    },
  });
});

// ---------------------------
// HOST: Get single event by id
// ---------------------------
app.get("/host/events/:id", (req, res) => {
  const event = findEventById(req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found" });
  res.json(event);
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
app.get("/host/events/:id/guests", (req, res) => {
  const event = findEventById(req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const guests = getRsvpsForEvent(event.id);

  res.json({ event, guests });
});

// ---------------------------
// PUBLIC: Get dinner time slots for event
// ---------------------------
app.get("/events/:slug/dinner-slots", (req, res) => {
  const { slug } = req.params;
  const event = findEventBySlug(slug);

  if (!event) return res.status(404).json({ error: "Event not found" });

  if (!event.dinnerEnabled) {
    return res.json({ slots: [], slotCounts: {} });
  }

  const slots = generateDinnerTimeSlots(event);
  const slotCounts = getDinnerSlotCounts(event.id);

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
});

// ---------------------------
// HOST: Update RSVP
// ---------------------------
app.put("/host/events/:eventId/rsvps/:rsvpId", (req, res) => {
  const { eventId, rsvpId } = req.params;
  const event = findEventById(eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const rsvp = findRsvpById(rsvpId);
  if (!rsvp || rsvp.eventId !== eventId) {
    return res.status(404).json({ error: "RSVP not found" });
  }

  const {
    name,
    email,
    plusOnes,
    status,
    wantsDinner,
    dinnerTimeSlot,
    dinnerPartySize,
  } = req.body;

  const result = updateRsvp(rsvpId, {
    name,
    email,
    plusOnes,
    status,
    wantsDinner,
    dinnerTimeSlot,
    dinnerPartySize,
  });

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

  res.json(result.rsvp);
});

// ---------------------------
// HOST: Delete RSVP
// ---------------------------
app.delete("/host/events/:eventId/rsvps/:rsvpId", (req, res) => {
  const { eventId, rsvpId } = req.params;
  const event = findEventById(eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const rsvp = findRsvpById(rsvpId);
  if (!rsvp || rsvp.eventId !== eventId) {
    return res.status(404).json({ error: "RSVP not found" });
  }

  const result = deleteRsvp(rsvpId);

  if (result.error === "not_found") {
    return res.status(404).json({ error: "RSVP not found" });
  }

  res.json({ success: true });
});

// ---------------------------
// HOST: Get all people (CRM)
// ---------------------------
app.get("/host/crm/people", (req, res) => {
  const people = getAllPeopleWithStats();
  res.json({ people });
});

// ---------------------------
// HOST: Update person
// ---------------------------
app.put("/host/crm/people/:personId", (req, res) => {
  const { personId } = req.params;
  const { name, phone, notes, tags } = req.body;

  const result = updatePerson(personId, {
    name,
    phone,
    notes,
    tags,
  });

  if (result.error === "not_found") {
    return res.status(404).json({ error: "Person not found" });
  }

  res.json(result.person);
});

// ---------------------------
// PAYMENTS: Create payment intent for event
// ---------------------------
app.post("/host/events/:eventId/create-payment", async (req, res) => {
  const { eventId } = req.params;
  const { email, name, rsvpId } = req.body;

  try {
    // Get event
    const event = findEventById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (event.ticketType !== "paid" || !event.ticketPrice) {
      return res.status(400).json({ error: "Event is not a paid event" });
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(email, name);

    // Find person to get personId
    const person = findPersonByEmail(email);
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
    const payment = createPayment({
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
app.get("/host/payments", (req, res) => {
  // TODO: Get userId from auth middleware
  const userId = req.query.userId || req.query.personId;
  if (!userId) {
    return res.status(400).json({ error: "userId or personId required" });
  }

  const userPayments = getPaymentsForUser(userId);
  res.json({ payments: userPayments });
});

// ---------------------------
// PAYMENTS: Get payments for event
// ---------------------------
app.get("/host/events/:eventId/payments", (req, res) => {
  const { eventId } = req.params;

  const eventPayments = getPaymentsForEvent(eventId);
  res.json({ payments: eventPayments });
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
