// Probe GET /me/rsvp-prefill — the four RSVP identity anchors for a signed-in
// viewer. Three throwaway scenarios, all cleaned up:
//   1. Guest with a people row (auth_user_id linked, phone_e164 + instagram)
//      → all four anchors come from the person.
//   2. Host with ONLY a profiles row (mobile_number + branding_links.instagram
//      as a full URL) → fallback fills phone + normalized IG handle.
//   3. No token → 401 (never leaks anyone's anchors).
// Also asserts the payload is EXACTLY the four anchor keys, nothing more.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

let failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };
const cleanup = [];

async function makeUser(email) {
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const userId = created.user.id;
  cleanup.push(async () => {
    await admin.from("people").delete().eq("auth_user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  return { userId, token: sess.session.access_token };
}

const prefill = (token) =>
  fetch(`${API}/me/rsvp-prefill`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

try {
  // ── Scenario 1: person-linked guest ──
  const guestEmail = `e2e_prefill_guest_${Date.now()}@example.com`;
  const guest = await makeUser(guestEmail);
  const { error: pErr } = await admin.from("people").insert({
    email: guestEmail,
    name: "Prefill Guest",
    auth_user_id: guest.userId,
    phone_e164: "+46701234567",
    instagram: "prefill_guest",
  });
  if (pErr) throw pErr;

  const r1 = await prefill(guest.token);
  ok(r1.status === 200, `guest: 200 (got ${r1.status})`);
  const p1 = await r1.json();
  ok(p1.name === "Prefill Guest", `guest: name from person (got ${JSON.stringify(p1.name)})`);
  ok(p1.email === guestEmail, `guest: email (got ${JSON.stringify(p1.email)})`);
  ok(p1.phone === "+46701234567", `guest: verified phone_e164 (got ${JSON.stringify(p1.phone)})`);
  ok(p1.instagram === "prefill_guest", `guest: instagram handle (got ${JSON.stringify(p1.instagram)})`);
  const keys = Object.keys(p1).sort().join(",");
  ok(keys === "email,instagram,name,phone", `payload is EXACTLY the four anchors (got ${keys})`);

  // ── Scenario 2: profile-only host (no people row) ──
  const hostEmail = `e2e_prefill_host_${Date.now()}@example.com`;
  const host = await makeUser(hostEmail);
  const { error: prErr } = await admin.from("profiles").upsert({
    id: host.userId,
    name: "Prefill Host",
    mobile_number: "+46700000001",
    branding_links: { instagram: "https://www.instagram.com/host.handle/" },
  });
  if (prErr) throw prErr;

  const r2 = await prefill(host.token);
  ok(r2.status === 200, `host: 200 (got ${r2.status})`);
  const p2 = await r2.json();
  ok(p2.name === "Prefill Host", `host: name from profile (got ${JSON.stringify(p2.name)})`);
  ok(p2.email === hostEmail, `host: email falls back to session (got ${JSON.stringify(p2.email)})`);
  ok(p2.phone === "+46700000001", `host: mobile_number fallback (got ${JSON.stringify(p2.phone)})`);
  ok(p2.instagram === "host.handle", `host: IG URL normalized to handle (got ${JSON.stringify(p2.instagram)})`);

  // ── Scenario 3: unauthenticated ──
  const r3 = await prefill(null);
  ok(r3.status === 401, `anon: 401 (got ${r3.status})`);
} catch (e) {
  console.error("💥 probe crashed:", e);
  failures++;
} finally {
  for (const fn of cleanup.reverse()) {
    try { await fn(); } catch (e) { console.error("cleanup:", e.message); }
  }
}

console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
