// backend/src/services/roomService.js
//
// THE ROOM — read model. Assembles the global Room payload for one host from
// the spine (person_identities + person_events) plus people/events. This is the
// READ side of "the Room is a read over the timeline" (north star).
//
// It returns the SAME shape the RoomPage fixtures use today
// (roomGlobalFixtures.js: HOST / EVENTS / SIGNALS / PEOPLE) so the frontend can
// swap the import for a fetch with no component changes.
//
// What's computed here (v1 — heuristics, honest and explainable; no AI yet):
//   * warmth      — from attendance count + recency, 0..1
//   * relationship— a plain-language read derived from the same facts
//   * needsYou/move — simple, truthful rules (waitlisted→offer spot, etc.)
//   * thread      — the person's real person_events, newest→oldest
//   * signals     — recent notable events surfaced as nudges
// Everything is grounded in real touchpoints — the anti-extraction line: we
// describe care that exists, we don't manufacture it.

import { supabase } from "../supabase.js";
import { deriveEventListingStatus } from "../lib/eventLifecycle.js";
import { logger } from "../logger.js";
import { getUserProfile } from "../data.js";
import { getConnectionsForHost } from "../instagram/repos/instagramConnectionsRepo.js";
import { getForPersons, resolveDisplay } from "./personSourceProfiles.js";
import { resolveEffectiveAvatar } from "./effectiveAvatar.js";
import { IG_HUMAN_AGENT_APPROVED } from "../instagram/config.js";
// Chunked id-filtered reads (shared safe-query toolkit) — a single oversized
// .in() 400s, which once emptied the whole Room. fn(idsChunk) -> rows[].
import { inChunks as chunkedByIds } from "../db/safeQuery.js";
import { getSystemPersonId } from "../repos/systemPerson.js";
import { listHostProducts } from "./productPlacement.js";

