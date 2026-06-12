// Probe the universal-dump importer: preview proposes a sane mapping for a
// Swedish-flavored guest list, commit lands people idempotently (fill-only-
// empty + dedupe-keyed timeline), and re-committing the same dump changes
// NOTHING. Throwaway host + synthetic people, all cleaned up.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const stamp = Date.now();
const email = `e2e_import_${stamp}@example.com`;
const g1 = `e2e_guest_a_${stamp}@example.com`;
const g2 = `e2e_guest_b_${stamp}@example.com`;
let userId = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

const CSV = [
  "Namn,E-post,Mobilnummer,Instagram,Medlemsnivå",
  `Anna Probe,${g1},070-123 45 67,@anna.probe,Gold`,
  `Bertil Probe,${g2},,https://instagram.com/bertil.p/,Silver`,
  `Trasig Rad,not-an-email,,,Bronze`,
].join("\n");

try {
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  userId = created.user.id;
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  const token = sess.session.access_token;
  const post = (path, body) => fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));

  // Preview: Swedish headers map without help.
  const prev = await post("/host/import/preview", { csvText: CSV });
  ok(prev.status === 200, `preview responds (${prev.status})`);
  const m = prev.json.mapping || {};
  ok(m["E-post"]?.field === "email", "E-post → email");
  ok(m["Namn"]?.field === "name" && m["Mobilnummer"]?.field === "phone", "Namn/Mobilnummer mapped");
  ok(prev.json.stats.validPeople === 2 && prev.json.stats.rejected === 1, "2 valid, 1 honest reject");

  // Commit.
  const mapping = Object.fromEntries(Object.entries(m).map(([c, v]) => [c, v.field]));
  const c1 = await post("/host/import/commit", { csvText: CSV, mapping, source: "probe-dump" });
  ok(c1.status === 200 && c1.json.created === 2 && c1.json.updated === 0, `first commit creates 2 (${JSON.stringify(c1.json)})`);

  const { data: anna } = await admin.from("people").select("name, phone, instagram, import_source, import_metadata").eq("email", g1).single();
  ok(anna?.name === "Anna Probe" && anna?.phone === "0701234567", "Anna landed, phone normalized");
  ok(anna?.instagram === "anna.probe", "@handle cleaned");
  ok(anna?.import_source === "probe-dump" && anna?.import_metadata, "import provenance stamped");
  ok(JSON.stringify(anna?.import_metadata).includes("Medlemsnivå"), "unmapped column preserved in metadata");

  const { data: tl } = await admin.from("person_events").select("id, dedupe_key").eq("host_id", userId).eq("type", "import");
  ok(tl?.length === 2, `2 timeline entries (${tl?.length})`);

  // The idempotency law: same dump again → nothing new, nothing doubled.
  const c2 = await post("/host/import/commit", { csvText: CSV, mapping, source: "probe-dump" });
  ok(c2.status === 200 && c2.json.created === 0 && c2.json.updated === 2, `re-dump creates 0 (${JSON.stringify({ c: c2.json.created, u: c2.json.updated })})`);
  const { data: tl2 } = await admin.from("person_events").select("id").eq("host_id", userId).eq("type", "import");
  ok(tl2?.length === 2, `timeline still 2 after re-dump (${tl2?.length})`);

  // Fill-only-empty: pre-set a name, re-import must NOT overwrite it.
  await admin.from("people").update({ name: "Anna Original" }).eq("email", g1);
  await post("/host/import/commit", { csvText: CSV, mapping, source: "probe-dump" });
  const { data: anna2 } = await admin.from("people").select("name").eq("email", g1).single();
  ok(anna2?.name === "Anna Original", "existing data never overwritten");

  // Swedish Excel torture file through the real HTTP path: BOM + sep-hint +
  // semicolons + CRLF + a quoted multiline note + first/last composition.
  const EXCEL = "\ufeffsep=;\r\n" +
    "Förnamn;Efternamn;E-post;Anteckning\r\n" +
    `Greta;Gran;${g1};"kom med\r\ntvå vänner"\r\n`;
  const p2 = await post("/host/import/preview", { csvText: EXCEL });
  ok(p2.status === 200 && p2.json.stats.delimiter === ";", `Excel sv file: semicolon detected (${p2.json.stats?.delimiter})`);
  ok(p2.json.mapping["Förnamn"]?.field === "first_name" && p2.json.mapping["E-post"]?.field === "email",
    "Excel sv file: Förnamn/E-post mapped");
  ok(p2.json.sample[0]?.name === "Greta Gran", `Excel sv file: name composed (${p2.json.sample[0]?.name})`);

  // Wrong-file walls.
  const xlsx = await post("/host/import/preview", { csvText: "PK\u0003\u0004 fake xlsx bytes" });
  ok(xlsx.status === 400 && /Excel/.test(xlsx.json.error), "xlsx drop gets a friendly wall");
  const jsonDrop = await post("/host/import/preview", { csvText: '[{"email":"a@b.com"}]' });
  ok(jsonDrop.status === 400 && /JSON/.test(jsonDrop.json.error), "json drop gets a friendly wall");
} catch (err) {
  console.error("❌ probe blew up:", err.message);
  failures++;
} finally {
  try { await admin.from("person_events").delete().eq("host_id", userId); } catch { /* best-effort */ }
  try { await admin.from("people").delete().in("email", [g1, g2]); } catch { /* best-effort */ }
  try { if (userId) await admin.from("profiles").delete().eq("id", userId); } catch { /* best-effort */ }
  try { if (userId) await admin.auth.admin.deleteUser(userId); } catch { /* best-effort */ }
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nhost/import probe passed");
