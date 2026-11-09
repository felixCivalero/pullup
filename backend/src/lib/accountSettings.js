// One organiser account's settings, set by the owner on /admin/platform
// (table account_settings, migs 163–164). Both sides of a customer deal:
//
//   limits   mailBlocked, publishBlocked, maxEvents — stop an account
//   perks    billing "invoice" with a creditLimit (send now, PullUp invoices
//            after, no Stripe), its own pricePer1000Sek, trusted (ten times
//            the hourly cap on free confirmation mails), hideBranding (no
//            "Gjord med PullUp" on its pages), features (early access)
//   the deal company, orgNumber, contactName, billingEmail, invoiceRef,
//            dpaSignedAt, contractUntil, note
//
// Checked where the account sends, publishes, creates and gets sign-ups.
// The owner's own calls are never limited. A short cache keeps sign-ups from
// reading the table every time; the owner's change clears it.
import { supabase } from "../supabase.js";
import { ActionError } from "./actionError.js";
import { PACKS, creditBalance } from "./emailCredits.js";

// The invoice price when none is set: the small pack's (99 kr / 5 000).
export const LIST_PRICE_PER_1000 = Math.round((PACKS[0].priceSek / PACKS[0].mails) * 1000 * 100) / 100;
export const VAT = 0.25;
export const FEATURES = ["early_access", "custom_domain", "priority_support"];

export const DEFAULTS = Object.freeze({
  mailBlocked: false, publishBlocked: false, maxEvents: null,
  billing: "stripe", creditLimit: 0, pricePer1000Sek: null, trusted: false, hideBranding: false, features: [],
  company: null, orgNumber: null, contactName: null, billingEmail: null, invoiceRef: null, dpaSignedAt: null, contractUntil: null,
  note: null, updatedAt: null,
});
// Kept for the limits' callers and tests.
export const NO_LIMITS = DEFAULTS;

export const shapeSettings = (row) =>
  row
    ? {
        mailBlocked: !!row.mail_blocked, publishBlocked: !!row.publish_blocked, maxEvents: row.max_events ?? null,
        billing: row.billing || "stripe", creditLimit: row.credit_limit || 0,
        pricePer1000Sek: row.price_per_1000_sek == null ? null : Number(row.price_per_1000_sek),
        trusted: !!row.trusted, hideBranding: !!row.hide_branding, features: row.features || [],
        company: row.company || null, orgNumber: row.org_number || null, contactName: row.contact_name || null,
        billingEmail: row.billing_email || null, invoiceRef: row.invoice_ref || null,
        dpaSignedAt: row.dpa_signed_at || null, contractUntil: row.contract_until || null,
        note: row.note || null, updatedAt: row.updated_at || null,
      }
    : DEFAULTS;
export const shapeLimits = shapeSettings;

// What this account pays per 1 000 sends on an invoice.
export const priceFor = (s) => (s?.pricePer1000Sek == null ? LIST_PRICE_PER_1000 : s.pricePer1000Sek);
// How far below zero an account's balance may go.
export const floorFor = (s) => (s?.billing === "invoice" ? -(s.creditLimit || 0) : 0);

const TTL = 30_000;
const cache = new Map(); // hostId → { at, settings }

export async function settingsFor(hostId, now = Date.now()) {
  if (!hostId) return DEFAULTS;
  const hit = cache.get(hostId);
  if (hit && now - hit.at < TTL) return hit.settings;
  const { data, error } = await supabase.from("account_settings").select("*").eq("host_id", hostId).maybeSingle();
  // A failed read must not stop a real organiser: defaults, and say so.
  if (error) { console.error("[settings] read failed:", error.message); return DEFAULTS; }
  const settings = shapeSettings(data);
  cache.set(hostId, { at: now, settings });
  return settings;
}
export const limitsFor = settingsFor;
export const forgetSettings = (hostId) => (hostId ? cache.delete(hostId) : cache.clear());
export const forgetLimits = forgetSettings;

