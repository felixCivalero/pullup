// The event Room content wall — the Pinterest-style feed of photos/videos shot
// at the event. People who pulled up upload (with commercial-use consent); the
// whole room can browse, tag the creator on social, and download. Every download
// bumps a live counter.
//
// Storage reuses the same `event-images` bucket + signed-upload grammar as the
// rest of the room (bytes go browser → storage direct, never through the API).
// We just record the wall row ourselves on confirm instead of an event_media
// row, so the wall stays cleanly separate from covers and chat attachments.
import { supabase } from "../supabase.js";
import { selectAllPaged } from "../db/safeQuery.js";

const BUCKET = "event-images";
const MAX_BYTES = 200 * 1024 * 1024; // 200MB — size limit, not a type limit
const VALID_TYPES = ["image", "video", "gif"];

function mediaTypeFor(contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.startsWith("image/")) return ct.includes("gif") ? "gif" : "image";
  if (ct.startsWith("video/")) return "video";
  return "image";
}

// Mint a signed direct-to-storage upload URL for a wall item. Does NOT touch
// event_media — the wall row is written by createRoomContent once the bytes
// land. Returns { ok, path, token, url, type }.
export async function signContentUpload(eventId, personId, { filename, contentType, size } = {}) {
  if (size && Number(size) > MAX_BYTES) return { ok: false, reason: "too_large" };
  const ct = (contentType || "application/octet-stream").toLowerCase();
  const type = mediaTypeFor(ct);
  const fromName = filename && filename.includes(".") ? filename.split(".").pop() : "";
  const ext = (fromName || ct.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const path = `${eventId}/wall_${personId || "host"}_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) {
    console.error("[room-content] sign:", error?.message);
    return { ok: false, reason: "sign_failed" };
  }
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, path, token: data.token, url: pub?.publicUrl || null, type };
}

// Only our own storage bucket (uploaded via the signed URL above) is an
// acceptable wall URL — never an arbitrary remote link a client could inject.
function ourBucket(url) {
  return typeof url === "string" && url.includes(`/storage/v1/object/public/${BUCKET}/`);
}

// Record a wall item once its bytes are in storage. Consent is the gate: the
// row cannot be created without an explicit commercial-use tick.
export async function createRoomContent({
  eventId, person, profileId, url, storagePath, type, mime, caption, width, height, consent,
}) {
  if (consent !== true) return { ok: false, reason: "consent_required" };
  if (!ourBucket(url)) return { ok: false, reason: "bad_url" };
  const mediaType = VALID_TYPES.includes(type) ? type : mediaTypeFor(mime);
  // A host shooting for the wall may have no `people` row (they're a profile) —
  // fall back to their profile name/handle so the tile is still attributed.
  let uName = person?.name || null;
  let uInsta = cleanHandle(person?.instagram);
  if (!person && profileId) {
    const { data: prof } = await supabase.from("profiles").select("name, instagram").eq("id", profileId).maybeSingle();
    uName = prof?.name || null;
    uInsta = cleanHandle(prof?.instagram);
  }
  const { data, error } = await supabase
    .from("room_content")
    .insert({
      event_id: eventId,
      uploader_person_id: person?.id || null,
      uploader_profile_id: profileId || null,
      uploader_name: uName,
      uploader_instagram: uInsta,
      storage_path: storagePath || null,
      url,
      media_type: mediaType,
      mime_type: mime || null,
      caption: (caption || "").toString().trim().slice(0, 280) || null,
      width: Number.isFinite(width) ? Math.round(width) : null,
      height: Number.isFinite(height) ? Math.round(height) : null,
      consent_commercial: true,
      download_count: 0,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[room-content] create:", error.message);
    return { ok: false, reason: "create_failed" };
  }
  return { ok: true, item: mapRow(data) };
}

// The wall for an event, newest first. Paged so a busy room can't truncate at
// PostgREST's 1000-row cap.
export async function listRoomContent(eventId) {
  const rows = await selectAllPaged(() =>
    supabase.from("room_content").select("*").eq("event_id", eventId).order("created_at", { ascending: false }),
  );
  return (rows || []).map(mapRow);
}

// One download = one tally. Atomic via the RPC so two simultaneous downloads
// can't collapse into a single increment. Returns the fresh count + a URL that
// forces a save dialog (Supabase honours ?download → Content-Disposition).
export async function recordDownload(contentId) {
  const { data: row } = await supabase
    .from("room_content")
    .select("id, url, storage_path, media_type")
    .eq("id", contentId)
    .maybeSingle();
  if (!row) return { ok: false, reason: "not_found" };
  const { data: count, error } = await supabase.rpc("increment_room_content_download", { p_id: contentId });
  if (error) {
    console.error("[room-content] download tally:", error.message);
    return { ok: false, reason: "tally_failed" };
  }
  return { ok: true, count: typeof count === "number" ? count : null, url: forceDownloadUrl(row) };
}

export async function getRoomContent(contentId) {
  const { data } = await supabase.from("room_content").select("*").eq("id", contentId).maybeSingle();
  return data || null;
}

// Owner-or-host delete. The caller decides authority; this just removes the row.
export async function deleteRoomContent(contentId) {
  const { error } = await supabase.from("room_content").delete().eq("id", contentId);
  if (error) {
    console.error("[room-content] delete:", error.message);
    return { ok: false, reason: "delete_failed" };
  }
  return { ok: true };
}

function forceDownloadUrl(row) {
  const url = row.url;
  if (!ourBucket(url)) return url; // external/template URL — can't force, just return
  const base = (row.storage_path || url).split("/").pop().split("?")[0];
  const ext = base.includes(".") ? base.split(".").pop() : (row.media_type === "video" ? "mp4" : "jpg");
  const name = `pullup_${String(row.id).slice(0, 8)}.${ext}`;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}download=${encodeURIComponent(name)}`;
}

function cleanHandle(h) {
  if (!h) return null;
  const s = h.toString().trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "");
  return s || null;
}

function mapRow(r) {
  return {
    id: r.id,
    url: r.url,
    type: r.media_type,
    mime: r.mime_type || null,
    caption: r.caption || null,
    width: r.width || null,
    height: r.height || null,
    downloads: r.download_count || 0,
    createdAt: r.created_at,
    uploader: {
      personId: r.uploader_person_id || null,
      name: r.uploader_name || null,
      instagram: r.uploader_instagram || null,
    },
  };
}
