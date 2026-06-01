// Create-canvas chat: a head on the spine. The host converses; Claude builds
// the event page by calling our own MCP tools — but only the /create surface,
// so the canvas can build but never refund, send, or delete. PullUp holds the
// Anthropic key (server-side), and a short-lived PAT authorizes the connector
// back into our MCP for the duration of the turn.

import Anthropic from "@anthropic-ai/sdk";

import { createPersonalAccessToken } from "../data.js";

const MODEL = process.env.CANVAS_MODEL || "claude-sonnet-4-6";
// Generative hero scenes are multiple KB of code written INTO a single tool
// call, so a low cap truncates the call mid-argument (stop_reason "max_tokens")
// and it never executes. This is a ceiling, not a target — short text edits
// still return fast — so keep it roomy enough for a full scene + a vibe-match
// update_event + the reply in one turn.
const MAX_TOKENS = Number(process.env.CANVAS_MAX_TOKENS) || 16384;
const MCP_CLIENT_BETA = "mcp-client-2025-04-04";

// The canvas always rides the /create profile — the blast-radius-limited slice.
const CANVAS_PROFILE = "create";

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// The connector needs a PAT to authorize back into our MCP. We mint one per
// host per day and cache the plaintext in process memory (never persisted),
// so a busy canvas session is one DB row, not one per message. Refresh when
// it's gone or within an hour of expiry.
const CANVAS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const _tokenCache = new Map(); // userId -> { token, expMs }

export async function getCanvasMcpToken(userId, now = Date.now()) {
  const cached = _tokenCache.get(userId);
  if (cached && cached.expMs - now > 60 * 60 * 1000) return cached.token;
  const expMs = now + CANVAS_TOKEN_TTL_MS;
  const pat = await createPersonalAccessToken({
    userId,
    name: "PullUp Canvas (auto)",
    expiresAt: new Date(expMs).toISOString(),
  });
  _tokenCache.set(userId, { token: pat.token, expMs });
  return pat.token;
}

// Pure: assemble the Anthropic beta.messages.create payload. Kept separate from
// the network call so the load-bearing bits (which surface, which beta, token
// forwarding) are unit-testable without hitting the API.
export function buildCanvasRequest({ messages, system, mcpToken, model, mcpBaseUrl }) {
  const base = String(mcpBaseUrl || "").replace(/\/+$/, "");
  return {
    model: model || MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
    betas: [MCP_CLIENT_BETA],
    mcp_servers: [
      {
        type: "url",
        url: `${base}/${CANVAS_PROFILE}`,
        name: "pullup",
        authorization_token: mcpToken,
      },
    ],
  };
}

// Run one canvas turn. Thin wrapper over the API — the connector executes any
// tool calls server-side against our /create surface, so the returned message
// already reflects a completed build step. Returns the assistant text plus the
// names of any tools Claude invoked (for the activity narration / preview
// refresh signal).
export async function runCanvasTurn({ messages, system, mcpToken, model, mcpBaseUrl }) {
  const req = buildCanvasRequest({ messages, system, mcpToken, model, mcpBaseUrl });
  const res = await getClient().beta.messages.create(req);

  const reply = (res.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Pair each tool call with its result so we can tell the host the truth: a
  // tool the model *invoked* isn't a tool that *succeeded*. The connector emits
  // an mcp_tool_use block (call, has id+name) and an mcp_tool_result block
  // (has tool_use_id + is_error). Without this, a failed update_event still
  // reads as "✓ updated the page" — the exact "said it did but didn't" bug.
  const calls = (res.content || []).filter(
    (b) => b.type === "mcp_tool_use" || b.type === "tool_use",
  );
  const resultsById = new Map(
    (res.content || [])
      .filter((b) => b.type === "mcp_tool_result" || b.type === "tool_result")
      .map((b) => [b.tool_use_id, b]),
  );

  const toolsUsed = [];   // executed on our server, no error
  const toolsFailed = []; // executed, returned is_error
  const toolsUnrun = [];  // model emitted a call that NEVER executed (no result)
  for (const c of calls) {
    if (!c.name) continue;
    const r = resultsById.get(c.id);
    if (!r) toolsUnrun.push(c.name);          // e.g. connector didn't attach tools
    else if (r.is_error) toolsFailed.push(c.name);
    else toolsUsed.push(c.name);
  }

  // Boundary diagnostic: the exact response shape, so we can tell from the DB
  // whether the MCP connector attached/executed our tools at all.
  const diag = {
    sr: res.stop_reason,
    b: (res.content || []).map((x) => x.type),
    run: toolsUsed,
    fail: toolsFailed,
    unrun: toolsUnrun,
  };

  return { reply, toolsUsed, toolsFailed, toolsUnrun, stopReason: res.stop_reason, diag };
}
