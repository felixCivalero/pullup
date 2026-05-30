// Public, token-gated uploader reached from the chat via get_media_upload_link
// (MCP) — route /m/:token. It does ONE thing: drop a video/photo and it attaches
// straight to the event, no full editor, no separate sign-in. The token in the
// URL is the only credential (it pins the event server-side, expires in 2h).
//
// This is intentionally NOT a "flow" with a finish button — it's a plain upload
// utility. It shows the event's current media so the host can tell add-vs-
// replace, new uploads pop in as thumbnails, and the host just heads back to
// their AI chat to keep editing. No completion/close ceremony.

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { UploadCloud, Check, AlertCircle, Loader2, Play, X } from "lucide-react";

import { API_BASE } from "../lib/env.js";
import { colors } from "../theme/colors.js";
import {
  validateMediaFile,
  generateVideoThumbnail,
  processImageForUpload,
  uploadEventMediaViaLink,
  transformedImageUrl,
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
  const [gallery, setGallery] = useState([]); // current media on the event
  const [newIds, setNewIds] = useState(() => new Set()); // added this session
  const [deletingId, setDeletingId] = useState(null);
  const addedCount = newIds.size;

  // Preflight the token: show the event title + the media already on the event.
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
        const media = Array.isArray(data.media) ? data.media : [];
        setGallery(media);
        posRef.current = media.length || Number(data.mediaCount) || 0;
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

        const row = await uploadEventMediaViaLink({
          token,
          file: fileForUpload,
          mediaType: v.mediaType,
          position: posRef.current,
          thumbnailBlob,
          onProgress: setProgress,
        });

        posRef.current += 1;
        // Append the just-uploaded item to the live gallery and flag it as new
        // so it pops in with a highlight — answering "did this add or replace?".
        if (row && row.id) {
          setGallery((prev) => [...prev, row]);
          setNewIds((prev) => new Set(prev).add(row.id));
        }
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

  // Pick the best small image to represent a media item in the strip.
  function thumbSrc(m) {
    if (m.mediaType === "image") return transformedImageUrl(m.url, { width: 160 });
    return m.thumbnailUrl || (m.mediaType === "gif" ? m.url : null);
  }

  async function handleDelete(mediaId) {
    if (deletingId) return;
    if (!window.confirm("Remove this from the event?")) return;
    setDeletingId(mediaId);
    setUploadError("");
    try {
      const res = await fetch(
        `${API_BASE}/media-link/${encodeURIComponent(token)}/${encodeURIComponent(mediaId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Couldn't remove that.");
      }
      const data = await res.json();
      const media = Array.isArray(data.media) ? data.media : [];
      setGallery(media); // server-authoritative — cover may have moved
      posRef.current = media.length;
      setNewIds((prev) => {
        const n = new Set(prev);
        n.delete(mediaId);
        return n;
      });
    } catch (e) {
      setUploadError(e.message || "Couldn't remove that.");
    } finally {
      setDeletingId(null);
    }
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
              Drop a video (up to 500MB) or photos (up to 50MB) and they attach
              straight to the event. This page just uploads — keep editing back in
              your chat.
            </p>

            {/* Current gallery — what's already on the event, plus this session's
                uploads as they land. Lets the host see add-vs-replace at a glance. */}
            {gallery.length > 0 ? (
              <div style={{ marginBottom: 18 }}>
                <div style={galleryLabel}>
                  On this event · {gallery.length}
                </div>
                <div style={thumbRow}>
                  {gallery.map((m) => {
                    const src = thumbSrc(m);
                    const isNew = newIds.has(m.id);
                    return (
                      <div key={m.id} style={thumbWrap(isNew)}>
                        {src ? (
                          <img src={src} alt="" style={thumbImg} loading="lazy" />
                        ) : (
                          <div style={thumbFallback}>
                            <Play size={16} style={{ color: colors.textSubtle }} />
                          </div>
                        )}
                        {m.mediaType === "video" && (
                          <span style={playOverlay}>
                            <Play size={14} fill="#fff" color="#fff" />
                          </span>
                        )}
                        {m.isCover && <span style={coverTag}>Cover</span>}
                        {isNew && <span style={newTag}>New</span>}
                        <button
                          type="button"
                          onClick={() => handleDelete(m.id)}
                          disabled={deletingId === m.id}
                          style={deleteBtn}
                          aria-label="Remove from event"
                        >
                          {deletingId === m.id ? (
                            <Loader2 size={11} color="#fff" className="spin" />
                          ) : (
                            <X size={12} color="#fff" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p style={{ ...bodyStyle, fontSize: 13, marginTop: -4 }}>
                No media yet — your first upload becomes the cover.
              </p>
            )}

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

            {/* Quiet confirmation — no finish button; the host just goes back to
                their chat to keep editing. */}
            {addedCount > 0 && !busy && (
              <div style={{ ...centerRow, color: colors.success, marginTop: 14, fontSize: 13 }}>
                <Check size={16} />
                <span>
                  {addedCount} added — it's on the event. Drop more, or head back to
                  your chat to keep editing.
                </span>
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

const galleryLabel = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: colors.textSubtle,
  marginBottom: 8,
};

const thumbRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const thumbWrap = (isNew) => ({
  position: "relative",
  width: 64,
  height: 64,
  borderRadius: 10,
  overflow: "hidden",
  background: "rgba(10,10,10,0.04)",
  border: isNew ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
  boxShadow: isNew ? colors.accentShadow : "none",
  flex: "0 0 auto",
});

const thumbImg = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const thumbFallback = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const playOverlay = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 22,
  height: 22,
  borderRadius: 999,
  background: "rgba(10,10,10,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
};

const deleteBtn = {
  position: "absolute",
  top: 3,
  right: 3,
  width: 18,
  height: 18,
  borderRadius: 999,
  border: "none",
  padding: 0,
  background: "rgba(10,10,10,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const coverTag = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  fontSize: 9,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.3,
  textAlign: "center",
  color: "#fff",
  background: "rgba(10,10,10,0.55)",
  padding: "1px 0",
};

const newTag = {
  position: "absolute",
  top: 4,
  left: 4,
  fontSize: 9,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.3,
  color: "#fff",
  background: colors.accent,
  borderRadius: 4,
  padding: "1px 4px",
};
