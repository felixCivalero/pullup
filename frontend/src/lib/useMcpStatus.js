// useMcpStatus — is the current host's PullUp MCP connected?
//
// Powers the floating widget's mode switch: when connected, the slot shows
// the gold "PullUp" pill; otherwise it shows the "Connect MCP" promo.
//
// Cached per mount to avoid hitting /host/mcp/status on every render.
// Refreshes only when the dependent auth user changes.

import { useEffect, useState } from "react";
import { authenticatedFetch } from "./api.js";

export function useMcpStatus(user) {
  const [status, setStatus] = useState({ connected: false, loading: true });

  useEffect(() => {
    if (!user) {
      setStatus({ connected: false, loading: false, notAuthed: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await authenticatedFetch("/host/mcp/status");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setStatus({
            connected: !!data.connected,
            activeCount: data.activeCount || 0,
            lastUsedAt: data.lastUsedAt || null,
            loading: false,
          });
        }
      } catch (err) {
        if (!cancelled) {
          // Best-effort. On failure, default to "not connected" — the worst
          // outcome is the host sees the promo when they shouldn't, which
          // is harmless.
          console.warn("[useMcpStatus] fetch failed:", err?.message);
          setStatus({ connected: false, loading: false, error: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return status;
}
