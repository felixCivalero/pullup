// Routes: public idea submission ("/ideas") with a per-IP in-memory rate limit.
// Extracted verbatim from index.js.

import { getUserProfile } from "../data.js";
import { optionalAuth } from "../middleware/auth.js";

const ideasRateLimit = new Map(); // IP -> { count, resetAt }
// Prune expired rate-limit entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ideasRateLimit) {
    if (entry.resetAt <= now) ideasRateLimit.delete(ip);
  }
}, 10 * 60 * 1000);

export function registerIdeaRoutes(app) {
  app.post("/ideas", optionalAuth, async (req, res) => {
    try {
      // Rate limit: 5 per hour per IP
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
      const now = Date.now();
      const entry = ideasRateLimit.get(ip);
      if (entry && entry.resetAt > now) {
        if (entry.count >= 5) {
          return res.status(429).json({ error: "Too many ideas submitted. Try again later." });
        }
        entry.count++;
      } else {
        ideasRateLimit.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
      }

      const { body, pageUrl } = req.body || {};
      if (!body || typeof body !== "string" || !body.trim()) {
        return res.status(400).json({ error: "body is required" });
      }
      if (body.length > 2000) {
        return res.status(400).json({ error: "body must be 2000 characters or fewer" });
      }

      const row = {
        body: body.trim(),
        page_url: pageUrl || null,
        status: "new",
      };

      if (req.user) {
        row.user_id = req.user.id;
        row.user_email = req.user.email;
        try {
          const profile = await getUserProfile(req.user.id);
          row.user_name = profile?.name || null;
        } catch (_) {
          row.user_name = null;
        }
      }

      const { supabase } = await import("../supabase.js");
      const { error } = await supabase.from("ideas").insert(row);
      if (error) throw error;

      return res.status(201).json({ ok: true });
    } catch (error) {
      console.error("[ideas] Error submitting idea:", error);
      return res.status(500).json({ error: "Failed to submit idea" });
    }
  });
}
