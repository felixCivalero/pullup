// /start — THE creator onboarding, one straight line: plan → account → pay →
// build. Friction-ordered for someone who has already decided (every landing
// CTA lands here):
//   1. The plan card shows IMMEDIATELY — no auth wall before the pitch.
//   2. "Subscribe" is the one click. No session? Auth opens, and because the
//      intent is remembered across the OAuth round-trip, checkout launches
//      AUTOMATICALLY after sign-in — nobody is asked twice.
//   3. Stripe returns here; the moment the subscription lands they're
//      forwarded into /create to build their first event.
// Already-entitled visitors (founders, subscribers, paywall-off deployments)
// skip straight through to /create. The publish-time paywall stays as the
// backstop for people who wander into /create directly.

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AuthGate } from "../components/auth/AuthGate.jsx";
import { useSubscription } from "../lib/useSubscription.js";
import { PullupEyes } from "../components/PullupEyes.jsx";
import { colors } from "../theme/colors.js";

// Survives the Google OAuth round-trip (same tab): "they already clicked
// Subscribe — don't ask again, go straight to checkout after auth".
const PAY_INTENT_KEY = "pullup_start_pay_intent";

function readPayIntent() {
  try { return sessionStorage.getItem(PAY_INTENT_KEY) === "1"; } catch { return false; }
}
function setPayIntent(on) {
  try {
    if (on) sessionStorage.setItem(PAY_INTENT_KEY, "1");
    else sessionStorage.removeItem(PAY_INTENT_KEY);
  } catch { /* private mode — flow degrades to one extra click */ }
}

export function StartHostingPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { sub, loading: subLoading, startCheckout } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [error, setError] = useState("");
  const autoFired = useRef(false);

  const canHost = !!sub && (!sub.enforced || sub.entitlement?.canHost);

  const launchCheckout = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const ok = await startCheckout({ returnTo: "/start", tier: "creator" });
      if (!ok) {
        setError("Couldn't open checkout — try again in a moment.");
        setBusy(false);
      }
    } catch {
      setError("Couldn't open checkout — try again in a moment.");
      setBusy(false);
    }
  }, [startCheckout]);

  // Signed in and allowed to host (paid, founder, or paywall off) → go build.
  // Signed in with a remembered Subscribe click → straight into checkout.
  useEffect(() => {
    if (authLoading || !user || subLoading || !sub) return;
    if (canHost) {
      setPayIntent(false);
      navigate("/create", { replace: true });
      return;
    }
    if (readPayIntent() && !autoFired.current) {
      autoFired.current = true;
      setPayIntent(false);
      launchCheckout();
    }
  }, [authLoading, user, subLoading, sub, canHost, navigate, launchCheckout]);

  function subscribe() {
    if (!user) {
      // Remember the intent, collect the account, then checkout fires itself.
      setPayIntent(true);
      setShowAuth(true);
      return;
    }
    launchCheckout();
  }

  const resolvingEntitled = !!user && (subLoading || !sub || canHost);

  return (
    <div style={{ minHeight: "100dvh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "min(460px, 100%)", textAlign: "center" }}>
        <PullupEyes variant="big" style={{ width: 92, height: 80, margin: "0 auto 16px" }} />
        <div style={{ fontSize: 12, fontWeight: 800, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          {user ? "Last step" : "Start hosting"}
        </div>
        <h1 style={{ fontSize: "clamp(24px, 4.5vw, 32px)", fontWeight: 800, lineHeight: 1.15, color: colors.text, margin: "0 0 10px" }}>
          Set up your Creator account
        </h1>
        <p style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 1.6, margin: "0 0 22px" }}>
          Hosting on PullUp — events live, a community page open, products
          selling — runs on one flat plan. Being a guest stays free, forever.
        </p>

        <div style={{ textAlign: "left", background: colors.surface, border: `1px solid ${colors.borderFaint}`, borderRadius: 16, padding: "22px 22px 20px", boxShadow: "0 8px 30px rgba(10,10,10,0.06)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: colors.text }}>Creator</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: colors.text }}>
              125 kr<span style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted }}>/month</span>
            </span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 18px", display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "Unlimited events, pages and people — no per-guest metering",
              "3% on paid tickets is the only other fee, ever",
              "Cancel anytime — you host until the period ends, nothing is deleted",
              "Your data stays yours: export anytime, or run on your own database at no markup",
            ].map((line) => (
              <li key={line} style={{ fontSize: 13.5, color: colors.textMuted, lineHeight: 1.5, display: "flex", gap: 8 }}>
                <span style={{ color: colors.accent, fontWeight: 800 }}>·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          {error && (
            <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 13, color: "#ef4444" }}>
              {error}
            </div>
          )}

          <button
            onClick={subscribe}
            disabled={busy || resolvingEntitled}
            style={{
              width: "100%", padding: "13px 18px", borderRadius: 12, border: "none",
              background: colors.text, color: "#fff", fontSize: 14.5, fontWeight: 800,
              cursor: "pointer", opacity: busy || resolvingEntitled ? 0.65 : 1,
            }}
          >
            {busy
              ? "Taking you to secure checkout…"
              : resolvingEntitled
                ? "One moment…"
                : "Subscribe & start hosting — 125 kr/month"}
          </button>
          <p style={{ fontSize: 11.5, color: colors.textFaded, textAlign: "center", margin: "10px 0 0" }}>
            {user
              ? "Secure payment by Stripe. Manage or cancel anytime from Settings → Billing."
              : "You'll sign in with Google or email first — checkout opens right after, automatically."}
          </p>
        </div>

        <p style={{ fontSize: 12.5, color: colors.textSubtle, margin: "16px 0 0", lineHeight: 1.5 }}>
          Team or agency? The Agency plan is coming soon —{" "}
          <a href="mailto:hello@pullup.se" style={{ color: colors.accent, fontWeight: 600 }}>say hi</a>{" "}
          and we'll onboard you personally.{" "}
          <button type="button" onClick={() => { setPayIntent(false); navigate("/create"); }} style={{ background: "none", border: "none", padding: 0, color: colors.textSubtle, fontSize: 12.5, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>
            Just browsing? Draft an event first
          </button>
        </p>
      </div>

      {showAuth && (
        <AuthGate
          initialMode="login"
          redirectTo="/start"
          onAuthed={() => setShowAuth(false)}
          onDismiss={() => { setPayIntent(false); setShowAuth(false); }}
        />
      )}
    </div>
  );
}
