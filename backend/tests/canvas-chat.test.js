// The create canvas is a head on the spine: it talks to Claude with our own
// /create MCP surface as a connector. buildCanvasRequest assembles the
// Anthropic beta.messages.create payload. The load-bearing invariant is that
// it points at the CREATE profile — so the canvas physically cannot refund,
// send, or delete, no matter what the host types.

import { buildCanvasRequest } from "../src/services/canvasChat.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const base = {
  messages: [{ role: "user", content: "make a neon launch party at The Alchemist" }],
  system: "you are the coach",
  mcpToken: "pup_canvas_temp",
  model: "claude-sonnet-4-6",
  mcpBaseUrl: "https://mcp.pullup.se",
};

console.log("🧪 connector targets the /create surface (blast radius: no refund/send/delete)");
{
  const r = buildCanvasRequest(base);
  assert(Array.isArray(r.mcp_servers) && r.mcp_servers.length === 1, "expected exactly one mcp_server");
  assert(r.mcp_servers[0].url === "https://mcp.pullup.se/create", `expected /create url, got ${r.mcp_servers[0]?.url}`);
  assert(r.mcp_servers[0].type === "url", "mcp_server type must be 'url'");
  assert(!!r.mcp_servers[0].name, "mcp_server must have a name");
}

console.log("🧪 a trailing slash on the base url doesn't double up");
{
  const r = buildCanvasRequest({ ...base, mcpBaseUrl: "https://mcp.pullup.se/" });
  assert(r.mcp_servers[0].url === "https://mcp.pullup.se/create", `got ${r.mcp_servers[0]?.url}`);
}

console.log("🧪 the host's short-lived token is passed as the connector authorization");
{
  const r = buildCanvasRequest(base);
  assert(r.mcp_servers[0].authorization_token === "pup_canvas_temp", "token must be forwarded to the connector");
}

console.log("🧪 the mcp-client beta is enabled");
{
  const r = buildCanvasRequest(base);
  assert(Array.isArray(r.betas) && r.betas.includes("mcp-client-2025-04-04"), `betas missing the mcp-client flag: ${JSON.stringify(r.betas)}`);
}

console.log("🧪 model, system, and messages pass through unchanged");
{
  const r = buildCanvasRequest(base);
  assert(r.model === "claude-sonnet-4-6", `model: ${r.model}`);
  assert(r.system === "you are the coach", "system passthrough");
  assert(r.messages === base.messages, "messages passthrough");
  assert(typeof r.max_tokens === "number" && r.max_tokens > 0, `max_tokens should be a positive number, got ${r.max_tokens}`);
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll canvas-chat tests passed");
