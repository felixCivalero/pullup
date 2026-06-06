// backend/src/instagram/oauth/connectRoutes.js
//
// Per-host "Connect Instagram" flow (PullUp as OAuth *client* to Meta — note
// this is the opposite direction from src/oauth/, where PullUp is the OAuth
// *server* for MCP clients).
//
//   GET /oauth/instagram/start     (authed) → redirect host to IG authorize
//   GET /oauth/instagram/callback           → exchange code, store connection
//
// The callback can't rely on our session cookie (Meta redirects cross-site),
// so the host identity rides in a signed `state` param we mint at start and
// verify on return.

import crypto from "node:crypto";
import {
  IG_AUTHORIZE_URL,
  IG_APP_ID,
  IG_APP_SECRET,
  IG_OAUTH_REDIRECT_URI,
  IG_SCOPES,
  IG_SANDBOX_MODE,
} from "../config.js";
import { exchangeCodeForToken, fetchAccount } from "../providers/igGraphClient.js";
import {
  upsertConnection,
  getConnectionsForHost,
  setDefaultConnection,
  setConnectionLabel,
  disconnectConnection,
} from "../repos/instagramConnectionsRepo.js";
import { logger } from "../../logger.js";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete the round-trip

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function signState(payloadObj) {
  const body = b64url(JSON.stringify(payloadObj));
  const sig = crypto
    .createHmac("sha256", IG_APP_SECRET || "ig-state-secret")
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function verifyState(state) {
  if (!state || typeof state !== "string" || !state.includes(".")) return null;
  const [body, sig] = state.split(".");
  const expected = crypto
    .createHmac("sha256", IG_APP_SECRET || "ig-state-secret")
    .update(body)
    .digest("base64url");
  // constant-time compare
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload?.ts || Date.now() - payload.ts > STATE_TTL_MS) return null;
  return payload;
}

const SETTINGS_URL = "https://pullup.se/home?tab=settings";

/** GET /instagram/connection — authed; status for the Settings + Room UI.
 *  Returns ALL connected accounts (multi-account) plus, for back-compat,
 *  `connected` and `account` pointing at the default. */
export async function getInstagramConnectionStatus(req, res) {
  const hostProfileId = req.user?.id;
  if (!hostProfileId) {
    res.status(401).json({ error: "auth required" });
    return;
  }
  try {
    const conns = await getConnectionsForHost(hostProfileId);
    const accounts = conns.map((c) => ({
      id: c.id,
      ig_username: c.ig_username,
      label: c.label || null,
      isDefault: !!c.is_default,
      connected_at: c.connected_at,
      token_expires_at: c.token_expires_at,
    }));
    const def = accounts.find((a) => a.isDefault) || accounts[0] || null;
    res.json({
      connected: accounts.length > 0,
      sandbox: IG_SANDBOX_MODE,
      accounts,
      account: def ? { ig_username: def.ig_username, connected_at: def.connected_at } : null,
    });
  } catch (err) {
    logger?.error?.("[instagram/oauth] status failed", { err: err.message });
    res.status(500).json({ error: "status_failed" });
  }
}

/** POST /instagram/connections/:id/default — set the host's reply-from account. */
export async function setDefaultInstagramAccount(req, res) {
  const hostProfileId = req.user?.id;
  if (!hostProfileId) { res.status(401).json({ error: "auth required" }); return; }
  try {
    await setDefaultConnection(hostProfileId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "could_not_set_default" });
  }
}

/** PATCH /instagram/connections/:id — rename an account (label). */
export async function updateInstagramAccount(req, res) {
  const hostProfileId = req.user?.id;
  if (!hostProfileId) { res.status(401).json({ error: "auth required" }); return; }
  try {
    const label = typeof req.body?.label === "string" ? req.body.label.slice(0, 40) : null;
    await setConnectionLabel(hostProfileId, req.params.id, label);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "could_not_update" });
  }
}

