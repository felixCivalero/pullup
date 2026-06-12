// Regression suite over the import-format corpus: every export structure in
// scripts/importFormatFixtures.mjs must keep parsing, mapping and validating
// exactly as promised. If a heuristic change breaks Eventbrite or Swedish
// Excel, this is where it screams.
import { parseDump } from "../src/services/dumpParser.js";
import { proposeMappingHeuristic, validateRows } from "../src/services/importMapping.js";
import { FIXTURES } from "../scripts/importFormatFixtures.mjs";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

for (const f of FIXTURES) {
  const { rows, headers, skipped } = parseDump(f.csv);
  const mapping = proposeMappingHeuristic(headers, rows);
  const { people, rejects, error } = validateRows(rows, mapping);

  if (!f.expectEmail) {
    assert(error === "no email column mapped", `${f.brand}: refuses honestly (no email column)`);
    continue;
  }

  const expectedPeople = rows.length - (f.expectRejects || 0);
  const okSkips = skipped.length === (f.expectSkipped || 0);
  const okPeople = !error && people.length === expectedPeople && rejects.length === (f.expectRejects || 0);
  const okNames = f.expectName === false || people.every((p) => p.name && p.name.includes(" "));
  assert(okSkips && okPeople && okNames,
    `${f.brand}: ${error ? `mapping error: ${error}` : `people ${people.length}/${expectedPeople}, rejects ${rejects.length}, skipped ${skipped.length}, names ${okNames ? "full" : "BROKEN: " + JSON.stringify(people.map((p) => p.name))}`}`);
}

// Corruption regressions from the experiment night (2026-06-13) — these
// exact bugs shipped once and must never come back:
{
  // Order numbers must not become phones.
  const { rows, headers } = parseDump("Order #,Email\n123456789,a@b.com");
  const m = proposeMappingHeuristic(headers, rows);
  const { people } = validateRows(rows, m);
  assert(people[0].phone === undefined, "order number never lands as phone");
}
{
  // Signup/order dates must not become birthdays.
  const { rows, headers } = parseDump("Email,created_at\na@b.com,2025-09-01T08:00:00Z");
  const m = proposeMappingHeuristic(headers, rows);
  const { people } = validateRows(rows, m);
  assert(people[0].birthday === undefined, "signup timestamp never lands as birthday");
}
{
  // A company column must not beat the guest's composed name.
  const { rows, headers } = parseDump("First Name,Last Name,Email,Account Name\nElsa,Ek,e@e.com,Ek Events");
  const m = proposeMappingHeuristic(headers, rows);
  const { people } = validateRows(rows, m);
  assert(people[0].name === "Elsa Ek", `account name never beats the person (${people[0].name})`);
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log(`\nAll ${FIXTURES.length} format regressions hold`);
