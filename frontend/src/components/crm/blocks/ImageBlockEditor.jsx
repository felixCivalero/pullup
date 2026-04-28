// ImageBlockEditor — drag-and-drop dropzone or click-to-pick from disk for
// the image block in follow-up campaigns. Falls back to the existing
// ImagePickerModal for "choose from your events" gallery.

import { useRef, useState } from "react";
import { Upload, Image as ImageIcon, X } from "lucide-react";
import ImagePickerModal from "../ImagePickerModal";
import { authenticatedFetch } from "../../../lib/api.js";

export default function ImageBlockEditor({ block, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file (PNG, JPG, GIF, WebP).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be under 2 MB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await authenticatedFetch("/host/crm/follow-up-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: dataUrl }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
      const { url } = await res.json();
      onChange({ ...block, url, source: "upload" });
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  }

  function onDragOver(e) {
    e.preventDefault();
    if (!dragActive) setDragActive(true);
  }

  function onDragLeave(e) {
    e.preventDefault();
    setDragActive(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <style>{`@keyframes crm-img-spin { to { transform: rotate(360deg); } }`}</style>
      {block.url ? (
        <div style={{ position: "relative" }}>
          <img
            src={block.url}
            alt={block.alt || ""}
            style={{
              width: "100%",
              maxHeight: 240,
              objectFit: "cover",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              display: "block",
            }}
          />
          <button
            type="button"
            onClick={() => onChange({ ...block, url: "", source: null })}
            title="Remove image"
            style={removeBtnStyle}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          style={dropzoneStyle(dragActive, uploading)}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, pointerEvents: "none" }}>
            <div style={iconCircleStyle(dragActive)}>
              {uploading ? <Spinner /> : dragActive ? <Upload size={22} /> : <ImageIcon size={22} />}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
              {uploading ? "Uploading…" : dragActive ? "Drop to upload" : "Drag an image here"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              or <span style={{ color: "#d4af37", textDecoration: "underline" }}>click to choose</span> from your computer
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>PNG, JPG, GIF or WebP · up to 2 MB</div>
          </div>
        </div>
      )}

      {error && <div style={{ color: "#fca5a5", fontSize: 12 }}>{error}</div>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFile(e.target.files?.[0])}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setPickerOpen(true)} style={ghostBtnStyle}>
          {block.url ? "Replace from gallery" : "Choose from your events"}
        </button>
        {block.source && (
          <span style={{ fontSize: 11, opacity: 0.55 }}>
            ({block.source === "upload" ? "uploaded" : "from event"})
          </span>
        )}
      </div>

      <input
        type="text"
        value={block.alt || ""}
        onChange={(e) => onChange({ ...block, alt: e.target.value })}
        placeholder="Alt text (for accessibility)"
        style={altInputStyle}
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

function Spinner() {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        border: "2px solid rgba(212,175,55,0.25)",
        borderTopColor: "#d4af37",
        borderRadius: "50%",
        animation: "crm-img-spin 0.7s linear infinite",
      }}
    />
  );
}

const dropzoneStyle = (dragActive, uploading) => ({
  position: "relative",
  padding: "32px 20px",
  borderRadius: 14,
  border: `2px dashed ${dragActive ? "rgba(212,175,55,0.6)" : "rgba(255,255,255,0.18)"}`,
  background: dragActive
    ? "rgba(212,175,55,0.08)"
    : "linear-gradient(135deg, rgba(20,16,30,0.6), rgba(12,10,18,0.4))",
  cursor: uploading ? "wait" : "pointer",
  textAlign: "center",
  transition: "background 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
  transform: dragActive ? "scale(1.01)" : "scale(1)",
  outline: "none",
});

const iconCircleStyle = (dragActive) => ({
  width: 48,
  height: 48,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: dragActive ? "rgba(212,175,55,0.18)" : "rgba(255,255,255,0.05)",
  color: dragActive ? "#d4af37" : "rgba(255,255,255,0.6)",
  border: `1px solid ${dragActive ? "rgba(212,175,55,0.4)" : "rgba(255,255,255,0.08)"}`,
  transition: "all 0.18s ease",
});

const removeBtnStyle = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "none",
  background: "rgba(0,0,0,0.6)",
  color: "#fca5a5",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backdropFilter: "blur(6px)",
};

const ghostBtnStyle = {
  padding: "7px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "transparent",
  color: "rgba(255,255,255,0.85)",
  fontSize: 12,
  cursor: "pointer",
};

const altInputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(12,10,18,0.8)",
  color: "#fff",
  fontSize: 13,
  boxSizing: "border-box",
};
