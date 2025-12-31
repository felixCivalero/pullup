// backend/src/data.js

import { supabase } from "./supabase.js";
import { logger } from "./logger.js";

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

// Helper: Ensure unique slug in database
async function ensureUniqueSlug(baseSlug) {
  let slug = baseSlug;
  let counter = 2;

  // Check if slug exists in database
  while (true) {
    const { data, error } = await supabase
      .from("events")
      .select("id")
      .eq("slug", slug)
      .single();

    // If no data found, slug is unique
    if (error && error.code === "PGRST116") {
      break;
    }

    // If error (other than not found), throw
    if (error && error.code !== "PGRST116") {
      console.error("Error checking slug uniqueness:", error);
      throw new Error("Failed to check slug uniqueness");
    }

    // Slug exists, try next
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
}

// Helper: Map database event to application format
export async function mapEventFromDb(dbEvent) {
  // Generate image URL if image path exists
  let imageUrl = dbEvent.image_url || null;

  if (imageUrl && !imageUrl.startsWith("http")) {
    // It's a file path, generate URL
    try {
      let filePath = imageUrl;

      // If it's already a full URL, extract the path
      if (imageUrl.includes("event-images/")) {
        const urlMatch = imageUrl.match(/event-images\/([^?]+)/);
        if (urlMatch) {
          filePath = urlMatch[1];
        }
      }

      // Try to generate signed URL first (for private buckets)
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from("event-images")
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (!urlError && signedUrlData?.signedUrl) {
        imageUrl = signedUrlData.signedUrl;
      } else {
        // Fallback to public URL (for public buckets or if signed URL fails)
        const {
          data: { publicUrl },
        } = supabase.storage.from("event-images").getPublicUrl(filePath);
        imageUrl = publicUrl;
      }
    } catch (urlError) {
      // If URL generation fails, use stored value as-is
      console.error("Error generating event image URL:", urlError);
    }
  }

  return {
    id: dbEvent.id,
    hostId: dbEvent.host_id, // Include host_id for ownership checks
    slug: dbEvent.slug,
    title: dbEvent.title,
    description: dbEvent.description,
    location: dbEvent.location,
    locationLat: dbEvent.location_lat || null,
    locationLng: dbEvent.location_lng || null,
    startsAt: dbEvent.starts_at,
    endsAt: dbEvent.ends_at,
    timezone: dbEvent.timezone,
    isPaid: dbEvent.is_paid,
    ticketType: dbEvent.ticket_type,
    maxAttendees: dbEvent.total_capacity, // Backward compatibility
    waitlistEnabled: dbEvent.waitlist_enabled,
    imageUrl: imageUrl,
    theme: dbEvent.theme,
    calendar: dbEvent.calendar_category,
    visibility: dbEvent.visibility,
    requireApproval: dbEvent.require_approval,
    createdAt: dbEvent.created_at,
    updatedAt: dbEvent.updated_at,
    maxPlusOnesPerGuest: dbEvent.max_plus_ones_per_guest || 0,
    dinnerEnabled: dbEvent.dinner_enabled || false,
    dinnerStartTime: dbEvent.dinner_start_time,
    dinnerEndTime: dbEvent.dinner_end_time,
    dinnerSeatingIntervalHours: dbEvent.dinner_seating_interval_hours || 2,
    dinnerMaxSeatsPerSlot: dbEvent.dinner_max_seats_per_slot,
    dinnerOverflowAction: dbEvent.dinner_overflow_action || "waitlist",
    ticketPrice: dbEvent.ticket_price,
    ticketCurrency: dbEvent.ticket_currency || "usd",
    stripeProductId: dbEvent.stripe_product_id,
    stripePriceId: dbEvent.stripe_price_id,
    cocktailCapacity: dbEvent.cocktail_capacity,
    foodCapacity: dbEvent.food_capacity,
    totalCapacity: dbEvent.total_capacity,
    // New fields with backward compatibility
    // Only include if column exists (handled by || fallback)
    createdVia: dbEvent.created_via || "legacy",
    status: dbEvent.status || "PUBLISHED",
  };
}

// ---------------------------
// Event host helpers (multi-arranger support)
// ---------------------------

/**
 * Get all event IDs where user is a host (owner or co-host).
 * Supports both the legacy events.host_id model and the new event_hosts join table.
 */
export async function getUserEventIds(userId) {
  if (!userId) return [];

  // New model: event_hosts join table
  const { data: eventHosts, error: hostsError } = await supabase
    .from("event_hosts")
    .select("event_id")
    .eq("user_id", userId);

  if (hostsError) {
    console.error("[getUserEventIds] Error fetching event_hosts:", hostsError);
  }

  const eventIdsFromJoin = eventHosts?.map((eh) => eh.event_id) || [];

  // Legacy model: events.host_id
  const { data: legacyEvents, error: legacyError } = await supabase
    .from("events")
    .select("id")
    .eq("host_id", userId);

  if (legacyError) {
    console.error(
      "[getUserEventIds] Error fetching legacy events:",
      legacyError
    );
  }

  const eventIdsFromLegacy = legacyEvents?.map((e) => e.id) || [];

  // Combine and deduplicate
  const allEventIds = Array.from(
    new Set([...eventIdsFromJoin, ...eventIdsFromLegacy])
  );

  return allEventIds;
}

/**
 * Check if user is a host for an event (owner or co-host).
 * Returns { isHost: boolean, role: string | null }.
 */
export async function isUserEventHost(userId, eventId) {
  if (!userId || !eventId) {
    return { isHost: false, role: null };
  }

  // New model: event_hosts join table
  const { data: eventHost, error: hostError } = await supabase
    .from("event_hosts")
    .select("role")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (hostError) {
    console.error("[isUserEventHost] Error fetching event_host:", hostError);
  }

  if (eventHost) {
    return { isHost: true, role: eventHost.role || "co_host" };
  }

  // Legacy model: events.host_id
  const { data: legacyEvent, error: legacyError } = await supabase
    .from("events")
    .select("host_id")
    .eq("id", eventId)
    .maybeSingle();

  if (legacyError) {
    console.error(
      "[isUserEventHost] Error fetching legacy event:",
      legacyError
    );
  }

  if (legacyEvent && legacyEvent.host_id === userId) {
    return { isHost: true, role: "owner" };
  }

  return { isHost: false, role: null };
}

/**
 * Check if user is the owner of an event (not just a co-host).
 * Returns boolean.
 * CRITICAL: Only owners can edit events (Stripe Connect, pricing, etc.)
 */
export async function isUserEventOwner(userId, eventId) {
  if (!userId || !eventId) {
    return false;
  }

  // Check new model: event_hosts join table
  const { data: eventHost, error: hostError } = await supabase
    .from("event_hosts")
    .select("role")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (hostError) {
    console.error("[isUserEventOwner] Error fetching event_host:", hostError);
  }

  // If found in event_hosts, check if role is "owner"
  if (eventHost) {
    return eventHost.role === "owner";
  }

  // Legacy model: events.host_id
  const { data: legacyEvent, error: legacyError } = await supabase
    .from("events")
    .select("host_id")
    .eq("id", eventId)
    .maybeSingle();

  if (legacyError) {
    console.error(
      "[isUserEventOwner] Error fetching legacy event:",
      legacyError
    );
  }

  // In legacy model, host_id is always the owner
  if (legacyEvent && legacyEvent.host_id === userId) {
    return true;
  }

  return false;
}

// Helper: Map application event updates to database format
function mapEventToDb(eventData) {
  const dbData = {};
  if (eventData.hostId !== undefined) dbData.host_id = eventData.hostId;
  if (eventData.slug !== undefined) dbData.slug = eventData.slug;
  if (eventData.title !== undefined) dbData.title = eventData.title;
  if (eventData.description !== undefined)
    dbData.description = eventData.description;
  if (eventData.location !== undefined) dbData.location = eventData.location;
  // Only include location coordinates if they're provided (columns may not exist in all databases)
  if (eventData.locationLat !== undefined && eventData.locationLat !== null) {
    dbData.location_lat = eventData.locationLat;
  }
  if (eventData.locationLng !== undefined && eventData.locationLng !== null) {
    dbData.location_lng = eventData.locationLng;
  }
  if (eventData.startsAt !== undefined) dbData.starts_at = eventData.startsAt;
  if (eventData.endsAt !== undefined) dbData.ends_at = eventData.endsAt;
  if (eventData.timezone !== undefined) dbData.timezone = eventData.timezone;
  if (eventData.ticketType !== undefined)
    dbData.ticket_type = eventData.ticketType;
  if (eventData.waitlistEnabled !== undefined)
    dbData.waitlist_enabled = eventData.waitlistEnabled;
  // Handle imageUrl: if it's null, set to null (to delete), if it's a path/URL, store it
  // Don't store base64 - images should be uploaded via the upload endpoint
  if (eventData.imageUrl !== undefined) {
    // If it's a base64 string (starts with data:), don't store it
    // Images should be uploaded via /host/events/:id/image endpoint
    if (eventData.imageUrl && !eventData.imageUrl.startsWith("data:")) {
      dbData.image_url = eventData.imageUrl;
    } else if (eventData.imageUrl === null) {
      // Explicitly set to null to delete image
      dbData.image_url = null;
    }
  }
  if (eventData.theme !== undefined) dbData.theme = eventData.theme;
  if (eventData.calendar !== undefined)
    dbData.calendar_category = eventData.calendar;
  if (eventData.visibility !== undefined)
    dbData.visibility = eventData.visibility;
  if (eventData.requireApproval !== undefined)
    dbData.require_approval = eventData.requireApproval;
  if (eventData.maxPlusOnesPerGuest !== undefined)
    dbData.max_plus_ones_per_guest = eventData.maxPlusOnesPerGuest;
  if (eventData.dinnerEnabled !== undefined)
    dbData.dinner_enabled = eventData.dinnerEnabled;
  if (eventData.dinnerStartTime !== undefined)
    dbData.dinner_start_time = eventData.dinnerStartTime;
  if (eventData.dinnerEndTime !== undefined)
    dbData.dinner_end_time = eventData.dinnerEndTime;
  if (eventData.dinnerSeatingIntervalHours !== undefined)
    dbData.dinner_seating_interval_hours = eventData.dinnerSeatingIntervalHours;
  if (eventData.dinnerMaxSeatsPerSlot !== undefined)
    dbData.dinner_max_seats_per_slot = eventData.dinnerMaxSeatsPerSlot;
  if (eventData.dinnerOverflowAction !== undefined)
    dbData.dinner_overflow_action = eventData.dinnerOverflowAction;
  if (eventData.ticketPrice !== undefined)
    dbData.ticket_price = eventData.ticketPrice;
  if (eventData.ticketCurrency !== undefined)
    dbData.ticket_currency = String(eventData.ticketCurrency).toLowerCase();
  if (eventData.stripeProductId !== undefined)
    dbData.stripe_product_id = eventData.stripeProductId;
  if (eventData.stripePriceId !== undefined)
    dbData.stripe_price_id = eventData.stripePriceId;
  if (eventData.cocktailCapacity !== undefined)
    dbData.cocktail_capacity = eventData.cocktailCapacity;
  if (eventData.foodCapacity !== undefined)
    dbData.food_capacity = eventData.foodCapacity;
  if (eventData.totalCapacity !== undefined)
    dbData.total_capacity = eventData.totalCapacity;
  if (eventData.isPaid !== undefined) dbData.is_paid = eventData.isPaid;
  // Only include createdVia and status if they're explicitly provided
  // This ensures backward compatibility if columns don't exist yet
  if (eventData.createdVia !== undefined) {
    dbData.created_via = eventData.createdVia;
  }
  if (eventData.status !== undefined) {
    dbData.status = eventData.status;
  }
  return dbData;
}

// ---------------------------
// Event CRUD
// ---------------------------
export async function createEvent({
  hostId, // Required: User ID from authenticated user
  title,
  description,
  location,
  locationLat = null,
  locationLng = null,
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
  ticketCurrency = "USD",
  stripeProductId = null,
  stripePriceId = null,

  // Capacity fields
  cocktailCapacity = null,
  foodCapacity = null,
  totalCapacity = null,

  // Dual personality fields
  createdVia = "legacy",
  status = "PUBLISHED",
}) {
  if (!hostId) {
    throw new Error("hostId is required to create an event");
  }

  // Validate createdVia
  if (!["post", "create", "legacy"].includes(createdVia)) {
    createdVia = "legacy";
  }

  // Validate status
  if (!["DRAFT", "PUBLISHED"].includes(status)) {
    status = "PUBLISHED";
  }

  const baseSlug = slugify(title || "event");
  const slug = await ensureUniqueSlug(baseSlug);

  const eventData = {
    hostId, // Set host_id from authenticated user
    slug,
    title,
    description,
    location,
    locationLat: locationLat || null,
    locationLng: locationLng || null,
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
    dinnerOverflowAction: "waitlist",
    ticketPrice:
      ticketType === "paid" && ticketPrice ? Number(ticketPrice) : null,
    ticketCurrency: ticketCurrency
      ? String(ticketCurrency).toLowerCase()
      : "usd",
    stripeProductId: stripeProductId || null,
    stripePriceId: stripePriceId || null,
    cocktailCapacity: cocktailCapacity ? Number(cocktailCapacity) : null,
    foodCapacity: foodCapacity ? Number(foodCapacity) : null,
    totalCapacity: totalCapacity ? Number(totalCapacity) : null,
    createdVia,
    status,
  };

  const dbData = mapEventToDb(eventData);

  // Remove location coordinates if they're null/undefined to avoid unnecessary columns
  if (dbData.location_lat === null || dbData.location_lat === undefined) {
    delete dbData.location_lat;
  }
  if (dbData.location_lng === null || dbData.location_lng === undefined) {
    delete dbData.location_lng;
  }

  // Remove createdVia and status if they're not in the database schema yet
  // This provides backward compatibility during migration
  // The database defaults will handle these if columns exist
  const { data, error } = await supabase
    .from("events")
    .insert(dbData)
    .select()
    .single();

  if (error) {
    console.error("Error creating event:", error);
    // If error is about missing columns, try without them (backward compatibility)
    if (
      error.message &&
      (error.message.includes("created_via") ||
        error.message.includes("location_lat") ||
        error.message.includes("location_lng") ||
        error.message.includes("schema cache"))
    ) {
      console.warn(
        "Schema cache issue or missing columns detected, retrying with backward compatibility"
      );
      // Remove columns that might not exist
      if (
        error.message.includes("created_via") ||
        error.message.includes("schema cache")
      ) {
        delete dbData.created_via;
        delete dbData.status;
      }
      if (error.message.includes("location_lat")) {
        delete dbData.location_lat;
      }
      if (error.message.includes("location_lng")) {
        delete dbData.location_lng;
      }
      const retryResult = await supabase
        .from("events")
        .insert(dbData)
        .select()
        .single();

      if (retryResult.error) {
        console.error("Error creating event (retry):", retryResult.error);
        throw new Error("Failed to create event");
      }
      return await mapEventFromDb(retryResult.data);
    }
    throw new Error("Failed to create event");
  }

  return await mapEventFromDb(data);
}

export async function findEventBySlug(slug, userId = null) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    logger.info("[findEventBySlug] Event not found in DB", {
      slug,
      error: error?.message,
    });
    return null;
  }

  // If event is DRAFT, only hosts can see it (owner or co-host)
  if (data.status === "DRAFT" && userId) {
    const { isHost } = await isUserEventHost(userId, data.id);
    if (!isHost) {
      logger.info("[findEventBySlug] DRAFT event access denied", {
        slug,
        hostId: data.host_id,
        userId: userId || "none",
      });
      return null;
    }
  }

  return await mapEventFromDb(data);
}

