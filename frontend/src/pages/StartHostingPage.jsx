// /start — THE creator onboarding, shaped like the best subscription flows
// (Spotify/Notion): ONE surface, steps replacing each other in place, the
// order summary always visible, minimum clicks between decision and done.
//
//   plan    — the pitch + price. One button.
//   account — auth INLINE (Google primary, email code beside it) — a checkout
//             step, not a login interruption. The Google round-trip remembers
//             the intent and comes back straight into…
//   pay     — Stripe Embedded Checkout mounted in-page (card, Link, wallets).
//             Completion returns here, syncs, and forwards into /create.
//
// Profile details are NOT collected here — the profile-setup banner prompts
// for them later, after the person is in. Already-entitled visitors skip
// straight to /create; the publish-time paywall stays the backstop.

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

// Survives the Google OAuth round-trip (same tab): "they already clicked
// Continue — come back INTO the payment step, don't replay the pitch".
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

// The always-visible order line + step dots: account → payment. Small, quiet,
// tells the person exactly where they are and what it costs, the whole way.
function StepHeader({ step }) {
  const steps = [
    { key: "account", label: "Account" },
    { key: "pay", label: "Payment" },
  ];
  const activeIdx = step === "pay" ? 1 : 0;
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
  // Coming back from the Google round-trip with intent? Land IN the flow, not
  // on the pitch — the payment panel shows its loader while the session mints.
  const [step, setStep] = useState(() => (readPayIntent() ? "pay" : "plan")); // plan | account | pay
  const [busy, setBusy] = useState(false);
  const [checkoutInstance, setCheckoutInstance] = useState(null); // Stripe embedded checkout
  const [mounted, setMounted] = useState(false); // …and it's actually in the DOM
  const [error, setError] = useState("");
  const autoFired = useRef(false);
  const checkoutRef = useRef(null); // same instance, reachable from cleanup
  const mountRef = useRef(null);

  const canHost = !!sub && (!sub.enforced || sub.entitlement?.canHost);

  // Mint an embedded session and mount Stripe's form into the page. Falls back
  // to the hosted redirect if embedding fails — paying must never dead-end.
  const launchCheckout = useCallback(async () => {
    setStep("pay");
    setBusy(true);
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
        setCheckoutInstance(checkout); // the mount effect takes it from here
        setBusy(false);
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
      setError("Couldn't open the payment form — try again in a moment.");
      setBusy(false);
    }
  }, []);

  // Mount once BOTH exist: the Stripe instance and the payment step's DOM node
  // (state-driven — a rAF can race React's commit, an effect can't).
  useEffect(() => {
    if (checkoutInstance && step === "pay" && mountRef.current && !mounted) {
      checkoutInstance.mount(mountRef.current);
      setMounted(true);
    }
  }, [checkoutInstance, step, mounted]);

  // Tear the Stripe frame down when leaving.
  useEffect(() => () => { checkoutRef.current?.destroy?.(); }, []);
  const backToPlan = () => {
    checkoutRef.current?.destroy?.();
    checkoutRef.current = null;
    setCheckoutInstance(null);
    setMounted(false);
    setPayIntent(false);
    setStep("plan");
  };

  // Entitled (paid, founder, paywall off) → go build. Authed with remembered
  // intent → mint the payment session, exactly once.
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

  // The one meaningful click. Signed in → payment. Not signed in → the account
  // step slides in (inline, same surface) and payment follows automatically.
  function subscribe() {
    if (!user) {
      setPayIntent(true);
      setStep("account");
      return;
    }
    launchCheckout();
  }

  // Lost intent (auth dismissed / stale return): showing "pay" with no user
  // would strand them — fall back to the pitch.
  useEffect(() => {
    if (!authLoading && !user && step === "pay") setStep("plan");
  }, [authLoading, user, step]);

  const resolvingEntitled = !!user && (subLoading || !sub || canHost);

  return (
    <div style={{ minHeight: "100dvh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: step === "pay" ? "min(960px, 100%)" : "min(480px, 100%)", transition: "width 0.25s ease" }}>
        {step !== "plan" && <StepHeader step={step} />}

        {/* ── PLAN ─────────────────────────────────────────────────────── */}
        {step === "plan" && (
          <div style={{ textAlign: "center" }}>
            <PullupEyes variant="big" style={{ width: 92, height: 80, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 12, fontWeight: 800, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Start hosting
            </div>
            <h1 style={{ fontSize: "clamp(24px, 4.5vw, 32px)", fontWeight: 800, lineHeight: 1.15, color: colors.text, margin: "0 0 10px" }}>
              Set up your Creator account
            </h1>
            <p style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 1.6, margin: "0 0 22px" }}>
              Hosting on PullUp — events live, a community page open, products
              selling — runs on one flat plan. Being a guest stays free, forever.
            </p>

            <div style={{ textAlign: "left", background: colors.surface, border: `1px solid ${colors.borderFaint}`, borderRadius: 16, padding: "22px 22px 20px", boxShadow: "0 8px 30px rgba(10,10,10,0.06)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: colors.text }}>Creator</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: colors.text }}>
                  125 kr<span style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted }}>/month</span>
                </span>
              </div>
              <BenefitList />

              {error && (
                <div style={{ margin: "14px 0 0", padding: "10px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 13, color: "#ef4444" }}>
                  {error}
                </div>
              )}

              <button
                onClick={subscribe}
                disabled={busy || resolvingEntitled}
                style={{
                  width: "100%", marginTop: 18, padding: "13px 18px", borderRadius: 12, border: "none",
                  background: colors.text, color: "#fff", fontSize: 14.5, fontWeight: 800,
                  cursor: "pointer", opacity: busy || resolvingEntitled ? 0.65 : 1,
                }}
              >
                {resolvingEntitled ? "One moment…" : "Subscribe & start hosting — 125 kr/month"}
              </button>
              <p style={{ fontSize: 11.5, color: colors.textFaded, textAlign: "center", margin: "10px 0 0" }}>
                Secure payment by Stripe, right here on the page. Manage or cancel anytime from Settings → Billing.
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
        )}

        {/* ── ACCOUNT (inline — a checkout step, not a login modal) ────── */}
        {step === "account" && (
          <div style={{ background: colors.surface, border: `1px solid ${colors.borderFaint}`, borderRadius: 16, padding: "8px 6px 6px", boxShadow: "0 8px 30px rgba(10,10,10,0.06)" }}>
            <AuthCard
              theme="light"
              redirectTo="/start"
              trackingPrefix="start_subscribe"
              onSuccess={() => { /* effect above sees the user + intent and opens payment */ }}
            />
            <button
              type="button"
              onClick={backToPlan}
              style={{ display: "block", margin: "2px auto 10px", background: "none", border: "none", color: colors.textSubtle, fontSize: 12.5, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}
            >
              ← Back
            </button>
          </div>
        )}

        {/* ── PAYMENT (Stripe's real form, in-page) ─────────────────────── */}
        {step === "pay" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 22, alignItems: "start" }}>
            <div style={{ background: colors.surface, border: `1px solid ${colors.borderFaint}`, borderRadius: 16, padding: "20px 20px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                What you're getting
              </div>
              <BenefitList />
              <button
                type="button"
                onClick={backToPlan}
                style={{ marginTop: 16, background: "none", border: "none", padding: 0, color: colors.textMuted, fontSize: 12.5, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}
              >
                ← Back
              </button>
            </div>
            <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${colors.borderFaint}`, padding: 8, minHeight: 420, position: "relative" }}>
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
