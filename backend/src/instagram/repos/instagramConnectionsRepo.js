// backend/src/instagram/repos/instagramConnectionsRepo.js
//
// Data access for instagram_connections (migration 045). The access_token
// is encrypted at rest (utils/encryption.js) — it is decrypted only at the
// moment of a Graph call and never logged or returned to clients.

import { supabase } from "../../supabase.js";
import { encryptSecret, decryptSecret } from "../../utils/encryption.js";
import { logger } from "../../logger.js";

const SAFE_COLUMNS =
  "id, host_profile_id, ig_user_id, ig_username, page_id, scopes, status, connected_at, last_synced_at, token_expires_at";

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
  return data;
}

/** Host-facing fetch (no token). Null if the host hasn't connected. */
export async function getConnectionForHost(hostProfileId) {
  const { data } = await supabase
    .from("instagram_connections")
    .select(SAFE_COLUMNS)
    .eq("host_profile_id", hostProfileId)
    .eq("status", "connected")
    .order("connected_at", { ascending: false })
    .limit(1);
  return data?.[0] || null;
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

/** Mark a connection expired/revoked (e.g. on a 190 token error). */
export async function markConnectionStatus(igUserId, status) {
  await supabase
    .from("instagram_connections")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("ig_user_id", String(igUserId));
}
