// frontend/src/components/V2CheckoutPanel.jsx
//
// The rail-agnostic checkout for paid RSVPs (payments v2). The RSVP just came
// back PENDING_PAYMENT with a list of rails — the guest picks one and pays in
// the way their city actually pays:
//   mpesa → STK push: we fire the charge, their phone pops the PIN prompt
//   swish → deep link / e-commerce push into the Swish app
//   card  → handled by the EXISTING Stripe Elements form (the parent morphs
//           the charge into the legacy pendingPayment shape — never here)
//   mock  → dev-only simulate button so the whole flow runs locally
// After the charge we poll the public payment status until the rail's webhook
// settles it server-side, then hand control back to the page for navigation.

import { useEffect, useRef, useState } from "react";
import { publicFetch } from "../lib/api.js";
import { API_BASE } from "../lib/env.js";

const RAIL_META = {
  mpesa: { label: "M-Pesa", hint: "Pay with the prompt on your phone" },
  swish: { label: "Swish", hint: "Pay in the Swish app" },
  card: { label: "Card", hint: "Visa, Mastercard, Amex" },
  mock: { label: "Test payment", hint: "Dev only — simulates a settled charge" },
};

// mpesa/swish move money through the guest's phone number.
const RAIL_NEEDS_PHONE = { mpesa: true, swish: false };

// Swish payment requests expire server-side after ~3 minutes — reflect that
// instead of polling forever.
const SWISH_EXPIRY_MS = 3.5 * 60 * 1000;

const IS_MOBILE = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// The deep link the Swish app opens; callbackurl bounces the guest straight
// back to this page after approving.
function swishDeepLink(appUrl) {
  if (!appUrl) return null;
  try {
    return `${appUrl}&callbackurl=${encodeURIComponent(window.location.href)}`;
  } catch {
    return appUrl;
  }
}

