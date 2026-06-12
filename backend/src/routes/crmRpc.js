// CRM summary RPC endpoints (host_crm_summary & friends), the host action log,
// coach action suggestions, and follow-up campaign image uploads.

import crypto from "crypto";

import { requireAuth } from "../middleware/auth.js";
import { sniffUploadedImage } from "../lib/uploads.js";

// ---------------------------
// PROTECTED: Aggregate summaries for the MCP.
// ---------------------------
// All five endpoints below are thin wrappers around Postgres functions in
// migrations/022 and 023. Each is a single round-trip — no Node-side
// aggregation, no per-event fan-out. Used by the MCP get_*_summary tools
// so Claude can answer questions like "how much have I made", "are my
// events growing", "what happened this week" in one shot.
function clampInt(raw, def, min, max) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function makeRpcHandler(funcName, paramShape) {
  // paramShape: { topN: { default, min, max } } or { months: ... } etc.
  return async (req, res) => {
    try {
      const params = { p_user_id: req.user.id };
      for (const [key, spec] of Object.entries(paramShape)) {
        params[spec.pgName] = clampInt(req.query[key], spec.default, spec.min, spec.max);
      }
      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase.rpc(funcName, params);
      if (error) {
        console.error(`${funcName} RPC error:`, error);
        return res.status(500).json({ error: `Failed to load ${funcName}` });
      }
      return res.json(data || {});
    } catch (err) {
      console.error(`${funcName} handler error:`, err);
      return res.status(500).json({ error: `Failed to load ${funcName}` });
    }
  };
}

