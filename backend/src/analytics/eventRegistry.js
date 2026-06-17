// The analytics event registry — the single allowlist for what the public
// batch-ingest endpoint (/t/batch) will accept into analytics_events.
//
// Adding a tracked surface or event = add it here (and nothing else server-
// side). Keeping this a hard whitelist means a compromised or buggy client
// can never flood the spine with arbitrary event names.

export const TRACKED_PAGES = new Set(["landing", "room"]);

export const TRACKED_EVENTS = new Set([
  "page_view",            // one per page load (server dedupes via client_event_id only)
  "section_view",         // { section, order } — first time a landing beat enters the viewport
  "cta_click",            // { location }
  "onboarding_step_view", // { step }
  "onboarding_skip",      // { from }
  "auth_start",           // { method }
  "signed_in",            // { via }
  "waitlist_submit",      // { role, surface } — pressed "Join the waitlist"
  "waitlist_joined",      // { role, surface } — creator_waitlist row written (the conversion)
  "room_view",            // { role } + eventId/userId columns — identified room presence
]);

const MAX_EVENTS_PER_BATCH = 50;
const MAX_PROPS_BYTES = 2048;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Events older than 48h or more than 5min in the future are clock garbage —
// clamp to receive time rather than dropping them.
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;

const BOT_UA_RE =
  /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|slackbot|telegrambot|twitterbot|linkedinbot|pinterest|headless|lighthouse|pingdom|uptime/i;

export function isBotUserAgent(ua) {
  return BOT_UA_RE.test(ua || "");
}

// Validate a /t/batch body and normalize it into analytics_events rows.
// Pure — no I/O — so it's unit-testable. Returns { rows, dropped } or
// { error } when the envelope itself is unusable.
export function validateBatch(body, { now = Date.now() } = {}) {
  const { visitorId, sessionId, deviceType, referrer, utm, page, events } = body || {};
  if (!visitorId || typeof visitorId !== "string" || visitorId.length > 128) {
    return { error: "visitorId is required" };
  }
  if (!Array.isArray(events) || events.length === 0) {
    return { error: "events array is required" };
  }
  if (events.length > MAX_EVENTS_PER_BATCH) {
    return { error: `max ${MAX_EVENTS_PER_BATCH} events per batch` };
  }
  const pageName = TRACKED_PAGES.has(page) ? page : "landing";
  const cleanUtm = sanitizeUtm(utm);

  const rows = [];
  let dropped = 0;
  for (const ev of events) {
    if (!ev || typeof ev !== "object") { dropped++; continue; }
    const { id, name, props, ts, page: evPage, eventId, userId } = ev;
    if (!UUID_RE.test(id || "") || !TRACKED_EVENTS.has(name)) { dropped++; continue; }
    let cleanProps = null;
    if (props && typeof props === "object" && !Array.isArray(props)) {
      const json = JSON.stringify(props);
      if (json.length <= MAX_PROPS_BYTES) cleanProps = props;
    }
    let occurred = Number(ts);
    if (!Number.isFinite(occurred) || now - occurred > MAX_AGE_MS || occurred - now > MAX_FUTURE_MS) {
      occurred = now;
    }
    rows.push({
      client_event_id: id.toLowerCase(),
      visitor_id: visitorId,
      session_id: typeof sessionId === "string" && sessionId ? sessionId.slice(0, 128) : null,
      event_name: name,
      page: TRACKED_PAGES.has(evPage) ? evPage : pageName,
      // Identified surfaces (rooms) stamp who and which event — both columns
      // stay null for anonymous surfaces like the landing page.
      event_id: UUID_RE.test(eventId || "") ? eventId.toLowerCase() : null,
      user_id: UUID_RE.test(userId || "") ? userId.toLowerCase() : null,
      props: cleanProps,
      referrer: typeof referrer === "string" ? referrer.slice(0, 2000) : null,
      utm: cleanUtm,
      device_type: deviceType === "mobile" || deviceType === "desktop" ? deviceType : null,
      occurred_at: new Date(occurred).toISOString(),
    });
  }
  return { rows, dropped };
}

// Same referrer→source mapping the legacy /t/pageview used, extended with
// UTM precedence: an explicit utm_source always beats referrer sniffing.
export function deriveSource(referrer, utm) {
  if (utm && typeof utm.utm_source === "string" && utm.utm_source.trim()) {
    return utm.utm_source.trim().toLowerCase().slice(0, 64);
  }
  if (!referrer) return "direct";
  try {
    const host = new URL(referrer).hostname.replace("www.", "");
    if (host.includes("instagram")) return "instagram";
    if (host.includes("facebook") || host.includes("fb.")) return "facebook";
    if (host.includes("twitter") || host.includes("x.com")) return "twitter";
    if (host.includes("linkedin")) return "linkedin";
    if (host.includes("google")) return "google";
    if (host.includes("pullup")) return "pullup";
    return host.slice(0, 64) || "other";
  } catch {
    return "other";
  }
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

function sanitizeUtm(utm) {
  if (!utm || typeof utm !== "object" || Array.isArray(utm)) return null;
  const out = {};
  for (const k of UTM_KEYS) {
    if (typeof utm[k] === "string" && utm[k].trim()) out[k] = utm[k].trim().slice(0, 256);
  }
  return Object.keys(out).length ? out : null;
}
