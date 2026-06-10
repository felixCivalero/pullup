// Events repo: event rows, slugs, db<->app mapping, editable-field allowlist,
// CRUD, RSVP/dinner-slot counts, and the host image gallery.
import crypto from "node:crypto";
import { supabase } from "../supabase.js";
import { logger } from "../logger.js";
import { isUserEventHost } from "./eventAccess.js";
import { throwConstraintError } from "./people.js";
import { calculateCocktailsOnly } from "./rsvps.js";

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Charset omits visually-confusing chars (0/o, 1/i/l) — 31 chars, 4-length = ~923k values.
const SLUG_SUFFIX_CHARSET = "abcdefghjkmnpqrstuvwxyz23456789";
const SLUG_SUFFIX_LEN = 4;

function randomSlugSuffix() {
  const bytes = crypto.randomBytes(SLUG_SUFFIX_LEN);
  let out = "";
  for (let i = 0; i < SLUG_SUFFIX_LEN; i += 1) {
    out += SLUG_SUFFIX_CHARSET[bytes[i] % SLUG_SUFFIX_CHARSET.length];
  }
  return out;
}

// Build a slug guaranteed to be ~unique by appending a short random suffix to the base.
// The DB has UNIQUE(events.slug); on the astronomically-unlikely collision the caller
// must retry with a fresh suffix.
function buildSlug(title) {
  const base = slugify(title || "event") || "event";
  return `${base}-${randomSlugSuffix()}`;
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

      // The event-images bucket is public; use a permanent public URL so links
      // in emails and shares never expire.
      const {
        data: { publicUrl },
      } = supabase.storage.from("event-images").getPublicUrl(filePath);
      if (publicUrl) {
        imageUrl = publicUrl;
      }
    } catch (urlError) {
      // If URL generation fails, use stored value as-is
      console.error("Error generating event image URL:", urlError);
    }
  }

  // Generate cover image URL if path exists
  let coverImageUrl = dbEvent.cover_image_url || null;
  if (coverImageUrl && !coverImageUrl.startsWith("http")) {
    try {
      let coverPath = coverImageUrl;
      if (coverImageUrl.includes("event-images/")) {
        const urlMatch = coverImageUrl.match(/event-images\/([^?]+)/);
        if (urlMatch) coverPath = urlMatch[1];
      }
      const { data: { publicUrl: coverPublicUrl } } = supabase.storage.from("event-images").getPublicUrl(coverPath);
      if (coverPublicUrl) coverImageUrl = coverPublicUrl;
    } catch (e) {
      console.error("Error generating cover image URL:", e);
    }
  }

  // Fetch event media items
  let media = [];
  try {
    const { data: mediaRows, error: mediaError } = await supabase
      .from("event_media")
      .select("*")
      .eq("event_id", dbEvent.id)
      // Exclude the room's darkroom (peer-shared photos) — those live in the
      // event Room only, never on the public marketing page. Keep null-folder
      // (the host's gallery) and anything that isn't darkroom.
      .or("folder.is.null,folder.neq.darkroom")
      .order("position", { ascending: true });

    if (!mediaError && mediaRows) {
      media = mediaRows.map((m) => {
        let url = m.storage_path;
        if (url && !url.startsWith("http")) {
          try {
            let fp = url;
            if (url.includes("event-images/")) {
              const match = url.match(/event-images\/([^?]+)/);
              if (match) fp = match[1];
            }
            const { data: { publicUrl: mUrl } } = supabase.storage.from("event-images").getPublicUrl(fp);
            if (mUrl) url = mUrl;
          } catch (_) {}
        }

        let thumbnailUrl = m.thumbnail_path || null;
        if (thumbnailUrl && !thumbnailUrl.startsWith("http")) {
          try {
            const { data: { publicUrl: tUrl } } = supabase.storage.from("event-images").getPublicUrl(thumbnailUrl);
            if (tUrl) thumbnailUrl = tUrl;
          } catch (_) {}
        }

        return {
          id: m.id,
          mediaType: m.media_type,
          url,
          thumbnailUrl,
          position: m.position,
          isCover: m.is_cover,
          mimeType: m.mime_type,
        };
      });
    }
  } catch (e) {
    console.error("Error fetching event media:", e);
  }

  return {
    id: dbEvent.id,
    hostId: dbEvent.host_id,
    slug: dbEvent.slug,
    title: dbEvent.title,
    description: dbEvent.description,
    location: dbEvent.location,
    locationLat: dbEvent.location_lat || null,
    locationLng: dbEvent.location_lng || null,
    locationPlaceId: dbEvent.location_place_id || null,
    startsAt: dbEvent.starts_at,
    endsAt: dbEvent.ends_at,
    timezone: dbEvent.timezone,
    isPaid: dbEvent.is_paid,
    ticketType: dbEvent.ticket_type,
    maxAttendees: dbEvent.total_capacity,
    waitlistEnabled: dbEvent.waitlist_enabled,
    imageUrl: imageUrl,
    coverImageUrl: coverImageUrl || imageUrl,
    media,
    theme: dbEvent.theme,
    // Per-event brand/theme snapshot (migration 047). NULL → frontend
    // resolveBrand() falls back to the PullUp standard theme. Existing
    // events created before this column have brand=null by design.
    brand: dbEvent.brand || null,
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
    dinnerSlots: dbEvent.dinner_slots || null,
    dinnerOverflowAction: dbEvent.dinner_overflow_action || "waitlist",
    dinnerBookingEmail: dbEvent.dinner_booking_email || null,
    hideDinnerRemaining: dbEvent.hide_dinner_remaining || false,
    ticketPrice: dbEvent.ticket_price,
    ticketCurrency: dbEvent.ticket_currency || "usd",
    stripeProductId: dbEvent.stripe_product_id,
    stripePriceId: dbEvent.stripe_price_id,
    cocktailCapacity: dbEvent.cocktail_capacity,
    foodCapacity: dbEvent.food_capacity,
    totalCapacity: dbEvent.total_capacity,
    createdVia: dbEvent.created_via || "legacy",
    status: dbEvent.status || "PUBLISHED",
    instagram: dbEvent.instagram || null,
    spotify: dbEvent.spotify || null,
    tiktok: dbEvent.tiktok || null,
    soundcloud: dbEvent.soundcloud || null,
    mediaSettings: dbEvent.media_settings || {},
    titleSettings: dbEvent.title_settings || null,
    sections: dbEvent.sections || [],
    adminTags: Array.isArray(dbEvent.admin_tags) ? dbEvent.admin_tags : [],
    formFields: dbEvent.form_fields || [],
    enrichmentQuestions: Array.isArray(dbEvent.enrichment_questions) ? dbEvent.enrichment_questions : [],
    contactChannel: dbEvent.contact_channel || "email",
    requirePhone: dbEvent.require_phone || false,
    requireEmail: dbEvent.require_email !== false,
    requireInstagram: dbEvent.require_instagram || false,
    collectPhone: dbEvent.collect_phone !== false,
    collectInstagram: dbEvent.collect_instagram !== false,
    hideLocation: dbEvent.hide_location || false,
    hideDate: dbEvent.hide_date || false,
    instantWaitlist: dbEvent.instant_waitlist || false,
    revealHint: dbEvent.reveal_hint || null,
    dateRevealHint: dbEvent.date_reveal_hint || null,
  };
}

