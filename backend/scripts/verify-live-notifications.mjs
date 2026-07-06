// Probe the LIVE notification loop on both seats against a running server +
// real DB + real Supabase Realtime:
//   host side  — PullUp's greeting flips the thread unread; VIEWING it
//                (POST /host/room/threads/:id/read) clears it, no reply needed.
//   admin side — a host request/message flips the system thread unread and
//                streams over Realtime (RLS path person_events_admin_select);
//                viewing (POST /admin/system-inbox/:hostId/read) clears it.
//   host live  — the admin's reply streams to the host's Realtime channel.
// All throwaway rows cleaned up.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };
const cleanup = [];

async function makeUser(email) {
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const userId = created.user.id;
  cleanup.push(async () => {
    await admin.from("thread_reads").delete().eq("host_id", userId);
    await admin.from("person_events").delete().eq("host_id", userId);
    await admin.from("access_requests").delete().eq("host_id", userId);
    await admin.from("people").delete().eq("auth_user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  return { userId, token: sess.session.access_token, session: sess.session, client: anon };
}

const call = (path, token, opts = {}) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });

// Subscribe to person_events INSERTs with a filter; resolves rows as they land.
function listen(client, filter, label) {
  const rows = [];
  let resolveNext = null;
  const channel = client
    .channel(`probe:${label}:${Math.random().toString(36).slice(2, 8)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "person_events", filter }, (p) => {
      if (p?.new) { rows.push(p.new); resolveNext?.(); }
    })
    .subscribe();
  cleanup.push(async () => { try { await client.removeChannel(channel); } catch { /* ok */ } });
  return {
    rows,
    waitFor: (pred, ms = 10000) => new Promise((resolve) => {
      const check = () => { if (rows.some(pred)) { clearTimeout(t); resolve(true); } };
      const t = setTimeout(() => resolve(rows.some(pred)), ms);
      resolveNext = check;
      check();
    }),
  };
}

try {
  const stamp = Date.now();
  const host = await makeUser(`e2e_notif_host_${stamp}@example.com`);

  // Operator — platform_admins row inserted directly WITH user_id so the RLS
  // helper (pullup_is_platform_admin) recognizes the realtime socket at once.
  const adminEmail = `e2e_notif_admin_${stamp}@pullup.se`;
  const op = await makeUser(adminEmail);
  await admin.from("platform_admins").insert({ email: adminEmail, role: "admin", granted_by: "probe", user_id: op.userId });
  cleanup.push(async () => { await admin.from("platform_admins").delete().eq("email", adminEmail); });

  // Fresh host: PullUp thread present, nothing unread yet.
  let r = await call("/host/room", host.token);
  let room = await r.json();
  let pullup = (room.people || []).find((p) => p.isSystem);
  ok(!!pullup, "fresh host: PullUp contact present");
  ok(pullup?.unread === false, `fresh host: PullUp thread not unread (got ${pullup?.unread})`);
  const pullupId = pullup?.id;

  // Wire both realtime ears BEFORE the action.
  const adminEar = listen(op.client, `person_id=eq.${pullupId}`, "admin");
  const hostEar = listen(host.client, `host_id=eq.${host.userId}`, "host");
  await new Promise((res) => setTimeout(res, 1500)); // let sockets join

  // ── The host raises a hand ──
  r = await call("/host/access-requests/agency", host.token, { method: "POST", body: JSON.stringify({ note: "live probe" }) });
  ok(r.status === 200, `POST agency request 200 (got ${r.status})`);

  // Admin ear hears the ✦ request line live (the RLS admin-select path).
  ok(await adminEar.waitFor((x) => x.type === "access_request" && x.host_id === host.userId),
    "ADMIN REALTIME: request ✦ line streamed live");

  // Host side: the greeting flips unread…
  r = await call("/host/room", host.token);
  room = await r.json();
  pullup = (room.people || []).find((p) => p.isSystem);
  ok(pullup?.unread === true, `host: greeting flips thread unread (got ${pullup?.unread})`);
  // …and VIEWING clears it (no reply involved).
  r = await call(`/host/room/threads/${pullupId}/read`, host.token, { method: "POST" });
  ok(r.status === 200, `POST thread read 200 (got ${r.status})`);
  r = await call("/host/room", host.token);
  room = await r.json();
  pullup = (room.people || []).find((p) => p.isSystem);
  ok(pullup?.unread === false, `host: viewing cleared unread (got ${pullup?.unread})`);

  // Admin inbox: unread until VIEWED, then cleared — again, no reply involved.
  r = await call("/admin/system-inbox", op.token);
  let inbox = await r.json();
  ok(inbox.systemPersonId === pullupId, "admin inbox carries systemPersonId (the realtime filter)");
  let th = (inbox.threads || []).find((t) => t.hostId === host.userId);
  ok(th?.unread === true, `admin: host action flips thread unread (got ${th?.unread})`);
  r = await call(`/admin/system-inbox/${host.userId}/read`, op.token, { method: "POST" });
  ok(r.status === 200, `POST admin read 200 (got ${r.status})`);
  r = await call("/admin/system-inbox", op.token);
  inbox = await r.json();
  th = (inbox.threads || []).find((t) => t.hostId === host.userId);
  ok(th?.unread === false, `admin: viewing cleared unread (got ${th?.unread})`);

  // ── The admin replies; the host hears it live and goes unread again ──
  r = await call(`/admin/system-inbox/${host.userId}/message`, op.token, { method: "POST", body: JSON.stringify({ text: "live probe reply" }) });
  ok(r.status === 200, `admin reply 200 (got ${r.status})`);
  ok(await hostEar.waitFor((x) => x.type === "message_in" && (x.body || "").includes("live probe reply")),
    "HOST REALTIME: PullUp's reply streamed live");
  r = await call("/host/room", host.token);
  room = await r.json();
  pullup = (room.people || []).find((p) => p.isSystem);
  ok(pullup?.unread === true, `host: reply flips unread again (got ${pullup?.unread})`);

  // The host answers; the admin thread goes unread for the operator seat.
  r = await call("/host/room/message", host.token, { method: "POST", body: JSON.stringify({ personId: pullupId, channel: "email", text: "probe: got it!" }) });
  ok(r.status === 200, `host reply 200 (got ${r.status})`);
  ok(await adminEar.waitFor((x) => x.type === "message_out" && (x.body || "").includes("probe: got it!")),
    "ADMIN REALTIME: host's reply streamed live");
  r = await call("/admin/system-inbox", op.token);
  inbox = await r.json();
  th = (inbox.threads || []).find((t) => t.hostId === host.userId);
  ok(th?.unread === true, `admin: host reply flips unread again (got ${th?.unread})`);
} catch (e) {
  console.error("❌ probe crashed:", e);
  failures++;
} finally {
  for (const fn of cleanup.reverse()) { try { await fn(); } catch (e) { console.error("cleanup:", e?.message); } }
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GREEN");
process.exit(failures ? 1 : 0);
