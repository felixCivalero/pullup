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

// Default send time when a host has no prefs row yet (08:00 in their tz). The
// frontend captures the real IANA timezone from the browser; 'UTC' is only the
// pre-capture fallback.
export const DEFAULT_SEND_HOUR = 8;
export const DEFAULT_SEND_MINUTE = 0;
export const DEFAULT_TIMEZONE = "UTC";

// ── Timezone-aware scheduling (PURE — Intl only, no I/O, unit-tested) ───────
// The host picks a local send time + we store their IANA timezone *name* (not
// an offset), so DST is handled for free. These two helpers are the whole of
// the "when do we send" decision, kept pure so tests pin the tz math without a
// clock or a DB.

// Wall-clock parts for an instant `date` as seen in IANA `timeZone`. Falls back
// to UTC on a bad/unknown zone rather than throwing (a corrupt pref must never
// wedge the tick). Returns { dateStr 'YYYY-MM-DD', minutesOfDay 0..1439, ... }.
export function zonedParts(date, timeZone) {
  const make = (tz) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
  let fmt;
  try { fmt = make(timeZone || DEFAULT_TIMEZONE); }
  catch { fmt = make("UTC"); }
  const p = Object.fromEntries(fmt.formatToParts(date instanceof Date ? date : new Date(date)).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;        // h23 gives 00..23; guard the rare "24"
  const minute = Number(p.minute);
  return {
    dateStr: `${p.year}-${p.month}-${p.day}`,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
  };
}

// Is a host due for their daily digest right now? True when, in THEIR timezone,
// the local clock is at/past their chosen send time AND no digest has gone out
// for their local calendar day yet.
//
// The "at/past" (rather than "exactly equal") makes the tick self-healing: a
// missed tick simply catches up on the next one. The local-date guard means it
// still can't double-send — once today's digest is stamped, `lastSentAt`'s
// local date equals today's and the gate closes until tomorrow.
export function isDigestDue({ now = new Date(), timezone = DEFAULT_TIMEZONE, sendHour = DEFAULT_SEND_HOUR, sendMinute = DEFAULT_SEND_MINUTE, lastSentAt = null } = {}) {
  const local = zonedParts(now, timezone);
  const sendMins = (Number(sendHour) || 0) * 60 + (Number(sendMinute) || 0);
  if (local.minutesOfDay < sendMins) return false;     // not yet their send time today
  if (!lastSentAt) return true;                         // never sent → due once we pass the slot
  const last = zonedParts(lastSentAt, timezone);
  return last.dateStr < local.dateStr;                  // already sent on this local day?
}

// Normalize a requested send time → { sendHour 0–23, sendMinute snapped to 30 }.
function normalizeSendTime(hour, minute, fallbackHour = DEFAULT_SEND_HOUR, fallbackMinute = DEFAULT_SEND_MINUTE) {
  let h = Number.isInteger(hour) ? hour : (typeof hour === "number" ? Math.floor(hour) : fallbackHour);
  if (!(h >= 0 && h <= 23)) h = fallbackHour;
  let m = typeof minute === "number" ? minute : fallbackMinute;
  m = m >= 45 ? 30 : m >= 15 ? 30 : 0;                  // snap to :00 / :30 (UI granularity)
  // (45+ would round to next hour; we clamp to :30 to keep it within the hour)
  return { sendHour: h, sendMinute: m };
}

// Is a string a usable IANA timezone? Probe via Intl; reject anything it can't
// resolve so we never persist a zone the tick can't read.
function isValidTimezone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; }
  catch { return false; }
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
    sendHour: DEFAULT_SEND_HOUR,
    sendMinute: DEFAULT_SEND_MINUTE,
    timezone: DEFAULT_TIMEZONE,
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
    sendHour:   Number.isInteger(row.send_hour) ? row.send_hour : DEFAULT_SEND_HOUR,
    sendMinute: Number.isInteger(row.send_minute) ? row.send_minute : DEFAULT_SEND_MINUTE,
    timezone:   row.timezone || DEFAULT_TIMEZONE,
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
    .select("enabled, frequency, categories, send_hour, send_minute, timezone, last_sent_at")
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
    .select("enabled, frequency, categories, send_hour, send_minute, timezone, last_sent_at")
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

  // Send time + timezone. Fall back to the existing row, then to the defaults.
  const { sendHour, sendMinute } = normalizeSendTime(
    body.sendHour,
    body.sendMinute,
    Number.isInteger(existing?.send_hour) ? existing.send_hour : DEFAULT_SEND_HOUR,
    Number.isInteger(existing?.send_minute) ? existing.send_minute : DEFAULT_SEND_MINUTE,
  );
  const timezone = isValidTimezone(body.timezone)
    ? body.timezone
    : (existing?.timezone || DEFAULT_TIMEZONE);

  // last_sent_at: usually carried over untouched. But on the off→on transition
  // we may stamp it so the host doesn't get a surprise digest the instant they
  // enable late in their day. Rule: if it's already PAST today's send time in
  // their timezone, mark today as "handled" (first real digest = tomorrow at
  // their time); if it's still BEFORE today's slot, leave it so today's digest
  // lands on schedule. Toggling off→on with an already-set last_sent_at keeps
  // whatever was there.
  let lastSentAt = existing?.last_sent_at || null;
  const turningOn = enabled && !existing?.enabled;
  if (turningOn && !lastSentAt) {
    const local = zonedParts(new Date(), timezone);
    const sendMins = sendHour * 60 + sendMinute;
    if (local.minutesOfDay >= sendMins) lastSentAt = new Date().toISOString();
  }

  const patch = {
    host_id: hostId,
    enabled,
    frequency,
    categories: merged,
    send_hour: sendHour,
    send_minute: sendMinute,
    timezone,
    last_sent_at: lastSentAt,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("host_notification_prefs")
    .upsert(patch, { onConflict: "host_id" });
  if (error) throw error;

  return rowToPrefs(patch, email);
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

  // Idempotency key buckets by host + their LOCAL day so the recurring tick
  // can't double-send the same day's digest even if it fires more than once.
  // Local (not UTC) day keeps it aligned with the host's chosen send time near
  // midnight boundaries. Test sends append a timestamp so they're never deduped
  // against the daily one.
  const dayKey = zonedParts(until, prefs.timezone).dateStr;
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

// The recurring tick body: send each opted-in host their digest at THEIR chosen
// local time, only when there's activity, once per local day. Idempotent + safe
// to run every 15 min. Exported so the scheduler in index.js can call it.
//
// We fetch all enabled hosts (small, opt-in set; partial index covers it) and
// decide due-ness per host with the pure isDigestDue() — so the whole timezone
// schedule is unit-tested without a clock. `now` is injectable for tests.
export async function runDailyDigestTick({ supabaseClient, now = new Date() } = {}) {
  const supabase = supabaseClient || (await import("../supabase.js")).supabase;

  const { data: hosts, error } = await supabase
    .from("host_notification_prefs")
    .select("host_id, last_sent_at, send_hour, send_minute, timezone")
    .eq("enabled", true);
  if (error) {
    console.error("[Digest] Error fetching enabled hosts:", error.message);
    return { sent: 0, skipped: 0, errors: 0 };
  }

  let sent = 0, skipped = 0, errors = 0;
  for (const h of hosts || []) {
    const due = isDigestDue({
      now,
      timezone: h.timezone,
      sendHour: h.send_hour,
      sendMinute: h.send_minute,
      lastSentAt: h.last_sent_at,
    });
    if (!due) continue;
    try {
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const r = await sendHostDigest(h.host_id, { sinceTs: since, untilTs: now, force: false, supabaseClient: supabase });
      // Stamp last_sent_at whether or not there was activity, so a quiet host's
      // slot is consumed for the day and they aren't re-evaluated every tick.
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
