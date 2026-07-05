// Every MCP tool should carry MCP standard annotations so an annotation-aware
// client (and the connected model) can tell a read from a money-mover without
// reading the description. Currently the registry sets none, which means
// get_event looks exactly as safe as refund_payment. These invariants pin the
// classification down for every current AND future tool — a new tool that
// forgets to declare its safety fails this test.

import { buildTools } from "../src/mcp/tools.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const tools = buildTools({ token: "pup_test", user: { id: "u_test", email: "t@e.com" } });
const byName = new Map(tools.map((t) => [t.name, t]));

// Tools that only read state — safe to run without confirmation.
// (Campaign/email tools — get_email_summary, list_campaigns, get_campaign,
// suggest_campaign_improvements — were removed when campaigns were cut.)
const EXPECTED_READ_ONLY = new Set([
  "list_events", "get_event", "list_rsvps", "list_cover_image_gallery",
  "get_crm_summary", "get_revenue_summary", "get_billing_status", "get_attendance_trends",
  "get_audience_segments", "get_recent_activity",
  "get_event_analytics", "find_person", "get_person", "query_people",
  "find_matches", "suggest_event_improvements",
  "get_crm_signals", "audit_customer_journey",
  "get_recent_actions", "get_host_brief",
  // Portable smart-twin exports — they only read + package existing state.
  "export_context_pack", "export_person_pack",
]);

// Tools whose effect is irreversible / hard to undo — money or real people.
// (send_campaign was removed with campaigns.)
const EXPECTED_DESTRUCTIVE = new Set([
  "delete_event", "refund_payment",
]);

console.log("🧪 the classified tool names all exist in the registry (guards against renames/typos)");
for (const name of [...EXPECTED_READ_ONLY, ...EXPECTED_DESTRUCTIVE]) {
  assert(byName.has(name), `expected a registered tool named '${name}'`);
}

console.log("🧪 every tool carries an annotations object with a non-empty title");
for (const t of tools) {
  const a = t.annotations;
  assert(a && typeof a === "object", `${t.name}: missing annotations object`);
  assert(a && typeof a.title === "string" && a.title.length > 0, `${t.name}: missing annotations.title`);
}

console.log("🧪 readOnlyHint is true for EXACTLY the read-only tools (writes are never auto-safe)");
for (const t of tools) {
  const isRead = EXPECTED_READ_ONLY.has(t.name);
  const hint = t.annotations?.readOnlyHint;
  if (isRead) {
    assert(hint === true, `${t.name}: expected readOnlyHint:true, got ${JSON.stringify(hint)}`);
  } else {
    assert(hint !== true, `${t.name}: is a mutating tool but readOnlyHint is true`);
  }
}

console.log("🧪 destructive tools are flagged destructive and never read-only");
for (const name of EXPECTED_DESTRUCTIVE) {
  const a = byName.get(name)?.annotations || {};
  assert(a.destructiveHint === true, `${name}: expected destructiveHint:true, got ${JSON.stringify(a.destructiveHint)}`);
  assert(a.readOnlyHint !== true, `${name}: destructive tool must not be readOnly`);
}

console.log("🧪 read-only tools are never flagged destructive");
for (const name of EXPECTED_READ_ONLY) {
  const a = byName.get(name)?.annotations || {};
  assert(a.destructiveHint !== true, `${name}: read-only tool must not be destructive`);
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll mcp-tool-annotations tests passed");
