// backend/src/repos/platformAdmins.js
//
// The admin world's source of truth. An admin is a @pullup.se account with a
// row in platform_admins — granted by email (possibly before first login),
// user_id stamped on first authenticated visit. profiles.is_admin is retired:
// hosts are just hosts; admins are these rows.

import { supabase } from "../supabase.js";

const CACHE_MS = 60_000;
const cache = new Map(); // email -> { at, admin|null }

function norm(email) {
  return String(email || "").toLowerCase().trim();
}

/** @returns {Promise<{email:string, role:'super'|'admin', scopes:object}|null>} */
export async function getAdminByEmail(email) {
  const key = norm(email);
  if (!key || !key.endsWith("@pullup.se")) return null; // fast path: hosts
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.admin;
  const { data, error } = await supabase
    .from("platform_admins")
    .select("email, role, scopes, user_id")
    .eq("email", key)
    .maybeSingle();
  if (error) {
    console.error("[platformAdmins] read failed:", error.message);
    return hit?.admin ?? null; // fail toward last-known, never toward open
  }
  const admin = data ? { email: data.email, role: data.role, scopes: data.scopes || {}, userId: data.user_id } : null;
  cache.set(key, { at: Date.now(), admin });
  return admin;
}

const userCache = new Map(); // userId -> { at, admin|null }

/** Admin lookup by auth user id (resolves the auth email, then the grant). */
export async function getAdminByUserId(userId) {
  if (!userId) return null;
  const hit = userCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.admin;
  let email = null;
  try {
    const r = await supabase.auth.admin.getUserById(userId);
    email = r?.data?.user?.email || null;
  } catch {
    /* unknowable → not admin */
  }
  const admin = email ? await getAdminByEmail(email) : null;
  userCache.set(userId, { at: Date.now(), admin });
  return admin;
}

/** First authenticated visit stamps the auth user onto the grant. */
export async function stampAdminUserId(email, userId) {
  const key = norm(email);
  if (!key || !userId) return;
  await supabase.from("platform_admins").update({ user_id: userId }).eq("email", key).is("user_id", null);
  cache.delete(key);
}

export async function listAdmins() {
  const { data } = await supabase
    .from("platform_admins")
    .select("email, role, scopes, user_id, granted_by, created_at")
    .order("created_at");
  return data || [];
}

export async function grantAdmin({ email, role = "admin", grantedBy }) {
  const key = norm(email);
  if (!key.endsWith("@pullup.se")) throw new Error("not_platform_email");
  const { error } = await supabase
    .from("platform_admins")
    .upsert({ email: key, role, granted_by: grantedBy || null }, { onConflict: "email" });
  if (error) throw new Error(error.message);
  cache.delete(key);
}

export async function revokeAdmin(email) {
  const key = norm(email);
  const { error } = await supabase.from("platform_admins").delete().eq("email", key);
  if (error) throw new Error(error.message);
  cache.delete(key);
}
