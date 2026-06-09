import { decideIgSend } from "../src/messaging/dispatch.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

// ── standard (≤24h) window: free text, no tag, regardless of approval ──
console.log("🧪 decideIgSend: standard window sends free text without the tag");
{
  const d = decideIgSend({ state: "standard", humanComposed: false, humanAgentApproved: false });
  assert(d.send === true, `send true (got ${d.send})`);
  assert(d.humanAgent === false, `no human-agent tag (got ${d.humanAgent})`);
}

// ── human_agent (24h–7d): only a human-composed reply, only when approved ──
console.log("🧪 decideIgSend: human_agent window blocks an AUTOMATED send");
{
  const d = decideIgSend({ state: "human_agent", humanComposed: false, humanAgentApproved: true });
  assert(d.send === false, `automated blocked (got ${d.send})`);
  assert(/human-composed/.test(d.reason || ""), `reason names human-composed (got ${d.reason})`);
}

console.log("🧪 decideIgSend: human_agent window blocks a human reply when Meta hasn't approved");
{
  const d = decideIgSend({ state: "human_agent", humanComposed: true, humanAgentApproved: false });
  assert(d.send === false, `blocked pending approval (got ${d.send})`);
  assert(/pending Meta Human Agent approval/.test(d.reason || ""), `reason names the pending approval (got ${d.reason})`);
}

console.log("🧪 decideIgSend: human_agent window sends a human reply WITH the tag once approved");
{
  const d = decideIgSend({ state: "human_agent", humanComposed: true, humanAgentApproved: true });
  assert(d.send === true, `send true (got ${d.send})`);
  assert(d.humanAgent === true, `human-agent tag applied (got ${d.humanAgent})`);
}

// ── expired (>7d or never inbound): never sendable ─────────────────────
console.log("🧪 decideIgSend: expired window is never sendable");
{
  const d = decideIgSend({ state: "expired", humanComposed: true, humanAgentApproved: true });
  assert(d.send === false, `expired blocked (got ${d.send})`);
  assert(/expired/.test(d.reason || ""), `reason names expiry (got ${d.reason})`);
}

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll decideIgSend assertions passed");