/** DELETE /instagram/connections/:id — disconnect one account. */
export async function disconnectInstagramAccount(req, res) {
  const hostProfileId = req.user?.id;
  if (!hostProfileId) { res.status(401).json({ error: "auth required" }); return; }
  try {
    await disconnectConnection(hostProfileId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "could_not_disconnect" });
  }
}

// Build the IG authorize URL for a host (or null if IG isn't configured).
// Shared by the redirect route and the JSON `connect-url` route so the signing
// logic lives in one place. In sandbox we return the callback URL directly with
// a fake code so the whole flow is testable end-to-end.
function buildInstagramAuthorizeUrl(hostProfileId, req) {
  if (!IG_APP_ID || !IG_OAUTH_REDIRECT_URI) return null;
  const state = signState({ hostProfileId, nonce: crypto.randomUUID(), ts: Date.now() });
  if (IG_SANDBOX_MODE) {
    const cbBase = IG_OAUTH_REDIRECT_URI || `${req?.protocol}://${req?.get("host")}/oauth/instagram/callback`;
    return `${cbBase}?code=sbx-code&state=${encodeURIComponent(state)}`;
  }
  // Instagram Business Login (Instagram API with Instagram Login) REQUIRES
  // enable_fb_login=0 — without it Instagram routes to the Facebook-login
  // (first_party) path and rejects with "Invalid platform app". force_authentication=1
  // makes the user re-auth so a wrong logged-in account can be switched.
  return (
    `${IG_AUTHORIZE_URL}?enable_fb_login=0&force_authentication=1` +
    `&client_id=${encodeURIComponent(IG_APP_ID)}` +
    `&redirect_uri=${encodeURIComponent(IG_OAUTH_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(IG_SCOPES.join(","))}` +
    `&state=${encodeURIComponent(state)}`
  );
}

/** GET /oauth/instagram/start — must run behind requireAuth. */
export function startInstagramConnect(req, res) {
  const hostProfileId = req.user?.id;
  if (!hostProfileId) {
    res.status(401).json({ error: "auth required" });
    return;
  }
  const url = buildInstagramAuthorizeUrl(hostProfileId, req);
  if (!url) {
    res.status(503).json({ error: "instagram not configured" });
    return;
  }
  res.redirect(url);
}

/**
 * GET /instagram/connect-url — authed JSON. Returns the IG authorize URL so a
 * browser (which can't attach the bearer token to a top-level navigation to the
 * redirect route) can kick off the connect flow with window.location.
 */
export function getInstagramConnectUrl(req, res) {
  const hostProfileId = req.user?.id;
  if (!hostProfileId) {
    res.status(401).json({ error: "auth required" });
    return;
  }
  const url = buildInstagramAuthorizeUrl(hostProfileId, req);
  if (!url) {
    res.status(503).json({ error: "instagram_not_configured" });
    return;
  }
  res.json({ url });
}

/** GET /oauth/instagram/callback — public; trusts the signed state. */
export async function instagramConnectCallback(req, res) {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    logger?.warn?.("[instagram/oauth] user denied or error", { oauthError });
    res.redirect(`${SETTINGS_URL}&ig=denied`);
    return;
  }

  const payload = verifyState(state);
  if (!payload) {
    res.redirect(`${SETTINGS_URL}&ig=bad_state`);
    return;
  }
  if (!code) {
    res.redirect(`${SETTINGS_URL}&ig=no_code`);
    return;
  }

  try {
    const { igUserId, accessToken, expiresInSeconds } = await exchangeCodeForToken(code);
    const account = await fetchAccount(accessToken);

    await upsertConnection({
      hostProfileId: payload.hostProfileId,
      igUserId: account.id || igUserId,
      igUsername: account.username,
      accessToken,
      expiresInSeconds,
      scopes: IG_SCOPES,
    });

    logger?.info?.("[instagram/oauth] connected", {
      hostProfileId: payload.hostProfileId,
      igUsername: account.username,
    });
    res.redirect(`${SETTINGS_URL}&ig=connected`);
  } catch (err) {
    logger?.error?.("[instagram/oauth] callback failed", { err: err.message });
    res.redirect(`${SETTINGS_URL}&ig=error`);
  }
}
