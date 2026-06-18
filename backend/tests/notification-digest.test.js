// Unit tests for the PURE digest-shaping layer — counts, per-section caps,
// category filtering, headline + subject, and the empty case. No DB.

import {
  shapeDigest,
  digestHeadlineParts,
  defaultCategories,
  MAX_ITEMS_PER_SECTION,
  CATEGORY_KEYS,
  zonedParts,
  isDigestDue,
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

// ════════════════════════════════════════════════════════════════════════
// TIMEZONE-AWARE SCHEDULING — the pure due-check. No clock, no DB; we feed
// `now` explicitly so the tz math is pinned deterministically.
// ════════════════════════════════════════════════════════════════════════

// ── zonedParts: same instant, different local wall-clock per zone ──
console.log("🧪 zonedParts: one instant maps to each zone's local clock");
{
  // 2026-06-18T23:30:00Z — late evening UTC.
  const t = new Date("2026-06-18T23:30:00Z");
  const sthlm = zonedParts(t, "Europe/Stockholm"); // UTC+2 (summer) → 01:30 next day
  assert(sthlm.dateStr === "2026-06-19" && sthlm.hour === 1 && sthlm.minute === 30, `Stockholm 01:30 next day (got ${sthlm.dateStr} ${sthlm.hour}:${sthlm.minute})`);
  const la = zonedParts(t, "America/Los_Angeles"); // UTC-7 (summer) → 16:30 same day
  assert(la.dateStr === "2026-06-18" && la.hour === 16, `LA 16:30 same day (got ${la.dateStr} ${la.hour}:${la.minute})`);
  const nbo = zonedParts(t, "Africa/Nairobi"); // UTC+3 → 02:30 next day
  assert(nbo.dateStr === "2026-06-19" && nbo.hour === 2, `Nairobi 02:30 next day (got ${nbo.dateStr} ${nbo.hour})`);
}

console.log("🧪 zonedParts: bad timezone falls back to UTC (never throws)");
{
  const t = new Date("2026-06-18T09:00:00Z");
  const p = zonedParts(t, "Not/AZone");
  assert(p.dateStr === "2026-06-18" && p.hour === 9, `fallback UTC 09:00 (got ${p.dateStr} ${p.hour})`);
}

// ── isDigestDue: before the local send time → not due ──
console.log("🧪 isDigestDue: before send time is not due");
{
  // 06:00Z = 08:00 in Stockholm (summer). Send time 09:00 → not yet.
  const due = isDigestDue({ now: new Date("2026-06-18T06:00:00Z"), timezone: "Europe/Stockholm", sendHour: 9, sendMinute: 0, lastSentAt: null });
  assert(due === false, `08:00 local < 09:00 send → not due (got ${due})`);
}

// ── at/after the local send time, never sent → due ──
console.log("🧪 isDigestDue: at/after send time and never sent is due");
{
  // 07:00Z = 09:00 Stockholm. Send 09:00, never sent → due.
  const due = isDigestDue({ now: new Date("2026-06-18T07:00:00Z"), timezone: "Europe/Stockholm", sendHour: 9, sendMinute: 0, lastSentAt: null });
  assert(due === true, `09:00 local == 09:00 send, never sent → due (got ${due})`);
}

// ── :30 granularity respected ──
console.log("🧪 isDigestDue: half-hour send time");
{
  const base = { timezone: "Europe/Stockholm", sendHour: 9, sendMinute: 30, lastSentAt: null };
  // 07:15Z = 09:15 Stockholm → before 09:30 → not due.
  assert(isDigestDue({ ...base, now: new Date("2026-06-18T07:15:00Z") }) === false, "09:15 < 09:30 → not due");
  // 07:30Z = 09:30 Stockholm → due.
  assert(isDigestDue({ ...base, now: new Date("2026-06-18T07:30:00Z") }) === true, "09:30 == 09:30 → due");
}

// ── already sent on this local day → not due (double-send guard) ──
console.log("🧪 isDigestDue: not due again the same local day");
{
  // now 09:30 Stockholm; last sent earlier today (08:00 local = 06:00Z).
  const due = isDigestDue({
    now: new Date("2026-06-18T07:30:00Z"),
    timezone: "Europe/Stockholm",
    sendHour: 9, sendMinute: 0,
    lastSentAt: new Date("2026-06-18T06:00:00Z"),
  });
  assert(due === false, `sent already today → not due (got ${due})`);
}

// ── sent yesterday, now past today's slot → due again ──
console.log("🧪 isDigestDue: due again the next local day");
{
  const due = isDigestDue({
    now: new Date("2026-06-18T07:30:00Z"),          // 09:30 Stockholm, 2026-06-18
    timezone: "Europe/Stockholm",
    sendHour: 9, sendMinute: 0,
    lastSentAt: new Date("2026-06-17T07:30:00Z"),   // 09:30 Stockholm, 2026-06-17
  });
  assert(due === true, `last send was yesterday local → due (got ${due})`);
}

// ── the SAME instant is due in one zone but not another ──
console.log("🧪 isDigestDue: timezone changes the verdict for one instant");
{
  // 06:05Z, send time 08:00 local, never sent.
  const t = new Date("2026-06-18T06:05:00Z");
  // Stockholm (UTC+2) → 08:05 local ≥ 08:00 → due.
  assert(isDigestDue({ now: t, timezone: "Europe/Stockholm", sendHour: 8, sendMinute: 0, lastSentAt: null }) === true, "Stockholm 08:05 → due");
  // London (UTC+1 summer) → 07:05 local < 08:00 → not due.
  assert(isDigestDue({ now: t, timezone: "Europe/London", sendHour: 8, sendMinute: 0, lastSentAt: null }) === false, "London 07:05 → not due");
}

// ── last-sent guard is evaluated in the host's zone, not UTC ──
console.log("🧪 isDigestDue: midnight boundary handled in host zone");
{
  // now 2026-06-18T23:30Z; in Nairobi (UTC+3) that's 02:30 on 2026-06-19.
  // Send time 02:00, last sent 2026-06-18T22:00Z = 01:00 local 2026-06-19...
  // i.e. already sent today (local) → not due.
  const sameDay = isDigestDue({
    now: new Date("2026-06-18T23:30:00Z"),
    timezone: "Africa/Nairobi",
    sendHour: 2, sendMinute: 0,
    lastSentAt: new Date("2026-06-18T22:00:00Z"), // 01:00 local 06-19
  });
  assert(sameDay === false, `Nairobi: sent earlier same local day → not due (got ${sameDay})`);
}

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll notification-digest assertions passed");
