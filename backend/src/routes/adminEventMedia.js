// An event's cover media for the editor (owner only, own events): signed
// upload URLs straight to Storage, the event_media rows (image / gif / video
// with a thumbnail), delete, reorder, pick the cover. Ported from the old
// app's routes/eventMedia.js (branch pullup-app). The first item is the
// cover; events.cover_image_url/image_url follow it so lists, mails and share
// previews show it.
import { requireOwner } from "../middleware/requireOwner.js";
import { supabase } from "../supabase.js";
import { EVENT_HOST_ID as HOST_ID, EVENT_IMAGE_BUCKET, imageUrl } from "../lib/eventPlatform.js";

const EXT = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/quicktime": "mp4", "video/webm": "webm",
};
const TYPES = new Set(["image", "gif", "video"]);
const pub = (path) => imageUrl(path, process.env.SUPABASE_URL);

// The event, if it's one of the owner's (other hosts' events are read-only).
async function ownEvent(id) {
  const { data, error } = await supabase.from("events").select("id, host_id").eq("id", id).maybeSingle();
  if (error) throw error;
  return data && data.host_id === HOST_ID ? data : null;
}

// Cover = the item marked is_cover; a video or gif shows its still frame.
async function syncCover(eventId) {
  const { data: rows } = await supabase
    .from("event_media")
    .select("id, media_type, storage_path, thumbnail_path, is_cover, position")
    .eq("event_id", eventId)
    .or("folder.is.null,folder.neq.darkroom")
    .order("position", { ascending: true });
  const cover = (rows || []).find((m) => m.is_cover) || (rows || [])[0] || null;
  if (cover && !cover.is_cover) await supabase.from("event_media").update({ is_cover: true }).eq("id", cover.id);
  const path = cover ? (cover.media_type !== "image" && cover.thumbnail_path ? cover.thumbnail_path : cover.storage_path) : null;
  await supabase.from("events").update({ cover_image_url: path, image_url: path }).eq("id", eventId);
}

export function mediaShape(m) {
  return {
    id: m.id,
    mediaType: m.media_type,
    url: pub(m.storage_path),
    thumbnailUrl: m.thumbnail_path ? pub(m.thumbnail_path) : null,
    position: m.position,
    isCover: m.is_cover,
    mimeType: m.mime_type,
    width: m.width || null,
    height: m.height || null,
  };
}

export async function loadEventMedia(eventId) {
  const { data, error } = await supabase
    .from("event_media")
    .select("*")
    .eq("event_id", eventId)
    .or("folder.is.null,folder.neq.darkroom")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data || []).map(mediaShape);
}

export function registerAdminEventMediaRoutes(app) {
  const guard = (fn) => [
    requireOwner,
    async (req, res) => {
      try {
        const ev = await ownEvent(req.params.eventId);
        if (!ev) return res.status(404).json({ error: "not_found" });
        return await fn(req, res, ev);
      } catch (err) {
        console.error(`[admin/media] ${req.method} ${req.path}:`, err?.message);
        return res.status(500).json({ error: "failed" });
      }
    },
  ];

  // A signed URL bound to a server-chosen path; the browser PUTs the file.
  app.post("/admin/events/:eventId/storage-token", ...guard(async (req, res, ev) => {
    const { mimeType, kind = "main", position } = req.body || {};
    const ext = kind === "thumb" ? "jpg" : EXT[mimeType];
    if (!ext) return res.status(400).json({ error: "Unsupported file type" });
    const pos = Number.isFinite(position) ? position : 0;
    const path = `${ev.id}/${kind === "thumb" ? "thumb" : "media"}_${pos}_${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from(EVENT_IMAGE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error || new Error("signed url");
    return res.json({ path, token: data.token, uploadUrl: data.signedUrl });
  }));

  // Record an uploaded file as the event's media.
  app.post("/admin/events/:eventId/media", ...guard(async (req, res, ev) => {
    const { storagePath, thumbnailStoragePath, mediaType, mimeType, position, width, height } = req.body || {};
    if (typeof storagePath !== "string" || !storagePath.startsWith(`${ev.id}/`)) return res.status(400).json({ error: "Invalid storage path" });
    if (thumbnailStoragePath && (typeof thumbnailStoragePath !== "string" || !thumbnailStoragePath.startsWith(`${ev.id}/`))) {
      return res.status(400).json({ error: "Invalid thumbnail path" });
    }
    const type = TYPES.has(mediaType) ? mediaType : "image";
    const { count } = await supabase.from("event_media").select("id", { count: "exact", head: true }).eq("event_id", ev.id);
    const { data: row, error } = await supabase
      .from("event_media")
      .insert({
        event_id: ev.id,
        media_type: type,
        storage_path: storagePath,
        thumbnail_path: thumbnailStoragePath || null,
        position: Number.isFinite(position) ? position : count || 0,
        is_cover: !count,
        mime_type: typeof mimeType === "string" ? mimeType.slice(0, 80) : null,
        width: Number.isFinite(width) ? Math.round(width) : null,
        height: Number.isFinite(height) ? Math.round(height) : null,
      })
      .select()
      .single();
    if (error) throw error;
    if (!count) await syncCover(ev.id);
    return res.json(mediaShape(row));
  }));

  app.delete("/admin/events/:eventId/media/:mediaId", ...guard(async (req, res, ev) => {
    const { data: row } = await supabase.from("event_media").select("*").eq("id", req.params.mediaId).eq("event_id", ev.id).maybeSingle();
    if (!row) return res.status(404).json({ error: "Media not found" });
    await supabase.storage.from(EVENT_IMAGE_BUCKET).remove([row.storage_path, row.thumbnail_path].filter(Boolean));
    await supabase.from("event_media").delete().eq("id", row.id);
    if (row.is_cover) await syncCover(ev.id);
    return res.json({ success: true });
  }));

  app.put("/admin/events/:eventId/media/reorder", ...guard(async (req, res, ev) => {
    const ordering = Array.isArray(req.body?.ordering) ? req.body.ordering.slice(0, 50) : [];
    for (const item of ordering) {
      if (!item?.id || !Number.isFinite(item.position)) continue;
      await supabase.from("event_media").update({ position: item.position }).eq("id", item.id).eq("event_id", ev.id);
    }
    return res.json({ success: true });
  }));

  app.put("/admin/events/:eventId/media/:mediaId/cover", ...guard(async (req, res, ev) => {
    const { data: row } = await supabase.from("event_media").select("id").eq("id", req.params.mediaId).eq("event_id", ev.id).maybeSingle();
    if (!row) return res.status(404).json({ error: "Media not found" });
    await supabase.from("event_media").update({ is_cover: false }).eq("event_id", ev.id);
    await supabase.from("event_media").update({ is_cover: true }).eq("id", row.id);
    await syncCover(ev.id);
    return res.json({ success: true });
  }));
}
