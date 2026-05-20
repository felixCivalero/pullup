// Public upload page reached via a short-lived link minted by the MCP
// `get_media_upload_link` tool. Lets a host drag-drop one media file
// (image or video) onto an event WITHOUT logging in — the JWT in the URL
// is the only auth — and tune the essentials (fit/focus for images;
// loop/autoplay/sound for videos) before the file lands on the event.
//
// Intentionally narrow: media + media settings only. Other event details
// stay in claude.ai / the full editor.

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Upload, Image as ImageIcon, Film, Check, ExternalLink, AlertCircle } from "lucide-react";

import { uploadBlobToSignedUrl } from "../lib/imageUtils.js";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3001" : "/api");

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

function mediaTypeFromMime(mime) {
  if (!mime) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return null;
}

export function MediaUploadPage() {
  const { token } = useParams();
  const [phase, setPhase] = useState("loading"); // loading | invalid | ready | uploading | done
  const [errorText, setErrorText] = useState("");
  const [event, setEvent] = useState(null);

  // File state
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  // Media settings — start with sensible defaults; merged into event on save.
  const [fit, setFit] = useState("cover"); // image: cover | contain
  const [focusX, setFocusX] = useState(50); // 0–100
  const [focusY, setFocusY] = useState(50);
  const [videoLoop, setVideoLoop] = useState(true);
  const [videoAutoplay, setVideoAutoplay] = useState(true);
  const [videoAudio, setVideoAudio] = useState(false);

  // Upload progress 0–100
  const [progress, setProgress] = useState(0);
  const [doneInfo, setDoneInfo] = useState(null);

  // ── Validate the link on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/public/upload-links/${encodeURIComponent(token)}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Link is invalid or expired");
        }
        const data = await res.json();
        if (cancelled) return;
        setEvent(data);
        // Seed mediaSettings from the event if present, so the host sees
        // current focus/playback values rather than fresh defaults.
        const ms = data?.mediaSettings || {};
        if (ms.phone) {
          if (ms.phone.fit) setFit(ms.phone.fit);
          if (Number.isFinite(ms.phone.focusX)) setFocusX(ms.phone.focusX);
          if (Number.isFinite(ms.phone.focusY)) setFocusY(ms.phone.focusY);
        }
        if (typeof ms.loop === "boolean") setVideoLoop(ms.loop);
        if (typeof ms.autoplay === "boolean") setVideoAutoplay(ms.autoplay);
        if (typeof ms.audio === "boolean") setVideoAudio(ms.audio);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorText(err.message);
        setPhase("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── File handling ──────────────────────────────────────────────────
  function pickFile(next) {
    setErrorText("");
    if (!next) return;
    const mt = mediaTypeFromMime(next.type);
    if (!mt) {
      setErrorText("Pick an image or video file.");
      return;
    }
    const cap = mt === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (next.size > cap) {
      setErrorText(
        `File is ${(next.size / 1024 / 1024).toFixed(0)}MB. Limit is ${cap / 1024 / 1024}MB for ${mt}s.`
      );
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
  }

  function onDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) pickFile(f);
  }
  function onDragOver(e) {
    e.preventDefault();
  }

  const mediaType = mediaTypeFromMime(file?.type);

  // ── Drag-to-focus on the preview ───────────────────────────────────
  function startFocusDrag(e) {
    if (!file || mediaType !== "image" || fit !== "cover") return;
    e.preventDefault();
    const frame = e.currentTarget.getBoundingClientRect();
    const startX = e.clientX ?? e.touches?.[0]?.clientX;
    const startY = e.clientY ?? e.touches?.[0]?.clientY;
    const initFx = focusX;
    const initFy = focusY;
    function onMove(ev) {
      const cx = ev.clientX ?? ev.touches?.[0]?.clientX;
      const cy = ev.clientY ?? ev.touches?.[0]?.clientY;
      const dx = cx - startX;
      const dy = cy - startY;
      const fx = Math.max(0, Math.min(100, initFx - (dx / frame.width) * 100));
      const fy = Math.max(0, Math.min(100, initFy - (dy / frame.height) * 100));
      setFocusX(fx);
      setFocusY(fy);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  }

  // ── Upload pipeline ────────────────────────────────────────────────
  async function doUpload() {
    if (!file) return;
    setPhase("uploading");
    setProgress(0);
    setErrorText("");
    try {
      // 1) Mint signed Supabase upload URL via token.
      const tokRes = await fetch(
        `${API_BASE}/public/upload-links/${encodeURIComponent(token)}/storage-token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mimeType: file.type, kind: "main", position: 0 }),
        }
      );
      if (!tokRes.ok) {
        const body = await tokRes.json().catch(() => ({}));
        throw new Error(body.error || "Could not get upload URL");
      }
      const { path, uploadUrl } = await tokRes.json();

      // 2) PUT the file directly to Supabase Storage (progress events).
      await uploadBlobToSignedUrl({
        url: uploadUrl,
        blob: file,
        mimeType: file.type,
        onProgress: (p) => setProgress(Math.min(95, Math.round(p * 0.95))),
      });

      // 3) Register the media against the event + persist mediaSettings.
      const mediaSettings = {
        ...(mediaType === "video"
          ? { mode: "video", loop: videoLoop, autoplay: videoAutoplay, audio: videoAudio }
          : {}),
        phone: { fit, focusX, focusY },
        desktop: { mode: fit === "cover" ? "fit" : "real", focusX, focusY },
      };
      const regRes = await fetch(
        `${API_BASE}/public/upload-links/${encodeURIComponent(token)}/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath: path,
            mediaType,
            mimeType: file.type,
            position: 0,
            mediaSettings,
          }),
        }
      );
      if (!regRes.ok) {
        const body = await regRes.json().catch(() => ({}));
        throw new Error(body.error || "Failed to attach media to event");
      }
      const info = await regRes.json();
      setProgress(100);
      setDoneInfo({
        url: info.url,
        isCover: info.isCover,
        mediaType,
      });
      setPhase("done");
    } catch (err) {
      setErrorText(err.message);
      setPhase("ready");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  if (phase === "loading") {
    return <Shell><Centered text="Checking link…" /></Shell>;
  }
  if (phase === "invalid") {
    return (
      <Shell>
        <div style={{ textAlign: "center" }}>
          <AlertCircle size={32} style={{ color: "#fca5a5", marginBottom: 12 }} />
          <h1 style={titleStyle}>This upload link won't open</h1>
          <p style={bodyStyle}>{errorText || "It may have expired or already been used."}</p>
          <p style={{ ...bodyStyle, fontSize: 12, opacity: 0.5 }}>
            Ask Claude to run <code>get_media_upload_link</code> again to mint a fresh one.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, opacity: 0.55, letterSpacing: 0.5, textTransform: "uppercase" }}>
          Attach media to
        </div>
        <h1 style={titleStyle}>{event?.title}</h1>
      </div>

      {/* File picker / drop zone */}
      {!file && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onClick={() => fileInputRef.current?.click()}
          style={dropZoneStyle}
        >
          <Upload size={28} style={{ opacity: 0.6, marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>Drop a file here</div>
          <div style={{ fontSize: 12, opacity: 0.55, marginTop: 6 }}>
            or tap to pick — image up to 50MB, video up to 500MB
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>
      )}

      {/* Preview + settings */}
      {file && phase !== "done" && (
        <>
          <div
            style={previewFrameStyle(fit, focusX, focusY)}
            onMouseDown={startFocusDrag}
            onTouchStart={startFocusDrag}
          >
            {mediaType === "image" ? (
              <img
                src={previewUrl}
                alt="preview"
                style={previewMediaStyle(fit, focusX, focusY)}
                draggable={false}
              />
            ) : (
              <video
                src={previewUrl}
                style={previewMediaStyle("cover", focusX, focusY)}
                autoPlay={videoAutoplay}
                loop={videoLoop}
                muted={!videoAudio}
                playsInline
                controls={!videoAutoplay}
              />
            )}
            {mediaType === "image" && fit === "cover" && (
              <div style={dragHintStyle}>drag to adjust focus</div>
            )}
          </div>

          {/* Settings */}
          <div style={settingsCardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.7, marginBottom: 12 }}>
              {mediaType === "image" ? <ImageIcon size={14} /> : <Film size={14} />}
              <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" }}>
                Display settings
              </div>
            </div>

            {mediaType === "image" && (
              <Segmented
                label="Fit"
                value={fit}
                onChange={setFit}
                options={[
                  { value: "cover", label: "Fill (crop)" },
                  { value: "contain", label: "Real size" },
                ]}
              />
            )}

            {mediaType === "video" && (
              <>
                <Toggle label="Loop" value={videoLoop} onChange={setVideoLoop} />
                <Toggle label="Autoplay" value={videoAutoplay} onChange={setVideoAutoplay} />
                <Toggle label="Sound on" value={videoAudio} onChange={setVideoAudio} />
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>
                  Tip: most browsers block autoplay unless the video is muted.
                </div>
              </>
            )}
          </div>

          {/* Action row */}
          {errorText && (
            <div style={errorBoxStyle}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{errorText}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button
              type="button"
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setFile(null);
                setPreviewUrl(null);
                setProgress(0);
                setErrorText("");
              }}
              disabled={phase === "uploading"}
              style={secondaryBtnStyle}
            >
              Swap file
            </button>
            <button
              type="button"
              onClick={doUpload}
              disabled={phase === "uploading"}
              style={primaryBtnStyle}
            >
              {phase === "uploading"
                ? `Uploading… ${progress}%`
                : "Save"}
            </button>
          </div>
          {phase === "uploading" && (
            <div style={progressBarOuter}>
              <div style={{ ...progressBarInner, width: `${progress}%` }} />
            </div>
          )}
        </>
      )}

      {/* Done */}
      {phase === "done" && (
        <div style={{ textAlign: "center" }}>
          <div style={successBadge}>
            <Check size={20} />
          </div>
          <h2 style={{ ...titleStyle, fontSize: 18 }}>
            {doneInfo?.isCover ? "Cover set" : "Media added"}
          </h2>
          <p style={bodyStyle}>
            {doneInfo?.mediaType === "video"
              ? "Your video is attached and playback settings are saved."
              : "Your image is attached and the framing is saved."}
            <br />Head back to Claude to wrap up the rest.
          </p>
          {event?.slug && (
            <a
              href={`/e/${event.slug}`}
              target="_blank"
              rel="noreferrer"
              style={linkBtnStyle}
            >
              Open event page
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      )}
    </Shell>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────

function Shell({ children }) {
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>{children}</div>
    </div>
  );
}

function Centered({ text }) {
  return <div style={{ opacity: 0.6, textAlign: "center" }}>{text}</div>;
}

function Segmented({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={segLabelStyle}>{label}</div>
      <div style={segGroupStyle}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                ...segBtnStyle,
                background: active ? "rgba(255,255,255,0.12)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.55)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={toggleRowStyle}
    >
      <span style={{ fontSize: 14 }}>{label}</span>
      <span
        style={{
          ...togglePillStyle,
          background: value ? "rgba(232, 200, 102, 0.45)" : "rgba(255,255,255,0.08)",
        }}
      >
        <span
          style={{
            ...toggleKnobStyle,
            transform: value ? "translateX(18px)" : "translateX(2px)",
            background: value ? "#f0d878" : "rgba(255,255,255,0.5)",
          }}
        />
      </span>
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background:
    "radial-gradient(circle at 20% 50%, rgba(232, 200, 102, 0.06) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(192, 192, 192, 0.04) 0%, transparent 50%), #05040a",
  color: "#fff",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif",
};

const cardStyle = {
  width: "100%",
  maxWidth: 460,
  padding: 24,
  borderRadius: 18,
  background: "rgba(12, 10, 18, 0.78)",
  border: "1px solid rgba(255,255,255,0.06)",
  backdropFilter: "blur(14px)",
};

const titleStyle = {
  fontSize: 22,
  fontWeight: 600,
  margin: "4px 0 6px",
  lineHeight: 1.2,
};

const bodyStyle = {
  fontSize: 14,
  lineHeight: 1.6,
  opacity: 0.75,
  margin: "0 0 14px",
};

const dropZoneStyle = {
  border: "1.5px dashed rgba(255,255,255,0.18)",
  borderRadius: 14,
  padding: "40px 16px",
  textAlign: "center",
  cursor: "pointer",
  transition: "border 0.15s ease, background 0.15s ease",
  background: "rgba(255,255,255,0.02)",
};

function previewFrameStyle(/* fit, fx, fy */) {
  return {
    position: "relative",
    width: "100%",
    aspectRatio: "9 / 16",
    maxHeight: "55vh",
    background: "#000",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 14,
    cursor: "grab",
    userSelect: "none",
  };
}

function previewMediaStyle(fit, fx, fy) {
  return {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: fit === "contain" ? "contain" : "cover",
    objectPosition: `${fx}% ${fy}%`,
    pointerEvents: "none",
  };
}

const dragHintStyle = {
  position: "absolute",
  bottom: 10,
  left: 10,
  right: 10,
  textAlign: "center",
  fontSize: 11,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  opacity: 0.55,
  pointerEvents: "none",
};

const settingsCardStyle = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.05)",
};

const segLabelStyle = {
  fontSize: 11,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  opacity: 0.55,
  marginBottom: 6,
};

const segGroupStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 4,
  padding: 3,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 10,
};

