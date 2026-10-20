// Project docs repo: a client's board and strategy deck, one JSON doc each,
// written with a version guard (see migration 146).
import { supabase } from "../supabase.js";

const KINDS = new Set(["board", "strategy"]);
export const isDocKind = (kind) => KINDS.has(kind);

const mapDoc = (r) => ({ doc: r?.doc || {}, version: r?.version ?? 0, updatedAt: r?.updated_at || null });

export async function getProjectDoc(clientId, kind) {
  const { data, error } = await supabase.from("project_docs").select("doc, version, updated_at").eq("client_id", clientId).eq("kind", kind).maybeSingle();
  if (error) throw error;
  return mapDoc(data);
}

// Writes when `version` is the stored one (0 = not saved yet) and returns
// { ok: true, doc, version }; otherwise { conflict: true, latest }.
export async function saveProjectDoc(clientId, kind, doc, version) {
  const now = new Date().toISOString();
  if (version === 0) {
    const { data, error } = await supabase.from("project_docs")
      .upsert({ client_id: clientId, kind, doc, version: 1, updated_at: now }, { onConflict: "client_id,kind", ignoreDuplicates: true })
      .select("doc, version, updated_at");
    if (error) throw error;
    if (data?.length) return { ok: true, ...mapDoc(data[0]) };
  } else {
    const { data, error } = await supabase.from("project_docs")
      .update({ doc, version: version + 1, updated_at: now })
      .eq("client_id", clientId).eq("kind", kind).eq("version", version)
      .select("doc, version, updated_at").maybeSingle();
    if (error) throw error;
    if (data) return { ok: true, ...mapDoc(data) };
  }
  return { conflict: true, latest: await getProjectDoc(clientId, kind) };
}
