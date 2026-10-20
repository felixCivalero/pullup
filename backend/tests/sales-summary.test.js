// The sales sheet → /admin/sales summary. Pure, no Google involved.
import { summarizeSales, toDay, readGoal } from "../src/lib/salesSummary.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const HEADER = ["ID", "Priority", "Company", "Person(s)", "Sector", "Location", "What they do", "Why PullUp", "Email", "Email type", "Contact note", "Contact checked", "Source", "List", "Stage", "Date sent", "Notes", "Last contact", "Next step", "Next step date", "Value (SEK/mo)"];
const row = (o) => HEADER.map((h) => o[h] ?? "");
const prospectRows = [
  HEADER,
  row({ ID: "P-001", Priority: 2, Company: "Alpha", Email: "a@alpha.se", Stage: "Not contacted" }),
  row({ ID: "P-002", Priority: 1, Company: "Beta", Email: "b@beta.se", Stage: "Not contacted" }),
  row({ ID: "P-003", Priority: 1, Company: "Gamma", Email: "—", "Email type": "None yet", Stage: "Not contacted" }),
  row({ ID: "P-004", Priority: 1, Company: "Delta", Email: "d@delta.se", Stage: "Emailed", "Date sent": "2026-10-21" }),
  row({ ID: "P-005", Priority: 1, Company: "Eps", Email: "e@eps.se", Stage: "Emailed", "Date sent": "2026-10-28" }),
  row({ ID: "P-006", Priority: 1, Company: "Zeta", Email: "z@zeta.se", Stage: "Replied", "Date sent": "2026-10-28" }),
  row({ ID: "P-007", Priority: 1, Company: "Eta", Email: "h@eta.se", Stage: "Proposal sent", "Date sent": "2026-10-21", "Next step": "Call", "Next step date": "2026-10-27", "Value (SEK/mo)": 30000 }),
  row({ ID: "P-008", Priority: 1, Company: "Theta", Email: "t@theta.se", Stage: "Won", "Date sent": "2026-10-22", "Next step date": "2026-10-20", "Value (SEK/mo)": 30000 }),
  [],
];
const overviewRows = [["Outreach goal"], ["Start date", "2026-10-21"], ["End date", "2026-12-01"], ["Emails per day", 10]];
const logRows = [["Date", "ID", "Company", "Type", "Summary"], ["2026-10-27", "P-006", "Zeta", "Email in", "Interested"], ["", "", "", "", ""]];

const s = summarizeSales({ prospectRows, logRows, overviewRows, today: "2026-10-28" });

assert(toDay(46316) === "2026-10-21", "a Sheets serial date reads as a day");
assert(toDay("2026-10-21 09:00") === "2026-10-21", "a date with time reads as its day");
assert(readGoal([["Start date", "x"]]) === null, "an incomplete goal block gives no plan");
assert(s.totals.prospects === 8, "blank rows are dropped");
assert(s.sentToday === 2, "sent today counts Date sent = today");
assert(s.plan.days === 42 && s.plan.target === 420, "plan is 42 days, 420 emails");
assert(s.plan.sent === 5, "all first emails inside the plan count");
assert(s.plan.expected === 72, "pace: 7 finished days plus today's 2 so far");
assert(s.plan.delta === -67, "behind by expected minus sent");
assert(s.queue.map((p) => p.id).join() === "P-002,P-001", "queue: not contacted, has an email, priority first");
assert(s.followUps.map((p) => p.id).join() === "P-004", "follow-up after 5 days for Emailed only");
assert(s.toAnswer.map((p) => p.id).join() === "P-006", "replies waiting for an answer");
assert(s.due.map((p) => p.id).join() === "P-007" && s.due[0].overdue, "overdue next step, closed deals left out");
assert(s.totals.answered === 3 && s.totals.met === 2, "reply and meeting counts");
assert(s.totals.proposalValue === 30000 && s.totals.wonValue === 30000, "values by stage");
assert(s.log.length === 1 && s.log[0].company === "Zeta", "log rows without a date are skipped");

const before = summarizeSales({ prospectRows, overviewRows, today: "2026-10-20" });
assert(before.plan.expected === 0 && before.plan.daysLeft === 42, "before the start nothing is expected yet");
const first = summarizeSales({ prospectRows: [HEADER], overviewRows, today: "2026-10-21" });
assert(first.plan.delta === 0, "the first morning isn't behind");

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall sales-summary tests passed");
