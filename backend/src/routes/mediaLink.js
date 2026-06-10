// Token-gated mobile media-upload links: /m/:token pages mint short-lived
// (2h) single-event capabilities to preview, upload, attach, and delete event media.

import { findEventById } from "../data.js";
import { verifyWaitlistToken } from "../utils/waitlistTokens.js";
import { emitIntent } from "../services/intentLog.js";
import {
  mintMediaStorageToken,
  attachDirectUploadMedia,
  listEventMedia,
  deleteEventMedia,
} from "../services/eventMediaService.js";

// ---------------------------
// PUBLIC (token-gated): MCP "media upload link".
//
// The host asks Claude to add a video/photo from chat; get_media_upload_link
// (src/mcp/tools.js) hands back a focused link to /m/:token. The token is a
// short-lived (2h), single-event capability — no web session required, so the
// uploader works even in a fresh tab. The page does ONE thing (drop media →
// attach) and bounces the host back to their chat. eventId is read FROM the
// token, never from the URL, so a token can't be retargeted at another event.
// ---------------------------
function verifyMediaLinkToken(rawToken) {
  const decoded = verifyWaitlistToken(rawToken); // throws "Token expired" / "Invalid token"
  if (decoded?.type !== "media_upload" || !decoded.eventId) {
    throw new Error("Invalid token");
  }
  return decoded; // { type, eventId, hostId, iat, exp }
}

function mediaLinkErrorStatus(err) {
  if (err?.message === "Token expired") return 410;
  if (err?.message === "Invalid token") return 400;
  return 500;
}

export function registerMediaLinkRoutes(app) {
  // Token preflight — the page calls this on load to show the event title and
  // how many media items are already attached.
  app.get("/media-link/:token", async (req, res) => {
    try {
      const decoded = verifyMediaLinkToken(req.params.token);
      const event = await findEventById(decoded.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      // Return the current gallery so the focused uploader can show what's
      // already on the event (add-vs-replace clarity) and the new thumbnail.
      const media = await listEventMedia(decoded.eventId);
      res.json({ eventTitle: event.title, mediaCount: media.length, media });
    } catch (err) {
      res
        .status(mediaLinkErrorStatus(err))
        .json({ error: err.message || "This upload link isn't valid." });
    }
  });

  // Mint a signed storage URL for the bearer of a valid media-link token.
  app.post("/media-link/:token/storage-token", async (req, res) => {
    try {
      const decoded = verifyMediaLinkToken(req.params.token);
      const { mimeType, kind = "main", position } = req.body || {};
      const result = await mintMediaStorageToken({
        eventId: decoded.eventId,
        mimeType,
        kind,
        position,
      });
      res.json(result);
    } catch (err) {
      console.error("[media-link storage-token]", err);
      res
        .status(mediaLinkErrorStatus(err))
        .json({ error: err.message || "Could not mint upload URL" });
    }
  });

  // Attach an uploaded object to the token's event.
  app.post("/media-link/:token/attach", async (req, res) => {
    try {
      const decoded = verifyMediaLinkToken(req.params.token);
      const { storagePath, thumbnailStoragePath, mediaType, mimeType, position } =
        req.body || {};

      const result = await attachDirectUploadMedia({
        eventId: decoded.eventId,
        storagePath,
        thumbnailStoragePath,
        mediaType,
        mimeType,
        position,
      });

      emitIntent({
        hostId: decoded.hostId || null,
        tool: "upload_event_media",
        args: {
          eventId: decoded.eventId,
          mediaUrl: result.url,
          mediaType: result.mediaType,
          setAsCover: result.isCover,
        },
        source: "mcp",
        target: { type: "event", id: decoded.eventId },
        result: { mediaId: result.id, url: result.url, isCover: result.isCover },
      });

      res.json(result);
    } catch (err) {
      console.error("[media-link attach]", err);
      res
        .status(mediaLinkErrorStatus(err))
        .json({ error: err.message || "Failed to attach media" });
    }
  });

  // Delete a media item from the token's event. Returns the fresh gallery so the
  // uploader can resync (cover may have moved). mediaId is scoped to the token's
  // event inside deleteEventMedia — a token can't reach another event's media.
  app.delete("/media-link/:token/:mediaId", async (req, res) => {
    try {
      const decoded = verifyMediaLinkToken(req.params.token);
      const media = await deleteEventMedia(decoded.eventId, req.params.mediaId);

      emitIntent({
        hostId: decoded.hostId || null,
        tool: "delete_event_media",
        args: { eventId: decoded.eventId, mediaId: req.params.mediaId },
        source: "mcp",
        target: { type: "event", id: decoded.eventId },
        result: { remaining: media.length },
      });

      res.json({ ok: true, media });
    } catch (err) {
      console.error("[media-link delete]", err);
      const status = err.code === "not_found" ? 404 : mediaLinkErrorStatus(err);
      res.status(status).json({ error: err.message || "Failed to delete media" });
    }
  });
}
