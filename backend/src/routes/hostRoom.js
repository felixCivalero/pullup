// Host Room routes — the global Room payload for a host plus Room messaging:
// 1:1 send, small bulk send, and email attachment upload.

import { requireAuth } from "../middleware/auth.js";
import { getRoomForHost, getNotificationsFeed } from "../services/roomService.js";

export function registerHostRoomRoutes(app) {
  // The notifications bell's feed — notable events (RSVP / waitlist / message /
  // attended) over a short window, newest first, each with an absolute `at` so
  // the bell can split Live vs History and merge realtime inserts in order.
  app.get("/host/notifications/feed", requireAuth, async (req, res) => {
    try {
      const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 48));
      const feed = await getNotificationsFeed(req.user.id, { hours });
      res.json(feed);
    } catch (error) {
      console.error("Error building notifications feed:", error);
      res.status(500).json({ items: [], windowHours: 48 });
    }
  });

  // The Room — global relationship home, read from the spine (person_events +
  // identities). Returns { host, events, signals, people } in the shape the
  // RoomPage expects. host_id on person_events scopes it to this host's world.
  app.get("/host/room", requireAuth, async (req, res) => {
    try {
      const room = await getRoomForHost(req.user.id, { email: req.user.email || null });
      res.json(room);
    } catch (error) {
      console.error("Error building room:", error);
      res.status(500).json({ error: "Failed to build room" });
    }
  });

  // Send a personal message from the Room composer. Native + simple: text, an
  // optional image, and an optionally-included event (eventId) — an inline card on
  // email, a link on WhatsApp/IG. Rails: email + WhatsApp (in-window free text /
  // closed-window template, falling to email). No campaign styling — that's gone.
  app.post("/host/room/message", requireAuth, async (req, res) => {
    try {
      const { sendRoomMessage } = await import("../services/roomMessaging.js");
      const { personId, channel, text, subject, attachments, eventId, location, clientId, strict } = req.body || {};
      // strict = an explicit 1:1 host send (the thread composer): the chosen rail
      // must deliver as itself or be reported blocked — never silently emailed.
      // Broadcasts/automated rails omit it and keep the email floor.
      const r = await sendRoomMessage({ hostId: req.user.id, personId, channel, text, subject, attachments, eventId, location, clientId, strict: !!strict });
      if (!r.ok) {
        return res.status(r.error === "channel_unavailable" ? 501 : 400).json(r);
      }
      res.json(r);
    } catch (error) {
      console.error("Error sending room message:", error);
      res.status(500).json({ ok: false, error: "send_failed" });
    }
  });

  // Small, event-anchored multi-send — one private message each (not a group).
  // Same simple composer; the chosen rail is honored per person and the included
  // event rides along (card on email, link on WhatsApp).
  app.post("/host/room/message/bulk", requireAuth, async (req, res) => {
    try {
      const { sendRoomBulk } = await import("../services/roomMessaging.js");
      const { personIds, channel, text, subject, attachments, eventId } = req.body || {};
      const r = await sendRoomBulk({ hostId: req.user.id, personIds, channel, text, subject, attachments, eventId });
      res.json({ ok: true, ...r });
    } catch (error) {
      console.error("Error sending room bulk:", error);
      res.status(500).json({ ok: false, error: "send_failed" });
    }
  });

  // Upload an attachment for a Room email — returns a public URL the composer
  // includes in the send (images embed inline, other files become a link).
  app.post("/host/room/attachment", requireAuth, async (req, res) => {
    try {
      const { dataUrl, filename } = req.body || {};
      if (!dataUrl || typeof dataUrl !== "string") return res.status(400).json({ error: "no_file" });
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return res.status(400).json({ error: "bad_data_url" });
      const contentType = m[1];
      const buffer = Buffer.from(m[2], "base64");
      if (buffer.length > 10 * 1024 * 1024) return res.status(413).json({ error: "too_large" });
      const isImage = contentType.startsWith("image/");
      const ext = (contentType.split("/")[1] || "bin").split("+")[0].replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
      const safeName = (filename || `file.${ext}`).replace(/[^\w.\-]+/g, "_").slice(0, 80);
      const crypto = await import("node:crypto");
      const key = `room-attachments/${req.user.id}/${crypto.randomUUID()}.${ext}`;
      const { supabase } = await import("../supabase.js");
      const { error } = await supabase.storage
        .from("event-images")
        .upload(key, buffer, { contentType, upsert: true });
      if (error) {
        console.error("[room/attachment] upload error:", error);
        return res.status(500).json({ error: "upload_failed" });
      }
      const { data: { publicUrl } } = supabase.storage.from("event-images").getPublicUrl(key);
      res.json({ url: publicUrl, name: safeName, contentType, isImage });
    } catch (error) {
      console.error("Error uploading room attachment:", error);
      res.status(500).json({ error: "upload_failed" });
    }
  });
}
