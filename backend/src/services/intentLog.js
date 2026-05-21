// intentLog — every mutating host action lands here, in MCP-tool shape.
//
// One write path, two sources: the web UI (REST endpoints) and the chat
// client (MCP tools, which loopback through the same REST endpoints with an
// X-Source header). Logged rows are replayable in principle — `tool` matches
// an MCP tool name, `args` matches that tool's input schema.
//
// Intentionally best-effort: a failed log write must never break the parent
// request. Worst case we lose a row from the timeline; the user's action
// still went through.

import { supabase } from "../supabase.js";

// Pull the source tag off a request. MCP's loopback `api()` helper stamps
// X-Source: chat; everything else defaults to 'ui'. Override available for
// background jobs (cron, webhooks) that aren't tied to a request.
export function sourceFromRequest(req) {
  const raw = req?.headers?.["x-source"];
  if (typeof raw === "string") {
    const v = raw.toLowerCase().trim();
    if (v === "chat" || v === "sdk" || v === "system") return v;
  }
  return "ui";
}

/**
 * Record a host action. Never throws.
 *
 * @param {object} p
 * @param {string} p.hostId       Required. The host who performed the action.
 * @param {string} p.tool         MCP tool name (e.g. "publish_event").
 * @param {object} [p.args]       Tool args / request body. PII may live here; this
 *                                table is host-scoped (RLS: select-your-own).
 * @param {string} p.source       'ui' | 'chat' | 'sdk' | 'system'.
 * @param {object} [p.target]     { type, id } — e.g. { type: 'event', id: '...' }.
 * @param {object} [p.result]     Short outcome — slug, new status, recipient count, etc.
 */
export async function emitIntent({ hostId, tool, args, source, target, result }) {
  if (!hostId || !tool || !source) {
    // Misconfigured caller — log and move on. Don't crash the request.
    console.warn("[intentLog] skipped (missing fields):", { hostId, tool, source });
    return;
  }
  try {
    const row = {
      host_id: hostId,
      tool,
      args: args || {},
      source,
      target_type: target?.type || null,
      target_id: target?.id != null ? String(target.id) : null,
      result: result || null,
    };
    const { error } = await supabase.from("host_actions").insert(row);
    if (error) {
      console.warn("[intentLog] insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[intentLog] unexpected error:", err?.message);
  }
}
