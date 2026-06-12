// Pure-logic tests for the /t/batch validation layer (analytics spine).
import {
  validateBatch,
  deriveSource,
  isBotUserAgent,
} from "../src/analytics/eventRegistry.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const NOW = new Date("2026-06-12T12:00:00Z").getTime();
const UUID = "a3bb189e-8bf9-4888-9912-ace4e6543002";
const UUID2 = "b4cc289e-8bf9-4888-9912-ace4e6543003";

function batch(over = {}) {
  return {
    visitorId: "v-123",
    sessionId: "s-456",
    deviceType: "mobile",
    referrer: "https://www.instagram.com/p/abc",
    page: "landing",
    events: [{ id: UUID, name: "page_view", props: { page: "landing" }, ts: NOW - 1000 }],
    ...over,
  };
}

console.log("🧪 a valid batch normalizes into insertable rows");
{
  const { rows, dropped, error } = validateBatch(batch(), { now: NOW });
  assert(!error, "no envelope error");
  assert(rows.length === 1 && dropped === 0, "one row, none dropped");
  const r = rows[0];
  assert(r.client_event_id === UUID, "client_event_id preserved");
  assert(r.event_name === "page_view" && r.page === "landing", "name+page kept");
  assert(r.device_type === "mobile", "device kept");
  assert(r.occurred_at === new Date(NOW - 1000).toISOString(), "client timestamp kept");
}

console.log("🧪 envelope validation rejects junk");
{
  assert(validateBatch({}).error, "missing visitorId rejected");
  assert(validateBatch({ visitorId: "v", events: [] }).error, "empty events rejected");
  assert(
    validateBatch(batch({ events: Array.from({ length: 51 }, () => ({ id: UUID, name: "page_view", ts: NOW })) })).error,
    "oversized batch rejected"
  );
}

console.log("🧪 unknown events and bad ids drop without killing the batch");
{
  const { rows, dropped } = validateBatch(
    batch({
      events: [
        { id: UUID, name: "page_view", ts: NOW },
        { id: UUID2, name: "totally_made_up", ts: NOW },
        { id: "not-a-uuid", name: "cta_click", ts: NOW },
      ],
    }),
    { now: NOW }
  );
  assert(rows.length === 1 && dropped === 2, "good row kept, 2 junk dropped");
}

console.log("🧪 clock garbage clamps to receive time");
{
  const { rows } = validateBatch(
    batch({ events: [{ id: UUID, name: "page_view", ts: NOW - 3 * 24 * 3600 * 1000 }] }),
    { now: NOW }
  );
  assert(rows[0].occurred_at === new Date(NOW).toISOString(), "3-day-old timestamp clamped");
}

console.log("🧪 oversized props are stripped, valid props kept");
{
  const big = { blob: "x".repeat(3000) };
  const { rows } = validateBatch(
    batch({
      events: [
        { id: UUID, name: "section_view", props: { section: "hero", order: 1 }, ts: NOW },
        { id: UUID2, name: "section_view", props: big, ts: NOW },
      ],
    }),
    { now: NOW }
  );
  assert(rows[0].props.section === "hero", "small props kept");
  assert(rows[1].props === null, "oversized props stripped");
}

console.log("🧪 identified room events carry user_id/event_id; junk ids stay null");
{
  const EV_ID = "c5dd389e-8bf9-4888-9912-ace4e6543004";
  const { rows } = validateBatch(
    batch({
      events: [
        { id: UUID, name: "room_view", props: { role: "guest_pullup" }, ts: NOW,
          page: "room", eventId: EV_ID, userId: UUID2 },
        { id: UUID2, name: "room_view", props: { role: "host" }, ts: NOW,
          page: "not_a_page", eventId: "junk", userId: "junk" },
      ],
    }),
    { now: NOW }
  );
  assert(rows[0].page === "room" && rows[0].event_id === EV_ID && rows[0].user_id === UUID2,
    "room event stamped with page/event/user");
  assert(rows[1].page === "landing" && rows[1].event_id === null && rows[1].user_id === null,
    "junk page falls back to envelope, junk ids null");
}

console.log("🧪 deriveSource: utm beats referrer, referrer maps to channel");
{
  assert(deriveSource("https://www.instagram.com/x", null) === "instagram", "instagram referrer");
  assert(deriveSource("https://l.facebook.com/x", null) === "facebook", "facebook referrer");
  assert(deriveSource(null, null) === "direct", "no referrer = direct");
  assert(deriveSource("https://instagram.com", { utm_source: "Newsletter" }) === "newsletter", "utm_source wins, lowercased");
  assert(deriveSource("garbage-url", null) === "other", "unparseable referrer = other");
}

console.log("🧪 bot UA filter");
{
  assert(isBotUserAgent("facebookexternalhit/1.1"), "fb crawler caught");
  assert(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)"), "googlebot caught");
  assert(!isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "real iPhone passes");
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nAll analytics-batch tests passed");
