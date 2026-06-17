// Unit tests for the PURE digest-shaping layer — counts, per-section caps,
// category filtering, headline + subject, and the empty case. No DB.

import {
  shapeDigest,
  digestHeadlineParts,
  defaultCategories,
  MAX_ITEMS_PER_SECTION,
  CATEGORY_KEYS,
} from "../src/services/notificationDigest.js";
import { dailyDigestSubject } from "../src/emails/dailyDigest.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

function items(n, label = "p") {
  return Array.from({ length: n }, (_, i) => ({ title: `${label}${i}`, subtitle: `sub${i}` }));
}

// ── counts roll up across sections ──
console.log("🧪 shapeDigest: totalCount sums all included sections");
{
  const d = shapeDigest({ rsvps: items(3), messages: items(2), pullups: items(1) }, defaultCategories());
  assert(d.totalCount === 6, `totalCount 6 (got ${d.totalCount})`);
  assert(d.sections.length === 3, `3 sections (got ${d.sections.length})`);
}

// ── empty sections drop out; empty digest is totalCount 0, no sections ──
console.log("🧪 shapeDigest: empty case");
{
  const d = shapeDigest({}, defaultCategories());
  assert(d.totalCount === 0, `totalCount 0 (got ${d.totalCount})`);
  assert(d.sections.length === 0, `no sections (got ${d.sections.length})`);
}
console.log("🧪 shapeDigest: a zero-length category produces no section");
{
  const d = shapeDigest({ rsvps: items(2), messages: [] }, defaultCategories());
  assert(d.sections.length === 1 && d.sections[0].key === "rsvps", "only the non-empty section survives");
}

// ── per-section cap + overflow "+N more" ──
console.log("🧪 shapeDigest: caps items per section and reports overflow");
{
  const n = MAX_ITEMS_PER_SECTION + 5;
  const d = shapeDigest({ rsvps: items(n) }, defaultCategories());
  const s = d.sections[0];
  assert(s.count === n, `count is the true total ${n} (got ${s.count})`);
  assert(s.items.length === MAX_ITEMS_PER_SECTION, `items capped at ${MAX_ITEMS_PER_SECTION} (got ${s.items.length})`);
  assert(s.overflow === 5, `overflow 5 (got ${s.overflow})`);
}
console.log("🧪 shapeDigest: no overflow when at/under the cap");
{
  const d = shapeDigest({ rsvps: items(MAX_ITEMS_PER_SECTION) }, defaultCategories());
  assert(d.sections[0].overflow === 0, `overflow 0 (got ${d.sections[0].overflow})`);
}

// ── category filtering: disabled categories are excluded entirely ──
console.log("🧪 shapeDigest: disabled categories are excluded from count + sections");
{
  const cats = { ...defaultCategories(), messages: false, waitlist: false };
  const d = shapeDigest({ rsvps: items(2), messages: items(9), waitlist: items(4), pullups: items(1) }, cats);
  assert(d.totalCount === 3, `totalCount only rsvps+pullups = 3 (got ${d.totalCount})`);
  const keys = d.sections.map((s) => s.key);
  assert(!keys.includes("messages") && !keys.includes("waitlist"), "messages + waitlist absent");
  assert(keys.includes("rsvps") && keys.includes("pullups"), "rsvps + pullups present");
}

// ── section order follows CATEGORY_KEYS ──
console.log("🧪 shapeDigest: sections render in canonical order");
{
  const d = shapeDigest({ pullups: items(1), rsvps: items(1), community: items(1) }, defaultCategories());
  const order = d.sections.map((s) => s.key);
  const expected = CATEGORY_KEYS.filter((k) => order.includes(k));
  assert(JSON.stringify(order) === JSON.stringify(expected), `order ${JSON.stringify(order)} matches canonical`);
}

// ── headline parts: singular/plural + phrasing per category ──
console.log("🧪 digestHeadlineParts: pluralization + phrasing");
{
  const d = shapeDigest({ rsvps: items(3), messages: items(1), pullups: items(2) }, defaultCategories());
  const parts = digestHeadlineParts(d);
  assert(parts.includes("3 new RSVPs"), `has "3 new RSVPs" (${parts.join(", ")})`);
  assert(parts.includes("1 message"), `singular "1 message" (${parts.join(", ")})`);
  assert(parts.includes("2 pulled up"), `has "2 pulled up" (${parts.join(", ")})`);
}
console.log("🧪 digestHeadlineParts: single RSVP is singular");
{
  const d = shapeDigest({ rsvps: items(1) }, defaultCategories());
  assert(digestHeadlineParts(d)[0] === "1 new RSVP", `"1 new RSVP" (got ${digestHeadlineParts(d)[0]})`);
}

// ── subject line ──
console.log("🧪 dailyDigestSubject: activity vs quiet");
{
  const subj = dailyDigestSubject(["3 new RSVPs", "1 message"], true);
  assert(subj === "Daily summary", `subject (got "${subj}")`);
  const quiet = dailyDigestSubject([], false);
  assert(quiet === "Daily summary", `quiet subject (got "${quiet}")`);
}

// ── shaping is robust to malformed items ──
console.log("🧪 shapeDigest: tolerates missing/odd item fields");
{
  const d = shapeDigest({ rsvps: [{}, { title: 123 }, { title: "ok", subtitle: null }] }, defaultCategories());
  assert(d.sections[0].count === 3, "counts all rows regardless of shape");
  assert(typeof d.sections[0].items[0].title === "string", "title coerced to string");
}

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll notification-digest assertions passed");
