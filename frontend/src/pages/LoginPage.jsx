import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors.js";
import { ParticleField } from "../components/ParticleField";
import { AuthCard } from "../components/AuthCard";

// Where to send the user after sign-in. Honors ?next= (used by the OAuth
// consent flow so users land back on the consent page after auth). Only
// same-origin paths are accepted — never trust an open redirect.
function resolveNext(params) {
  const raw = params.get("next");
  if (!raw) return "/events";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/events";
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
        <a
          href="/start"
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
            textDecoration: "none",
          }}
        >
          New here? <span style={{ color: "#fff" }}>Get started</span>
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
              Welcome back
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
              Step back into{" "}
              <span
                style={{
                  background: colors.gradientGold,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                pullup
              </span>
              .
            </h1>
          </div>

          <AuthCard
            redirectTo={next}
            submitLabel="Log in"
            trackingPrefix="login"
            showForgotPassword
            onSuccess={() => navigate(next, { replace: true })}
          />
        </div>
      </div>
    </div>
  );
}
