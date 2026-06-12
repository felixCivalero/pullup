// Probe GET /host/export — the stage-1 data-ownership endpoint. Creates a
// throwaway host + draft event, downloads the export, checks the manifest,
// section shape, redactions and the Content-Disposition attachment header,
// then cleans everything up.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const email = `e2e_export_${Date.now()}@example.com`;
let userId = null, eventId = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

try {
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  userId = created.user.id;
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  const token = sess.session.access_token;

  // Unauthenticated must bounce.
  const noAuth = await fetch(`${API}/host/export`);
  ok(noAuth.status === 401, `no-auth gate (${noAuth.status})`);

  // Give the throwaway host one event so the slice isn't empty.
  const ev = await fetch(`${API}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: "Export probe", startsAt: new Date(Date.now() + 86400000).toISOString(), status: "DRAFT", createdVia: "create" }),
  }).then((r) => r.json());
  eventId = ev.id;
  ok(!!eventId, "probe event created");

  const res = await fetch(`${API}/host/export`, { headers: { Authorization: `Bearer ${token}` } });
  ok(res.status === 200, `export responds (${res.status})`);
  ok(/attachment; filename="pullup-export-/.test(res.headers.get("content-disposition") || ""), "download attachment header");

  const body = await res.json();
  ok(body.manifest?.format === "pullup-export" && body.manifest?.version === 1, "manifest format/version");
  ok(body.manifest?.host?.id === userId, "manifest names the host");
  const sections = ["profile", "events", "rsvps", "people", "timeline", "notes", "roomMessages", "doorScans"];
  ok(sections.every((s) => s in body), `all sections present (${sections.length})`);
  ok(body.events.length === 1 && body.events[0].id === eventId, "their event is in the export");
  ok(body.manifest.counts.events === 1, "manifest counts match");
  ok(Array.isArray(body.manifest.redactedFields?.people) && body.manifest.redactedFields.people.length > 0, "redactions declared in manifest");
  ok(!body.people.some((p) => "marketing_unsubscribe_token" in p || "stripe_customer_id" in p), "redacted fields absent from people");
} catch (err) {
  console.error("❌ probe blew up:", err.message);
  failures++;
} finally {
  // Cleanup: event first (FK), then profile + auth user.
  try { if (eventId) await admin.from("events").delete().eq("id", eventId); } catch { /* best-effort */ }
  try { if (userId) await admin.from("profiles").delete().eq("id", userId); } catch { /* best-effort */ }
  try { if (userId) await admin.auth.admin.deleteUser(userId); } catch { /* best-effort */ }
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nhost/export probe passed");
