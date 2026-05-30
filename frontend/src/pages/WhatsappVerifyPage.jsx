// frontend/src/pages/WhatsappVerifyPage.jsx
//
// End-to-end demo of the phone-as-identity magic-link flow.
//
// Flow:
//   1. User enters their phone (+ optional name).
//   2. We POST /api/verify/phone/start — backend normalises the phone,
//      generates a single-use token, and "sends" the magic link via
//      the WhatsApp Cloud API. In sandbox mode the link comes back in
//      the response (so a dev can tap it without an actual Meta WABA).
//   3. The user taps the link → backend redeems → phone_verified_at
//      stamped → we land back on the success screen.
//
// This page is the proving ground for the architecture. The same backend
// endpoints power the real signup, RSVP, and VIP-invite flows in
// subsequent passes.

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { API_BASE } from "../lib/env";
import { colors } from "../theme/colors";

function PhoneBubble({ link }) {
  return (
    <div
      style={{
        background: "#e9f7ef",
        color: "#0a0a0a",
        padding: "12px 14px 8px",
        borderRadius: "12px 12px 12px 4px",
        maxWidth: 320,
        fontSize: 14.5,
        lineHeight: 1.5,
        boxShadow: "0 1px 4px rgba(10,10,10,0.08)",
        marginLeft: 6,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div>Tap to finish on PullUp:</div>
      <div
        style={{
          color: colors.secondary,
          wordBreak: "break-all",
          marginTop: 2,
        }}
      >
        {link}
      </div>
      <div
        style={{
          fontSize: 11,
          color: colors.textSubtle,
          marginTop: 6,
          textAlign: "right",
        }}
      >
        now
      </div>
    </div>
  );
}

export function WhatsappVerifyPage() {
  const [searchParams] = useSearchParams();
  const verifiedFlag = searchParams.get("phone_verified") === "1";

  const [phone, setPhone] = useState("");
  const [defaultCountry, setDefaultCountry] = useState("SE");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    if (!phone.trim()) {
      setError("Enter your phone number to continue.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/verify/phone/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          intent: "verify_phone",
          defaultCountry: defaultCountry || undefined,
          payload: {
            redirect_url: "/whatsapp-verify?phone_verified=1",
            name: name.trim() || undefined,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Could not start verification.");
        return;
      }
      setResult(json);
    } catch (err) {
      setError(err?.message || "Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (verifiedFlag) {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div
            style={{
              fontSize: 56,
              lineHeight: 1,
              marginBottom: 14,
              color: colors.success,
            }}
          >
            ✓
          </div>
          <h1 style={{ fontSize: 22, margin: "0 0 8px", color: colors.text }}>
            Phone verified
          </h1>
          <p style={{ color: colors.textMuted, fontSize: 14, lineHeight: 1.5 }}>
            We've stamped your phone as verified. Future events you RSVP to,
            payments you receive, and reminders you send all key off this
            single trusted number.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {!result ? (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 4px", color: colors.text }}>
            Verify your phone
          </h1>
          <p style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
            We send a one-tap link via WhatsApp — no codes to read, no
            switching apps to copy digits. Faster, and it doubles as the
            identity we'll use for payments later.
          </p>

          <label style={{ fontSize: 12, color: colors.textMuted }}>
            Phone
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <select
                value={defaultCountry}
                onChange={(e) => setDefaultCountry(e.target.value)}
                style={{
                  ...inputStyle,
                  flex: "0 0 80px",
                  textAlignLast: "center",
                }}
              >
                <option value="SE">SE</option>
                <option value="KE">KE</option>
                <option value="US">US</option>
                <option value="GB">GB</option>
                <option value="DE">DE</option>
                <option value="FR">FR</option>
                <option value="IN">IN</option>
                <option value="BR">BR</option>
                <option value="NG">NG</option>
              </select>
              <input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="070 123 45 67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </label>

          <label style={{ fontSize: 12, color: colors.textMuted }}>
            First name (optional)
            <input
              type="text"
              autoComplete="given-name"
              placeholder="Adam"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>

          {error && (
            <div
              style={{
                color: colors.danger,
                fontSize: 13,
                padding: "8px 10px",
                background: colors.dangerRgba,
                borderRadius: 8,
                border: `1px solid rgba(220,38,38,0.18)`,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: colors.accent,
              color: "#ffffff",
              border: "none",
              padding: "12px 18px",
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
              marginTop: 4,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Sending…" : "Send WhatsApp link"}
          </button>
        </form>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h1 style={{ fontSize: 20, margin: "0 0 4px", color: colors.text }}>
            Tap the link in WhatsApp
          </h1>
          <p style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
            We just messaged{" "}
            <span style={{ color: colors.text, fontWeight: 600 }}>{result.e164}</span>. Open
            WhatsApp and tap the link — that's it, you're verified.
          </p>

          <div style={{ marginTop: 4, marginBottom: 4 }}>
            <PhoneBubble link={result.sandbox_link || "https://pullup.se/v/…"} />
          </div>

          {result.sandbox_link && (
            <a
              href={result.sandbox_link}
              style={{
                display: "block",
                textAlign: "center",
                background: colors.secondarySoft,
                color: colors.secondary,
                border: `1px solid ${colors.secondaryBorder}`,
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Sandbox: tap to redeem here
            </a>
          )}

          <div
            style={{
              fontSize: 11,
              color: colors.textSubtle,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            Link expires in 15 minutes. Tracking: <code>{result.token_id}</code>
          </div>
        </div>
      )}
    </Shell>
  );
}

const inputStyle = {
  width: "100%",
  background: colors.surface,
  border: `1px solid ${colors.borderStrong}`,
  color: colors.text,
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
};

function Shell({ children }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: colors.background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#ffffff",
          border: `1px solid ${colors.border}`,
          borderRadius: 18,
          padding: "26px 22px",
          boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default WhatsappVerifyPage;
