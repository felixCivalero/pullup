import { normalizeFlow, matchFlowAnswer } from "../src/instagram/conversationFlows.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

// ── normalizeFlow: no opener → null (trigger keeps immediate-link behaviour) ──
console.log("🧪 normalizeFlow: empty/garbage → null");
{
  assert(normalizeFlow(null) === null, "null → null");
  assert(normalizeFlow({}) === null, "no opener → null");
  assert(normalizeFlow({ opener: "   " }) === null, "blank opener → null");
}

// ── normalizeFlow: gate (no split) ──
console.log("🧪 normalizeFlow: opener with no split keyword → gate (split null, no answerB)");
{
  const f = normalizeFlow({ opener: "Say LETS GO and it's yours", answerA: { text: "here:", includeLink: true } });
  assert(f.opener === "Say LETS GO and it's yours", `opener kept (got ${f.opener})`);
  assert(f.split === null, `split null (got ${JSON.stringify(f.split)})`);
  assert(f.answerB === null, `answerB null (got ${JSON.stringify(f.answerB)})`);
  assert(f.answerA.includeLink === true, "answerA includeLink true");
}

console.log("🧪 normalizeFlow: includeLink defaults true, respects explicit false");
{
  const f = normalizeFlow({ opener: "yo", answerA: { text: "x", includeLink: false } });
  assert(f.answerA.includeLink === false, `explicit false honored (got ${f.answerA.includeLink})`);
  const g = normalizeFlow({ opener: "yo", answerA: { text: "x" } });
  assert(g.answerA.includeLink === true, `default true (got ${g.answerA.includeLink})`);
}

// ── normalizeFlow: split only materializes with a keyword ──
console.log("🧪 normalizeFlow: split with a keyword → split + answerB present");
{
  const f = normalizeFlow({
    opener: "Solo or crew?",
    split: { keyword: "solo, just me", match: "contains" },
    answerA: { text: "perfect" }, answerB: { text: "bring them" },
  });
  assert(f.split && f.split.keyword === "solo, just me", `split keyword kept (got ${JSON.stringify(f.split)})`);
  assert(f.answerB && f.answerB.text === "bring them", `answerB kept (got ${JSON.stringify(f.answerB)})`);
}

console.log("🧪 normalizeFlow: split object with blank keyword → ignored (stays a gate)");
{
  const f = normalizeFlow({ opener: "hey", split: { keyword: "   " }, answerA: { text: "a" }, answerB: { text: "b" } });
  assert(f.split === null, `blank split keyword → null (got ${JSON.stringify(f.split)})`);
  assert(f.answerB === null, `answerB dropped without a split (got ${JSON.stringify(f.answerB)})`);
}

// ── matchFlowAnswer: gate → always A ──
console.log("🧪 matchFlowAnswer: gate (no split) → answerA for ANY reply");
{
  const f = normalizeFlow({ opener: "say it", answerA: { text: "A", includeLink: true } });
  assert(matchFlowAnswer(f, "literally anything").branch === "A", "any reply → A");
  assert(matchFlowAnswer(f, "").branch === "A", "empty reply → A");
}

// ── matchFlowAnswer: split branches on keyword (any of the comma list) ──
console.log("🧪 matchFlowAnswer: split → keyword hit picks A, miss picks B");
{
  const f = normalizeFlow({
    opener: "Solo or crew?",
    split: { keyword: "solo, just me", match: "contains" },
    answerA: { text: "A" }, answerB: { text: "B" },
  });
  assert(matchFlowAnswer(f, "just me tonight").branch === "A", "'just me' → A");
  assert(matchFlowAnswer(f, "SOLO baby").branch === "A", "case-insensitive 'SOLO' → A");
  assert(matchFlowAnswer(f, "bringing the whole crew").branch === "B", "no match → B");
}

console.log("🧪 matchFlowAnswer: exact match mode");
{
  const f = normalizeFlow({
    opener: "?", split: { keyword: "yes", match: "exact" },
    answerA: { text: "A" }, answerB: { text: "B" },
  });
  assert(matchFlowAnswer(f, "yes").branch === "A", "exact 'yes' → A");
  assert(matchFlowAnswer(f, "yes please").branch === "B", "'yes please' is not exact → B");
}

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll conversation-flow assertions passed");
