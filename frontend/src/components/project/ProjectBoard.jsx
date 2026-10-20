import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight, BringToFront, CheckSquare, Frame, GripHorizontal, Heading, ImagePlus, Link2,
  Loader2, Maximize, Minus, Plus, StickyNote, Trash2, Type, X,
} from "lucide-react";
import { PLATFORM_LABEL, isUrl, needsResolve, socialEmbed } from "./socialEmbed.js";
import { resolveUrl, uid, uploadProjectMedia, useProjectDoc } from "./projectDoc.js";

/* ════════════════════════════════════════════════════════════════════════
   A project's board: the free-form space a meeting gathers around to develop
   formats. Pan/zoom; headings and body text, stickies, to-do lists,
   references (social links that play in place), uploaded images and video,
   and format frames. A frame IS a content format: its title is the format
   cards carry on the timeline; it shows how many there are and links there.
   Moving a frame carries everything fully inside it.
   Paste a link → reference · paste text → sticky · paste/drop images → media.
   ════════════════════════════════════════════════════════════════════════ */

const HEADER_H = 36;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 2.5;
const STICKY_COLORS = ["#FFE873", "#FFB8D1", "#B8E1FF", "#C2F2C2", "#FFFFFF"];
const TEXT_SIZES = { l: 48, m: 28, s: 17 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isTypingTarget = (el) => el instanceof Element && el.closest("input, textarea, [contenteditable='true']") != null;
const inside = (i, f) => i.x >= f.x && i.y >= f.y && i.x + i.w <= f.x + f.w && i.y + i.h <= f.y + f.h;

export function ProjectBoard({ clientId, formatCounts = {}, focusFormat, onOpenFormat, onRenameFormat, onFramesChange }) {
  const { list: items, listRef: itemsRef, setList: setItems, mutate, phase, status, markDirty, flushSoon } = useProjectDoc(clientId, "board", "items");
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [interacting, setInteracting] = useState(false);
  const [dropping, setDropping] = useState(false);

  const stageRef = useRef(null);
  const viewRef = useRef(view);
  const dragRef = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const fileRef = useRef(null);
  const editTitle = useRef(null); // a frame's title when editing started (for renames)
  useEffect(() => { viewRef.current = view; }, [view]);

  const toastTimer = useRef(null);
  const flash = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2400);
  }, []);

  // The page keeps the list of formats (frame titles) for the timeline picker.
  const frameTitles = items.filter((i) => i.type === "frame").map((i) => String(i.title || "").trim()).filter(Boolean).join("\n");
  useEffect(() => { onFramesChange?.(frameTitles ? frameTitles.split("\n") : []); }, [frameTitles, onFramesChange]);

  const patchItem = useCallback(
    (id, patch) => mutate((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)), { changed: [id] }),
    [mutate],
  );
  const removeItem = useCallback((id) => {
    mutate((list) => list.filter((i) => i.id !== id), { removed: [id] });
    setSelected(null);
    setEditing(null);
  }, [mutate]);

  // ── camera ────────────────────────────────────────────────────────────────
  const screenToWorld = useCallback((sx, sy) => {
    const v = viewRef.current;
    return { x: (sx - v.x) / v.z, y: (sy - v.y) / v.z };
  }, []);
  const zoomAt = useCallback((sx, sy, factor) => {
    setView((v) => {
      const z = clamp(v.z * factor, ZOOM_MIN, ZOOM_MAX);
      const wx = (sx - v.x) / v.z;
      const wy = (sy - v.y) / v.z;
      return { x: sx - wx * z, y: sy - wy * z, z };
    });
  }, []);
  const stageCenter = useCallback(() => {
    const r = stageRef.current?.getBoundingClientRect();
    return r ? { sx: r.width / 2, sy: r.height / 2 } : { sx: 400, sy: 300 };
  }, []);
  const fitTo = useCallback((list, maxZ = 1) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return;
    if (!list.length) {
      setView({ x: r.width / 2, y: r.height / 2, z: r.width < 640 ? 0.7 : 1 });
      return;
    }
    const minX = Math.min(...list.map((i) => i.x));
    const minY = Math.min(...list.map((i) => i.y));
    const maxX = Math.max(...list.map((i) => i.x + i.w));
    const maxY = Math.max(...list.map((i) => i.y + i.h));
    const padX = 60;
    const padTop = 90; // clear of the project bar
    const padBottom = 110; // clear of the toolbar
    const z = clamp(Math.min((r.width - padX * 2) / (maxX - minX), (r.height - padTop - padBottom) / (maxY - minY)), ZOOM_MIN, maxZ);
    setView({ x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: padTop + (r.height - padTop - padBottom - (maxY - minY) * z) / 2 - minY * z, z });
  }, []);

  // Open on the content, or on the format we were sent to.
  const fitted = useRef(false);
  useEffect(() => {
    if (phase !== "ready" || fitted.current) return;
    fitted.current = true;
    const frame = focusFormat && itemsRef.current.find((i) => i.type === "frame" && i.title === focusFormat);
    if (frame) {
      fitTo([frame]);
      setSelected(frame.id);
    } else {
      fitTo(itemsRef.current);
    }
  }, [phase, focusFormat, fitTo, itemsRef]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (isTypingTarget(e.target) && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01));
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, phase]);

  // ── pointer: pan, pinch, drag + resize items ─────────────────────────────
  const onStagePointerDown = (e) => {
    if (e.target !== e.currentTarget && !e.target.classList.contains("pb-world")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(null);
    setEditing(null);
    setLinkOpen(false);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), v: viewRef.current, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      dragRef.current = null;
    } else {
      dragRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, v: viewRef.current };
    }
  };

  const topZ = () => Math.max(0, ...itemsRef.current.map((i) => i.z || 0)) + 1;

  const startItemDrag = (e, item, kind) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const isFrame = item.type === "frame";
    if (!isFrame && (item.z || 0) < topZ() - 1) patchItem(item.id, { z: topZ() });
    setSelected(item.id);
    if (editing !== item.id) setEditing(null);
    const children = isFrame && kind === "move"
      ? itemsRef.current.filter((i) => i.type !== "frame" && inside(i, item)).map((i) => ({ id: i.id, x: i.x, y: i.y }))
      : null;
    dragRef.current = { kind, id: item.id, sx: e.clientX, sy: e.clientY, ox: item.x, oy: item.y, ow: item.w, oh: item.h, moved: false, children };
    setInteracting(true);
  };

  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const z = clamp(p.v.z * (Math.hypot(a.x - b.x, a.y - b.y) / p.d), ZOOM_MIN, ZOOM_MAX);
      const r = stageRef.current.getBoundingClientRect();
      const wx = (p.mx - r.left - p.v.x) / p.v.z;
      const wy = (p.my - r.top - p.v.y) / p.v.z;
      setView({ x: (a.x + b.x) / 2 - r.left - wx * z, y: (a.y + b.y) / 2 - r.top - wy * z, z });
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.kind === "pan") {
      setView({ ...d.v, x: d.v.x + dx, y: d.v.y + dy });
      return;
    }
    const z = viewRef.current.z;
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
    const kids = d.children ? new Map(d.children.map((c) => [c.id, c])) : null;
    setItems(itemsRef.current.map((i) => {
      if (kids?.has(i.id)) {
        const c = kids.get(i.id);
        return { ...i, x: Math.round(c.x + dx / z), y: Math.round(c.y + dy / z) };
      }
      if (i.id !== d.id) return i;
      if (d.kind === "move") return { ...i, x: Math.round(d.ox + dx / z), y: Math.round(d.oy + dy / z) };
      const minW = i.type === "embed" ? 220 : i.type === "frame" ? 260 : 120;
      const minH = i.type === "embed" ? 200 : i.type === "frame" ? 180 : 50;
      if (i.type === "media" && i.ratio) {
        const w = Math.round(Math.max(minW, d.ow + dx / z));
        return { ...i, w, h: Math.round(w / i.ratio) };
      }
      return { ...i, w: Math.round(Math.max(minW, d.ow + dx / z)), h: Math.round(Math.max(minH, d.oh + dy / z)) };
    }));
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = dragRef.current;
    dragRef.current = null;
    setInteracting(false);
    if (d && d.kind !== "pan" && d.moved) {
      markDirty(d.id);
      d.children?.forEach((c) => markDirty(c.id));
      flushSoon();
    }
  };

  // ── creating things ───────────────────────────────────────────────────────
  // New things land in view, in the first free slot right of the centre.
  const spawnPoint = (w, h, at) => {
    if (at) return { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2) };
    const { sx, sy } = stageCenter();
    const c = screenToWorld(sx, sy);
    const gap = 32;
    const hits = (x, y) => itemsRef.current.some((i) => i.type !== "frame" && x < i.x + i.w + gap && x + w + gap > i.x && y < i.y + i.h + gap && y + h + gap > i.y);
    const x0 = Math.round(c.x - w / 2);
    const y0 = Math.round(c.y - h / 2);
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 10; col++) {
        const x = x0 + col * (w + gap);
        const y = y0 + row * (h + gap);
        if (!hits(x, y)) return { x, y };
      }
    }
    return { x: x0, y: y0 };
  };

  const addItem = (item, at) => {
    const full = { id: uid(), z: item.type === "frame" ? 0 : topZ(), ...item, ...spawnPoint(item.w, item.h, at) };
    mutate((list) => [...list, full], { changed: [full.id] });
    setSelected(full.id);
    return full;
  };

  const addText = (size) => {
    const it = addItem({ type: "text", text: "", size, w: size === "l" ? 560 : 420, h: size === "l" ? 70 : 60 });
    setEditing(it.id);
  };
  const addSticky = (text = "") => {
    const it = addItem({ type: "sticky", text, color: STICKY_COLORS[0], w: 220, h: 220 });
    if (!text) setEditing(it.id);
  };
  const addTodo = () => addItem({ type: "todo", title: "Att göra", todos: [{ id: uid(), text: "", done: false }], w: 300, h: 220 });
  const addFrame = () => {
    const it = addItem({ type: "frame", title: "", w: 900, h: 560 });
    editTitle.current = "";
    setEditing(it.id);
  };

  const addLink = async (raw) => {
    let url = String(raw || "").trim();
    if (!isUrl(url)) {
      flash("Det där ser inte ut som en länk.");
      return false;
    }
    setBusy(true);
    if (needsResolve(url)) url = (await resolveUrl(url)) || url;
    setBusy(false);
    const embed = socialEmbed(url);
    if (embed) addItem({ type: "embed", embed, w: embed.w, h: embed.h + HEADER_H });
    else addItem({ type: "embed", embed: { platform: "link", kind: "link", src: null, url }, w: 320, h: 120 + HEADER_H });
    return true;
  };

  const addFiles = async (files, at) => {
    const media = [...files].filter((f) => /^(image|video)\//.test(f.type));
    if (!media.length) return;
    setBusy(true);
    let offset = 0;
    for (const file of media) {
      try {
        const { url, path } = await uploadProjectMedia(file);
        const kind = file.type.startsWith("video/") ? "video" : "image";
        const ratio = await mediaRatio(url, kind);
        const w = 360;
        const point = at ? { x: at.x + offset, y: at.y + offset } : null;
        addItem({ type: "media", kind, url, path, name: file.name, ratio, w, h: Math.round(w / ratio) }, point);
        offset += 40;
      } catch {
        flash(`Kunde inte ladda upp ${file.name}.`);
      }
    }
    setBusy(false);
  };

  // Paste: images upload, a link becomes a reference, text a sticky.
  useEffect(() => {
    if (phase !== "ready") return undefined;
    const onPaste = (e) => {
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) {
        e.preventDefault();
        addFiles(files);
        return;
      }
      const text = e.clipboardData?.getData("text")?.trim();
      if (!text) return;
      e.preventDefault();
      if (isUrl(text)) addLink(text);
      else addSticky(text.slice(0, 2000));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setEditing(null);
        setLinkOpen(false);
        if (!isTypingTarget(e.target)) setSelected(null);
        return;
      }
      if (isTypingTarget(e.target)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        removeItem(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, removeItem]);

  // A frame's title is its format: renaming it renames the format on the timeline.
  const finishEditing = (item) => {
    if (item?.type === "frame") {
      const before = String(editTitle.current ?? "").trim();
      const after = String(item.title || "").trim();
      if (before && after && before !== after) onRenameFormat?.(before, after);
    }
    editTitle.current = null;
  };
  const startEditing = (item) => {
    if (item.type === "frame") editTitle.current = item.title || "";
    setEditing(item.id);
  };
  const editingItem = items.find((i) => i.id === editing);
  const prevEditing = useRef(null);
  useEffect(() => {
    const prev = prevEditing.current;
    if (prev && prev.id !== editing) finishEditing(itemsRef.current.find((i) => i.id === prev.id));
    prevEditing.current = editingItem ? { id: editingItem.id } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // ── render ────────────────────────────────────────────────────────────────
  const sel = items.find((i) => i.id === selected);
  const selScreen = sel && { left: sel.x * view.z + view.x, top: sel.y * view.z + view.y };

  return (
    <div className={`pb${interacting ? " is-interacting" : ""}`}>
      <style>{CSS}</style>
      <div
        ref={stageRef}
        className={`pb-stage${dropping ? " is-dropping" : ""}`}
        onPointerDown={onStagePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDropping(true); } }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          const r = stageRef.current.getBoundingClientRect();
          addFiles(e.dataTransfer.files, screenToWorld(e.clientX - r.left, e.clientY - r.top));
        }}
        style={{ backgroundSize: `${24 * view.z}px ${24 * view.z}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      >
        <div className="pb-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          {items.map((it) => (
            <BoardItem
              key={it.id}
              item={it}
              selected={selected === it.id}
              editing={editing === it.id}
              count={it.type === "frame" ? formatCounts[String(it.title || "").trim()] || 0 : 0}
              onDragStart={startItemDrag}
              onEdit={() => startEditing(it)}
              onStopEdit={() => setEditing(null)}
              onPatch={(patch) => patchItem(it.id, patch)}
              onRemove={() => removeItem(it.id)}
              onOpenFormat={onOpenFormat}
            />
          ))}
        </div>

        {phase === "ready" && items.length === 0 && (
          <div className="pb-empty">
            <p className="pb-empty-h">Tom board.</p>
            <p>Lägg till rubriker, text och todos nedan. Klistra in en länk från Instagram, TikTok eller YouTube så spelas den här, eller dra in bilder och video. Rita en <b>Format</b>-ram runt allt som hör till ett format.</p>
          </div>
        )}
        {phase === "loading" && <div className="pb-empty"><p>Öppnar boarden…</p></div>}
        {phase === "error" && <div className="pb-empty"><p>Kunde inte öppna boarden.</p></div>}
      </div>

      {sel && selScreen && editing !== sel.id && (
        <div className="pb-selbar" style={{ left: Math.max(8, selScreen.left), top: Math.max(70, selScreen.top - 50) }}>
          {sel.type === "sticky" && STICKY_COLORS.map((c) => (
            <button key={c} type="button" className={`pb-swatch${sel.color === c ? " is-on" : ""}`} style={{ background: c }} onClick={() => patchItem(sel.id, { color: c })} aria-label="Färg" />
          ))}
          {sel.type === "text" && [["l", "Rubrik"], ["m", "Underrubrik"], ["s", "Brödtext"]].map(([k, label]) => (
            <button key={k} type="button" className={`pb-size${(sel.size || "m") === k ? " is-on" : ""}`} onClick={() => patchItem(sel.id, { size: k })}>{label}</button>
          ))}
          {(sel.type === "sticky" || sel.type === "text") && <span className="pb-sep" />}
          {sel.type !== "frame" && (
            <button type="button" className="pb-icon" onClick={() => patchItem(sel.id, { z: topZ() })} aria-label="Lägg överst" title="Lägg överst"><BringToFront size={16} /></button>
          )}
          <button type="button" className="pb-icon pb-danger" onClick={() => removeItem(sel.id)} aria-label="Ta bort" title="Ta bort"><Trash2 size={16} /></button>
        </div>
      )}

      {phase === "ready" && (
        <div className="pb-tools" onPointerDown={(e) => e.stopPropagation()}>
          {linkOpen ? (
            <form
              className="pb-linkform"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await addLink(linkDraft)) {
                  setLinkDraft("");
                  setLinkOpen(false);
                }
              }}
            >
              <Link2 size={16} />
              <input autoFocus value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="Klistra in en länk (Instagram, TikTok, YouTube…)" inputMode="url" />
              <button type="submit" className="pb-tool-primary" disabled={busy}>{busy ? "Lägger till…" : "Lägg till"}</button>
              <button type="button" className="pb-icon" onClick={() => setLinkOpen(false)} aria-label="Avbryt"><X size={16} /></button>
            </form>
          ) : (
            <>
              <button type="button" className="pb-tool" onClick={() => addText("l")}><Heading size={17} /> Rubrik</button>
              <button type="button" className="pb-tool" onClick={() => addText("s")}><Type size={17} /> Text</button>
              <button type="button" className="pb-tool" onClick={addTodo}><CheckSquare size={17} /> Todo</button>
              <button type="button" className="pb-tool" onClick={() => addSticky()}><StickyNote size={17} /> Lapp</button>
              <button type="button" className="pb-tool" onClick={() => setLinkOpen(true)}><Link2 size={17} /> Referens</button>
              <button type="button" className="pb-tool" onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? <Loader2 size={17} className="pb-spin" /> : <ImagePlus size={17} />} Bild/video
              </button>
              <span className="pb-tool-sep" />
              <button type="button" className="pb-tool pb-tool-frame" onClick={addFrame}><Frame size={17} /> Format</button>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
      )}

      <div className="pb-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <span className={`pb-status is-${status}`}>{status === "saving" ? "Sparar…" : status === "offline" ? "Offline, försöker igen" : "Sparat"}</span>
        <button type="button" className="pb-icon" onClick={() => { const c = stageCenter(); zoomAt(c.sx, c.sy, 1 / 1.2); }} aria-label="Zooma ut"><Minus size={16} /></button>
        <span>{Math.round(view.z * 100)}%</span>
        <button type="button" className="pb-icon" onClick={() => { const c = stageCenter(); zoomAt(c.sx, c.sy, 1.2); }} aria-label="Zooma in"><Plus size={16} /></button>
        <button type="button" className="pb-icon" onClick={() => fitTo(itemsRef.current)} aria-label="Visa allt" title="Visa allt"><Maximize size={15} /></button>
      </div>

      {toast && <div className="pb-toast" role="status">{toast}</div>}
    </div>
  );
}

function mediaRatio(url, kind) {
  return new Promise((resolve) => {
    const done = (w, h) => resolve(w && h ? w / h : 4 / 5);
    if (kind === "video") {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => done();
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => done();
      img.src = url;
    }
    window.setTimeout(() => done(), 6000);
  });
}

/* ─── one item on the board ─── */
function BoardItem({ item, selected, editing, count, onDragStart, onEdit, onStopEdit, onPatch, onRemove, onOpenFormat }) {
  const style = { left: item.x, top: item.y, width: item.w, height: item.h, zIndex: item.z || 0 };
  const cls = `pb-item pb-${item.type}${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}`;
  const resize = <span className="pb-resize" onPointerDown={(e) => onDragStart(e, item, "resize")} aria-hidden="true" />;
  const stop = (ev) => ev.stopPropagation();

  if (item.type === "frame") {
    const title = String(item.title || "").trim();
    return (
      <div className={cls} style={style}>
        <div className="pb-frame-head" onPointerDown={(ev) => !editing && onDragStart(ev, item, "move")} onDoubleClick={onEdit}>
          <span className="pb-frame-kicker">Format</span>
          {editing ? (
            <input
              autoFocus
              className="pb-frame-input"
              value={item.title || ""}
              placeholder="Namnge formatet"
              onChange={(ev) => onPatch({ title: ev.target.value.slice(0, 80) })}
              onPointerDown={stop}
              onKeyDown={(ev) => ev.key === "Enter" && onStopEdit()}
              onBlur={onStopEdit}
            />
          ) : (
            <span className="pb-frame-title">{title || <span className="pb-placeholder">Dubbelklicka för att namnge</span>}</span>
          )}
          {title && !editing && (
            <button type="button" className={`pb-frame-link${count ? "" : " is-empty"}`} onPointerDown={stop} onClick={() => onOpenFormat?.(title)} title="Visa på tidslinjen">
              {count ? `${count} på tidslinjen` : "Inte på tidslinjen än"} <ArrowUpRight size={14} />
            </button>
          )}
        </div>
        {resize}
      </div>
    );
  }

  if (item.type === "embed") {
    const e = item.embed || {};
    return (
      <div className={cls} style={style}>
        <div className="pb-embed-head" onPointerDown={(ev) => onDragStart(ev, item, "move")}>
          <GripHorizontal size={14} className="pb-grip" />
          <span className="pb-embed-platform">{PLATFORM_LABEL[e.platform] || "Länk"}</span>
          {e.kind && e.platform !== "link" && <span className="pb-embed-kind">{e.kind}</span>}
          <a href={e.url} target="_blank" rel="noreferrer" className="pb-embed-btn pb-push" onPointerDown={stop} aria-label="Öppna original"><ArrowUpRight size={15} /></a>
          <button type="button" className="pb-embed-btn" onPointerDown={stop} onClick={onRemove} aria-label="Ta bort"><X size={15} /></button>
        </div>
        <div className="pb-embed-body">
          {e.src ? (
            <iframe src={e.src} title={`${PLATFORM_LABEL[e.platform] || "Post"}`} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          ) : (
            <a className="pb-linkcard" href={e.url} target="_blank" rel="noreferrer" onPointerDown={stop}>
              <span>{safeHost(e.url)}</span>
              <small>{e.url}</small>
            </a>
          )}
        </div>
        {resize}
      </div>
    );
  }

  if (item.type === "media") {
    return (
      <div className={cls} style={style} onPointerDown={(ev) => onDragStart(ev, item, "move")}>
        {item.kind === "video"
          ? <video src={item.url} controls playsInline preload="metadata" onPointerDown={stop} />
          : <img src={item.url} alt={item.name || ""} draggable={false} />}
        {item.kind === "video" && <div className="pb-media-grip"><GripHorizontal size={14} /></div>}
        {resize}
      </div>
    );
  }

  if (item.type === "todo") {
    const todos = item.todos || [];
    const setTodos = (next) => onPatch({ todos: next });
    const done = todos.filter((t) => t.done && t.text).length;
    const total = todos.filter((t) => t.text).length;
    return (
      <div className={cls} style={style}>
        <div className="pb-todo-head" onPointerDown={(ev) => onDragStart(ev, item, "move")}>
          <input className="pb-todo-title" value={item.title || ""} placeholder="Att göra" onPointerDown={stop} onChange={(ev) => onPatch({ title: ev.target.value.slice(0, 120) })} />
          {total > 0 && <span className="pb-todo-count">{done}/{total}</span>}
        </div>
        <ul className="pb-todo-list" onPointerDown={stop}>
          {todos.map((t, idx) => (
            <li key={t.id} className={t.done ? "is-done" : ""}>
              <input type="checkbox" checked={!!t.done} onChange={() => setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
              <input
                className="pb-todo-text"
                value={t.text}
                placeholder="Skriv en uppgift"
                data-todo={t.id}
                onChange={(ev) => setTodos(todos.map((x) => (x.id === t.id ? { ...x, text: ev.target.value.slice(0, 300) } : x)))}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") {
                    ev.preventDefault();
                    const next = { id: uid(), text: "", done: false };
                    setTodos([...todos.slice(0, idx + 1), next, ...todos.slice(idx + 1)]);
                    window.setTimeout(() => document.querySelector(`[data-todo="${next.id}"]`)?.focus(), 0);
                  } else if (ev.key === "Backspace" && !t.text && todos.length > 1) {
                    ev.preventDefault();
                    const prev = todos[idx - 1];
                    setTodos(todos.filter((x) => x.id !== t.id));
                    if (prev) window.setTimeout(() => document.querySelector(`[data-todo="${prev.id}"]`)?.focus(), 0);
                  }
                }}
              />
            </li>
          ))}
        </ul>
        <button type="button" className="pb-todo-add" onPointerDown={stop} onClick={() => setTodos([...todos, { id: uid(), text: "", done: false }])}><Plus size={13} /> Uppgift</button>
        {resize}
      </div>
    );
  }

  // text + sticky
  const isSticky = item.type === "sticky";
  const size = TEXT_SIZES[item.size || "m"];
  return (
    <div
      className={`${cls}${isSticky ? "" : ` pb-text-${item.size || "m"}`}`}
      style={{ ...style, ...(isSticky ? { background: item.color || STICKY_COLORS[0] } : null) }}
      onPointerDown={(ev) => !editing && onDragStart(ev, item, "move")}
      onDoubleClick={onEdit}
    >
      {editing ? (
        <textarea
          autoFocus
          className="pb-textarea"
          style={isSticky ? null : { fontSize: size }}
          value={item.text || ""}
          onChange={(ev) => {
            const text = ev.target.value.slice(0, 8000);
            onPatch(isSticky ? { text } : { text, h: Math.max(item.h, ev.target.scrollHeight + 4) });
          }}
          onPointerDown={stop}
          onBlur={onStopEdit}
          placeholder={isSticky ? "Anteckning…" : item.size === "l" ? "Rubrik" : "Skriv något"}
        />
      ) : (
        <div className="pb-textview" style={isSticky ? null : { fontSize: size }}>
          {item.text || <span className="pb-placeholder">{isSticky ? "Dubbelklicka för att skriva" : "Dubbelklicka för att skriva"}</span>}
        </div>
      )}
      {resize}
    </div>
  );
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const CSS = `
  .pb { position: absolute; inset: 0; overflow: hidden; background: #f4f4f2; color: #0a0a0a; -webkit-font-smoothing: antialiased; touch-action: none; user-select: none; -webkit-user-select: none; }
  .pb * { box-sizing: border-box; }
  .pb button { font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .pb input, .pb textarea { user-select: text; -webkit-user-select: text; }
  .pb.is-interacting iframe, .pb.is-interacting video { pointer-events: none; }

  .pb-stage { position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(0,0,0,0.13) 1px, transparent 1.2px); cursor: grab; }
  .pb-stage:active { cursor: grabbing; }
  .pb-stage.is-dropping { box-shadow: inset 0 0 0 3px #0a0a0a; }
  .pb-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; width: 1px; height: 1px; }

  .pb-item { position: absolute; }
  .pb-item.is-selected { outline: 2px solid #0a0a0a; outline-offset: 3px; }
  .pb-resize { position: absolute; right: -7px; bottom: -7px; width: 16px; height: 16px; border-radius: 4px; background: #fff; border: 2px solid #0a0a0a; cursor: nwse-resize; opacity: 0; transition: opacity 0.15s ease; }
  .pb-item:hover .pb-resize, .pb-item.is-selected .pb-resize { opacity: 1; }

  .pb-frame { border-radius: 20px; background: rgba(255,255,255,0.6); border: 1.5px dashed rgba(10,10,10,0.25); pointer-events: none; }
  .pb-frame.is-selected { outline: 2px solid #0a0a0a; outline-offset: 3px; }
  .pb-frame-head { pointer-events: auto; position: absolute; left: 0; top: 0; right: 0; height: 74px; display: flex; align-items: center; gap: 12px; padding: 0 22px; cursor: move; border-radius: 20px 20px 0 0; }
  .pb-frame-kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #fff; background: #0a0a0a; padding: 4px 8px; border-radius: 6px; flex: none; }
  .pb-frame-title { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .pb-frame-input { font: inherit; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; flex: 1; min-width: 0; border: 0; outline: none; background: transparent; padding: 0; }
  .pb-frame-link { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 5px; font-size: 14px; font-weight: 600; padding: 7px 12px; border-radius: 999px; border: 0; background: #0a0a0a; color: #fff !important; }
  .pb-frame-link.is-empty { background: rgba(10,10,10,0.08); color: #6e6e73 !important; }
  .pb-frame .pb-resize { pointer-events: auto; }

  .pb-text { cursor: move; }
  .pb-textview { width: 100%; height: 100%; overflow: hidden; white-space: pre-wrap; word-break: break-word; }
  .pb-text-l .pb-textview, .pb-text-l .pb-textarea { font-weight: 700; letter-spacing: -0.03em; line-height: 1.05; }
  .pb-text-m .pb-textview, .pb-text-m .pb-textarea { font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; }
  .pb-text-s .pb-textview, .pb-text-s .pb-textarea { font-weight: 400; line-height: 1.5; }
  .pb-text.is-editing { outline: 2px dashed rgba(0,0,0,0.35); outline-offset: 4px; }
  .pb-sticky { border-radius: 4px; box-shadow: 0 14px 28px -18px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.12); padding: 16px; cursor: move; }
  .pb-sticky .pb-textview, .pb-sticky .pb-textarea { font-size: 18px; line-height: 1.35; font-weight: 500; }
  .pb-placeholder { color: rgba(0,0,0,0.35); font-weight: 400; }
  .pb-textarea { width: 100%; height: 100%; resize: none; border: 0; outline: none; background: transparent !important; padding: 0; font: inherit; color: #0a0a0a; }

  .pb-todo { background: #fff; border-radius: 14px; box-shadow: 0 12px 34px -18px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08); display: flex; flex-direction: column; overflow: hidden; }
  .pb-todo-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 6px; cursor: move; }
  .pb-todo-title { font: inherit; font-size: 17px; font-weight: 700; border: 0; outline: none; background: transparent; flex: 1; min-width: 0; padding: 0; cursor: text; }
  .pb-todo-count { font-size: 12px; font-weight: 600; color: #6e6e73; }
  .pb-todo-list { list-style: none; margin: 0; padding: 0 14px; display: grid; gap: 2px; overflow-y: auto; flex: 1; min-height: 0; align-content: start; }
  .pb-todo-list li { display: flex; align-items: center; gap: 9px; }
  .pb-todo-list input[type=checkbox] { width: 16px; height: 16px; accent-color: #0a0a0a; flex: none; cursor: pointer; }
  .pb-todo-text { font: inherit; font-size: 14.5px; border: 0; outline: none; background: transparent; flex: 1; min-width: 0; padding: 5px 0; }
  .pb-todo-list li.is-done .pb-todo-text { text-decoration: line-through; color: #8e8e93; }
  .pb-todo-add { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; margin: 4px 10px 10px; padding: 5px 8px; border: 0; border-radius: 8px; background: transparent; font-size: 12.5px !important; color: #6e6e73 !important; }
  .pb-todo-add:hover { background: rgba(0,0,0,0.05); }

  .pb-media { border-radius: 10px; overflow: hidden; background: #e8e8e6; box-shadow: 0 12px 34px -18px rgba(0,0,0,0.4); cursor: move; }
  .pb-media img, .pb-media video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pb-media-grip { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); padding: 2px 10px; border-radius: 999px; background: rgba(0,0,0,0.5); color: #fff; display: flex; }

  .pb-embed { display: flex; flex-direction: column; background: #fff; border-radius: 14px; box-shadow: 0 12px 34px -16px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08); overflow: hidden; }
  .pb-embed-head { height: ${HEADER_H}px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 6px 0 10px; border-bottom: 1px solid rgba(0,0,0,0.08); cursor: grab; }
  .pb-grip { color: #9a9a9a; flex: none; }
  .pb-embed-platform { font-size: 13px; font-weight: 600; }
  .pb-embed-kind { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #8a8a8a; }
  .pb-embed-btn { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 7px; color: #555; border: 0; background: transparent; }
  .pb-push { margin-left: auto; }
  .pb-embed-btn:hover { background: rgba(0,0,0,0.06); color: #000; }
  .pb-embed-body { flex: 1; min-height: 0; overflow: hidden; background: #fafafa; }
  .pb-embed-body iframe { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
  .pb-linkcard { height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 18px; color: #000; text-decoration: none; }
  .pb-linkcard span { font-size: 18px; font-weight: 600; }
  .pb-linkcard small { font-size: 12px; color: #8a8a8a; word-break: break-all; }

  .pb-selbar { position: absolute; z-index: 25; display: flex; align-items: center; gap: 4px; padding: 4px; background: #fff; border-radius: 12px; box-shadow: 0 10px 30px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08); }
  .pb-swatch { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.18); margin: 0 2px; }
  .pb-swatch.is-on { outline: 2px solid #000; outline-offset: 2px; }
  .pb-size { height: 30px; padding: 0 10px; border-radius: 8px; border: 0; background: transparent; font-size: 12.5px; font-weight: 600; }
  .pb-size.is-on { background: #0a0a0a; color: #fff !important; }
  .pb-sep { width: 1px; height: 22px; background: rgba(0,0,0,0.12); margin: 0 4px; }
  .pb-icon { width: 32px; height: 32px; display: grid; place-items: center; border: 0; background: transparent; border-radius: 9px; flex: none; }
  .pb-icon:hover { background: rgba(0,0,0,0.06); }
  .pb-danger:hover { color: #b42318; }

  .pb-tools { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 30; display: flex; align-items: center; gap: 2px; padding: 6px; border-radius: 16px; background: #0a0a0a; color: #fff; box-shadow: 0 16px 40px -16px rgba(0,0,0,0.5); max-width: calc(100vw - 24px); overflow-x: auto; scrollbar-width: none; }
  .pb-tool { display: inline-flex; align-items: center; gap: 7px; height: 42px; padding: 0 13px; border: 0; border-radius: 11px; background: transparent; color: #fff !important; font-size: 14px; font-weight: 500; white-space: nowrap; }
  .pb-tool:hover { background: rgba(255,255,255,0.12); }
  .pb-tool-frame { background: #fff; color: #0a0a0a !important; font-weight: 700; }
  .pb-tool-frame:hover { background: #e9e9e9; }
  .pb-tool-sep { width: 1px; height: 24px; background: rgba(255,255,255,0.2); margin: 0 4px; flex: none; }
  .pb-spin { animation: pb-spin 0.9s linear infinite; }
  @keyframes pb-spin { to { transform: rotate(360deg); } }
  .pb-linkform { display: flex; align-items: center; gap: 8px; padding-left: 10px; width: min(560px, calc(100vw - 36px)); }
  .pb-linkform input { flex: 1; min-width: 0; height: 40px; border: 0; outline: none; border-radius: 9px; padding: 0 12px; font: inherit; font-size: 15px; background: #fff; color: #000; }
  .pb-tool-primary { height: 40px; padding: 0 16px; border: 0; border-radius: 9px; background: #fff; color: #000 !important; font-weight: 600; white-space: nowrap; }
  .pb-linkform .pb-icon:hover { background: rgba(255,255,255,0.12); }

  .pb-zoom { position: absolute; right: 14px; bottom: 22px; z-index: 20; display: flex; align-items: center; gap: 2px; padding: 4px 6px; border-radius: 12px; background: #fff; border: 1px solid rgba(0,0,0,0.08); font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .pb-zoom > span:not(.pb-status) { min-width: 40px; text-align: center; }
  .pb-status { font-size: 12px; color: #16a34a; margin-right: 6px; white-space: nowrap; }
  .pb-status.is-saving { color: #8a8a8a; }
  .pb-status.is-offline { color: #b42318; }

  .pb-empty { position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%); text-align: center; width: min(480px, calc(100vw - 48px)); color: #6b6b6b; font-size: 15px; line-height: 1.55; pointer-events: none; }
  .pb-empty-h { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; color: #0a0a0a; margin: 0 0 8px; }
  .pb-empty p { margin: 0; }
  .pb-toast { position: absolute; left: 50%; top: 80px; transform: translateX(-50%); z-index: 40; padding: 9px 14px; border-radius: 999px; background: #0a0a0a; color: #fff; font-size: 13px; font-weight: 500; white-space: nowrap; }

  @media (max-width: 760px) {
    .pb-zoom { display: none; }
    .pb-tools { left: 12px; right: 12px; transform: none; max-width: none; }
    .pb-tool { padding: 0 11px; font-size: 13px; }
  }
`;