// ---------------------------
// Event host helpers (multi-arranger support)
// ---------------------------

/**
 * Get all event IDs where user is a host (owner or co-host).
 * Supports both the legacy events.host_id model and the new event_hosts join table.
 */

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
  // Google's permanent key for the picked spot — lets us re-expand the full
  // address / hours / map later without the host re-typing anything.
  if (eventData.locationPlaceId !== undefined && eventData.locationPlaceId !== null) {
    dbData.location_place_id = eventData.locationPlaceId;
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
  // Per-event brand snapshot (migration 047). A plain object of brand
  // tokens, or null to clear back to the PullUp standard theme.
  if (eventData.brand !== undefined) dbData.brand = eventData.brand;
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
  if (eventData.dinnerSlots !== undefined)
    dbData.dinner_slots = eventData.dinnerSlots;
  if (eventData.dinnerBookingEmail !== undefined)
    dbData.dinner_booking_email = eventData.dinnerBookingEmail;
  if (eventData.hideDinnerRemaining !== undefined)
    dbData.hide_dinner_remaining = eventData.hideDinnerRemaining;
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
  if (eventData.instagram !== undefined) dbData.instagram = eventData.instagram;
  if (eventData.spotify !== undefined) dbData.spotify = eventData.spotify;
  if (eventData.tiktok !== undefined) dbData.tiktok = eventData.tiktok;
  if (eventData.soundcloud !== undefined) dbData.soundcloud = eventData.soundcloud;
  if (eventData.mediaSettings !== undefined) dbData.media_settings = eventData.mediaSettings;
  if (eventData.titleSettings !== undefined) dbData.title_settings = eventData.titleSettings;
  if (eventData.sections !== undefined) dbData.sections = eventData.sections;
  if (eventData.formFields !== undefined) dbData.form_fields = eventData.formFields;
  // Host-authored free-text RSVP questions (mig 077). Identity stays the four
  // sacred anchors; these are enrichment, stored as [{id,label,required}].
  if (eventData.enrichmentQuestions !== undefined) dbData.enrichment_questions = eventData.enrichmentQuestions;
  if (eventData.contactChannel !== undefined) dbData.contact_channel = eventData.contactChannel;
  if (eventData.requirePhone !== undefined) dbData.require_phone = eventData.requirePhone;
  if (eventData.requireEmail !== undefined) dbData.require_email = eventData.requireEmail;
  if (eventData.requireInstagram !== undefined) dbData.require_instagram = eventData.requireInstagram;
  if (eventData.collectPhone !== undefined) dbData.collect_phone = eventData.collectPhone;
  if (eventData.collectInstagram !== undefined) dbData.collect_instagram = eventData.collectInstagram;
  if (eventData.hideLocation !== undefined) dbData.hide_location = eventData.hideLocation;
  if (eventData.hideDate !== undefined) dbData.hide_date = eventData.hideDate;
  if (eventData.instantWaitlist !== undefined) dbData.instant_waitlist = eventData.instantWaitlist;
  if (eventData.revealHint !== undefined) dbData.reveal_hint = eventData.revealHint;
  if (eventData.dateRevealHint !== undefined) dbData.date_reveal_hint = eventData.dateRevealHint;
  return dbData;
}

