import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 16px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontSize: "14px",
  outline: "none",
  fontFamily: "inherit",
};

const GoogleIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    style={{ width: 18, height: 18, display: "block" }}
  >
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.61l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.4 5.38 2.56 13.22l7.98 6.2C12.48 13.02 17.74 9.5 24 9.5z" />
    <path fill="#34A853" d="M46.98 24.55c0-1.64-.15-3.21-.43-4.74H24v9.02h12.94c-.56 2.9-2.26 5.36-4.82 7.02l7.66 5.94C44.54 37.89 46.98 31.76 46.98 24.55z" />
    <path fill="#4A90E2" d="M10.54 28.42a10.5 10.5 0 0 1-.55-3.17c0-1.1.2-2.16.55-3.17l-7.98-6.2A23.86 23.86 0 0 0 0 25.25c0 3.8.9 7.39 2.56 10.62l7.98-6.2z" />
    <path fill="#FBBC05" d="M24 47.5c6.48 0 11.93-2.13 15.9-5.79l-7.66-5.94C30.62 37.48 27.61 38.5 24 38.5c-6.26 0-11.52-3.52-13.46-8.92l-7.98 6.2C6.4 42.62 14.62 47.5 24 47.5z" />
  </svg>
);

/**
 * PublishAuthModal — single-step auth gate.
 * Profile completeness is now guaranteed by the onboarding flow at /start,
 * so we no longer collect brand/contactEmail inside this modal.
 *
 * Props:
 *   onClose        — dismiss modal
 *   onProfileReady — called once auth succeeds; parent proceeds to publish
 */
export function PublishAuthModal({ onClose, onProfileReady }) {
  const { signInWithGoogle, signInWithEmailPassword, user } = useAuth();

  // Auth state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authConsent, setAuthConsent] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [formError, setFormError] = useState("");

  const showAuthStep = !user;

  // Once we have a session (e.g. user just signed in via email/password),
  // the parent can publish — the modal has nothing else to do.
  useEffect(() => {
    if (user) onProfileReady?.({});
  }, [user, onProfileReady]);

  // ── Auth handlers ──

  const handleEmailPasswordSubmit = async (e) => {
    e.preventDefault();
    if (signingIn) return;
    setFormError("");
    if (!authConsent) {
      setFormError("You must agree to the terms and privacy policy.");
      return;
    }
    try {
      setSigningIn(true);
      await signInWithEmailPassword(email.trim(), password);
      authenticatedFetch("/auth/record-consent", { method: "POST" }).catch(() => {});
    } catch (error) {
      const msg = (error?.message || "").toLowerCase();
      let friendly = "Something went wrong. Please try again.";
      if (msg.includes("email not confirmed"))
        friendly = "Check your email to confirm your account, then come back.";
      else if (msg.includes("invalid login credentials"))
        friendly = "Incorrect email or password.";
      else if (msg.includes("rate limit"))
        friendly = "Too many attempts. Wait a moment, then try again.";
      else if (msg.includes("already registered"))
        friendly = 'This email uses another sign-in method. Try "Continue with Google".';
      else if (msg.includes("password")) friendly = error.message;
      setFormError(friendly);
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogleContinue = async () => {
    if (signingIn) return;
    setFormError("");
    if (!authConsent) {
      setFormError("You must agree to the terms and privacy policy.");
      return;
    }
    try {
      setSigningIn(true);
      // Save pendingPublish flag so CreateEventPage knows to resume after OAuth redirect
      try {
        const raw = localStorage.getItem("pullup_event_draft");
        if (raw) {
          const draft = JSON.parse(raw);
          draft.pendingPublish = true;
          localStorage.setItem("pullup_event_draft", JSON.stringify(draft));
        }
      } catch {}
      await signInWithGoogle("/create");
    } catch {
      setFormError("Google sign-in failed. Please try again.");
      setSigningIn(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          maxWidth: 380,
          width: "100%",
          borderRadius: 24,
          background: "linear-gradient(145deg, rgba(11,10,20,0.98), rgba(17,15,30,0.99))",
          boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)",
          padding: "clamp(24px, 4vw, 36px)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 16, right: 16,
            background: "none", border: "none",
            color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 4,
          }}
        >
          <X size={20} />
        </button>

        {/* ── STEP 1: AUTH ── */}
        {showAuthStep && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, textAlign: "center" }}>
              Publish on{" "}
              <span style={{
                background: colors.gradientGold,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
                pullup
              </span>
            </h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", textAlign: "center", marginBottom: 24 }}>
              Sign in or create your account to publish
            </p>

            <form onSubmit={handleEmailPasswordSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }} htmlFor="publish-auth-email">Email</label>
                <input
                  id="publish-auth-email"
                  type="email" inputMode="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }} htmlFor="publish-auth-password">Password</label>
                <input
                  id="publish-auth-password"
                  type="password" autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password" style={inputStyle}
                />
              </div>
              <label style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 12, color: "rgba(255,255,255,0.45)",
                cursor: "pointer", marginTop: 2, minHeight: 44,
              }}>
                <input
                  type="checkbox" checked={authConsent}
                  onChange={(e) => setAuthConsent(e.target.checked)}
                  style={{ accentColor: "#fbbf24", flexShrink: 0, width: 18, height: 18 }}
                />
                <span>
                  I agree to the{" "}
                  <a href="/terms" target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{ color: "rgba(255,255,255,0.65)", textDecoration: "underline" }}>terms</a>
                  {" "}and{" "}
                  <a href="/privacy" target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{ color: "rgba(255,255,255,0.65)", textDecoration: "underline" }}>privacy policy</a>
                </span>
              </label>
              <button
                type="submit" disabled={signingIn}
                style={{
                  width: "100%", padding: "14px 0", borderRadius: "999px", border: "none",
                  background: colors.gradientGold, color: "#111",
                  fontSize: 14, fontWeight: 700,
                  cursor: signingIn ? "wait" : "pointer",
                  opacity: signingIn ? 0.7 : 1, marginTop: 4,
                }}
              >
                {signingIn ? "Signing in..." : "Continue"}
              </button>
              {formError && (
                <div style={{ fontSize: 12, color: "rgba(255,119,119,0.95)", textAlign: "center" }}>
                  {formError}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0" }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(255,255,255,0.35)" }}>or</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
              </div>
              <button
                type="button" onClick={handleGoogleContinue} disabled={signingIn}
                style={{
                  width: "100%", borderRadius: "999px",
                  border: "1px solid rgba(0,0,0,0.16)",
                  background: "#fff", padding: "12px 14px",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  cursor: signingIn ? "wait" : "pointer",
                  color: "#3c4043", fontSize: 14, fontWeight: 500,
                }}
              >
                {GoogleIcon}
                <span>Continue with Google</span>
              </button>
            </form>
          </>
        )}

      </div>
    </div>
  );
}
