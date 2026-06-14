import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { trackEvent } from "../lib/analytics.js";
import { colors } from "../theme/colors.js";
import { FaWhatsapp } from "react-icons/fa6";
import { Mail, ArrowLeft } from "lucide-react";

// Two surface palettes. `dark` is the original (used on /reset-password,
// /forgot-password, etc.). `light` matches the white landing shell —
// white bg, ink text, hot-pink primary CTA.
const THEMES = {
  dark: {
    inputBg: "rgba(255,255,255,0.04)",
    inputBorder: "rgba(255,255,255,0.10)",
    inputColor: "#fff",
    dividerLabel: "rgba(255,255,255,0.35)",
    submitBg: colors.accent,
    submitColor: "#fff",
    legalText: "rgba(255,255,255,0.4)",
    legalLink: "rgba(255,255,255,0.65)",
    forgotLink: "rgba(255,255,255,0.55)",
    errorText: "rgba(255,119,119,0.95)",
    optionBg: "rgba(255,255,255,0.03)",
    optionBorder: "rgba(255,255,255,0.14)",
    optionColor: "#fff",
    optionHoverBg: "rgba(255,255,255,0.07)",
    mutedBg: "rgba(255,255,255,0.02)",
    mutedBorder: "rgba(255,255,255,0.08)",
    mutedColor: "rgba(255,255,255,0.4)",
    pillBg: "rgba(255,255,255,0.10)",
    pillColor: "rgba(255,255,255,0.6)",
    backColor: "rgba(255,255,255,0.6)",
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
    dividerLabel: "rgba(10,10,10,0.45)",
    submitBg: "#EC178F",
    submitColor: "#fff",
    legalText: "rgba(10,10,10,0.55)",
    legalLink: "rgba(10,10,10,0.78)",
    forgotLink: "rgba(10,10,10,0.55)",
    errorText: "#c0392b",
    optionBg: "#fff",
    optionBorder: "rgba(10,10,10,0.18)",
    optionColor: "#0a0a0a",
    optionHoverBg: "rgba(10,10,10,0.03)",
    mutedBg: "rgba(10,10,10,0.02)",
    mutedBorder: "rgba(10,10,10,0.10)",
    mutedColor: "rgba(10,10,10,0.40)",
    pillBg: "rgba(10,10,10,0.06)",
    pillColor: "rgba(10,10,10,0.50)",
    backColor: "rgba(10,10,10,0.55)",
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

// Outlined pill used by all three method buttons, so Google / WhatsApp /
// email read as siblings in one stack.
const optionButtonStyle = (t, { muted = false, disabled = false } = {}) => ({
  width: "100%",
  borderRadius: 999,
  border: `1px solid ${muted ? t.mutedBorder : t.optionBorder}`,
  background: muted ? t.mutedBg : t.optionBg,
  padding: "13px 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  cursor: disabled ? "default" : "pointer",
  color: muted ? t.mutedColor : t.optionColor,
  fontSize: 14,
  fontWeight: 500,
  position: "relative",
  transition: "background 0.15s ease",
});

// WhatsApp login rides on the auth_whatsapp_otp template, which Meta hasn't
// approved yet — so the OTP send hard-fails ("Couldn't send a WhatsApp code").
// Keep the button visible but inert ("Coming soon") until then. Flip the env
// flag to VITE_WHATSAPP_LOGIN_ENABLED=true the moment the template is approved.
const WHATSAPP_LOGIN_ENABLED =
  import.meta.env.VITE_WHATSAPP_LOGIN_ENABLED === "true";

// grid-rows 0fr↔1fr gives a clean height collapse/expand with no JS
// measuring. Paired with overflow:hidden on the inner wrapper.
const collapsible = (open) => ({
  display: "grid",
  gridTemplateRows: open ? "1fr" : "0fr",
  opacity: open ? 1 : 0,
  pointerEvents: open ? "auto" : "none",
  transition:
    "grid-template-rows 0.34s cubic-bezier(0.16,1,0.3,1), opacity 0.22s ease",
});
const collapsibleInner = {
  overflow: "hidden",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: 12,
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
 * AuthCard — method picker for sign-in / create-account.
 * Used by the landing LoginPanel + OnboardingPanel.
 *
 * Default state shows three sibling buttons and nothing else:
 *   • Continue with Google   → OAuth redirect
 *   • Continue with WhatsApp → disabled ("Coming soon") for now
 *   • Continue with email    → expands in-place into the email form
 *
 * Choosing email collapses the picker and reveals email + password + the
 * pink submit (the pink CTA only exists while the email form is open). A
 * "back" affordance returns to the three-button picker.
 *
 * Props:
 *   onSuccess(method)   – after a successful email sign-in (Google redirects).
 *   redirectTo          – path to land on after Google OAuth round-trip.
 *   submitLabel         – pink CTA label, e.g. "Log in" | "Create my account"
 *   trackingPrefix      – per-surface gtag tag, e.g. "onboarding" | "login"
 *   funnelTrack         – when true, also fire `auth_start` for the funnel.
 *   showForgotPassword  – render the "Forgot password?" link in the email form.
 *   theme               – "light" (default) | "dark"
 */
export function AuthCard({
  onSuccess,
  onNoAccount,
  loginOnly = false,
  redirectTo = "/room",
  submitLabel = "Enter pullup",
  trackingPrefix = "auth",
  funnelTrack = false,
  showForgotPassword = false,
  theme = "light",
}) {
  const t = THEMES[theme] || THEMES.dark;
  const inputStyle = buildInputStyle(t);
  const { signInWithGoogle, requestMagicLink, sendWhatsappCode, verifyWhatsappCode } = useAuth();
  const [email, setEmail] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [formError, setFormError] = useState("");
  // Which method the user has committed to. false = the three-button picker.
  const [emailOpen, setEmailOpen] = useState(false);
  // WhatsApp login (native Supabase phone OTP, code delivered over WhatsApp).
  const [waOpen, setWaOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [waCode, setWaCode] = useState("");
  const [waStage, setWaStage] = useState("phone"); // "phone" | "code"
  const phoneRef = useRef(null);
  // Passwordless: once we've sent the magic link, swap the form for a
  // "check your inbox" confirmation. No password, no account-enumeration —
  // "log in" and "sign up" are the same action (the backend find-or-creates).
  const [linkSent, setLinkSent] = useState(false);
  const emailRef = useRef(null);

  // Consent is implicit: clicking any "Continue" / submit button counts as
  // agreement (the fine-print below spells this out). We still hit
  // /auth/record-consent on success so the audit trail exists.
  const recordConsent = () =>
    authenticatedFetch("/auth/record-consent", { method: "POST" }).catch(
      () => {},
    );

  const openEmail = () => {
    if (signingIn) return;
    setFormError("");
    setEmailOpen(true);
    trackEvent(`${trackingPrefix}_email_open`);
    // Focus once the expand transition has started.
    setTimeout(() => emailRef.current?.focus(), 80);
  };

  const closeEmail = () => {
    setEmailOpen(false);
    setLinkSent(false);
    setFormError("");
  };

  // Passwordless: ask the backend to mint a Supabase magic link and email it.
  // Same action for new + returning (find-or-create). On success we show the
  // "check your inbox" state; tapping the link signs them in on this device and
  // the session persists across all of PullUp.
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (signingIn || !emailOpen) return;
    const addr = email.trim();
    if (!addr) {
      setFormError("Enter your email.");
      return;
    }
    setFormError("");
    trackEvent(`${trackingPrefix}_email_submit`);
    if (funnelTrack) trackEvent("auth_start", { method: "email_link" });
    try {
      setSigningIn(true);
      const r = await requestMagicLink(addr, { next: redirectTo, loginOnly });
      // Login-only: no account for this email → hand off to the waitlist
      // instead of showing a "check your inbox" for a mail that never sends.
      if (loginOnly && r?.exists === false) {
        trackEvent(`${trackingPrefix}_no_account`);
        if (onNoAccount) {
          onNoAccount(addr);
          return;
        }
      }
      setLinkSent(true);
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      setFormError(
        msg.includes("invalid")
          ? "That email doesn't look right."
          : "Couldn't send the link. Try again in a moment.",
      );
    } finally {
      setSigningIn(false);
    }
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

  // ── WhatsApp login (native Supabase phone OTP; code arrives on WhatsApp) ──
  const normPhone = (p) => {
    const t = (p || "").trim().replace(/[^\d+]/g, "");
    return t.startsWith("+") ? t : `+${t}`;
  };
  const openWa = () => {
    if (signingIn) return;
    setFormError("");
    setWaOpen(true);
    setWaStage("phone");
    trackEvent(`${trackingPrefix}_wa_open`);
    setTimeout(() => phoneRef.current?.focus(), 80);
  };
  const closeWa = () => {
    setWaOpen(false);
    setWaStage("phone");
    setWaCode("");
    setFormError("");
  };
  const handleSendWaCode = async () => {
    if (signingIn) return;
    const ph = normPhone(phone);
    if (ph.replace(/\D/g, "").length < 8) {
      setFormError("Enter your number with country code, e.g. +46…");
      return;
    }
    setFormError("");
    trackEvent(`${trackingPrefix}_wa_send`);
    if (funnelTrack) trackEvent("auth_start", { method: "whatsapp" });
    try {
      setSigningIn(true);
      await sendWhatsappCode(ph);
      setWaStage("code");
    } catch {
      setFormError("Couldn't send a WhatsApp code. Check the number, or try another way.");
    } finally {
      setSigningIn(false);
    }
  };
  const handleVerifyWa = async () => {
    if (signingIn) return;
    const code = waCode.trim();
    if (!code) {
      setFormError("Enter the code from WhatsApp.");
      return;
    }
    setFormError("");
    try {
      setSigningIn(true);
      await verifyWhatsappCode(normPhone(phone), code);
      onSuccess?.("whatsapp");
    } catch {
      setFormError("That code didn't match. Try again or resend.");
    } finally {
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
      {/* ── Method picker (Google / WhatsApp / email). Collapses when the
          email form opens, handing its slot to the form below. ── */}
      <div style={collapsible(!emailOpen && !waOpen)} aria-hidden={emailOpen || waOpen}>
        <div style={collapsibleInner}>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={signingIn}
            style={{ ...optionButtonStyle(t), cursor: signingIn ? "wait" : "pointer" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = t.optionHoverBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = t.optionBg;
            }}
          >
            {GoogleIcon}
            <span>Continue with Google</span>
          </button>

          {/* WhatsApp — native Supabase phone OTP, code delivered over WhatsApp.
              Inert until Meta approves the auth template (see WHATSAPP_LOGIN_ENABLED). */}
          <button
            type="button"
            onClick={WHATSAPP_LOGIN_ENABLED ? openWa : undefined}
            disabled={signingIn || !WHATSAPP_LOGIN_ENABLED}
            title={WHATSAPP_LOGIN_ENABLED ? undefined : "Coming soon"}
            style={optionButtonStyle(t, {
              muted: !WHATSAPP_LOGIN_ENABLED,
              disabled: !WHATSAPP_LOGIN_ENABLED,
            })}
            onMouseEnter={(e) => {
              if (!WHATSAPP_LOGIN_ENABLED) return;
              e.currentTarget.style.background = t.optionHoverBg;
            }}
            onMouseLeave={(e) => {
              if (!WHATSAPP_LOGIN_ENABLED) return;
              e.currentTarget.style.background = t.optionBg;
            }}
          >
            <FaWhatsapp size={18} color="#25D366" />
            <span>
              Continue with WhatsApp{WHATSAPP_LOGIN_ENABLED ? "" : " · Coming soon"}
            </span>
          </button>

          <button
            type="button"
            onClick={openEmail}
            disabled={signingIn}
            style={optionButtonStyle(t)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = t.optionHoverBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = t.optionBg;
            }}
          >
            <Mail size={18} />
            <span>Continue with email</span>
          </button>
        </div>
      </div>

      {/* ── Email form. Expands into the picker's slot. The pink CTA only
          exists while this is open. ── */}
      <div style={collapsible(emailOpen)} aria-hidden={!emailOpen}>
        <div style={collapsibleInner}>
          <button
            type="button"
            onClick={closeEmail}
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: "none",
              padding: "2px 0",
              cursor: "pointer",
              color: t.backColor,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={15} />
            Other ways to sign in
          </button>

          {!linkSent ? (
            <>
              <input
                ref={emailRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                tabIndex={emailOpen ? 0 : -1}
                style={inputStyle}
              />
              <button
                type="submit"
                disabled={signingIn}
                tabIndex={emailOpen ? 0 : -1}
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
                {signingIn ? "Sending…" : "Email me a sign-in link"}
              </button>
              <p style={{ margin: "2px 0 0", fontSize: 12, lineHeight: 1.5, color: t.mutedColor, textAlign: "center" }}>
                No password — we'll email a link that signs you in.
              </p>
            </>
          ) : (
            <div
              style={{
                fontSize: 13,
                color: t.createPanelText,
                textAlign: "center",
                padding: "16px 14px",
                borderRadius: 12,
                background: t.createPanelBg,
                border: `1px solid ${t.createPanelBorder}`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 700, color: t.createPanelStrong, fontSize: 15 }}>Check your inbox</div>
              <div>
                We sent a sign-in link to{" "}
                <strong style={{ color: t.createPanelStrong }}>{email.trim()}</strong>. Tap it to continue — no password needed.
              </div>
              <button
                type="button"
                onClick={() => { setLinkSent(false); setTimeout(() => emailRef.current?.focus(), 50); }}
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
                Use a different email
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── WhatsApp form — native phone OTP, code delivered over WhatsApp. ── */}
      <div style={collapsible(waOpen)} aria-hidden={!waOpen}>
        <div style={collapsibleInner}>
          <button
            type="button"
            onClick={closeWa}
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: "none",
              padding: "2px 0",
              cursor: "pointer",
              color: t.backColor,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={15} />
            Other ways to sign in
          </button>

          {waStage === "phone" ? (
            <>
              <input
                ref={phoneRef}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSendWaCode(); } }}
                placeholder="+46 70 123 45 67"
                tabIndex={waOpen ? 0 : -1}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={handleSendWaCode}
                disabled={signingIn}
                tabIndex={waOpen ? 0 : -1}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  borderRadius: 999,
                  border: "none",
                  background: "#25D366",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: signingIn ? "wait" : "pointer",
                  opacity: signingIn ? 0.7 : 1,
                  marginTop: 2,
                }}
              >
                {signingIn ? "Sending…" : "Send WhatsApp code"}
              </button>
              <p style={{ margin: "2px 0 0", fontSize: 12, lineHeight: 1.5, color: t.mutedColor, textAlign: "center" }}>
                We'll message a code on WhatsApp — no password.
              </p>
            </>
          ) : (
            <>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={waCode}
                onChange={(e) => setWaCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleVerifyWa(); } }}
                placeholder="6-digit code"
                tabIndex={waOpen ? 0 : -1}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={handleVerifyWa}
                disabled={signingIn}
                tabIndex={waOpen ? 0 : -1}
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
                {signingIn ? "Verifying…" : "Verify & sign in"}
              </button>
              <button
                type="button"
                onClick={() => { setWaStage("phone"); setWaCode(""); setFormError(""); }}
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
                Use a different number
              </button>
            </>
          )}
        </div>
      </div>

      {/* Implicit consent — clicking any button above counts as agreement.
          Matches the standard pattern (Google/Apple/Meta all do it this way). */}
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
        <div style={{ fontSize: 12, color: t.errorText, textAlign: "center" }}>
          {formError}
        </div>
      )}
    </form>
  );
}