const segBtnStyle = {
  padding: "8px 6px",
  borderRadius: 7,
  border: "none",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.15s ease, color 0.15s ease",
};

const toggleRowStyle = {
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 0",
  background: "transparent",
  border: "none",
  color: "#fff",
  cursor: "pointer",
};

const togglePillStyle = {
  position: "relative",
  width: 36,
  height: 20,
  borderRadius: 999,
  transition: "background 0.15s ease",
};

const toggleKnobStyle = {
  position: "absolute",
  top: 2,
  left: 0,
  width: 16,
  height: 16,
  borderRadius: "50%",
  transition: "transform 0.15s ease, background 0.15s ease",
};

const primaryBtnStyle = {
  flex: 1,
  padding: "12px 18px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg, #f0d878, #c9a94a)",
  color: "#1a1306",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtnStyle = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "transparent",
  color: "rgba(255,255,255,0.75)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const errorBoxStyle = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(248,113,113,0.12)",
  border: "1px solid rgba(248,113,113,0.3)",
  color: "#fca5a5",
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
};

const progressBarOuter = {
  marginTop: 10,
  height: 4,
  borderRadius: 999,
  background: "rgba(255,255,255,0.06)",
  overflow: "hidden",
};

const progressBarInner = {
  height: "100%",
  background: "linear-gradient(90deg, #f0d878, #c9a94a)",
  transition: "width 0.2s ease",
};

const successBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  borderRadius: "50%",
  background: "rgba(34,197,94,0.18)",
  color: "#4ade80",
  marginBottom: 12,
};

const linkBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 600,
};
