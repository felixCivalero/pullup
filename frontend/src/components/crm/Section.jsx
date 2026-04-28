// Section — a tinted card that groups related fields in the composer rail.
// Two visual treatments: "setup" (cool blue) for envelope-y fields like
// template/event/subject/preview, "content" (warm gold) for what the
// recipient actually reads (greeting, blocks, signoff).

const VARIANTS = {
  setup: {
    background: "rgba(96,165,250,0.04)",
    border: "1px solid rgba(96,165,250,0.14)",
    label: "rgba(147,197,253,0.7)",
  },
  content: {
    background: "rgba(212,175,55,0.04)",
    border: "1px solid rgba(212,175,55,0.16)",
    label: "rgba(212,175,55,0.7)",
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
