// Per-event communication config — the host's control over the THREE automatic
// sends for one event: the signup info (immediate), the reminder (before), and
// the post-event note (after). Surfaced in the editor's "Communication" rail
// panel; stored in events.comms_config (jsonb, mig 115).
//
// The host WRITES each message as plain text and drops in TOKENS for the live
// details — {event name}, {time}, {location}, {coordinates}, {room link},
// {upload link}. The editor shows a live preview of the resolved message, so a
// host sees exactly what goes out. Tokens always resolve to the real value, so
// a "reveal later" event can still hand over the time/place in the message even
// when the public page hides them.
//
// This module owns: DEFAULT_COMMS_CONFIG, normalizeCommsConfig (clamp/sanitize),
// the token resolvers (text + HTML), and the send-time decisions the schedulers
// use. Everything is pure except getEventCommsConfig (one DB read).

export const REMINDER_MIN_HOURS = 1;
export const REMINDER_MAX_HOURS = 72;
export const POST_MIN_HOURS = 0;     // a thank-you can go right after the doors close
export const POST_MAX_HOURS = 168;   // …or up to a week later
export const BODY_MAX = 2000;

// Only fire a scheduled send if its trigger time passed within this window.
// This is the guard that keeps a deploy (or scheduler downtime) from backfilling
// a blast to events whose moment is long gone: the crossing has to be RECENT.
// The scheduler ticks every 15 min, so 90 min tolerates ~6 missed ticks.
export const SEND_GRACE_MS = 90 * 60 * 1000;

// When an event has no explicit end, assume it runs this long (for post-event timing).
export const DEFAULT_EVENT_DURATION_MS = 3 * 60 * 60 * 1000;

// ── Tokens ──────────────────────────────────────────────────────────────────
// The canonical token strings the host inserts and we resolve. The FE editor
// mirrors this list (frontend/src/lib/commsTokens.js) — keep them in sync.
export const TOKENS = {
  event: "{event name}",
  time: "{time}",
  location: "{location}",
  coordinates: "{coordinates}",
  room: "{room link}",
  upload: "{upload link}",
};
// Which tokens make sense per step (drives the chips shown in the editor).
export const STEP_TOKENS = {
  signup: ["event", "time", "location", "coordinates", "room"],
  reminder: ["event", "time", "location", "coordinates"],
  postEvent: ["event", "upload"],
};

// The default communication arc for every event — written close to how a host
// would (the "Slinga 1/2/3" shape). A host who never opens the panel still gets
// all three sends with these.
export const DEFAULT_COMMS_CONFIG = {
  signup: {
    body: "Welcome to {event name}!\n\nHere's the where and when:\n{location}\n{time}\n\nYour room (everything for the event lives here): {room link}",
  },
  reminder: {
    enabled: true,
    hoursBefore: 12,
    body: "Today's the day — {event name}!\n\nSame time and place:\n{time}\n{location}\n\nCan't wait to see you there.",
  },
  postEvent: {
    enabled: true,
    hoursAfter: 16, // ~the morning after an evening event
    body: "Thank you for joining {event name}!\n\nPlease upload your photos and videos here:\n{upload link}",
  },
};

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
function bodyStr(v, fallback) {
  return typeof v === "string" ? v.slice(0, BODY_MAX) : fallback;
}
function bool(v, fallback) {
  return typeof v === "boolean" ? v : fallback;
}

// Merge whatever the client (or DB) holds with the defaults, clamping numbers
// and coercing the bodies to strings. Always returns the full, valid shape.
export function normalizeCommsConfig(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_COMMS_CONFIG;
  const su = r.signup && typeof r.signup === "object" ? r.signup : {};
  const rm = r.reminder && typeof r.reminder === "object" ? r.reminder : {};
  const pe = r.postEvent && typeof r.postEvent === "object" ? r.postEvent : {};
  return {
    signup: {
      body: bodyStr(su.body, d.signup.body),
    },
    reminder: {
      enabled: bool(rm.enabled, d.reminder.enabled),
      hoursBefore: clampNum(rm.hoursBefore, REMINDER_MIN_HOURS, REMINDER_MAX_HOURS, d.reminder.hoursBefore),
      body: bodyStr(rm.body, d.reminder.body),
    },
    postEvent: {
      enabled: bool(pe.enabled, d.postEvent.enabled),
      hoursAfter: clampNum(pe.hoursAfter, POST_MIN_HOURS, POST_MAX_HOURS, d.postEvent.hoursAfter),
      body: bodyStr(pe.body, d.postEvent.body),
    },
  };
}

