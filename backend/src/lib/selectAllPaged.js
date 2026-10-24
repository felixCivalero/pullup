// Page through a Supabase query 1000 rows at a time (PostgREST caps a single
// read at 1000). `build` returns a fresh query each call; give it an order so
// pages don't overlap.
export async function selectAllPaged(build, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < pageSize) return out;
  }
}
