// useHostActions — subscribes to the host's own action log over Supabase
// Realtime and fires a callback when an action arrives that matches an
// optional filter (target type+id, tool name, source).
//
// Wires the chat ↔ UI live sync: when an MCP client (claude.ai, ChatGPT,
// Cursor) publishes an event or sends a campaign, the host's open browser
// tab learns about it within ~100ms and the page can refetch / banner /
// toast in response.
//
// By default the hook ignores `source === "ui"` rows so the host's own
// in-tab actions don't trigger a redundant refetch (the optimistic UI
// already reflects them). Multi-tab UI sync is out of scope for v1.

import { useEffect, useRef } from "react";
import { supabase } from "./supabase.js";

/**
 * @param {object} opts
 * @param {function(object): void} opts.onInsert  Fired with the new row.
 * @param {string} [opts.targetType]   Filter: only fire when row.target_type matches.
 * @param {string} [opts.targetId]     Filter: only fire when row.target_id matches.
 * @param {string[]} [opts.tools]      Filter: only fire when row.tool is in this list.
 * @param {string[]} [opts.sources]    Filter sources. Default: everything except "ui".
 * @param {boolean} [opts.enabled]     Default true. Pass false to short-circuit (e.g. waiting on auth).
 */
export function useHostActions({
  onInsert,
  targetType,
  targetId,
  tools,
  sources,
  enabled = true,
} = {}) {
  // Stash latest filter/callback in a ref so the channel only resubscribes
  // when `enabled` or the user's session changes — not on every render.
  // Mutations happen in a layout effect so we never write to refs during
  // render (React strict-mode flags that as a side effect).
  const cbRef = useRef(onInsert);
  const filterRef = useRef({ targetType, targetId, tools, sources });
  useEffect(() => {
    cbRef.current = onInsert;
    filterRef.current = { targetType, targetId, tools, sources };
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let channel = null;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || cancelled) return;

      // host-scoped channel name keeps server-side fan-out tight even if
      // many users are listening at once.
      channel = supabase
        .channel(`host_actions:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "host_actions",
            filter: `host_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload?.new;
            if (!row) return;
            const f = filterRef.current;
            const allowedSources = f.sources || ["chat", "sdk", "system"];
            if (!allowedSources.includes(row.source)) return;
            if (f.targetType && row.target_type !== f.targetType) return;
            if (f.targetId && String(row.target_id) !== String(f.targetId)) return;
            if (f.tools && !f.tools.includes(row.tool)) return;
            try {
              cbRef.current?.(row);
            } catch (err) {
              console.warn("[useHostActions] callback error:", err?.message);
            }
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled]);
}
