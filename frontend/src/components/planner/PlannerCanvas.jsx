import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { FileText, Link2, X, StickyNote, CalendarDays, ImagePlus, Loader2, Image as ImageIcon, Palette, Pencil, BarChart3, RotateCcw, GripVertical, ListFilter, Trash2, Plus, Check, Keyboard } from "lucide-react";
import { colors } from "../../theme/colors.js";
import { mediaKind, loadViewport, saveViewport } from "../../lib/plannerStore.js";
import { DAY_MS, startOfDay, addDays } from "../../lib/plannerTime.js";
import { authenticatedFetch } from "../../lib/api.js";
import { supabase } from "../../lib/supabase.js";
import {
  PX_PER_DAY, BAND_H, BAND_TOP, BAND_BOTTOM, TODAY_COLOR, TIMELINE_COLOR, NEUTRAL_LINK,
  EVENT_PALETTE, CARD_W, MIN_CARD_W, MAX_CARD_W, MIN_SCALE, MAX_SCALE, SNAP_Y, WEEKDAYS, MONTHS,
  CHANNELS, TYPES, channelColor, uid, clamp, isoOf, cardFrameW, cardHeight, fmtDate, phaseOf, eventPhase,
} from "./plannerConstants.js";
import { EditFace, AnalyticsFace } from "./CardFaces.jsx";

// Serialisable card fields sent to the backend (id added separately on create).
const cardPayload = (c) => ({ x: c.x, y: c.y, w: c.w, channel: c.channel, contentType: c.contentType, eventId: c.eventId, timelineIds: c.timelineIds || [], note: c.note, links: c.links, meta: c.meta || {}, mediaUrl: c.mediaUrl, mediaPath: c.mediaPath, mediaKind: c.mediaKind, mediaName: c.mediaName, mediaMime: c.mediaMime });

const DEFAULT_STATE = { viewport: { panX: 0, panY: 0, scale: 1 }, items: [] };

const LANE_GAP = 360; // default vertical spacing when auto-placing a new lane
const LANE_PALETTE = ["#fb923c", "#60a5fa", "#f472b6", "#34d399", "#a78bfa", "#22d3ee", "#f87171", "#a3e635"];

// Which events a lane shows, given its filter.
const laneEvents = (lane, events) => (lane?.eventFilter?.mode === "selected" ? events.filter((e) => (lane.eventFilter.eventIds || []).includes(e.id)) : events);

