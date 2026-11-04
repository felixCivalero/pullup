// The owner's Översikt: the lists and the traffic as one picture, people in motion.
import { sourceGroup, summarizeOverview } from "../src/lib/overview.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const since = "2026-10-06";
const prospects = [
  // Agency list: mailed, clicked, tested their site (blocked), read on.
  { id: "P-1", company: "Gatuverket", person: "Bianca", email: "hej@gatuverket.com", track: "Marketing", stage: "Emailed", dateSent: "2026-11-01" },
  // Agency list: mailed, nothing since.
  { id: "P-2", company: "Tyst AB", email: "info@tyst.se", track: "Marketing", stage: "Emailed", dateSent: "2026-11-02" },
  // Agency list: booked a meeting.
  { id: "P-3", company: "Möte AB", email: "vd@mote.se", track: "Marketing", stage: "Meeting booked", dateSent: "2026-10-20", lastContact: "2026-10-28" },
  // Event list: clicked into the agency landing (no /eventverktyg), made an account.
  { id: "E-1", company: "Klubb Död", email: "boka@klubbdod.se", track: "Event", stage: "Emailed", dateSent: "2026-11-03" },
  // Event list: only a mail filter opened the link.
  { id: "E-2", company: "Filter", email: "a@filter.se", track: "Event", stage: "Emailed", dateSent: "2026-11-03" },
  // Mailed long before the period: not counted.
  { id: "E-3", company: "Gammal", email: "a@gammal.se", track: "Event", stage: "Emailed", dateSent: "2026-09-01" },
];
const clicks = [
  { id: "P-1", first: "2026-11-01T10:00:00Z", visits: [
    { id: "s1", start: "2026-11-01T10:00:00Z", read: true, pages: ["/"], checks: [{ value: "gatuverket.com", result: "blocked" }], glance: false },
  ] },
  { id: "E-1", first: "2026-11-03T09:00:00Z", visits: [
    { id: "s2", start: "2026-11-03T09:00:00Z", read: true, pages: ["/", "/work/bkm"], checks: [], glance: false },
  ] },
  { id: "E-2", first: "2026-11-03T08:00:00Z", visits: [{ id: "s3", start: "2026-11-03T08:00:00Z", read: false, pages: ["/"], checks: [], glance: true }] },
];
const accounts = [
  { id: "a1", email: "boka@klubbdod.se", createdAt: "2026-11-03T12:00:00Z", events: 1, published: 0, eventList: [{ createdAt: "2026-11-03T13:00:00Z", published: false }], brands: [{ name: "Klubb Död" }] },
  { id: "a2", email: "someone@gmail.com", createdAt: "2026-11-02T12:00:00Z", events: 0, published: 0, eventList: [], brands: [{ name: "Nytt Event" }] },
  { id: "a3", email: "old@gmail.com", createdAt: "2026-08-01T12:00:00Z", events: 3, published: 3, eventList: [], brands: [] },
];
const visits = [
  { id: "s1", source: "mejl", read: true, pages: ["/"], inputs: [{ form: "site_check", value: "gatuverket.com", result: "blocked" }] },
  { id: "s2", source: "mejl", read: true, pages: ["/"], inputs: [] },
  { id: "v1", source: "google", read: true, pages: ["/", "/eventverktyg"], inputs: [] },
  { id: "v2", source: "ig", read: false, pages: ["/"], inputs: [{ form: "site_check", value: "brand.se", result: 72 }] },
  { id: "v3", source: "direct", read: true, pages: ["/"], inputs: [], sent: true },
  { id: "v4", source: "instagram", read: true, pages: ["/eventverktyg"], inputs: [] },
];
const checks = [
  { domain: "gatuverket.com", outcome: "blocked", source: "home_hero", visit_id: "s1", created_at: "2026-11-01T10:01:00Z" },
  { domain: "brand.se", outcome: "scored", score: 60, source: "home_hero", visit_id: "v2", created_at: "2026-11-02T10:00:00Z" },
  { domain: "brand.se", outcome: "scored", score: 72, source: "home_hero", visit_id: "v2", created_at: "2026-11-02T11:00:00Z" },
  { domain: "pullup.se", outcome: "scored", score: 100, source: "deploy-check", visit_id: null, created_at: "2026-11-04T10:00:00Z" },
  { domain: "mine.se", outcome: "scored", score: 80, source: "owner", visit_id: null, created_at: "2026-11-04T10:00:00Z" },
  { domain: null, outcome: "invalid", source: "home", visit_id: null, created_at: "2026-11-04T10:00:00Z" },
];
const requests = [{ id: "r1", created_at: "2026-11-04T08:00:00Z", name: "Anna", company: "Anna Design", email: "anna@design.se", visit_id: "v3" }];

