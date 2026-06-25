// Unit tests for the PURE per-event comms layer — normalization (clamp/sanitize/
// fill-from-defaults), token resolution (text + HTML), and the send-time
// decisions both schedulers rely on. No DB.

import {
  DEFAULT_COMMS_CONFIG,
  normalizeCommsConfig,
  resolveCommsText,
  resolveCommsHtml,
  bodyNeedsRoomKey,
  reminderDue,
  postEventDue,
  reminderSendAt,
  postEventSendAt,
  isDue,
  effectiveEndMs,
  SEND_GRACE_MS,
  REMINDER_MAX_HOURS,
  DEFAULT_EVENT_DURATION_MS,
} from "../src/services/eventComms.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const HOUR = 3600000;

// ── normalize: empty/garbage → full valid defaults ──
console.log("🧪 normalizeCommsConfig: empty → defaults");
{
  const c = normalizeCommsConfig(null);
  assert(c.reminder.hoursBefore === 12, `reminder default 12h (got ${c.reminder.hoursBefore})`);
  assert(c.reminder.enabled === true, "reminder default enabled");
  assert(c.postEvent.enabled === true, "postEvent default enabled");
  assert(c.signup.body.includes("{event name}"), "signup default body has {event name} token");
  assert(c.postEvent.body.includes("{upload link}"), "postEvent default body has {upload link} token");
  const g = normalizeCommsConfig("nonsense");
  assert(JSON.stringify(g) === JSON.stringify(DEFAULT_COMMS_CONFIG), "garbage string → exact defaults");
}

// ── normalize: clamps + coerces body ──
console.log("🧪 normalizeCommsConfig: clamp + coerce");
{
  const c = normalizeCommsConfig({
    reminder: { hoursBefore: 9999, body: 123, enabled: false },
    postEvent: { hoursAfter: -50, body: "thanks", uploadLink: false },
    signup: { body: "x".repeat(5000) },
  });
  assert(c.reminder.hoursBefore === REMINDER_MAX_HOURS, `hoursBefore clamped to max (got ${c.reminder.hoursBefore})`);
  assert(c.reminder.body === DEFAULT_COMMS_CONFIG.reminder.body, "non-string body → default body");
  assert(c.reminder.enabled === false, "reminder enabled=false respected");
  assert(c.postEvent.hoursAfter === 0, `hoursAfter clamped to min 0 (got ${c.postEvent.hoursAfter})`);
  assert(c.postEvent.body === "thanks", "postEvent custom body respected");
  assert(c.signup.body.length === 2000, `signup body capped at 2000 (got ${c.signup.body.length})`);
}

// ── token resolution: text ──
console.log("🧪 resolveCommsText");
{
  const ctx = { eventName: "Photowalk 05", time: "Sat 14:00", location: "Söder", coordinates: "59.31, 18.07", roomUrl: "https://x/room", uploadUrl: "https://x/up" };
  const t = resolveCommsText("Welcome to {event name}!\n{location} {time}\n{room link}", ctx);
  assert(t.includes("Photowalk 05") && t.includes("Söder") && t.includes("Sat 14:00") && t.includes("https://x/room"), "text tokens resolved");
  assert(!/\{.*\}/.test(t), "no unresolved tokens left in text");
  // missing values → empty, collapse extra blank lines
  const t2 = resolveCommsText("{event name}\n\n\n{coordinates}", { eventName: "E" });
  assert(t2 === "E", `missing coords → trimmed empty (got ${JSON.stringify(t2)})`);
}

