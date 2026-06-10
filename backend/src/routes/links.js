// Link routes: short-link redirect /i/:code (migration 074) + partner click tracking.

import { optionalAuth } from "../middleware/auth.js";

export function registerLinkRoutes(app) {
  // ---------------------------
  // SHORT LINKS: /i/:code → 302 to the full canonical URL (migration 074)
  // Reachable today at /api/i/:code via the nginx /api proxy (no infra change);
  // works at a bare /i/:code too if a root nginx location is later added.
  // ---------------------------
  app.get("/i/:code", async (req, res) => {
    const home = (process.env.APP_BASE_URL || "https://pullup.se").replace(/\/+$/, "") + "/";
    try {
      const { resolveShortLink } = await import("../services/shortLinks.js");
      const target = await resolveShortLink(req.params.code);
      return res.redirect(302, target || home);
    } catch (err) {
      console.error("Error resolving short link:", err?.message);
      return res.redirect(302, home);
    }
  });

  // ---------------------------
  // PARTNER CLICK TRACKING
  // ---------------------------
  app.post("/partner-clicks", optionalAuth, async (req, res) => {
    try {
      const { partnerSlug, eventId, placement } = req.body;

      if (!partnerSlug || !eventId || !placement) {
        return res.status(400).json({ error: "partnerSlug, eventId, and placement are required" });
      }

      const userId = req.user?.id || null;
      const userAgent = (req.headers["user-agent"] || "").slice(0, 500);
      const ipAddress = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;

      const { supabase } = await import("../supabase.js");
      const { error } = await supabase.from("partner_clicks").insert({
        partner_slug: partnerSlug,
        user_id: userId,
        event_id: eventId,
        placement,
        user_agent: userAgent,
        ip_address: ipAddress,
      });

      if (error) {
        console.error("Supabase insert error:", error);
        return res.status(500).json({ error: "Failed to record click" });
      }

      res.status(201).json({ ok: true });
    } catch (err) {
      console.error("Error recording partner click:", err);
      res.status(500).json({ error: "Failed to record click" });
    }
  });
}
