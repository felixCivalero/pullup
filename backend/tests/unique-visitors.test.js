// Unique visitors (opt-in stats cookie) for Statistik. Pure, no database.
import { uniqueVisitors } from "../src/lib/uniqueVisitors.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const dayKey = (iso) => iso.slice(0, 10);
const days = ["2026-10-26", "2026-10-27", "2026-10-28"];
const row = (visitor, session, day, event_name = "page_view", props = null) => ({
  visitor_id: visitor, session_id: session, occurred_at: `${day}T12:00:00.000Z`, event_name, props,
});

const rows = [
  row("old", "s0", "2026-10-20"),                              // counted before the period
  row("p1", "p1", "2026-10-26"),                               // no consent: never unique
  row("p2", "p2", "2026-10-26", "consent", { on: false }),     // said no
  row("a", "s1", "2026-10-26", "consent", { on: true }),       // said yes
  row("a", "s1", "2026-10-26"),
  row("a", "s2", "2026-10-28"),                                // came back: still one
  row("b", "s3", "2026-10-27"),
  row("old", "s4", "2026-10-28"),                              // returning from before
];

const r = uniqueVisitors(rows, days, dayKey);
assert(r.series.map((d) => d.newUniques).join(",") === "1,1,0", "new uniques per day: a, then b, none on the 28th");
assert(r.series.map((d) => d.uniquesTotal).join(",") === "2,3,3", "running total includes the one from before the period");
assert(r.total === 3 && r.inPeriod === 2, "total 3, of which 2 new in the period");
assert(r.consent.yes === 1 && r.consent.no === 1, "one yes, one no");

const empty = uniqueVisitors([], days, dayKey);
assert(empty.total === 0 && empty.series.every((d) => d.uniquesTotal === 0), "no data: all zero");

if (failures) { console.error(`${failures} failed`); process.exit(1); }
