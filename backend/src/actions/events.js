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
import { createEvent, eventFor, eventWithGuests, listEvents, updateEvent, updateGuest } from "../repos/hostEvents.js";
import { syncCover } from "../routes/adminEventMedia.js";
import { brandScope, brandShape, createBrand, payerFor, renameBrand } from "../lib/brands.js";
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
  description: "One of the person's events with its full guest list: name, email, status (attending, waitlist, cancelled), whether they came, and whether they want updates.",
  access: "user",
  effect: "read",
  untrustedOutput: true,
  input: z.object({ eventId }),
  run: async ({ eventId: id }, { caller }) => {
    const { event, guests } = await eventWithGuests(caller, id);
    return { event: withLinks(event), guests };
  },
});

export const createEventAction = defineAction({
  name: "create_event",
  title: "Create an event",
  description:
    "Create an event page. It starts as a DRAFT that only the organiser sees; call publish_event when they want it live. Give times as the clock shows them in the event's time zone. Returns the event with its share link and the page where the person can design it.",
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
    capacity: z.number().int().min(1).max(100000).optional().describe("Max attending; later sign-ups go to the waitlist. Leave out for no limit."),
    publish: z.boolean().default(false).describe("Publish right away. Only if the person asked for it."),
  }),
  run: async (input, { caller }) => {
    const times = timesToUtc(input, input.timeZone);
    let event = await createEvent(inBrand(caller, input.brand), {
      title: input.title,
      ...times,
      timezone: input.timeZone,
      location: input.location,
      text: input.description,
      capacity: input.capacity,
    });
    if (input.publish) event = await updateEvent(caller, event.id, { status: "PUBLISHED" });
    return { event: withLinks(event), next: input.publish ? "It's live: share links.page." : "It's a draft. Use publish_event when it should go live." };
  },
});

export const updateEventAction = defineAction({
  name: "update_event",
  title: "Edit an event",
  description: "Change an event's title, time, place, text or capacity. Only the fields you give change. Times are read in the event's time zone.",
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
  }),
  run: async (input, { caller }) => {
    const current = await eventFor(caller, input.eventId);
    const tz = input.timeZone || current.timezone || "Europe/Stockholm";
    const event = await updateEvent(caller, input.eventId, {
      title: input.title,
      ...timesToUtc(input, tz),
      timezone: input.timeZone,
      location: input.location,
      text: input.description,
      capacity: input.capacity === null ? null : input.capacity,
    });
    return { event: withLinks(event) };
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

export const setEventCover = defineAction({
  name: "set_event_cover",
  title: "Set an event's cover image",
  description: "Use an image from a public https URL as the event's cover (PNG, JPEG, GIF or WebP, up to 8 MB). PullUp downloads and stores it. Use images the person owns or has the right to use.",
  access: "user",
  effect: "write",
  input: z.object({ eventId, imageUrl: z.string().trim().url().max(2000).describe("A public https:// link to the image file.") }),
  run: async ({ eventId: id, imageUrl }, { caller }) => {
    const ev = await eventFor(caller, id);
    if (caller.isOwner && ev.host_id !== caller.hostId) throw new ActionError("forbidden", "Only the organiser can change this event's cover.");
    let image;
    try {
      image = await fetchRemoteImage(imageUrl);
    } catch (err) {
      throw new ActionError("invalid", err.message);
    }
    const path = `${ev.id}/media_0_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.${image.ext}`;
    const { error } = await supabase.storage.from(EVENT_IMAGE_BUCKET).upload(path, image.buffer, { contentType: image.mime, upsert: false });
    if (error) throw error;
    // First in the carousel and the cover; what was there stays after it.
    const { data: first } = await supabase.from("event_media").select("position").eq("event_id", ev.id).order("position", { ascending: true }).limit(1).maybeSingle();
    await supabase.from("event_media").update({ is_cover: false }).eq("event_id", ev.id);
    const { error: insErr } = await supabase.from("event_media").insert({
      event_id: ev.id,
      media_type: image.mime === "image/gif" ? "gif" : "image",
      storage_path: path,
      position: first ? first.position - 1 : 0,
      is_cover: true,
      mime_type: image.mime,
    });
    if (insErr) throw insErr;
    await syncCover(ev.id);
    const { event } = await eventWithGuests(caller, ev.id);
    return { event: withLinks(event) };
  },
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
  description: "The brands this person works in (one login can run several, e.g. an agency or a company with several products), each with their role: head (their own), member (invited into someone's brand: works in it fully, on its mail credits) or event (co-host of single events there). Events, guests, the CRM and mail belong to a brand.",
  access: "user",
  effect: "read",
  input: z.object({}),
  run: async (_input, { caller }) => ({ brands: (await brandScope(caller)).brands.map(brandShape) }),
});

export const createBrandAction = defineAction({
  name: "create_brand",
  title: "Add a brand",
  description: "Add a brand to the account. Its name is what guests see as the organiser and as the sender of its mail. Returns the existing one if the name is taken.",
  access: "user",
  effect: "write",
  idempotent: true,
  input: z.object({ name: z.string().trim().min(1).max(80) }),
  run: async ({ name }, { caller }) => ({ brand: await createBrand(caller, name) }),
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

export default [whoami, listBrandsAction, createBrandAction, renameBrandAction, listMyEvents, getMyEvent, createEventAction, updateEventAction, publishEvent, setEventCover, updateGuestAction];
