// Section — a tinted card that groups related fields in the composer rail.
// Two visual treatments: "setup" (accent tint) for envelope-y fields like
// template/event/subject/preview, "content" (surface) for what the
// recipient actually reads (greeting, blocks, signoff).

import { colors } from "../../theme/colors.js";

const VARIANTS = {
  setup: {
    background: colors.accentSoft,
    border: `1px solid ${colors.accentBorder}`,
    label: colors.accent,
  },
  content: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    label: colors.textSubtle,
  },
};

export default function Section({ label, variant = "setup", children }) {
  const v = VARIANTS[variant] || VARIANTS.setup;
  return (
    <div
      style={{
        padding: "14px 14px 16px",
        borderRadius: "12px",
        background: v.background,
        border: v.border,
      }}
    >
      {label && (
        <div
          style={{
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: v.label,
            marginBottom: "12px",
          }}
        >
          {label}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {children}
      </div>
    </div>
  );
}
