// backend/src/services/byo/supabaseOauth.js
//
// The Supabase OAuth2 (PKCE) handshake — the keyless "Connect with Supabase"
// path. PullUp is the third-party app; the creator authorizes it to manage
// their org on their behalf, and we get an access token for the Management API.
// (https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration)
//
// We never persist the PKCE verifier server-side: it rides inside the SIGNED
// `state` (HMAC over APP_ENCRYPTION_KEY), which also carries the hostId — so the
// callback (which has no session) can recover both and is tamper-proof + bound
// to the user who started the flow.

import crypto from "node:crypto";

const AUTHORIZE_URL = "https://api.supabase.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.supabase.com/v1/oauth/token";
const STATE_TTL_MS = 10 * 60 * 1000;

function clientId() { return process.env.SUPABASE_OAUTH_CLIENT_ID; }
function clientSecret() { return process.env.SUPABASE_OAUTH_CLIENT_SECRET; }
function redirectUri() { return process.env.SUPABASE_OAUTH_REDIRECT_URI; }

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// PKCE: verifier (kept in state) + S256 challenge (sent to Supabase).
export function genPkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function stateKey() {
  // Derive a signing key from the app encryption key (already required for BYO).
  const raw = process.env.APP_ENCRYPTION_KEY || "";
  return crypto.createHash("sha256").update(`byo-oauth-state:${raw}`).digest();
}

// Sign { hostId, verifier, ts } → an opaque, tamper-proof, time-boxed state.
export function signState({ hostId, verifier }) {
  const payload = b64url(JSON.stringify({ hostId, verifier, ts: Date.now() }));
  const sig = b64url(crypto.createHmac("sha256", stateKey()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyState(state) {
  try {
    const [payload, sig] = String(state || "").split(".");
    if (!payload || !sig) return null;
    const expect = b64url(crypto.createHmac("sha256", stateKey()).update(payload).digest());
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const obj = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    if (!obj.hostId || !obj.verifier || Date.now() - obj.ts > STATE_TTL_MS) return null;
    return obj;
  } catch {
    return null;
  }
}

// The URL we send the creator's browser to.
export function buildAuthorizeUrl(state, challenge) {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
}

// Exchange the authorization code for an access (+ refresh) token. Client id/
// secret go in the Basic auth header per the OAuth2 spec.
export async function exchangeCode({ code, verifier }) {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`oauth_token_exchange_failed: ${json.error_description || json.error || res.status}`);
  }
  return json; // { access_token, refresh_token, expires_in, token_type }
}
