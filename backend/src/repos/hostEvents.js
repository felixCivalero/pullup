// The event platform, per organiser. Every function takes the caller
// (middleware/requireUser.js) and only ever touches that organiser's events,
// guests and people — the owner (platform admin) sees all events, as before.
// An organiser works in one brand at a time (lib/brands.js): the list, the
// CRM and the mail are that brand's; an event can be opened from any of the
// caller's brands. A brand can be the caller's own, one they're a member of
// (the brand's account is then whose events these are: brand.hostId), or one
// they co-host single events in (only those events).
// The site's routes (routes/adminEvents.js) and the agent actions
// (actions/*.js) both call these, so a person and their assistant can do
// exactly the same things, with the same rules.
import crypto from "crypto";
import { supabase } from "../supabase.js";
import { sendEmail } from "../email/index.js";
import { selectAllPaged } from "../lib/selectAllPaged.js";
import { ActionError } from "../lib/actionError.js";
import { cleanSections, eventText, imageUrl, makeSlug, sectionsFor, summarizePeople, pickAudience } from "../lib/eventPlatform.js";
import { broadcastEmail } from "../lib/eventEmails.js";
import { creditBalance, refundCredits, reserveCredits } from "../lib/emailCredits.js";
import { renderFollowUpEmailTemplate, renderTemplateSubject, renderTemplateText } from "../services/followUpTemplateService.js";
import { ensureHostProfile } from "../middleware/requireUser.js";
import { brandNames, brandScope, brandShape, currentBrand, isTeam, listBrands, payerFor } from "../lib/brands.js";
import { apiBase, eventUrl } from "../lib/urls.js";
import { brandStats, eventStats } from "../lib/eventStats.js";
import { FORM_COLUMNS, answersByLabel, formOf, formPatch } from "../lib/eventForm.js";

export const EVENT_COLUMNS =
  "id, host_id, brand_id, slug, title, description, sections, location, starts_at, ends_at, timezone, image_url, cover_image_url, total_capacity, status, kind, created_at, " +
  "media_settings, title_settings, hide_location, hide_date, reveal_hint, date_reveal_hint, signup_settings, show_coordinates, location_lat, location_lng, " + FORM_COLUMNS;
const PEOPLE_COLUMNS =
  "id, name, email, phone, phone_e164, instagram, created_at, acquisition_channel, import_source, marketing_consent, marketing_unsubscribed_at, do_not_contact, anonymized_at, marketing_unsubscribe_token";
const RSVP_COLUMNS = "id, event_id, person_id, status, pulled_up, created_at, marketing_opt_in, visitor_id, plus_ones, party_size, custom_answers";

const ofKindEvent = (q) => q.or("kind.is.null,kind.eq.event");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A brand's events as the caller may see them: the whole brand for its team,
// only the shared ones for an event co-host.
const inBrandStrict = (caller, brandId) => ({ ...caller, requestedBrand: String(brandId).slice(0, 100), _brandScope: null });

export function inBrandEvents(query, brand) {
  const q = query.eq("host_id", brand.hostId).eq("brand_id", brand.id);
  return brand.role === "event" ? q.in("id", brand.eventIds.length ? brand.eventIds : ["00000000-0000-0000-0000-000000000000"]) : q;
}

// `.in()` with a long list overflows the URL; read it 200 ids at a time.
// …and page each slice, so a slice with more than 1000 rows (an event's
// sign-ups, a brand's contacts) is read whole. `key` orders the pages.
async function selectIn(table, columns, column, ids, key = "id") {
  const out = [];
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const slice = unique.slice(i, i + 200);
    out.push(...(await selectAllPaged(() => supabase.from(table).select(columns).in(column, slice).order(key, { ascending: true }))));
  }
  return out;
}

