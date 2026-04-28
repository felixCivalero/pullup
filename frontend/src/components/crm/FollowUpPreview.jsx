export default function FollowUpPreview({ subject, previewText, blocks, signoff, currentUserFirstName }) {
  return (
    <div style={{ background: "rgba(20,16,30,0.7)", borderRadius: "12px", padding: "20px", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: "11px", opacity: 0.6, marginBottom: "8px" }}>Subject</div>
      <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>{subject || "(no subject)"}</div>
      {previewText && <div style={{ fontSize: "12px", opacity: 0.6, marginBottom: "16px" }}>{previewText}</div>}
      <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,0.08)", margin: "12px 0" }} />
      <p style={{ margin: "0 0 12px" }}>Hi {currentUserFirstName || "there"},</p>
      {blocks.map((b, i) => <PreviewBlock key={i} block={b} />)}
      {signoff && (
        <p style={{ margin: "24px 0 0", whiteSpace: "pre-wrap" }}>{signoff}</p>
      )}
    </div>
  );
}

function PreviewBlock({ block }) {
  if (block.type === "text" && block.style === "heading") {
    return <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "16px 0 8px" }}>{block.text}</h2>;
  }
  if (block.type === "text") {
    return <p style={{ margin: "0 0 12px", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{block.text}</p>;
  }
  if (block.type === "image" && block.url) {
    return <img src={block.url} alt={block.alt || ""} style={{ width: "100%", maxWidth: "100%", borderRadius: "8px", margin: "16px 0" }} />;
  }
  if (block.type === "button" && block.url && block.text) {
    return (
      <div style={{ textAlign: "center", margin: "20px 0 0" }}>
        <a href={block.url} onClick={(e) => e.preventDefault()} style={{ display: "inline-block", padding: "12px 24px", background: "#d4af37", color: "#0c0a12", textDecoration: "none", borderRadius: "8px", fontWeight: 600 }}>{block.text}</a>
        {block.caption && <p style={{ textAlign: "center", fontSize: "12px", opacity: 0.7, margin: "6px 0 18px" }}>{block.caption}</p>}
      </div>
    );
  }
  return null;
}
