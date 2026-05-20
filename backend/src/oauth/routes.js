// OAuth 2.1 endpoints for PullUp MCP.
//
// Architecture:
//   - Issuer = https://mcp.pullup.se. All OAuth endpoints live on the mcp
//     subdomain so an AI client only needs ONE URL to discover everything.
//   - Consent page is a FRONTEND route at https://pullup.se/oauth/authorize
//     (it needs the user's Supabase session). The authorize endpoint
//     validates params, signs them into a JWT-like `req` token, and
//     302-redirects the user's browser to the consent page with that token.
//   - The consent page POSTs to /api/oauth/consent on pullup.se (same
//     origin, JWT-authenticated) which mints the authorization code and
//     returns the final claude-ai callback URL for the browser to follow.
//   - Tokens issued are pup_… PATs (see ../data.js). One validation path
//     for ALL MCP traffic — manual mint or OAuth-issued.

import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import {
  registerClient,
  getClientById,
  clientAllowsRedirectUri,
  touchClient,
  createAuthorizationCode,
  consumeAuthorizationCode,
  verifyPkce,
} from "./data.js";
import { createPersonalAccessToken } from "../data.js";
import { supabase } from "../supabase.js";

// ─── config ──────────────────────────────────────────────────────────────

// Where AI clients reach the OAuth + MCP endpoints. Override in dev.
export const ISSUER = process.env.PULLUP_OAUTH_ISSUER || "https://mcp.pullup.se";
// Where the human-facing consent UI lives. Backend redirects users here
// after validating an /oauth/authorize request.
export const CONSENT_BASE = process.env.PULLUP_FRONTEND_URL || "https://pullup.se";

// Signing secret for the short-lived `req` token passed to the consent UI.
// Derived from existing secrets so we don't need a new env var to manage.
const REQ_SIGNING_SECRET = crypto
  .createHash("sha256")
  .update(
    "pullup-oauth-req-v1:" +
      (process.env.SUPABASE_JWT_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        "fallback-dev-secret")
  )
  .digest("hex");

// ─── 1. Protected Resource Metadata (RFC 9728) ───────────────────────────
// Served at https://mcp.pullup.se/.well-known/oauth-protected-resource
// Tells MCP clients which AS issues tokens for this resource.

export function metadataPRM(req, res) {
  res.json({
    resource: ISSUER,
    authorization_servers: [ISSUER],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://pullup.se",
  });
}

// ─── 2. Authorization Server Metadata (RFC 8414) ─────────────────────────
// Served at https://mcp.pullup.se/.well-known/oauth-authorization-server.

export function metadataAS(req, res) {
  res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint: `${ISSUER}/oauth/token`,
    registration_endpoint: `${ISSUER}/oauth/register`,
    scopes_supported: ["mcp"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"], // public clients only
    service_documentation: "https://pullup.se",
  });
}

// ─── 3. Dynamic Client Registration (RFC 7591) ───────────────────────────
// POST /oauth/register. Open — anyone can register a public client. PKCE
// is required at the authorize step so unauthenticated DCR is safe.

export async function register(req, res) {
  try {
    const body = req.body || {};
    const redirectUris = body.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
      return res.status(400).json({
        error: "invalid_redirect_uri",
        error_description: "redirect_uris must be a non-empty array of HTTPS URLs",
      });
    }
    const client = await registerClient({
      clientName: body.client_name,
      redirectUris,
    });
    res.status(201).json({
      client_id: client.client_id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      // No client_secret returned — we only support public clients.
    });
  } catch (err) {
    console.error("[oauth] register error:", err);
    res.status(400).json({ error: "invalid_client_metadata", error_description: err.message });
  }
}

// ─── 4. Authorize endpoint ───────────────────────────────────────────────
// GET /oauth/authorize?response_type=code&client_id=...&redirect_uri=...
//                     &code_challenge=...&code_challenge_method=S256
//                     &state=...&scope=mcp
//
// Validates everything, then 302-redirects the user's browser to the
// consent UI on the frontend with a signed `req` token carrying all the
// params the consent page needs to call /api/oauth/consent.

export async function authorize(req, res) {
  const {
    response_type,
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    state,
    scope,
  } = req.query;

  if (response_type !== "code") {
    return oauthErrorRedirect(res, redirect_uri, state, "unsupported_response_type");
  }
  if (!client_id || typeof client_id !== "string") {
    return res.status(400).json({ error: "invalid_request", error_description: "client_id required" });
  }
  const client = await getClientById(client_id);
  if (!client) {
    return res.status(400).json({ error: "invalid_client", error_description: "unknown client_id" });
  }
  if (!redirect_uri || !clientAllowsRedirectUri(client, redirect_uri)) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "redirect_uri not registered for this client",
    });
  }
  if (!code_challenge || code_challenge_method !== "S256") {
    return oauthErrorRedirect(res, redirect_uri, state, "invalid_request",
      "PKCE with S256 is required");
  }

  // Sign the params we'll trust on the way back from the consent page.
  // 5 minutes is plenty for a user to click Allow.
  const reqToken = jwt.sign(
    {
      client_id,
      client_name: client.client_name || null,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      state: state || null,
      scope: scope || "mcp",
    },
    REQ_SIGNING_SECRET,
    { expiresIn: "5m" }
  );

  const consentUrl = `${CONSENT_BASE}/oauth/authorize?req=${encodeURIComponent(reqToken)}`;
  res.redirect(302, consentUrl);
}

