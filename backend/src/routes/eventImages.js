// Event cover image routes: upload an event cover image (direct-upload or
// legacy base64) + the host's cover image gallery for the picker.
import {
  findEventById,
  updateEvent,
  canEditEvent,
  listHostEventImageGallery,
} from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import { sniffUploadedImage } from "../lib/uploads.js";
import { emitIntent, sourceFromRequest } from "../services/intentLog.js";

export function registerEventImageRoutes(app) {
  // ---------------------------
  // PROTECTED: Upload event image
  // ---------------------------
  app.post("/host/events/:eventId/image", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { imageData, storagePath } = req.body;

      if (!imageData && !storagePath) {
        return res.status(400).json({ error: "imageData or storagePath is required" });
      }

      // Verify event ownership - only owners can upload event images
      const event = await findEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      // Only owner or admin can upload event images
      const allowed = await canEditEvent(req.user.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Only the event owner or admin can upload event images.",
        });
      }

      const { supabase } = await import("../supabase.js");
      let fileName;

      if (storagePath) {
        // Direct-upload flow: client already uploaded; we just record the path.
        if (!storagePath.startsWith(`${eventId}/`)) {
          return res.status(400).json({ error: "Invalid storage path" });
        }
        fileName = storagePath;
      } else {
        // Legacy base64 path.
        let sniff;
        try {
          sniff = sniffUploadedImage(imageData, {
            maxBytes: 10 * 1024 * 1024,
            label: "Event image",
          });
        } catch (e) {
          return res.status(e.statusCode || 400).json(e.body);
        }
        const { buffer, extension, mime } = sniff;
        fileName = `${eventId}/image.${extension}`;

        const { error } = await supabase.storage
          .from("event-images")
          .upload(fileName, buffer, {
            contentType: mime,
            upsert: true,
          });

        if (error) {
          console.error("Storage upload error:", error);
          return res.status(500).json({ error: "Failed to upload image" });
        }
      }

      // Store just the file path in the database. Sync cover_image_url too so
      // that a user-uploaded custom thumbnail overrides any auto-generated low-res
      // video thumb (otherwise OG previews/emails keep using the old thumbnail).
      await supabase
        .from("events")
        .update({ cover_image_url: fileName })
        .eq("id", eventId);
      const updated = await updateEvent(eventId, {
        imageUrl: fileName,
      });

      // Generate URL for immediate return (try signed first, fallback to public)
      let imageUrl = null;
      try {
        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from("event-images")
          .createSignedUrl(fileName, 3600); // 1 hour for response

        if (!urlError && signedUrlData?.signedUrl) {
          imageUrl = signedUrlData.signedUrl;
        }
      } catch (error) {
        console.error("Signed URL error:", error);
      }

      // Fallback to public URL if signed URL fails
      if (!imageUrl) {
        const {
          data: { publicUrl },
        } = supabase.storage.from("event-images").getPublicUrl(fileName);
        imageUrl = publicUrl;
      }

      // Return event with the generated URL
      const eventWithUrl = {
        ...updated,
        imageUrl: imageUrl,
      };

      emitIntent({
        hostId: req.user.id,
        tool: "upload_event_image",
        // Strip the binary payload — replay-by-reference uses imageUrl only.
        args: { eventId: req.params.eventId, imageUrl },
        source: sourceFromRequest(req),
        target: { type: "event", id: req.params.eventId },
        result: { imageUrl },
      });

      res.json(eventWithUrl);
    } catch (error) {
      console.error("Error uploading event image:", error);
      res.status(500).json({ error: "Failed to upload event image" });
    }
  });

  // GET /host/crm/event-image-gallery - List host's event cover/media images for the picker
  app.get("/host/crm/event-image-gallery", requireAuth, async (req, res) => {
    try {
      const items = await listHostEventImageGallery(req.user.id, { limit: 200 });
      return res.json({ items });
    } catch (err) {
      console.error("Event-image gallery error:", err);
      return res.status(500).json({ error: "Failed to load gallery" });
    }
  });
}
