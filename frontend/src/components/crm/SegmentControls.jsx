// Shared filter primitives used by both the host CRM (HomeCrmTab) and
// the admin email page (AdminEmailPage). Kept dependency-free and
// styled inline so they slot into either surface without theme conflicts.

import { colors } from "../../theme/colors.js";

// SegmentedControl — single-select pill row with a sliding accent thumb.
// Use it for small, stable option sets (3–5 items) where the user picks
// exactly one. The thumb glides between positions.
export function SegmentedControl({ value, options, onChange, accent = colors.accent }) {
  const idx = Math.max(
    0,
    options.findIndex((o) => String(o.key) === String(value)),
  );
  const widthPct = 100 / options.length;
  return (
    <div
      role="tablist"
      style={{
        position: "relative",
        display: "flex",
        padding: 3,
        background: colors.surface,
        borderRadius: 10,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 3,
          bottom: 3,
          left: `calc(${idx * widthPct}% + 3px)`,
          width: `calc(${widthPct}% - 6px)`,
          borderRadius: 7,
          background: colors.accentSoft,
          border: `1px solid ${colors.accentBorder}`,
          transition: "left 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: "none",
        }}
      />
      {options.map((o) => {
        const active = String(value) === String(o.key);
        return (
          <button
            key={String(o.key)}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            style={{
              flex: 1,
              position: "relative",
              padding: "7px 0",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 11.5,
              fontWeight: active ? 600 : 500,
              letterSpacing: "0.01em",
              color: active ? colors.accent : colors.textSubtle,
              transition: "color 0.18s ease",
              zIndex: 1,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ChipCloud — multi-select chip row with optional mono counts. Use it for
// tag clouds, status lists, and other variable-length option sets.
export function ChipCloud({ items, selected, onToggle, accent = colors.accent, emptyLabel }) {
  const selectedSet = new Set(
    (selected || []).map((s) => String(s).toLowerCase()),
  );
  if (!items || items.length === 0) {
    return (
      <div
        style={{
          fontSize: 11,
          color: colors.textFaded,
          fontStyle: "italic",
        }}
      >
        {emptyLabel || "Nothing to show yet."}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {items.map(({ key, label, count }) => {
        const k = String(key).toLowerCase();
        const active = selectedSet.has(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => onToggle(key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 11px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              border: active
                ? `1px solid ${colors.accentBorder}`
                : `1px solid ${colors.border}`,
              background: active ? colors.accentSoft : colors.surface,
              color: active ? colors.accent : colors.textMuted,
              whiteSpace: "nowrap",
              transition: "all 0.14s ease",
            }}
          >
            {label}
            {typeof count === "number" && (
              <span
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 10,
                  color: active ? colors.accent : colors.textFaded,
                  opacity: 0.85,
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// FilterGroup — labeled section with a status dot that fills in when the
// group has an active (non-default) value. Use to wrap any of the above
// controls inside a card so visual rhythm stays consistent.
export function FilterGroup({ label, active, accent = colors.accent, children }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: active ? accent : colors.borderStrong,
            boxShadow: active ? `0 0 0 3px ${colors.accentSoft}` : "none",
            transition: "all 0.18s ease",
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: active ? colors.text : colors.textSubtle,
            letterSpacing: "0.04em",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}
