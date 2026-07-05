// /start — THE creator onboarding, one straight line: plan → account → pay →
// build. Friction-ordered for someone who has already decided (every landing
// CTA lands here):
//   1. The plan card shows IMMEDIATELY — no auth wall before the pitch.
//   2. "Subscribe" is the one click. No session? Auth opens, and because the
//      intent is remembered across the OAuth round-trip, the payment step
//      opens AUTOMATICALLY after sign-in — nobody is asked twice.
//   3. Payment happens RIGHT HERE: Stripe Embedded Checkout mounts inside the
//      page (benefits on one side, card fields on the other) — no redirect.
//      On completion Stripe returns to /start?subscribed=1&session_id=…, the
//      subscription syncs server-side, and they're forwarded into /create.
// Already-entitled visitors (founders, subscribers, paywall-off deployments)
// skip straight through to /create. The publish-time paywall stays as the
// backstop for people who wander into /create directly.

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { useAuth } from "../contexts/AuthContext";
import { AuthGate } from "../components/auth/AuthGate.jsx";
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
// Subscribe — don't ask again, open the payment step after auth".
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

function BenefitList({ compact = false }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: compact ? 10 : 8 }}>
      {BENEFITS.map((line) => (
        <li key={line} style={{ fontSize: 13.5, color: colors.textMuted, lineHeight: 1.5, display: "flex", gap: 8 }}>
          <span style={{ color: colors.accent, fontWeight: 800 }}>·</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

export function StartHostingPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { sub, loading: subLoading } = useSubscription(); // also finishes a returning payment (?session_id sync)
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false); // embedded checkout is mounted
  const [showAuth, setShowAuth] = useState(false);
  const [error, setError] = useState("");
  const autoFired = useRef(false);
  const checkoutRef = useRef(null); // Stripe embedded-checkout instance
  const mountRef = useRef(null);

  const canHost = !!sub && (!sub.enforced || sub.entitlement?.canHost);

  // Open the payment step: fetch an embedded session and mount Stripe's form
  // into the page. Falls back to the hosted redirect if embedding fails
  // (missing publishable key, blocked scripts) — paying must never dead-end.
  const launchCheckout = useCallback(async () => {
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
        setPaying(true); // render the container…
        // …then mount into it on the next frame.
        requestAnimationFrame(() => {
          if (mountRef.current) checkout.mount(mountRef.current);
        });
        setBusy(false);
        return;
      }
      if (b.url) { window.location.assign(b.url); return; } // hosted fallback
      throw new Error("no_session");
    } catch (e) {
      // Last resort: the hosted page. Only surface an error if THAT fails too.
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

  // Tear the Stripe frame down when leaving the page or backing out.
  useEffect(() => () => { checkoutRef.current?.destroy?.(); }, []);
  const backToPlan = () => {
    checkoutRef.current?.destroy?.();
    checkoutRef.current = null;
    setPaying(false);
  };

  // Signed in and allowed to host (paid, founder, or paywall off) → go build.
  // Signed in with a remembered Subscribe click → open the payment step.
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
      // Remember the intent, collect the account, then payment opens itself.
      setPayIntent(true);
      setShowAuth(true);
      return;
    }
    launchCheckout();
  }

  const resolvingEntitled = !!user && (subLoading || !sub || canHost);

  // ── Payment step: benefits beside Stripe's real card form, in-page ────────
  if (paying) {
    return (
      <div style={{ minHeight: "100dvh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "min(960px, 100%)" }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <PullupEyes variant="big" style={{ width: 72, height: 62, margin: "0 auto 12px" }} />
            <h1 style={{ fontSize: "clamp(22px, 4vw, 28px)", fontWeight: 800, color: colors.text, margin: 0 }}>
              Creator — 125 kr/month
            </h1>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 22, alignItems: "start" }}>
            <div style={{ background: colors.surface, border: `1px solid ${colors.borderFaint}`, borderRadius: 16, padding: "20px 20px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                What you're getting
              </div>
              <BenefitList compact />
              <button
                type="button"
                onClick={backToPlan}
                style={{ marginTop: 16, background: "none", border: "none", padding: 0, color: colors.textMuted, fontSize: 12.5, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}
              >
                ← Back
              </button>
            </div>
            {/* Stripe renders the real payment form in here (its own iframe,
                its own light theme) — card fields, total, legal, the lot. */}
            <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${colors.borderFaint}`, padding: 8, minHeight: 420 }}>
              <div ref={mountRef} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Plan step ──────────────────────────────────────────────────────────────
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
            {busy
              ? "Opening the payment form…"
              : resolvingEntitled
                ? "One moment…"
                : "Subscribe & start hosting — 125 kr/month"}
          </button>
          <p style={{ fontSize: 11.5, color: colors.textFaded, textAlign: "center", margin: "10px 0 0" }}>
            {user
              ? "Secure payment by Stripe, right here on the page. Manage or cancel anytime from Settings → Billing."
              : "You'll sign in with Google or email first — the payment form opens right after, automatically."}
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
