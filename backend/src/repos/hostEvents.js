// The event platform, per organiser. Every function takes the caller
// (middleware/requireUser.js) and only ever touches that organiser's events,
// guests and people — the owner (platform admin) sees all events, as before.
// An organiser works in one brand at a time (lib/brands.js): the list, the
// CRM and the mail are that brand's; an event can be opened from any of the
// account's brands.
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
import { brandNames, brandScope, currentBrand } from "../lib/brands.js";
import { apiBase, eventUrl } from "../lib/urls.js";

export const EVENT_COLUMNS =
  "id, host_id, brand_id, slug, title, description, sections, location, starts_at, ends_at, timezone, image_url, cover_image_url, total_capacity, status, kind, created_at, " +
  "media_settings, title_settings, hide_location, hide_date, reveal_hint, date_reveal_hint, signup_settings, show_coordinates, location_lat, location_lng";
const PEOPLE_COLUMNS =
  "id, name, email, phone, phone_e164, instagram, created_at, acquisition_channel, import_source, marketing_consent, marketing_unsubscribed_at, do_not_contact, anonymized_at, marketing_unsubscribe_token";
const RSVP_COLUMNS = "id, event_id, person_id, status, pulled_up, created_at, marketing_opt_in";

const ofKindEvent = (q) => q.or("kind.is.null,kind.eq.event");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `.in()` with a long list overflows the URL; read it 200 ids at a time.
async function selectIn(table, columns, column, ids) {
  const out = [];
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabase.from(table).select(columns).in(column, unique.slice(i, i + 200));
    if (error) throw error;
    out.push(...(data || []));
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
  const { brand } = await brandScope(caller);
  if (!brand) return { events: [], rsvps: [], people: [], pullups: [] };
  const events = await selectAllPaged(() =>
    ofKindEvent(supabase.from("events").select(EVENT_COLUMNS)).eq("host_id", caller.hostId).eq("brand_id", brand.id).order("starts_at", { ascending: false }),
  );
  const ids = events.map((e) => e.id);
  const [rsvps, pullups] = await Promise.all([
    selectIn("rsvps", RSVP_COLUMNS, "event_id", ids),
    selectIn("pullups", "event_id, person_id", "event_id", ids),
  ]);
  rsvps.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  const optedIn = new Set(rsvps.filter((r) => r.marketing_opt_in && r.status !== "cancelled").map((r) => r.person_id));
  const people = (await selectIn("people", PEOPLE_COLUMNS, "id", rsvps.map((r) => r.person_id)))
    .map((p) => ({ ...p, marketing_consent: optedIn.has(p.id) }))
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  return { events, rsvps, people, pullups };
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
    mine: ev.host_id === caller.hostId,
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
    showCoordinates: !!ev.show_coordinates,
    locationLat: ev.location_lat ?? null,
    locationLng: ev.location_lng ?? null,
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
    if (r.status === "attending") c.attending += 1;
    if (r.status === "waitlist") c.waitlist += 1;
    if (r.pulled_up) c.pulledUp += 1;
    counts.set(r.event_id, c);
  }
  return counts;
}

// The event row, if the caller may work on it: an organiser only their own,
// the owner any. Anything else is "not found" — never "not yours".
export async function eventFor(caller, id) {
  if (!UUID.test(String(id || ""))) throw new ActionError("not_found", "No event with that id.");
  const { data: ev, error } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!ev || (ev.kind && ev.kind !== "event") || (!caller.isOwner && ev.host_id !== caller.hostId)) {
    throw new ActionError("not_found", "No event with that id.");
  }
  return ev;
}

export async function listEvents(caller) {
  const { brand } = caller.isOwner ? {} : await brandScope(caller);
  if (!caller.isOwner && !brand) return [];
  const query = () => ofKindEvent(supabase.from("events").select(EVENT_COLUMNS)).order("starts_at", { ascending: false });
  const events = await selectAllPaged(() => (caller.isOwner ? query() : query().eq("host_id", caller.hostId).eq("brand_id", brand.id)));
  const rsvps = caller.isOwner
    ? await selectAllPaged(() => supabase.from("rsvps").select(RSVP_COLUMNS).order("created_at", { ascending: true }))
    : await selectIn("rsvps", RSVP_COLUMNS, "event_id", events.map((e) => e.id));
  // The owner sees everyone's events: each one says whose brand it is.
  const names = caller.isOwner ? await brandNames(events.map((e) => e.brand_id)) : new Map();
  const counts = countsByEvent(rsvps);
  return events.map((e) => eventShape(e, caller, counts.get(e.id), names));
}

