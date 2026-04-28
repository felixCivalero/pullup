import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/authenticatedFetch";

export default function ImagePickerModal({ isOpen, onSelect, onClose }) {
  const [tab, setTab] = useState(() => localStorage.getItem("crm.imagePicker.tab") || "upload");
  const [gallery, setGallery] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { localStorage.setItem("crm.imagePicker.tab", tab); }, [tab]);

  useEffect(() => {
    if (!isOpen || tab !== "gallery") return;
    let cancelled = false;
    setLoading(true);
    setError("");
    authenticatedFetch("/host/crm/event-image-gallery")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data) => { if (!cancelled) setGallery(data.items || []); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, tab]);

  if (!isOpen) return null;

  async function handleFile(file) {
    if (!file) return;
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
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const { url } = await res.json();
      onSelect({ url, source: "upload" });
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgba(12,10,18,0.97)", borderRadius: "16px", padding: "20px",
          width: "100%", maxWidth: "720px", maxHeight: "80vh", overflow: "hidden",
          display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <TabBtn active={tab === "upload"} onClick={() => setTab("upload")}>Upload</TabBtn>
          <TabBtn active={tab === "gallery"} onClick={() => setTab("gallery")}>Choose from your events</TabBtn>
          <button type="button" onClick={onClose} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontSize: "18px" }}>×</button>
        </div>

        {error && <div style={{ color: "#fca5a5", fontSize: "13px", marginBottom: "12px" }}>{error}</div>}

        {tab === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0])}
              disabled={uploading}
            />
            {uploading && <div style={{ opacity: 0.7 }}>Uploading…</div>}
          </div>
        )}

        {tab === "gallery" && (
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && <div style={{ opacity: 0.7 }}>Loading…</div>}
            {!loading && gallery.length === 0 && <div style={{ opacity: 0.7 }}>No images yet — your events have no cover images or media.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
              {gallery.map((item, i) => (
                <button
                  key={`${item.url}-${i}`}
                  type="button"
                  onClick={() => onSelect({ url: item.url, source: "event-gallery" })}
                  style={{ padding: 0, border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", overflow: "hidden", cursor: "pointer", background: "transparent" }}
                  title={`${item.eventTitle} — ${item.kind}`}
                >
                  <img src={item.url} alt="" style={{ width: "100%", height: "120px", objectFit: "cover", display: "block" }} />
                  <div style={{ padding: "6px 8px", fontSize: "11px", color: "#fff", textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.eventTitle}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px",
        borderRadius: "10px",
        border: `1px solid ${active ? "rgba(212,175,55,0.4)" : "rgba(255,255,255,0.12)"}`,
        background: active ? "rgba(212,175,55,0.15)" : "transparent",
        color: active ? "#d4af37" : "#fff",
        fontSize: "13px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