export function registerCrmRpcRoutes(app) {
  app.get("/host/crm/summary",  requireAuth, makeRpcHandler("host_crm_summary",        { topN:   { pgName: "p_top_n",  default: 5,  min: 1, max: 20 } }));
  app.get("/host/crm/revenue",  requireAuth, makeRpcHandler("host_revenue_summary",    { topN:   { pgName: "p_top_n",  default: 5,  min: 1, max: 20 } }));
  app.get("/host/crm/trends",   requireAuth, makeRpcHandler("host_attendance_trends",  { months: { pgName: "p_months", default: 12, min: 1, max: 60 } }));
  app.get("/host/crm/segments", requireAuth, makeRpcHandler("host_audience_segments",  { topN:   { pgName: "p_top_n",  default: 5,  min: 1, max: 20 } }));
  app.get("/host/crm/recent",   requireAuth, makeRpcHandler("host_recent_activity",    { days:   { pgName: "p_days",   default: 30, min: 1, max: 365 } }));
  // GET /host/actions/recent — the host's own action log (UI + chat), newest
  // first. Backs the MCP get_recent_actions tool and the (future) "what did I
  // do this week?" surface inside the app.
  app.get("/host/actions/recent", requireAuth, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const sinceParam = req.query.since;
      let q = supabase
        .from("host_actions")
        .select("id, tool, args, source, target_type, target_id, result, created_at")
        .eq("host_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (sinceParam) {
        const sinceIso = new Date(sinceParam).toISOString();
        q = q.gte("created_at", sinceIso);
      }
      if (req.query.targetType) q = q.eq("target_type", String(req.query.targetType));
      if (req.query.targetId) q = q.eq("target_id", String(req.query.targetId));
      if (req.query.source) q = q.eq("source", String(req.query.source));
      const { data, error } = await q;
      if (error) {
        console.error("Error fetching host actions:", error);
        return res.status(500).json({ error: "Failed to fetch actions", message: error.message });
      }
      res.json({ items: data || [] });
    } catch (err) {
      console.error("Error in /host/actions/recent:", err);
      res.status(500).json({ error: "Failed to fetch actions", message: err.message });
    }
  });

  // GET /host/coach/actions — surface-aware one-tap action suggestions.
  //
  // Wraps the suggestion engine (analyzeEvent / analyzeCrmSignals) and maps
  // each suggestion key to a UI-friendly intent
  // (navigate / modal / mcp). Returns up to `limit` items, top by score.
  //
  // Used by the in-product CoachActions widget — same brain that produces the
  // MCP banner's "Next:" line, now rendered as buttons.
  app.get("/host/coach/actions", requireAuth, async (req, res) => {
    try {
      const surface = String(req.query.surface || "").toLowerCase();
      const id = req.query.id ? String(req.query.id) : null;
      const limit = Math.min(5, Math.max(1, Number(req.query.limit) || 3));

      const {
        analyzeEvent,
        analyzeCrmSignals,
      } = await import("../mcp/suggestions.js");
      const {
        keyToEventIntent,
        keyToCrmIntent,
      } = await import("../services/coachIntents.js");
      const {
        findEventBySlug,
        findEventById,
        getUserProfile,
      } = await import("../data.js");

      async function loadBrief() {
        try {
          const p = await getUserProfile(req.user.id);
          return p?.hostBrief || "";
        } catch {
          return "";
        }
      }

      let suggestions = [];
      let mapper = () => null;
      let ctx = {};

      if (surface === "event") {
        if (!id) return res.status(400).json({ error: "id required for surface=event" });
        const ev = (await findEventBySlug(id, req.user?.id || null)) || (await findEventById(id));
        if (!ev) return res.status(404).json({ error: "Event not found" });
        const brief = await loadBrief();
        // Pull analytics for PUBLISHED events so perf_* suggestions surface
        // (capped waitlist, filling-up, quiet promo, weak campaigns). Loopback
        // through the auth'd REST endpoint so the analytics math stays in one
        // place. Best-effort — if it fails the non-perf keys still work.
        let analytics = null;
        if (ev.status === "PUBLISHED") {
          try {
            const PORT = process.env.PORT || 3001;
            const base = (
              process.env.PULLUP_INTERNAL_API_BASE || `http://127.0.0.1:${PORT}`
            ).replace(/\/+$/, "");
            const periodEnd = new Date();
            const periodStart = new Date(periodEnd.getTime() - 30 * 86400000);
            const q = new URLSearchParams({
              startDate: periodStart.toISOString(),
              endDate: periodEnd.toISOString(),
            });
            const r = await fetch(`${base}/host/events/${ev.id}/analytics?${q}`, {
              headers: { Authorization: req.headers.authorization || "" },
            });
            if (r.ok) analytics = await r.json();
          } catch (e) {
            console.warn("[coach] analytics fetch failed:", e?.message);
          }
        }
        const result = analyzeEvent({ event: ev, brief, media: [], allEvents: [], analytics });
        suggestions = result.suggestions || [];
        mapper = keyToEventIntent;
        ctx = { event: ev };
      } else if (surface === "crm") {
        const brief = await loadBrief();
        // The CRM analyzer reads from segments + recent. Skip the heavy fetches
        // for v1 — pass empty defaults; the analyzer's brief-aware paths still
        // emit useful signals.
        const result = analyzeCrmSignals({ segments: null, recent: null, brief });
        suggestions = result.suggestions || [];
        mapper = keyToCrmIntent;
        ctx = {};
      } else {
        return res.status(400).json({
          error: "Unknown surface",
          message: "surface must be one of: event, campaign, crm",
        });
      }

      const items = [];
      for (const s of suggestions) {
        const intent = mapper(s.key, s, ctx);
        if (!intent) continue;
        items.push({
          key: s.key,
          headline: s.headline,
          why: s.why || null,
          intent,
          // destructive: false in v1 — none of today's suggestion keys map to a
          // destructive intent (no send/publish/delete buttons surfaced yet).
          destructive: false,
        });
        if (items.length >= limit) break;
      }

      res.json({ items, surface });
    } catch (err) {
      console.error("Coach actions error:", err);
      res.status(500).json({ error: "Failed to load coach actions", message: err.message });
    }
  });

  // POST /host/crm/follow-up-images - Upload an image for a follow-up campaign block
  app.post("/host/crm/follow-up-images", requireAuth, async (req, res) => {
    try {
      const { imageData } = req.body;
      let sniff;
      try {
        sniff = sniffUploadedImage(imageData, {
          maxBytes: 2 * 1024 * 1024,
          label: "Image",
        });
      } catch (e) {
        return res.status(e.statusCode || 400).json(e.body);
      }
      const { buffer, extension, mime } = sniff;
      const fileName = `crm/${req.user.id}/${crypto.randomUUID()}.${extension}`;
      const { supabase } = await import("../supabase.js");
      const { error } = await supabase.storage
        .from("event-images")
        .upload(fileName, buffer, { contentType: mime, upsert: false });
      if (error) {
        console.error("CRM image upload error:", error);
        return res.status(500).json({ error: "Failed to upload image" });
      }
      const { data: { publicUrl } } = supabase.storage.from("event-images").getPublicUrl(fileName);
      return res.json({ url: publicUrl });
    } catch (err) {
      console.error("CRM image upload exception:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });
}
