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
    dinnerStartTime: null, // ISO datetime string for dinner start
    dinnerEndTime: null, // ISO datetime string for dinner end
    dinnerSeatingIntervalHours: 2, // hours between seatings (default 2)
    dinnerMaxSeatsPerSlot: null, // max seats per time slot (null = unlimited)
    dinnerOverflowAction: "waitlist", // "waitlist" | "cocktails" | "both"

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
  dinnerStartTime = null,
  dinnerEndTime = null,
  dinnerSeatingIntervalHours = 2,
  dinnerMaxSeatsPerSlot = null,
  dinnerOverflowAction = "waitlist",
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
    dinnerStartTime: dinnerStartTime || null,
    dinnerEndTime: dinnerEndTime || null,
    dinnerSeatingIntervalHours:
      typeof dinnerSeatingIntervalHours === "number" &&
      dinnerSeatingIntervalHours > 0
        ? dinnerSeatingIntervalHours
        : 2,
    dinnerMaxSeatsPerSlot: dinnerMaxSeatsPerSlot
      ? Number(dinnerMaxSeatsPerSlot)
      : null,
    dinnerOverflowAction:
      dinnerOverflowAction === "cocktails" ||
      dinnerOverflowAction === "both" ||
      dinnerOverflowAction === "waitlist"
        ? dinnerOverflowAction
        : "waitlist",
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

// Generate dinner time slots based on start, end, and interval
export function generateDinnerTimeSlots(event) {
  if (!event.dinnerEnabled || !event.dinnerStartTime || !event.dinnerEndTime) {
    return [];
  }

  const slots = [];
  const start = new Date(event.dinnerStartTime);
  const end = new Date(event.dinnerEndTime);
  const intervalMs = (event.dinnerSeatingIntervalHours || 2) * 60 * 60 * 1000;

  let current = new Date(start);
  while (current <= end) {
    slots.push(new Date(current).toISOString());
    current = new Date(current.getTime() + intervalMs);
  }

  return slots;
}

// Get seat counts per time slot
export function getDinnerSlotCounts(eventId) {
  const event = findEventById(eventId);
  if (!event || !event.dinnerEnabled) return {};

  const slots = generateDinnerTimeSlots(event);
  const slotCounts = {};

  slots.forEach((slotTime) => {
    const confirmed = rsvps
      .filter(
        (r) =>
          r.eventId === eventId &&
          r.wantsDinner &&
          r.dinnerTimeSlot === slotTime &&
          r.dinnerStatus === "confirmed"
      )
      .reduce((sum, r) => sum + (r.partySize || 1), 0);

    const waitlist = rsvps
      .filter(
        (r) =>
          r.eventId === eventId &&
          r.wantsDinner &&
          r.dinnerTimeSlot === slotTime &&
          r.dinnerStatus === "waitlist"
      )
      .reduce((sum, r) => sum + (r.partySize || 1), 0);

    slotCounts[slotTime] = { confirmed, waitlist };
  });

  return slotCounts;
}

// Dinner seat counts (legacy - total across all slots)
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