// ─── 5. Consent endpoint ─────────────────────────────────────────────────
// POST /oauth/consent (on pullup.se/api, called by the SPA with JWT auth).
//   body: { req: "<signed token from /authorize>", decision: "allow" | "deny" }
// On allow: mints the auth code, returns { redirectTo: "<client redirect_uri>?code=...&state=..." }
// On deny: returns the same shape but with ?error=access_denied.
//
// The route is mounted behind requireAuth in index.js so req.user is set.

export async function consent(req, res) {
  try {
    if (req.authType !== "jwt") {
      return res.status(403).json({ error: "forbidden", message: "JWT (browser session) required" });
    }
    const { req: reqToken, decision } = req.body || {};
    if (!reqToken) return res.status(400).json({ error: "missing_req" });

    let claims;
    try {
      claims = jwt.verify(reqToken, REQ_SIGNING_SECRET);
    } catch {
      return res.status(400).json({ error: "invalid_req_token" });
    }

    const { client_id, redirect_uri, code_challenge, code_challenge_method, state, scope } = claims;

    if (decision === "deny") {
      const redirectTo = appendQuery(redirect_uri, {
        error: "access_denied",
        error_description: "User denied access",
        state,
      });
      return res.json({ redirectTo });
    }

    if (decision !== "allow") {
      return res.status(400).json({ error: "invalid_decision" });
    }

    // Re-verify client still exists and redirect_uri is still allowed.
    const client = await getClientById(client_id);
    if (!client || !clientAllowsRedirectUri(client, redirect_uri)) {
      return res.status(400).json({ error: "invalid_client" });
    }

    const { code } = await createAuthorizationCode({
      clientId: client_id,
      userId: req.user.id,
      redirectUri: redirect_uri,
      scope,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
    });

    touchClient(client_id);

    const redirectTo = appendQuery(redirect_uri, { code, state });
    res.json({ redirectTo, clientName: claims.client_name });
  } catch (err) {
    console.error("[oauth] consent error:", err);
    res.status(500).json({ error: "server_error" });
  }
}

// Helper for the consent page to fetch the claims it needs to render
// "Authorize <client> to manage your PullUp events?" — saves the SPA from
// having to decode the JWT itself.
export async function describeConsent(req, res) {
  const { req: reqToken } = req.query;
  if (!reqToken) return res.status(400).json({ error: "missing_req" });
  let claims;
  try {
    claims = jwt.verify(reqToken, REQ_SIGNING_SECRET);
  } catch {
    return res.status(400).json({ error: "invalid_req_token" });
  }
  res.json({
    clientId: claims.client_id,
    clientName: claims.client_name,
    redirectUri: claims.redirect_uri,
    scope: claims.scope,
  });
}

// ─── 6. Token endpoint ───────────────────────────────────────────────────
// POST /oauth/token  (form-encoded per RFC 6749, but we also accept JSON)
//   grant_type=authorization_code & code=... & redirect_uri=... & client_id=... & code_verifier=...
// Returns: { access_token, token_type: "Bearer", scope }
//
// The access_token IS a pup_… PAT — backed by the existing
// personal_access_tokens table. That means revoking from Settings → PullUp
// MCP also kills OAuth-issued tokens. Single source of truth.

export async function token(req, res) {
  try {
    // Accept both application/x-www-form-urlencoded (standard) and JSON.
    const body = req.body || {};
    const {
      grant_type,
      code,
      redirect_uri,
      client_id,
      code_verifier,
    } = body;

    if (grant_type !== "authorization_code") {
      return res.status(400).json({ error: "unsupported_grant_type" });
    }
    if (!code || !redirect_uri || !client_id || !code_verifier) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "code, redirect_uri, client_id, code_verifier required",
      });
    }

    const row = await consumeAuthorizationCode(code);
    if (!row) {
      return res.status(400).json({ error: "invalid_grant", error_description: "code invalid, used, or expired" });
    }
    if (row.client_id !== client_id) {
      return res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" });
    }
    if (row.redirect_uri !== redirect_uri) {
      return res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
    }
    const pkceOk = verifyPkce({
      codeVerifier: code_verifier,
      codeChallenge: row.code_challenge,
      codeChallengeMethod: row.code_challenge_method,
    });
    if (!pkceOk) {
      return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    }

    // Mint a PAT for this (user, client) pair. The plaintext IS the
    // access_token. Name encodes provenance for the Settings UI.
    const client = await getClientById(client_id);
    const niceName = client?.client_name
      ? `OAuth: ${client.client_name}`
      : `OAuth: ${client_id.slice(0, 12)}…`;
    const pat = await createPersonalAccessToken({
      userId: row.user_id,
      name: niceName.slice(0, 80),
    });

    touchClient(client_id);

    // Per RFC 6749 §5.1, the token response must be JSON with these fields.
    // No refresh_token — our access tokens don't expire (revoke via UI).
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.json({
      access_token: pat.token,
      token_type: "Bearer",
      scope: row.scope || "mcp",
    });
  } catch (err) {
    console.error("[oauth] token error:", err);
    res.status(500).json({ error: "server_error" });
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────

function appendQuery(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

function oauthErrorRedirect(res, redirectUri, state, error, description) {
  if (!redirectUri) {
    return res.status(400).json({ error, error_description: description });
  }
  try {
    const url = appendQuery(redirectUri, { error, error_description: description, state });
    return res.redirect(302, url);
  } catch {
    return res.status(400).json({ error, error_description: description });
  }
}

// CORS for OAuth endpoints reachable from AI clients (browser context).
// Mirrors the MCP CORS — open Allow-Origin is safe because /token is
// guarded by PKCE and /register issues only public clients with PKCE
// required at /authorize.
export function oauthCorsPreflight(req, res, next) {
  if (req.method !== "OPTIONS") return next();
  setOauthCorsHeaders(req, res);
  return res.status(204).end();
}

export function setOauthCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
}
