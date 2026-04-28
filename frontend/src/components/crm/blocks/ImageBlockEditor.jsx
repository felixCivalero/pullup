import { useState } from "react";
import ImagePickerModal from "../ImagePickerModal";

export default function ImageBlockEditor({ block, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {block.url ? (
        <img
          src={block.url}
          alt={block.alt || ""}
          style={{ width: "100%", maxWidth: "400px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}
        />
      ) : (
        <div style={{ padding: "24px", textAlign: "center", border: "1px dashed rgba(255,255,255,0.15)", borderRadius: "10px", opacity: 0.6 }}>
          No image selected
        </div>
      )}
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={() => setPickerOpen(true)} style={btnStyle}>
          {block.url ? "Replace image" : "Choose image"}
        </button>
        {block.source && <span style={{ alignSelf: "center", fontSize: "11px", opacity: 0.6 }}>({block.source === "upload" ? "uploaded" : "from event"})</span>}
      </div>
      <input
        type="text"
        value={block.alt || ""}
        onChange={(e) => onChange({ ...block, alt: e.target.value })}
        placeholder="Alt text (for accessibility)"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(12,10,18,0.8)",
          color: "#fff",
          fontSize: "13px",
        }}
      />
      <ImagePickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={({ url, source }) => {
          onChange({ ...block, url, source });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

const btnStyle = {
  padding: "8px 14px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "#fff",
  fontSize: "13px",
  cursor: "pointer",
};
