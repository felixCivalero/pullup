// Brands: one login, several brands. An account (a person who signs in) owns
// its brands; every event belongs to one of them, and the guests, the CRM and
// the mail follow the brand — a guest who said yes to hearing from Aperol said
// yes to Aperol, not to everything the account runs. Mail credits stay with
// the account (it's the one paying). See migrations/149.
//
// Which brand a request works in: the one the browser picked (header
// X-PullUp-Brand, or an assistant's `brand` input) when it's one the caller
// may work in, otherwise the first. Anything else is ignored, never trusted.
//
// Working together (migrations/151, lib/teams.js): the account that owns a
// brand is its head; people the head invites are members and work in it like
// the head (on the head's mail credits). Someone can also be co-host of
// single events (event_hosts): the event's brand then shows for them with
// only those events in it. A caller's brands carry role head | member | event,
// the brand's owning account (hostId) and, for event, which events.
import { supabase } from "../supabase.js";
import { ActionError } from "./actionError.js";

export const MAX_BRANDS = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A brand name as typed: one line, trimmed, 1–80 characters, no control
// characters (it ends up in mail headers as the sender's name).
export function cleanBrandName(v) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f"<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export const brandShape = (b) => ({ id: b.id, name: b.name, role: b.role || "head" });

// May invite and remove people, rename: the head. May create events, see the
// whole brand and mail it: head and members. An event co-host works on their
// events only.
export const isHead = (brand) => brand?.role === "head";
export const isTeam = (brand) => brand?.role === "head" || brand?.role === "member";

// Pick the brand: by id, then by name (case-insensitive, for assistants),
// else the first. Null when the account has none yet.
export function pickBrand(brands, requested) {
  if (!brands.length) return null;
  const want = typeof requested === "string" ? requested.trim() : "";
  if (want) {
    const byId = UUID.test(want) && brands.find((b) => b.id === want);
    if (byId) return byId;
    const byName = brands.find((b) => b.name.toLowerCase() === want.toLowerCase());
    if (byName) return byName;
  }
  return brands[0];
}

export async function listBrands(hostId) {
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, sort_order, created_at")
    .eq("host_id", hostId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

const byName = (a, b) => a.name.localeCompare(b.name, "sv");

// Every brand the caller may work in: their own (head), the ones they're a
// member of, then the brands of single events shared with them. The owner
// sees every event anyway, so his are only his own.
export async function accessibleBrands(caller) {
  const own = (await listBrands(caller.hostId)).map((b) => ({ ...b, hostId: caller.hostId, role: "head" }));
  if (caller.isOwner) return own;
  const [members, cohosts] = await Promise.all([
    supabase.from("brand_members").select("brand_id").eq("user_id", caller.userId),
    supabase.from("event_hosts").select("event_id, role").eq("user_id", caller.userId).neq("role", "owner"),
  ]);
  if (members.error) throw members.error;
  if (cohosts.error) throw cohosts.error;
  const seen = new Set(own.map((b) => b.id));
  const member = [];
  const memberIds = (members.data || []).map((r) => r.brand_id).filter((id) => !seen.has(id));
  if (memberIds.length) {
    const { data, error } = await supabase.from("brands").select("id, name, host_id").in("id", memberIds.slice(0, 200)).neq("host_id", caller.hostId);
    if (error) throw error;
    for (const b of data || []) {
      member.push({ id: b.id, name: b.name, hostId: b.host_id, role: "member" });
      seen.add(b.id);
    }
  }
  const shared = new Map(); // brand id → { brand, eventIds }
  const eventIds = (cohosts.data || []).map((r) => r.event_id);
  if (eventIds.length) {
    const { data: evs, error } = await supabase.from("events").select("id, brand_id, host_id").in("id", eventIds.slice(0, 500)).neq("host_id", caller.hostId);
    if (error) throw error;
    for (const ev of evs || []) {
      if (!ev.brand_id || seen.has(ev.brand_id)) continue;
      const s = shared.get(ev.brand_id) || { hostId: ev.host_id, eventIds: [] };
      s.eventIds.push(ev.id);
      shared.set(ev.brand_id, s);
    }
  }
  const names = await brandNames([...shared.keys()]);
  const event = [...shared].filter(([id]) => names.has(id))
    .map(([id, s]) => ({ id, name: names.get(id), hostId: s.hostId, role: "event", eventIds: s.eventIds }));
  return [...own, ...member.sort(byName), ...event.sort(byName)];
}

// The caller's brands and the one this request works in, read once per
// request and kept on the caller. → { brands, brand } (brand null: none yet).
export async function brandScope(caller) {
  if (!caller._brandScope) {
    caller._brandScope = accessibleBrands(caller).then((brands) => ({
      brands,
      brand: pickBrand(brands, caller.requestedBrand),
    }));
  }
  return caller._brandScope;
}

// Whose mail credits a request spends and tops up: the brand's head's (a
// member mails on the head's account), the owner's own.
export async function payerFor(caller) {
  if (caller.isOwner) return caller.hostId;
  const { brand } = await brandScope(caller);
  return isTeam(brand) ? brand.hostId : caller.hostId;
}

// Every account whose credits the caller may spend (a purchase coming back
// from Stripe is checked against these).
export async function payersFor(caller) {
  if (caller.isOwner) return [caller.hostId];
  const { brands } = await brandScope(caller);
  return [...new Set([caller.hostId, ...brands.filter(isTeam).map((b) => b.hostId)])];
}

// The brand to work in, or an error an organiser (or assistant) can act on.
export async function currentBrand(caller) {
  const { brand } = await brandScope(caller);
  if (!brand) throw new ActionError("invalid", "This account has no brand yet. Create one first (create_brand, or the start page on pullup.se).", { detail: "no_brand" });
  return brand;
}

export async function createBrand(caller, rawName) {
  const name = cleanBrandName(rawName);
  if (!name) throw new ActionError("invalid", "The brand needs a name.", { detail: "name" });
  const brands = await listBrands(caller.hostId);
  if (brands.length >= MAX_BRANDS) throw new ActionError("invalid", `An account can have at most ${MAX_BRANDS} brands.`, { detail: "too_many" });
  const same = brands.find((b) => b.name.toLowerCase() === name.toLowerCase());
  if (same) return brandShape(same);
  const { data, error } = await supabase
    .from("brands")
    .insert({ host_id: caller.hostId, name, sort_order: brands.length })
    .select("id, name")
    .single();
  if (error) throw error;
  caller._brandScope = null;
  return brandShape(data);
}

export async function renameBrand(caller, id, rawName) {
  const name = cleanBrandName(rawName);
  if (!name) throw new ActionError("invalid", "The brand needs a name.", { detail: "name" });
  if (!UUID.test(String(id || ""))) throw new ActionError("not_found", "No brand with that id.");
  const { brands } = await brandScope(caller);
  const known = brands.find((b) => b.id === id);
  if (known && !isHead(known)) throw new ActionError("forbidden", "Only the brand's head can rename it.");
  const { data, error } = await supabase
    .from("brands")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("host_id", caller.hostId)
    .select("id, name")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ActionError("not_found", "No brand with that id.");
  caller._brandScope = null;
  return brandShape(data);
}

// A brand's name by id, for pages and mail that show who the organiser is.
export async function brandNames(ids) {
  const unique = [...new Set(ids.filter((id) => UUID.test(String(id || ""))))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from("brands").select("id, name").in("id", unique.slice(0, 500));
  if (error) throw error;
  return new Map((data || []).map((b) => [b.id, b.name]));
}
