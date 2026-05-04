import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { trackEvent } from "../lib/analytics.js";
import { colors } from "../theme/colors.js";

const inputStyle = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#fff",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
};

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
}) {
  const { signInWithGoogle, signInWithEmailPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [formError, setFormError] = useState("");

  const recordConsent = () =>
    authenticatedFetch("/auth/record-consent", { method: "POST" }).catch(
      () => {},
    );

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (signingIn) return;
    setFormError("");
    if (!consent) {
      setFormError("Please agree to the terms and privacy policy.");
      return;
    }
    trackEvent(`${trackingPrefix}_email_submit`);
    if (funnelTrack) trackEvent("auth_start", { method: "email" });
    try {
      setSigningIn(true);
      await signInWithEmailPassword(email.trim(), password);
      recordConsent();
      // signed_in fires from the parent (OnboardingPage's finalize) so the
      // event is unified across both email and Google OAuth completion paths
      // and only fires for the create-account flow.
      onSuccess?.("email");
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
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
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogle = async () => {
    if (signingIn) return;
    setFormError("");
    if (!consent) {
      setFormError("Please agree to the terms and privacy policy.");
      return;
    }
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
          border: "1px solid rgba(0,0,0,0.16)",
          background: "#fff",
          padding: "13px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          cursor: signingIn ? "wait" : "pointer",
          color: "#3c4043",
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
        <div
          style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }}
        />
        <span
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            color: "rgba(255,255,255,0.35)",
          }}
        >
          or email
        </span>
        <div
          style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }}
        />
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

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "rgba(255,255,255,0.45)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ accentColor: "#fbbf24", width: 18, height: 18 }}
        />
        <span>
          I agree to the{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener"
            style={{
              color: "rgba(255,255,255,0.65)",
              textDecoration: "underline",
            }}
          >
            terms
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener"
            style={{
              color: "rgba(255,255,255,0.65)",
              textDecoration: "underline",
            }}
          >
            privacy policy
          </a>
          .
        </span>
      </label>

      <button
        type="submit"
        disabled={signingIn}
        style={{
          width: "100%",
          padding: "14px 0",
          borderRadius: 999,
          border: "none",
          background: colors.gradientGold,
          color: "#111",
          fontSize: 14,
          fontWeight: 700,
          cursor: signingIn ? "wait" : "pointer",
          opacity: signingIn ? 0.7 : 1,
          marginTop: 2,
        }}
      >
        {signingIn ? "Entering…" : submitLabel}
      </button>

      {formError && (
        <div
          style={{
            fontSize: 12,
            color: "rgba(255,119,119,0.95)",
            textAlign: "center",
          }}
        >
          {formError}
        </div>
      )}
    </form>
  );
}
