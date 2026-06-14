// backend/src/services/account.js
//
// THE UNIFICATION SPINE — one account system for everyone.
//
// A guest is a real (passwordless) Supabase auth user from their first RSVP, so
// becoming a host later is zero-migration: the same auth user simply gains a
// profile + creation powers. Login is passwordless on every rail (email magic
// link here; WhatsApp + Google elsewhere) — no password is the default.
//
// We mint the secure magic link with Supabase's admin API but DELIVER it through
// our own branded email, so Supabase owns the session/security while the email
// stays on-brand and tracked. (No Supabase SMTP config required.)
//
// Everything here is BEST-EFFORT from the caller's view: a guest's RSVP must
// never fail because account-minting hiccuped. Callers tolerate null.

import { supabase } from "../supabase.js";
import { logger } from "../logger.js";
import { sendEmail } from "../email/index.js";
import { loginLinkEmail } from "../emails/signupConfirmation.js";
import { APP_BASE_URL } from "../whatsapp/config.js";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(email) {
  return (email || "").toString().trim().toLowerCase();
}
export function isValidEmail(email) {
  return EMAIL_RE.test(normalizeEmail(email));
}

// Resolve an existing auth user id by email (auth.users isn't reachable via
// PostgREST — uses the SECURITY DEFINER fn from migration 054).
async function authUserIdByEmail(email) {
  const norm = normalizeEmail(email);
  if (!norm) return null;
  const { data, error } = await supabase.rpc("auth_user_id_by_email", { p_email: norm });
  if (error) {
    logger?.warn?.("[account] auth_user_id_by_email failed", { error: error.message });
    return null;
  }
  return data || null;
}

// Find-or-create a passwordless Supabase auth user for an email. Idempotent and
// race-safe. Returns { userId, created } or null on hard failure.
export async function findOrCreateAuthUserForEmail(email, name = null) {
  const norm = normalizeEmail(email);
  if (!isValidEmail(norm)) return null;

  // Fast path: already exists.
  const existing = await authUserIdByEmail(norm);
  if (existing) return { userId: existing, created: false };

  // Create as a confirmed, passwordless user (they prove ownership by tapping
  // the magic link; email_confirm avoids a second Supabase confirmation step).
  const { data, error } = await supabase.auth.admin.createUser({
    email: norm,
    email_confirm: true,
    user_metadata: name ? { full_name: name } : {},
  });
  if (!error && data?.user) return { userId: data.user.id, created: true };

  // Lost a create race (or "already registered") → re-resolve.
  const after = await authUserIdByEmail(norm);
  if (after) return { userId: after, created: false };

  logger?.warn?.("[account] could not create or find auth user", { email: norm, error: error?.message });
  return null;
}

// Link a people row to its auth user (only fills when empty — never clobbers).
export async function linkPersonToAuthUser(personId, userId) {
  if (!personId || !userId) return false;
  const { error } = await supabase
    .from("people")
    .update({ auth_user_id: userId })
    .eq("id", personId)
    .is("auth_user_id", null);
  if (error) {
    logger?.warn?.("[account] linkPersonToAuthUser failed", { personId, error: error.message });
    return false;
  }
  return true;
}

// The one call the RSVP path uses: ensure this person has a passwordless auth
// account and is linked to it. Best-effort; returns the userId or null.
export async function ensureAccountForPerson({ personId, email, name = null }) {
  const acct = await findOrCreateAuthUserForEmail(email, name);
  if (!acct) return null;
  if (personId) await linkPersonToAuthUser(personId, acct.userId);
  return acct.userId;
}

// Mint a one-tap magic link for an email (must already be an auth user). The
// link lands on our /auth/callback, which establishes the Supabase session and
// forwards to `next`. Returns the action_link or null.
export async function mintMagicLink(email, { next = "/room" } = {}) {
  const norm = normalizeEmail(email);
  if (!isValidEmail(norm)) return null;
  const base = APP_BASE_URL.replace(/\/$/, "");
  const redirectTo = `${base}/auth/callback?next=${encodeURIComponent(next)}`;
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: norm,
    options: { redirectTo },
  });
  if (error) {
    logger?.warn?.("[account] generateLink failed", { email: norm, error: error.message });
    return null;
  }
  return data?.properties?.action_link || null;
}

// Send the branded passwordless sign-in email. Best-effort.
export async function sendMagicLinkEmail({ email, name = null, actionLink, brand = null }) {
  if (!actionLink) return false;
  try {
    await sendEmail({
      to: normalizeEmail(email),
      subject: "Your PullUp sign-in link",
      html: loginLinkEmail({ name, actionLink, brand }),
    });
    return true;
  } catch (err) {
    logger?.warn?.("[account] sendMagicLinkEmail failed", { error: err?.message });
    return false;
  }
}

// Full passwordless-login request: find-or-create the user, mint the link, send
// it. Returns { ok } — never leaks the link to the caller.
//
// loginOnly: when true, DON'T create an account for an unknown email. With
// BYO-Supabase the landing page no longer self-serves signup — login is for
// people who already have an account (RSVP'ers included, since RSVP mints one).
// An unknown email returns { ok:false, error:"no_account" } so the caller can
// steer them to the waitlist instead of silently creating an account.
export async function requestLoginLink({ email, name = null, next = "/room", loginOnly = false }) {
  const norm = normalizeEmail(email);
  if (!isValidEmail(norm)) return { ok: false, error: "invalid_email" };
  let acct;
  if (loginOnly) {
    const existing = await authUserIdByEmail(norm);
    if (!existing) return { ok: false, error: "no_account" };
    acct = { userId: existing, created: false };
  } else {
    acct = await findOrCreateAuthUserForEmail(norm, name);
  }
  if (!acct) return { ok: false, error: "account_failed" };
  const link = await mintMagicLink(norm, { next });
  if (!link) return { ok: false, error: "link_failed" };
  const sent = await sendMagicLinkEmail({ email: norm, name, actionLink: link });
  if (!sent) return { ok: false, error: "send_failed" };
  return { ok: true };
}
