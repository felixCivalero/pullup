// Probe the unified internal-request loop (no email, everything in the PullUp
// system chat) end-to-end against a live server + real DB:
//   1. Fresh host → GET /host/room already contains the PullUp contact
//      (isSystem, empty thread, excluded from peopleCount).
//   2. POST /host/access-requests/{agency,product,instagram} → row in
//      access_requests + access_request log + PullUp greeting in the thread.
//   3. The thread is a normal chat: POST /host/room/message to PullUp lands
//      as a delivered person_events row (internal branch — no email rail).
//   4. Admin side: /admin/requests lists all kinds, PATCH flips status.
//   5. Old bespoke endpoints are gone (404), and no email_outbox rows were
//      written to hello@pullup.se by any of it.
// All throwaway rows are cleaned up.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

let failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };
const cleanup = [];
const startedAt = new Date().toISOString();

async function makeUser(email) {
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const userId = created.user.id;
  cleanup.push(async () => {
    await admin.from("person_events").delete().eq("host_id", userId);
    await admin.from("access_requests").delete().eq("host_id", userId);
    await admin.from("people").delete().eq("auth_user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  return { userId, token: sess.session.access_token };
}

const call = (path, token, opts = {}) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });

try {
  const stamp = Date.now();

  // ── 1. Fresh host sees PullUp before any contact ──
  const host = await makeUser(`e2e_intreq_host_${stamp}@example.com`);
  let r = await call("/host/room", host.token);
  ok(r.status === 200, `GET /host/room 200 (got ${r.status})`);
  let room = await r.json();
  const sys0 = (room.people || []).filter((p) => p.isSystem);
  ok(sys0.length === 1, `fresh host: exactly one injected PullUp contact (got ${sys0.length})`);
  ok((sys0[0]?.thread || []).length === 0, `fresh host: PullUp thread empty (got ${(sys0[0]?.thread || []).length})`);
  ok(room.host?.peopleCount === 0, `fresh host: peopleCount excludes PullUp (got ${room.host?.peopleCount})`);
  const pullupId = sys0[0]?.id;

  // ── 2. Requests seed the thread; no email ──
  r = await call("/host/access-requests/agency", host.token, { method: "POST", body: JSON.stringify({ note: "probe note" }) });
  ok(r.status === 200, `POST agency request 200 (got ${r.status})`);
  r = await call("/host/access-requests/product", host.token, { method: "POST", body: JSON.stringify({}) });
  ok(r.status === 200, `POST product request 200 (got ${r.status})`);
  r = await call("/host/access-requests/instagram", host.token, { method: "POST", body: JSON.stringify({}) });
  ok(r.status === 400, `POST instagram without handle → 400 (got ${r.status})`);
  r = await call("/host/access-requests/instagram", host.token, { method: "POST", body: JSON.stringify({ igHandle: "@probe.handle", email: "p@example.com" }) });
  ok(r.status === 200, `POST instagram request 200 (got ${r.status})`);
  r = await call("/host/access-requests/nonsense", host.token, { method: "POST", body: "{}" });
  ok(r.status === 400, `POST unknown kind → 400 (got ${r.status})`);

  const { data: reqRows } = await admin.from("access_requests").select("kind, payload, status").eq("host_id", host.userId).order("kind");
  ok((reqRows || []).map((x) => x.kind).join(",") === "agency,instagram,product", `access_requests rows for all 3 kinds (got ${(reqRows || []).map((x) => x.kind).join(",")})`);
  ok(reqRows?.find((x) => x.kind === "instagram")?.payload?.igHandle === "probe.handle", "instagram payload keeps the de-@'d handle");
  ok(reqRows?.find((x) => x.kind === "agency")?.payload?.note === "probe note", "agency payload keeps the note");

  r = await call("/host/access-requests/agency", host.token);
  const st = await r.json();
  ok(st.requested === true && st.request?.status === "pending", `GET agency status → requested/pending`);

  // ── 3. The thread carries the logs + greetings, and chats like any chat ──
  r = await call("/host/room", host.token);
  room = await r.json();
  const pullup = (room.people || []).find((p) => p.isSystem);
  const logs = (pullup?.thread || []).filter((m) => m.type === "access_request" || m.from === "system").length;
  const greets = (pullup?.thread || []).filter((m) => m.from === "them").length;
  ok(logs >= 3, `thread shows the 3 request log lines (got ${logs})`);
  ok(greets >= 3, `thread shows PullUp's greetings (got ${greets})`);

  r = await call("/host/room/message", host.token, { method: "POST", body: JSON.stringify({ personId: pullupId, channel: "email", text: "probe: hello PullUp" }) });
  const sent = await r.json().catch(() => ({}));
  ok(r.status === 200 && sent.ok !== false, `host → PullUp message sends like a normal chat (got ${r.status})`);
  const { data: outRow } = await admin.from("person_events").select("type, direction, body, metadata").eq("host_id", host.userId).eq("type", "message_out").order("occurred_at", { ascending: false }).limit(1);
  ok(outRow?.[0]?.body?.includes("probe: hello PullUp"), "message stored on the person_events spine");
  ok(outRow?.[0]?.metadata?.status === "delivered", `internal delivery marked delivered (got ${outRow?.[0]?.metadata?.status})`);

  // ── 4. Admin queue lists + flips ──
  const adminEmail = `e2e_intreq_admin_${stamp}@pullup.se`;
  await admin.from("platform_admins").insert({ email: adminEmail, role: "admin", granted_by: "probe" });
  cleanup.push(async () => { await admin.from("platform_admins").delete().eq("email", adminEmail); });
  const op = await makeUser(adminEmail);
  r = await call("/admin/requests", op.token);
  ok(r.status === 200, `GET /admin/requests 200 as admin (got ${r.status})`);
  const q = await r.json();
  const mine = (q.items || []).filter((i) => i.host_id === host.userId);
  ok(mine.length === 3, `admin queue lists all 3 kinds for the probe host (got ${mine.length})`);
  ok(mine.some((i) => i.kind === "product" && i.label === "Products"), "product request labeled");
  r = await call(`/admin/requests/product/${host.userId}`, op.token, { method: "PATCH", body: JSON.stringify({ status: "onboarded" }) });
  ok(r.status === 200, `PATCH product → onboarded 200 (got ${r.status})`);
  const { data: flipped } = await admin.from("access_requests").select("status").eq("host_id", host.userId).eq("kind", "product").single();
  ok(flipped?.status === "onboarded", `status flipped in access_requests (got ${flipped?.status})`);

  // ── 5. Old endpoints gone; no hello@ email written ──
  r = await call("/instagram/early-access", host.token);
  ok(r.status === 404, `old /instagram/early-access is gone (got ${r.status})`);
  r = await call("/host/subscription/agency-interest", host.token);
  ok(r.status === 404, `old /host/subscription/agency-interest is gone (got ${r.status})`);
  const { data: mails } = await admin.from("email_outbox").select("id").eq("to_email", "hello@pullup.se").gte("created_at", startedAt);
  ok((mails || []).length === 0, `no hello@ notification email written (got ${(mails || []).length})`);
} catch (e) {
  console.error("❌ probe crashed:", e);
  failures++;
} finally {
  for (const fn of cleanup.reverse()) { try { await fn(); } catch (e) { console.error("cleanup:", e?.message); } }
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GREEN");
process.exit(failures ? 1 : 0);
