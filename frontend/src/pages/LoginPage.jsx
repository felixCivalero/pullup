import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors.js";
import { AuthCard } from "../components/AuthCard";
import { PullupEyes } from "../components/PullupEyes.jsx";

// Where to send the user after sign-in. Honors ?next= (used by the OAuth
// consent flow so users land back on the consent page after auth). Only
// same-origin paths are accepted — never trust an open redirect.
function resolveNext(params) {
  const raw = params.get("next");
  if (!raw) return "/room";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/room";
  return raw;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const next = resolveNext(params);

  useEffect(() => {
    if (loading) return;
    if (user) navigate(next, { replace: true });
  }, [user, loading, navigate, next]);

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
        <a
          href="/start"
          style={{
            fontSize: 12,
            color: colors.textMuted,
            textDecoration: "none",
          }}
        >
          New here?{" "}
          <span style={{ color: colors.text, fontWeight: 600 }}>Get started</span>
        </a>
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
            gap: 28,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <PullupEyes variant="small" style={{ width: 48, height: 42 }} />
            <div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: colors.textSubtle,
                  marginBottom: 10,
                }}
              >
                Welcome back
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
                Step back into{" "}
                <span style={{ color: colors.accent }}>pullup</span>.
              </h1>
            </div>
          </div>

          <AuthCard
            redirectTo={next}
            submitLabel="Log in"
            trackingPrefix="login"
            theme="light"
            showForgotPassword
            onSuccess={() => navigate(next, { replace: true })}
          />
        </div>
      </div>
    </div>
  );
}