export async function findEventById(id) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  return await mapEventFromDb(data);
}

export async function updateEvent(id, updates) {
  const dbUpdates = mapEventToDb(updates);

  const { data, error } = await supabase
    .from("events")
    .update(dbUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return null;
  }

  return await mapEventFromDb(data);
}

// ---------------------------
// RSVP Logic
// ---------------------------

// Count confirmed / waitlist based on partySize
export async function getEventCounts(eventId) {
  // Fetch all RSVPs for this event
  const { data: eventRsvps, error } = await supabase
    .from("rsvps")
    .select("party_size, total_guests, booking_status, status")
    .eq("event_id", eventId);

  if (error) {
    console.error("Error fetching event counts:", error);
    return { confirmed: 0, waitlist: 0 };
  }

  // Use totalGuests for accurate capacity counting (accounts for dinner overlaps)
  const confirmed = eventRsvps
    .filter((r) => r.booking_status === "CONFIRMED" || r.status === "attending")
    .reduce((sum, r) => sum + (r.total_guests ?? r.party_size ?? 1), 0);

  const waitlist = eventRsvps
    .filter((r) => r.booking_status === "WAITLIST" || r.status === "waitlist")
    .reduce((sum, r) => sum + (r.total_guests ?? r.party_size ?? 1), 0);

  return { confirmed, waitlist };
}

