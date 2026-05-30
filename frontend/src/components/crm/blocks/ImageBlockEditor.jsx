// ImageBlockEditor — drag-and-drop dropzone or click-to-pick from disk for
// the image block in follow-up campaigns. Falls back to the existing
// ImagePickerModal for "choose from your events" gallery.

import { useRef, useState } from "react";
import { Upload, Image as ImageIcon, X, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import ImagePickerModal from "../ImagePickerModal";
import { authenticatedFetch } from "../../../lib/api.js";
import { colors } from "../../../theme/colors.js";

const DEFAULT_WIDTH = 100;
const DEFAULT_ALIGN = "center";
const DEFAULT_RATIO = "original";

const RATIO_OPTIONS = [
  { v: "original", label: "Original" },
  { v: "banner", label: "16:9" },
  { v: "square", label: "1:1" },
  { v: "portrait", label: "4:5" },
];

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
            <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>
              {uploading ? "Uploading…" : dragActive ? "Drop to upload" : "Drag an image here"}
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted }}>
              or <span style={{ color: colors.accent, textDecoration: "underline" }}>click to choose</span> from your computer
            </div>
            <div style={{ fontSize: 11, color: colors.textFaded }}>PNG, JPG, GIF or WebP · up to 2 MB</div>
          </div>
        </div>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12 }}>{error}</div>}

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

      {block.url && (
        <>
          <div style={fieldGroupStyle}>
            <div style={fieldLabelStyle}>
              <span>Size</span>
              <span style={{ opacity: 0.6 }}>{block.width ?? DEFAULT_WIDTH}%</span>
            </div>
            <input
              type="range"
              min={25}
              max={100}
              step={5}
              value={block.width ?? DEFAULT_WIDTH}
              onChange={(e) => onChange({ ...block, width: Number(e.target.value) })}
              style={{ width: "100%", accentColor: colors.accent }}
            />
          </div>
          <div style={fieldGroupStyle}>
            <div style={fieldLabelStyle}><span>Align</span></div>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { v: "left", icon: AlignLeft, label: "Left" },
                { v: "center", icon: AlignCenter, label: "Center" },
                { v: "right", icon: AlignRight, label: "Right" },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = (block.align ?? DEFAULT_ALIGN) === opt.v;
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

          <div style={fieldGroupStyle}>
            <div style={fieldLabelStyle}><span>Crop</span></div>
            <div style={{ display: "flex", gap: 4 }}>
              {RATIO_OPTIONS.map((opt) => {
                const active = (block.aspectRatio ?? DEFAULT_RATIO) === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => onChange({ ...block, aspectRatio: opt.v })}
                    style={ratioBtnStyle(active)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

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
        border: `2px solid ${colors.accentSoft}`,
        borderTopColor: colors.accent,
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
  border: `2px dashed ${dragActive ? colors.accentBorder : colors.border}`,
  background: dragActive ? colors.accentSoft : colors.surface,
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
  background: dragActive ? colors.accentSoftStrong : "#fff",
  color: dragActive ? colors.accent : colors.textSubtle,
  border: `1px solid ${dragActive ? colors.accentBorder : colors.border}`,
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
  background: "rgba(10,10,10,0.55)",
  color: "#fff",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backdropFilter: "blur(6px)",
};

const ghostBtnStyle = {
  padding: "7px 12px",
  borderRadius: 10,
  border: `1px solid ${colors.borderStrong}`,
  background: "transparent",
  color: colors.text,
  fontSize: 12,
  cursor: "pointer",
};

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

const ratioBtnStyle = (active) => ({
  flex: 1,
  padding: "6px 0",
  borderRadius: 6,
  border: `1px solid ${active ? colors.accentBorder : colors.border}`,
  background: active ? colors.accentSoft : "#fff",
  color: active ? colors.accent : colors.textMuted,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: active ? 600 : 500,
});

const altInputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: "#fff",
  color: colors.text,
  fontSize: 13,
  boxSizing: "border-box",
};
