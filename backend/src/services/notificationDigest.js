// ════════════════════════════════════════════════════════════════════════
// NOTIFICATION DIGEST — build the host's once-a-day "what happened in your
// world" summary from their REAL last-24h activity.
//
// Two layers, deliberately split so the shaping is unit-testable without a DB:
//
//   shapeDigest(raw, categories)  — PURE. Takes already-fetched rows per
//     category + the enabled-category map, returns the structured summary
//     ({ totalCount, sections:[{key,label,count,items,overflow}] }). Caps
//     items per section. No I/O. This is what tests/notification-digest.test.js
//     exercises.
//
//   buildDigest(hostId, sinceTs, untilTs, categories) — fetches the host's
//     activity in the window (only for enabled categories) and feeds it to
//     shapeDigest. Scale-safe: every event-id-scoped read goes through the
//     safe-query toolkit (selectAllPaged / chunked .in()), never a raw
//     unbounded .in() and never the silent 1000-row cap.
//
// Sources (see migration 102 + memory: pull-up signal lives on TWO paths):
//   rsvps     — new CONFIRMED rsvps to this host's events
//   waitlist  — new WAITLIST rsvps (no separate table; rsvps.booking_status)
//   messages  — inbound guest messages (person_events type=message_in, host-scoped)
//   community — new community_members for this host's communities
//   pullups   — people who pulled up: rsvps.pulled_up=true OR a pullups row
// ════════════════════════════════════════════════════════════════════════

import { selectInChunks, selectAllPaged } from "../db/safeQuery.js";
import { getUserProfile } from "../repos/profiles.js";
import { getFrontendUrl } from "../lib/urls.js";
import { dailyDigestEmail, dailyDigestSubject } from "../emails/dailyDigest.js";

// Cap items shown per section; the rest collapse into "+N more".
export const MAX_ITEMS_PER_SECTION = 8;

// The five categories, in display order, with their human labels.
export const CATEGORY_KEYS = ["rsvps", "messages", "waitlist", "community", "pullups"];
const CATEGORY_LABELS = {
  rsvps:     "New RSVPs",
  messages:  "New messages",
  waitlist:  "New on the waitlist",
  community: "New community members",
  pullups:   "Pulled up",
};

// Default categories map — all on. Used when a host has no prefs row yet, or
// enables for the first time without specifying categories.
export function defaultCategories() {
  return { rsvps: true, messages: true, waitlist: true, community: true, pullups: true };
}

// ── PURE shaper ──────────────────────────────────────────────────────────
// raw = { rsvps:[item], messages:[item], waitlist:[item], community:[item],
//         pullups:[item] } where each item is already { title, subtitle }.
// categories = { rsvps:bool, ... } — only true ones are included.
// Returns { totalCount, sections:[{ key, label, count, items, overflow }] }.
export function shapeDigest(raw = {}, categories = defaultCategories()) {
  const sections = [];
  let totalCount = 0;

  for (const key of CATEGORY_KEYS) {
    if (!categories?.[key]) continue;                 // category filtering
    const all = Array.isArray(raw[key]) ? raw[key] : [];
    const count = all.length;
    if (count === 0) continue;                        // empty sections drop out
    totalCount += count;
    const items = all.slice(0, MAX_ITEMS_PER_SECTION).map((it) => ({
      title: String(it?.title ?? "").slice(0, 140),
      subtitle: it?.subtitle ? String(it.subtitle).slice(0, 140) : "",
    }));
    const overflow = Math.max(0, count - items.length);
    sections.push({ key, label: CATEGORY_LABELS[key], count, items, overflow });
  }

  return { totalCount, sections };
}