// ── Token resolution ──────────────────────────────────────────────────────
// ctx: { eventName, time, location, locationUrl, coordinates, coordinatesUrl,
//        roomUrl, uploadUrl }. Missing values resolve to empty.
const TOKEN_RE = /\{(event name|time|location|coordinates|room link|upload link)\}/g;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Plain text (WhatsApp / SMS / preview-as-text). Links resolve to their URL.
export function resolveCommsText(body, ctx = {}) {
  return String(body || "").replace(TOKEN_RE, (_m, k) => {
    switch (k) {
      case "event name": return ctx.eventName || "";
      case "time": return ctx.time || "";
      case "location": return ctx.location || "";
      case "coordinates": return ctx.coordinates || "";
      case "room link": return ctx.roomUrl || "";
      case "upload link": return ctx.uploadUrl || "";
      default: return "";
    }
  }).replace(/\n{3,}/g, "\n\n").trim();
}

function tokenHtml(k, ctx, linkColor) {
  const a = (href, label) => `<a href="${escapeHtml(href)}" style="color:${linkColor};font-weight:600;">${escapeHtml(label)}</a>`;
  switch (k) {
    case "event name": return escapeHtml(ctx.eventName || "");
    case "time": return escapeHtml(ctx.time || "");
    case "location":
      return ctx.location ? (ctx.locationUrl ? a(ctx.locationUrl, ctx.location) : escapeHtml(ctx.location)) : "";
    case "coordinates":
      return ctx.coordinates ? (ctx.coordinatesUrl ? a(ctx.coordinatesUrl, ctx.coordinates) : escapeHtml(ctx.coordinates)) : "";
    case "room link": return ctx.roomUrl ? a(ctx.roomUrl, "Open the room") : "";
    case "upload link": return ctx.uploadUrl ? a(ctx.uploadUrl, "Upload your photos") : "";
    default: return "";
  }
}

// HTML for the email body — escapes the host's prose, swaps tokens for resolved
// HTML (links where appropriate), newlines → <br>.
export function resolveCommsHtml(body, ctx = {}, linkColor = "#ec178f") {
  const s = String(body || "");
  let out = "";
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(s))) {
    out += escapeHtml(s.slice(last, m.index));
    out += tokenHtml(m[1], ctx, linkColor);
    last = m.index + m[0].length;
  }
  out += escapeHtml(s.slice(last));
  return out.replace(/\n/g, "<br>");
}

// Does this body reference the room/upload link (so the scheduler knows whether
// to mint a per-recipient room key)?
export function bodyNeedsRoomKey(body) {
  const s = String(body || "");
  return s.includes(TOKENS.room) || s.includes(TOKENS.upload);
}

// ── Send-time math (pure) ───────────────────────────────────────────────────
export function reminderSendAt(startMs, hoursBefore) {
  return startMs - hoursBefore * 3600000;
}
export function postEventSendAt(endMs, hoursAfter) {
  return endMs + hoursAfter * 3600000;
}

// A scheduled send is due when its trigger time has just passed (within the
// grace window). Generic so both schedulers share the exact same guard.
export function isDue(now, sendAt, graceMs = SEND_GRACE_MS) {
  return Number.isFinite(sendAt) && now >= sendAt && now - sendAt < graceMs;
}

// Reminder: due in the grace window after (start - hoursBefore), and never once
// the event has already started.
export function reminderDue({ now, startMs, hoursBefore, enabled, graceMs = SEND_GRACE_MS }) {
  if (!enabled || !Number.isFinite(startMs)) return false;
  if (now >= startMs) return false;
  return isDue(now, reminderSendAt(startMs, hoursBefore), graceMs);
}

// Post-event: due in the grace window after (end + hoursAfter).
export function postEventDue({ now, endMs, hoursAfter, enabled, graceMs = SEND_GRACE_MS }) {
  if (!enabled || !Number.isFinite(endMs)) return false;
  return isDue(now, postEventSendAt(endMs, hoursAfter), graceMs);
}

// The event's effective end (ms) — explicit end, else start + default duration.
export function effectiveEndMs(event = {}) {
  const end = event.ends_at || event.endsAt;
  if (end) {
    const t = new Date(end).getTime();
    if (Number.isFinite(t)) return t;
  }
  const start = event.starts_at || event.startsAt;
  if (start) {
    const t = new Date(start).getTime();
    if (Number.isFinite(t)) return t + DEFAULT_EVENT_DURATION_MS;
  }
  return null;
}

// One DB read → normalized config. Failure-soft: always returns valid defaults.
export async function getEventCommsConfig(eventId) {
  try {
    const { supabase } = await import("../supabase.js");
    const { data } = await supabase
      .from("events")
      .select("comms_config")
      .eq("id", eventId)
      .maybeSingle();
    return normalizeCommsConfig(data?.comms_config);
  } catch {
    return normalizeCommsConfig(null);
  }
}
