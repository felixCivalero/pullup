// lib/eventStats.js: sources, conversion over the counted time, returning
// guests, the per-brand roll-up.
import { brandStats, eventStats, sourceOf, totalsFor } from "../src/lib/eventStats.js";

let failures = 0;
const assert = (ok, label) => { console.log(`${ok ? "✅" : "❌"} ${label}`); if (!ok) failures += 1; };

assert(sourceOf({ referrer: "https://l.instagram.com/?u=x" }) === "instagram", "instagram link → instagram");
assert(sourceOf({ referrer: "https://www.google.se/" }) === "google", "google.se → google");
assert(sourceOf({ utm_source: "mejl", referrer: "https://www.google.se/" }) === "mail", "utm wins over referrer");
assert(sourceOf({ referrer: "" }) === "direct" && sourceOf({}) === "direct", "no referrer → direct");
assert(sourceOf({ referrer: "https://chatgpt.com/" }) === "ai", "chatgpt → ai");
assert(sourceOf({ referrer: "https://blogg.example.se/post" }) === "blogg.example.se", "another site → its host");

const ev = { id: "e2", brand_id: "a", starts_at: "2026-12-01T18:00:00Z", ends_at: null, created_at: "2026-11-01T10:00:00Z" };
const old = { id: "e1", brand_id: "a", starts_at: "2026-10-01T18:00:00Z" };
const views = [
  { id: "v1", event_id: "e2", visitor_id: "s1", referrer: "https://l.instagram.com/", created_at: "2026-11-02T10:00:00Z" },
  { id: "v2", event_id: "e2", visitor_id: "s2", referrer: "", created_at: "2026-11-02T11:00:00Z" },
  { id: "v3", event_id: "e2", visitor_id: "s2", referrer: "", created_at: "2026-11-02T11:05:00Z" },
  { id: "v4", event_id: "e2", visitor_id: "s3", referrer: "https://google.com/", created_at: "2026-11-03T09:00:00Z" },
];
const rsvps = [
  { event_id: "e1", person_id: "p1", status: "attending", created_at: "2026-09-20T10:00:00Z" },
  { event_id: "e2", person_id: "p0", status: "attending", created_at: "2026-11-01T12:00:00Z" }, // before visits were counted
  { event_id: "e2", person_id: "p1", status: "attending", visitor_id: "s1", marketing_opt_in: true, created_at: "2026-11-02T10:02:00Z" },
  { event_id: "e2", person_id: "p2", status: "waitlist", visitor_id: "s2", created_at: "2026-11-02T11:06:00Z" },
  { event_id: "e2", person_id: "p3", status: "cancelled", visitor_id: "s3", created_at: "2026-11-03T09:01:00Z" },
];
const st = eventStats({ event: ev, events: [old, ev], rsvps, views, now: Date.parse("2026-11-04T00:00:00Z") });
assert(st.totals.visits === 4 && st.totals.visitors === 3, "4 visits, 3 visitors");
assert(st.totals.signups === 3 && st.totals.attending === 2 && st.totals.waitlist === 1, "cancelled sign-ups don't count");
assert(Math.abs(st.totals.conversion - 2 / 3) < 1e-9, "conversion = sign-ups since counting began / visitors");
assert(st.signupSources.find((s) => s.key === "instagram")?.n === 1 && st.signupSources.find((s) => s.key === "unknown")?.n === 1, "a sign-up takes its visit's source");
assert(st.returning === 1, "p1 came to the brand before → returning");
assert(st.daily.length >= 3 && st.daily.find((d) => d.day === "2026-11-02").visits === 3, "day by day");
assert(totalsFor({ events: [], rsvps, views }).conversion === null, "no visits → no conversion");

const b = brandStats({ brands: [{ id: "m", name: "Nigab" }, { id: "a", name: "Aperol" }], events: [old, ev], rsvps, views, now: Date.parse("2026-11-04T00:00:00Z") });
assert(b.brands.find((x) => x.id === "a").signups === 4 && b.brands.find((x) => x.id === "m").events === 0, "a row per brand");
assert(brandStats({ brands: [{ id: "a", name: "Aperol" }], events: [ev], rsvps, views }).brands.length === 0, "one brand → no brand rows");

if (failures) { console.error(`\n${failures} event-stats test(s) failed`); process.exit(1); }
console.log("\nall event-stats tests passed");
