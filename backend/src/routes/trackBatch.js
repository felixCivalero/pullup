// Public batched analytics ingest — POST /t/batch.
//
// The frontend SDK (frontend/src/lib/track.js) queues events and flushes them
// here in batches (timer / queue-size / pagehide-sendBeacon). Every event
// carries a client-minted UUID, so ingestion is exactly-once by construction:
// we upsert with ON CONFLICT (client_event_id) DO NOTHING and retries can
// never double-count. The endpoint does one bulk insert and nothing else —
// guest-page latency is untouched.
//
// Supersedes /t/pageview + /t/event for the landing page (those stay mounted
// for old cached bundles; their tables are frozen, backfilled into
// analytics_events by migration 079).

import {
  validateBatch,
  deriveSource,
  isBotUserAgent,
} from "../analytics/eventRegistry.js";

export function registerTrackBatchRoutes(app) {
  app.post("/t/batch", async (req, res) => {
    try {
      // Bots get a happy 204 — no rows, no error for them to retry on.
      if (isBotUserAgent(req.headers["user-agent"])) return res.status(204).end();

      const result = validateBatch(req.body);
      if (result.error) return res.status(400).json({ error: result.error });
      const { rows, dropped } = result;
      if (rows.length === 0) return res.json({ ok: true, inserted: 0, dropped });

      const source = deriveSource(req.body?.referrer, req.body?.utm);
      for (const row of rows) row.source = source;

      const { supabase } = await import("../supabase.js");
      const { error } = await supabase
        .from("analytics_events")
        .upsert(rows, { onConflict: "client_event_id", ignoreDuplicates: true });
      if (error) throw error;

      return res.json({ ok: true, inserted: rows.length, dropped });
    } catch (err) {
      console.error("[t/batch] error:", err.message);
      return res.status(500).json({ error: "Failed to record events" });
    }
  });
}
