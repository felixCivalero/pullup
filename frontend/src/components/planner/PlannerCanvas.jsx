import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { FileText, Link2, X, Trash2, Settings2, StickyNote, CalendarDays, ImagePlus, Loader2, Mail, Image as ImageIcon, Film, Smartphone, GalleryHorizontalEnd } from "lucide-react";
import { SiInstagram, SiTiktok, SiYoutube, SiFacebook, SiX, SiLinkedin, SiWhatsapp } from "react-icons/si";
import { mediaKind, loadViewport, saveViewport } from "../../lib/plannerStore.js";
import { DAY_MS, startOfDay, addDays } from "../../lib/plannerTime.js";
import { authenticatedFetch } from "../../lib/api.js";
import { supabase } from "../../lib/supabase.js";

// ── World constants ─────────────────────────────────────────────────
const PX_PER_DAY = 26;
const TIMELINE_Y = 0;
const CARD_W = 188; // card (and media) width — resizable
const MIN_CARD_W = 120;
const MAX_CARD_W = 440;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;
const SNAP_Y = 56; // how close to the line counts as "on the timeline"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// `types` = the content formats relevant to each channel. The Type dropdown
// only shows when a channel offers more than one (e.g. Email shows none).
const CHANNELS = {
  instagram: { label: "Instagram", color: "#E1306C", Icon: SiInstagram, types: ["image", "carousel", "story", "reel"] },
  tiktok: { label: "TikTok", color: "#FE2C55", Icon: SiTiktok, types: ["reel", "story", "carousel"] },
  youtube: { label: "YouTube", color: "#FF0000", Icon: SiYoutube, types: ["reel"] },
  facebook: { label: "Facebook", color: "#1877F2", Icon: SiFacebook, types: ["image", "carousel", "story", "reel"] },
  x: { label: "X", color: "#7d8b99", Icon: SiX, types: ["image", "carousel"] },
  linkedin: { label: "LinkedIn", color: "#0A66C2", Icon: SiLinkedin, types: ["image", "carousel"] },
  whatsapp: { label: "WhatsApp", color: "#25D366", Icon: SiWhatsapp, types: ["story", "image"] },
  email: { label: "Email", color: "#3b82f6", Icon: Mail, types: [] },
};
const TYPES = {
  image: { label: "Image", Icon: ImageIcon, ratio: 1 },
  carousel: { label: "Carousel", Icon: GalleryHorizontalEnd, ratio: 1 },
  story: { label: "Story", Icon: Smartphone, ratio: 1.5 },
  reel: { label: "Reel", Icon: Film, ratio: 1.5 },
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad2 = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Card width + approximate height — used to anchor each card's connector to the
// edge nearest the timeline. The card is media-only by default (settings live
// behind a gear), so height = media + an optional date row.
const cardFrameW = (c) => c.w || CARD_W;
const cardHeight = (c) => {
  const ty = TYPES[c.contentType] || TYPES.image;
  const mediaH = Math.round(((c.w || CARD_W) - 12) * ty.ratio);
  return 6 + mediaH + 6 + (c.links?.length || c.eventId ? 28 : 0);
};

const DEFAULT_STATE = { viewport: { panX: 0, panY: 0, scale: 1 }, items: [] };

export const PlannerCanvas = forwardRef(function PlannerCanvas({ storageKey, events = [] }, ref) {
  const containerRef = useRef(null);
  const today = useMemo(() => startOfDay(new Date()), []);
  const [state, setState] = useState(() => ({ viewport: loadViewport(storageKey) || DEFAULT_STATE.viewport, items: [] }));
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [link, setLink] = useState(null);
  const [panning, setPanning] = useState(false);
  const [openCardId, setOpenCardId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [uploadingIds, setUploadingIds] = useState(() => new Set());
  const drag = useRef(null);
  const inited = useRef(false);
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const saveTimers = useRef({});
  const vpTimer = useRef(null);

  const offsetOfDate = useCallback((d) => Math.round((startOfDay(d).getTime() - today.getTime()) / DAY_MS), [today]);
  const offsetToX = (o) => o * PX_PER_DAY;
  const xToOffset = (x) => Math.round(x / PX_PER_DAY);

  // Persist only the viewport (per device). Content lives in the DB.
  useEffect(() => {
    if (vpTimer.current) clearTimeout(vpTimer.current);
    vpTimer.current = setTimeout(() => saveViewport(storageKey, state.viewport), 300);
    return () => vpTimer.current && clearTimeout(vpTimer.current);
  }, [state.viewport, storageKey]);

  // Load cards from the database on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authenticatedFetch("/host/planner/cards");
        if (res.ok) {
          const data = await res.json();
          if (alive) setState((s) => ({ ...s, items: Array.isArray(data.cards) ? data.cards : [] }));
        }
      } catch {
        /* offline/error — start empty */
      }
      if (alive) setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize({ w, h });
      if (!inited.current && w > 0) {
        inited.current = true;
        setState((s) => {
          if (s.viewport?._init) return s;
          const scale = clamp(w / (62 * PX_PER_DAY), MIN_SCALE, MAX_SCALE);
          return { ...s, viewport: { scale, panX: w / 2, panY: h / 2, _init: true } };
        });
      }
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const update = useCallback((updater) => setState((s) => updater(s)), []);
  const setViewport = useCallback((v) => setState((s) => ({ ...s, viewport: { ...s.viewport, ...v } })), []);

  const screenToWorld = useCallback((sx, sy) => {
    const rect = containerRef.current.getBoundingClientRect();
    const { panX, panY, scale } = state.viewport;
    return { x: (sx - rect.left - panX) / scale, y: (sy - rect.top - panY) / scale };
  }, [state.viewport]);

  const viewportCenterWorld = useCallback(() => {
    const rect = containerRef.current.getBoundingClientRect();
    return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [screenToWorld]);

  // ── DB persistence ────────────────────────────────────────────────
  const cardPayload = (c) => ({ x: c.x, y: c.y, w: c.w, channel: c.channel, contentType: c.contentType, eventId: c.eventId, note: c.note, links: c.links, mediaUrl: c.mediaUrl, mediaPath: c.mediaPath, mediaKind: c.mediaKind, mediaName: c.mediaName, mediaMime: c.mediaMime });

  const queueSave = useCallback((id) => {
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => {
      const c = stateRef.current.items.find((x) => x.id === id);
      if (!c) return;
      authenticatedFetch(`/host/planner/cards/${id}`, { method: "PATCH", body: JSON.stringify(cardPayload(c)) }).catch(() => {});
    }, 400);
  }, []);

  const createCardRemote = useCallback(async (c) => {
    try {
      await authenticatedFetch("/host/planner/cards", { method: "POST", body: JSON.stringify({ id: c.id, ...cardPayload(c) }) });
    } catch {
      /* a later edit will re-persist via queueSave */
    }
  }, []);

  const deleteCardRemote = useCallback((id) => {
    clearTimeout(saveTimers.current[id]);
    authenticatedFetch(`/host/planner/cards/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const uploadMedia = useCallback(async (file) => {
    const res = await authenticatedFetch("/host/planner/upload-url", { method: "POST", body: JSON.stringify({ mimeType: file.type }) });
    if (!res.ok) throw new Error("upload-url failed");
    const tok = await res.json();
    const { error } = await supabase.storage.from(tok.bucket).uploadToSignedUrl(tok.path, tok.token, file);
    if (error) throw error;
    return { url: tok.publicUrl, path: tok.path };
  }, []);

  const markUploading = useCallback((id, on) => {
    setUploadingIds((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);

  const addFiles = useCallback(
    async (files, at) => {
      const base = at || viewportCenterWorld();
      let i = 0;
      for (const file of files) {
        const id = uid();
        const o = i * 22;
        const card = { id, x: base.x - CARD_W / 2 + o, y: base.y - 110 + o, w: CARD_W, channel: null, contentType: "image", eventId: null, note: "", mediaUrl: null, mediaPath: null, mediaKind: "placeholder", mediaName: file.name, mediaMime: file.type, links: [] };
        update((s) => ({ ...s, items: [...s.items, card] }));
        markUploading(id, true);
        await createCardRemote(card);
        try {
          const { url, path } = await uploadMedia(file);
          update((s) => ({ ...s, items: s.items.map((c) => (c.id === id ? { ...c, mediaUrl: url, mediaPath: path, mediaKind: mediaKind(file.type) } : c)) }));
          queueSave(id);
        } catch (e) {
          console.error("planner upload failed:", e);
        } finally {
          markUploading(id, false);
        }
        i++;
      }
    },
    [update, viewportCenterWorld, createCardRemote, uploadMedia, queueSave, markUploading],
  );

  // An empty placeholder card — wireframe a slot now, fill it with media later.
  const addPlaceholder = useCallback(() => {
    const base = viewportCenterWorld();
    const card = { id: uid(), x: base.x - CARD_W / 2, y: base.y - 110, w: CARD_W, channel: null, contentType: "image", eventId: null, note: "", mediaUrl: null, mediaPath: null, mediaKind: "placeholder", mediaName: null, mediaMime: null, links: [] };
    update((s) => ({ ...s, items: [...s.items, card] }));
    createCardRemote(card);
  }, [update, viewportCenterWorld, createCardRemote]);

  // Drop/pick media into an existing (placeholder) card.
  const fillCard = useCallback(
    async (cardId, file) => {
      if (!file) return;
      markUploading(cardId, true);
      try {
        const { url, path } = await uploadMedia(file);
        update((s) => ({ ...s, items: s.items.map((c) => (c.id === cardId ? { ...c, mediaUrl: url, mediaPath: path, mediaKind: mediaKind(file.type), mediaName: file.name, mediaMime: file.type } : c)) }));
        queueSave(cardId);
      } catch (e) {
        console.error("planner fill failed:", e);
      } finally {
        markUploading(cardId, false);
      }
    },
    [update, uploadMedia, queueSave, markUploading],
  );

  useImperativeHandle(ref, () => ({ addFiles, addPlaceholder }), [addFiles, addPlaceholder]);

  const setCard = useCallback(
    (id, patch) => {
      update((s) => ({ ...s, items: s.items.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
      queueSave(id);
    },
    [update, queueSave],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        setState((s) => {
          const { panX, panY, scale } = s.viewport;
          const ns = clamp(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), MIN_SCALE, MAX_SCALE);
          const wx = (sx - panX) / scale;
          const wy = (sy - panY) / scale;
          return { ...s, viewport: { ...s.viewport, scale: ns, panX: sx - wx * ns, panY: sy - wy * ns } };
        });
      } else {
        setState((s) => ({ ...s, viewport: { ...s.viewport, panX: s.viewport.panX - e.deltaX, panY: s.viewport.panY - e.deltaY } }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Snap a world x to the nearest calendar day's ISO date.
  const dateAtX = useCallback((x) => isoOf(addDays(today, xToOffset(x))), [today]);

  useEffect(() => {
    const onMove = (e) => {
      const d = drag.current;
      if (!d) return;
      if (d.type === "pan") {
        setViewport({ panX: d.panX0 + (e.clientX - d.sx), panY: d.panY0 + (e.clientY - d.sy) });
      } else if (d.type === "move") {
        const w = screenToWorld(e.clientX, e.clientY);
        update((s) => ({ ...s, items: s.items.map((it) => (it.id === d.id ? { ...it, x: d.x0 + (w.x - d.wx0), y: d.y0 + (w.y - d.wy0) } : it)) }));
        queueSave(d.id);
      } else if (d.type === "resizeCard") {
        const w = screenToWorld(e.clientX, e.clientY);
        update((s) => ({ ...s, items: s.items.map((it) => (it.id === d.id ? { ...it, w: clamp(Math.round(d.w0 + (w.x - d.wx0)), MIN_CARD_W, MAX_CARD_W) } : it)) }));
        queueSave(d.id);
      } else if (d.type === "link") {
        setLink({ cardId: d.cardId, world: screenToWorld(e.clientX, e.clientY) });
      } else if (d.type === "relink") {
        const w = screenToWorld(e.clientX, e.clientY);
        const date = dateAtX(w.x);
        update((s) => ({ ...s, items: s.items.map((c) => (c.id === d.cardId ? { ...c, links: (c.links || []).map((l) => (l.id === d.linkId ? { ...l, date } : l)) } : c)) }));
        queueSave(d.cardId);
      }
    };
    const onUp = (e) => {
      const d = drag.current;
      drag.current = null;
      setPanning(false);
      if (d?.type === "link") {
        const w = screenToWorld(e.clientX, e.clientY);
        if (Math.abs(w.y - TIMELINE_Y) < SNAP_Y) {
          const off = xToOffset(w.x);
          const date = isoOf(addDays(today, off));
          // Dropped right on an event's mark → also tag the card with that event.
          const ev = eventsRef.current.find((x) => offsetOfDate(x.startsAt) === off);
          update((s) => ({
            ...s,
            items: s.items.map((c) => {
              if (c.id !== d.cardId) return c;
              const exists = (c.links || []).some((l) => l.date === date);
              const links = exists ? c.links : [...(c.links || []), { id: uid(), date }];
              return { ...c, links, eventId: c.eventId || (ev ? ev.id : null) };
            }),
          }));
          queueSave(d.cardId);
        }
        setLink(null);
      } else if (d?.type === "relink") {
        // Dragged far from the line → unlink.
        const w = screenToWorld(e.clientX, e.clientY);
        if (Math.abs(w.y - TIMELINE_Y) > 110) {
          update((s) => ({ ...s, items: s.items.map((c) => (c.id === d.cardId ? { ...c, links: (c.links || []).filter((l) => l.id !== d.linkId) } : c)) }));
        }
        queueSave(d.cardId);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [screenToWorld, update, setViewport, dateAtX, offsetOfDate, today, queueSave]);

  const startPan = (e) => {
    if (e.button !== 0) return;
    setOpenCardId(null); // clicking the canvas closes any open settings popup
    drag.current = { type: "pan", sx: e.clientX, sy: e.clientY, panX0: state.viewport.panX, panY0: state.viewport.panY };
    setPanning(true);
  };
  const startMove = (e, id) => {
    e.stopPropagation();
    const w = screenToWorld(e.clientX, e.clientY);
    const it = state.items.find((i) => i.id === id);
    drag.current = { type: "move", id, wx0: w.x, wy0: w.y, x0: it.x, y0: it.y };
  };
  const startLink = (e, cardId) => {
    e.stopPropagation();
    drag.current = { type: "link", cardId };
    setLink({ cardId, world: screenToWorld(e.clientX, e.clientY) });
  };
  const startResizeCard = (e, id) => {
    e.stopPropagation();
    const w = screenToWorld(e.clientX, e.clientY);
    const it = state.items.find((i) => i.id === id);
    drag.current = { type: "resizeCard", id, wx0: w.x, w0: it.w || CARD_W };
  };
  const startRelink = (e, cardId, linkId) => {
    e.stopPropagation();
    drag.current = { type: "relink", cardId, linkId };
  };
  const removeCard = (id) => {
    update((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }));
    deleteCardRemote(id); // backend also removes the storage object
  };
  const removeLink = (cardId, linkId) => {
    update((s) => ({ ...s, items: s.items.map((c) => (c.id === cardId ? { ...c, links: (c.links || []).filter((l) => l.id !== linkId) } : c)) }));
    queueSave(cardId);
  };

  const { panX, panY, scale } = state.viewport;
  const cards = state.items;
  const ready = size.w > 0;

  const xMin = -panX / scale;
  const xMax = (size.w - panX) / scale;

  const dayMin = Math.floor(xMin / PX_PER_DAY) - 1;
  const dayMax = Math.ceil(xMax / PX_PER_DAY) + 1;
  const labelStep = [1, 2, 3, 7, 14, 30].find((s) => s * PX_PER_DAY * scale >= 50) || 30;
  const ticks = [];
  for (let o = dayMin; o <= dayMax; o++) {
    if (o !== 0 && o % labelStep !== 0) continue;
    ticks.push(o);
  }

  // Connector anchor: card edge nearest the timeline.
  const cardAnchorY = (c) => {
    const top = c.y;
    const bot = c.y + cardHeight(c);
    return Math.abs(top - TIMELINE_Y) <= Math.abs(bot - TIMELINE_Y) ? top : bot;
  };

  const connectors = [];
  for (const c of cards) {
    for (const l of c.links || []) {
      connectors.push({ key: `${c.id}-${l.id}`, cardId: c.id, linkId: l.id, x1: c.x + cardFrameW(c) / 2, y1: cardAnchorY(c), x2: offsetToX(offsetOfDate(`${l.date}T00:00:00`)), y2: TIMELINE_Y });
    }
  }

  let tempLine = null;
  let snapDot = null;
  if (link) {
    const c = cards.find((x) => x.id === link.cardId);
    if (c) {
      const near = Math.abs(link.world.y - TIMELINE_Y) < SNAP_Y;
      const x2 = near ? xToOffset(link.world.x) * PX_PER_DAY : link.world.x;
      const y2 = near ? TIMELINE_Y : link.world.y;
      tempLine = { x1: c.x + cardFrameW(c) / 2, y1: cardAnchorY(c), x2, y2 };
      if (near) snapDot = { x: x2, y: TIMELINE_Y };
    }
  }

  // Settings popup anchor — screen-space, beside the open card.
  const settingsCard = openCardId ? cards.find((c) => c.id === openCardId) : null;
  let settingsPos = null;
  if (settingsCard) {
    const PANEL_W = 284;
    const cl = settingsCard.x * scale + panX;
    const ct = settingsCard.y * scale + panY;
    const cw = (settingsCard.w || CARD_W) * scale;
    let left = cl + cw + 14;
    let sideOfCard = "left"; // caret on the panel's left, pointing at the card
    if (left + PANEL_W > size.w - 8) {
      left = cl - PANEL_W - 14;
      sideOfCard = "right";
    }
    left = Math.max(8, Math.min(left, size.w - PANEL_W - 8));
    const top = Math.max(8, Math.min(ct, size.h - 360));
    settingsPos = { left, top, side: sideOfCard, w: PANEL_W };
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={startPan}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = [...(e.dataTransfer?.files || [])];
        if (files.length) addFiles(files, screenToWorld(e.clientX, e.clientY));
      }}
      style={{ position: "absolute", inset: 0, overflow: "hidden", cursor: panning ? "grabbing" : "default", background: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0) 0 0 / 28px 28px, rgba(8,7,12,0.6)", touchAction: "none" }}
    >
      {ready && (
        <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(${panX}px, ${panY}px) scale(${scale})`, transformOrigin: "0 0" }}>
          {/* Baseline */}
          <div style={{ position: "absolute", left: dayMin * PX_PER_DAY, top: TIMELINE_Y, width: (dayMax - dayMin) * PX_PER_DAY, height: 2, background: "rgba(255,255,255,0.16)", pointerEvents: "none" }} />

          {/* Ticks (today = bigger gold tick, no full line) */}
          {ticks.map((o) => {
            const d = addDays(today, o);
            const isToday = o === 0;
            const showMonth = isToday || d.getDate() === 1;
            return (
              <div key={o} style={{ position: "absolute", left: o * PX_PER_DAY, top: TIMELINE_Y - 7, transform: "translateX(-50%)", textAlign: "center", pointerEvents: "none" }}>
                <div style={{ width: isToday ? 3 : 1, height: isToday ? 18 : 8, margin: "0 auto", borderRadius: 2, background: isToday ? "#fbbf24" : "rgba(255,255,255,0.28)" }} />
                <div style={{ marginTop: 3, fontSize: 9, lineHeight: 1.15, color: isToday ? "#fbbf24" : "rgba(255,255,255,0.45)", fontWeight: isToday ? 700 : 400, whiteSpace: "nowrap" }}>
                  <div style={{ opacity: isToday ? 1 : 0.7 }}>{isToday ? "Today" : WEEKDAYS[d.getDay()]}</div>
                  <div>{showMonth ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : d.getDate()}</div>
                </div>
              </div>
            );
          })}

          {/* Connectors */}
          <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
            {connectors.map((c) => (
              <line key={c.key} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke="rgba(251,191,36,0.5)" strokeWidth={1.5} />
            ))}
            {tempLine && <line x1={tempLine.x1} y1={tempLine.y1} x2={tempLine.x2} y2={tempLine.y2} stroke="rgba(251,191,36,0.75)" strokeWidth={1.5} strokeDasharray="4 4" />}
          </svg>

          {/* Snap target preview */}
          {snapDot && <div style={{ position: "absolute", left: snapDot.x - 8, top: snapDot.y - 8, width: 16, height: 16, borderRadius: "50%", border: "2px solid #fbbf24", pointerEvents: "none" }} />}

          {/* Draggable date dots (change / drag off to remove) */}
          {connectors.map((c) => (
            <div key={`${c.key}-dot`} onPointerDown={(e) => startRelink(e, c.cardId, c.linkId)} title="Drag to change the date · drag off the line to remove" style={{ position: "absolute", left: c.x2 - 7, top: c.y2 - 7, width: 14, height: 14, borderRadius: "50%", background: "#fbbf24", border: "2px solid rgba(8,7,12,0.9)", cursor: "ew-resize" }} />
          ))}

          {/* Event marks (static preview pills) */}
          {events.map((ev) => (
            <EventMark key={ev.id} ev={ev} x={offsetToX(offsetOfDate(ev.startsAt))} />
          ))}

          {/* Content cards */}
          {cards.map((c) => (
            <ContentCard key={c.id} card={c} uploading={uploadingIds.has(c.id)} events={events} onMove={startMove} onStartLink={startLink} onStartResize={startResizeCard} onRemoveLink={removeLink} onSet={setCard} onOpenSettings={setOpenCardId} onFill={fillCard} />
          ))}
        </div>
      )}

      {/* Settings popup — screen-space, floats beside the card, always readable */}
      {settingsCard && settingsPos && (
        <CardSettings
          card={settingsCard}
          events={events}
          left={settingsPos.left}
          top={settingsPos.top}
          side={settingsPos.side}
          width={settingsPos.w}
          onSet={setCard}
          onRemove={(id) => { removeCard(id); setOpenCardId(null); }}
          onClose={() => setOpenCardId(null)}
        />
      )}

      {!loaded && (
        <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 999, background: "rgba(18,15,26,0.9)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
          <Loader2 size={13} style={{ animation: "crm-spin 0.9s linear infinite" }} /> Loading…
        </div>
      )}

      <style>{`@keyframes crm-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
});

// Static event marker — a pill with mini thumbnail + title, on a short stem.
function EventMark({ ev, x }) {
  return (
    <div style={{ position: "absolute", left: x, top: TIMELINE_Y, transform: "translateX(-50%)", pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: "50%", top: -30, width: 2, height: 30, background: "rgba(96,165,250,0.7)", transform: "translateX(-1px)" }} />
      <div style={{ position: "absolute", left: "50%", top: -50, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 6, maxWidth: 160, padding: "3px 9px 3px 3px", borderRadius: 999, background: "rgba(20,28,46,0.95)", border: "1px solid rgba(96,165,250,0.55)" }}>
        <span style={{ width: 20, height: 20, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.08)" }}>
          {ev.thumb && <img src={ev.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        </span>
        <span style={{ fontSize: 11, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
      </div>
    </div>
  );
}

function ContentCard({ card, uploading, events, onMove, onStartLink, onStartResize, onRemoveLink, onSet, onOpenSettings, onFill }) {
  const fileRef = useRef(null);
  const url = card.mediaUrl || null;
  const isPlaceholder = !url;
  const linkedEvent = card.eventId ? (events || []).find((e) => e.id === card.eventId) : null;
  const outerW = card.w || CARD_W;
  const boxW = outerW - 12;
  const ch = card.channel ? CHANNELS[card.channel] : null;
  const ty = TYPES[card.contentType] || TYPES.image;
  const accent = ch?.color || "rgba(255,255,255,0.14)";
  const mediaH = Math.round(boxW * ty.ratio);
  const stop = (e) => e.stopPropagation();

  const linkHandle = (where) => (
    <button onPointerDown={(e) => onStartLink(e, card.id)} title="Drag onto the timeline to set a date" style={{ position: "absolute", left: "50%", [where]: -9, transform: "translateX(-50%)", width: 18, height: 18, borderRadius: "50%", background: "#fbbf24", border: "2px solid rgba(8,7,12,0.9)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "crosshair", padding: 0, zIndex: 3 }}>
      <Link2 size={9} color="#1a1505" />
    </button>
  );

  return (
    <div
      onPointerDown={(e) => onMove(e, card.id)}
      style={{ position: "absolute", left: card.x, top: card.y, width: outerW, borderRadius: 12, background: "rgba(20,16,30,0.97)", border: `1px solid ${ch ? accent : "rgba(255,255,255,0.12)"}`, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", cursor: "grab", userSelect: "none" }}
    >
      {/* Media */}
      <div style={{ padding: 6 }}>
        <div style={{ position: "relative", width: "100%", height: mediaH, borderRadius: 6, overflow: "hidden", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isPlaceholder ? (
            uploading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.5)" }}>
                <Loader2 size={20} style={{ animation: "crm-spin 0.9s linear infinite" }} />
                <span style={{ fontSize: 11 }}>Uploading…</span>
              </div>
            ) : (
              <button
                onPointerDown={stop}
                onClick={() => fileRef.current?.click()}
                title="Add content"
                style={{ position: "absolute", inset: 4, borderRadius: 6, border: "1.5px dashed rgba(255,255,255,0.22)", background: "transparent", color: "rgba(255,255,255,0.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}
              >
                <ImagePlus size={22} />
                <span style={{ fontSize: 11, fontWeight: 600 }}>Add content</span>
              </button>
            )
          ) : (
            <>
              {card.contentType === "carousel" && <div style={{ position: "absolute", inset: "4px -5px 4px 5px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)" }} />}
              {card.mediaKind === "image" ? (
                <img src={url} alt={card.mediaName || ""} draggable={false} style={{ position: "relative", width: "100%", height: "100%", objectFit: "cover" }} />
              ) : card.mediaKind === "video" ? (
                <video src={url} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : card.mediaKind === "audio" ? (
                <div style={{ width: "100%", padding: "0 6px" }}><audio src={url} controls style={{ width: "100%" }} /></div>
              ) : (
                <a href={url} target="_blank" rel="noopener noreferrer" onPointerDown={stop} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.6)", padding: 12, textDecoration: "none" }}>
                  <FileText size={20} />
                  <span style={{ fontSize: 11, textAlign: "center", wordBreak: "break-word" }}>{card.mediaName || "File"}</span>
                </a>
              )}
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" style={{ display: "none" }} onChange={(e) => { const f = (e.target.files || [])[0]; if (f) onFill(card.id, f); e.target.value = ""; }} />

          {/* Source style badge — icon (channel is obvious) + type */}
          {ch && (
            <div style={{ position: "absolute", top: 6, left: 6, display: "flex", alignItems: "center", gap: 5, padding: ch.types?.length ? "4px 9px 4px 8px" : 5, borderRadius: 999, background: accent, color: "#fff", fontSize: 11, fontWeight: 600 }}>
              <ch.Icon size={13} />
              {ch.types?.length ? <span style={{ whiteSpace: "nowrap" }}>{ty.label}</span> : null}
            </div>
          )}
          {/* Note indicator */}
          {card.note?.trim() && (
            <div title={card.note} style={{ position: "absolute", bottom: 6, left: 6, width: 22, height: 22, borderRadius: 6, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.85)" }}>
              <StickyNote size={12} />
            </div>
          )}
          {/* Gear → open the settings popup beside the card */}
          <button onPointerDown={stop} onClick={() => onOpenSettings(card.id)} title="Settings" style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 7, background: "rgba(0,0,0,0.5)", border: "none", color: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
            <Settings2 size={13} />
          </button>
        </div>
      </div>

      {/* Event + date chips — the context you always see */}
      {(linkedEvent || (card.links || []).length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 8px 8px" }} onPointerDown={stop}>
          {linkedEvent && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "#93c5fd", background: "rgba(96,165,250,0.14)", borderRadius: 5, padding: "2px 6px", maxWidth: "100%" }}>
              <CalendarDays size={11} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{linkedEvent.title}</span>
              <button onClick={() => onSet(card.id, { eventId: null })} style={{ background: "none", border: "none", color: "#93c5fd", cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={10} /></button>
            </span>
          )}
          {(card.links || []).map((l) => {
            const d = new Date(`${l.date}T00:00:00`);
            return (
              <span key={l.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "#fbbf24", background: "rgba(251,191,36,0.12)", borderRadius: 5, padding: "2px 6px" }}>
                {WEEKDAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}
                <button onClick={() => onRemoveLink(card.id, l.id)} style={{ background: "none", border: "none", color: "#fbbf24", cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={10} /></button>
              </span>
            );
          })}
        </div>
      )}

      {linkHandle("top")}
      {linkHandle("bottom")}

      {/* Resize grip — scales the media (proportions locked) */}
      <div onPointerDown={(e) => onStartResize(e, card.id)} title="Drag to resize" style={{ position: "absolute", right: 3, bottom: 3, width: 13, height: 13, cursor: "nwse-resize", zIndex: 3 }}>
        <div style={{ width: "100%", height: "100%", borderRight: "2px solid rgba(255,255,255,0.4)", borderBottom: "2px solid rgba(255,255,255,0.4)", borderBottomRightRadius: 4 }} />
      </div>
    </div>
  );
}

// Screen-space settings popup, anchored beside its card. Lives outside the
// content so it can be roomy and grow (subjects, captions/copy) later.
function CardSettings({ card, events, left, top, side, width, onSet, onRemove, onClose }) {
  const ch = card.channel ? CHANNELS[card.channel] : null;
  const allowedTypes = ch ? ch.types || [] : [];
  const showType = allowedTypes.length > 1;
  const onChannelChange = (value) => {
    const newCh = value || null;
    const allowed = newCh ? CHANNELS[newCh].types || [] : [];
    let nextType = card.contentType;
    if (allowed.length === 0) nextType = "image";
    else if (allowed.length === 1) nextType = allowed[0];
    else if (!allowed.includes(card.contentType)) nextType = allowed[0];
    onSet(card.id, { channel: newCh, contentType: nextType });
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{ position: "absolute", left, top, width, maxHeight: "calc(100% - 16px)", overflowY: "auto", borderRadius: 12, background: "rgba(16,13,22,0.99)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 16px 44px rgba(0,0,0,0.6)", zIndex: 30 }}
    >
      {/* Caret toward the card */}
      <div style={{ position: "absolute", top: 18, [side === "left" ? "left" : "right"]: -5, width: 10, height: 10, background: "rgba(16,13,22,0.99)", borderLeft: side === "left" ? "1px solid rgba(255,255,255,0.14)" : "none", borderBottom: side === "left" ? "1px solid rgba(255,255,255,0.14)" : "none", borderRight: side === "right" ? "1px solid rgba(255,255,255,0.14)" : "none", borderTop: side === "right" ? "1px solid rgba(255,255,255,0.14)" : "none", transform: "rotate(45deg)" }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 13px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>Content settings</span>
        <button onClick={onClose} title="Close" style={iconBtnStyle}><X size={14} /></button>
      </div>

      <div style={{ padding: 13, display: "flex", flexDirection: "column", gap: 11 }}>
        <Field label="Channel">
          <select value={card.channel || ""} onChange={(e) => onChannelChange(e.target.value)} style={selectStyle}>
            <option value="">Choose channel…</option>
            {Object.entries(CHANNELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </Field>
        {showType && (
          <Field label="Format">
            <select value={card.contentType} onChange={(e) => onSet(card.id, { contentType: e.target.value })} style={selectStyle}>
              {allowedTypes.map((k) => (
                <option key={k} value={k}>{TYPES[k].label}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Event">
          <select value={card.eventId || ""} onChange={(e) => onSet(card.id, { eventId: e.target.value || null })} style={selectStyle}>
            <option value="">No event</option>
            {(events || []).map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <textarea value={card.note || ""} placeholder="A reminder for later, or a note for a teammate…" onChange={(e) => onSet(card.id, { note: e.target.value })} rows={4} style={textareaStyle} />
        </Field>
        <button onClick={() => onRemove(card.id)} style={deleteBtnStyle}>
          <Trash2 size={13} /> Delete content
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.42)" }}>{label}</span>
      {children}
    </label>
  );
}

const iconBtnStyle = { width: 24, height: 24, borderRadius: 6, background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 };
const textareaStyle = { width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", fontSize: 12, lineHeight: 1.45, padding: "7px 9px", borderRadius: 7, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", outline: "none", minHeight: 66 };
const deleteBtnStyle = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", borderRadius: 7, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "rgba(248,113,113,0.95)", fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 2 };

const selectStyle = {
  width: "100%",
  boxSizing: "border-box",
  minWidth: 0,
  fontSize: 12,
  padding: "7px 8px",
  borderRadius: 7,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#fff",
  colorScheme: "dark",
  cursor: "pointer",
};
