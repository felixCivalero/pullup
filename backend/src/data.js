// backend/src/data.js

// ---------------------------
// In-memory data
// ---------------------------
export const events = [];

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
    dinnerOverflowAction: "waitlist", // Always use waitlist (removed cocktails/both options)

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

// Count confirmed / waitlist based on partySize
export function getEventCounts(eventId) {
  // Use totalGuests for accurate capacity counting (accounts for dinner overlaps)
  const confirmed = rsvps
    .filter(
      (r) =>
        r.eventId === eventId &&
        (r.bookingStatus === "CONFIRMED" || r.status === "attending")
    )
    .reduce((sum, r) => sum + (r.totalGuests ?? r.partySize ?? 1), 0);

  const waitlist = rsvps
    .filter(
      (r) =>
        r.eventId === eventId &&
        (r.bookingStatus === "WAITLIST" || r.status === "waitlist")
    )
    .reduce((sum, r) => sum + (r.totalGuests ?? r.partySize ?? 1), 0);

  return { confirmed, waitlist };
}

// Calculate cocktails-only count (people attending cocktails but not confirmed for dinner)
export function getCocktailsOnlyCount(eventId) {
  return rsvps
    .filter(
      (r) =>
        r.eventId === eventId &&
        (r.bookingStatus === "CONFIRMED" || r.status === "attending")
    )
    .reduce((sum, r) => {
      const wantsDinner = r.dinner?.enabled || r.wantsDinner || false;
      const plusOnes = r.plusOnes ?? 0;
      const partySize = r.partySize ?? 1;

      // DYNAMIC PARTY COMPOSITION SYSTEM: Calculate cocktails-only count
      return sum + calculateCocktailsOnly(wantsDinner, partySize, plusOnes);
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
      .filter((r) => {
        const hasDinner = r.dinner?.enabled || r.wantsDinner;
        const slotMatches =
          r.dinner?.slotTime === slotTime || r.dinnerTimeSlot === slotTime;
        const isConfirmed =
          r.dinner?.bookingStatus === "CONFIRMED" ||
          r.dinnerStatus === "confirmed";
        return r.eventId === eventId && hasDinner && slotMatches && isConfirmed;
      })
      .reduce(
        (sum, r) =>
          sum + (r.dinner?.partySize || r.dinnerPartySize || r.partySize || 1),
        0
      );

    const waitlist = rsvps
      .filter((r) => {
        const hasDinner = r.dinner?.enabled || r.wantsDinner;
        const slotMatches =
          r.dinner?.slotTime === slotTime || r.dinnerTimeSlot === slotTime;
        const isWaitlist =
          r.dinner?.bookingStatus === "WAITLIST" ||
          r.dinnerStatus === "waitlist";
        return r.eventId === eventId && hasDinner && slotMatches && isWaitlist;
      })
      .reduce(
        (sum, r) =>
          sum + (r.dinner?.partySize || r.dinnerPartySize || r.partySize || 1),
        0
      );

    slotCounts[slotTime] = { confirmed, waitlist };
  });

  return slotCounts;
}

