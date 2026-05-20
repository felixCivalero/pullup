// MCP Streamable HTTP endpoint mounted at /mcp.
//
// Each request:
//   1. Reads `Authorization: Bearer pup_…` and resolves it to a user. PATs
//      only — Supabase JWTs are rejected here so this endpoint can't be
//      abused with a stolen browser session token.
//   2. Spins up a per-request McpServer + StreamableHTTPServerTransport in
//      stateless mode (sessionIdGenerator: undefined). One JSON-RPC call
//      per request, no session bookkeeping — fine at our scale and matches
//      how claude.ai connectors call us.
//   3. Registers the 9 PullUp tools with the user's PAT baked into the
//      API client closure, so tool handlers never see or pass tokens.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { supabase } from "../supabase.js";
import { findUserIdByPatToken, isPatToken } from "../data.js";
import { buildTools, wrapHandler } from "./tools.js";

// CORS preflight handler for the /mcp route. Mounted separately because
// the global cors() middleware doesn't expose mcp-session-id and is
// origin-allowlist-only; claude.ai needs an open Allow-Origin so any
// connected workspace can reach us.
export function mcpCorsPreflight(req, res, next) {
  if (req.method !== "OPTIONS") return next();
  setMcpCorsHeaders(req, res);
  return res.status(204).end();
}

function setMcpCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, mcp-session-id, mcp-protocol-version"
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export async function handleMcp(req, res) {
  setMcpCorsHeaders(req, res);

  // Auth — PAT only
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return jsonRpcError(res, 401, -32001, "Missing Authorization: Bearer pup_… token. Mint one in PullUp → Settings → Personal Access Tokens.");
  if (!isPatToken(token)) {
    return jsonRpcError(res, 401, -32001, "Only PullUp personal access tokens (pup_…) are accepted here.");
  }
  const userId = await findUserIdByPatToken(token);
  if (!userId) return jsonRpcError(res, 401, -32001, "Invalid or revoked PAT.");

  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return jsonRpcError(res, 401, -32001, "User not found.");
  const user = { id: data.user.id, email: data.user.email, ...data.user.user_metadata };

  // Per-request server. Stateless transport.
  const server = new McpServer(
    { name: "pullup", version: "0.2.0" },
    { capabilities: { tools: {} } }
  );

  const tools = buildTools({ token, user });
  for (const t of tools) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
      },
      wrapHandler(t.handler)
    );
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  res.on("close", () => {
    transport.close?.().catch?.(() => {});
    server.close?.().catch?.(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP handleRequest error:", err);
    if (!res.headersSent) {
      jsonRpcError(res, 500, -32603, `Internal MCP error: ${err?.message || err}`);
    }
  }
}

function jsonRpcError(res, httpStatus, code, message) {
  if (res.headersSent) return;
  res.status(httpStatus).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}
