// Check-in + access routes: the host's rotating check-in QR code, the public
// event teaser, and THE event access resolver endpoint.

import {
  findEventById,
  resolveViewer,
  adminForceLevel,
  isUserEventHost,
} from "../data.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";

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
      const { computeEventPhase, getComingCount } = await import("../services/pullupService.js");
      const [{ count: peopleInside }, { count: photoCount }, { data: ev }, coming] = await Promise.all([
        supabase.from("pullups").select("id", { count: "exact", head: true }).eq("event_id", eventId),
        supabase.from("event_media").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("folder", "darkroom"),
        supabase.from("events").select("title, slug, host_id, starts_at, ends_at, location").eq("id", eventId).maybeSingle(),
        getComingCount(eventId),
      ]);
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
      const { resolveEventAccess } = await import("../services/pullupService.js");
      const { supabase } = await import("../supabase.js");
      const eventId = req.params.id;
      // Identity = the verified session only (never a `?email=` query param). An
      // admin "View as" override (header, admin-gated) can still resolve as any user.
      const email = (req.user?.email || "").toString().trim().toLowerCase();
      const viewer = await resolveViewer(req, { email: email || null });
      const forced = await adminForceLevel(req);
      let access;
      if (forced) {
        // Admin forces a level to preview a state. Capabilities from defaults.
        const { resolveCapabilities } = await import("../services/roomPermissions.js");
        const { supabase: sb } = await import("../supabase.js");
        const { data: evp } = await sb.from("events").select("room_permissions").eq("id", eventId).maybeSingle();
        const stateForCaps = forced === "guest_pullup" ? "pulledup" : forced === "guest_waitlist" ? "waitlist" : forced === "guest_rsvp" ? "lobby" : null;
        access = {
          // "no_session" = preview the logged-out wall (auth gate); "no_access" =
          // logged in but denied (permission gate). Both forced, never time-derived.
          level: forced,
          role: forced === "host" ? "owner" : null,
          reason: forced === "no_access" ? "forced" : forced === "no_session" ? "no_session" : null,
          permissions: stateForCaps ? resolveCapabilities(evp, stateForCaps) : null,
        };
      } else {
        access = await resolveEventAccess({
          userId: viewer.impersonating ? viewer.authUserId : (req.user?.id || null),
          personId: viewer.person?.id || null,
          eventId,
        });
      }
      const { data: ev } = await supabase
        .from("events")
        .select("title, slug, starts_at, ends_at, status, location, cover_image_url, image_url, host_id")
        .eq("id", eventId)
        .maybeSingle();
      let cover = ev?.cover_image_url || ev?.image_url || null;
      if (cover && !cover.startsWith("http")) {
        const m = cover.match(/event-images\/([^?]+)/);
        const { data: pub } = supabase.storage.from("event-images").getPublicUrl(m ? m[1] : cover);
        if (pub?.publicUrl) cover = pub.publicUrl;
      }
      // The host's person room — where a guest exits TO (the host's world), not
      // their own home. roomId is the host's account id, which /r/:id resolves.
      let host = null;
      if (ev?.host_id) {
        const { data: hp } = await supabase.from("profiles").select("name").eq("id", ev.host_id).maybeSingle();
        host = { roomId: ev.host_id, name: hp?.name || null };
      }

      // The viewer's REAL ownership of THIS event — computed from the actual DB
      // host relationship (host_id / event_hosts), independent of any admin
      // View-as lens. Owner-commercial UI (the "buy for YOUR event" partner CTAs)
      // keys off THIS, never the forced level — so previewing "as host" on an
      // event you don't run never shows them.
      let realHost = false;
      if (req.user?.id) {
        const r = await isUserEventHost(req.user.id, eventId).catch(() => ({ isHost: false }));
        realHost = !!r.isHost;
      }

      res.json({
        eventId,
        level: access.level, // host | guest_pullup | guest_rsvp | guest_waitlist | no_access
        role: access.role || null, // host sub-role: owner | co_host | editor | reception | analytics
        // The viewer's resolved person id (the impersonated person under a View-as
        // lens). The room uses it to know which posts are YOURS — reliably, by id,
        // not by matching a display-name snapshot.
        personId: viewer.person?.id || null,
        realHost, // TRUE only if the logged-in user genuinely hosts this event (never forced)
        reason: access.reason || null,
        phase: access.phase || null,
        permissions: access.permissions || null,
        event: ev
          ? { title: ev.title, slug: ev.slug, startsAt: ev.starts_at, endsAt: ev.ends_at, status: ev.status, location: ev.location, cover, host }
          : null,
        // Admin View-as context (so the UI banner can show it). Null for everyone else.
        viewingAs: viewer.impersonating ? { id: viewer.person?.id, name: viewer.person?.name || null } : null,
        forced: forced || null,
      });
    } catch (err) {
      console.error("[access] error:", err.message);
      res.status(500).json({ error: "Failed to resolve access" });
    }
  });
}
