// A brand's own contacts, brought in (an old newsletter list, a customer
// register; people.import_source "csv", where it came from in data_imports): people by email, each with whether they said yes to mail from
// this brand — consent stays per brand, as with sign-ups (migrations/157).
// Accepting the data processing agreement (DPA_VERSION, the text is shown on
// the import page) is part of every import and is kept with it.
import { supabase } from "../supabase.js";
import { ActionError } from "../lib/actionError.js";
import { brandScope, currentBrand, isTeam } from "../lib/brands.js";
import { isValidEmail, normalizeEmail } from "../lib/emailAddress.js";
import { normalizeInstagram, normalizePhone } from "../lib/eventForm.js";
import { brandsUnder } from "./hostEvents.js";

export const DPA_VERSION = "2026-11-03";
export const MAX_IMPORT_ROWS = 20000;

const E164 = /^\+[1-9]\d{6,14}$/;
const clip = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n) : "");
const truthy = (v) => v === true || /^(1|ja|yes|true|y|x|opt-?in|samtycke|consent)$/i.test(String(v ?? "").trim());

// The rows as given → one per address (a yes anywhere counts), and what was
// left out and why. Pure, tested in tests/imports.test.js.
export function cleanRows(rows, allConsent = false) {
  const byEmail = new Map();
  let invalid = 0;
  for (const r of Array.isArray(rows) ? rows.slice(0, MAX_IMPORT_ROWS) : []) {
    const email = normalizeEmail(clip(r?.email, 254));
    if (!isValidEmail(email)) { invalid += 1; continue; }
    const prev = byEmail.get(email);
    const row = {
      email,
      name: clip(r?.name, 120) || prev?.name || "",
      phone: normalizePhone(r?.phone) || prev?.phone || "",
      instagram: normalizeInstagram(r?.instagram) || prev?.instagram || "",
      consent: allConsent || truthy(r?.consent) || !!prev?.consent,
    };
    byEmail.set(email, row);
  }
  return { rows: [...byEmail.values()], invalid, duplicates: Math.max(0, (Array.isArray(rows) ? Math.min(rows.length, MAX_IMPORT_ROWS) : 0) - invalid - byEmail.size) };
}

async function chunked(list, size, fn) {
  for (let i = 0; i < list.length; i += size) await fn(list.slice(i, i + size));
}

