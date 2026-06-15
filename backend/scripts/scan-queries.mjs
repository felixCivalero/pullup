#!/usr/bin/env node
// scan-queries.mjs — guardrail against the two PostgREST scale traps that keep
// emptying lists at scale (see src/db/safeQuery.js):
//
//   IN_VAR   .in("<idcol>", <variable>) — an oversized id list goes in the URL
//            and 400s past ~hundreds. Use selectInChunks / inChunks.
//   UNBOUND  .from("<bigtable>").select(...) with no row bound — silently capped
//            at 1000 by PostgREST. Use selectAllPaged (or .limit/.range/.single).
//
// RATCHET: existing sites are baselined in scripts/query-scan-baseline.json so we
// don't have to fix all of them at once — but any NEW violation fails. Run with
// `--update` after a deliberate sweep to refresh the baseline.
//
//   npm run scan:queries            # fail on new violations
//   npm run scan:queries -- --update# accept current state as the baseline
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const BASELINE = join(ROOT, "scripts", "query-scan-baseline.json");
const UPDATE = process.argv.includes("--update");

// Tables whose row count grows with real usage — an unbounded read is a bomb.
const BIG = ["people", "person_events", "rsvps", "person_source_profiles", "person_identities",
  "analytics_events", "pullups", "email_outbox", "instagram_threads", "whatsapp_threads",
  "person_notes", "community_members", "campaign_sends", "email_events"];
const ID_COLS = ["id", "person_id", "event_id", "people_id", "host_id", "user_id"];
const BOUND = /\.(limit|range|single|maybeSingle|csv|count)\s*\(|count\s*:\s*["']exact|head\s*:\s*true/;
const OPT_OUT = /safe-query:\s*ok/; // trailing comment to accept a specific line

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".js") && !p.includes("/db/safeQuery.js")) out.push(p);
  }
  return out;
}

const findings = [];
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const rel = relative(ROOT, file);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (OPT_OUT.test(line)) continue;

    // IN_VAR — .in("<idcol>", <not-a-literal-array>)
    const m = line.match(/\.in\(\s*["'](\w+)["']\s*,\s*([^[)][^)]*)\)/);
    if (m && ID_COLS.includes(m[1])) {
      const arg = m[2].trim();
      // ignore obvious already-chunked / sliced forms
      if (!/\.slice\(|chunk|inChunks|selectInChunks/.test(arg) && !/\.slice\(|chunk/.test(line)) {
        findings.push({ rule: "IN_VAR", file: rel, code: line.trim() });
      }
    }

    // UNBOUND — .from("<bigtable>") whose statement has no row bound
    const fm = line.match(/\.from\(\s*["'](\w+)["']\s*\)/);
    if (fm && BIG.includes(fm[1])) {
      const stmt = lines.slice(i, i + 14).join("\n");
      const upToEnd = stmt.split(/;|\bawait\b/).slice(0, 2).join(" ") + " " + stmt;
      const hasSelect = /\.select\s*\(/.test(stmt);
      if (hasSelect && !BOUND.test(stmt) && !/safe-query:\s*ok/.test(stmt) && !/selectAllPaged|selectInChunks/.test(stmt)) {
        findings.push({ rule: "UNBOUND", file: rel, code: line.trim() });
      }
    }
  }
}

const key = (f) => `${f.rule} ${f.file} :: ${f.code}`;
const current = [...new Set(findings.map(key))].sort();

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + "\n");
  console.log(`✓ baseline updated — ${current.length} known site(s) recorded.`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : [];
const baseSet = new Set(baseline);
const novel = current.filter((k) => !baseSet.has(k));

if (novel.length) {
  console.error(`✗ ${novel.length} NEW unsafe query site(s) — use src/db/safeQuery.js (or add a trailing "// safe-query: ok" if truly bounded):\n`);
  for (const k of novel) console.error("  " + k);
  console.error(`\n(${baseline.length} known sites are baselined. After a deliberate sweep run: npm run scan:queries -- --update)`);
  process.exit(1);
}
console.log(`✓ no new unsafe query sites (${baseline.length} baselined, ${current.length} present).`);