// The host's own profile, shaped for the Room masthead — so the page reads as
// "this is YOUR profile, these are YOUR people" (the social-dashboard framing).
// Best-effort: a profile hiccup must never blank the Room.
function igHandleFrom(profile) {
  const raw = profile?.brandingLinks?.instagram || "";
  if (!raw) return null;
  const m = String(raw).match(/instagram\.com\/([^/?#]+)/i);
  const h = (m ? m[1] : raw).replace(/^@/, "").replace(/\/+$/, "").trim();
  return h ? `@${h}` : null;
}

// Whatever channels the host filled in under Settings → social links. We don't
// assume Instagram — each gets its real channel + a tappable URL so the UI shows
// the right icon and links to the right place. value may be a bare @handle or a
// full URL; we accept both.
function ensureUrl(v) {
  // Strip a leading @ — people type "@handle" out of habit (the settings
  // placeholders even invite it), which would otherwise yield https://@handle.
  const s = String(v || "").trim().replace(/^@+/, "");
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
}
// Instagram / X don't use @ in their profile paths, so a pasted
// instagram.com/@handle 404s. Collapse a stray /@ right after the host.
function stripPathAt(url, hostPattern) {
  return String(url).replace(new RegExp(`(${hostPattern}\\/)@+`, "i"), "$1");
}
function handleFrom(v, hostPattern) {
  const s = String(v || "").trim();
  const m = s.match(new RegExp(`${hostPattern}\\/(?:@)?([^/?#]+)`, "i"));
  const h = (m ? m[1] : s).replace(/^@/, "").replace(/\/+$/, "").trim();
  return h || null;
}
// YouTube can be a vanity handle (/@name), legacy /c/ /user/ paths, or a raw
// /channel/UC… id. We surface a friendly @handle / name, but never the opaque
// channel id (falls back to the channel label instead).
function youtubeDisplay(v) {
  const s = String(v || "").trim();
  const at = s.match(/youtube\.com\/@([^/?#]+)/i);
  if (at) return at[1];
  const named = s.match(/youtube\.com\/(?:c|user)\/([^/?#]+)/i);
  if (named) return named[1];
  if (!/^https?:|youtube\.com|youtu\.be/i.test(s)) return s.replace(/^@/, "").trim() || null;
  return null;
}
// LinkedIn: /in/<person> or /company/<name>. Show the slug, prettified.
function linkedinDisplay(v) {
  const s = String(v || "").trim();
  const m = s.match(/linkedin\.com\/(?:in|company|pub|school)\/([^/?#]+)/i);
  if (m) return decodeURIComponent(m[1]).replace(/\/+$/, "");
  if (!/^https?:|linkedin\.com/i.test(s)) return s.replace(/^@/, "").trim() || null;
  return null;
}
// Website: show the bare domain (felixcivalero.com), dropping scheme/www/path.
function websiteDisplay(v) {
  const s = String(v || "").trim().replace(/^@+/, "");
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?([^/?#]+)/i);
  return m ? m[1].replace(/\/+$/, "") : null;
}
export function buildSocials(links = {}) {
  const L = links || {};
  const out = [];
  const ig = (L.instagram || "").trim();
  if (ig) { const h = handleFrom(ig, "instagram\\.com"); out.push({ channel: "instagram", label: "Instagram", handle: h || null, url: /^https?:/i.test(ig) ? stripPathAt(ig, "instagram\\.com") : `https://instagram.com/${h}` }); }
  const tt = (L.tiktok || "").trim();
  if (tt) { const h = handleFrom(tt, "tiktok\\.com"); out.push({ channel: "tiktok", label: "TikTok", handle: h || null, url: /^https?:/i.test(tt) ? tt : `https://www.tiktok.com/@${h}` }); }
  const x = (L.x || "").trim();
  if (x) { const h = handleFrom(x, "(?:x|twitter)\\.com"); out.push({ channel: "x", label: "X", handle: h || null, url: /^https?:/i.test(x) ? stripPathAt(x, "(?:x|twitter)\\.com") : `https://x.com/${h}` }); }
  const yt = (L.youtube || "").trim();
  if (yt) { out.push({ channel: "youtube", label: "YouTube", handle: youtubeDisplay(yt), url: ensureUrl(yt) }); }
  const li = (L.linkedin || "").trim();
  if (li) { out.push({ channel: "linkedin", label: "LinkedIn", handle: linkedinDisplay(li), url: ensureUrl(li) }); }
  const web = (L.website || "").trim();
  if (web) { out.push({ channel: "website", label: "Website", handle: websiteDisplay(web), url: ensureUrl(web) }); }
  return out;
}
async function buildHostProfile(hostId) {
  let base = {};
  try {
    const p = await getUserProfile(hostId);
    // A short "role" line: their own bio if set, else brand + city.
    const role = (p?.bio || "").trim()
      || [p?.brand, p?.city].map((s) => (s || "").trim()).filter(Boolean).join(" · ")
      || null;
    const avatar = await resolveEffectiveAvatar({
      uploaded: p?.profilePicture,
      accountId: hostId,
      brandLogo: p?.brandLogoUrl || p?.brandLogo,
    });
    base = {
      name: (p?.name || "").trim() || null,
      handle: igHandleFrom(p),
      avatar,
      role,
      // For the composer's "Quick access" — share your own profile / number.
      phone: p?.phone_e164 || null,
      instagramUrl: p?.brandingLinks?.instagram || null,
      // Every social channel they actually configured (not just IG), each with
      // its real channel + tappable URL so the masthead shows the right icon.
      socials: buildSocials(p?.brandingLinks),
    };
  } catch (err) {
    logger?.warn?.("[roomService] host profile read failed", { error: err?.message });
  }
  // The host's connected IG accounts — powers the composer's "reply from" picker
  // when they've connected more than one (personal + business). Best-effort.
  try {
    const conns = await getConnectionsForHost(hostId);
    base.igAccounts = conns.map((c) => ({
      id: c.id,
      username: c.ig_username,
      label: c.label || null,
      isDefault: !!c.is_default,
    }));
  } catch {
    base.igAccounts = [];
  }
  return base;
}

const CARD_COLORS = ["#ec4899", "#8b5cf6", "#0891b2", "#16a34a", "#d97706", "#6366f1", "#db2777", "#0d9488", "#e11d48", "#7c3aed"];
function colorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CARD_COLORS[h % CARD_COLORS.length];
}
function initials(name, email) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}
// A human date label for an event poster. Future events read as a date/"in N
// days"; past events read as "N ago"; drafts say "Draft".
function eventDateLabel(iso, status) {
  if (status === "draft") return "Draft";
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const days = Math.round((t - Date.now()) / 86400000);
  if (status === "live") {
    if (days < 0) return "Happening now";
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days < 7) return `In ${days} days`;
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  // past
  return relTime(iso);
}

function relTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const mo = Math.round(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yrs = Math.round(mo / 12);
  // Guard against junk dates (near-epoch / placeholder years) reading as "126y ago".
  return yrs > 20 ? "A while ago" : `${yrs}y ago`;
}

// Resolve an event cover to a real, renderable URL. Covers are stored as
// `event-images` bucket paths (not full URLs) — passing the raw path to an
// <img> src fails, which is why Room posters were falling back to gradients.
// Mirrors the public-URL logic in data.js (the bucket is public; permanent URL).
export function resolveEventImage(raw) {
  if (!raw) return null;
  if (String(raw).startsWith("http")) return raw;
  try {
    let filePath = raw;
    if (raw.includes("event-images/")) {
      const m = raw.match(/event-images\/([^?]+)/);
      if (m) filePath = m[1];
    }
    const { data } = supabase.storage.from("event-images").getPublicUrl(filePath);
    return data?.publicUrl || raw;
  } catch {
    return raw;
  }
}

// type -> channel default + a human verb for thread/system lines.
const TYPE_VERB = {
  rsvp: "RSVP'd", waitlist_join: "Joined the waitlist", rsvp_cancel: "Cancelled RSVP",
  attended: "Attended", payment: "Paid", page_view: "Viewed the page",
  message_in: "Messaged you", message_out: "You messaged", auto_dm_sent: "Auto-DM sent",
  host_logged: "You logged", acquired: "Found you", identity_linked: "Linked identity", note: "Note",
  access_request: "Requested early access",
};

// The events table is now shared substrate for several page kinds (event /
// community / product / waitlist / widget). The Room's event surfaces — the
// "Your events" strip, the events counter, "Rooms you're in" — must show ONLY
// real events. Legacy rows predate the column, so a null kind counts as event.
function isEventKind(k) { return k == null || k === "event"; }

// The host's own events as banner cards. Pulled out so the home renders them
// even before any timeline activity exists (a brand-new host who just created
// their first event still sees it — the per-person timeline can be empty).
async function getHostedEventCards(hostId) {
  const { data: events } = await supabase
    .from("events")
    .select("id, title, slug, starts_at, ends_at, status, total_capacity, cover_image_url, image_url, ticket_type, ticket_price, ticket_currency, location, kind")
    .eq("host_id", hostId);
  const list = (events || []).filter((e) => isEventKind(e.kind));
  if (!list.length) return [];
  const comingByEvent = new Map();
  const { data: rsvpRows } = await supabase.from("rsvps").select("event_id, status, booking_status").in("event_id", list.map((e) => e.id));
  for (const r of rsvpRows || []) {
    if (r.status === "cancelled") continue;
    if (r.status === "waitlist" || r.booking_status === "WAITLIST") continue; // waitlisters aren't "coming"
    comingByEvent.set(r.event_id, (comingByEvent.get(r.event_id) || 0) + 1);
  }
  const now = Date.now();
  return list
    .map((e) => {
      const status = deriveEventListingStatus(e.status, e.starts_at, e.ends_at, now);
      return {
        id: e.id,
        title: e.title || "Untitled event",
        slug: e.slug || null,
        coverImage: resolveEventImage(e.cover_image_url || e.image_url),
        startsAt: e.starts_at || null,
        when: eventDateLabel(e.starts_at, status),
        location: e.location || "",
        status,
        capacity: e.total_capacity || null,
        comingCount: comingByEvent.get(e.id) || 0,
        ticketType: e.ticket_type || "free",
        ticketPrice: e.ticket_price || 0,
        ticketCurrency: e.ticket_currency || null,
        _sort: status === "live" ? 2 : status === "past" ? 1 : 0,
      };
    })
    .sort((a, b) => {
      if (a._sort !== b._sort) return b._sort - a._sort;
      const ta = a.startsAt ? new Date(a.startsAt).getTime() : 0;
      const tb = b.startsAt ? new Date(b.startsAt).getTime() : 0;
      return a.status === "live" ? ta - tb : tb - ta;
    })
    .map(({ _sort, ...e }) => e);
}

// Events this account BELONGS TO but does not own via host_id: ones it co-hosts
// (event_hosts collaborator) + ones it attends as a guest (rsvp/pullup on its
// own person record). This is what makes the home work for everyone — a pure
// guest with zero hosted events still lands on the rooms they can enter, and a
// collaborator sees the events they help run. Relationships are permanent, so
// guest events show regardless of the event's current draft flag.
async function getMemberRooms(accountId, email = null) {
  if (!accountId) return [];
  try {
    const { data: owned } = await supabase.from("events").select("id").eq("host_id", accountId);
    const ownedIds = new Set((owned || []).map((e) => e.id));

    // co-host via the collaborator table
    const { data: eh } = await supabase.from("event_hosts").select("event_id, role").eq("user_id", accountId);
    const roleByEvent = new Map();
    for (const r of eh || []) if (r.event_id && !ownedIds.has(r.event_id)) roleByEvent.set(r.event_id, r.role || "co_host");

    // guest via this account's person record(s). Match by auth link OR the
    // login email — a returning guest may not be auth-linked yet, and the same
    // human can have several person rows; union them all so no room is missed.
    const personIds = new Set();
    const { data: byAuth } = await supabase.from("people").select("id").eq("auth_user_id", accountId);
    for (const p of byAuth || []) personIds.add(p.id);
    // Linked secondary logins resolve to their canonical person (mig 067).
    const { data: linkedAcc } = await supabase.from("person_auth_accounts").select("person_id").eq("auth_user_id", accountId);
    for (const r of linkedAcc || []) if (r.person_id) personIds.add(r.person_id);
    const e = (email || "").toString().trim().toLowerCase();
    if (e) {
      const { data: byEmail } = await supabase.from("people").select("id").ilike("email", e);
      for (const p of byEmail || []) personIds.add(p.id);
    }
    const guestIds = new Set();
    if (personIds.size) {
      const ids = [...personIds];
      const [{ data: rs }, { data: ps }] = await Promise.all([
        supabase.from("rsvps").select("event_id").in("person_id", ids).neq("status", "cancelled"),
        supabase.from("pullups").select("event_id").in("person_id", ids),
      ]);
      for (const r of [...(rs || []), ...(ps || [])]) if (r.event_id && !ownedIds.has(r.event_id)) guestIds.add(r.event_id);
    }

    const ids = [...new Set([...roleByEvent.keys(), ...guestIds])];
    if (!ids.length) return [];
    const { data: evs } = await supabase
      .from("events")
      .select("id, title, slug, starts_at, ends_at, status, cover_image_url, image_url, location, kind")
      .in("id", ids);
    const now = Date.now();
    return (evs || [])
      .filter((e) => isEventKind(e.kind)) // real events only — not community/product pages joined via RSVP
      .map((e) => {
        const status = deriveEventListingStatus(e.status, e.starts_at, e.ends_at, now);
        const isCoHost = roleByEvent.has(e.id);
        return {
          id: e.id,
          title: e.title || "Untitled event",
          slug: e.slug || null,
          coverImage: resolveEventImage(e.cover_image_url || e.image_url),
          startsAt: e.starts_at || null,
          when: eventDateLabel(e.starts_at, status),
          location: e.location || "",
          status,
          role: isCoHost ? roleByEvent.get(e.id) : "guest",
          isHost: isCoHost,
          _sort: status === "live" ? 2 : status === "past" ? 1 : 0,
        };
      })
      .sort((a, b) => {
        if (a._sort !== b._sort) return b._sort - a._sort;
        const ta = a.startsAt ? new Date(a.startsAt).getTime() : 0;
        const tb = b.startsAt ? new Date(b.startsAt).getTime() : 0;
        return a.status === "live" ? ta - tb : tb - ta;
      })
      .map(({ _sort, ...e }) => e);
  } catch (err) {
    logger?.warn?.("[roomService] member rooms read failed", { error: err?.message });
    return [];
  }
}


/**
 * Build the global Room payload for a host.
 * @param {string} hostId
 * @returns {Promise<{ host, events, memberRooms, signals, people }>}
 */
export async function getRoomForHost(hostId, { email = null } = {}) {
  if (!hostId) throw new Error("[roomService] hostId required");

  // 0. The host's own profile for the masthead (their face anchors the Room),
  //    and the rooms they belong to but don't own (co-host + guest) — always
  //    included so the home is never blank for a pure guest.
  const hostProfile = await buildHostProfile(hostId);
  const memberRooms = await getMemberRooms(hostId, email);
  // The host's community page (a kind='community' event), surfaced in the Room
  // so they can follow the signup journey. null when they haven't made one.
  const community = await getHostCommunitySummary(hostId);
  // The host's product library (live + draft) with stats — the "Your products"
  // card on the host home, mirroring the community card.
  const products = await listHostProducts(hostId);

  // 1. All timeline events in this host's world, newest first.
  const { data: pe, error: peErr } = await supabase
    .from("person_events")
    .select("id, person_id, event_id, type, channel, direction, body, occurred_at, metadata")
    .eq("host_id", hostId)
    .order("occurred_at", { ascending: false })
    .limit(5000);
  if (peErr) {
    logger?.error?.("[roomService] timeline read failed", { error: peErr.message });
    return { host: { peopleCount: 0, eventsCount: 0, pullupsCount: 0, ...hostProfile }, events: [], memberRooms, community, signals: [], moments: [], people: [] };
  }
  const timeline = pe || [];

  // 2. Group the RECENT timeline by person (drives warmth / last activity).
  const byPerson = new Map();
  for (const e of timeline) {
    if (!byPerson.has(e.person_id)) byPerson.set(e.person_id, []);
    byPerson.get(e.person_id).push(e);
  }

  // 2b. The FULL set of people in this host's world — RSVPs ∪ person_events,
  // server-side (mig 094). The old code derived people from the recent-5000
  // timeline only, so a host with more activity (e.g. 1500+ imports) saw a slice
  // and the rest silently vanished. We render EVERYONE; people without recent
  // timeline events just get a calm card (warmth from [] below).
  let personIds = [];
  try {
    // Returns a uuid[] (a single scalar value, so PostgREST's 1000-row response
    // cap can't truncate it — a TABLE return did).
    const { data: ids } = await supabase.rpc("pullup_host_world_person_ids", { p_host_id: hostId });
    personIds = (ids || []).filter(Boolean);
  } catch (err) {
    logger?.warn?.("[roomService] world person ids failed", { error: err?.message });
  }
  if (!personIds.length) personIds = [...byPerson.keys()]; // fallback if the RPC is missing

  // The PullUp thread is a permanent fixture of every host's Messages — inject
  // the system person even before any contact, so "write to PullUp" always
  // exists (the dock pins it; first contact needs a real person id to send to).
  let systemPersonId = null;
  try {
    systemPersonId = await getSystemPersonId();
    if (systemPersonId && !personIds.includes(systemPersonId)) personIds.push(systemPersonId);
  } catch { /* no system person → the dock simply has nothing to pin */ }

  if (!personIds.length) {
    // No people yet — but the host may still have events (a fresh host). Render
    // those so the home is truthful from the first event, not only the first guest.
    const hostedCards = await getHostedEventCards(hostId);
    return { host: { peopleCount: 0, eventsCount: hostedCards.length, pullupsCount: 0, ...hostProfile }, events: hostedCards, memberRooms, community, signals: [], moments: [], people: [] };
  }

  // 3. Fetch the people + their identities (reachable channels) in bulk.
  // people + identities are global tables → must filter by personIds, so chunk
  // the .in() (a big single .in() 400s). events is host-scoped (small), no chunk.
  const [people, idents, { data: events }] = await Promise.all([
    chunkedByIds(personIds, (ids) => supabase.from("people").select("id, name, email, phone_e164, phone_verified_at, instagram, ig_user_id").in("id", ids).then((r) => r.data || [])),
    chunkedByIds(personIds, (ids) => supabase.from("person_identities").select("person_id, kind").in("person_id", ids).then((r) => r.data || [])),
    supabase.from("events").select("id, title, slug, starts_at, ends_at, status, total_capacity, cover_image_url, image_url, created_via, ticket_type, ticket_price, ticket_currency, location, enrichment_questions, kind").eq("host_id", hostId),
  ]);
  const peopleById = new Map((people || []).map((p) => [p.id, p]));
  // Linked external-source profiles (IG etc.) → avatar + reach/reciprocity signals.
  const sourceProfilesByPerson = await getForPersons(personIds);
  const identsByPerson = new Map();
  for (const i of idents || []) {
    if (!identsByPerson.has(i.person_id)) identsByPerson.set(i.person_id, new Set());
    identsByPerson.get(i.person_id).add(i.kind);
  }

  // 3b. WhatsApp 24h-window state per person, so the composer tells the truth:
  // an open window means a normal free-text WhatsApp; a closed one means it goes
  // as a template (or the email floor). host_profile_id == hostId (single-tenant).
  const windowByPerson = new Map();
  try {
    const { data: threads } = await supabase
      .from("whatsapp_threads")
      .select("person_id, conversation_window_expires_at")
      .eq("host_profile_id", hostId);
    const nowMs = Date.now();
    for (const t of threads || []) {
      const open = !!t.conversation_window_expires_at &&
        new Date(t.conversation_window_expires_at).getTime() > nowMs;
      windowByPerson.set(t.person_id, open);
    }
  } catch (err) {
    logger?.warn?.("[roomService] whatsapp window read failed", { error: err?.message });
  }

  // 3c. IG read-receipt watermark + window state per person. Watermark: outbound
  // DMs older than last_read_at render as "read". Window: last_inbound_at anchors
  // the 24h free-text window (standard) and the 24h–7d human-agent window — the
  // same rule dispatch() enforces, surfaced so the composer can show the truth.
  const igReadByPerson = new Map();
  const igWindowByPerson = new Map(); // person_id -> "standard" | "human_agent" | "expired"
  try {
    const { data: igThreads } = await supabase
      .from("instagram_threads")
      .select("person_id, last_read_at, last_inbound_at")
      .eq("host_profile_id", hostId);
    const nowMs = Date.now();
    const H24 = 24 * 3600 * 1000, D7 = 7 * 24 * 3600 * 1000;
    for (const t of igThreads || []) {
      if (t.last_read_at) igReadByPerson.set(t.person_id, new Date(t.last_read_at).getTime());
      if (t.last_inbound_at) {
        const elapsed = nowMs - new Date(t.last_inbound_at).getTime();
        igWindowByPerson.set(t.person_id, elapsed <= H24 ? "standard" : elapsed <= D7 ? "human_agent" : "expired");
      }
    }
  } catch (err) {
    logger?.warn?.("[roomService] instagram read/window read failed", { error: err?.message });
  }

  // 3c². Read watermarks — when the host last LOOKED at each thread. Unread is
  // "new inbound since then", not "awaiting your reply": seeing clears the dot.
  const readAtByPerson = new Map();
  try {
    const { data: reads } = await supabase
      .from("thread_reads")
      .select("person_id, last_read_at")
      .eq("host_id", hostId)
      .eq("seat", "host");
    for (const r of reads || []) readAtByPerson.set(r.person_id, new Date(r.last_read_at).getTime());
  } catch (err) {
    logger?.warn?.("[roomService] thread reads failed", { error: err?.message });
  }

  // 3d. Host-private notes per person, attached to each card so the Room's people
  // layer renders the full profile (notes timeline + "add info") inline — no
  // per-card fetch. Newest first. Scoped to THIS host (notes are private).
  const notesByPerson = new Map();
  try {
    const { data: noteRows } = await supabase
      .from("person_notes")
      .select("id, person_id, content, note_date, created_at")
      .eq("host_id", hostId)
      .order("note_date", { ascending: false })
      .order("created_at", { ascending: false });
    for (const n of noteRows || []) {
      if (!notesByPerson.has(n.person_id)) notesByPerson.set(n.person_id, []);
      notesByPerson.get(n.person_id).push({
        id: n.id,
        content: n.content,
        noteDate: n.note_date,
        createdAt: n.created_at,
      });
    }
  } catch (err) {
    logger?.warn?.("[roomService] person notes read failed", { error: err?.message });
  }

  // 4. Events list (content pieces, for the lens + the banner).
  //   status: draft (not published) | live (published, upcoming/ongoing) |
  //           past (published, already happened). Coming counts from rsvps.
  const eventIds = (events || []).map((e) => e.id);
  const comingByEvent = new Map();
  if (eventIds.length) {
    const { data: rsvpRows } = await supabase
      .from("rsvps")
      .select("event_id, status, booking_status")
      .in("event_id", eventIds);
    for (const r of rsvpRows || []) {
      if (r.status === "cancelled") continue;
      if (r.status === "waitlist" || r.booking_status === "WAITLIST") continue; // waitlisters aren't "coming"
      comingByEvent.set(r.event_id, (comingByEvent.get(r.event_id) || 0) + 1);
    }
  }
  const now = Date.now();
  const eventsOut = (events || [])
    // ONLY real events become cards / the events count. Community, product,
    // waitlist and widget pages share this table but aren't events.
    .filter((e) => isEventKind(e.kind))
    .map((e) => {
      const status = deriveEventListingStatus(e.status, e.starts_at, e.ends_at, now);
      return {
        id: e.id,
        title: e.title || "Untitled event",
        slug: e.slug || null,
        coverImage: resolveEventImage(e.cover_image_url || e.image_url),
        startsAt: e.starts_at || null,
        when: eventDateLabel(e.starts_at, status),
        location: e.location || "",
        status,
        capacity: e.total_capacity || null,
        comingCount: comingByEvent.get(e.id) || 0,
        // carried for the VIP section's paid-event logic
        ticketType: e.ticket_type || "free",
        ticketPrice: e.ticket_price || 0,
        ticketCurrency: e.ticket_currency || null,
        // Relevance order: LIVE/upcoming first (what needs attention now),
        // then past (history), drafts last (unfinished, tucked away in the UI).
        _sort: status === "live" ? 2 : status === "past" ? 1 : 0,
      };
    })
    .sort((a, b) => {
      if (a._sort !== b._sort) return b._sort - a._sort;
      const ta = a.startsAt ? new Date(a.startsAt).getTime() : 0;
      const tb = b.startsAt ? new Date(b.startsAt).getTime() : 0;
      // live: soonest first; past: most recent first.
      return a.status === "live" ? ta - tb : tb - ta;
    })
    .map(({ _sort, ...e }) => e);
  const eventTitleById = new Map(eventsOut.map((e) => [e.id, e.title]));
  // VipInviteSection reads event.status to decide if it's a paid event; it
  // expects the lowercased status we already set — leave as-is.

  // 4b. Enrichment answers per person — the host's free-text questions they
  // answered at RSVP, surfaced on the people card. Labels come from each event's
  // enrichment_questions; values from that RSVP's custom_answers. Scoped to this
  // host's events (answers to other hosts' events are private to them).
  const answersByPerson = new Map();
  try {
    const enrichByEvent = new Map();
    for (const e of events || []) {
      const qs = Array.isArray(e.enrichment_questions) ? e.enrichment_questions : [];
      if (qs.length) enrichByEvent.set(e.id, new Map(qs.map((q) => [q.id, q.label])));
    }
    if (enrichByEvent.size) {
      // Bounded by the host's enrichment events (a small set) — the person_id
      // filter was redundant and oversized; the event_id filter does the scoping.
      const { data: ansRows } = await supabase
        .from("rsvps")
        .select("person_id, event_id, custom_answers")
        .in("event_id", [...enrichByEvent.keys()]);
      for (const r of ansRows || []) {
        const qmap = enrichByEvent.get(r.event_id);
        const ca = r.custom_answers;
        if (!qmap || !ca || typeof ca !== "object") continue;
        for (const [qid, label] of qmap) {
          const v = ca[qid];
          const val = typeof v === "string" ? v.trim() : v;
          if (!val) continue;
          if (!answersByPerson.has(r.person_id)) answersByPerson.set(r.person_id, []);
          answersByPerson.get(r.person_id).push({
            label,
            value: String(val),
            eventTitle: eventTitleById.get(r.event_id) || null,
          });
        }
      }
    }
  } catch (err) {
    logger?.warn?.("[roomService] enrichment answers read failed", { error: err?.message });
  }

  // 4c. The two relationship edges per person → the 3-way audience segment the
  // people view + message picker filter on: community-only / community+events /
  // events-only. In the unified model a community page is a kind='community'
  // event, so BOTH edges are RSVPs — split by the event's kind: an RSVP to the
  // community page = a member; an RSVP to a real event = an attendee.
  const communityMemberIds = new Set();
  const rsvpPersonIds = new Set();
  // RSVPs to a kind='product' page = product purchases (a sale is a paid RSVP).
  const purchaserIds = new Set();
  // Paid RSVP to a real event = a ticket buyer (distinct from a product buyer).
  const ticketBuyerIds = new Set();
  // person_id -> Set(event_id) of the REAL events they RSVP'd to. Authoritative
  // for event-filtering (the message picker filters people by event), so it
  // works for everyone — even people whose RSVP is older than the recent timeline.
  const rsvpEventsByPerson = new Map();
  // person_id -> Map(event_id -> "attended" | "waitlist" | "going") for REAL
  // events. Lets the message picker include/exclude the waitlist per event and
  // target "a spot just opened" blasts at exactly the people still waiting.
  const eventStatusByPerson = new Map();
  try {
    const kindById = new Map((events || []).map((e) => [e.id, e.kind]));
    const allHostEventIds = (events || []).map((e) => e.id);
    if (allHostEventIds.length) {
      const { data: rs } = await supabase
        .from("rsvps")
        .select("person_id, event_id, status, booking_status, pulled_up, payment_status")
        .in("event_id", allHostEventIds)
        .neq("status", "cancelled");
      for (const r of rs || []) {
        if (!r.person_id) continue;
        const kind = kindById.get(r.event_id);
        if (kind === "community") { communityMemberIds.add(r.person_id); continue; }
        if (kind === "product") { purchaserIds.add(r.person_id); continue; }
        if (!isEventKind(kind)) continue; // waitlist/widget pages aren't an audience edge
        rsvpPersonIds.add(r.person_id);
        if (r.payment_status === "paid") ticketBuyerIds.add(r.person_id); // paid an event ticket
        if (!rsvpEventsByPerson.has(r.person_id)) rsvpEventsByPerson.set(r.person_id, new Set());
        rsvpEventsByPerson.get(r.person_id).add(r.event_id);
        // Waitlist lives in either status or the dinner/cocktails booking_status.
        const waitlisted = r.status === "waitlist" || r.booking_status === "WAITLIST";
        const st = r.pulled_up ? "attended" : waitlisted ? "waitlist" : "going";
        if (!eventStatusByPerson.has(r.person_id)) eventStatusByPerson.set(r.person_id, new Map());
        // A confirmed/attended row wins over a stray waitlist row for the event.
        const cur = eventStatusByPerson.get(r.person_id).get(r.event_id);
        if (!cur || cur === "waitlist") eventStatusByPerson.get(r.person_id).set(r.event_id, st);
      }
    }
  } catch (err) {
    logger?.warn?.("[roomService] segment read failed", { error: err?.message });
  }

  // 5. Build each person.
  const peopleOut = [];
  for (const pid of personIds) {
    const evs = byPerson.get(pid) || []; // newest first; [] for people beyond the recent timeline
    const person = peopleById.get(pid);
    if (!person) continue;

    const kinds = identsByPerson.get(pid) || new Set();
    const reachable = channelsFromIdentities(kinds, person);
    const channel = preferredChannel(reachable, person);

    // Truthful WhatsApp window hint (only meaningful when WA is reachable).
    const waReachable = reachable.includes("whatsapp");
    const winOpen = waReachable ? (windowByPerson.get(pid) || false) : null;
    const windowNote = !waReachable
      ? null
      : winOpen
        ? "Messaged recently — sends as a normal WhatsApp"
        : "Quiet for 24h+ — sends as a WhatsApp template";

    // Live sendability per reachable channel — "open" means a normal free-text
    // message goes out ON THAT channel right now; "closed" means its window is
    // shut. The composer locks the closed ones so a WhatsApp/IG pick can never
    // silently become an email. Email is always open. IG: standard window, or
    // the 24h–7d human-agent window only when Meta has approved it (host Room
    // messages are human-composed, so they qualify once approved).
    const channelState = {};
    for (const c of reachable) {
      if (c === "whatsapp") channelState.whatsapp = windowByPerson.get(pid) ? "open" : "closed";
      else if (c === "instagram") {
        const st = igWindowByPerson.get(pid) || "expired";
        const igOpen = st === "standard" || (st === "human_agent" && IG_HUMAN_AGENT_APPROVED);
        channelState.instagram = igOpen ? "open" : "closed";
      } else if (c === "email") channelState.email = "open";
    }

    const attended = evs.filter((e) => e.type === "attended").length;
    const rsvps = evs.filter((e) => e.type === "rsvp").length;
    const waitlisted = evs.some((e) => e.type === "waitlist_join");
    // Union of timeline-derived events + their actual RSVP events (so the message
    // picker's event filter matches everyone who RSVP'd, not just recently-active).
    const eventsTouched = [...new Set([
      ...evs.map((e) => e.event_id).filter(Boolean),
      ...(rsvpEventsByPerson.get(pid) || []),
    ])];
    const lastAt = evs[0]?.occurred_at;
    // Messaging recency — the spine of the messages-list order. evs is newest
    // first, so the first message-typed event is the latest written message;
    // if that's inbound, the host still owes them a reply ("unread").
    const lastMsgEv = evs.find((e) => MESSAGE_EVENT_TYPES.has(e.type));
    const lastMessageAt = lastMsgEv?.occurred_at || null;
    const awaitingReply = lastMsgEv?.type === "message_in" || lastMsgEv?.type === "access_request";
    // Unread = a real inbound message newer than the read watermark. Viewing the
    // thread stamps the watermark; replying is not required to clear the dot.
    const lastInbound = evs.find((e) => e.type === "message_in");
    const unread = !!lastInbound &&
      new Date(lastInbound.occurred_at).getTime() > (readAtByPerson.get(pid) || 0);

    // The two edges + derived segment for this person.
    const isCommunityMember = communityMemberIds.has(pid);
    const hasEventRsvp = rsvpPersonIds.has(pid) || attended > 0 || rsvps > 0 || waitlisted;
    const segment = isCommunityMember
      ? (hasEventRsvp ? "community_plus_events" : "community_only")
      : (hasEventRsvp ? "events_only" : null);

    const warmth = computeWarmth({ attended, rsvps, eventsTouched: eventsTouched.length, lastAt });
    const relationship = describeRelationship({ attended, rsvps, eventsTouched: eventsTouched.length, waitlisted, lastAt });
    const { needsYou, move } = suggestMove({ waitlisted, attended, lastAt, rsvps });

    const sps = sourceProfilesByPerson.get(pid) || [];
    const disp = resolveDisplay(sps);
    const external = externalFromProfiles(sps);

    peopleOut.push({
      id: pid,
      // PullUp itself — a service contact, not an audience member. The dock
      // pins it; people-CRM surfaces and counts leave it out.
      isSystem: pid === systemPersonId,
      name: person.name || disp.name || (person.email ? person.email.split("@")[0] : "Someone"),
      handle: person.instagram ? `@${String(person.instagram).replace(/^@/, "")}` : (disp.handle ? `@${disp.handle}` : (person.email || "")),
      initials: initials(person.name || disp.name, person.email),
      avatarUrl: disp.avatarUrl || null, // IG profile pic etc. → real avatar (UI: fall back to initials)
      // Contact sheet — surfaced on the people-CRM cards in the Room body.
      email: person.email || null,
      phone: person.phone_e164 || person.phone || null,
      instagram: person.instagram ? String(person.instagram).replace(/^@/, "") : null,
      color: colorFor(pid),
      // Relationship edges + segment for the people-view / message-audience filter.
      isCommunityMember,
      hasEventRsvp,
      segment,
      channel,
      reachable,
      channelState,
      windowOpen: winOpen,
      windowNote,
      warmth,
      relationship,
      external, // { instagram: { username, followerCount, followsYou, youFollow, verified } }
      events: eventsTouched,
      // Per-event RSVP status (real events) → the picker's event + attendance
      // (Going / Waitlist / All) filter. { eventId: "going"|"waitlist"|"attended" }.
      eventStatus: Object.fromEntries(eventStatusByPerson.get(pid) || []),
      // Audience lenses the picker filters on (beyond community/guest):
      hasTicket: ticketBuyerIds.has(pid),                                   // paid for an event ticket
      hasPurchased: purchaserIds.has(pid),                                  // bought a product page
      pulledUp: attended > 0 || [...(eventStatusByPerson.get(pid)?.values() || [])].includes("attended"), // showed up to an event
      signals: [
        ...buildPersonSignals({ attended, eventsTouched: eventsTouched.length, kinds }),
        ...externalSignals(external),
      ],
      needsYou,
      move,
      // Messages-list ordering signals (newest written message first; unread —
      // awaiting your reply — floats to the top; action-only people fall below).
      lastMessageAt,
      awaitingReply,
      unread,
      lastActivityAt: lastAt || null,
      lastMessage: lastMessageFrom(evs, eventTitleById),
      thread: buildThread(evs, eventTitleById, igReadByPerson.get(pid) || null),
      // Host-private manual notes (newest first) — rendered on the people card.
      notes: notesByPerson.get(pid) || [],
      // Enrichment answers across this host's events (label + value + which event).
      answers: answersByPerson.get(pid) || [],
    });
  }

  // Rank: who-needs-you first, then warmth (the Room's default order).
  peopleOut.sort((a, b) => (a.needsYou !== b.needsYou ? (a.needsYou ? -1 : 1) : b.warmth - a.warmth));

  // 6. Signals — recent notable events as nudges (top of the Room).
  const signals = buildSignals(timeline, peopleById, eventTitleById);

  // 7. Moments — the legacy layer. The world a host built, read back to them:
  // anniversaries, people who became regulars, the world growing. Not actions —
  // warmth. This is the retention moat (the timeline becomes a body of work).
  const moments = buildMoments({ byPerson, peopleById, eventsOut });

  // "Pullups" = how many events the HOST personally pulled up to (attended as a
  // guest, anywhere) — their own count, the same number their room shows. Found
  // via their person record (people.auth_user_id ↔ this account).
  let pullupsCount = 0;
  try {
    let { data: me } = await supabase.from("people").select("id").eq("auth_user_id", hostId).maybeSingle();
    if (!me) {
      // Linked secondary login → canonical person (mig 067).
      const { data: link } = await supabase.from("person_auth_accounts").select("person_id").eq("auth_user_id", hostId).maybeSingle();
      if (link?.person_id) me = { id: link.person_id };
    }
    if (me) {
      const { data: myUps } = await supabase.from("pullups").select("event_id").eq("person_id", me.id);
      pullupsCount = new Set((myUps || []).map((r) => r.event_id)).size;
    }
  } catch (err) {
    logger?.warn?.("[roomService] personal pullup count failed", { error: err?.message });
  }

  return {
    // Explicit, accurate counts WIN over any stale/capped value on hostProfile
    // (spread first, then override) — the masthead now shows the true world size.
    host: { ...hostProfile, peopleCount: personIds.filter((id) => id !== systemPersonId).length, eventsCount: eventsOut.length, pullupsCount },
    events: eventsOut,
    memberRooms,
    community,
    products,
    signals,
    moments,
    people: peopleOut,
  };
}

// The host's community page summarized for the Room card: live state + how many
// have joined (RSVPs to the kind='community' event). null when none exists.
async function getHostCommunitySummary(hostId) {
  try {
    const { data: ev } = await supabase
      .from("events")
      .select("id, slug, title, status, cover_image_url, image_url")
      .eq("host_id", hostId)
      .eq("kind", "community")
      .maybeSingle();
    if (!ev) return null;
    const { count } = await supabase
      .from("rsvps")
      .select("id", { count: "exact", head: true })
      .eq("event_id", ev.id)
      .neq("status", "cancelled");
    return {
      id: ev.id,
      slug: ev.slug,
      title: ev.title,
      status: ev.status,
      live: (ev.status || "").toUpperCase() === "PUBLISHED",
      memberCount: count || 0,
      // The page's cover — the home card wears the live community page.
      coverImage: resolveEventImage(ev.cover_image_url || ev.image_url),
    };
  } catch {
    return null;
  }
}

// ── moments (the "looking back" legacy layer) ───────────────────────
// Grounded entirely in real touchpoints (the anti-extraction line: we read
// back care that happened, we don't manufacture it). Ordered anniversary →
// new-regular → growth, capped so it stays a glance, never a feed.
function buildMoments({ byPerson, peopleById, eventsOut }) {
  const now = Date.now();
  const DAY = 86400000;
  const YEAR = 365.25 * DAY;
  const out = [];

  // Anniversaries — a past event whose date lands ~N whole years ago (±4d).
  for (const e of eventsOut) {
    if (e.status !== "past" || !e.startsAt) continue;
    const elapsed = now - new Date(e.startsAt).getTime();
    if (elapsed <= 0) continue;
    const years = Math.round(elapsed / YEAR);
    if (years >= 1 && Math.abs(elapsed - years * YEAR) <= 4 * DAY) {
      out.push({
        id: `anniv_${e.id}`,
        kind: "anniversary",
        text: `${years === 1 ? "A year" : `${years} years`} ago today: ${e.title}${e.comingCount ? ` — ${e.comingCount} came` : ""}.`,
        eventId: e.id,
        coverImage: e.coverImage || null,
        cta: "Do it again",
      });
    }
  }

  // New regulars — someone who just crossed into "basically family" (3+ nights),
  // with their latest night recent enough that the milestone feels fresh.
  for (const [pid, evs] of byPerson) {
    const attendedEvs = evs.filter((x) => x.type === "attended");
    if (attendedEvs.length < 3) continue;
    const last = attendedEvs[0]?.occurred_at; // evs are newest-first
    if (!last || (now - new Date(last).getTime()) > 45 * DAY) continue;
    const p = peopleById.get(pid);
    if (!p) continue;
    const name = p.name || (p.email ? p.email.split("@")[0] : "Someone");
    out.push({
      id: `regular_${pid}`,
      kind: "regular",
      text: `${name} is a regular now — ${attendedEvs.length} nights in your world.`,
      personId: pid,
    });
  }

  // Growing world — people whose first-ever touch was within the last 30 days.
  let newcomers = 0;
  for (const [, evs] of byPerson) {
    const firstTouch = evs[evs.length - 1]?.occurred_at; // oldest is last
    if (firstTouch && (now - new Date(firstTouch).getTime()) <= 30 * DAY) newcomers++;
  }
  if (newcomers >= 3) {
    out.push({
      id: "growth_30d",
      kind: "growth",
      text: `${newcomers} new people joined your world this month.`,
    });
  }

  const order = { anniversary: 0, regular: 1, growth: 2 };
  out.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  return out.slice(0, 3);
}

// ── heuristics ──────────────────────────────────────────────────────

function channelsFromIdentities(kinds, person) {
  const out = [];
  // Instagram is only honestly reachable once we hold an IG-SCOPED user id — the
  // id we get when they've actually messaged us (auto-DM reply, DM, comment→DM).
  // A typed @handle (person.instagram / an ig_handle identity) is a soft claim we
  // can link on, NOT a send address: dispatch()/attemptInstagram bails with
  // "no ig_user_id" without it. So don't offer a rail we can't send on.
  if (kinds.has("ig_user_id") || person.ig_user_id) out.push("instagram");
  // WhatsApp is only honestly reachable once the phone is verified — that's the
  // gate dispatch()/sendText enforce too, so don't offer a rail we can't use.
  if ((kinds.has("phone") || person.phone_e164) && person.phone_verified_at) out.push("whatsapp");
  if (kinds.has("email") || person.email) out.push("email");
  return out.length ? out : ["email"];
}
// Prefer the most "real-time" rail we plausibly have; email is the floor.
function preferredChannel(reachable, person) {
  if (reachable.includes("whatsapp") && person.phone_verified_at) return "whatsapp";
  if (reachable.includes("instagram")) return "instagram";
  if (reachable.includes("whatsapp")) return "whatsapp";
  return "email";
}

function computeWarmth({ attended, rsvps, eventsTouched, lastAt }) {
  let w = 0.2;
  w += Math.min(0.4, attended * 0.18);     // showing up matters most
  w += Math.min(0.2, rsvps * 0.06);
  w += Math.min(0.1, Math.max(0, eventsTouched - 1) * 0.05);
  // recency decay
  if (lastAt) {
    const days = (Date.now() - new Date(lastAt).getTime()) / 86400000;
    if (days < 14) w += 0.1;
    else if (days > 150) w -= 0.15;
  }
  return Math.max(0, Math.min(1, Number(w.toFixed(2))));
}

function describeRelationship({ attended, rsvps, eventsTouched, waitlisted, lastAt }) {
  const days = lastAt ? (Date.now() - new Date(lastAt).getTime()) / 86400000 : 999;
  if (attended >= 3) return `A regular — came to ${attended} of your events. Basically family.`;
  if (attended === 2) return "Came to two of your events — a real returner.";
  if (attended === 1) return days > 150 ? "Came once, a while back — worth rekindling." : "Came to one event recently.";
  if (waitlisted) return "Keen — on a waitlist, hasn't made it in yet.";
  if (rsvps >= 2) return `Said yes to ${rsvps} events${eventsTouched > 1 ? " across your calendar" : ""}.`;
  if (rsvps === 1) return "RSVP'd — first time in your world.";
  return "In your world — hasn't committed to an event yet.";
}

// The timeline types that count as a written message (as opposed to a logged
// action like rsvp/attended). Drives the messages-list ordering: a thread sorts
// by its latest message, and "awaiting reply" = that latest message is inbound.
// access_request counts too: a "request early access" click is inbound contact
// — it must place the person in the Messages list and read as awaiting a reply,
// even though the thread renders it as a system log line, not person speech.
const MESSAGE_EVENT_TYPES = new Set(["message_in", "message_out", "auto_dm_sent", "access_request"]);

function suggestMove({ waitlisted, attended, lastAt, rsvps }) {
  const days = lastAt ? (Date.now() - new Date(lastAt).getTime()) / 86400000 : 999;
  if (waitlisted) return { needsYou: true, move: "Offer them a spot if one opens" };
  if (attended >= 2 && days > 120) return { needsYou: true, move: "Reconnect — they've gone quiet" };
  if (rsvps >= 1 && attended === 0 && days < 30) return { needsYou: true, move: "Make sure they actually come" };
  return { needsYou: false, move: null };
}

function buildPersonSignals({ attended, eventsTouched, kinds }) {
  const s = [];
  if (attended > 0) s.push(`Came to ${attended} event${attended > 1 ? "s" : ""}`);
  if (eventsTouched > 1) s.push(`Touched ${eventsTouched} of your events`);
  if (kinds.size > 1) s.push(`Reached on ${kinds.size} channels`);
  return s.length ? s : ["In your people"];
}

// Normalize the third-party facts we hold on a person (today: Instagram) into a
// compact shape the UI + matching can read. Tolerant of camel/snake keys since
// the raw snapshot is stored as the source gave it.
function externalFromProfiles(profiles = []) {
  const ig = profiles.find((p) => p.source === "instagram");
  if (!ig) return undefined;
  const d = ig.data || {};
  const num = (...vals) => { for (const v of vals) if (typeof v === "number") return v; return null; };
  const bool = (...vals) => { for (const v of vals) if (typeof v === "boolean") return v; return null; };
  return {
    instagram: {
      username: ig.handle || d.username || null,
      followerCount: num(d.followerCount, d.follower_count),
      followsYou: bool(d.isUserFollowBusiness, d.is_user_follow_business),
      youFollow: bool(d.isBusinessFollowUser, d.is_business_follow_user),
      verified: bool(d.isVerified, d.is_verified_user),
    },
  };
}

function humanCount(n) {
  if (n == null) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`.replace(".0k", "k");
  return String(n);
}

// External facts → a few extra signal lines for the brain (reach, reciprocity).
function externalSignals(external) {
  const s = [];
  const ig = external?.instagram;
  if (!ig) return s;
  if (ig.verified) s.push("Verified on Instagram");
  if (ig.followerCount != null) s.push(`${humanCount(ig.followerCount)} IG followers`);
  if (ig.followsYou) s.push("Follows you on IG");
  return s;
}

// Attachments persisted on a message ({name,url,contentType,isImage}). undefined
// when none, so the payload stays lean.
function attsOf(e) {
  const a = e?.metadata?.attachments;
  return Array.isArray(a) && a.length ? a : undefined;
}

// An attached event ({id,title,slug,coverImageUrl,whenLabel,location}), rendered
// as a card in the thread. undefined when none.
function eventOf(e) {
  const ev = e?.metadata?.event;
  return ev && ev.title ? ev : undefined;
}

// An attached location ({label,url}) → a clickable address link in the thread.
function locOf(e) {
  const l = e?.metadata?.location;
  return l && l.url ? l : undefined;
}

// A short stand-in for messages whose only content is an attachment/event, so
// the inbox preview never goes blank.
function attPreview(atts, ev) {
  if (ev) return `📅 ${ev.title}`;
  if (!atts) return "";
  if (atts.length === 1) return atts[0].isImage ? "📷 Photo" : `📎 ${atts[0].name || "Attachment"}`;
  return `📎 ${atts.length} attachments`;
}

function lastMessageFrom(evs, eventTitleById) {
  const e = evs[0];
  if (!e) return null;
  const atts = attsOf(e);
  return {
    from: e.direction === "in" ? "them" : "system",
    text: e.body || attPreview(atts, eventOf(e)) || lineFor(e, eventTitleById),
    time: relTime(e.occurred_at),
  };
}

function buildThread(evs, eventTitleById, igReadAtMs = null) {
  // oldest → newest for the thread view
  return [...evs].reverse().map((e) => {
    const atts = attsOf(e);
    const event = eventOf(e);
    const location = locOf(e);
    // Delivery status for OUR outbound bubbles (the WhatsApp-style tick):
    // sent → delivered → read, pushed live by the channel webhooks (mig 071).
    // IG read also derives from the per-thread watermark as a fallback (older
    // bubbles sent before the watermark read as read). 'in' messages carry none.
    let status;
    if (e.direction === "out") {
      status = e.metadata?.status || "sent";
      const igRead = e.channel === "instagram" && igReadAtMs &&
        e.occurred_at && new Date(e.occurred_at).getTime() <= igReadAtMs;
      if (igRead && status !== "read") status = "read";
    }
    return {
      id: e.id, // person_events id — the key Realtime + optimistic reconcile on
      clientId: e.metadata?.client_id || undefined, // echo of the sender's optimistic id
      from: e.direction === "in" ? "them" : e.direction === "out" ? "you" : "system",
      type: e.type, // rsvp / attended (pull-up) / waitlist_join / message_* … so the UI renders logs AS logs
      text: e.body || (atts || event || location ? "" : lineFor(e, eventTitleById)),
      atts, // matches the dock's render (m.atts) + the optimistic-send shape
      event, // attached event → rendered as a card linking to /e/:slug
      location, // attached location → clickable address link
      time: relTime(e.occurred_at),
      at: e.occurred_at || e.created_at || null, // ISO — for stable ordering/merge
      channel: e.channel || undefined,
      status, // 'sent' | 'delivered' | 'read' | 'failed' (undefined for inbound)
      sentAs: e.metadata?.sent_as || undefined, // system-voiced send (e.g. felix@pullup.se)
    };
  });
}

function lineFor(e, eventTitleById) {
  if (e.body) return e.body;
  const verb = TYPE_VERB[e.type] || e.type;
  const title = e.event_id ? eventTitleById.get(e.event_id) : null;
  return title ? `${verb} — ${title}` : verb;
}

// The notable timeline types that become notifications/nudges, and the one
// place that turns a raw event + resolved name/title into a signal — shared by
// the Room payload (buildSignals) and the bell's feed (getNotificationsFeed) so
// the wording never drifts between them.
const NOTABLE_TYPES = ["message_in", "waitlist_join", "rsvp", "attended", "access_request"];
function signalFromEvent(e, name, title) {
  let kind = "plain", text;
  if (e.type === "message_in") { kind = "urgent"; text = `${name} messaged you — reply while it's fresh.`; }
  else if (e.type === "access_request") { kind = "urgent"; text = `${name} requested early access — reply while it's fresh.`; }
  else if (e.type === "waitlist_join") { kind = "urgent"; text = `${name} joined the waitlist${title ? ` for ${title}` : ""}.`; }
  else if (e.type === "attended") { kind = "warm"; text = `${name} came to ${title || "your event"} — worth a thank-you.`; }
  else { text = `${name} RSVP'd${title ? ` to ${title}` : ""}.`; }
  return { id: e.id, type: e.type, kind, text, personId: e.person_id, eventId: e.event_id || undefined, at: e.occurred_at, time: relTime(e.occurred_at) };
}

function buildSignals(timeline, peopleById, eventTitleById) {
  // Surface the most recent meaningful events as nudges.
  const NOTABLE = new Set(NOTABLE_TYPES);
  const out = [];
  for (const e of timeline) {
    if (out.length >= 6) break;
    if (!NOTABLE.has(e.type)) continue;
    const p = peopleById.get(e.person_id);
    if (!p) continue;
    const name = p.name || (p.email ? p.email.split("@")[0] : "Someone");
    const title = e.event_id ? eventTitleById.get(e.event_id) : null;
    out.push(signalFromEvent(e, name, title));
  }
  return out;
}

// The bell's own feed — notable events over a short window (default 48h),
// resolved to names + titles, newest first. Light and standalone so the bell
// loads + live-refreshes independently of the heavy full-room read. The client
// splits these into "Live" (recent) and a scrollable "History" tab.
const NOTIF_WINDOW_HOURS = 48;
export async function getNotificationsFeed(hostId, { hours = NOTIF_WINDOW_HOURS } = {}) {
  if (!hostId) return { items: [], windowHours: hours };
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("person_events")
    .select("id, person_id, event_id, type, occurred_at")
    .eq("host_id", hostId)
    .in("type", NOTABLE_TYPES)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) {
    logger?.warn?.("[roomService] notifications feed read failed", { error: error.message });
    return { items: [], windowHours: hours };
  }
  const evs = (rows || []).filter((e) => e.person_id);
  const personIds = [...new Set(evs.map((e) => e.person_id))];
  const eventIds = [...new Set(evs.map((e) => e.event_id).filter(Boolean))];

  const nameById = new Map();
  const people = await chunkedByIds(personIds, (ids) =>
    supabase.from("people").select("id, name, email").in("id", ids).then((r) => r.data || []));
  for (const p of people) nameById.set(p.id, p.name || (p.email ? p.email.split("@")[0] : "Someone"));

  const titleById = new Map();
  const events = await chunkedByIds(eventIds, (ids) =>
    supabase.from("events").select("id, title").in("id", ids).then((r) => r.data || []));
  for (const ev of events) titleById.set(ev.id, ev.title);

  const items = evs.map((e) =>
    signalFromEvent(e, nameById.get(e.person_id) || "Someone", e.event_id ? titleById.get(e.event_id) : null));
  return { items, windowHours: hours };
}
