// An organiser's events, for them or their assistant: who am I, my events,
// create, edit, publish, a cover image, and the guest list.
import crypto from "crypto";
import { z } from "zod";
import { defineAction } from "./registry.js";
import { ActionError } from "../lib/actionError.js";
import { supabase } from "../supabase.js";
import { creditBalance } from "../lib/emailCredits.js";
import { EVENT_IMAGE_BUCKET } from "../lib/eventPlatform.js";
import { fetchRemoteImage } from "../lib/remoteImage.js";
import { isValidTimeZone, toUtcIso } from "../lib/zonedTime.js";
import { getFrontendUrl } from "../lib/urls.js";
import { createEvent, deleteEvent, eventFor, eventWithGuests, listEvents, moveEvent, updateEvent, updateGuest } from "../repos/hostEvents.js";
import { loadEventMedia, syncCover } from "../routes/adminEventMedia.js";
import { geocode } from "../routes/places.js";
import { answersByLabel } from "../lib/eventForm.js";
import { brandScope, brandShape, createBrand, deleteBrand, payerFor, renameBrand } from "../lib/brands.js";
import { myInvites } from "../lib/teams.js";

// Which of the account's brands to work in: its id or name. Leave out for the
// first. Several brands (an agency, a drinks company) live under one login.
export const brandInput = z.string().trim().min(1).max(100).optional()
  .describe("Which of the account's brands (id or name, see list_brands). Leave out for the first.");
export const inBrand = (caller, brand) => (brand ? { ...caller, requestedBrand: brand, _brandScope: null } : caller);

const eventId = z.guid().describe("The event's id (from list_my_events or create_event).");
const when = z.string().trim().min(10).max(40)
  .describe("Local wall-clock time like 2026-11-07T19:00 (read in the event's timeZone), or an ISO time with offset.");
const timeZone = z.string().trim().max(64).refine(isValidTimeZone, "not a known IANA time zone")
  .describe("IANA time zone of the event, e.g. Europe/Stockholm (the default).");

// What an assistant needs about an event: the share link and where the
// person edits the design.
function withLinks(event) {
  const { sections: _sections, mediaSettings: _media, titleSettings: _title, signupSettings: _signup, ...rest } = event;
  return {
    ...rest,
    links: { page: event.url, manage: `${getFrontendUrl()}/admin/events/${event.id}`, design: `${getFrontendUrl()}/admin/events/${event.id}/edit` },
  };
}

// A typed address gets its coordinates (for the map on the page), or none.
async function placeFor(location) {
  if (location === undefined) return {};
  const g = location ? await geocode(location) : null;
  return { locationLat: g?.lat ?? null, locationLng: g?.lng ?? null, placeId: g?.placeId ?? null };
}

// The page's design as update_event takes it back.
function designOf(event) {
  return {
    sections: event.sections || [],
    hideLocation: !!event.hideLocation,
    revealHint: event.revealHint || "",
    hideDate: !!event.hideDate,
    dateRevealHint: event.dateRevealHint || "",
    signupButton: event.signupSettings?.cta || "",
    signupHidden: !!event.signupSettings?.hidden,
    signupForm: event.form,
  };
}

// The sign-up's own fields and questions (lib/eventForm.js).
const signupForm = z.object({
  phone: z.enum(["off", "optional", "required"]).optional().describe("Ask for a phone number."),
  instagram: z.enum(["off", "optional", "required"]).optional().describe("Ask for an Instagram handle."),
  plusOnes: z.number().int().min(0).max(10).optional().describe("How many guests one sign-up may bring (0 = just themselves)."),
  questions: z.array(z.object({
    id: z.string().max(20).optional().describe("Keep an existing question's id (get_my_event) so its answers stay linked."),
    label: z.string().trim().min(1).max(140).describe("The question, e.g. 'Allergier eller specialkost?'"),
    type: z.enum(["text", "choice", "check"]).default("text").describe("text = free answer, choice = one of options, check = a yes box."),
    options: z.array(z.string().max(80)).max(12).optional().describe("For a choice: 2–12 options."),
    required: z.boolean().default(false),
  })).max(12).optional().describe("The organiser's own questions, replacing the current list."),
}).optional().describe("What the sign-up asks besides name and email.");

