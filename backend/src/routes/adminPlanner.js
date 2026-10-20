// Content timeline (admin → Tidslinje): cards, timelines (lanes), event marks
// and signed upload URLs for card media. Owner only; rows scoped to the
// owner's user id. Each client has its own timeline: lists and creates take
// ?client=<client id>; without it they work on content that has no client.
import crypto from "crypto";
import { requireOwner } from "../middleware/requireOwner.js";
import { supabase } from "../supabase.js";
import {
  getPlannerCards, createPlannerCard, updatePlannerCard, deletePlannerCard,
  getPlannerTimelines, createPlannerTimeline, updatePlannerTimeline, deletePlannerTimeline,
  getPlannerEvents, createPlannerEvent, updatePlannerEvent, deletePlannerEvent,
} from "../repos/planner.js";

const BUCKET = "event-images";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

// Wrap a handler: owner gate, JSON errors, `result.error` → status.
const STATUS = { not_found: 404, missing_id: 400, bad_date: 400 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clientOf = (req) => (UUID.test(String(req.query.client || "")) ? req.query.client : null);
function handle(fn, okStatus = 200) {
  return [
    requireOwner,
    async (req, res) => {
      try {
        const out = await fn(req);
        if (out?.error) return res.status(STATUS[out.error] || 500).json({ error: out.error });
        return res.status(okStatus).json(out);
      } catch (err) {
        console.error(`[planner] ${req.method} ${req.path}:`, err?.message);
        return res.status(500).json({ error: "failed" });
      }
    },
  ];
}

export function registerAdminPlannerRoutes(app) {
  const P = "/admin/planner";

  // Cards
  app.get(`${P}/cards`, ...handle(async (req) => ({ cards: await getPlannerCards(req.user.id, clientOf(req)) })));
  app.post(`${P}/cards`, ...handle(async (req) => {
    const r = await createPlannerCard(req.user.id, req.body || {}, clientOf(req));
    return r.error ? r : r.card;
  }, 201));
  app.patch(`${P}/cards/:id`, ...handle(async (req) => {
    const r = await updatePlannerCard(req.params.id, req.user.id, req.body || {});
    return r.error ? r : r.card;
  }));
  app.delete(`${P}/cards/:id`, ...handle(async (req) => {
    const r = await deletePlannerCard(req.params.id, req.user.id);
    if (r.error) return r;
    if (r.mediaPath) {
      await supabase.storage.from(BUCKET).remove([r.mediaPath]).catch((err) => console.error("[planner] media cleanup failed:", err?.message));
    }
    return { ok: true };
  }));

  // Timelines (lanes)
  app.get(`${P}/timelines`, ...handle(async (req) => ({ timelines: await getPlannerTimelines(req.user.id, clientOf(req)) })));
  app.post(`${P}/timelines`, ...handle(async (req) => {
    const r = await createPlannerTimeline(req.user.id, req.body || {}, clientOf(req));
    return r.error ? r : r.timeline;
  }, 201));
  app.patch(`${P}/timelines/:id`, ...handle(async (req) => {
    const r = await updatePlannerTimeline(req.params.id, req.user.id, req.body || {});
    return r.error ? r : r.timeline;
  }));
  app.delete(`${P}/timelines/:id`, ...handle(async (req) => deletePlannerTimeline(req.params.id, req.user.id)));

  // Event marks
  app.get(`${P}/events`, ...handle(async (req) => ({ events: await getPlannerEvents(req.user.id, clientOf(req)) })));
  app.post(`${P}/events`, ...handle(async (req) => {
    const r = await createPlannerEvent(req.user.id, req.body || {}, clientOf(req));
    return r.error ? r : r.event;
  }, 201));
  app.patch(`${P}/events/:id`, ...handle(async (req) => {
    const r = await updatePlannerEvent(req.params.id, req.user.id, req.body || {});
    return r.error ? r : r.event;
  }));
  app.delete(`${P}/events/:id`, ...handle(async (req) => deletePlannerEvent(req.params.id, req.user.id)));

  // Signed upload URL: the browser uploads card media straight to Storage.
  app.post(`${P}/upload-url`, ...handle(async (req) => {
    const ext = EXT[req.body?.mimeType] || "jpg";
    const path = `planner/${req.user.id}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("[planner] upload-url mint failed:", error?.message);
      return { error: "upload_url_failed" };
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { bucket: BUCKET, path, token: data.token, publicUrl: pub.publicUrl };
  }));
}
