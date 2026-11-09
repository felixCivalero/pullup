// Felix's tools for running the event tool's customers, for Felix's
// assistant only (access "owner"): the same functions as /admin/platform
// (routes/adminPlatform.js, lib/accountSettings.js, lib/accountInvoices.js).
// An account is named by its id or its e-mail address.
import { z } from "zod";
import { defineAction } from "./registry.js";
import { ActionError } from "../lib/actionError.js";
import {
  accountDetail, findAccountId, giveCredits, platformStats, setBanned, setEventStatus,
} from "../routes/adminPlatform.js";
import { FEATURES, setSettings } from "../lib/accountSettings.js";
import { createInvoice, setInvoiceStatus, unbilledFor } from "../lib/accountInvoices.js";

const accountRef = z.string().min(3).max(200).describe("The account's id or e-mail address.");

async function idOf(ref) {
  const id = await findAccountId(ref);
  if (!id) throw new ActionError("not_found", `No organiser account "${ref}".`);
  return id;
}

// Errors from the shared functions carry a code; say them in words.
const plain = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (err) {
    if (err instanceof ActionError) throw err;
    if (err?.code === "invalid") throw new ActionError("invalid", "That value isn't allowed.");
    if (err?.code === "below_zero") throw new ActionError("invalid", "The account doesn't have that many credits.");
    if (err?.code === "not_found") throw new ActionError("not_found", "Not found.");
    if (err?.code === "owner") throw new ActionError("forbidden", "Not on the owner's own account.");
    throw err;
  }
};

export const platformAccounts = defineAction({
  name: "platform_accounts",
  title: "Event tool accounts",
  description: "Every organiser account on the event tool with its brands, events, sign-ups, mail credits, its deal (billing stripe/invoice, credit limit, price, perks, limits) and signals worth acting on (contract ending, credit limit near, unbilled sends, unpaid invoices, events soon with no sign-ups). Plus billing totals: what's left to invoice and open invoices. Use first to get an overview or find an account.",
  access: "owner",
  effect: "read",
  untrustedOutput: true,
  input: z.object({ onlyWithSignals: z.boolean().default(false).describe("Only accounts with something to act on.") }),
  run: async ({ onlyWithSignals }) => {
    const { totals, billing, accounts } = await platformStats();
    const list = accounts
      .filter((a) => !onlyWithSignals || a.signals.length)
      .map(({ eventList: _e, limits: _l, ...a }) => a);
    return { totals, billing, accounts: list };
  },
});

export const platformAccount = defineAction({
  name: "platform_account",
  title: "One event tool account",
  description: "Everything about one organiser account: profile, brands and team, every event with visitors, sign-ups, who came and conversion, visit sources, mail sent, credits and ledger, contacts and imports, the data agreement, its deal and limits, invoices and signals.",
  access: "owner",
  effect: "read",
  untrustedOutput: true,
  input: z.object({ account: accountRef }),
  run: async ({ account }) => {
    const d = await accountDetail(await idOf(account));
    if (!d) throw new ActionError("not_found", "No such account.");
    const { daily: _daily, limits: _limits, ...rest } = d;
    return rest;
  },
});

export const platformUpdateAccount = defineAction({
  name: "platform_update_account",
  title: "Change an account's deal and limits",
  description: "Set an organiser account's settings; only the fields given change. The deal: billing \"invoice\" (sends on a credit limit, PullUp invoices afterwards, no Stripe) or \"stripe\"; creditLimit (sends allowed below zero); pricePer1000Sek (invoice price ex VAT, null = list price 12). Perks: trusted (10x the hourly cap on free confirmation mails, for big launches), hideBranding (no \"Gjord med PullUp\" on its pages), features. The agreement: company, orgNumber, contactName, billingEmail, invoiceRef, dpaSignedAt and contractUntil (YYYY-MM-DD), note. Limits: mailBlocked, publishBlocked, maxEvents (null = none). Confirm money and limits with Felix before changing them.",
  access: "owner",
  effect: "write",
  idempotent: true,
  input: z.object({
    account: accountRef,
    billing: z.enum(["stripe", "invoice"]).optional(),
    creditLimit: z.number().int().min(0).max(10000000).optional(),
    pricePer1000Sek: z.number().min(0).max(100000).nullable().optional(),
    trusted: z.boolean().optional(),
    hideBranding: z.boolean().optional(),
    features: z.array(z.enum(FEATURES)).optional(),
    company: z.string().max(200).nullable().optional(),
    orgNumber: z.string().max(40).nullable().optional(),
    contactName: z.string().max(200).nullable().optional(),
    billingEmail: z.string().max(200).nullable().optional(),
    invoiceRef: z.string().max(200).nullable().optional(),
    dpaSignedAt: z.string().max(10).nullable().optional(),
    contractUntil: z.string().max(10).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
    mailBlocked: z.boolean().optional(),
    publishBlocked: z.boolean().optional(),
    maxEvents: z.number().int().min(0).max(100000).nullable().optional(),
  }),
  run: async ({ account, ...fields }) => ({ settings: await setSettings(await idOf(account), fields) }),
});