// The page's content blocks as update_event takes them (the editor's types).
const section = z.object({
  type: z.enum(["title", "location", "datetime", "text", "spotify", "applemusic", "soundcloud", "youtube", "socials", "hostedby"]),
  title: z.string().max(200).optional().describe("text: its heading."),
  text: z.string().max(8000).optional().describe("text: the paragraph(s)."),
  url: z.string().max(600).optional().describe("spotify / applemusic / soundcloud / youtube: the link to embed."),
  instagram: z.string().max(600).optional(),
  tiktok: z.string().max(600).optional(),
  spotify: z.string().max(600).optional(),
  soundcloud: z.string().max(600).optional(),
  website: z.string().max(600).optional().describe("socials / hostedby: a website link."),
  name: z.string().max(120).optional().describe("hostedby: the organiser's name."),
  email: z.string().max(200).optional().describe("hostedby: a contact email."),
}).passthrough();

// Times are given in the event's zone: convert before they reach the repo.
function timesToUtc(input, tz) {
  const out = {};
  for (const k of ["startsAt", "endsAt"]) {
    if (input[k] === undefined) continue;
    if (input[k] === null) { out[k] = null; continue; }
    const iso = toUtcIso(input[k], tz);
    if (!iso) throw new ActionError("invalid", `${k} isn't a date and time I can read: "${input[k]}".`);
    out[k] = iso;
  }
  return out;
}

export const whoami = defineAction({
  name: "whoami",
  title: "Who am I signed in as",
  description: "The signed-in PullUp account: email, whether it's the platform owner, its brands (with the role in each: head, member or event co-host), how many events the first brand has, the mail credit balance (shared by all the account's brands) and how many invites are waiting (list_my_invites).",
  access: "user",
  effect: "read",
  input: z.object({}),
  run: async (_input, { caller }) => {
    const [events, credits, { brands }, invites] = await Promise.all([listEvents(caller), creditBalance(await payerFor(caller)), brandScope(caller), myInvites(caller)]);
    const mine = events.filter((e) => e.mine);
    return {
      email: caller.email,
      owner: caller.isOwner,
      brands: brands.map(brandShape),
      events: { total: mine.length, upcoming: mine.filter((e) => new Date(e.endsAt || e.startsAt) > new Date()).length },
      mailCredits: credits,
      invitesWaiting: invites.length,
    };
  },
});

