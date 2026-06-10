// Page-shaped read model for the event Room (/events/:id/room).
// One call returns everything the page needs for first paint — access verdict,
// roster (host) or co-presence (guest, seeWho-gated), channels, and the Main
// feed — instead of the 4 round-trips the page used to stitch client-side.
// The /events/:id/access route shares resolveAccessPayload so the permission
// verdict has exactly one implementation.
import { supabase } from "../supabase.js";
import { resolveViewer, adminForceLevel, isUserEventHost } from "../data.js";
import {
  resolveEventAccess,
  getRoomRoster,
  listChannels,
  listSpaceMessages,
} from "../services/pullupService.js";
import { resolveCapabilities } from "../services/roomPermissions.js";

// The single access verdict for a viewer on an event — body of the old
// GET /events/:id/access handler, moved verbatim so route + view share it.
export async function resolveAccessPayload(req, eventId) {
  // Identity = the verified session only (never a `?email=` query param). An
  // admin "View as" override (header, admin-gated) can still resolve as any user.
  const email = (req.user?.email || "").toString().trim().toLowerCase();
  const viewer = await resolveViewer(req, { email: email || null });
  const forced = await adminForceLevel(req);
  let access;
  if (forced) {
    // Admin forces a level to preview a state. Capabilities from defaults.
    const { data: evp } = await supabase.from("events").select("room_permissions").eq("id", eventId).maybeSingle();
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

  return {
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
  };
}

// The host roster block — body of the old GET /host/events/:id/roster handler,
// moved verbatim so route + view share it.
export async function buildRosterPayload(eventId) {
  // ONE roster source — the same getRoomRoster the guest "who's here" reads, so
  // host and guest always see a consistent room. The host gets BOTH clusters
  // (coming = who said yes, pulledUp = who showed) regardless of phase.
  const [{ data: ev }, { pulledUp, coming }] = await Promise.all([
    supabase.from("events").select("title, cover_image_url, image_url, starts_at, ends_at, location, status").eq("id", eventId).maybeSingle(),
    getRoomRoster(eventId),
  ]);

  const end = ev?.ends_at ? new Date(ev.ends_at).getTime() : (ev?.starts_at ? new Date(ev.starts_at).getTime() + 12 * 3600 * 1000 : null);
  // Resolve the cover to a real public URL — a bare storage_path renders as a
  // broken banner otherwise.
  let cover = ev?.cover_image_url || ev?.image_url || null;
  if (cover && !cover.startsWith("http")) {
    const match = cover.match(/event-images\/([^?]+)/);
    const fp = match ? match[1] : cover;
    const { data: pub } = supabase.storage.from("event-images").getPublicUrl(fp);
    if (pub?.publicUrl) cover = pub.publicUrl;
  }
  return {
    event: ev ? { title: ev.title, cover, startsAt: ev.starts_at, location: ev.location, status: ev.status, ended: end != null && Date.now() > end } : null,
    coming, pulledUp, comingCount: coming.length, pulledUpCount: pulledUp.length,
  };
}

// The one-call first paint for the event Room page.
export async function buildEventRoomView(req, eventId) {
  const access = await resolveAccessPayload(req, eventId);
  const view = { access, roster: null, coPresent: [], channels: [], messages: null };

  const isHost = access.level === "host";
  const isGuest = ["guest_pullup", "guest_rsvp", "guest_waitlist"].includes(access.level);
  const canRead = isHost || access.permissions?.read === true;

  if (!isHost && !isGuest) return view; // gate view — access verdict is the payload

  const work = [];
  if (canRead) {
    work.push(listChannels(eventId).then((c) => { view.channels = c; }));
    // Main feed (channelId null = Main) — matches what the page's first
    // loadMessages(mainChannelId) would fetch, so the client can seed from it.
    work.push(listSpaceMessages(eventId, { channelId: null }).then((m) => { view.messages = m; }));
  }
  if (isHost) {
    work.push(buildRosterPayload(eventId).then((r) => { view.roster = r; }));
  } else if (access.permissions?.seeWho === true && access.personId) {
    // Same shape the /p/:eventId/interior coPresent block returns: the live
    // room roster minus the viewer (server enforces seeWho; client trusts it).
    work.push(getRoomRoster(eventId).then((roster) => {
      view.coPresent = (roster.here || [])
        .filter((p) => p.id !== access.personId)
        .map((p) => ({ id: p.id, name: p.name, instagram: p.instagram }));
    }));
  }
  await Promise.all(work);
  return view;
}
