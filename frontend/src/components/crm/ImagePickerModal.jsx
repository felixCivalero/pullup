// ImagePickerModal — "Choose from your events" gallery. Upload from disk
// happens directly via the dropzone in ImageBlockEditor; this modal is now
// single-purpose (event covers + media), no tab strip.

import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { colors } from "../../theme/colors.js";

export default function ImagePickerModal({ isOpen, onSelect, onClose }) {
  const [gallery, setGallery] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // URLs whose <img> failed to load — hide them from the grid
  const [brokenUrls, setBrokenUrls] = useState(() => new Set());

  const visibleGallery = useMemo(
    () => gallery.filter((g) => !brokenUrls.has(g.url)),
    [gallery, brokenUrls],
  );

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    // Defer state changes by a microtask so React's "no setState in effect"
    // rule is satisfied; cleanup still cancels the in-flight fetch.
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError("");
    });
    authenticatedFetch("/host/crm/event-image-gallery")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data) => { if (!cancelled) setGallery(data.items || []); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(10,10,10,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff", borderRadius: "16px", padding: "20px",
          width: "100%", maxWidth: "720px", maxHeight: "80vh", overflow: "hidden",
          display: "flex", flexDirection: "column", border: `1px solid ${colors.border}`,
          boxShadow: "0 8px 30px rgba(10,10,10,0.10)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>Choose from your events</div>
          <button
            type="button"
            onClick={onClose}
            style={{ marginLeft: "auto", background: "transparent", border: "none", color: colors.textSubtle, cursor: "pointer", fontSize: 20, lineHeight: 1 }}
            aria-label="Close"
          >×</button>
        </div>

        {error && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && <div style={{ color: colors.textSubtle }}>Loading…</div>}
          {!loading && visibleGallery.length === 0 && (
            <div style={{ color: colors.textSubtle }}>
              No images yet — your events have no cover images or media.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
            {visibleGallery.map((item, i) => (
              <button
                key={`${item.url}-${i}`}
                type="button"
                onClick={() => onSelect({ url: item.url, source: "event-gallery" })}
                style={{ padding: 0, border: `1px solid ${colors.border}`, borderRadius: "10px", overflow: "hidden", cursor: "pointer", background: "transparent" }}
                title={`${item.eventTitle} — ${item.kind}`}
              >
                <img
                  src={item.url}
                  alt=""
                  style={{ width: "100%", height: "120px", objectFit: "cover", display: "block" }}
                  onError={() => setBrokenUrls((prev) => {
                    if (prev.has(item.url)) return prev;
                    const next = new Set(prev);
                    next.add(item.url);
                    return next;
                  })}
                />
                <div style={{ padding: "6px 8px", fontSize: "11px", color: colors.textMuted, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.eventTitle}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