// Build a slim "N new X, M messages" headline fragment list from the shaped
// digest — reused by the email subject and any preview. Returns string[].
export function digestHeadlineParts(shaped) {
  return (shaped?.sections || []).map((s) => {
    const n = s.count;
    switch (s.key) {
      case "rsvps":     return `${n} new RSVP${n === 1 ? "" : "s"}`;
      case "messages":  return `${n} message${n === 1 ? "" : "s"}`;
      case "waitlist":  return `${n} on the waitlist`;
      case "community": return `${n} new member${n === 1 ? "" : "s"}`;
      case "pullups":   return `${n} pulled up`;
      default:          return `${n} ${s.key}`;
    }
  });
}

// ── Small helpers for turning DB rows into { title, subtitle } items ───────
function personName(person) {
  return (person?.name || person?.email || "Someone").toString().trim() || "Someone";
}
function eventTitle(eventsById, eventId) {
  return eventsById.get(eventId)?.title || "an event";
}

// ── DB-backed builder ──────────────────────────────────────────────────────
// Returns the SAME shape as shapeDigest. `supabaseClient` is injectable for
// tests; defaults to the shared admin client.
export async function buildDigest(hostId, sinceTs, untilTs, categories = defaultCategories(), { supabaseClient } = {}) {
  const supabase =
    supabaseClient || (await import("../supabase.js")).supabase;
  const since = (sinceTs instanceof Date ? sinceTs : new Date(sinceTs)).toISOString();
  const until = (untilTs instanceof Date ? untilTs : new Date(untilTs)).toISOString();

  // The host's events — every event-scoped read filters on these ids. Paged so
  // a prolific host's full event list never truncates at 1000.
  const events = await selectAllPaged(() =>
    supabase.from("events").select("id, title").eq("host_id", hostId),
  );
  const eventIds = events.map((e) => e.id);
  const eventsById = new Map(events.map((e) => [e.id, e]));

  const raw = { rsvps: [], messages: [], waitlist: [], community: [], pullups: [] };

  // Only fetch what we'll render — skip disabled categories entirely.
  const wants = (k) => !!categories?.[k] && eventIds.length > 0;

  // RSVPs (new CONFIRMED) + WAITLIST share one read of the window, then split.
  if (wants("rsvps") || wants("waitlist")) {
    // Chunked .in() over the host's event ids — never a raw unbounded .in().
    const rows = await selectInChunks(
      () =>
        supabase
          .from("rsvps") // safe-query: ok — wrapped in selectInChunks over event ids
          .select("id, person_id, event_id, booking_status, created_at, people:person_id ( name, email )")
          .gte("created_at", since)
          .lt("created_at", until),
      "event_id",
      eventIds,
    );
    for (const r of rows) {
      const item = {
        title: personName(r.people),
        subtitle: `RSVP'd to ${eventTitle(eventsById, r.event_id)}`,
      };
      if (r.booking_status === "WAITLIST") {
        if (wants("waitlist")) raw.waitlist.push({ ...item, subtitle: `Joined the waitlist for ${eventTitle(eventsById, r.event_id)}` });
      } else if (wants("rsvps")) {
        raw.rsvps.push(item);
      }
    }
  }

  // Messages — inbound guest messages, host-scoped (no event-id filter needed:
  // person_events carries host_id). Window + type + direction.
  if (categories?.messages) {
    const rows = await selectAllPaged(() =>
      supabase
        .from("person_events") // safe-query: ok — wrapped in selectAllPaged
        .select("id, person_id, body, occurred_at, people:person_id ( name, email )")
        .eq("host_id", hostId)
        .eq("type", "message_in")
        .gte("occurred_at", since)
        .lt("occurred_at", until),
    );
    for (const m of rows) {
      raw.messages.push({
        title: personName(m.people),
        subtitle: (m.body || "").toString().replace(/\s+/g, " ").trim().slice(0, 120) || "Sent you a message",
      });
    }
  }

  // Pull-ups — UNION of the two signal paths (memory: pullups split-brain).
  //   (a) rsvps.pulled_up = true, freshly flipped in the window (updated_at)
  //   (b) a pullups row created/verified in the window
  // Dedup by person+event so a guest counted on both paths counts once.
  if (wants("pullups")) {
    const seen = new Set();
    const rsvpPulls = await selectInChunks(
      () =>
        supabase
          .from("rsvps") // safe-query: ok — wrapped in selectInChunks over event ids
          .select("person_id, event_id, updated_at, people:person_id ( name, email )")
          .eq("pulled_up", true)
          .gte("updated_at", since)
          .lt("updated_at", until),
      "event_id",
      eventIds,
    );
    for (const p of rsvpPulls) {
      const k = `${p.person_id}:${p.event_id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      raw.pullups.push({ title: personName(p.people), subtitle: `Pulled up at ${eventTitle(eventsById, p.event_id)}` });
    }
    const doorPulls = await selectInChunks(
      () =>
        supabase
          .from("pullups") // safe-query: ok — wrapped in selectInChunks over event ids
          .select("person_id, event_id, verified_at, created_at, people:person_id ( name, email )")
          .gte("created_at", since)
          .lt("created_at", until),
      "event_id",
      eventIds,
    );
    for (const p of doorPulls) {
      const k = `${p.person_id}:${p.event_id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      raw.pullups.push({ title: personName(p.people), subtitle: `Pulled up at ${eventTitle(eventsById, p.event_id)}` });
    }
  }

  // Community — new members across all of this host's communities.
  if (categories?.community) {
    const communities = await selectAllPaged(() =>
      supabase.from("communities").select("id, title").eq("host_id", hostId),
    );
    const communityIds = communities.map((c) => c.id);
    const communitiesById = new Map(communities.map((c) => [c.id, c]));
    if (communityIds.length) {
      const rows = await selectInChunks(
        () =>
          supabase
            .from("community_members") // safe-query: ok — wrapped in selectInChunks over community ids
            .select("person_id, community_id, joined_at, people:person_id ( name, email )")
            .gte("joined_at", since)
            .lt("joined_at", until),
        "community_id",
        communityIds,
      );
      for (const cm of rows) {
        const c = communitiesById.get(cm.community_id);
        raw.community.push({
          title: personName(cm.people),
          subtitle: c?.title ? `Joined ${c.title}` : "Joined your community",
        });
      }
    }
  }

  return shapeDigest(raw, categories);
}

// ════════════════════════════════════════════════════════════════════════
// PREFERENCES + SEND ORCHESTRATION
// Shared by the routes (GET/PUT/test) and the daily job, so the read/write
// shape and the send path live in exactly one place.
// ════════════════════════════════════════════════════════════════════════

// The default prefs shape returned when a host has no row yet. `email` is the
// host's contact email (profile.contactEmail, falling back to the auth email).
export function defaultPrefs(email = "") {
  return {
    enabled: false,
    frequency: "daily",
    channel: "email",
    email: email || "",
    categories: defaultCategories(),
    lastSentAt: null,
  };
}

// Map a DB row → the API contract shape.
function rowToPrefs(row, email = "") {
  if (!row) return defaultPrefs(email);
  const cats = row.categories || {};
  return {
    enabled: !!row.enabled,
    frequency: row.frequency || "daily",
    channel: "email",
    email: email || "",
    categories: {
      rsvps:     cats.rsvps     !== false,
      messages:  cats.messages  !== false,
      waitlist:  cats.waitlist  !== false,
      community: cats.community !== false,
      pullups:   cats.pullups   !== false,
    },
    lastSentAt: row.last_sent_at || null,
  };
}

// Resolve the host's contact email: profile contact_email, else auth email.
async function resolveHostEmail(hostId, fallbackEmail = "") {
  try {
    const profile = await getUserProfile(hostId);
    return profile?.contactEmail || fallbackEmail || "";
  } catch {
    return fallbackEmail || "";
  }
}

// GET — current prefs (or defaults). `authEmail` is req.user.email.
export async function getHostPrefs(hostId, { authEmail = "", supabaseClient } = {}) {
  const supabase = supabaseClient || (await import("../supabase.js")).supabase;
  const email = await resolveHostEmail(hostId, authEmail);
  const { data: row } = await supabase
    .from("host_notification_prefs")
    .select("enabled, frequency, categories, last_sent_at")
    .eq("host_id", hostId)
    .maybeSingle();
  return rowToPrefs(row, email);
}

// PUT — upsert. When enabling for the first time without categories, default
// all categories on. Returns the same shape as getHostPrefs.
export async function putHostPrefs(hostId, body = {}, { authEmail = "", supabaseClient } = {}) {
  const supabase = supabaseClient || (await import("../supabase.js")).supabase;
  const email = await resolveHostEmail(hostId, authEmail);

  const { data: existing } = await supabase
    .from("host_notification_prefs")
    .select("enabled, frequency, categories, last_sent_at")
    .eq("host_id", hostId)
    .maybeSingle();

  const enabled = typeof body.enabled === "boolean" ? body.enabled : !!existing?.enabled;
  const frequency = body.frequency === "daily" ? "daily" : (existing?.frequency || "daily");

  // Merge categories: start from existing (or all-true default), apply the
  // partial. On first-time enable with no categories given, all stay true.
  const base = existing?.categories || defaultCategories();
  const merged = { ...defaultCategories(), ...base };
  if (body.categories && typeof body.categories === "object") {
    for (const k of CATEGORY_KEYS) {
      if (typeof body.categories[k] === "boolean") merged[k] = body.categories[k];
    }
  }

  const patch = {
    host_id: hostId,
    enabled,
    frequency,
    categories: merged,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("host_notification_prefs")
    .upsert(patch, { onConflict: "host_id" });
  if (error) throw error;

  return rowToPrefs({ ...patch, last_sent_at: existing?.last_sent_at || null }, email);
}

// Sample data for the PREVIEW (test) email — one+ believable item per
// category, so when a host hits "send me a preview" they see a mock of EVERY
// notification type they've turned on. Doubles as a validation that their
// chosen settings render. shapeDigest() filters this to enabled categories.
export function sampleDigestRaw() {
  return {
    rsvps: [
      { title: "Deandra Gracia", subtitle: "RSVP'd to TWIN FREAKS ///listening release" },
      { title: "Samuel Okoth", subtitle: "RSVP'd to Rooftop Sessions Vol. 3" },
    ],
    messages: [
      { title: "Alex Rivera", subtitle: "“Can I still bring a +1?”" },
      { title: "Priya N.", subtitle: "“Loved the last one — when's the next?”" },
    ],
    waitlist: [
      { title: "Mia Chen", subtitle: "Joined the waitlist for Supper Club Vol. 4" },
    ],
    community: [
      { title: "Jordan Blake", subtitle: "Joined your community" },
      { title: "Lena Vogt", subtitle: "Joined your community" },
    ],
    pullups: [
      { title: "Noah Adebayo", subtitle: "Pulled up at Friday Night" },
    ],
  };
}

// Build + send a digest to the host's contact email via the existing email
// pipeline (enqueueOutbox). `force` (the "test" button) sends even with zero
// activity. `preview` (also the test button) renders MOCK data across every
// enabled category instead of real activity — a settings validation the host
// can see. Returns { ok, sentTo, totalCount }.
export async function sendHostDigest(hostId, { sinceTs, untilTs, force = false, preview = false, authEmail = "", supabaseClient } = {}) {
  const supabase = supabaseClient || (await import("../supabase.js")).supabase;
  const until = untilTs ? new Date(untilTs) : new Date();
  const since = sinceTs ? new Date(sinceTs) : new Date(until.getTime() - 24 * 60 * 60 * 1000);

  const profile = await getUserProfile(hostId).catch(() => null);
  const to = profile?.contactEmail || authEmail || "";
  if (!to) return { ok: false, error: "no_contact_email", sentTo: null, totalCount: 0 };

  const prefs = await getHostPrefs(hostId, { authEmail: to, supabaseClient: supabase });
  // Preview (test) → mock data across every enabled category; otherwise the
  // host's real last-24h activity.
  const digest = preview
    ? shapeDigest(sampleDigestRaw(), prefs.categories)
    : await buildDigest(hostId, since, until, prefs.categories, { supabaseClient: supabase });

  // The recurring job only sends with activity; the test button always sends.
  if (!force && digest.totalCount === 0) {
    return { ok: true, skipped: true, sentTo: to, totalCount: 0 };
  }

  const headlineParts = digestHeadlineParts(digest);
  const hasActivity = digest.totalCount > 0;
  const frontendUrl = getFrontendUrl();
  const firstName = (profile?.name || "").trim().split(/\s+/)[0] || "";

  const html = dailyDigestEmail({
    hostName: firstName,
    digest,
    headlineParts,
    roomUrl: `${frontendUrl}/room`,
    frontendUrl,
    isPreview: preview || (force && !hasActivity),
  });
  const subject = dailyDigestSubject();

  // Idempotency key buckets by host + UTC day so the recurring tick can't
  // double-send the same day's digest even if it fires more than once. Test
  // sends append a timestamp so they're never deduped against the daily one.
  const dayKey = until.toISOString().slice(0, 10);
  const idempotencyKey = force
    ? `host-digest-test-${hostId}-${Date.now()}`
    : `host-digest-${hostId}-${dayKey}`;

  const { enqueueOutbox } = await import("../email/index.js");
  await enqueueOutbox({
    toEmail: to,
    subject,
    htmlBody: html,
    category: "transactional",
    idempotencyKey,
    hostProfileId: hostId,
  });

  return { ok: true, sentTo: to, totalCount: digest.totalCount };
}

// Mark a host's digest as sent (the daily job's double-send guard).
export async function markDigestSent(hostId, { supabaseClient } = {}) {
  const supabase = supabaseClient || (await import("../supabase.js")).supabase;
  await supabase
    .from("host_notification_prefs")
    .update({ last_sent_at: new Date().toISOString() })
    .eq("host_id", hostId);
}

// The daily tick body: send to every opted-in host due for a digest (NULL or
// older than ~20h last_sent_at), only when there's activity. Idempotent + safe
// to run hourly. Exported so the scheduler in index.js can call it.
export async function runDailyDigestTick({ supabaseClient } = {}) {
  const supabase = supabaseClient || (await import("../supabase.js")).supabase;
  const now = new Date();
  const dueBefore = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();

  // Hosts enabled and either never sent, or last sent > ~20h ago.
  const { data: dueHosts, error } = await supabase
    .from("host_notification_prefs")
    .select("host_id, last_sent_at")
    .eq("enabled", true)
    .or(`last_sent_at.is.null,last_sent_at.lt.${dueBefore}`);
  if (error) {
    console.error("[Digest] Error fetching due hosts:", error.message);
    return { sent: 0, skipped: 0, errors: 0 };
  }

  let sent = 0, skipped = 0, errors = 0;
  for (const h of dueHosts || []) {
    try {
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const r = await sendHostDigest(h.host_id, { sinceTs: since, untilTs: now, force: false, supabaseClient: supabase });
      // Stamp last_sent_at regardless of whether there was activity, so a quiet
      // host isn't re-evaluated every hour for the rest of the day.
      await markDigestSent(h.host_id, { supabaseClient: supabase });
      if (r.skipped) skipped += 1; else sent += 1;
    } catch (e) {
      errors += 1;
      console.error(`[Digest] Failed for host ${h.host_id}:`, e.message);
    }
  }
  if (sent || skipped || errors) {
    console.log(`[Digest] tick: sent=${sent} skipped(no activity)=${skipped} errors=${errors}`);
  }
  return { sent, skipped, errors };
}
