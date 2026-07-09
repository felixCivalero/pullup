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
// waitlistJoin deliberately excludes location/coordinates/room: a waitlister
// must NOT be handed the reveal. Those tokens only become insertable once the
// host lets them in (waitlistPromote), which mirrors the signup reveal set.
export const STEP_TOKENS = {
  signup: ["event", "time", "location", "coordinates", "room"],
  reminder: ["event", "time", "location", "coordinates"],
  postEvent: ["event", "upload"],
  waitlistJoin: ["event", "time"],
  waitlistPromote: ["event", "time", "location", "coordinates", "room"],
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
    body: "Today's the day - {event name}!\n\nSame time and place:\n{time}\n{location}\n\nCan't wait to see you there.",
  },
  postEvent: {
    enabled: true,
    hoursAfter: 16, // ~the morning after an evening event
    body: "Thank you for joining {event name}!\n\nPlease upload your photos and videos here:\n{upload link}",
  },
  // Only relevant when the event has a waitlist. The JOIN note reveals nothing
  // (no location/room tokens available); the PROMOTE reveal fires the instant
  // the host lets someone in and carries the full where/when + room link — the
  // same payload a fresh confirmed RSVP gets.
  waitlistJoin: {
    enabled: true,
    body: "You're on the waitlist for {event name}.\n\nWe're at capacity right now, but spots open up. If one does, you'll get an email straight away with everything you need. Hang tight!",
  },
  waitlistPromote: {
    enabled: true,
    body: "Good news, a spot just opened and you're in for {event name}!\n\nHere's the where and when:\n{location}\n{time}\n\nYour room (everything for the event lives here): {room link}",
  },
};

// Dateless kinds (community, product): their startsAt is a private sorting
// placeholder, not a real moment — so the welcome must not say "where and
// when" (a member once got "Thursday, Jan 1, 12:00 AM"), and the date-anchored
// reminder/post-event sends default OFF.
export const DATELESS_COMMS_CONFIG = {
  signup: {
    body: "Welcome to {event name}!\n\nYou're in. This is your door to everything happening here.\n\nYour room (it all lives here): {room link}",
  },
  reminder: { ...DEFAULT_COMMS_CONFIG.reminder, enabled: false },
  postEvent: { ...DEFAULT_COMMS_CONFIG.postEvent, enabled: false },
  // Communities/products don't run a capacity waitlist — keep these off.
  waitlistJoin: { ...DEFAULT_COMMS_CONFIG.waitlistJoin, enabled: false },
  waitlistPromote: { ...DEFAULT_COMMS_CONFIG.waitlistPromote, enabled: false },
};

// The defaults for a page kind — anything that isn't a plain event is dateless.
export function defaultCommsForKind(kind) {
  return kind && kind !== "event" ? DATELESS_COMMS_CONFIG : DEFAULT_COMMS_CONFIG;
}

// ── Comms receipt tagging ─────────────────────────────────────────────────
// Every automated send stamps email_outbox.campaign_tag (and the WA row) with
// its type + event, so the host's guest list can show, per guest, exactly which
// messages went out. Event-scoped so a person in two events never crosses wires.
// Format: "comms:<type>:<eventId>"  (type ∈ COMMS_TYPES).
export const COMMS_TYPES = ["signup", "waitlistJoin", "waitlistPromote", "reminder", "postEvent"];
export function commsCampaignTag(type, eventId) {
  return eventId ? `comms:${type}:${eventId}` : `comms:${type}`;
}
// Parse a tag back to { type, eventId }, or null if it isn't a comms tag.
export function parseCommsCampaignTag(tag) {
  if (typeof tag !== "string") return null;
  const m = tag.match(/^comms:([a-zA-Z]+):(.+)$/);
  if (!m || !COMMS_TYPES.includes(m[1])) return null;
  return { type: m[1], eventId: m[2] };
}

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
export function normalizeCommsConfig(raw, defaults = DEFAULT_COMMS_CONFIG) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = defaults;
  const su = r.signup && typeof r.signup === "object" ? r.signup : {};
  const rm = r.reminder && typeof r.reminder === "object" ? r.reminder : {};
  const pe = r.postEvent && typeof r.postEvent === "object" ? r.postEvent : {};
  const wj = r.waitlistJoin && typeof r.waitlistJoin === "object" ? r.waitlistJoin : {};
  const wp = r.waitlistPromote && typeof r.waitlistPromote === "object" ? r.waitlistPromote : {};
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
    waitlistJoin: {
      enabled: bool(wj.enabled, d.waitlistJoin.enabled),
      body: bodyStr(wj.body, d.waitlistJoin.body),
    },
    waitlistPromote: {
      enabled: bool(wp.enabled, d.waitlistPromote.enabled),
      body: bodyStr(wp.body, d.waitlistPromote.body),
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
      .select("comms_config, kind")
      .eq("id", eventId)
      .maybeSingle();
    return normalizeCommsConfig(data?.comms_config, defaultCommsForKind(data?.kind));
  } catch {
    return normalizeCommsConfig(null);
  }
}
