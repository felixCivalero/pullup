// An organiser's people and mail: the CRM, who a send would reach, sending
// (paid per recipient — never free), earlier sends, and buying credits.
import { z } from "zod";
import { defineAction } from "./registry.js";
import { ActionError } from "../lib/actionError.js";
import { PACKS, creditBalance, checkoutUrl, packById, recentPurchases } from "../lib/emailCredits.js";
import { getFrontendUrl } from "../lib/urls.js";
import { listPeople, listSends, previewSend, sendMail } from "../repos/hostEvents.js";
import { brandInput, inBrand } from "./events.js";
import { brandScope, payerFor } from "../lib/brands.js";
import { DPA_VERSION, importContacts } from "../repos/imports.js";
import { getSender, setSender, verifySender } from "../lib/senders.js";

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
  description: "Everyone who signed up to the brand's events: name, email, how many events, how many they came to, last event, whose brands' events they came to and which brands they said yes to hearing from (consent is per brand). A main brand over other brands holds all their people (filter with onlyBrand). Filter with search or eventId.",
  access: "user",
  effect: "read",
  untrustedOutput: true,
  input: z.object({
    brand: brandInput,
    search: z.string().trim().max(100).optional().describe("Name or email contains this."),
    eventId: z.guid().optional().describe("Only people signed up to this event."),
    onlyBrand: z.string().trim().max(100).optional().describe("A main brand's CRM: only people from this brand under it (id or name)."),
    limit: z.number().int().min(1).max(500).default(100),
  }),
  run: async ({ brand, search, eventId, onlyBrand, limit }, { caller }) => {
    const scoped = inBrand(caller, brand);
    const [{ people }, { brands }] = await Promise.all([listPeople(scoped), brandScope(scoped)]);
    const nameOf = (id) => brands.find((b) => b.id === id)?.name || id;
    const needle = (search || "").toLowerCase();
    const rows = people
      .filter((p) => !needle || `${p.name} ${p.email}`.toLowerCase().includes(needle))
      .filter((p) => !eventId || p.eventIds.includes(eventId))
      .filter((p) => !onlyBrand || p.brandIds.some((id) => id === onlyBrand || nameOf(id).toLowerCase() === onlyBrand.toLowerCase()));
    return {
      total: rows.length,
      // brands: whose events they signed up to; yesTo: which brands they
      // said yes to hearing from (consent is per brand).
      people: rows.slice(0, limit).map(({ eventIds, cameIds, brandIds, consentBrands, ...p }) => ({ ...p, brands: brandIds.map(nameOf), yesTo: consentBrands.map(nameOf) })),
    };
  },
});

export const previewMail = defineAction({
  name: "preview_mail",
  title: "Who would a mail reach",
  description: "Before sending: how many people an audience reaches (unsubscribed, blocked and bounced addresses are left out), a few names, and whether the mail credits cover it.",
  access: "user",
  effect: "read",
  input: z.object({ brand: brandInput, audience }),
  run: async ({ brand, audience: a }, { caller }) => {
    const [preview, balance] = await Promise.all([previewSend(inBrand(caller, brand), a), creditBalance(await payerFor(inBrand(caller, brand)))]);
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
    brand: brandInput,
    audience,
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(20000).describe("Plain text. Blank lines make paragraphs. An unsubscribe link is added."),
    eventId: z.guid().optional().describe("Attach this event: the mail gets its card and a link to sign up."),
    fromName: z.string().trim().max(60).optional().describe("Owner only: the sender name. An organiser's mail is always sent in its brand's name."),
    test: z.boolean().default(false).describe("Send one copy to the signed-in person only."),
  }),
  run: async (input, { caller }) => {
    const out = await sendMail(inBrand(caller, input.brand), input);
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
    const payer = await payerFor(caller);
    const [balance, purchases] = await Promise.all([creditBalance(payer), recentPurchases(payer)]);
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
    const url = await checkoutUrl({ hostId: await payerFor(caller), email: caller.email, pack: p, frontendUrl: getFrontendUrl(), returnPath: "/admin/mail" });
    return { paymentUrl: url, pack: p.id, mails: p.mails, priceSek: p.priceSek, note: "Open the link to pay. Credits never expire." };
  },
});

export const importContactsAction = defineAction({
  name: "import_contacts",
  title: "Bring in a brand's contacts",
  description: `Bring a brand's own contacts into its CRM (an old newsletter list, a customer register): name, email, phone, Instagram, and whether each said yes to mail from this brand (consent is per brand; a yes is never taken back by an import). Say where the list comes from and how they said yes (source). The organiser must have read and accepted PullUp's data processing agreement (shown at pullup.se/admin/people/import, version ${DPA_VERSION}): pass dpaAccepted only when they have. Into a brand, not a main brand over other brands.`,
  access: "user",
  effect: "write",
  input: z.object({
    brand: brandInput,
    source: z.string().trim().min(2).max(200).describe("Where the list comes from and how they said yes, e.g. 'Mailchimp newsletter, double opt-in 2023'."),
    allConsent: z.boolean().default(false).describe("Everyone on the list said yes to mail from this brand."),
    dpaAccepted: z.literal(true).describe("The organiser has read and accepted the data processing agreement."),
    rows: z.array(z.object({
      email: z.string().max(254), name: z.string().max(120).optional(), phone: z.string().max(40).optional(),
      instagram: z.string().max(80).optional(), consent: z.boolean().optional(),
    })).min(1).max(5000),
  }),
  run: async (input, { caller }) => importContacts(caller, input),
});

export const getSenderAction = defineAction({
  name: "get_sender",
  title: "A brand's mail sender",
  description: "What a brand's mail goes out from: its own address (when its domain is verified) or no-reply@pullup.se under the brand's name, the reply-to, and while pending the DNS records to add at the domain.",
  access: "user",
  effect: "read",
  input: z.object({ brand: brandInput }),
  run: async ({ brand }, { caller }) => ({ sender: await getSender(caller, brand) }),
});

export const setSenderAction = defineAction({
  name: "set_sender",
  title: "Set a brand's mail sender",
  description: "Send a brand's mail from its own address (on a domain it owns, e.g. news@brand.com; not a free mail address) and/or set where replies land. Returns DNS records to add at the domain's host; then verify_sender. Empty email = back to no-reply@pullup.se. The brand's owner only.",
  access: "user",
  effect: "write",
  input: z.object({ brand: brandInput, email: z.string().trim().max(254).optional(), replyTo: z.string().trim().max(254).optional() }),
  run: async ({ brand, email, replyTo }, { caller }) => ({ sender: await setSender(caller, { brand, email, replyTo }) }),
});

export const verifySenderAction = defineAction({
  name: "verify_sender",
  title: "Check a brand's sender domain",
  description: "Check the DNS records for a brand's sender address now; once verified, its mail goes from that address.",
  access: "user",
  effect: "write",
  idempotent: true,
  input: z.object({ brand: brandInput }),
  run: async ({ brand }, { caller }) => ({ sender: await verifySender(caller, brand) }),
});

export default [importContactsAction, getSenderAction, setSenderAction, verifySenderAction, listPeopleAction, previewMail, sendMailAction, listSentMail, getMailCredits, buyMailCredits];
