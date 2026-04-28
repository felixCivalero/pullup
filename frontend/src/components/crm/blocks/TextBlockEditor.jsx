export default function TextBlockEditor({ block, onChange }) {
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
      <textarea
        value={block.text}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
        rows={block.style === "heading" ? 1 : 4}
        placeholder={block.style === "heading" ? "Heading text…" : "Write a paragraph…"}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(12,10,18,0.8)",
          color: "#fff",
          fontSize: block.style === "heading" ? "18px" : "14px",
          fontWeight: block.style === "heading" ? 700 : 400,
          resize: "vertical",
        }}
      />
    </div>
  );
}

function pillStyle(active) {
  return {
    padding: "6px 12px",
    borderRadius: "999px",
    border: `1px solid ${active ? "rgba(212,175,55,0.5)" : "rgba(255,255,255,0.12)"}`,
    background: active ? "rgba(212,175,55,0.15)" : "rgba(12,10,18,0.6)",
    color: active ? "#d4af37" : "#fff",
    fontSize: "12px",
    cursor: "pointer",
  };
}
