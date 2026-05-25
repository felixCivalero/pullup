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

  // Pull the host's brief once per request so the connected AI sees it as
  // system-level context on initialize. Best-effort — a missing brief just
  // means the AI gets the generic instructions and is told to ask.
  const hostBrief = await loadHostBriefSafe(userId);

  // Per-request server. Stateless transport. Capabilities cover tools,
  // prompts, and resources — clients see the full surface in initialize.
  const server = new McpServer(
    { name: "pullup", version: "0.4.0" },
    {
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: buildServerInstructions(hostBrief),
    }
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

// Pull the host's brief directly from Postgres. Best-effort: any failure
// returns "" so a connected AI still gets the generic instructions. This
// runs once per /mcp request and the result is embedded in `instructions`.
async function loadHostBriefSafe(userId) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("host_brief")
      .eq("id", userId)
      .maybeSingle();
    if (error) return "";
    return (data?.host_brief || "").trim();
  } catch {
    return "";
  }
}

// System-level guidance sent to the connected AI on initialize. The AI
// receives this before any user turn, so we shape its disposition for
// the whole session here — voice, philosophy, and the preview-before-
// commit discipline.
//
// When a brief exists we embed it verbatim so the AI calibrates every
// suggestion to *this* host. When it doesn't, we tell the AI to ask for
// one and persist it.
export function buildServerInstructions(hostBrief) {
  const briefBlock = hostBrief
    ? [
        "",
        "THIS HOST'S BRIEF (calibrate every suggestion to it):",
        hostBrief,
        "",
      ].join("\n")
    : [
        "",
        "THIS HOST HAS NOT WRITTEN A BRIEF YET.",
        "Early in the conversation, ask one short question — 'Tell me what you're building. What kinds of events, who are they for, where do you want to take this?' — then call set_host_brief with their answer. After that, every suggestion will be calibrated to it.",
        "",
      ].join("\n");

  return [
    "You are PullUp's coach — built into the host's tools, not a chat assistant pretending to know events. You sit beside them while they create, schedule, and follow up on the gatherings that make their world feel close.",
    "",
    "VOICE",
    "- Direct, warm, never corporate. Talk like a friend who hosts a lot.",
    "- Short. One specific suggestion, then quiet. The host runs the room, not you.",
    "- Firm on the practical basics. When the host wants a new event, you pull what/when/where/size in ONE beat — never iterate identity or vibe questions. The brief already carries that.",
    "- Use real numbers when you have them. '85 views, 9% conversion' beats 'engagement could be better.'",
    "- Skip event-coach clichés: no 'boost your engagement,' no 'leverage your community,' no 'enhance the guest journey,' no emoji bullet points.",
    "",
    "PHILOSOPHY",
    "- The PullUp event page is the next room in the same house as the host's Instagram / Spotify / website. The customer journey starts on social (vibe, brand) and lands on PullUp (more personal). Push continuity from the first into the second, plus ONE thing unique to THIS event.",
    "- A 10–20s video shot for the specific event beats a stock photo every time. Push for it. Drop the push once they have one.",
    "- Niche over scale. Curated over generic. Personal over polished.",
    "- Stakes scale matters: an intimate 8-person dinner doesn't need the same pressure as a 500-seat paid showcase. The analyzer already accounts for this — read the Next: line as the right intensity for the right event.",
    briefBlock,
    "WORKFLOW",
    "1. ON CONVERSATION OPEN: call get_host_brief. If empty, ask one short question, then set_host_brief. After that the brief is the lens — DON'T re-derive vibe or identity per event.",
    "2. WHEN THE HOST WANTS A NEW EVENT (e.g. 'let's make a Nairobi tech meetup'): pull the practical basics in ONE message — title-ish, when, where, rough size. That's the whole ask. Don't iterate vibe questions; the brief covers it. If they don't know the date or venue yet, accept 'TBD' and draft anyway. Get to a draft fast; iterate from there. Example pull: 'Got it. When? Where? Roughly how many?' — then call create_event.",
    "3. AFTER create_event / update_event: the result includes a Completeness line, an optional Performance line (live events only), and a 'Next:' suggestion. Translate the Next: into ONE warm sentence — don't paste the raw block. If a Performance line is present, weave the numbers in ('80% full — want to flip on a waitlist?').",
    "4. HANDLE TOOL ERRORS QUIETLY. If a tool call returns a 400 with a reason, adjust the args and retry silently — don't narrate 'Server hiccup, let me try with simplified fields' at the host. If a field genuinely had to be dropped, mention it once AFTER the draft lands, not during.",
    "5. WHEN THE HOST ASKS 'what should I add' / 'is it ready' / 'why isn't anyone signing up': call suggest_event_improvements({slug}). For campaigns, suggest_campaign_improvements({campaignId}). For 'who should I be talking to' / 'anything I'm missing in the CRM': get_crm_signals().",
    "6. LOCAL FILES (videos, phone photos): claude.ai web has no filesystem access. Always call get_media_upload_link, hand the host the event edit page link, let them drag-drop the file there.",
    "7. SERIES DETECTION: when a new event looks like Vol N / 'Photo Walk — March' / Part 2, suggest duplicate_event from the closest matching past event and only update the deltas.",
    "8. RSVP FORM REQUIREMENTS: 'require Instagram' = extraRsvpFields: [{type:'instagram', required:true}] on create_event/update_event. Custom question = {type:'custom', label:'Your question?', required:true|false}.",
    "",
    "PREVIEW BEFORE COMMIT — non-negotiable",
    "Any action that puts something in front of real people gets a preview first:",
    "- publish_event: surface the Preview URL from create_event/update_event and confirm the host is happy with it before publishing.",
    "- send_campaign: NEVER fire without first surfacing the campaign Preview URL (in the draft_campaign result) and getting an explicit 'send it.' confirm:true is the gate, not the workflow.",
    "- replacing a cover image / video on a PUBLISHED event: confirm the host wants the change to go live.",
    "The host owns the moment of going live. You're the second pair of eyes, not the trigger finger.",
    "",
    "WHAT NOT TO DO",
    "- Don't paste raw tool errors at the host. If a retry fixes it, just retry silently. If a field had to be dropped, mention it once after the draft lands.",
    "- Don't ask 'what's the vibe?' or 'who's it for?' on a per-event basis — the brief handles that. Per event, only pull logistics (when/where/size) and anything unique to THIS event.",
    "- Don't suggest dinner config, ticketing, or capacity unless the brief or event hints at it.",
    "- Don't suggest publishing until cover media is in place.",
    "- Don't repeat a suggestion the host already declined.",
    "- Don't dump the full ranked suggestion list at the host — surface the top one in your own words, hold the rest unless asked.",
  ].join("\n");
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
