// backend/src/data.js
export const events = [
  {
    id: "evt_1",
    slug: "pullup-launch-party",
    title: "PullUp Launch Party",
    description: "A sexy test event for PullUp.",
    location: "Stockholm",
    startsAt: "2025-12-31T21:00:00Z",
    isPaid: false,
    createdAt: new Date().toISOString(),
  },
];

export const rsvps = [];

// simple slug generator from title
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\_]+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/\-+/g, "-");
}

function ensureUniqueSlug(baseSlug) {
  let slug = baseSlug;
  let counter = 2;
  while (events.some((e) => e.slug === slug)) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
  return slug;
}

export function createEvent({ title, description, location, startsAt }) {
  const baseSlug = slugify(title || "event");
  const slug = ensureUniqueSlug(baseSlug);

  const event = {
    id: `evt_${Date.now()}`,
    slug,
    title,
    description,
    location,
    startsAt,
    isPaid: false, // VOL 1: free events only
    createdAt: new Date().toISOString(),
  };

  events.push(event);
  return event;
}

export function findEventBySlug(slug) {
  return events.find((e) => e.slug === slug) || null;
}

export function addRsvp({ slug, name, email }) {
  const event = findEventBySlug(slug);
  if (!event) return null;

  const rsvp = {
    id: `rsvp_${Date.now()}`,
    eventId: event.id,
    slug,
    name,
    email,
    createdAt: new Date().toISOString(),
  };

  rsvps.push(rsvp);
  return { event, rsvp };
}

export function findEventById(id) {
  return events.find((e) => e.id === id) || null;
}

export function updateEvent(id, updates) {
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return null;

  events[idx] = {
    ...events[idx],
    ...updates,
  };

  return events[idx];
}

export function getRsvpsForEvent(eventId) {
  return rsvps.filter((r) => r.eventId === eventId);
}
