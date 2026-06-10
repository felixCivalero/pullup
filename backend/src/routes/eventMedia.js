// Host event media routes: storage tokens (direct-to-Supabase signed uploads),
// media upload/list/delete, reorder, and cover selection.

import { findEventById, canEditEvent } from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import { extensionFromMime } from "../lib/uploads.js";
import { emitIntent, sourceFromRequest } from "../services/intentLog.js";

export function registerEventMediaRoutes(app) {
  // ---------------------------
  // PROTECTED: Mint a Supabase signed upload URL for direct-to-storage upload.
  // The browser then PUTs the file straight to Supabase, bypassing Express
  // entirely — no base64, no body buffering, real progress events, much bigger
  // files supported.
  // ---------------------------
  app.post("/host/events/:eventId/storage-token", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { mimeType, kind = "main", position } = req.body || {};

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const allowed = await canEditEvent(req.user.id, eventId);
      if (!allowed) return res.status(403).json({ error: "Forbidden" });

      // Server controls the path so the signed URL is bound to a known location.
      const ext = kind === "thumb" ? "jpg" : extensionFromMime(mimeType);
      const pos = Number.isFinite(position) ? position : 0;
      const slug = kind === "thumb" ? "thumb" : "media";
      const path = `${eventId}/${slug}_${pos}_${Date.now()}.${ext}`;

      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase.storage
        .from("event-images")
        .createSignedUploadUrl(path);

      if (error || !data) {
        console.error("[storage-token] createSignedUploadUrl failed", error);
        return res.status(500).json({ error: "Could not mint upload URL" });
      }

      res.json({
        path,
        token: data.token,
        uploadUrl: data.signedUrl,
      });
    } catch (err) {
      console.error("[storage-token] error", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/host/events/:eventId/media", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const {
        mediaData,
        mediaType,
        mimeType,
        position,
        thumbnailData,
        // New direct-upload flow: client has already uploaded the file(s) to
        // Supabase Storage and supplies the resulting paths instead of base64.
        storagePath,
        thumbnailStoragePath,
      } = req.body;

      const usingDirectUpload = !!storagePath;
      if (!mediaData && !usingDirectUpload) {
        return res.status(400).json({ error: "mediaData or storagePath is required" });
      }

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const allowed = await canEditEvent(req.user.id, eventId);
      if (!allowed) return res.status(403).json({ error: "Forbidden" });

      const { supabase } = await import("../supabase.js");

      const type = mediaType || "image";
      const extension = extensionFromMime(mimeType);
      const pos = position ?? 0;

      let fileName;
      if (usingDirectUpload) {
        // Trust the client-supplied path only after verifying it lives under
        // this event's folder — prevents a malicious caller from claiming
        // someone else's storage object.
        if (!storagePath.startsWith(`${eventId}/`)) {
          return res.status(400).json({ error: "Invalid storage path" });
        }
        fileName = storagePath;
      } else {
        fileName = `${eventId}/media_${pos}_${Date.now()}.${extension}`;

        // Legacy base64 path — still here so older clients keep working.
        const base64Data = mediaData.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        let uploadContentType = mimeType || `image/${extension}`;
        if (uploadContentType === "video/quicktime") {
          uploadContentType = "video/mp4";
        }

        const { error: uploadError } = await supabase.storage
          .from("event-images")
          .upload(fileName, buffer, {
            contentType: uploadContentType,
            upsert: true,
          });

        if (uploadError) {
          console.error("Media upload error:", uploadError);
          return res.status(500).json({ error: "Failed to upload media" });
        }
      }

      // Thumbnail handling
      let thumbnailPath = null;
      if (thumbnailStoragePath) {
        if (!thumbnailStoragePath.startsWith(`${eventId}/`)) {
          return res.status(400).json({ error: "Invalid thumbnail path" });
        }
        thumbnailPath = thumbnailStoragePath;
      } else if (thumbnailData && (type === "video" || type === "gif")) {
        const thumbFileName = `${eventId}/thumb_${pos}_${Date.now()}.jpg`;
        const thumbBase64 = thumbnailData.replace(/^data:[^;]+;base64,/, "");
        const thumbBuffer = Buffer.from(thumbBase64, "base64");

        const { error: thumbError } = await supabase.storage
          .from("event-images")
          .upload(thumbFileName, thumbBuffer, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (!thumbError) {
          thumbnailPath = thumbFileName;
        }
      }

      // Check if this is the first media item (make it cover)
      const { data: existingMedia } = await supabase
        .from("event_media")
        .select("id")
        .eq("event_id", eventId);

      const isCover = !existingMedia || existingMedia.length === 0;

      // Insert into event_media table
      const { data: mediaRow, error: insertError } = await supabase
        .from("event_media")
        .insert({
          event_id: eventId,
          media_type: type,
          storage_path: fileName,
          thumbnail_path: thumbnailPath,
          position: pos,
          is_cover: isCover,
          mime_type: mimeType || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Media insert error:", insertError);
        return res.status(500).json({ error: "Failed to save media record" });
      }

      // If this is the cover, update events.cover_image_url and image_url
      if (isCover) {
        const coverPath = (type === "video" || type === "gif") && thumbnailPath ? thumbnailPath : fileName;
        await supabase.from("events").update({
          cover_image_url: coverPath,
          image_url: coverPath, // Always sync image_url so dashboard/emails/OG tags work
        }).eq("id", eventId);
      }

      // Generate public URL for response
      const { data: { publicUrl } } = supabase.storage.from("event-images").getPublicUrl(fileName);
      let thumbnailUrl = null;
      if (thumbnailPath) {
        const { data: { publicUrl: tUrl } } = supabase.storage.from("event-images").getPublicUrl(thumbnailPath);
        thumbnailUrl = tUrl;
      }

      emitIntent({
        hostId: req.user.id,
        tool: "upload_event_media",
        // Replay-by-reference: log the resulting URL, not the binary payload.
        args: { eventId: req.params.eventId, mediaUrl: publicUrl, mediaType: type, setAsCover: isCover },
        source: sourceFromRequest(req),
        target: { type: "event", id: req.params.eventId },
        result: { mediaId: mediaRow.id, url: publicUrl, isCover },
      });

      res.json({
        id: mediaRow.id,
        mediaType: type,
        url: publicUrl,
        thumbnailUrl,
        position: pos,
        isCover,
        mimeType: mimeType || null,
      });
    } catch (error) {
      console.error("Error uploading event media:", error);
      res.status(500).json({ error: "Failed to upload event media" });
    }
  });

  // ---------------------------
  // PROTECTED: List event media
  // ---------------------------
  app.get("/host/events/:eventId/media", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { supabase } = await import("../supabase.js");

      const { data: mediaRows, error } = await supabase
        .from("event_media")
        .select("*")
        .eq("event_id", eventId)
        .order("position", { ascending: true });

      if (error) {
        return res.status(500).json({ error: "Failed to fetch media" });
      }

      const media = (mediaRows || []).map((m) => {
        const { data: { publicUrl } } = supabase.storage.from("event-images").getPublicUrl(m.storage_path);
        let thumbnailUrl = null;
        if (m.thumbnail_path) {
          const { data: { publicUrl: tUrl } } = supabase.storage.from("event-images").getPublicUrl(m.thumbnail_path);
          thumbnailUrl = tUrl;
        }
        return {
          id: m.id,
          mediaType: m.media_type,
          url: publicUrl,
          thumbnailUrl,
          position: m.position,
          isCover: m.is_cover,
          mimeType: m.mime_type,
        };
      });

      res.json(media);
    } catch (error) {
      console.error("Error fetching event media:", error);
      res.status(500).json({ error: "Failed to fetch event media" });
    }
  });

  // ---------------------------
  // PROTECTED: Delete event media
  // ---------------------------
  app.delete("/host/events/:eventId/media/:mediaId", requireAuth, async (req, res) => {
    try {
      const { eventId, mediaId } = req.params;

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const allowed = await canEditEvent(req.user.id, eventId);
      if (!allowed) return res.status(403).json({ error: "Forbidden" });

      const { supabase } = await import("../supabase.js");

      // Get the media row first
      const { data: mediaRow } = await supabase
        .from("event_media")
        .select("*")
        .eq("id", mediaId)
        .eq("event_id", eventId)
        .single();

      if (!mediaRow) return res.status(404).json({ error: "Media not found" });

      // Delete from storage
      await supabase.storage.from("event-images").remove([mediaRow.storage_path]);
      if (mediaRow.thumbnail_path) {
        await supabase.storage.from("event-images").remove([mediaRow.thumbnail_path]);
      }

      // Delete from database
      await supabase.from("event_media").delete().eq("id", mediaId);

      // If this was the cover, assign cover to the next item
      if (mediaRow.is_cover) {
        const { data: remaining } = await supabase
          .from("event_media")
          .select("*")
          .eq("event_id", eventId)
          .order("position", { ascending: true })
          .limit(1);

        if (remaining && remaining.length > 0) {
          await supabase.from("event_media").update({ is_cover: true }).eq("id", remaining[0].id);
          const coverPath = (remaining[0].media_type === "video") && remaining[0].thumbnail_path
            ? remaining[0].thumbnail_path : remaining[0].storage_path;
          await supabase.from("events").update({ cover_image_url: coverPath, image_url: coverPath }).eq("id", eventId);
        } else {
          await supabase.from("events").update({ cover_image_url: null, image_url: null }).eq("id", eventId);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting event media:", error);
      res.status(500).json({ error: "Failed to delete event media" });
    }
  });

  // ---------------------------
  // PROTECTED: Reorder event media
  // ---------------------------
  app.put("/host/events/:eventId/media/reorder", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { ordering } = req.body; // [{id, position}]

      const allowed = await canEditEvent(req.user.id, eventId);
      if (!allowed) return res.status(403).json({ error: "Forbidden" });

      const { supabase } = await import("../supabase.js");

      for (const item of ordering) {
        await supabase.from("event_media").update({ position: item.position }).eq("id", item.id).eq("event_id", eventId);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering event media:", error);
      res.status(500).json({ error: "Failed to reorder media" });
    }
  });

  // ---------------------------
  // PROTECTED: Set cover media
  // ---------------------------
  app.put("/host/events/:eventId/media/:mediaId/cover", requireAuth, async (req, res) => {
    try {
      const { eventId, mediaId } = req.params;

      const allowed = await canEditEvent(req.user.id, eventId);
      if (!allowed) return res.status(403).json({ error: "Forbidden" });

      const { supabase } = await import("../supabase.js");

      // Unset all covers for this event
      await supabase.from("event_media").update({ is_cover: false }).eq("event_id", eventId);

      // Set new cover
      const { data: mediaRow } = await supabase
        .from("event_media")
        .update({ is_cover: true })
        .eq("id", mediaId)
        .eq("event_id", eventId)
        .select()
        .single();

      if (!mediaRow) return res.status(404).json({ error: "Media not found" });

      // Update events.cover_image_url and image_url
      const coverPath = (mediaRow.media_type === "video" || mediaRow.media_type === "gif") && mediaRow.thumbnail_path
        ? mediaRow.thumbnail_path : mediaRow.storage_path;
      await supabase.from("events").update({ cover_image_url: coverPath, image_url: coverPath }).eq("id", eventId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error setting cover media:", error);
      res.status(500).json({ error: "Failed to set cover" });
    }
  });
}
