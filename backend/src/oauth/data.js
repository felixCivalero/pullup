// DB helpers for OAuth 2.1 (RFC 6749 / 7591 / 9728).
//
// Two tables (see migrations/021_oauth.sql):
//   oauth_clients              — AI apps registered via DCR
//   oauth_authorization_codes  — short-lived codes redeemed at /oauth/token
//
// Issued access tokens are NOT stored here — we mint a personal_access_token
// at the end of the flow and return its plaintext as `access_token`. That
// keeps all MCP auth (manual mint + OAuth) flowing through one validation
// path. See createPersonalAccessToken() in ../data.js.

import crypto from "node:crypto";
import { supabase } from "../supabase.js";

// ─── client registration ─────────────────────────────────────────────────

export async function registerClient({ clientName, redirectUris }) {
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    throw new Error("redirect_uris is required and must be a non-empty array");
  }
  for (const uri of redirectUris) {
    if (typeof uri !== "string" || !uri.startsWith("https://")) {
      // Allow http://localhost for dev tooling (Claude Code, Cursor on localhost).
      if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(uri)) {
        throw new Error(`redirect_uri must be https:// (or http://localhost): ${uri}`);
      }
    }
  }

  // client_id is a public identifier — random 32 chars is plenty of entropy.
  const clientId = `mcp_${crypto.randomBytes(24).toString("base64url")}`;

  const { data, error } = await supabase
    .from("oauth_clients")
    .insert({
      client_id: clientId,
      client_name: (clientName || "").slice(0, 200) || null,
      redirect_uris: redirectUris,
      is_dynamic: true,
    })
    .select("client_id, client_name, redirect_uris, created_at")
    .single();

  if (error) throw error;
  return data;
}

export async function getClientById(clientId) {
  if (!clientId) return null;
  const { data, error } = await supabase
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris, created_at")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) return null;
  return data;
}

export function clientAllowsRedirectUri(client, redirectUri) {
  if (!client || !redirectUri) return false;
  const allowed = Array.isArray(client.redirect_uris) ? client.redirect_uris : [];
  return allowed.includes(redirectUri);
}

export async function touchClient(clientId) {
  // fire-and-forget — caller shouldn't block on this
  supabase
    .from("oauth_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .then(() => {}, () => {});
}

// ─── authorization codes ─────────────────────────────────────────────────

const CODE_TTL_SECONDS = 60; // RFC 6749 §4.1.2: codes MUST be short-lived

export async function createAuthorizationCode({
  clientId,
  userId,
  redirectUri,
  scope,
  codeChallenge,
  codeChallengeMethod,
}) {
  if (!clientId || !userId || !redirectUri || !codeChallenge) {
    throw new Error("createAuthorizationCode missing required fields");
  }
  const code = `code_${crypto.randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();

  const { error } = await supabase
    .from("oauth_authorization_codes")
    .insert({
      code,
      client_id: clientId,
      user_id: userId,
      redirect_uri: redirectUri,
      scope: scope || "mcp",
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod || "S256",
      expires_at: expiresAt,
    });
  if (error) throw error;
  return { code, expiresAt };
}

// Single-use: SELECT-then-UPDATE-set-used_at. Returns the row if usable,
// null otherwise (expired, already used, or not found). The single-use
// guarantee is enforced by the .is("used_at", null) condition on the
// UPDATE, which makes the operation atomic at the DB layer.
export async function consumeAuthorizationCode(code) {
  if (!code) return null;

  const { data: row, error: selErr } = await supabase
    .from("oauth_authorization_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (selErr || !row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at) <= new Date()) return null;

  const { data: updated, error: updErr } = await supabase
    .from("oauth_authorization_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code", code)
    .is("used_at", null)
    .select("*")
    .maybeSingle();
  if (updErr || !updated) return null; // someone else used it between SELECT and UPDATE
  return updated;
}

// ─── PKCE verification ───────────────────────────────────────────────────

// RFC 7636 §4.6: PKCE verification.
// S256: BASE64URL-ENCODE(SHA256(ASCII(code_verifier))) === code_challenge
export function verifyPkce({ codeVerifier, codeChallenge, codeChallengeMethod }) {
  if (!codeVerifier || !codeChallenge) return false;
  if (codeChallengeMethod !== "S256") {
    // We only advertise S256. Reject everything else (including "plain") even
    // if a misbehaving client tried to register it.
    return false;
  }
  const hashed = crypto
    .createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");
  // Constant-time comparison to avoid timing leaks.
  const a = Buffer.from(hashed);
  const b = Buffer.from(codeChallenge);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
