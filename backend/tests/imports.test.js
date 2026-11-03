// repos/imports.js: cleaning an imported list.
import { cleanRows } from "../src/repos/imports.js";

let failures = 0;
const assert = (ok, label) => { console.log(`${ok ? "✅" : "❌"} ${label}`); if (!ok) failures += 1; };

const r = cleanRows([
  { email: " Anna@Example.se ", name: "Anna", consent: "ja" },
  { email: "anna@example.se", phone: "070-123 45 67" },
  { email: "not-an-email", name: "X" },
  { email: "bo@example.se", name: "Bo", consent: "nej", instagram: "@Bo.Gram" },
  { email: "cia@example.se", consent: true },
]);
assert(r.rows.length === 3 && r.invalid === 1 && r.duplicates === 1, "one row per address; a bad address is left out");
const anna = r.rows.find((x) => x.email === "anna@example.se");
assert(anna.consent && anna.name === "Anna" && anna.phone === "+46701234567", "a duplicate adds what it knows; a yes stays a yes");
assert(r.rows.find((x) => x.email === "bo@example.se").consent === false && r.rows.find((x) => x.email === "bo@example.se").instagram === "bo.gram", "'nej' is no; the handle is cleaned");
assert(cleanRows([{ email: "d@example.se" }], true).rows[0].consent === true, "everyone said yes → all consent");
assert(cleanRows([]).rows.length === 0 && cleanRows(null).rows.length === 0, "nothing in, nothing out");

if (failures) { console.error(`\n${failures} imports test(s) failed`); process.exit(1); }
console.log("\nall imports tests passed");
