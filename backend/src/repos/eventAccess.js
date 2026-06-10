// Event access repo: host roles, permission checks, co-host invitations — the permission spine.
import { supabase } from "../supabase.js";

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