export async function createEvent(caller, body) {
  const patch = eventPatch(body || {});
  if (!patch.title) throw new ActionError("invalid", "The event needs a title.", { detail: "title" });
  if (!patch.starts_at) throw new ActionError("invalid", "The event needs a start time.", { detail: "startsAt" });
  if (patch.ends_at && patch.ends_at <= patch.starts_at) throw new ActionError("invalid", "The end time must be after the start time.", { detail: "endsAt" });
  if (!caller.isOwner) await ensureHostProfile(caller.hostId);
  const brand = await currentBrand(caller);
  const row = {
    host_id: caller.hostId,
    brand_id: brand.id,
    slug: makeSlug(patch.title),
    kind: "event",
    visibility: "public",
    status: "DRAFT",
    timezone: "Europe/Stockholm",
    created_via: caller.via === "agent" ? "agent" : "create",
    require_email: true,
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
    };
  });
  const counts = { attending: 0, waitlist: 0, pulledUp: 0 };
  for (const g of guests) {
    if (g.status === "attending") counts.attending += 1;
    if (g.status === "waitlist") counts.waitlist += 1;
    if (g.pulledUp) counts.pulledUp += 1;
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
    people: summarizePeople(world),
    events: world.events.map((e) => ({ id: e.id, title: e.title, startsAt: e.starts_at, mine: e.host_id === caller.hostId })),
  };
}

// An audience only ever reaches the caller's own events' guests.
function checkAudienceEvents(world, audience) {
  const own = new Set(world.events.map((e) => e.id));
  const ids = audience?.type === "event" ? [audience.eventId] : audience?.type === "crm" ? audience.eventIds || [] : [];
  for (const id of ids) if (!own.has(id)) throw new ActionError("not_found", "No event with that id.", { detail: "eventId" });
}

export async function previewSend(caller, audience) {
  const [world, suppressed] = await Promise.all([loadWorld(caller), loadSuppressed()]);
  checkAudienceEvents(world, audience);
  const recipients = pickAudience({ audience, ...world }).filter((r) => !suppressed.has(r.email));
  return { count: recipients.length, sample: recipients.slice(0, 5).map((r) => r.name || r.email) };
}

// A send runs after the answer: 100 mails at a time, ~600 ms apart (under
// Resend's rate limit). Each mail is logged in email_outbox under one
// campaign_tag and the host. `compose(recipient, unsubscribeUrl)` builds it.
async function deliver({ recipients, subject, compose, logBody, from: fromOverride, tag, hostId }) {
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
export async function sendMail(caller, input) {
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
    await deliver({ recipients: [{ personId: null, email: caller.email, name: "", basis: "test", token: "test", replyTo }], subject: cleanSubject, compose, logBody, from, tag: `${tag}:test`, hostId: caller.hostId });
    return { ok: true, test: true, to: caller.email };
  }
  const [world, suppressed] = await Promise.all([loadWorld(caller), loadSuppressed()]);
  checkAudienceEvents(world, audience);
  const tokens = new Map(world.people.map((p) => [p.id, p.marketing_unsubscribe_token]));
  const recipients = pickAudience({ audience, ...world })
    .filter((r) => !suppressed.has(r.email))
    .map((r) => ({ ...r, token: tokens.get(r.personId) || null, replyTo }));
  if (!recipients.length) throw new ActionError("invalid", "Nobody in that audience can be mailed.", { detail: "no_recipients" });
  const left = await reserveCredits(caller.hostId, recipients.length, tag);
  if (left == null) {
    const balance = await creditBalance(caller.hostId);
    throw new ActionError("payment_required", `This send needs ${recipients.length} mail credits and the balance is ${balance}. Buy a pack first.`, { needed: recipients.length, balance });
  }
  deliver({ recipients, subject: cleanSubject, compose, logBody, from, tag, hostId: caller.hostId })
    .then(({ failed }) => refundCredits(caller.hostId, failed, tag))
    .catch((err) => console.error("[events] send failed:", err?.message));
  return { ok: true, queued: recipients.length, tag, balance: left };
}

// Earlier sends, newest first. Before mig 148 sends had no host: those were
// all the owner's.
export async function listSends(caller) {
  const rows = await selectAllPaged(() => {
    const q = supabase.from("email_outbox").select("campaign_tag, subject, status, created_at").eq("category", "event_broadcast");
    return (caller.isOwner ? q.or(`host_id.is.null,host_id.eq.${caller.hostId}`) : q.eq("host_id", caller.hostId)).order("created_at", { ascending: false });
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
