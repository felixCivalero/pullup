import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors.js";
import { ParticleField } from "../components/ParticleField";
import { trackEvent } from "../lib/analytics.js";

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

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // AuthContext already defers `loading=false` until Supabase has processed
  // any tokens in the URL hash (it watches for `access_token` / `refresh_token`).
  // So once `loading` flips, we know whether the recovery link produced a
  // valid session or not — no extra polling needed.
  const [stage, setStage] = useState("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (loading) return;
    setStage(user ? "ready" : "expired");
  }, [loading, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setFormError("Passwords don't match.");
      return;
    }

    trackEvent("reset_password_submit");
    try {
      setSubmitting(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("same") && msg.includes("password")) {
          setFormError("New password must be different from your current one.");
        } else if (msg.includes("expired") || msg.includes("invalid")) {
          setStage("expired");
        } else if (
          msg.includes("weak") ||
          msg.includes("password") ||
          msg.includes("length")
        ) {
          setFormError(error.message);
        } else {
          setFormError("Couldn't update password. Try the link again, or request a new one.");
        }
        return;
      }
      trackEvent("reset_password_success");
      // User is now signed in with their new password — send them straight in.
      navigate("/events", { replace: true });
    } catch (err) {
      console.error("updateUser threw:", err);
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100dvh",
        background: colors.background,
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <ParticleField intensity={1} zIndex={0} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 70%, rgba(0,0,0,0.7) 100%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 3,
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <a
          href="/"
          style={{
            color: "#fff",
            textDecoration: "none",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            fontSize: 18,
          }}
        >
          <span
            style={{
              background: colors.gradientGold,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            pullup
          </span>
        </a>
      </div>

      <div
        style={{
          flex: 1,
          position: "relative",
          zIndex: 2,
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
          {stage === "checking" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 0",
                color: "rgba(255,255,255,0.5)",
                fontSize: 13,
              }}
            >
              Verifying reset link…
            </div>
          )}

          {stage === "expired" && (
            <>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.38)",
                    marginBottom: 12,
                  }}
                >
                  Link expired
                </div>
                <h1
                  style={{
                    fontSize: "clamp(28px, 4.6vw, 38px)",
                    lineHeight: 1.1,
                    fontWeight: 700,
                    margin: 0,
                    letterSpacing: "-0.02em",
                  }}
                >
                  This link's{" "}
                  <span
                    style={{
                      background: colors.gradientGold,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    expired
                  </span>
                  .
                </h1>
              </div>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "rgba(255,255,255,0.55)",
                  margin: 0,
                }}
              >
                Reset links expire after an hour and can only be used once.
                Request a new one and you'll be back in shortly.
              </p>
              <Link
                to="/forgot-password"
                style={{
                  width: "100%",
                  padding: "14px 0",
                  borderRadius: 999,
                  border: "none",
                  background: colors.gradientGold,
                  color: "#111",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                Send a new link
              </Link>
              <Link
                to="/login"
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.5)",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                Back to <span style={{ color: "#fff" }}>log in</span>
              </Link>
            </>
          )}

          {stage === "ready" && (
            <>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.38)",
                    marginBottom: 12,
                  }}
                >
                  Set a new password
                </div>
                <h1
                  style={{
                    fontSize: "clamp(28px, 4.6vw, 38px)",
                    lineHeight: 1.1,
                    fontWeight: 700,
                    margin: 0,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Pick something{" "}
                  <span
                    style={{
                      background: colors.gradientGold,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    strong
                  </span>
                  .
                </h1>
              </div>
              <form
                onSubmit={handleSubmit}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`New password (${MIN_PASSWORD_LENGTH}+ characters)`}
                  minLength={MIN_PASSWORD_LENGTH}
                  style={inputStyle}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm new password"
                  minLength={MIN_PASSWORD_LENGTH}
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
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    style={{ accentColor: "#fbbf24", width: 16, height: 16 }}
                  />
                  Show password
                </label>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: "100%",
                    padding: "14px 0",
                    borderRadius: 999,
                    border: "none",
                    background: colors.gradientGold,
                    color: "#111",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: submitting ? "wait" : "pointer",
                    opacity: submitting ? 0.7 : 1,
                    marginTop: 2,
                  }}
                >
                  {submitting ? "Updating…" : "Update password"}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
