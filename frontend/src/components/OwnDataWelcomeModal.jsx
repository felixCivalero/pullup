// OwnDataWelcomeModal.jsx
//
// The "it worked" moment. When a creator comes back from the PullUp ⇄ Supabase
// authorization, this modal floats over the Settings page (page dimmed behind)
// and reads back the live setup as it happens: connect → set up structure →
// copy your world in. A quick, reassuring read that ends on "it's yours."
//
// Presentational: the parent (SettingsOwnDataSection) derives phase/steps from
// the real connection status (which it's already polling) and hands them down.

import { CheckCircle2, Loader2, Database, AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { colors } from "../theme/colors.js";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export default function OwnDataWelcomeModal({
  phase, // 'working' | 'success' | 'error'
  steps = [], // [{ key, label, state: 'done'|'active'|'pending' }]
  projectRef,
  peopleCount,
  errorMsg,
  busy,
  onRetry,
  onClose,
}) {
  return (
    <div
      onClick={phase !== "working" ? onClose : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(12,12,16,0.46)", backdropFilter: "blur(4px)",
        padding: 20, fontFamily: SF, animation: "odwm-fade 220ms ease",
      }}
    >
      <style>{`
        @keyframes odwm-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes odwm-pop { from { opacity: 0; transform: translateY(10px) scale(.97) } to { opacity: 1; transform: none } }
        @keyframes odwm-spin { to { transform: rotate(360deg) } }
        @keyframes odwm-ring { 0% { transform: scale(.6); opacity: .5 } 70% { transform: scale(1.25); opacity: 0 } 100% { opacity: 0 } }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 460, background: "#fff", borderRadius: 22,
          border: `1px solid ${colors.border}`, boxShadow: "0 30px 80px rgba(10,10,10,0.28)",
          padding: 30, animation: "odwm-pop 280ms cubic-bezier(.2,.9,.3,1.2)",
        }}
      >
        {/* Hero icon */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <Hero phase={phase} />
        </div>

        {/* Title + lede */}
        <h2 style={{ fontSize: 21, fontWeight: 800, color: colors.text, textAlign: "center", margin: "0 0 6px", letterSpacing: "-0.01em" }}>
          {phase === "success" ? "It's yours." : phase === "error" ? "Hit a snag" : "Setting up your database"}
        </h2>
        <p style={{ fontSize: 13.5, color: colors.textMuted, textAlign: "center", margin: "0 0 22px", lineHeight: 1.55 }}>
          {phase === "success"
            ? "Your people now live in a database you own. PullUp just runs on top — and you can lock us out anytime."
            : phase === "error"
              ? "We hit a hiccup mid-setup. Your project is safe — give it another try."
              : "Hang tight — we're standing up your own database and moving your world into it. This takes a moment."}
        </p>

        {/* Steps */}
        {phase !== "error" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 22 }}>
            {steps.map((s) => <Step key={s.key} {...s} />)}
          </div>
        )}

        {/* Error detail */}
        {phase === "error" && errorMsg && (
          <div style={{ padding: "11px 13px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#dc2626", fontSize: 12.5, lineHeight: 1.5, marginBottom: 20, wordBreak: "break-word" }}>
            {errorMsg}
          </div>
        )}

        {/* Success meta */}
        {phase === "success" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 22 }}>
            {Number.isFinite(peopleCount) && peopleCount > 0 && (
              <Chip icon={<Database size={12} />}>{peopleCount.toLocaleString()} people moved in</Chip>
            )}
            {projectRef && <Chip icon={<ShieldCheck size={12} />}>{projectRef} · yours</Chip>}
          </div>
        )}

        {/* Footer */}
        {phase === "success" && (
          <button onClick={onClose} style={primaryBtn}>
            Start filling your database <ArrowRight size={16} />
          </button>
        )}
        {phase === "error" && (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onRetry} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1, flex: 1 }}>
              {busy ? "Trying again…" : "Try again"}
            </button>
            <button onClick={onClose} style={ghostBtn}>Close</button>
          </div>
        )}
        {phase === "working" && (
          <button onClick={onClose} style={{ ...ghostBtn, width: "100%", justifyContent: "center" }}>
            Continue in the background
          </button>
        )}
      </div>
    </div>
  );
}

function Hero({ phase }) {
  if (phase === "success") {
    return (
      <span style={{ position: "relative", width: 64, height: 64, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${colors.accent}`, animation: "odwm-ring 1.4s ease-out infinite" }} />
        <span style={{ width: 64, height: 64, borderRadius: "50%", background: colors.accentSoft, color: colors.accent, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <CheckCircle2 size={34} />
        </span>
      </span>
    );
  }
  if (phase === "error") {
    return (
      <span style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(239,68,68,0.1)", color: "#dc2626", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <AlertTriangle size={32} />
      </span>
    );
  }
  return (
    <span style={{ width: 64, height: 64, borderRadius: "50%", background: colors.accentSoft, color: colors.accent, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <Database size={30} />
    </span>
  );
}

function Step({ label, state }) {
  const done = state === "done";
  const active = state === "active";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 4px" }}>
      <span style={{ flexShrink: 0, width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {done ? (
          <CheckCircle2 size={22} color={colors.accent} />
        ) : active ? (
          <Loader2 size={20} color={colors.accent} style={{ animation: "odwm-spin 0.9s linear infinite" }} />
        ) : (
          <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${colors.border}` }} />
        )}
      </span>
      <span style={{ fontSize: 14, fontWeight: active || done ? 650 : 500, color: done || active ? colors.text : colors.textFaded }}>
        {label}
      </span>
    </div>
  );
}

function Chip({ icon, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, background: colors.surface, border: `1px solid ${colors.border}`, fontSize: 11.5, fontWeight: 600, color: colors.textMuted }}>
      {icon}{children}
    </span>
  );
}

const primaryBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  width: "100%", padding: "13px 18px", borderRadius: 12, border: "none",
  background: colors.text, color: "#fff", fontSize: 14.5, fontWeight: 700, cursor: "pointer",
};
const ghostBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "13px 18px", borderRadius: 12, border: `1px solid ${colors.border}`,
  background: "#fff", color: colors.textMuted, fontSize: 14, fontWeight: 600, cursor: "pointer",
};
