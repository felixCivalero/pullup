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
    maxPlusOnesPerGuest: 5, // 0 = no plus-ones, 1–5 allowed

    // NEW: dinner add-on
    dinnerEnabled: false,
    dinnerStartTime: null, // ISO datetime string for dinner start
    dinnerEndTime: null, // ISO datetime string for dinner end
    dinnerSeatingIntervalHours: 2, // hours between seatings (default 2)
    dinnerMaxSeatsPerSlot: null, // max seats per time slot (null = unlimited)
    dinnerOverflowAction: "waitlist", // "waitlist" | "cocktails" | "both"

    // Stripe fields
    ticketPrice: null,

    // Capacity fields
    cocktailCapacity: 100, // Cocktail capacity (from maxAttendees)
    foodCapacity: null, // Food capacity (null when dinner disabled)
    totalCapacity: 100, // Total capacity (cocktail + food)

    createdAt: new Date().toISOString(),
  },
];

// People/Contacts table - unique by email
export const people = [];

// RSVPs table - links people to events
export const rsvps = [];

// Payments table - stores payment records
export const payments = [];

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

  // Stripe fields
  ticketPrice = null, // Price in cents (e.g., 2000 = $20.00)
  stripeProductId = null,
  stripePriceId = null,

  // Capacity fields
  cocktailCapacity = null,
  foodCapacity = null,
  totalCapacity = null,
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
        ? Math.max(0, Math.min(5, maxPlusOnesPerGuest))
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

    // Stripe fields
    ticketPrice:
      ticketType === "paid" && ticketPrice ? Number(ticketPrice) : null,
    stripeProductId: stripeProductId || null,
    stripePriceId: stripePriceId || null,

    // Capacity fields
    cocktailCapacity: cocktailCapacity ? Number(cocktailCapacity) : null,
    foodCapacity: foodCapacity ? Number(foodCapacity) : null,
    totalCapacity: totalCapacity ? Number(totalCapacity) : null,
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
  // Use totalGuests for accurate capacity counting (accounts for dinner overlaps)
  const attending = rsvps
    .filter((r) => r.eventId === eventId && r.status === "attending")
    .reduce((sum, r) => sum + (r.totalGuests ?? r.partySize ?? 1), 0);

  const waitlist = rsvps
    .filter((r) => r.eventId === eventId && r.status === "waitlist")
    .reduce((sum, r) => sum + (r.totalGuests ?? r.partySize ?? 1), 0);

  return { attending, waitlist };
}

