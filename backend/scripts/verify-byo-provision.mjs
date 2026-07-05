// Proof for BYO increment 2b: the owned-schema artifact + the provisioner.
// The schema's "applies cleanly" was proven separately by standing it up in a
// throwaway Postgres schema (8 tables / 12 intra-FKs / 8 PKs). Here we prove,
// from Node:
//   • pullup_owned_schema_ddl() returns complete DDL for all 8 owned tables,
//   • it keeps intra-set FKs but drops every cross-boundary FK (no REFERENCES
//     profiles / brands — a creator's project has no such tables),
//   • the provisioner gates correctly on missing creds (the live Management-API
//     run is the one PAT-gated step).
//
// Run from backend/:  node scripts/verify-byo-provision.mjs
import dotenv from "dotenv";
dotenv.config();
process.env.BYO_SUPABASE_ENABLED = "true";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const prov = await import("../src/services/byo/provisioner.js");
const repo = await import("../src/repos/creatorDatabases.js");

const OWNED = ["people", "events", "event_channels", "rsvps", "pullups", "person_events", "person_notes", "event_space_messages"];
const tag = Date.now();
let hostId = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

try {
  if (!process.env.APP_ENCRYPTION_KEY) { console.log("⏭  APP_ENCRYPTION_KEY not set — skipping"); process.exit(2); }

  // 1. the generated DDL covers every owned table
  const ddl = await prov.getOwnedSchemaDdl();
  ok(typeof ddl === "string" && ddl.length > 1000, `owned-schema DDL generated (${ddl.length} chars)`);
  for (const t of OWNED) ok(ddl.includes(`CREATE TABLE IF NOT EXISTS ${t} (`), `DDL creates ${t}`);

  // 2. intra-set FKs kept, cross-boundary FKs dropped
  ok(/REFERENCES events\(id\)/.test(ddl) && /REFERENCES people\(id\)/.test(ddl), "keeps intra-set FKs (→events, →people)");
  ok(!/REFERENCES profiles/.test(ddl), "drops FKs → profiles (central)");
  ok(!/REFERENCES brands/.test(ddl), "drops FKs → brands (central)");

  // 3. provisioner gating (the live Management-API run is PAT-gated)
  const { data: host } = await admin.auth.admin.createUser({ email: `e2e_byoprov_${tag}@example.com`, email_confirm: true });
  hostId = host.user.id;

  let r = await prov.provisionOwnedProject(hostId);
  ok(!r.ok && r.reason === "not_connected", `gates when not connected (${r.reason})`);

  // connect WITHOUT a mgmt token → provisioning must refuse
  await repo.connectCreatorDatabase({ hostId, projectRef: `ref_${tag}`, dbUrl: SUPABASE_URL, serviceKey: SERVICE_KEY });
  r = await prov.provisionOwnedProject(hostId);
  ok(!r.ok && r.reason === "no_mgmt_token", `gates when no mgmt token (${r.reason})`);

  // The version bumps whenever the owned schema evolves (87 → 107 → …); the
  // invariant is that it exists and never regresses below the first release.
  ok(Number.isInteger(prov.OWNED_SCHEMA_VERSION) && prov.OWNED_SCHEMA_VERSION >= 87, `schema version stamped (v${prov.OWNED_SCHEMA_VERSION})`);
} catch (e) {
  failures++;
  console.error("❌ threw:", e.message);
} finally {
  if (hostId) {
    await admin.from("creator_databases").delete().eq("host_id", hostId);
    await admin.auth.admin.deleteUser(hostId).catch(() => {});
  }
  console.log("🧹 cleaned host + creator_databases row");
}
process.exit(failures ? 1 : 0);
