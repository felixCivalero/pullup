// Contract probe: the full guest RSVP flow over real HTTP — the platform's
// most critical write path (the 1,400-line handler). Throwaway host + event +
// guest, real POST /events/:slug/rsvp, then DB-level assertions on every rail
// the RSVP must light up: the rsvp row, the person + identity spine, the
// timeline beat, the confirmation enqueue. Full cleanup, run anywhere.
//
// The guest email is pre-suppressed so the outbox worker never actually sends
// to it (enqueue is asserted; delivery is suppressed by design).
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const tag = Date.now();
const hostEmail = `e2e_rsvp_host_${tag}@example.com`;
const guestEmail = `e2e_rsvp_guest_${tag}@example.com`;
let hostUserId = null, eventId = null, slug = null, guestPersonId = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

try {
  // throwaway host with a real session
  const { data: created } = await admin.auth.admin.createUser({ email: hostEmail, email_confirm: true });
  hostUserId = created.user.id;
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: hostEmail });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  const token = sess.session.access_token;

  // published throwaway event
  const ev = await fetch(`${API}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: "RSVP probe", startsAt: new Date(Date.now() + 7 * 86400000).toISOString(), status: "PUBLISHED", createdVia: "create" }),
  }).then((r) => r.json());
  eventId = ev.id; slug = ev.slug;
  ok(!!eventId && ev.status === "PUBLISHED", `published probe event (${slug})`);

  // suppress the guest address BEFORE the flow so no real send ever fires
  const { error: supErr } = await admin
    .from("email_suppressions")
    .insert({ email: guestEmail.toLowerCase(), reason: "probe", source: "probe", details: "verify-rsvp throwaway address" });
  ok(!supErr, `guest address pre-suppressed${supErr ? ` (${supErr.message})` : ""}`);

  // THE flow under test — public guest RSVP, no session
  const res = await fetch(`${API}/events/${slug}/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Probe Guest", email: guestEmail }),
  });
  const body = await res.json().catch(() => ({}));
  ok(res.ok, `POST /events/:slug/rsvp ok (${res.status}${body?.error ? `: ${body.error}` : ""})`);

  // rail 1: the rsvp row
  const { data: rsvp } = await admin.from("rsvps").select("id, person_id, booking_status, status").eq("event_id", eventId).maybeSingle();
  guestPersonId = rsvp?.person_id || null;
  ok(!!rsvp && !!guestPersonId, `rsvp row exists (booking=${rsvp?.booking_status ?? rsvp?.status})`);

  // rail 2: identity spine — person + email identity linked
  const { data: ident } = await admin.from("person_identities").select("kind, value_norm").eq("person_id", guestPersonId);
  ok((ident || []).some((i) => i.kind === "email" && i.value_norm === guestEmail.toLowerCase()), "person_identities carries the email");

  // rail 3: append-only timeline beat
  const { data: beats } = await admin.from("person_events").select("type, dedupe_key").eq("person_id", guestPersonId);
  ok((beats || []).some((b) => b.type === "rsvp"), "person_events has the rsvp beat");

  // rail 4: confirmation enqueued (delivery suppressed by the pre-suppression)
  const { data: outbox } = await admin.from("email_outbox").select("status, subject").eq("to_email", guestEmail.toLowerCase());
  ok((outbox || []).length >= 1, `confirmation enqueued (${(outbox || []).map((o) => o.status).join(",") || "none"})`);

  // rail 5: account spine — guest got an auth account
  const { data: person } = await admin.from("people").select("auth_user_id, name").eq("id", guestPersonId).maybeSingle();
  ok(!!person?.auth_user_id, "guest person linked to a minted auth account");

  // idempotent re-submit must not duplicate
  await fetch(`${API}/events/${slug}/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Probe Guest", email: guestEmail }),
  });
  const { count } = await admin.from("rsvps").select("*", { count: "exact", head: true }).eq("event_id", eventId);
  ok(count === 1, `re-submit stays one rsvp (count=${count})`);
} catch (e) {
  failures++;
  console.error("❌ threw:", e.message);
} finally {
  // cleanup — children first
  const guestAuthId = guestPersonId
    ? (await admin.from("people").select("auth_user_id").eq("id", guestPersonId).maybeSingle()).data?.auth_user_id
    : null;
  await admin.from("email_outbox").delete().eq("to_email", guestEmail.toLowerCase());
  await admin.from("email_suppressions").delete().eq("email", guestEmail.toLowerCase());
  if (guestPersonId) {
    await admin.from("person_events").delete().eq("person_id", guestPersonId);
    await admin.from("person_identities").delete().eq("person_id", guestPersonId);
    await admin.from("person_source_profiles").delete().eq("person_id", guestPersonId);
  }
  if (eventId) {
    await admin.from("rsvps").delete().eq("event_id", eventId);
    await admin.from("event_channels").delete().eq("event_id", eventId);
    await admin.from("events").delete().eq("id", eventId);
  }
  if (guestPersonId) await admin.from("people").delete().eq("id", guestPersonId);
  if (guestAuthId) await admin.auth.admin.deleteUser(guestAuthId).catch(() => {});
  await admin.from("people").delete().eq("email", hostEmail.toLowerCase());
  if (hostUserId) await admin.auth.admin.deleteUser(hostUserId).catch(() => {});
  console.log("🧹 cleaned host, guest, event, outbox, suppression");
}
process.exit(failures ? 1 : 0);