// ── The ONE allowlist of client-settable event fields ──────────────────────
// Both event-write routes (POST /events, PUT /host/events/:id) pick from
// req.body using THIS list instead of hand-enumerating fields. That's the whole
// point: a field the editor sends can never again be silently dropped at a
// route boundary — the bug that lost enrichmentQuestions (and the reach-floor
// toggles before it). Draft and live events share this exact path; only `status`
// differs, and routes set that explicitly.
//
// To add a new client-settable event field: add it HERE and add its mapping in
// mapEventToDb above. Server-controlled fields (host_id, slug, status,
// createdVia, the stripe ids) are deliberately NOT here — routes set those.
export const EDITABLE_EVENT_FIELDS = [
  "title", "description",
  "location", "locationLat", "locationLng", "locationPlaceId",
  "startsAt", "endsAt", "timezone",
  "maxAttendees", "waitlistEnabled", "instantWaitlist",
  "imageUrl", "theme", "brand", "calendar", "visibility",
  "ticketType", "ticketPrice", "ticketCurrency", "requireApproval",
  "maxPlusOnesPerGuest",
  "dinnerEnabled", "dinnerStartTime", "dinnerEndTime", "dinnerSeatingIntervalHours",
  "dinnerMaxSeatsPerSlot", "dinnerOverflowAction", "dinnerSlots", "dinnerBookingEmail",
  "hideDinnerRemaining",
  "cocktailCapacity", "foodCapacity", "totalCapacity",
  "mediaSettings", "titleSettings",
  "instagram", "spotify", "tiktok", "soundcloud",
  "sections", "formFields", "enrichmentQuestions",
  "contactChannel",
  "requireEmail", "collectPhone", "requirePhone", "collectInstagram", "requireInstagram",
  "hideLocation", "hideDate", "revealHint", "dateRevealHint",
];