// Dinner seat counts (legacy - total across all slots)
export function getDinnerCounts(eventId) {
  const dinnerConfirmedSeats = rsvps
    .filter((r) => {
      const hasDinner = r.dinner?.enabled || r.wantsDinner;
      const isConfirmed =
        r.dinner?.bookingStatus === "CONFIRMED" ||
        r.dinnerStatus === "confirmed";
      return r.eventId === eventId && hasDinner && isConfirmed;
    })
    .reduce((sum, r) => sum + (r.partySize || 1), 0);

  const dinnerWaitlistSeats = rsvps
    .filter((r) => {
      const hasDinner = r.dinner?.enabled || r.wantsDinner;
      const isWaitlist =
        r.dinner?.bookingStatus === "WAITLIST" || r.dinnerStatus === "waitlist";
      return r.eventId === eventId && hasDinner && isWaitlist;
    })
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
        (r) => r.bookingStatus === "CONFIRMED" || r.status === "attending"
      ).length;
      const eventsWaitlisted = personRsvps.filter(
        (r) => r.bookingStatus === "WAITLIST" || r.status === "waitlist"
      ).length;
      const totalEvents = personRsvps.length;
      const totalGuestsBrought = personRsvps.reduce(
        (sum, r) => sum + (r.plusOnes || 0),
        0
      );
      const totalDinners = personRsvps.filter(
        (r) => r.dinner?.enabled || r.wantsDinner === true
      ).length;
      const totalDinnerGuests = personRsvps.reduce(
        (sum, r) =>
          sum +
          ((r.dinner?.enabled || r.wantsDinner) &&
          (r.dinner?.partySize || r.dinnerPartySize)
            ? r.dinner?.partySize || r.dinnerPartySize
            : 0),
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
            status: rsvp.bookingStatus || rsvp.status,
            plusOnes: rsvp.plusOnes || 0,
            wantsDinner: rsvp.dinner?.enabled || rsvp.wantsDinner || false,
            dinnerStatus:
              rsvp.dinner?.bookingStatus || rsvp.dinnerStatus || null,
            dinnerTimeSlot:
              rsvp.dinner?.slotTime || rsvp.dinnerTimeSlot || null,
            dinnerPartySize:
              rsvp.dinner?.partySize || rsvp.dinnerPartySize || null,
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

// ============================================================================
// DYNAMIC PARTY COMPOSITION SYSTEM (DPCS)
// ============================================================================
// This is a CRITICAL system that enables flexible guest allocation:
// - When NO dinner: partySize = 1 (booker) + plusOnes (cocktails-only)
// - When dinner IS selected: partySize = dinnerPartySize (includes booker) + plusOnes (cocktails-only)
//
// Key principle: The booker is automatically included in dinnerPartySize when dinner is selected.
// This allows a dinner party of 4 to have +3 people on the cocktail list (total = 7).
// ============================================================================

/**
 * Calculate total party size using Dynamic Party Composition System
 * @param {boolean} wantsDinner - Whether dinner is selected
 * @param {number} dinnerPartySize - Number of people for dinner (includes booker if wantsDinner)
 * @param {number} plusOnes - Number of cocktails-only guests
 * @returns {number} Total party size
 */
function calculatePartySize(wantsDinner, dinnerPartySize, plusOnes) {
  if (wantsDinner) {
    // Dinner includes booker, add cocktails-only guests
    return dinnerPartySize + plusOnes;
  } else {
    // No dinner: booker + cocktails-only guests
    return 1 + plusOnes;
  }
}

/**
 * Calculate cocktails-only count using Dynamic Party Composition System
 * @param {boolean} wantsDinner - Whether dinner is selected
 * @param {number} partySize - Total party size
 * @param {number} plusOnes - Number of cocktails-only guests
 * @returns {number} Number of cocktails-only guests
 */
function calculateCocktailsOnly(wantsDinner, partySize, plusOnes) {
  if (wantsDinner) {
    // Only plusOnes are cocktails-only (dinnerPartySize goes to dinner)
    return plusOnes;
  } else {
    // Entire party is cocktails-only (booker + plusOnes)
    return partySize;
  }
}

// Legacy helper: totalGuests should just be partySize
function calculateTotalGuests(partySize, dinnerPartySize) {
  // With the new model, total unique guests is always partySize
  return partySize;
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

  // Dinner allocation with time slots (needed for capacity calculation)
  let dinnerStatus = null;
  let finalWantsDinner = !!wantsDinner && !!event.dinnerEnabled;
  let finalDinnerTimeSlot = null;
  // dinnerPartySize represents TOTAL people for dinner (including the booker)
  // Use provided dinnerPartySize if specified, otherwise default to 0 (no dinner)
  let finalDinnerPartySize = 0;
  if (
    dinnerPartySize !== null &&
    dinnerPartySize !== undefined &&
    finalWantsDinner
  ) {
    finalDinnerPartySize = Math.max(
      1,
      Math.floor(Number(dinnerPartySize) || 1)
    );
  }

  // DYNAMIC PARTY COMPOSITION SYSTEM: Calculate partySize
  const finalPlusOnes = clampedPlusOnes; // Keep original plusOnes (cocktails-only)
  const partySize = calculatePartySize(
    finalWantsDinner,
    finalDinnerPartySize,
    clampedPlusOnes
  );

  const { confirmed } = getEventCounts(event.id);

  // Calculate current cocktails-only count (all existing confirmed RSVPs)
  const currentCocktailsOnly = getCocktailsOnlyCount(event.id);

  let bookingStatus = "CONFIRMED";

  // DYNAMIC PARTY COMPOSITION SYSTEM: Calculate cocktails-only spots for this booking
  const cocktailsOnlyForThisBooking = calculateCocktailsOnly(
    finalWantsDinner,
    partySize,
    finalPlusOnes
  );

  // Check if there's enough cocktail capacity (all-or-nothing)
  // Compare: current cocktails-only + new booking's cocktails-only vs capacity
  if (
    event.cocktailCapacity != null &&
    currentCocktailsOnly + cocktailsOnlyForThisBooking > event.cocktailCapacity
  ) {
    if (event.waitlistEnabled) {
      bookingStatus = "WAITLIST";
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
        // Limited seats per slot - all-or-nothing: entire party goes to waitlist if capacity exceeded
        const availableSeats = event.dinnerMaxSeatsPerSlot - slotData.confirmed;

        // Check dinner capacity independently first (per documentation)
        if (finalDinnerPartySize > availableSeats) {
          // Dinner capacity exceeded - all-or-nothing
          dinnerStatus = "WAITLIST";
          bookingStatus = "WAITLIST";
        } else {
          // Dinner capacity OK - confirm dinner only if event-level booking is still confirmed
          dinnerStatus =
            bookingStatus === "CONFIRMED" ? "CONFIRMED" : "WAITLIST";
        }
      } else {
        // Unlimited seats per slot - follow event-level booking status
        dinnerStatus = bookingStatus === "CONFIRMED" ? "CONFIRMED" : "WAITLIST";
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
    bookingStatus, // "CONFIRMED" | "WAITLIST" | "CANCELLED"
    status:
      bookingStatus === "CONFIRMED"
        ? "attending"
        : bookingStatus === "WAITLIST"
        ? "waitlist"
        : "cancelled", // Backward compatibility
    plusOnes: finalPlusOnes,
    partySize,
    dinner: finalWantsDinner
      ? {
          enabled: true,
          partySize: finalDinnerPartySize,
          slotTime: finalDinnerTimeSlot,
          bookingStatus: dinnerStatus, // "CONFIRMED" | "WAITLIST"
        }
      : null,
    // Backward compatibility fields
    wantsDinner: finalWantsDinner,
    dinnerStatus:
      dinnerStatus === "CONFIRMED"
        ? "confirmed"
        : dinnerStatus === "WAITLIST"
        ? "waitlist"
        : null,
    dinnerTimeSlot: finalDinnerTimeSlot,
    dinnerPartySize: finalWantsDinner ? finalDinnerPartySize : null,
    totalGuests, // Calculated once and stored
    paymentId: null, // Link to payment record
    paymentStatus: event.ticketType === "paid" ? "unpaid" : null, // "unpaid" | "pending" | "paid" | "refunded"
    dinnerPullUpCount: 0, // Number of dinner guests who have arrived
    cocktailOnlyPullUpCount: 0, // Number of cocktails-only guests who have arrived
    // Backward compatibility fields
    pulledUp: false,
    pulledUpCount: null,
    pulledUpForDinner: null,
    pulledUpForCocktails: null,
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
  let partySize = 1 + plusOnes;

  // Handle dinner status updates (need to determine wantsDinner first)
  let wantsDinner = rsvp.wantsDinner;
  if (updates.wantsDinner !== undefined) {
    wantsDinner = !!updates.wantsDinner && !!event.dinnerEnabled;
  }

  // Handle dinner party size update
  let dinnerPartySize = 0;
  if (wantsDinner) {
    dinnerPartySize = rsvp.dinnerPartySize || 0;
    if (updates.dinnerPartySize !== undefined) {
      dinnerPartySize = Math.max(
        1,
        Math.floor(Number(updates.dinnerPartySize) || 1)
      );
    }
  }

  // DYNAMIC PARTY COMPOSITION SYSTEM: Calculate partySize
  partySize = calculatePartySize(wantsDinner, dinnerPartySize, plusOnes);

  // Calculate total guests for capacity check
  const totalGuestsForCheck = calculateTotalGuests(
    partySize,
    wantsDinner ? dinnerPartySize : null
  );

  // Recalculate bookingStatus based on capacity
  const { confirmed } = getEventCounts(event.id);

  // Calculate current cocktails-only count (excluding this RSVP)
  const currentCocktailsOnly = rsvps
    .filter(
      (r) =>
        r.eventId === event.id &&
        (r.bookingStatus === "CONFIRMED" || r.status === "attending") &&
        r.id !== rsvpId
    )
    .reduce((sum, r) => {
      const wantsDinner = r.dinner?.enabled || r.wantsDinner || false;
      const plusOnes = r.plusOnes ?? 0;
      const partySize = r.partySize ?? 1;

      // DYNAMIC PARTY COMPOSITION SYSTEM: Calculate cocktails-only count
      return sum + calculateCocktailsOnly(wantsDinner, partySize, plusOnes);
    }, 0);

  // DYNAMIC PARTY COMPOSITION SYSTEM: Calculate cocktails-only spots for this booking
  const cocktailsOnlyForThisBooking = calculateCocktailsOnly(
    wantsDinner,
    partySize,
    plusOnes
  );

  let bookingStatus =
    rsvp.bookingStatus ||
    (rsvp.status === "attending"
      ? "CONFIRMED"
      : rsvp.status === "waitlist"
      ? "WAITLIST"
      : "CANCELLED");
  if (updates.bookingStatus !== undefined) {
    bookingStatus = updates.bookingStatus;
  } else if (updates.status !== undefined) {
    // Backward compatibility: convert old status to bookingStatus
    bookingStatus =
      updates.status === "attending"
        ? "CONFIRMED"
        : updates.status === "waitlist"
        ? "WAITLIST"
        : "CANCELLED";
  } else {
    // Auto-determine bookingStatus based on cocktail capacity (all-or-nothing)
    if (
      event.cocktailCapacity != null &&
      currentCocktailsOnly + cocktailsOnlyForThisBooking >
        event.cocktailCapacity
    ) {
      if (event.waitlistEnabled) {
        bookingStatus = "WAITLIST";
      } else {
        return { error: "full" };
      }
    } else {
      bookingStatus = "CONFIRMED";
    }
  }

  // Rule: If bookingStatus !== "CONFIRMED", reset pull-up counts to 0 (unless explicitly updating them)
  if (bookingStatus !== "CONFIRMED") {
    // Only reset if not explicitly updating pull-up counts (to allow clearing them)
    if (
      updates.dinnerPullUpCount === undefined &&
      updates.pulledUpForDinner === undefined
    ) {
      dinnerPullUpCount = 0;
      pulledUpForDinner = null;
    }
    if (
      updates.cocktailOnlyPullUpCount === undefined &&
      updates.pulledUpForCocktails === undefined
    ) {
      cocktailOnlyPullUpCount = 0;
      pulledUpForCocktails = null;
    }
  }

  // Backward compatibility: derive status from bookingStatus
  const status =
    bookingStatus === "CONFIRMED"
      ? "attending"
      : bookingStatus === "WAITLIST"
      ? "waitlist"
      : "cancelled";

  // Handle dinner status updates (wantsDinner already determined above)
  let dinnerBookingStatus =
    rsvp.dinner?.bookingStatus ||
    (rsvp.dinnerStatus === "confirmed"
      ? "CONFIRMED"
      : rsvp.dinnerStatus === "waitlist"
      ? "WAITLIST"
      : null);
  let dinnerTimeSlot = rsvp.dinner?.slotTime || rsvp.dinnerTimeSlot;

  if (
    updates.wantsDinner !== undefined ||
    updates["dinner.bookingStatus"] !== undefined ||
    updates.dinnerTimeSlot !== undefined
  ) {
    // wantsDinner already updated above, but handle time slot validation

    if (wantsDinner) {
      // Validate time slot if provided
      if (
        updates.dinnerTimeSlot !== undefined ||
        updates["dinner.slotTime"] !== undefined
      ) {
        const slotToUse = updates.dinnerTimeSlot || updates["dinner.slotTime"];
        const availableSlots = generateDinnerTimeSlots(event);
        if (slotToUse && availableSlots.includes(slotToUse)) {
          dinnerTimeSlot = slotToUse;
        }
      } else if (!dinnerTimeSlot && event.dinnerEnabled) {
        // Default to first available slot
        const availableSlots = generateDinnerTimeSlots(event);
        if (availableSlots.length > 0) {
          dinnerTimeSlot = availableSlots[0];
        }
      }

      // Recalculate dinner bookingStatus
      if (dinnerTimeSlot) {
        // Get the old slot (before update) to properly exclude from old slot count
        const oldDinnerTimeSlot = rsvp.dinner?.slotTime || rsvp.dinnerTimeSlot;
        const slotCounts = getDinnerSlotCounts(event.id);
        const slotData = slotCounts[dinnerTimeSlot] || {
          confirmed: 0,
          waitlist: 0,
        };

        // Exclude current RSVP from new slot's confirmed count
        // Also need to account for old slot if it's different
        const currentSlotConfirmed = rsvps
          .filter((r) => {
            const hasDinner = r.dinner?.enabled || r.wantsDinner;
            const slotMatches =
              (r.dinner?.slotTime || r.dinnerTimeSlot) === dinnerTimeSlot;
            const isConfirmed =
              r.dinner?.bookingStatus === "CONFIRMED" ||
              r.dinnerStatus === "confirmed";
            return (
              r.eventId === event.id &&
              hasDinner &&
              slotMatches &&
              isConfirmed &&
              r.id !== rsvpId // Exclude current RSVP
            );
          })
          .reduce(
            (sum, r) =>
              sum +
              (r.dinner?.partySize || r.dinnerPartySize || r.partySize || 1),
            0
          );

        // If slot changed and old slot had this RSVP confirmed, we've already excluded it above
        // The slotData from getDinnerSlotCounts includes the old slot count, but we exclude
        // the current RSVP from currentSlotConfirmed, so the calculation is correct

        if (updates["dinner.bookingStatus"] !== undefined) {
          dinnerBookingStatus = updates["dinner.bookingStatus"];
        } else if (event.dinnerMaxSeatsPerSlot) {
          // Check if there's room in the slot (all-or-nothing)
          // Check dinner capacity independently first (per documentation)
          const availableSeats =
            event.dinnerMaxSeatsPerSlot - currentSlotConfirmed;

          if (dinnerPartySize > availableSeats) {
            // Dinner capacity exceeded - all-or-nothing
            dinnerBookingStatus = "WAITLIST";
            bookingStatus = "WAITLIST";
          } else {
            // Dinner capacity OK - confirm dinner only if event-level booking is still confirmed
            dinnerBookingStatus =
              bookingStatus === "CONFIRMED" ? "CONFIRMED" : "WAITLIST";
          }
        } else {
          dinnerBookingStatus =
            bookingStatus === "CONFIRMED" ? "CONFIRMED" : "WAITLIST";
        }
      }
    } else {
      dinnerBookingStatus = null;
      dinnerTimeSlot = null;
      dinnerPartySize = null;
    }
  }
  // Backward compatibility: derive dinnerStatus from dinnerBookingStatus
  const dinnerStatus =
    dinnerBookingStatus === "CONFIRMED"
      ? "confirmed"
      : dinnerBookingStatus === "WAITLIST"
      ? "waitlist"
      : null;

  // Calculate total unique guests (always partySize with new model)
  const totalGuests = partySize;

  // Handle pulled up status updates
  let dinnerPullUpCount = rsvp.dinnerPullUpCount ?? rsvp.pulledUpForDinner ?? 0;
  let cocktailOnlyPullUpCount =
    rsvp.cocktailOnlyPullUpCount ?? rsvp.pulledUpForCocktails ?? 0;

  // Backward compatibility: also check old field names
  let pulledUpForDinner = rsvp.pulledUpForDinner ?? null;
  let pulledUpForCocktails = rsvp.pulledUpForCocktails ?? null;

  // Update dinner check-in (new field name)
  if (updates.dinnerPullUpCount !== undefined) {
    // Rule: If bookingStatus !== "CONFIRMED", prevent non-zero pull-up counts
    if (bookingStatus !== "CONFIRMED") {
      dinnerPullUpCount = 0;
      pulledUpForDinner = null;
    } else {
      const maxDinner =
        wantsDinner && dinnerBookingStatus === "CONFIRMED"
          ? Math.min(dinnerPartySize || 0, totalGuests)
          : 0;
      dinnerPullUpCount = Math.max(
        0,
        Math.min(maxDinner, Math.floor(Number(updates.dinnerPullUpCount) || 0))
      );
      // Also update backward compatibility field
      pulledUpForDinner = dinnerPullUpCount > 0 ? dinnerPullUpCount : null;
    }
  } else if (updates.pulledUpForDinner !== undefined) {
    // Backward compatibility: handle old field name
    // Rule: If bookingStatus !== "CONFIRMED", prevent non-zero pull-up counts
    if (bookingStatus !== "CONFIRMED") {
      dinnerPullUpCount = 0;
      pulledUpForDinner = null;
    } else if (
      updates.pulledUpForDinner === null ||
      updates.pulledUpForDinner === 0
    ) {
      dinnerPullUpCount = 0;
      pulledUpForDinner = null;
    } else {
      const maxDinner =
        wantsDinner &&
        (dinnerBookingStatus === "CONFIRMED" || dinnerStatus === "confirmed")
          ? Math.min(dinnerPartySize || 0, totalGuests)
          : 0;
      dinnerPullUpCount = Math.max(
        0,
        Math.min(maxDinner, Math.floor(Number(updates.pulledUpForDinner) || 0))
      );
      pulledUpForDinner = dinnerPullUpCount > 0 ? dinnerPullUpCount : null;
    }
  }

  // Update cocktails check-in (new field name)
  if (updates.cocktailOnlyPullUpCount !== undefined) {
    // Rule: If bookingStatus !== "CONFIRMED", prevent non-zero pull-up counts
    if (bookingStatus !== "CONFIRMED") {
      cocktailOnlyPullUpCount = 0;
      pulledUpForCocktails = null;
    } else {
      const cocktailsOnly =
        wantsDinner && dinnerBookingStatus === "CONFIRMED"
          ? Math.max(0, totalGuests - (dinnerPartySize || 0))
          : totalGuests;
      cocktailOnlyPullUpCount = Math.max(
        0,
        Math.min(
          cocktailsOnly,
          Math.floor(Number(updates.cocktailOnlyPullUpCount) || 0)
        )
      );
      // Also update backward compatibility field
      pulledUpForCocktails =
        cocktailOnlyPullUpCount > 0 ? cocktailOnlyPullUpCount : null;
    }
  } else if (updates.pulledUpForCocktails !== undefined) {
    // Backward compatibility: handle old field name
    // Rule: If bookingStatus !== "CONFIRMED", prevent non-zero pull-up counts
    if (bookingStatus !== "CONFIRMED") {
      cocktailOnlyPullUpCount = 0;
      pulledUpForCocktails = null;
    } else if (
      updates.pulledUpForCocktails === null ||
      updates.pulledUpForCocktails === 0
    ) {
      cocktailOnlyPullUpCount = 0;
      pulledUpForCocktails = null;
    } else {
      const cocktailsOnly =
        wantsDinner &&
        (dinnerBookingStatus === "CONFIRMED" || dinnerStatus === "confirmed")
          ? Math.max(0, totalGuests - (dinnerPartySize || 0))
          : totalGuests;
      cocktailOnlyPullUpCount = Math.max(
        0,
        Math.min(
          cocktailsOnly,
          Math.floor(Number(updates.pulledUpForCocktails) || 0)
        )
      );
      pulledUpForCocktails =
        cocktailOnlyPullUpCount > 0 ? cocktailOnlyPullUpCount : null;
    }
  }

  // Backward compatibility: handle old pulledUp/pulledUpCount updates
  if (
    updates.pulledUp !== undefined &&
    updates.dinnerPullUpCount === undefined &&
    updates.cocktailOnlyPullUpCount === undefined &&
    updates.pulledUpForDinner === undefined &&
    updates.pulledUpForCocktails === undefined
  ) {
    if (!updates.pulledUp) {
      dinnerPullUpCount = 0;
      cocktailOnlyPullUpCount = 0;
      pulledUpForDinner = null;
      pulledUpForCocktails = null;
    } else if (updates.pulledUpCount !== undefined) {
      // Distribute the count: if they want dinner, assume it's for dinner; otherwise cocktails
      if (
        wantsDinner &&
        (dinnerBookingStatus === "CONFIRMED" || dinnerStatus === "confirmed")
      ) {
        const dinnerMax = Math.min(dinnerPartySize || 0, totalGuests);
        dinnerPullUpCount = Math.min(
          dinnerMax,
          Math.floor(Number(updates.pulledUpCount) || totalGuests)
        );
        cocktailOnlyPullUpCount = Math.max(
          0,
          Math.floor(Number(updates.pulledUpCount) || totalGuests) -
            dinnerPullUpCount
        );
        pulledUpForDinner = dinnerPullUpCount > 0 ? dinnerPullUpCount : null;
        pulledUpForCocktails =
          cocktailOnlyPullUpCount > 0 ? cocktailOnlyPullUpCount : null;
      } else {
        cocktailOnlyPullUpCount = Math.min(
          totalGuests,
          Math.floor(Number(updates.pulledUpCount) || totalGuests)
        );
        pulledUpForCocktails =
          cocktailOnlyPullUpCount > 0 ? cocktailOnlyPullUpCount : null;
      }
    }
  }

  // Derive pulledUp and pulledUpCount for backward compatibility
  const pulledUp = dinnerPullUpCount > 0 || cocktailOnlyPullUpCount > 0;
  const pulledUpCount = pulledUp
    ? dinnerPullUpCount + cocktailOnlyPullUpCount
    : null;

  // Update the RSVP
  rsvps[idx] = {
    ...rsvp,
    bookingStatus,
    status, // Backward compatibility
    plusOnes,
    partySize,
    dinner: wantsDinner
      ? {
          enabled: true,
          partySize: dinnerPartySize,
          slotTime: dinnerTimeSlot,
          bookingStatus: dinnerBookingStatus,
        }
      : null,
    // Backward compatibility fields
    wantsDinner,
    dinnerStatus,
    dinnerTimeSlot,
    dinnerPartySize: wantsDinner ? dinnerPartySize : null,
    totalGuests, // Recalculated and stored
    dinnerPullUpCount,
    cocktailOnlyPullUpCount,
    // Backward compatibility fields
    pulledUp,
    pulledUpCount,
    pulledUpForDinner,
    pulledUpForCocktails,
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
