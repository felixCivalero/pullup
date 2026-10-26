// Paid marketing mail. A host buys a pack of sends with Stripe Checkout; every
// mail to their list takes one from the balance (email_credit_ledger, mig
// 147). Mail a guest triggers themselves (confirmation, reminder) is free and
// never comes through here.
//
// Price = what the mail costs us (Resend + Stripe) with PullUp's margin on
// top. Prices are ex moms; set STRIPE_VAT_TAX_RATE_ID to add Swedish VAT on
// the Checkout page. Credits never expire.
import crypto from "crypto";
import { supabase } from "../supabase.js";

export const PACKS = [
  { id: "s", mails: 5000, priceSek: 99 },
  { id: "m", mails: 25000, priceSek: 449 },
  { id: "l", mails: 100000, priceSek: 1490 },
];
export const packById = (id) => PACKS.find((p) => p.id === id) || null;

const fmtMails = (n) => n.toLocaleString("sv-SE").replace(/ /g, " ");

// Only our own admin pages are valid places to come back to after paying.
export function safeReturnPath(path) {
  return typeof path === "string" && /^\/admin(\/[\w\-/]*)?(\?[\w\-=&%.]*)?$/.test(path) ? path : "/admin/mail";
}

function withQuery(url, extra) {
  return `${url}${url.includes("?") ? "&" : "?"}${extra}`;
}

// The form body for POST /v1/checkout/sessions.
export function checkoutParams({ pack, hostId, email, frontendUrl, returnPath, taxRateId }) {
  const back = `${frontendUrl}${safeReturnPath(returnPath)}`;
  const p = new URLSearchParams({
    mode: "payment",
    success_url: withQuery(back, "credits=paid&session_id={CHECKOUT_SESSION_ID}"),
    cancel_url: withQuery(back, "credits=cancelled"),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "sek",
    "line_items[0][price_data][unit_amount]": String(pack.priceSek * 100),
    "line_items[0][price_data][product_data][name]": `${fmtMails(pack.mails)} mejlutskick`,
    "line_items[0][price_data][product_data][description]": "Utskick till din lista via PullUp. Går aldrig ut.",
    "metadata[kind]": "email_credits",
    "metadata[host_id]": hostId,
    "metadata[pack]": pack.id,
    "metadata[mails]": String(pack.mails),
    "payment_intent_data[metadata][kind]": "email_credits",
    "payment_intent_data[metadata][host_id]": hostId,
    locale: "sv",
  });
  if (email) p.set("customer_email", email);
  if (taxRateId) p.set("line_items[0][tax_rates][0]", taxRateId);
  return p;
}

// A completed Checkout session → the ledger row it's worth, or null when it
// isn't a paid email-credits session. The pack's size comes from our own
// table, never from the session.
export function creditFromSession(session) {
  if (!session || session.object !== "checkout.session") return null;
  const m = session.metadata || {};
  if (m.kind !== "email_credits" || !m.host_id) return null;
  if (session.payment_status !== "paid") return null;
  const pack = packById(m.pack);
  if (!pack) return null;
  return {
    host_id: m.host_id,
    delta: pack.mails,
    reason: "purchase",
    pack: pack.id,
    amount_sek: (session.amount_total ?? pack.priceSek * 100) / 100,
    stripe_session_id: session.id,
  };
}

// Stripe-Signature: "t=…,v1=…[,v1=…]". HMAC-SHA256 of "t.rawBody".
export function verifyStripeSignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!rawBody || !header || !secret) return false;
  const parts = String(header).split(",").map((kv) => kv.split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  return sigs.some((s) => { const b = Buffer.from(s); return b.length === a.length && crypto.timingSafeEqual(a, b); });
}

async function stripe(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? body.toString() : undefined,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`stripe ${path}: ${res.status} ${out.error?.message || ""}`.trim());
  return out;
}

export const createCheckout = (params) => stripe("checkout/sessions", { method: "POST", body: params });

// A Checkout page for one pack, for this host; the person pays there.
export async function checkoutUrl({ hostId, email, pack, frontendUrl, returnPath }) {
  const session = await createCheckout(checkoutParams({
    pack,
    hostId,
    email,
    frontendUrl,
    returnPath,
    taxRateId: process.env.STRIPE_VAT_TAX_RATE_ID || null,
  }));
  return session.url;
}
export const getCheckout = (id) => stripe(`checkout/sessions/${encodeURIComponent(id)}`);

export async function creditBalance(hostId) {
  const { data, error } = await supabase.rpc("email_credit_balance", { p_host: hostId });
  if (error) throw error;
  return Number(data) || 0;
}

// Take `count` sends, or nothing: the balance left, or null when it's short.
export async function reserveCredits(hostId, count, tag) {
  const { data, error } = await supabase.rpc("reserve_email_credits", { p_host: hostId, p_count: count, p_tag: tag });
  if (error) throw error;
  return data == null ? null : Number(data);
}

export async function refundCredits(hostId, count, tag) {
  if (count <= 0) return;
  const { error } = await supabase.from("email_credit_ledger").insert({ host_id: hostId, delta: count, reason: "refund", campaign_tag: tag });
  if (error) console.error("[credits] refund failed:", tag, count, error.message);
}

// Credit a paid session once, however many times Stripe (webhook) and the
// browser (return page) report it. True when this call added the credits.
export async function recordPurchase(session) {
  const row = creditFromSession(session);
  if (!row) return false;
  const { data, error } = await supabase
    .from("email_credit_ledger")
    .upsert(row, { onConflict: "stripe_session_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return (data || []).length > 0;
}

export async function recentPurchases(hostId) {
  const { data, error } = await supabase
    .from("email_credit_ledger")
    .select("delta, pack, amount_sek, created_at")
    .eq("host_id", hostId)
    .eq("reason", "purchase")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []).map((r) => ({ mails: r.delta, pack: r.pack, amountSek: Number(r.amount_sek), at: r.created_at }));
}
