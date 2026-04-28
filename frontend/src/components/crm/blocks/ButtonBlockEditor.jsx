import TokenizedInput from "../TokenizedInput";

const DEFAULT_BG = "#d4af37";
const DEFAULT_SIZE = "medium";

const SIZE_OPTIONS = [
  { v: "small", label: "Small" },
  { v: "medium", label: "Medium" },
  { v: "large", label: "Large" },
];

const PRESET_COLORS = ["#d4af37", "#ffffff", "#0c0a12", "#8b5cf6", "#ec4899", "#22c55e", "#3b82f6", "#ef4444"];

function isHex(s) { return typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s); }

function readableTextColor(hex) {
  if (!isHex(hex)) return "#0c0a12";
  const h = hex.slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0c0a12" : "#ffffff";
}

function previewSize(size) {
  if (size === "small") return { padding: "8px 16px", fontSize: 12 };
  if (size === "large") return { padding: "16px 32px", fontSize: 16 };
  return { padding: "12px 24px", fontSize: 14 };
}

export default function ButtonBlockEditor({ block, onChange, tokens }) {
  const bg = isHex(block.bgColor) ? block.bgColor : DEFAULT_BG;
  const size = block.size || DEFAULT_SIZE;
  const sizeStyle = previewSize(size);
  const fg = readableTextColor(bg);

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
        <div style={fieldLabelStyle}><span>Size</span></div>
        <div style={{ display: "flex", gap: 4 }}>
          {SIZE_OPTIONS.map((opt) => {
            const active = size === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => onChange({ ...block, size: opt.v })}
                style={segmentBtnStyle(active)}
              >
                {opt.label}
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
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {PRESET_COLORS.map((c) => {
            const active = c.toLowerCase() === bg.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ ...block, bgColor: c })}
                title={c}
                style={swatchStyle(c, active)}
              />
            );
          })}
          <label style={{ display: "inline-flex", alignItems: "center", marginLeft: 4, cursor: "pointer" }}>
            <input
              type="color"
              value={bg}
              onChange={(e) => onChange({ ...block, bgColor: e.target.value })}
              style={{
                width: 28, height: 28, border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6, padding: 0, background: "transparent", cursor: "pointer",
              }}
            />
          </label>
          <input
            type="text"
            value={bg}
            onChange={(e) => {
              const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
              onChange({ ...block, bgColor: v });
            }}
            style={{
              ...inputStyle, width: 90, fontFamily: "monospace", fontSize: 12, padding: "6px 8px",
            }}
            placeholder="#d4af37"
          />
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "12px", background: "rgba(255,255,255,0.04)", borderRadius: "10px" }}>
        <a
          href={block.url || "#"}
          onClick={(e) => e.preventDefault()}
          style={{
            display: "inline-block",
            padding: sizeStyle.padding,
            background: bg,
            color: fg,
            textDecoration: "none",
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: sizeStyle.fontSize,
          }}
        >
          {block.text || "Button preview"}
        </a>
        {block.caption && (
          <div style={{ marginTop: "6px", fontSize: "11px", opacity: 0.7 }}>{block.caption}</div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(12,10,18,0.8)",
  color: "#fff",
  fontSize: "14px",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  fontSize: "10px",
  opacity: 0.6,
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
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const fieldLabelStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "rgba(255,255,255,0.65)",
};

const segmentBtnStyle = (active) => ({
  flex: 1,
  padding: "6px 8px",
  borderRadius: 6,
  border: `1px solid ${active ? "rgba(212,175,55,0.5)" : "rgba(255,255,255,0.1)"}`,
  background: active ? "rgba(212,175,55,0.15)" : "rgba(12,10,18,0.6)",
  color: active ? "#d4af37" : "rgba(255,255,255,0.7)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: active ? 600 : 500,
});

const swatchStyle = (color, active) => ({
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: active
    ? "2px solid #d4af37"
    : "1px solid rgba(255,255,255,0.15)",
  background: color,
  padding: 0,
  cursor: "pointer",
  boxShadow: active ? "0 0 0 2px rgba(212,175,55,0.25)" : "none",
});
