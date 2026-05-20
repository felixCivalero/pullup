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

  // Auth — PAT only (manually-minted OR OAuth-issued; both are pup_… tokens
  // stored in personal_access_tokens). On 401 we set RFC 9728's
  // WWW-Authenticate header pointing at our Protected Resource Metadata so
  // MCP clients (claude.ai, ChatGPT, etc.) can auto-discover the OAuth
  // flow and prompt the user to authorize.
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return unauthorized(res, "Missing Authorization: Bearer token. Authorize via OAuth or mint a PAT in PullUp → Settings → PullUp MCP.");
  }
  if (!isPatToken(token)) {
    return unauthorized(res, "Only PullUp access tokens (pup_…) are accepted.");
  }
  const userId = await findUserIdByPatToken(token);
  if (!userId) return unauthorized(res, "Invalid or revoked token.");

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

// RFC 9728: a 401 from a protected resource MUST point at its PRM via the
// WWW-Authenticate header so OAuth-capable clients can auto-discover the
// authorization server and start a fresh flow.
function unauthorized(res, message) {
  if (res.headersSent) return;
  const issuer = process.env.PULLUP_OAUTH_ISSUER || "https://mcp.pullup.se";
  res.setHeader(
    "WWW-Authenticate",
    `Bearer realm="pullup-mcp", resource_metadata="${issuer}/.well-known/oauth-protected-resource"`
  );
  jsonRpcError(res, 401, -32001, message);
}