export const PlannerCanvas = forwardRef(function PlannerCanvas({ storageKey, events = [], onSaveStatus }, ref) {
  const containerRef = useRef(null);
  const today = useMemo(() => startOfDay(new Date()), []);
  // Stable, chronological colour per event — drives "event" colour mode.
  const eventColorMap = useMemo(() => {
    const sorted = [...events].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    const m = {};
    sorted.forEach((ev, i) => { m[ev.id] = EVENT_PALETTE[i % EVENT_PALETTE.length]; });
    return m;
  }, [events]);
  const [state, setState] = useState(() => ({ viewport: loadViewport(storageKey) || DEFAULT_STATE.viewport, items: [] }));
  const [timelines, setTimelines] = useState([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [link, setLink] = useState(null);
  const [panning, setPanning] = useState(false);
  const [flippedIds, setFlippedIds] = useState(() => new Set());
  const [raisedId, setRaisedId] = useState(null); // last-clicked card/event — sits above overlapping siblings
  const [filterLaneId, setFilterLaneId] = useState(null); // lane whose event-filter popup is open
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [marquee, setMarquee] = useState(null); // rubber-band rectangle in world coords
  const [spaceDown, setSpaceDown] = useState(false); // hand-tool pan modifier
  const [showShortcuts, setShowShortcuts] = useState(false);
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  const spaceRef = useRef(false);
  const clipboardRef = useRef([]);
  const [loaded, setLoaded] = useState(false);
  const [uploadingIds, setUploadingIds] = useState(() => new Set());
  const [colorMode, setColorMode] = useState("platform"); // "platform" = by channel · "event" = by event
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
  const timelinesRef = useRef(timelines);
  useEffect(() => {
    timelinesRef.current = timelines;
  }, [timelines]);
  const saveTimers = useRef({});
  const tlTimers = useRef({});
  const vpTimer = useRef(null);

  // Autosave status surfaced to the toolbar: "saved" | "saving" | "error".
  const [saveState, setSaveState] = useState("saved");
  const inflight = useRef(0);
  const pendingIds = useRef(new Set());
  const lastError = useRef(false);
  useEffect(() => {
    onSaveStatus?.(saveState);
  }, [saveState, onSaveStatus]);

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

  // Load timelines (lanes). Bootstrap a default "All events" lane on first run.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authenticatedFetch("/host/planner/timelines");
        if (!res.ok) return;
        const data = await res.json();
        let tls = Array.isArray(data.timelines) ? data.timelines : [];
        if (!tls.length) {
          const def = { id: uid(), name: "All events", color: LANE_PALETTE[0], y: 0, sort: 0, eventFilter: { mode: "all", eventIds: [] } };
          tls = [def];
          authenticatedFetch("/host/planner/timelines", { method: "POST", body: JSON.stringify(def) }).catch(() => {});
        }
        if (alive) setTimelines(tls);
      } catch {
        /* ignore — lanes just won't render */
      }
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

  // Nearest lane to a world-y (used for snapping links and placing new cards).
  const nearestLaneId = useCallback((wy) => {
    const tls = timelinesRef.current;
    if (!tls.length) return null;
    let best = tls[0], bd = Infinity;
    for (const t of tls) { const dist = Math.abs(wy - t.y); if (dist < bd) { bd = dist; best = t; } }
    return best.id;
  }, []);

  // ── DB persistence + autosave status ──────────────────────────────
  const recalc = useCallback(() => {
    setSaveState(pendingIds.current.size > 0 || inflight.current > 0 ? "saving" : lastError.current ? "error" : "saved");
  }, []);

  // authenticatedFetch wrapped to drive the autosave indicator.
  const trackFetch = useCallback(
    async (url, opts) => {
      inflight.current += 1;
      recalc();
      try {
        const res = await authenticatedFetch(url, opts);
        lastError.current = !res.ok;
        return res;
      } catch (e) {
        lastError.current = true;
        throw e;
      } finally {
        inflight.current = Math.max(0, inflight.current - 1);
        recalc();
      }
    },
    [recalc],
  );

  const queueSave = useCallback(
    (id) => {
      clearTimeout(saveTimers.current[id]);
      if (!pendingIds.current.has(id)) {
        pendingIds.current.add(id);
        recalc();
      }
      saveTimers.current[id] = setTimeout(() => {
        pendingIds.current.delete(id);
        const c = stateRef.current.items.find((x) => x.id === id);
        if (!c) {
          recalc();
          return;
        }
        trackFetch(`/host/planner/cards/${id}`, { method: "PATCH", body: JSON.stringify(cardPayload(c)) }).catch(() => {});
      }, 400);
    },
    [recalc, trackFetch],
  );

  const createCardRemote = useCallback(
    async (c) => {
      await trackFetch("/host/planner/cards", { method: "POST", body: JSON.stringify({ id: c.id, ...cardPayload(c) }) }).catch(() => {});
    },
    [trackFetch],
  );

  const deleteCardRemote = useCallback(
    (id) => {
      clearTimeout(saveTimers.current[id]);
      pendingIds.current.delete(id);
      trackFetch(`/host/planner/cards/${id}`, { method: "DELETE" }).catch(() => {});
    },
    [trackFetch],
  );

  // ── Timeline (lane) persistence ───────────────────────────────────
  const queueSaveTimeline = useCallback(
    (id) => {
      clearTimeout(tlTimers.current[id]);
      if (!pendingIds.current.has(id)) {
        pendingIds.current.add(id);
        recalc();
      }
      tlTimers.current[id] = setTimeout(() => {
        pendingIds.current.delete(id);
        const t = timelinesRef.current.find((x) => x.id === id);
        if (!t) {
          recalc();
          return;
        }
        trackFetch(`/host/planner/timelines/${id}`, { method: "PATCH", body: JSON.stringify({ name: t.name, color: t.color, y: t.y, sort: t.sort, eventFilter: t.eventFilter }) }).catch(() => {});
      }, 400);
    },
    [recalc, trackFetch],
  );

  const setTimeline = useCallback(
    (id, patch) => {
      setTimelines((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      queueSaveTimeline(id);
    },
    [queueSaveTimeline],
  );

  const createTimeline = useCallback(() => {
    const tls = timelinesRef.current;
    const maxY = tls.reduce((m, t) => Math.max(m, t.y), 0);
    const maxSort = tls.reduce((m, t) => Math.max(m, t.sort), -1);
    const t = { id: uid(), name: "New timeline", color: LANE_PALETTE[tls.length % LANE_PALETTE.length], y: tls.length ? maxY + LANE_GAP : 0, sort: maxSort + 1, eventFilter: { mode: "all", eventIds: [] } };
    setTimelines((p) => [...p, t]);
    trackFetch("/host/planner/timelines", { method: "POST", body: JSON.stringify(t) }).catch(() => {});
  }, [trackFetch]);

  const deleteTimeline = useCallback(
    (id) => {
      clearTimeout(tlTimers.current[id]);
      pendingIds.current.delete(id);
      setTimelines((p) => p.filter((t) => t.id !== id));
      setState((s) => ({
        ...s,
        items: s.items.map((c) => ((c.timelineIds || []).includes(id) ? { ...c, timelineIds: c.timelineIds.filter((x) => x !== id) } : c)),
      }));
      stateRef.current.items.forEach((c) => { if ((c.timelineIds || []).includes(id)) queueSave(c.id); });
      if (filterLaneId === id) setFilterLaneId(null);
      trackFetch(`/host/planner/timelines/${id}`, { method: "DELETE" }).catch(() => {});
    },
    [trackFetch, filterLaneId, queueSave],
  );

  const cycleColor = useCallback(
    (id) => {
      const t = timelinesRef.current.find((x) => x.id === id);
      const i = Math.max(0, LANE_PALETTE.indexOf(t?.color));
      setTimeline(id, { color: LANE_PALETTE[(i + 1) % LANE_PALETTE.length] });
    },
    [setTimeline],
  );

  const uploadMedia = useCallback(
    async (file) => {
      inflight.current += 1;
      recalc();
      try {
        const res = await authenticatedFetch("/host/planner/upload-url", { method: "POST", body: JSON.stringify({ mimeType: file.type }) });
        if (!res.ok) throw new Error("upload-url failed");
        const tok = await res.json();
        const { error } = await supabase.storage.from(tok.bucket).uploadToSignedUrl(tok.path, tok.token, file);
        if (error) throw error;
        lastError.current = false;
        return { url: tok.publicUrl, path: tok.path };
      } catch (e) {
        lastError.current = true;
        throw e;
      } finally {
        inflight.current = Math.max(0, inflight.current - 1);
        recalc();
      }
    },
    [recalc],
  );

  const markUploading = useCallback((id, on) => {
    setUploadingIds((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);

  const toggleFlip = useCallback((id) => {
    setFlippedIds((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const bringToFront = useCallback((id) => setRaisedId(id), []);

  // ── Selection commands (keyboard / clipboard) ─────────────────────
  // Clones keep their media URL but drop media_path so deleting a copy never
  // removes the original's stored file.
  const duplicateCards = useCallback(
    (ids, dx, dy) => {
      const src = stateRef.current.items.filter((c) => ids.includes(c.id));
      const clones = src.map((c) => ({ ...c, id: uid(), x: c.x + dx, y: c.y + dy, mediaPath: null }));
      if (clones.length) {
        setState((s) => ({ ...s, items: [...s.items, ...clones] }));
        clones.forEach((c) => createCardRemote(c));
      }
      return clones;
    },
    [createCardRemote],
  );

  const deleteSelected = useCallback(() => {
    const ids = [...selectedIdsRef.current];
    if (!ids.length) return;
    setState((s) => ({ ...s, items: s.items.filter((c) => !ids.includes(c.id)) }));
    setFlippedIds((p) => { const n = new Set(p); ids.forEach((id) => n.delete(id)); return n; });
    ids.forEach((id) => deleteCardRemote(id));
    setSelectedIds(new Set());
  }, [deleteCardRemote]);

  const pasteClipboard = useCallback(() => {
    const items = clipboardRef.current;
    if (!items?.length) return;
    const base = viewportCenterWorld();
    const minX = Math.min(...items.map((i) => i.x));
    const minY = Math.min(...items.map((i) => i.y));
    const clones = items.map((p) => ({ ...p, id: uid(), x: base.x + (p.x - minX), y: base.y + (p.y - minY), mediaPath: null }));
    setState((s) => ({ ...s, items: [...s.items, ...clones] }));
    clones.forEach((c) => createCardRemote(c));
    setSelectedIds(new Set(clones.map((c) => c.id)));
  }, [viewportCenterWorld, createCardRemote]);

  const zoomBy = useCallback((factor) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    setState((s) => {
      const { panX, panY, scale } = s.viewport;
      const ns = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
      return { ...s, viewport: { ...s.viewport, scale: ns, panX: cx - ((cx - panX) / scale) * ns, panY: cy - ((cy - panY) / scale) * ns } };
    });
  }, []);

  const resetZoom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    setState((s) => {
      const { panX, panY, scale } = s.viewport;
      return { ...s, viewport: { ...s.viewport, scale: 1, panX: cx - (cx - panX) / scale, panY: cy - (cy - panY) / scale } };
    });
  }, []);

  const addFiles = useCallback(
    async (files, at) => {
      const base = at || viewportCenterWorld();
      let i = 0;
      for (const file of files) {
        const id = uid();
        const o = i * 22;
        const lid = nearestLaneId(base.y);
        const card = { id, x: base.x - CARD_W / 2 + o, y: base.y - 110 + o, w: CARD_W, channel: null, contentType: "image", eventId: null, timelineIds: lid ? [lid] : [], note: "", meta: {}, mediaUrl: null, mediaPath: null, mediaKind: "placeholder", mediaName: file.name, mediaMime: file.type, links: [] };
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
    [update, viewportCenterWorld, nearestLaneId, createCardRemote, uploadMedia, queueSave, markUploading],
  );

  // An empty placeholder card — wireframe a slot now, fill it with media later.
  const addPlaceholder = useCallback(() => {
    const base = viewportCenterWorld();
    const lid = nearestLaneId(base.y);
    const card = { id: uid(), x: base.x - CARD_W / 2, y: base.y - 110, w: CARD_W, channel: null, contentType: "image", eventId: null, timelineIds: lid ? [lid] : [], note: "", meta: {}, mediaUrl: null, mediaPath: null, mediaKind: "placeholder", mediaName: null, mediaMime: null, links: [] };
    update((s) => ({ ...s, items: [...s.items, card] }));
    createCardRemote(card);
  }, [update, viewportCenterWorld, nearestLaneId, createCardRemote]);

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
        let dx = w.x - d.wx0, dy = w.y - d.wy0;
        if (e.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; } // constrain to an axis
        update((s) => ({ ...s, items: s.items.map((it) => { const st = d.starts[it.id]; return st ? { ...it, x: st.x + dx, y: st.y + dy } : it; }) }));
        d.ids.forEach((mid) => queueSave(mid));
      } else if (d.type === "marquee") {
        const w = screenToWorld(e.clientX, e.clientY);
        setMarquee({ x0: d.x0, y0: d.y0, x1: w.x, y1: w.y });
        const rx0 = Math.min(d.x0, w.x), rx1 = Math.max(d.x0, w.x), ry0 = Math.min(d.y0, w.y), ry1 = Math.max(d.y0, w.y);
        const hit = new Set(d.base);
        for (const c of stateRef.current.items) {
          if (c.x < rx1 && c.x + cardFrameW(c) > rx0 && c.y < ry1 && c.y + cardHeight(c) > ry0) hit.add(c.id);
        }
        setSelectedIds(hit);
      } else if (d.type === "lane") {
        const w = screenToWorld(e.clientX, e.clientY);
        setTimelines((p) => p.map((t) => (t.id === d.id ? { ...t, y: d.y0 + (w.y - d.wy0) } : t)));
        queueSaveTimeline(d.id);
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
      if (d?.type === "marquee") { setMarquee(null); return; }
      if (d?.type === "link") {
        const w = screenToWorld(e.clientX, e.clientY);
        const tls = timelinesRef.current;
        let lane = null, ld = Infinity;
        for (const t of tls) { const dist = Math.abs(w.y - t.y); if (dist < ld) { ld = dist; lane = t; } }
        if (lane && ld < SNAP_Y) {
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
              // Dropping onto a lane ADDS it — drop on a second lane to co-post.
              const curLanes = c.timelineIds?.length ? c.timelineIds : c.timelineId ? [c.timelineId] : [];
              const timelineIds = curLanes.includes(lane.id) ? curLanes : [...curLanes, lane.id];
              return { ...c, links, eventId: c.eventId || (ev ? ev.id : null), timelineIds };
            }),
          }));
          queueSave(d.cardId);
        }
        setLink(null);
      } else if (d?.type === "relink") {
        // Dragged far from every lane it's on → unlink.
        const w = screenToWorld(e.clientX, e.clientY);
        const card = stateRef.current.items.find((c) => c.id === d.cardId);
        const ids = card?.timelineIds?.length ? card.timelineIds : card?.timelineId ? [card.timelineId] : [];
        const lys = ids.map((id) => timelinesRef.current.find((t) => t.id === id)?.y).filter((v) => v != null);
        const nearestY = lys.length ? lys.reduce((a, b) => (Math.abs(w.y - b) < Math.abs(w.y - a) ? b : a)) : timelinesRef.current[0]?.y ?? 0;
        if (Math.abs(w.y - nearestY) > 110) {
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
  }, [screenToWorld, update, setViewport, dateAtX, offsetOfDate, today, queueSave, queueSaveTimeline]);

  // ── Keyboard shortcuts (Illustrator / Figma muscle memory) ────────
  useEffect(() => {
    const inField = () => {
      const el = document.activeElement;
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const onKeyDown = (e) => {
      if (e.code === "Space" && !inField()) {
        spaceRef.current = true;
        setSpaceDown(true);
        e.preventDefault();
        return;
      }
      if (inField()) {
        if (e.key === "Escape") e.target.blur?.();
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      const sel = selectedIdsRef.current;
      if (e.key === "Escape") { setSelectedIds(new Set()); setFilterLaneId(null); setShowShortcuts(false); return; }
      if (meta && (e.key === "a" || e.key === "A")) { e.preventDefault(); setSelectedIds(new Set(stateRef.current.items.map((c) => c.id))); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && sel.size) { e.preventDefault(); deleteSelected(); return; }
      if (meta && (e.key === "d" || e.key === "D") && sel.size) { e.preventDefault(); const clones = duplicateCards([...sel], 18, 18); setSelectedIds(new Set(clones.map((c) => c.id))); return; }
      if (meta && (e.key === "c" || e.key === "C") && sel.size) { clipboardRef.current = stateRef.current.items.filter((c) => sel.has(c.id)).map(cardPayload); return; }
      if (meta && (e.key === "v" || e.key === "V") && clipboardRef.current?.length) { e.preventDefault(); pasteClipboard(); return; }
      if (meta && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomBy(1.2); return; }
      if (meta && (e.key === "-" || e.key === "_")) { e.preventDefault(); zoomBy(1 / 1.2); return; }
      if (meta && e.key === "0") { e.preventDefault(); resetZoom(); return; }
      if (sel.size && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (dx || dy) {
          update((s) => ({ ...s, items: s.items.map((it) => (sel.has(it.id) ? { ...it, x: it.x + dx, y: it.y + dy } : it)) }));
          sel.forEach((id) => queueSave(id));
        }
        return;
      }
    };
    const onKeyUp = (e) => {
      if (e.code === "Space") { spaceRef.current = false; setSpaceDown(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [deleteSelected, duplicateCards, pasteClipboard, zoomBy, resetZoom, update, queueSave]);

  const beginPan = (e) => {
    drag.current = { type: "pan", sx: e.clientX, sy: e.clientY, panX0: state.viewport.panX, panY0: state.viewport.panY };
    setPanning(true);
  };
  // Empty-canvas press: Space/middle-button pans (Adobe hand tool); otherwise rubber-band select.
  const startCanvasPointer = (e) => {
    if (e.button === 1 || spaceRef.current) { beginPan(e); return; }
    if (e.button !== 0) return;
    setFilterLaneId(null);
    const w = screenToWorld(e.clientX, e.clientY);
    const base = e.shiftKey ? new Set(selectedIdsRef.current) : new Set();
    if (!e.shiftKey) setSelectedIds(new Set());
    drag.current = { type: "marquee", x0: w.x, y0: w.y, base };
    setMarquee({ x0: w.x, y0: w.y, x1: w.x, y1: w.y });
  };
  const startMove = (e, id) => {
    e.stopPropagation();
    if (e.button === 1 || spaceRef.current) { beginPan(e); return; }
    bringToFront(id);
    const cur = selectedIdsRef.current;
    if (e.shiftKey) {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id); else n.add(id);
      setSelectedIds(n);
      return; // shift-click only adjusts the selection
    }
    let ids = cur.has(id) ? [...cur] : [id];
    if (!cur.has(id)) setSelectedIds(new Set([id]));
    if (e.altKey) { // Alt-drag → duplicate, then drag the copies
      const clones = duplicateCards(ids, 0, 0);
      ids = clones.map((c) => c.id);
      setSelectedIds(new Set(ids));
    }
    const w = screenToWorld(e.clientX, e.clientY);
    const starts = {};
    for (const mid of ids) { const it = stateRef.current.items.find((i) => i.id === mid); if (it) starts[mid] = { x: it.x, y: it.y }; }
    drag.current = { type: "move", ids, starts, wx0: w.x, wy0: w.y };
  };
  const startLaneDrag = (e, id) => {
    e.stopPropagation();
    const w = screenToWorld(e.clientX, e.clientY);
    const t = timelines.find((x) => x.id === id);
    drag.current = { type: "lane", id, wy0: w.y, y0: t?.y ?? 0 };
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
    setFlippedIds((p) => { const n = new Set(p); n.delete(id); return n; });
    deleteCardRemote(id); // backend also removes the storage object
  };
  const removeLink = (cardId, linkId) => {
    update((s) => ({ ...s, items: s.items.map((c) => (c.id === cardId ? { ...c, links: (c.links || []).filter((l) => l.id !== linkId) } : c)) }));
    queueSave(cardId);
  };

  const { panX, panY, scale } = state.viewport;
  const cards = state.items;

  // The lanes a card belongs to (co-posted content lives on several). Falls back
  // to the first lane / origin. Reads timelineIds, with the old single timelineId
  // as a migration fallback.
  const lanesOf = (c) => {
    const ids = c.timelineIds?.length ? c.timelineIds : c.timelineId ? [c.timelineId] : [];
    const ls = ids.map((id) => timelines.find((t) => t.id === id)).filter(Boolean);
    return ls.length ? ls : timelines[0] ? [timelines[0]] : [{ id: null, y: 0, color: NEUTRAL_LINK }];
  };

  // What a content card's link chain is coloured by, per mode:
  //   source → its channel (channel spread)   event → its linked event (event distribution)
  const cardLinkColor = (c) =>
    colorMode === "event" ? (c.eventId ? eventColorMap[c.eventId] || NEUTRAL_LINK : NEUTRAL_LINK) : channelColor(c.channel);
  // Event marks stay blue in source mode; take their palette colour in event mode.
  const eventMarkColor = (ev) => (colorMode === "event" ? eventColorMap[ev.id] || TIMELINE_COLOR : TIMELINE_COLOR);
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

  // Connector anchor: card edge nearest its lane band.
  const cardAnchorY = (c, ly) => {
    const top = c.y;
    const bot = c.y + cardHeight(c);
    return Math.abs(top - ly) <= Math.abs(bot - ly) ? top : bot;
  };
  const bandEdgeFor = (c, ly) => (cardAnchorY(c, ly) <= ly ? ly + BAND_TOP : ly + BAND_BOTTOM);

  // Co-posted content fans a connector to EACH of its lanes' bands.
  const connectors = [];
  for (const c of cards) {
    const color = cardLinkColor(c);
    const lanes = lanesOf(c);
    for (const lane of lanes) {
      const ly = lane.y;
      for (const l of c.links || []) {
        connectors.push({ key: `${c.id}-${lane.id}-${l.id}`, cardId: c.id, linkId: l.id, color, x1: c.x + cardFrameW(c) / 2, y1: cardAnchorY(c, ly), x2: offsetToX(offsetOfDate(`${l.date}T00:00:00`)), y2: bandEdgeFor(c, ly), bandTop: ly + BAND_TOP });
      }
    }
  }

  let tempLine = null;
  let snapDot = null;
  if (link) {
    const c = cards.find((x) => x.id === link.cardId);
    if (c) {
      let lane = null, ld = Infinity;
      for (const t of timelines) { const dist = Math.abs(link.world.y - t.y); if (dist < ld) { ld = dist; lane = t; } }
      const near = lane && ld < SNAP_Y;
      const anchorLaneY = near ? lane.y : lanesOf(c)[0].y;
      const color = cardLinkColor(c);
      const edgeY = near ? bandEdgeFor(c, lane.y) : null;
      const x2 = near ? xToOffset(link.world.x) * PX_PER_DAY : link.world.x;
      const y2 = near ? edgeY : link.world.y;
      tempLine = { x1: c.x + cardFrameW(c) / 2, y1: cardAnchorY(c, anchorLaneY), x2, y2, color };
      if (near) snapDot = { x: x2, y: edgeY, color };
    }
  }

  // Each lane's content extent — header floats just above `top`, group tint fills [top, bottom],
  // and both grow as the lane's events/cards spread further up or down.
  const laneExtents = {};
  for (const lane of timelines) {
    let top = lane.y + BAND_TOP;
    let bottom = lane.y + BAND_BOTTOM + 38; // include the date ticks under the band
    if (laneEvents(lane, events).length) top = Math.min(top, lane.y + BAND_TOP - 9 - EVENT_FRONT_H);
    for (const c of cards) {
      if (!lanesOf(c).some((l) => l.id === lane.id)) continue;
      top = Math.min(top, c.y);
      bottom = Math.max(bottom, c.y + cardHeight(c));
    }
    laneExtents[lane.id] = { top: top - 14, bottom: bottom + 8 };
  }

  const filterLane = filterLaneId ? timelines.find((t) => t.id === filterLaneId) : null;
  const filterExt = filterLane ? laneExtents[filterLane.id] : null;
  const filterPopupTop = filterExt ? clamp(filterExt.top * scale + panY - 44, 8, Math.max(8, size.h - 52)) + 46 : 60;

  return (
    <div
      ref={containerRef}
      onPointerDown={startCanvasPointer}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = [...(e.dataTransfer?.files || [])];
        if (files.length) addFiles(files, screenToWorld(e.clientX, e.clientY));
      }}
      style={{ position: "absolute", inset: 0, overflow: "hidden", cursor: panning ? "grabbing" : spaceDown ? "grab" : "default", background: `radial-gradient(circle at 1px 1px, ${colors.borderFaint} 1px, transparent 0) 0 0 / 28px 28px, ${colors.surface}`, touchAction: "none" }}
    >
      {ready && (
        <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(${panX}px, ${panY}px) scale(${scale})`, transformOrigin: "0 0" }}>
          {/* The past — everything left of Today is settled. A cool wash sets it apart… */}
          <div style={{ position: "absolute", left: -100000, top: -100000, width: 100000, height: 200000, background: "rgba(10,10,10,0.03)", pointerEvents: "none" }} />
          {/* …with a subtle gradient right at the seam. */}
          <div style={{ position: "absolute", left: -90, top: -100000, width: 90, height: 200000, background: "linear-gradient(90deg, transparent, rgba(10,10,10,0.04))", pointerEvents: "none" }} />
          {/* The seam itself — an amber line cutting the whole canvas at Today. */}
          <div style={{ position: "absolute", left: 0, top: -100000, width: 1.5, height: 200000, background: TODAY_COLOR, opacity: 0.6, transform: "translateX(-0.75px)", pointerEvents: "none" }} />

          {/* Each lane's group tint — a soft band behind everything it owns, so the grouping reads */}
          {timelines.map((lane) => {
            const ext = laneExtents[lane.id];
            if (!ext) return null;
            return (
              <div key={`tint-${lane.id}`} style={{ position: "absolute", left: dayMin * PX_PER_DAY, top: ext.top, width: (dayMax - dayMin) * PX_PER_DAY, height: ext.bottom - ext.top, background: `${lane.color}10`, borderTop: `1px solid ${lane.color}33`, borderRadius: 6, pointerEvents: "none" }} />
            );
          })}

          {/* Each lane: a band tinted in its colour, with Today cutting through + its own date ticks */}
          {timelines.map((lane) => {
            const bandTop = lane.y + BAND_TOP;
            const bandBottom = lane.y + BAND_BOTTOM;
            return (
              <div key={`lane-${lane.id}`}>
                <div style={{ position: "absolute", left: dayMin * PX_PER_DAY, top: bandTop, width: (dayMax - dayMin) * PX_PER_DAY, height: BAND_H, background: `${lane.color}12`, borderTop: `3px solid ${lane.color}66`, borderBottom: `3px solid ${lane.color}66`, pointerEvents: "none" }} />
                {/* Today mark through this band */}
                <div style={{ position: "absolute", left: 0, top: bandTop - 7, width: 2, height: BAND_H + 14, borderRadius: 1, background: TODAY_COLOR, transform: "translateX(-1px)", pointerEvents: "none" }} />
                {/* Date ticks + labels under this band */}
                {ticks.map((o) => {
                  const d = addDays(today, o);
                  const isToday = o === 0;
                  const showMonth = isToday || d.getDate() === 1;
                  return (
                    <div key={`${lane.id}-${o}`} style={{ position: "absolute", left: o * PX_PER_DAY, top: bandBottom + 5, transform: "translateX(-50%)", textAlign: "center", pointerEvents: "none" }}>
                      {isToday ? <div style={{ height: 6 }} /> : <div style={{ width: 1, height: 6, margin: "0 auto", background: "rgba(10,10,10,0.18)" }} />}
                      <div style={{ marginTop: 3, fontSize: 9, lineHeight: 1.15, color: isToday ? TODAY_COLOR : "rgba(10,10,10,0.45)", fontWeight: isToday ? 700 : 400, whiteSpace: "nowrap" }}>
                        <div style={{ opacity: isToday ? 1 : 0.7 }}>{isToday ? "Today" : WEEKDAYS[d.getDay()]}</div>
                        <div>{showMonth ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : d.getDate()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Content link marks — channel-coloured, sit within their lane's band */}
          {connectors.map((c) => (
            <div key={`${c.key}-mark`} style={{ position: "absolute", left: c.x2, top: c.bandTop, width: 2, height: BAND_H, background: c.color, opacity: 0.85, transform: "translateX(-1px)", pointerEvents: "none" }} />
          ))}

          {/* Connectors — each in its content's channel colour */}
          <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
            {connectors.map((c) => (
              <line key={c.key} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={c.color} strokeOpacity={0.7} strokeWidth={1.75} />
            ))}
            {tempLine && <line x1={tempLine.x1} y1={tempLine.y1} x2={tempLine.x2} y2={tempLine.y2} stroke={tempLine.color} strokeWidth={1.75} strokeDasharray="4 4" />}
          </svg>

          {/* Snap target preview */}
          {snapDot && <div style={{ position: "absolute", left: snapDot.x - 8, top: snapDot.y - 8, width: 16, height: 16, borderRadius: "50%", border: `2px solid ${snapDot.color}`, pointerEvents: "none" }} />}

          {/* Draggable date dots (change / drag off to remove) */}
          {connectors.map((c) => (
            <div key={`${c.key}-dot`} onPointerDown={(e) => startRelink(e, c.cardId, c.linkId)} title="Drag to change the date · drag off the line to remove" style={{ position: "absolute", left: c.x2 - 7, top: c.y2 - 7, width: 14, height: 14, borderRadius: "50%", background: c.color, border: `2px solid ${colors.background}`, cursor: "ew-resize" }} />
          ))}

          {/* Event banners — filtered per lane, sit on that lane's mark */}
          {timelines.map((lane) =>
            laneEvents(lane, events).map((ev) => {
              const bannerKey = `${lane.id}:${ev.id}`;
              return (
                <EventBanner
                  key={bannerKey}
                  ev={ev}
                  x={offsetToX(offsetOfDate(ev.startsAt))}
                  laneY={lane.y}
                  color={eventMarkColor(ev)}
                  phase={eventPhase(ev, today)}
                  flipped={flippedIds.has(bannerKey)}
                  raised={raisedId === bannerKey}
                  onRaise={() => bringToFront(bannerKey)}
                  onToggleFlip={() => toggleFlip(bannerKey)}
                />
              );
            }),
          )}

          {/* Content cards */}
          {cards.map((c) => (
            <ContentCard
              key={c.id}
              card={c}
              uploading={uploadingIds.has(c.id)}
              events={events}
              timelines={timelines}
              linkColor={cardLinkColor(c)}
              phase={phaseOf(c, today)}
              flipped={flippedIds.has(c.id)}
              raised={raisedId === c.id}
              selected={selectedIds.has(c.id)}
              coLanes={lanesOf(c).length > 1 ? lanesOf(c) : null}
              onRaise={() => bringToFront(c.id)}
              onMove={startMove}
              onStartLink={startLink}
              onStartResize={startResizeCard}
              onRemoveLink={removeLink}
              onSet={setCard}
              onToggleFlip={toggleFlip}
              onRemove={removeCard}
              onFill={fillCard}
            />
          ))}

          {/* Rubber-band selection rectangle */}
          {marquee && (
            <div style={{ position: "absolute", left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0), background: "rgba(236,23,143,0.06)", border: `1px solid ${colors.accentBorder}`, borderRadius: 2, pointerEvents: "none" }} />
          )}
        </div>
      )}

      {/* Lane headings — float just above each lane's content, rising as it grows */}
      {ready &&
        timelines.map((lane) => {
          const ext = laneExtents[lane.id];
          if (!ext) return null;
          const topY = clamp(ext.top * scale + panY - 44, 8, Math.max(8, size.h - 52));
          return (
            <LaneHeading
              key={`head-${lane.id}`}
              lane={lane}
              top={topY}
              shown={laneEvents(lane, events).length}
              soleLane={timelines.length <= 1}
              filterOpen={filterLaneId === lane.id}
              onStartDrag={(e) => startLaneDrag(e, lane.id)}
              onRename={(name) => setTimeline(lane.id, { name })}
              onRecolor={() => cycleColor(lane.id)}
              onOpenFilter={() => setFilterLaneId((id) => (id === lane.id ? null : lane.id))}
              onDelete={() => deleteTimeline(lane.id)}
            />
          );
        })}

      {/* Event-filter popup for the open lane */}
      {filterLane && (
        <LaneFilterPopup
          lane={filterLane}
          events={events}
          left={14}
          top={clamp(filterPopupTop, 8, Math.max(8, size.h - 360))}
          onChange={(eventFilter) => setTimeline(filterLane.id, { eventFilter })}
          onClose={() => setFilterLaneId(null)}
        />
      )}

      {/* Add timeline — bottom-left, clear of the centre toolbar */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={createTimeline}
        style={{ position: "absolute", left: 14, bottom: 22, zIndex: 16, display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 11, background: colors.background, border: `1px solid ${colors.border}`, color: colors.text, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 14px rgba(10,10,10,0.08)" }}
      >
        <Plus size={16} /> Add timeline
      </button>

      {/* Keyboard shortcuts — discoverable cheat sheet */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setShowShortcuts((v) => !v)}
        title="Keyboard shortcuts"
        style={{ position: "absolute", left: 14, bottom: 70, zIndex: 16, width: 34, height: 34, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", background: showShortcuts ? colors.accentSoft : colors.background, border: `1px solid ${showShortcuts ? colors.accentBorder : colors.border}`, color: showShortcuts ? colors.accent : colors.textMuted, cursor: "pointer", boxShadow: "0 4px 14px rgba(10,10,10,0.08)" }}
      >
        <Keyboard size={16} />
      </button>
      {showShortcuts && (
        <div onPointerDown={(e) => e.stopPropagation()} style={{ position: "absolute", left: 14, bottom: 112, zIndex: 30, width: 270, padding: "12px 14px", borderRadius: 12, background: colors.background, border: `1px solid ${colors.border}`, boxShadow: "0 12px 36px rgba(10,10,10,0.12)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.text, marginBottom: 9 }}>Shortcuts</div>
          {[
            ["Duplicate (hold + drag)", "⌥ drag"],
            ["Duplicate in place", "⌘ D"],
            ["Multi-select", "Shift-click / drag"],
            ["Select all · deselect", "⌘A · Esc"],
            ["Nudge · ×10", "Arrows · ⇧"],
            ["Constrain drag to axis", "⇧ drag"],
            ["Delete", "Del / ⌫"],
            ["Copy · paste", "⌘C · ⌘V"],
            ["Pan", "Space-drag / scroll"],
            ["Zoom · reset", "⌘± · ⌘0"],
          ].map(([label, keys]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "3px 0", fontSize: 11.5 }}>
              <span style={{ color: colors.textMuted }}>{label}</span>
              <span style={{ color: colors.text, fontWeight: 600, whiteSpace: "nowrap" }}>{keys}</span>
            </div>
          ))}
        </div>
      )}

      {/* Colour-mode toggle — top-right. Flips what the content colour-coding means. */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{ position: "absolute", top: 14, right: 14, display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 6px 5px 10px", borderRadius: 11, background: colors.background, border: `1px solid ${colors.border}`, boxShadow: "0 4px 14px rgba(10,10,10,0.08)", zIndex: 20 }}
      >
        <Palette size={14} color={colors.textSubtle} />
        <div style={{ display: "inline-flex", padding: 3, borderRadius: 8, background: colors.surface }}>
          {[["platform", "Platform"], ["event", "Event"]].map(([m, label]) => (
            <button
              key={m}
              onClick={() => setColorMode(m)}
              title={m === "platform" ? "Colour content by platform — read channel spread" : "Colour content by event — read event distribution"}
              style={{ padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: colorMode === m ? colors.background : "transparent", color: colorMode === m ? colors.text : colors.textSubtle }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!loaded && (
        <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 999, background: colors.background, border: `1px solid ${colors.border}`, color: colors.textMuted, fontSize: 12 }}>
          <Loader2 size={13} style={{ animation: "crm-spin 0.9s linear infinite" }} /> Loading…
        </div>
      )}

      <style>{`@keyframes crm-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
});

// ── Lane heading (screen-space, pinned left, tracks its band's y) ─────
function LaneHeading({ lane, top, shown, soleLane, filterOpen, onStartDrag, onRename, onRecolor, onOpenFilter, onDelete }) {
  const filtered = lane.eventFilter?.mode === "selected";
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{ position: "absolute", left: 14, top, zIndex: 15, display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 8px 0 4px", borderRadius: 10, background: colors.background, border: `1px solid ${lane.color}88`, boxShadow: `0 4px 14px rgba(10,10,10,0.08), 0 0 0 1px ${lane.color}22`, maxWidth: 340 }}
    >
      <span onPointerDown={onStartDrag} title="Drag to move this timeline" style={{ display: "flex", alignItems: "center", color: colors.textSubtle, cursor: "grab", flexShrink: 0 }}>
        <GripVertical size={15} />
      </span>
      <button onClick={onRecolor} title="Change colour" style={{ width: 14, height: 14, borderRadius: "50%", background: lane.color, border: `1px solid ${colors.border}`, cursor: "pointer", padding: 0, flexShrink: 0 }} />
      <input
        value={lane.name}
        onChange={(e) => onRename(e.target.value)}
        onFocus={(e) => e.target.select()}
        spellCheck={false}
        style={{ minWidth: 0, width: Math.min(150, Math.max(54, (lane.name?.length || 8) * 8)), background: "transparent", border: "none", outline: "none", color: colors.text, fontSize: 13, fontWeight: 700 }}
      />
      <button onClick={onOpenFilter} title="Choose which events show on this timeline" style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, padding: "4px 8px", borderRadius: 7, background: filterOpen ? colors.accentSoft : filtered ? `${lane.color}18` : colors.borderFaint, border: `1px solid ${filtered ? lane.color + "55" : colors.border}`, color: filtered ? colors.text : colors.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
        <ListFilter size={12} /> {filtered ? `${shown} event${shown === 1 ? "" : "s"}` : "All events"}
      </button>
      {!soleLane && (
        <button onClick={onDelete} title="Delete this timeline" style={{ display: "flex", alignItems: "center", flexShrink: 0, color: colors.danger, background: "none", border: "none", cursor: "pointer", padding: 1 }}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function FilterRow({ checked, color, onClick, children }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 9px", borderRadius: 8, border: "none", background: "transparent", color: colors.text, cursor: "pointer", textAlign: "left" }}>
      <span style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: checked ? color || colors.secondary : colors.borderFaint, border: `1px solid ${checked ? color || colors.secondary : colors.border}` }}>
        {checked && <Check size={11} color="#fff" strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}

function LaneFilterPopup({ lane, events, left, top, onChange, onClose }) {
  const mode = lane.eventFilter?.mode || "all";
  const ids = lane.eventFilter?.eventIds || [];
  const allIds = events.map((e) => e.id);
  const shows = (id) => mode === "all" || ids.includes(id);
  const toggleAll = () => onChange(mode === "all" ? { mode: "selected", eventIds: [] } : { mode: "all", eventIds: [] });
  const toggleOne = (id) => {
    if (mode === "all") onChange({ mode: "selected", eventIds: allIds.filter((x) => x !== id) });
    else onChange({ mode: "selected", eventIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  };
  return (
    <div onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} style={{ position: "absolute", left, top, width: 264, maxHeight: 348, display: "flex", flexDirection: "column", zIndex: 30, borderRadius: 12, background: colors.background, border: `1px solid ${colors.border}`, boxShadow: "0 12px 36px rgba(10,10,10,0.12)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: `1px solid ${colors.border}` }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: colors.text }}>Events on "{lane.name}"</span>
        <button onClick={onClose} style={{ width: 22, height: 22, borderRadius: 6, background: colors.borderFaint, border: "none", color: colors.textMuted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><X size={13} /></button>
      </div>
      <div style={{ overflowY: "auto", padding: 6 }}>
        <FilterRow checked={mode === "all"} color={lane.color} onClick={toggleAll}><span style={{ fontSize: 12.5, fontWeight: 600 }}>All events</span></FilterRow>
        <div style={{ height: 1, background: colors.border, margin: "4px 8px" }} />
        {events.length === 0 && <div style={{ padding: "8px 9px", fontSize: 11.5, color: colors.textSubtle }}>No events yet.</div>}
        {events.map((ev) => (
          <FilterRow key={ev.id} checked={shows(ev.id)} color={lane.color} onClick={() => toggleOne(ev.id)}>
            <span style={{ width: 22, height: 22, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: colors.borderFaint }}>
              {ev.thumb && <img src={ev.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
              <span style={{ display: "block", fontSize: 10, color: colors.textSubtle }}>{ev.startsAt ? fmtDate(new Date(ev.startsAt)) : "Unscheduled"}</span>
            </span>
          </FilterRow>
        ))}
      </div>
    </div>
  );
}

// A reusable left-edge tab — the "clear visual piece" that flips a card.
// Icon telegraphs what's on the back: pencil (compose), bar chart (results),
// or a return arrow when you're already looking at the back.
function FlipTab({ accent, flipped, phase, onToggle }) {
  const Icon = flipped ? RotateCcw : phase === "past" ? BarChart3 : Pencil;
  const title = flipped ? "Back to content" : phase === "past" ? "See how it did" : "Compose";
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onToggle}
      title={title}
      style={{ position: "absolute", left: -11, top: "50%", transform: "translateY(-50%)", width: 22, height: 42, borderRadius: 8, border: `1.5px solid ${colors.border}`, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, boxShadow: "0 3px 10px rgba(10,10,10,0.15)", zIndex: 8 }}
    >
      <Icon size={12} />
    </button>
  );
}

// Fallback heights used only for the split-second before the back is measured.
const EDIT_BACK_H = 360;
const ANALYTICS_BACK_H = 320;
const FLIP_MIN_W = 300; // a comfortable writing width — narrow cards grow to this when flipped

// Auto-fit: measure a flipped face's natural height so the card grows to fit it
// (no inner scrolling). ResizeObserver re-fires whenever the face's content changes.
function useNaturalHeight(ref) {
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return h;
}

function ContentCard({ card, uploading, events, timelines, linkColor, phase, flipped, raised, selected, coLanes, onRaise, onMove, onStartLink, onStartResize, onRemoveLink, onSet, onToggleFlip, onRemove, onFill }) {
  const fileRef = useRef(null);
  const backRef = useRef(null);
  const measuredBackH = useNaturalHeight(backRef);
  // Past cards open straight to results; "Edit post" flips that to the composer.
  const [editingPast, setEditingPast] = useState(false);

  const url = card.mediaUrl || null;
  const isPlaceholder = !url;
  const linkedEvent = card.eventId ? (events || []).find((e) => e.id === card.eventId) : null;
  const outerW = card.w || CARD_W;
  const boxW = outerW - 12;
  const ch = card.channel ? CHANNELS[card.channel] : null;
  const ty = TYPES[card.contentType] || TYPES.image;
  const accent = ch?.color || colors.borderStrong;
  const mediaH = Math.round(boxW * ty.ratio);
  const stop = (e) => e.stopPropagation();

  const showingEdit = phase === "future" || editingPast;
  const frontH = cardHeight(card);
  const flipW = Math.max(outerW, FLIP_MIN_W); // composer grows to a readable width
  const backH = measuredBackH || (showingEdit ? EDIT_BACK_H : ANALYTICS_BACK_H);
  const wrapperW = flipped ? flipW : outerW;
  const wrapperH = flipped ? backH : frontH;
  const ranOn = (() => {
    const dates = (card.links || []).map((l) => l.date).filter(Boolean).sort();
    return dates[0] ? fmtDate(new Date(`${dates[0]}T00:00:00`)) : null;
  })();
  const dim = phase === "past" && !flipped; // settled look for content that already ran

  const linkHandle = (where) => (
    <button onPointerDown={(e) => onStartLink(e, card.id)} title="Drag onto a timeline to set a date" style={{ position: "absolute", left: "50%", [where]: -9, transform: "translateX(-50%)", width: 18, height: 18, borderRadius: "50%", background: linkColor, border: `2px solid ${colors.background}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "crosshair", padding: 0, zIndex: 3 }}>
      <Link2 size={9} color="#fff" />
    </button>
  );

  return (
    <div style={{ position: "absolute", left: card.x, top: card.y, width: wrapperW, height: wrapperH, perspective: 1400, transform: flipped ? "scale(1.03)" : "none", transition: "transform 0.35s ease, height 0.4s cubic-bezier(0.4,0,0.2,1), width 0.4s cubic-bezier(0.4,0,0.2,1)", borderRadius: 6, boxShadow: selected ? `0 0 0 2px ${colors.accent}, 0 0 0 6px ${colors.accentSoft}` : "none", zIndex: flipped ? 20 : raised || selected ? 10 : 1 }}>
      <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1)", transform: flipped ? "rotateY(180deg)" : "none" }}>
        {/* ── FRONT — the visual identity ── */}
        <div
          onPointerDown={(e) => { onRaise(); onMove(e, card.id); }}
          style={{ position: "absolute", top: 0, left: 0, width: outerW, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", borderRadius: 4, background: colors.background, border: `1px solid ${linkColor}`, boxShadow: "0 8px 30px rgba(10,10,10,0.06)", cursor: "grab", userSelect: "none", opacity: dim ? 0.72 : 1, filter: dim ? "saturate(0.75)" : "none", transition: "opacity 0.3s, filter 0.3s" }}
        >
          {/* Media */}
          <div style={{ padding: 6 }}>
            <div style={{ position: "relative", width: "100%", height: mediaH, borderRadius: 2, overflow: "hidden", background: colors.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isPlaceholder ? (
                uploading ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: colors.textSubtle }}>
                    <Loader2 size={20} style={{ animation: "crm-spin 0.9s linear infinite" }} />
                    <span style={{ fontSize: 11 }}>Uploading…</span>
                  </div>
                ) : (
                  <button
                    onPointerDown={stop}
                    onClick={() => fileRef.current?.click()}
                    title="Add content"
                    style={{ position: "absolute", inset: 4, borderRadius: 2, border: `1.5px dashed ${colors.border}`, background: "transparent", color: colors.textSubtle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}
                  >
                    <ImagePlus size={22} />
                    <span style={{ fontSize: 11, fontWeight: 600 }}>Add content</span>
                  </button>
                )
              ) : (
                <>
                  {card.contentType === "carousel" && <div style={{ position: "absolute", inset: "4px -5px 4px 5px", borderRadius: 2, border: `1px solid ${colors.border}` }} />}
                  {card.mediaKind === "image" ? (
                    <img src={url} alt={card.mediaName || ""} draggable={false} style={{ position: "relative", width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : card.mediaKind === "video" ? (
                    <video src={url} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : card.mediaKind === "audio" ? (
                    <div style={{ width: "100%", padding: "0 6px" }}><audio src={url} controls style={{ width: "100%" }} /></div>
                  ) : (
                    <a href={url} target="_blank" rel="noopener noreferrer" onPointerDown={stop} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: colors.textMuted, padding: 12, textDecoration: "none" }}>
                      <FileText size={20} />
                      <span style={{ fontSize: 11, textAlign: "center", wordBreak: "break-word" }}>{card.mediaName || "File"}</span>
                    </a>
                  )}
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" style={{ display: "none" }} onChange={(e) => { const f = (e.target.files || [])[0]; if (f) onFill(card.id, f); e.target.value = ""; }} />

              {/* Source style badge — icon (channel is obvious) + type */}
              {ch && (
                <div style={{ position: "absolute", top: 6, left: 6, display: "flex", alignItems: "center", gap: 5, padding: ch.types?.length ? "4px 9px 4px 8px" : 5, borderRadius: 2, background: accent, color: "#fff", fontSize: 11, fontWeight: 600 }}>
                  <ch.Icon size={13} />
                  {ch.types?.length ? <span style={{ whiteSpace: "nowrap" }}>{ty.label}</span> : null}
                </div>
              )}
              {/* Note indicator */}
              {card.note?.trim() && (
                <div title={card.note} style={{ position: "absolute", bottom: 6, left: 6, width: 22, height: 22, borderRadius: 3, background: "rgba(10,10,10,0.55)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                  <StickyNote size={12} />
                </div>
              )}
              {/* Co-post badge — shared across multiple timelines (CC for email) */}
              {coLanes && (
                <div title={`Shared on ${coLanes.map((l) => l.name).join(" · ")}`} style={{ position: "absolute", top: 6, right: 6, display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 7px", borderRadius: 999, background: "rgba(255,255,255,0.9)", border: `1px solid ${colors.border}`, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", color: colors.text }}>
                  <span style={{ display: "inline-flex" }}>
                    {coLanes.slice(0, 3).map((l, i) => (
                      <span key={l.id} style={{ width: 7, height: 7, borderRadius: "50%", background: l.color, marginLeft: i ? -2 : 0, border: `1px solid ${colors.border}` }} />
                    ))}
                  </span>
                  {card.channel === "email" ? "CC" : "Co-post"}
                </div>
              )}
            </div>
          </div>

          {/* Event + date chips — the context you always see */}
          {(linkedEvent || (card.links || []).length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 8px 8px" }} onPointerDown={stop}>
              {linkedEvent && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: colors.secondary, background: colors.secondarySoft, borderRadius: 2, padding: "2px 6px", maxWidth: "100%" }}>
                  <CalendarDays size={11} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{linkedEvent.title}</span>
                  <button onClick={() => onSet(card.id, { eventId: null })} style={{ background: "none", border: "none", color: colors.secondary, cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={10} /></button>
                </span>
              )}
              {(card.links || []).map((l) => {
                const d = new Date(`${l.date}T00:00:00`);
                return (
                  <span key={l.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: TODAY_COLOR, background: "rgba(180,83,9,0.09)", borderRadius: 2, padding: "2px 6px" }}>
                    {WEEKDAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}
                    <button onClick={() => onRemoveLink(card.id, l.id)} style={{ background: "none", border: "none", color: TODAY_COLOR, cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={10} /></button>
                  </span>
                );
              })}
            </div>
          )}

          {linkHandle("top")}
          {linkHandle("bottom")}

          {/* Resize grip — scales the media (proportions locked) */}
          <div onPointerDown={(e) => onStartResize(e, card.id)} title="Drag to resize" style={{ position: "absolute", right: 3, bottom: 3, width: 13, height: 13, cursor: "nwse-resize", zIndex: 3 }}>
            <div style={{ width: "100%", height: "100%", borderRight: `2px solid ${colors.borderStrong}`, borderBottom: `2px solid ${colors.borderStrong}`, borderBottomRightRadius: 2 }} />
          </div>
        </div>

        {/* ── BACK — compose (upcoming) or results (already ran) ── */}
        <div
          ref={backRef}
          onPointerDown={stop}
          onWheel={stop}
          style={{ position: "absolute", top: 0, left: 0, width: flipW, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)", borderRadius: 10, overflow: "hidden", background: colors.background, border: `1px solid ${linkColor}`, boxShadow: "0 14px 38px rgba(10,10,10,0.10)" }}
        >
          {showingEdit ? (
            <EditFace card={card} events={events} timelines={timelines} accent={linkColor} onSet={onSet} onRemove={onRemove} />
          ) : (
            <AnalyticsFace card={card} accent={linkColor} ranOn={ranOn} linkedEvent={linkedEvent} onEdit={() => setEditingPast(true)} />
          )}
        </div>
      </div>

      <FlipTab accent={linkColor} flipped={flipped} phase={phase} onToggle={() => { if (flipped) setEditingPast(false); onToggleFlip(card.id); }} />
    </div>
  );
}

// ── Event banner ────────────────────────────────────────────────────
// A wide, slim banner sitting on its lane's mark. Same flip language as
// content cards: upcoming events flip to a quick editor, past ones to a recap.
const EVENT_W = 236;
const EVENT_FRONT_H = 58;
const EVENT_BACK_H = 236; // fallback before the back is measured
const EVENT_FLIP_W = 272; // banners widen a touch when flipped open

function EventBanner({ ev, x, laneY, color, phase, flipped, raised, onRaise, onToggleFlip }) {
  const backRef = useRef(null);
  const measuredBackH = useNaturalHeight(backRef);
  const wrapperW = flipped ? EVENT_FLIP_W : EVENT_W;
  const h = flipped ? (measuredBackH || EVENT_BACK_H) : EVENT_FRONT_H;
  const bandTop = laneY + BAND_TOP;
  const top = bandTop - 9 - h; // bottom edge floats just above the band, grows upward
  const dim = phase === "past" && !flipped;
  return (
    <>
      {/* Mark through the band — same weight as Today, in event colour */}
      <div style={{ position: "absolute", left: x, top: bandTop - 7, width: 2, height: BAND_H + 14, borderRadius: 1, background: color, transform: "translateX(-1px)", pointerEvents: "none" }} />

      <div onPointerDownCapture={onRaise} style={{ position: "absolute", left: x, top, width: wrapperW, height: h, transform: `translateX(-50%) ${flipped ? "scale(1.03)" : ""}`, perspective: 1400, transition: "height 0.4s cubic-bezier(0.4,0,0.2,1), width 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.35s ease", zIndex: flipped ? 21 : raised ? 12 : 2 }}>
        <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1)", transform: flipped ? "rotateY(180deg)" : "none" }}>
          {/* FRONT */}
          <div onPointerDown={(e) => e.stopPropagation()} style={{ position: "absolute", left: "50%", top: 0, transform: "translateX(-50%)", width: EVENT_W, height: EVENT_FRONT_H, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", display: "flex", alignItems: "center", gap: 9, padding: "0 12px 0 7px", borderRadius: 12, background: colors.background, border: `2px solid ${color}`, opacity: dim ? 0.78 : 1, filter: dim ? "saturate(0.75)" : "none", overflow: "hidden", cursor: "pointer", boxShadow: "0 8px 30px rgba(10,10,10,0.06)" }}>
            <span style={{ width: 40, height: 40, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: colors.surface }}>
              {ev.thumb && <img src={ev.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 2, fontSize: 10.5, color: colors.textMuted }}>
                <CalendarDays size={11} /> {ev.startsAt ? fmtDate(new Date(ev.startsAt)) : "Unscheduled"}
                <span style={{ marginLeft: 4, padding: "1px 6px", borderRadius: 999, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color, background: `${color}18` }}>{phase === "past" ? "Recap" : "Upcoming"}</span>
              </div>
            </div>
          </div>

          {/* BACK */}
          <div
            ref={backRef}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{ position: "absolute", top: 0, left: 0, width: EVENT_FLIP_W, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)", borderRadius: 12, overflow: "hidden", background: colors.background, border: `2px solid ${color}`, boxShadow: "0 14px 38px rgba(10,10,10,0.10)" }}
          >
            {phase === "past" ? <EventAnalytics ev={ev} color={color} /> : <EventEdit ev={ev} color={color} />}
          </div>
        </div>

        <FlipTab accent={color} flipped={flipped} phase={phase} onToggle={onToggleFlip} />
      </div>
    </>
  );
}

function eventSeeded(id) {
  let h = 5381;
  for (let i = 0; i < (id || "x").length; i++) h = (h * 33) ^ id.charCodeAt(i);
  return (h >>> 0) / 4294967296;
}

function EventAnalytics({ ev, color }) {
  const r = eventSeeded(ev.id);
  const views = 120 + Math.round(r * 1800);
  const rsvps = Math.round(views * (0.08 + r * 0.18));
  const revenue = Math.round(rsvps * (8 + r * 22));
  const stats = [
    { label: "Page views", value: views.toLocaleString() },
    { label: "RSVPs", value: rsvps.toLocaleString() },
    { label: "Revenue", value: `$${revenue.toLocaleString()}` },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", color: colors.text }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderBottom: `1px solid ${colors.border}`, background: `linear-gradient(90deg, ${color}14, transparent)` }}>
        <BarChart3 size={13} color={color} /> <span style={{ fontSize: 11.5, fontWeight: 700 }}>How it went</span>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
        {stats.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, background: colors.surface, border: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: 10.5, color: colors.textSubtle }}>{s.label}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: colors.text }}>{s.value}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "7px 12px", borderTop: `1px solid ${colors.border}`, fontSize: 9, color: colors.textFaded }}>Demo data</div>
    </div>
  );
}

function EventEdit({ ev, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", color: colors.text }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderBottom: `1px solid ${colors.border}`, background: `linear-gradient(90deg, ${color}14, transparent)` }}>
        <Pencil size={13} color={color} /> <span style={{ fontSize: 11.5, fontWeight: 700 }}>Event</span>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: colors.textSubtle, marginBottom: 3 }}>Title</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{ev.title}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: colors.textSubtle, marginBottom: 3 }}>When</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: colors.text }}>
            <CalendarDays size={13} color={colors.secondary} /> {ev.startsAt ? fmtDate(new Date(ev.startsAt)) : "Unscheduled"}
          </div>
        </div>
      </div>
      <div style={{ padding: 12, borderTop: `1px solid ${colors.border}` }}>
        <a href={`/app/events/${ev.id}/edit`} onClick={(e) => e.stopPropagation()} style={{ display: "block", textAlign: "center", padding: "8px", borderRadius: 8, background: `${color}14`, border: `1px solid ${color}`, color, fontSize: 11.5, fontWeight: 600, textDecoration: "none" }}>
          Open full editor →
        </a>
      </div>
    </div>
  );
}
