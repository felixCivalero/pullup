// frontend/src/components/BrandThemeEditor.jsx
//
// Controlled event-level theme picker (migration 047). Snapshotted onto a
// single event at save time. Two groups:
//
//   value: {
//     backgroundColor,    // the page canvas
//     buttonColor,        // RSVP / register button background
//     buttonTextColor,    // register button text color
//     buttonFontFamily,   // register button font (curated name)
//   }
//   onChange: (nextValue) => void
//
// Per-section font + color (incl. the date) are edited inside each section,
// not here. Pass value=null for "PullUp standard". No preview — the creator
// already renders the real event page live alongside this.

import { colors } from "../theme/colors.js";
import { FONTS } from "../lib/brand.js";

const DEFAULT_BG = "#05040a";
const DEFAULT_BTN_BG = "#ffffff";
const DEFAULT_BTN_TEXT = "#000000";

const cardStyle = {
  padding: "14px 16px",
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "12px",
};

const inputBoxStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: colors.background,
  color: colors.text,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

function ColorRow({ label, hint, value, fallback, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0" }}>
      <div style={{ flex: "0 0 130px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ position: "relative", flex: "0 0 44px", height: 36 }}>
        <input
          type="color"
          value={value || fallback}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: "absolute", inset: 0, border: "none", background: "transparent",
            padding: 0, cursor: "pointer", borderRadius: 8,
          }}
          aria-label={`${label} color picker`}
        />
        <div
          style={{
            position: "absolute", inset: 0, borderRadius: 8,
            border: `1px solid ${colors.border}`, background: value || fallback,
            pointerEvents: "none",
          }}
        />
      </div>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={fallback}
        style={{
          ...inputBoxStyle, flex: 1,
          fontFamily: "ui-monospace, SF Mono, Menlo, monospace", fontSize: 13,
        }}
      />
    </div>
  );
}

const sectionLabelStyle = {
  fontSize: 11, fontWeight: 700, color: colors.textSubtle,
  letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4,
};

export function BrandThemeEditor({ value, onChange }) {
  const v = value || {};
  const set = (patch) => onChange({ ...v, ...patch });

  return (
    <div>
      <div style={cardStyle}>
        <ColorRow
          label="Background"
          hint="The page canvas"
          value={v.backgroundColor || null}
          fallback={DEFAULT_BG}
          onChange={(val) => set({ backgroundColor: val })}
        />
      </div>

      <div style={{ ...cardStyle, marginTop: 12 }}>
        <div style={sectionLabelStyle}>Register button</div>
        <ColorRow
          label="Button color"
          value={v.buttonColor || null}
          fallback={DEFAULT_BTN_BG}
          onChange={(val) => set({ buttonColor: val })}
        />
        <ColorRow
          label="Text color"
          value={v.buttonTextColor || null}
          fallback={DEFAULT_BTN_TEXT}
          onChange={(val) => set({ buttonTextColor: val })}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0" }}>
          <div style={{ flex: "0 0 130px", fontSize: 13, fontWeight: 600, color: colors.text }}>
            Font
          </div>
          <select
            value={v.buttonFontFamily || ""}
            onChange={(e) => set({ buttonFontFamily: e.target.value || null })}
            style={{ ...inputBoxStyle, flex: 1, cursor: "pointer" }}
          >
            <option value="">Default</option>
            {FONTS.map((f) => (
              <option key={f.name} value={f.name} style={{ fontFamily: f.family }}>
                {f.name} · {f.category}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default BrandThemeEditor;
