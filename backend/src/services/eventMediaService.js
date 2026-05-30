// backend/src/services/eventMediaService.js
//
// Shared, auth-agnostic media pipeline. Both the session-authed editor routes
// (/host/events/:eventId/storage-token + /media) and the token-gated MCP
// "media link" upload page (/media-link/:token/*) funnel through these so the
// storage layout, cover-sync, and path validation stay identical no matter how
// the host got here. Auth lives in the route; this module assumes the caller is
// already authorized for `eventId`.

import { supabase } from "../supabase.js";

// Pick a file extension from an uploaded MIME type. Mirrors the helper in
// index.js (kept in sync deliberately — both attach to the same bucket).
export function extensionFromMime(mimeType) {
  if (!mimeType) return "jpg";
  const ext = mimeType.split("/")[1];
  if (ext === "quicktime") return "mov";
  if (ext === "webm") return "webm";
  if (ext === "mp4") return "mp4";
  if (ext === "gif") return "gif";
  if (ext === "png") return "png";
  if (ext === "webp") return "webp";
  if (ext === "jpeg") return "jpg";
  return ext || "jpg";
}

// Mint a Supabase signed upload URL bound to a server-chosen path under the
// event's folder, so the browser can PUT the file straight to Storage. kind
// "thumb" forces a .jpg still; "main" follows the file's MIME.
export async function mintMediaStorageToken({ eventId, mimeType, kind = "main", position = 0 }) {
  const ext = kind === "thumb" ? "jpg" : extensionFromMime(mimeType);
  const pos = Number.isFinite(position) ? position : 0;
  const slug = kind === "thumb" ? "thumb" : "media";
  const path = `${eventId}/${slug}_${pos}_${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from("event-images")
    .createSignedUploadUrl(path);
  if (error || !data) {
    const e = new Error("Could not mint upload URL");
    e.cause = error;
    throw e;
  }
  return { path, token: data.token, uploadUrl: data.signedUrl };
}

// Attach an already-uploaded storage object to an event as an event_media row.
// The first media item on an event becomes its cover (syncs cover_image_url +
// image_url so the dashboard, emails, and OG tags pick it up). Paths must live
// under `${eventId}/` — a caller can't claim another event's storage object.
export async function attachDirectUploadMedia({
  eventId,
  storagePath,
  thumbnailStoragePath = null,
  mediaType = "image",
  mimeType = null,
  position = 0,
}) {
  if (!storagePath || !storagePath.startsWith(`${eventId}/`)) {
    throw new Error("Invalid storage path");
  }
  let thumbnailPath = null;
  if (thumbnailStoragePath) {
    if (!thumbnailStoragePath.startsWith(`${eventId}/`)) {
      throw new Error("Invalid thumbnail path");
    }
    thumbnailPath = thumbnailStoragePath;
  }

  const type = mediaType || "image";
  const pos = position ?? 0;

  // First media item → cover.
  const { data: existingMedia } = await supabase
    .from("event_media")
    .select("id")
    .eq("event_id", eventId);
  const isCover = !existingMedia || existingMedia.length === 0;

  const { data: mediaRow, error: insertError } = await supabase
    .from("event_media")
    .insert({
      event_id: eventId,
      media_type: type,
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      position: pos,
      is_cover: isCover,
      mime_type: mimeType || null,
    })
    .select()
    .single();
  if (insertError) {
    const e = new Error("Failed to save media record");
    e.cause = insertError;
    throw e;
  }

  if (isCover) {
    // Videos/gifs use the still frame as the cover image; everything else uses
    // the file itself. image_url is always synced so legacy consumers work.
    const coverPath =
      (type === "video" || type === "gif") && thumbnailPath ? thumbnailPath : storagePath;
    await supabase
      .from("events")
      .update({ cover_image_url: coverPath, image_url: coverPath })
      .eq("id", eventId);
  }

  const { data: { publicUrl } } = supabase.storage
    .from("event-images")
    .getPublicUrl(storagePath);
  let thumbnailUrl = null;
  if (thumbnailPath) {
    const { data: { publicUrl: tUrl } } = supabase.storage
      .from("event-images")
      .getPublicUrl(thumbnailPath);
    thumbnailUrl = tUrl;
  }

  return {
    id: mediaRow.id,
    mediaType: type,
    url: publicUrl,
    thumbnailUrl,
    position: pos,
    isCover,
    mimeType: mimeType || null,
  };
}
