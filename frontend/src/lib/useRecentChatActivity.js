// useRecentChatActivity — "has the AI recently touched this resource?"
//
// The coach widget is the AI's lingering presence on a host page. It should
// appear when the host arrives from an MCP handoff (or when chat just did
// something here) and quietly disappear when the AI hasn't been around for a
// while. This hook owns that signal.
//
// Two inputs:
//   1. Initial fetch of /host/actions/recent with a since-filter — tells us
//      whether the AI has touched this resource in the last N minutes at
//      page load.
//   2. Realtime subscription via useHostActions — flips hasActivity true the
//      moment a fresh chat action lands while the page is open.

import { useEffect, useState } from "react";
import { authenticatedFetch } from "./api.js";
import { useHostActions } from "./useHostActions.js";

/**
 * @param {object} opts
 * @param {string} opts.targetType   "event" | "campaign" | "rsvp" | ...
 * @param {string} opts.targetId
 * @param {number} [opts.minutes]    Look-back window. Default 30.
 * @param {boolean} [opts.enabled]   Default true.
 * @returns {{ hasActivity: boolean, loading: boolean, lastAction: object|null }}
 */
export function useRecentChatActivity({
  targetType,
  targetId,
  minutes = 30,
  enabled = true,
} = {}) {
  const [hasActivity, setHasActivity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastAction, setLastAction] = useState(null);

  useEffect(() => {
    if (!enabled || !targetType || !targetId) {
      setLoading(false);
      setHasActivity(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
        const params = new URLSearchParams({
          since,
          targetType,
          targetId: String(targetId),
          source: "chat",
          limit: "1",
        });
        const res = await authenticatedFetch(`/host/actions/recent?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const first = (data.items && data.items[0]) || null;
        setLastAction(first);
        setHasActivity(!!first);
      } catch (err) {
        if (!cancelled) {
          // Best-effort. If the gate fetch fails, default to hidden so the
          // host doesn't get ambient widget noise from a transient outage.
          console.warn("[useRecentChatActivity] gate fetch failed:", err?.message);
          setHasActivity(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, targetType, targetId, minutes]);

  // Live promotion: if an MCP action lands on this resource while the page is
  // open, the widget should appear immediately.
  useHostActions({
    enabled: enabled && !!targetType && !!targetId,
    targetType,
    targetId,
    sources: ["chat"],
    onInsert: (row) => {
      setLastAction(row);
      setHasActivity(true);
    },
  });

  return { hasActivity, loading, lastAction };
}
