// Content planner routes — host planner cards + timelines (lanes) CRUD,
// plus signed-upload-URL minting for planner media.
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { extensionFromMime } from "../lib/uploads.js";

export function registerPlannerRoutes(app) {
  // ---------------------------
  // PROTECTED: Content Planner — cards + media upload (requires auth)
  // ---------------------------
  app.get("/host/planner/cards", requireAuth, async (req, res) => {
    try {
      const { getPlannerCards } = await import("../data.js");
      res.json({ cards: await getPlannerCards(req.user.id) });
    } catch (e) {
      console.error("Error loading planner cards:", e);
      res.status(500).json({ error: "Failed to load planner" });
    }
  });

  app.post("/host/planner/cards", requireAuth, async (req, res) => {
    try {
      const { createPlannerCard } = await import("../data.js");
      const result = await createPlannerCard(req.user.id, req.body || {});
      if (result.error === "missing_id") return res.status(400).json({ error: "id required" });
      if (result.error) return res.status(500).json({ error: "Failed to create card" });
      res.status(201).json(result.card);
    } catch (e) {
      console.error("Error creating planner card:", e);
      res.status(500).json({ error: "Failed to create card" });
    }
  });

  app.patch("/host/planner/cards/:id", requireAuth, async (req, res) => {
    try {
      const { updatePlannerCard } = await import("../data.js");
      const result = await updatePlannerCard(req.params.id, req.user.id, req.body || {});
      if (result.error === "not_found") return res.status(404).json({ error: "Card not found" });
      res.json(result.card);
    } catch (e) {
      console.error("Error updating planner card:", e);
      res.status(500).json({ error: "Failed to update card" });
    }
  });

  app.delete("/host/planner/cards/:id", requireAuth, async (req, res) => {
    try {
      const { deletePlannerCard } = await import("../data.js");
      const result = await deletePlannerCard(req.params.id, req.user.id);
      if (result.error === "not_found") return res.status(404).json({ error: "Card not found" });
      if (result.mediaPath) {
        try {
          const { supabase } = await import("../supabase.js");
          await supabase.storage.from("event-images").remove([result.mediaPath]);
        } catch (err) {
          console.error("planner media cleanup failed:", err?.message);
        }
      }
      res.json({ ok: true });
    } catch (e) {
      console.error("Error deleting planner card:", e);
      res.status(500).json({ error: "Failed to delete card" });
    }
  });

  // ─── Planner timelines (lanes) ────────────────────────────────────────
  app.get("/host/planner/timelines", requireAuth, async (req, res) => {
    try {
      const { getPlannerTimelines } = await import("../data.js");
      res.json({ timelines: await getPlannerTimelines(req.user.id) });
    } catch (e) {
      console.error("Error loading planner timelines:", e);
      res.status(500).json({ error: "Failed to load timelines" });
    }
  });

  app.post("/host/planner/timelines", requireAuth, async (req, res) => {
    try {
      const { createPlannerTimeline } = await import("../data.js");
      const result = await createPlannerTimeline(req.user.id, req.body || {});
      if (result.error) return res.status(500).json({ error: "Failed to create timeline" });
      res.status(201).json(result.timeline);
    } catch (e) {
      console.error("Error creating planner timeline:", e);
      res.status(500).json({ error: "Failed to create timeline" });
    }
  });

  app.patch("/host/planner/timelines/:id", requireAuth, async (req, res) => {
    try {
      const { updatePlannerTimeline } = await import("../data.js");
      const result = await updatePlannerTimeline(req.params.id, req.user.id, req.body || {});
      if (result.error === "not_found") return res.status(404).json({ error: "Timeline not found" });
      res.json(result.timeline);
    } catch (e) {
      console.error("Error updating planner timeline:", e);
      res.status(500).json({ error: "Failed to update timeline" });
    }
  });

  app.delete("/host/planner/timelines/:id", requireAuth, async (req, res) => {
    try {
      const { deletePlannerTimeline } = await import("../data.js");
      const result = await deletePlannerTimeline(req.params.id, req.user.id);
      if (result.error) return res.status(500).json({ error: "Failed to delete timeline" });
      res.json({ ok: true });
    } catch (e) {
      console.error("Error deleting planner timeline:", e);
      res.status(500).json({ error: "Failed to delete timeline" });
    }
  });

  // Mint a signed upload URL so the browser uploads media straight to Storage.
  app.post("/host/planner/upload-url", requireAuth, async (req, res) => {
    try {
      const { mimeType } = req.body || {};
      const ext = extensionFromMime(mimeType);
      const path = `planner/${req.user.id}/${crypto.randomUUID()}.${ext}`;
      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase.storage.from("event-images").createSignedUploadUrl(path);
      if (error || !data) {
        console.error("planner upload-url mint failed:", error);
        return res.status(500).json({ error: "Could not mint upload URL" });
      }
      const { data: pub } = supabase.storage.from("event-images").getPublicUrl(path);
      res.json({ bucket: "event-images", path, token: data.token, publicUrl: pub.publicUrl });
    } catch (e) {
      console.error("Error minting planner upload URL:", e);
      res.status(500).json({ error: "Failed to mint upload URL" });
    }
  });
}