// Everything a caller can see, loaded once: their events, the sign-ups to
// them, the people behind those sign-ups and who actually came. For an
// organiser, "said yes to hearing more" means yes to *them* — the opt-in on a
// sign-up to one of their events — never someone else's list.
export async function loadWorld(caller) {
  if (caller.isOwner) {
    const [events, rsvps, people, pullups] = await Promise.all([
      selectAllPaged(() => ofKindEvent(supabase.from("events").select(EVENT_COLUMNS)).order("starts_at", { ascending: false })),
      selectAllPaged(() => supabase.from("rsvps").select(RSVP_COLUMNS).order("created_at", { ascending: true })),
      selectAllPaged(() => supabase.from("people").select(PEOPLE_COLUMNS).order("created_at", { ascending: true })),
      selectAllPaged(() => supabase.from("pullups").select("event_id, person_id")),
    ]);
    return { events, rsvps, people, pullups };
  }
  const { brands, brand } = await brandScope(caller);
  if (!brand) return { events: [], rsvps: [], people: [], pullups: [] };
  // A main brand (an umbrella) holds the CRM of every brand under it: one
  // list, each person saying which brands they said yes to.
  const under = brandsUnder(brands, brand);
  const events = await selectAllPaged(() => {
    const q = ofKindEvent(supabase.from("events").select(EVENT_COLUMNS));
    const scoped = under.length ? q.eq("host_id", brand.hostId).in("brand_id", [brand.id, ...under.map((b) => b.id)]) : inBrandEvents(q, brand);
    return scoped.order("starts_at", { ascending: false });
  });
  const ids = events.map((e) => e.id);
  const [rsvps, pullups] = await Promise.all([
    selectIn("rsvps", RSVP_COLUMNS, "event_id", ids),
    selectIn("pullups", "id, event_id, person_id", "event_id", ids),
  ]);
  rsvps.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  // Consent is per brand: a yes on a sign-up to one of the brand's events,
  // or a yes brought in with the brand's own contacts (an import, mig 157).
  const brandOf = new Map(events.map((e) => [e.id, e.brand_id]));
  const consentBrands = new Map();
  const yes = (personId, brandId) => {
    const set = consentBrands.get(personId) || new Set();
    set.add(brandId);
    consentBrands.set(personId, set);
  };
  for (const r of rsvps) {
    if (!r.marketing_opt_in || r.status === "cancelled") continue;
    yes(r.person_id, brandOf.get(r.event_id) || brand.id);
  }
  // A co-host of single events sees their guests only, not the brand's list.
  const contacts = brand.role === "event" ? [] : await selectIn("brand_contacts", "brand_id, person_id, consent", "brand_id", [brand.id, ...under.map((b) => b.id)], "person_id");
  const contactBrands = new Map();
  for (const c of contacts) {
    if (c.consent) yes(c.person_id, c.brand_id);
    contactBrands.set(c.person_id, [...(contactBrands.get(c.person_id) || []), c.brand_id]);
  }
  const people = (await selectIn("people", PEOPLE_COLUMNS, "id", [...rsvps.map((r) => r.person_id), ...contacts.map((c) => c.person_id)]))
    .map((p) => ({ ...p, marketing_consent: consentBrands.has(p.id), consent_brands: [...(consentBrands.get(p.id) || [])], contact_brands: contactBrands.get(p.id) || [] }))
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  return { events, rsvps, people, pullups, umbrella: under.length > 0 };
}

const loadSuppressed = async () =>
  new Set((await selectAllPaged(() => supabase.from("email_suppressions").select("email"))).map((r) => r.email.trim().toLowerCase()));

export function eventShape(ev, caller, counts = {}, brands = new Map()) {
  return {
    id: ev.id,
    slug: ev.slug,
    title: ev.title,
    text: eventText(ev),
    location: ev.location,
    startsAt: ev.starts_at,
    endsAt: ev.ends_at,
    timezone: ev.timezone || "Europe/Stockholm",
    imagePath: ev.cover_image_url || ev.image_url || null,
    imageUrl: imageUrl(ev.cover_image_url || ev.image_url, process.env.SUPABASE_URL),
    capacity: ev.total_capacity,
    status: ev.status,
    // Can be edited here: anything an organiser sees is theirs to work on;
    // the owner sees everyone's but edits his own.
    mine: !caller.isOwner || ev.host_id === caller.hostId,
    brandId: ev.brand_id || null,
    host: brands.get(ev.brand_id) || null,
    url: eventUrl(ev.slug),
    attending: counts.attending || 0,
    waitlist: counts.waitlist || 0,
    pulledUp: counts.pulledUp || 0,
    // The page's design (the editor reads and writes these).
    sections: Array.isArray(ev.sections) ? ev.sections : [],
    mediaSettings: ev.media_settings || {},
    titleSettings: ev.title_settings || {},
    hideLocation: !!ev.hide_location,
    hideDate: !!ev.hide_date,
    revealHint: ev.reveal_hint || "",
    dateRevealHint: ev.date_reveal_hint || "",
    signupSettings: ev.signup_settings || {},
    form: formOf(ev),
    showCoordinates: !!ev.show_coordinates,
    locationLat: ev.location_lat == null ? null : Number(ev.location_lat),
    locationLng: ev.location_lng == null ? null : Number(ev.location_lng),
  };
}

