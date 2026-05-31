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
import { logger } from "../logger.js";

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

// type -> channel default + a human verb for thread/system lines.
const TYPE_VERB = {
  rsvp: "RSVP'd", waitlist_join: "Joined the waitlist", rsvp_cancel: "Cancelled RSVP",
  attended: "Attended", payment: "Paid", page_view: "Viewed the page",
  message_in: "Messaged you", message_out: "You messaged", auto_dm_sent: "Auto-DM sent",
  host_logged: "You logged", acquired: "Found you", identity_linked: "Linked identity", note: "Note",
};

/**
 * Build the global Room payload for a host.
 * @param {string} hostId
 * @returns {Promise<{ host, events, signals, people }>}
 */
export async function getRoomForHost(hostId) {
  if (!hostId) throw new Error("[roomService] hostId required");

  // 1. All timeline events in this host's world, newest first.
  const { data: pe, error: peErr } = await supabase
    .from("person_events")
    .select("id, person_id, event_id, type, channel, direction, body, occurred_at")
    .eq("host_id", hostId)
    .order("occurred_at", { ascending: false })
    .limit(5000);
  if (peErr) {
    logger?.error?.("[roomService] timeline read failed", { error: peErr.message });
    return { host: { peopleCount: 0 }, events: [], signals: [], people: [] };
  }
  const timeline = pe || [];
  if (!timeline.length) {
    return { host: { peopleCount: 0 }, events: [], signals: [], people: [] };
  }

  // 2. Group by person.
  const byPerson = new Map();
  for (const e of timeline) {
    if (!byPerson.has(e.person_id)) byPerson.set(e.person_id, []);
    byPerson.get(e.person_id).push(e);
  }
  const personIds = [...byPerson.keys()];

  // 3. Fetch the people + their identities (reachable channels) in bulk.
  const [{ data: people }, { data: idents }, { data: events }] = await Promise.all([
    supabase.from("people").select("id, name, email, phone_e164, phone_verified_at, instagram, ig_user_id").in("id", personIds),
    supabase.from("person_identities").select("person_id, kind").in("person_id", personIds),
    supabase.from("events").select("id, title, slug, starts_at, status, total_capacity, cover_image_url, image_url, created_via").eq("host_id", hostId),
  ]);
  const peopleById = new Map((people || []).map((p) => [p.id, p]));
  const identsByPerson = new Map();
  for (const i of idents || []) {
    if (!identsByPerson.has(i.person_id)) identsByPerson.set(i.person_id, new Set());
    identsByPerson.get(i.person_id).add(i.kind);
  }

  // 4. Events list (content pieces, for the lens + the banner).
  //   status: draft (not published) | live (published, upcoming/ongoing) |
  //           past (published, already happened). Coming counts from rsvps.
  const eventIds = (events || []).map((e) => e.id);
  const comingByEvent = new Map();
  if (eventIds.length) {
    const { data: rsvpRows } = await supabase
      .from("rsvps")
      .select("event_id, status")
      .in("event_id", eventIds);
    for (const r of rsvpRows || []) {
      if (r.status === "cancelled") continue;
      comingByEvent.set(r.event_id, (comingByEvent.get(r.event_id) || 0) + 1);
    }
  }
  const now = Date.now();
  const eventsOut = (events || [])
    .map((e) => {
      const published = (e.status || "").toUpperCase() === "PUBLISHED";
      const starts = e.starts_at ? new Date(e.starts_at).getTime() : null;
      const isPast = published && starts != null && starts < now;
      const status = !published ? "draft" : isPast ? "past" : "live";
      return {
        id: e.id,
        title: e.title || "Untitled event",
        slug: e.slug || null,
        coverImage: e.cover_image_url || e.image_url || null,
        startsAt: e.starts_at || null,
        when: eventDateLabel(e.starts_at, status),
        status,
        capacity: e.total_capacity || null,
        comingCount: comingByEvent.get(e.id) || 0,
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

  // 5. Build each person.
  const peopleOut = [];
  for (const pid of personIds) {
    const evs = byPerson.get(pid); // newest first
    const person = peopleById.get(pid);
    if (!person) continue;

    const kinds = identsByPerson.get(pid) || new Set();
    const reachable = channelsFromIdentities(kinds, person);
    const channel = preferredChannel(reachable, person);

    const attended = evs.filter((e) => e.type === "attended").length;
    const rsvps = evs.filter((e) => e.type === "rsvp").length;
    const waitlisted = evs.some((e) => e.type === "waitlist_join");
    const eventsTouched = [...new Set(evs.map((e) => e.event_id).filter(Boolean))];
    const lastAt = evs[0]?.occurred_at;

    const warmth = computeWarmth({ attended, rsvps, eventsTouched: eventsTouched.length, lastAt });
    const relationship = describeRelationship({ attended, rsvps, eventsTouched: eventsTouched.length, waitlisted, lastAt });
    const { needsYou, move } = suggestMove({ waitlisted, attended, lastAt, rsvps });

    peopleOut.push({
      id: pid,
      name: person.name || (person.email ? person.email.split("@")[0] : "Someone"),
      handle: person.instagram ? `@${String(person.instagram).replace(/^@/, "")}` : (person.email || ""),
      initials: initials(person.name, person.email),
      color: colorFor(pid),
      channel,
      reachable,
      windowOpen: null, // real 24h-window state comes when channels are wired
      windowNote: null,
      warmth,
      relationship,
      events: eventsTouched,
      signals: buildPersonSignals({ attended, eventsTouched: eventsTouched.length, kinds }),
      needsYou,
      move,
      lastMessage: lastMessageFrom(evs, eventTitleById),
      thread: buildThread(evs, eventTitleById),
    });
  }

  // Rank: who-needs-you first, then warmth (the Room's default order).
  peopleOut.sort((a, b) => (a.needsYou !== b.needsYou ? (a.needsYou ? -1 : 1) : b.warmth - a.warmth));

  // 6. Signals — recent notable events as nudges (top of the Room).
  const signals = buildSignals(timeline, peopleById, eventTitleById);

  return {
    host: { peopleCount: personIds.length },
    events: eventsOut,
    signals,
    people: peopleOut,
  };
}

// ── heuristics ──────────────────────────────────────────────────────

function channelsFromIdentities(kinds, person) {
  const out = [];
  if (kinds.has("ig_user_id") || kinds.has("ig_handle") || person.ig_user_id || person.instagram) out.push("instagram");
  if (kinds.has("phone") || person.phone_e164) out.push("whatsapp");
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

function lastMessageFrom(evs, eventTitleById) {
  const e = evs[0];
  if (!e) return null;
  return { from: e.direction === "in" ? "them" : "system", text: lineFor(e, eventTitleById), time: relTime(e.occurred_at) };
}

function buildThread(evs, eventTitleById) {
  // oldest → newest for the thread view
  return [...evs].reverse().map((e) => ({
    from: e.direction === "in" ? "them" : e.direction === "out" ? "you" : "system",
    text: e.body || lineFor(e, eventTitleById),
    time: relTime(e.occurred_at),
    channel: e.channel || undefined,
  }));
}

function lineFor(e, eventTitleById) {
  if (e.body) return e.body;
  const verb = TYPE_VERB[e.type] || e.type;
  const title = e.event_id ? eventTitleById.get(e.event_id) : null;
  return title ? `${verb} — ${title}` : verb;
}

function buildSignals(timeline, peopleById, eventTitleById) {
  // Surface the most recent meaningful events as nudges.
  const NOTABLE = new Set(["message_in", "waitlist_join", "rsvp", "attended"]);
  const out = [];
  for (const e of timeline) {
    if (out.length >= 6) break;
    if (!NOTABLE.has(e.type)) continue;
    const p = peopleById.get(e.person_id);
    if (!p) continue;
    const name = p.name || (p.email ? p.email.split("@")[0] : "Someone");
    const title = e.event_id ? eventTitleById.get(e.event_id) : null;
    let kind = "plain", text;
    if (e.type === "message_in") { kind = "urgent"; text = `${name} messaged you — reply while it's fresh.`; }
    else if (e.type === "waitlist_join") { kind = "urgent"; text = `${name} joined the waitlist${title ? ` for ${title}` : ""}.`; }
    else if (e.type === "attended") { kind = "warm"; text = `${name} came to ${title || "your event"} — worth a thank-you.`; }
    else { text = `${name} RSVP'd${title ? ` to ${title}` : ""}.`; }
    out.push({ id: e.id, kind, text, personId: e.person_id, eventId: e.event_id || undefined, time: relTime(e.occurred_at) });
  }
  return out;
}
