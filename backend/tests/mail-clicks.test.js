// Mail clicks for Sälj: outreach link codes → the prospect's visits. Pure, no database.
import { clickSessions, newLinkCode, summarizeMailClicks } from "../src/lib/mailClicks.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const ev = (session, visitor, at, event_name, props = null, code = null) => ({
  session_id: session, visitor_id: visitor, occurred_at: `2026-10-${at}`, event_name, props,
  source: code ? "mejl" : "direct", device_type: "desktop",
  utm: code ? { utm_source: "mejl", utm_content: code } : null,
});

const prospects = [
  { id: "P-1", company: "Orkla", person: "Martina", linkCode: "abc234", stage: "Emailed" },
  { id: "P-2", company: "Boliden", person: "Daniel", linkCode: "xyz789", stage: "Emailed" },
  { id: "P-3", company: "Holtab", linkCode: "", stage: "Emailed" },
];

const events = [
  // P-1 clicks without the cookie: one visit, nothing after.
  ev("s1", "s1", "27T09:00:00Z", "page_view", { page: "landing" }, "abc234"),
  ev("s1", "s1", "27T09:00:10Z", "section_view", { page: "/", section: "hero", order: 1 }, "abc234"),
  ev("s1", "s1", "27T09:01:00Z", "engagement", { page: "/", active: 40, depth: 60, s: { hero: 40 } }, "abc234"),
  // P-2 clicks, says yes to the cookie, then comes back a day later without the link.
  ev("s2", "s2", "27T10:00:00Z", "page_view", { page: "landing" }, "xyz789"),
  ev("s2", "v2", "27T10:00:30Z", "consent", { on: true }, "xyz789"),
  ev("s2", "v2", "27T10:01:00Z", "engagement", { page: "/", active: 20, depth: 30, s: {} }, "xyz789"),
  ev("s3", "v2", "28T08:00:00Z", "page_view", { page: "case_stiga" }),
  ev("s3", "v2", "28T08:02:00Z", "engagement", { page: "/work/stiga", active: 90, depth: 80, s: {} }),
  ev("s3", "v2", "28T08:02:30Z", "section_view", { page: "/", section: "cases", order: 3 }),
  ev("s3", "v2", "28T08:03:00Z", "section_view", { page: "/", section: "offer", order: 5 }),
  // Somebody else, a code nobody has.
  ev("s4", "s4", "27T11:00:00Z", "page_view", { page: "landing" }, "nope00"),
];

const cs = clickSessions(events.filter((e) => e.utm));
assert(cs.sessions.join() === "s1,s2,s4" && cs.visitors.join() === "v2", "sessions to load: the clicked ones + the consented visitor");

const r = summarizeMailClicks({ prospects, events });
assert(r.length === 2, "two prospects clicked; an unknown code is ignored");
const [boliden, orkla] = r;
assert(boliden.id === "P-2" && orkla.id === "P-1", "latest visit first");
assert(boliden.clicks === 1 && boliden.visits.length === 2 && boliden.returned && boliden.cookie, "the cookie ties the return visit to Boliden");
assert(boliden.active === 110 && boliden.offer && boliden.pages.includes("/work/stiga"), "time, offer and pages add up across visits");
assert(orkla.clicks === 1 && !orkla.returned && !orkla.cookie && orkla.active === 40, "no cookie: just the click visit");

assert(!boliden.glanceOnly && orkla.glanceOnly, "one page, one section, no clicks = only a glance (or a mail filter)");

const taken = new Set(["aaaaaa"]);
let n = 0;
const code = newLinkCode(taken, () => (n++ < 6 ? 0 : 0.5));
assert(code !== "aaaaaa" && /^[a-z2-9]{6}$/.test(code), "new codes skip taken ones and avoid 0/o/1/l");

if (failures) { console.error(`${failures} failed`); process.exit(1); }