// Calculate cocktails-only count (people attending cocktails but not confirmed for dinner)
export async function getCocktailsOnlyCount(eventId) {
  // Fetch all confirmed RSVPs for this event
  const { data: eventRsvps, error } = await supabase
    .from("rsvps")
    .select(
      "dinner, wants_dinner, plus_ones, party_size, booking_status, status"
    )
    .eq("event_id", eventId)
    .in("booking_status", ["CONFIRMED"])
    .or("status.eq.attending");

  if (error) {
    console.error("Error fetching cocktails-only count:", error);
    return 0;
  }

  return eventRsvps.reduce((sum, r) => {
    const dinner = r.dinner || {};
    const wantsDinner = (dinner && dinner.enabled) || r.wants_dinner || false;
    const plusOnes = r.plus_ones ?? 0;
    const partySize = r.party_size ?? 1;

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
export async function getDinnerSlotCounts(eventId) {
  const event = await findEventById(eventId);
  if (!event || !event.dinnerEnabled) return {};

  const slots = generateDinnerTimeSlots(event);
  const slotCounts = {};

  // Fetch all RSVPs with dinner for this event
  const { data: eventRsvps, error } = await supabase
    .from("rsvps")
    .select(
      "dinner, wants_dinner, dinner_time_slot, dinner_party_size, party_size, dinner_status"
    )
    .eq("event_id", eventId)
    .or("wants_dinner.eq.true,dinner.not.is.null");

  if (error) {
    console.error("Error fetching dinner slot counts:", error);
    return {};
  }

  slots.forEach((slotTime) => {
    // Use dinnerPartySize for accurate slot capacity counting
    const confirmed = eventRsvps
      .filter((r) => {
        const dinner = r.dinner || {};
        const hasDinner = (dinner && dinner.enabled) || r.wants_dinner;
        const slotMatches =
          (dinner && dinner.slotTime === slotTime) ||
          r.dinner_time_slot === slotTime;
        const isConfirmed =
          (dinner && dinner.bookingStatus === "CONFIRMED") ||
          r.dinner_status === "confirmed";
        return hasDinner && slotMatches && isConfirmed;
      })
      .reduce((sum, r) => {
        const dinner = r.dinner || {};
        return (
          sum +
          ((dinner && dinner.partySize) ||
            r.dinner_party_size ||
            r.party_size ||
            1)
        );
      }, 0);

    const waitlist = eventRsvps
      .filter((r) => {
        const dinner = r.dinner || {};
        const hasDinner = (dinner && dinner.enabled) || r.wants_dinner;
        const slotMatches =
          (dinner && dinner.slotTime === slotTime) ||
          r.dinner_time_slot === slotTime;
        const isWaitlist =
          (dinner && dinner.bookingStatus === "WAITLIST") ||
          r.dinner_status === "waitlist";
        return hasDinner && slotMatches && isWaitlist;
      })
      .reduce((sum, r) => {
        const dinner = r.dinner || {};
        return (
          sum +
          ((dinner && dinner.partySize) ||
            r.dinner_party_size ||
            r.party_size ||
            1)
        );
      }, 0);

    slotCounts[slotTime] = { confirmed, waitlist };
  });

  return slotCounts;
}

// Dinner seat counts (legacy - total across all slots)
export async function getDinnerCounts(eventId) {
  // Fetch all RSVPs with dinner for this event
  const { data: eventRsvps, error } = await supabase
    .from("rsvps")
    .select("dinner, wants_dinner, dinner_status, party_size")
    .eq("event_id", eventId)
    .or("wants_dinner.eq.true,dinner.not.is.null");

  if (error) {
    console.error("Error fetching dinner counts:", error);
    return { dinnerConfirmedSeats: 0, dinnerWaitlistSeats: 0 };
  }

  const dinnerConfirmedSeats = eventRsvps
    .filter((r) => {
      const dinner = r.dinner || {};
      const hasDinner = (dinner && dinner.enabled) || r.wants_dinner;
      const isConfirmed =
        (dinner && dinner.bookingStatus === "CONFIRMED") ||
        r.dinner_status === "confirmed";
      return hasDinner && isConfirmed;
    })
    .reduce((sum, r) => sum + (r.party_size || 1), 0);

  const dinnerWaitlistSeats = eventRsvps
    .filter((r) => {
      const dinner = r.dinner || {};
      const hasDinner = (dinner && dinner.enabled) || r.wants_dinner;
      const isWaitlist =
        (dinner && dinner.bookingStatus === "WAITLIST") ||
        r.dinner_status === "waitlist";
      return hasDinner && isWaitlist;
    })
    .reduce((sum, r) => sum + (r.party_size || 1), 0);

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
export async function findOrCreatePerson(email, name = null) {
  const normalizedEmail = email.trim().toLowerCase();

  // Try to find existing person in Supabase
  const { data: existingPerson, error: findError } = await supabase
    .from("people")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  if (existingPerson && !findError) {
    // Person exists - update name if provided and different
    if (name && name.trim() && existingPerson.name !== name.trim()) {
      const { data: updatedPerson, error: updateError } = await supabase
        .from("people")
        .update({ name: name.trim() })
        .eq("id", existingPerson.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating person name:", updateError);
        // Return existing person even if update fails
        return mapPersonFromDb(existingPerson);
      }
      return mapPersonFromDb(updatedPerson);
    }
    return mapPersonFromDb(existingPerson);
  }

  // Person doesn't exist - create new
  const { data: newPerson, error: insertError } = await supabase
    .from("people")
    .insert({
      email: normalizedEmail,
      name: name ? name.trim() : null,
      phone: null,
      notes: null,
      tags: [],
      stripe_customer_id: null,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Error creating person:", insertError);
    throw new Error("Failed to create person");
  }

  return mapPersonFromDb(newPerson);
}

// Find person by ID
export async function findPersonById(personId) {
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("id", personId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapPersonFromDb(data);
}

// Find person by email
export async function findPersonByEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  if (error || !data) {
    return null;
  }

  return mapPersonFromDb(data);
}

// Helper: Map database person to application format
function mapPersonFromDb(dbPerson) {
  return {
    id: dbPerson.id,
    email: dbPerson.email,
    name: dbPerson.name,
    phone: dbPerson.phone,
    notes: dbPerson.notes,
    tags: dbPerson.tags || [],
    stripeCustomerId: dbPerson.stripe_customer_id,
    // CRM fields
    totalSpend: dbPerson.total_spend || 0,
    paymentCount: dbPerson.payment_count || 0,
    refundedVolume: dbPerson.refunded_volume || 0,
    disputeLosses: dbPerson.dispute_losses || 0,
    subscriptionType: dbPerson.subscription_type || null,
    interestedIn: dbPerson.interested_in || null,
    importSource: dbPerson.import_source || null,
    importMetadata: dbPerson.import_metadata || null,
    campaignsReceived: dbPerson.campaigns_received || [],
    createdAt: dbPerson.created_at,
    updatedAt: dbPerson.updated_at,
  };
}

// Helper: Map application person updates to database format
function mapPersonToDb(updates) {
  const dbUpdates = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.stripeCustomerId !== undefined)
    dbUpdates.stripe_customer_id = updates.stripeCustomerId;
  // CRM fields
  if (updates.totalSpend !== undefined)
    dbUpdates.total_spend = Number(updates.totalSpend) || 0;
  if (updates.paymentCount !== undefined)
    dbUpdates.payment_count = Number(updates.paymentCount) || 0;
  if (updates.refundedVolume !== undefined)
    dbUpdates.refunded_volume = Number(updates.refundedVolume) || 0;
  if (updates.disputeLosses !== undefined)
    dbUpdates.dispute_losses = Number(updates.disputeLosses) || 0;
  if (updates.subscriptionType !== undefined)
    dbUpdates.subscription_type = updates.subscriptionType;
  if (updates.interestedIn !== undefined)
    dbUpdates.interested_in = updates.interestedIn;
  if (updates.importSource !== undefined)
    dbUpdates.import_source = updates.importSource;
  if (updates.importMetadata !== undefined)
    dbUpdates.import_metadata = updates.importMetadata;
  return dbUpdates;
}

// Update person
export async function updatePerson(personId, updates) {
  const dbUpdates = mapPersonToDb(updates);

  const { data, error } = await supabase
    .from("people")
    .update(dbUpdates)
    .eq("id", personId)
    .select()
    .single();

  if (error || !data) {
    return { error: "not_found" };
  }

  return { person: mapPersonFromDb(data) };
}

// Update person's Stripe customer ID
export async function updatePersonStripeCustomerId(personId, stripeCustomerId) {
  const { data, error } = await supabase
    .from("people")
    .update({ stripe_customer_id: stripeCustomerId })
    .eq("id", personId)
    .select()
    .single();

  if (error || !data) {
    return { error: "not_found" };
  }

  return { person: mapPersonFromDb(data) };
}

// Get all people with their event statistics (filtered by user's events)
export async function getAllPeopleWithStats(userId) {
  if (!userId) {
    return [];
  }

  // First, get all event IDs for this user (owner or co-host)
  const eventIds = await getUserEventIds(userId);

  if (!eventIds || eventIds.length === 0) {
    return [];
  }

  // Fetch all people who have RSVPs for this user's events
  const { data: allPeople, error: peopleError } = await supabase
    .from("people")
    .select("*")
    .order("created_at", { ascending: false });

  if (peopleError) {
    console.error("Error fetching people:", peopleError);
    return [];
  }

  // Fetch RSVPs only for this user's events
  const { data: allRsvps, error: rsvpsError } = await supabase
    .from("rsvps")
    .select(
      `
      *,
      events:event_id (
        id,
        title,
        slug,
        starts_at
      )
    `
    )
    .in("event_id", eventIds);

  if (rsvpsError) {
    console.error("Error fetching RSVPs:", rsvpsError);
    return allPeople.map((p) => mapPersonFromDb(p));
  }

  // Group RSVPs by person
  const rsvpsByPerson = {};
  allRsvps.forEach((rsvp) => {
    if (!rsvpsByPerson[rsvp.person_id]) {
      rsvpsByPerson[rsvp.person_id] = [];
    }
    rsvpsByPerson[rsvp.person_id].push(rsvp);
  });

  // Get unique person IDs from RSVPs (only people who RSVP'd to user's events)
  const personIdsWithRsvps = new Set(allRsvps.map((r) => r.person_id));

  // Filter people to only those who have RSVPs for this user's events
  const relevantPeople = allPeople.filter((p) => personIdsWithRsvps.has(p.id));

  // Calculate stats for each person
  const peopleWithStats = relevantPeople.map((dbPerson) => {
    const personRsvps = rsvpsByPerson[dbPerson.id] || [];

    const eventsAttended = personRsvps.filter(
      (r) => r.booking_status === "CONFIRMED" || r.status === "attending"
    ).length;
    const eventsWaitlisted = personRsvps.filter(
      (r) => r.booking_status === "WAITLIST" || r.status === "waitlist"
    ).length;
    const totalEvents = personRsvps.length;
    const totalGuestsBrought = personRsvps.reduce(
      (sum, r) => sum + (r.plus_ones || 0),
      0
    );
    const totalDinners = personRsvps.filter((r) => {
      const dinner = r.dinner;
      return (dinner && dinner.enabled) || r.wants_dinner === true;
    }).length;
    const totalDinnerGuests = personRsvps.reduce((sum, r) => {
      const dinner = r.dinner;
      const wantsDinner = (dinner && dinner.enabled) || r.wants_dinner;
      const partySize = (dinner && dinner.partySize) || r.dinner_party_size;
      return sum + (wantsDinner && partySize ? partySize : 0);
    }, 0);

    // Get event details for each RSVP
    const eventHistory = personRsvps
      .map((rsvp) => {
        const event = rsvp.events || {};
        const dinner = rsvp.dinner || {};
        return {
          rsvpId: rsvp.id,
          eventId: rsvp.event_id,
          eventTitle: event.title || "Unknown Event",
          eventSlug: event.slug || null,
          eventDate: event.starts_at || null,
          status: rsvp.booking_status || rsvp.status,
          plusOnes: rsvp.plus_ones || 0,
          wantsDinner: (dinner && dinner.enabled) || rsvp.wants_dinner || false,
          dinnerStatus:
            (dinner && dinner.bookingStatus) || rsvp.dinner_status || null,
          dinnerTimeSlot:
            (dinner && dinner.slotTime) || rsvp.dinner_time_slot || null,
          dinnerPartySize:
            (dinner && dinner.partySize) || rsvp.dinner_party_size || null,
          rsvpDate: rsvp.created_at,
        };
      })
      .sort((a, b) => {
        // Sort by event date (most recent first)
        if (!a.eventDate) return 1;
        if (!b.eventDate) return -1;
        return new Date(b.eventDate) - new Date(a.eventDate);
      });

    return {
      ...mapPersonFromDb(dbPerson),
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
  });

  // Sort by most recent activity
  return peopleWithStats.sort((a, b) => {
    const aLatest = a.eventHistory[0]?.rsvpDate || a.createdAt;
    const bLatest = b.eventHistory[0]?.rsvpDate || b.createdAt;
    return new Date(bLatest) - new Date(aLatest);
  });
}

// Get people with advanced filtering and pagination
export async function getPeopleWithFilters(
  userId,
  filters = {},
  sortBy = "created_at",
  sortOrder = "desc",
  limit = 50,
  offset = 0
) {
  if (!userId) {
    return { people: [], total: 0 };
  }

  // Get all event IDs for this user (owner or co-host) with titles for debugging
  const { data: userEvents, error: eventsError } = await supabase
    .from("events")
    .select("id, title, slug");

  if (eventsError) {
    console.error("[CRM Filter] Error fetching events:", eventsError);
    return { people: [], total: 0 };
  }

  // Filter events to only those where user is host (using join + legacy host_id)
  const eventIds = await getUserEventIds(userId);

  if (!eventIds || eventIds.length === 0) {
    console.log(`[CRM Filter] User ${userId} has no events (as host)`);
    return { people: [], total: 0 };
  }

  // Limit userEvents list to only events where user is host
  const userEventsMap = new Map(userEvents.map((e) => [e.id, e]));
  const filteredUserEvents = eventIds
    .map((id) => userEventsMap.get(id))
    .filter(Boolean);

  // Debug: Log event titles to help identify specific events
  if (filters.attendedEventId) {
    const matchingEvent = filteredUserEvents.find(
      (e) => String(e.id) === String(filters.attendedEventId)
    );
    console.log(
      `[CRM Filter] Looking for event ID: ${filters.attendedEventId}`,
      matchingEvent
        ? `Found: "${matchingEvent.title}" (slug: ${matchingEvent.slug})`
        : "NOT FOUND in user's events"
    );
    console.log(
      `[CRM Filter] User has ${filteredUserEvents.length} events as host. Sample titles:`,
      filteredUserEvents.slice(0, 5).map((e) => `${e.title} (${e.id})`)
    );
  }

  // STEP 1: First filter RSVPs based on event-based filters
  // This determines which people we're interested in
  let rsvpQuery = supabase
    .from("rsvps")
    .select(
      "person_id, event_id, booking_status, status, wants_dinner, dinner"
    );

  // Apply event-based filters
  if (filters.attendedEventId) {
    // Verify the event belongs to this user
    // Convert both to strings for comparison (UUIDs can be compared as strings)
    const eventIdStr = String(filters.attendedEventId);
    const eventIdsStr = eventIds.map((id) => String(id));

    if (!eventIdsStr.includes(eventIdStr)) {
      console.warn(
        `[CRM Filter] Event ${eventIdStr} does not belong to user ${userId}. User has ${eventIds.length} events as host.`
      );
      console.warn(
        `[CRM Filter] User's event IDs:`,
        eventIdsStr.slice(0, 5),
        eventIds.length > 5 ? `... (${eventIds.length} total)` : ""
      );
      return { people: [], total: 0 };
    }
    console.log(
      `[CRM Filter] Filtering RSVPs by event_id: ${eventIdStr} (verified ownership)`
    );
    // When filtering by specific event, query only that event (not all user events)
    rsvpQuery = rsvpQuery.eq("event_id", eventIdStr);
  } else {
    // When not filtering by specific event, query all user's events
    rsvpQuery = rsvpQuery.in("event_id", eventIds);
  }

  if (filters.attendanceStatus) {
    if (filters.attendanceStatus === "attended") {
      // Use .or() with proper syntax for Supabase
      rsvpQuery = rsvpQuery.or(
        "booking_status.eq.CONFIRMED,status.eq.attending"
      );
    } else if (filters.attendanceStatus === "waitlisted") {
      rsvpQuery = rsvpQuery.or("booking_status.eq.WAITLIST,status.eq.waitlist");
    } else if (filters.attendanceStatus === "confirmed") {
      rsvpQuery = rsvpQuery.eq("booking_status", "CONFIRMED");
    }
  }

  // Note: hasDinner filter will be applied in JavaScript after fetching
  // since it requires checking both wants_dinner and dinner.enabled (JSONB field)

  const { data: allRsvps, error: rsvpsError } = await rsvpQuery;

  if (rsvpsError) {
    console.error(
      "[CRM Filter] Error fetching RSVPs for filtering:",
      rsvpsError
    );
    console.error("[CRM Filter] Query details:", {
      eventIds: eventIds.length,
      attendedEventId: filters.attendedEventId,
      attendanceStatus: filters.attendanceStatus,
    });
    return { people: [], total: 0 };
  }

  // Debug logging
  console.log(
    `[CRM Filter] Found ${allRsvps?.length || 0} RSVPs matching criteria`,
    filters.attendedEventId
      ? `for event ${filters.attendedEventId}`
      : "for all user events"
  );

  // If no RSVPs match, return empty
  if (!allRsvps || allRsvps.length === 0) {
    console.log(
      `[CRM Filter] No RSVPs found. Filters:`,
      JSON.stringify(
        {
          attendedEventId: filters.attendedEventId,
          attendanceStatus: filters.attendanceStatus,
          hasDinner: filters.hasDinner,
          eventsAttendedMin: filters.eventsAttendedMin,
          eventsAttendedMax: filters.eventsAttendedMax,
        },
        null,
        2
      )
    );
    return { people: [], total: 0 };
  }

  // Group RSVPs by person to calculate event counts
  // Also filter by hasDinner if specified
  const rsvpsByPerson = {};
  let rsvpsAfterDinnerFilter = 0;
  (allRsvps || []).forEach((rsvp) => {
    // Filter by hasDinner if specified
    if (filters.hasDinner !== undefined) {
      const wantsDinner = rsvp.wants_dinner === true;
      const dinnerEnabled =
        rsvp.dinner &&
        typeof rsvp.dinner === "object" &&
        rsvp.dinner.enabled === true;
      const hadDinner = wantsDinner || dinnerEnabled;

      if (filters.hasDinner && !hadDinner) {
        return; // Skip this RSVP if we want people with dinner but this one doesn't have it
      }
      if (!filters.hasDinner && hadDinner) {
        return; // Skip this RSVP if we want people without dinner but this one has it
      }
    }

    rsvpsAfterDinnerFilter++;
    if (!rsvpsByPerson[rsvp.person_id]) {
      rsvpsByPerson[rsvp.person_id] = [];
    }
    rsvpsByPerson[rsvp.person_id].push(rsvp);
  });

  console.log(
    `[CRM Filter] After dinner filter: ${rsvpsAfterDinnerFilter} RSVPs, ${
      Object.keys(rsvpsByPerson).length
    } unique people`
  );

  // Filter by events attended count if specified
  // Note: person_id from RSVPs is already a UUID string, so we can use it directly
  // Object.keys() returns strings, and person_id from database is UUID (string)
  let personIdsWithRsvps = new Set(Object.keys(rsvpsByPerson));

  console.log(
    `[CRM Filter] After grouping: ${
      personIdsWithRsvps.size
    } unique people from ${Object.values(rsvpsByPerson).reduce(
      (sum, arr) => sum + arr.length,
      0
    )} RSVPs`
  );

  // Log sample person IDs to verify format
  if (personIdsWithRsvps.size > 0) {
    const sampleIds = Array.from(personIdsWithRsvps).slice(0, 2);
    console.log(`[CRM Filter] Sample person IDs:`, sampleIds);
  }

  if (
    filters.eventsAttendedMin !== undefined ||
    filters.eventsAttendedMax !== undefined
  ) {
    const minEvents = filters.eventsAttendedMin || 0;
    const maxEvents = filters.eventsAttendedMax || Infinity;

    personIdsWithRsvps = new Set(
      Object.keys(rsvpsByPerson).filter((personId) => {
        const personRsvps = rsvpsByPerson[personId];
        const attendedCount = personRsvps.filter(
          (r) => r.booking_status === "CONFIRMED" || r.status === "attending"
        ).length;
        return attendedCount >= minEvents && attendedCount <= maxEvents;
      })
    );
  }

  // STEP 2: Now query people, but ONLY those who match our RSVP filters
  if (personIdsWithRsvps.size === 0) {
    console.log(
      `[CRM Filter] No person IDs after RSVP filtering. Filters:`,
      JSON.stringify(
        {
          attendedEventId: filters.attendedEventId,
          attendanceStatus: filters.attendanceStatus,
          hasDinner: filters.hasDinner,
          eventsAttendedMin: filters.eventsAttendedMin,
          eventsAttendedMax: filters.eventsAttendedMax,
        },
        null,
        2
      )
    );
    return { people: [], total: 0 };
  }

  const personIdsArray = Array.from(personIdsWithRsvps);
  console.log(
    `[CRM Filter] Querying ${personIdsArray.length} people from RSVP criteria. First 3 person IDs:`,
    personIdsArray.slice(0, 3)
  );

  // Build query for people - start with person_id filter
  // Note: Supabase .in() has limits (typically ~100-200 items), so we batch large queries
  const BATCH_SIZE = 100; // Safe batch size for Supabase .in() queries

  let allPeople = [];
  let totalCount = 0;

  if (personIdsArray.length === 0) {
    return { people: [], total: 0 };
  }

  // Log the query we're about to execute
  console.log(
    `[CRM Filter] People query: SELECT * FROM people WHERE id IN (${personIdsArray.length} IDs) - batching into chunks of ${BATCH_SIZE}`
  );

  // Batch the person IDs into smaller chunks
  for (let i = 0; i < personIdsArray.length; i += BATCH_SIZE) {
    const batch = personIdsArray.slice(i, i + BATCH_SIZE);

    let query = supabase
      .from("people")
      .select("*", { count: "exact" })
      .in("id", batch);

    // Apply other filters (email, name, search, etc.)
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      query = query.or(
        `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`
      );
    }

    if (filters.email) {
      query = query.ilike("email", `%${filters.email}%`);
    }

    if (filters.name) {
      query = query.ilike("name", `%${filters.name}%`);
    }

    if (filters.totalSpendMin !== undefined) {
      query = query.gte("total_spend", filters.totalSpendMin);
    }

    if (filters.totalSpendMax !== undefined) {
      query = query.lte("total_spend", filters.totalSpendMax);
    }

    if (filters.paymentCountMin !== undefined) {
      query = query.gte("payment_count", filters.paymentCountMin);
    }

    if (filters.paymentCountMax !== undefined) {
      query = query.lte("payment_count", filters.paymentCountMax);
    }

    if (filters.subscriptionType) {
      query = query.eq("subscription_type", filters.subscriptionType);
    }

    if (filters.interestedIn) {
      query = query.ilike("interested_in", `%${filters.interestedIn}%`);
    }

    if (filters.tags && filters.tags.length > 0) {
      query = query.contains("tags", filters.tags);
    }

    if (filters.hasStripeCustomerId !== undefined) {
      if (filters.hasStripeCustomerId) {
        query = query.not("stripe_customer_id", "is", null);
      } else {
        query = query.is("stripe_customer_id", null);
      }
    }

    // Fetch all results from this batch (no pagination yet - we'll paginate after combining)
    const {
      data: batchPeople,
      error: batchError,
      count: batchCount,
    } = await query;

    if (batchError) {
      console.error(
        `[CRM Filter] Error fetching people batch ${i / BATCH_SIZE + 1}:`,
        batchError
      );
      // Continue with other batches even if one fails
      continue;
    }

    if (batchPeople) {
      allPeople = allPeople.concat(batchPeople);
    }
    if (batchCount !== null) {
      totalCount += batchCount;
    }
  }

  // Remove duplicates (in case any person appears in multiple batches due to filters)
  const uniquePeople = Array.from(
    new Map(allPeople.map((p) => [p.id, p])).values()
  );

  // Sort
  const validSortFields = [
    "created_at",
    "updated_at",
    "name",
    "email",
    "total_spend",
    "payment_count",
  ];
  const sortField = validSortFields.includes(sortBy) ? sortBy : "created_at";
  const sortDir = sortOrder === "asc" ? "asc" : "desc";

  uniquePeople.sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    if (sortDir === "asc") {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });

  // Apply pagination after sorting
  const paginatedPeople = uniquePeople.slice(offset, offset + limit);
  const count = uniquePeople.length; // Use actual filtered count, not totalCount from batches

  const people = paginatedPeople;
  const error = null; // No error if we got here

  if (error) {
    console.error("[CRM Filter] Error fetching people with filters:", error);
    return { people: [], total: 0 };
  }

  console.log(
    `[CRM Filter] Found ${people?.length || 0} people (total count: ${
      count || 0
    })`
  );

  // STEP 3: Enrich people with event history and stats (like getAllPeopleWithStats does)
  // Fetch all RSVPs for these people to build event history
  const peopleIds = (people || []).map((p) => p.id);

  if (peopleIds.length === 0) {
    return { people: [], total: count || 0 };
  }

  // Fetch RSVPs with event details for these people
  // Note: We fetch ALL RSVPs for these people across ALL user events to build complete event history
  console.log(
    `[CRM Filter] Fetching event history for ${peopleIds.length} people across ${eventIds.length} events`
  );
  console.log(
    `[CRM Filter] Event IDs for history query:`,
    eventIds.slice(0, 5),
    eventIds.length > 5 ? `... (${eventIds.length} total)` : ""
  );

  const { data: allRsvpsForPeople, error: rsvpsError2 } = await supabase
    .from("rsvps")
    .select(
      `
      *,
      events:event_id (
        id,
        title,
        slug,
        starts_at
      )
    `
    )
    .in("person_id", peopleIds)
    .in("event_id", eventIds);

  // Note: The * selector includes all RSVP fields including:
  // - pulled_up, pulled_up_count, pulled_up_for_dinner, pulled_up_for_cocktails
  // - dinner_pull_up_count, cocktail_only_pull_up_count
  // - wants_dinner, dinner (JSONB), booking_status, status

  if (rsvpsError2) {
    console.error(
      "[CRM Filter] Error fetching RSVPs for event history:",
      rsvpsError2
    );
    // Return people without event history if RSVP fetch fails
    return {
      people: (people || []).map((p) => mapPersonFromDb(p)),
      total: count || 0,
    };
  }

  // Fallback: If any RSVPs are missing event data from the join, fetch events separately
  // This can happen if the Supabase foreign key relationship isn't properly configured
  const rsvpsMissingEventData = (allRsvpsForPeople || []).filter(
    (r) => !r.events && r.event_id
  );
  if (rsvpsMissingEventData.length > 0) {
    console.log(
      `[CRM Filter] Found ${rsvpsMissingEventData.length} RSVPs with missing event data, fetching events separately`
    );
    const missingEventIds = [
      ...new Set(rsvpsMissingEventData.map((r) => r.event_id)),
    ];
    const { data: missingEvents, error: eventsError } = await supabase
      .from("events")
      .select("id, title, slug, starts_at")
      .in("id", missingEventIds);

    if (!eventsError && missingEvents) {
      // Create a map of event_id -> event data
      const eventMap = {};
      missingEvents.forEach((e) => {
        eventMap[e.id] = e;
      });
      // Attach event data to RSVPs that were missing it
      allRsvpsForPeople.forEach((rsvp) => {
        if (!rsvp.events && rsvp.event_id && eventMap[rsvp.event_id]) {
          rsvp.events = eventMap[rsvp.event_id];
        }
      });
    }
  }

  // Debug: Log RSVPs fetched for event history
  console.log(
    `[CRM Filter] Fetched ${
      allRsvpsForPeople?.length || 0
    } RSVPs for event history`
  );
  if (allRsvpsForPeople && allRsvpsForPeople.length > 0) {
    const sampleRsvp = allRsvpsForPeople[0];
    console.log(`[CRM Filter] Sample RSVP for event history:`, {
      person_id: sampleRsvp.person_id,
      event_id: sampleRsvp.event_id,
      has_events_join: !!sampleRsvp.events,
      events_data: sampleRsvp.events,
    });
    // Check for Kaijas Musiksalong specifically
    const kaijasRsvps = allRsvpsForPeople.filter(
      (r) => r.event_id === "e4ab5149-9e55-437b-9e05-9289207201b4"
    );
    if (kaijasRsvps.length > 0) {
      console.log(
        `[CRM Filter] Found ${kaijasRsvps.length} Kaijas Musiksalong RSVPs in event history query`
      );
      console.log(
        `[CRM Filter] Sample Kaijas RSVP events join:`,
        kaijasRsvps[0].events
      );
    }
  }

  // Group RSVPs by person
  const rsvpsByPersonForHistory = {};
  (allRsvpsForPeople || []).forEach((rsvp) => {
    if (!rsvpsByPersonForHistory[rsvp.person_id]) {
      rsvpsByPersonForHistory[rsvp.person_id] = [];
    }
    rsvpsByPersonForHistory[rsvp.person_id].push(rsvp);
  });

  // Enrich each person with stats and event history
  const enrichedPeople = (people || []).map((dbPerson) => {
    const personRsvps = rsvpsByPersonForHistory[dbPerson.id] || [];

    const eventsAttended = personRsvps.filter(
      (r) => r.booking_status === "CONFIRMED" || r.status === "attending"
    ).length;
    const eventsWaitlisted = personRsvps.filter(
      (r) => r.booking_status === "WAITLIST" || r.status === "waitlist"
    ).length;
    const totalEvents = personRsvps.length;
    const totalGuestsBrought = personRsvps.reduce(
      (sum, r) => sum + (r.plus_ones || 0),
      0
    );
    const totalDinners = personRsvps.filter((r) => {
      const dinner = r.dinner || {};
      return (dinner && dinner.enabled) || r.wants_dinner === true;
    }).length;
    const totalDinnerGuests = personRsvps.reduce((sum, r) => {
      const dinner = r.dinner || {};
      const wantsDinner = (dinner && dinner.enabled) || r.wants_dinner;
      const partySize = (dinner && dinner.partySize) || r.dinner_party_size;
      return sum + (wantsDinner && partySize ? partySize : 0);
    }, 0);

    // Get event details for each RSVP
    const eventHistory = personRsvps
      .map((rsvp) => {
        // Handle Supabase join - events can be an object or null
        // The join syntax `events:event_id` should return an object, but may be null if join fails
        const event = rsvp.events || null;
        const dinner = rsvp.dinner || {};

        // Debug: Log if event join is missing for Kaijas Musiksalong
        if (
          rsvp.event_id === "e4ab5149-9e55-437b-9e05-9289207201b4" &&
          !event
        ) {
          console.warn(
            `[CRM Filter] Missing event join for Kaijas Musiksalong RSVP:`,
            {
              rsvp_id: rsvp.id,
              person_id: rsvp.person_id,
              event_id: rsvp.event_id,
              has_events: !!rsvp.events,
              events_value: rsvp.events,
            }
          );
        }

        // Determine event type: cocktails only vs dinner
        const wantsDinner =
          (dinner && dinner.enabled) || rsvp.wants_dinner || false;
        const eventType = wantsDinner ? "dinner" : "cocktails";

        // Calculate booked counts
        const partySize = rsvp.party_size || 1;
        const dinnerPartySize =
          (dinner && dinner.partySize) || rsvp.dinner_party_size || 0;
        const plusOnes = rsvp.plus_ones || 0;

        // Cocktails booked: if dinner, it's plusOnes (cocktails-only guests), otherwise partySize
        const cocktailsBooked = wantsDinner ? plusOnes : partySize;
        // Dinner booked: dinnerPartySize if wantsDinner, otherwise 0
        const dinnerBooked = wantsDinner ? dinnerPartySize : 0;

        // Get attendance counts by type
        const cocktailsAttended = rsvp.pulled_up_for_cocktails
          ? rsvp.cocktail_only_pull_up_count || 0
          : 0;
        const dinnerAttended = rsvp.pulled_up_for_dinner
          ? rsvp.dinner_pull_up_count || 0
          : 0;

        // Determine attendance status: confirmed vs actually attended
        const isConfirmed = rsvp.booking_status === "CONFIRMED";
        // Attended if any guests actually pulled up (cocktails or dinner)
        const actuallyAttended =
          rsvp.pulled_up === true ||
          cocktailsAttended > 0 ||
          dinnerAttended > 0;
        const attendanceStatus = actuallyAttended
          ? "attended"
          : isConfirmed
          ? "confirmed"
          : "waitlisted";

        return {
          rsvpId: rsvp.id,
          eventId: rsvp.event_id,
          eventTitle: event?.title || "Unknown Event",
          eventSlug: event?.slug || null,
          eventDate: event?.starts_at || null,
          status: rsvp.booking_status || rsvp.status,
          plusOnes: rsvp.plus_ones || 0,
          wantsDinner,
          eventType, // "cocktails" | "dinner"
          attendanceStatus, // "confirmed" | "attended" | "waitlisted"
          actuallyAttended, // boolean - did they actually show up?
          cocktailsBooked, // number of cocktails guests booked
          cocktailsAttended, // number of cocktails guests who attended
          dinnerBooked, // number of dinner guests booked
          dinnerAttended, // number of dinner guests who attended
          dinnerStatus:
            (dinner && dinner.bookingStatus) || rsvp.dinner_status || null,
          dinnerTimeSlot:
            (dinner && dinner.slotTime) || rsvp.dinner_time_slot || null,
          dinnerPartySize:
            (dinner && dinner.partySize) || rsvp.dinner_party_size || null,
          rsvpDate: rsvp.created_at,
        };
      })
      .sort((a, b) => {
        // Sort by event date (most recent first)
        if (!a.eventDate) return 1;
        if (!b.eventDate) return -1;
        return new Date(b.eventDate) - new Date(a.eventDate);
      });

    return {
      ...mapPersonFromDb(dbPerson),
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
  });

  return {
    people: enrichedPeople,
    total: count || 0,
  };
}

// Get person touchpoints (RSVPs, payments, emails)
export async function getPersonTouchpoints(personId, userId) {
  if (!personId || !userId) {
    return { rsvps: [], payments: [], emails: [] };
  }

  // Verify user has access (person must have RSVP'd to user's events)
  const { data: userEvents } = await supabase
    .from("events")
    .select("id")
    .eq("host_id", userId);

  if (!userEvents || userEvents.length === 0) {
    return { rsvps: [], payments: [], emails: [] };
  }

  const eventIds = userEvents.map((e) => e.id);

  // Get RSVPs
  const { data: rsvps, error: rsvpsError } = await supabase
    .from("rsvps")
    .select(
      `
      *,
      events:event_id (
        id,
        title,
        slug,
        starts_at
      )
    `
    )
    .eq("person_id", personId)
    .in("event_id", eventIds)
    .order("created_at", { ascending: false });

  // Get payments (via RSVPs or directly linked)
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .in("event_id", eventIds)
    .or(`rsvp_id.in.(${rsvps?.map((r) => r.id).join(",") || ""})`)
    .order("created_at", { ascending: false });

  // Get emails (campaign sends)
  const { data: emails, error: emailsError } = await supabase
    .from("email_sends")
    .select(
      `
      *,
      campaigns:campaign_id (
        id,
        name,
        subject
      )
    `
    )
    .eq("person_id", personId)
    .order("created_at", { ascending: false });

  return {
    rsvps: (rsvps || []).map((rsvp) => ({
      id: rsvp.id,
      eventId: rsvp.event_id,
      eventTitle: rsvp.events?.title || "Unknown Event",
      eventSlug: rsvp.events?.slug || null,
      eventDate: rsvp.events?.starts_at || null,
      status: rsvp.booking_status || rsvp.status,
      createdAt: rsvp.created_at,
    })),
    payments: (payments || []).map((payment) => ({
      id: payment.id,
      eventId: payment.event_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.created_at,
      paidAt: payment.paid_at,
    })),
    emails: (emails || []).map((email) => ({
      id: email.id,
      campaignId: email.campaign_id,
      campaignName: email.campaigns?.name || "Unknown Campaign",
      subject: email.subject,
      status: email.status,
      sentAt: email.sent_at,
      deliveredAt: email.delivered_at,
      openedAt: email.opened_at,
      clickedAt: email.clicked_at,
      createdAt: email.created_at,
    })),
  };
}

// Helper: Map database RSVP to application format
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
    createdAt: dbRsvp.created_at,
    updatedAt: dbRsvp.updated_at,
    // Enrich with person data if provided
    name: person?.name || null,
    email: person?.email || null,
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
export async function addRsvp({
  slug,
  name,
  email,
  plusOnes = 0,
  wantsDinner = false,
  dinnerTimeSlot = null,
  dinnerPartySize = null,
}) {
  const event = await findEventBySlug(slug);
  if (!event) return { error: "not_found" };

  if (!email || !isValidEmail(email.trim())) {
    return { error: "invalid_email" };
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Find or create person
  const person = await findOrCreatePerson(normalizedEmail, name);

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
  if (!cocktailCapacityOk || !dinnerCapacityOk) {
    if (event.waitlistEnabled) {
      bookingStatus = "WAITLIST";
    } else {
      return { error: "full", event };
    }
  }

  // Set dinner status based on capacity check and booking status
  if (finalWantsDinner) {
    if (!dinnerCapacityOk || bookingStatus === "WAITLIST") {
      dinnerStatus = "WAITLIST";
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
  };

  const dbRsvpData = mapRsvpToDb(rsvpData);

  // Insert RSVP into database
  const { data: insertedRsvp, error: insertError } = await supabase
    .from("rsvps")
    .insert(dbRsvpData)
    .select()
    .single();

  if (insertError) {
    console.error("Error creating RSVP:", insertError);
    return { error: "database_error", message: insertError.message };
  }

  const rsvp = mapRsvpFromDb(insertedRsvp, person);

  return { event, rsvp };
}

export async function getRsvpsForEvent(eventId) {
  // Fetch all RSVPs for this event with person data
  const { data: eventRsvps, error } = await supabase
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
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
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
  } else if (isOnlyLinkFields || isOnlyPaymentUpdate) {
    // Preserve existing booking status when only updating waitlist link fields or payment fields
    // Waitlist RSVPs should stay WAITLIST until payment succeeds (handled in webhook)
    bookingStatus = rsvp.bookingStatus || bookingStatus;
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

  // Derive pulledUp and pulledUpCount for backward compatibility
  const pulledUp = dinnerPullUpCount > 0 || cocktailOnlyPullUpCount > 0;
  const pulledUpCount = pulledUp
    ? dinnerPullUpCount + cocktailOnlyPullUpCount
    : null;

  // Admin Override: forceConfirm bypasses capacity checks
  // Also preserve override if guest was already over capacity (capacityOverridden flag)
  const wasAlreadyOverCapacity = rsvp.capacityOverridden === true;
  let capacityOverridden = wasAlreadyOverCapacity;

  if (forceConfirm || wasAlreadyOverCapacity) {
    // Admin override: force booking to confirmed, even if capacity exceeded
    // Preserve CONFIRMED status for guests who were already over capacity
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

// ---------------------------
// Payment CRUD
// ---------------------------

// Create payment record
export async function createPayment({
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
  // Ensure amount is a valid number
  const amountNum = typeof amount === "number" ? amount : Number(amount);
  if (isNaN(amountNum) || amountNum < 0) {
    throw new Error(`Invalid amount: ${amount}. Must be a positive number.`);
  }

  // Ensure rsvpId is either null or a valid UUID string (not false)
  const rsvpIdValue = rsvpId && rsvpId !== false ? rsvpId : null;

  const paymentData = {
    user_id: userId,
    event_id: eventId,
    rsvp_id: rsvpIdValue,
    stripe_payment_intent_id: stripePaymentIntentId,
    stripe_customer_id: stripeCustomerId,
    stripe_charge_id: stripeChargeId,
    stripe_checkout_session_id: stripeCheckoutSessionId,
    amount: amountNum,
    currency,
    status, // "pending" | "succeeded" | "failed" | "refunded" | "canceled"
    payment_method: paymentMethod,
    description,
    receipt_url: receiptUrl,
    refunded_amount: 0,
    refunded_at: null,
    paid_at: status === "succeeded" ? new Date().toISOString() : null,
    metadata: {},
  };

  const { data: insertedPayment, error: insertError } = await supabase
    .from("payments")
    .insert(paymentData)
    .select()
    .single();

  if (insertError) {
    console.error("Error creating payment:", insertError);
    throw new Error("Failed to create payment");
  }

  // Link payment to RSVP if provided
  if (rsvpId && insertedPayment) {
    await supabase
      .from("rsvps")
      .update({
        payment_id: insertedPayment.id,
        payment_status: status === "succeeded" ? "paid" : "pending",
      })
      .eq("id", rsvpId);
  }

  // Map to application format
  return {
    id: insertedPayment.id,
    userId: insertedPayment.user_id,
    eventId: insertedPayment.event_id,
    rsvpId: insertedPayment.rsvp_id,
    stripePaymentIntentId: insertedPayment.stripe_payment_intent_id,
    stripeCustomerId: insertedPayment.stripe_customer_id,
    stripeChargeId: insertedPayment.stripe_charge_id,
    stripeCheckoutSessionId: insertedPayment.stripe_checkout_session_id,
    amount: insertedPayment.amount,
    currency: insertedPayment.currency,
    status: insertedPayment.status,
    paymentMethod: insertedPayment.payment_method,
    description: insertedPayment.description,
    receiptUrl: insertedPayment.receipt_url,
    refundedAmount: insertedPayment.refunded_amount,
    refundedAt: insertedPayment.refunded_at,
    createdAt: insertedPayment.created_at,
    updatedAt: insertedPayment.updated_at,
    paidAt: insertedPayment.paid_at,
    metadata: insertedPayment.metadata,
  };
}

// Helper: Map database payment to application format
function mapPaymentFromDb(dbPayment) {
  return {
    id: dbPayment.id,
    userId: dbPayment.user_id,
    eventId: dbPayment.event_id,
    rsvpId: dbPayment.rsvp_id,
    stripePaymentIntentId: dbPayment.stripe_payment_intent_id,
    stripeCustomerId: dbPayment.stripe_customer_id,
    stripeChargeId: dbPayment.stripe_charge_id,
    stripeCheckoutSessionId: dbPayment.stripe_checkout_session_id,
    amount: dbPayment.amount,
    currency: dbPayment.currency,
    status: dbPayment.status,
    paymentMethod: dbPayment.payment_method,
    description: dbPayment.description,
    receiptUrl: dbPayment.receipt_url,
    refundedAmount: dbPayment.refunded_amount,
    refundedAt: dbPayment.refunded_at,
    createdAt: dbPayment.created_at,
    updatedAt: dbPayment.updated_at,
    paidAt: dbPayment.paid_at,
    metadata: dbPayment.metadata,
  };
}

// Find payment by ID
export async function findPaymentById(paymentId) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapPaymentFromDb(data);
}

// Find payment by Stripe Payment Intent ID
export async function findPaymentByStripePaymentIntentId(
  stripePaymentIntentId
) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("stripe_payment_intent_id", stripePaymentIntentId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapPaymentFromDb(data);
}

// Find payment by Stripe Charge ID
export async function findPaymentByStripeChargeId(stripeChargeId) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("stripe_charge_id", stripeChargeId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapPaymentFromDb(data);
}

// Update payment
export async function updatePayment(paymentId, updates) {
  // Map application-style updates to DB columns
  const dbUpdates = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.stripeChargeId !== undefined)
    dbUpdates.stripe_charge_id = updates.stripeChargeId;
  if (updates.paidAt !== undefined) dbUpdates.paid_at = updates.paidAt;
  if (updates.receiptUrl !== undefined)
    dbUpdates.receipt_url = updates.receiptUrl;
  if (updates.refundedAmount !== undefined) {
    const refundedAmountNum =
      typeof updates.refundedAmount === "number"
        ? updates.refundedAmount
        : Number(updates.refundedAmount);
    if (!isNaN(refundedAmountNum) && refundedAmountNum >= 0) {
      dbUpdates.refunded_amount = refundedAmountNum;
    }
  }
  if (updates.refundedAt !== undefined)
    dbUpdates.refunded_at = updates.refundedAt;
  if (updates.stripePaymentIntentId !== undefined)
    dbUpdates.stripe_payment_intent_id = updates.stripePaymentIntentId;

  const { data, error } = await supabase
    .from("payments")
    .update(dbUpdates)
    .eq("id", paymentId)
    .select()
    .single();

  if (error || !data) {
    return { error: "not_found" };
  }

  // Also keep RSVP.payment_status in sync for convenience
  if (data.rsvp_id) {
    let paymentStatus = null;
    if (data.status === "succeeded") {
      paymentStatus = "paid";
    } else if (data.status === "refunded") {
      paymentStatus = "refunded";
    } else if (data.status === "failed" || data.status === "canceled") {
      paymentStatus = "unpaid";
    }

    if (paymentStatus !== null) {
      await supabase
        .from("rsvps")
        .update({ payment_status: paymentStatus })
        .eq("id", data.rsvp_id);
    }
  }

  return { payment: mapPaymentFromDb(data) };
}

// Get payments for user
export async function getPaymentsForUser(userId) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((p) => mapPaymentFromDb(p));
}

// Get payments for event
export async function getPaymentsForEvent(eventId) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((p) => mapPaymentFromDb(p));
}

// ---------------------------
// Profile Management
// ---------------------------

// Get user profile
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error && error.code === "PGRST116") {
    // Profile doesn't exist, create default
    return await createDefaultProfile(userId);
  }

  if (error) throw error;

  const profile = mapProfileFromDb(data);

  // If profile has a picture path, generate the appropriate URL
  // We store the file path (e.g., "userId/profile.ext") in the database
  // and generate signed URLs (for private buckets) or public URLs (for public buckets) on fetch
  if (profile.profilePicture) {
    try {
      let filePath = profile.profilePicture;

      // If it's already a full URL, extract the path
      if (profile.profilePicture.includes("profile-pictures/")) {
        const urlMatch = profile.profilePicture.match(
          /profile-pictures\/([^?]+)/
        );
        if (urlMatch) {
          filePath = urlMatch[1];
        }
      }

      // Try to generate signed URL first (for private buckets)
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from("profile-pictures")
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (!urlError && signedUrlData?.signedUrl) {
        profile.profilePicture = signedUrlData.signedUrl;
      } else {
        // Fallback to public URL (for public buckets or if signed URL fails)
        const {
          data: { publicUrl },
        } = supabase.storage.from("profile-pictures").getPublicUrl(filePath);
        profile.profilePicture = publicUrl;
      }
    } catch (urlError) {
      // If URL generation fails, try to use stored value as-is
      console.error("Error generating profile picture URL:", urlError);
    }
  }

  return profile;
}

// Create default profile
export async function createDefaultProfile(userId) {
  // Get user email from auth.users via service role
  // Note: We can't use admin API from client, so we'll get basic info from the request
  // For now, we'll create a minimal profile and let the user update it
  const defaultProfile = {
    id: userId,
    name: null,
    brand: null,
    bio: null,
    profile_picture_url: null,
    mobile_number: null,
    branding_links: {
      instagram: "",
      x: "",
      youtube: "",
      tiktok: "",
      linkedin: "",
      website: "",
    },
    additional_emails: [],
    third_party_accounts: [],
  };

  const { data, error } = await supabase
    .from("profiles")
    .insert(defaultProfile)
    .select()
    .single();

  if (error) throw error;
  return mapProfileFromDb(data);
}

// Update user profile
export async function updateUserProfile(userId, updates) {
  const dbUpdates = mapProfileToDb(updates);

  const { data, error } = await supabase
    .from("profiles")
    .update(dbUpdates)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return mapProfileFromDb(data);
}

// Update Stripe connected account ID for a user
export async function updateUserStripeConnectedAccountId(userId, accountId) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ stripe_connected_account_id: accountId })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return mapProfileFromDb(data);
}

