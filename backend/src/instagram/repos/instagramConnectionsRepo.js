// backend/src/instagram/repos/instagramConnectionsRepo.js
//
// Data access for instagram_connections (migration 045). The access_token
// is encrypted at rest (utils/encryption.js) — it is decrypted only at the
// moment of a Graph call and never logged or returned to clients.

import { supabase } from "../../supabase.js";
import { encryptSecret, decryptSecret } from "../../utils/encryption.js";
import { logger } from "../../logger.js";

const SAFE_COLUMNS =
  "id, host_profile_id, ig_user_id, ig_username, page_id, scopes, status, connected_at, last_synced_at, token_expires_at, label, is_default";

/**
 * Create or update a host's IG connection (keyed by ig_user_id). Encrypts
 * the token before write. Returns the row WITHOUT the token.
 */
export async function upsertConnection({
  hostProfileId,
  igUserId,
  igUsername,
  pageId = null,
  accessToken,
  expiresInSeconds,
  scopes = [],
}) {
  const token_expires_at = expiresInSeconds
    ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    : null;

  const row = {
    host_profile_id: hostProfileId,
    ig_user_id: String(igUserId),
    ig_username: igUsername || null,
    page_id: pageId,
    access_token: accessToken ? encryptSecret(accessToken) : null,
    token_expires_at,
    scopes,
    status: "connected",
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("instagram_connections")
    .upsert(row, { onConflict: "ig_user_id" })
    .select(SAFE_COLUMNS)
    .single();

  if (error) {
    logger?.error?.("[instagramConnectionsRepo] upsert failed", { error: error.message });
    throw error;
  }

  // First account a host connects becomes their default "reply from" — so a
  // host with one account always has a sender, and a second account is opt-in
  // as the new default (set explicitly in Settings).
  const { data: defs } = await supabase
    .from("instagram_connections")
    .select("id")
    .eq("host_profile_id", hostProfileId)
    .eq("status", "connected")
    .eq("is_default", true)
    .limit(1);
  if (!defs?.length) {
    await supabase.from("instagram_connections").update({ is_default: true }).eq("id", data.id);
    data.is_default = true;
  }

  return data;
}

/**
 * Host-facing fetch of the PRIMARY connection (no token). Prefers the default
 * account, else the most recently connected. Null if the host hasn't connected.
 */
export async function getConnectionForHost(hostProfileId) {
  const { data } = await supabase
    .from("instagram_connections")
    .select(SAFE_COLUMNS)
    .eq("host_profile_id", hostProfileId)
    .eq("status", "connected")
    .order("is_default", { ascending: false })
    .order("connected_at", { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

/** All of a host's connected accounts (no tokens), default first. */
export async function getConnectionsForHost(hostProfileId) {
  const { data } = await supabase
    .from("instagram_connections")
    .select(SAFE_COLUMNS)
    .eq("host_profile_id", hostProfileId)
    .eq("status", "connected")
    .order("is_default", { ascending: false })
    .order("connected_at", { ascending: false });
  return data || [];
}

/** Set which connected account is the host's default "reply from". */
export async function setDefaultConnection(hostProfileId, connectionId) {
  const { data: own } = await supabase
    .from("instagram_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("host_profile_id", hostProfileId)
    .eq("status", "connected")
    .limit(1);
  if (!own?.length) throw new Error("connection not found");
  // Clear first (the partial unique index allows only one is_default per host),
  // then set the chosen one.
  await supabase
    .from("instagram_connections")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("host_profile_id", hostProfileId);
  const { error } = await supabase
    .from("instagram_connections")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("host_profile_id", hostProfileId);
  if (error) throw error;
  return true;
}

/** Host renames an account (e.g. "Personal" / "Business"). */
export async function setConnectionLabel(hostProfileId, connectionId, label) {
  const { error } = await supabase
    .from("instagram_connections")
    .update({ label: label || null, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("host_profile_id", hostProfileId);
  if (error) throw error;
  return true;
}

/** Disconnect one account; if it was the default, promote another. */
export async function disconnectConnection(hostProfileId, connectionId) {
  const { data: rows } = await supabase
    .from("instagram_connections")
    .select("id, is_default")
    .eq("id", connectionId)
    .eq("host_profile_id", hostProfileId)
    .limit(1);
  if (!rows?.length) throw new Error("connection not found");
  await supabase
    .from("instagram_connections")
    .update({ status: "revoked", is_default: false, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("host_profile_id", hostProfileId);
  if (rows[0].is_default) {
    const { data: next } = await supabase
      .from("instagram_connections")
      .select("id")
      .eq("host_profile_id", hostProfileId)
      .eq("status", "connected")
      .order("connected_at", { ascending: false })
      .limit(1);
    if (next?.length) {
      await supabase.from("instagram_connections").update({ is_default: true }).eq("id", next[0].id);
    }
  }
  return true;
}

/**
 * Resolve the owning host + a usable (decrypted) token from an inbound
 * webhook's IG account id. This is the multi-tenant routing seam.
 * Returns { hostProfileId, igUserId, igUsername, accessToken } or null.
 */
export async function getCredentialsByIgUserId(igUserId) {
  const { data } = await supabase
    .from("instagram_connections")
    .select("host_profile_id, ig_user_id, ig_username, access_token, status")
    .eq("ig_user_id", String(igUserId))
    .limit(1);
  const row = data?.[0];
  if (!row || row.status !== "connected" || !row.access_token) return null;
  return {
    hostProfileId: row.host_profile_id,
    igUserId: row.ig_user_id,
    igUsername: row.ig_username,
    accessToken: decryptSecret(row.access_token),
  };
}

/**
 * Full routing context for the inbound webhook path: host + decrypted token
 * + the host's comment rules, resolved from the IG account id. Null if the
 * account isn't connected. This is what the comment-trigger engine consumes.
 */
export async function getRoutingContextByIgUserId(igUserId) {
  const { data } = await supabase
    .from("instagram_connections")
    .select("host_profile_id, ig_user_id, ig_username, access_token, status, comment_rules")
    .eq("ig_user_id", String(igUserId))
    .limit(1);
  const row = data?.[0];
  if (!row || row.status !== "connected" || !row.access_token) return null;
  return {
    hostProfileId: row.host_profile_id,
    igUserId: row.ig_user_id,
    igUsername: row.ig_username,
    accessToken: decryptSecret(row.access_token),
    commentRules: Array.isArray(row.comment_rules) ? row.comment_rules : [],
  };
}

/** Replace a host's comment rules (Settings UI writes here). */
export async function setCommentRules(hostProfileId, rules) {
  const { error } = await supabase
    .from("instagram_connections")
    .update({ comment_rules: rules, updated_at: new Date().toISOString() })
    .eq("host_profile_id", hostProfileId);
  if (error) throw error;
}

/**
 * Connected accounts whose long-lived token expires within `withinDays` and
 * hasn't already expired — the auto-refresh job's work-list. Includes the
 * ENCRYPTED token + ig_user_id so the caller can refresh it in place. (We
 * exclude already-expired tokens: Instagram can't refresh a dead token, so
 * those need a reconnect, handled by the send-path 190 marker, not here.)
 */
export async function getConnectionsDueForRefresh(withinDays = 10, nowMs = Date.now()) {
  const horizon = new Date(nowMs + withinDays * 24 * 60 * 60 * 1000).toISOString();
  const floor = new Date(nowMs).toISOString();
  const { data } = await supabase
    .from("instagram_connections")
    .select("id, ig_user_id, access_token, token_expires_at")
    .eq("status", "connected")
    .not("access_token", "is", null)
    .not("token_expires_at", "is", null)
    .gt("token_expires_at", floor)
    .lte("token_expires_at", horizon);
  return data || [];
}

/**
 * Persist a freshly-refreshed long-lived token (re-encrypted) + its new expiry.
 * Keyed by ig_user_id, like the other write paths.
 */
export async function updateConnectionToken(igUserId, accessToken, expiresInSeconds) {
  const token_expires_at = expiresInSeconds
    ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    : null;
  const { error } = await supabase
    .from("instagram_connections")
    .update({
      access_token: encryptSecret(accessToken),
      token_expires_at,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("ig_user_id", String(igUserId));
  if (error) {
    logger?.error?.("[instagramConnectionsRepo] token refresh write failed", { error: error.message });
    throw error;
  }
}

/** Mark a connection expired/revoked (e.g. on a 190 token error). */
export async function markConnectionStatus(igUserId, status) {
  await supabase
    .from("instagram_connections")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("ig_user_id", String(igUserId));
}

/**
 * Hard-delete the stored connection for an IG account — Meta's data-deletion
 * callback. The connection row holds the credential/PII we obtained via the IG
 * platform (encrypted token + IG id/username), so removing it is the meaningful
 * deletion. Idempotent: a no-op if nothing is stored.
 */
export async function deleteByIgUserId(igUserId) {
  const { error } = await supabase
    .from("instagram_connections")
    .delete()
    .eq("ig_user_id", String(igUserId));
  if (error) {
    logger?.error?.("[instagramConnectionsRepo] delete failed", { error: error.message });
    throw error;
  }
}
