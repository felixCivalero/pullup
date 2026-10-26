// OAuth 2.1 for assistants (the MCP authorization spec): any MCP client can
// register itself (RFC 7591), send its person to approve it once
// (pullup.se/connect), and get tokens that act as that person — no more.
//
//   access token   pua_…  1 hour
//   refresh token  pur_…  60 days, a new one on every use; using an old one
//                          again revokes the whole grant (it was copied)
//
// Only SHA-256 hashes of tokens and codes are stored (mig 148). The SDK's
// handlers (routes/oauth.js) do the protocol: parameter checks, PKCE S256
// verification, redirect-URI matching, error responses. This file is the
// storage and the rules.
import crypto from "crypto";
import { InvalidGrantError, InvalidTokenError, InvalidClientMetadataError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { supabase } from "../supabase.js";
import { getFrontendUrl } from "../lib/urls.js";
import { ACCESS_TOKEN_TTL_S, AUTH_CODE_TTL_S, AUTH_REQUEST_TTL_S, REFRESH_TOKEN_TTL_S, SCOPE } from "./config.js";

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const token = (prefix) => `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
const inSeconds = (s) => new Date(Date.now() + s * 1000).toISOString();

const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:", "ftp:", "ws:", "wss:", "mailto:", "tel:"]);

// Where an assistant may send the person back after approval: https, a
// loopback address (desktop apps, RFC 8252), or an app's own scheme
// (cursor://, vscode://). Never javascript:, data:, file: or plain http.
export function allowedRedirectUri(uri) {
  let u;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  return /^[a-z][a-z0-9+.-]*:$/i.test(u.protocol) && !BLOCKED_SCHEMES.has(u.protocol.toLowerCase());
}

const clientsStore = {
  async getClient(clientId) {
    const { data } = await supabase.from("agent_clients").select("client_id, metadata").eq("client_id", String(clientId).slice(0, 200)).maybeSingle();
    return data ? { ...data.metadata, client_id: data.client_id } : undefined;
  },
  async registerClient(client) {
    if (!client.redirect_uris?.length || !client.redirect_uris.every(allowedRedirectUri)) {
      throw new InvalidClientMetadataError("redirect_uris must be https, a loopback address or an app scheme");
    }
    const metadata = {
      ...client,
      client_name: typeof client.client_name === "string" ? client.client_name.slice(0, 100) : undefined,
      scope: SCOPE,
    };
    const { error } = await supabase.from("agent_clients").insert({ client_id: client.client_id, metadata });
    if (error) throw error;
    return metadata;
  },
};

// A refresh token presented twice means it was copied: end the grant.
async function revokeGrant(id) {
  await supabase.from("agent_grants").update({ revoked_at: new Date().toISOString() }).eq("id", id);
}

async function issue({ clientId, userId, scopes, resource, grantId }) {
  const access = token("pua_");
  const refresh = token("pur_");
  const row = {
    access_hash: sha256(access),
    access_expires_at: inSeconds(ACCESS_TOKEN_TTL_S),
    refresh_hash: sha256(refresh),
    refresh_expires_at: inSeconds(REFRESH_TOKEN_TTL_S),
  };
  if (grantId) {
    const { error } = await supabase.from("agent_grants").update(row).eq("id", grantId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("agent_grants").insert({ ...row, client_id: clientId, user_id: userId, scopes, resource });
    if (error) throw error;
  }
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_S, refresh_token: refresh, scope: scopes.join(" ") };
}

// Who a user id is, for a token's caller. Asked of Supabase, remembered 5 min.
const users = new Map();
export async function userById(id) {
  const hit = users.get(id);
  if (hit && hit.until > Date.now()) return hit.user;
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error || !data?.user) return null;
  if (users.size > 1000) users.clear();
  users.set(id, { user: data.user, until: Date.now() + 5 * 60_000 });
  return data.user;
}

export const provider = {
  get clientsStore() {
    return clientsStore;
  },

  // The SDK checked the client, redirect URI and PKCE method. Park the request
  // and send the person to pullup.se to sign in and approve it.
  async authorize(client, params, res) {
    const { data, error } = await supabase
      .from("agent_auth_requests")
      .insert({
        client_id: client.client_id,
        redirect_uri: params.redirectUri,
        state: params.state ?? null,
        code_challenge: params.codeChallenge,
        scopes: [SCOPE],
        resource: params.resource?.href ?? null,
        expires_at: inSeconds(AUTH_REQUEST_TTL_S),
      })
      .select("id")
      .single();
    if (error) throw error;
    res.redirect(302, `${getFrontendUrl()}/connect?request=${data.id}`);
  },

  async challengeForAuthorizationCode(client, code) {
    const { data } = await supabase.from("agent_auth_codes").select("code_challenge, client_id").eq("code_hash", sha256(code)).maybeSingle();
    if (!data || data.client_id !== client.client_id) throw new InvalidGrantError("Invalid authorization code");
    return data.code_challenge;
  },

  async exchangeAuthorizationCode(client, code, _verifier, redirectUri, resource) {
    // One use: only the call that marks it used gets tokens.
    const { data: rows, error } = await supabase
      .from("agent_auth_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code_hash", sha256(code))
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("*");
    if (error) throw error;
    const row = rows?.[0];
    if (!row || row.client_id !== client.client_id) throw new InvalidGrantError("Invalid or expired authorization code");
    if (redirectUri && redirectUri !== row.redirect_uri) throw new InvalidGrantError("redirect_uri does not match");
    if (resource && row.resource && resource.href !== row.resource) throw new InvalidGrantError("resource does not match");
    await supabase.from("agent_clients").update({ last_used_at: new Date().toISOString() }).eq("client_id", client.client_id);
    return issue({ clientId: client.client_id, userId: row.user_id, scopes: row.scopes, resource: row.resource });
  },

  async exchangeRefreshToken(client, refreshToken) {
    const hash = sha256(refreshToken);
    const { data: grant } = await supabase.from("agent_grants").select("*").eq("refresh_hash", hash).maybeSingle();
    if (!grant) {
      const { data: replayed } = await supabase.from("agent_grants").select("id").eq("previous_refresh_hash", hash).maybeSingle();
      if (replayed) await revokeGrant(replayed.id);
      throw new InvalidGrantError("Invalid refresh token");
    }
    if (grant.client_id !== client.client_id || grant.revoked_at || new Date(grant.refresh_expires_at) <= new Date()) {
      throw new InvalidGrantError("Invalid refresh token");
    }
    // Rotate. The old token is remembered so a second use is caught.
    const { data: moved } = await supabase
      .from("agent_grants")
      .update({ previous_refresh_hash: hash, refresh_hash: null })
      .eq("id", grant.id)
      .eq("refresh_hash", hash)
      .select("id");
    if (!moved?.length) throw new InvalidGrantError("Invalid refresh token");
    return issue({ clientId: grant.client_id, userId: grant.user_id, scopes: grant.scopes, resource: grant.resource, grantId: grant.id });
  },

  async verifyAccessToken(accessToken) {
    if (!String(accessToken).startsWith("pua_")) throw new InvalidTokenError("Invalid access token");
    const { data: grant } = await supabase
      .from("agent_grants")
      .select("id, client_id, user_id, scopes, resource, access_expires_at, revoked_at, last_used_at")
      .eq("access_hash", sha256(accessToken))
      .maybeSingle();
    if (!grant || grant.revoked_at) throw new InvalidTokenError("Invalid access token");
    const expiresAt = Math.floor(new Date(grant.access_expires_at).getTime() / 1000);
    if (expiresAt <= Date.now() / 1000) throw new InvalidTokenError("Token has expired");
    if (!grant.last_used_at || Date.now() - new Date(grant.last_used_at).getTime() > 5 * 60_000) {
      supabase.from("agent_grants").update({ last_used_at: new Date().toISOString() }).eq("id", grant.id).then(() => {}, () => {});
    }
    return {
      token: accessToken,
      clientId: grant.client_id,
      scopes: grant.scopes,
      expiresAt,
      resource: grant.resource ? new URL(grant.resource) : undefined,
      extra: { userId: grant.user_id, grantId: grant.id },
    };
  },

  async revokeToken(client, { token: t }) {
    const hash = sha256(t);
    const column = String(t).startsWith("pur_") ? "refresh_hash" : "access_hash";
    await supabase.from("agent_grants").update({ revoked_at: new Date().toISOString() }).eq(column, hash).eq("client_id", client.client_id);
  },
};

// The person on /connect said yes: a one-use code for the assistant.
// → the URL to send the browser to (the assistant's redirect URI).
export async function approveRequest(requestId, userId) {
  const { data: rows, error } = await supabase
    .from("agent_auth_requests")
    .update({ decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .is("decided_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("*");
  if (error) throw error;
  const req = rows?.[0];
  if (!req) return null;
  const code = crypto.randomBytes(32).toString("base64url");
  const { error: insErr } = await supabase.from("agent_auth_codes").insert({
    code_hash: sha256(code),
    client_id: req.client_id,
    user_id: userId,
    redirect_uri: req.redirect_uri,
    code_challenge: req.code_challenge,
    scopes: req.scopes,
    resource: req.resource,
    expires_at: inSeconds(AUTH_CODE_TTL_S),
  });
  if (insErr) throw insErr;
  const back = new URL(req.redirect_uri);
  back.searchParams.set("code", code);
  if (req.state) back.searchParams.set("state", req.state);
  return back.href;
}

// The person said no.
export async function denyRequest(requestId) {
  const { data: rows } = await supabase
    .from("agent_auth_requests")
    .update({ decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .is("decided_at", null)
    .select("*");
  const req = rows?.[0];
  if (!req) return null;
  const back = new URL(req.redirect_uri);
  back.searchParams.set("error", "access_denied");
  back.searchParams.set("error_description", "The person declined");
  if (req.state) back.searchParams.set("state", req.state);
  return back.href;
}

// What the consent page shows: which assistant, going where.
export async function describeRequest(requestId) {
  const { data: req } = await supabase.from("agent_auth_requests").select("*").eq("id", requestId).maybeSingle();
  if (!req || req.decided_at || new Date(req.expires_at) <= new Date()) return null;
  const client = await clientsStore.getClient(req.client_id);
  let redirectHost = "";
  try {
    const u = new URL(req.redirect_uri);
    redirectHost = u.protocol === "https:" || u.protocol === "http:" ? u.host : u.protocol.replace(/:$/, "");
  } catch { /* stored URIs are valid */ }
  return {
    id: req.id,
    client: { name: client?.client_name || "An unnamed assistant", uri: client?.client_uri || null, logo: client?.logo_uri || null },
    redirectHost,
    expiresAt: req.expires_at,
  };
}
