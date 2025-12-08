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
    dinnerTime,
    dinnerMaxSeats,
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
    dinnerTime,
    dinnerMaxSeats,
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
  } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  const result = addRsvp({ slug, name, email, plusOnes, wantsDinner });

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
    dinnerTime,
    dinnerMaxSeats,
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
    dinnerTime,
    dinnerMaxSeats,
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
// Server
// ---------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`PullUp API running on http://localhost:${PORT}`);
});