// Get Stripe connected account ID for a user
export async function getUserStripeConnectedAccountId(userId) {
  const profile = await getUserProfile(userId);
  return profile.stripeConnectedAccountId || null;
}

// Helper: Map database profile to application format
function mapProfileFromDb(dbProfile) {
  return {
    id: dbProfile.id,
    name: dbProfile.name || "",
    brand: dbProfile.brand || "",
    bio: dbProfile.bio || "",
    profilePicture: dbProfile.profile_picture_url || null,
    mobileNumber: dbProfile.mobile_number || "",
    brandingLinks: dbProfile.branding_links || {
      instagram: "",
      x: "",
      youtube: "",
      tiktok: "",
      linkedin: "",
      website: "",
    },
    emails: dbProfile.additional_emails || [],
    thirdPartyAccounts: dbProfile.third_party_accounts || [],
    stripeConnectedAccountId: dbProfile.stripe_connected_account_id || null,
    createdAt: dbProfile.created_at,
    updatedAt: dbProfile.updated_at,
  };
}

// Helper: Map application profile to database format
function mapProfileToDb(profile) {
  const dbProfile = {};
  if (profile.name !== undefined) dbProfile.name = profile.name;
  if (profile.brand !== undefined) dbProfile.brand = profile.brand;
  if (profile.bio !== undefined) dbProfile.bio = profile.bio;
  if (profile.profilePicture !== undefined)
    dbProfile.profile_picture_url = profile.profilePicture;
  if (profile.mobileNumber !== undefined)
    dbProfile.mobile_number = profile.mobileNumber;
  if (profile.brandingLinks !== undefined)
    dbProfile.branding_links = profile.brandingLinks;
  if (profile.emails !== undefined)
    dbProfile.additional_emails = profile.emails;
  if (profile.thirdPartyAccounts !== undefined)
    dbProfile.third_party_accounts = profile.thirdPartyAccounts;
  if (profile.stripeConnectedAccountId !== undefined)
    dbProfile.stripe_connected_account_id = profile.stripeConnectedAccountId;
  return dbProfile;
}

