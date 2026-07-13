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
  eventId, person, profileId, url, storagePath, displayUrl, displayStoragePath, type, mime, caption, width, height, consent,
}) {
  if (consent !== true) return { ok: false, reason: "consent_required" };
  if (!ourBucket(url)) return { ok: false, reason: "bad_url" };
  const mediaType = VALID_TYPES.includes(type) ? type : mediaTypeFor(mime);
  // A compressed on-screen copy the client made (long edge ~2048px). Optional —
  // only trusted if it lives in our bucket; the ORIGINAL `url` above stays the
  // download source, always full quality.
  const dispOk = typeof displayUrl === "string" && ourBucket(displayUrl);
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
      display_url: dispOk ? displayUrl : null,
      display_storage_path: dispOk ? (displayStoragePath || null) : null,
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
    // uploader + the event it was shot at, so the saved file self-describes
    // (event_date_who) instead of an opaque hash — see downloadName().
    .select("id, event_id, url, storage_path, media_type, uploader_name, uploader_instagram, uploader_person_id, uploader_profile_id, event:events(slug, title, starts_at)")
    .eq("id", contentId)
    .maybeSingle();
  if (!row) return { ok: false, reason: "not_found" };
  const { data: count, error } = await supabase.rpc("increment_room_content_download", { p_id: contentId });
  if (error) {
    console.error("[room-content] download tally:", error.message);
    return { ok: false, reason: "tally_failed" };
  }
  // When the same person put several shots on the wall, number them (…_1, _2)
  // so downloading them one-by-one doesn't collide on one name.
  const ordinal = await uploaderShotIndex(row);
  return { ok: true, count: typeof count === "number" ? count : null, url: forceDownloadUrl(row, ordinal) };
}

// This shot's 1-based position among the SAME uploader's shots at this event
// (oldest first), plus how many they have. { index: 1, total: 1 } for a lone
// shot → no numeric suffix. Matches on the strongest identity the row carries
// (person → profile → @handle → name); if none, treats it as a lone shot.
async function uploaderShotIndex(row) {
  const lone = { index: 1, total: 1 };
  if (!row.event_id) return lone;
  let q = supabase.from("room_content").select("id, created_at").eq("event_id", row.event_id);
  if (row.uploader_person_id) q = q.eq("uploader_person_id", row.uploader_person_id);
  else if (row.uploader_profile_id) q = q.eq("uploader_profile_id", row.uploader_profile_id);
  else if (row.uploader_instagram) q = q.eq("uploader_instagram", row.uploader_instagram);
  else if (row.uploader_name) q = q.eq("uploader_name", row.uploader_name);
  else return lone;
  const { data: sibs } = await q.order("created_at", { ascending: true });
  if (!Array.isArray(sibs) || sibs.length <= 1) return lone;
  const at = sibs.findIndex((s) => s.id === row.id);
  return { index: at < 0 ? 1 : at + 1, total: sibs.length };
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

function forceDownloadUrl(row, ordinal) {
  const url = row.url;
  if (!ourBucket(url)) return url; // external/template URL — can't force, just return
  const base = (row.storage_path || url).split("/").pop().split("?")[0];
  const rawExt = base.includes(".") ? base.split(".").pop() : "";
  const ext = rawExt.replace(/[^a-z0-9]/gi, "").slice(0, 5).toLowerCase() || (row.media_type === "video" ? "mp4" : "jpg");
  const name = `${downloadName(row, ordinal)}.${ext}`;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}download=${encodeURIComponent(name)}`;
}

// Filename stem for a downloaded wall shot: event_date_who, in that order, so a
// grabbed photo self-describes on someone's disk (which event, when, whose shot)
// instead of a bare hash. `who` = the uploader's Instagram handle, or their name
// if there's no handle. When that uploader put several shots on the wall, a
// trailing _N (their chronological order) keeps the names apart. Any missing
// segment is simply dropped; a row with none (e.g. its event was deleted) falls
// back to the old short-hash name.
function downloadName(row, ordinal) {
  const ev = row.event || null;
  const evPart = slugSeg(ev?.title || ev?.slug, 48);
  const datePart = ev?.starts_at ? String(ev.starts_at).slice(0, 10) : ""; // YYYY-MM-DD
  const handle = cleanHandle(row.uploader_instagram);
  const whoPart = handle
    ? handle.toLowerCase().replace(/[^a-z0-9._]+/g, "").slice(0, 40)
    : slugSeg(row.uploader_name, 40);
  const seqPart = ordinal && ordinal.total > 1 ? String(ordinal.index) : "";
  const parts = [evPart, datePart, whoPart, seqPart].filter(Boolean);
  return parts.join("_") || `pullup_${String(row.id).slice(0, 8)}`;
}

// Lowercase, strip accents, collapse to a hyphenated ASCII slug. Empty in → "".
function slugSeg(s, max = 40) {
  return String(s || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max);
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
    // Lightweight copy for on-screen rendering; falls back to the original when
    // absent (older rows / videos). `url` is always the full-quality download.
    displayUrl: r.display_url || null,
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
