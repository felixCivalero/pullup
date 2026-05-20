// Fire-and-forget telemetry for MCP tool calls.
//
// One row per call into mcp_tool_calls. We intentionally never persist
// arguments or results — the table is a forensic trail ("did Adam's
// create_event fail at 14:32?"), not an analytics warehouse. Keeps PII
// out of an easy-to-query table.
//
// Recording is async-but-unawaited so it never adds latency to the tool
// response Claude sees.

import { supabase } from "../supabase.js";

const ERROR_EXCERPT_MAX = 240;

export function recordToolCall({ userId, tokenId, requestId, toolName, ok, durationMs, error }) {
  try {
    const row = {
      user_id: userId || null,
      token_id: tokenId || null,
      request_id: requestId || null,
      tool_name: String(toolName || "unknown").slice(0, 80),
      ok: !!ok,
      duration_ms: Math.max(0, Math.round(Number(durationMs) || 0)),
      error_excerpt: ok
        ? null
        : String(error?.message || error || "")
            .slice(0, ERROR_EXCERPT_MAX) || null,
    };
    // No await, no .then chain that could throw — telemetry failures must
    // not surface to the user.
    supabase.from("mcp_tool_calls").insert(row).then(() => {}, () => {});
  } catch {
    // swallow
  }
}
