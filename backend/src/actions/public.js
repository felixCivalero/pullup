// What anyone can do on pullup.se, signed in or not — and so what any
// assistant can do for anyone: learn what PullUp is, look at an event, sign
// up to it, and ask Felix for a meeting.
import { z } from "zod";
import { defineAction } from "./registry.js";
import { getPublicEvent, rsvpToEvent } from "../routes/events.js";
import { submitAgencyRequest } from "../routes/agencyRequests.js";
import { PACKS } from "../lib/emailCredits.js";
import { getFrontendUrl } from "../lib/urls.js";
import { MCP_URL } from "../agents/config.js";

const slug = z.string().trim().min(1).max(120).describe("The event's slug: the last part of its link, pullup.se/e/<slug>.");

export const aboutPullup = defineAction({
  name: "about_pullup",
  title: "About PullUp",
  description:
    "What PullUp is and what it costs. Call this first if you don't know PullUp. PullUp is a free event platform: an event page, sign-ups with a calendar invite, a guest list and CRM, and mail to your guests. Also Felix Civalero's marketing studio (pullup.se).",
  access: "public",
  effect: "read",
  input: z.object({}),
  run: async () => ({
    name: "PullUp",
    site: getFrontendUrl(),
    what: "A free event platform for organisers: publish an event page, take sign-ups (with confirmation mail and calendar invite), keep a guest list and a CRM of everyone who came, and mail them. It is also the site of Felix Civalero, who runs content and community for brands.",
    free: ["event pages", "sign-ups and confirmations", "calendar invites", "guest list and CRM", "one reminder before an event"],
    paid: {
      what: "Mail you send to many people at once (invitations, newsletters, follow-ups) is paid in packs; each recipient uses one credit. Credits never expire. Prices exclude VAT.",
      packs: PACKS.map((p) => ({ pack: p.id, mails: p.mails, priceSek: p.priceSek })),
    },
    forAssistants: {
      remoteMcp: `${MCP_URL} — connect with OAuth; the person approves your access once and can revoke it.`,
      inTheBrowser: "On pullup.se the same actions are registered with WebMCP (document.modelContext).",
      rule: "An assistant can do exactly what its person can do on the site, nothing more.",
    },
    contact: "Use request_meeting to reach Felix.",
  }),
});

export const getEvent = defineAction({
  name: "get_event",
  title: "Look at an event",
  description: "A published event's page: title, text, time, place (unless the organiser hides it), whether sign-up is open, spots left, and calendar links.",
  access: "public",
  effect: "read",
  untrustedOutput: true,
  input: z.object({ slug }),
  run: async ({ slug: s }) => {
    // What a guest reads, without the page's design data.
    const { event: e, calendar } = await getPublicEvent(s);
    return {
      event: {
        slug: e.slug, title: e.title, text: e.text, startsAt: e.startsAt, endsAt: e.endsAt, timezone: e.timezone,
        location: e.location, imageUrl: e.imageUrl, open: e.open, full: e.full, spotsLeft: e.spotsLeft,
        url: `${getFrontendUrl()}/e/${e.slug}`,
      },
      calendar,
    };
  },
});

export const rsvpEvent = defineAction({
  name: "rsvp_to_event",
  title: "Sign up to an event",
  description:
    "Sign a person up to a published event. They get a confirmation mail with a calendar invite at that address. If the event is full they land on the waitlist. Only sign up the person you act for, with their own name and email, and only with their consent. Signing up twice is harmless.",
  access: "public",
  effect: "send",
  idempotent: true,
  input: z.object({
    slug,
    name: z.string().trim().min(1).max(120).describe("The guest's name, as they want it on the guest list."),
    email: z.string().trim().email().max(254).describe("The guest's own email address; the confirmation goes there."),
    wantsUpdates: z.boolean().default(false).describe("True only if the person said yes to hearing about the organiser's future events."),
  }),
  run: async ({ slug: s, name, email, wantsUpdates }) => rsvpToEvent(s, { name, email, consent: wantsUpdates }),
});

export const requestMeeting = defineAction({
  name: "request_meeting",
  title: "Ask Felix for a meeting",
  description:
    "Send Felix Civalero (PullUp) a request to talk: about content and community for a brand, or about PullUp. He answers by email. Write the message in the person's own words; say when they can talk.",
  access: "public",
  effect: "send",
  input: z.object({
    name: z.string().trim().min(1).max(120).describe("Who is asking."),
    email: z.string().trim().email().max(254).describe("Where Felix should answer."),
    company: z.string().trim().max(160).optional().describe("Company or brand, if any."),
    message: z.string().trim().min(10).max(4000).describe("What they need, in their words."),
    preferredTime: z.string().trim().max(200).optional().describe("When they can talk, e.g. 'weekday mornings'."),
  }),
  run: async ({ name, email, company, message, preferredTime }, ctx) => {
    const out = await submitAgencyRequest(
      { name, email, company, description: message, preferredTime, source: "assistant" },
      { country: ctx.country, userAgent: ctx.userAgent, via: ctx.door === "webmcp" ? "WebMCP" : ctx.clientName || "MCP" },
    );
    return { ok: true, id: out.id, next: "Felix answers by email, usually within a day." };
  },
});

export default [aboutPullup, getEvent, rsvpEvent, requestMeeting];
