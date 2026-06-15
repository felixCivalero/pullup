// backend/src/services/contextPack.js
//
// THE PORTABLE SMART TWIN — data ownership that carries the intelligence, not
// just the rows.
//
// "All your data" normally means a CSV of names. The smarts — identity fusion
// across channels, who's core, who's drifting, IG reach + reciprocity, who's
// closest to whom — live in PullUp's logic, not the export. This module packages
// that derived layer into a portable pack you can feed to ANY AI so it knows the
// host's world "as of PullUp".
//
// Two assemblers, deliberately SEPARATE so you get either or both:
//   buildCreatorPack(hostId, …)  — HIM: brief + brand + the shape of his world
//                                  + core/drifting/spender intelligence. Embeds
//                                  the people packs when you want the whole world
//                                  in one feed (includePeople).
//   buildPersonPack(hostId, id)  — ONE human: resolved identity across channels,
//                                  full history with the host, IG signals, the
//                                  private notes, and who they're closest to.
//
// Each returns { data, markdown }: `data` is the structured JSON; `markdown` is
// the narrative you actually hand an AI ("the smart version"). Reuses the
// resolved spine end-to-end — personSourceProfiles (fusion), peopleMatching
// (closeness), personTimeline (memory) — so the pack is the real intelligence,
// never a rebuilt half-version. See [[project_database_free_saas]],
// [[project_the_room_is_pullup]].

import { getUserProfile } from "../repos/profiles.js";
import { getUserEventIds } from "../repos/eventAccess.js";
import { getEventCounts } from "../repos/events.js";
import {
  getAllPeopleWithStats,
  findPersonById,
  getPersonTouchpoints,
  personBelongsToHost,
} from "../repos/people.js";
import { getPersonNotes } from "../repos/personNotes.js";
import { supabase } from "../supabase.js";
import { selectInChunks } from "../db/safeQuery.js";
import { getForPerson, getForPersons, resolveDisplay } from "./personSourceProfiles.js";
import { getPersonTimeline } from "./personTimeline.js";
import { findMatches } from "./peopleMatching.js";

const REGULAR_THRESHOLD = 3; // events attended to count as a "regular"
const DRIFT_DAYS = 90; // a regular with nothing in this many days is "drifting"

