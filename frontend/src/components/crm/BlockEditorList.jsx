import TextBlockEditor from "./blocks/TextBlockEditor";
import ImageBlockEditor from "./blocks/ImageBlockEditor";
import ButtonBlockEditor from "./blocks/ButtonBlockEditor";

export default function BlockEditorList({ blocks, onChange, tokens }) {
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
      image: { type: "image", url: "", alt: "", source: null, width: 100, align: "center" },
      button: { type: "button", text: "", url: "", caption: null },
    };
    onChange([...blocks, blanks[type]]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {blocks.map((block, idx) => (
        <div
          key={idx}
          style={{
            padding: "14px",
            borderRadius: "12px",
            background: "rgba(20,16,30,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            gap: "12px",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1 }}>
            {block.type === "text" && <TextBlockEditor block={block} onChange={(b) => updateBlock(idx, b)} tokens={tokens} />}
            {block.type === "image" && <ImageBlockEditor block={block} onChange={(b) => updateBlock(idx, b)} />}
            {block.type === "button" && <ButtonBlockEditor block={block} onChange={(b) => updateBlock(idx, b)} tokens={tokens} />}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <button type="button" onClick={() => moveBlock(idx, -1)} style={iconBtn} disabled={idx === 0}>↑</button>
            <button type="button" onClick={() => moveBlock(idx, 1)} style={iconBtn} disabled={idx === blocks.length - 1}>↓</button>
            <button type="button" onClick={() => removeBlock(idx)} style={{ ...iconBtn, color: "#fca5a5" }}>✕</button>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={() => addBlock("text")} style={addBtn}>+ Text</button>
        <button type="button" onClick={() => addBlock("image")} style={addBtn}>+ Image</button>
        <button type="button" onClick={() => addBlock("button")} style={addBtn}>+ Button</button>
      </div>
    </div>
  );
}

const iconBtn = {
  padding: "4px 8px",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(12,10,18,0.6)",
  color: "#fff",
  fontSize: "12px",
  cursor: "pointer",
};
const addBtn = {
  padding: "10px 16px",
  borderRadius: "10px",
  border: "1px dashed rgba(255,255,255,0.18)",
  background: "transparent",
  color: "#fff",
  fontSize: "13px",
  cursor: "pointer",
};
