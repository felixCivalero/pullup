// Public, token-gated uploader reached from the chat via get_media_upload_link
// (MCP) — route /m/:token. It does ONE thing: drop a video/photo and attach it
// straight to the event, no full editor, no separate sign-in. The token in the
// URL is the only credential (it pins the event server-side, expires in 2h).
// When the file lands, the host closes the tab and heads back to their chat.

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { UploadCloud, Check, AlertCircle, Loader2 } from "lucide-react";

import { API_BASE } from "../lib/env.js";
import { colors } from "../theme/colors.js";
import {
  validateMediaFile,
  generateVideoThumbnail,
  processImageForUpload,
  uploadEventMediaViaLink,
} from "../lib/imageUtils.js";

const ACCEPT = "image/*,video/mp4,video/quicktime,video/webm";

export function MediaUploadPage() {
  const { token } = useParams();
  const inputRef = useRef(null);
  const posRef = useRef(0); // next position; seeded from existing media count

  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState("");
  const [eventTitle, setEventTitle] = useState("");

  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [done, setDone] = useState([]); // [{ name, mediaType }]

  // Preflight the token: show the event title + seed the position counter.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/media-link/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            res.status === 410
              ? "This upload link has expired. Ask Claude for a fresh one in your chat."
              : body.error || "This upload link isn't valid.",
          );
        }
        const data = await res.json();
        if (cancelled) return;
        setEventTitle(data.eventTitle || "your event");
        posRef.current = Number(data.mediaCount) || 0;
      } catch (e) {
        if (!cancelled) setLinkError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || busy) return;
    setUploadError("");

    for (const file of files) {
      const v = validateMediaFile(file);
      if (!v.valid) {
        setUploadError(v.error);
        continue;
      }

      setBusy(true);
      setProgress(0);
      try {
        const isVideo = v.mediaType === "video";

        // A .mov is a QuickTime container but almost always holds H.264/AAC —
        // browsers refuse to decode `video/quicktime` and the thumbnail/preview
        // come back blank. Relabel to mp4 so the whole pipeline treats it right.
        const uploadFile =
          isVideo && file.type === "video/quicktime"
            ? new File([file], file.name.replace(/\.mov$/i, ".mp4"), { type: "video/mp4" })
            : file;

        let blob = uploadFile;
        let thumbnailBlob = null;

        if (isVideo) {
          try {
            thumbnailBlob = await generateVideoThumbnail(uploadFile);
          } catch (e) {
            console.warn("[media-link] thumbnail generation failed", e);
          }
        } else if (v.mediaType === "image") {
          try {
            const processed = await processImageForUpload(uploadFile);
            blob =
              processed.blob instanceof File
                ? processed.blob
                : new File([processed.blob], uploadFile.name, {
                    type: processed.mimeType || processed.blob.type,
                  });
          } catch (e) {
            console.warn("[media-link] image processing failed", e);
          }
        }

        const fileForUpload = blob instanceof File ? blob : uploadFile;

        await uploadEventMediaViaLink({
          token,
          file: fileForUpload,
          mediaType: v.mediaType,
          position: posRef.current,
          thumbnailBlob,
          onProgress: setProgress,
        });

        posRef.current += 1;
        setDone((prev) => [...prev, { name: file.name, mediaType: v.mediaType }]);
      } catch (e) {
        setUploadError(e.message || "Upload failed. Try again.");
      } finally {
        setBusy(false);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {loading && (
          <div style={centerRow}>
            <Loader2 size={18} style={{ color: colors.textMuted }} className="spin" />
            <span style={{ color: colors.textMuted }}>Checking your link…</span>
          </div>
        )}

        {!loading && linkError && (
          <div>
            <div style={iconBadge(colors.dangerRgba, colors.danger)}>
              <AlertCircle size={22} />
            </div>
            <h1 style={titleStyle}>Link not valid</h1>
            <p style={bodyStyle}>{linkError}</p>
          </div>
        )}

        {!loading && !linkError && (
          <div>
            <div style={iconBadge(colors.accentSoft, colors.accent)}>
              <UploadCloud size={22} />
            </div>
            <h1 style={titleStyle}>Add media to {eventTitle}</h1>
            <p style={bodyStyle}>
              Drop a video (up to 500MB) or photos (up to 50MB) and they'll attach
              straight to the event.
            </p>

            {/* Dropzone */}
            <button
              type="button"
              onClick={() => !busy && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              disabled={busy}
              style={dropzoneStyle(dragOver, busy)}
            >
              {busy ? (
                <div style={{ width: "100%" }}>
                  <div style={{ color: colors.text, fontWeight: 600, marginBottom: 10 }}>
                    Uploading… {Math.round(progress)}%
                  </div>
                  <div style={barTrack}>
                    <div style={{ ...barFill, width: `${Math.max(2, progress)}%` }} />
                  </div>
                </div>
              ) : (
                <>
                  <UploadCloud size={28} style={{ color: colors.accent, marginBottom: 8 }} />
                  <div style={{ color: colors.text, fontWeight: 600 }}>
                    Tap to choose, or drop a file here
                  </div>
                  <div style={{ color: colors.textSubtle, fontSize: 12, marginTop: 4 }}>
                    JPG, PNG, GIF, WebP, MP4, MOV, WebM
                  </div>
                </>
              )}
            </button>

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />

            {uploadError && (
              <p style={{ ...bodyStyle, color: colors.danger, margin: "14px 0 0" }}>
                {uploadError}
              </p>
            )}

            {/* Success log + return-to-chat (hold-with-button) */}
            {done.length > 0 && (
              <div style={doneBox}>
                <div style={{ ...centerRow, color: colors.success, fontWeight: 600 }}>
                  <Check size={18} />
                  <span>
                    {done.length} {done.length === 1 ? "file" : "files"} added to {eventTitle}
                  </span>
                </div>
                <p style={{ ...bodyStyle, fontSize: 13, margin: "10px 0 16px" }}>
                  You're set. Close this tab and head back to your chat — tell Claude
                  "done" and it'll confirm it's on the event.
                </p>
                <button type="button" onClick={() => window.close()} style={doneBtn}>
                  Done — close this tab
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  style={addAnotherBtn}
                  disabled={busy}
                >
                  Add another
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: colors.background,
  color: colors.text,
};

const cardStyle = {
  width: "100%",
  maxWidth: 460,
  padding: 32,
  borderRadius: 16,
  background: "#ffffff",
  border: `1px solid ${colors.border}`,
  boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
};

const centerRow = { display: "flex", alignItems: "center", gap: 8 };

const iconBadge = (bg, fg) => ({
  width: 44,
  height: 44,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color: fg,
  marginBottom: 16,
});

const titleStyle = {
  fontSize: 22,
  fontWeight: 600,
  margin: "0 0 10px",
  color: colors.text,
};

const bodyStyle = {
  fontSize: 14,
  lineHeight: 1.6,
  color: colors.textMuted,
  margin: "0 0 20px",
};

const dropzoneStyle = (active, busy) => ({
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "28px 20px",
  borderRadius: 14,
  border: `2px dashed ${active ? colors.accent : colors.borderStrong}`,
  background: active ? colors.accentSoft : "rgba(10,10,10,0.02)",
  cursor: busy ? "default" : "pointer",
  transition: "all 0.15s ease",
});

const barTrack = {
  width: "100%",
  height: 8,
  borderRadius: 999,
  background: colors.borderFaint,
  overflow: "hidden",
};

const barFill = {
  height: "100%",
  borderRadius: 999,
  background: colors.accent,
  transition: "width 0.2s ease",
};

const doneBox = {
  marginTop: 20,
  padding: 18,
  borderRadius: 14,
  background: colors.successRgba,
  border: `1px solid rgba(22,163,74,0.18)`,
};

const buttonBase = {
  display: "block",
  width: "100%",
  padding: "11px 20px",
  borderRadius: 999,
  border: "none",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const doneBtn = {
  ...buttonBase,
  background: colors.accent,
  color: "#ffffff",
  boxShadow: colors.accentShadow,
};

const addAnotherBtn = {
  ...buttonBase,
  marginTop: 10,
  background: "transparent",
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
};
