import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import TokenizedInput from "../TokenizedInput";
import { colors } from "../../../theme/colors.js";

const DEFAULT_BG = "#d4af37";
const DEFAULT_SIZE = 100;
const DEFAULT_ALIGN = "center";

const ALIGN_OPTIONS = [
  { v: "left", icon: AlignLeft, label: "Left" },
  { v: "center", icon: AlignCenter, label: "Center" },
  { v: "right", icon: AlignRight, label: "Right" },
];

function isHex(s) { return typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s); }

export default function ButtonBlockEditor({ block, onChange, tokens }) {
  const bg = isHex(block.bgColor) ? block.bgColor : DEFAULT_BG;
  const size = typeof block.size === "number" ? block.size : DEFAULT_SIZE;
  const align = block.align || DEFAULT_ALIGN;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div>
        <label style={labelStyle}>Button text</label>
        <TokenizedInput
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
          tokens={tokens}
          placeholder="Get 20% off"
        />
      </div>
      <div>
        <label style={labelStyle}>URL</label>
        <input
          type="url"
          value={block.url}
          onChange={(e) => onChange({ ...block, url: e.target.value })}
          placeholder="https://..."
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Caption (optional)</label>
        <TokenizedInput
          value={block.caption || ""}
          onChange={(caption) => onChange({ ...block, caption: caption || null })}
          tokens={tokens}
          placeholder="Code: THANKYOU20 — valid through May 15"
        />
      </div>

      <div style={fieldGroupStyle}>
        <div style={fieldLabelStyle}>
          <span>Size</span>
          <span style={{ opacity: 0.6 }}>{size}%</span>
        </div>
        <input
          type="range"
          min={50}
          max={150}
          step={5}
          value={size}
          onChange={(e) => onChange({ ...block, size: Number(e.target.value) })}
          style={{ width: "100%", accentColor: colors.accent }}
        />
      </div>

      <div style={fieldGroupStyle}>
        <div style={fieldLabelStyle}><span>Align</span></div>
        <div style={{ display: "flex", gap: 4 }}>
          {ALIGN_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = align === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => onChange({ ...block, align: opt.v })}
                title={opt.label}
                style={alignBtnStyle(active)}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      </div>

      <div style={fieldGroupStyle}>
        <div style={fieldLabelStyle}>
          <span>Background color</span>
          <span style={{ opacity: 0.6, fontFamily: "monospace" }}>{bg.toUpperCase()}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="color"
            value={bg}
            onChange={(e) => onChange({ ...block, bgColor: e.target.value })}
            style={{
              width: 36, height: 36,
              border: `1px solid ${colors.border}`,
              borderRadius: 8, padding: 0, background: "transparent", cursor: "pointer",
            }}
          />
          <input
            type="text"
            value={bg}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const v = raw.startsWith("#") ? raw : `#${raw}`;
              onChange({ ...block, bgColor: v });
            }}
            placeholder="#d4af37"
            style={{
              ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 13, padding: "8px 10px",
            }}
          />
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  background: "#fff",
  color: colors.text,
  fontSize: "14px",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  fontSize: "10px",
  color: colors.textSubtle,
  marginBottom: "4px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const fieldGroupStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "8px 10px",
  borderRadius: 8,
  background: colors.surface,
  border: `1px solid ${colors.border}`,
};

const fieldLabelStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: colors.textSubtle,
};

const alignBtnStyle = (active) => ({
  flex: 1,
  padding: "6px 0",
  borderRadius: 6,
  border: `1px solid ${active ? colors.accentBorder : colors.border}`,
  background: active ? colors.accentSoft : "#fff",
  color: active ? colors.accent : colors.textMuted,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});
