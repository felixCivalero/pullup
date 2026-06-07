import { interpretUpsert, dedupeKey, resolveTryOrder } from "../src/lib/idempotency.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

// ── interpretUpsert: the new-write vs replay distinction ──────────────
console.log("🧪 interpretUpsert: a returned row is a fresh insert (not deduped)");
{
  const out = interpretUpsert([{ id: "abc" }]);
  assert(out.deduped === false, `deduped false (got ${out.deduped})`);
  assert(out.row?.id === "abc", `row passed through (got ${JSON.stringify(out.row)})`);
}

console.log("🧪 interpretUpsert: an empty array is a dedup (ON CONFLICT DO NOTHING)");
{
  const out = interpretUpsert([]);
  assert(out.deduped === true, `deduped true (got ${out.deduped})`);
  assert(out.row === null, `no row on dedup (got ${JSON.stringify(out.row)})`);
}

console.log("🧪 interpretUpsert: null/undefined treated as dedup, never throws");
{
  assert(interpretUpsert(null).deduped === true, "null → deduped");
  assert(interpretUpsert(undefined).deduped === true, "undefined → deduped");
}

// ── dedupeKey: stable join, null when any part is missing ─────────────
console.log("🧪 dedupeKey: joins parts with ':'");
{
  assert(dedupeKey("wa:msgin", "wamid.X") === "wa:msgin:wamid.X", "joined");
  assert(dedupeKey("ig:msgin", 12345) === "ig:msgin:12345", "coerces numbers");
}

console.log("🧪 dedupeKey: any missing part → null (so caller falls back to plain insert)");
{
  assert(dedupeKey("wa:msgin", null) === null, "null part → null");
  assert(dedupeKey("wa:msgin", undefined) === null, "undefined part → null");
  assert(dedupeKey("wa:msgin", "") === null, "empty-string part → null");
  assert(dedupeKey() === null, "no parts → null");
}

console.log("🧪 dedupeKey: the SAME inputs produce the SAME key (so a replay collides)");
{
  assert(
    dedupeKey("wa:msgin", "wamid.ABC") === dedupeKey("wa:msgin", "wamid.ABC"),
    "deterministic",
  );
}

// ── resolveTryOrder: the dispatch fallback ordering ───────────────────
console.log("🧪 resolveTryOrder: explicit preferredChannel wins");
{
  assert(JSON.stringify(resolveTryOrder({ preferredChannel: "instagram" })) === '["instagram"]', "instagram");
  assert(JSON.stringify(resolveTryOrder({ preferredChannel: "whatsapp" })) === '["whatsapp"]', "whatsapp");
}

console.log("🧪 resolveTryOrder: legacy proactive send tries WA only when a template exists");
{
  assert(JSON.stringify(resolveTryOrder({ hasWhatsAppTemplate: true })) === '["whatsapp"]', "wa with template");
  assert(JSON.stringify(resolveTryOrder({ hasWhatsAppTemplate: false })) === "[]", "email floor when no template");
  assert(JSON.stringify(resolveTryOrder({})) === "[]", "email floor by default");
}

console.log("🧪 resolveTryOrder: an explicit email preference skips every rail (email floor)");
{
  assert(JSON.stringify(resolveTryOrder({ preferredChannel: "email", hasWhatsAppTemplate: true })) === "[]", "email pref → no rails");
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
