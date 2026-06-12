// Probe GET /events/:id/access (refactored to shared resolver — must keep its
// shape) and the new GET /events/:id/room-view composed payload. Creates a
// throwaway host + draft event, checks both endpoints, cleans everything up.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const email = `e2e_roomview_${Date.now()}@example.com`;
let userId = null, eventId = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

try {
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  userId = created.user.id;
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  const token = sess.session.access_token;
  const authed = (path) => fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());

  const ev = await fetch(`${API}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: `RoomView probe`, startsAt: new Date(Date.now() + 86400000).toISOString(), status: "DRAFT", createdVia: "create" }),
  }).then((r) => r.json());
  eventId = ev.id;
  ok(!!eventId, "probe event created");

  const access = await authed(`/events/${eventId}/access`);
  ok(access.level === "host" && access.role === "owner", `access verdict (level=${access.level}, role=${access.role})`);
  const expectedKeys = ["eventId", "level", "role", "personId", "realHost", "reason", "phase", "permissions", "event", "viewingAs", "forced"];
  ok(expectedKeys.every((k) => k in access), `access payload keys intact (${Object.keys(access).length})`);
  ok(access.realHost === true && access.event?.title === "RoomView probe", "realHost + event block");

  const view = await authed(`/events/${eventId}/room-view`);
  ok(view.access?.level === "host", "room-view access composed");
  ok(JSON.stringify(view.access) === JSON.stringify(access), "room-view.access identical to /access");
  ok(Array.isArray(view.channels) && view.channels.some((c) => c.isMain), `channels include Main (${view.channels?.length})`);
  ok(Array.isArray(view.messages) && view.messages.length === 0, "messages = empty Main feed");
  ok(view.roster && view.roster.pulledUpCount === 0 && Array.isArray(view.roster.coming), "roster present for host");

  // roster endpoint parity (slimmed to shared buildRosterPayload)
  const roster = await authed(`/host/events/${eventId}/roster`);
  ok(JSON.stringify(Object.keys(roster).sort()) === JSON.stringify(["coming", "comingCount", "event", "pulledUp", "pulledUpCount"]), "roster endpoint shape intact");

  // logged-out viewer → gate verdict, no leakage
  const anonView = await fetch(`${API}/events/${eventId}/room-view`).then((r) => r.json());
  ok(anonView.access?.level && anonView.access.level !== "host" && (anonView.messages == null || anonView.messages.length === 0) && !anonView.roster, `logged-out gated (level=${anonView.access?.level})`);
} catch (e) {
  failures++;
  console.error("❌ threw:", e.message);
} finally {
  if (eventId) { await admin.from("event_channels").delete().eq("event_id", eventId); await admin.from("events").delete().eq("id", eventId); console.log("🧹 event deleted"); }
  if (userId) { await admin.from("people").delete().eq("email", email.toLowerCase()); await admin.auth.admin.deleteUser(userId); console.log("🧹 user deleted"); }
}
process.exit(failures ? 1 : 0);