export const platformGiveCredits = defineAction({
  name: "platform_give_credits",
  title: "Give or take mail credits",
  description: "Add mail credits to an organiser account by hand (a customer set up outside Stripe), or take some back with a negative count (never below zero). Logged in the credit ledger with the note.",
  access: "owner",
  effect: "write",
  input: z.object({ account: accountRef, count: z.number().int().min(-1000000).max(1000000).refine((n) => n !== 0, "not zero"), note: z.string().max(200).default("") }),
  run: plain(async ({ account, count, note }) => ({ balance: await giveCredits(await idOf(account), count, note) })),
});

export const platformUnbilled = defineAction({
  name: "platform_unbilled",
  title: "What an invoice would hold",
  description: "For an invoice customer: the sends since the last invoice that went past the balance, per brand, at its price, with VAT — what platform_create_invoice would bill now.",
  access: "owner",
  effect: "read",
  input: z.object({ account: accountRef }),
  run: async ({ account }) => unbilledFor(await idOf(account)),
});

export const platformCreateInvoice = defineAction({
  name: "platform_create_invoice",
  title: "Make an invoice basis",
  description: "Make the invoice basis for an invoice customer's unbilled sends (number PU-YYYY-NNNN, lines per brand, VAT) and set its balance back to zero. Felix sends the actual invoice from his bookkeeping; mark it with platform_invoice_status. Ask Felix first.",
  access: "owner",
  effect: "write",
  input: z.object({ account: accountRef, note: z.string().max(500).optional() }),
  run: async ({ account, note }) => ({ invoice: await createInvoice(await idOf(account), { note }) }),
});

export const platformInvoiceStatus = defineAction({
  name: "platform_invoice_status",
  title: "Mark an invoice",
  description: "Mark an invoice basis sent, paid or void (void puts its sends back as unbilled, for the next invoice). Ids are in platform_account's invoices.",
  access: "owner",
  effect: "write",
  input: z.object({ invoiceId: z.string().uuid(), status: z.enum(["draft", "sent", "paid", "void"]) }),
  run: async ({ invoiceId, status }) => ({ invoice: await setInvoiceStatus(invoiceId, status) }),
});

export const platformSetLogin = defineAction({
  name: "platform_set_login",
  title: "Stop or allow an account's login",
  description: "Stop an organiser account from logging in (banned: true) or let it back in (false). Its published pages stay up. Only on Felix's explicit word.",
  access: "owner",
  effect: "write",
  input: z.object({ account: accountRef, banned: z.boolean() }),
  run: plain(async ({ account, banned }) => ({ banned: await setBanned(await idOf(account), banned) })),
});

export const platformEventStatus = defineAction({
  name: "platform_event_status",
  title: "Publish or unpublish an organiser's event",
  description: "Unpublish (DRAFT) or publish (PUBLISHED) any organiser's event by id (ids in platform_account's events). Unpublished, its page can't be reached. Only on Felix's explicit word.",
  access: "owner",
  effect: "write",
  input: z.object({ eventId: z.string().uuid(), status: z.enum(["PUBLISHED", "DRAFT"]) }),
  run: plain(async ({ eventId, status }) => ({ status: await setEventStatus(eventId, status) })),
});

export default [
  platformAccounts, platformAccount, platformUpdateAccount, platformGiveCredits, platformUnbilled,
  platformCreateInvoice, platformInvoiceStatus, platformSetLogin, platformEventStatus,
];
