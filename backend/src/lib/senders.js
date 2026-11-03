// A brand's own sender address (migrations/158). Until it has one, a brand's
// mail goes from no-reply@pullup.se under the brand's name. With its own
// address — on a domain it owns, verified with Resend by adding the DNS
// records Resend gives — mail goes from that address. Replies land at the
// brand's reply-to (else the person who sent).
import { supabase } from "../supabase.js";
import { ActionError } from "./actionError.js";
import { currentBrand, isHead, isTeam } from "./brands.js";
import { isValidEmail, normalizeEmail } from "./emailAddress.js";

const API = "https://api.resend.com";
const KEY = () => process.env.RESEND_API_KEY || "";
const OURS = /(^|\.)pullup\.se$/i;

async function resend(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json", ...(init.headers || {}) }, signal: AbortSignal.timeout(10000) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new ActionError("failed", out?.message || `The mail provider said no (${res.status}).`, { detail: "resend" });
  return out;
}

// What the brand's mail goes out as. → { from, replyTo } (from null = PullUp's).
export function senderFor(brandRow, name) {
  const clean = String(name || "").replace(/["<>\\\r\n]/g, "").slice(0, 60);
  const own = brandRow?.sender_email && brandRow?.sender_verified_at ? brandRow.sender_email : null;
  return {
    from: own ? `"${clean}" <${own}>` : clean ? `"${clean}" <no-reply@pullup.se>` : null,
    replyTo: brandRow?.reply_to || null,
  };
}

export async function brandSenderRow(brandId) {
  if (!brandId) return null;
  const { data } = await supabase.from("brands").select("id, name, sender_email, sender_domain_id, sender_verified_at, reply_to").eq("id", brandId).maybeSingle();
  return data || null;
}

async function ownBrand(caller, brandRef) {
  const scoped = brandRef ? { ...caller, requestedBrand: String(brandRef).slice(0, 100), _brandScope: null } : caller;
  const brand = await currentBrand(scoped);
  if (brandRef && brand.id !== brandRef && brand.name.toLowerCase() !== String(brandRef).toLowerCase()) throw new ActionError("not_found", "No brand of yours with that id or name.");
  if (!isHead(brand) && !caller.isOwner) throw new ActionError("forbidden", "The brand's owner sets its sender.", { detail: "head" });
  return brand;
}

function shape(row, domain = null) {
  return {
    brandId: row.id,
    email: row.sender_email || null,
    verified: !!row.sender_verified_at,
    replyTo: row.reply_to || null,
    status: domain?.status || (row.sender_verified_at ? "verified" : row.sender_email ? "pending" : "none"),
    // The DNS records to add at the domain's host, as Resend gives them.
    records: (domain?.records || []).map((r) => ({ type: r.type, name: r.name, value: r.value, priority: r.priority ?? null, status: r.status })),
  };
}

// The brand's sender, with the DNS records while it's not verified yet.
export async function getSender(caller, brandRef) {
  const scoped = brandRef ? { ...caller, requestedBrand: String(brandRef).slice(0, 100), _brandScope: null } : caller;
  const brand = await currentBrand(scoped);
  if (!isTeam(brand)) throw new ActionError("forbidden", "The brand's team sees its sender.");
  const row = await brandSenderRow(brand.id);
  if (!row?.sender_domain_id || row.sender_verified_at) return shape(row || { id: brand.id });
  const domain = await resend(`/domains/${row.sender_domain_id}`).catch(() => null);
  return shape(row, domain);
}

// Set the address (and the reply-to). A new domain is added with Resend;
// the records come back to add at the domain's DNS.
export async function setSender(caller, { brand: brandRef, email, replyTo } = {}) {
  const brand = await ownBrand(caller, brandRef);
  const patch = {};
  if (replyTo !== undefined) {
    const r = replyTo ? normalizeEmail(replyTo) : "";
    if (r && !isValidEmail(r)) throw new ActionError("invalid", "The reply-to address doesn't look right.", { detail: "reply_to" });
    patch.reply_to = r || null;
  }
  let domain = null;
  if (email !== undefined) {
    const addr = email ? normalizeEmail(email) : "";
    if (!addr) Object.assign(patch, { sender_email: null, sender_domain_id: null, sender_verified_at: null });
    else {
      if (!isValidEmail(addr)) throw new ActionError("invalid", "The sender address doesn't look right.", { detail: "email" });
      const host = addr.split("@")[1];
      if (OURS.test(host)) throw new ActionError("invalid", "Use an address on your own domain.", { detail: "email" });
      if (/^(gmail|hotmail|outlook|live|yahoo|icloud|me|proton|protonmail)\./i.test(host)) {
        throw new ActionError("invalid", "A free mail address can't be verified as a sender. Use an address on your own domain.", { detail: "email" });
      }
      // The domain with Resend: found if already there, else added.
      const list = await resend("/domains");
      const known = (list.data || []).find((d) => d.name === host);
      domain = known ? await resend(`/domains/${known.id}`) : await resend("/domains", { method: "POST", body: JSON.stringify({ name: host, region: "eu-west-1" }) });
      Object.assign(patch, { sender_email: addr, sender_domain_id: domain.id, sender_verified_at: domain.status === "verified" ? new Date().toISOString() : null });
    }
  }
  if (!Object.keys(patch).length) throw new ActionError("invalid", "Nothing to change.");
  const { data, error } = await supabase.from("brands").update(patch).eq("id", brand.id).select("id, name, sender_email, sender_domain_id, sender_verified_at, reply_to").single();
  if (error) throw error;
  caller._brandScope = null;
  return shape(data, domain);
}

// Ask Resend to check the DNS now; verified → the brand sends from it.
export async function verifySender(caller, brandRef) {
  const brand = await ownBrand(caller, brandRef);
  const row = await brandSenderRow(brand.id);
  if (!row?.sender_domain_id) throw new ActionError("invalid", "Set a sender address first.");
  if (row.sender_verified_at) return shape(row);
  await resend(`/domains/${row.sender_domain_id}/verify`, { method: "POST" }).catch(() => null);
  const domain = await resend(`/domains/${row.sender_domain_id}`);
  if (domain.status === "verified") {
    const { data } = await supabase.from("brands").update({ sender_verified_at: new Date().toISOString() }).eq("id", brand.id).select("id, name, sender_email, sender_domain_id, sender_verified_at, reply_to").single();
    return shape(data, domain);
  }
  return shape(row, domain);
}
