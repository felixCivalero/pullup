// backend/scripts/backfill-matches-enrich.js
//
// Two jobs, in service of "match → enrich, at scale":
//
//   1. (--merge a,b) Run a real anchor-oriented merge through the live service
//      path (mergePeople): the PullUp-native profile survives, the 3rd-party one
//      is absorbed, and the spine is re-enriched. Used to fuse the Felix ↔ Felix
//      Alberto pair as the first real case.
//
//   2. (--backfill) Re-run enrichPersonProfile across every person who carries
//      enrichable links (>1 identity, or any source profile), so the matches
//      already confirmed catch up — their empty cached params fill from the
//      identities/sources they're linked to. Gap-fill only: never clobbers.
//
// SAFE + idempotent. Runs against whatever Supabase the env points at (the
// backend .env → prod). Usage:
//
//   node scripts/backfill-matches-enrich.js --backfill
//   node scripts/backfill-matches-enrich.js --merge ab4f8c35-...,9b97059a-...
//   node scripts/backfill-matches-enrich.js --merge <a>,<b> --backfill
//   node scripts/backfill-matches-enrich.js --backfill --dry   (report, no writes)

import "dotenv/config";
import { supabase } from "../src/supabase.js";
import { mergePeople, computeAnchorScore } from "../src/services/adminMatching.js";
import { enrichPersonProfile } from "../src/services/personSourceProfiles.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const doBackfill = args.includes("--backfill");
const mergeArg = (() => {
  const i = args.indexOf("--merge");
  return i >= 0 ? args[i + 1] : null;
})();

async function runMerge(pair) {
  const [a, b] = pair.split(",").map((s) => s.trim());
  if (!a || !b) throw new Error("--merge expects <idA>,<idB>");
  const [sa, sb] = await Promise.all([computeAnchorScore(a), computeAnchorScore(b)]);
  console.log(`\n🔗 Merge candidates:`);
  console.log(`   A ${a}  score=${sa.score} login=${sa.hasLogin} rank=${sa.bestRank}`);
  console.log(`   B ${b}  score=${sb.score} login=${sb.hasLogin} rank=${sb.bestRank}`);
  if (dry) { console.log("   (--dry: not merging)"); return; }
  const res = await mergePeople({ canonicalId: a, mergedId: b, actorId: null, candidateId: null });
  console.log(`   ✅ merged. spine=${res.canonicalId} absorbed=${res.mergedId} oriented=${res.oriented} filled=[${res.enriched.join(", ")}]`);
}

async function runBackfill() {
  // People with >1 identity (the linked ones) or any source profile.
  const { data: idents } = await supabase.from("person_identities").select("person_id");
  const counts = new Map();
  for (const r of idents || []) counts.set(r.person_id, (counts.get(r.person_id) || 0) + 1);
  const { data: srcs } = await supabase.from("person_source_profiles").select("person_id");
  const targets = new Set();
  for (const [pid, n] of counts) if (n > 1) targets.add(pid);
  for (const r of srcs || []) targets.add(r.person_id);

  console.log(`\n📦 Backfill: ${targets.size} people with enrichable links` + (dry ? " (--dry: no writes)" : ""));
  let touched = 0;
  const tally = {};
  for (const pid of targets) {
    if (dry) continue;
    const { filled } = await enrichPersonProfile(pid);
    if (filled.length) {
      touched += 1;
      for (const f of filled) tally[f] = (tally[f] || 0) + 1;
    }
  }
  if (!dry) {
    console.log(`   ✅ ${touched} people enriched`);
    console.log(`   fields filled: ${Object.entries(tally).map(([k, v]) => `${k}×${v}`).join(", ") || "none"}`);
  }
}

(async () => {
  if (mergeArg) await runMerge(mergeArg);
  if (doBackfill) await runBackfill();
  if (!mergeArg && !doBackfill) {
    console.log("Nothing to do. Pass --merge <a>,<b> and/or --backfill (optionally --dry).");
  }
  console.log("\nDone.");
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
