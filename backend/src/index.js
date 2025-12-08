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
} from "./data.js";

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
app.post("/events", (req, res) => {
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
  } = req.body;

  if (!title || !startsAt) {
    return res.status(400).json({ error: "title and startsAt are required" });
  }

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
  });

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
      status: "full",
      message: "Event is full and waitlist is disabled",
    });
  }

  const { rsvp } = result;

  return res.status(201).json({
    status: rsvp.status, // "attending" or "waitlist"
    rsvp,
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
// Server
// ---------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`PullUp API running on http://localhost:${PORT}`);
});
