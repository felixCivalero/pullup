// Guest room surface (/p/:eventId/* — pull-up scan, interior, darkroom upload,
// channels/space chat, media sign, gifs) + person room payload (/r/:hostId).

import { optionalAuth } from "../middleware/auth.js";
import { validate, spaceMessageSchema } from "../middleware/validate.js";
import {
  resolveViewer,
  adminForceLevel,
  isAdminUser,
  isUserEventHost,
} from "../data.js";
import {
  getRoomAccessForReq,
  signRoomUpload,
  sanitizeRoomMedia,
  giphySearch,
} from "./roomShared.js";
import { getRoomForHost } from "../services/roomService.js";

export function registerRoomRoutes(app) {
  // The scan landing target. The guest scanned the host's live QR → verify the
  // rotating code, then record the pull-up for the VERIFIED SESSION standing
  // behind it. Two factors, both strong: the live code proves physical presence
  // at the door; the session (a real account) proves WHO. No email — a walk-in
  // with no account verifies first (the room's AuthGate, WhatsApp-fast), then the
  // scan records them. Identity here is never claimed, only proven.
  app.post("/p/:eventId/pullup", optionalAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { w, s } = req.body || {};
      const { verifyCheckinCode, recordPullUp } = await import("../services/pullupService.js");

      const check = await verifyCheckinCode(eventId, w, s);
      if (!check.valid) {
        // `expired` = they're scanning a stale screenshot, not the live screen.
        return res
          .status(check.reason === "expired" ? 410 : 400)
          .json({ ok: false, reason: check.reason });
      }

      // WHO = the verified session only (or an admin view-as). No session ⇒ the
      // walk-in must verify first; the frontend bounces `needs_identify` to the
      // room's AuthGate, then retries the scan with a real identity.
      const vw = await resolveViewer(req);
      const person = vw.person;
      if (!person) return res.status(401).json({ ok: false, reason: "needs_identify" });

      const result = await recordPullUp({ personId: person.id, eventId, method: "scan" });
      if (!result.ok) return res.status(500).json({ ok: false, reason: result.reason });

      res.json({ ok: true, alreadyPresent: !!result.alreadyPresent, personId: person.id });
    } catch (err) {
      console.error("[pullup] error:", err.message);
      res.status(500).json({ ok: false, reason: "pullup_failed" });
    }
  });


  // The interior — only for nodes that pulled up to THIS event. The room they
  // earned: who else is here (co-presence, same-event only) + the shared photos.
  // This is the teaser's promise actually opened — gated, never public.
  app.get("/p/:eventId/interior", optionalAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { getRoomRoster, getRoomAccess, getComingCount } = await import("../services/pullupService.js");
      const { supabase } = await import("../supabase.js");

      // Identity = the verified session only; a `?email=` query param is ignored.
      const email = (req.user?.email || "").toString().trim().toLowerCase();
      const viewer = await resolveViewer(req, { email: email || null });
      const person = viewer.person;
      if (!person) return res.status(403).json({ error: "locked", reason: "no_identity" });

      // Time-phased gate: pulled up (forever) OR in the pre-event lobby (RSVP'd +
      // not started). Locked otherwise — the frontend bounces "event_started_no_pullup"
      // to the host's profile room.
      const access = await getRoomAccessForReq(req, person.id, eventId);
      if (access.access === "locked") {
        return res.status(403).json({ error: "locked", reason: access.reason, phase: access.phase });
      }
      const caps = access.permissions || {};
      // The host can close the room at this state (e.g. a teaser-only lobby that
      // opens once people pull up). Pulled-up read is always on (earned).
      if (!caps.read) {
        return res.status(403).json({ error: "locked", reason: "read_off", phase: access.phase });
      }

      // "Who's here" = the LIVE room roster (RSVP'd lobby + pulled-up), shown only
      // when the host lets this state see who's here. Phase-correct: before the
      // doors the whole lobby crowd is here; once the event starts the lobby
      // closes and only pulled-up people remain (mirrors the access gate). This is
      // the room roster, NOT the durable pull-up mesh — so it's populated in the
      // lobby, which is the whole point of the seeWho capability for RSVP'd/waitlist.
      let coPresent = [];
      if (caps.seeWho) {
        const roster = await getRoomRoster(eventId);
        coPresent = roster.here
          .filter((p) => p.id !== person.id)
          .map((p) => ({ id: p.id, name: p.name, instagram: p.instagram }));
      }

      // The room's DARKROOM = peer-shared content (folder='darkroom'), kept apart
      // from the host's marketing gallery (folder NULL, which lives on the public
      // event page). Newest first — the room fills as people drop photos.
      const { data: media } = await supabase
        .from("event_media").select("id,storage_path,uploaded_by,created_at").eq("event_id", eventId).eq("folder", "darkroom").order("created_at", { ascending: false });
      const photos = (media || []).map((m) => {
        let url = m.storage_path;
        if (url && !url.startsWith("http")) {
          const match = url.match(/event-images\/([^?]+)/);
          const fp = match ? match[1] : url;
          const { data: pub } = supabase.storage.from("event-images").getPublicUrl(fp);
          if (pub?.publicUrl) url = pub.publicUrl;
        }
        return { id: m.id, url, mine: m.uploaded_by === person.id };
      });

      const coming = await getComingCount(eventId);
      res.json({ eventId, access: access.access, phase: access.phase, permissions: caps, coming, coPresent, photos, photoCount: photos.length });
    } catch (err) {
      console.error("[interior] error:", err.message);
      res.status(500).json({ error: "Failed to load interior" });
    }
  });

  // Drop a photo INTO the room's darkroom — the "sharing content inside the event
  // room" path. Gated by the host's `upload` capability for the viewer's state
  // (default: pulled-up only). Lands in folder='darkroom' so it shows in the room
  // but never leaks onto the public event page. Mirrors the host attachment path
  // (base64 dataUrl in, direct-to-storage).
  app.post("/p/:eventId/upload", optionalAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { dataUrl } = req.body || {};
      const { getRoomAccess } = await import("../services/pullupService.js");
      const { supabase } = await import("../supabase.js");

      // Writing into the room is identity = the verified session only; a
      // body-supplied email is no longer accepted (would let anyone post/upload
      // as someone else).
      const norm = (req.user?.email || "").toString().trim().toLowerCase();
      const viewer = await resolveViewer(req, { email: norm || null });
      const person = viewer.person;
      if (!person) return res.status(403).json({ ok: false, reason: "no_identity" });

      const access = await getRoomAccessForReq(req, person.id, eventId);
      if (access.access === "locked") return res.status(403).json({ ok: false, reason: access.reason });
      if (!access.permissions?.upload) return res.status(403).json({ ok: false, reason: "upload_off" });

      if (!dataUrl || typeof dataUrl !== "string") return res.status(400).json({ ok: false, reason: "no_file" });
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return res.status(400).json({ ok: false, reason: "bad_data_url" });
      const contentType = m[1];
      const buffer = Buffer.from(m[2], "base64");
      if (buffer.length > 15 * 1024 * 1024) return res.status(413).json({ ok: false, reason: "too_large" });

      const isVideo = contentType.startsWith("video/");
      const ext = (contentType.split("/")[1] || "jpg").split("+")[0].replace(/[^a-z0-9]/gi, "") || "jpg";
      const path = `${eventId}/darkroom_${person.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("event-images").upload(path, buffer, { contentType, upsert: false });
      if (upErr) { console.error("[room-upload] storage:", upErr.message); return res.status(500).json({ ok: false, reason: "upload_failed" }); }

      const { data: row, error: insErr } = await supabase
        .from("event_media")
        .insert({ event_id: eventId, media_type: isVideo ? "video" : "image", storage_path: path, folder: "darkroom", is_cover: false, mime_type: contentType, uploaded_by: person.id, position: 9999 })
        .select("id").maybeSingle();
      if (insErr) { console.error("[room-upload] insert:", insErr.message); return res.status(500).json({ ok: false, reason: "save_failed" }); }

      const { data: pub } = supabase.storage.from("event-images").getPublicUrl(path);
      res.json({ ok: true, photo: { id: row?.id, url: pub?.publicUrl || null, mine: true } });
    } catch (err) {
      console.error("[room-upload] error:", err.message);
      res.status(500).json({ ok: false, reason: "upload_failed" });
    }
  });

  // A NODE's profile — the room's public face. The two counts are the whole
  // identity signal (events made + pull-ups). Events render through the VIEWER's
  // eyes: enterable if they pulled up, "going" if they RSVP'd, locked otherwise.
  // Visible to anyone in the host's orbit (the invitation layer).
  app.get("/r/:hostId", optionalAuth, async (req, res) => {
    try {
      const { hostId } = req.params;
      const { supabase } = await import("../supabase.js");

      // Resolve the node — every person has a room. It's either an ACCOUNT
      // (profiles row, id == auth user) or a bare PERSON (people row, a guest who
      // hasn't claimed an account yet). Either id resolves here so the world list
      // can link to anyone, account or not.
      let { data: profile } = await supabase
        .from("profiles").select("id, name, bio, profile_picture_url, branding_links").eq("id", hostId).maybeSingle();
      let personRow = null;
      if (!profile) {
        const { data: pr } = await supabase.from("people").select("id, name, auth_user_id").eq("id", hostId).maybeSingle();
        if (!pr) return res.status(404).json({ error: "not_found" });
        personRow = pr;
        // If this person has since claimed an account, prefer the account identity.
        if (pr.auth_user_id) {
          const { data: p2 } = await supabase.from("profiles").select("id, name, bio, profile_picture_url, branding_links").eq("id", pr.auth_user_id).maybeSingle();
          if (p2) profile = p2;
        }
      }
      const accountId = profile?.id || null;                 // drives hosted events (host_id)
      const nodeName = profile?.name || personRow?.name || "Someone";
      // PUBLIC bio only — never the internal host_brief (that's the AI-coach's
      // strategy notes; showing it would leak sponsor plans to guests).
      const nodeBio = profile?.bio || null;
      const nodeAvatar = profile?.profile_picture_url || null;
      const { buildSocials, resolveEventImage } = await import("../services/roomService.js");
      const nodeSocials = profile ? buildSocials(profile.branding_links) : [];
      const nodeRoomId = accountId || personRow.id;          // canonical room id

      // Is the viewer standing in their OWN room? (inside vs outside)
      const isOwner = !!req.user?.id && req.user.id === accountId;
      // Admin "View as" maps onto the profile's real axis and OVERRIDES reality
      // (so you can preview your OWN profile as a visitor): Host → owner view
      // (drafts + create), any guest/locked tier → NOT owner (visitor/wall),
      // no force → your real ownership.
      const forced = await adminForceLevel(req);
      const effectiveOwner = forced === "host" ? true : forced ? false : isOwner;

      // The events this node HOSTS. RELATIONSHIPS ARE PERMANENT: an event with any
      // RSVP/pull-up activity is a real event — it shows and counts regardless of
      // its current draft flag (a host can re-draft a past event and its guests
      // stay). A pristine, never-live draft (no activity) is owner-only.
      const hostSelect = "id, slug, title, cover_image_url, image_url, starts_at, ends_at, status";
      let allHosted = [];
      if (accountId) {
        const { data } = await supabase.from("events").select(hostSelect).eq("host_id", accountId).order("starts_at", { ascending: false });
        allHosted = data || [];
      }
      const allHostedIds = allHosted.map((e) => e.id);

      // The permanent relationship graph: every RSVP (non-cancelled) + pull-up to
      // the host's events, ANY status. This is what an "RSVP is an RSVP" means.
      let rsvpRows = [], pullupRows = [];
      if (allHostedIds.length) {
        const { data: rs } = await supabase
          .from("rsvps").select("person_id, event_id, pulled_up").in("event_id", allHostedIds).neq("status", "cancelled");
        rsvpRows = rs || [];
        // A pull-up = an RSVP that actually showed (rsvps.pulled_up). The standalone
        // `pullups` table is legacy and empty — the real signal lives on the RSVP.
        pullupRows = rsvpRows.filter((r) => r.pulled_up === true);
      }
      // The host CAN draft an event to hide it from the public list (their choice);
      // visitors see published only, owner sees all. But the STATS below persist
      // regardless — drafting hides the event, never the relationships.
      const hosted = effectiveOwner ? allHosted : allHosted.filter((e) => e.status === "PUBLISHED");
      const hostedIds = hosted.map((e) => e.id);

      // World = the host's real audience: everyone who RSVP'd OR pulled up to their
      // events (ANY status). Never erased by a status change.
      const worldPersonIds = [...new Set([...rsvpRows.map((r) => r.person_id), ...pullupRows.map((r) => r.person_id)].filter(Boolean))];

      // This node's own person record (drives "pulled up to"). Either the bare
      // person row, or the person linked to the account.
      let nodePersonId = personRow?.id || null;
      if (!nodePersonId && accountId) {
        const { data: np } = await supabase.from("people").select("id").eq("auth_user_id", accountId).maybeSingle();
        nodePersonId = np?.id || null;
      }

      // The events this node has PULLED UP TO (as a guest, anywhere) — any status
      // (a pull-up is a real relationship, never hidden by the event's flag).
      let pulledUpRows = [];
      if (nodePersonId) {
        const { data: myUps } = await supabase.from("rsvps").select("event_id").eq("person_id", nodePersonId).eq("pulled_up", true);
        const upIds = [...new Set((myUps || []).map((r) => r.event_id))];
        if (upIds.length) {
          const { data: evs } = await supabase.from("events").select(hostSelect).in("id", upIds).order("starts_at", { ascending: false });
          pulledUpRows = evs || [];
        }
      }

      // Build the "people in [name]'s world" list. Everyone is clickable into
      // their own room — accounts use their auth id, bare guests use their
      // person id (both resolve at the top of this handler).
      let people = [];
      if (worldPersonIds.length) {
        const { data: pp } = await supabase.from("people").select("id, name, auth_user_id").in("id", worldPersonIds).limit(300);
        people = (pp || [])
          .map((p) => ({ name: p.name || "Someone", roomId: p.auth_user_id || p.id }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      // Per-event pull-up tally across the host's events. The "pull-ups" count is
      // the total the host has GATHERED through their events (not the events this
      // node attended as a guest) — the engagement they've earned.
      const pullupCountByEvent = {};
      for (const r of pullupRows) pullupCountByEvent[r.event_id] = (pullupCountByEvent[r.event_id] || 0) + 1;

      const counts = {
        people: worldPersonIds.length,
        hosted: hosted.length,
        pulledUp: pullupRows.length,
      };

      // Viewer-relative state across every event we might render (hosted + pulled-up).
      // Identity = the verified session only; a `?email=` query param is ignored,
      // so a logged-out visitor can't probe whose room this is relative to them.
      const email = (req.user?.email || "").toString().trim().toLowerCase();
      const vw = await resolveViewer(req, { email: email || null });
      const viewer = vw.person;
      const allIds = [...new Set([...hostedIds, ...pulledUpRows.map((e) => e.id)])];
      let myPullups = new Set(), myRsvps = new Set();
      if (viewer && allIds.length) {
        const { data: rs } = await supabase.from("rsvps").select("event_id, pulled_up").eq("person_id", viewer.id).in("event_id", allIds);
        myRsvps = new Set((rs || []).map((r) => r.event_id));
        myPullups = new Set((rs || []).filter((r) => r.pulled_up === true).map((r) => r.event_id));
      }
      const inOrbit = myPullups.size > 0 || myRsvps.size > 0;

      // Header = the public face (shareable, IG-style): who you are. Content (the
      // events + world) needs a PullUp SESSION — anyone sees WHO you are; you log in
      // to see more. Keeps PullUp from being a public event-discovery directory
      // while letting a creator share their /r/ link as a real landing page.
      const header = { id: nodeRoomId, name: nodeName, bio: nodeBio, avatar: nodeAvatar, socials: nodeSocials, counts };
      const hasSession = !!req.user?.id;
      const adminViewer = await isAdminUser(req.user?.id);
      // Preview the logged-out wall: "no_session" (no login) and "no_access"
      // (logged in, denied) both render the gate on a person's room — its content
      // always needs a session, so either lens shows the same wall here.
      const forcedLocked = forced === "no_access" || forced === "no_session";
      if (forcedLocked || (!hasSession && !adminViewer)) {
        return res.json({ gated: "login", node: header, viewer: { known: false, inOrbit: false, isOwner: false } });
      }

      const now = Date.now();
      // Admin can force the guest tier onto every tile (preview "how it looks if
      // you pulled up / RSVP'd / are waitlisted"). Otherwise it's the real relationship.
      const forcedTile = forced === "guest_pullup" ? "pulledup" : forced === "guest_rsvp" ? "rsvped" : forced === "guest_waitlist" ? "waitlist" : null;
      const mapTile = (e) => {
        const end = e.ends_at ? new Date(e.ends_at).getTime() : (e.starts_at ? new Date(e.starts_at).getTime() + 12 * 3600 * 1000 : null);
        const viewerState = effectiveOwner ? "owner" : forcedTile ? forcedTile : myPullups.has(e.id) ? "pulledup" : myRsvps.has(e.id) ? "rsvped" : "none";
        return {
          id: e.id,
          slug: e.slug,
          title: e.title,
          cover: resolveEventImage(e.cover_image_url || e.image_url),
          startsAt: e.starts_at,
          ended: end != null && now > end,
          draft: e.status !== "PUBLISHED",
          viewer: viewerState,
          pullups: pullupCountByEvent[e.id] || 0,
        };
      };

      // The people list (their world) is the creator's AUDIENCE — show it only to
      // the owner / admin / people already in their orbit. Other logged-in visitors
      // get the count only (in `counts`), never the names. Protects data ownership.
      const showPeople = effectiveOwner || adminViewer || inOrbit;

      // When the viewer stands in their OWN room, attach the operating-console
      // payload (rich events, signals, moments, member rooms, people-with-warmth
      // + thread). This is what used to live behind the separate /host/room
      // endpoint: the room is now ONE viewer-relative surface, and the console is
      // simply the owner's slice of it. Non-owners never receive it.
      let consolePayload = null;
      if (effectiveOwner && accountId) {
        try {
          consolePayload = await getRoomForHost(accountId, { email: email || null });
        } catch (e) {
          console.error("[node-profile] console build failed:", e.message);
        }
      }

      res.json({
        node: header,
        viewer: { known: !!viewer, inOrbit, isOwner: effectiveOwner },
        hosted: hosted.map(mapTile),
        pulledUp: pulledUpRows.map(mapTile),
        people: showPeople ? people : [],
        console: consolePayload,
      });
    } catch (err) {
      console.error("[node-profile] error:", err.message);
      res.status(500).json({ error: "Failed to load profile" });
    }
  });

  // The event SPACE — the room's COLLECTIVE conversation, organised into TOPICS
  // (channels). Read/post gated by a pull-up: spokes (RSVP-only) can't see or
  // reach it; co-present nodes wire sideways. No DM primitive, no single-line —
  // it's shared, event-scoped, topic-organised. Topics are host-curated.

  // Topics a guest can see (pull-up gated).
  app.get("/p/:eventId/channels", optionalAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { getRoomAccess, listChannels } = await import("../services/pullupService.js");
      // Identity = the verified session only; a `?email=` query param is ignored.
      const email = (req.user?.email || "").toString().trim().toLowerCase();
      const viewer = await resolveViewer(req, { email: email || null });
      const person = viewer.person;
      if (!person) return res.status(403).json({ error: "locked", reason: "no_identity" });
      const access = await getRoomAccessForReq(req, person.id, eventId);
      if (access.access === "locked") {
        return res.status(403).json({ error: "locked", reason: access.reason });
      }
      if (!access.permissions?.read) return res.status(403).json({ error: "locked", reason: "read_off" });
      res.json({ channels: await listChannels(eventId) });
    } catch (err) {
      console.error("[channels:get] error:", err.message);
      res.status(500).json({ error: "Failed to load topics" });
    }
  });

  app.get("/p/:eventId/space", optionalAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { getRoomAccess, listSpaceMessages } = await import("../services/pullupService.js");
      // Identity = the verified session only; a `?email=` query param is ignored.
      const email = (req.user?.email || "").toString().trim().toLowerCase();
      const viewer = await resolveViewer(req, { email: email || null });
      const person = viewer.person;
      if (!person) return res.status(403).json({ error: "locked", reason: "no_identity" });
      const access = await getRoomAccessForReq(req, person.id, eventId);
      if (access.access === "locked") {
        return res.status(403).json({ error: "locked", reason: access.reason });
      }
      if (!access.permissions?.read) return res.status(403).json({ error: "locked", reason: "read_off" });
      res.json({ messages: await listSpaceMessages(eventId, { channelId: req.query.channelId || null }) });
    } catch (err) {
      console.error("[space:get] error:", err.message);
      res.status(500).json({ error: "Failed to load the room" });
    }
  });

  app.post("/p/:eventId/space", optionalAuth, validate(spaceMessageSchema), async (req, res) => {
    try {
      const { eventId } = req.params;
      // A post is text, attached media (already uploaded via the signed URL, or a
      // Giphy gif), or both — in a SUBJECT (channelId, default Room chat) — and may
      // reply to another post (parentId) or be born pinned ("attach to the top").
      const { body, parentId, media, pinned, channelId } = req.body || {};
      const cleanMedia = sanitizeRoomMedia(media);
      const { postSpaceMessage, listSpaceMessages } = await import("../services/pullupService.js");
      // Posting into the room is identity = the verified session only; a
      // body-supplied email is no longer accepted (would let anyone post as someone else).
      const norm = (req.user?.email || "").toString().trim().toLowerCase();
      const viewer = await resolveViewer(req, { email: norm || null });
      const person = viewer.person;
      if (!person) return res.status(403).json({ error: "locked", reason: "no_identity" });
      const access = await getRoomAccessForReq(req, person.id, eventId);
      if (access.access === "locked") {
        return res.status(403).json({ ok: false, error: "locked", reason: access.reason });
      }
      // Host-configurable: text needs `post`, attaching media needs `upload`.
      const hasText = !!(body && body.toString().trim());
      if (hasText && !access.permissions?.post) {
        return res.status(403).json({ ok: false, error: "locked", reason: "posting_off" });
      }
      if (cleanMedia.length && !access.permissions?.upload) {
        return res.status(403).json({ ok: false, error: "locked", reason: "upload_off" });
      }
      const r = await postSpaceMessage({ eventId, channelId: channelId || null, personId: person.id, authorName: person.name || "Someone", body, parentId: parentId || null, media: cleanMedia, pinned: !!pinned });
      if (!r.ok) return res.status(400).json({ ok: false, reason: r.reason });
      res.json({ ok: true, messages: await listSpaceMessages(eventId, { channelId: r.channelId }) });
    } catch (err) {
      console.error("[space:post] error:", err.message);
      res.status(500).json({ ok: false, reason: "post_failed" });
    }
  });

  // Mint a signed direct-to-storage upload URL for room media (guest path). Gated
  // by the room's `upload` capability for the viewer's state.
  app.post("/p/:eventId/media/sign", optionalAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const norm = (req.user?.email || "").toString().trim().toLowerCase();
      const viewer = await resolveViewer(req, { email: norm || null });
      const person = viewer.person;
      if (!person) return res.status(403).json({ ok: false, reason: "no_identity" });
      const access = await getRoomAccessForReq(req, person.id, eventId);
      if (access.access === "locked") return res.status(403).json({ ok: false, reason: access.reason });
      if (!access.permissions?.upload) return res.status(403).json({ ok: false, reason: "upload_off" });
      const out = await signRoomUpload(eventId, person.id, req.body || {});
      return res.status(out.ok ? 200 : 400).json(out);
    } catch (err) {
      console.error("[media:sign] error:", err.message);
      res.status(500).json({ ok: false, reason: "sign_failed" });
    }
  });

  // GIF search (guest path) — pull-up gated like the rest of the room.
  app.get("/p/:eventId/gifs", optionalAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const norm = (req.user?.email || "").toString().trim().toLowerCase();
      const viewer = await resolveViewer(req, { email: norm || null });
      const person = viewer.person;
      if (!person) return res.status(403).json({ error: "locked", reason: "no_identity" });
      const access = await getRoomAccessForReq(req, person.id, eventId);
      if (access.access === "locked" || !access.permissions?.read) return res.status(403).json({ error: "locked" });
      res.json(await giphySearch(req.query.q));
    } catch (err) {
      console.error("[gifs:get] error:", err.message);
      res.status(500).json({ disabled: false, gifs: [] });
    }
  });

  // Attach a post to the top of the room (or take it back down). A guest may pin
  // their OWN post; the host may pin anyone's. Returns the fresh feed.
  app.post("/p/:eventId/space/:messageId/pin", optionalAuth, async (req, res) => {
    try {
      const { eventId, messageId } = req.params;
      const pinned = !!(req.body?.pinned);
      const { getSpaceMessage, setMessagePinned, listSpaceMessages } = await import("../services/pullupService.js");
      const msg = await getSpaceMessage(messageId);
      if (!msg || msg.event_id !== eventId) return res.status(404).json({ ok: false, reason: "not_found" });

      // Host of the event may pin anything; otherwise you must own the post.
      let allowed = false;
      if (req.user?.id) {
        const { isHost } = await isUserEventHost(req.user.id, eventId).catch(() => ({ isHost: false }));
        if (isHost) allowed = true;
      }
      if (!allowed) {
        const norm = (req.user?.email || "").toString().trim().toLowerCase();
        const viewer = await resolveViewer(req, { email: norm || null });
        if (viewer.person && msg.author_person_id === viewer.person.id) allowed = true;
      }
      if (!allowed) return res.status(403).json({ ok: false, reason: "not_yours" });

      const r = await setMessagePinned({ eventId, messageId, pinned });
      if (!r.ok) return res.status(400).json({ ok: false, reason: r.reason });
      res.json({ ok: true, messages: await listSpaceMessages(eventId, { channelId: msg.channel_id || null }) });
    } catch (err) {
      console.error("[space:pin] error:", err.message);
      res.status(500).json({ ok: false, reason: "pin_failed" });
    }
  });

  // Edit your OWN post (text only). A guest may edit only their own; the room
  // shows a quiet "· edited" after. Identity is the verified session — never a
  // body-supplied email.
  app.patch("/p/:eventId/space/:messageId", optionalAuth, async (req, res) => {
    try {
      const { eventId, messageId } = req.params;
      const { body } = req.body || {};
      const { getSpaceMessage, editSpaceMessage, listSpaceMessages } = await import("../services/pullupService.js");
      const msg = await getSpaceMessage(messageId);
      if (!msg || msg.event_id !== eventId) return res.status(404).json({ ok: false, reason: "not_found" });
      const norm = (req.user?.email || "").toString().trim().toLowerCase();
      const viewer = await resolveViewer(req, { email: norm || null });
      if (!viewer.person || msg.author_person_id !== viewer.person.id) return res.status(403).json({ ok: false, reason: "not_yours" });
      const r = await editSpaceMessage({ eventId, messageId, body });
      if (!r.ok) return res.status(400).json({ ok: false, reason: r.reason });
      res.json({ ok: true, messages: await listSpaceMessages(eventId, { channelId: msg.channel_id || null }) });
    } catch (err) {
      console.error("[space:edit] error:", err.message);
      res.status(500).json({ ok: false, reason: "edit_failed" });
    }
  });

  // Delete your OWN post. A guest may delete only their own (the host has a
  // moderation route below that can remove anything). Leaf → gone; has replies →
  // soft-deleted so the thread survives. Session identity only.
  app.delete("/p/:eventId/space/:messageId", optionalAuth, async (req, res) => {
    try {
      const { eventId, messageId } = req.params;
      const { getSpaceMessage, deleteSpaceMessage, listSpaceMessages } = await import("../services/pullupService.js");
      const msg = await getSpaceMessage(messageId);
      if (!msg || msg.event_id !== eventId) return res.status(404).json({ ok: false, reason: "not_found" });
      const norm = (req.user?.email || "").toString().trim().toLowerCase();
      const viewer = await resolveViewer(req, { email: norm || null });
      if (!viewer.person || msg.author_person_id !== viewer.person.id) return res.status(403).json({ ok: false, reason: "not_yours" });
      const r = await deleteSpaceMessage({ eventId, messageId });
      if (!r.ok) return res.status(400).json({ ok: false, reason: r.reason });
      res.json({ ok: true, messages: await listSpaceMessages(eventId, { channelId: msg.channel_id || null }) });
    } catch (err) {
      console.error("[space:delete] error:", err.message);
      res.status(500).json({ ok: false, reason: "delete_failed" });
    }
  });
}
