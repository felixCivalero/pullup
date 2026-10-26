// Sign in (and sign up — the first sign-in makes the account), bound to the
// browser that asked. See lib/deviceLogin.js for why and how.
//   POST /auth/login   { email, device }            → { attempt, expiresAt }; mails a code + link
//   POST /auth/verify  { attempt, secret, code|link } → a Supabase session for this browser
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../supabase.js";
import { sendEmail } from "../email/index.js";
import { getFrontendUrl } from "../lib/urls.js";
import { isValidEmail, normalizeEmail } from "../lib/emailAddress.js";
import { ensureHostProfile } from "../middleware/requireUser.js";
import { isOwnerEmail } from "../middleware/requireOwner.js";
import {
  ATTEMPT_TTL_MS, MAX_TRIES, checkAttempt, codeHash, describeDevice, isDeviceHash, newCode, newSecret, open, seal, sha256,
} from "../lib/deviceLogin.js";

// Per address: 5 mails in 15 minutes. Per IP: 20 an hour.
const PER_EMAIL = 5;
const PER_IP = 20;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// The mail: the code, the same thing as a link, and where the request came
// from, so the person recognises it (or knows it wasn't them).
export function loginMail({ code, link, device, country, at }) {
  const when = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(at);
  const where = [device, country].filter(Boolean).join(", ");
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  return {
    subject: `Din kod till PullUp: ${spaced}`,
    text: `Din kod: ${spaced}\n\nEller logga in med länken: ${link}\n\nBegärd från ${where} kl ${when}. Koden och länken fungerar bara i den webbläsaren, i 15 minuter, en gång.\n\nVar det inte du? Ignorera mejlet. Ingen kan logga in med det någon annanstans.`,
    html: `<!doctype html><html lang="sv"><body style="margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;">
<div style="max-width:440px;margin:0 auto;padding:40px 24px;">
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px;">Din kod till PullUp:</p>
  <p style="font-size:38px;font-weight:700;letter-spacing:0.12em;margin:0 0 28px;font-variant-numeric:tabular-nums;">${esc(spaced)}</p>
  <p style="margin:0 0 28px;"><a href="${esc(link)}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 22px;border-radius:999px;">Logga in</a></p>
  <p style="font-size:13px;line-height:1.55;color:#6e6e73;margin:0 0 10px;">Begärd från <strong style="color:#0a0a0a;font-weight:600;">${esc(where)}</strong> kl ${esc(when)}. Koden och länken fungerar bara i den webbläsaren, i 15 minuter, en gång.</p>
  <p style="font-size:13px;line-height:1.55;color:#6e6e73;margin:0;">Var det inte du? Ignorera mejlet. Ingen kan logga in med det någon annanstans.</p>
</div></body></html>`,
  };
}

async function recentCount(column, value, sinceMs) {
  const { count, error } = await supabase
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", new Date(Date.now() - sinceMs).toISOString());
  if (error) throw error;
  return count || 0;
}

// Supabase's one-time token for this address (the account is created on the
// first sign-in). Nothing is mailed by Supabase: we send our own mail.
async function supabaseToken(email) {
  const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) throw error || new Error("no token");
  return data.properties.hashed_token;
}

// Redeem it for a session. A fresh client per call: nothing is stored here.
async function redeem(tokenHash) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error || !data?.session) throw error || new Error("no session");
  return data;
}

const REFUSED = {
  expired: [410, "Koden har gått ut. Be om en ny."],
  used: [410, "Koden är redan använd. Be om en ny."],
  locked: [429, "För många fel försök. Be om en ny kod."],
  other_device: [403, "Koden och länken fungerar bara i webbläsaren där du bad om dem. Öppna länken där, eller skriv koden där."],
  wrong_code: [400, "Fel kod."],
  missing: [400, "Skriv koden från mejlet."],
};