// Only these can be set; everything else on the row stays as it is.
export function eventPatch(body) {
  const patch = {};
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 160);
  if (typeof body.text === "string") {
    patch.description = body.text.trim().slice(0, 8000);
    patch.sections = sectionsFor(patch.description);
  }
  if (typeof body.location === "string") patch.location = body.location.trim().slice(0, 300);
  // The place picked for it (routes/places.js): coordinates for the map, or
  // null when the address was typed without picking one.
  for (const [k, col, max] of [["locationLat", "location_lat", 90], ["locationLng", "location_lng", 180]]) {
    if (body[k] === null) patch[col] = null;
    else if (Number.isFinite(body[k]) && Math.abs(body[k]) <= max) patch[col] = body[k];
  }
  if (body.placeId === null || typeof body.placeId === "string") patch.location_place_id = body.placeId ? body.placeId.slice(0, 300) : null;
  for (const [k, col] of [["startsAt", "starts_at"], ["endsAt", "ends_at"]]) {
    if (body[k] === null || body[k] === "") patch[col] = null;
    else if (typeof body[k] === "string" && !Number.isNaN(Date.parse(body[k]))) patch[col] = new Date(body[k]).toISOString();
  }
  if (typeof body.timezone === "string" && body.timezone) patch.timezone = body.timezone.slice(0, 64);
  if (body.capacity === null || body.capacity === "") patch.total_capacity = null;
  else if (Number.isInteger(Number(body.capacity)) && Number(body.capacity) > 0) patch.total_capacity = Number(body.capacity);
  if (typeof body.imagePath === "string" || body.imagePath === null) {
    patch.image_url = body.imagePath || null;
    patch.cover_image_url = body.imagePath || null;
  }
  if (body.status === "PUBLISHED" || body.status === "DRAFT") patch.status = body.status;
  // The design, from the editor. A sections write also refreshes the plain
  // description (mails, the CRM and share previews read that).
  if (Array.isArray(body.sections)) {
    patch.sections = cleanSections(body.sections);
    if (typeof body.text !== "string") patch.description = eventText({ description: "", sections: patch.sections }).slice(0, 8000);
  }
  if (body.mediaSettings && typeof body.mediaSettings === "object" && JSON.stringify(body.mediaSettings).length < 4000) patch.media_settings = body.mediaSettings;
  if (body.titleSettings && typeof body.titleSettings === "object" && JSON.stringify(body.titleSettings).length < 2000) patch.title_settings = body.titleSettings;
  // The sign-up's fields and questions (lib/eventForm.js).
  Object.assign(patch, formPatch(body.form));
  if (body.signupSettings && typeof body.signupSettings === "object") {
    const s = body.signupSettings;
    patch.signup_settings = { hidden: !!s.hidden, label: typeof s.label === "string" ? s.label.slice(0, 80) : "", cta: typeof s.cta === "string" ? s.cta.slice(0, 40) : "" };
  }
  for (const [k, col] of [["hideLocation", "hide_location"], ["hideDate", "hide_date"], ["showCoordinates", "show_coordinates"]]) {
    if (typeof body[k] === "boolean") patch[col] = body[k];
  }
  for (const [k, col] of [["revealHint", "reveal_hint"], ["dateRevealHint", "date_reveal_hint"]]) {
    if (typeof body[k] === "string") patch[col] = body[k].slice(0, 80);
  }
  return patch;
}

function countsByEvent(rsvps) {
  const counts = new Map();
  for (const r of rsvps) {
    const c = counts.get(r.event_id) || { attending: 0, waitlist: 0, pulledUp: 0 };
    // Heads: a sign-up counts with the guests it brings.
    const n = Math.max(1, Number(r.party_size) || 1);
    if (r.status === "attending") c.attending += n;
    if (r.status === "waitlist") c.waitlist += n;
    if (r.pulled_up) c.pulledUp += n;
    counts.set(r.event_id, c);
  }
  return counts;
}

// Whether the caller may work on an event: the owner any, the brand's team
// all of the brand's, a co-host the events shared with them. → the brand it's
// reached through (null for the owner), or undefined: no access.
async function accessTo(caller, ev) {
  if (caller.isOwner) return null;
  const { brands } = await brandScope(caller);
  const brand = brands.find((b) => b.id === ev.brand_id && b.hostId === ev.host_id);
  if (brand && (isTeam(brand) || brand.eventIds.includes(ev.id))) return brand;
  // An event of the caller's own account that has no brand (none should).
  if (!ev.brand_id && ev.host_id === caller.hostId) return null;
  return undefined;
}

// The event row, if the caller may work on it. Anything else is "not found"
// — never "not yours".
export async function eventFor(caller, id) {
  if (!UUID.test(String(id || ""))) throw new ActionError("not_found", "No event with that id.");
  const { data: ev, error } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!ev || (ev.kind && ev.kind !== "event") || (await accessTo(caller, ev)) === undefined) {
    throw new ActionError("not_found", "No event with that id.");
  }
  return ev;
}

// The brand an event is worked on through, for checks on what the caller may
// do with it (invite, mail): { role, ... } or null for the owner.
export async function eventBrand(caller, ev) {
  return (await accessTo(caller, ev)) ?? null;
}

