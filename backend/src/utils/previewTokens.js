// JWT tokens that turn a public-looking URL into a host-aware "host bar"
// surface. Minted by the MCP when the coach hands a draft / preview link
// back to the host so opening the URL renders the page normally PLUS a
// floating widget with [Publish] / [Send] / [Back to chat] etc.
//
// Two-tier auth model:
//   • The token alone is enough to *see* the widget chrome (so the link
//     from chat just works on any device — no login friction).
//   • Destructive actions (publish / unpublish / send) require the token
//     AND a host session AND that session.user.id === token.hostId.
//
// Capabilities is a forward-compatible array. We mint ['publish','unpublish']
// today; reserving 'edit' so a future in-widget prompt input can ship
// without a token-shape migration.

import jwt from "jsonwebtoken";

let PREVIEW_TOKEN_SECRET =
  process.env.PREVIEW_TOKEN_SECRET ||
  process.env.WAITLIST_TOKEN_SECRET ||
  process.env.SUPABASE_SERVICE_KEY;

if (!PREVIEW_TOKEN_SECRET) {
  console.warn(
    "⚠️  PREVIEW_TOKEN_SECRET / WAITLIST_TOKEN_SECRET / SUPABASE_SERVICE_KEY not set — preview tokens will fail to mint",
  );
}

// scope values let the verifier reject a token minted for one surface
// being replayed against another (e.g. an event-publish token used to
// fire a campaign send).
export const PREVIEW_SCOPE_EVENT = "event";
export const PREVIEW_SCOPE_CAMPAIGN = "campaign";

const DEFAULT_EXPIRY = {
  [PREVIEW_SCOPE_EVENT]: "7d",
  [PREVIEW_SCOPE_CAMPAIGN]: "24h",
};

export function mintPreviewToken({
  scope,
  resourceId,
  hostId,
  capabilities = ["publish", "unpublish"],
  expiresIn,
} = {}) {
  if (!PREVIEW_TOKEN_SECRET) {
    throw new Error("PREVIEW_TOKEN_SECRET (or fallback) must be set");
  }
  if (!scope || !resourceId || !hostId) {
    throw new Error("mintPreviewToken requires { scope, resourceId, hostId }");
  }
  const payload = {
    type: "preview",
    scope,
    resourceId,
    hostId,
    capabilities,
  };
  return jwt.sign(payload, PREVIEW_TOKEN_SECRET, {
    expiresIn: expiresIn || DEFAULT_EXPIRY[scope] || "24h",
  });
}

export function verifyPreviewToken(token) {
  if (!PREVIEW_TOKEN_SECRET) {
    throw new Error("PREVIEW_TOKEN_SECRET (or fallback) must be set");
  }
  if (!token) throw new Error("Missing token");
  let payload;
  try {
    payload = jwt.verify(token, PREVIEW_TOKEN_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") throw new Error("Token expired");
    if (err.name === "JsonWebTokenError") throw new Error("Invalid token");
    throw err;
  }
  if (payload.type !== "preview") throw new Error("Wrong token type");
  if (!payload.scope || !payload.resourceId || !payload.hostId) {
    throw new Error("Token missing required fields");
  }
  return payload;
}

// Convenience: does this verified token grant a specific capability?
export function tokenAllows(payload, capability) {
  return (
    Array.isArray(payload?.capabilities) &&
    payload.capabilities.includes(capability)
  );
}
