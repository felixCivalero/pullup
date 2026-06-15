// ════════════════════════════════════════════════════════════════════════
// SAFE QUERY TOOLKIT — make the two PostgREST scale traps impossible.
//
// Every "Room shows no people" / "CRM drops people at scale" bug traced to one
// of two limits. These helpers make the safe path the easy path:
//
//   1. A big `.in([ids])` puts the ids in the URL, which has a length cap →
//      ~hundreds of ids returns 400 "Bad Request". Use selectInChunks / inChunks.
//
//   2. A bare `.select()` is silently truncated at PostgREST's default 1000-row
//      response cap → "fetch all then filter in JS" quietly drops data, and
//      counts undercount. Use selectAllPaged for full reads, or count in SQL.
//
// Guardrail: `npm run scan:queries` flags raw uses of these patterns so the
// class can't silently come back. New code should reach for these helpers.
// ════════════════════════════════════════════════════════════════════════

// Conservative chunk size. A uuid is ~37 chars in the URL; 150 ids ≈ 5.5KB,
// well under typical 8–16KB URL limits, with headroom for the rest of the query.
export const IN_CHUNK = 150;
// PostgREST's default response cap. We page in this size with .range().
export const PAGE = 1000;

// Run an id-filtered read in chunks and concatenate. `run(idsChunk)` returns a
// Promise<rows[]>. Use when you already have the per-chunk query shaped.
export async function inChunks(ids, run, { size = IN_CHUNK } = {}) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return [];
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    const rows = await run(list.slice(i, i + size));
    if (Array.isArray(rows)) out.push(...rows);
  }
  return out;
}

// Chunked `.in()` against one column. `makeBuilder()` must return a FRESH
// PostgrestFilterBuilder each call (the column filter is applied per chunk).
//   selectInChunks(() => supabase.from("people").select("id,name"), "id", ids)
export async function selectInChunks(makeBuilder, column, ids, { size = IN_CHUNK } = {}) {
  return inChunks(ids, async (chunk) => {
    const { data, error } = await makeBuilder().in(column, chunk);
    if (error) throw error;
    return data || [];
  }, { size });
}

// Auto-paginate a select so the 1000-row cap can't truncate it. `makeBuilder()`
// must return a FRESH builder each call (a new .range() is applied each page).
//   selectAllPaged(() => supabase.from("rsvps").select("*").eq("event_id", id))
// `max` is a sanity ceiling against a runaway loop.
export async function selectAllPaged(makeBuilder, { pageSize = PAGE, max = 200000 } = {}) {
  const out = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await makeBuilder().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break; // last page
  }
  return out;
}
