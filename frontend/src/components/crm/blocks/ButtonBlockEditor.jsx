export default function ButtonBlockEditor({ block, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <input
        type="text"
        value={block.text}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
        placeholder="Button text (e.g., Get 20% off)"
        style={inputStyle}
      />
      <input
        type="url"
        value={block.url}
        onChange={(e) => onChange({ ...block, url: e.target.value })}
        placeholder="https://..."
        style={inputStyle}
      />
      <input
        type="text"
        value={block.caption || ""}
        onChange={(e) => onChange({ ...block, caption: e.target.value || null })}
        placeholder="Caption (optional, e.g., Code: THANKYOU20 — valid through May 15)"
        style={inputStyle}
      />
      <div style={{ textAlign: "center", padding: "12px", background: "rgba(255,255,255,0.04)", borderRadius: "10px" }}>
        <a
          href={block.url || "#"}
          onClick={(e) => e.preventDefault()}
          style={{
            display: "inline-block",
            padding: "10px 20px",
            background: "#d4af37",
            color: "#0c0a12",
            textDecoration: "none",
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: "13px",
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
};
