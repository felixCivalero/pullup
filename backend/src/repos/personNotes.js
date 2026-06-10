// Person notes repo — host-scoped CRUD on person_notes
// (db<->app mapping + get/create/update/delete, always keyed by person+host).
import { supabase } from "../supabase.js";

function mapNoteFromDb(n) {
  return {
    id: n.id,
    personId: n.person_id,
    eventId: n.event_id || null,
    content: n.content,
    noteDate: n.note_date,
    // `topic` is AI-only enrichment, hidden in the web UI for now.
    topic: n.topic || null,
    source: n.source || "ui",
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  };
}

// Newest first. note_date is the host-meaningful order; created_at breaks ties
// when several notes share a backdated day.
export async function getPersonNotes(personId, hostId) {
  if (!personId || !hostId) return [];
  const { data, error } = await supabase
    .from("person_notes")
    .select("*")
    .eq("person_id", personId)
    .eq("host_id", hostId)
    .order("note_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[getPersonNotes] error:", error);
    return [];
  }
  return (data || []).map(mapNoteFromDb);
}

export async function createPersonNote(
  personId,
  hostId,
  { content, eventId, noteDate, topic, source } = {},
) {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) return { error: "empty_content" };

  const row = {
    person_id: personId,
    host_id: hostId,
    content: text,
    event_id: eventId || null,
    source: source === "mcp" ? "mcp" : "ui",
  };
  // note_date defaults to CURRENT_DATE in the DB; only override if given.
  if (noteDate) row.note_date = noteDate; // 'YYYY-MM-DD'
  if (topic && String(topic).trim()) row.topic = String(topic).trim();

  const { data, error } = await supabase
    .from("person_notes")
    .insert(row)
    .select("*")
    .single();
  if (error) {
    console.error("[createPersonNote] error:", error);
    return { error: "insert_failed" };
  }
  return { note: mapNoteFromDb(data) };
}

// Scoped to (note, person, host) so a host can never touch a note that isn't
// theirs, even with a guessed id.
export async function updatePersonNote(noteId, personId, hostId, updates = {}) {
  const patch = { updated_at: new Date().toISOString() };
  if (updates.content !== undefined) {
    const text = typeof updates.content === "string" ? updates.content.trim() : "";
    if (!text) return { error: "empty_content" };
    patch.content = text;
  }
  if (updates.eventId !== undefined) patch.event_id = updates.eventId || null;
  // note_date is NOT NULL — ignore empty values rather than clearing it.
  if (updates.noteDate) patch.note_date = updates.noteDate;
  if (updates.topic !== undefined) {
    patch.topic = updates.topic ? String(updates.topic).trim() : null;
  }

  const { data, error } = await supabase
    .from("person_notes")
    .update(patch)
    .eq("id", noteId)
    .eq("person_id", personId)
    .eq("host_id", hostId)
    .select("*")
    .single();
  if (error || !data) {
    if (error && error.code !== "PGRST116") {
      console.error("[updatePersonNote] error:", error);
    }
    return { error: "not_found" };
  }
  return { note: mapNoteFromDb(data) };
}

export async function deletePersonNote(noteId, personId, hostId) {
  const { data, error } = await supabase
    .from("person_notes")
    .delete()
    .eq("id", noteId)
    .eq("person_id", personId)
    .eq("host_id", hostId)
    .select("id")
    .single();
  if (error || !data) {
    if (error && error.code !== "PGRST116") {
      console.error("[deletePersonNote] error:", error);
    }
    return { error: "not_found" };
  }
  return { ok: true };
}
