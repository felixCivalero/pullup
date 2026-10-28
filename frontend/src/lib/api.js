// Authenticated calls to the site's own API (the /admin routes). Adds the
// Supabase session token; on a 401 it refreshes the session once and retries.
// Returns the raw Response, like fetch. Every call says which brand the
// admin works in (lib/brand.js).
import { supabase } from "./supabase.js";
import { API_BASE } from "./env.js";
import { currentBrandId } from "./brand.js";

async function token({ refresh = false } = {}) {
  const { data } = refresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

export async function authenticatedFetch(path, options = {}) {
  const send = (accessToken) =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(currentBrandId() ? { "X-PullUp-Brand": currentBrandId() } : {}),
        ...options.headers,
      },
    });
  const res = await send(await token());
  if (res.status !== 401) return res;
  const fresh = await token({ refresh: true }).catch(() => null);
  return fresh ? send(fresh) : res;
}
