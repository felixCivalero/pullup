// MCP Streamable HTTP endpoint mounted at /mcp.
//
// Each request:
//   1. Reads `Authorization: Bearer pup_…` and resolves it to a user. PATs
//      only — Supabase JWTs are rejected here so this endpoint can't be
//      abused with a stolen browser session token.
//   2. Token-bucket rate-limits per PAT (60/min by default).
//   3. Spins up a per-request McpServer + StreamableHTTPServerTransport in
//      stateless mode (sessionIdGenerator: undefined). One JSON-RPC call
//      per request, no session bookkeeping — fine at our scale and matches
//      how claude.ai connectors call us.
//   4. Registers tools, prompts, and resources with the user's PAT baked
//      into the API client closure, so handlers never see or pass tokens.
//   5. Wraps every tool handler with a 60s wall-clock timeout and writes a
//      row to `mcp_tool_calls` for every invocation — both tagged with the
//      same `request_id` so all tool calls inside one JSON-RPC request can
//      be grouped when debugging.

import crypto from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { supabase } from "../supabase.js";
import { findPatRecord, isPatToken } from "../data.js";
import { buildTools, wrapHandler } from "./tools.js";
import { consume as consumeRateLimit } from "./rateLimit.js";
import { recordToolCall } from "./telemetry.js";
import { makeApi } from "./api.js";
import { prompts } from "./prompts.js";
import { buildStaticResources, buildEventResourceTemplate } from "./resources.js";

// Per-tool wall-clock timeout. Defends against tools that hang (Stripe
// down, Supabase slow, etc.). 60s is generous for any one tool we ship.
const TOOL_TIMEOUT_MS = Number(process.env.MCP_TOOL_TIMEOUT_MS) || 60_000;

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

// Wrap a handler with: structured-error envelope (inner wrapHandler),
// wall-clock timeout, and telemetry recording. The same request_id is
// stamped on every call within one JSON-RPC request so debugging can
// stitch them together.
function wrapWithTimeoutAndTelemetry({ toolName, userId, tokenId, requestId, handler }) {
  const inner = wrapHandler(handler);
  return async (args) => {
    const start = Date.now();
    let result;
    let thrown;
    try {
      result = await Promise.race([
        inner(args),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Tool '${toolName}' timed out after ${Math.round(TOOL_TIMEOUT_MS / 1000)}s`)),
            TOOL_TIMEOUT_MS
          )
        ),
      ]);
      return result;
    } catch (err) {
      thrown = err;
      // Surface timeout (or any uncaught) as a structured tool error so
      // the JSON-RPC envelope stays clean.
      return {
        content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }],
        isError: true,
      };
    } finally {
      const isErr = !!thrown || !!result?.isError;
      const excerpt = thrown
        ? thrown
        : (result?.isError ? result.content?.[0]?.text : null);
      recordToolCall({
        userId,
        tokenId,
        requestId,
        toolName,
        ok: !isErr,
        durationMs: Date.now() - start,
        error: excerpt,
      });
    }
  };
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
  const rec = await findPatRecord(token);
  if (!rec) return unauthorized(res, "Invalid, expired, or revoked token.");
  const { userId, tokenId } = rec;

  // Rate limit per token (token bucket, in-memory). Runaway clients hit
  // 429 instead of grinding through Supabase admin quota. Configurable
  // via MCP_RATE_LIMIT_PER_MIN / MCP_RATE_LIMIT_CAPACITY env vars.
  const rl = consumeRateLimit(token);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    return jsonRpcError(
      res,
      429,
      -32002,
      `Rate limit exceeded. Retry in ${rl.retryAfterSec}s.`
    );
  }

  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return jsonRpcError(res, 401, -32001, "User not found.");
  const user = { id: data.user.id, email: data.user.email, ...data.user.user_metadata };

  // One id per /mcp request, shared across all tool calls. Lets us group
  // forensics ("what did Adam's 14:32 session try to do?") even though
  // multiple tools can run inside one JSON-RPC batch.
  const requestId = crypto.randomUUID();

  // Per-request server. Stateless transport. Capabilities cover tools,
  // prompts, and resources — clients see the full surface in initialize.
  const server = new McpServer(
    { name: "pullup", version: "0.3.0" },
    { capabilities: { tools: {}, prompts: {}, resources: {} } }
  );

  // ── Tools ──────────────────────────────────────────────────────
  const tools = buildTools({ token, user });
  for (const t of tools) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
      },
      wrapWithTimeoutAndTelemetry({
        toolName: t.name,
        userId: user.id,
        tokenId,
        requestId,
        handler: t.handler,
      })
    );
  }

  // ── Prompts ────────────────────────────────────────────────────
  for (const p of prompts) {
    server.registerPrompt(
      p.name,
      {
        title: p.title,
        description: p.description,
        argsSchema: p.argsSchema || {},
      },
      p.handler
    );
  }

  // ── Resources ──────────────────────────────────────────────────
  // Resources read the same loopback API as tools — same auth, same
  // ownership checks. The api client is bound to the caller's PAT.
  const api = makeApi(token);
  for (const r of buildStaticResources(api)) {
    server.registerResource(
      r.name,
      r.uri,
      { title: r.title, description: r.description, mimeType: r.mimeType },
      r.read
    );
  }
  const eventTemplate = buildEventResourceTemplate(api);
  server.registerResource(
    eventTemplate.name,
    eventTemplate.template,
    eventTemplate.metadata,
    eventTemplate.read
  );

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
