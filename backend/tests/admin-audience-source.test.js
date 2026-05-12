import { applyHostFilters, dedupHostsWinning } from "../src/services/adminAudienceFilters.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const FIXED_NOW = new Date("2026-05-12T00:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function host(over = {}) {
  return {
    id: "h1", email: "a@x.com", name: "A",
    marketing_consent: true,
    last_login_at: null,
    created_at: new Date(FIXED_NOW - 60 * DAY).toISOString(),
    event_count: 0,
    lead_status: null,
    ...over,
  };
}

console.log("🧪 hostAccountState=never keeps only hosts who never logged in");
{
  const result = applyHostFilters(
    [host({ last_login_at: null }), host({ id: "h2", last_login_at: new Date(FIXED_NOW - DAY).toISOString() })],
    { hostAccountState: "never", now: FIXED_NOW },
  );
  assert(result.length === 1 && result[0].id === "h1", "only h1 retained");
}

console.log("🧪 hostAccountState=inactive30d keeps only hosts inactive >=30 days");
{
  const result = applyHostFilters(
    [
      host({ id: "fresh", last_login_at: new Date(FIXED_NOW - 5 * DAY).toISOString() }),
      host({ id: "stale", last_login_at: new Date(FIXED_NOW - 45 * DAY).toISOString() }),
      host({ id: "none",  last_login_at: null }),
    ],
    { hostAccountState: "inactive30d", now: FIXED_NOW },
  );
  assert(result.length === 1 && result[0].id === "stale", "only stale retained");
}

console.log("🧪 hostEventCount=exactly0 keeps only hosts with zero events");
{
  const result = applyHostFilters(
    [host({ event_count: 0 }), host({ id: "h2", event_count: 2 })],
    { hostEventCount: "exactly0", now: FIXED_NOW },
  );
  assert(result.length === 1 && result[0].event_count === 0, "only zero-event host");
}

console.log("🧪 hostEventCount=3 keeps only hosts with >=3 events");
{
  const result = applyHostFilters(
    [host({ event_count: 2 }), host({ id: "h2", event_count: 3 }), host({ id: "h3", event_count: 7 })],
    { hostEventCount: 3, now: FIXED_NOW },
  );
  assert(result.length === 2, "2+ retained");
  assert(result.every((r) => r.event_count >= 3), "all >=3");
}

console.log("🧪 hostAccountAge=lte30d keeps only fresh accounts");
{
  const result = applyHostFilters(
    [
      host({ id: "fresh", created_at: new Date(FIXED_NOW - 10 * DAY).toISOString() }),
      host({ id: "old",   created_at: new Date(FIXED_NOW - 100 * DAY).toISOString() }),
    ],
    { hostAccountAge: "lte30d", now: FIXED_NOW },
  );
  assert(result.length === 1 && result[0].id === "fresh", "only fresh retained");
}

console.log("🧪 broadcast mode drops marketing_consent=false; internal keeps them");
{
  const candidates = [
    host({ id: "yes", marketing_consent: true }),
    host({ id: "no",  marketing_consent: false }),
  ];
  const broadcast = applyHostFilters(candidates, { sendMode: "broadcast", now: FIXED_NOW });
  const internal  = applyHostFilters(candidates, { sendMode: "internal",  now: FIXED_NOW });
  assert(broadcast.length === 1 && broadcast[0].id === "yes", "broadcast drops no-consent");
  assert(internal.length === 2, "internal keeps both");
}

console.log("🧪 hostEventTags filters hosts by tags of events they created");
{
  const result = applyHostFilters(
    [
      host({ id: "dinner",   event_tags: ["dinner", "supper-club"] }),
      host({ id: "art",      event_tags: ["art", "exhibition"] }),
      host({ id: "untagged", event_tags: [] }),
    ],
    { hostEventTags: ["dinner"], now: FIXED_NOW },
  );
  assert(result.length === 1 && result[0].id === "dinner", "only dinner host retained");
}

console.log("🧪 hostEventTags is case-insensitive");
{
  const result = applyHostFilters(
    [host({ id: "h", event_tags: ["Dinner"] })],
    { hostEventTags: ["DINNER"], now: FIXED_NOW },
  );
  assert(result.length === 1, "case-insensitive match");
}

console.log("🧪 dedupHostsWinning: host record beats contact record on the same email");
{
  const hosts    = [{ id: "h1", email: "x@x.com", name: "From Host"    }];
  const contacts = [{ id: "c1", email: "x@x.com", name: "From Contact" }];
  const out = dedupHostsWinning(hosts, contacts);
  assert(out.length === 1, "one row");
  assert(out[0].name === "From Host", "host name wins");
  assert(out[0]._source === "host", "_source tagged host");
}

console.log("🧪 dedupHostsWinning: unique contacts pass through");
{
  const hosts    = [{ id: "h1", email: "a@x.com", name: "A" }];
  const contacts = [{ id: "c1", email: "b@x.com", name: "B" }];
  const out = dedupHostsWinning(hosts, contacts);
  assert(out.length === 2, "both kept");
  const tagged = out.find((r) => r.email === "b@x.com");
  assert(tagged && tagged._source === "contact", "contact tagged");
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed.");
