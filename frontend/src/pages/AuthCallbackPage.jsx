import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors.js";
import { trackEvent } from "../lib/analytics.js";

// Dedicated OAuth landing route. Every Google sign-in redirects here
// (see AuthContext.signInWithGoogle) instead of dropping the user straight
// onto a protected route. Why this exists:
//
//   1. Protected routes (e.g. /events) redirect to "/" the instant they see
//      user=null. Right after an OAuth round-trip the session takes a beat to
//      resolve, so landing there raced the auth state and bounced people back
//      to login — the recurring "it jumps me back to login" bug.
//   2. On a *failed* callback (Supabase returns "OAuth state has expired",
//      user denies consent, in-app browser drops the state cookie, etc.) the
//      provider redirects back with `#error=...` and NO token. Nothing in the
//      app read that, so the user silently landed back on login with zero
//      explanation.
//
// This page is the one authoritative place that waits for the session, then
// forwards to the original destination — or shows a real, recoverable error.
// It does NOT consume `pullup_signin_pending`; destinations (OnboardingPage's
// finalize) still need it, and it's cleared here only when sign-in failed.

// Capture the OAuth result from the URL synchronously, before supabase-js's
// detectSessionInUrl strips the params. Errors arrive in the hash on the
// implicit flow and may arrive in the query on others — check both.
function parseAuthError() {
  const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search || "");
  const code = hash.get("error") || search.get("error");
  if (!code) return null;
  // URLSearchParams already decodes percent- and plus-encoding.
  return {
    code,
    description: hash.get("error_description") || search.get("error_description") || "",
  };
}

// Where to land after a successful sign-in. Same-origin paths only — never
// honor an absolute or protocol-relative URL (open-redirect guard).
function resolveNext() {
  const raw = new URLSearchParams(window.location.search || "").get("next");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/events";
  return raw;
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [initial] = useState(() => ({ error: parseAuthError(), next: resolveNext() }));
  const [timedOut, setTimedOut] = useState(false);
  const failureReported = useRef(false);

  // Derived, not a state transition: we've failed if the provider handed us an
  // error, if auth settled with no session (token exchange failed / storage
  // blocked), or if nothing resolved in time. Deriving avoids a setState in the
  // effect body, and success always wins because `user` short-circuits it.
  const showError =
    !user && (Boolean(initial.error) || timedOut || !loading);

  // Success: once auth settles with a user, forward to the destination. We do
  // NOT clear pullup_signin_pending here — OnboardingPage's finalize still
  // needs it; it's only cleared on the failure path below.
  useEffect(() => {
    if (!loading && user) {
      navigate(initial.next, { replace: true });
    }
  }, [loading, user, navigate, initial.next]);

  // Safety net: AuthContext resolves loading within ~5s even when tokens are
  // present, but guard against it hanging so the user never sees a dead spinner.
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, []);

  // On failure the sign-in didn't complete — drop the pending flag so the next
  // surface doesn't think a Google round-trip just succeeded. Fire once.
  useEffect(() => {
    if (!showError || failureReported.current) return;
    failureReported.current = true;
    try {
      sessionStorage.removeItem("pullup_signin_pending");
    } catch {
      // sessionStorage unavailable (private mode / in-app browser) — ignore.
    }
    trackEvent("signin_failed", {
      reason: initial.error?.code || (timedOut ? "timeout" : "no_session"),
    });
  }, [showError, initial.error, timedOut]);

  const expired = (initial.error?.description || initial.error?.code || "")
    .toLowerCase()
    .includes("expired");

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: colors.background,
        color: colors.text,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          textAlign: "center",
        }}
      >
        {!showError ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              color: colors.textMuted,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: `2px solid ${colors.border}`,
                borderTopColor: colors.accent,
                animation: "authSpin 0.8s linear infinite",
              }}
            />
            <div style={{ fontSize: 13 }}>Signing you in…</div>
            <style>{`@keyframes authSpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 18 }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: colors.textSubtle,
              }}
            >
              Sign-in didn't finish
            </div>
            <h1
              style={{
                fontSize: "clamp(26px, 4.6vw, 34px)",
                lineHeight: 1.15,
                fontWeight: 700,
                margin: 0,
                letterSpacing: "-0.02em",
                color: colors.text,
              }}
            >
              Let's try that{" "}
              <span style={{ color: colors.accent }}>again</span>.
            </h1>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: colors.textMuted,
                margin: 0,
              }}
            >
              {expired
                ? "Your sign-in timed out before it completed. This usually happens if the Google screen sat open a while, or you opened PullUp inside another app's browser (like Instagram). Tap below to try again — opening in Safari or Chrome is the most reliable."
                : "We couldn't complete your sign-in. Tap below to try again. If it keeps happening, open PullUp in Safari or Chrome rather than an in-app browser."}
            </p>
            <button
              type="button"
              onClick={() =>
                navigate(`/login?next=${encodeURIComponent(initial.next)}`, {
                  replace: true,
                })
              }
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
              }}
            >
              Try again
            </button>
            <Link
              to="/"
              style={{
                fontSize: 12,
                color: colors.textMuted,
                textDecoration: "none",
              }}
            >
              Back to{" "}
              <span style={{ color: colors.text, fontWeight: 600 }}>home</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
