// Clients repo: the people Felix works for, keyed by the sales sheet's
// prospect ID. A client gets a content timeline (Tidslinje) and a link to its
// meetings doc; everything about the deal itself stays in the sheet.
import { supabase } from "../supabase.js";

const mapClient = (r) => ({
  id: r.id,
  prospectId: r.prospect_id,
  company: r.company,
  person: r.person || "",
  email: r.email || "",
  docUrl: r.doc_url || "",
  createdAt: r.created_at,
});

export async function listClients() {
  const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapClient);
}

// Create clients for prospects that don't have one yet. Never updates an
// existing one.
export async function ensureClients(prospects) {
  if (!prospects.length) return [];
  const rows = prospects.map((p) => ({ prospect_id: p.id, company: p.company, person: p.person || null, email: p.email.includes("@") ? p.email : null }));
  const { data, error } = await supabase.from("clients").upsert(rows, { onConflict: "prospect_id", ignoreDuplicates: true }).select("*");
  if (error) throw error;
  return (data || []).map(mapClient);
}

export async function updateClient(id, { docUrl }) {
  const patch = { updated_at: new Date().toISOString() };
  if (docUrl !== undefined) patch.doc_url = docUrl || null;
  const { data, error } = await supabase.from("clients").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return mapClient(data);
}
