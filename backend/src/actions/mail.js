// An organiser's people and mail: the CRM, who a send would reach, sending
// (paid per recipient — never free), earlier sends, and buying credits.
import { z } from "zod";
import { defineAction } from "./registry.js";
import { ActionError } from "../lib/actionError.js";
import { PACKS, creditBalance, checkoutUrl, packById, recentPurchases } from "../lib/emailCredits.js";
import { getFrontendUrl } from "../lib/urls.js";
import { listPeople, listSends, previewSend, sendMail } from "../repos/hostEvents.js";

const audience = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("event"),
    eventId: z.guid(),
    status: z.enum(["attending", "waitlist"]).optional().describe("Only attending, or only the waitlist."),
  }).describe("Everyone signed up to one event: mail about that event."),
  z.object({
    type: z.literal("crm"),
    eventIds: z.array(z.guid()).max(200).optional().describe("People signed up to any of these events. Leave out for everyone."),
    came: z.boolean().optional().describe("Only those who actually came."),
    consentOnly: z.boolean().optional().describe("Only those who said yes to hearing about future events. Always true without eventIds."),
    search: z.string().max(100).optional().describe("Name or email contains this."),
  }).describe("A segment of the person's CRM."),
  z.object({ type: z.literal("consent") }).describe("Everyone who said yes to hearing about future events."),
]);

export const listPeopleAction = defineAction({
  name: "list_people",
  title: "My people (CRM)",
  description: "Everyone who signed up to the person's events: name, email, how many events, how many they came to, last event, and whether they want updates. Filter with search or eventId.",
  access: "user",
  effect: "read",
  untrustedOutput: true,
  input: z.object({
    search: z.string().trim().max(100).optional().describe("Name or email contains this."),
    eventId: z.guid().optional().describe("Only people signed up to this event."),
    limit: z.number().int().min(1).max(500).default(100),
  }),
  run: async ({ search, eventId, limit }, { caller }) => {
    const { people } = await listPeople(caller);
    const needle = (search || "").toLowerCase();
    const rows = people
      .filter((p) => !needle || `${p.name} ${p.email}`.toLowerCase().includes(needle))
      .filter((p) => !eventId || p.eventIds.includes(eventId));
    return {
      total: rows.length,
      people: rows.slice(0, limit).map(({ eventIds, cameIds, ...p }) => p),
    };
  },
});

export const previewMail = defineAction({
  name: "preview_mail",
  title: "Who would a mail reach",
  description: "Before sending: how many people an audience reaches (unsubscribed, blocked and bounced addresses are left out), a few names, and whether the mail credits cover it.",
  access: "user",
  effect: "read",
  input: z.object({ audience }),
  run: async ({ audience: a }, { caller }) => {
    const [preview, balance] = await Promise.all([previewSend(caller, a), creditBalance(caller.hostId)]);
    return { ...preview, creditsNeeded: preview.count, creditBalance: balance, enoughCredits: balance >= preview.count };
  },
});

export const sendMailAction = defineAction({
  name: "send_mail",
  title: "Send a mail to my people",
  description:
    "Mail an audience from the person's CRM. Costs one mail credit per recipient (see preview_mail); if the balance is short nothing is sent and you get payment_required — then buy_mail_credits. Use test: true first to send one copy to the person themselves (free). Only send what the person approved, word for word.",
  access: "user",
  effect: "send",
  input: z.object({
    audience,
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(20000).describe("Plain text. Blank lines make paragraphs. An unsubscribe link is added."),
    eventId: z.guid().optional().describe("Attach this event: the mail gets its card and a link to sign up."),
    fromName: z.string().trim().max(60).optional().describe("Sender name shown to recipients, e.g. the organiser's brand."),
    test: z.boolean().default(false).describe("Send one copy to the signed-in person only."),
  }),
  run: async (input, { caller }) => {
    const out = await sendMail(caller, input);
    return out.test
      ? { sent: "test", to: out.to }
      : { queued: out.queued, creditBalance: out.balance, note: "Sending in the background; list_sent_mail shows the result." };
  },
});

export const listSentMail = defineAction({
  name: "list_sent_mail",
  title: "Mail I've sent",
  description: "Earlier sends to the person's lists, newest first: subject, when, delivered and failed counts.",
  access: "user",
  effect: "read",
  input: z.object({}),
  run: async (_input, { caller }) => ({ sends: await listSends(caller) }),
});

export const getMailCredits = defineAction({
  name: "get_mail_credits",
  title: "Mail credits",
  description: "The person's mail credit balance (one credit = one recipient of a send), the packs on sale (SEK, excl. VAT) and earlier purchases.",
  access: "user",
  effect: "read",
  input: z.object({}),
  run: async (_input, { caller }) => {
    const [balance, purchases] = await Promise.all([creditBalance(caller.hostId), recentPurchases(caller.hostId)]);
    return { balance, packs: PACKS.map((p) => ({ pack: p.id, mails: p.mails, priceSek: p.priceSek })), purchases };
  },
});

export const buyMailCredits = defineAction({
  name: "buy_mail_credits",
  title: "Buy mail credits",
  description: "A Stripe payment link for a pack of mail credits. Give the link to the person: they pay in their browser, and the credits land on their account. Nothing is charged until they pay.",
  access: "user",
  effect: "write",
  input: z.object({ pack: z.enum(PACKS.map((p) => p.id)).describe(PACKS.map((p) => `${p.id} = ${p.mails} mails for ${p.priceSek} kr`).join(", ")) }),
  run: async ({ pack }, { caller }) => {
    const p = packById(pack);
    if (!process.env.STRIPE_SECRET_KEY) throw new ActionError("failed", "Payments aren't set up on this server.");
    const url = await checkoutUrl({ hostId: caller.hostId, email: caller.email, pack: p, frontendUrl: getFrontendUrl(), returnPath: "/admin/mail" });
    return { paymentUrl: url, pack: p.id, mails: p.mails, priceSek: p.priceSek, note: "Open the link to pay. Credits never expire." };
  },
});

export default [listPeopleAction, previewMail, sendMailAction, listSentMail, getMailCredits, buyMailCredits];