// ---------------------------
// Email Campaign CRUD
// ---------------------------

/**
 * Create an email campaign
 */
export async function createEmailCampaign({
  userId,
  name,
  templateType = "event",
  eventId = null,
  subject,
  templateContent = {},
  filterCriteria = {},
  totalRecipients = 0,
}) {
  const { data, error } = await supabase
    .from("email_campaigns")
    .insert({
      user_id: userId,
      name,
      template_type: templateType,
      event_id: eventId,
      subject,
      template_content: templateContent,
      filter_criteria: filterCriteria,
      total_recipients: totalRecipients,
      status: "queued",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating email campaign:", error);
    throw new Error(`Failed to create campaign: ${error.message}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    templateType: data.template_type,
    eventId: data.event_id,
    subject: data.subject,
    templateContent: data.template_content,
    filterCriteria: data.filter_criteria,
    totalRecipients: data.total_recipients,
    totalSent: data.total_sent || 0,
    totalFailed: data.total_failed || 0,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Get email campaign by ID (with ownership check)
 */
export async function getEmailCampaign(campaignId, userId) {
  const { data, error } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return null;
    }
    console.error("Error fetching email campaign:", error);
    throw new Error(`Failed to fetch campaign: ${error.message}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    templateType: data.template_type,
    eventId: data.event_id,
    subject: data.subject,
    templateContent: data.template_content,
    filterCriteria: data.filter_criteria,
    totalRecipients: data.total_recipients || 0,
    totalSent: data.total_sent || 0,
    totalFailed: data.total_failed || 0,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    sentAt: data.sent_at,
  };
}

/**
 * Update email campaign status and stats
 */
export async function updateEmailCampaignStatus(
  campaignId,
  status,
  stats = {}
) {
  const updates = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (stats.totalSent !== undefined) updates.total_sent = stats.totalSent;
  if (stats.totalFailed !== undefined) updates.total_failed = stats.totalFailed;
  if (status === "sent" && !stats.sentAt) {
    updates.sent_at = new Date().toISOString();
  }
  if (stats.sentAt) updates.sent_at = stats.sentAt;

  const { data, error } = await supabase
    .from("email_campaigns")
    .update(updates)
    .eq("id", campaignId)
    .select()
    .single();

  if (error) {
    console.error("Error updating email campaign:", error);
    throw new Error(`Failed to update campaign: ${error.message}`);
  }

  return {
    id: data.id,
    status: data.status,
    totalSent: data.total_sent || 0,
    totalFailed: data.total_failed || 0,
    sentAt: data.sent_at,
  };
}

/**
 * Add campaign ID to person's campaigns_received array
 */
export async function addCampaignToPerson(personId, campaignId) {
  // Get current campaigns_received array
  const { data: person, error: fetchError } = await supabase
    .from("people")
    .select("campaigns_received")
    .eq("id", personId)
    .single();

  if (fetchError) {
    console.error("Error fetching person:", fetchError);
    throw new Error(`Failed to fetch person: ${fetchError.message}`);
  }

  const currentCampaigns = person.campaigns_received || [];

  // Only add if not already present
  if (!currentCampaigns.includes(campaignId)) {
    const updatedCampaigns = [...currentCampaigns, campaignId];

    const { error: updateError } = await supabase
      .from("people")
      .update({ campaigns_received: updatedCampaigns })
      .eq("id", personId);

    if (updateError) {
      console.error("Error updating person campaigns:", updateError);
      throw new Error(`Failed to update person: ${updateError.message}`);
    }
  }

  return true;
}

/**
 * Batch update multiple people with campaign ID
 */
export async function addCampaignToPeople(personIds, campaignId) {
  if (!personIds || personIds.length === 0) return { updated: 0, errors: [] };

  const errors = [];
  let updated = 0;

  // Process in batches to avoid overwhelming the database
  const BATCH_SIZE = 50;
  for (let i = 0; i < personIds.length; i += BATCH_SIZE) {
    const batch = personIds.slice(i, i + BATCH_SIZE);

    // Fetch all people in batch
    const { data: people, error: fetchError } = await supabase
      .from("people")
      .select("id, campaigns_received")
      .in("id", batch);

    if (fetchError) {
      console.error(`Error fetching batch ${i}:`, fetchError);
      errors.push(
        ...batch.map((id) => ({ personId: id, error: fetchError.message }))
      );
      continue;
    }

    // Update each person
    for (const person of people) {
      try {
        const currentCampaigns = person.campaigns_received || [];
        if (!currentCampaigns.includes(campaignId)) {
          const updatedCampaigns = [...currentCampaigns, campaignId];

          const { error: updateError } = await supabase
            .from("people")
            .update({ campaigns_received: updatedCampaigns })
            .eq("id", person.id);

          if (updateError) {
            errors.push({ personId: person.id, error: updateError.message });
          } else {
            updated++;
          }
        } else {
          updated++; // Already has campaign, count as updated
        }
      } catch (err) {
        errors.push({ personId: person.id, error: err.message });
      }
    }
  }

  return { updated, errors };
}
