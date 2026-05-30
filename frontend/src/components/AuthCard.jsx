import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { trackEvent } from "../lib/analytics.js";
import { colors } from "../theme/colors.js";
import { FaWhatsapp } from "react-icons/fa6";
import { API_BASE } from "../lib/env.js";

// Common dial-code shortlist for the signup-phone country picker.
// Order = rough priority for PullUp's audience (Stockholm → Nairobi → west).
const PHONE_COUNTRIES = [
  { code: "SE", dial: "+46", flag: "🇸🇪", name: "Sweden" },
  { code: "KE", dial: "+254", flag: "🇰🇪", name: "Kenya" },
  { code: "US", dial: "+1", flag: "🇺🇸", name: "United States" },
  { code: "GB", dial: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { code: "DE", dial: "+49", flag: "🇩🇪", name: "Germany" },
  { code: "FR", dial: "+33", flag: "🇫🇷", name: "France" },
  { code: "ES", dial: "+34", flag: "🇪🇸", name: "Spain" },
  { code: "IT", dial: "+39", flag: "🇮🇹", name: "Italy" },
  { code: "NL", dial: "+31", flag: "🇳🇱", name: "Netherlands" },
  { code: "DK", dial: "+45", flag: "🇩🇰", name: "Denmark" },
  { code: "NO", dial: "+47", flag: "🇳🇴", name: "Norway" },
  { code: "FI", dial: "+358", flag: "🇫🇮", name: "Finland" },
  { code: "BR", dial: "+55", flag: "🇧🇷", name: "Brazil" },
  { code: "MX", dial: "+52", flag: "🇲🇽", name: "Mexico" },
  { code: "NG", dial: "+234", flag: "🇳🇬", name: "Nigeria" },
  { code: "ZA", dial: "+27", flag: "🇿🇦", name: "South Africa" },
  { code: "IN", dial: "+91", flag: "🇮🇳", name: "India" },
];

// Two surface palettes. `dark` is the original (used on /reset-password,
// /forgot-password, etc.). `light` matches the white landing shell —
// white bg, ink text, hot-pink primary CTA.
const THEMES = {
  dark: {
    inputBg: "rgba(255,255,255,0.04)",
    inputBorder: "rgba(255,255,255,0.10)",
    inputColor: "#fff",
    dividerLine: "rgba(255,255,255,0.06)",
    dividerLabel: "rgba(255,255,255,0.35)",
    submitBg: colors.accent,
    submitColor: "#fff",
    legalText: "rgba(255,255,255,0.4)",
    legalLink: "rgba(255,255,255,0.65)",
    forgotLink: "rgba(255,255,255,0.55)",
    errorText: "rgba(255,119,119,0.95)",
    googleBg: "#fff",
    googleBorder: "rgba(0,0,0,0.16)",
    googleColor: "#3c4043",
    createPanelBg: "rgba(255,255,255,0.05)",
    createPanelBorder: "rgba(255,255,255,0.12)",
    createPanelText: "rgba(255,255,255,0.7)",
    createPanelStrong: "#fff",
    createButtonBorder: "rgba(255,255,255,0.2)",
    createButtonColor: "#fff",
    createSecondaryColor: "rgba(255,255,255,0.55)",
  },
  light: {
    inputBg: "#fff",
    inputBorder: "rgba(10,10,10,0.16)",
    inputColor: "#0a0a0a",
    dividerLine: "rgba(10,10,10,0.10)",
    dividerLabel: "rgba(10,10,10,0.45)",
    submitBg: "#EC178F",
    submitColor: "#fff",
    legalText: "rgba(10,10,10,0.55)",
    legalLink: "rgba(10,10,10,0.78)",
    forgotLink: "rgba(10,10,10,0.55)",
    errorText: "#c0392b",
    googleBg: "#fff",
    googleBorder: "rgba(10,10,10,0.18)",
    googleColor: "#0a0a0a",
    createPanelBg: "rgba(10,10,10,0.03)",
    createPanelBorder: "rgba(10,10,10,0.10)",
    createPanelText: "rgba(10,10,10,0.72)",
    createPanelStrong: "#0a0a0a",
    createButtonBorder: "rgba(10,10,10,0.22)",
    createButtonColor: "#0a0a0a",
    createSecondaryColor: "rgba(10,10,10,0.55)",
  },
};

const buildInputStyle = (t) => ({
  width: "100%",
  padding: "13px 14px",
  borderRadius: 12,
  background: t.inputBg,
  border: `1px solid ${t.inputBorder}`,
  color: t.inputColor,
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
});

const GoogleIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    style={{ width: 18, height: 18, display: "block" }}
  >
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.61l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.4 5.38 2.56 13.22l7.98 6.2C12.48 13.02 17.74 9.5 24 9.5z"
    />
    <path
      fill="#34A853"
      d="M46.98 24.55c0-1.64-.15-3.21-.43-4.74H24v9.02h12.94c-.56 2.9-2.26 5.36-4.82 7.02l7.66 5.94C44.54 37.89 46.98 31.76 46.98 24.55z"
    />
    <path
      fill="#4A90E2"
      d="M10.54 28.42a10.5 10.5 0 0 1-.55-3.17c0-1.1.2-2.16.55-3.17l-7.98-6.2A23.86 23.86 0 0 0 0 25.25c0 3.8.9 7.39 2.56 10.62l7.98-6.2z"
    />
    <path
      fill="#FBBC05"
      d="M24 47.5c6.48 0 11.93-2.13 15.9-5.79l-7.66-5.94C30.62 37.48 27.61 38.5 24 38.5c-6.26 0-11.52-3.52-13.46-8.92l-7.98 6.2C6.4 42.62 14.62 47.5 24 47.5z"
    />
  </svg>
);