export const listMyEvents = defineAction({
  name: "list_my_events",
  title: "List my events",
  description: "The signed-in person's events (the owner sees every event on PullUp), newest first, with status (DRAFT or PUBLISHED), time, place, links and sign-up counts.",
  access: "user",
  effect: "read",
  untrustedOutput: true,
  input: z.object({
    brand: brandInput,
    upcomingOnly: z.boolean().default(false).describe("Only events that haven't ended yet."),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  run: async ({ brand, upcomingOnly, limit }, { caller }) => {
    let events = await listEvents(inBrand(caller, brand));
    if (upcomingOnly) events = events.filter((e) => new Date(e.endsAt || e.startsAt) > new Date());
    return { events: events.slice(0, limit).map(withLinks), total: events.length };
  },
});

export const getMyEvent = defineAction({
  name: "get_my_event",
  title: "One of my events, with guests",
  description: "One of the person's events with its full guest list (name, email, phone, Instagram, guests brought along, answers to the event's questions, status attending/waitlist/cancelled, whether they came, whether they want updates), its page design (content blocks, what's hidden, the sign-up button) and its images (the carousel; the first is the cover).",
  access: "user",
  effect: "read",
  untrustedOutput: true,
  input: z.object({ eventId }),
  run: async ({ eventId: id }, { caller }) => {
    const { event, guests } = await eventWithGuests(caller, id);
    const media = await loadEventMedia(id);
    const labeled = guests.map((g) => ({ ...g, answers: answersByLabel(event.form, g.answers) }));
    return { event: withLinks(event), design: designOf(event), media: media.map(({ id: mediaId, mediaType, url, isCover }) => ({ mediaId, mediaType, url, isCover })), guests: labeled };
  },
});

export const createEventAction = defineAction({
  name: "create_event",
  title: "Create an event",
  description:
    "Create an event page in a brand (under a main brand: give one of the brands under it). It starts as a DRAFT that only the organiser sees; call publish_event when they want it live. Give times as the clock shows them in the event's time zone. Returns the event with its share link and the page where the person can design it.",
  access: "user",
  effect: "write",
  input: z.object({
    brand: brandInput,
    title: z.string().trim().min(1).max(160),
    startsAt: when,
    endsAt: when.optional(),
    timeZone: timeZone.default("Europe/Stockholm"),
    location: z.string().trim().max(300).optional().describe("Venue and address as guests should see it."),
    description: z.string().trim().max(8000).optional().describe("The text on the page: what it is, who it's for, what to bring."),
    capacity: z.number().int().min(1).max(100000).optional().describe("Max attending (guests brought along count); later sign-ups go to the waitlist. Leave out for no limit."),
    signupForm,
    publish: z.boolean().default(false).describe("Publish right away. Only if the person asked for it."),
  }),
  run: async (input, { caller }) => {
    const times = timesToUtc(input, input.timeZone);
    let event = await createEvent(inBrand(caller, input.brand), {
      title: input.title,
      ...times,
      timezone: input.timeZone,
      location: input.location,
      ...(await placeFor(input.location)),
      text: input.description,
      capacity: input.capacity,
      form: input.signupForm,
    });
    if (input.publish) event = await updateEvent(caller, event.id, { status: "PUBLISHED" });
    return { event: withLinks(event), next: input.publish ? "It's live: share links.page." : "It's a draft. Use publish_event when it should go live." };
  },
});

export const updateEventAction = defineAction({
  name: "update_event",
  title: "Edit an event",
  description: "Change an event: title, time, place, text, capacity, its sign-up form (phone, Instagram, guests brought along, own questions like allergies), and its page design (content blocks, a hidden address or date with a hint, the sign-up button). Only the fields you give change. Times are read in the event's time zone. Images: add_event_image / remove_event_image.",
  access: "user",
  effect: "write",
  idempotent: true,
  input: z.object({
    eventId,
    title: z.string().trim().min(1).max(160).optional(),
    startsAt: when.optional(),
    endsAt: when.nullable().optional().describe("null removes the end time."),
    timeZone: timeZone.optional(),
    location: z.string().trim().max(300).optional(),
    description: z.string().trim().max(8000).optional(),
    capacity: z.number().int().min(1).max(100000).nullable().optional().describe("null removes the limit."),
    // The page's design, as the editor sets it.
    sections: z.array(section).max(40).optional().describe("The page's content blocks in order, replacing the current ones (get_my_event shows them). title, location and datetime are always kept. Types: text {title, text}, spotify/applemusic/soundcloud/youtube {url}, socials {instagram, tiktok, spotify, soundcloud, website}, hostedby {name, email, website}."),
    hideLocation: z.boolean().optional().describe("Hide the address until later (a secret location)."),
    revealHint: z.string().max(80).optional().describe("What guests see instead of a hidden address, e.g. 'Sent the day before'."),
    hideDate: z.boolean().optional().describe("Hide the date until later."),
    dateRevealHint: z.string().max(80).optional().describe("What guests see instead of a hidden date."),
    signupButton: z.string().max(40).optional().describe("The sign-up button's text, e.g. 'Save my spot'. Empty = the default."),
    signupHidden: z.boolean().optional().describe("Hide the sign-up form (a page that only informs)."),
    signupForm,
  }),
  run: async (input, { caller }) => {
    const current = await eventFor(caller, input.eventId);
    const signup = input.signupButton !== undefined || input.signupHidden !== undefined
      ? { cta: input.signupButton ?? current.signup_settings?.cta ?? "", hidden: input.signupHidden ?? !!current.signup_settings?.hidden, label: current.signup_settings?.label || "" }
      : undefined;
    const tz = input.timeZone || current.timezone || "Europe/Stockholm";
    const event = await updateEvent(caller, input.eventId, {
      title: input.title,
      ...timesToUtc(input, tz),
      timezone: input.timeZone,
      location: input.location,
      ...(await placeFor(input.location)),
      text: input.description,
      capacity: input.capacity === null ? null : input.capacity,
      sections: input.sections,
      hideLocation: input.hideLocation,
      revealHint: input.revealHint,
      hideDate: input.hideDate,
      dateRevealHint: input.dateRevealHint,
      signupSettings: signup,
      form: input.signupForm,
    });
    return { event: withLinks(event), design: designOf(event) };
  },
});

export const publishEvent = defineAction({
  name: "publish_event",
  title: "Publish or unpublish an event",
  description: "Make an event live (anyone with the link can see it and sign up) or take it back to draft. Publishing is public: do it when the person asks.",
  access: "user",
  effect: "send",
  idempotent: true,
  input: z.object({ eventId, published: z.boolean().default(true).describe("true = live, false = back to draft.") }),
  run: async ({ eventId: id, published }, { caller }) => {
    const event = await updateEvent(caller, id, { status: published ? "PUBLISHED" : "DRAFT" });
    return { event: withLinks(event), live: event.status === "PUBLISHED" };
  },
});

// An image from a public link into the event's carousel: first and the cover,
// or last.
async function addImage(caller, id, imageUrl, cover) {
  const ev = await eventFor(caller, id);
  if (caller.isOwner && ev.host_id !== caller.hostId) throw new ActionError("forbidden", "Only the organiser can change this event's images.");
  let image;
  try {
    image = await fetchRemoteImage(imageUrl);
  } catch (err) {
    throw new ActionError("invalid", err.message);
  }
  const path = `${ev.id}/media_0_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.${image.ext}`;
  const { error } = await supabase.storage.from(EVENT_IMAGE_BUCKET).upload(path, image.buffer, { contentType: image.mime, upsert: false });
  if (error) throw error;
  const { data: rows } = await supabase.from("event_media").select("position").eq("event_id", ev.id).order("position", { ascending: true });
  const positions = (rows || []).map((r) => r.position);
  if (cover) await supabase.from("event_media").update({ is_cover: false }).eq("event_id", ev.id);
  const { error: insErr } = await supabase.from("event_media").insert({
    event_id: ev.id,
    media_type: image.mime === "image/gif" ? "gif" : "image",
    storage_path: path,
    position: cover ? (positions.length ? positions[0] - 1 : 0) : (positions.length ? positions[positions.length - 1] + 1 : 0),
    is_cover: cover || !positions.length,
    mime_type: image.mime,
  });
  if (insErr) throw insErr;
  await syncCover(ev.id);
  const { event } = await eventWithGuests(caller, ev.id);
  const media = await loadEventMedia(ev.id);
  return { event: withLinks(event), media: media.map(({ id: mediaId, mediaType, url, isCover }) => ({ mediaId, mediaType, url, isCover })) };
}

export const setEventCover = defineAction({
  name: "set_event_cover",
  title: "Set an event's cover image",
  description: "Use an image from a public https URL as the event's cover (PNG, JPEG, GIF or WebP, up to 8 MB). PullUp downloads and stores it; what was there stays after it in the carousel. Use images the person owns or has the right to use.",
  access: "user",
  effect: "write",
  input: z.object({ eventId, imageUrl: z.string().trim().url().max(2000).describe("A public https:// link to the image file.") }),
  run: async ({ eventId: id, imageUrl }, { caller }) => addImage(caller, id, imageUrl, true),
});

export const addEventImage = defineAction({
  name: "add_event_image",
  title: "Add an image to an event",
  description: "Add an image from a public https URL to the event page's carousel, last (or first and as the cover with cover: true). PNG, JPEG, GIF or WebP, up to 8 MB. Use images the person owns or has the right to use.",
  access: "user",
  effect: "write",
  input: z.object({ eventId, imageUrl: z.string().trim().url().max(2000), cover: z.boolean().default(false) }),
  run: async ({ eventId: id, imageUrl, cover }, { caller }) => addImage(caller, id, imageUrl, cover),
});

export const removeEventImage = defineAction({
  name: "remove_event_image",
  title: "Remove an image from an event",
  description: "Remove one image (or video) from the event page's carousel; mediaId comes from get_my_event. If it was the cover, the next one becomes the cover.",
  access: "user",
  effect: "write",
  idempotent: true,
  input: z.object({ eventId, mediaId: z.guid() }),
  run: async ({ eventId: id, mediaId }, { caller }) => {
    const ev = await eventFor(caller, id);
    if (caller.isOwner && ev.host_id !== caller.hostId) throw new ActionError("forbidden", "Only the organiser can change this event's images.");
    const { data: row } = await supabase.from("event_media").select("*").eq("id", mediaId).eq("event_id", ev.id).maybeSingle();
    if (!row) throw new ActionError("not_found", "No image with that id on this event.");
    await supabase.storage.from(EVENT_IMAGE_BUCKET).remove([row.storage_path, row.thumbnail_path].filter(Boolean));
    await supabase.from("event_media").delete().eq("id", row.id);
    if (row.is_cover) await syncCover(ev.id);
    return { removed: true, media: (await loadEventMedia(ev.id)).map(({ id: m, mediaType, url, isCover }) => ({ mediaId: m, mediaType, url, isCover })) };
  },
});

export const moveEventAction = defineAction({
  name: "move_event",
  title: "Move an event to another brand",
  description: "Move one of the account's events to another of its brands (e.g. an event made on Nigab before Aperol existed, into Aperol). Its guests and their yes to invitations go with it. Within one account, by its team; a main brand over other brands holds no events.",
  access: "user",
  effect: "write",
  idempotent: true,
  input: z.object({ eventId, brand: z.string().trim().min(1).max(100).describe("The brand to move it to: id or name (list_brands).") }),
  run: async ({ eventId: id, brand }, { caller }) => ({ event: withLinks(await moveEvent(caller, id, brand)) }),
});

export const updateGuestAction = defineAction({
  name: "update_guest",
  title: "Change a guest",
  description: "Move a guest on one of the person's events between attending, waitlist and cancelled, or mark that they came (or didn't). rsvpId comes from get_my_event.",
  access: "user",
  effect: "write",
  idempotent: true,
  input: z.object({
    rsvpId: z.guid(),
    status: z.enum(["attending", "waitlist", "cancelled"]).optional(),
    pulledUp: z.boolean().optional().describe("true = they came."),
  }),
  run: async ({ rsvpId, status, pulledUp }, { caller }) => ({ guest: await updateGuest(caller, rsvpId, { status, pulledUp }) }),
});

export const listBrandsAction = defineAction({
  name: "list_brands",
  title: "My brands",
  description: "The brands this person works in (one login can run several, e.g. an agency or a company with several products), each with their role: head (their own), member (invited into someone's brand: works in it fully, on its mail credits) or event (co-host of single events there). Events, guests, the CRM and mail belong to a brand. parentId: the main brand it sits under. A main brand with brands under it is their admin: it sees all their events, their whole CRM and their statistics, but makes no events and sends no mail itself — those are done in the brands.",
  access: "user",
  effect: "read",
  input: z.object({}),
  run: async (_input, { caller }) => ({ brands: (await brandScope(caller)).brands.map(brandShape) }),
});

export const createBrandAction = defineAction({
  name: "create_brand",
  title: "Add a brand",
  description: "Add a brand to the account. Its name is what guests see as the organiser and as the sender of its mail. Returns the existing one if the name is taken. `under`: put it under one of the account's main brands (by name or id), like Aperol under Nigab; one level deep. A team invited to the main brand works in the brands under it too.",
  access: "user",
  effect: "write",
  idempotent: true,
  input: z.object({ name: z.string().trim().min(1).max(80), under: z.string().trim().max(80).optional() }),
  run: async ({ name, under }, { caller }) => ({ brand: await createBrand(caller, name, under) }),
});

export const renameBrandAction = defineAction({
  name: "rename_brand",
  title: "Rename a brand",
  description: "Change a brand's name (guests see it as the organiser and the sender).",
  access: "user",
  effect: "write",
  idempotent: true,
  input: z.object({ brandId: z.guid(), name: z.string().trim().min(1).max(80) }),
  run: async ({ brandId, name }, { caller }) => ({ brand: await renameBrand(caller, brandId, name) }),
});

export const deleteEventAction = defineAction({
  name: "delete_event",
  title: "Delete an event",
  description: "Delete one of the brand's events for good: its page, sign-ups, pictures and statistics. The people stay in the CRM. Cannot be undone — confirm with the person first, then pass the event's exact title as confirmTitle. The brand's team only (not a co-host). To just take it down, set it to draft with update_event instead.",
  access: "user",
  effect: "write",
  destructive: true,
  input: z.object({ eventId, confirmTitle: z.string().trim().min(1).max(200).describe("The event's exact title, as confirmation.") }),
  run: async ({ eventId: id, confirmTitle }, { caller }) => deleteEvent(caller, id, confirmTitle),
});

export const deleteBrandAction = defineAction({
  name: "delete_brand",
  title: "Delete an empty brand",
  description: "Delete a brand that holds nothing: no events, no brands under it, no imported contacts, and not the account's only brand. Its team goes with it. The brand's head only. Confirm with the person first.",
  access: "user",
  effect: "write",
  destructive: true,
  input: z.object({ brandId: z.guid() }),
  run: async ({ brandId }, { caller }) => deleteBrand(caller, brandId),
});

export default [whoami, listBrandsAction, createBrandAction, renameBrandAction, listMyEvents, getMyEvent, createEventAction, updateEventAction, publishEvent, setEventCover, addEventImage, removeEventImage, moveEventAction, updateGuestAction, deleteEventAction, deleteBrandAction];