const o = summarizeOverview({ prospects, clicks, accounts, visits, checks, requests, since });
const byra = o.flows.find((f) => f.key === "byra");
const event = o.flows.find((f) => f.key === "event");

assert(byra.mailed === 3 && byra.visited === 1 && byra.tested === 1 && byra.meetings === 1 && byra.answered === 1, "flows: the agency list counts mailed, visited, tested, met");
assert(event.mailed === 2 && event.visited === 1 && event.accounts === 1 && event.tool === 0, "flows: the event list — a mail filter isn't a visit, the account counts, the agency landing isn't the tool");
assert(event.read === 1, "flows: an event-list prospect who read the agency site shows as read (the cross-over)");

assert(!o.sources.some((s) => s.key === "mail"), "sources: a prospect's mail visit isn't counted again as traffic");
const social = o.sources.find((s) => s.key === "social");
assert(social.visits === 2 && social.tested === 1 && social.tool === 1, "sources: ig and instagram are one social row, with its site test and tool visit");
assert(o.sources.find((s) => s.key === "search").tool === 1, "sources: a Google visit to /eventverktyg counts for the tool");
assert(o.other.visits === 4 && o.other.requests === 1, "other: totals of the traffic rows");
assert(o.other.accounts === 1, "other: an account made in the period by nobody on a list (an older one isn't)");

const names = o.people.map((p) => p.name);
assert(names.includes("Gatuverket") && names.includes("Klubb Död") && names.includes("Möte AB"), "people: who moved is listed");
assert(!names.includes("Tyst AB") && !names.includes("Filter") && !names.includes("Gammal"), "people: mailed-only, filter-only and old ones aren't");
assert(o.people.find((p) => p.name === "Gatuverket").hint.includes("stänger ute"), "people: a blocked site gets its hint");
assert(o.people.find((p) => p.name === "Gatuverket").check === "stänger ute maskiner", "people: the site check result in words");
assert(o.people.find((p) => p.name === "Klubb Död").hint === "Har ett utkast: hjälp till att publicera", "people: an account with an unpublished event is helped to publish");
assert(o.people.find((p) => p.name === "Möte AB").hint === null, "people: a booked meeting needs no hint");
assert(o.people.find((p) => p.kind === "lead").hint === "Svara på förfrågan", "people: a request off the site is a lead to answer");
const brand = o.people.filter((p) => p.name === "brand.se");
assert(brand.length === 1 && brand[0].check === "72 av 100", "people: one row per tested domain, the latest result");
assert(!names.includes("pullup.se") && !names.includes("gatuverket.com") && !names.includes("mine.se"), "people: deploy checks, Felix's own and a prospect's own check aren't extra rows");
assert(o.people.find((p) => p.kind === "account").name === "Nytt Event", "people: an account from elsewhere, by its brand");
assert(o.people.every((p, i, a) => i === 0 || String(a[i - 1].last) >= String(p.last)), "people: newest first");

for (const [s, g] of [["google", "search"], ["ig", "social"], ["instagram", "social"], ["facebook", "social"], ["direct", "direct"], ["mejl", "mail"], ["pullup", "pullup"], ["chatgpt.com", "ai"], ["something.se", "other"]]) {
  assert(sourceGroup(s) === g, `sourceGroup: ${s} → ${g}`);
}

if (failures) process.exit(1);
