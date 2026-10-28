// Brands: one login, several brands. An account (a person who signs in) owns
// its brands; every event belongs to one of them, and the guests, the CRM and
// the mail follow the brand — a guest who said yes to hearing from Aperol said
// yes to Aperol, not to everything the account runs. Mail credits stay with
// the account (it's the one paying). See migrations/149.
//
// Which brand a request works in: the one the browser picked (header
// X-PullUp-Brand, or an assistant's `brand` input) when it's one of the
// account's own, otherwise the first. Anything else is ignored, never trusted.
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

export const brandShape = (b) => ({ id: b.id, name: b.name });

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

// The caller's brands and the one this request works in, read once per
// request and kept on the caller. → { brands, brand } (brand null: none yet).
export async function brandScope(caller) {
  if (!caller._brandScope) {
    caller._brandScope = listBrands(caller.hostId).then((brands) => ({
      brands,
      brand: pickBrand(brands, caller.requestedBrand),
    }));
  }
  return caller._brandScope;
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
