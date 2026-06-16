// Contract probe: admin "Act as" via a REAL session swap, over real HTTP.
// Mints three throwaway users with real sessions — an admin, a target host, and
// a non-admin outsider — then exercises the feature against a running server
// and asserts on the audit trail. Full cleanup, run anywhere.
//
// The decisive check (#5): POST /admin/impersonation/start returns a single-use
// tokenHash; verifying it (the exact step the browser runs) yields a session
// whose user.id IS the target host — proving the swap makes you genuinely the
// host, not a header overlay. Mirror check (#6): a non-admin cannot start one.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const tag = Date.now();
const adminEmail = `e2e_actas_admin_${tag}@example.com`;
const targetEmail = `e2e_actas_target_${tag}@example.com`;
const outsiderEmail = `e2e_actas_outsider_${tag}@example.com`;
let adminId = null, targetId = null, outsiderId = null, logId = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

async function makeUser(email) {
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  return data.user.id;
}
async function sessionFor(email) {
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  return sess.session.access_token;
}
const getProfile = (tok) => fetch(`${API}/host/profile`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json());

try {
  adminId = await makeUser(adminEmail);
  targetId = await makeUser(targetEmail);
  outsiderId = await makeUser(outsiderEmail);

  const adminTok = await sessionFor(adminEmail);
  const targetTok = await sessionFor(targetEmail);
  const outsiderTok = await sessionFor(outsiderEmail);

  // Lazy-create each profile row through the app's own path, then promote admin.
  await getProfile(adminTok);
  await getProfile(targetTok);
  await getProfile(outsiderTok);
  await admin.from("profiles").update({ is_admin: true }).eq("id", adminId);

  // 1. host search finds the target (by email — lazy profile has no name)
  const search = await fetch(`${API}/admin/impersonation/hosts?q=${encodeURIComponent(targetEmail)}`, {
    headers: { Authorization: `Bearer ${adminTok}` },
  }).then((r) => r.json());
  ok((search.hosts || []).some((h) => h.id === targetId), "host search returns the target");

  // 2. non-admin is forbidden from the admin surface
  const forbidden = await fetch(`${API}/admin/impersonation/hosts`, { headers: { Authorization: `Bearer ${outsiderTok}` } });
  ok(forbidden.status === 403, `non-admin blocked from host search (${forbidden.status})`);

  // 3. start mints a session + opens an audit row
  const start = await fetch(`${API}/admin/impersonation/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminTok}` },
    body: JSON.stringify({ targetUserId: targetId }),
  }).then((r) => r.json());
  logId = start.logId;
  ok(start.ok && start.target?.id === targetId && !!start.tokenHash && !!logId, "start: ok + target + tokenHash + logId");

  // 4. audit row written
  const { data: row } = await admin.from("admin_impersonation_log").select("*").eq("id", logId).maybeSingle();
  ok(!!row && row.real_user_id === adminId && row.acting_as_user_id === targetId && !row.ended_at,
    "audit row written (real=admin, acting=target, still open)");

  // 5. THE swap — verifying the minted tokenHash (what the browser does) yields
  //    a real session that IS the target host.
  const swapClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: swap, error: swapErr } = await swapClient.auth.verifyOtp({ token_hash: start.tokenHash, type: "magiclink" });
  ok(!swapErr && swap?.session?.user?.id === targetId,
    `SWAP: minted session resolves as the target host (user.id=${swap?.session?.user?.id === targetId ? "target ✓" : swap?.session?.user?.id})`);
  // and that session sees the host's own profile on a real host route
  const asHost = await getProfile(swap?.session?.access_token);
  ok(asHost.contactEmail === targetEmail && asHost.isAdmin !== true,
    `swapped session is the host on /host/profile (email=${asHost.contactEmail}, isAdmin=${asHost.isAdmin})`);

  // 6. SECURITY — a non-admin cannot start a session
  const denied = await fetch(`${API}/admin/impersonation/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${outsiderTok}` },
    body: JSON.stringify({ targetUserId: targetId }),
  });
  ok(denied.status === 403, `non-admin cannot start a session (${denied.status})`);

  // 7. stop closes the window (called as the admin, post-restore)
  const stop = await fetch(`${API}/admin/impersonation/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminTok}` },
    body: JSON.stringify({ logId }),
  }).then((r) => r.json());
  ok(stop.ok, "stop ok");
  const { data: closed } = await admin.from("admin_impersonation_log").select("ended_at").eq("id", logId).maybeSingle();
  ok(!!closed?.ended_at, "audit row closed (ended_at set)");
} catch (e) {
  ok(false, `threw: ${e.message}`);
} finally {
  if (logId) await admin.from("admin_impersonation_log").delete().eq("id", logId);
  for (const id of [adminId, targetId, outsiderId]) {
    if (id) {
      await admin.from("profiles").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
  }
  console.log(failures ? `\n❌ ${failures} failure(s)` : "\n✅ all act-as probe checks passed");
  process.exit(failures ? 1 : 0);
}