export async function importContacts(caller, input = {}) {
  if (input.dpaAccepted !== DPA_VERSION && input.dpaAccepted !== true) {
    throw new ActionError("invalid", "Accept the data processing agreement first (it's on the import page).", { detail: "dpa" });
  }
  const scoped = input.brand ? { ...caller, requestedBrand: String(input.brand).slice(0, 100), _brandScope: null } : caller;
  const brand = await currentBrand(scoped);
  if (input.brand && brand.id !== input.brand && brand.name.toLowerCase() !== String(input.brand).toLowerCase()) {
    throw new ActionError("not_found", "No brand of yours with that id or name.", { detail: "brand" });
  }
  if (!isTeam(brand)) throw new ActionError("forbidden", "Contacts are brought in by the brand's team.", { detail: "team" });
  const { brands } = await brandScope(scoped);
  if (brandsUnder(brands, brand).length) {
    throw new ActionError("invalid", `${brand.name} is the main brand over other brands: bring contacts into one of them (consent is per brand).`, { detail: "umbrella" });
  }
  const source = clip(input.source, 200);
  if (!source) throw new ActionError("invalid", "Say where the list comes from (and how they said yes).", { detail: "source" });
  const { rows, invalid, duplicates } = cleanRows(input.rows, input.allConsent === true);
  if (!rows.length) throw new ActionError("invalid", "No valid email addresses in the list.", { detail: "empty" });

  const now = new Date().toISOString();
  const { data: imp, error: impErr } = await supabase.from("data_imports").insert({
    brand_id: brand.id, host_id: brand.hostId, imported_by: caller.userId, file_name: clip(input.fileName, 200) || null, source,
    rows_total: rows.length + invalid + duplicates, dpa_version: DPA_VERSION, dpa_accepted_at: now,
  }).select("id").single();
  if (impErr) throw impErr;

  // The people: found by address, or new (marked as imported).
  const found = new Map();
  await chunked(rows.map((r) => r.email), 300, async (emails) => {
    const { data, error } = await supabase.from("people").select("id, email, name, phone, phone_e164, instagram").in("email", emails);
    if (error) throw error;
    for (const p of data || []) found.set(String(p.email).toLowerCase(), p);
  });
  const fresh = rows.filter((r) => !found.has(r.email));
  const asRow = (r) => ({
    email: r.email, name: r.name || null, phone: r.phone || null, phone_e164: E164.test(r.phone) ? r.phone : null, instagram: r.instagram || null,
    import_source: "csv",
  });
  await chunked(fresh, 300, async (part) => {
    const { data, error } = await supabase.from("people").upsert(part.map(asRow), { onConflict: "email", ignoreDuplicates: true }).select("id, email");
    if (!error) {
      for (const p of data || []) found.set(String(p.email).toLowerCase(), p);
      return;
    }
    if (error.code !== "23505") throw error;
    // Someone in the batch exists with other casing: one at a time.
    for (const r of part) {
      const { data: one, error: e1 } = await supabase.from("people").insert(asRow(r)).select("id, email").maybeSingle();
      if (one) found.set(r.email, one);
      else if (e1 && e1.code !== "23505") throw e1;
    }
  });
  // Addresses that raced in (or differ only in case): read them back.
  const missing = rows.filter((r) => !found.has(r.email)).map((r) => r.email);
  for (const email of missing) {
    const { data } = await supabase.from("people").select("id, email, name, phone, instagram").ilike("email", email.replace(/([%_\\])/g, "\\$1")).limit(1).maybeSingle();
    if (data) found.set(email, data);
  }
  // Fill in what an existing person is missing; never overwrite.
  const fills = rows.map((r) => [r, found.get(r.email)]).filter(([r, p]) => p && ((!p.name && r.name) || (!p.phone && !p.phone_e164 && r.phone) || (!p.instagram && r.instagram)));
  await chunked(fills, 20, (part) => Promise.all(part.map(([r, p]) => supabase.from("people").update({
    ...(!p.name && r.name ? { name: r.name } : {}),
    ...(!p.phone && !p.phone_e164 && r.phone ? { phone: r.phone, ...(E164.test(r.phone) ? { phone_e164: r.phone } : {}) } : {}),
    ...(!p.instagram && r.instagram ? { instagram: r.instagram } : {}),
  }).eq("id", p.id))));

  // The brand's contacts: a yes is kept (an import never takes one back).
  const ids = rows.map((r) => found.get(r.email)?.id).filter(Boolean);
  const before = new Map();
  await chunked(ids, 300, async (part) => {
    const { data, error } = await supabase.from("brand_contacts").select("person_id, consent, consent_source, consent_at").eq("brand_id", brand.id).in("person_id", part);
    if (error) throw error;
    for (const c of data || []) before.set(c.person_id, c);
  });
  const contacts = rows.map((r) => {
    const p = found.get(r.email);
    if (!p) return null;
    const had = before.get(p.id);
    const consent = !!had?.consent || r.consent;
    return {
      brand_id: brand.id, person_id: p.id, consent,
      consent_source: had?.consent ? had.consent_source : r.consent ? source : had?.consent_source || null,
      consent_at: had?.consent ? had.consent_at : r.consent ? now : null,
      import_id: had ? undefined : imp.id,
    };
  }).filter(Boolean).map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)));
  await chunked(contacts, 500, async (part) => {
    const { error } = await supabase.from("brand_contacts").upsert(part, { onConflict: "brand_id,person_id" });
    if (error) throw error;
  });

  const summary = {
    // Counted against the brand's own list only: whether an address is
    // known elsewhere on PullUp is never told.
    added: ids.filter((id) => !before.has(id)).length,
    matched: ids.filter((id) => before.has(id)).length,
    consented: contacts.filter((c) => c.consent).length,
    skipped: invalid + duplicates,
  };
  await supabase.from("data_imports").update({ rows_added: summary.added, rows_matched: summary.matched, rows_consented: summary.consented, rows_skipped: summary.skipped }).eq("id", imp.id);
  return { importId: imp.id, brand: { id: brand.id, name: brand.name }, ...summary, invalid, duplicates };
}

// The brand's imports, newest first.
export async function listImports(caller) {
  const brand = await currentBrand(caller);
  const { data, error } = await supabase.from("data_imports")
    .select("id, file_name, source, rows_total, rows_added, rows_matched, rows_consented, rows_skipped, dpa_version, created_at")
    .eq("brand_id", brand.id).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return { imports: data || [], dpaVersion: DPA_VERSION };
}
