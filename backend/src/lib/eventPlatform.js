// The event platform, the slim one: an event page, a sign-up, a confirmation
// with "add to calendar", one CRM of people across every event, and mail to
// them. Same tables as the old app (events, rsvps, people) so the relationship
// data keeps growing on top of what's there. Pure helpers only — tested in
// tests/event-platform.test.js; the routes do the I/O.

export const EVENT_IMAGE_BUCKET = "event-images";

// New events belong to Felix's host account from the old app.
export const EVENT_HOST_ID = process.env.EVENT_HOST_ID || "f3394b03-c5a0-4e8a-b001-8ae2175c85ff";

// The page's content blocks, as the editor writes them (the old app's
// section types). Anything else is dropped; text is clipped, links must be
// http(s), the hosted-by logo is a small data-URL image.
const SECTION_TYPES = new Set(["title", "location", "datetime", "text", "spotify", "applemusic", "soundcloud", "youtube", "socials", "hostedby"]);
const URL_FIELDS = ["url", "instagram", "spotify", "tiktok", "soundcloud", "website"];
const httpUrl = (v) => (typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim()) ? v.trim().slice(0, 600) : "");
const clipText = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");

export function cleanSections(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const s of input.slice(0, 40)) {
    if (!s || typeof s !== "object" || !SECTION_TYPES.has(s.type)) continue;
    const b = { type: s.type };
    if (s.type === "text") {
      b.title = clipText(s.title, 200);
      b.text = clipText(s.text, 8000);
    } else if (s.type === "hostedby") {
      b.name = clipText(s.name, 120);
      b.email = clipText(s.email, 200);
      b.website = httpUrl(s.website);
      b.logo = typeof s.logo === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/.test(s.logo) && s.logo.length < 300000 ? s.logo : "";
    } else if (s.type !== "title" && s.type !== "location" && s.type !== "datetime") {
      for (const k of URL_FIELDS) if (k in s) b[k] = httpUrl(s[k]);
    }
    out.push(b);
  }
  // The page always has its title, place and time blocks.
  for (const t of ["title", "location", "datetime"]) if (!out.some((b) => b.type === t)) out.unshift({ type: t });
  return out;
}

// Events the old app wrote keep their copy in `sections` (typed blocks) and
// leave `description` empty; new ones write both. Read either.
export function eventText(ev) {
  if (ev.description && ev.description.trim()) return ev.description.trim();
  const blocks = Array.isArray(ev.sections) ? ev.sections : [];
  return blocks
    .filter((b) => b && b.type === "text" && b.text)
    .map((b) => [b.title, b.text].filter(Boolean).join("\n"))
    .join("\n\n")
    .trim();
}

