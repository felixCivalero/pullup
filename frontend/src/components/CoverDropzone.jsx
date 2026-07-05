// CoverDropzone — editor-only. When a page has no cover media yet, the
// PREVIEW itself becomes the upload target: the same "click or drag" affordance
// as the Cover panel, rendered inside the phone/desktop hero so dropping a
// file where it will actually appear just works. Dark-themed to sit on the
// guest page's empty hero. Shows the three media kinds (image · carousel ·
// video) so hosts know a set or a clip is welcome, not just one photo.

import { useRef, useState } from "react";
import { Image as ImageIcon, Images, Film } from "lucide-react";

export default function CoverDropzone({ onFiles }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  const takeFiles = (list) => {
    const files = Array.from(list || []);
    if (files.length) onFiles(files);
  };

  return (
    <div
      onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation(); setOver(false);
        takeFiles(e.dataTransfer?.files);
      }}
      style={{
        position: "absolute", inset: 0, zIndex: 6,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        background: over ? "rgba(236,23,143,0.12)" : "transparent",
        transition: "background 0.15s ease",
      }}
    >
      <div
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          padding: "24px 28px", borderRadius: 16, maxWidth: "82%",
          border: `1.5px dashed ${over ? "#ec178f" : "rgba(255,255,255,0.3)"}`,
          background: "rgba(255,255,255,0.05)", backdropFilter: "blur(2px)",
          transition: "border-color 0.15s ease",
        }}
      >
        <div style={{ display: "flex", gap: 14, color: over ? "#ec178f" : "rgba(255,255,255,0.7)" }}>
          <ImageIcon size={22} />
          <Images size={22} />
          <Film size={22} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)", textAlign: "center" }}>
          {over ? "Drop it here" : "Click or drag to upload"}
        </div>
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", textAlign: "center" }}>
          Image · carousel of images · video
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => { takeFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}