// ── small shared helpers ───────────────────────────────────────────────
function money(cents, currency = "usd") {
  const n = Number(cents || 0) / 100;
  const cur = String(currency || "usd").toUpperCase();
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function isoDay(d) {
  if (!d) return null;
  const t = new Date(d);
  return Number.isFinite(t.getTime()) ? t.toISOString().slice(0, 10) : null;
}

function daysSince(d) {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

// Pull the Instagram reach/reciprocity signals out of a person's source
// profiles — the same shape the matching engine reasons over.
function igSignals(profiles = []) {
  const ig = (profiles || []).find((p) => p.source === "instagram");
  if (!ig) return null;
  const d = ig.data || {};
  const num = (...v) => { for (const x of v) if (typeof x === "number") return x; return null; };
  const bool = (...v) => { for (const x of v) if (typeof x === "boolean") return x; return null; };
  const followerCount = num(d.followerCount, d.follower_count);
  return {
    handle: ig.handle || null,
    followerCount,
    followsYou: bool(d.isUserFollowBusiness, d.is_user_follow_business),
    youFollow: bool(d.isBusinessFollowUser, d.is_business_follow_user),
    verified: bool(d.isVerified, d.is_verified_user),
  };
}

function reach(n) {
  if (n == null) return null;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M followers`;
  if (n >= 1000) return `${Math.round(n / 1000)}k followers`;
  return `${n} followers`;
}

// Most-recent event date out of a person's eventHistory.
function lastSeen(eventHistory = []) {
  let best = null;
  for (const h of eventHistory || []) {
    const d = h.eventDate || h.rsvpDate;
    if (!d) continue;
    if (!best || new Date(d) > new Date(best)) best = d;
  }
  return best;
}

// ── CREATOR PACK — "him" ────────────────────────────────────────────────
/**
 * Assemble the host's portable smart twin.
 * @param {string} hostId
 * @param {object} [opts]
 * @param {boolean} [opts.includePeople=false]  embed the people of his world
 * @param {number}  [opts.peopleLimit=100]      cap embedded/listed people
 * @returns {Promise<{ data: object, markdown: string }>}
 */
export async function buildCreatorPack(hostId, { includePeople = false, peopleLimit = 100 } = {}) {
  if (!hostId) throw new Error("hostId required");

  const [profile, people, eventIds] = await Promise.all([
    getUserProfile(hostId).catch(() => null),
    getAllPeopleWithStats(hostId).catch(() => []),
    getUserEventIds(hostId).catch(() => []),
  ]);

  // Events with attendance counts (one events read + per-event count).
  let events = [];
  if (eventIds && eventIds.length) {
    // Chunked .in() — a prolific host has hundreds of event ids; a raw .in()
    // overflows PostgREST's URL cap and 400s. See db/safeQuery.js.
    const evRows = await selectInChunks(
      () => supabase.from("events").select("id, title, slug, status, starts_at, kind"),
      "id",
      eventIds,
    );
    // Per-chunk order doesn't compose, so sort the combined set newest-first.
    evRows.sort((a, b) => new Date(b.starts_at || 0) - new Date(a.starts_at || 0));
    // Only real gatherings — the page-editor primitive stores community/product
    // pages in the same table under `kind`; those aren't events.
    const realEvents = evRows.filter((e) => !e.kind || e.kind === "event");
    events = await Promise.all(
      realEvents.map(async (e) => {
        const counts = await getEventCounts(e.id).catch(() => ({ confirmed: 0, waitlist: 0 }));
        return {
          id: e.id,
          title: e.title || "Untitled",
          slug: e.slug,
          status: e.status,
          date: isoDay(e.starts_at),
          confirmed: counts.confirmed || 0,
          waitlist: counts.waitlist || 0,
        };
      })
    );
  }

  // IG signals across the whole world, in bulk.
  const igMap = await getForPersons(people.map((p) => p.id)).catch(() => new Map());
  const igFor = (id) => igSignals(igMap.get(id) || []);

  // Enrich each person with derived fields we reuse below.
  const enriched = people.map((p) => {
    const stats = p.stats || {};
    const ig = igFor(p.id);
    const last = lastSeen(p.eventHistory);
    return {
      raw: p,
      id: p.id,
      name: p.name || ig?.handle || p.email || "Someone",
      attended: stats.eventsAttended || 0,
      totalEvents: stats.totalEvents || 0,
      dinners: stats.totalDinners || 0,
      spendCents: Number(p.totalSpend || 0),
      payments: Number(p.paymentCount || 0),
      lastSeen: last,
      daysSince: daysSince(last),
      ig,
    };
  });

  // Segments — the shape of the world.
  const totalPeople = enriched.length;
  const showedUp = enriched.filter((p) => p.attended > 0).length;
  const regulars = enriched.filter((p) => p.attended >= REGULAR_THRESHOLD);
  const firstTimers = enriched.filter((p) => p.totalEvents === 1).length;
  const dinnerGoers = enriched.filter((p) => p.dinners > 0).length;
  const payers = enriched.filter((p) => p.spendCents > 0);
  const grossCents = payers.reduce((s, p) => s + p.spendCents, 0);

  // Core people — most repeat attendance, then reach as a tiebreak.
  const core = [...enriched]
    .filter((p) => p.attended > 0)
    .sort((a, b) => b.attended - a.attended || (b.ig?.followerCount || 0) - (a.ig?.followerCount || 0))
    .slice(0, 12);

  // Drifting — regulars who've gone quiet.
  const drifting = regulars
    .filter((p) => p.daysSince != null && p.daysSince >= DRIFT_DAYS)
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, 12);

  // Biggest spenders.
  const spenders = [...payers].sort((a, b) => b.spendCents - a.spendCents).slice(0, 12);

  const data = {
    kind: "creator_pack",
    generatedAt: new Date().toISOString(),
    host: {
      id: hostId,
      name: profile?.name || "",
      brand: profile?.brand || "",
      bio: profile?.bio || "",
      city: profile?.city || "",
      links: profile?.brandingLinks || {},
      website: profile?.brandWebsite || "",
      brief: profile?.hostBrief || "",
    },
    world: {
      people: totalPeople,
      showedUp,
      regulars: regulars.length,
      firstTimers,
      dinnerGoers,
      payers: payers.length,
      grossCents,
      events: {
        total: events.length,
        published: events.filter((e) => e.status === "PUBLISHED").length,
        drafts: events.filter((e) => e.status === "DRAFT").length,
      },
    },
    core: core.map(slimPerson),
    drifting: drifting.map(slimPerson),
    topSpenders: spenders.map(slimPerson),
    events,
  };

  if (includePeople) {
    data.people = enriched.slice(0, peopleLimit).map((p) => ({
      ...slimPerson(p),
      email: p.raw.email || null,
      phone: p.raw.phone || null,
      tags: p.raw.tags || [],
      totalEvents: p.totalEvents,
      dinners: p.dinners,
    }));
    data.peopleTruncated = enriched.length > peopleLimit ? enriched.length - peopleLimit : 0;
  }

  return { data, markdown: renderCreatorMarkdown(data) };
}

function slimPerson(p) {
  return {
    id: p.id,
    name: p.name,
    attended: p.attended,
    lastSeen: p.lastSeen ? isoDay(p.lastSeen) : null,
    daysSince: p.daysSince,
    spendCents: p.spendCents,
    payments: p.payments,
    ig: p.ig
      ? {
          handle: p.ig.handle,
          followerCount: p.ig.followerCount,
          verified: p.ig.verified,
          followsYou: p.ig.followsYou,
          youFollow: p.ig.youFollow,
        }
      : null,
  };
}

function igLine(ig) {
  if (!ig) return "";
  const bits = [];
  if (ig.handle) bits.push(`@${String(ig.handle).replace(/^@+/, "")}`);
  const r = reach(ig.followerCount);
  if (r) bits.push(r);
  if (ig.verified) bits.push("verified");
  if (ig.followsYou && ig.youFollow) bits.push("mutual follow");
  else if (ig.followsYou) bits.push("follows you");
  else if (ig.youFollow) bits.push("you follow");
  return bits.length ? ` — IG ${bits.join(", ")}` : "";
}

function renderCreatorMarkdown(d) {
  const h = d.host;
  const w = d.world;
  const L = [];
  L.push(`# PullUp context pack — ${h.name || "Host"}`);
  L.push("");
  L.push(
    `_Exported ${isoDay(d.generatedAt)}. This is ${h.name || "the host"}'s world as of PullUp — who they are, what they run, and the people in it. Hand this to an AI to brief it on the host: it carries the resolved intelligence, not just rows._`
  );
  L.push("");

  L.push("## Who they are");
  if (h.brief) L.push(h.brief);
  else L.push("_No brief written yet._");
  const meta = [];
  if (h.brand) meta.push(`Brand: ${h.brand}`);
  if (h.city) meta.push(`City: ${h.city}`);
  if (meta.length) { L.push(""); L.push(meta.join("  ·  ")); }
  const links = Object.entries(h.links || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (h.website) links.unshift(`website: ${h.website}`);
  if (links.length) L.push(`Links — ${links.join(" · ")}`);
  L.push("");

  L.push("## The shape of the world");
  L.push(`- ${w.people} people across ${w.events.total} events (${w.events.published} live, ${w.events.drafts} draft)`);
  L.push(`- ${w.showedUp} have actually shown up · ${w.regulars} are regulars (${REGULAR_THRESHOLD}+ events) · ${w.firstTimers} came just once`);
  if (w.dinnerGoers) L.push(`- ${w.dinnerGoers} have sat down for a dinner`);
  if (w.payers) L.push(`- ${w.payers} have paid — ${money(w.grossCents)} total`);
  L.push("");

  if (d.core.length) {
    L.push("## Core people (the ones who keep coming back)");
    d.core.forEach((p, i) => {
      const last = p.lastSeen ? `, last seen ${p.lastSeen}` : "";
      L.push(`${i + 1}. ${p.name} — ${p.attended} event${p.attended === 1 ? "" : "s"}${last}${igLine(p.ig)}`);
    });
    L.push("");
  }

  if (d.drifting.length) {
    L.push("## Drifting (regulars who've gone quiet — worth a personal nudge)");
    d.drifting.forEach((p) => {
      L.push(`- ${p.name} — ${p.attended} events, but nothing in ${p.daysSince} days (last ${p.lastSeen})${igLine(p.ig)}`);
    });
    L.push("");
  }

  if (d.topSpenders.length) {
    L.push("## Biggest spenders");
    d.topSpenders.forEach((p) => {
      L.push(`- ${p.name} — ${money(p.spendCents)} over ${p.payments} payment${p.payments === 1 ? "" : "s"}`);
    });
    L.push("");
  }

  if (d.events.length) {
    L.push("## Events");
    d.events.forEach((e) => {
      const tag = e.status === "PUBLISHED" ? "live" : e.status.toLowerCase();
      L.push(`- ${e.title}${e.date ? ` — ${e.date}` : ""} (${tag}) — ${e.confirmed} confirmed${e.waitlist ? `, ${e.waitlist} waitlisted` : ""}`);
    });
    L.push("");
  }

  if (d.people) {
    L.push(`## People (${d.people.length}${d.peopleTruncated ? ` of ${d.people.length + d.peopleTruncated}` : ""})`);
    d.people.forEach((p) => {
      const id = [p.email, p.phone].filter(Boolean).join(" · ");
      const hist = `${p.totalEvents} event${p.totalEvents === 1 ? "" : "s"}, ${p.attended} attended${p.lastSeen ? `, last ${p.lastSeen}` : ""}`;
      L.push(`- **${p.name}**${id ? ` — ${id}` : ""}${igLine(p.ig)}`);
      L.push(`  ${hist}${p.spendCents ? ` · ${money(p.spendCents)} spent` : ""}${p.tags && p.tags.length ? ` · tags: ${p.tags.join(", ")}` : ""}`);
    });
    if (d.peopleTruncated) L.push(`_…and ${d.peopleTruncated} more — raise the limit or pull a single person's pack for full depth._`);
    L.push("");
  }

  return L.join("\n");
}

// ── PERSON PACK — "one human" ───────────────────────────────────────────
/**
 * Assemble one person's resolved record in the host's world.
 * @param {string} hostId
 * @param {string} personId
 * @param {object} [opts]
 * @param {number}  [opts.timelineLimit=100]
 * @param {boolean} [opts.includeMatches=true]
 * @param {string}  [opts.hostName]  pre-resolved host display name (saves a fetch)
 * @returns {Promise<{ data: object, markdown: string }|null>}  null if not the host's person
 */
export async function buildPersonPack(hostId, personId, { timelineLimit = 100, includeMatches = true, hostName = null } = {}) {
  if (!hostId || !personId) throw new Error("hostId and personId required");

  const allowed = await personBelongsToHost(personId, hostId).catch(() => false);
  if (!allowed) return null;

  const person = await findPersonById(personId);
  if (!person) return null;

  const [profiles, touchpoints, notes, timeline, matches, resolvedHostName] = await Promise.all([
    getForPerson(personId).catch(() => []),
    getPersonTouchpoints(personId, hostId).catch(() => ({ rsvps: [], payments: [] })),
    getPersonNotes(personId, hostId).catch(() => []),
    getPersonTimeline(personId, { limit: timelineLimit }).catch(() => []),
    includeMatches
      ? findMatches({ hostId, personId, limit: 8 }).catch(() => ({ matches: [] }))
      : Promise.resolve({ matches: [] }),
    hostName ? Promise.resolve(hostName) : getUserProfile(hostId).then((p) => p?.name || "this host").catch(() => "this host"),
  ]);

  const display = resolveDisplay(profiles);
  const ig = igSignals(profiles);
  const sources = [...new Set((profiles || []).map((p) => p.source))];

  const rsvps = touchpoints?.rsvps || [];
  // Attendance is the "attended" marker on the timeline (the pull-up signal),
  // not a field on the touchpoint rsvps. Spend is the canonical CRM total.
  const attended = (timeline || []).filter((t) => t.type === "attended").length;
  const spendCents = Number(person.totalSpend || 0);
  const paymentCount = Number(person.paymentCount || 0);

  const data = {
    kind: "person_pack",
    generatedAt: new Date().toISOString(),
    hostId,
    hostName: resolvedHostName,
    person: {
      id: person.id,
      name: display.name || person.name || null,
      nameSource: display.nameSource || null,
      email: person.email || null,
      phone: person.phone || person.phoneE164 || null,
      instagram: display.handle || person.instagram || null,
      twitter: person.twitter || null,
      tiktok: person.tiktok || null,
      linkedin: person.linkedin || null,
      company: person.company || null,
      tags: person.tags || [],
      knownSince: person.createdAt || null,
      sources,
      ig: ig
        ? {
            handle: ig.handle,
            followerCount: ig.followerCount,
            verified: ig.verified,
            followsYou: ig.followsYou,
            youFollow: ig.youFollow,
          }
        : null,
    },
    history: {
      events: rsvps.length,
      attended,
      spendCents,
      payments: paymentCount,
    },
    timeline: (timeline || []).map((t) => ({
      type: t.type,
      channel: t.channel,
      direction: t.direction,
      body: t.body,
      occurredAt: t.occurred_at,
    })),
    notes: (notes || []).map((n) => ({
      content: n.content,
      date: n.noteDate || n.note_date || n.createdAt || n.created_at,
    })),
    matches: (matches?.matches || []).map((m) => ({
      personId: m.personId,
      name: m.name,
      score: m.score,
      reasons: m.reasons || [],
    })),
  };

  return { data, markdown: renderPersonMarkdown(data) };
}

function renderPersonMarkdown(d) {
  const p = d.person;
  const L = [];
  L.push(`# ${p.name || "Unknown person"} — as of PullUp`);
  L.push("");
  L.push(
    `_Their resolved record in ${d.hostName}'s world. One human, fused across every channel they touched — feed this to an AI and it knows who they are and the whole history with the host._`
  );
  L.push("");

  L.push("## Identity");
  if (p.name) L.push(`- Name: ${p.name}${p.nameSource ? ` _(via ${p.nameSource})_` : ""}`);
  if (p.email) L.push(`- Email: ${p.email}`);
  if (p.phone) L.push(`- Phone: ${p.phone}`);
  if (p.ig || p.instagram) {
    const line = igLine(p.ig).replace(/^ — IG /, "");
    L.push(`- Instagram: @${String(p.instagram || p.ig?.handle || "").replace(/^@+/, "")}${line ? ` (${line})` : ""}`);
  }
  for (const k of ["twitter", "tiktok", "linkedin", "company"]) {
    if (p[k]) L.push(`- ${k[0].toUpperCase() + k.slice(1)}: ${p[k]}`);
  }
  if (p.tags && p.tags.length) L.push(`- Tags: ${p.tags.join(", ")}`);
  if (p.knownSince) L.push(`- Known since ${isoDay(p.knownSince)}`);
  if (p.sources && p.sources.length) L.push(`- Linked from: ${p.sources.join(", ")}`);
  L.push("");

  L.push(`## History with ${d.hostName}`);
  const hb = [];
  hb.push(`${d.history.events} RSVP${d.history.events === 1 ? "" : "s"}`);
  hb.push(`${d.history.attended} attended`);
  if (d.history.spendCents) hb.push(`${money(d.history.spendCents)} over ${d.history.payments} payment${d.history.payments === 1 ? "" : "s"}`);
  L.push(`- ${hb.join(" · ")}`);
  if (d.timeline.length) {
    L.push("");
    L.push("Timeline (most recent first):");
    d.timeline.forEach((t) => {
      const when = isoDay(t.occurredAt) || "?";
      const body = t.body || t.type;
      L.push(`- ${when} — ${body}`);
    });
  }
  L.push("");

  if (d.notes.length) {
    L.push(`## Notes (${d.hostName}'s private observations)`);
    d.notes.forEach((n) => L.push(`- ${n.date ? isoDay(n.date) + ": " : ""}${n.content}`));
    L.push("");
  }

  if (d.matches.length) {
    L.push(`## Closest in ${d.hostName}'s world`);
    d.matches.forEach((m) => {
      L.push(`- ${m.name || "Someone"}${m.reasons.length ? ` — ${m.reasons.join("; ")}` : ""}`);
    });
    L.push("");
  }

  return L.join("\n");
}
