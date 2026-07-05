// /start — THE creator onboarding, TWO walls total (Spotify-shape, per Felix):
//
//   1 · Account — one card: the plan (price + benefits) beside the Continue
//       buttons. Picking a sign-in method IS the commit — no separate
//       "Subscribe" click, no pitch wall before an auth wall.
//   2 · Payment — Stripe Embedded Checkout mounted in-page (card, Link,
//       wallets), benefits pinned beside it. Opens AUTOMATICALLY for any
//       signed-in, not-yet-subscribed visitor — so returning from the Google
//       round-trip (or arriving already logged in) lands straight on payment.
//
// Completion returns here, syncs, and lands them in the Room — their home
// surface, where the next move is theirs, never forced. Already-entitled
// visitors skip to the Room immediately; the publish-time paywall stays the
// backstop. Profile details are collected later by the profile-setup banner.

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { useAuth } from "../contexts/AuthContext";
import { AuthCard } from "../components/AuthCard";
import { useSubscription } from "../lib/useSubscription.js";
import { authenticatedFetch } from "../lib/api.js";
import { PullupEyes } from "../components/PullupEyes.jsx";
import { colors } from "../theme/colors.js";

// Same key resolution as PaymentForm (ticket payments): TEST_ key in dev.
function getPublishableKey() {
  const isDev = import.meta.env.DEV;
  if (isDev && import.meta.env.VITE_STRIPE_TEST_PUBLISHABLE_KEY) {
    return import.meta.env.VITE_STRIPE_TEST_PUBLISHABLE_KEY;
  }
  return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
}

const BENEFITS = [
  "Unlimited events, pages and people — no per-guest metering",
  "3% on paid tickets is the only other fee, ever",
  "Cancel anytime — you host until the period ends, nothing is deleted",
  "Your data stays yours: export anytime, or run on your own database at no markup",
];

