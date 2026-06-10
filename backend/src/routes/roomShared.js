// Shared room-route plumbing: access gates, media signing, giphy (guest /p/* + host space routes).
import { adminForceLevel, isUserEventHost } from "../data.js";
// getRoomAccess, but an admin may FORCE the access tier (the "status switch" QA
// tool). Same return shape, so every room endpoint stays unchanged. Non-admins
// (no force header / not admin) get the real getRoomAccess.
async function getRoomAccessForReq(req, personId, eventId) {
  const { getRoomAccess } = await import("../services/pullupService.js");
  const forced = await adminForceLevel(req);
  if (!forced) return getRoomAccess(personId, eventId);
  const { resolveCapabilities } = await import("../services/roomPermissions.js");
  const { supabase } = await import("../supabase.js");
  const { data: ev } = await supabase.from("events").select("room_permissions").eq("id", eventId).maybeSingle();
  const stateMap = { host: "pulledup", guest_pullup: "pulledup", guest_rsvp: "lobby", guest_waitlist: "waitlist" };
  const state = stateMap[forced];
  if (!state) return { access: "locked", reason: "forced", phase: "forced" };
  return { access: state, phase: "forced", permissions: resolveCapabilities(ev, state) };
}

// Host gate that also honors the admin "Host" lens: an admin previewing with
// force-level=host inhabits any room AS its host (read-only QA), so the host
// surfaces actually load. Real hosts always pass. Writes keep the real-host
// check (below) so QA can never post into someone else's live room.
async function hostGateForReq(req, eventId) {
  const real = await isUserEventHost(req.user.id, eventId);
  if (real.isHost) return real;
  const forced = await adminForceLevel(req); // null unless an admin sent the header
  if (forced === "host") return { isHost: true, role: "owner", lens: true };
  return real;
}

// Room media is uploaded DIRECT to storage from the browser (a signed upload
// URL), so any file type and any reasonable size works without squeezing bytes
// through the API. This mints the URL and pre-records an event_media row (folder
// tag stays the legacy value so the public event page keeps excluding room-
// shared media; that tag is never shown). Returns { path, token, url, type }.
const ROOM_MEDIA_MAX = 200 * 1024 * 1024; // 200MB — the size limit, not a type limit
function roomMediaType(contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.startsWith("image/")) return ct.includes("gif") ? "gif" : "image";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("audio/")) return "audio";
  return "file";
}
async function signRoomUpload(eventId, personId, { filename, contentType, size }) {
  if (size && Number(size) > ROOM_MEDIA_MAX) return { ok: false, reason: "too_large" };
  const { supabase } = await import("../supabase.js");
  const ct = (contentType || "application/octet-stream").toLowerCase();
  const type = roomMediaType(ct);
  const fromName = filename && filename.includes(".") ? filename.split(".").pop() : "";
  const ext = (fromName || ct.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const path = `${eventId}/room_${personId || "host"}_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;
  const { data, error } = await supabase.storage.from("event-images").createSignedUploadUrl(path);
  if (error || !data?.token) { console.error("[room-media] sign:", error?.message); return { ok: false, reason: "sign_failed" }; }
  await supabase.from("event_media").insert({
    event_id: eventId, media_type: type, storage_path: path, folder: "darkroom",
    is_cover: false, mime_type: ct, uploaded_by: personId, position: 9999,
  });
  const { data: pub } = supabase.storage.from("event-images").getPublicUrl(path);
  return { ok: true, path, token: data.token, url: pub?.publicUrl || null, type };
}

// Validate the media a post claims to carry: it must point at OUR storage
// bucket (uploaded via the signed URL above) or be a Giphy gif — never an
// arbitrary remote URL. Normalises the type and caps the count.
function sanitizeRoomMedia(media) {
  if (!Array.isArray(media)) return [];
  const out = [];
  for (const it of media.slice(0, 12)) {
    const url = typeof it === "string" ? it : it?.url;
    if (!url || typeof url !== "string") continue;
    const okBucket = url.includes("/storage/v1/object/public/event-images/");
    let okGif = false;
    try { const h = new URL(url).hostname.toLowerCase(); okGif = h === "giphy.com" || h.endsWith(".giphy.com"); } catch { /* not a URL */ }
    if (!okBucket && !okGif) continue;
    const t = it && it.type;
    const type = ["image", "video", "audio", "gif", "file"].includes(t) ? t : (okGif ? "gif" : "image");
    out.push({ url, type });
  }
  return out;
}

// Giphy proxy — keeps the key server-side. No key set → { disabled:true } so the
// frontend just hides the GIF button instead of showing a broken panel.
async function giphySearch(q) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return { disabled: true, gifs: [] };
  const query = (q || "").toString().trim();
  const url = query
    ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(query)}&limit=24&rating=pg-13&bundle=messaging_non_clips`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=24&rating=pg-13&bundle=messaging_non_clips`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { disabled: false, gifs: [] };
    const j = await r.json();
    const gifs = (j.data || []).map((g) => ({
      id: g.id,
      preview: g.images?.fixed_width_small?.url || g.images?.fixed_width?.url || g.images?.downsized?.url,
      url: g.images?.downsized?.url || g.images?.fixed_width?.url || g.images?.original?.url,
    })).filter((g) => g.url && g.preview);
    return { disabled: false, gifs };
  } catch (e) {
    console.error("[giphy] error:", e.message);
    return { disabled: false, gifs: [] };
  }
}
export { getRoomAccessForReq, hostGateForReq, ROOM_MEDIA_MAX, roomMediaType, signRoomUpload, sanitizeRoomMedia, giphySearch };
