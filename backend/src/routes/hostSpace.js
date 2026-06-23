// Host-side event space routes: channels, space messages (post/pin/edit/delete),
// signed media uploads, GIF search, room permissions, roster, and darkroom.

import { requireAuth } from "../middleware/auth.js";
import { validate, spaceMessageSchema } from "../middleware/validate.js";
import { isUserEventHost, getUserProfile } from "../data.js";
import { buildRosterPayload } from "../views/eventRoomView.js";
import { hostGateForReq, signRoomUpload, sanitizeRoomMedia, giphySearch } from "./roomShared.js";

export function registerHostSpaceRoutes(app) {
  // Host side of the same space — the hub, and the pen: the host curates topics.
  app.get("/host/events/:id/channels", requireAuth, async (req, res) => {
    try {
      const { isHost } = await hostGateForReq(req, req.params.id);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      const { listChannels } = await import("../services/pullupService.js");
      res.json({ channels: await listChannels(req.params.id) });
    } catch (err) {
      console.error("[host-channels:get] error:", err.message);
      res.status(500).json({ error: "Failed to load topics" });
    }
  });

  app.post("/host/events/:id/channels", requireAuth, async (req, res) => {
    try {
      const { isHost } = await isUserEventHost(req.user.id, req.params.id);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      const { createChannel, listChannels } = await import("../services/pullupService.js");
      const r = await createChannel({ eventId: req.params.id, name: req.body?.name, createdBy: req.user.id });
      if (!r.ok) return res.status(400).json({ ok: false, reason: r.reason });
      res.json({ ok: true, channel: r.channel, channels: await listChannels(req.params.id) });
    } catch (err) {
      console.error("[host-channels:post] error:", err.message);
      res.status(500).json({ ok: false, reason: "create_failed" });
    }
  });

  app.get("/host/events/:id/space", requireAuth, async (req, res) => {
    try {
      const { isHost } = await hostGateForReq(req, req.params.id);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      const { listSpaceMessages } = await import("../services/pullupService.js");
      res.json({ messages: await listSpaceMessages(req.params.id, { channelId: req.query.channelId || null }) });
    } catch (err) {
      console.error("[host-space:get] error:", err.message);
      res.status(500).json({ error: "Failed to load the room" });
    }
  });

  app.post("/host/events/:id/space", requireAuth, validate(spaceMessageSchema), async (req, res) => {
    try {
      const eventId = req.params.id;
      const { isHost } = await isUserEventHost(req.user.id, eventId);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      const { body, parentId, media, pinned, channelId } = req.body || {};
      const cleanMedia = sanitizeRoomMedia(media);
      const { postSpaceMessage, listSpaceMessages } = await import("../services/pullupService.js");
      const profile = await getUserProfile(req.user.id).catch(() => null);
      const r = await postSpaceMessage({
        eventId,
        channelId: channelId || null,
        profileId: req.user.id,
        isHost: true,
        authorName: profile?.name || "Host",
        body,
        parentId: parentId || null,
        media: cleanMedia,
        pinned: !!pinned,
      });
      if (!r.ok) return res.status(400).json({ ok: false, reason: r.reason });
      res.json({ ok: true, messages: await listSpaceMessages(eventId, { channelId: r.channelId }) });
    } catch (err) {
      console.error("[host-space:post] error:", err.message);
      res.status(500).json({ ok: false, reason: "post_failed" });
    }
  });

  // Signed direct-to-storage upload URL for room media (host path).
  app.post("/host/events/:id/media/sign", requireAuth, async (req, res) => {
    try {
      const eventId = req.params.id;
      const { isHost } = await isUserEventHost(req.user.id, eventId);
      if (!isHost) return res.status(403).json({ ok: false, reason: "Forbidden" });
      // Attribute the upload to the host's person row if they have one.
      let hostPersonId = null;
      try {
        const { supabase } = await import("../supabase.js");
        const { data: hp } = await supabase.from("people").select("id").eq("auth_user_id", req.user.id).maybeSingle();
        hostPersonId = hp?.id || null;
      } catch { /* unattributed is fine */ }
      const out = await signRoomUpload(eventId, hostPersonId, req.body || {});
      return res.status(out.ok ? 200 : 400).json(out);
    } catch (err) {
      console.error("[host-media:sign] error:", err.message);
      res.status(500).json({ ok: false, reason: "sign_failed" });
    }
  });

  // GIF search (host path).
  app.get("/host/events/:id/gifs", requireAuth, async (req, res) => {
    try {
      const { isHost } = await hostGateForReq(req, req.params.id);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      res.json(await giphySearch(req.query.q));
    } catch (err) {
      console.error("[host-gifs:get] error:", err.message);
      res.status(500).json({ disabled: false, gifs: [] });
    }
  });

  // Host pin/unpin any post in their room.
  app.post("/host/events/:id/space/:messageId/pin", requireAuth, async (req, res) => {
    try {
      const eventId = req.params.id;
      const { isHost } = await isUserEventHost(req.user.id, eventId);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      const { getSpaceMessage, setMessagePinned, listSpaceMessages } = await import("../services/pullupService.js");
      const r = await setMessagePinned({ eventId, messageId: req.params.messageId, pinned: !!(req.body?.pinned) });
      if (!r.ok) return res.status(400).json({ ok: false, reason: r.reason });
      const msg = await getSpaceMessage(req.params.messageId);
      res.json({ ok: true, messages: await listSpaceMessages(eventId, { channelId: msg?.channel_id || null }) });
    } catch (err) {
      console.error("[host-space:pin] error:", err.message);
      res.status(500).json({ ok: false, reason: "pin_failed" });
    }
  });

  // Host edits its OWN post (host posts only — never rewrites a guest's words).
  app.patch("/host/events/:id/space/:messageId", requireAuth, async (req, res) => {
    try {
      const eventId = req.params.id;
      const { messageId } = req.params;
      const { isHost } = await isUserEventHost(req.user.id, eventId);
      if (!isHost) return res.status(403).json({ ok: false, error: "Forbidden" });
      const { getSpaceMessage, editSpaceMessage, listSpaceMessages } = await import("../services/pullupService.js");
      const msg = await getSpaceMessage(messageId);
      if (!msg || msg.event_id !== eventId) return res.status(404).json({ ok: false, reason: "not_found" });
      if (!msg.is_host) return res.status(403).json({ ok: false, reason: "not_yours" });
      const r = await editSpaceMessage({ eventId, messageId, body: req.body?.body });
      if (!r.ok) return res.status(400).json({ ok: false, reason: r.reason });
      res.json({ ok: true, messages: await listSpaceMessages(eventId, { channelId: msg.channel_id || null }) });
    } catch (err) {
      console.error("[host-space:edit] error:", err.message);
      res.status(500).json({ ok: false, reason: "edit_failed" });
    }
  });

  // Host removes ANY post in their room (moderation) — same reach as host pin.
  app.delete("/host/events/:id/space/:messageId", requireAuth, async (req, res) => {
    try {
      const eventId = req.params.id;
      const { messageId } = req.params;
      const { isHost } = await isUserEventHost(req.user.id, eventId);
      if (!isHost) return res.status(403).json({ ok: false, error: "Forbidden" });
      const { getSpaceMessage, deleteSpaceMessage, listSpaceMessages } = await import("../services/pullupService.js");
      const msg = await getSpaceMessage(messageId);
      if (!msg || msg.event_id !== eventId) return res.status(404).json({ ok: false, reason: "not_found" });
      const r = await deleteSpaceMessage({ eventId, messageId });
      if (!r.ok) return res.status(400).json({ ok: false, reason: r.reason });
      res.json({ ok: true, messages: await listSpaceMessages(eventId, { channelId: msg.channel_id || null }) });
    } catch (err) {
      console.error("[host-space:delete] error:", err.message);
      res.status(500).json({ ok: false, reason: "delete_failed" });
    }
  });

  // Room access — the host-configurable capability grid: what RSVP'd (lobby) vs
  // pulled-up guests can DO. The STATE stays system-determined (intent vs proof);
  // this only sets capabilities. The host's pen (create topics, the QR door,
  // moderate) is never a guest permission — it's separate.
  app.get("/host/events/:id/room-permissions", requireAuth, async (req, res) => {
    try {
      const { isHost } = await hostGateForReq(req, req.params.id);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      const { supabase } = await import("../supabase.js");
      const { resolveGrid, DEFAULT_ROOM_PERMISSIONS, CAPABILITIES } = await import("../services/roomPermissions.js");
      const { data: ev } = await supabase.from("events").select("room_permissions").eq("id", req.params.id).maybeSingle();
      res.json({ permissions: resolveGrid(ev || {}), defaults: DEFAULT_ROOM_PERMISSIONS, capabilities: CAPABILITIES });
    } catch (err) {
      console.error("[room-permissions:get] error:", err.message);
      res.status(500).json({ error: "failed" });
    }
  });

  app.put("/host/events/:id/room-permissions", requireAuth, async (req, res) => {
    try {
      const { isHost } = await isUserEventHost(req.user.id, req.params.id);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      const { supabase } = await import("../supabase.js");
      const { sanitizePermissions, resolveGrid } = await import("../services/roomPermissions.js");
      const clean = sanitizePermissions(req.body?.permissions || {});
      const { error } = await supabase.from("events").update({ room_permissions: clean }).eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true, permissions: resolveGrid({ room_permissions: clean }) });
    } catch (err) {
      console.error("[room-permissions:put] error:", err.message);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });

  // Which pages (tabs) the room shows — Wall always on, Chat + Shop host toggles.
  app.get("/host/events/:id/room-pages", requireAuth, async (req, res) => {
    try {
      const { isHost } = await hostGateForReq(req, req.params.id);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      const { supabase } = await import("../supabase.js");
      const { resolveRoomPages } = await import("../services/roomPermissions.js");
      const { data: ev } = await supabase.from("events").select("room_pages").eq("id", req.params.id).maybeSingle();
      res.json({ pages: resolveRoomPages(ev || {}) });
    } catch (err) {
      console.error("[room-pages:get] error:", err.message);
      res.status(500).json({ error: "failed" });
    }
  });

  app.put("/host/events/:id/room-pages", requireAuth, async (req, res) => {
    try {
      const { isHost } = await isUserEventHost(req.user.id, req.params.id);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      const { supabase } = await import("../supabase.js");
      const { sanitizeRoomPages, resolveRoomPages } = await import("../services/roomPermissions.js");
      const clean = sanitizeRoomPages(req.body?.pages || {});
      const { error } = await supabase.from("events").update({ room_pages: clean }).eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true, pages: resolveRoomPages({ room_pages: clean }) });
    } catch (err) {
      console.error("[room-pages:put] error:", err.message);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });

  // The host-editable welcome the whole room lands on (mig 099). A focused
  // one-field save so the host can edit it inline in the Room — no need to run
  // the full event-update path (date validation, Stripe, lifecycle) for a line
  // of copy. Owner/admin only, matching event-content edit rights. Empty string
  // clears it (guests then see no card; the host still sees the "add" prompt).
  app.put("/host/events/:id/room-welcome", requireAuth, async (req, res) => {
    try {
      const { canEditEvent } = await import("../repos/eventAccess.js");
      if (!(await canEditEvent(req.user.id, req.params.id))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const raw = req.body?.roomWelcome;
      const value = typeof raw === "string" ? raw.trim().slice(0, 2000) : "";
      const { supabase } = await import("../supabase.js");
      const { error } = await supabase
        .from("events")
        .update({ room_welcome: value || null })
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true, roomWelcome: value || null });
    } catch (err) {
      console.error("[room-welcome:put] error:", err.message);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });

  // The event-room roster — who's here, on the lifecycle: RSVP'd (coming) first,
  // then pull-up-only (showed). The shared area's "who's in the room", not a CRM.
  app.get("/host/events/:id/roster", requireAuth, async (req, res) => {
    try {
      const { isHost } = await hostGateForReq(req, req.params.id);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      res.json(await buildRosterPayload(req.params.id));
    } catch (err) {
      console.error("[roster] error:", err.message);
      res.status(500).json({ error: "Failed to load roster" });
    }
  });

  // The host's window into the room's darkroom — what guests shared at the event,
  // with who shared each. Owner-gated. Mirrors the guest interior's darkroom, but
  // from the host's seat (they don't need to have pulled up to their own event).
  app.get("/host/events/:id/darkroom", requireAuth, async (req, res) => {
    try {
      const { isHost } = await hostGateForReq(req, req.params.id);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      const { supabase } = await import("../supabase.js");
      const { data: media } = await supabase
        .from("event_media").select("id, storage_path, uploaded_by, created_at")
        .eq("event_id", req.params.id).eq("folder", "darkroom").order("created_at", { ascending: false });
      const ids = [...new Set((media || []).map((m) => m.uploaded_by).filter(Boolean))];
      const names = {};
      if (ids.length) {
        const { data: pp } = await supabase.from("people").select("id, name").in("id", ids);
        (pp || []).forEach((p) => { names[p.id] = p.name; });
      }
      const photos = (media || []).map((m) => {
        let url = m.storage_path;
        if (url && !url.startsWith("http")) {
          const mm = url.match(/event-images\/([^?]+)/);
          const fp = mm ? mm[1] : url;
          const { data: pub } = supabase.storage.from("event-images").getPublicUrl(fp);
          if (pub?.publicUrl) url = pub.publicUrl;
        }
        return { id: m.id, url, by: names[m.uploaded_by] || null };
      });
      res.json({ photos, count: photos.length });
    } catch (err) {
      console.error("[host-darkroom] error:", err.message);
      res.status(500).json({ error: "Failed to load darkroom" });
    }
  });
}