// The brands under a main brand (migrations/155) that the caller works in
// with it: a main brand's list shows their events too.
export function brandsUnder(brands, brand) {
  if (!brand || !isTeam(brand) || brand.parent_id) return [];
  return brands.filter((b) => b.parent_id === brand.id && b.hostId === brand.hostId && isTeam(b));
}

// A main brand with brands under it is the admin of them: it sees all their
// events and their whole CRM, but events are made in, and mail goes out from,
// the brands themselves (a guest's yes was to that brand).
async function umbrellaOf(caller) {
  if (caller.isOwner) return null;
  const { brands, brand } = await brandScope(caller);
  return brandsUnder(brands, brand).length ? brand : null;
}

export async function listEvents(caller) {
  const { brands, brand } = caller.isOwner ? {} : await brandScope(caller);
  if (!caller.isOwner && !brand) return [];
  const query = () => ofKindEvent(supabase.from("events").select(EVENT_COLUMNS)).order("starts_at", { ascending: false });
  // A main brand sees its own events and those of the brands under it, each
  // saying whose it is.
  const under = caller.isOwner ? [] : brandsUnder(brands, brand);
  const umbrella = under.length
    ? () => query().eq("host_id", brand.hostId).in("brand_id", [brand.id, ...under.map((b) => b.id)])
    : null;
  const events = await selectAllPaged(() => (caller.isOwner ? query() : umbrella ? umbrella() : inBrandEvents(query(), brand)));
  const rsvps = caller.isOwner
    ? await selectAllPaged(() => supabase.from("rsvps").select(RSVP_COLUMNS).order("created_at", { ascending: true }))
    : await selectIn("rsvps", RSVP_COLUMNS, "event_id", events.map((e) => e.id));
  // The owner sees everyone's events: each one says whose brand it is.
  const names = caller.isOwner
    ? await brandNames(events.map((e) => e.brand_id))
    : new Map(under.length ? [brand, ...under].map((b) => [b.id, b.name]) : []);
  const counts = countsByEvent(rsvps);
  return events.map((e) => eventShape(e, caller, counts.get(e.id), names));
}

export async function createEvent(caller, body) {
  const patch = eventPatch(body || {});
  if (!patch.title) throw new ActionError("invalid", "The event needs a title.", { detail: "title" });
  if (!patch.starts_at) throw new ActionError("invalid", "The event needs a start time.", { detail: "startsAt" });
  if (patch.ends_at && patch.ends_at <= patch.starts_at) throw new ActionError("invalid", "The end time must be after the start time.", { detail: "endsAt" });
  // The brand it's for: the one asked for (a main brand making an event for
  // a brand under it), else the one the caller works in.
  const brand = await currentBrand(body?.brandId ? inBrandStrict(caller, body.brandId) : caller);
  if (body?.brandId && brand.id !== body.brandId && brand.name.toLowerCase() !== String(body.brandId).toLowerCase()) {
    throw new ActionError("not_found", "No brand of yours with that id.", { detail: "brand" });
  }
  if (!isTeam(brand)) throw new ActionError("forbidden", `You co-host single events in ${brand.name}; new events there are made by its team.`, { detail: "cohost" });
  const scoped = body?.brandId ? inBrandStrict(caller, brand.id) : caller;
  if (await umbrellaOf(scoped)) {
    throw new ActionError("invalid", `${brand.name} is the main brand over other brands: make the event in one of them (brand: their name or id).`, { detail: "umbrella" });
  }
  if (!caller.isOwner && brand.hostId === caller.hostId) await ensureHostProfile(caller.hostId);
  const row = {
    host_id: brand.hostId,
    brand_id: brand.id,
    slug: makeSlug(patch.title),
    kind: "event",
    visibility: "public",
    status: "DRAFT",
    timezone: "Europe/Stockholm",
    created_via: caller.via === "agent" ? "agent" : "create",
    require_email: true,
    collect_phone: false,
    collect_instagram: false,
    sections: sectionsFor(patch.description || ""),
    ...patch,
  };
  const { data, error } = await supabase.from("events").insert(row).select(EVENT_COLUMNS).single();
  if (error) throw error;
  return eventShape(data, caller);
}

export async function updateEvent(caller, id, body) {
  const ev = await eventFor(caller, id);
  const patch = eventPatch(body || {});
  if ("title" in patch && !patch.title) throw new ActionError("invalid", "The title can't be empty.", { detail: "title" });
  if (!Object.keys(patch).length) throw new ActionError("invalid", "Nothing to change.", { detail: "empty" });
  const starts = patch.starts_at ?? ev.starts_at;
  const ends = "ends_at" in patch ? patch.ends_at : ev.ends_at;
  if (ends && starts && ends <= starts) throw new ActionError("invalid", "The end time must be after the start time.", { detail: "endsAt" });
  const { data, error } = await supabase.from("events").update(patch).eq("id", ev.id).select(EVENT_COLUMNS).single();
  if (error) throw error;
  return eventShape(data, caller);
}

