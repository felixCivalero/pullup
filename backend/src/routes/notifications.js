// Host NOTIFICATIONS routes — opt-in, default-OFF, email-only daily digest.
// GET/PUT the host's preference, and a "test" button that sends the digest
// built from their REAL last-24h activity to their contact email right now.
//
// Same auth as the rest of /host/* (requireAuth). All orchestration lives in
// services/notificationDigest.js so the routes stay thin.

import { requireAuth } from "../middleware/auth.js";

export function registerNotificationRoutes(app) {
  // Current prefs (or defaults when the host has no row yet).
  app.get("/host/notifications", requireAuth, async (req, res) => {
    try {
      const { getHostPrefs } = await import("../services/notificationDigest.js");
      const prefs = await getHostPrefs(req.user.id, { authEmail: req.user.email || "" });
      res.json(prefs);
    } catch (e) {
      console.error("[host/notifications:get]", e.message);
      res.status(500).json({ error: "failed" });
    }
  });

  // Upsert prefs. Body { enabled, frequency?, categories?:{partial} }.
  app.put("/host/notifications", requireAuth, async (req, res) => {
    try {
      const { putHostPrefs } = await import("../services/notificationDigest.js");
      const prefs = await putHostPrefs(req.user.id, req.body || {}, { authEmail: req.user.email || "" });
      res.json(prefs);
    } catch (e) {
      console.error("[host/notifications:put]", e.message);
      res.status(500).json({ error: "failed" });
    }
  });

  // Send a digest right now from the host's real last-24h activity. Always
  // sends (force:true) — when there's nothing, the email is a friendly format
  // preview so the host can see what their daily summary will look like.
  app.post("/host/notifications/test", requireAuth, async (req, res) => {
    try {
      const { sendHostDigest } = await import("../services/notificationDigest.js");
      const r = await sendHostDigest(req.user.id, { force: true, preview: true, authEmail: req.user.email || "" });
      if (!r.ok) {
        return res.status(400).json({ ok: false, error: r.error || "failed" });
      }
      res.json({ ok: true, sentTo: r.sentTo });
    } catch (e) {
      console.error("[host/notifications:test]", e.message);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });
}