/**
 * AuthCard — email/password + Google OAuth + consent.
 * Used by OnboardingPage (final screen) and LoginPage.
 *
 * Props:
 *   onSuccess(method)   – called after a successful sign-in (NOT for Google,
 *                         which redirects). Use to flush localStorage drafts.
 *   redirectTo          – path to land on after Google OAuth round-trip.
 *   submitLabel         – CTA label, e.g. "Enter pullup" or "Create my account"
 *   trackingPrefix      – per-surface gtag tag, e.g. "onboarding" | "login"
 *   funnelTrack         – when true, also fire `auth_start` (so the event lands
 *                         in landing_page_events for the admin funnel). Login
 *                         surfaces should leave this off so returning users
 *                         don't pollute the create-account funnel.
 */
export function AuthCard({
  onSuccess,
  redirectTo = "/events",
  submitLabel = "Enter pullup",
  trackingPrefix = "auth",
  funnelTrack = false,
  showForgotPassword = false,
  theme = "light",
}) {
  const t = THEMES[theme] || THEMES.dark;
  const inputStyle = buildInputStyle(t);
  const { signInWithGoogle, signInWithEmailPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("SE");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [formError, setFormError] = useState("");
  // Set after a successful auth-with-phone hands the verification to Meta.
  // Drives the inline "we sent you a WhatsApp link" notice.
  const [phoneVerifyPending, setPhoneVerifyPending] = useState(null);
  // When sign-in fails with invalid credentials we surface a
  // "Create new account with this email?" CTA instead of silently
  // creating one (typos would mint orphan accounts otherwise).
  const [offerCreate, setOfferCreate] = useState(false);

  // Compose the full E.164 candidate. Backend re-validates via libphonenumber,
  // so we don't need to be strict here — just stitch dial code + local digits.
  const phoneCandidate = (() => {
    const local = phoneLocal.trim();
    if (!local) return null;
    const dial = PHONE_COUNTRIES.find((c) => c.code === phoneCountry)?.dial || "+46";
    // Already-international input (user typed full +46…) takes precedence.
    if (local.startsWith("+")) return local.replace(/\s+/g, "");
    return `${dial}${local.replace(/[^\d]/g, "")}`;
  })();

  // Fire-and-forget phone verification after auth. We don't await — by the
  // time the user reads "Check your WhatsApp", the message is usually
  // already in their notifications (background-fire architecture).
  const fireVerifyIfNeeded = async () => {
    if (!phoneCandidate) return;
    try {
      const res = await fetch(`${API_BASE}/verify/phone/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phoneCandidate,
          intent: "host_signup",
          defaultCountry: phoneCountry,
          payload: { source: "auth_card", redirect_url: redirectTo },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.ok) {
        setPhoneVerifyPending({
          e164: json.e164 || phoneCandidate,
          sandbox_link: json.sandbox_link || null,
        });
      }
    } catch {
      // Verification is non-blocking — failure here doesn't break signin.
    }
  };

  // Consent is now implicit: clicking either "Continue with Google" or the
  // submit button counts as agreement (the fine-print below the form spells
  // this out). Standard pattern from Google/Apple/Meta. We still hit
  // /auth/record-consent on every successful sign-in so the audit trail
  // exists in case a host later disputes acceptance.
  const recordConsent = () =>
    authenticatedFetch("/auth/record-consent", { method: "POST" }).catch(
      () => {},
    );

  const submitAuth = async ({ allowAutoCreate }) => {
    setFormError("");
    if (!allowAutoCreate) setOfferCreate(false);
    try {
      setSigningIn(true);
      await signInWithEmailPassword(email.trim(), password, {
        allowAutoCreate,
      });
      recordConsent();
      // Fire phone-verification in parallel — non-blocking. The WhatsApp
      // link is on its way to the user's phone by the time onSuccess
      // navigates them onward.
      fireVerifyIfNeeded();
      // signed_in fires from the parent (OnboardingPage's finalize) so the
      // event is unified across both email and Google OAuth completion paths
      // and only fires for the create-account flow.
      onSuccess?.("email");
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      // invalid_credentials code from AuthContext = signin failed and
      // caller hasn't opted in to create. Show the create-account CTA.
      if (err?.code === "invalid_credentials" && !allowAutoCreate) {
        setOfferCreate(true);
        setFormError("");
        return;
      }
      let friendly = "Something went wrong. Please try again.";
      if (msg.includes("email not confirmed"))
        friendly = "Check your email to confirm your account, then come back.";
      else if (msg.includes("invalid login credentials"))
        friendly = "Incorrect email or password.";
      else if (msg.includes("rate limit"))
        friendly = "Too many attempts. Wait a moment, then try again.";
      else if (msg.includes("already registered"))
        friendly =
          'This email uses another sign-in method. Try "Continue with Google".';
      else if (msg.includes("password")) friendly = err.message;
      setFormError(friendly);
      setOfferCreate(false);
    } finally {
      setSigningIn(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (signingIn) return;
    trackEvent(`${trackingPrefix}_email_submit`);
    if (funnelTrack) trackEvent("auth_start", { method: "email" });
    await submitAuth({ allowAutoCreate: false });
  };

  const handleConfirmCreate = async () => {
    if (signingIn) return;
    trackEvent(`${trackingPrefix}_email_create_confirm`);
    if (funnelTrack) trackEvent("auth_start", { method: "email_create" });
    await submitAuth({ allowAutoCreate: true });
  };

  const handleGoogle = async () => {
    if (signingIn) return;
    setFormError("");
    trackEvent(`${trackingPrefix}_google_click`);
    if (funnelTrack) trackEvent("auth_start", { method: "google" });
    try {
      setSigningIn(true);
      sessionStorage.setItem("pullup_signin_pending", "1");
      await signInWithGoogle(redirectTo);
    } catch {
      sessionStorage.removeItem("pullup_signin_pending");
      setFormError("Google sign-in failed. Please try again.");
      setSigningIn(false);
    }
  };

  return (
    <form
      onSubmit={handleEmailSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
      }}
    >
      <button
        type="button"
        onClick={handleGoogle}
        disabled={signingIn}
        style={{
          width: "100%",
          borderRadius: 999,
          border: `1px solid ${t.googleBorder}`,
          background: t.googleBg,
          padding: "13px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          cursor: signingIn ? "wait" : "pointer",
          color: t.googleColor,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {GoogleIcon}
        <span>Continue with Google</span>
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "2px 0",
        }}
      >
        <div style={{ flex: 1, height: 1, background: t.dividerLine }} />
        <span
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            color: t.dividerLabel,
          }}
        >
          or email
        </span>
        <div style={{ flex: 1, height: 1, background: t.dividerLine }} />
      </div>

      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        style={inputStyle}
      />
      <input
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        style={inputStyle}
      />

      {/* WhatsApp phone — optional but encouraged. Provided here means we
          send a one-tap magic-link to the number on signup; lets us reach
          you for reminders + future payment rails. Returning users can
          leave it blank. */}
      <div style={{ display: "flex", gap: 8 }}>
        <select
          value={phoneCountry}
          onChange={(e) => setPhoneCountry(e.target.value)}
          aria-label="Phone country"
          style={{
            ...inputStyle,
            flex: "0 0 92px",
            padding: "13px 8px",
            textAlignLast: "center",
            cursor: "pointer",
          }}
        >
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.dial}
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={phoneLocal}
          onChange={(e) => setPhoneLocal(e.target.value)}
          placeholder="WhatsApp number (optional)"
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>

      {showForgotPassword && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -4 }}>
          <Link
            to="/forgot-password"
            state={{ email: email.trim() }}
            onClick={() => trackEvent(`${trackingPrefix}_forgot_password_click`)}
            style={{
              fontSize: 12,
              color: t.forgotLink,
              textDecoration: "none",
            }}
          >
            Forgot password?
          </Link>
        </div>
      )}

      <button
        type="submit"
        disabled={signingIn}
        style={{
          width: "100%",
          padding: "14px 0",
          borderRadius: 999,
          border: "none",
          background: t.submitBg,
          color: t.submitColor,
          fontSize: 14,
          fontWeight: 700,
          cursor: signingIn ? "wait" : "pointer",
          opacity: signingIn ? 0.7 : 1,
          marginTop: 2,
        }}
      >
        {signingIn ? "Entering…" : submitLabel}
      </button>

      {/* Implicit consent — clicking either button above counts as agreement.
          Same legal weight as a ticked box per most jurisdictions, and matches
          the standard pattern (Google/Apple/Meta all do it this way). */}
      <p
        style={{
          margin: "2px 0 0",
          fontSize: 11.5,
          lineHeight: 1.5,
          color: t.legalText,
          textAlign: "center",
        }}
      >
        By continuing, you agree to our{" "}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: t.legalLink, textDecoration: "underline" }}
        >
          terms
        </a>{" "}
        and{" "}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: t.legalLink, textDecoration: "underline" }}
        >
          privacy policy
        </a>
        .
      </p>

      {formError && (
        <div
          style={{
            fontSize: 12,
            color: t.errorText,
            textAlign: "center",
          }}
        >
          {formError}
        </div>
      )}

      {/* Inline notice when phone-verify is in flight. Renders the same
          WhatsApp-bubble preview we use elsewhere so the user has visual
          continuity with what their phone is about to show. */}
      {phoneVerifyPending && (
        <div
          style={{
            marginTop: 4,
            padding: "12px 14px",
            borderRadius: 14,
            border: `1px solid ${colors.secondaryBorder}`,
            background: colors.secondarySoft,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              color: colors.text,
            }}
          >
            <FaWhatsapp size={16} color={colors.secondary} />
            <span>Tap the link in WhatsApp</span>
          </div>
          <div style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.45 }}>
            We sent a one-tap verification link to{" "}
            <strong style={{ color: colors.text }}>{phoneVerifyPending.e164}</strong>. Open
            WhatsApp and tap it — your phone is then verified for reminders, RSVPs and
            future mobile-payment rails.
          </div>
          {phoneVerifyPending.sandbox_link && (
            <a
              href={phoneVerifyPending.sandbox_link}
              style={{
                display: "block",
                fontSize: 12,
                color: colors.secondary,
                textDecoration: "underline",
                textAlign: "center",
                padding: "4px 0",
              }}
            >
              Sandbox: tap to redeem here
            </a>
          )}
        </div>
      )}

      {offerCreate && (
        <div
          style={{
            fontSize: 12,
            color: t.createPanelText,
            textAlign: "center",
            padding: "10px 12px",
            borderRadius: 8,
            background: t.createPanelBg,
            border: `1px solid ${t.createPanelBorder}`,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ color: t.createPanelText }}>
            No account found for{" "}
            <strong style={{ color: t.createPanelStrong }}>{email.trim()}</strong>.
          </div>
          <button
            type="button"
            onClick={handleConfirmCreate}
            disabled={signingIn}
            style={{
              width: "100%",
              borderRadius: 999,
              border: `1px solid ${t.createButtonBorder}`,
              background: "transparent",
              color: t.createButtonColor,
              padding: "10px 14px",
              cursor: signingIn ? "wait" : "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Create a new account with this email
          </button>
          <button
            type="button"
            onClick={() => setOfferCreate(false)}
            disabled={signingIn}
            style={{
              background: "transparent",
              border: "none",
              color: t.createSecondaryColor,
              fontSize: 12,
              padding: "4px 0",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Or check the email — I had a typo
          </button>
        </div>
      )}
    </form>
  );
}
