// Integration proof for the BYO-Supabase SPINE: the connection router, the
// encrypted-key registry, the graduation flip, and the kill switch — exercised
// directly against the DB. A throwaway host "connects" a stand-in owned DB
// (we point it at our OWN project so the owned client genuinely builds + queries;
// true cross-project isolation is the increment-2 e2e). Proves:
//   • router defaults to the shared client (today's behavior)
//   • the service key round-trips through AES-GCM and never leaks via the
//     sanitized read
//   • flipping a host to live + system_of_record routes it to its OWN client
//   • the kill switch (disconnect) instantly falls back to shared
//   • BYO_SUPABASE_ENABLED off ⇒ always shared, regardless of the row
//
// Run from backend/:  node scripts/verify-byo-router.mjs
import dotenv from "dotenv";
dotenv.config();

// Flag ON before importing anything that reads it.
process.env.BYO_SUPABASE_ENABLED = "true";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Dynamic import AFTER env is set (supabase.js reads SUPABASE_URL at load).
const router = await import("../src/db/router.js");
const repo = await import("../src/repos/creatorDatabases.js");
const { decryptSecret } = await import("../src/utils/encryption.js");

const tag = Date.now();
const hostEmail = `e2e_byo_${tag}@example.com`;
let hostId = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

try {
  if (!process.env.APP_ENCRYPTION_KEY) {
    console.log("⏭  APP_ENCRYPTION_KEY not set locally — spine proof needs it to encrypt the key. Skipping.");
    process.exit(2);
  }

  const { data: created } = await admin.auth.admin.createUser({ email: hostEmail, email_confirm: true });
  hostId = created.user.id;
  ok(!!hostId, "throwaway host created");

  // 1. default routing — no owned DB yet → shared
  let client = await router.getClientForHost(hostId);
  ok(router.isSharedClient(client), "no owned DB → router serves the shared client");

  // 2. connect a stand-in owned project (our own URL+key as the stand-in)
  const conn = await repo.connectCreatorDatabase({
    hostId, projectRef: `standin_${tag}`, dbUrl: SUPABASE_URL, serviceKey: SERVICE_KEY,
  });
  ok(!conn.error && conn.db?.status === "connected", `connected (status=${conn.db?.status})`);

  // 3. key round-trips through AES-GCM
  const withKey = await repo.getCreatorDatabaseWithKey(hostId);
  ok(withKey?.encrypted_service_key && withKey.encrypted_service_key.startsWith("v1:"), "key stored as a v1 AES-GCM envelope");
  ok(decryptSecret(withKey.encrypted_service_key) === SERVICE_KEY, "decrypts back to the original key");

  // 4. the sanitized read never carries the key
  const safe = await repo.getCreatorDatabase(hostId);
  ok(!JSON.stringify(safe).includes(SERVICE_KEY) && !("encryptedServiceKey" in (safe || {})), "sanitized read leaks no key");

  // 5. connected-but-not-cut-over still routes to SHARED (mirror stage)
  router.invalidateHost(hostId);
  client = await router.getClientForHost(hostId);
  ok(router.isSharedClient(client), "connected but not system_of_record → still shared (mirror stage)");

  // 6. mirror client builds even before cutover (for stage-2 copy)
  const mirror = await router.getMirrorClientForHost(hostId);
  ok(!!mirror, "mirror client builds before cutover");
  const { error: mErr } = await mirror.from("events").select("id").limit(1);
  ok(!mErr, `mirror client can query the owned project (${mErr?.message || "ok"})`);

  // 7. GRADUATE: live + system_of_record → router serves the OWNED client
  await repo.setCreatorDatabaseStatus(hostId, "live", { system_of_record: true });
  router.invalidateHost(hostId);
  client = await router.getClientForHost(hostId);
  ok(!router.isSharedClient(client), "graduated (live + system_of_record) → router serves the OWNED client");
  const { error: qErr } = await client.from("events").select("id").limit(1);
  ok(!qErr, `owned client is live + queryable (${qErr?.message || "ok"})`);

  // 8. KILL SWITCH: disconnect → instant fallback to shared, key dropped
  await repo.disconnectCreatorDatabase(hostId);
  router.invalidateHost(hostId);
  client = await router.getClientForHost(hostId);
  ok(router.isSharedClient(client), "kill switch (disconnect) → router falls back to shared");
  const mirror2 = await router.getMirrorClientForHost(hostId);
  ok(mirror2 === null, "revoked project yields no mirror client (key dropped)");

  // 9. FLAG OFF: even a live+cutover row is ignored when BYO is disabled
  await repo.setCreatorDatabaseStatus(hostId, "live", { system_of_record: true, encrypted_service_key: undefined });
  // re-store a key so the row is "live" again, then disable the flag
  await repo.connectCreatorDatabase({ hostId, projectRef: "standin", dbUrl: SUPABASE_URL, serviceKey: SERVICE_KEY });
  await repo.setCreatorDatabaseStatus(hostId, "live", { system_of_record: true });
  process.env.BYO_SUPABASE_ENABLED = "false";
  router.invalidateHost(hostId);
  client = await router.getClientForHost(hostId);
  ok(router.isSharedClient(client), "BYO flag OFF → shared even for a live+cutover host (prod-safe)");
  process.env.BYO_SUPABASE_ENABLED = "true";
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
