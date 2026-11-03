import { useRef, useState } from "react";
import { ImagePlus, Play, Trash2 } from "lucide-react";
import {
  deleteEventMedia, generateVideoThumbnail, processImageForUpload, reorderEventMedia,
  setCoverMedia, uploadEventMediaDirect, validateMediaFile,
} from "../lib/imageUtils.js";
import { Field, Toggle } from "./editorUi.jsx";
import { colors } from "./editorStyles.js";

/* The cover: one image, a carousel (up to 10 images/gifs) or one video —
   the old editor's step 1. Files go straight to Storage (signed URL), get a
   row in event_media, and show in the preview as they land. The first item is
   the cover. Carousel: autoscroll, interval, loop, a transition per gap.
   Video: autoplay, loop, sound. */

const MAX_IMAGES = 10;
const TRANSITIONS = [["slide", "Glid"], ["fade", "Tona"], ["zoom", "Zoom"], ["pixelate", "Pixel"]];

const FORMATS = [["", "Original"], ["4:5", "4:5"], ["1:1", "1:1"], ["9:16", "9:16"], ["16:9", "16:9"]];
const FOCUS = [0, 50, 100];

// stage: the design stage, where media is dropped on the page itself — no
// drop zone here, and nothing at all until there's media to adjust.
export function CoverPanel({ draft, setMedia, update, toast, filesRef, stage = false }) {
  const media = draft.media || [];
  const ms = draft.mediaSettings || {};
  const [busy, setBusy] = useState({}); // localId → percent
  const [over, setOver] = useState(false);
  const [dragFrom, setDragFrom] = useState(null);
  const inputRef = useRef(null);
  const isVideo = media.some((m) => m.mediaType === "video");
  const setMs = (patch) => update({ mediaSettings: { ...ms, ...patch } });

  const addFiles = async (fileList) => {
    let position = media.length;
    for (const raw of Array.from(fileList || [])) {
      const v = validateMediaFile(raw);
      if (!v.valid) { toast(v.error); continue; }
      const video = v.mediaType === "video";
      if (video && (media.length || position > media.length)) { toast("En video åt gången. Ta bort det som finns först."); continue; }
      if (!video && isVideo) { toast("Ta bort videon först för att lägga till bilder."); continue; }
      if (!video && position >= MAX_IMAGES) { toast(`Max ${MAX_IMAGES} bilder.`); continue; }
      const file = video && raw.type === "video/quicktime" ? new File([raw], raw.name.replace(/\.mov$/i, ".mp4"), { type: "video/mp4" }) : raw;
      const localId = `l${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      const pos = position;
      position += 1;
      setBusy((b) => ({ ...b, [localId]: 1 }));
      try {
        let upload = file;
        let thumbnailBlob = null;
        if (v.mediaType === "image") {
          const p = await processImageForUpload(file);
          upload = new File([p.blob], file.name.replace(/\.[a-z0-9]+$/i, "") + (p.mimeType === "image/webp" ? ".webp" : ".jpg"), { type: p.mimeType });
        } else if (video) {
          thumbnailBlob = await generateVideoThumbnail(file).catch(() => null);
        }
        const row = await uploadEventMediaDirect({
          eventId: draft.id,
          file: upload,
          mediaType: v.mediaType,
          position: pos,
          thumbnailBlob,
          onProgress: (pct) => setBusy((b) => ({ ...b, [localId]: Math.max(b[localId] || 0, Math.round(pct)) })),
        });
        setMedia((list) => [...list, row].sort((a, b) => a.position - b.position));
        if (video) setMs({ mode: "video", autoplay: ms.autoplay ?? true, loop: ms.loop ?? true, audio: ms.audio ?? false });
      } catch (err) {
        toast(err?.message || "Uppladdningen misslyckades.");
      } finally {
        setBusy((b) => { const n = { ...b }; delete n[localId]; return n; });
      }
    }
  };
  if (filesRef) filesRef.current = addFiles; // the preview's empty cover is a drop zone too

  const reorder = async (from, to) => {
    if (to < 0 || to >= media.length || from === to) return;
    const next = [...media];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    const ordered = next.map((x, i) => ({ ...x, position: i, isCover: i === 0 }));
    setMedia(ordered);
    update({ imageUrl: ordered[0] ? (ordered[0].mediaType === "video" ? ordered[0].thumbnailUrl || null : ordered[0].url) : null });
    try {
      await reorderEventMedia(draft.id, ordered.map((x) => ({ id: x.id, position: x.position })));
      if (ordered[0] && ordered[0].id !== media[0]?.id) await setCoverMedia(draft.id, ordered[0].id);
    } catch { toast("Kunde inte spara ordningen."); }
  };

  // Gone from the page at once: the list, and the cover the preview falls
  // back on (the event's stored cover) follows the new first item, or none.
  const remove = async (m) => {
    const rest = media.filter((x) => x.id !== m.id).map((x, i) => ({ ...x, position: i, isCover: i === 0 }));
    setMedia(rest);
    const first = rest[0];
    update({ imageUrl: first ? (first.mediaType === "video" ? first.thumbnailUrl || null : first.url) : null });
    if (!rest.length && ms.mode === "video") setMs({ mode: null });
    try { await deleteEventMedia(draft.id, m.id); } catch { toast("Kunde inte ta bort filen."); }
  };

  const images = media.filter((m) => m.mediaType !== "video");
  const pending = Object.values(busy);
  const fileInput = <input ref={inputRef} type="file" hidden multiple accept="image/*,video/mp4,video/quicktime,video/webm" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />;
  if (stage && !media.length && !pending.length) return fileInput;
  return (
    <div className={`ee-panel${stage ? " cp-stage" : ""}`}>
      {stage && <p className="cp-stage-head">Justera media</p>}
      {stage ? fileInput : <div
        className={`cp-drop${over ? " is-over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
      >
        <ImagePlus size={22} />
        <b>{media.length ? "Lägg till fler" : "Lägg till bild, gif eller video"}</b>
        <span>Släpp filer här eller klicka. En bild, en karusell på upp till {MAX_IMAGES}, eller en video.</span>
        {fileInput}
      </div>}

      {(media.length > 0 || pending.length > 0) && (
        <div className="cp-grid">
          {media.map((m, i) => (
            <div
              key={m.id}
              className="cp-item"
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) reorder(dragFrom, i); setDragFrom(null); }}
            >
              {m.mediaType === "video"
                ? (m.thumbnailUrl ? <img src={m.thumbnailUrl} alt="" /> : <video src={m.url} muted />)
                : <img src={m.url} alt="" />}
              {m.mediaType === "video" && <span className="cp-badge"><Play size={11} /> Video</span>}
              {m.mediaType === "gif" && <span className="cp-badge">GIF</span>}
              {i === 0 && <span className="cp-cover">Omslag</span>}
              <div className="cp-actions">
                <button type="button" disabled={i === 0} onClick={() => reorder(i, i - 1)} aria-label="Flytta vänster">&#9664;</button>
                <button type="button" disabled={i === media.length - 1} onClick={() => reorder(i, i + 1)} aria-label="Flytta höger">&#9654;</button>
                <button type="button" onClick={() => remove(m)} aria-label="Ta bort"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
          {pending.map((pct, i) => (
            <div key={`p${i}`} className="cp-item is-pending">
              <span>{pct}%</span>
              <i style={{ width: `${pct}%` }} />
            </div>
          ))}
          {stage && !isVideo && images.length < MAX_IMAGES && (
            <button type="button" className="cp-item cp-more" onClick={() => inputRef.current?.click()}><ImagePlus size={18} /><span>Lägg till</span></button>
          )}
        </div>
      )}

      {media.length > 0 && (
        <div className="ee-panel cp-settings">
          <p className="ee-section-title">Format</p>
          <div className="cp-seg" role="radiogroup" aria-label="Format">
            {FORMATS.map(([k, l]) => (
              <button key={l} type="button" role="radio" aria-checked={(ms.ratio || "") === k} className={(ms.ratio || "") === k ? "is-on" : ""} onClick={() => setMs({ ratio: k || null })}>
                {k && <i style={{ aspectRatio: k.replace(":", "/") }} />}{l}
              </button>
            ))}
          </div>
          {ms.ratio ? (
            <div className="cp-focus-row">
              <span>Fokus</span>
              <div className="cp-focus" role="radiogroup" aria-label="Fokus">
                {FOCUS.map((y) => FOCUS.map((x) => {
                  const on = (ms.focusX ?? 50) === x && (ms.focusY ?? 50) === y;
                  return <button key={`${x}-${y}`} type="button" role="radio" aria-checked={on} className={on ? "is-on" : ""} onClick={() => setMs({ focusX: x, focusY: y })} aria-label={`Fokus ${x}% ${y}%`} />;
                }))}
              </div>
              <small>Vilken del av bilden som syns när formatet beskär.</small>
            </div>
          ) : <p className="cp-note">Original visar hela bilden i sitt eget format.</p>}
        </div>
      )}

      {isVideo && (
        <div className="ee-panel cp-settings">
          <p className="ee-section-title">Video</p>
          <Toggle on={ms.autoplay !== false} onChange={(v) => setMs({ mode: "video", autoplay: v })} label="Spela automatiskt" />
          <Toggle on={ms.loop !== false} onChange={(v) => setMs({ mode: "video", loop: v })} label="Loopa" />
          <Toggle on={!!ms.audio} onChange={(v) => setMs({ mode: "video", audio: v })} label="Ljud på" hint="De flesta webbläsare startar bara video automatiskt utan ljud." />
        </div>
      )}

      {images.length > 1 && (
        <div className="ee-panel cp-settings">
          <p className="ee-section-title">Karusell</p>
          <Toggle on={ms.autoscroll !== false} onChange={(v) => setMs({ mode: "carousel", autoscroll: v })} label="Bläddra automatiskt" />
          {ms.autoscroll !== false && (
            <Field label={`Tid per bild · ${ms.interval || 5} s`}>
              <input type="range" min="2" max="10" step="1" value={ms.interval || 5} onChange={(e) => setMs({ mode: "carousel", interval: Number(e.target.value) })} style={{ padding: 0, background: "none", border: 0, accentColor: colors.text }} />
            </Field>
          )}
          <Toggle on={ms.loop !== false} onChange={(v) => setMs({ mode: "carousel", loop: v })} label="Börja om efter sista bilden" />
          <div className="ee-field">
            <span>Övergångar</span>
            {images.slice(1).map((_, gap) => (
              <div key={gap} className="ee-row">
                <span>{gap + 1} → {gap + 2}</span>
                <select className="ee-input" value={(ms.transitions || [])[gap] || "slide"} onChange={(e) => {
                  const t = [...(ms.transitions || [])];
                  while (t.length < images.length - 1) t.push("slide");
                  t[gap] = e.target.value;
                  setMs({ mode: "carousel", transitions: t.slice(0, images.length - 1) });
                }}>
                  {TRANSITIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      <style>{COVER_CSS}</style>
    </div>
  );
}

const COVER_CSS = `
  .cp-drop { display: grid; justify-items: center; gap: 6px; padding: 22px 16px; border: 1.5px dashed ${colors.borderStrong}; border-radius: 14px; background: ${colors.surfaceMuted}; cursor: pointer; text-align: center; color: ${colors.text}; transition: background 0.15s ease, border-color 0.15s ease; }
  .cp-drop.is-over { background: #fff; border-color: ${colors.text}; }
  .cp-drop b { font-size: 14px; }
  .cp-drop span { font-size: 12px; color: ${colors.textSubtle}; line-height: 1.45; max-width: 300px; }
  .cp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .cp-item { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: ${colors.surfaceMuted}; border: 1px solid ${colors.border}; cursor: grab; }
  .cp-item img, .cp-item video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cp-item.is-pending { display: grid; place-items: center; cursor: default; font-size: 12px; font-weight: 700; color: ${colors.textSubtle}; }
  .cp-item.is-pending i { position: absolute; left: 0; bottom: 0; height: 3px; background: ${colors.text}; transition: width 0.2s ease; }
  .cp-badge, .cp-cover { position: absolute; top: 6px; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; display: inline-flex; align-items: center; gap: 3px; }
  .cp-badge { right: 6px; background: rgba(0,0,0,0.65); color: #fff; }
  .cp-cover { left: 6px; background: #fff; color: #0a0a0a; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
  .cp-actions { position: absolute; inset: auto 0 0 0; display: flex; justify-content: center; gap: 2px; padding: 4px; background: linear-gradient(transparent, rgba(0,0,0,0.6)); opacity: 0; transition: opacity 0.15s ease; }
  .cp-item:hover .cp-actions { opacity: 1; }
  .cp-actions button { display: grid; place-items: center; width: 26px; height: 22px; border: 0; border-radius: 6px; background: rgba(255,255,255,0.9); color: #0a0a0a; cursor: pointer; font-size: 10px; }
  .cp-actions button:disabled { opacity: 0.35; cursor: default; }
  .cp-settings { padding: 12px 14px; border: 1px solid ${colors.border}; border-radius: 12px; background: #fff; }
  .cp-more { all: unset; box-sizing: border-box; position: relative; aspect-ratio: 1; display: grid; place-items: center; align-content: center; gap: 4px; border: 1.5px dashed ${colors.borderStrong}; border-radius: 8px; color: ${colors.textSubtle}; font-size: 11px; font-weight: 600; cursor: pointer; }
  .cp-more:hover { border-color: #ec178f; color: #0a0a0a; }
  .cp-seg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; padding: 3px; border: 1px solid #b9b8b3; border-radius: 7px; background: linear-gradient(180deg, #efeee9, #e1e0db); }
  .cp-seg button { display: grid; justify-items: center; align-content: center; gap: 3px; height: 46px; border: 0; border-radius: 5px; background: none; cursor: pointer; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #4a4945; }
  .cp-seg button i { display: block; height: 16px; max-width: 26px; border: 1.5px solid currentColor; border-radius: 2px; }
  .cp-seg button.is-on { background: #0d0d0d; color: #f2f1ec; }
  .cp-focus-row { display: grid; grid-template-columns: auto auto 1fr; align-items: center; gap: 10px; }
  .cp-focus-row > span { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #4a4945; }
  .cp-focus-row small { font-size: 11.5px; color: ${colors.textSubtle}; line-height: 1.35; }
  .cp-focus { display: grid; grid-template-columns: repeat(3, 16px); gap: 3px; padding: 4px; border: 1px solid #b9b8b3; border-radius: 6px; background: #fbfaf7; }
  .cp-focus button { width: 16px; height: 16px; border: 1px solid #c9c8c3; border-radius: 3px; background: #fff; cursor: pointer; padding: 0; }
  .cp-focus button.is-on { background: #ec178f; border-color: #b80f6f; box-shadow: 0 0 5px rgba(236,23,143,.6); }
  .cp-note { margin: 0; font-size: 12px; color: ${colors.textSubtle}; }
  .cp-stage-head { margin: -12px -12px 2px; padding: 8px 12px; background: linear-gradient(180deg, #ecebe6, #d9d8d3); border-bottom: 1px solid #9b9a95; border-radius: 10px 10px 0 0; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #3a3935; }
  .cp-stage { position: absolute; z-index: 5; left: 18px; top: 74px; width: 300px; max-height: calc(100% - 96px); overflow-y: auto; padding: 12px; background: #fff; border: 1px solid #9b9a95; border-radius: 10px; box-shadow: 4px 4px 0 rgba(0,0,0,.08), 0 20px 50px -24px rgba(0,0,0,.35); animation: cp-in .3s ease both; }
  @keyframes cp-in { from { opacity: 0; transform: translateX(-8px); } }
  @media (max-width: 1100px) { .cp-stage { position: static; width: auto; max-height: none; margin: 12px; } }
`;
