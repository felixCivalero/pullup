// Read-only access to Google Sheets as the service account in
// GOOGLE_SERVICE_ACCOUNT_JSON (the key file, base64 or raw JSON). A sheet is
// readable once it's shared with that account's email. No SDK: a signed JWT
// buys an hour-long access token, then plain REST.
import crypto from "crypto";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
let cached = null; // { token, exp } — reused until a minute before expiry

export const sheetsConfigured = () => !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

function serviceAccount() {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  return JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
}

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;

  const sa = serviceAccount();
  const aud = sa.token_uri || "https://oauth2.googleapis.com/token";
  const unsigned = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({ iss: sa.client_email, scope: SCOPE, aud, iat: now, exp: now + 3600 })}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");

  const res = await fetch(aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`google token: ${res.status} ${body.error || ""}`.trim());
  cached = { token: body.access_token, exp: now + (body.expires_in || 3600) };
  return cached.token;
}

// One request for several A1 ranges. Numbers come back as numbers, dates as
// the cell's display text (the sheet formats them YYYY-MM-DD). An empty range
// comes back as [].
export async function batchGetValues(spreadsheetId, ranges) {
  const qs = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
  for (const r of ranges) qs.append("ranges", r);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${qs}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`sheets batchGet: ${res.status} ${body.error?.message || ""}`.trim());
  return (body.valueRanges || []).map((v) => v.values || []);
}
