// Invoices for invoice customers (account_settings.billing = "invoice", mig
// 164). Such an account sends on a credit limit: every send takes from the
// ledger as usual and the balance goes below zero. An invoice settles that:
// it bills what was sent past zero since the last one (per brand, from the
// sends' campaign tags), at the account's price, and puts the same number
// back on the ledger (reason "invoice") so the balance is at zero again.
// Felix sends the invoice from his own bookkeeping; PullUp keeps the basis
// (lines + CSV) and whether it's sent and paid. Voiding one takes the sends
// back off the ledger, so they're billed on the next.
import { supabase } from "../supabase.js";
import { selectAllPaged } from "./selectAllPaged.js";
import { ActionError } from "./actionError.js";
import { creditBalance } from "./emailCredits.js";
import { VAT, priceFor, settingsFor } from "./accountSettings.js";

const round2 = (n) => Math.round(n * 100) / 100;
export const amountFor = (sends, pricePer1000) => round2((sends / 1000) * pricePer1000);

export const shapeInvoice = (r) => ({
  id: r.id, number: r.number, periodFrom: r.period_from, periodTo: r.period_to, sends: r.sends,
  pricePer1000Sek: Number(r.price_per_1000_sek), amountSek: Number(r.amount_sek), vatSek: Number(r.vat_sek),
  totalSek: round2(Number(r.amount_sek) + Number(r.vat_sek)), lines: r.lines || [], status: r.status, note: r.note || null,
  createdAt: r.created_at, sentAt: r.sent_at, paidAt: r.paid_at,
});

// Split `total` sends over brands by the sends since `from`: each send's
// campaign tag → the brand it went out for (email_outbox). Pure, for tests.
export function linesFor({ ledger, tagBrand, brandName, total }) {
  const byBrand = new Map();
  for (const r of ledger) {
    if (r.reason !== "send" && r.reason !== "refund") continue;
    const key = tagBrand.get(r.campaign_tag) || null;
    byBrand.set(key, (byBrand.get(key) || 0) - Number(r.delta || 0));
  }
  let lines = [...byBrand].filter(([, n]) => n > 0).map(([id, n]) => ({ brandId: id, brand: (id && brandName.get(id)) || "Övrigt", sends: n }));
  const sum = lines.reduce((a, l) => a + l.sends, 0);
  // Part of the period's sends may have been covered by a balance bought
  // before: bill only `total`, shared in proportion.
  if (sum > total && sum > 0) {
    let left = total;
    lines = lines.map((l, i) => {
      const n = i === lines.length - 1 ? left : Math.round((l.sends / sum) * total);
      left -= n;
      return { ...l, sends: n };
    });
  }
  if (!lines.length && total > 0) lines = [{ brandId: null, brand: "Utskick", sends: total }];
  return lines.filter((l) => l.sends > 0).sort((a, b) => b.sends - a.sends);
}

