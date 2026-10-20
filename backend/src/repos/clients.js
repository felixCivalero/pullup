// Clients repo (admin → Kunder): the people Felix works with, keyed by the
// sales sheet's prospect ID. Facts that change in the pipeline (stage, next
// step) are read live from the sheet; this table keeps the work.
import { supabase } from "../supabase.js";

const mapClient = (r) => ({
  id: r.id,
  prospectId: r.prospect_id,
  company: r.company,
  person: r.person || "",
  email: r.email || "",
  meetingAt: r.meeting_at,
  prep: r.prep || "",
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listClients() {
  const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapClient);
}

// Create cards for prospects that don't have one yet. Never updates an
// existing card: once someone is a client, their card is Felix's.
export async function ensureClients(prospects) {
  if (!prospects.length) return [];
  const rows = prospects.map((p) => ({ prospect_id: p.id, company: p.company, person: p.person || null, email: p.email.includes("@") ? p.email : null }));
  const { data, error } = await supabase.from("clients").upsert(rows, { onConflict: "prospect_id", ignoreDuplicates: true }).select("*");
  if (error) throw error;
  return (data || []).map(mapClient);
}

export async function updateClient(id, { meetingAt, prep }) {
  const patch = { updated_at: new Date().toISOString() };
  if (meetingAt !== undefined) patch.meeting_at = meetingAt || null;
  if (prep !== undefined) patch.prep = String(prep).slice(0, 50000);
  const { data, error } = await supabase.from("clients").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return mapClient(data);
}
