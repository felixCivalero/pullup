// backend/src/data.js

import crypto from "node:crypto";
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
    contactChannel: dbEvent.contact_channel || "email",
    requirePhone: dbEvent.require_phone || false,
    requireInstagram: dbEvent.require_instagram || false,
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

// Arranger roles (event_hosts.role). Owner is only from events.host_id.
export const HOST_ROLES = Object.freeze({
  OWNER: "owner",
  ADMIN: "admin",
  EDITOR: "editor",
  RECEPTION: "reception",
  ANALYTICS: "analytics",
  VIEWER: "viewer",
});
const MANAGER_ROLES = [HOST_ROLES.OWNER, HOST_ROLES.ADMIN];
const GUEST_EDIT_ROLES = [HOST_ROLES.OWNER, HOST_ROLES.ADMIN, HOST_ROLES.EDITOR];
const CHECKIN_ROLES = [HOST_ROLES.OWNER, HOST_ROLES.ADMIN, HOST_ROLES.EDITOR, HOST_ROLES.RECEPTION];

function roleIn(role, allowed) {
  return role && allowed.includes(role);
}

/**
 * Get the user's role for an event (owner from events.host_id, else from event_hosts).
 * Returns role string or null if not a host.
 */
export async function getEventHostRole(userId, eventId) {
  const { isHost, role } = await isUserEventHost(userId, eventId);
  if (!isHost) return null;
  // Normalize legacy co_host to editor for permission purposes
  if (role === "co_host") return HOST_ROLES.EDITOR;
  return role;
}

/**
 * Can add/remove hosts and change roles. Owner or admin only.
 */
export async function canManageHosts(userId, eventId) {
  const role = await getEventHostRole(userId, eventId);
  return roleIn(role, MANAGER_ROLES);
}

/**
 * Can edit event details, publish, Stripe, image upload. Owner or admin.
 */
export async function canEditEvent(userId, eventId) {
  const role = await getEventHostRole(userId, eventId);
  return roleIn(role, MANAGER_ROLES);
}

/**
 * Can edit guest list (add/edit/cancel RSVP, refunds). Owner, admin, or editor.
 */
export async function canEditGuests(userId, eventId) {
  const role = await getEventHostRole(userId, eventId);
  return roleIn(role, GUEST_EDIT_ROLES);
}

/**
 * Can check in guests (mark arrived, pulled up). Owner, admin, editor, or reception.
 */
