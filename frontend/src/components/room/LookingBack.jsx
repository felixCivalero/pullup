// frontend/src/components/room/LookingBack.jsx
//
// "LOOKING BACK" — the legacy layer. The world a host has built, read back to
// them: anniversaries of nights they threw, people who quietly became regulars,
// the world growing. These aren't actions — they're warmth. The append-only
// timeline turns into a body of work, and seeing it accumulate is the kindest
// reason to never leave (leaving means abandoning the history you made here).
//
// Tasteful and quiet by design: a glance, not a feed. Capped server-side,
// dismissible per day (it comes back when there's a genuinely new moment),
// and it simply doesn't render when there's nothing worth looking back on.

import { useState } from "react";
import { Clock3, Heart, Users, ArrowRight } from "lucide-react";
import { colors } from "../../theme/colors.js";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// Per-day dismiss — fresh moments resurface tomorrow rather than being gone for
// good. (Browser-side Date is fine here; the workflow-script restriction doesn't apply.)
const dismissKey = () => `pullup_room_lookingback_${new Date().toDateString()}`;

const ICON = { anniversary: Clock3, regular: Heart, growth: Users };

export default function LookingBack({ moments = [], onOpenPerson, onCreate }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey()) === "1"; } catch { return false; }
  });
  if (!moments.length || dismissed) return null;

  function dismiss() {
    try { localStorage.setItem(dismissKey(), "1"); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div style={{ marginBottom: 26, border: `1px solid ${colors.border}`, borderRadius: 16, background: colors.surface, overflow: "hidden", fontFamily: SF }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px 8px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.accent }}>Looking back</span>
        <button onClick={dismiss} title="Dismiss for today" style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: "50%", border: "none", background: colors.surfaceMuted, color: colors.textSubtle, fontSize: 14, cursor: "pointer", lineHeight: 1 }}>×</button>
      </div>
      <div>
        {moments.map((m) => {
          const Icon = ICON[m.kind] || Users;
          const clickable = !!m.personId || m.kind === "anniversary";
          const onClick = () => {
            if (m.personId) onOpenPerson?.(m.personId);
            else if (m.kind === "anniversary") onCreate?.();
          };
          return (
            <button
              key={m.id}
              onClick={clickable ? onClick : undefined}
              disabled={!clickable}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "11px 16px", border: "none", borderTop: `1px solid ${colors.borderFaint}`, background: "transparent", cursor: clickable ? "pointer" : "default", fontFamily: SF }}
            >
              {m.coverImage ? (
                <img src={m.coverImage} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
              ) : (
                <span style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: colors.accentSoft, color: colors.accent }}>
                  <Icon size={18} />
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: colors.text, lineHeight: 1.45 }}>{m.text}</span>
              {m.cta ? (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.accent, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>{m.cta} <ArrowRight size={13} /></span>
              ) : clickable ? (
                <ArrowRight size={14} style={{ color: colors.accent, flexShrink: 0 }} />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
