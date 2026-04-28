import { Type, Image as ImageIcon, MousePointerClick } from "lucide-react";
import TextBlockEditor from "./blocks/TextBlockEditor";
import ImageBlockEditor from "./blocks/ImageBlockEditor";
import ButtonBlockEditor from "./blocks/ButtonBlockEditor";

const TYPE_LABEL = { text: "Text", image: "Image", button: "Button" };

const ADD_ITEMS = [
  { type: "text", icon: Type, label: "Text" },
  { type: "image", icon: ImageIcon, label: "Image" },
  { type: "button", icon: MousePointerClick, label: "Button" },
];

export default function BlockEditorList({ blocks, onChange, tokens, hoveredKey, setHoveredKey }) {
  function updateBlock(idx, next) {
    const copy = [...blocks];
    copy[idx] = next;
    onChange(copy);
  }
  function removeBlock(idx) {
    const copy = blocks.filter((_, i) => i !== idx);
    onChange(copy);
  }
  function moveBlock(idx, delta) {
    const target = idx + delta;
    if (target < 0 || target >= blocks.length) return;
    const copy = [...blocks];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    onChange(copy);
  }
  function addBlock(type) {
    const blanks = {
      text: { type: "text", style: "paragraph", text: "" },
      image: { type: "image", url: "", alt: "", source: null, width: 100, align: "center", aspectRatio: "original" },
      button: { type: "button", text: "", url: "", caption: null, size: 100, align: "center", bgColor: "#d4af37" },
    };
    onChange([...blocks, blanks[type]]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {blocks.map((block, idx) => {
        const key = `block-${idx}`;
        const hovered = hoveredKey === key;
        const blockType = TYPE_LABEL[block.type] || "Text";
        return (
          <div
            key={idx}
            onMouseEnter={() => setHoveredKey?.(key)}
            onMouseLeave={() => setHoveredKey?.(null)}
            style={{
              padding: "14px 16px",
              background: "rgba(255,255,255,0.04)",
              border: hovered
                ? "1px solid rgba(163, 230, 53, 0.5)"
                : "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              transition: "border-color 0.15s ease",
              position: "relative",
            }}
          >
            {/* Header: chevrons + type label + delete */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveBlock(idx, -1)}
                  style={chevronStyle(idx === 0)}
                  aria-label="Move up"
                >&#9650;</button>
                <button
                  type="button"
                  disabled={idx === blocks.length - 1}
                  onClick={() => moveBlock(idx, 1)}
                  style={chevronStyle(idx === blocks.length - 1)}
                  aria-label="Move down"
                >&#9660;</button>
              </div>
              <span style={typeLabelStyle}>{blockType}</span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => removeBlock(idx)}
                aria-label="Remove block"
                style={removeStyle}
              >×</button>
            </div>

            {block.type === "text" && <TextBlockEditor block={block} onChange={(b) => updateBlock(idx, b)} tokens={tokens} />}
            {block.type === "image" && <ImageBlockEditor block={block} onChange={(b) => updateBlock(idx, b)} />}
            {block.type === "button" && <ButtonBlockEditor block={block} onChange={(b) => updateBlock(idx, b)} tokens={tokens} />}
          </div>
        );
      })}
      {/* Add-block tray — mirrors the "Add section" UI in CreateEventPage */}
      <div style={addTrayStyle}>
        <div style={addTrayTitleStyle}>Add section</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${ADD_ITEMS.length}, 1fr)`, gap: 2 }}>
          {ADD_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.type}
                type="button"
                onClick={() => addBlock(item.type)}
                style={addItemStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  const ic = e.currentTarget.querySelector("[data-icon]");
                  if (ic) ic.style.color = "#a3e635";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  const ic = e.currentTarget.querySelector("[data-icon]");
                  if (ic) ic.style.color = "rgba(255,255,255,0.35)";
                }}
              >
                <span data-icon style={addIconStyle}><Icon size={20} /></span>
                <span style={addLabelStyle}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const chevronStyle = (disabled) => ({
  background: "none",
  border: "none",
  color: disabled ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.4)",
  cursor: disabled ? "default" : "pointer",
  padding: 0,
  fontSize: 12,
  lineHeight: 1,
});

const typeLabelStyle = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "rgba(255,255,255,0.25)",
  flexShrink: 0,
  userSelect: "none",
};

const removeStyle = {
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.3)",
  fontSize: 18,
  cursor: "pointer",
  padding: "0 4px",
  lineHeight: 1,
};

const addTrayStyle = {
  borderRadius: 12,
  border: "1px dashed rgba(255,255,255,0.12)",
  background: "rgba(12,10,18,0.6)",
  padding: "10px 8px 8px",
};

const addTrayTitleStyle = {
  fontSize: 11,
  fontWeight: 500,
  color: "rgba(255,255,255,0.3)",
  textAlign: "center",
  marginBottom: 8,
};

const addItemStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  padding: "10px 2px 8px",
  background: "transparent",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  transition: "background 0.15s ease",
};

const addIconStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "rgba(255,255,255,0.35)",
  transition: "color 0.15s ease",
  lineHeight: 1,
};

const addLabelStyle = {
  fontSize: 9,
  fontWeight: 500,
  color: "rgba(255,255,255,0.4)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "100%",
};
