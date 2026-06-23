// Event Room content wall (/events/:eventId/room-content/*) — the Pinterest-
// style feed of photos/videos shot at the event. Upload is consent-gated; the
// whole room can browse, tag the creator, and download (every download tallied).
//
// Access mirrors the rest of the room: the host always passes; a guest follows
// the host's Room capability grid for their state (upload / download / read).
import { optionalAuth } from "../middleware/auth.js";
import { resolveViewer, isUserEventHost } from "../data.js";
import { getRoomAccessForReq } from "./roomShared.js";
import {
  signContentUpload,
  createRoomContent,
  listRoomContent,
  recordDownload,
  getRoomContent,
  deleteRoomContent,
} from "../services/roomContentService.js";

// One resolve for every wall route: is the viewer the host, who are they (person
// for attribution), and what does the room let their state do. Host short-
// circuits the capability grid (they own the room).
async function resolveWallViewer(req, eventId) {
  let isHost = false;
  if (req.user?.id) {
    const r = await isUserEventHost(req.user.id, eventId).catch(() => ({ isHost: false }));
    isHost = !!r.isHost;
  }
  const norm = (req.user?.email || "").toString().trim().toLowerCase();
  const viewer = await resolveViewer(req, { email: norm || null });
  const person = viewer.person || null;
  const access = person ? await getRoomAccessForReq(req, person.id, eventId) : null;
  const locked = !isHost && (!access || access.access === "locked");
  return {
    isHost,
    person,
    profileId: req.user?.id || null,
    // read defaults ON (the room is a shared space) unless the host turns it off;
    // upload/download are opt-in capabilities the host grants per state.
    canRead: isHost || (!locked && access?.permissions?.read !== false),
    canUpload: isHost || (!!access && access.permissions?.upload === true),
    canDownload: isHost || (!!access && access.permissions?.download === true),
  };
}

export function registerRoomContentRoutes(app) {
  // Mint a signed direct-to-storage upload URL for a wall item.
  app.post("/events/:eventId/room-content/sign", optionalAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const v = await resolveWallViewer(req, eventId);
      if (!v.isHost && !v.person) return res.status(403).json({ ok: false, reason: "no_identity" });
      if (!v.canUpload) return res.status(403).json({ ok: false, reason: "upload_off" });
      const out = await signContentUpload(eventId, v.person?.id || null, req.body || {});
      return res.status(out.ok ? 200 : 400).json(out);
    } catch (err) {
      console.error("[room-content:sign] error:", err.message);
      res.status(500).json({ ok: false, reason: "sign_failed" });
    }
  });

  // Record a wall item once its bytes are in storage. Consent is enforced both
  // here and in the service — no consent, no row.
  app.post("/events/:eventId/room-content", optionalAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const v = await resolveWallViewer(req, eventId);
      if (!v.isHost && !v.person) return res.status(403).json({ ok: false, reason: "no_identity" });
      if (!v.canUpload) return res.status(403).json({ ok: false, reason: "upload_off" });
      const { url, path, type, mime, caption, width, height, consent } = req.body || {};
      if (consent !== true) return res.status(400).json({ ok: false, reason: "consent_required" });
      const r = await createRoomContent({
        eventId, person: v.person, profileId: v.profileId,
        url, storagePath: path, type, mime, caption,
        width: Number(width) || null, height: Number(height) || null, consent: true,
      });
      if (!r.ok) return res.status(400).json(r);
      res.json({ ok: true, item: annotate(r.item, v) });
    } catch (err) {
      console.error("[room-content:create] error:", err.message);
      res.status(500).json({ ok: false, reason: "create_failed" });
    }
  });

  // The wall, newest first + the viewer's own capabilities so the UI knows
  // whether to show the upload / download affordances.
  app.get("/events/:eventId/room-content", optionalAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const v = await resolveWallViewer(req, eventId);
      if (!v.canRead) return res.status(403).json({ ok: false, reason: "locked" });
      const items = (await listRoomContent(eventId)).map((it) => annotate(it, v));
      res.json({ ok: true, items, can: { upload: v.canUpload, download: v.canDownload } });
    } catch (err) {
      console.error("[room-content:list] error:", err.message);
      res.status(500).json({ ok: false, reason: "list_failed", items: [] });
    }
  });

  // One download = one tally. Returns the fresh count + a forced-download URL.
  app.post("/events/:eventId/room-content/:id/download", optionalAuth, async (req, res) => {
    try {
      const { eventId, id } = req.params;
      const v = await resolveWallViewer(req, eventId);
      if (!v.canDownload) return res.status(403).json({ ok: false, reason: "download_off" });
      const row = await getRoomContent(id);
      if (!row || row.event_id !== eventId) return res.status(404).json({ ok: false, reason: "not_found" });
      const r = await recordDownload(id);
      return res.status(r.ok ? 200 : 400).json(r);
    } catch (err) {
      console.error("[room-content:download] error:", err.message);
      res.status(500).json({ ok: false, reason: "download_failed" });
    }
  });

  // Take a tile down — your own, or anyone's if you host the event.
  app.delete("/events/:eventId/room-content/:id", optionalAuth, async (req, res) => {
    try {
      const { eventId, id } = req.params;
      const v = await resolveWallViewer(req, eventId);
      const row = await getRoomContent(id);
      if (!row || row.event_id !== eventId) return res.status(404).json({ ok: false, reason: "not_found" });
      const mine = v.person && row.uploader_person_id === v.person.id;
      if (!v.isHost && !mine) return res.status(403).json({ ok: false, reason: "not_yours" });
      const r = await deleteRoomContent(id);
      return res.status(r.ok ? 200 : 400).json(r);
    } catch (err) {
      console.error("[room-content:delete] error:", err.message);
      res.status(500).json({ ok: false, reason: "delete_failed" });
    }
  });
}

// Per-viewer flags the tile UI needs: is this MINE (tag/own styling) and may I
// remove it (mine, or I host the room).
function annotate(item, v) {
  const mine = !!(v.person && item.uploader?.personId && item.uploader.personId === v.person.id);
  return { ...item, mine, canDelete: v.isHost || mine };
}
