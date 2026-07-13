// frontend/src/components/room/RoomContentWall.jsx
//
// THE WALL — the hero of the event Room. A Pinterest-style masonry feed of the
// photos & videos shot AT the event by the people who were there. This is the
// page now; welcome / shop / chat sit beneath it.
//
// Three things make it more than a gallery:
//   1. CONSENT — you can't add a photo without ticking commercial-use consent,
//      so everything on the wall is cleared for the people in the room to use.
//   2. CREDIT  — every tile carries who shot it (name + @instagram), so anyone
//      who grabs a shot can tag the creator on social.
//   3. PULL    — single or multi-select download, straight from storage (the
//      bytes never touch our server), and every download bumps a live counter
//      so the room can see what's resonating.
import { useState, useRef, useCallback } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { supabase } from "../../lib/supabase.js";
import { buildZip } from "../../lib/zip.js";
import { colors } from "../../theme/colors.js";
import {
  Download, Plus, X, Check, Camera, Instagram, Trash2, Loader2, CheckCheck, Images,
} from "lucide-react";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function igUrl(handle) {
  return handle ? `https://instagram.com/${String(handle).replace(/^@+/, "")}` : null;
}
function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "Someone";
}
function isVideo(it) {
  return it?.type === "video" || /\.(mp4|mov|m4v|webm|ogg)(\?|#|$)/i.test(String(it?.url || ""));
}
// Read a file's natural pixel dimensions so the masonry can reserve the right
// aspect ratio before the bytes arrive (no layout jump as tiles load).
function readDimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (w, h) => { URL.revokeObjectURL(url); resolve({ width: w || null, height: h || null }); };
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => done(null, null);
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => done(null, null);
      img.src = url;
    }
  });
}
// Build a lightweight on-screen copy of a photo (long edge ≤ 2048px, JPEG q0.78)
// so the wall renders fast. The ORIGINAL file is what we store for download —
// this variant is display-only. Returns a Blob, or null when the file isn't a
// shrinkable image (video / GIF) or the browser can't decode it (→ the wall
// just shows the original). Best-effort: never throws.
function makeDisplayBlob(file) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/") || file.type === "image/gif") return resolve(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 2048;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      try {
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        // JPEG has no alpha — flatten any transparency (e.g. a PNG) onto white
        // so the display copy doesn't get a black background. The original
        // (with its real transparency) is untouched and is what downloads.
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.78);
      } catch { resolve(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
// Save a Blob straight to disk — instant, no tab. The blob URL is same-origin,
// so the download filename is always honoured (unlike a cross-origin <a download>).
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
// Last-resort save when a fetch is blocked (CORS) — may open a tab.
function anchorFallback(url) {
  const a = document.createElement("a");
  a.href = url; a.download = ""; a.target = "_blank"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
}
function slugify(s, max = 40) {
  return String(s || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max);
}
function extFor(it) {
  const base = String(it.url || "").split("?")[0].split("/").pop() || "";
  if (base.includes(".")) return base.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || (it.type === "video" ? "mp4" : "jpg");
  return it.type === "video" ? "mp4" : "jpg";
}
// Who shot it: the Instagram handle, or their name if no handle. Mirrors the
// backend's downloadName() so single + zip downloads name files the same way.
function whoPart(it) {
  const handle = String(it.uploader?.instagram || "").trim().replace(/^@+/, "");
  if (handle) return handle.toLowerCase().replace(/[^a-z0-9._]+/g, "").slice(0, 40);
  return slugify(it.uploader?.name);
}
// Filename stem event_date_who — self-describing on disk. `event`/`date` come
// from the wall's event (may be absent → those segments just drop out).
function fileStem(it, event) {
  const parts = [slugify(event?.title || event?.slug, 48), (event?.date || "").slice(0, 10), whoPart(it)].filter(Boolean);
  return parts.join("_") || "pullup";
}
// A single, unique zip-entry name. `used` dedupes same-shooter shots so the zip
// writer never overwrites (jane_-2.jpg, jane_-3.jpg …).
function zipNameFor(it, event, used) {
  const stem = fileStem(it, event);
  const ext = extFor(it);
  let name = `${stem}.${ext}`;
  for (let n = 2; used.has(name); n++) name = `${stem}-${n}.${ext}`;
  used.add(name);
  return name;
}
// React drops the `muted` attribute on first render, which makes browsers block
// muted autoplay — so we force el.muted = true via a ref too (belt + braces).
const mutedAutoplay = (el) => { if (el) el.muted = true; };

export default function RoomContentWall({ eventId, event, initial, can, meName, isHost }) {
  const [items, setItems] = useState(() => (Array.isArray(initial) ? initial : []));
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null); // the item being viewed large
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const canUpload = !!can?.upload || isHost;
  const canDownload = !!can?.download || isHost;

  const setBusy = useCallback((id, on) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const bumpCount = useCallback((id, count) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, downloads: typeof count === "number" ? count : it.downloads + 1 } : it)));
  }, []);

  // Tally the download server-side and get back the (forced) URL to pull bytes
  // from. Returns the URL to fetch, or null on a hard failure.
  const tallyAndUrl = useCallback(async (it) => {
    try {
      const r = await authenticatedFetch(`/events/${eventId}/room-content/${it.id}/download`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (d?.ok) { bumpCount(it.id, d.count); return d.url || it.url; }
    } catch { /* fall through */ }
    return it.url;
  }, [eventId, bumpCount]);

  // ONE → hand the forced ?download= URL straight to the browser's native
  // download manager. The backend appends ?download=<name>, so Supabase sets
  // Content-Disposition: attachment and the filename is honoured even
  // cross-origin — no need to buffer the whole file into a blob first. This
  // streams to disk with a real progress bar (vital for large videos, which
  // otherwise sat on a spinner while the entire file loaded into memory).
  const downloadOne = useCallback(async (it) => {
    setBusy(it.id, true);
    try {
      const url = await tallyAndUrl(it);
      anchorFallback(url);
    } finally {
      setBusy(it.id, false);
    }
  }, [setBusy, tallyAndUrl]);

  // MANY → fetch each, bundle into one .zip, save that. A single item just
  // downloads the file (no point zipping one).
  const downloadMany = useCallback(async (chosen) => {
    if (!chosen.length) return;
    if (chosen.length === 1) {
      await downloadOne(chosen[0]);
      return;
    }
    setBulkBusy(true);
    try {
      const files = [];
      const used = new Set();
      for (let i = 0; i < chosen.length; i++) {
        const it = chosen[i];
        const url = await tallyAndUrl(it);
        try {
          const data = new Uint8Array(await fetch(url).then((r) => r.arrayBuffer()));
          files.push({ name: zipNameFor(it, event, used), data });
        } catch { /* skip a file the browser can't fetch */ }
      }
      if (files.length) downloadBlob(buildZip(files), `pullup-wall-${files.length}.zip`);
    } finally {
      setBulkBusy(false);
    }
  }, [downloadOne, tallyAndUrl, event]);

  // The select-mode bar: download whatever's ticked, then exit select mode.
  const downloadSelected = useCallback(async () => {
    await downloadMany(items.filter((it) => selected.has(it.id)));
    setSelected(new Set());
    setSelecting(false);
  }, [items, selected, downloadMany]);

  // One tap, no selecting → grab the whole wall as a zip.
  const downloadAll = useCallback(() => downloadMany(items), [items, downloadMany]);

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const removeItem = useCallback(async (it) => {
    if (!window.confirm("Remove this from the wall?")) return;
    setBusy(it.id, true);
    try {
      const r = await authenticatedFetch(`/events/${eventId}/room-content/${it.id}`, { method: "DELETE" });
      if (r.ok) {
        setItems((prev) => prev.filter((x) => x.id !== it.id));
        setLightbox((cur) => (cur?.id === it.id ? null : cur));
      }
    } finally { setBusy(it.id, false); }
  }, [eventId, setBusy]);

  const onUploaded = useCallback((newItems) => {
    const arr = (Array.isArray(newItems) ? newItems : [newItems]).filter(Boolean);
    if (arr.length) setItems((prev) => [...arr, ...prev]);
  }, []);

  const count = items.length;
  const selCount = selected.size;

  return (
    <div style={{ marginBottom: 26 }}>
      {/* ── Header: the wall's name + the two verbs (add / pull) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ width: 34, height: 34, borderRadius: 11, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Images size={18} color={colors.accent} strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 850, letterSpacing: "-0.02em", color: colors.text, fontFamily: SF, lineHeight: 1.1 }}>
            The wall
          </div>
          <div style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 1 }}>
            {count > 0 ? `${count} ${count === 1 ? "moment" : "moments"} from the room` : "Photos & clips from the people who were here"}
          </div>
        </div>

        {canDownload && count > 0 && (
          selecting ? (
            <button onClick={() => { setSelecting(false); setSelected(new Set()); }} style={ghostBtn}>
              <X size={15} /> Cancel
            </button>
          ) : (
            <>
              <button onClick={downloadAll} disabled={bulkBusy} style={{ ...darkBtn, opacity: bulkBusy ? 0.7 : 1 }}>
                {bulkBusy ? <Loader2 size={15} className="spin" /> : <Download size={15} strokeWidth={2.4} />}
                {bulkBusy ? "Zipping…" : (count === 1 ? "Download" : `Download all ${count}`)}
              </button>
              <button onClick={() => setSelecting(true)} style={ghostBtn}>
                <CheckCheck size={15} /> Select
              </button>
            </>
          )
        )}
        {canUpload && (
          <button onClick={() => setUploadOpen(true)} style={primaryBtn}>
            <Plus size={16} strokeWidth={2.6} /> Add yours
          </button>
        )}
      </div>

      {/* ── The masonry. CSS columns = true masonry, zero layout JS. ── */}
      {count === 0 ? (
        <EmptyWall canUpload={canUpload} onAdd={() => setUploadOpen(true)} />
      ) : (
        <div
          style={{
            columnGap: 6,
            columns: "auto",
            // responsive column width via inline media isn't possible; we lean on
            // column-width so the browser packs as many ~220px columns as fit.
            columnWidth: 220,
          }}
        >
          {items.map((it) => (
            <Tile
              key={it.id}
              it={it}
              selecting={selecting}
              selected={selected.has(it.id)}
              busy={busyIds.has(it.id)}
              canDownload={canDownload}
              onOpen={() => (selecting ? toggleSelect(it.id) : setLightbox(it))}
              onToggle={() => toggleSelect(it.id)}
              onDownload={() => downloadOne(it)}
              onDelete={it.canDelete ? () => removeItem(it) : null}
            />
          ))}
        </div>
      )}

      {/* ── Sticky bulk-download bar (select mode) ── */}
      {selecting && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: "calc(18px + env(safe-area-inset-bottom, 0px))", display: "flex", justifyContent: "center", zIndex: 60, pointerEvents: "none" }}>
          <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 14, background: colors.text, color: "#fff", padding: "11px 14px 11px 18px", borderRadius: 999, boxShadow: "0 12px 34px rgba(0,0,0,0.28)", fontFamily: SF }}>
            <span style={{ fontSize: 13.5, fontWeight: 650 }}>{selCount} selected</span>
            <button
              disabled={!selCount || bulkBusy}
              onClick={downloadSelected}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "none", borderRadius: 999, padding: "8px 16px", fontSize: 13.5, fontWeight: 750, fontFamily: SF, cursor: selCount && !bulkBusy ? "pointer" : "default", background: selCount ? colors.accent : "rgba(255,255,255,0.18)", color: "#fff", opacity: bulkBusy ? 0.7 : 1 }}
            >
              {bulkBusy ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
              {bulkBusy
                ? (selCount > 1 ? "Zipping…" : "Downloading…")
                : (selCount > 1 ? `Download ${selCount} as zip` : "Download")}
            </button>
          </div>
        </div>
      )}

      {uploadOpen && (
        <UploadModal
          eventId={eventId}
          meName={meName}
          onClose={() => setUploadOpen(false)}
          onUploaded={onUploaded}
        />
      )}

      {lightbox && (
        <Lightbox
          it={lightbox}
          canDownload={canDownload}
          busy={busyIds.has(lightbox.id)}
          onClose={() => setLightbox(null)}
          onDownload={() => downloadOne(lightbox)}
          onDelete={lightbox.canDelete ? () => removeItem(lightbox) : null}
        />
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 0.8s linear infinite}`}</style>
    </div>
  );
}

// ── One tile ──────────────────────────────────────────────────────────
function Tile({ it, selecting, selected, busy, canDownload, onOpen, onToggle, onDownload, onDelete }) {
  const [hover, setHover] = useState(false);
  const ar = it.width && it.height ? `${it.width} / ${it.height}` : "3 / 4";
  const video = isVideo(it);
  const showChrome = hover || selecting || selected;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        breakInside: "avoid", WebkitColumnBreakInside: "avoid", marginBottom: 6,
        position: "relative", borderRadius: 0, overflow: "hidden", cursor: "pointer",
        background: colors.surfaceMuted, border: `1px solid ${selected ? colors.accent : colors.borderFaint}`,
        boxShadow: selected ? `0 0 0 2px ${colors.accent}` : (hover ? "0 10px 26px rgba(10,10,10,0.14)" : "0 1px 2px rgba(10,10,10,0.05)"),
        transition: "box-shadow 0.18s ease, border-color 0.15s ease",
      }}
    >
      {video ? (
        <video ref={mutedAutoplay} src={it.url} muted loop autoPlay playsInline preload="metadata" style={{ display: "block", width: "100%", aspectRatio: ar, objectFit: "cover" }} />
      ) : (
        <img src={it.displayUrl || it.url} alt={it.caption || ""} loading="lazy" style={{ display: "block", width: "100%", aspectRatio: ar, objectFit: "cover" }} />
      )}

      {/* video glyph */}
      {video && !showChrome && (
        <div style={{ position: "absolute", top: 9, left: 9, width: 22, height: 22, borderRadius: 7, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>▶</span>
        </div>
      )}

      {/* download-count chip — always visible, quiet */}
      {it.downloads > 0 && !selecting && (
        <div style={{ position: "absolute", top: 9, right: 9, display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.52)", color: "#fff", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 700, fontFamily: SF, backdropFilter: "blur(4px)" }}>
          <Download size={11} strokeWidth={2.6} /> {it.downloads}
        </div>
      )}

      {/* select checkbox */}
      {selecting && (
        <div
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          style={{ position: "absolute", top: 9, left: 9, width: 26, height: 26, borderRadius: "50%", border: `2px solid ${selected ? colors.accent : "rgba(255,255,255,0.9)"}`, background: selected ? colors.accent : "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {selected && <Check size={15} color="#fff" strokeWidth={3} />}
        </div>
      )}

      {/* bottom gradient + credit + actions */}
      <div
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0, padding: "26px 10px 9px",
          background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.62) 100%)",
          display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8,
          opacity: showChrome ? 1 : 0, transition: "opacity 0.18s ease",
        }}
      >
        <Credit it={it} />
        {canDownload && !selecting && (
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            title="Download"
            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.95)", color: colors.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
          >
            {busy ? <Loader2 size={15} className="spin" /> : <Download size={15} strokeWidth={2.4} />}
          </button>
        )}
      </div>

      {/* delete (host / owner) */}
      {onDelete && hover && !selecting && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Remove"
          style={{ position: "absolute", top: 9, right: it.downloads > 0 ? 56 : 9, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

// Creator credit — name + tappable @handle, the thing that lets people tag back.
function Credit({ it, big = false }) {
  const handle = it.uploader?.instagram;
  const name = it.uploader?.name;
  const link = igUrl(handle);
  return (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
      {name && (
        <span style={{ color: "#fff", fontSize: big ? 14 : 12, fontWeight: 750, fontFamily: SF, textShadow: "0 1px 6px rgba(0,0,0,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </span>
      )}
      {handle && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "rgba(255,255,255,0.92)", fontSize: big ? 12.5 : 11, fontWeight: 600, textDecoration: "none", textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}
        >
          <Instagram size={big ? 13 : 11} /> @{String(handle).replace(/^@+/, "")}
        </a>
      )}
      {!name && !handle && (
        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 600, textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>From the room</span>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────
function EmptyWall({ canUpload, onAdd }) {
  return (
    <div style={{ border: `1.5px dashed ${colors.border}`, borderRadius: 18, padding: "44px 22px", textAlign: "center", background: colors.surface }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        <Camera size={24} color={colors.accent} strokeWidth={2} />
      </div>
      <div style={{ fontSize: 16.5, fontWeight: 800, color: colors.text, fontFamily: SF, letterSpacing: "-0.01em" }}>
        The wall is waiting for its first shot
      </div>
      <div style={{ fontSize: 13.5, color: colors.textMuted, marginTop: 5, maxWidth: 360, marginInline: "auto", lineHeight: 1.5 }}>
        Drop the photos and clips you took here. Everyone in the room can grab them — and tag you for the shot.
      </div>
      {canUpload && (
        <button onClick={onAdd} style={{ ...primaryBtn, margin: "18px auto 0" }}>
          <Plus size={16} strokeWidth={2.6} /> Add the first one
        </button>
      )}
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────
function Lightbox({ it, canDownload, busy, onClose, onDownload, onDelete }) {
  const video = isVideo(it);
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(8,6,10,0.86)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <button onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 18, right: 18, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.14)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <X size={20} />
      </button>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(92vw, 860px)", maxHeight: "86vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {video ? (
          <video ref={mutedAutoplay} src={it.url} controls autoPlay loop playsInline style={{ maxWidth: "100%", maxHeight: "72vh", borderRadius: 14, background: "#000" }} />
        ) : (
          <img src={it.displayUrl || it.url} alt={it.caption || ""} style={{ maxWidth: "100%", maxHeight: "72vh", borderRadius: 14, objectFit: "contain" }} />
        )}
        <div style={{ width: "100%", marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            {it.caption && <div style={{ color: "#fff", fontSize: 14.5, fontWeight: 600, fontFamily: SF, marginBottom: 6, lineHeight: 1.35 }}>{it.caption}</div>}
            <div style={{ position: "relative" }}><Credit it={it} big /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {it.downloads > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.7)", fontSize: 12.5, fontWeight: 600, fontFamily: SF }}>
                <Download size={13} /> {it.downloads}
              </span>
            )}
            {onDelete && (
              <button onClick={onDelete} style={{ ...ghostBtn, color: "#fff", borderColor: "rgba(255,255,255,0.25)", background: "transparent" }}>
                <Trash2 size={15} /> Remove
              </button>
            )}
            {canDownload && (
              <button onClick={onDownload} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}>
                {busy ? <Loader2 size={16} className="spin" /> : <Download size={16} strokeWidth={2.4} />} Download
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Upload modal: pick MANY → preview grid → one consent → share all ────
function UploadModal({ eventId, meName, onClose, onUploaded }) {
  const fileRef = useRef(null);
  const [picks, setPicks] = useState([]); // [{ id, file, url, isVid }]
  const [caption, setCaption] = useState(""); // only used when a single file
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState(null);

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const valid = incoming.filter((f) => /^image\//.test(f.type) || /^video\//.test(f.type));
    if (valid.length < incoming.length) setError("Skipped a file that wasn't a photo or video.");
    else setError(null);
    setPicks((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const next = [...prev];
      for (const f of valid) {
        const id = `${f.name}-${f.size}-${f.lastModified}`;
        if (seen.has(id)) continue;
        seen.add(id);
        next.push({ id, file: f, url: URL.createObjectURL(f), isVid: f.type.startsWith("video/") });
      }
      return next;
    });
  }

  function remove(id) {
    setPicks((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  // Upload one pick end-to-end (dims → sign → original bytes → compressed
  // display copy → row). Returns the created wall item, or throws.
  async function uploadOne(p) {
    const dims = await readDimensions(p.file);
    const sr = await authenticatedFetch(`/events/${eventId}/room-content/sign`, {
      method: "POST",
      body: JSON.stringify({ filename: p.file.name, contentType: p.file.type, size: p.file.size }),
    });
    const sd = await sr.json().catch(() => ({}));
    if (!sr.ok || !sd.ok) throw new Error(sd.reason === "too_large" ? "over 200MB" : "sign failed");
    const up = await supabase.storage.from("event-images").uploadToSignedUrl(sd.path, sd.token, p.file);
    if (up.error) throw new Error("upload failed");
    // Best-effort compressed copy for fast on-screen rendering. The original
    // above is untouched (it's the download source); if any of this fails the
    // wall simply falls back to showing the original.
    let displayUrl = null, displayPath = null;
    try {
      const disp = await makeDisplayBlob(p.file);
      if (disp) {
        const dsr = await authenticatedFetch(`/events/${eventId}/room-content/sign`, {
          method: "POST",
          body: JSON.stringify({ filename: "display.jpg", contentType: "image/jpeg", size: disp.size }),
        });
        const dsd = await dsr.json().catch(() => ({}));
        if (dsr.ok && dsd.ok) {
          const dup = await supabase.storage.from("event-images").uploadToSignedUrl(dsd.path, dsd.token, disp);
          if (!dup.error) { displayUrl = dsd.url; displayPath = dsd.path; }
        }
      }
    } catch { /* display copy is optional */ }
    const cr = await authenticatedFetch(`/events/${eventId}/room-content`, {
      method: "POST",
      body: JSON.stringify({ url: sd.url, path: sd.path, displayUrl, displayPath, type: sd.type, mime: p.file.type, caption: picks.length === 1 ? (caption.trim() || null) : null, width: dims.width, height: dims.height, consent: true }),
    });
    const cd = await cr.json().catch(() => ({}));
    if (!cr.ok || !cd.ok) throw new Error("post failed");
    return cd.item;
  }

  async function share() {
    if (!picks.length || !consent || busy) return;
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: picks.length });
    const made = [];
    const failedPicks = [];
    let done = 0;
    for (const p of picks) {
      try {
        made.push(await uploadOne(p));
        URL.revokeObjectURL(p.url); // success — free the preview blob
      } catch { failedPicks.push(p); }
      done += 1;
      setProgress({ done, total: picks.length });
    }
    if (made.length) onUploaded(made); // prepend the batch (in order, newest first)
    if (failedPicks.length) {
      // Keep ONLY the failures on screen so it's one tap to retry just those.
      setError(`${made.length} added · ${failedPicks.length} couldn't upload. Try ${failedPicks.length > 1 ? "those" : "that one"} again.`);
      setPicks(failedPicks);
      setBusy(false);
    } else {
      onClose();
    }
  }

  const n = picks.length;

  return (
    <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(8,6,10,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "88vh", display: "flex", flexDirection: "column", background: colors.background, borderRadius: 20, border: `1px solid ${colors.border}`, boxShadow: "0 24px 70px rgba(10,10,10,0.3)", overflow: "hidden", fontFamily: SF }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${colors.borderFaint}`, flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: colors.text, letterSpacing: "-0.01em" }}>
            Add to the wall{n > 0 ? ` · ${n}` : ""}
          </div>
          <button onClick={busy ? undefined : onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: colors.surfaceMuted, color: colors.textMuted, display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: "auto" }}>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

          {n === 0 ? (
            <button
              onClick={() => fileRef.current?.click()}
              style={{ width: "100%", border: `1.5px dashed ${colors.border}`, borderRadius: 14, padding: "34px 16px", background: colors.surface, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
            >
              <div style={{ width: 46, height: 46, borderRadius: 14, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Camera size={22} color={colors.accent} strokeWidth={2} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>Choose photos or videos</div>
              <div style={{ fontSize: 12, color: colors.textSubtle }}>Pick as many as you like · up to 200MB each</div>
            </button>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {picks.map((p) => (
                <div key={p.id} style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "1", background: colors.surfaceMuted, border: `1px solid ${colors.borderFaint}` }}>
                  {p.isVid
                    ? <video ref={mutedAutoplay} src={p.url} muted loop autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  {p.isVid && <div style={{ position: "absolute", bottom: 6, left: 6, fontSize: 9, fontWeight: 800, color: "#fff", background: "rgba(0,0,0,0.5)", borderRadius: 5, padding: "1px 5px" }}>VIDEO</div>}
                  {!busy && (
                    <button onClick={() => remove(p.id)} aria-label="Remove" style={{ position: "absolute", top: 5, right: 5, width: 22, height: 22, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
              {!busy && (
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ aspectRatio: "1", borderRadius: 12, border: `1.5px dashed ${colors.border}`, background: colors.surface, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: colors.textMuted }}
                >
                  <Plus size={20} strokeWidth={2.4} />
                  <span style={{ fontSize: 11, fontWeight: 650 }}>Add more</span>
                </button>
              )}
            </div>
          )}

          {n > 0 && (
            <>
              {n === 1 && (
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a caption (optional)"
                  maxLength={280}
                  style={{ width: "100%", marginTop: 14, padding: "11px 13px", borderRadius: 12, border: `1px solid ${colors.border}`, fontSize: 14, fontFamily: SF, color: colors.text, boxSizing: "border-box", outline: "none" }}
                />
              )}
              <div style={{ fontSize: 11.5, color: colors.textSubtle, marginTop: 10 }}>
                Shared as <strong style={{ color: colors.textMuted }}>{firstName(meName)}</strong> — your name & Instagram ride along so people can tag you.
              </div>

              {/* THE CONSENT GATE — one tick covers the whole batch */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 14, padding: "12px 13px", borderRadius: 12, background: consent ? colors.accentSoft : colors.surface, border: `1px solid ${consent ? colors.accentBorder : colors.border}`, cursor: "pointer", transition: "background 0.15s ease" }}>
                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, marginTop: 1, border: `2px solid ${consent ? colors.accent : colors.borderStrong}`, background: consent ? colors.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {consent && <Check size={13} color="#fff" strokeWidth={3} />}
                </span>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
                <span style={{ fontSize: 12.5, color: colors.text, lineHeight: 1.45 }}>
                  I agree that <strong>everyone in this room can use {n > 1 ? "these" : "this"} for commercial purposes</strong> — repost {n > 1 ? "them" : "it"}, print {n > 1 ? "them" : "it"}, put {n > 1 ? "them" : "it"} in their work. Credit comes back to me.
                </span>
              </label>

              {error && <div style={{ fontSize: 12.5, color: colors.danger, marginTop: 10 }}>{error}</div>}

              <button
                onClick={share}
                disabled={!consent || busy}
                style={{ width: "100%", marginTop: 14, padding: "12px", borderRadius: 999, border: "none", fontSize: 14.5, fontWeight: 750, fontFamily: SF, cursor: consent && !busy ? "pointer" : "default", background: consent ? colors.accent : colors.surfaceMuted, color: consent ? "#fff" : colors.textFaded, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: consent ? colors.accentShadow : "none" }}
              >
                {busy ? <Loader2 size={16} className="spin" /> : <Plus size={16} strokeWidth={2.6} />}
                {busy ? `Sharing ${progress.done} of ${progress.total}…` : `Share ${n > 1 ? `${n} ` : ""}to the wall`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── shared button styles ──
const primaryBtn = {
  display: "inline-flex", alignItems: "center", gap: 7, border: "none", borderRadius: 999,
  padding: "9px 16px", fontSize: 13.5, fontWeight: 750, fontFamily: SF, cursor: "pointer",
  background: colors.accent, color: "#fff", boxShadow: colors.accentShadow,
};
const ghostBtn = {
  display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999,
  padding: "8px 13px", fontSize: 13, fontWeight: 650, fontFamily: SF, cursor: "pointer",
  background: colors.background, color: colors.text, border: `1px solid ${colors.border}`,
};
// Solid dark "Download all" — the loud, obvious verb. Kept distinct from the
// pink "Add yours" so the two actions never read as the same button.
const darkBtn = {
  display: "inline-flex", alignItems: "center", gap: 7, border: "none", borderRadius: 999,
  padding: "9px 16px", fontSize: 13.5, fontWeight: 750, fontFamily: SF, cursor: "pointer",
  background: colors.text, color: "#fff", boxShadow: "0 6px 18px rgba(10,10,10,0.18)",
};