// plusOnes = 0–3, wantsDinner = boolean, dinnerTimeSlot = ISO string, dinnerPartySize = number
export function addRsvp({
  slug,
  name,
  email,
  plusOnes = 0,
  wantsDinner = false,
  dinnerTimeSlot = null,
  dinnerPartySize = null,
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

  // Dinner allocation with time slots
  let dinnerStatus = null;
  let finalWantsDinner = !!wantsDinner && !!event.dinnerEnabled;
  let finalDinnerTimeSlot = null;
  let finalDinnerPartySize = partySize;

  if (finalWantsDinner) {
    // Use provided dinner party size if specified, otherwise use event party size
    if (dinnerPartySize !== null && Number.isFinite(dinnerPartySize)) {
      finalDinnerPartySize = Math.max(1, Math.floor(Number(dinnerPartySize)));
    }

    // Validate time slot
    const availableSlots = generateDinnerTimeSlots(event);
    if (dinnerTimeSlot && availableSlots.includes(dinnerTimeSlot)) {
      finalDinnerTimeSlot = dinnerTimeSlot;
    } else if (availableSlots.length > 0) {
      // Default to first available slot if none specified
      finalDinnerTimeSlot = availableSlots[0];
    }

    if (finalDinnerTimeSlot) {
      // Check capacity for this specific time slot
      const slotCounts = getDinnerSlotCounts(event.id);
      const slotData = slotCounts[finalDinnerTimeSlot] || {
        confirmed: 0,
        waitlist: 0,
      };

      if (event.dinnerMaxSeatsPerSlot) {
        // Limited seats per slot
        if (
          status === "attending" &&
          slotData.confirmed + finalDinnerPartySize <=
            event.dinnerMaxSeatsPerSlot
        ) {
          dinnerStatus = "confirmed";
        } else {
          // Check overflow action
          if (event.dinnerOverflowAction === "cocktails") {
            dinnerStatus = "cocktails"; // Invite for cocktails instead
          } else if (event.dinnerOverflowAction === "both") {
            dinnerStatus = "cocktails_waitlist"; // Both cocktails and waitlist
          } else {
            dinnerStatus = "waitlist"; // Default waitlist
          }
        }
      } else {
        // Unlimited seats per slot
        dinnerStatus = status === "attending" ? "confirmed" : "waitlist";
      }
    } else {
      // No valid time slot available
      finalWantsDinner = false;
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
    dinnerTimeSlot: finalDinnerTimeSlot, // ISO datetime string
    dinnerPartySize: finalWantsDinner ? finalDinnerPartySize : null,
    createdAt: new Date().toISOString(),
  };

  rsvps.push(rsvp);

  return { event, rsvp };
}

export function getRsvpsForEvent(eventId) {
  return rsvps.filter((r) => r.eventId === eventId);
}

// Find RSVP by ID
export function findRsvpById(rsvpId) {
  return rsvps.find((r) => r.id === rsvpId) || null;
}

// Update RSVP
export function updateRsvp(rsvpId, updates) {
  const idx = rsvps.findIndex((r) => r.id === rsvpId);
  if (idx === -1) return { error: "not_found" };

  const rsvp = rsvps[idx];
  const event = findEventById(rsvp.eventId);
  if (!event) return { error: "event_not_found" };

  // Validate email if provided
  if (updates.email && !isValidEmail(updates.email.trim())) {
    return { error: "invalid_email" };
  }

  // Handle plus-ones update
  let plusOnes = rsvp.plusOnes;
  if (updates.plusOnes !== undefined) {
    const maxPlus =
      typeof event.maxPlusOnesPerGuest === "number"
        ? event.maxPlusOnesPerGuest
        : 0;
    plusOnes = Math.max(
      0,
      Math.min(
        maxPlus,
        Number.isFinite(updates.plusOnes) ? updates.plusOnes : 0
      )
    );
  }
  const partySize = 1 + plusOnes;

  // Handle dinner party size update
  let dinnerPartySize = rsvp.dinnerPartySize || partySize;
  if (updates.dinnerPartySize !== undefined) {
    dinnerPartySize = Math.max(
      1,
      Math.floor(Number(updates.dinnerPartySize) || partySize)
    );
  }

  // Recalculate status based on capacity
  const { attending } = getEventCounts(event.id);
  const currentAttending = rsvps
    .filter(
      (r) =>
        r.eventId === event.id && r.status === "attending" && r.id !== rsvpId
    )
    .reduce((sum, r) => sum + (r.partySize || 1), 0);

  let status = rsvp.status;
  if (updates.status !== undefined) {
    status = updates.status;
  } else {
    // Auto-determine status based on capacity
    if (
      event.maxAttendees &&
      currentAttending + partySize > event.maxAttendees
    ) {
      if (event.waitlistEnabled) {
        status = "waitlist";
      } else {
        return { error: "full" };
      }
    } else {
      status = "attending";
    }
  }

  // Handle dinner status updates
  let wantsDinner = rsvp.wantsDinner;
  let dinnerStatus = rsvp.dinnerStatus;
  let dinnerTimeSlot = rsvp.dinnerTimeSlot;

  if (updates.wantsDinner !== undefined) {
    wantsDinner = !!updates.wantsDinner && !!event.dinnerEnabled;

    if (wantsDinner) {
      // Validate time slot if provided
      if (updates.dinnerTimeSlot) {
        const availableSlots = generateDinnerTimeSlots(event);
        if (availableSlots.includes(updates.dinnerTimeSlot)) {
          dinnerTimeSlot = updates.dinnerTimeSlot;
        }
      } else if (!dinnerTimeSlot && event.dinnerEnabled) {
        // Default to first available slot
        const availableSlots = generateDinnerTimeSlots(event);
        if (availableSlots.length > 0) {
          dinnerTimeSlot = availableSlots[0];
        }
      }

      // Recalculate dinner status
      if (dinnerTimeSlot) {
        const slotCounts = getDinnerSlotCounts(event.id);
        const slotData = slotCounts[dinnerTimeSlot] || {
          confirmed: 0,
          waitlist: 0,
        };

        // Exclude current RSVP from counts
        const currentSlotConfirmed = rsvps
          .filter(
            (r) =>
              r.eventId === event.id &&
              r.wantsDinner &&
              r.dinnerTimeSlot === dinnerTimeSlot &&
              r.dinnerStatus === "confirmed" &&
              r.id !== rsvpId
          )
          .reduce((sum, r) => sum + (r.dinnerPartySize || r.partySize || 1), 0);

        if (event.dinnerMaxSeatsPerSlot) {
          if (
            status === "attending" &&
            currentSlotConfirmed + dinnerPartySize <=
              event.dinnerMaxSeatsPerSlot
          ) {
            dinnerStatus = "confirmed";
          } else {
            if (event.dinnerOverflowAction === "cocktails") {
              dinnerStatus = "cocktails";
            } else if (event.dinnerOverflowAction === "both") {
              dinnerStatus = "cocktails_waitlist";
            } else {
              dinnerStatus = "waitlist";
            }
          }
        } else {
          dinnerStatus = status === "attending" ? "confirmed" : "waitlist";
        }
      }
    } else {
      dinnerStatus = null;
      dinnerTimeSlot = null;
      dinnerPartySize = null;
    }
  }

  // Update the RSVP
  rsvps[idx] = {
    ...rsvp,
    ...(updates.name !== undefined && { name: updates.name || null }),
    ...(updates.email !== undefined && {
      email: updates.email.trim().toLowerCase(),
    }),
    status,
    plusOnes,
    partySize,
    wantsDinner,
    dinnerStatus,
    dinnerTimeSlot,
    dinnerPartySize: wantsDinner ? dinnerPartySize : null,
  };

  return { rsvp: rsvps[idx] };
}

// Delete RSVP
export function deleteRsvp(rsvpId) {
  const idx = rsvps.findIndex((r) => r.id === rsvpId);
  if (idx === -1) return { error: "not_found" };

  const rsvp = rsvps[idx];
  rsvps.splice(idx, 1);

  return { success: true, rsvp };
}