const text = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);
const date = (v) => {
  if (v == null || v === "") return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined;
};
const whole = (v, max) => {
  if (v === null || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : undefined;
};

// The owner's change: only the fields given, each checked. null = a field
// was given but wrong (→ 400), with the field's name in `bad`.
export function settingsPatch(body = {}) {
  const patch = {};
  const bad = [];
  for (const [k, col] of [["mailBlocked", "mail_blocked"], ["publishBlocked", "publish_blocked"], ["trusted", "trusted"], ["hideBranding", "hide_branding"]]) {
    if (typeof body[k] === "boolean") patch[col] = body[k];
  }
  if ("maxEvents" in body) { const n = whole(body.maxEvents, 100000); n === undefined ? bad.push("maxEvents") : (patch.max_events = n); }
  if ("billing" in body) { ["stripe", "invoice"].includes(body.billing) ? (patch.billing = body.billing) : bad.push("billing"); }
  if ("creditLimit" in body) { const n = whole(body.creditLimit ?? 0, 10000000); n === undefined ? bad.push("creditLimit") : (patch.credit_limit = n ?? 0); }
  if ("pricePer1000Sek" in body) {
    const v = body.pricePer1000Sek;
    if (v === null || v === "") patch.price_per_1000_sek = null;
    else { const n = Number(String(v).replace(",", ".")); Number.isFinite(n) && n >= 0 && n <= 100000 ? (patch.price_per_1000_sek = Math.round(n * 100) / 100) : bad.push("pricePer1000Sek"); }
  }
  if ("features" in body) {
    Array.isArray(body.features) && body.features.every((f) => FEATURES.includes(f)) ? (patch.features = [...new Set(body.features)]) : bad.push("features");
  }
  for (const [k, col, max] of [["company", "company", 200], ["orgNumber", "org_number", 40], ["contactName", "contact_name", 200], ["billingEmail", "billing_email", 200], ["invoiceRef", "invoice_ref", 200], ["note", "note", 2000]]) {
    if (k in body) patch[col] = text(body[k], max);
  }
  if (patch.billing_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.billing_email)) bad.push("billingEmail");
  for (const [k, col] of [["dpaSignedAt", "dpa_signed_at"], ["contractUntil", "contract_until"]]) {
    if (k in body) { const d = date(body[k]); d === undefined ? bad.push(k) : (patch[col] = d); }
  }
  return bad.length ? { bad } : { patch };
}
// Kept for the limits' tests: the patch, or null when something is wrong.
export const limitsPatch = (body) => { const r = settingsPatch(body); return r.bad ? null : r.patch; };

export async function setSettings(hostId, body) {
  const { patch, bad } = settingsPatch(body);
  if (bad) throw new ActionError("invalid", `Check these fields: ${bad.join(", ")}.`, { detail: bad.join(",") });
  const { data, error } = await supabase.from("account_settings")
    .upsert({ host_id: hostId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "host_id" })
    .select("*").single();
  if (error) throw error;
  forgetSettings(hostId);
  return shapeSettings(data);
}
export const setLimits = setSettings;

// What an account can send right now and how it pays: the ledger balance,
// plus the credit limit for an invoice customer.
export async function creditsView(hostId) {
  const [balance, s] = await Promise.all([creditBalance(hostId), settingsFor(hostId)]);
  const invoice = s.billing === "invoice";
  return {
    balance,
    available: balance - floorFor(s),
    billing: s.billing,
    creditLimit: invoice ? s.creditLimit : 0,
    // Sent past zero and not yet invoiced (also after a switch back to card).
    unbilled: Math.max(0, -balance),
    pricePer1000Sek: priceFor(s),
  };
}

export async function hasFeature(hostId, feature) {
  return (await settingsFor(hostId)).features.includes(feature);
}

// Guards, for the places the account acts. `caller.isOwner` passes.
export async function assertMayMail(caller, hostId) {
  if (caller?.isOwner) return;
  if ((await settingsFor(hostId)).mailBlocked) throw new ActionError("forbidden", "Mail is paused for this account. Contact PullUp.", { detail: "mail_blocked" });
}

export async function assertMayPublish(caller, hostId) {
  if (caller?.isOwner) return;
  if ((await settingsFor(hostId)).publishBlocked) throw new ActionError("forbidden", "Publishing is paused for this account. Contact PullUp.", { detail: "publish_blocked" });
}

export async function assertMayCreate(caller, hostId) {
  if (caller?.isOwner) return;
  const { maxEvents } = await settingsFor(hostId);
  if (maxEvents == null) return;
  const { count, error } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("host_id", hostId).or("kind.is.null,kind.eq.event");
  if (error) throw error;
  if ((count || 0) >= maxEvents) throw new ActionError("forbidden", `This account can have at most ${maxEvents} events. Contact PullUp.`, { detail: "max_events" });
}