// Move an event to another of the account's brands (an event made on a main
// brand before it had brands under it, or simply in the wrong brand). Its
// guests and their yes go with it: they signed up to that event. Only within
// one account, only by its team, never onto a main brand over other brands.
export async function moveEvent(caller, id, brandRef) {
  const ev = await eventFor(caller, id);
  if (caller.isOwner && ev.host_id !== caller.hostId) throw new ActionError("forbidden", "Only the organiser can move this event.");
  const { brands } = await brandScope(caller);
  const want = String(brandRef || "").trim();
  const to = brands.find((b) => b.id === want) || brands.find((b) => b.name.toLowerCase() === want.toLowerCase());
  if (!to) throw new ActionError("not_found", "No brand of yours with that id or name.", { detail: "brand" });
  const from = brands.find((b) => b.id === ev.brand_id);
  if (!isTeam(to) || (from && !isTeam(from))) throw new ActionError("forbidden", "Events are moved by the brands' team.", { detail: "team" });
  if (to.hostId !== ev.host_id) throw new ActionError("invalid", "An event moves between brands of the same account only.", { detail: "account" });
  if (brandsUnder(brands, to).length) throw new ActionError("invalid", `${to.name} is the main brand over other brands and holds no events of its own: move it to one of them.`, { detail: "umbrella" });
  if (to.id === ev.brand_id) return eventShape(ev, caller);
  const { data, error } = await supabase.from("events").update({ brand_id: to.id }).eq("id", ev.id).select(EVENT_COLUMNS).single();
  if (error) throw error;
  return eventShape(data, caller, {}, new Map([[to.id, to.name]]));
}

// One event with its guest list.
export async function eventWithGuests(caller, id) {
  const ev = await eventFor(caller, id);
  const rsvps = await selectAllPaged(() =>
    supabase.from("rsvps").select(RSVP_COLUMNS).eq("event_id", ev.id).order("created_at", { ascending: true }),
  );
  const byId = new Map((await selectIn("people", PEOPLE_COLUMNS, "id", rsvps.map((r) => r.person_id))).map((p) => [p.id, p]));
  const guests = rsvps.map((r) => {
    const p = byId.get(r.person_id) || {};
    return {
      rsvpId: r.id,
      personId: r.person_id,
      name: p.anonymized_at ? "(anonymiserad)" : p.name || "",
      email: p.anonymized_at ? "" : p.email || "",
      status: r.status,
      pulledUp: !!r.pulled_up,
      signedUpAt: r.created_at,
      // Wants to hear about future events: the owner's list is PullUp-wide
      // consent, an organiser's is the yes given on a sign-up to them.
      consent: !!(caller.isOwner ? p.marketing_consent : r.marketing_opt_in) && !p.marketing_unsubscribed_at && !p.do_not_contact,
      // What the sign-up asked for (lib/eventForm.js): contact, guests
      // brought along, the answers by question id (labels: event.form).
      phone: p.anonymized_at ? "" : p.phone_e164 || p.phone || "",
      instagram: p.anonymized_at ? "" : p.instagram || "",
      plusOnes: Number(r.plus_ones) || 0,
      party: Math.max(1, Number(r.party_size) || 1),
      answers: p.anonymized_at ? {} : r.custom_answers || {},
    };
  });
  const counts = { attending: 0, waitlist: 0, pulledUp: 0 };
  for (const g of guests) {
    if (g.status === "attending") counts.attending += g.party;
    if (g.status === "waitlist") counts.waitlist += g.party;
    if (g.pulledUp) counts.pulledUp += g.party;
  }
  return { event: eventShape(ev, caller, counts), guests };
}

// Move a guest between attending / waitlist / cancelled, or mark them as came.
export async function updateGuest(caller, rsvpId, { status, pulledUp } = {}) {
  if (!UUID.test(String(rsvpId || ""))) throw new ActionError("not_found", "No guest with that id.");
  const patch = {};
  if (["attending", "waitlist", "cancelled"].includes(status)) {
    patch.status = status;
    patch.booking_status = { attending: "CONFIRMED", waitlist: "WAITLIST", cancelled: "CANCELLED" }[status];
  }
  if (typeof pulledUp === "boolean") patch.pulled_up = pulledUp;
  if (!Object.keys(patch).length) throw new ActionError("invalid", "Nothing to change.", { detail: "empty" });
  const { data: rsvp, error } = await supabase.from("rsvps").select("id, event_id").eq("id", rsvpId).maybeSingle();
  if (error) throw error;
  if (!rsvp) throw new ActionError("not_found", "No guest with that id.");
  try {
    await eventFor(caller, rsvp.event_id);
  } catch {
    throw new ActionError("not_found", "No guest with that id.");
  }
  const { data, error: upErr } = await supabase.from("rsvps").update(patch).eq("id", rsvp.id).select("id, status, pulled_up").single();
  if (upErr) throw upErr;
  return data;
}