// Pick only the editable fields a client is allowed to set — keeps mass-assign
// safety (host_id/status/etc. can't sneak in) while staying DRY.
export function pickEventFields(body = {}) {
  const out = {};
  for (const key of EDITABLE_EVENT_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
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
  locationPlaceId = null,
  startsAt,
  endsAt,
  timezone,
  maxAttendees = null,
  waitlistEnabled = true,
  imageUrl = null,
  theme = "minimal",
  // Per-event brand snapshot (migration 047). null = PullUp standard.
  brand = null,
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
  dinnerSlots = null,
  dinnerBookingEmail = null,
  hideDinnerRemaining = false,

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

  // Media settings
  mediaSettings,

  // Title settings (font/align/color/etc.)
  titleSettings,

  // Social links
  instagram,
  spotify,
  tiktok,
  soundcloud,

  // Sections (event builder blocks)
  sections,

  // Custom RSVP form fields
  formFields,

  // Host-authored enrichment questions (mig 077).
  enrichmentQuestions = [],

  // Per-event RSVP contact channel: 'email' | 'whatsapp' | 'both'.
  contactChannel = "email",

  // Reveal & waitlist features
  hideLocation = false,
  hideDate = false,
  instantWaitlist = false,
  revealHint = null,
  dateRevealHint = null,
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

  const eventData = {
    hostId, // Set host_id from authenticated user
    slug: buildSlug(title),
    title,
    description,
    location,
    locationLat: locationLat || null,
    locationLng: locationLng || null,
    locationPlaceId: locationPlaceId || null,
    startsAt,
    endsAt: endsAt || null,
    timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    isPaid: ticketType === "paid",
    ticketType,
    maxAttendees: maxAttendees || null,
    waitlistEnabled,
    imageUrl,
    theme,
    brand: brand && typeof brand === "object" ? brand : null,
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
    dinnerOverflowAction: dinnerOverflowAction || "waitlist",
    dinnerSlots:
      Array.isArray(dinnerSlots) && dinnerSlots.length > 0
        ? dinnerSlots
        : null,
    dinnerBookingEmail: dinnerBookingEmail || null,
    hideDinnerRemaining: !!hideDinnerRemaining,
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
    mediaSettings,
    titleSettings,
    instagram,
    spotify,
    tiktok,
    soundcloud,
    sections: Array.isArray(sections) ? sections : [],
    formFields: Array.isArray(formFields) ? formFields : [],
    enrichmentQuestions: Array.isArray(enrichmentQuestions) ? enrichmentQuestions : [],
    contactChannel: ["email","whatsapp","both"].includes(contactChannel) ? contactChannel : "email",
    hideLocation: !!hideLocation,
    hideDate: !!hideDate,
    instantWaitlist: !!instantWaitlist,
    revealHint: revealHint || null,
    dateRevealHint: dateRevealHint || null,
  };

  const dbData = mapEventToDb(eventData);

  // Remove location coordinates if they're null/undefined to avoid unnecessary columns
  if (dbData.location_lat === null || dbData.location_lat === undefined) {
    delete dbData.location_lat;
  }
  if (dbData.location_lng === null || dbData.location_lng === undefined) {
    delete dbData.location_lng;
  }
  if (dbData.location_place_id === null || dbData.location_place_id === undefined) {
    delete dbData.location_place_id;
  }

  // Remove createdVia and status if they're not in the database schema yet
  // This provides backward compatibility during migration
  // The database defaults will handle these if columns exist
  let { data, error } = await supabase
    .from("events")
    .insert(dbData)
    .select()
    .single();

  // Slug collision (unique violation): regenerate suffix and retry once.
  if (error && error.code === "23505" && /slug/i.test(error.message || "")) {
    console.warn("Slug collision on create, retrying with fresh suffix");
    dbData.slug = buildSlug(title);
    ({ data, error } = await supabase
      .from("events")
      .insert(dbData)
      .select()
      .single());
  }

  if (error) {
    console.error("Error creating event:", error);
    throwConstraintError(error);
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

  if (Object.keys(dbUpdates).length === 0) {
    console.warn(`[updateEvent] No valid fields to update for event ${id}`);
    // Still return the current event data so it's not treated as a failure
    const { data: current, error: fetchError } = await supabase
      .from("events")
      .select()
      .eq("id", id)
      .single();
    if (fetchError || !current) return null;
    return await mapEventFromDb(current);
  }

  const { data, error } = await supabase
    .from("events")
    .update(dbUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error(`[updateEvent] Supabase error updating event ${id}:`, error);
    console.error(`[updateEvent] Attempted update fields:`, Object.keys(dbUpdates));
    throwConstraintError(error);
    throw new Error(error.message || "Database update failed");
  }

  if (!data) {
    console.error(`[updateEvent] No data returned for event ${id}`);
    return null;
  }

  return await mapEventFromDb(data);
}

// ---------------------------
/**
 * Delete an event. Only allowed if the event has zero RSVPs.
 */
export async function deleteEvent(eventId) {
  // Check for any RSVPs
  const { count, error: countError } = await supabase
    .from("rsvps")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (countError) {
    console.error("Error checking RSVPs for deletion:", countError);
    return { error: "database_error", message: countError.message };
  }

  if (count > 0) {
    return { error: "has_registrations", message: `Cannot delete event with ${count} registration(s). Remove all guests first.` };
  }

  // Delete event_hosts entries
  await supabase.from("event_hosts").delete().eq("event_id", eventId);

  // Delete the event
  const { error: deleteError } = await supabase.from("events").delete().eq("id", eventId);

  if (deleteError) {
    console.error("Error deleting event:", deleteError);
    return { error: "database_error", message: deleteError.message };
  }

  return { success: true };
}

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
  // PENDING_PAYMENT RSVPs also count toward capacity to hold the spot while user pays
  const confirmed = eventRsvps
    .filter((r) => r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending")
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
    .in("booking_status", ["CONFIRMED", "PENDING_PAYMENT"])
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
  // Prefer explicit slots configuration if provided
  if (Array.isArray(event.dinnerSlots) && event.dinnerSlots.length > 0) {
    return event.dinnerSlots
      .map((slot) =>
        typeof slot === "string"
          ? slot
          : slot && typeof slot.time === "string"
          ? slot.time
          : null
      )
      .filter((time) => !!time)
      .map((time) => {
        const d = new Date(time);
        return isNaN(d.getTime()) ? null : d.toISOString();
      })
      .filter((time) => !!time)
      .sort((a, b) => new Date(a) - new Date(b));
  }

  // Legacy fallback: derive slots from start, end, and interval
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
        const isConfirmedOrPending =
          (dinner && (dinner.bookingStatus === "CONFIRMED" || dinner.bookingStatus === "PENDING_PAYMENT")) ||
          r.dinner_status === "confirmed" ||
          r.dinner_status === "pending";
        return hasDinner && slotMatches && isConfirmedOrPending;
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

export async function listHostEventImageGallery(userId, { limit = 200 } = {}) {
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, image_url, cover_image_url, created_at")
    .eq("host_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const eventIds = (events || []).map((e) => e.id);
  let media = [];
  if (eventIds.length > 0) {
    const { data: mediaRows, error: mediaError } = await supabase
      .from("event_media")
      .select("id, event_id, media_type, storage_path, thumbnail_path, created_at")
      .in("event_id", eventIds);
    if (mediaError) throw mediaError;
    media = mediaRows || [];
  }

  function pathToPublicUrl(p) {
    if (!p) return null;
    if (p.startsWith("http")) return p;
    const cleaned = p.replace(/^.*event-images\//, "");
    return supabase.storage.from("event-images").getPublicUrl(cleaned).data.publicUrl;
  }

  const items = [];
  for (const ev of events || []) {
    const cover = ev.cover_image_url || ev.image_url;
    if (cover) {
      const url = pathToPublicUrl(cover);
      if (url) items.push({ url, eventId: ev.id, eventTitle: ev.title, kind: "cover", addedAt: ev.created_at });
    }
  }
  for (const m of media) {
    const ev = (events || []).find((e) => e.id === m.event_id);
    if (!ev) continue;
    // For videos, the storage_path is the mp4/mov — use the thumbnail_path
    // instead so we render an image. Skip rows that have neither (corrupted
    // or pre-thumbnail uploads — they can't render in the picker).
    const isVideo = m.media_type === "video";
    const sourcePath = isVideo ? m.thumbnail_path : (m.storage_path || m.thumbnail_path);
    if (!sourcePath) continue;
    const url = pathToPublicUrl(sourcePath);
    if (url) items.push({ url, eventId: ev.id, eventTitle: ev.title, kind: isVideo ? "video-thumb" : "media", addedAt: m.created_at });
  }
  return items.sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""));
}

// ---------------------------------------------------------------------------
// Personal Access Tokens (PATs)
// ---------------------------------------------------------------------------
// Long-lived credentials minted from a logged-in session and used as bearer
// tokens by clients that can't run a browser-based Supabase auth flow (the
// PullUp MCP server, scripts, etc.).
//
// Plaintext format: `pup_<48 base64url chars>`. Only the SHA-256 hash is
// persisted; plaintext is returned exactly once at mint time.

