// Contract probe: admin "Act as" full session-swap impersonation over real HTTP.
// Mints three throwaway users with real Supabase sessions — an admin, a target
// host, and a non-admin outsider — then exercises the whole feature against a
// running server and asserts on the DB audit trail. Full cleanup, run anywhere.
//
// The decisive check (#5): with the admin's token AND `x-pullup-act-as: <target>`,
// GET /host/profile — a normal host route that scopes off req.user.id — returns
// the TARGET's profile, not the admin's. That proves the swap lands app-wide.
// The mirror check (#6): the same header from a non-admin is ignored (security).
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
const getProfile = (tok, actAs) =>
  fetch(`${API}/host/profile`, {
    headers: { Authorization: `Bearer ${tok}`, ...(actAs ? { "x-pullup-act-as": actAs } : {}) },
  }).then((r) => r.json());

try {
  adminId = await makeUser(adminEmail);
  targetId = await makeUser(targetEmail);
  outsiderId = await makeUser(outsiderEmail);

  const adminTok = await sessionFor(adminEmail);
  const targetTok = await sessionFor(targetEmail);
  const outsiderTok = await sessionFor(outsiderEmail);

  // Lazy-create each profile row through the app's own path (sets contact_email
  // = auth email), then promote the admin.
  await getProfile(adminTok);
  await getProfile(targetTok);
  await getProfile(outsiderTok);
  await admin.from("profiles").update({ is_admin: true }).eq("id", adminId);

  // 1. baseline — admin, no header → own profile (admin)
  const p1 = await getProfile(adminTok);
  ok(p1.isAdmin === true && p1.contactEmail === adminEmail, `baseline: admin sees own profile (isAdmin=${p1.isAdmin})`);

  // 2. host search finds the target (search by email — lazy profile has no name)
  const search = await fetch(`${API}/admin/impersonation/hosts?q=${encodeURIComponent(targetEmail)}`, {
    headers: { Authorization: `Bearer ${adminTok}` },
  }).then((r) => r.json());
  ok((search.hosts || []).some((h) => h.id === targetId), "host search returns the target");

  // 3. non-admin is forbidden from the admin surface
  const forbidden = await fetch(`${API}/admin/impersonation/hosts`, { headers: { Authorization: `Bearer ${outsiderTok}` } });
  ok(forbidden.status === 403, `non-admin blocked from host search (${forbidden.status})`);

  // 4. start opens an audit row
  const start = await fetch(`${API}/admin/impersonation/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminTok}` },
    body: JSON.stringify({ targetUserId: targetId }),
  }).then((r) => r.json());
  logId = start.logId;
  ok(start.ok && start.target?.id === targetId && !!logId, "start: ok + target + logId");
  const { data: row } = await admin.from("admin_impersonation_log").select("*").eq("id", logId).maybeSingle();
  ok(!!row && row.real_user_id === adminId && row.acting_as_user_id === targetId && !row.ended_at,
    "audit row written (real=admin, acting=target, still open)");

  // 5. THE swap — admin + act-as header → target's profile on a real host route
  const p2 = await getProfile(adminTok, targetId);
  ok(p2.contactEmail === targetEmail && p2.isAdmin !== true,
    `ACT-AS: /host/profile resolves as target (email=${p2.contactEmail}, isAdmin=${p2.isAdmin})`);

  // 6. SECURITY — a non-admin forging the same header is ignored
  const p3 = await getProfile(outsiderTok, targetId);
  ok(p3.contactEmail === outsiderEmail, `SECURITY: forged act-as by non-admin ignored (still ${p3.contactEmail})`);

  // 7. self act-as is a no-op (admin stays admin)
  const p4 = await getProfile(adminTok, adminId);
  ok(p4.isAdmin === true && p4.contactEmail === adminEmail, "self act-as is a no-op");

  // 8. stop closes the window — even while the act-as header is attached, the
  //    admin route authorises on the REAL user, so this must still succeed.
  const stop = await fetch(`${API}/admin/impersonation/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminTok}`, "x-pullup-act-as": targetId },
    body: JSON.stringify({ logId }),
  }).then((r) => r.json());
  ok(stop.ok, "stop ok (reachable mid-impersonation)");
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
