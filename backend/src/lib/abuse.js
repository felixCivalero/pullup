// Guards against bots and people using PullUp to reach strangers.
//
// PullUp sends mail on other people's behalf for free (a sign-up gets its
// confirmation), and anyone can make an account. That's the opening a spammer
// looks for: make an event whose title is the spam, then sign up a list of
// addresses so PullUp mails each of them. So every free mail is counted —
// per address, per account, per IP — and past the line the sign-up is still
// saved but no mail goes out. Plus Cloudflare Turnstile (a bot check without
// puzzles) on the forms a script would hammer, when its keys are set.
//
// Counters live in memory: one API process (pm2 fork). A restart forgets
// them, which only ever errs towards letting a person through.
import { captureError } from "../observability.js";

const windows = new Map(); // key → { count, resetAt }

// Count one hit on `key` in a window of `ms`. → true when over `max`.
export function over(key, max, ms, now = Date.now()) {
  if (windows.size > 20000) for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
  const w = windows.get(key)?.resetAt > now ? windows.get(key) : { count: 0, resetAt: now + ms };
  w.count += 1;
  windows.set(key, w);
  return w.count > max;
}

export const resetCounters = () => windows.clear();

const HOUR = 3600_000;
// Free mails (sign-up confirmations): an address gets a handful an hour, an
// account's events a busy launch's worth. Past it: saved, not mailed, and
// the owner hears about it (Sentry) once per account and hour.
export const CONFIRMATIONS_PER_ADDRESS = 6;
export const CONFIRMATIONS_PER_ACCOUNT = 600;

export function mayConfirm({ email, hostId }, now = Date.now()) {
  if (over(`confirm:addr:${email}`, CONFIRMATIONS_PER_ADDRESS, HOUR, now)) return false;
  if (over(`confirm:host:${hostId}`, CONFIRMATIONS_PER_ACCOUNT, HOUR, now)) {
    if (!over(`confirm:host-alert:${hostId}`, 1, HOUR, now)) {
      captureError(new Error("confirmation mail cap reached"), { hostId });
      console.warn(`[abuse] confirmation cap reached for host ${hostId}`);
    }
    return false;
  }
  return true;
}

// Cloudflare Turnstile. On when TURNSTILE_SECRET_KEY is set (the site key goes
// to the frontend as VITE_TURNSTILE_SITE_KEY); until then every check passes.
export const turnstileOn = () => !!process.env.TURNSTILE_SECRET_KEY;

export async function humanCheck(token, ip) {
  if (!turnstileOn()) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const out = await res.json();
    return out?.success === true;
  } catch (err) {
    // Cloudflare down: fail closed would lock everyone out of signing in.
    // The rate limits still hold, so let it through and say so.
    console.error("[abuse] turnstile verify failed:", err?.message);
    return true;
  }
}
