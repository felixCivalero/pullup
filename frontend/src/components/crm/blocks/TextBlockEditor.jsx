import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import TokenizedInput from "../TokenizedInput";
import { colors } from "../../../theme/colors.js";

const DEFAULT_ALIGN = "left";

export default function TextBlockEditor({ block, onChange, tokens }) {
  const align = block.align || DEFAULT_ALIGN;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={() => onChange({ ...block, style: "paragraph" })}
          style={pillStyle(block.style === "paragraph")}
        >
          Paragraph
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...block, style: "heading" })}
          style={pillStyle(block.style === "heading")}
        >
          Heading
        </button>
      </div>
      <TokenizedInput
        multiline={block.style !== "heading"}
        rows={block.style === "heading" ? 1 : 4}
        value={block.text}
        onChange={(text) => onChange({ ...block, text })}
        tokens={tokens}
        enableLinks
        placeholder={block.style === "heading" ? "Heading text…" : "Write a paragraph…"}
        style={{
          fontSize: block.style === "heading" ? "18px" : "14px",
          fontWeight: block.style === "heading" ? 700 : 400,
        }}
      />
      <div style={fieldGroupStyle}>
        <div style={fieldLabelStyle}><span>Align</span></div>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { v: "left", icon: AlignLeft, label: "Left" },
            { v: "center", icon: AlignCenter, label: "Center" },
            { v: "right", icon: AlignRight, label: "Right" },
          ].map((opt) => {
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
    </div>
  );
}

function pillStyle(active) {
  return {
    padding: "6px 12px",
    borderRadius: "999px",
    border: `1px solid ${active ? colors.accentBorder : colors.border}`,
    background: active ? colors.accentSoft : colors.surface,
    color: active ? colors.accent : colors.textMuted,
    fontSize: "12px",
    cursor: "pointer",
  };
}

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
