// Mail → sales sheet plan. Pure, no IMAP or Google.
import { planMailSync } from "../src/lib/salesMailSync.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const H = ["ID", "Priority", "Company", "Email", "Stage", "Date sent", "Last contact"];
const prospectRows = [
  H,
  ["P-001", 1, "Alpha", "anna@alpha.se", "Not contacted", "", ""],
  ["P-002", 1, "Beta", "info@beta.se", "Emailed", "2026-10-21", "2026-10-21"],
  ["P-003", 1, "Gamma", "hej@gamma.se", "Meeting booked", "2026-10-21", "2026-10-22"],
  ["P-004", 1, "Delta", "x@gmail.com", "Not contacted", "", ""],
  ["P-005", 1, "Eps", "y@gmail.com", "Not contacted", "", ""],
];
const logRows = [["Date", "ID", "Company", "Type", "Summary", "Message ID"], ["2026-10-21", "P-002", "", "Email out", "Hej", "<old@x>"]];
const msg = (dir, date, to, id, subject = "Hej") => ({ dir, date, counterparts: [to], messageId: id, subject });

const plan = planMailSync({
  prospectRows,
  logRows,
  messages: [
    msg("out", "2026-10-22", "anna@alpha.se", "<a1>"),
    msg("out", "2026-10-21", "info@beta.se", "<old@x>"),
    msg("in", "2026-10-24", "maria@beta.se", "<b2>", "Re: Hej"),
    msg("in", "2026-10-25", "hej@gamma.se", "<c1>"),
    msg("in", "2026-10-25", "z@gmail.com", "<z1>"),
    msg("out", "2026-10-22", "nobody@else.se", "<n1>"),
  ],
});
const cell = (row, h) => plan.updates.find((u) => u.row === row && u.header === h)?.value;

assert(cell(2, "Date sent") === "2026-10-22" && cell(2, "Stage") === "Emailed", "first email out: Date sent and Emailed");
assert(cell(3, "Stage") === "Replied" && cell(3, "Date sent") === undefined, "a reply from the same company domain moves to Replied, Date sent kept");
assert(cell(3, "Last contact") === "2026-10-24", "last contact is the latest message");
assert(cell(4, "Stage") === undefined && cell(4, "Last contact") === "2026-10-25", "Meeting booked is never moved back, last contact still updates");
assert(!plan.updates.some((u) => u.row === 5 || u.row === 6), "free-mail domains never match by domain");
assert(plan.unknownInbound.length === 1 && plan.unknownInbound[0].messageId === "<z1>", "unknown inbound senders are reported");
assert(plan.logAppend.length === 3 && !plan.logAppend.some((r) => r[5] === "<old@x>"), "each message logged once; already-logged skipped");
assert(plan.logAppend.every((r) => r[2] === null), "the Company column is left to the sheet's formula");

const twice = planMailSync({ prospectRows, logRows, messages: [msg("out", "2026-10-22", "anna@alpha.se", "<a1>"), msg("out", "2026-10-28", "anna@alpha.se", "<a2>")] });
assert(twice.updates.find((u) => u.row === 2 && u.header === "Stage").value === "Followed up", "a second email out means Followed up");

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall sales-mail-sync tests passed");
