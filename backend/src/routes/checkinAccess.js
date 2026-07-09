// Check-in + access routes: the host's rotating check-in QR code, the public
// event teaser, and THE event access resolver endpoint.

import { findEventById, isUserEventHost } from "../data.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { resolveAccessPayload, buildEventRoomView } from "../views/eventRoomView.js";

export function registerCheckinAccessRoutes(app) {
  // The host's live check-in code — the rotating QR they hold up. The client
  // re-fetches when `expiresInMs` elapses, so the displayed code is never stale.
  app.get("/host/events/:id/checkin-code", requireAuth, async (req, res) => {
    try {
      const event = await findEventById(req.params.id);
      if (!event) return res.status(404).json({ error: "Event not found" });
      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) return res.status(403).json({ error: "Forbidden" });
      const { currentCheckinCode } = await import("../services/pullupService.js");
      const code = await currentCheckinCode(event.id);
      res.json({
        eventId: event.id,
        window: code.window,
        sig: code.sig,
        url: code.path, // relative scan path the QR encodes
        stepSeconds: code.stepSeconds,
        expiresAt: code.expiresAt,
        expiresInMs: code.expiresInMs,
      });
    } catch (err) {
      console.error("[checkin-code] error:", err.message);
      res.status(500).json({ error: "Failed to generate check-in code" });
    }
  });

  // The teaser — sells the door without opening it. Counts + categories ONLY,
  // never interior content (counts aren't content, so this never breaks the
  // "no interior without a pull-up" rule). Public; safe pre-arrival on the event
  // page and in the locked at-event state.
  app.get("/p/:eventId/teaser", async (req, res) => {
    try {
      const { eventId } = req.params;
      const { supabase } = await import("../supabase.js");
      const { computeEventPhase, getComingCount, getPulledUpPersonIds } = await import("../services/pullupService.js");
      const [insideSet, { count: photoCount }, { data: ev }, coming] = await Promise.all([
        // Union of both pull-up sources so a host-run (no-QR) door isn't invisible.
        getPulledUpPersonIds(eventId),
        supabase.from("event_media").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("folder", "darkroom"),
        supabase.from("events").select("title, slug, host_id, starts_at, ends_at, location").eq("id", eventId).maybeSingle(),
        getComingCount(eventId),
      ]);
      const peopleInside = insideSet.size;
      // phase: upcoming (lobby open to RSVP'ers) | ongoing (pull-up only) | ended.
      const phase = ev ? computeEventPhase(ev.starts_at, ev.ends_at) : "upcoming";
      res.json({
        eventId,
        title: ev?.title || null,
        slug: ev?.slug || null,
        hostId: ev?.host_id || null,
        startsAt: ev?.starts_at || null,
        endsAt: ev?.ends_at || null,
        location: ev?.location || null,
        phase,
        coming,                       // non-cancelled RSVPs — the lobby's honest count
        peopleInside: peopleInside || 0,
        photoCount: photoCount || 0,
        // The room reads as "live" once more than one person is inside.
        conversationLive: (peopleInside || 0) > 1,
        ended: phase === "ended",     // kept for back-compat
      });
    } catch (err) {
      console.error("[teaser] error:", err.message);
      res.status(500).json({ error: "Failed to load teaser" });
    }
  });

  // THE access endpoint — the one permission gate, read by useEventAccess on the
  // frontend so every surface resolves "what can this viewer do here" the same
  // way. optionalAuth: a logged-in viewer resolves by session; a logged-out one
  // can pass ?email (the address they RSVP'd / pulled up with).
  app.get("/events/:id/access", optionalAuth, async (req, res) => {
    try {
      res.json(await resolveAccessPayload(req, req.params.id));
    } catch (err) {
      console.error("[access] error:", err.message);
      res.status(500).json({ error: "Failed to resolve access" });
    }
  });

  // Page-shaped first paint for the event Room: access + roster/co-presence +
  // channels + the Main feed in ONE call (the page then polls only /space).
  app.get("/events/:id/room-view", optionalAuth, async (req, res) => {
    try {
      res.json(await buildEventRoomView(req, req.params.id));
    } catch (err) {
      console.error("[room-view] error:", err.message);
      res.status(500).json({ error: "Failed to load the room" });
    }
  });
}
