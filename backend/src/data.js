// backend/src/data.js

// ---------------------------
// In-memory data
// ---------------------------
export const events = [
  {
    id: "evt_1",
    slug: "pullup-launch-party",
    title: "PullUp Launch Party",
    description: "...",
    location: "Stockholm",
    startsAt: "2025-12-31T21:00:00Z",
    endsAt: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isPaid: false,
    ticketType: "free",
    maxAttendees: 100, // null = unlimited
    waitlistEnabled: true, // waiting list toggle
    imageUrl: null,
    theme: "minimal",
    calendar: "personal",
    visibility: "public",
    requireApproval: false,

    // NEW: plus-ones
    maxPlusOnesPerGuest: 3, // 0 = no plus-ones, 1–3 allowed

    // NEW: dinner add-on
    dinnerEnabled: false,
    dinnerTime: null, // simple "19:00" string for now
    dinnerMaxSeats: null, // null = unlimited dinner seats

    createdAt: new Date().toISOString(),
  },
];

export const rsvps = [];

// ---------------------------
// Slug helpers
// ---------------------------
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
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

// ---------------------------
// Event CRUD
// ---------------------------
export function createEvent({
  title,
  description,
  location,
  startsAt,
  endsAt,
  timezone,
  maxAttendees = null,
  waitlistEnabled = true,
  imageUrl = null,
  theme = "minimal",
  calendar = "personal",
  visibility = "public",
  ticketType = "free",
  requireApproval = false,

  // NEW
  maxPlusOnesPerGuest = 0,
  dinnerEnabled = false,
  dinnerTime = null,
  dinnerMaxSeats = null,
}) {
  const baseSlug = slugify(title || "event");
  const slug = ensureUniqueSlug(baseSlug);

  const event = {
    id: `evt_${Date.now()}`,
    slug,
    title,
    description,
    location,
    startsAt,
    endsAt: endsAt || null,
    timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    isPaid: ticketType === "paid",
    ticketType,
    maxAttendees: maxAttendees || null,
    waitlistEnabled,
    imageUrl,
    theme,
    calendar,
    visibility,
    requireApproval,
    createdAt: new Date().toISOString(),

    maxPlusOnesPerGuest:
      typeof maxPlusOnesPerGuest === "number"
        ? Math.max(0, Math.min(3, maxPlusOnesPerGuest))
        : 0,

    dinnerEnabled: !!dinnerEnabled,
    dinnerTime: dinnerTime || null, // keep simple for now
    dinnerMaxSeats: dinnerMaxSeats ? Number(dinnerMaxSeats) : null,
  };

  events.push(event);
  return event;
}

export function findEventBySlug(slug) {
  return events.find((e) => e.slug === slug) || null;
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

// ---------------------------
// RSVP Logic
// ---------------------------

// Count attending / waitlist based on partySize
export function getEventCounts(eventId) {
  const attending = rsvps
    .filter((r) => r.eventId === eventId && r.status === "attending")
    .reduce((sum, r) => sum + (r.partySize || 1), 0);

  const waitlist = rsvps
    .filter((r) => r.eventId === eventId && r.status === "waitlist")
    .reduce((sum, r) => sum + (r.partySize || 1), 0);

  return { attending, waitlist };
}

// Dinner seat counts
export function getDinnerCounts(eventId) {
  const dinnerConfirmedSeats = rsvps
    .filter(
      (r) =>
        r.eventId === eventId && r.wantsDinner && r.dinnerStatus === "confirmed"
    )
    .reduce((sum, r) => sum + (r.partySize || 1), 0);

  const dinnerWaitlistSeats = rsvps
    .filter(
      (r) =>
        r.eventId === eventId && r.wantsDinner && r.dinnerStatus === "waitlist"
    )
    .reduce((sum, r) => sum + (r.partySize || 1), 0);

  return { dinnerConfirmedSeats, dinnerWaitlistSeats };
}

// Email validation helper
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// plusOnes = 0–3, wantsDinner = boolean
export function addRsvp({
  slug,
  name,
  email,
  plusOnes = 0,
  wantsDinner = false,
}) {
  const event = findEventBySlug(slug);
  if (!event) return { error: "not_found" };

  if (!email || !isValidEmail(email.trim())) {
    return { error: "invalid_email" };
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check for duplicate RSVP for this event
  const existingRsvp = rsvps.find(
    (r) => r.eventId === event.id && r.email.toLowerCase() === normalizedEmail
  );
  if (existingRsvp) {
    return { error: "duplicate", rsvp: existingRsvp };
  }

  const maxPlus =
    typeof event.maxPlusOnesPerGuest === "number"
      ? event.maxPlusOnesPerGuest
      : 0;

  const clampedPlusOnes = Math.max(
    0,
    Math.min(maxPlus, Number.isFinite(plusOnes) ? plusOnes : 0)
  );
  const partySize = 1 + clampedPlusOnes;

  const { attending } = getEventCounts(event.id);

  let status = "attending";

  // Capacity check for whole party
  if (event.maxAttendees && attending + partySize > event.maxAttendees) {
    if (event.waitlistEnabled) {
      status = "waitlist";
    } else {
      return { error: "full", event };
    }
  }

  // Dinner allocation
  let dinnerStatus = null;
  let finalWantsDinner = !!wantsDinner && !!event.dinnerEnabled;

  if (finalWantsDinner) {
    if (event.dinnerMaxSeats) {
      const { dinnerConfirmedSeats } = getDinnerCounts(event.id);

      if (
        status === "attending" &&
        dinnerConfirmedSeats + partySize <= event.dinnerMaxSeats
      ) {
        dinnerStatus = "confirmed";
      } else {
        dinnerStatus = "waitlist";
      }
    } else {
      // unlimited dinner seats; track anyway
      dinnerStatus = status === "attending" ? "confirmed" : "waitlist";
    }
  }

  const rsvp = {
    id: `rsvp_${Date.now()}`,
    eventId: event.id,
    slug,
    name: name || null,
    email: normalizedEmail,
    status, // "attending" | "waitlist"
    plusOnes: clampedPlusOnes,
    partySize,
    wantsDinner: finalWantsDinner,
    dinnerStatus, // "confirmed" | "waitlist" | null
    createdAt: new Date().toISOString(),
  };

  rsvps.push(rsvp);

  return { event, rsvp };
}

export function getRsvpsForEvent(eventId) {
  return rsvps.filter((r) => r.eventId === eventId);
}
