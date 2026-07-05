// /start — THE creator onboarding, one straight line: account → 125 kr/month
// → build. Every landing CTA lands here (no more scroll-to-a-second-CTA), and
// each visit resumes wherever the person actually is:
//   no session            → auth (Google / email), returning right here
//   signed in, can't host → the subscribe card → Stripe Checkout → back here
//   signed in, can host   → straight to /create (founders, subscribers, and
//                           deployments where the paywall isn't switched on)
// The publish-time paywall stays as the backstop for people who wander into
// /create directly — this page is the front door, not the only door.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AuthGate } from "../components/auth/AuthGate.jsx";
import { useSubscription } from "../lib/useSubscription.js";
import { PullupEyes } from "../components/PullupEyes.jsx";
import { colors } from "../theme/colors.js";

export function StartHostingPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { sub, loading: subLoading, startCheckout } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = !authLoading && (!user || !subLoading);
  const canHost = !!sub && (!sub.enforced || sub.entitlement?.canHost);

  // Signed in and allowed to host (paid, founder, or paywall off) → the whole
  // point of this page is behind them; go build.
  useEffect(() => {
    if (!ready || !user || !sub) return;
    if (canHost) navigate("/create", { replace: true });
  }, [ready, user, sub, canHost, navigate]);

  async function subscribe() {
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
  }

  // ── Step 1: account ────────────────────────────────────────────────────────
  if (!authLoading && !user) {
    return (
      <AuthGate
        initialMode="login"
        redirectTo="/start"
        onDismiss={() => navigate("/")}
      />
    );
  }

  // ── Loading (session or subscription state resolving) ─────────────────────
  if (!ready || !sub || canHost) {
    return (
      <div style={{ minHeight: "100dvh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, color: colors.textMuted }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", border: `2px solid ${colors.border}`, borderTopColor: colors.accent, animation: "startSpin 0.8s linear infinite" }} />
          <div style={{ fontSize: 13 }}>Setting things up…</div>
          <style>{`@keyframes startSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── Step 2: the Creator plan ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100dvh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "min(460px, 100%)", textAlign: "center" }}>
        <PullupEyes variant="big" style={{ margin: "0 auto 18px" }} />
        <div style={{ fontSize: 12, fontWeight: 800, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Last step
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
            disabled={busy}
            style={{
              width: "100%", padding: "13px 18px", borderRadius: 12, border: "none",
              background: colors.text, color: "#fff", fontSize: 14.5, fontWeight: 800,
              cursor: "pointer", opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Opening secure checkout…" : "Subscribe & start hosting — 125 kr/month"}
          </button>
          <p style={{ fontSize: 11.5, color: colors.textFaded, textAlign: "center", margin: "10px 0 0" }}>
            Secure payment by Stripe. Manage or cancel anytime from Settings → Billing.
          </p>
        </div>

        <p style={{ fontSize: 12.5, color: colors.textSubtle, margin: "16px 0 0", lineHeight: 1.5 }}>
          Team or agency? The Agency plan is coming soon —{" "}
          <a href="mailto:hello@pullup.se" style={{ color: colors.accent, fontWeight: 600 }}>say hi</a>{" "}
          and we'll onboard you personally.{" "}
          <button type="button" onClick={() => navigate("/create")} style={{ background: "none", border: "none", padding: 0, color: colors.textSubtle, fontSize: 12.5, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>
            Just browsing? Draft an event first
          </button>
        </p>
      </div>
    </div>
  );
}
