// The per-event host story — GET /host/events/:id/story.
//
// One Postgres round trip (analytics_event_story, mig 083) returns the
// event's whole life: FILL (reach → RSVPs by source) · YOUR PEOPLE
// (returning vs new, acquisition channels) · THE NIGHT (dual-rail pull-up
// truth) · AFTERLIFE (room presence + drops after the night), plus the
// host's own averages as the only benchmarks. The RPC is SECURITY DEFINER,
// so ownership is verified HERE before it is ever called.

import { requireAuth } from "../middleware/auth.js";
import { isUserEventHost, getUserProfile } from "../data.js";

export function registerHostEventStoryRoutes(app) {
  app.get("/host/events/:id/story", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { isHost } = await isUserEventHost(req.user.id, id);
      if (!isHost) {
        const profile = await getUserProfile(req.user.id);
        if (!profile?.isAdmin) {
          return res.status(403).json({ error: "Forbidden", message: "You don't have access to this event" });
        }
      }

      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase.rpc("analytics_event_story", { p_event_id: id });
      if (error) throw error;
      if (!data?.event) return res.status(404).json({ error: "Event not found" });

      return res.json(data);
    } catch (err) {
      console.error("[host/events/story] error:", err.message);
      return res.status(500).json({ error: "Failed to load event story" });
    }
  });
}
