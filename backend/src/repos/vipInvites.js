// VIP invites repo — create/update/find/mark-used/list VIP invites
// (vip_invites table; tokens are signed elsewhere and stored via updateVipInvite).
import { supabase } from "../supabase.js";

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
