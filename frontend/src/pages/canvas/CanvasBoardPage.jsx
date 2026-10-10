import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowUpRight, BringToFront, Check, GripHorizontal, Link2, Maximize,
  Minus, Plus, Share2, StickyNote, Trash2, Type, X,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { boardApi, rememberBoard, resolveUrl } from "./canvasApi.js";
import { PLATFORM_LABEL, isUrl, needsResolve, socialEmbed } from "./socialEmbed.js";

/* ════════════════════════════════════════════════════════════════════════
   A planning canvas for content meetings. Pan/zoom board with three item
   types: social embeds (play in place, with a stats strip), text boxes and
   sticky notes. The board is one doc; edits save debounced with a version
   guard, a 409 merges by item id (our dirty items win, everything else takes
   the server's), and a 4s poll pulls other people's edits in when idle.
   Routes: /canvas/:id (owner) · /canvas/s/:token (anyone with the link).
   ════════════════════════════════════════════════════════════════════════ */

const HEADER_H = 40;
const STATS_H = 52;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 2.5;
const STICKY_COLORS = ["#FFE873", "#FFB8D1", "#B8E1FF", "#C2F2C2", "#FFFFFF"];
const TEXT_SIZES = { s: 18, m: 28, l: 48 };
const STATS = [
  ["views", "Views"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["saves", "Saves"],
];

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isTypingTarget = (el) =>
  el instanceof Element && (el.closest("input, textarea, [contenteditable='true']") != null);

export default function CanvasBoardPage() {
  const { id, token } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const api = useMemo(() => boardApi({ id, token }), [id, token]);

  const [items, setItemsState] = useState([]);
  const [title, setTitle] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [isOpen, setIsOpen] = useState(false); // ownerless board: the link is the board
  const [shareToken, setShareToken] = useState(null);
  const [phase, setPhase] = useState("loading"); // loading | ready | missing
  const [status, setStatus] = useState("saved"); // saved | saving | offline
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [interacting, setInteracting] = useState(false);

  const stageRef = useRef(null);
  const itemsRef = useRef([]);
  const viewRef = useRef(view);
  const versionRef = useRef(0);
  const dirty = useRef(new Set());
  const deleted = useRef(new Set());
  const titleDirty = useRef(false);
  const saving = useRef(false);
  const again = useRef(false);
  const saveTimer = useRef(null);
  const dragRef = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const cascade = useRef(0);

  viewRef.current = view;
  const titleRef = useRef(title);
  titleRef.current = title;
  const openRef = useRef(false);

  const setItems = useCallback((next) => {
    itemsRef.current = next;
    setItemsState(next);
  }, []);

  const toastTimer = useRef(null);
  const flash = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2200);
  }, []);

  // ── server doc → local, keeping our unsaved edits ─────────────────────────
  const applyServer = useCallback(
    (board) => {
      const local = new Map(itemsRef.current.map((i) => [i.id, i]));
      const serverItems = Array.isArray(board.doc?.items) ? board.doc.items : [];
      const merged = serverItems
        .filter((i) => !deleted.current.has(i.id))
        .map((i) => (dirty.current.has(i.id) && local.has(i.id) ? local.get(i.id) : i));
      for (const did of dirty.current) {
        if (local.has(did) && !merged.some((m) => m.id === did)) merged.push(local.get(did));
      }
      versionRef.current = board.version;
      setItems(merged);
      if (!titleDirty.current) setTitle(board.title);
    },
    [setItems],
  );

  // ── save (debounced, version-guarded, merge on conflict) ──────────────────
  const flush = useCallback(async () => {
    if (saving.current) {
      again.current = true;
      return;
    }
    if (!dirty.current.size && !deleted.current.size && !titleDirty.current) return;
    saving.current = true;
    const sentDirty = new Set(dirty.current);
    const sentDeleted = new Set(deleted.current);
    const sentTitle = titleDirty.current;
    dirty.current.clear();
    deleted.current.clear();
    titleDirty.current = false;
    setStatus("saving");

    const body = { doc: { items: itemsRef.current }, version: versionRef.current };
    if (sentTitle && (!api.shared || openRef.current)) body.title = titleRef.current;
    const { ok, status: code, data } = await api.save(body);

    if (ok) {
      versionRef.current = data.board.version;
      setStatus("saved");
    } else {
      sentDirty.forEach((i) => dirty.current.add(i));
      sentDeleted.forEach((i) => deleted.current.add(i));
      if (sentTitle) titleDirty.current = true;
      if (code === 409 && data.board) {
        applyServer(data.board);
        again.current = true;
      } else {
        setStatus("offline");
        window.setTimeout(() => flush(), 3000);
      }
    }
    saving.current = false;
    if (again.current) {
      again.current = false;
      flush();
    }
  }, [api, applyServer]);

  const scheduleSave = useCallback(() => {
    setStatus("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 600);
  }, [flush]);

  // Item mutations all funnel through here so every change is tracked.
  const mutate = useCallback(
    (fn, { changed = [], removed = [] } = {}) => {
      setItems(fn(itemsRef.current));
      changed.forEach((i) => dirty.current.add(i));
      removed.forEach((i) => {
        deleted.current.add(i);
        dirty.current.delete(i);
      });
      scheduleSave();
    },
    [scheduleSave, setItems],
  );

  const patchItem = useCallback(
    (itemId, patch) => mutate((list) => list.map((i) => (i.id === itemId ? { ...i, ...patch } : i)), { changed: [itemId] }),
    [mutate],
  );

  const removeItem = useCallback(
    (itemId) => {
      mutate((list) => list.filter((i) => i.id !== itemId), { removed: [itemId] });
      setSelected(null);
      setEditing(null);
    },
    [mutate],
  );

  // ── load + auth ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token && authLoading) return;
    if (!token && !user) {
      navigate(`/login?next=${encodeURIComponent(`/canvas/${id}`)}`, { replace: true });
      return;
    }
    let alive = true;
    api.load().then(({ ok, data }) => {
      if (!alive) return;
      if (!ok || !data.board) {
        setPhase("missing");
        return;
      }
      const b = data.board;
      versionRef.current = b.version;
      setItems(Array.isArray(b.doc?.items) ? b.doc.items : []);
      setTitle(b.title);
      setIsOwner(Boolean(b.isOwner));
      setIsOpen(Boolean(b.open));
      openRef.current = Boolean(b.open);
      setShareToken(b.shareToken || token || null);
      if (token) rememberBoard({ token, title: b.title });
      setPhase("ready");
      document.title = `${b.title} — Canvas`;
    });
    return () => {
      alive = false;
    };
  }, [api, token, id, user, authLoading, navigate, setItems]);

  // Centre the camera on the content once loaded.
  const fitDone = useRef(false);
  useEffect(() => {
    if (phase !== "ready" || fitDone.current) return;
    fitDone.current = true;
    fitToContent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── poll for other people's edits ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== "ready") return;
    const t = window.setInterval(async () => {
      if (document.hidden || saving.current || dragRef.current) return;
      if (dirty.current.size || deleted.current.size || editing) return;
      const { ok, data } = await api.load(versionRef.current);
      if (ok && data.board && !dirty.current.size && !dragRef.current) applyServer(data.board);
    }, 4000);
    return () => window.clearInterval(t);
  }, [phase, api, applyServer, editing]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirty.current.size || deleted.current.size || titleDirty.current || saving.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

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

  function fitToContent(animate = true) {
    const list = itemsRef.current;
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
    const pad = 80;
    const z = clamp(Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY)), ZOOM_MIN, 1);
    setView({ x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: (r.height - (maxY - minY) * z) / 2 - minY * z, z });
    if (animate) flash(`${Math.round(z * 100)}%`);
  }

  // Wheel: trackpad scroll pans, pinch / ctrl+wheel zooms toward the cursor.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (isTypingTarget(e.target) && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01));
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, phase]);

  // ── pointer: pan the stage, pinch-zoom, drag + resize items ───────────────
  const onStagePointerDown = (e) => {
    if (e.target !== e.currentTarget && !e.target.classList.contains("cv-world")) return;
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

  const startItemDrag = (e, item, kind) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const topZ = Math.max(0, ...itemsRef.current.map((i) => i.z || 0));
    if ((item.z || 0) < topZ) patchItem(item.id, { z: topZ + 1 });
    setSelected(item.id);
    if (editing !== item.id) setEditing(null);
    dragRef.current = { kind, id: item.id, sx: e.clientX, sy: e.clientY, ox: item.x, oy: item.y, ow: item.w, oh: item.h, moved: false };
    setInteracting(true);
  };

  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const z = clamp(p.v.z * (Math.hypot(a.x - b.x, a.y - b.y) / p.d), ZOOM_MIN, ZOOM_MAX);
      const r = stageRef.current.getBoundingClientRect();
      const mx = p.mx - r.left;
      const my = p.my - r.top;
      const wx = (mx - p.v.x) / p.v.z;
      const wy = (my - p.v.y) / p.v.z;
      const nmx = (a.x + b.x) / 2 - r.left;
      const nmy = (a.y + b.y) / 2 - r.top;
      setView({ x: nmx - wx * z, y: nmy - wy * z, z });
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
    const list = itemsRef.current.map((i) => {
      if (i.id !== d.id) return i;
      if (d.kind === "move") return { ...i, x: Math.round(d.ox + dx / z), y: Math.round(d.oy + dy / z) };
      const minW = i.type === "embed" ? 220 : 120;
      const minH = i.type === "embed" ? 200 : 60;
      return { ...i, w: Math.round(Math.max(minW, d.ow + dx / z)), h: Math.round(Math.max(minH, d.oh + dy / z)) };
    });
    setItems(list);
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = dragRef.current;
    dragRef.current = null;
    setInteracting(false);
    if (d && d.kind !== "pan" && d.moved) {
      dirty.current.add(d.id);
      scheduleSave();
    }
  };

  // ── creating things ───────────────────────────────────────────────────────
  // New things land in view, in the first free slot: start at the centre and
  // step right (then down a row) until nothing overlaps.
  const spawnPoint = (w, h) => {
    const { sx, sy } = stageCenter();
    const c = screenToWorld(sx, sy);
    const gap = 32;
    const hits = (x, y) =>
      itemsRef.current.some((i) => x < i.x + i.w + gap && x + w + gap > i.x && y < i.y + i.h + gap && y + h + gap > i.y);
    const x0 = Math.round(c.x - w / 2);
    const y0 = Math.round(c.y - h / 2);
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 12; col++) {
        const x = x0 + col * (w + gap);
        const y = y0 + row * (h + gap);
        if (!hits(x, y)) return { x, y };
      }
    }
    const n = cascade.current++ % 6;
    return { x: x0 + n * 28, y: y0 + n * 28 };
  };

  const topZ = () => Math.max(0, ...itemsRef.current.map((i) => i.z || 0)) + 1;

  const addItem = (item) => {
    const full = { id: uid(), z: topZ(), ...item };
    mutate((list) => [...list, full], { changed: [full.id] });
    setSelected(full.id);
    return full;
  };

  const addText = () => {
    const w = 360;
    const h = 90;
    const it = addItem({ type: "text", text: "", size: "m", w, h, ...spawnPoint(w, h) });
    setEditing(it.id);
  };

  const addSticky = (text = "") => {
    const w = 220;
    const h = 220;
    const it = addItem({ type: "sticky", text, color: STICKY_COLORS[0], w, h, ...spawnPoint(w, h) });
    if (!text) setEditing(it.id);
  };

  const addLink = async (raw) => {
    let url = String(raw || "").trim();
    if (!isUrl(url)) {
      flash("That doesn't look like a link.");
      return false;
    }
    setLinkBusy(true);
    if (needsResolve(url)) {
      const { ok, data } = await resolveUrl(url);
      if (ok && data.url) url = data.url;
    }
    setLinkBusy(false);
    const embed = socialEmbed(url);
    if (embed) {
      const w = embed.w;
      const h = embed.h + HEADER_H + STATS_H;
      addItem({ type: "embed", embed, stats: {}, w, h, ...spawnPoint(w, h) });
    } else {
      const w = 320;
      const h = 150 + STATS_H;
      addItem({ type: "embed", embed: { platform: "link", kind: "link", src: null, url }, stats: {}, w, h, ...spawnPoint(w, h) });
      flash("Not a post we can play — added as a link.");
    }
    return true;
  };

  // Paste anywhere: a link becomes a post, plain text becomes a sticky.
  useEffect(() => {
    if (phase !== "ready") return;
    const onPaste = (e) => {
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      const text = e.clipboardData?.getData("text")?.trim();
      if (!text) return;
      e.preventDefault();
      if (isUrl(text)) addLink(text);
      else addSticky(text.slice(0, 2000));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  // Keyboard: delete the selection, escape out of things.
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

  // ── share ─────────────────────────────────────────────────────────────────
  const shareUrl = shareToken ? `${window.location.origin}/canvas/s/${shareToken}` : null;
  const copyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash("Share link copied — anyone with it can edit.");
    } catch {
      window.prompt("Copy the share link:", shareUrl);
    }
  };
  const rotateShare = async () => {
    if (!window.confirm("Make a new share link? The old one stops working.")) return;
    const { ok, data } = await api.rotateShare();
    if (ok) {
      setShareToken(data.board.shareToken);
      flash("New share link created.");
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (phase === "missing") {
    return (
      <div className="cv-missing">
        <style>{CSS}</style>
        <p>This board doesn't exist, or the link has changed.</p>
        {user && <button type="button" onClick={() => navigate("/canvas")}>Back to your boards</button>}
      </div>
    );
  }

  const sel = items.find((i) => i.id === selected);
  const selScreen = sel && {
    left: sel.x * view.z + view.x,
    top: sel.y * view.z + view.y,
    width: sel.w * view.z,
  };

  return (
    <div className={`cv${interacting ? " is-interacting" : ""}`}>
      <style>{CSS}</style>

      <header className="cv-bar">
        <div className="cv-bar-left">
          <button type="button" className="cv-icon" onClick={() => navigate("/canvas")} aria-label="All boards">
            <ArrowLeft size={18} />
          </button>
          {isOwner || isOpen ? (
            <input
              className="cv-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                titleDirty.current = true;
                if (token) rememberBoard({ token, title: e.target.value });
                scheduleSave();
              }}
              aria-label="Board title"
            />
          ) : (
            <span className="cv-title cv-title-ro">{title}</span>
          )}
          <span className={`cv-status is-${status}`}>
            {status === "saving" ? "Saving…" : status === "offline" ? "Offline — retrying" : "Saved"}
          </span>
        </div>
        <div className="cv-bar-right">
          <div className="cv-zoom">
            <button type="button" className="cv-icon" onClick={() => { const c = stageCenter(); zoomAt(c.sx, c.sy, 1 / 1.2); }} aria-label="Zoom out"><Minus size={16} /></button>
            <span>{Math.round(view.z * 100)}%</span>
            <button type="button" className="cv-icon" onClick={() => { const c = stageCenter(); zoomAt(c.sx, c.sy, 1.2); }} aria-label="Zoom in"><Plus size={16} /></button>
            <button type="button" className="cv-icon" onClick={() => fitToContent()} aria-label="Fit to content"><Maximize size={15} /></button>
          </div>
          {(isOwner || isOpen) && (
            <button
              type="button"
              className="cv-share"
              onClick={copyShare}
              onContextMenu={(e) => {
                if (!isOwner) return;
                e.preventDefault();
                rotateShare();
              }}
              title={isOwner ? "Copy share link (right-click: new link)" : "Copy this board's link"}
            >
              <Share2 size={15} /> Share
            </button>
          )}
        </div>
      </header>

      <div
        ref={stageRef}
        className="cv-stage"
        onPointerDown={onStagePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          backgroundSize: `${24 * view.z}px ${24 * view.z}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div className="cv-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          {items.map((it) => (
            <CanvasItem
              key={it.id}
              item={it}
              selected={selected === it.id}
              editing={editing === it.id}
              onDragStart={startItemDrag}
              onEdit={() => setEditing(it.id)}
              onPatch={(patch) => patchItem(it.id, patch)}
              onRemove={() => removeItem(it.id)}
            />
          ))}
        </div>

        {phase === "ready" && items.length === 0 && (
          <div className="cv-empty">
            <p className="cv-empty-h">Paste a post to start.</p>
            <p>Copy a link from Instagram, TikTok, YouTube or Facebook and press ⌘V anywhere — it plays right here. Add text and stickies to plan around it.</p>
          </div>
        )}
        {phase === "loading" && <div className="cv-empty"><p>Opening board…</p></div>}
      </div>

      {sel && selScreen && editing !== sel.id && (
        <div className="cv-selbar" style={{ left: selScreen.left, top: Math.max(64, selScreen.top - 48) }}>
          {sel.type === "sticky" &&
            STICKY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`cv-swatch${sel.color === c ? " is-on" : ""}`}
                style={{ background: c }}
                onClick={() => patchItem(sel.id, { color: c })}
                aria-label="Sticky colour"
              />
            ))}
          {sel.type === "text" &&
            Object.keys(TEXT_SIZES).map((k) => (
              <button key={k} type="button" className={`cv-size${(sel.size || "m") === k ? " is-on" : ""}`} onClick={() => patchItem(sel.id, { size: k })}>
                {k.toUpperCase()}
              </button>
            ))}
          {(sel.type === "sticky" || sel.type === "text") && <span className="cv-sep" />}
          <button type="button" className="cv-icon" onClick={() => patchItem(sel.id, { z: topZ() })} aria-label="Bring to front"><BringToFront size={16} /></button>
          <button type="button" className="cv-icon cv-danger" onClick={() => removeItem(sel.id)} aria-label="Delete"><Trash2 size={16} /></button>
        </div>
      )}

      {phase === "ready" && (
      <div className="cv-tools">
        {linkOpen ? (
          <form
            className="cv-linkform"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await addLink(linkDraft)) {
                setLinkDraft("");
                setLinkOpen(false);
              }
            }}
          >
            <Link2 size={16} />
            <input
              autoFocus
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              placeholder="Paste an Instagram, TikTok, YouTube or Facebook link"
              inputMode="url"
            />
            <button type="submit" className="cv-tool-primary" disabled={linkBusy}>
              {linkBusy ? "Adding…" : "Add"}
            </button>
            <button type="button" className="cv-icon" onClick={() => setLinkOpen(false)} aria-label="Cancel"><X size={16} /></button>
          </form>
        ) : (
          <>
            <button type="button" className="cv-tool" onClick={() => setLinkOpen(true)}><Link2 size={18} /> Post</button>
            <button type="button" className="cv-tool" onClick={addText}><Type size={18} /> Text</button>
            <button type="button" className="cv-tool" onClick={() => addSticky()}><StickyNote size={18} /> Sticky</button>
          </>
        )}
      </div>
      )}

      {toast && <div className="cv-toast" role="status"><Check size={14} /> {toast}</div>}
    </div>
  );
}

/* ─── one item on the board ─── */
function CanvasItem({ item, selected, editing, onDragStart, onEdit, onPatch, onRemove }) {
  const style = { left: item.x, top: item.y, width: item.w, height: item.h, zIndex: item.z || 0 };
  const cls = `cv-item cv-${item.type}${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}`;
  const resize = <span className="cv-resize" onPointerDown={(e) => onDragStart(e, item, "resize")} aria-hidden="true" />;

  if (item.type === "embed") {
    const e = item.embed || {};
    return (
      <div className={cls} style={style}>
        <div className="cv-embed-head" onPointerDown={(ev) => onDragStart(ev, item, "move")}>
          <GripHorizontal size={14} className="cv-grip" />
          <span className="cv-embed-platform">{PLATFORM_LABEL[e.platform] || "Link"}</span>
          {e.kind && e.platform !== "link" && <span className="cv-embed-kind">{e.kind}</span>}
          <a href={e.url} target="_blank" rel="noreferrer" className="cv-embed-open" onPointerDown={(ev) => ev.stopPropagation()} aria-label="Open original">
            <ArrowUpRight size={15} />
          </a>
          <button type="button" className="cv-embed-x" onPointerDown={(ev) => ev.stopPropagation()} onClick={onRemove} aria-label="Remove">
            <X size={15} />
          </button>
        </div>
        <div className="cv-embed-body">
          {e.src ? (
            <iframe
              src={e.src}
              title={`${PLATFORM_LABEL[e.platform] || "Post"} embed`}
              loading="lazy"
              allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <a className="cv-linkcard" href={e.url} target="_blank" rel="noreferrer" onPointerDown={(ev) => ev.stopPropagation()}>
              <span>{safeHost(e.url)}</span>
              <small>{e.url}</small>
            </a>
          )}
        </div>
        <div className="cv-stats" onPointerDown={(ev) => ev.stopPropagation()}>
          {STATS.map(([k, label]) => (
            <label key={k}>
              <span>{label}</span>
              <input
                value={item.stats?.[k] ?? ""}
                onChange={(ev) => onPatch({ stats: { ...(item.stats || {}), [k]: ev.target.value.slice(0, 24) } })}
                placeholder="–"
                inputMode="numeric"
              />
            </label>
          ))}
        </div>
        {resize}
      </div>
    );
  }

  const isSticky = item.type === "sticky";
  const textStyle = isSticky ? { background: item.color || STICKY_COLORS[0] } : { fontSize: TEXT_SIZES[item.size || "m"] };
  return (
    <div
      className={cls}
      style={{ ...style, ...(isSticky ? { background: item.color || STICKY_COLORS[0] } : null) }}
      onPointerDown={(ev) => !editing && onDragStart(ev, item, "move")}
      onDoubleClick={onEdit}
    >
      {editing ? (
        <textarea
          autoFocus
          className="cv-textarea"
          style={textStyle}
          value={item.text || ""}
          onChange={(ev) => {
            const text = ev.target.value.slice(0, 5000);
            // Text boxes grow with what you type; stickies keep their square.
            onPatch(isSticky ? { text } : { text, h: Math.max(item.h, ev.target.scrollHeight + 4) });
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          placeholder={isSticky ? "Note…" : "Type something"}
        />
      ) : (
        <div className="cv-textview" style={isSticky ? null : { fontSize: TEXT_SIZES[item.size || "m"] }}>
          {item.text || <span className="cv-placeholder">{isSticky ? "Double-click to write" : "Double-click to type"}</span>}
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
  @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap');
  html, body { overscroll-behavior: none; }
  .cv {
    position: fixed; inset: 0; overflow: hidden; background: #f4f4f2; color: #000;
    font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased; touch-action: none; user-select: none; -webkit-user-select: none;
  }
  .cv * { box-sizing: border-box; }
  .cv button { font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .cv input, .cv textarea { user-select: text; -webkit-user-select: text; }
  .cv.is-interacting iframe { pointer-events: none; }

  /* top bar */
  .cv-bar {
    position: absolute; top: 0; left: 0; right: 0; z-index: 30; height: 56px;
    padding: 0 12px calc(0px) 12px; padding-top: env(safe-area-inset-top, 0px); box-sizing: content-box;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    background: rgba(255,255,255,0.92); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(0,0,0,0.08);
  }
  .cv-bar-left, .cv-bar-right { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .cv-logo { height: 18px; filter: brightness(0); margin: 0 6px; }
  .cv-title {
    font: inherit; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; border: 1px solid transparent;
    background: transparent; border-radius: 8px; padding: 6px 8px; min-width: 0; width: clamp(120px, 28vw, 360px); outline: none;
    text-overflow: ellipsis;
  }
  .cv-title:hover { border-color: rgba(0,0,0,0.12); }
  .cv-title:focus { border-color: #000; background: #fff; }
  .cv-title-ro { display: inline-block; white-space: nowrap; overflow: hidden; }
  .cv-status { font-size: 12px; color: #8a8a8a; white-space: nowrap; }
  .cv-status.is-offline { color: #b42318; }
  .cv-icon { width: 34px; height: 34px; display: grid; place-items: center; border: 0; background: transparent; border-radius: 9px; flex: none; }
  .cv-icon:hover { background: rgba(0,0,0,0.06); }
  .cv-zoom { display: flex; align-items: center; gap: 2px; font-size: 13px; font-variant-numeric: tabular-nums; }
  .cv-zoom span { min-width: 44px; text-align: center; }
  .cv-share { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; border-radius: 999px; border: 0; background: #000; color: #fff !important; font-size: 14px; font-weight: 600; }

  /* stage */
  .cv-stage {
    position: absolute; inset: 0; top: calc(57px + env(safe-area-inset-top, 0px));
    background-image: radial-gradient(circle, rgba(0,0,0,0.13) 1px, transparent 1.2px);
    cursor: grab;
  }
  .cv-stage:active { cursor: grabbing; }
  .cv-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; width: 1px; height: 1px; }

  /* items */
  .cv-item { position: absolute; }
  .cv-item.is-selected { outline: 2px solid #000; outline-offset: 3px; }
  .cv-resize {
    position: absolute; right: -7px; bottom: -7px; width: 16px; height: 16px; border-radius: 4px;
    background: #fff; border: 2px solid #000; cursor: nwse-resize; opacity: 0; transition: opacity 0.15s ease;
  }
  .cv-item:hover .cv-resize, .cv-item.is-selected .cv-resize { opacity: 1; }

  .cv-embed { display: flex; flex-direction: column; background: #fff; border-radius: 14px; box-shadow: 0 12px 34px -16px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08); }
  .cv-embed-head {
    height: ${HEADER_H}px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 6px 0 10px;
    border-bottom: 1px solid rgba(0,0,0,0.08); cursor: grab; touch-action: none;
  }
  .cv-embed-head:active { cursor: grabbing; }
  .cv-grip { color: #9a9a9a; flex: none; }
  .cv-embed-platform { font-size: 13px; font-weight: 600; }
  .cv-embed-kind { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #8a8a8a; }
  .cv-embed-open, .cv-embed-x { margin-left: auto; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 7px; color: #555; border: 0; background: transparent; }
  .cv-embed-x { margin-left: 0; }
  .cv-embed-open:hover, .cv-embed-x:hover { background: rgba(0,0,0,0.06); color: #000; }
  .cv-embed-body { flex: 1; min-height: 0; overflow: hidden; background: #fafafa; }
  .cv-embed-body iframe { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
  .cv-linkcard { height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 18px; color: #000; text-decoration: none; }
  .cv-linkcard span { font-size: 18px; font-weight: 600; }
  .cv-linkcard small { font-size: 12px; color: #8a8a8a; word-break: break-all; }
  .cv-stats { height: ${STATS_H}px; flex: none; display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid rgba(0,0,0,0.08); }
  .cv-stats label { display: flex; flex-direction: column; justify-content: center; padding: 0 10px; gap: 1px; min-width: 0; }
  .cv-stats label + label { border-left: 1px solid rgba(0,0,0,0.06); }
  .cv-stats span { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #8a8a8a; }
  .cv-stats input { font: inherit; font-size: 15px; font-weight: 600; border: 0; outline: none; background: transparent; width: 100%; padding: 0; font-variant-numeric: tabular-nums; }

  .cv-text { cursor: move; }
  .cv-sticky { border-radius: 4px; box-shadow: 0 14px 28px -18px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.12); padding: 16px; cursor: move; }
  .cv-textview { width: 100%; height: 100%; overflow: hidden; white-space: pre-wrap; word-break: break-word; line-height: 1.25; font-weight: 500; }
  .cv-text .cv-textview { font-weight: 600; letter-spacing: -0.02em; line-height: 1.12; }
  .cv-sticky .cv-textview { font-size: 18px; line-height: 1.35; }
  .cv-placeholder { color: rgba(0,0,0,0.35); font-weight: 400; }
  .cv-textarea {
    width: 100%; height: 100%; resize: none; border: 0; outline: none; background: transparent; padding: 0;
    font: inherit; font-weight: 600; letter-spacing: -0.02em; line-height: 1.12; color: #000;
  }
  .cv-sticky .cv-textarea { font-size: 18px; font-weight: 500; letter-spacing: 0; line-height: 1.35; background: transparent !important; }
  .cv-text.is-editing { outline: 2px dashed rgba(0,0,0,0.4); outline-offset: 4px; }

  /* selection toolbar */
  .cv-selbar {
    position: absolute; z-index: 25; display: flex; align-items: center; gap: 4px; padding: 4px;
    background: #fff; border-radius: 12px; box-shadow: 0 10px 30px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08);
  }
  .cv-swatch { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.18); margin: 0 2px; }
  .cv-swatch.is-on { outline: 2px solid #000; outline-offset: 2px; }
  .cv-size { height: 30px; min-width: 30px; border-radius: 8px; border: 0; background: transparent; font-size: 12px; font-weight: 600; }
  .cv-size.is-on { background: #000; color: #fff !important; }
  .cv-sep { width: 1px; height: 22px; background: rgba(0,0,0,0.12); margin: 0 4px; }
  .cv-danger:hover { color: #b42318; }

  /* bottom tools */
  .cv-tools {
    position: absolute; left: 50%; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 30;
    display: flex; align-items: center; gap: 4px; padding: 6px; border-radius: 16px;
    background: #000; color: #fff; box-shadow: 0 16px 40px -16px rgba(0,0,0,0.5);
    max-width: calc(100vw - 24px);
  }
  .cv-tool { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px; border: 0; border-radius: 11px; background: transparent; color: #fff !important; font-size: 15px; font-weight: 500; }
  .cv-tool:hover { background: rgba(255,255,255,0.12); }
  .cv-linkform { display: flex; align-items: center; gap: 8px; padding-left: 10px; width: min(560px, calc(100vw - 36px)); }
  .cv-linkform input { flex: 1; min-width: 0; height: 40px; border: 0; outline: none; border-radius: 9px; padding: 0 12px; font: inherit; font-size: 15px; background: #fff; color: #000; }
  .cv-tool-primary { height: 40px; padding: 0 16px; border: 0; border-radius: 9px; background: #fff; color: #000 !important; font-weight: 600; }
  .cv-tool-primary:disabled { opacity: 0.6; }
  .cv-linkform .cv-icon:hover { background: rgba(255,255,255,0.12); }

  .cv-empty {
    position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); text-align: center; width: min(460px, calc(100vw - 48px));
    color: #6b6b6b; font-size: 16px; line-height: 1.5; pointer-events: none;
  }
  .cv-empty-h { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; color: #000; margin: 0 0 8px; }
  .cv-empty p { margin: 0; }

  .cv-toast {
    position: absolute; left: 50%; top: 72px; transform: translateX(-50%); z-index: 40;
    display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 999px;
    background: #000; color: #fff; font-size: 13px; font-weight: 500; white-space: nowrap;
  }

  .cv-missing { min-height: 100dvh; display: grid; place-content: center; gap: 16px; text-align: center; font-family: "Inter Tight", sans-serif; font-size: 18px; }
  .cv-missing button { font: inherit; padding: 12px 20px; border-radius: 999px; border: 0; background: #000; color: #fff; cursor: pointer; }

  @media (max-width: 640px) {
    .cv-status { display: none; }
    .cv-zoom span { display: none; }
    .cv-tool { padding: 0 12px; font-size: 14px; }
    .cv-share { padding: 0 12px; }
  }
`;
