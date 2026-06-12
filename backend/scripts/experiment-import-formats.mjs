// Experiment: run the universal-dump mapping brain over realistic
// reconstructions of the biggest CSV export structures in the wild.
// Pure run — no server, no DB: parseCsv → heuristic mapping (+ optional AI
// refinement when ANTHROPIC_API_KEY is set) → validateRows. Prints, per
// format: column coverage, fields landed, people landed vs rejected, and a
// verdict. Fixtures are faithful header reconstructions, NOT real customer
// files — the headers are the contract being tested.
//
// Usage: node scripts/experiment-import-formats.mjs [--ai]

import { parseDump } from "../src/services/dumpParser.js";
import { FIXTURES } from "./importFormatFixtures.mjs";
import {
  proposeMappingHeuristic,
  proposeMappingAI,
  validateRows,
  TARGET_FIELDS,
} from "../src/services/importMapping.js";

const USE_AI = process.argv.includes("--ai");



const results = [];
for (const f of FIXTURES) {
  const { rows, headers, skipped } = parseDump(f.csv);
  let mapping = proposeMappingHeuristic(headers, rows);
  let aiCols = 0;
  if (USE_AI) {
    const before = Object.keys(mapping).length;
    mapping = await proposeMappingAI(headers, rows, mapping);
    aiCols = Object.keys(mapping).length - before;
  }
  const { people, rejects, fieldDrops, error } = validateRows(rows, mapping);
  const fieldsLanded = [...new Set(Object.values(mapping).map((m) => m.field))];
  const mappedCount = Object.keys(mapping).length;

  const allLanded = people.length === rows.length - (f.expectRejects || 0);
  const skipOk = (f.expectSkipped || 0) === skipped.length;
  const verdict = f.expectEmail
    ? error ? "❌ NO EMAIL MAPPED"
      : !skipOk ? `❌ parser skipped ${skipped.length}, expected ${f.expectSkipped || 0}`
      : !allLanded ? `⚠️ ${rejects.length} rejects`
      : f.expectName !== false && !people.every((p) => p.name && p.name.includes(" ")) ? "⚠️ full name not landed"
      : "✅"
    : error === "no email column mapped" ? "✅ honest reject" : "❌ should have refused";

  results.push({
    brand: f.brand, verdict,
    cols: `${mappedCount}/${headers.length}${aiCols ? ` (+${aiCols} AI)` : ""}`,
    fields: fieldsLanded.join(",") || "—",
    people: error ? "—" : `${people.length}/${rows.length}`,
    drops: Object.keys(fieldDrops || {}).length ? JSON.stringify(fieldDrops) : "",
    sample: people[0] ? JSON.stringify({ name: people[0].name, email: people[0].email, phone: people[0].phone, instagram: people[0].instagram, tags: people[0].tags }) : "",
  });
}

console.log(`\n=== import-format experiment (AI: ${USE_AI ? "on" : "off"}) ===\n`);
for (const r of results) {
  console.log(`${r.verdict}  ${r.brand}`);
  console.log(`     mapped ${r.cols} cols → [${r.fields}] · people ${r.people}${r.drops ? ` · field drops ${r.drops}` : ""}`);
  if (r.sample) console.log(`     first person: ${r.sample}`);
}
const bad = results.filter((r) => r.verdict.startsWith("❌") || r.verdict.startsWith("⚠️"));
console.log(`\n${results.length - bad.length}/${results.length} formats clean${bad.length ? ` — issues: ${bad.map((b) => b.brand).join(" · ")}` : ""}`);
