// InstallPrompt — PullUp's own "quick, get it as an app" nudge.
//
// Renders NOTHING unless usePwaInstall says this visitor can actually install
// right now (prompt captured on Android/Chromium, or iOS Safari where we hand
// them the Share → Add to Home Screen steps). Never a dead button.
//
// Two placements, one component:
//   • "banner" — a branded card that slides up from the bottom (the post-RSVP
//     and host-home moment). Dismissible; dismiss snoozes it for 14 days.
//   • "inline" — a quiet pill for the landing page, secondary to "Get started".
//
// Copy is caller-supplied (headline/subtext/cta) so the surface sets the
// context — guests get "your ticket in your pocket", hosts get "your Room on
// your home screen".

import { useState } from "react";
import { Share, Plus, X, Smartphone } from "lucide-react";
import { colors } from "../../theme/colors.js";
import { PullupEyes } from "../PullupEyes.jsx";
import { usePwaInstall } from "../../lib/pwa/usePwaInstall.js";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export function InstallPrompt({
  placement = "banner",
  headline = "Get PullUp as an app",
  subtext = "Add it to your home screen — opens instantly, no browser bar.",
  cta = "Get the app",
}) {
  const { canInstall, isIOSSafari, promptInstall, dismiss } = usePwaInstall();
  const [showIOSSheet, setShowIOSSheet] = useState(false);

  if (!canInstall) return null;

  const handleGet = async () => {
    if (isIOSSafari) {
      setShowIOSSheet(true);
      return;
    }
    await promptInstall();
  };

  const iosSheet = showIOSSheet ? (
    <IOSInstructions onClose={() => setShowIOSSheet(false)} />
  ) : null;

  if (placement === "inline") {
    return (
      <>
        <button type="button" onClick={handleGet} style={inlineButtonStyle}>
          <Smartphone size={16} strokeWidth={2.2} />
          <span>{cta}</span>
        </button>
        {iosSheet}
      </>
    );
  }

  // placement === "banner"
  return (
    <>
      <style>{BANNER_KEYFRAMES}</style>
      <div role="dialog" aria-label={headline} style={bannerWrapStyle}>
        <div style={bannerCardStyle}>
          <div style={{ flexShrink: 0 }}>
            <span style={iconBadgeStyle}>
              <PullupEyes variant="small" style={{ width: 26, height: 26 }} />
            </span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={bannerHeadlineStyle}>{headline}</div>
            <div style={bannerSubtextStyle}>{subtext}</div>
            <button type="button" onClick={handleGet} style={primaryButtonStyle}>
              <Smartphone size={17} strokeWidth={2.2} />
              <span>{cta}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => dismiss()}
            aria-label="Not now"
            style={closeButtonStyle}
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
      </div>
      {iosSheet}
    </>
  );
}

function IOSInstructions({ onClose }) {
  return (
    <div style={iosOverlayStyle} onClick={onClose}>
      <div style={iosSheetStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: colors.text, fontFamily: SF }}>
            Add PullUp to your Home Screen
          </span>
          <button type="button" onClick={onClose} aria-label="Close" style={closeButtonStyle}>
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
        <ol style={iosStepsStyle}>
          <li style={iosStepStyle}>
            <span>Tap the</span>
            <span style={iosGlyphStyle}><Share size={16} strokeWidth={2.2} /></span>
            <span><strong>Share</strong> button in Safari's toolbar.</span>
          </li>
          <li style={iosStepStyle}>
            <span>Choose</span>
            <span style={iosGlyphStyle}><Plus size={16} strokeWidth={2.4} /></span>
            <span><strong>Add to Home Screen</strong>.</span>
          </li>
          <li style={iosStepStyle}>
            <span>Tap <strong>Add</strong> — PullUp lands on your home screen.</span>
          </li>
        </ol>
      </div>
    </div>
  );
}

// ─── styles ──────────────────────────────────────────────────────────
const BANNER_KEYFRAMES = `
@keyframes pullup-install-rise {
  from { transform: translate(-50%, 120%); opacity: 0; }
  to   { transform: translate(-50%, 0); opacity: 1; }
}`;

const bannerWrapStyle = {
  position: "fixed",
  left: "50%",
  bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
  transform: "translateX(-50%)",
  width: "calc(100% - 24px)",
  maxWidth: 440,
  zIndex: 1000,
  animation: "pullup-install-rise 0.32s cubic-bezier(0.16, 1, 0.3, 1) both",
  fontFamily: SF,
};

const bannerCardStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  padding: "16px 16px 16px 14px",
  background: colors.background,
  border: `1px solid ${colors.border}`,
  borderRadius: 18,
  boxShadow: "0 18px 50px rgba(10, 10, 10, 0.16), 0 2px 8px rgba(10, 10, 10, 0.06)",
};

const iconBadgeStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  borderRadius: 12,
  background: colors.surface,
  border: `1px solid ${colors.borderFaint}`,
};

const bannerHeadlineStyle = {
  fontSize: 15.5,
  fontWeight: 700,
  color: colors.text,
  lineHeight: 1.25,
  marginBottom: 3,
};

const bannerSubtextStyle = {
  fontSize: 13,
  color: colors.textMuted,
  lineHeight: 1.45,
  marginBottom: 12,
};

const primaryButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 44,
  padding: "0 18px",
  background: colors.accent,
  color: "#fff",
  border: "none",
  borderRadius: 999,
  fontSize: 14.5,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: colors.accentShadow,
  fontFamily: SF,
};

const closeButtonStyle = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  background: "transparent",
  border: "none",
  borderRadius: 8,
  color: colors.textMuted,
  cursor: "pointer",
};

const inlineButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: 44,
  padding: "0 18px",
  background: "transparent",
  color: colors.text,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 999,
  fontSize: 14.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: SF,
};

const iosOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1100,
  background: "rgba(10, 10, 10, 0.38)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  fontFamily: SF,
};

const iosSheetStyle = {
  width: "100%",
  maxWidth: 480,
  margin: 12,
  marginBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
  padding: 20,
  background: colors.background,
  border: `1px solid ${colors.border}`,
  borderRadius: 20,
  boxShadow: "0 24px 60px rgba(10, 10, 10, 0.24)",
};

const iosStepsStyle = {
  listStyle: "decimal",
  paddingLeft: 20,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const iosStepStyle = {
  fontSize: 14.5,
  color: colors.text,
  lineHeight: 1.5,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
};

const iosGlyphStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: 7,
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  color: colors.accent,
};
