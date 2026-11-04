// The free tool's outreach (/admin/free-tool): sheet + clicks + accounts joined. Pure.
import { summarizeFreeTool } from "../src/lib/freeToolOutreach.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const P = (id, email, extra = {}) => ({ id, company: id, person: "", email, track: "Event", stage: "Not contacted", source: "Event: Väntelista", dateSent: null, ...extra });
const prospects = [
  P("P-1", "anna@gmail.com", { dateSent: "2026-11-04", stage: "Emailed" }),
  P("P-2", "info@klubb.se", { dateSent: "2026-11-04", stage: "Replied", source: "Event: Kulturrådet 2024" }),
  P("P-3", "x@gmail.com", { dateSent: "2026-11-05", stage: "Not a fit" }),
  P("P-4", "never@mailed.se"),
  P("P-5", "", {}),
  { ...P("P-9", "sales@brand.se", { dateSent: "2026-11-04" }), track: "Marketing" },
];
const clicks = [
  { id: "P-1", first: "2026-11-04T10:00:00Z", last: "2026-11-04T10:00:00Z", visits: [{}], active: 40, glanceOnly: false, pages: ["/eventverktyg"] },
  { id: "P-3", first: "2026-11-05T08:00:00Z", last: "2026-11-05T08:00:00Z", visits: [{}], active: 0, glanceOnly: true, pages: ["/eventverktyg"] },
  { id: "P-9", first: "2026-11-04T10:00:00Z", last: "2026-11-04T10:00:00Z", visits: [{}], active: 9, glanceOnly: false, pages: ["/"] },
];
const accounts = [
  { id: "a1", email: "Anna@gmail.com", createdAt: "2026-11-04T11:00:00Z", brands: [{ name: "Anna" }], eventList: [{ createdAt: "2026-11-04T12:00:00Z", published: true, signups: 14 }, { createdAt: "2026-11-05T12:00:00Z", published: false, signups: 0 }] },
  { id: "a2", email: "ordf@klubb.se", createdAt: "2026-11-05T09:00:00Z", brands: [], eventList: [] },
  { id: "a3", email: "someone@gmail.com", createdAt: "2026-11-05T09:00:00Z", brands: [], eventList: [{ createdAt: "2026-11-05T10:00:00Z", published: false, signups: 0 }] },
  { id: "a4", email: "old@gmail.com", createdAt: "2026-10-01T09:00:00Z", brands: [], eventList: [{ createdAt: "2026-10-02T10:00:00Z", published: true, signups: 50 }] },
  { id: "a5", email: "x@gmail.com", createdAt: "2026-06-01T09:00:00Z", brands: [], eventList: [{ createdAt: "2026-06-02T10:00:00Z", published: true, signups: 40 }, { createdAt: "2026-11-05T10:00:00Z", published: true, signups: 3 }] },
];
const out = summarizeFreeTool({ prospects, clicks, accounts, today: "2026-11-05" });

assert(out.totals.listed === 5 && out.totals.withEmail === 4, "counts only Event rows; with email = has an address");
assert(out.totals.contacted === 3 && out.totals.today === 1, "contacted = Date sent; today's sends");
assert(out.totals.clicked === 1, "a click that was only a mail filter's glance doesn't count");
assert(out.totals.answered === 1 && out.totals.no === 1, "answers and no-thanks from the stage");
assert(out.totals.accounts === 2, "new accounts: by email (any case) and by the prospect's own domain");
assert(out.totals.hadAccount === 1, "an account from before the mail is 'had one already', not a new one");
assert(out.totals.withEvent === 2 && out.totals.published === 2 && out.totals.signups === 17, "events since the mail only, old and new accounts alike");
assert(!out.rows.some((r) => r.id === "P-4" || r.id === "P-9"), "rows: only the mailed or clicked of the Event list");
assert(out.rows.find((r) => r.id === "P-3").account.before === true && out.rows.find((r) => r.id === "P-3").account.events === 1, "an old account: its events since the mail");
assert(out.rows.find((r) => r.id === "P-2").account?.createdAt.startsWith("2026-11-05"), "a shared inbox prospect gets the colleague's account on the same domain");
assert(out.series.length === 2 && out.series[0].sent === 2 && out.series[0].clicked === 1 && out.series[0].accounts === 1, "series by day from the first mail");
assert(out.elsewhere.length === 1 && out.elsewhere[0].email === "someone@gmail.com", "accounts made since the first mail but not from the list");
assert(out.lists.find((l) => l.list === "Väntelista").accounts === 1, "per list: accounts");
const none = summarizeFreeTool({ prospects: [P("P-1", "a@b.se")], today: "2026-11-05" });
assert(none.totals.contacted === 0 && none.since === null && none.elsewhere.length === 0, "before the first mail: nothing to show, no error");

if (failures) { console.error(`\n${failures} free-tool outreach test(s) failed`); process.exit(1); }
console.log("\nall free-tool outreach tests passed");