export async function canCheckIn(userId, eventId) {
  const role = await getEventHostRole(userId, eventId);
  return roleIn(role, CHECKIN_ROLES);
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

// ---------------------------
// Event host invitations (pending co-hosts by email, no account yet)
// ---------------------------

/**
 * Create a pending invitation. Email normalized to lowercase.
 */
export async function createEventHostInvitation({
  eventId,
  email,
  role,
  invitedByUserId,
}) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const { data, error } = await supabase
    .from("event_host_invitations")
    .insert({
      event_id: eventId,
      email: normalizedEmail,
      role: role || "editor",
      invited_by_user_id: invitedByUserId,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Get pending invitations for an event (status = 'pending').
 */
export async function getPendingInvitationsForEvent(eventId) {
  const { data, error } = await supabase
    .from("event_host_invitations")
    .select("id, event_id, email, role, invited_at")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .order("invited_at", { ascending: true });
  if (error) {
    if (error.code === "PGRST205") return []; // table missing
    throw error;
  }
  return data || [];
}

/**
 * Claim pending invitations for a user by email: create event_hosts rows and mark invitations accepted.
 * Call after signup/login so the user sees the events they were invited to.
 */
export async function claimPendingInvitationsForUser(userId, userEmail) {
  if (!userEmail) return [];
  const normalizedEmail = String(userEmail).trim().toLowerCase();
  const { data: pending, error: fetchError } = await supabase
    .from("event_host_invitations")
    .select("id, event_id, role")
    .eq("email", normalizedEmail)
    .eq("status", "pending");
  if (fetchError) {
    if (fetchError.code === "PGRST205") return [];
    throw fetchError;
  }
  if (!pending || pending.length === 0) return [];

  const claimed = [];
  for (const inv of pending) {
    const { error: insertError } = await supabase.from("event_hosts").insert({
      event_id: inv.event_id,
      user_id: userId,
      role: inv.role,
    });
    if (insertError) {
      if (insertError.code === "23505") {
        // unique violation: already a host, just mark invitation accepted
      } else {
        console.error("Error creating event_host from invitation:", insertError);
        continue;
      }
    }
    const { error: updateError } = await supabase
      .from("event_host_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (!updateError) claimed.push(inv);
  }
  return claimed;
}

// ---------------------------
// VIP invites (per-email, per-event VIP links)
// ---------------------------

/**
 * Create a VIP invite for an event.
 * Email is normalized to lowercase.
 */
export async function createVipInvite({
  eventId,
  email,
  maxGuests = 1,
  freeEntry = false,
  discountPercent = null,
  expiresAt = null,
  token = null,
}) {
  const normalizedEmail = String(email).trim().toLowerCase();

  const { data, error } = await supabase
    .from("vip_invites")
    .insert({
      event_id: eventId,
      email: normalizedEmail,
      max_guests: typeof maxGuests === "number" && maxGuests > 0 ? maxGuests : 1,
      free_entry: !!freeEntry,
      discount_percent:
        typeof discountPercent === "number" ? discountPercent : null,
      expires_at: expiresAt || null,
      token: token || null,
    })
    .select()
    .single();

  if (error) {
    // Table may not exist in older environments
    if (error.code === "PGRST205") {
      console.error(
        "[createVipInvite] vip_invites table missing. Did you run migrations?"
      );
    }
    throw error;
  }

  return data;
}

/**
 * Update a VIP invite (e.g., to add the signed token after creation).
 */
export async function updateVipInvite(inviteId, updates) {
  const dbUpdates = {};
  if (updates.token !== undefined) dbUpdates.token = updates.token;
  if (updates.expiresAt !== undefined) dbUpdates.expires_at = updates.expiresAt;
  if (updates.usedAt !== undefined) dbUpdates.used_at = updates.usedAt;
  if (updates.usedRsvpId !== undefined)
    dbUpdates.used_rsvp_id = updates.usedRsvpId;

  if (Object.keys(dbUpdates).length === 0) {
    return { invite: null };
  }

  dbUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("vip_invites")
    .update(dbUpdates)
    .eq("id", inviteId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST205") {
      console.error(
        "[updateVipInvite] vip_invites table missing. Did you run migrations?"
      );
      return { error: "table_missing" };
    }
    console.error("[updateVipInvite] Error updating VIP invite:", error);
    return { error: "update_failed" };
  }

  return { invite: data };
}

/**
 * Find a VIP invite by ID.
 */
export async function findVipInviteById(inviteId) {
  const { data, error } = await supabase
    .from("vip_invites")
    .select("*")
    .eq("id", inviteId)
    .single();

  if (error || !data) {
    if (error && error.code === "PGRST205") {
      console.error(
        "[findVipInviteById] vip_invites table missing. Did you run migrations?"
      );
    }
    return null;
  }

  return data;
}

/**
 * Mark a VIP invite as used for a specific RSVP.
 */
export async function markVipInviteUsed(inviteId, rsvpId) {
  const { invite, error } = await updateVipInvite(inviteId, {
    usedAt: new Date().toISOString(),
    usedRsvpId: rsvpId,
  });
  if (error) {
    console.error("[markVipInviteUsed] Failed to mark invite used:", error);
  }
  return invite;
}

/**
 * Get all unused VIP invites for an event.
 */
export async function getVipInvitesForEvent(eventId) {
  const { data, error } = await supabase
    .from("vip_invites")
    .select("*")
    .eq("event_id", eventId)
    .is("used_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "PGRST205") {
      console.error(
        "[getVipInvitesForEvent] vip_invites table missing. Did you run migrations?"
      );
      return [];
    }
    console.error("[getVipInvitesForEvent] Error fetching VIP invites:", error);
    return [];
  }

  return data || [];
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
  if (eventData.contactChannel !== undefined) dbData.contact_channel = eventData.contactChannel;
  if (eventData.requirePhone !== undefined) dbData.require_phone = eventData.requirePhone;
  if (eventData.requireInstagram !== undefined) dbData.require_instagram = eventData.requireInstagram;
  if (eventData.hideLocation !== undefined) dbData.hide_location = eventData.hideLocation;
  if (eventData.hideDate !== undefined) dbData.hide_date = eventData.hideDate;
  if (eventData.instantWaitlist !== undefined) dbData.instant_waitlist = eventData.instantWaitlist;
  if (eventData.revealHint !== undefined) dbData.reveal_hint = eventData.revealHint;
  if (eventData.dateRevealHint !== undefined) dbData.date_reveal_hint = eventData.dateRevealHint;
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
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Identity-style RSVP form field types that promote to columns on `people`
// (see migration 019). Anything not in this set stays in rsvps.custom_answers.
// `type` here matches FORM_FIELD_PRESETS in frontend/.../CreateEventPage.jsx.
const IDENTITY_FIELD_TO_PERSON_COLUMN = {
  instagram: "instagram",
  twitter: "twitter",
  tiktok: "tiktok",
  linkedin: "linkedin",
  company: "company",
  birthday: "birthday",
  phone: "phone",
};

/**
 * Split a customAnswers object (keyed by form-field id) into:
 *   - personUpdates: { instagram, twitter, ... } for identity-typed fields
 *   - remainingAnswers: only truly-custom (non-identity) entries
 *
 * Empty / whitespace-only values are dropped — we never overwrite a stored
 * value with blank on resubmit.
 */
function splitCustomAnswers(customAnswers, formFields) {
  const personUpdates = {};
  const remainingAnswers = {};
  if (!customAnswers || typeof customAnswers !== "object") {
    return { personUpdates, remainingAnswers };
  }
  const fieldsById = new Map();
  (Array.isArray(formFields) ? formFields : []).forEach((f) => {
    if (f && typeof f === "object" && f.id) fieldsById.set(f.id, f);
  });
  for (const [fieldId, rawValue] of Object.entries(customAnswers)) {
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    const field = fieldsById.get(fieldId);
    const type = field ? String(field.type || "").toLowerCase() : null;
    const personColumn = type ? IDENTITY_FIELD_TO_PERSON_COLUMN[type] : null;
    if (personColumn) {
      // Only promote non-empty values; an empty answer means "don't change
      // what we already have on the person" (last-write-wins, blanks ignored).
      if (value !== null && value !== undefined && value !== "") {
        personUpdates[personColumn] = value;
      }
    } else {
      remainingAnswers[fieldId] = rawValue;
    }
  }
  return { personUpdates, remainingAnswers };
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

// Map a Postgres check_violation (SQLSTATE 23514) into a friendly message the
// MCP coach (and humans) can act on. Returns null for any other error.
function friendlyConstraintError(error) {
  if (error?.code !== "23514") return null;
  const match = String(error.message || "").match(/constraint "([^"]+)"/);
  if (!match) return null;
  const KNOWN = {
    events_visibility_check: "visibility must be 'public' or 'private'",
    events_calendar_category_check: "calendar must be 'personal' or 'business'",
    events_ticket_type_check: "ticketType must be 'free' or 'paid'",
    check_status: "status must be 'DRAFT' or 'PUBLISHED'",
    check_created_via: "createdVia must be 'post', 'create', or 'legacy'",
  };
  return KNOWN[match[1]] || `constraint ${match[1]} violated`;
}

function throwConstraintError(error) {
  const friendly = friendlyConstraintError(error);
  if (!friendly) return false;
  const err = new Error(friendly);
  err.statusCode = 400;
  err.code = "constraint_violation";
  throw err;
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

// A person "belongs" to a host iff they have at least one RSVP to one of the
// host's events. This is the same scope getPeopleWithFilters / getAllPeopleWithStats
// use, so the detail GET/PUT endpoints stay consistent with the list view.
export async function personBelongsToHost(personId, userId) {
  if (!personId || !userId) return false;

  // In the host's world via an RSVP to one of their events…
  const eventIds = await getUserEventIds(userId);
  if (eventIds && eventIds.length > 0) {
    const { data, error } = await supabase
      .from("rsvps")
      .select("id")
      .eq("person_id", personId)
      .in("event_id", eventIds)
      .limit(1);
    if (error) console.error("[personBelongsToHost] rsvp error:", error);
    else if (Array.isArray(data) && data.length > 0) return true;
  }

  // …or via a direct messaging thread with this host. Someone who DM'd the
  // host's connected Instagram / WhatsApp account is just as much "in their
  // world" as an RSVP'er — and an IG/WA-only lead often has no RSVP at all.
  // Without this, the Room can't message them back (silent not_in_world).
  for (const table of ["instagram_threads", "whatsapp_threads"]) {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("person_id", personId)
      .eq("host_profile_id", userId)
      .limit(1);
    if (error) { console.error(`[personBelongsToHost] ${table} error:`, error); continue; }
    if (Array.isArray(data) && data.length > 0) return true;
  }

  return false;
}

// ─── Content Planner cards (per-host) ─────────────────────────────────
// Durable storage for the planner canvas. Scoped by host_id; all writes go
// through the service-role client and re-assert host_id.

function mapPlannerCardFromDb(r) {
  return {
    id: r.id,
    x: r.x,
    y: r.y,
    w: r.w,
    channel: r.channel || null,
    contentType: r.content_type || "image",
    eventId: r.event_id || null,
    timelineId: r.timeline_id || null,
    timelineIds: Array.isArray(r.timeline_ids) && r.timeline_ids.length ? r.timeline_ids : r.timeline_id ? [r.timeline_id] : [],
    note: r.note || "",
    mediaUrl: r.media_url || null,
    mediaPath: r.media_path || null,
    mediaKind: r.media_kind || "placeholder",
    mediaName: r.media_name || null,
    mediaMime: r.media_mime || null,
    links: Array.isArray(r.links) ? r.links : [],
    meta: r.meta && typeof r.meta === "object" ? r.meta : {},
  };
}

function plannerCardToDb(p) {
  const d = {};
  if (p.x !== undefined) d.x = p.x;
  if (p.y !== undefined) d.y = p.y;
  if (p.w !== undefined) d.w = p.w;
  if (p.channel !== undefined) d.channel = p.channel;
  if (p.contentType !== undefined) d.content_type = p.contentType;
  if (p.eventId !== undefined) d.event_id = p.eventId;
  if (p.timelineId !== undefined) d.timeline_id = p.timelineId;
  if (p.timelineIds !== undefined) {
    const arr = Array.isArray(p.timelineIds) ? p.timelineIds : [];
    d.timeline_ids = arr;
    d.timeline_id = arr[0] || null; // keep the FK column pointing at the primary lane
  }
  if (p.note !== undefined) d.note = p.note;
  if (p.mediaUrl !== undefined) d.media_url = p.mediaUrl;
  if (p.mediaPath !== undefined) d.media_path = p.mediaPath;
  if (p.mediaKind !== undefined) d.media_kind = p.mediaKind;
  if (p.mediaName !== undefined) d.media_name = p.mediaName;
  if (p.mediaMime !== undefined) d.media_mime = p.mediaMime;
  if (p.links !== undefined) d.links = p.links;
  if (p.meta !== undefined) d.meta = p.meta && typeof p.meta === "object" ? p.meta : {};
  return d;
}

export async function getPlannerCards(hostId) {
  const { data, error } = await supabase
    .from("planner_cards")
    .select("*")
    .eq("host_id", hostId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[getPlannerCards] error:", error);
    return [];
  }
  return (data || []).map(mapPlannerCardFromDb);
}

export async function createPlannerCard(hostId, card) {
  if (!card?.id) return { error: "missing_id" };
  const row = { id: card.id, host_id: hostId, ...plannerCardToDb(card) };
  const { data, error } = await supabase.from("planner_cards").insert(row).select("*").single();
  if (error) {
    console.error("[createPlannerCard] error:", error);
    return { error: "insert_failed" };
  }
  return { card: mapPlannerCardFromDb(data) };
}

export async function updatePlannerCard(id, hostId, patch) {
  const d = plannerCardToDb(patch);
  d.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("planner_cards")
    .update(d)
    .eq("id", id)
    .eq("host_id", hostId)
    .select("*")
    .single();
  if (error || !data) {
    if (error && error.code !== "PGRST116") console.error("[updatePlannerCard] error:", error);
    return { error: "not_found" };
  }
  return { card: mapPlannerCardFromDb(data) };
}

export async function deletePlannerCard(id, hostId) {
  const { data, error } = await supabase
    .from("planner_cards")
    .delete()
    .eq("id", id)
    .eq("host_id", hostId)
    .select("media_path")
    .single();
  if (error || !data) {
    if (error && error.code !== "PGRST116") console.error("[deletePlannerCard] error:", error);
    return { error: "not_found" };
  }
  return { ok: true, mediaPath: data.media_path || null };
}

// ─── Content Planner timelines (lanes, per-host) ──────────────────────
// Each lane = a named, coloured horizontal track at a world-y, with a filter
// describing which of the host's events it shows. Host-scoped + RLS like cards.

function mapTimelineFromDb(r) {
  return {
    id: r.id,
    name: r.name || "Timeline",
    color: r.color || "#60a5fa",
    y: r.y ?? 0,
    sort: r.sort ?? 0,
    eventFilter: r.event_filter && typeof r.event_filter === "object" ? r.event_filter : { mode: "all", eventIds: [] },
  };
}

function timelineToDb(p) {
  const d = {};
  if (p.name !== undefined) d.name = p.name;
  if (p.color !== undefined) d.color = p.color;
  if (p.y !== undefined) d.y = p.y;
  if (p.sort !== undefined) d.sort = p.sort;
  if (p.eventFilter !== undefined) d.event_filter = p.eventFilter && typeof p.eventFilter === "object" ? p.eventFilter : { mode: "all", eventIds: [] };
  return d;
}

export async function getPlannerTimelines(hostId) {
  const { data, error } = await supabase
    .from("planner_timelines")
    .select("*")
    .eq("host_id", hostId)
    .order("sort", { ascending: true });
  if (error) {
    console.error("[getPlannerTimelines] error:", error);
    return [];
  }
  return (data || []).map(mapTimelineFromDb);
}

export async function createPlannerTimeline(hostId, t) {
  const row = { host_id: hostId, ...timelineToDb(t) };
  if (t?.id) row.id = t.id; // client may mint the id for optimistic add
  const { data, error } = await supabase.from("planner_timelines").insert(row).select("*").single();
  if (error) {
    console.error("[createPlannerTimeline] error:", error);
    return { error: "insert_failed" };
  }
  return { timeline: mapTimelineFromDb(data) };
}

export async function updatePlannerTimeline(id, hostId, patch) {
  const d = timelineToDb(patch);
  d.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("planner_timelines")
    .update(d)
    .eq("id", id)
    .eq("host_id", hostId)
    .select("*")
    .single();
  if (error || !data) {
    if (error && error.code !== "PGRST116") console.error("[updatePlannerTimeline] error:", error);
    return { error: "not_found" };
  }
  return { timeline: mapTimelineFromDb(data) };
}

export async function deletePlannerTimeline(id, hostId) {
  // Cards on this lane fall back to the default lane (timeline_id → NULL via FK).
  const { error } = await supabase.from("planner_timelines").delete().eq("id", id).eq("host_id", hostId);
  if (error) {
    console.error("[deletePlannerTimeline] error:", error);
    return { error: "delete_failed" };
  }
  return { ok: true };
}

// ─── Person notes (per-host timeline) ─────────────────────────────────
// People are SHARED across hosts (see personBelongsToHost), so notes are
// scoped by host_id: a host only ever sees notes they wrote. Every read and
// write goes through the service-role client AND re-asserts host_id, so the
// RLS select-own policy is belt-and-braces, not the only guard.

function mapNoteFromDb(n) {
  return {
    id: n.id,
    personId: n.person_id,
    eventId: n.event_id || null,
    content: n.content,
    noteDate: n.note_date,
    // `topic` is AI-only enrichment, hidden in the web UI for now.
    topic: n.topic || null,
    source: n.source || "ui",
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  };
}

// Newest first. note_date is the host-meaningful order; created_at breaks ties
// when several notes share a backdated day.
export async function getPersonNotes(personId, hostId) {
  if (!personId || !hostId) return [];
  const { data, error } = await supabase
    .from("person_notes")
    .select("*")
    .eq("person_id", personId)
    .eq("host_id", hostId)
    .order("note_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[getPersonNotes] error:", error);
    return [];
  }
  return (data || []).map(mapNoteFromDb);
}

export async function createPersonNote(
  personId,
  hostId,
  { content, eventId, noteDate, topic, source } = {},
) {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) return { error: "empty_content" };

  const row = {
    person_id: personId,
    host_id: hostId,
    content: text,
    event_id: eventId || null,
    source: source === "mcp" ? "mcp" : "ui",
  };
  // note_date defaults to CURRENT_DATE in the DB; only override if given.
  if (noteDate) row.note_date = noteDate; // 'YYYY-MM-DD'
  if (topic && String(topic).trim()) row.topic = String(topic).trim();

  const { data, error } = await supabase
    .from("person_notes")
    .insert(row)
    .select("*")
    .single();
  if (error) {
    console.error("[createPersonNote] error:", error);
    return { error: "insert_failed" };
  }
  return { note: mapNoteFromDb(data) };
}

// Scoped to (note, person, host) so a host can never touch a note that isn't
// theirs, even with a guessed id.
export async function updatePersonNote(noteId, personId, hostId, updates = {}) {
  const patch = { updated_at: new Date().toISOString() };
  if (updates.content !== undefined) {
    const text = typeof updates.content === "string" ? updates.content.trim() : "";
    if (!text) return { error: "empty_content" };
    patch.content = text;
  }
  if (updates.eventId !== undefined) patch.event_id = updates.eventId || null;
  // note_date is NOT NULL — ignore empty values rather than clearing it.
  if (updates.noteDate) patch.note_date = updates.noteDate;
  if (updates.topic !== undefined) {
    patch.topic = updates.topic ? String(updates.topic).trim() : null;
  }

  const { data, error } = await supabase
    .from("person_notes")
    .update(patch)
    .eq("id", noteId)
    .eq("person_id", personId)
    .eq("host_id", hostId)
    .select("*")
    .single();
  if (error || !data) {
    if (error && error.code !== "PGRST116") {
      console.error("[updatePersonNote] error:", error);
    }
    return { error: "not_found" };
  }
  return { note: mapNoteFromDb(data) };
}

export async function deletePersonNote(noteId, personId, hostId) {
  const { data, error } = await supabase
    .from("person_notes")
    .delete()
    .eq("id", noteId)
    .eq("person_id", personId)
    .eq("host_id", hostId)
    .select("id")
    .single();
  if (error || !data) {
    if (error && error.code !== "PGRST116") {
      console.error("[deletePersonNote] error:", error);
    }
    return { error: "not_found" };
  }
  return { ok: true };
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

// Resolve a person by the DURABLE account link (people.auth_user_id == auth user).
// This is the spine: a logged-in human maps to their person even if their auth
// email later differs from the address they first RSVP'd with.
export async function findPersonByAuthUserId(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("auth_user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapPersonFromDb(data);
}

// THE identity resolver the room/access layer should use: durable account link
// first (auth_user_id), then the email used. So a logged-in viewer always maps
// to their canonical person; anon/email-only callers still resolve by email.
export async function resolvePerson({ userId = null, email = null }) {
  if (userId) {
    const byAuth = await findPersonByAuthUserId(userId);
    if (byAuth) return byAuth;
  }
  if (email) return findPersonByEmail(email);
  return null;
}

// Is this auth user an admin? Cheap check — only called when a view-as override
// header is actually present, so it never touches the normal request path.
export async function isAdminUser(userId) {
  if (!userId) return false;
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  return !!data?.is_admin;
}

// Admin "View as": resolve the EFFECTIVE viewer for a request. An admin may
// impersonate ANY person by sending `x-pullup-view-as: <personId>`. This is
// verified SERVER-SIDE against profiles.is_admin on the REAL session — a
// non-admin's header is silently ignored, so it can never be forged into access.
// Returns the person plus their account link (authUserId) so callers can do both
// person-scoped (RSVP/pull-up) and host(account)-scoped checks as them.
export async function resolveViewer(req, { email = null } = {}) {
  const realUserId = req.user?.id || null;
  const viewAsId = (req.headers?.["x-pullup-view-as"] || "").toString().trim() || null;
  if (viewAsId && realUserId && (await isAdminUser(realUserId))) {
    const { data } = await supabase.from("people").select("*").eq("id", viewAsId).maybeSingle();
    if (data) {
      return { person: mapPersonFromDb(data), authUserId: data.auth_user_id || null, impersonating: true, realUserId };
    }
  }
  // SECURITY: identity comes from the VERIFIED session only (or an admin
  // view-as header, admin-gated). A caller-supplied email is corroborating at
  // most — consulted ONLY when there's a real session, and even then userId
  // wins. An unauthenticated caller can NEVER assume an identity by passing an
  // email: no session ⇒ no viewer. (There is no email-claim path anywhere; even
  // the live door-code pull-up resolves the person from the scanner's session.)
  const effectiveEmail = realUserId ? email : null;
  const person = await resolvePerson({ userId: realUserId, email: effectiveEmail });
  return { person, authUserId: realUserId, impersonating: false, realUserId };
}

// Admin "Force status": an admin may force an access level via the
// `x-pullup-force-level` header (preview a state without a user in it). Admin-gated.
export async function adminForceLevel(req) {
  const realUserId = req.user?.id || null;
  const lvl = (req.headers?.["x-pullup-force-level"] || "").toString().trim() || null;
  if (lvl && realUserId && (await isAdminUser(realUserId))) return lvl;
  return null;
}

// Self-heal the account<->person link on login. Idempotent: link an existing
// person by email if unclaimed, else create one. Keeps the spine wired going
// forward (the one-time backfill handled existing rows).
export async function ensurePersonLinked({ userId, email, name = null }) {
  if (!userId || !email) return null;
  const e = String(email).trim().toLowerCase();
  const { data: byAuth } = await supabase
    .from("people").select("id").eq("auth_user_id", userId).limit(1).maybeSingle();
  if (byAuth) return byAuth.id;
  const { data: byEmail } = await supabase
    .from("people").select("id, auth_user_id").eq("email", e).limit(1).maybeSingle();
  if (byEmail) {
    if (!byEmail.auth_user_id) {
      await supabase.from("people").update({ auth_user_id: userId }).eq("id", byEmail.id);
    }
    return byEmail.id;
  }
  const { data: created } = await supabase
    .from("people")
    .insert({ email: e, name, auth_user_id: userId, import_source: "account_signup" })
    .select("id").maybeSingle();
  return created?.id || null;
}

// Helper: Map database person to application format
function mapPersonFromDb(dbPerson) {
  return {
    id: dbPerson.id,
    email: dbPerson.email,
    name: dbPerson.name,
    phone: dbPerson.phone,
    tags: dbPerson.tags || [],
    stripeCustomerId: dbPerson.stripe_customer_id,
    // Identity fields collected via event form_fields (see migration 019).
    // Belong on the person, not the RSVP — surfaced here so the CRM can
    // read/filter/export without unpacking rsvps.custom_answers.
    instagram: dbPerson.instagram || null,
    ig_user_id: dbPerson.ig_user_id || null, // IGSID — the DM recipient id (vs `instagram` = display handle)
    twitter: dbPerson.twitter || null,
    tiktok: dbPerson.tiktok || null,
    linkedin: dbPerson.linkedin || null,
    company: dbPerson.company || null,
    birthday: dbPerson.birthday || null,
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
    // Marketing-unsubscribe timestamp surfaces here so callers can decide
    // sendability without re-querying.
    marketingUnsubscribedAt: dbPerson.marketing_unsubscribed_at || null,
    // Phone-as-identity (migration 037). Surfaced under both camelCase
    // and snake_case so the CRM UI can use whichever convention.
    phoneE164:           dbPerson.phone_e164 || null,
    phoneCountry:        dbPerson.phone_country || null,
    phoneVerifiedAt:     dbPerson.phone_verified_at || null,
    whatsappCapableAt:   dbPerson.whatsapp_capable_at || null,
    phone_e164:          dbPerson.phone_e164 || null,
    phone_country:       dbPerson.phone_country || null,
    phone_verified_at:   dbPerson.phone_verified_at || null,
    whatsapp_capable_at: dbPerson.whatsapp_capable_at || null,
    createdAt: dbPerson.created_at,
    updatedAt: dbPerson.updated_at,
  };
}

// Helper: Map application person updates to database format
function mapPersonToDb(updates) {
  const dbUpdates = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.stripeCustomerId !== undefined)
    dbUpdates.stripe_customer_id = updates.stripeCustomerId;
  // Identity fields (see mapPersonFromDb and migration 019).
  if (updates.instagram !== undefined) dbUpdates.instagram = updates.instagram;
  if (updates.twitter !== undefined) dbUpdates.twitter = updates.twitter;
  if (updates.tiktok !== undefined) dbUpdates.tiktok = updates.tiktok;
  if (updates.linkedin !== undefined) dbUpdates.linkedin = updates.linkedin;
  if (updates.company !== undefined) dbUpdates.company = updates.company;
  if (updates.birthday !== undefined) dbUpdates.birthday = updates.birthday;
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
  offset = 0,
  { sendableOnly = false } = {}
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

  // attendedEventTags: resolve to the host's events whose admin_tags overlap
  // with the requested tags. Result narrows attendedEventIds (intersect if
  // both are provided, replace if only tags are provided).
  if (
    Array.isArray(filters.attendedEventTags) &&
    filters.attendedEventTags.length > 0
  ) {
    const requestedTags = filters.attendedEventTags
      .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
      .filter(Boolean);
    if (requestedTags.length > 0) {
      const { data: taggedEvents, error: tagErr } = await supabase
        .from("events")
        .select("id")
        .in("id", eventIds)
        .overlaps("admin_tags", requestedTags);
      if (tagErr) {
        console.error("[CRM Filter] tag resolve error:", tagErr.message);
        return { people: [], total: 0 };
      }
      const matchingIds = (taggedEvents || []).map((e) => e.id);
      if (matchingIds.length === 0) {
        console.log("[CRM Filter] No events matched requested tags:", requestedTags);
        return { people: [], total: 0 };
      }
      if (filters.attendedEventIds && filters.attendedEventIds.length > 0) {
        const explicit = filters.attendedEventIds.map((id) => String(id));
        filters.attendedEventIds = matchingIds.filter((id) =>
          explicit.includes(String(id)),
        );
        if (filters.attendedEventIds.length === 0) {
          return { people: [], total: 0 };
        }
      } else {
        filters.attendedEventIds = matchingIds;
      }
    }
  }

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
  if (filters.attendedEventIds && filters.attendedEventIds.length > 0) {
    const requestedIds = filters.attendedEventIds.map((id) => String(id));
    const eventIdsStr = eventIds.map((id) => String(id));

    const validIds = requestedIds.filter((id) => eventIdsStr.includes(id));

    if (validIds.length === 0) {
      console.warn(
        `[CRM Filter] None of the requested attendedEventIds belong to user ${userId}.`
      );
      return { people: [], total: 0 };
    }

    console.log(
      `[CRM Filter] Filtering RSVPs by multiple event_ids:`,
      validIds
    );
    rsvpQuery = rsvpQuery.in("event_id", validIds);
  } else if (filters.attendedEventId) {
    // Verify the event belongs to this user
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
        `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,instagram.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`
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
  let uniquePeople = Array.from(
    new Map(allPeople.map((p) => [p.id, p])).values()
  );

  // Sendable-only filter: drop people we can't actually email (no address,
  // unsubscribed from marketing, or on the global suppression list from
  // bounces/complaints). Applied here — before sort/pagination — so the
  // total count surfaced to the caller reflects the deliverable audience.
  if (sendableOnly) {
    const before = uniquePeople.length;
    // 1) drop people without an email or who've unsubscribed
    uniquePeople = uniquePeople.filter(
      (p) => !!p.email && !p.marketing_unsubscribed_at,
    );
    // 2) drop people whose address is on the suppression list (bounce/complaint)
    if (uniquePeople.length > 0) {
      const { getSuppressedEmailSet } = await import(
        "./email/repos/emailSuppressionsRepo.js"
      );
      const suppressed = await getSuppressedEmailSet(
        uniquePeople.map((p) => p.email),
      );
      if (suppressed.size > 0) {
        uniquePeople = uniquePeople.filter(
          (p) => !suppressed.has(String(p.email).toLowerCase()),
        );
      }
    }
    if (before !== uniquePeople.length) {
      console.log(
        `[CRM Filter] sendableOnly: dropped ${before - uniquePeople.length} non-sendable (of ${before})`,
      );
    }
  }

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

  // Apply optional per-person exclusions (e.g. manual removals from a segment)
  let finalPeople = enrichedPeople;
  if (filters.excludePersonIds && filters.excludePersonIds.length > 0) {
    const excludeSet = new Set(filters.excludePersonIds.map((id) => String(id)));
    finalPeople = enrichedPeople.filter(
      (person) => !excludeSet.has(String(person.id))
    );
  }

  return {
    people: finalPeople,
    total: count || finalPeople.length,
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
    emails: [],
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
  marketingOptIn = false,
  isVip = false,
  visitorId = null,
  joinWaitlist = false,
  customAnswers = null,
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
  const { data: eventRsvps, error } = await supabase
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

  // Generate URL for brand logo if path exists
  if (profile.brandLogo) {
    try {
      let filePath = profile.brandLogo;
      if (profile.brandLogo.includes("profile-pictures/")) {
        const urlMatch = profile.brandLogo.match(/profile-pictures\/([^?]+)/);
        if (urlMatch) filePath = urlMatch[1];
      }
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from("profile-pictures")
        .createSignedUrl(filePath, 3600);
      if (!urlError && signedUrlData?.signedUrl) {
        profile.brandLogo = signedUrlData.signedUrl;
      } else {
        const { data: { publicUrl } } = supabase.storage.from("profile-pictures").getPublicUrl(filePath);
        profile.brandLogo = publicUrl;
      }
    } catch (urlError) {
      console.error("Error generating brand logo URL:", urlError);
    }
  }

  return profile;
}

// Create default profile.
//
// Runs the first time getUserProfile() is called for a freshly authenticated
// user. We use this moment for two pieces of housekeeping:
//
//   1. Seed contact_email from the auth user's email so it's not null on
//      first load.
//   2. Auto-link any sales_leads rows that were tracking this email before
//      the user signed up. This preserves sales pipeline state (status,
//      notes, source attribution) across the prospect → user transition,
//      and prevents the admin sales view from showing both the original
//      lead row AND a duplicate auto-surfaced "user" row for the same person.
export async function createDefaultProfile(userId) {
  // Pull the auth user's email — service-role only, OK in this backend.
  let authEmail = null;
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    authEmail = authUser?.user?.email?.toLowerCase().trim() || null;
  } catch (err) {
    console.warn("[createDefaultProfile] auth lookup failed:", err.message);
  }

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
    brand_website: null,
    brand_logo_url: null,
    contact_email: authEmail,
    additional_emails: [],
    third_party_accounts: [],
    is_admin: false,
  };

  const { data, error } = await supabase
    .from("profiles")
    .insert(defaultProfile)
    .select()
    .single();

  if (error) throw error;

  // Auto-link unlinked sales_leads with this email. Lead emails are stored
  // lowercase (POST /admin/sales/leads normalizes), so an exact match works.
  // Matching with .is("profile_id", null) keeps idempotency — admin manual
  // links won't be overwritten by re-signup of a different user.
  if (authEmail) {
    try {
      await supabase
        .from("sales_leads")
        .update({
          profile_id: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("email", authEmail)
        .is("profile_id", null);
    } catch (err) {
      // Non-fatal: GET /admin/sales/leads still runs an email-based
      // auto-match as a fallback when the admin views the page.
      console.warn("[createDefaultProfile] sales link failed:", err.message);
    }
  }

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

// ---------------------------
// Newsletter subscriptions
// ---------------------------

export async function getNewsletterSubscribers({
  status = "confirmed",
  limit = 10000,
  targetCategories = [],
} = {}) {
  const { data, error, count } = await supabase
    .from("newsletter_subscriptions")
    .select("id, email, user_id, status, interests, unsubscribe_token", { count: "exact" })
    .eq("status", status)
    .limit(limit);

  if (error) {
    console.error("[getNewsletterSubscribers] Error:", error);
    throw error;
  }

  let subscribers = data || [];

  // If targeting specific categories, include subscribers who:
  // 1. Have at least one matching interest, OR
  // 2. Have no interests set (they get everything)
  if (Array.isArray(targetCategories) && targetCategories.length > 0) {
    const targets = new Set(targetCategories.map((c) => c.toLowerCase()));
    subscribers = subscribers.filter((s) => {
      const interests = Array.isArray(s.interests) ? s.interests : [];
      if (interests.length === 0) return true;
      return interests.some((i) => targets.has(i.toLowerCase()));
    });
  }

  return {
    subscribers,
    total: subscribers.length,
    unfilteredTotal: typeof count === "number" ? count : (data || []).length,
  };
}

// Helper: Map database profile to application format
function mapProfileFromDb(dbProfile) {
  return {
    id: dbProfile.id,
    name: dbProfile.name || "",
    brand: dbProfile.brand || "",
    bio: dbProfile.bio || "",
    city: dbProfile.city || "",
    visitorId: dbProfile.visitor_id || null,
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
    brandWebsite: dbProfile.brand_website || "",
    brandLogo: dbProfile.brand_logo_url || null,
    contactEmail: dbProfile.contact_email || "",
    stripeConnectedAccountId: dbProfile.stripe_connected_account_id || null,
    isAdmin: dbProfile.is_admin || false,
    hostBrief: dbProfile.host_brief || "",
    // Phone-as-identity + WhatsApp host preferences (migrations 037 + 044).
    // Surfaced under both camelCase and snake_case so the settings UI
    // (which keys off snake_case to match DB column names) and any
    // existing camelCase callers both keep working.
    phoneE164:             dbProfile.phone_e164 || null,
    phoneCountry:          dbProfile.phone_country || null,
    phoneVerifiedAt:       dbProfile.phone_verified_at || null,
    whatsappSignature:     dbProfile.whatsapp_signature || "",
    whatsappEnabled:       dbProfile.whatsapp_enabled === false ? false : true,
    phone_e164:            dbProfile.phone_e164 || null,
    phone_country:         dbProfile.phone_country || null,
    phone_verified_at:     dbProfile.phone_verified_at || null,
    whatsapp_signature:    dbProfile.whatsapp_signature || "",
    whatsapp_enabled:      dbProfile.whatsapp_enabled === false ? false : true,
    // Host brand identity (migration 045). Travels with every guest-facing
    // surface — event pages, email confirms, WhatsApp signature/voice.
    // Surfaced under camelCase + snake_case so settings UI + render code
    // can use either convention.
    brandPrimaryColor:     dbProfile.brand_primary_color || null,
    brandBackground:       dbProfile.brand_background || null,
    brandTextColor:        dbProfile.brand_text_color || null,
    brandFontFamily:       dbProfile.brand_font_family || null,
    brandLogoUrl:          dbProfile.brand_logo_url || null,
    brand_primary_color:   dbProfile.brand_primary_color || null,
    brand_background:      dbProfile.brand_background || null,
    brand_text_color:      dbProfile.brand_text_color || null,
    brand_font_family:     dbProfile.brand_font_family || null,
    brand_logo_url:        dbProfile.brand_logo_url || null,
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
  if (profile.city !== undefined) dbProfile.city = profile.city;
  // Stamp visitor_id only on first capture so a returning user from a
  // different device doesn't overwrite the earlier (more meaningful)
  // pre-signup visitor cookie. The frontend only sends it during
  // onboarding finalize, so this defensive guard is belt-and-braces.
  if (profile.visitorId !== undefined && profile.visitorId !== null) {
    dbProfile.visitor_id = profile.visitorId;
  }
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
  if (profile.brandWebsite !== undefined)
    dbProfile.brand_website = profile.brandWebsite;
  if (profile.brandLogo !== undefined)
    dbProfile.brand_logo_url = profile.brandLogo;
  if (profile.contactEmail !== undefined)
    dbProfile.contact_email = profile.contactEmail;
  if (profile.stripeConnectedAccountId !== undefined)
    dbProfile.stripe_connected_account_id = profile.stripeConnectedAccountId;
  // is_admin is intentionally NOT updatable here. Privilege escalation would
  // otherwise be possible by POSTing { "isAdmin": true } to /host/profile.
  // The admin flag is granted out-of-band via scripts/grant_admin.js, which
  // writes the column directly.
  if (profile.hostBrief !== undefined) dbProfile.host_brief = profile.hostBrief;
  // WhatsApp host prefs (migration 044). Accept either camelCase or
  // snake_case so the settings UI can save with the DB column names
  // directly without an extra mapping layer on the frontend.
  if (profile.whatsappSignature !== undefined)
    dbProfile.whatsapp_signature = profile.whatsappSignature;
  else if (profile.whatsapp_signature !== undefined)
    dbProfile.whatsapp_signature = profile.whatsapp_signature;
  if (profile.whatsappEnabled !== undefined)
    dbProfile.whatsapp_enabled = !!profile.whatsappEnabled;
  else if (profile.whatsapp_enabled !== undefined)
    dbProfile.whatsapp_enabled = !!profile.whatsapp_enabled;

  // Brand tokens (migration 045). Accept either casing.
  // Empty string is treated as "clear" — back to null + auto/fallback.
  const brandFields = [
    ["brandPrimaryColor", "brand_primary_color"],
    ["brandBackground",   "brand_background"],
    ["brandTextColor",    "brand_text_color"],
    ["brandFontFamily",   "brand_font_family"],
    ["brandLogoUrl",      "brand_logo_url"],
  ];
  for (const [camel, snake] of brandFields) {
    if (profile[camel] !== undefined) {
      dbProfile[snake] = profile[camel] === "" ? null : profile[camel];
    } else if (profile[snake] !== undefined) {
      dbProfile[snake] = profile[snake] === "" ? null : profile[snake];
    }
  }
  return dbProfile;
}

// ---------------------------
// CRM marketing unsubscribe
// ---------------------------
// We never delete people who unsubscribe — a timestamp + token pair lets
// them re-subscribe later via the same link, and hosts retain full event
// history. Tokens are minted lazily on first send.

export async function ensureUnsubscribeToken(personId) {
  const { data, error } = await supabase
    .from("people")
    .select("marketing_unsubscribe_token")
    .eq("id", personId)
    .single();
  if (error) throw error;
  if (data?.marketing_unsubscribe_token) return data.marketing_unsubscribe_token;
  const token = crypto.randomBytes(24).toString("hex");
  const { error: updateError } = await supabase
    .from("people")
    .update({ marketing_unsubscribe_token: token })
    .eq("id", personId);
  if (updateError) throw updateError;
  return token;
}

export async function findPersonByUnsubscribeToken(token) {
  if (!token || typeof token !== "string") return null;
  const { data, error } = await supabase
    .from("people")
    .select("id, email, name, marketing_unsubscribed_at")
    .eq("marketing_unsubscribe_token", token)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function setMarketingUnsubscribed(personId, unsubscribed) {
  const { error } = await supabase
    .from("people")
    .update({ marketing_unsubscribed_at: unsubscribed ? new Date().toISOString() : null })
    .eq("id", personId);
  if (error) throw error;
}

// ---------------------------
// CRM follow-up image gallery
// ---------------------------
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

const PAT_PREFIX = "pup_";

export function isPatToken(token) {
  return typeof token === "string" && token.startsWith(PAT_PREFIX);
}

export function hashPatToken(plaintext) {
  return crypto.createHash("sha256").update(String(plaintext)).digest("hex");
}

export async function createPersonalAccessToken({ userId, name, expiresAt = null, expiresInDays = null }) {
  if (!userId) throw new Error("userId required");
  if (!name || !String(name).trim()) throw new Error("name required");

  // expiresInDays is a convenience for "valid for N days from now". Falls
  // through to expiresAt (explicit timestamp). Pass neither for a
  // perpetual token (the default — manual tokens are perpetual; OAuth-
  // issued tokens should pass expiresInDays: 90 for a 90-day default).
  let expiresIso = expiresAt || null;
  if (!expiresIso && expiresInDays && Number(expiresInDays) > 0) {
    expiresIso = new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString();
  }

  // 48 base64url chars ~ 36 bytes of entropy. More than enough.
  const random = crypto.randomBytes(36).toString("base64url");
  const plaintext = `${PAT_PREFIX}${random}`;
  const tokenHash = hashPatToken(plaintext);

  const { data, error } = await supabase
    .from("personal_access_tokens")
    .insert({
      user_id: userId,
      token_hash: tokenHash,
      name: String(name).trim().slice(0, 80),
      expires_at: expiresIso,
    })
    .select("id, name, created_at, expires_at")
    .single();

  if (error) throw error;
  // Plaintext is returned ONCE and never persisted. Caller must surface it
  // to the user immediately.
  return {
    id: data.id,
    name: data.name,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
    token: plaintext,
  };
}

// Resolve a PAT to its row. Returns { userId, tokenId } on success, null
// on missing/revoked/expired/invalid. Callers that only need the user id
// should use findUserIdByPatToken (thin wrapper below).
export async function findPatRecord(plaintext) {
  if (!isPatToken(plaintext)) return null;
  const tokenHash = hashPatToken(plaintext);
  const { data, error } = await supabase
    .from("personal_access_tokens")
    .select("id, user_id, revoked_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at) return null;
  // Expired tokens are treated identically to revoked tokens — the
  // caller sees a generic 401 with no leak about why.
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;

  // Fire-and-forget last_used_at update. Don't block the request on it.
  supabase
    .from("personal_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {}, () => {});

  return { userId: data.user_id, tokenId: data.id };
}

export async function findUserIdByPatToken(plaintext) {
  const rec = await findPatRecord(plaintext);
  return rec ? rec.userId : null;
}

export async function listPersonalAccessTokensForUser(userId) {
  const { data, error } = await supabase
    .from("personal_access_tokens")
    .select("id, name, created_at, last_used_at, revoked_at, expires_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
    expiresAt: r.expires_at,
  }));
}

export async function revokePersonalAccessToken({ userId, tokenId }) {
  const { data, error } = await supabase
    .from("personal_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return !!data;
}