// The CRM: everyone who signed up to the caller's events.
export async function listPeople(caller) {
  const world = await loadWorld(caller);
  return {
    // Answers carry their question's label, so the CRM and its export read them.
    people: summarizePeople(world).map((p) => ({
      ...p,
      answers: p.answers.map((a) => ({ eventId: a.eventId, answers: answersByLabel(formOf(world.events.find((e) => e.id === a.eventId) || {}), a.answers) })),
    })),
    events: world.events.map((e) => ({ id: e.id, title: e.title, startsAt: e.starts_at, mine: e.host_id === caller.hostId, brandId: e.brand_id || null })),
  };
}

// An audience only ever reaches the caller's own events' guests.
function checkAudienceEvents(world, audience) {
  const own = new Set(world.events.map((e) => e.id));
  const ids = audience?.type === "event" ? [audience.eventId] : audience?.type === "crm" ? audience.eventIds || [] : [];
  for (const id of ids) if (!own.has(id)) throw new ActionError("not_found", "No event with that id.", { detail: "eventId" });
}

// A mail to one event's guests is that event's brand's mail, whichever brand
// the page had picked: the audience, the sender name and the log follow it.
async function sendScope(caller, audience) {
  if (caller.isOwner || audience?.type !== "event") return caller;
  const ev = await eventFor(caller, audience.eventId);
  return ev.brand_id ? { ...caller, requestedBrand: ev.brand_id, _brandScope: null } : caller;
}

async function noUmbrellaMail(caller) {
  const main = await umbrellaOf(caller);
  if (main) {
    throw new ActionError("forbidden", `${main.name} is the main brand: mail goes out from each brand under it, to the people who said yes to that brand. An event that sits on ${main.name} itself: move it to one of its brands first (move_event).`, { detail: "umbrella" });
  }
}

export async function previewSend(callerIn, audience) {
  const caller = await sendScope(callerIn, audience);
  await noUmbrellaMail(caller);
  const [world, suppressed, { brand }] = await Promise.all([loadWorld(caller), loadSuppressed(), brandScope(caller)]);
  checkAudienceEvents(world, audience);
  const recipients = pickAudience({ audience, ...world }).filter((r) => !suppressed.has(r.email));
  return { count: recipients.length, sample: recipients.slice(0, 5).map((r) => r.name || r.email), brand: brand ? brandShape(brand) : null };
}

// A send runs after the answer: 100 mails at a time, ~600 ms apart (under
// Resend's rate limit). Each mail is logged in email_outbox under one
// campaign_tag and the host. `compose(recipient, unsubscribeUrl)` builds it.
async function deliver({ recipients, subject, compose, logBody, from: fromOverride, tag, hostId, brandId = null, sentBy = null }) {
  const unsub = new Map();
  for (const r of recipients.filter((x) => x.personId && !x.token)) {
    const token = crypto.randomBytes(18).toString("base64url");
    const { error } = await supabase.from("people").update({ marketing_unsubscribe_token: token }).eq("id", r.personId);
    if (!error) unsub.set(r.personId, token);
  }
  const from = fromOverride || process.env.EVENT_FROM_EMAIL || '"PullUp" <no-reply@pullup.se>';
  const replyTo = process.env.EVENT_REPLY_TO || "felix@pullup.se";
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100);
    const rows = [];
    await Promise.all(chunk.map(async (r) => {
      const token = r.token || unsub.get(r.personId);
      const unsubscribeUrl = token ? `${apiBase()}/unsubscribe/${token}` : `${apiBase()}/unsubscribe/none`;
      const mail = compose(r, unsubscribeUrl);
      try {
        const out = await sendEmail({
          from,
          to: r.email,
          ...mail,
          replyTo: r.replyTo || replyTo,
          headers: token ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : null,
        });
        sent += 1;
        rows.push({ to_email: r.email, person_id: r.personId, subject: mail.subject, status: "sent", provider_message_id: out?.messageId || null, legal_basis: r.basis });
      } catch (err) {
        failed += 1;
        rows.push({ to_email: r.email, person_id: r.personId, subject: mail.subject, status: "failed", last_error_message: String(err?.message || "").slice(0, 300), legal_basis: r.basis });
      }
    }));
    const now = new Date().toISOString();
    await supabase.from("email_outbox").insert(rows.map((row) => ({
      provider: "resend",
      from_email: from,
      subject,
      ...row,
      text_body: logBody,
      attempts: 1,
      category: "event_broadcast",
      campaign_tag: tag,
      host_id: hostId,
      brand_id: brandId,
      sent_by: sentBy,
      created_at: now,
      updated_at: now,
    }))).then(({ error }) => error && console.error("[events] outbox log failed:", error.message));
    if (i + 100 < recipients.length) await new Promise((r) => setTimeout(r, 600));
  }
  console.log(`[events] send ${tag}: ${sent} sent, ${failed} failed`);
  return { sent, failed };
}

