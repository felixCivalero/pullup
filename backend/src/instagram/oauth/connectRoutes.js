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
  getConnectionForHost,
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

/** GET /instagram/connection — authed; status for the Settings UI. */
export async function getInstagramConnectionStatus(req, res) {
  const hostProfileId = req.user?.id;
  if (!hostProfileId) {
    res.status(401).json({ error: "auth required" });
    return;
  }
  try {
    const conn = await getConnectionForHost(hostProfileId);
    res.json({
      connected: !!conn,
      sandbox: IG_SANDBOX_MODE,
      account: conn
        ? {
            ig_username: conn.ig_username,
            connected_at: conn.connected_at,
            scopes: conn.scopes,
            token_expires_at: conn.token_expires_at,
          }
        : null,
    });
  } catch (err) {
    logger?.error?.("[instagram/oauth] status failed", { err: err.message });
    res.status(500).json({ error: "status_failed" });
  }
}

/** GET /oauth/instagram/start — must run behind requireAuth. */
export function startInstagramConnect(req, res) {
  const hostProfileId = req.user?.id;
  if (!hostProfileId) {
    res.status(401).json({ error: "auth required" });
    return;
  }
  if (!IG_APP_ID || !IG_OAUTH_REDIRECT_URI) {
    res.status(503).json({ error: "instagram not configured" });
    return;
  }

  const state = signState({ hostProfileId, nonce: crypto.randomUUID(), ts: Date.now() });
  const url =
    `${IG_AUTHORIZE_URL}?client_id=${encodeURIComponent(IG_APP_ID)}` +
    `&redirect_uri=${encodeURIComponent(IG_OAUTH_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(IG_SCOPES.join(","))}` +
    `&state=${encodeURIComponent(state)}`;

  // In sandbox we skip the real IG round-trip and bounce straight to the
  // callback with a fake code, so the whole flow is testable end-to-end.
  if (IG_SANDBOX_MODE) {
    const cbBase = IG_OAUTH_REDIRECT_URI || `${req.protocol}://${req.get("host")}/oauth/instagram/callback`;
    res.redirect(`${cbBase}?code=sbx-code&state=${encodeURIComponent(state)}`);
    return;
  }
  res.redirect(url);
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
