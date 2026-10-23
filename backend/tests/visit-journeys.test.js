// Visits → journeys for Statistik. Pure, no database.
import { pagePath, summarizeVisits, visitTimeline } from "../src/lib/visitJourneys.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

let n = 0;
const ev = (session, minute, event_name, props = {}, extra = {}) => ({
  session_id: session,
  event_name,
  props,
  occurred_at: `2026-10-23T10:${String(minute).padStart(2, "0")}:${String(n++ % 60).padStart(2, "0")}.000Z`,
  source: "direct",
  device_type: "mobile",
  ...extra,
});

// A: reads the front page, opens a case, comes back, opens the form, sends.
// B: bounces after the first screen. C: a fragment with no page view.
const events = [
  ev("A", 1, "page_view", { page: "landing" }, { source: "mejl" }),
  ev("A", 1, "section_view", { page: "/", section: "hero", order: 1 }),
  ev("A", 1, "section_view", { page: "/", section: "words", order: 2 }),
  ev("A", 2, "section_view", { page: "/", section: "stories", order: 3 }),
  ev("A", 2, "engagement", { page: "/", active: 30, depth: 45, s: { hero: 5, words: 10, stories: 15 } }),
  ev("A", 3, "click", { label: "STIGA", href: "/work/stiga", section: "stories", page: "/" }),
  ev("A", 3, "page_view", { page: "case_stiga" }),
  ev("A", 3, "section_view", { page: "/work/stiga", section: "case_hero", order: 1 }),
  ev("A", 4, "engagement", { page: "/work/stiga", active: 40, depth: 80, s: { case_hero: 40 } }),
  ev("A", 5, "section_view", { page: "/", section: "offer", order: 5 }),
  ev("A", 5, "engagement", { page: "/", active: 20, depth: 90, s: { offer: 20 } }),
  ev("A", 6, "request_open", { source: "offer" }),
  ev("A", 6, "request_field", { field: "name" }),
  ev("A", 6, "request_field", { field: "email" }),
  ev("A", 7, "request_sent", { source: "offer" }),
  ev("B", 8, "page_view", { page: "landing" }),
  ev("B", 8, "section_view", { page: "/", section: "hero", order: 1 }),
  ev("B", 8, "engagement", { page: "/", active: 4, depth: 20, s: { hero: 4 } }),
  ev("C", 9, "engagement", { page: "/", active: 9, depth: 50, s: { offer: 9 } }),
];
const requests = [{ id: "r1", name: "Anna", company: "X", meta: { visitId: "A" } }];

assert(pagePath("landing") === "/" && pagePath("case_bkm") === "/work/bkm", "page_view names map to paths");

const { visits, funnel, pages } = summarizeVisits({ events, requests });
const a = visits.find((v) => v.id === "A");
const b = visits.find((v) => v.id === "B");
assert(visits.length === 2 && !visits.some((v) => v.id === "C"), "a session without a page view is not a visit");
assert(visits[0].id === "B", "newest visit first");
assert(a.source === "mejl" && a.device === "mobile", "source and device from the first event");
assert(JSON.stringify(a.pages) === JSON.stringify(["/", "/work/stiga"]), "pages in the order read");
assert(a.active === 90, "active seconds summed across pages and deltas");
assert(a.depth === 90, "depth = deepest point on the front page");
assert(a.read && a.offer && a.opened && a.started && a.sent, "A went all the way");
assert(a.request?.name === "Anna", "the sent request is linked by visitId");
assert(!b.read && !b.offer && !b.opened, "B left after the first screen");
const home = a.reading.find((r) => r.page === "/");
assert(home.sections.find((s) => s.section === "stories").secs === 15 && home.sections.find((s) => s.section === "offer").secs === 20, "seconds per section summed");

const f = Object.fromEntries(funnel.map((x) => [x.key, x.count]));
assert(f.visits === 2 && f.read === 1 && f.offer === 1 && f.opened === 1 && f.started === 1 && f.sent === 1, "funnel counts");

const front = pages.find((p) => p.page === "/");
assert(front.visits === 2, "front page: two visits");
const hero = front.sections.find((s) => s.section === "hero");
assert(hero.reached === 2 && hero.readers === 2 && hero.medianSecs === 5 && hero.order === 1, "hero reached by both, median of 5 s and 4 s rounds to 5");
assert(front.sections.map((s) => s.section).join() === "hero,words,stories,offer", "sections in page order");
assert(pages.find((p) => p.page === "/work/stiga").sections[0].medianSecs === 40, "case page sections too");

const t = visitTimeline({ events: events.filter((e) => e.session_id === "A"), request: requests[0] });
const kinds = t.steps.map((s) => s.kind);
assert(kinds.filter((k) => k === "fields").length === 1 && t.steps.find((s) => s.kind === "fields").fields.join() === "name,email", "field touches merge into one step");
assert(kinds.includes("click") && kinds.includes("open") && kinds[kinds.length - 1] === "sent", "timeline: click, open, sent last");
assert(!kinds.includes("engagement"), "reading time lives in the summary, not as steps");
assert(t.summary?.request?.name === "Anna" && t.summary.active === 90, "timeline carries the summary");

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall visit-journeys tests passed");
