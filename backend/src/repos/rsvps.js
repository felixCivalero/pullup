// Rsvps repo: the booking write path (DPCS party math + atomic insert) and
// RSVP reads/updates/deletes, enriched with person data.
import { supabase } from "../supabase.js";
import { selectAllPaged } from "../db/safeQuery.js";
import {
  findEventBySlug,
  findEventById,
  getEventCounts,
  getCocktailsOnlyCount,
  generateDinnerTimeSlots,
  getDinnerSlotCounts,
} from "./events.js";
import {
  findOrCreatePerson,
  findPersonById,
  findPersonByEmail,
  updatePerson,
  isValidEmail,
  splitCustomAnswers,
  mapPersonToDb,
} from "./people.js";

function mapRsvpFromDb(dbRsvp, person = null) {
  const dinner = dbRsvp.dinner || {};
  return {
    id: dbRsvp.id,
    personId: dbRsvp.person_id,
    eventId: dbRsvp.event_id,
    slug: dbRsvp.slug,
    bookingStatus: dbRsvp.booking_status,
    status: dbRsvp.status,
    plusOnes: dbRsvp.plus_ones || 0,
    partySize: dbRsvp.party_size,
    dinner:
      (dinner && dinner.enabled) || dbRsvp.wants_dinner
        ? {
            enabled: true,
            partySize: (dinner && dinner.partySize) || dbRsvp.dinner_party_size,
            slotTime: (dinner && dinner.slotTime) || dbRsvp.dinner_time_slot,
            bookingStatus:
              (dinner && dinner.bookingStatus) ||
              (dbRsvp.dinner_status === "confirmed"
                ? "CONFIRMED"
                : dbRsvp.dinner_status === "waitlist"
                ? "WAITLIST"
                : null),
          }
        : null,
    wantsDinner: dbRsvp.wants_dinner || false,
    dinnerStatus: dbRsvp.dinner_status,
    dinnerTimeSlot: dbRsvp.dinner_time_slot,
    dinnerPartySize: dbRsvp.dinner_party_size,
    capacityOverridden: dbRsvp.capacity_overridden || false,
    dinnerPullUpCount: dbRsvp.dinner_pull_up_count || 0,
    cocktailOnlyPullUpCount: dbRsvp.cocktail_only_pull_up_count || 0,
    pulledUp: dbRsvp.pulled_up || false,
    pulledUpCount: dbRsvp.pulled_up_count,
    pulledUpForDinner: dbRsvp.pulled_up_for_dinner,
    pulledUpForCocktails: dbRsvp.pulled_up_for_cocktails,
    paymentId: dbRsvp.payment_id,
    paymentStatus: dbRsvp.payment_status,
    totalGuests: dbRsvp.total_guests,
    waitlistLinkGeneratedAt: dbRsvp.waitlist_link_generated_at,
    waitlistLinkExpiresAt: dbRsvp.waitlist_link_expires_at,
    waitlistLinkUsedAt: dbRsvp.waitlist_link_used_at,
    waitlistLinkToken: dbRsvp.waitlist_link_token,
    customAnswers: dbRsvp.custom_answers || {},
    createdAt: dbRsvp.created_at,
    updatedAt: dbRsvp.updated_at,
    // Enrich with person data if provided
    name: person?.name || null,
    email: person?.email || null,
    phone: person?.phone || null,
    instagram: person?.instagram || null,
    twitter: person?.twitter || null,
    tiktok: person?.tiktok || null,
    linkedin: person?.linkedin || null,
    company: person?.company || null,
    birthday: person?.birthday || null,
  };
}