// Calculate cocktails-only count (people attending cocktails but not confirmed for dinner)
export function getCocktailsOnlyCount(eventId) {
  return rsvps
    .filter((r) => r.eventId === eventId && r.status === "attending")
    .reduce((sum, r) => {
      const totalGuests = r.totalGuests ?? r.partySize ?? 1;
      const dinnerPartySize = r.dinnerPartySize || r.partySize || 1;

      // If confirmed for dinner: cocktailsOnly = totalGuests - dinnerPartySize
      // If not confirmed for dinner: cocktailsOnly = totalGuests
      if (r.wantsDinner && r.dinnerStatus === "confirmed") {
        return sum + Math.max(0, totalGuests - dinnerPartySize);
      } else {
        return sum + totalGuests;
      }
    }, 0);
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
    // Use dinnerPartySize for accurate slot capacity counting
    const confirmed = rsvps
      .filter(
        (r) =>
          r.eventId === eventId &&
          r.wantsDinner &&
          r.dinnerTimeSlot === slotTime &&
          r.dinnerStatus === "confirmed"
      )
      .reduce((sum, r) => sum + (r.dinnerPartySize || r.partySize || 1), 0);

    const waitlist = rsvps
      .filter(
        (r) =>
          r.eventId === eventId &&
          r.wantsDinner &&
          r.dinnerTimeSlot === slotTime &&
          r.dinnerStatus === "waitlist"
      )
      .reduce((sum, r) => sum + (r.dinnerPartySize || r.partySize || 1), 0);

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

// ---------------------------
// People/Contacts CRUD
// ---------------------------

// Find or create a person by email
export function findOrCreatePerson(email, name = null) {
  const normalizedEmail = email.trim().toLowerCase();

  // Try to find existing person
  let person = people.find((p) => p.email === normalizedEmail);

  if (!person) {
    // Create new person
    person = {
      id: `person_${Date.now()}`,
      email: normalizedEmail,
      name: name || null,
      phone: null,
      notes: null,
      tags: [],
      stripeCustomerId: null, // Will be set when first payment is made
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    people.push(person);
  } else {
    // Update name if provided and different
    if (name && name.trim() && person.name !== name.trim()) {
      person.name = name.trim();
      person.updatedAt = new Date().toISOString();
    }
  }

  return person;
}

// Find person by ID
export function findPersonById(personId) {
  return people.find((p) => p.id === personId) || null;
}

// Find person by email
export function findPersonByEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  return people.find((p) => p.email === normalizedEmail) || null;
}

// Update person
export function updatePerson(personId, updates) {
  const idx = people.findIndex((p) => p.id === personId);
  if (idx === -1) return { error: "not_found" };

  people[idx] = {
    ...people[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  return { person: people[idx] };
}

// Update person's Stripe customer ID
export function updatePersonStripeCustomerId(personId, stripeCustomerId) {
  const idx = people.findIndex((p) => p.id === personId);
  if (idx === -1) return { error: "not_found" };

  people[idx].stripeCustomerId = stripeCustomerId;
  people[idx].updatedAt = new Date().toISOString();

  return { person: people[idx] };
}

// Get all people with their event statistics
export function getAllPeopleWithStats() {
  return people
    .map((person) => {
      const personRsvps = rsvps.filter((r) => r.personId === person.id);

      const eventsAttended = personRsvps.filter(
        (r) => r.status === "attending"
      ).length;
      const eventsWaitlisted = personRsvps.filter(
        (r) => r.status === "waitlist"
      ).length;
      const totalEvents = personRsvps.length;
      const totalGuestsBrought = personRsvps.reduce(
        (sum, r) => sum + (r.plusOnes || 0),
        0
      );
      const totalDinners = personRsvps.filter(
        (r) => r.wantsDinner === true
      ).length;
      const totalDinnerGuests = personRsvps.reduce(
        (sum, r) =>
          sum + (r.wantsDinner && r.dinnerPartySize ? r.dinnerPartySize : 0),
        0
      );

      // Get event details for each RSVP
      const eventHistory = personRsvps
        .map((rsvp) => {
          const event = findEventById(rsvp.eventId);
          return {
            rsvpId: rsvp.id,
            eventId: rsvp.eventId,
            eventTitle: event?.title || "Unknown Event",
            eventSlug: event?.slug || null,
            eventDate: event?.startsAt || null,
            status: rsvp.status,
            plusOnes: rsvp.plusOnes || 0,
            wantsDinner: rsvp.wantsDinner || false,
            dinnerStatus: rsvp.dinnerStatus || null,
            dinnerTimeSlot: rsvp.dinnerTimeSlot || null,
            dinnerPartySize: rsvp.dinnerPartySize || null,
            rsvpDate: rsvp.createdAt,
          };
        })
        .sort((a, b) => {
          // Sort by event date (most recent first)
          if (!a.eventDate) return 1;
          if (!b.eventDate) return -1;
          return new Date(b.eventDate) - new Date(a.eventDate);
        });

      return {
        ...person,
        stats: {
          totalEvents,
          eventsAttended,
          eventsWaitlisted,
          totalGuestsBrought,
          totalDinners,
          totalDinnerGuests,
        },
        eventHistory,
      };
    })
    .sort((a, b) => {
      // Sort by most recent activity (most recent RSVP first)
      const aLatest = a.eventHistory[0]?.rsvpDate || a.createdAt;
      const bLatest = b.eventHistory[0]?.rsvpDate || b.createdAt;
      return new Date(bLatest) - new Date(aLatest);
    });
}

// Helper function to calculate total unique guests
// partySize = cocktail party (booker + plus-ones)
// dinnerPartySize = total dinner party (ALWAYS includes the booker if they want dinner)
function calculateTotalGuests(partySize, dinnerPartySize) {
  if (!dinnerPartySize || dinnerPartySize === 0) {
    return partySize;
  }
  // dinnerPartySize represents TOTAL people for dinner (including booker)
  // The booker is ALWAYS counted in both partySize and dinnerPartySize
  // Formula: cocktail party + dinner party - booker (counted twice)
  return partySize + (dinnerPartySize - 1);
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

  // Find or create person
  const person = findOrCreatePerson(normalizedEmail, name);

  // Check for duplicate RSVP for this event (same person, same event)
  const existingRsvp = rsvps.find(
    (r) => r.eventId === event.id && r.personId === person.id
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

  // Dinner allocation with time slots (needed for capacity calculation)
  let dinnerStatus = null;
  let finalWantsDinner = !!wantsDinner && !!event.dinnerEnabled;
  let finalDinnerTimeSlot = null;
  // dinnerPartySize represents TOTAL people for dinner (including the booker)
  // Defaults to partySize if not specified
  let finalDinnerPartySize = partySize;

  const { attending } = getEventCounts(event.id);

  let status = "attending";

  // Capacity check for cocktail party using cocktailCapacity
  // Use totalGuests for accurate capacity check
  const totalGuestsForCheck = calculateTotalGuests(
    partySize,
    finalWantsDinner ? finalDinnerPartySize : null
  );

  if (
    event.cocktailCapacity != null &&
    attending + totalGuestsForCheck > event.cocktailCapacity
  ) {
    if (event.waitlistEnabled) {
      status = "waitlist";
    } else {
      return { error: "full", event };
    }
  }

  if (finalWantsDinner) {
    // Validate time slot - normalize ISO strings for comparison
    const availableSlots = generateDinnerTimeSlots(event);

    // Normalize the provided dinnerTimeSlot for comparison
    let normalizedDinnerTimeSlot = null;
    if (dinnerTimeSlot) {
      try {
        // Parse and re-stringify to normalize format
        const slotDate = new Date(dinnerTimeSlot);
        if (!isNaN(slotDate.getTime())) {
          normalizedDinnerTimeSlot = slotDate.toISOString();
        }
      } catch (e) {
        console.error("Invalid dinnerTimeSlot format:", dinnerTimeSlot);
      }
    }

    // Find matching slot by comparing normalized ISO strings or exact match
    if (normalizedDinnerTimeSlot) {
      // First try exact string match
      if (availableSlots.includes(normalizedDinnerTimeSlot)) {
        finalDinnerTimeSlot = normalizedDinnerTimeSlot;
      } else {
        // Try date-based comparison (more robust)
        const matchingSlot = availableSlots.find((slot) => {
          try {
            const slotDate = new Date(slot);
            const providedDate = new Date(normalizedDinnerTimeSlot);
            // Compare dates (exact time match)
            return slotDate.getTime() === providedDate.getTime();
          } catch (e) {
            return false;
          }
        });

        if (matchingSlot) {
          finalDinnerTimeSlot = matchingSlot;
        }
      }
    }

    // Only default to first slot if NO slot was provided by user
    // If user provided a slot but it doesn't match, that's an error
    if (!finalDinnerTimeSlot) {
      if (dinnerTimeSlot) {
        // User provided a slot but it doesn't match any available slot
        console.error("Dinner slot mismatch:", {
          provided: dinnerTimeSlot,
          normalized: normalizedDinnerTimeSlot,
          available: availableSlots,
        });
        return {
          error: "invalid_slot",
          message:
            "The selected dinner time slot is not available for this event",
        };
      } else if (availableSlots.length > 0) {
        // No slot provided - default to first available
        finalDinnerTimeSlot = availableSlots[0];
      }
    }

    if (finalDinnerTimeSlot) {
      // Check capacity for this specific time slot
      const slotCounts = getDinnerSlotCounts(event.id);
      const slotData = slotCounts[finalDinnerTimeSlot] || {
        confirmed: 0,
        waitlist: 0,
      };

      if (event.dinnerMaxSeatsPerSlot) {
        // Limited seats per slot - check if there's room
        const availableSeats = event.dinnerMaxSeatsPerSlot - slotData.confirmed;
        if (status === "attending" && finalDinnerPartySize <= availableSeats) {
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

  // Calculate total unique guests
  const totalGuests = calculateTotalGuests(
    partySize,
    finalWantsDinner ? finalDinnerPartySize : null
  );

  const rsvp = {
    id: `rsvp_${Date.now()}`,
    personId: person.id, // Link to person
    eventId: event.id,
    slug,
    status, // "attending" | "waitlist"
    plusOnes: clampedPlusOnes,
    partySize,
    wantsDinner: finalWantsDinner,
    dinnerStatus, // "confirmed" | "waitlist" | null
    dinnerTimeSlot: finalDinnerTimeSlot, // ISO datetime string
    dinnerPartySize: finalWantsDinner ? finalDinnerPartySize : null,
    totalGuests, // Calculated once and stored
    paymentId: null, // Link to payment record
    paymentStatus: event.ticketType === "paid" ? "unpaid" : null, // "unpaid" | "pending" | "paid" | "refunded"
    createdAt: new Date().toISOString(),
  };

  rsvps.push(rsvp);

  return { event, rsvp };
}

export function getRsvpsForEvent(eventId) {
  const eventRsvps = rsvps.filter((r) => r.eventId === eventId);

  // Enrich RSVPs with person data for backward compatibility
  return eventRsvps.map((rsvp) => {
    const person = findPersonById(rsvp.personId);
    return {
      ...rsvp,
      name: person?.name || null,
      email: person?.email || null,
    };
  });
}

// Find RSVP by ID (enriched with person data)
export function findRsvpById(rsvpId) {
  const rsvp = rsvps.find((r) => r.id === rsvpId);
  if (!rsvp) return null;

  // Enrich with person data for backward compatibility
  const person = findPersonById(rsvp.personId);
  return {
    ...rsvp,
    name: person?.name || null,
    email: person?.email || null,
  };
}

// Update RSVP
export function updateRsvp(rsvpId, updates) {
  const idx = rsvps.findIndex((r) => r.id === rsvpId);
  if (idx === -1) return { error: "not_found" };

  const rsvp = rsvps[idx];
  const event = findEventById(rsvp.eventId);
  if (!event) return { error: "event_not_found" };

  // Handle email/name updates - update person record
  if (updates.email || updates.name) {
    const person = findPersonById(rsvp.personId);
    if (!person) return { error: "person_not_found" };

    if (updates.email) {
      const normalizedEmail = updates.email.trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        return { error: "invalid_email" };
      }

      // If email changed, check if person with new email exists
      if (normalizedEmail !== person.email) {
        const existingPerson = findPersonByEmail(normalizedEmail);
        if (existingPerson) {
          // Merge: update RSVP to point to existing person
          rsvp.personId = existingPerson.id;
        } else {
          // Update person's email
          person.email = normalizedEmail;
          person.updatedAt = new Date().toISOString();
        }
      }
    }

    if (updates.name) {
      person.name = updates.name.trim() || null;
      person.updatedAt = new Date().toISOString();
    }
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

  // Handle dinner status updates (need to determine wantsDinner first)
  let wantsDinner = rsvp.wantsDinner;
  if (updates.wantsDinner !== undefined) {
    wantsDinner = !!updates.wantsDinner && !!event.dinnerEnabled;
  }

  // Handle dinner party size update
  let dinnerPartySize = rsvp.dinnerPartySize || partySize;
  if (updates.dinnerPartySize !== undefined) {
    dinnerPartySize = Math.max(
      1,
      Math.floor(Number(updates.dinnerPartySize) || partySize)
    );
  }

  // Calculate total guests for capacity check
  const totalGuestsForCheck = calculateTotalGuests(
    partySize,
    wantsDinner ? dinnerPartySize : null
  );

  // Recalculate status based on capacity
  const { attending } = getEventCounts(event.id);
  const currentAttending = rsvps
    .filter(
      (r) =>
        r.eventId === event.id && r.status === "attending" && r.id !== rsvpId
    )
    .reduce((sum, r) => sum + (r.totalGuests ?? r.partySize ?? 1), 0);

  let status = rsvp.status;
  if (updates.status !== undefined) {
    status = updates.status;
  } else {
    // Auto-determine status based on cocktail capacity
    if (
      event.cocktailCapacity != null &&
      currentAttending + totalGuestsForCheck > event.cocktailCapacity
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

  // Handle dinner status updates (wantsDinner already determined above)
  let dinnerStatus = rsvp.dinnerStatus;
  let dinnerTimeSlot = rsvp.dinnerTimeSlot;

  if (updates.wantsDinner !== undefined) {
    // wantsDinner already updated above, but handle time slot validation

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
          // Check if there's room in the slot
          const availableSeats =
            event.dinnerMaxSeatsPerSlot - currentSlotConfirmed;
          if (status === "attending" && dinnerPartySize <= availableSeats) {
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

  // Calculate total unique guests
  const totalGuests = calculateTotalGuests(
    partySize,
    wantsDinner ? dinnerPartySize : null
  );

  // Update the RSVP
  rsvps[idx] = {
    ...rsvp,
    status,
    plusOnes,
    partySize,
    wantsDinner,
    dinnerStatus,
    dinnerTimeSlot,
    dinnerPartySize: wantsDinner ? dinnerPartySize : null,
    totalGuests, // Recalculated and stored
  };

  // Return enriched RSVP with person data
  const updatedRsvp = rsvps[idx];
  const person = findPersonById(updatedRsvp.personId);
  return {
    rsvp: {
      ...updatedRsvp,
      name: person?.name || null,
      email: person?.email || null,
    },
  };
}

// Delete RSVP
export function deleteRsvp(rsvpId) {
  const idx = rsvps.findIndex((r) => r.id === rsvpId);
  if (idx === -1) return { error: "not_found" };

  const rsvp = rsvps[idx];
  // Enrich with person data before returning
  const person = findPersonById(rsvp.personId);
  const enrichedRsvp = {
    ...rsvp,
    name: person?.name || null,
    email: person?.email || null,
  };

  rsvps.splice(idx, 1);

  return { success: true, rsvp: enrichedRsvp };
}

// ---------------------------
// Payment CRUD
// ---------------------------

// Create payment record
export function createPayment({
  userId,
  eventId,
  rsvpId = null,
  stripePaymentIntentId,
  stripeCustomerId,
  stripeChargeId = null,
  stripeCheckoutSessionId = null,
  amount,
  currency = "usd",
  status = "pending",
  paymentMethod = null,
  description = null,
  receiptUrl = null,
}) {
  const payment = {
    id: `payment_${Date.now()}`,
    userId,
    eventId,
    rsvpId,
    stripePaymentIntentId,
    stripeCustomerId,
    stripeChargeId,
    stripeCheckoutSessionId,
    amount: Number(amount),
    currency,
    status, // "pending" | "succeeded" | "failed" | "refunded" | "canceled"
    paymentMethod,
    description,
    receiptUrl,
    refundedAmount: 0,
    refundedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paidAt: null,
    metadata: {},
  };

  payments.push(payment);

  // Link payment to RSVP if provided
  if (rsvpId) {
    const rsvpIdx = rsvps.findIndex((r) => r.id === rsvpId);
    if (rsvpIdx !== -1) {
      rsvps[rsvpIdx].paymentId = payment.id;
      rsvps[rsvpIdx].paymentStatus =
        status === "succeeded" ? "paid" : "pending";
    }
  }

  return payment;
}

// Find payment by ID
export function findPaymentById(paymentId) {
  return payments.find((p) => p.id === paymentId) || null;
}

// Find payment by Stripe Payment Intent ID
export function findPaymentByStripePaymentIntentId(stripePaymentIntentId) {
  return (
    payments.find((p) => p.stripePaymentIntentId === stripePaymentIntentId) ||
    null
  );
}

// Find payment by Stripe Charge ID
export function findPaymentByStripeChargeId(stripeChargeId) {
  return payments.find((p) => p.stripeChargeId === stripeChargeId) || null;
}

// Update payment
export function updatePayment(paymentId, updates) {
  const idx = payments.findIndex((p) => p.id === paymentId);
  if (idx === -1) return { error: "not_found" };

  payments[idx] = {
    ...payments[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // Update linked RSVP payment status
  if (payments[idx].rsvpId) {
    const rsvpIdx = rsvps.findIndex((r) => r.id === payments[idx].rsvpId);
    if (rsvpIdx !== -1) {
      const paymentStatus = payments[idx].status;
      if (paymentStatus === "succeeded") {
        rsvps[rsvpIdx].paymentStatus = "paid";
      } else if (paymentStatus === "refunded") {
        rsvps[rsvpIdx].paymentStatus = "refunded";
      } else if (paymentStatus === "failed" || paymentStatus === "canceled") {
        rsvps[rsvpIdx].paymentStatus = "unpaid";
      }
    }
  }

  return { payment: payments[idx] };
}

// Get payments for user
export function getPaymentsForUser(userId) {
  return payments.filter((p) => p.userId === userId);
}

// Get payments for event
export function getPaymentsForEvent(eventId) {
  return payments.filter((p) => p.eventId === eventId);
}
