// backend/src/repos/platformAdmins.js
//
// The admin world's source of truth. An admin is a @pullup.se account with a
// row in platform_admins. Two ways a row appears:
//   1. Auto-enrollment: ANY verified @pullup.se login becomes an admin on the
//      spot (ensureDomainAdmin, role 'admin') — the company domain IS the staff
//      list, no manual grant needed.
//   2. Explicit grant/seed: felix@ and hello@ are seeded as 'super'; a super can
//      grant/adjust others via POST /admin/admins.
// The domain is the ONLY thing that can hold a row (DB constraint + endsWith
// gates below), so no non-pullup email can ever be an admin. user_id is stamped
// on first authenticated visit. profiles.is_admin is retired: hosts are just
// hosts; admins are these rows.

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

/**
 * A verified @pullup.se session IS an admin. Given an authenticated Supabase
 * user, ensure a platform_admins row exists (role 'admin') so every admin check
 * across the app reflects it — no manual grant. Guards:
 *   - only the company domain (@pullup.se) can ever enroll (also a DB constraint),
 *   - the mailbox must be verified (email_confirmed_at) — a mere unverified signup
 *     never gains admin,
 *   - an existing row (e.g. seeded 'super') is returned untouched, not downgraded.
 * Returns the admin record, or null for non-pullup / unverified.
 */
export async function ensureDomainAdmin(user) {
  const key = norm(user?.email);
  if (!key.endsWith("@pullup.se")) return null; // hosts: never admin
  const existing = await getAdminByEmail(key);
  if (existing) {
    if (!existing.userId && user?.id) stampAdminUserId(key, user.id).catch(() => {});
    return existing;
  }
  if (!user?.email_confirmed_at) return null; // only a *verified* mailbox auto-enrolls
  const { error } = await supabase
    .from("platform_admins")
    .upsert({ email: key, role: "admin", user_id: user.id || null, granted_by: "auto-domain" }, { onConflict: "email" });
  if (error) {
    console.error("[platformAdmins] auto-enroll failed:", error.message);
    return null;
  }
  cache.delete(key);
  return getAdminByEmail(key);
}

const userCache = new Map(); // userId -> { at, admin|null }

/** Admin lookup by auth user id (resolves the auth user, then auto-enrolls/reads). */
export async function getAdminByUserId(userId) {
  if (!userId) return null;
  const hit = userCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.admin;
  let user = null;
  try {
    const r = await supabase.auth.admin.getUserById(userId);
    user = r?.data?.user || null;
  } catch {
    /* unknowable → not admin */
  }
  const admin = user ? await ensureDomainAdmin(user) : null;
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
