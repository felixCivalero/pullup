// One spine, many heads. A stateless MCP server can't lazy-load tools, but it
// CAN serve a different-sized slice per URL. /mcp = full power cockpit;
// /mcp/create = the event-builder head (which physically cannot refund, send,
// or delete — smaller blast radius, not just fewer tokens); /mcp/crm = the
// relationship-ops head. buildTools({profile}) returns the right slice.

import { buildTools } from "../src/mcp/tools.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const names = (profile) =>
  new Set(buildTools({ token: "pup_test", user: { id: "u" }, profile }).map((t) => t.name));

const full = names(undefined);

console.log("🧪 no profile (and 'full') return the complete tool surface");
{
  assert(full.size > 30, `expected the full surface, got ${full.size} tools`);
  const explicitFull = names("full");
  assert(explicitFull.size === full.size, `'full' (${explicitFull.size}) should equal no-profile (${full.size})`);
}

console.log("🧪 an unknown profile falls back to the full surface (never silently empty)");
{
  const bogus = names("does-not-exist");
  assert(bogus.size === full.size, `unknown profile should fall back to full, got ${bogus.size}`);
}

console.log("🧪 'create' is the builder slice — has create_event, CANNOT refund/send/delete");
{
  const create = names("create");
  assert(create.has("create_event"), "create profile must include create_event");
  assert(create.has("publish_event"), "create profile must include publish_event");
  assert(create.has("upload_event_media"), "create profile must include upload_event_media");
  assert(!create.has("refund_payment"), "create profile must NOT expose refund_payment");
  assert(!create.has("update_person"), "create profile must NOT expose update_person");
  assert(!create.has("delete_event"), "create profile must NOT expose delete_event");
  assert(create.size < full.size, `create slice (${create.size}) should be smaller than full (${full.size})`);
}

console.log("🧪 'crm' is the relationship slice — has people + matching, not the page builder");
{
  const crm = names("crm");
  assert(crm.has("query_people"), "crm profile must include query_people");
  assert(crm.has("find_matches"), "crm profile must include find_matches");
  assert(!crm.has("create_event"), "crm profile must NOT expose create_event");
  assert(!crm.has("upload_event_media"), "crm profile must NOT expose upload_event_media");
}

console.log("🧪 every profile is a strict subset of the full surface (no orphan/typo'd names)");
for (const p of ["create", "crm"]) {
  for (const n of names(p)) {
    assert(full.has(n), `profile '${p}' exposes '${n}' which isn't in the full surface`);
  }
}

console.log("🧪 filtered tools still carry their annotations (scoping doesn't strip safety hints)");
{
  const create = buildTools({ token: "pup_test", user: { id: "u" }, profile: "create" });
  assert(create.every((t) => t.annotations && typeof t.annotations.title === "string"),
    "every tool in a profile must keep its annotations");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll mcp-tool-profiles tests passed");
