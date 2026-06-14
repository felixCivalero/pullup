// Creator sign-up waitlist + account-status gate.
//
// With BYO-Supabase the landing page stopped self-serving account creation.
// New creators and agencies JOIN A WAITLIST (we onboard them by hand); only
// people who already have an account can log in. Two endpoints support that:
//
//   POST /waitlist            – public capture from the landing page.
//   GET  /auth/account-status – does the signed-in user have a real account?
//                               The OAuth callback uses this to divert a
//                               brand-new Google sign-in to the waitlist
//                               instead of silently minting an account.
import { supabase } from "../supabase.js";
import { logger } from "../logger.js";
import { sendEmail } from "../email/index.js";
import { normalizeEmail, isValidEmail } from "../services/account.js";
import { requireAuth } from "../middleware/auth.js";

const VALID_ROLES = new Set(["creator", "agency"]);

function clip(v, max) {
  const s = (v == null ? "" : String(v)).trim();
  return s ? s.slice(0, max) : null;
}

function waitlistConfirmationEmail({ name, role }) {
  const hi = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
  const line =
    role === "agency"
      ? "We build the plug, you bring the roster — your creators' data stays theirs, owned and exportable, the whole way."
      : "Your people, your data — owned by you, kept by you, never sold.";
  return `<!doctype html><html><body style="margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;">
    <div style="max-width:480px;margin:0 auto;padding:40px 28px;">
      <p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(10,10,10,0.42);margin:0 0 18px;">PullUp</p>
      <h1 style="font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;margin:0 0 16px;">You're on the list.</h1>
      <p style="font-size:15px;line-height:1.6;color:rgba(10,10,10,0.7);margin:0 0 14px;">${hi}</p>
      <p style="font-size:15px;line-height:1.6;color:rgba(10,10,10,0.7);margin:0 0 14px;">
        Thanks for pulling up. We're onboarding creators by hand right now so every setup is done right — we'll reach out personally when it's your turn.
      </p>
      <p style="font-size:15px;line-height:1.6;color:rgba(10,10,10,0.7);margin:0 0 22px;">${line}</p>
      <p style="font-size:13px;line-height:1.6;color:rgba(10,10,10,0.45);margin:0;">— The PullUp team</p>
    </div>
  </body></html>`;
}

export function registerWaitlistRoutes(app) {
  // ── Public: join the creator waitlist ────────────────────────────────────
  app.post("/waitlist", async (req, res) => {
    try {
      const body = req.body || {};
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) {
        return res.status(400).json({ ok: false, error: "invalid_email" });
      }

      const rawRole = clip(body.role, 20)?.toLowerCase() || "creator";
      const role = VALID_ROLES.has(rawRole) ? rawRole : "creator";

      const row = {
        email,
        name: clip(body.name, 120),
        role,
        handle: clip(body.handle, 200),
        note: clip(body.note, 1000),
        source: clip(body.source, 80),
      };

      // Upsert on email — a re-submit refreshes details, never duplicates and
      // never resets a row we've already invited/joined.
      const { data, error } = await supabase
        .from("creator_waitlist")
        .upsert(row, { onConflict: "email", ignoreDuplicates: false })
        .select("id, status, created_at")
        .maybeSingle();

      if (error) {
        logger?.error?.("[waitlist] upsert failed", { error: error.message });
        return res.status(500).json({ ok: false, error: "save_failed" });
      }

      // Best-effort confirmation — never fail the signup if the email hiccups.
      try {
        await sendEmail({
          to: email,
          subject: "You're on the PullUp waitlist",
          html: waitlistConfirmationEmail({ name: row.name, role }),
        });
      } catch (mailErr) {
        logger?.warn?.("[waitlist] confirmation email failed", { error: mailErr?.message });
      }

      return res.json({ ok: true, id: data?.id || null });
    } catch (err) {
      logger?.error?.("[waitlist] error", { error: err?.message });
      return res.status(500).json({ ok: false, error: "failed" });
    }
  });

  // ── Authed: is this a real, established account? ──────────────────────────
  // Fail-OPEN: any ambiguity or error returns established:true so we never lock
  // a genuine returning user out. Only a confidently-brand-new user (no profile,
  // no people row) comes back false — that's the one we divert to the waitlist.
  app.get("/auth/account-status", requireAuth, async (req, res) => {
    const uid = req.user?.id;
    const email = normalizeEmail(req.user?.email);
    if (!uid) return res.json({ established: true });
    try {
      const [{ data: profile }, { data: personById }, person] = await Promise.all([
        supabase.from("profiles").select("id").eq("id", uid).maybeSingle(),
        supabase.from("people").select("id").eq("auth_user_id", uid).maybeSingle(),
        email
          ? supabase.from("people").select("id").eq("email", email).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const established = Boolean(profile || personById || person?.data);
      return res.json({ established });
    } catch (err) {
      logger?.warn?.("[auth/account-status] check failed (fail-open)", { error: err?.message });
      return res.json({ established: true });
    }
  });
}
