import TokenizedInput from "../TokenizedInput";

export default function ButtonBlockEditor({ block, onChange, tokens }) {
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