export function registerAuthRoutes(app) {
  app.post("/auth/login", async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const device = req.body?.device;
      if (!isValidEmail(email)) return res.status(400).json({ error: "invalid_email", message: "Skriv en giltig e-postadress." });
      if (!isDeviceHash(device)) return res.status(400).json({ error: "invalid_device" });
      const ip = req.ip || "unknown";
      const [byEmail, byIp] = await Promise.all([recentCount("email", email, 15 * 60 * 1000), recentCount("ip", ip, 60 * 60 * 1000)]);
      if (byEmail >= PER_EMAIL || byIp >= PER_IP) return res.status(429).json({ error: "rate_limited", message: "Du har bett om många koder. Vänta en stund." });

      const code = newCode();
      const link = newSecret();
      const now = new Date();
      const deviceLabel = describeDevice(req.get("user-agent"));
      const country = (req.get("cf-ipcountry") || "").slice(0, 8) || null;
      const tokenHash = await supabaseToken(email);
      const { data: attempt, error } = await supabase
        .from("login_attempts")
        .insert({
          email,
          device_hash: device,
          code_hash: "pending",
          link_hash: sha256(link),
          token_hash: seal(tokenHash),
          device: deviceLabel,
          country,
          ip,
          expires_at: new Date(now.getTime() + ATTEMPT_TTL_MS).toISOString(),
        })
        .select("id, expires_at")
        .single();
      if (error) throw error;
      // The code's hash is salted with the attempt id, known only now.
      const { error: upErr } = await supabase.from("login_attempts").update({ code_hash: codeHash(attempt.id, code) }).eq("id", attempt.id);
      if (upErr) throw upErr;

      const url = `${getFrontendUrl()}/login#a=${attempt.id}&l=${link}`;
      await sendEmail({ from: '"PullUp" <no-reply@pullup.se>', to: email, ...loginMail({ code, link: url, device: deviceLabel, country, at: now }) });
      return res.json({ attempt: attempt.id, expiresAt: attempt.expires_at });
    } catch (err) {
      console.error("[auth] login:", err?.message);
      return res.status(500).json({ error: "failed", message: "Det gick inte att skicka koden. Försök igen." });
    }
  });

  app.post("/auth/verify", async (req, res) => {
    try {
      const { attempt: id, secret, code, link } = req.body || {};
      if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) return res.status(400).json({ error: "expired", message: REFUSED.expired[1] });
      const { data: attempt, error } = await supabase.from("login_attempts").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      const verdict = checkAttempt(attempt, { secret, code: code == null ? "" : String(code), link });
      if (verdict !== "ok") {
        if (verdict === "wrong_code" || verdict === "other_device") {
          await supabase.from("login_attempts").update({ tries: (attempt.tries || 0) + 1 }).eq("id", attempt.id);
        }
        const [status, message] = REFUSED[verdict];
        const left = attempt ? Math.max(0, MAX_TRIES - (attempt.tries || 0) - 1) : 0;
        return res.status(status).json({ error: verdict, message, ...(verdict === "wrong_code" ? { triesLeft: left } : {}) });
      }
      // Once: only the call that flips used_at gets the session.
      const { data: claimed, error: claimErr } = await supabase
        .from("login_attempts")
        .update({ used_at: new Date().toISOString() })
        .eq("id", attempt.id)
        .is("used_at", null)
        .select("id");
      if (claimErr) throw claimErr;
      if (!claimed?.length) return res.status(410).json({ error: "used", message: REFUSED.used[1] });

      // A newer code for the same address replaces this one at Supabase.
      let redeemed;
      try {
        redeemed = await redeem(open(attempt.token_hash));
      } catch {
        return res.status(410).json({ error: "replaced", message: "En nyare kod har skickats. Använd den senaste." });
      }
      const { session, user } = redeemed;
      if (!isOwnerEmail(user.email)) await ensureHostProfile(user.id);
      return res.json({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: session.token_type,
        user: { id: user.id, email: user.email },
      });
    } catch (err) {
      console.error("[auth] verify:", err?.message);
      return res.status(500).json({ error: "failed", message: "Det gick inte att logga in. Be om en ny kod." });
    }
  });
}