// Mail to a list. Paid: one send per recipient, taken before anything goes
// out; mails the provider refuses come back to the balance. `test` sends one
// copy to the caller only, free. Two kinds of mail: a plain message (`body`)
// or the mail module's blocks (`blocks` + previewText + fromName).
export async function sendMail(callerIn, input) {
  const caller = await sendScope(callerIn, input?.audience);
  await noUmbrellaMail(caller);
  const { brand: sendBrand } = await brandScope(caller);
  if (!caller.isOwner && sendBrand && !isTeam(sendBrand)) {
    throw new ActionError("forbidden", `Mail to ${sendBrand.name}'s guests goes out from its team. Ask them to send it.`, { detail: "cohost" });
  }
  const brandId = sendBrand?.id || null;
  const payer = await payerFor(caller);
  const { audience, subject, body, blocks, previewText, fromName, eventId, test } = input || {};
  const cleanSubject = typeof subject === "string" ? subject.trim().slice(0, 200) : "";
  const cleanBody = typeof body === "string" ? body.trim().slice(0, 20000) : "";
  const cleanBlocks = Array.isArray(blocks) ? blocks.slice(0, 60) : null;
  if (!cleanSubject || (!cleanBody && !cleanBlocks?.length)) throw new ActionError("invalid", "A mail needs a subject and a message.", { detail: "subject_body" });
  if (cleanBlocks && JSON.stringify(cleanBlocks).length > 200000) throw new ActionError("invalid", "The mail is too large.", { detail: "too_large" });
  const event = eventId ? await eventFor(caller, eventId) : null;
  const tokenEvent = event ? { title: event.title, startsAt: event.starts_at } : null;
  // The sender's name: an organiser's mail always comes from the brand it's
  // sent in (no free-typed names, so nobody can send as someone else); the
  // owner can still name it.
  const name = caller.isOwner
    ? (typeof fromName === "string" ? fromName.replace(/["<>\\\r\n]/g, "").trim().slice(0, 60) : "")
    : (await currentBrand(caller)).name.replace(/["<>\\\r\n]/g, "").slice(0, 60);
  const from = name ? `"${name}" <no-reply@pullup.se>` : undefined;
  const templateContent = cleanBlocks ? { blocks: cleanBlocks, previewText: typeof previewText === "string" ? previewText.slice(0, 200) : "" } : null;
  const compose = templateContent
    ? (r, unsubscribeUrl) => {
        const person = { name: r.name };
        return {
          subject: renderTemplateSubject(r.basis === "test" ? `[Test] ${cleanSubject}` : cleanSubject, { person, event: tokenEvent }),
          html: renderFollowUpEmailTemplate({ templateContent, person, event: tokenEvent, unsubscribeUrl }),
          text: renderTemplateText({ templateContent, person, event: tokenEvent, unsubscribeUrl }),
        };
      }
    : (r, unsubscribeUrl) => broadcastEmail({
        subject: r.basis === "test" ? `[Test] ${cleanSubject}` : cleanSubject,
        body: cleanBody,
        unsubscribeUrl,
        event,
        eventUrl: event ? eventUrl(event.slug) : null,
      });
  const logBody = cleanBody || renderTemplateText({ templateContent, person: { name: "" }, event: tokenEvent });
  const tag = `event_broadcast:${new Date().toISOString().slice(0, 16)}:${crypto.randomBytes(3).toString("hex")}`;
  // Replies from guests go to the organiser (the owner's go to felix@).
  const replyTo = caller.isOwner ? undefined : caller.email;

  if (test) {
    await deliver({ recipients: [{ personId: null, email: caller.email, name: "", basis: "test", token: "test", replyTo }], subject: cleanSubject, compose, logBody, from, tag: `${tag}:test`, hostId: payer, brandId, sentBy: caller.userId });
    return { ok: true, test: true, to: caller.email };
  }
  const [world, suppressed] = await Promise.all([loadWorld(caller), loadSuppressed()]);
  checkAudienceEvents(world, audience);
  const tokens = new Map(world.people.map((p) => [p.id, p.marketing_unsubscribe_token]));
  const recipients = pickAudience({ audience, ...world })
    .filter((r) => !suppressed.has(r.email))
    .map((r) => ({ ...r, token: tokens.get(r.personId) || null, replyTo }));
  if (!recipients.length) throw new ActionError("invalid", "Nobody in that audience can be mailed.", { detail: "no_recipients" });
  const left = await reserveCredits(payer, recipients.length, tag);
  if (left == null) {
    const balance = await creditBalance(payer);
    throw new ActionError("payment_required", `This send needs ${recipients.length} mail credits and the balance is ${balance}. Buy a pack first.`, { needed: recipients.length, balance });
  }
  deliver({ recipients, subject: cleanSubject, compose, logBody, from, tag, hostId: payer, brandId, sentBy: caller.userId })
    .then(({ failed }) => refundCredits(payer, failed, tag))
    .catch((err) => console.error("[events] send failed:", err?.message));
  return { ok: true, queued: recipients.length, tag, balance: left };
}

// Earlier sends, newest first — the brand's own (sends from before brands,
// mig 150, count as the account's first brand; an event co-host sees the
// ones they sent). Before mig 148 sends had no host: those were the owner's.
export async function listSends(caller) {
  const { brands, brand } = await brandScope(caller);
  // A main brand reads the sends of the brands under it.
  const under = caller.isOwner ? [] : brandsUnder(brands, brand);
  const firstBrand = brand && isTeam(brand) && (await listBrands(brand.hostId))[0]?.id === brand.id;
  const rows = await selectAllPaged(() => {
    const q = supabase.from("email_outbox").select("campaign_tag, subject, status, created_at").eq("category", "event_broadcast");
    if (caller.isOwner) return q.or(`host_id.is.null,host_id.eq.${caller.hostId}`).order("created_at", { ascending: false });
    if (!brand) return q.eq("host_id", caller.hostId).is("brand_id", null).order("created_at", { ascending: false });
    const mine = q.eq("host_id", brand.hostId);
    const scoped = brand.role === "event" ? mine.eq("brand_id", brand.id).eq("sent_by", caller.userId)
      : under.length ? mine.in("brand_id", [brand.id, ...under.map((b) => b.id)])
      : firstBrand ? mine.or(`brand_id.is.null,brand_id.eq.${brand.id}`) : mine.eq("brand_id", brand.id);
    return scoped.order("created_at", { ascending: false });
  });
  const by = new Map();
  for (const r of rows) {
    if (r.campaign_tag?.endsWith(":test")) continue;
    const s = by.get(r.campaign_tag) || { tag: r.campaign_tag, subject: r.subject, at: r.created_at, sent: 0, failed: 0 };
    if (r.status === "sent") s.sent += 1;
    else s.failed += 1;
    by.set(r.campaign_tag, s);
  }
  return [...by.values()].slice(0, 50);
}

// ─── Statistics (lib/eventStats.js) ─────────────────────────────────────────
const VIEW_COLUMNS = "id, event_id, visitor_id, referrer, utm_source, device_type, created_at";

async function viewsFor(ids) {
  const out = [];
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    out.push(...(await selectAllPaged(() => supabase.from("event_page_views").select(VIEW_COLUMNS).in("event_id", chunk).order("created_at", { ascending: true }))));
  }
  return out;
}

// The brand on screen: its events (a main brand: all its brands' events),
// rolled up, with a row per brand under a main brand.
export async function statsOverview(caller) {
  const world = await loadWorld(caller);
  const views = await viewsFor(world.events.map((e) => e.id));
  let brands = [];
  if (!caller.isOwner) {
    const { brands: all, brand } = await brandScope(caller);
    const under = brandsUnder(all, brand);
    if (under.length) brands = [brand, ...under].map(brandShape);
  }
  return brandStats({ brands, events: world.events, rsvps: world.rsvps, views, pullups: world.pullups });
}

// One event's statistics, read in the world of the brand it belongs to (so
// "returning" means came to that brand before).
export async function statsForEvent(caller, id) {
  const ev = await eventFor(caller, id);
  const scope = caller.isOwner || !ev.brand_id ? caller : { ...caller, requestedBrand: ev.brand_id, _brandScope: null };
  const world = await loadWorld(scope);
  const events = world.events.some((e) => e.id === ev.id) ? world.events : [...world.events, ev];
  const rsvps = world.events.some((e) => e.id === ev.id) ? world.rsvps : [...world.rsvps, ...(await selectIn("rsvps", RSVP_COLUMNS, "event_id", [ev.id]))];
  const views = await viewsFor([ev.id]);
  return { event: { id: ev.id, title: ev.title, startsAt: ev.starts_at, status: ev.status }, ...eventStats({ event: ev, events, rsvps, views, pullups: world.pullups }) };
}
