// src/components/SubscriptionPaywall.jsx
//
// The subscribe sheet, shown when a publish action comes back 402
// subscription_required. Keep it MOUNTED (open=false renders nothing) wherever
// publishes happen: its useSubscription hook also finishes a returning
// checkout (?subscribed=1&session_id=…) on mount, so the host who just paid
// comes back unlocked without any extra wiring.
//
// One promise, stated plainly: 125 kr/month while you host, cancel anytime,
// your data is yours either way. Free to be a guest, always.

import { useState } from "react";
import { useSubscription } from "../lib/useSubscription.js";
import { colors } from "../theme/colors.js";

export default function SubscriptionPaywall({ open, onClose, title }) {
  const { sub, startCheckout } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const price = sub?.tier?.priceSek ?? 125;

  async function subscribe() {
    setBusy(true);
    setError("");
    try {
      const ok = await startCheckout(); // returns here after Stripe
      if (!ok) {
        setError("Couldn't open checkout — try again in a moment.");
        setBusy(false);
      }
    } catch {
      setError("Couldn't open checkout — try again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(10,10,12,0.55)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: "min(440px, 100%)", background: colors.surface, color: colors.text,
          borderRadius: 18, border: `1px solid ${colors.borderFaint}`,
          padding: "28px 26px", boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
          Creator tier
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 6px", lineHeight: 1.25 }}>
          {title || "Publishing is where hosting starts"}
        </h2>
        <p style={{ fontSize: 14, color: colors.textMuted, lineHeight: 1.55, margin: "0 0 18px" }}>
          Being a guest on PullUp is free, forever. Hosting — your events live, your community
          page open, your products selling — runs on one flat subscription.
        </p>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 32, fontWeight: 900 }}>{price} kr</span>
          <span style={{ fontSize: 14, color: colors.textMuted }}>/month · cancel anytime</span>
        </div>

        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            "Unlimited events, pages and people — no per-guest metering, ever",
            "Stop paying the day you leave; your pages pause, nothing is deleted",
            "Your data stays yours — export anytime, or run on your own database at no markup",
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
          {busy ? "Opening secure checkout…" : `Subscribe — ${price} kr/month`}
        </button>
        <button
          onClick={onClose}
          style={{ width: "100%", marginTop: 8, padding: "10px", borderRadius: 12, border: "none", background: "none", color: colors.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          Not now — keep it as a draft
        </button>
        <p style={{ fontSize: 11.5, color: colors.textFaded, textAlign: "center", margin: "10px 0 0" }}>
          Secure payment by Stripe. Manage or cancel from Settings → Billing.
        </p>
      </div>
    </div>
  );
}