async function lastInvoice(hostId) {
  const { data, error } = await supabase.from("account_invoices").select("*").eq("host_id", hostId).neq("status", "void").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

// What an invoice made now would hold.
export async function unbilledFor(hostId, now = new Date()) {
  const [settings, balance, last] = await Promise.all([settingsFor(hostId), creditBalance(hostId), lastInvoice(hostId)]);
  const sends = settings.billing === "invoice" ? Math.max(0, -balance) : 0;
  const price = priceFor(settings);
  const from = last?.period_to || null;
  let lines = [];
  if (sends > 0) {
    const ledger = await selectAllPaged(() => {
      let q = supabase.from("email_credit_ledger").select("id, delta, reason, campaign_tag, created_at").eq("host_id", hostId).in("reason", ["send", "refund"]);
      if (from) q = q.gt("created_at", from);
      return q.order("id", { ascending: true });
    });
    const tags = [...new Set(ledger.map((r) => r.campaign_tag).filter(Boolean))];
    const tagBrand = new Map();
    for (let i = 0; i < tags.length; i += 100) {
      const rows = await selectAllPaged(() => supabase.from("email_outbox").select("id, campaign_tag, brand_id").in("campaign_tag", tags.slice(i, i + 100)).not("brand_id", "is", null).order("id", { ascending: true }));
      for (const r of rows) if (!tagBrand.has(r.campaign_tag)) tagBrand.set(r.campaign_tag, r.brand_id);
    }
    const { data: brands } = await supabase.from("brands").select("id, name").eq("host_id", hostId);
    lines = linesFor({ ledger, tagBrand, brandName: new Map((brands || []).map((b) => [b.id, b.name])), total: sends });
  }
  const amount = amountFor(sends, price);
  return {
    billing: settings.billing, sends, pricePer1000Sek: price, amountSek: amount, vatSek: round2(amount * VAT), totalSek: round2(amount * (1 + VAT)),
    periodFrom: from, periodTo: now.toISOString(), creditLimit: settings.creditLimit, available: balance + (settings.billing === "invoice" ? settings.creditLimit : 0),
    lines: lines.map((l) => ({ ...l, amountSek: amountFor(l.sends, price) })),
  };
}

async function nextNumber(now = new Date()) {
  const year = now.getUTCFullYear();
  const { count, error } = await supabase.from("account_invoices").select("id", { count: "exact", head: true }).like("number", `PU-${year}-%`);
  if (error) throw error;
  return `PU-${year}-${String((count || 0) + 1).padStart(4, "0")}`;
}

export async function createInvoice(hostId, { note = null } = {}) {
  const u = await unbilledFor(hostId);
  if (u.billing !== "invoice") throw new ActionError("invalid", "This account pays by card (Stripe), not by invoice.", { detail: "not_invoice" });
  if (u.sends <= 0) throw new ActionError("invalid", "Nothing to invoice: nothing sent past the balance since the last invoice.", { detail: "nothing" });
  const row = {
    host_id: hostId, number: await nextNumber(), period_from: u.periodFrom, period_to: u.periodTo, sends: u.sends,
    price_per_1000_sek: u.pricePer1000Sek, amount_sek: u.amountSek, vat_sek: u.vatSek, lines: u.lines,
    note: note ? String(note).slice(0, 500) : null,
  };
  const { data, error } = await supabase.from("account_invoices").insert(row).select("*").single();
  if (error) throw error;
  const { error: lErr } = await supabase.from("email_credit_ledger").insert({ host_id: hostId, delta: u.sends, reason: "invoice", note: data.number });
  if (lErr) {
    await supabase.from("account_invoices").delete().eq("id", data.id);
    throw lErr;
  }
  return shapeInvoice(data);
}

export async function setInvoiceStatus(id, status) {
  if (!["draft", "sent", "paid", "void"].includes(status)) throw new ActionError("invalid", "Status is draft, sent, paid or void.", { detail: "status" });
  const { data: inv, error } = await supabase.from("account_invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!inv) throw new ActionError("not_found", "No such invoice.");
  if (inv.status === "void") throw new ActionError("invalid", "A void invoice stays void.", { detail: "void" });
  const now = new Date().toISOString();
  const patch = { status, ...(status === "sent" && !inv.sent_at ? { sent_at: now } : {}), ...(status === "paid" ? { paid_at: now, sent_at: inv.sent_at || now } : {}) };
  if (status === "void") {
    const { error: lErr } = await supabase.from("email_credit_ledger").insert({ host_id: inv.host_id, delta: -inv.sends, reason: "invoice", note: `${inv.number} makulerad` });
    if (lErr) throw lErr;
  }
  const { data, error: uErr } = await supabase.from("account_invoices").update(patch).eq("id", id).select("*").single();
  if (uErr) throw uErr;
  return shapeInvoice(data);
}

export async function invoicesFor(hostId) {
  const rows = await selectAllPaged(() => supabase.from("account_invoices").select("*").eq("host_id", hostId).order("created_at", { ascending: false }));
  return rows.map(shapeInvoice);
}

export async function allInvoices() {
  const rows = await selectAllPaged(() => supabase.from("account_invoices").select("*").order("created_at", { ascending: false }));
  return rows.map((r) => ({ ...shapeInvoice(r), hostId: r.host_id }));
}

// The basis as CSV (semicolons and decimal commas, for Swedish Excel).
export function invoiceCsv(inv, settings = {}, email = "") {
  const kr = (n) => Number(n).toFixed(2).replace(".", ",");
  const day = (iso) => (iso ? String(iso).slice(0, 10) : "");
  const cell = (v) => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ["Fakturaunderlag", inv.number],
    ["Kund", settings.company || email],
    ["Org.nr", settings.orgNumber || ""],
    ["Er referens", settings.invoiceRef || settings.contactName || ""],
    ["Fakturamejl", settings.billingEmail || email],
    ["Period", `${day(inv.periodFrom) || "start"} – ${day(inv.periodTo)}`],
    [],
    ["Varumärke", "Utskick", "Pris per 1000 (kr)", "Belopp exkl. moms (kr)"],
    ...inv.lines.map((l) => [l.brand, l.sends, kr(inv.pricePer1000Sek), kr(l.amountSek ?? amountFor(l.sends, inv.pricePer1000Sek))]),
    [],
    ["Summa exkl. moms", "", "", kr(inv.amountSek)],
    [`Moms ${Math.round(VAT * 100)} %`, "", "", kr(inv.vatSek)],
    ["Att betala", "", "", kr(inv.totalSek)],
  ];
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
