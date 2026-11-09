// Limits the owner puts on one organiser account (/admin/platform, table
// account_limits, mig 163): stop its mail, stop it publishing, cap its
// events. Checked where the account sends, publishes or creates. The owner's
// own calls are never limited. A short cache keeps sign-ups from reading the
// table on every confirmation; the owner's change clears it.
import { supabase } from "../supabase.js";
import { ActionError } from "./actionError.js";

export const NO_LIMITS = Object.freeze({ mailBlocked: false, publishBlocked: false, maxEvents: null, note: null, updatedAt: null });
const TTL = 30_000;
const cache = new Map(); // hostId → { at, limits }

export const shapeLimits = (row) =>
  row ? { mailBlocked: !!row.mail_blocked, publishBlocked: !!row.publish_blocked, maxEvents: row.max_events ?? null, note: row.note || null, updatedAt: row.updated_at || null } : NO_LIMITS;

export async function limitsFor(hostId, now = Date.now()) {
  if (!hostId) return NO_LIMITS;
  const hit = cache.get(hostId);
  if (hit && now - hit.at < TTL) return hit.limits;
  const { data, error } = await supabase.from("account_limits").select("*").eq("host_id", hostId).maybeSingle();
  // A failed read must not stop a real organiser: no limits, and say so.
  if (error) { console.error("[limits] read failed:", error.message); return NO_LIMITS; }
  const limits = shapeLimits(data);
  cache.set(hostId, { at: now, limits });
  return limits;
}

export const forgetLimits = (hostId) => (hostId ? cache.delete(hostId) : cache.clear());

// The owner's change: only the fields given. Returns the new limits.
export function limitsPatch(body = {}) {
  const patch = {};
  if (typeof body.mailBlocked === "boolean") patch.mail_blocked = body.mailBlocked;
  if (typeof body.publishBlocked === "boolean") patch.publish_blocked = body.publishBlocked;
  if ("maxEvents" in body) {
    const n = body.maxEvents === null || body.maxEvents === "" ? null : Math.round(Number(body.maxEvents));
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100000)) return null;
    patch.max_events = n;
  }
  if ("note" in body) patch.note = String(body.note || "").trim().slice(0, 500) || null;
  return patch;
}

export async function setLimits(hostId, body) {
  const patch = limitsPatch(body);
  if (!patch) throw new ActionError("invalid", "Max events must be a whole number.", { detail: "maxEvents" });
  const { data, error } = await supabase.from("account_limits")
    .upsert({ host_id: hostId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "host_id" })
    .select("*").single();
  if (error) throw error;
  forgetLimits(hostId);
  return shapeLimits(data);
}

// Guards, for the places the account acts. `caller.isOwner` passes.
export async function assertMayMail(caller, hostId) {
  if (caller?.isOwner) return;
  if ((await limitsFor(hostId)).mailBlocked) throw new ActionError("forbidden", "Mail is paused for this account. Contact PullUp.", { detail: "mail_blocked" });
}

export async function assertMayPublish(caller, hostId) {
  if (caller?.isOwner) return;
  if ((await limitsFor(hostId)).publishBlocked) throw new ActionError("forbidden", "Publishing is paused for this account. Contact PullUp.", { detail: "publish_blocked" });
}

export async function assertMayCreate(caller, hostId) {
  if (caller?.isOwner) return;
  const { maxEvents } = await limitsFor(hostId);
  if (maxEvents == null) return;
  const { count, error } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("host_id", hostId).or("kind.is.null,kind.eq.event");
  if (error) throw error;
  if ((count || 0) >= maxEvents) throw new ActionError("forbidden", `This account can have at most ${maxEvents} events. Contact PullUp.`, { detail: "max_events" });
}