// ── token resolution: html (escaping + links) ──
console.log("🧪 resolveCommsHtml");
{
  const ctx = { eventName: "Tom & Jo", location: "Bar", locationUrl: "https://maps/x", roomUrl: "https://x/room" };
  const h = resolveCommsHtml("Hi {event name}\n{location}\n{room link}", ctx);
  assert(h.includes("Tom &amp; Jo"), "ampersand in event name escaped");
  assert(h.includes('href="https://maps/x"') && h.includes(">Bar<"), "location rendered as maps link");
  assert(h.includes('href="https://x/room"') && h.includes("Open the room"), "room link rendered as anchor");
  assert(h.includes("<br>"), "newlines → <br>");
  // XSS in prose is escaped
  const h2 = resolveCommsHtml("<script>alert(1)</script>", {});
  assert(!h2.includes("<script>") && h2.includes("&lt;script&gt;"), "prose HTML escaped");
}

// ── bodyNeedsRoomKey ──
console.log("🧪 bodyNeedsRoomKey");
{
  assert(bodyNeedsRoomKey("see {room link}") === true, "detects room link");
  assert(bodyNeedsRoomKey("upload {upload link}") === true, "detects upload link");
  assert(bodyNeedsRoomKey("just {time}") === false, "no link tokens → false");
}

// ── reminderDue ──
console.log("🧪 reminderDue");
{
  const start = 1_000_000_000_000;
  const hoursBefore = 12;
  const sendAt = reminderSendAt(start, hoursBefore);
  assert(sendAt === start - 12 * HOUR, "reminderSendAt = start - 12h");
  assert(reminderDue({ now: sendAt, startMs: start, hoursBefore, enabled: true }), "due at crossing");
  assert(reminderDue({ now: sendAt + 10 * 60000, startMs: start, hoursBefore, enabled: true }), "due 10min after crossing");
  assert(!reminderDue({ now: sendAt - 60000, startMs: start, hoursBefore, enabled: true }), "not due before crossing");
  assert(!reminderDue({ now: sendAt + SEND_GRACE_MS + 1, startMs: start, hoursBefore, enabled: true }), "not due past grace");
  assert(!reminderDue({ now: sendAt, startMs: start, hoursBefore, enabled: false }), "disabled → not due");
  assert(!reminderDue({ now: start + 1, startMs: start, hoursBefore: 0.0001, enabled: true }), "not due after start");
}

// ── postEventDue ──
console.log("🧪 postEventDue");
{
  const end = 2_000_000_000_000;
  const hoursAfter = 16;
  const sendAt = postEventSendAt(end, hoursAfter);
  assert(sendAt === end + 16 * HOUR, "postEventSendAt = end + 16h");
  assert(postEventDue({ now: sendAt, endMs: end, hoursAfter, enabled: true }), "due at crossing");
  assert(postEventDue({ now: sendAt + 30 * 60000, endMs: end, hoursAfter, enabled: true }), "due 30min after");
  assert(!postEventDue({ now: sendAt - 1, endMs: end, hoursAfter, enabled: true }), "not due before crossing");
  assert(!postEventDue({ now: sendAt + SEND_GRACE_MS + 1, endMs: end, hoursAfter, enabled: true }), "no historical backfill");
  assert(!postEventDue({ now: sendAt, endMs: end, hoursAfter, enabled: false }), "disabled → not due");
}

// ── isDue ──
console.log("🧪 isDue");
{
  assert(isDue(100, 100, 50), "due at exact moment");
  assert(!isDue(99, 100, 50), "not due before");
  assert(!isDue(151, 100, 50), "not due past grace");
  assert(!isDue(100, NaN, 50), "NaN sendAt → not due");
}

// ── effectiveEndMs ──
console.log("🧪 effectiveEndMs");
{
  const start = "2026-07-01T19:00:00Z";
  const end = "2026-07-01T23:00:00Z";
  assert(effectiveEndMs({ ends_at: end }) === new Date(end).getTime(), "explicit ends_at used");
  assert(effectiveEndMs({ starts_at: start }) === new Date(start).getTime() + DEFAULT_EVENT_DURATION_MS, "fallback start + duration");
  assert(effectiveEndMs({}) === null, "no dates → null");
  assert(effectiveEndMs({ endsAt: end }) === new Date(end).getTime(), "camelCase endsAt used");
}

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
else console.log("\nAll event-comms assertions passed");