function BenefitList() {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
      {BENEFITS.map((line) => (
        <li key={line} style={{ fontSize: 13.5, color: colors.textMuted, lineHeight: 1.5, display: "flex", gap: 8, textAlign: "left" }}>
          <span style={{ color: colors.accent, fontWeight: 800 }}>·</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

// The always-visible order line + step dots. Small, quiet, keeps the price
// and the position in the flow in view the whole way.
function StepHeader({ active }) {
  const steps = [
    { key: "account", label: "Account" },
    { key: "pay", label: "Payment" },
  ];
  const activeIdx = active === "pay" ? 1 : 0;
  return (
    <div style={{ textAlign: "center", marginBottom: 20 }}>
      <PullupEyes variant="big" style={{ width: 72, height: 62, margin: "0 auto 10px" }} />
      <div style={{ fontSize: 14, fontWeight: 800, color: colors.text }}>
        Creator — 125 kr/month
        <span style={{ fontWeight: 600, color: colors.textMuted }}> · cancel anytime</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 }}>
        {steps.map((s, i) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%", fontSize: 10.5, fontWeight: 800,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: i <= activeIdx ? colors.accent : colors.surface,
                color: i <= activeIdx ? "#fff" : colors.textSubtle,
                border: i <= activeIdx ? "none" : `1px solid ${colors.border}`,
              }}>
                {i < activeIdx ? "✓" : i + 1}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: i === activeIdx ? colors.text : colors.textSubtle }}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && <span style={{ width: 26, height: 1, background: colors.border }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StartHostingPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { sub, loading: subLoading } = useSubscription(); // also finishes a returning payment (?session_id sync)
  const [checkoutInstance, setCheckoutInstance] = useState(null); // Stripe embedded checkout
  const [mounted, setMounted] = useState(false); // …and it's actually in the DOM
  const [error, setError] = useState("");
  const launched = useRef(false);
  const checkoutRef = useRef(null); // same instance, reachable from cleanup
  const mountRef = useRef(null);

  const canHost = !!sub && (!sub.enforced || sub.entitlement?.canHost);
  // Payment is step 2 for anyone signed in (it opens itself); account is
  // step 1 for everyone else.
  const step = user && !authLoading ? "pay" : "account";

  // Mint an embedded session and hand it to the mount effect. Falls back to
  // the hosted redirect if embedding fails — paying must never dead-end.
  const launchCheckout = useCallback(async () => {
    setError("");
    try {
      const r = await authenticatedFetch("/host/subscription/checkout", {
        method: "POST",
        body: JSON.stringify({ embedded: true, returnTo: "/start", tier: "creator" }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || "checkout_failed");
      if (b.clientSecret) {
        const pk = getPublishableKey();
        if (!pk) throw new Error("no_publishable_key");
        const stripe = await loadStripe(pk);
        const checkout = await stripe.initEmbeddedCheckout({ clientSecret: b.clientSecret });
        checkoutRef.current = checkout;
        setCheckoutInstance(checkout);
        return;
      }
      if (b.url) { window.location.assign(b.url); return; } // hosted fallback
      throw new Error("no_session");
    } catch (e) {
      try {
        const r2 = await authenticatedFetch("/host/subscription/checkout", {
          method: "POST",
          body: JSON.stringify({ returnTo: "/start", tier: "creator" }),
        });
        const b2 = await r2.json().catch(() => ({}));
        if (r2.ok && b2.url) { window.location.assign(b2.url); return; }
      } catch { /* fall through */ }
      console.error("[start] checkout failed:", e?.message);
      setError("Couldn't open the payment form — reload to try again.");
    }
  }, []);

  // Mount once BOTH exist: the Stripe instance and the payment panel's node.
  useEffect(() => {
    if (checkoutInstance && step === "pay" && mountRef.current && !mounted) {
      checkoutInstance.mount(mountRef.current);
      setMounted(true);
    }
  }, [checkoutInstance, step, mounted]);

  // Tear the Stripe frame down when leaving the page.
  useEffect(() => () => { checkoutRef.current?.destroy?.(); }, []);

  // Entitled (paid, founder, paywall off) → the Room. Signed in but not yet
  // subscribed → open payment, exactly once. No clicks in between.
  useEffect(() => {
    if (authLoading || !user || subLoading || !sub) return;
    if (canHost) {
      navigate("/room", { replace: true });
      return;
    }
    if (!launched.current) {
      launched.current = true;
      launchCheckout();
    }
  }, [authLoading, user, subLoading, sub, canHost, navigate, launchCheckout]);

  return (
    <div style={{ minHeight: "100dvh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: step === "pay" ? "min(960px, 100%)" : "min(880px, 100%)" }}>
        <StepHeader active={step} />

        {/* ── 1 · ACCOUNT — the plan and the door, one card ─────────────── */}
        {step === "account" && (
          <>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 0, background: colors.surface, border: `1px solid ${colors.borderFaint}`,
              borderRadius: 18, boxShadow: "0 8px 30px rgba(10,10,10,0.06)", overflow: "hidden",
            }}>
              <div style={{ padding: "26px 26px 22px", borderRight: `1px solid ${colors.borderFaint}` }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: colors.text }}>Creator</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: colors.text }}>
                    125 kr<span style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted }}>/month</span>
                  </span>
                </div>
                <p style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.55, margin: "0 0 14px" }}>
                  Everything you host — events, a community page, products — on one
                  flat plan. Being a guest stays free, forever.
                </p>
                <BenefitList />
              </div>
              <div style={{ padding: "10px 6px 6px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                {/* Picking a method IS the subscribe click — payment opens
                    itself right after (OAuth round-trips included). */}
                <AuthCard
                  theme="light"
                  redirectTo="/start"
                  trackingPrefix="start_subscribe"
                  onSuccess={() => { /* the effect above opens payment */ }}
                />
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: colors.textSubtle, margin: "16px 0 0", lineHeight: 1.5, textAlign: "center" }}>
              Team or agency? The Agency plan is coming soon —{" "}
              <a href="mailto:hello@pullup.se" style={{ color: colors.accent, fontWeight: 600 }}>say hi</a>{" "}
              and we'll onboard you personally.{" "}
              <button type="button" onClick={() => navigate("/create")} style={{ background: "none", border: "none", padding: 0, color: colors.textSubtle, fontSize: 12.5, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>
                Just browsing? Draft an event first
              </button>
            </p>
          </>
        )}

        {/* ── 2 · PAYMENT — Stripe's real form, in-page ─────────────────── */}
        {step === "pay" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 22, alignItems: "start" }}>
            <div style={{ background: colors.surface, border: `1px solid ${colors.borderFaint}`, borderRadius: 16, padding: "20px 20px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                What you're getting
              </div>
              <BenefitList />
              <button
                type="button"
                onClick={() => navigate("/create")}
                style={{ marginTop: 16, background: "none", border: "none", padding: 0, color: colors.textMuted, fontSize: 12.5, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}
              >
                Not now — draft an event first
              </button>
            </div>
            <div style={{ borderRadius: 16, overflow: "hidden", minHeight: 420, position: "relative" }}>
              {!mounted && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: colors.textMuted }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid ${colors.border}`, borderTopColor: colors.accent, animation: "startSpin 0.8s linear infinite" }} />
                  <div style={{ fontSize: 13 }}>Preparing secure checkout…</div>
                  {error && <div style={{ fontSize: 12.5, color: "#ef4444", maxWidth: 280, textAlign: "center" }}>{error}</div>}
                  <style>{`@keyframes startSpin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}
              <div ref={mountRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
