// frontend/src/components/PhoneVerifyBanner.jsx
//
// Tap-the-link-in-WhatsApp banner. Renders ONLY when the parent screen
// finds `pullup_pending_phone_verify` in sessionStorage — set by
// RsvpForm right after a successful submit when the guest provided a
// phone. The banner is small, friendly, and self-dismissing.
//
// Dark-zone styling, designed to ride above the success-page content
// without competing with the existing badges (uses muted secondary
// teal instead of accent pink).
//
// Lifetime: cleared from sessionStorage on first render OR after 5
// minutes — once a guest sees the message, they don't need to be
// nagged again.

import { useEffect, useState } from "react";
import { FaWhatsapp } from "react-icons/fa6";
import { X } from "lucide-react";

const STORAGE_KEY = "pullup_pending_phone_verify";
const MAX_AGE_MS = 5 * 60 * 1000;

export function PhoneVerifyBanner({ variant = "dark" }) {
  const [pending, setPending] = useState(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data?.e164) return;
      if (Date.now() - (data.ts || 0) > MAX_AGE_MS) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      setPending(data);
    } catch {
      /* private mode / no storage */
    }
  }, []);

  if (!pending) return null;

  const dismiss = () => {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    setPending(null);
  };

  const isDark = variant === "dark";

  const palette = isDark
    ? {
        cardBg: "rgba(13, 148, 136, 0.14)",
        cardBorder: "rgba(13, 148, 136, 0.35)",
        title: "#fff",
        body: "rgba(255,255,255,0.78)",
        muted: "rgba(255,255,255,0.55)",
        icon: "#5eead4",
        link: "#5eead4",
        bubbleBg: "rgba(255,255,255,0.06)",
        bubbleBorder: "rgba(255,255,255,0.12)",
        bubbleText: "#fff",
        bubbleLink: "#5eead4",
      }
    : {
        cardBg: "rgba(13, 148, 136, 0.08)",
        cardBorder: "rgba(13, 148, 136, 0.28)",
        title: "#0a0a0a",
        body: "rgba(10, 10, 10, 0.72)",
        muted: "rgba(10, 10, 10, 0.45)",
        icon: "#0d9488",
        link: "#0d9488",
        bubbleBg: "#e9f7ef",
        bubbleBorder: "rgba(10, 10, 10, 0.10)",
        bubbleText: "#0a0a0a",
        bubbleLink: "#0d9488",
      };

  return (
    <div
      style={{
        margin: "0 auto 16px",
        maxWidth: "560px",
        padding: "14px 16px",
        borderRadius: 14,
        background: palette.cardBg,
        border: `1px solid ${palette.cardBorder}`,
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        position: "relative",
      }}
    >
      <FaWhatsapp size={22} color={palette.icon} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: palette.title, marginBottom: 4 }}>
          Tap the link we WhatsApp'd you
        </div>
        <div style={{ fontSize: 12.5, color: palette.body, lineHeight: 1.5 }}>
          We sent a one-tap verification link to{" "}
          <strong style={{ color: palette.title }}>{pending.e164}</strong>.
          Tapping it locks you in for reminders + faster RSVP next time.
        </div>

        {/* Tiny chat-bubble preview so the visual matches what they'll see */}
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px 6px",
            borderRadius: "12px 12px 12px 4px",
            background: palette.bubbleBg,
            border: `1px solid ${palette.bubbleBorder}`,
            color: palette.bubbleText,
            fontSize: 13,
            lineHeight: 1.4,
            maxWidth: 320,
          }}
        >
          <div>Tap to finish on PullUp:</div>
          <div style={{ color: palette.bubbleLink, wordBreak: "break-all", marginTop: 2 }}>
            {pending.sandbox_link || "https://pullup.se/v/…"}
          </div>
          <div style={{ fontSize: 10.5, color: palette.muted, marginTop: 4, textAlign: "right" }}>
            now
          </div>
        </div>

        {pending.sandbox_link && (
          <a
            href={pending.sandbox_link}
            style={{
              display: "inline-block",
              marginTop: 8,
              fontSize: 12,
              color: palette.link,
              textDecoration: "underline",
            }}
          >
            Sandbox: tap to redeem here
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: palette.muted,
          cursor: "pointer",
          padding: 4,
          marginLeft: 4,
          flexShrink: 0,
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default PhoneVerifyBanner;
