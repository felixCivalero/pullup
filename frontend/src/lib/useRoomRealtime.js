// useRoomRealtime — live Room messaging over Supabase Realtime.
//
// Subscribes to the host's OWN person_events (RLS-scoped via migration 071) and
// fires a callback the instant a row lands: an inbound reply (message_in), an
// outbound bubble from another device (message_out), or a delivery-status
// upgrade (sent → delivered → read / failed). This is what makes the chat feel
// instant — no polling, the webhook write streams straight to the open thread.
//
// Mirrors useHostActions: host-scoped channel name, filter on host_id so the
// server fan-out stays tight, callback stashed in a ref so we don't resubscribe
// on every render.

import { useEffect, useRef } from "react";
import { supabase } from "./supabase.js";

const MESSAGE_TYPES = new Set(["message_in", "message_out", "auto_dm_sent"]);

// Raw person_events row → the thread-item shape the Room UIs already render
// (matches roomService.buildThread, so realtime rows merge seamlessly).
export function mapEventRow(row) {
  const md = row.metadata || {};
  const atts = Array.isArray(md.attachments) && md.attachments.length ? md.attachments : undefined;
  return {
    id: row.id,
    clientId: md.client_id || undefined,
    personId: row.person_id,
    from: row.direction === "in" ? "them" : row.direction === "out" ? "you" : "system",
    text: row.body || "",
    atts,
    event: md.event && md.event.title ? md.event : undefined,
    location: md.location && md.location.url ? md.location : undefined,
    channel: row.channel || undefined,
    status: row.direction === "out" ? (md.status || "sent") : undefined,
    at: row.occurred_at || row.created_at || null,
    time: "now",
    type: row.type,
  };
}

/**
 * @param {object} opts
 * @param {(e: {eventType:'INSERT'|'UPDATE', row:object}) => void} opts.onMessage
 *   Fired for message_in / message_out / auto_dm_sent rows only.
 * @param {boolean} [opts.enabled] Default true.
 */
export function useRoomRealtime({ onMessage, enabled = true } = {}) {
  const cbRef = useRef(onMessage);
  useEffect(() => { cbRef.current = onMessage; });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let channel = null;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || cancelled) return;

      // Unique per subscriber — the dock and a person panel can be mounted at
      // once, and two subscriptions to the same topic collide.
      const topic = `room_events:${userId}:${Math.random().toString(36).slice(2, 8)}`;
      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "person_events", filter: `host_id=eq.${userId}` },
          (payload) => {
            const row = payload?.new;
            const eventType = payload?.eventType;
            if (!row || (eventType !== "INSERT" && eventType !== "UPDATE")) return;
            if (!MESSAGE_TYPES.has(row.type)) return;
            try {
              cbRef.current?.({ eventType, row: mapEventRow(row) });
            } catch (err) {
              console.warn("[useRoomRealtime] callback error:", err?.message);
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
