// Personal access tokens repo — MCP auth (mint/resolve/list/revoke PATs).
import crypto from "node:crypto";
import { supabase } from "../supabase.js";

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