// Images are storage paths in the event-images bucket (or, rarely, full URLs).
export function imageUrl(pathOrUrl, supabaseUrl) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${supabaseUrl}/storage/v1/object/public/${EVENT_IMAGE_BUCKET}/${pathOrUrl.replace(/^\/+/, "")}`;
}

// "Release party" → "release-party-k3x9", like the old app's slugs.
export function makeSlug(title, rand = Math.random) {
  const base = String(title || "event")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "event";
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += chars[Math.floor(rand() * chars.length)];
  return `${base}-${tail}`;
}

// The default blocks for a new event (the old editor's shape).
export function sectionsFor(description) {
  return [
    { type: "title" },
    { type: "location" },
    { type: "datetime" },
    ...(description ? [{ type: "text", title: "", text: description }] : []),
  ];
}

// "lördag 7 november 2026, 19:00" in the event's own time zone.
export function formatWhen(ev, locale = "sv-SE") {
  const tz = ev.timezone || "Europe/Stockholm";
  const day = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(ev.starts_at));
  const time = (d) => new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(d));
  return `${day}, ${time(ev.starts_at)}${ev.ends_at ? `–${time(ev.ends_at)}` : ""}`;
}

export const isOpenForSignup = (ev, now = Date.now()) =>
  ev.status === "PUBLISHED" && new Date(ev.ends_at || ev.starts_at).getTime() > now;

// One CRM row per person: who they are, how they found us, every event they
// signed up to, how many they actually came to. Pulled up = rsvps.pulled_up
// or a row in `pullups` (the old app wrote both; see the pull-up signal note).
export function summarizePeople({ people, rsvps, events, pullups = [] }) {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const came = new Set(pullups.map((p) => `${p.event_id}:${p.person_id}`));
  const byPerson = new Map();
  for (const r of rsvps) {
    if (!r.person_id || r.status === "cancelled") continue;
    const ev = eventById.get(r.event_id);
    if (!ev) continue;
    if (!byPerson.has(r.person_id)) byPerson.set(r.person_id, []);
    byPerson.get(r.person_id).push({
      eventId: ev.id,
      title: ev.title,
      startsAt: ev.starts_at,
      status: r.status,
      pulledUp: !!r.pulled_up || came.has(`${ev.id}:${r.person_id}`),
      signedUpAt: r.created_at,
    });
  }
  return people
    .filter((p) => !p.anonymized_at)
    .map((p) => {
      const evs = (byPerson.get(p.id) || []).sort((a, b) => (b.startsAt || "").localeCompare(a.startsAt || ""));
      return {
        id: p.id,
        name: p.name || "",
        email: p.email || "",
        phone: p.phone_e164 || p.phone || "",
        instagram: p.instagram || "",
        createdAt: p.created_at,
        source: p.acquisition_channel || p.import_source || (evs.length ? "event" : ""),
        consent: !!p.marketing_consent && !p.marketing_unsubscribed_at && !p.do_not_contact,
        // Can be mailed at all (an address, not unsubscribed, not blocked).
        contactable: !!p.email && !p.marketing_unsubscribed_at && !p.do_not_contact,
        events: evs.length,
        attended: evs.filter((e) => e.pulledUp).length,
        lastEventAt: evs[0]?.startsAt || null,
        lastEventTitle: evs[0]?.title || null,
        eventIds: evs.map((e) => e.eventId),
        cameIds: evs.filter((e) => e.pulledUp).map((e) => e.eventId),
      };
    })
    // People who came to events first (latest event first), then everyone
    // else (imports, lists) newest first.
    .sort((a, b) => (!!b.lastEventAt - !!a.lastEventAt) || (b.lastEventAt || b.createdAt || "").localeCompare(a.lastEventAt || a.createdAt || ""));
}

// Who a send goes to. Never: no address, anonymized, do-not-contact, or
// unsubscribed. "event" = everyone signed up to that event (they asked to come
// — mail about it is part of the event); "consent" = everyone who said yes to
// hearing about future events; "crm" = the mail module's segment: people
// signed up to any of `eventIds` (or who `came` to them), optionally narrowed
// to those who want invitations and by a `search`. Without events it is
// always consent-only — a list of strangers to the event needs their yes.
export function pickAudience({ audience, people, rsvps, pullups = [] }) {
  const ok = (p) => p && p.email && !p.anonymized_at && !p.do_not_contact && !p.marketing_unsubscribed_at;
  const seen = new Set();
  const out = [];
  const add = (p, basis) => {
    const key = p.email.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ personId: p.id, email: key, name: p.name || "", basis });
  };
  if (audience?.type === "event") {
    const byId = new Map(people.map((p) => [p.id, p]));
    for (const r of rsvps) {
      if (r.event_id !== audience.eventId || r.status === "cancelled") continue;
      if (audience.status && r.status !== audience.status) continue;
      const p = byId.get(r.person_id);
      if (ok(p)) add(p, "event_guest");
    }
  } else if (audience?.type === "consent") {
    for (const p of people) if (ok(p) && p.marketing_consent) add(p, "consent");
  } else if (audience?.type === "crm") {
    const eventIds = new Set(Array.isArray(audience.eventIds) ? audience.eventIds : []);
    const consentOnly = !!audience.consentOnly || eventIds.size === 0;
    const needle = String(audience.search || "").trim().toLowerCase();
    const came = new Set(pullups.map((p) => `${p.event_id}:${p.person_id}`));
    const signed = new Map(); // person → { any, came } within the chosen events (all events if none)
    for (const r of rsvps) {
      if (r.status === "cancelled" || (eventIds.size && !eventIds.has(r.event_id))) continue;
      const s = signed.get(r.person_id) || { any: false, came: false };
      s.any = true;
      if (r.pulled_up || came.has(`${r.event_id}:${r.person_id}`)) s.came = true;
      signed.set(r.person_id, s);
    }
    for (const p of people) {
      if (!ok(p)) continue;
      if (consentOnly && !p.marketing_consent) continue;
      const s = signed.get(p.id);
      if (eventIds.size && !s?.any) continue;
      if (audience.came && !s?.came) continue;
      if (needle && !`${p.name || ""} ${p.email}`.toLowerCase().includes(needle)) continue;
      add(p, consentOnly ? "consent" : "event_guest");
    }
  }
  return out;
}

// What a sign-up does to the person row: new people are created; known ones
// keep their name unless they had none, and a yes to future events turns
// consent on (a no never turns an earlier yes off).
export function personPatch(existing, { name, consent, now = new Date().toISOString() }) {
  const patch = {};
  if (!existing?.name && name) patch.name = name;
  if (consent && !existing?.marketing_consent) {
    patch.marketing_consent = true;
    patch.marketing_consent_at = now;
  }
  if (consent && existing?.marketing_unsubscribed_at) patch.marketing_unsubscribed_at = null;
  return patch;
}
