import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { events, createEvent, findEventBySlug, addRsvp } from "./data.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "pullup-api" });
});

// List all events (for later host view – fine to already have)
app.get("/events", (req, res) => {
  res.json(events);
});

// Get single event by slug (PUBLIC)
app.get("/events/:slug", (req, res) => {
  const { slug } = req.params;
  const event = findEventBySlug(slug);

  if (!event) {
    return res.status(404).json({ error: "Event not found" });
  }

  res.json(event);
});

// Create event (VOL 1: no auth, no validation drama)
app.post("/events", (req, res) => {
  const { title, description, location, startsAt } = req.body;

  if (!title || !startsAt) {
    return res.status(400).json({ error: "title and startsAt are required" });
  }

  const event = createEvent({ title, description, location, startsAt });
  res.status(201).json(event);
});

// Simple RSVP endpoint
app.post("/events/:slug/rsvp", (req, res) => {
  const { slug } = req.params;
  const { name, email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  const result = addRsvp({ slug, name, email });

  if (!result) {
    return res.status(404).json({ error: "Event not found" });
  }

  console.log("New RSVP:", result);
  res.status(201).json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`PullUp API running on http://localhost:${PORT}`);
});