export function V2CheckoutPanel({ payment, onStripeCharge, onSuccess, onError }) {
  const rails = payment?.rails || [];
  const [rail, setRail] = useState(rails[0] || null);
  const [phone, setPhone] = useState("");
  const [charging, setCharging] = useState(false);
  const [charge, setCharge] = useState(null); // the /charge response
  const [status, setStatus] = useState(null); // null | pending | succeeded | failed
  const [error, setError] = useState("");
  const pollRef = useRef(null);
  const expiryRef = useRef(null);

  // Tell the rail the guest walked away, so no ghost request lingers in
  // their Swish app. Fire-and-forget.
  const cancelPending = (paymentId) => {
    if (!paymentId) return;
    publicFetch(`/payments/v2/${paymentId}/cancel`, { method: "POST" }).catch(() => {});
  };

  // Poll the settlement: the rail's webhook flips the payment server-side.
  useEffect(() => {
    if (!charge?.paymentId || status === "succeeded" || status === "failed") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await publicFetch(`/payments/${charge.paymentId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "succeeded") {
          clearInterval(pollRef.current);
          setStatus("succeeded");
          onSuccess?.({ paymentId: charge.paymentId, ...charge });
        } else if (data.status === "failed" || data.status === "canceled") {
          clearInterval(pollRef.current);
          setStatus("failed");
        }
      } catch { /* keep polling */ }
    }, 2500);
    return () => clearInterval(pollRef.current);
  }, [charge?.paymentId, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Swish requests die after ~3 min — surface that as a clean retry instead
  // of an eternal spinner.
  useEffect(() => {
    if (!charge?.paymentId || status !== "pending" || !charge?.rail || charge.rail !== "swish") return;
    expiryRef.current = setTimeout(() => {
      clearInterval(pollRef.current);
      cancelPending(charge.paymentId);
      setStatus("failed");
      setError("The Swish request expired — start it again when you're ready.");
    }, SWISH_EXPIRY_MS);
    return () => clearTimeout(expiryRef.current);
  }, [charge?.paymentId, charge?.rail, status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startCharge() {
    if (!rail || charging) return;
    if (RAIL_NEEDS_PHONE[rail] && !phone.trim()) {
      setError("Enter the phone number you pay with");
      return;
    }
    setError("");
    setCharging(true);
    try {
      const res = await publicFetch(`/public/rsvps/${payment.rsvpId}/charge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rail, phone: phone.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          body.error === "invalid_kenyan_phone"
            ? "That doesn't look like a Kenyan M-Pesa number (07… or +2547…)."
            : body.message || "Payment couldn't start. Try again.";
        setError(msg);
        onError?.(new Error(msg));
        return;
      }
      // Card rides the existing Stripe Elements flow — hand the clientSecret
      // up and step aside.
      if (body.instructions?.type === "stripe") {
        onStripeCharge?.(body);
        return;
      }
      setCharge(body);
      setStatus("pending");
    } catch {
      setError("Payment couldn't start. Check your connection and try again.");
    } finally {
      setCharging(false);
    }
  }

  async function confirmMock(outcome = "succeeded") {
    if (!charge?.instructions?.confirmPath) return;
    await publicFetch(charge.instructions.confirmPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    }).catch(() => {});
  }

  // ── Settled ────────────────────────────────────────────────────────────────
  if (status === "succeeded") {
    return (
      <div style={noticeStyle("rgba(34, 197, 94, 0.1)", "rgba(34, 197, 94, 0.25)")}>
        <div style={{ fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>Payment received</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Your spot is confirmed — taking you there…</div>
      </div>
    );
  }

  // ── Waiting on the rail ───────────────────────────────────────────────────
  if (charge && status === "pending") {
    const ins = charge.instructions || {};
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={noticeStyle("rgba(255,255,255,0.04)", "rgba(255,255,255,0.1)")}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: "#fff" }}>
            {ins.type === "stk_push" ? "Check your phone" : ins.type?.startsWith("swish") ? "Open Swish" : "Waiting for payment"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>{ins.message}</div>
          {ins.type === "swish_mcommerce" && ins.appUrl && IS_MOBILE && (
            <a
              href={swishDeepLink(ins.appUrl)}
              style={{ ...buttonStyle(false), display: "block", textAlign: "center", textDecoration: "none", marginTop: 12 }}
            >
              Open Swish
            </a>
          )}
          {ins.type === "swish_mcommerce" && ins.qrPath && !IS_MOBILE && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <img
                src={`${API_BASE}${ins.qrPath}?size=220`}
                alt="Swish QR code"
                width={220}
                height={220}
                style={{ borderRadius: 12, background: "#fff", padding: 8 }}
              />
              <div style={{ fontSize: 12, opacity: 0.6, textAlign: "center" }}>
                Scan with the Swish app (or your camera) to pay on your phone.
              </div>
            </div>
          )}
          {ins.type === "mock" && (
            <button type="button" onClick={() => confirmMock("succeeded")} style={{ ...buttonStyle(false), marginTop: 12 }}>
              Simulate payment
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12, opacity: 0.5 }}>
            <span style={spinnerStyle} />
            Confirming with {RAIL_META[charge.rail]?.label || charge.rail}…
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            clearInterval(pollRef.current);
            clearTimeout(expiryRef.current);
            cancelPending(charge.paymentId);
            setCharge(null);
            setStatus(null);
          }}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 13, cursor: "pointer", padding: 6 }}
        >
          Pay another way
        </button>
      </div>
    );
  }

  // ── Failed → retry ────────────────────────────────────────────────────────
  // (falls through to the picker with an error banner)

  // ── Rail picker ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {status === "failed" && (
        <div style={noticeStyle("rgba(239, 68, 68, 0.1)", "rgba(239, 68, 68, 0.2)")}>
          <div style={{ fontSize: 13, color: "#ef4444" }}>
            That payment didn't go through. Try again or pick another way to pay.
          </div>
        </div>
      )}
      {rails.length > 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rails.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { setRail(r); setError(""); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 4,
                border: rail === r ? "1.5px solid var(--brand-primary, #fff)" : "1px solid rgba(255,255,255,0.1)",
                background: rail === r ? "rgba(255,255,255,0.06)" : "transparent",
                color: "#fff",
                cursor: "pointer",
                textAlign: "left",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{RAIL_META[r]?.label || r}</span>
              <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto" }}>{RAIL_META[r]?.hint}</span>
            </button>
          ))}
        </div>
      )}
      {(RAIL_NEEDS_PHONE[rail] || rail === "swish") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {rail === "swish" ? "Swish number (optional)" : "M-Pesa number"}
          </label>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(""); }}
            placeholder={rail === "swish" ? (IS_MOBILE ? "Leave empty to open the Swish app" : "Leave empty to pay by QR code") : "07… or +2547…"}
            style={{
              width: "100%",
              padding: "12px 0",
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
              background: "transparent",
              color: "#fff",
              fontSize: 15,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: "#ef4444" }}>{error}</div>
      )}
      <button type="button" onClick={startCharge} disabled={charging || !rail} style={buttonStyle(charging || !rail)}>
        {charging ? "Starting…" : `Pay with ${RAIL_META[rail]?.label || "—"}`}
      </button>
    </div>
  );
}

function noticeStyle(bg, border) {
  return { padding: "14px 16px", borderRadius: 4, background: bg, border: `1px solid ${border}` };
}

function buttonStyle(disabled) {
  return {
    width: "100%",
    padding: "14px",
    borderRadius: 4,
    border: "none",
    background: disabled ? "rgba(255,255,255,0.08)" : "var(--brand-primary, #fff)",
    color: disabled ? "rgba(255,255,255,0.4)" : "var(--brand-ink-on-primary, #000)",
    fontFamily: "var(--brand-btn-font, inherit)",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
    WebkitTapHighlightColor: "transparent",
  };
}

const spinnerStyle = {
  width: 12,
  height: 12,
  borderRadius: "50%",
  border: "2px solid rgba(255,255,255,0.2)",
  borderTopColor: "rgba(255,255,255,0.7)",
  display: "inline-block",
  animation: "spin 0.9s linear infinite",
};
