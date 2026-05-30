import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors.js";
import { trackEvent } from "../lib/analytics.js";

const inputStyle = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 12,
  background: "#fff",
  border: `1px solid ${colors.borderStrong}`,
  color: colors.text,
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
};

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefilledEmail = location.state?.email || "";
  const [email, setEmail] = useState(prefilledEmail);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormError("");
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setFormError("Enter the email you signed up with.");
      return;
    }
    trackEvent("forgot_password_submit");
    try {
      setSubmitting(true);
      const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Always show success even if Supabase returns an error for "user not
      // found" — we don't want to leak which emails exist. Surface only true
      // infrastructure errors (rate limit, network).
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("rate limit") || msg.includes("too many")) {
          setFormError("Too many attempts. Wait a moment, then try again.");
          return;
        }
        // For other errors, log and still show success to avoid enumeration.
        console.warn("resetPasswordForEmail returned error:", error.message);
      }
      setSent(true);
    } catch (err) {
      console.error("resetPasswordForEmail threw:", err);
      // Network/unknown — show success anyway, don't block the user.
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: colors.background,
        color: colors.text,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <a
          href="/"
          style={{
            color: colors.text,
            textDecoration: "none",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            fontSize: 18,
          }}
        >
          <span style={{ color: colors.accent }}>pullup</span>
        </a>
        <Link
          to="/login"
          style={{
            fontSize: 12,
            color: colors.textMuted,
            textDecoration: "none",
          }}
        >
          Back to{" "}
          <span style={{ color: colors.text, fontWeight: 600 }}>log in</span>
        </Link>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 24px 48px",
        }}
      >
        <div
          style={{
            width: "min(420px, 100%)",
            display: "flex",
            flexDirection: "column",
            gap: 22,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: colors.textSubtle,
                marginBottom: 12,
              }}
            >
              Forgot password
            </div>
            <h1
              style={{
                fontSize: "clamp(28px, 4.6vw, 38px)",
                lineHeight: 1.1,
                fontWeight: 700,
                margin: 0,
                letterSpacing: "-0.02em",
                color: colors.text,
              }}
            >
              {sent ? (
                <>
                  Check your{" "}
                  <span style={{ color: colors.accent }}>inbox</span>.
                </>
              ) : (
                <>
                  Let's get you{" "}
                  <span style={{ color: colors.accent }}>back in</span>.
                </>
              )}
            </h1>
          </div>

          {sent ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: colors.textMuted,
                  margin: 0,
                }}
              >
                If an account exists for{" "}
                <strong style={{ color: colors.text }}>{email.trim().toLowerCase()}</strong>,
                we've sent a link to reset your password. The link expires in
                an hour.
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: colors.textSubtle,
                  margin: 0,
                }}
              >
                Didn't get it? Check your spam folder, or{" "}
                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setFormError("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: colors.accent,
                    textDecoration: "underline",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "inherit",
                  }}
                >
                  try again
                </button>
                .
              </p>
              <button
                type="button"
                onClick={() => navigate("/login")}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  borderRadius: 999,
                  border: "none",
                  background: colors.accent,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                Back to log in
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: colors.textMuted,
                  margin: "0 0 4px",
                }}
              >
                Enter your email and we'll send you a link to set a new
                password.
              </p>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  borderRadius: 999,
                  border: "none",
                  background: colors.accent,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: submitting ? "wait" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                  marginTop: 2,
                }}
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
              {formError && (
                <div
                  style={{
                    fontSize: 12,
                    color: colors.danger,
                    textAlign: "center",
                  }}
                >
                  {formError}
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