// Helper: Map application RSVP to database format
function mapRsvpToDb(rsvpData) {
  const dbData = {};
  if (rsvpData.personId !== undefined) dbData.person_id = rsvpData.personId;
  if (rsvpData.eventId !== undefined) dbData.event_id = rsvpData.eventId;
  if (rsvpData.slug !== undefined) dbData.slug = rsvpData.slug;
  if (rsvpData.bookingStatus !== undefined)
    dbData.booking_status = rsvpData.bookingStatus;
  if (rsvpData.status !== undefined) dbData.status = rsvpData.status;
  if (rsvpData.plusOnes !== undefined) dbData.plus_ones = rsvpData.plusOnes;
  if (rsvpData.partySize !== undefined) dbData.party_size = rsvpData.partySize;
  if (rsvpData.dinner !== undefined) {
    dbData.dinner = rsvpData.dinner;
    // Also set backward compatibility fields
    if (rsvpData.dinner) {
      dbData.wants_dinner = rsvpData.dinner.enabled || false;
      dbData.dinner_party_size = rsvpData.dinner.partySize || null;
      dbData.dinner_time_slot = rsvpData.dinner.slotTime || null;
      dbData.dinner_status =
        rsvpData.dinner.bookingStatus === "CONFIRMED"
          ? "confirmed"
          : rsvpData.dinner.bookingStatus === "WAITLIST"
          ? "waitlist"
          : rsvpData.dinner.bookingStatus === "PENDING_PAYMENT"
          ? "pending"
          : null;
    } else {
      dbData.wants_dinner = false;
      dbData.dinner_party_size = null;
      dbData.dinner_time_slot = null;
      dbData.dinner_status = null;
    }
  }
  if (rsvpData.wantsDinner !== undefined)
    dbData.wants_dinner = rsvpData.wantsDinner;
  if (rsvpData.dinnerStatus !== undefined)
    dbData.dinner_status = rsvpData.dinnerStatus;
  if (rsvpData.dinnerTimeSlot !== undefined)
    dbData.dinner_time_slot = rsvpData.dinnerTimeSlot;
  if (rsvpData.dinnerPartySize !== undefined)
    dbData.dinner_party_size = rsvpData.dinnerPartySize;
  if (rsvpData.capacityOverridden !== undefined)
    dbData.capacity_overridden = rsvpData.capacityOverridden;
  if (rsvpData.dinnerPullUpCount !== undefined)
    dbData.dinner_pull_up_count = rsvpData.dinnerPullUpCount;
  if (rsvpData.cocktailOnlyPullUpCount !== undefined)
    dbData.cocktail_only_pull_up_count = rsvpData.cocktailOnlyPullUpCount;
  if (rsvpData.pulledUp !== undefined) dbData.pulled_up = rsvpData.pulledUp;
  if (rsvpData.pulledUpCount !== undefined)
    dbData.pulled_up_count = rsvpData.pulledUpCount;
  if (rsvpData.marketingOptIn !== undefined)
    dbData.marketing_opt_in = rsvpData.marketingOptIn;
  if (rsvpData.pulledUpForDinner !== undefined)
    // Backward-compat boolean flag: true when any dinner guests are pulled up
    dbData.pulled_up_for_dinner = !!rsvpData.pulledUpForDinner;
  if (rsvpData.pulledUpForCocktails !== undefined)
    // Backward-compat boolean flag: true when any cocktails-only guests are pulled up
    dbData.pulled_up_for_cocktails = !!rsvpData.pulledUpForCocktails;
  if (rsvpData.paymentId !== undefined) dbData.payment_id = rsvpData.paymentId;
  if (rsvpData.paymentStatus !== undefined)
    dbData.payment_status = rsvpData.paymentStatus;
  if (rsvpData.totalGuests !== undefined)
    dbData.total_guests = rsvpData.totalGuests;
  if (rsvpData.waitlistLinkGeneratedAt !== undefined)
    dbData.waitlist_link_generated_at = rsvpData.waitlistLinkGeneratedAt;
  if (rsvpData.waitlistLinkExpiresAt !== undefined)
    dbData.waitlist_link_expires_at = rsvpData.waitlistLinkExpiresAt;
  if (rsvpData.waitlistLinkUsedAt !== undefined)
    dbData.waitlist_link_used_at = rsvpData.waitlistLinkUsedAt;
  if (rsvpData.waitlistLinkToken !== undefined)
    dbData.waitlist_link_token = rsvpData.waitlistLinkToken;
  if (rsvpData.isVip !== undefined) dbData.is_vip = rsvpData.isVip;
  if (rsvpData.visitorId !== undefined) dbData.visitor_id = rsvpData.visitorId;
  if (rsvpData.customAnswers !== undefined)
    dbData.custom_answers = rsvpData.customAnswers || {};
  return dbData;
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
export function calculateCocktailsOnly(wantsDinner, partySize, plusOnes) {
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
export async function addRsvp({
  slug,
  name,
  email,
  plusOnes = 0,
  wantsDinner = false,
  dinnerTimeSlot = null,
  dinnerPartySize = null,
  marketingOptIn = false,
  isVip = false,
  visitorId = null,
  joinWaitlist = false,
  customAnswers = null,
  phone = null,
  igUid = null,
}) {
  const event = await findEventBySlug(slug);
  if (!event) return { error: "not_found" };

  if (!email || !isValidEmail(email.trim())) {
    return { error: "invalid_email" };
  }

  const normalizedEmail = email.trim().toLowerCase();

  // @pullup.se is the admin plane, never a guest. Blocking RSVP for staff emails
  // keeps admins out of hosts' CRMs / guest funnels and prevents one identity
  // from being admin + attendee at once. Internal testing uses a non-pullup email.
  if (normalizedEmail.endsWith("@pullup.se")) {
    return { error: "pullup_email_blocked" };
  }

  // Resolve the person by EVERY identity anchor this RSVP carries — email (the
  // anchor), plus phone and a VERIFIED IG id — so a guest already known by their
  // number or IG isn't duplicated. Email always wins as canonical; any collision
  // is flagged for the match cockpit, never auto-merged. Typed IG *handles* are
  // deliberately excluded from matching (impersonation-prone) — they're still
  // recorded downstream. Failure must NEVER block an RSVP → fall back to the
  // legacy email-only path.
  let person;
  try {
    const { resolvePersonByIdentity } = await import("../services/personResolution.js");
    const resolved = await resolvePersonByIdentity({
      identifiers: {
        email: normalizedEmail,
        phone: phone || null,
        defaultCountry: event.country || null,
        igUserId: igUid || null,
      },
      profile: { name: name || null, email: normalizedEmail },
      source: "rsvp",
      preferKind: "email",
    });
    person = resolved?.personId
      ? { id: resolved.personId }
      : await findOrCreatePerson(normalizedEmail, name);
  } catch (e) {
    console.error("[addRsvp] identity resolve failed, using email fallback:", e?.message);
    person = await findOrCreatePerson(normalizedEmail, name);
  }

  // Check for duplicate RSVP for this event (same person, same event)
  const { data: existingRsvpData, error: duplicateError } = await supabase
    .from("rsvps")
    .select("*")
    .eq("event_id", event.id)
    .eq("person_id", person.id)
    .single();

  if (existingRsvpData && !duplicateError) {
    const existingPerson = await findPersonById(existingRsvpData.person_id);
    return {
      error: "duplicate",
      event, // Include event data so we can check if it's paid
      rsvp: mapRsvpFromDb(existingRsvpData, existingPerson),
    };
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

  const { confirmed } = await getEventCounts(event.id);

  // Calculate current cocktails-only count (all existing confirmed RSVPs)
  const currentCocktailsOnly = await getCocktailsOnlyCount(event.id);

  // DYNAMIC PARTY COMPOSITION SYSTEM: Calculate cocktails-only spots for this booking
  const cocktailsOnlyForThisBooking = calculateCocktailsOnly(
    finalWantsDinner,
    partySize,
    finalPlusOnes
  );

  // ALL-OR-NOTHING WAITLIST LOGIC: Check BOTH cocktail AND dinner capacity
  // If EITHER is insufficient, entire party goes to waitlist
  let cocktailCapacityOk = true;
  let dinnerCapacityOk = true;

  // Check cocktail capacity
  if (
    event.cocktailCapacity != null &&
    currentCocktailsOnly + cocktailsOnlyForThisBooking > event.cocktailCapacity
  ) {
    cocktailCapacityOk = false;
    if (!event.waitlistEnabled) {
      return { error: "full", event };
    }
  }

  // Check dinner capacity (will be checked below if wantsDinner is true)
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
      const slotCounts = await getDinnerSlotCounts(event.id);
      const slotData = slotCounts[finalDinnerTimeSlot] || {
        confirmed: 0,
        waitlist: 0,
      };

      if (event.dinnerMaxSeatsPerSlot) {
        // Limited seats per slot - all-or-nothing: entire party goes to waitlist if capacity exceeded
        const availableSeats = event.dinnerMaxSeatsPerSlot - slotData.confirmed;

        // Check dinner capacity - if insufficient, entire party goes to waitlist
        if (finalDinnerPartySize > availableSeats) {
          dinnerCapacityOk = false;
          if (!event.waitlistEnabled) {
            return { error: "full", event };
          }
        }
      }
      // If unlimited seats per slot, dinner capacity is always OK
    } else {
      // No valid time slot available
      finalWantsDinner = false;
    }
  }

  // ALL-OR-NOTHING: Set bookingStatus based on BOTH capacity checks
  // If EITHER cocktail OR dinner capacity is insufficient, entire party goes to waitlist
  let bookingStatus = "CONFIRMED";
  if (event.instantWaitlist) {
    bookingStatus = "WAITLIST";
  } else if (!cocktailCapacityOk || !dinnerCapacityOk) {
    if (event.waitlistEnabled && joinWaitlist) {
      // User explicitly opted into waitlist (frontend pre-check showed waitlist)
      bookingStatus = "WAITLIST";
    } else if (event.waitlistEnabled) {
      // Capacity exceeded but user didn't opt in — will be caught by atomic function
      // Set to CONFIRMED here; the atomic function will make the final call
      bookingStatus = "CONFIRMED";
    } else {
      return { error: "full", event };
    }
  }

  // For paid events: hold the spot but don't confirm until payment succeeds
  // PENDING_PAYMENT counts toward capacity (holds the spot) but is not truly confirmed
  const isPaidEvent = event.ticketType === "paid" && event.ticketPrice > 0;
  if (isPaidEvent && bookingStatus === "CONFIRMED") {
    bookingStatus = "PENDING_PAYMENT";
  }

  // Set dinner status based on capacity check and booking status
  if (finalWantsDinner) {
    if (!dinnerCapacityOk || bookingStatus === "WAITLIST") {
      dinnerStatus = "WAITLIST";
    } else if (bookingStatus === "PENDING_PAYMENT") {
      dinnerStatus = "PENDING_PAYMENT";
    } else {
      dinnerStatus = "CONFIRMED";
    }
  }

  // Calculate total unique guests
  const totalGuests = calculateTotalGuests(
    partySize,
    finalWantsDinner ? finalDinnerPartySize : null
  );

  const rsvpData = {
    personId: person.id,
    eventId: event.id,
    slug,
    bookingStatus, // "CONFIRMED" | "PENDING_PAYMENT" | "WAITLIST" | "CANCELLED"
    status:
      bookingStatus === "CONFIRMED" || bookingStatus === "PENDING_PAYMENT"
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
    pulledUp: false,
    pulledUpCount: null,
    pulledUpForDinner: null,
    pulledUpForCocktails: null,
    marketingOptIn: marketingOptIn || false,
    isVip: !!isVip,
    visitorId: visitorId || null,
  };

  const willGoToWaitlist = !cocktailCapacityOk || !dinnerCapacityOk;

  const dbRsvpData = mapRsvpToDb(rsvpData);

  // Use atomic function for race-proof capacity check + insert
  const { data: atomicResult, error: rpcError } = await supabase.rpc(
    "atomic_rsvp_insert",
    {
      p_person_id: dbRsvpData.person_id,
      p_event_id: dbRsvpData.event_id,
      p_slug: dbRsvpData.slug,
      p_booking_status: dbRsvpData.booking_status,
      p_status: dbRsvpData.status,
      p_plus_ones: dbRsvpData.plus_ones ?? 0,
      p_party_size: dbRsvpData.party_size ?? 1,
      p_wants_dinner: dbRsvpData.wants_dinner ?? false,
      p_dinner: dbRsvpData.dinner ?? null,
      p_dinner_status: dbRsvpData.dinner_status ?? null,
      p_dinner_time_slot: dbRsvpData.dinner_time_slot ?? null,
      p_dinner_party_size: dbRsvpData.dinner_party_size ?? null,
      p_total_guests: dbRsvpData.total_guests ?? dbRsvpData.party_size ?? 1,
      p_payment_id: dbRsvpData.payment_id ?? null,
      p_payment_status: dbRsvpData.payment_status ?? null,
      p_dinner_pull_up_count: dbRsvpData.dinner_pull_up_count ?? 0,
      p_cocktail_only_pull_up_count: dbRsvpData.cocktail_only_pull_up_count ?? 0,
      p_pulled_up: dbRsvpData.pulled_up ?? false,
      p_pulled_up_count: dbRsvpData.pulled_up_count ?? null,
      p_pulled_up_for_dinner: dbRsvpData.pulled_up_for_dinner ?? false,
      p_pulled_up_for_cocktails: dbRsvpData.pulled_up_for_cocktails ?? false,
      p_marketing_opt_in: dbRsvpData.marketing_opt_in ?? false,
      p_is_vip: dbRsvpData.is_vip ?? false,
      p_visitor_id: dbRsvpData.visitor_id ?? null,
      // Capacity params
      p_cocktails_only_for_booking: cocktailsOnlyForThisBooking,
      p_cocktail_capacity: event.cocktailCapacity ?? null,
      p_dinner_max_seats: event.dinnerMaxSeatsPerSlot ?? null,
      p_dinner_slot_key: finalDinnerTimeSlot ?? null,
      p_join_waitlist: joinWaitlist || (willGoToWaitlist && event.waitlistEnabled),
      p_instant_waitlist: !!event.instantWaitlist,
    }
  );

  if (rpcError) {
    console.error("Error in atomic RSVP insert:", rpcError);
    return { error: "database_error", message: rpcError.message };
  }

  // Check if the atomic function rejected the insert (capacity exceeded, user didn't opt in)
  if (atomicResult && atomicResult.rejected) {
    return { error: "capacity_exceeded", event };
  }

  // Persist custom form-field answers. We split them into two buckets:
  //   - identity-typed answers (instagram, phone, company, …) → write
  //     to columns on `people` so the CRM can read/filter them directly.
  //   - everything else → stays in rsvps.custom_answers, where each entry
  //     is a per-RSVP response to a host-defined question.
  // (atomic_rsvp_insert RPC doesn't take custom_answers yet, hence the
  // follow-up writes here.)
  if (
    customAnswers &&
    typeof customAnswers === "object" &&
    Object.keys(customAnswers).length > 0 &&
    atomicResult?.id
  ) {
    const { personUpdates, remainingAnswers } = splitCustomAnswers(
      customAnswers,
      event.formFields,
    );

    // 1) Promote identity fields onto the person record.
    if (Object.keys(personUpdates).length > 0) {
      const { error: personErr } = await supabase
        .from("people")
        .update(mapPersonToDb(personUpdates))
        .eq("id", person.id);
      if (personErr) {
        console.error(
          "Failed to persist identity fields on person:",
          personErr,
        );
      }
    }

    // 2) Store only the leftover (truly custom) answers on the RSVP.
    const { error: updateErr } = await supabase
      .from("rsvps")
      .update({ custom_answers: remainingAnswers })
      .eq("id", atomicResult.id);
    if (updateErr) {
      console.error("Failed to persist custom_answers:", updateErr);
    } else {
      atomicResult.custom_answers = remainingAnswers;
    }
  }

  const rsvp = mapRsvpFromDb(atomicResult, person);

  return { event, rsvp };
}

export async function getRsvpsForEvent(eventId) {
  // Fetch all RSVPs for this event with person data, including the
  // identity fields (instagram, phone, …) that may have been collected
  // via event form_fields — exports/UI read them from the person record.
  // Paginated so the guest list + CSV export never silently truncate at
  // Supabase's 1000-row cap (an event with >1000 RSVPs would otherwise drop
  // everyone past row 1000 — undercounting the host's own data).
  let eventRsvps;
  try {
    eventRsvps = await selectAllPaged(() =>
      supabase
        .from("rsvps")
        .select(
          `
      *,
      people:person_id (
        id,
        name,
        email,
        phone,
        instagram,
        twitter,
        tiktok,
        linkedin,
        company,
        birthday
      )
    `
        )
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
    );
  } catch (error) {
    console.error("Error fetching RSVPs for event:", error);
    return [];
  }

  // Map to application format with person data
  return eventRsvps.map((dbRsvp) => {
    const person = dbRsvp.people || null;
    return mapRsvpFromDb(dbRsvp, person);
  });
}

// Find RSVP by ID (enriched with person data)
export async function findRsvpById(rsvpId) {
  const { data: dbRsvp, error } = await supabase
    .from("rsvps")
    .select(
      `
      *,
      people:person_id (
        id,
        name,
        email
      )
    `
    )
    .eq("id", rsvpId)
    .single();

  if (error || !dbRsvp) {
    return null;
  }

  const person = dbRsvp.people || null;
  return mapRsvpFromDb(dbRsvp, person);
}

// Update RSVP
export async function updateRsvp(rsvpId, updates, options = {}) {
  const { forceConfirm = false } = options;

  // Fetch RSVP from database
  const rsvp = await findRsvpById(rsvpId);
  if (!rsvp) return { error: "not_found" };

  const event = await findEventById(rsvp.eventId);
  if (!event) return { error: "event_not_found" };

  // Handle email/name updates - update person record
  let updatedPersonId = rsvp.personId;
  if (updates.email || updates.name) {
    const person = await findPersonById(rsvp.personId);
    if (!person) return { error: "person_not_found" };

    if (updates.email) {
      const normalizedEmail = updates.email.trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        return { error: "invalid_email" };
      }

      // If email changed, check if person with new email exists
      if (normalizedEmail !== person.email) {
        const existingPerson = await findPersonByEmail(normalizedEmail);
        if (existingPerson) {
          // Check if this person already has an RSVP for this event
          const { data: existingRsvp } = await supabase
            .from("rsvps")
            .select("id")
            .eq("person_id", existingPerson.id)
            .eq("event_id", event.id)
            .maybeSingle();

          if (existingRsvp && existingRsvp.id !== rsvpId) {
            // Person already has an RSVP for this event - don't change person_id
            // Just update the person's email instead
            await updatePerson(person.id, { email: normalizedEmail });
            updatedPersonId = rsvp.personId; // Keep original person_id
          } else {
            // Safe to merge: update RSVP to point to existing person
            updatedPersonId = existingPerson.id;
          }
        } else {
          // Update person's email
          await updatePerson(person.id, { email: normalizedEmail });
        }
      }
    }

    if (updates.name) {
      await updatePerson(rsvp.personId, { name: updates.name.trim() || null });
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
  const { confirmed } = await getEventCounts(event.id);

  // Calculate current cocktails-only count (excluding this RSVP)
  // Fetch all confirmed RSVPs except this one
  const { data: otherRsvps, error: rsvpsError } = await supabase
    .from("rsvps")
    .select(
      "dinner, wants_dinner, plus_ones, party_size, booking_status, status"
    )
    .eq("event_id", event.id)
    .in("booking_status", ["CONFIRMED"])
    .or("status.eq.attending")
    .neq("id", rsvpId);

  if (rsvpsError) {
    console.error("Error fetching RSVPs for capacity check:", rsvpsError);
    // Continue with 0 if error (conservative)
  }

  const currentCocktailsOnly = (otherRsvps || []).reduce((sum, r) => {
    const dinner = r.dinner || {};
    const wantsDinner = (dinner && dinner.enabled) || r.wants_dinner || false;
    const plusOnes = r.plus_ones ?? 0;
    const partySize = r.party_size ?? 1;

    // DYNAMIC PARTY COMPOSITION SYSTEM: Calculate cocktails-only count
    return sum + calculateCocktailsOnly(wantsDinner, partySize, plusOnes);
  }, 0);

  // DYNAMIC PARTY COMPOSITION SYSTEM: Calculate cocktails-only spots for this booking
  const cocktailsOnlyForThisBooking = calculateCocktailsOnly(
    wantsDinner,
    partySize,
    plusOnes
  );

  // Initialize pull-up counts early (needed for bookingStatus check below)
  let dinnerPullUpCount = rsvp.dinnerPullUpCount ?? rsvp.pulledUpForDinner ?? 0;
  let cocktailOnlyPullUpCount =
    rsvp.cocktailOnlyPullUpCount ?? rsvp.pulledUpForCocktails ?? 0;
  let pulledUpForDinner = rsvp.pulledUpForDinner ?? null;
  let pulledUpForCocktails = rsvp.pulledUpForCocktails ?? null;

  // Check if we're only updating waitlist link fields (preserve booking status)
  const isOnlyWaitlistLinkUpdate =
    updates.waitlistLinkGeneratedAt !== undefined ||
    updates.waitlistLinkExpiresAt !== undefined ||
    updates.waitlistLinkUsedAt !== undefined ||
    updates.waitlistLinkToken !== undefined;

  // Check if we're only updating payment fields (preserve booking status)
  const isOnlyPaymentUpdate =
    (updates.paymentId !== undefined || updates.paymentStatus !== undefined) &&
    updates.bookingStatus === undefined &&
    updates.status === undefined &&
    updates.email === undefined &&
    updates.name === undefined &&
    updates.plusOnes === undefined &&
    updates.wantsDinner === undefined &&
    updates.dinnerTimeSlot === undefined &&
    updates.dinnerPartySize === undefined &&
    updates.dinnerPullUpCount === undefined &&
    updates.cocktailOnlyPullUpCount === undefined &&
    updates.pulledUp === undefined &&
    updates.pulledUpCount === undefined &&
    updates.pulledUpForDinner === undefined &&
    updates.pulledUpForCocktails === undefined &&
    !isOnlyWaitlistLinkUpdate;

  // If only updating waitlist link fields, don't touch other fields
  const isOnlyLinkFields =
    isOnlyWaitlistLinkUpdate &&
    updates.bookingStatus === undefined &&
    updates.status === undefined &&
    updates.email === undefined &&
    updates.name === undefined &&
    updates.plusOnes === undefined &&
    updates.wantsDinner === undefined &&
    updates.dinnerTimeSlot === undefined &&
    updates.dinnerPartySize === undefined &&
    updates.dinnerPullUpCount === undefined &&
    updates.cocktailOnlyPullUpCount === undefined &&
    updates.pulledUp === undefined &&
    updates.pulledUpCount === undefined &&
    updates.pulledUpForDinner === undefined &&
    updates.pulledUpForCocktails === undefined &&
    updates.paymentId === undefined &&
    updates.paymentStatus === undefined;

  // Check if we're only updating pull-up/check-in counts (preserve booking status)
  // This is critical for door check-in — changing pull-up counts should never change booking status
  const isOnlyPullUpUpdate =
    (updates.dinnerPullUpCount !== undefined ||
      updates.cocktailOnlyPullUpCount !== undefined ||
      updates.pulledUpForDinner !== undefined ||
      updates.pulledUpForCocktails !== undefined ||
      updates.pulledUp !== undefined ||
      updates.pulledUpCount !== undefined) &&
    updates.bookingStatus === undefined &&
    updates.status === undefined &&
    updates.email === undefined &&
    updates.name === undefined &&
    updates.plusOnes === undefined &&
    updates.wantsDinner === undefined &&
    updates.dinnerTimeSlot === undefined &&
    updates.dinnerPartySize === undefined &&
    updates.paymentId === undefined &&
    updates.paymentStatus === undefined &&
    !isOnlyWaitlistLinkUpdate;

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
  } else if (isOnlyLinkFields || isOnlyPaymentUpdate || isOnlyPullUpUpdate) {
    // Preserve existing booking status when only updating waitlist link fields, payment fields,
    // or pull-up/check-in counts. Door check-in should never change booking status.
    bookingStatus = rsvp.bookingStatus || bookingStatus;
  } else if (bookingStatus === "CANCELLED") {
    // Preserve CANCELLED status — don't auto-recalculate to CONFIRMED/WAITLIST
    // A cancelled guest stays cancelled unless explicitly changed
  } else {
    // ALL-OR-NOTHING WAITLIST LOGIC: Check BOTH cocktail AND dinner capacity
    // If EITHER is insufficient, entire party goes to waitlist
    // BUT: If guest was already over capacity (capacityOverridden), preserve CONFIRMED status
    const wasAlreadyOverCapacity = rsvp.capacityOverridden === true;

    if (wasAlreadyOverCapacity) {
      // Preserve CONFIRMED status for guests who were already over capacity
      bookingStatus = "CONFIRMED";
    } else {
      // Check cocktail capacity first
      let cocktailCapacityOk = true;
      if (
        event.cocktailCapacity != null &&
        currentCocktailsOnly + cocktailsOnlyForThisBooking >
          event.cocktailCapacity
      ) {
        cocktailCapacityOk = false;
        if (!event.waitlistEnabled) {
          return { error: "full" };
        }
      }

      // Dinner capacity will be checked later when dinner slot is determined
      // For now, set bookingStatus based on cocktail capacity
      // It will be updated again if dinner capacity is insufficient
      if (!cocktailCapacityOk) {
        if (event.waitlistEnabled) {
          bookingStatus = "WAITLIST";
        } else {
          return { error: "full" };
        }
      } else {
        bookingStatus = "CONFIRMED";
      }
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
  let status =
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
        // Fetch all confirmed RSVPs for this slot except current one
        // Note: We need to check both dinner JSONB field and dinner_time_slot column
        const { data: slotRsvps, error: slotError } = await supabase
          .from("rsvps")
          .select(
            "dinner, wants_dinner, dinner_time_slot, dinner_party_size, party_size, dinner_status"
          )
          .eq("event_id", event.id)
          .eq("dinner_status", "confirmed")
          .or(`dinner_time_slot.eq.${dinnerTimeSlot}`)
          .neq("id", rsvpId);

        // Also check dinner JSONB field (manual filter since Supabase JSONB queries are complex)
        const filteredSlotRsvps = (slotRsvps || []).filter((r) => {
          const dinner = r.dinner || {};
          const slotMatches =
            (dinner && dinner.slotTime === dinnerTimeSlot) ||
            r.dinner_time_slot === dinnerTimeSlot;
          return slotMatches;
        });

        if (slotError) {
          console.error("Error fetching slot RSVPs:", slotError);
        }

        const currentSlotConfirmed = filteredSlotRsvps.reduce((sum, r) => {
          const dinner = r.dinner || {};
          return (
            sum +
            ((dinner && dinner.partySize) ||
              r.dinner_party_size ||
              r.party_size ||
              1)
          );
        }, 0);

        // If slot changed and old slot had this RSVP confirmed, we've already excluded it above
        // The slotData from getDinnerSlotCounts includes the old slot count, but we exclude
        // the current RSVP from currentSlotConfirmed, so the calculation is correct

        if (updates["dinner.bookingStatus"] !== undefined) {
          dinnerBookingStatus = updates["dinner.bookingStatus"];
        } else {
          // ALL-OR-NOTHING: Check dinner capacity and update both dinner and booking status
          // BUT: If guest was already over capacity, preserve CONFIRMED status
          const wasAlreadyOverCapacity = rsvp.capacityOverridden === true;

          if (wasAlreadyOverCapacity) {
            // Preserve CONFIRMED status for guests who were already over capacity
            dinnerBookingStatus = "CONFIRMED";
            bookingStatus = "CONFIRMED";
          } else {
            let dinnerCapacityOk = true;
            if (event.dinnerMaxSeatsPerSlot) {
              // Check dinner capacity - if insufficient, entire party goes to waitlist
              const availableSeats =
                event.dinnerMaxSeatsPerSlot - currentSlotConfirmed;

              if (dinnerPartySize > availableSeats) {
                dinnerCapacityOk = false;
                if (!event.waitlistEnabled) {
                  return { error: "full" };
                }
              }
            }

            // ALL-OR-NOTHING: Update bookingStatus if dinner capacity is insufficient
            // Also re-check cocktail capacity to ensure both are OK
            let cocktailCapacityOk = true;
            if (
              event.cocktailCapacity != null &&
              currentCocktailsOnly + cocktailsOnlyForThisBooking >
                event.cocktailCapacity
            ) {
              cocktailCapacityOk = false;
              if (!event.waitlistEnabled) {
                return { error: "full" };
              }
            }

            // If EITHER cocktail OR dinner capacity is insufficient, entire party goes to waitlist
            if (!cocktailCapacityOk || !dinnerCapacityOk) {
              if (event.waitlistEnabled) {
                bookingStatus = "WAITLIST";
                dinnerBookingStatus = "WAITLIST";
              } else {
                return { error: "full" };
              }
            } else {
              // Both capacities OK - confirm both
              bookingStatus = "CONFIRMED";
              dinnerBookingStatus = "CONFIRMED";
            }
          }
        }
      }
    } else {
      dinnerBookingStatus = null;
      dinnerTimeSlot = null;
      dinnerPartySize = null;
    }
  }
  // Backward compatibility: derive dinnerStatus from dinnerBookingStatus
  let dinnerStatus =
    dinnerBookingStatus === "CONFIRMED"
      ? "confirmed"
      : dinnerBookingStatus === "WAITLIST"
      ? "waitlist"
      : null;

  // Calculate total unique guests (always partySize with new model)
  const totalGuests = partySize;

  // Handle pulled up status updates (variables already initialized above)
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

  // Re-clamp pull-up counts to current party size (e.g. if plus-ones were reduced)
  if (bookingStatus === "CONFIRMED") {
    const cocktailsOnlyMax = wantsDinner && dinnerBookingStatus === "CONFIRMED"
      ? Math.max(0, totalGuests - (dinnerPartySize || 0))
      : totalGuests;
    const dinnerMax = wantsDinner && dinnerBookingStatus === "CONFIRMED"
      ? Math.min(dinnerPartySize || 0, totalGuests)
      : 0;
    if (cocktailOnlyPullUpCount > cocktailsOnlyMax) {
      cocktailOnlyPullUpCount = cocktailsOnlyMax;
      pulledUpForCocktails = cocktailOnlyPullUpCount > 0 ? cocktailOnlyPullUpCount : null;
    }
    if (dinnerPullUpCount > dinnerMax) {
      dinnerPullUpCount = dinnerMax;
      pulledUpForDinner = dinnerPullUpCount > 0 ? dinnerPullUpCount : null;
    }
  }

  // Derive pulledUp and pulledUpCount for backward compatibility
  const pulledUp = dinnerPullUpCount > 0 || cocktailOnlyPullUpCount > 0;
  const pulledUpCount = pulledUp
    ? dinnerPullUpCount + cocktailOnlyPullUpCount
    : null;

  // Admin Override: forceConfirm bypasses capacity checks
  // Also preserve override if guest was already over capacity (capacityOverridden flag)
  const wasAlreadyOverCapacity = rsvp.capacityOverridden === true;
  let capacityOverridden = wasAlreadyOverCapacity;

  if ((forceConfirm || wasAlreadyOverCapacity) && bookingStatus !== "CANCELLED") {
    // Admin override: force booking to confirmed, even if capacity exceeded
    // Preserve CONFIRMED status for guests who were already over capacity
    // But never override an explicit CANCELLED status
    bookingStatus = "CONFIRMED";
    // Recalculate status after override
    status =
      bookingStatus === "CONFIRMED"
        ? "attending"
        : bookingStatus === "WAITLIST"
        ? "waitlist"
        : "cancelled";

    if (wantsDinner && dinnerPartySize > 0) {
      // Ensure dinner object exists and is confirmed
      dinnerBookingStatus = "CONFIRMED";
      dinnerStatus = "confirmed";
    } else {
      // No dinner
      if (wantsDinner === false) {
        dinnerBookingStatus = null;
        dinnerStatus = null;
      }
    }

    // Mark override for UI (preserve if already set, or set if new override)
    capacityOverridden = true;
  }

  // Clear capacityOverridden when explicitly cancelled
  if (bookingStatus === "CANCELLED") {
    capacityOverridden = false;
  }

  // Prepare RSVP update data
  const rsvpUpdateData = {
    personId: updatedPersonId || rsvp.personId,
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
    wantsDinner,
    dinnerStatus,
    dinnerTimeSlot,
    dinnerPartySize: wantsDinner ? dinnerPartySize : null,
    totalGuests, // Recalculated and stored
    dinnerPullUpCount,
    cocktailOnlyPullUpCount,
    capacityOverridden: capacityOverridden || undefined,
    pulledUp,
    pulledUpCount,
    pulledUpForDinner,
    pulledUpForCocktails,
  };

  // Map to database format
  const dbUpdateData = mapRsvpToDb(rsvpUpdateData);

  // Update in database
  const { data: updatedRsvpData, error: updateError } = await supabase
    .from("rsvps")
    .update(dbUpdateData)
    .eq("id", rsvpId)
    .select(
      `
      *,
      people:person_id (
        id,
        name,
        email
      )
    `
    )
    .single();

  if (updateError) {
    console.error("Error updating RSVP:", updateError);
    return { error: "database_error", message: updateError.message };
  }

  const person = updatedRsvpData.people || null;
  const updatedRsvp = mapRsvpFromDb(updatedRsvpData, person);

  // Append a cancel beat to the append-only timeline on a LIVE cancellation
  // (previously only the one-time backfill ever wrote rsvp_cancel, so the ledger
  // silently disagreed with reality). Deduped per person-event; dynamic import
  // avoids a circular data.js ↔ personTimeline.js dependency. Best-effort — a
  // logging hiccup must never fail the cancel.
  if (status === "cancelled" && rsvp.status !== "cancelled") {
    try {
      const { logPersonEvent } = await import("../services/personTimeline.js");
      await logPersonEvent({
        personId: updatedPersonId,
        hostId: event.hostId || null,
        eventId: event.id,
        type: "rsvp_cancel",
        channel: "web",
        body: `Cancelled RSVP for ${event.title || "an event"}`,
        dedupeKey: `rsvp_cancel:${event.id}:${updatedPersonId}`,
      });
    } catch { /* never block the cancel */ }
  }

  return {
    rsvp: updatedRsvp,
  };
}

// Delete RSVP
export async function deleteRsvp(rsvpId) {
  // First fetch the RSVP with person data
  const rsvp = await findRsvpById(rsvpId);
  if (!rsvp) {
    return { error: "not_found" };
  }

  // Delete from database
  const { error } = await supabase.from("rsvps").delete().eq("id", rsvpId);

  if (error) {
    console.error("Error deleting RSVP:", error);
    return { error: "database_error", message: error.message };
  }

  return { success: true, rsvp };
}
