import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ImagePlus, Loader2, Play, Plus, Trash2, X } from "lucide-react";
import { uid, uploadProjectMedia, useProjectDoc } from "./projectDoc.js";

/* ════════════════════════════════════════════════════════════════════════
   A project's strategy deck: the things the project locks in (vision, goals,
   audience, tone…). Slides are a title, body text and an optional image,
   edited in place on the slide itself; Presentera shows them full screen for
   the meeting (arrow keys / click to step, Esc to leave). Slides scale with
   their width (container units), so editing and presenting look the same.
   ════════════════════════════════════════════════════════════════════════ */

const TEMPLATE = [
  ["Vision", "Vart är vi på väg, och varför spelar det roll?"],
  ["Mål", "Vad ska vara sant när projektet är klart? Siffror och datum."],
  ["Målgrupp", "Vilka gör vi det här för? Vad vill de ha, var finns de?"],
  ["Identitet & ton", "Hur ser det ut, låter det och känns det?"],
  ["Innehållspelare", "De återkommande formaten och vad varje format ska göra."],
  ["Nyckeldatum", "Releaser, deadlines och det som allt räknas bakåt från."],
];

export function StrategyDeck({ clientId, projectName }) {
  const { list: slides, mutate, phase, status } = useProjectDoc(clientId, "strategy", "slides");
  const [currentId, setCurrentId] = useState(null);
  const [presenting, setPresenting] = useState(false);
  const current = slides.find((s) => s.id === currentId) || slides[0] || null;
  const index = current ? slides.indexOf(current) : -1;

  const patch = useCallback((id, p) => mutate((list) => list.map((s) => (s.id === id ? { ...s, ...p } : s)), { changed: [id] }), [mutate]);
  const add = (after = index) => {
    const s = { id: uid(), title: "", body: "", image: null };
    mutate((list) => [...list.slice(0, after + 1), s, ...list.slice(after + 1)], { changed: [s.id] });
    setCurrentId(s.id);
  };
  const seed = () => {
    const list = TEMPLATE.map(([title, hint]) => ({ id: uid(), title, body: "", hint, image: null }));
    mutate(() => list, { changed: list.map((s) => s.id) });
    setCurrentId(list[0].id);
  };
  const remove = (s) => {
    if (!window.confirm(`Ta bort "${s.title || "slide"}"?`)) return;
    const i = slides.indexOf(s);
    mutate((list) => list.filter((x) => x.id !== s.id), { removed: [s.id] });
    setCurrentId(slides[i + 1]?.id || slides[i - 1]?.id || null);
  };
  const move = (s, dir) => {
    const i = slides.indexOf(s);
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    mutate(() => next, { changed: [s.id, slides[j].id] });
  };

  if (phase === "loading") return <Center>Öppnar strategin…</Center>;
  if (phase === "error") return <Center>Kunde inte öppna strategin.</Center>;

  return (
    <div className="sd">
      <style>{CSS}</style>
      {slides.length === 0 ? (
        <div className="sd-empty">
          <h2>Strategi för {projectName}</h2>
          <p>Det som ska låsas in: vision, mål, målgrupp, ton. Börja med grundmallen eller en tom slide.</p>
          <div className="sd-empty-actions">
            <button type="button" className="sd-primary" onClick={seed}>Börja med grundmallen</button>
            <button type="button" className="sd-ghost" onClick={() => add(-1)}>Tom slide</button>
          </div>
        </div>
      ) : (
        <div className="sd-grid">
          <aside className="sd-rail">
            <ol>
              {slides.map((s, i) => (
                <li key={s.id} className={s.id === current?.id ? "is-on" : ""}>
                  <button type="button" className="sd-thumb" onClick={() => setCurrentId(s.id)}>
                    <span className="sd-num">{i + 1}</span>
                    <span className="sd-thumb-title">{s.title || "Utan titel"}</span>
                  </button>
                  <span className="sd-thumb-tools">
                    <button type="button" onClick={() => move(s, -1)} disabled={i === 0} aria-label="Flytta upp"><ArrowUp size={13} /></button>
                    <button type="button" onClick={() => move(s, 1)} disabled={i === slides.length - 1} aria-label="Flytta ned"><ArrowDown size={13} /></button>
                    <button type="button" onClick={() => remove(s)} aria-label="Ta bort"><Trash2 size={13} /></button>
                  </span>
                </li>
              ))}
            </ol>
            <button type="button" className="sd-add" onClick={() => add()}><Plus size={15} /> Ny slide</button>
          </aside>

          <section className="sd-main">
            <div className="sd-toolbar">
              <span className={`sd-status is-${status}`}>{status === "saving" ? "Sparar…" : status === "offline" ? "Offline, försöker igen" : "Sparat"}</span>
              <button type="button" className="sd-primary" onClick={() => setPresenting(true)}><Play size={15} /> Presentera</button>
            </div>
            {current && <SlideEditor key={current.id} slide={current} number={index + 1} onPatch={(p) => patch(current.id, p)} />}
          </section>
        </div>
      )}
      {presenting && slides.length > 0 && (
        <Presenter slides={slides} start={Math.max(0, index)} onClose={(i) => { setPresenting(false); setCurrentId(slides[i]?.id || null); }} />
      )}
    </div>
  );
}

function Center({ children }) {
  return <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#6e6e73", fontSize: 15 }}>{children}</div>;
}

function SlideEditor({ slide, number, onPatch }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const upload = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      const { url } = await uploadProjectMedia(file);
      onPatch({ image: url });
    } catch { /* stays without image */ }
    setBusy(false);
  };
  return (
    <div className="sd-stage" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}>
      <div className={`sd-slide${slide.image ? " has-image" : ""}`}>
        <div className="sd-slide-text">
          <span className="sd-slide-num">{String(number).padStart(2, "0")}</span>
          <textarea
            className="sd-slide-title"
            rows={1}
            value={slide.title}
            placeholder="Titel"
            onChange={(e) => onPatch({ title: e.target.value.slice(0, 140) })}
          />
          <textarea
            className="sd-slide-body"
            value={slide.body}
            placeholder={slide.hint || "Skriv…"}
            onChange={(e) => onPatch({ body: e.target.value.slice(0, 4000) })}
          />
        </div>
        {slide.image ? (
          <div className="sd-slide-image">
            <img src={slide.image} alt="" />
            <button type="button" className="sd-image-x" onClick={() => onPatch({ image: null })} aria-label="Ta bort bilden"><X size={15} /></button>
          </div>
        ) : (
          <button type="button" className="sd-image-add" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 size={16} className="sd-spin" /> : <ImagePlus size={16} />} Bild
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </div>
  );
}

function Presenter({ slides, start, onClose }) {
  const [i, setI] = useState(start);
  const iRef = useRef(i);
  useEffect(() => { iRef.current = i; }, [i]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose(iRef.current);
      if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(e.key)) { e.preventDefault(); setI((x) => Math.min(slides.length - 1, x + 1)); }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    };
    window.addEventListener("keydown", onKey);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [slides.length, onClose]);
  const s = slides[i];
  // On top of everything, the admin bar included.
  return createPortal(
    <div className="sd-present" onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))}>
      <div className={`sd-slide is-presenting${s.image ? " has-image" : ""}`}>
        <div className="sd-slide-text">
          <span className="sd-slide-num">{String(i + 1).padStart(2, "0")}</span>
          <div className="sd-slide-title">{s.title}</div>
          <div className="sd-slide-body">{s.body}</div>
        </div>
        {s.image && <div className="sd-slide-image"><img src={s.image} alt="" /></div>}
      </div>
      <div className="sd-present-bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="Föregående"><ChevronLeft size={18} /></button>
        <span>{i + 1} / {slides.length}</span>
        <button type="button" onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))} disabled={i === slides.length - 1} aria-label="Nästa"><ChevronRight size={18} /></button>
        <button type="button" onClick={() => onClose(i)} aria-label="Avsluta"><X size={18} /></button>
      </div>
      <style>{CSS}</style>
    </div>,
    document.body,
  );
}

const CSS = `
  .sd { position: absolute; inset: 0; overflow: auto; background: #f4f4f2; color: #0a0a0a; }
  .sd * { box-sizing: border-box; }
  .sd button { font: inherit; cursor: pointer; }
  .sd-primary { display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 16px; border-radius: 999px; border: 0; background: #0a0a0a; color: #fff; font-size: 14px; font-weight: 600; }
  .sd-ghost { height: 38px; padding: 0 16px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.18); background: #fff; color: #0a0a0a; font-size: 14px; font-weight: 600; }

  .sd-empty { max-width: 520px; margin: 0 auto; padding: 150px 20px 40px; text-align: center; }
  .sd-empty h2 { margin: 0 0 8px; font-size: 30px; letter-spacing: -0.03em; }
  .sd-empty p { margin: 0; color: #6e6e73; font-size: 15.5px; line-height: 1.55; }
  .sd-empty-actions { display: flex; gap: 10px; justify-content: center; margin-top: 22px; flex-wrap: wrap; }

  .sd-grid { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 24px; padding: 76px clamp(14px, 3vw, 32px) 32px; min-height: 100%; }
  .sd-rail ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .sd-rail li { position: relative; display: flex; align-items: center; border-radius: 12px; }
  .sd-rail li.is-on { background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .sd-thumb { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 0; background: none; text-align: left; color: #0a0a0a; }
  .sd-num { font-size: 12px; font-weight: 700; color: #8e8e93; width: 18px; flex: none; font-variant-numeric: tabular-nums; }
  .sd-thumb-title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sd-thumb-tools { display: none; gap: 1px; padding-right: 6px; }
  .sd-rail li:hover .sd-thumb-tools, .sd-rail li.is-on .sd-thumb-tools { display: flex; }
  .sd-thumb-tools button { width: 24px; height: 24px; display: grid; place-items: center; border: 0; border-radius: 6px; background: none; color: #6e6e73; }
  .sd-thumb-tools button:hover:not(:disabled) { background: rgba(0,0,0,0.06); color: #0a0a0a; }
  .sd-thumb-tools button:disabled { opacity: 0.3; cursor: default; }
  .sd-add { margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border: 1px dashed rgba(0,0,0,0.22); border-radius: 10px; background: none; color: #3a3a3e; font-size: 13.5px; font-weight: 600; width: 100%; justify-content: center; }
  .sd-add:hover { border-color: #0a0a0a; color: #0a0a0a; }

  .sd-main { min-width: 0; }
  .sd-toolbar { display: flex; justify-content: flex-end; align-items: center; gap: 14px; margin-bottom: 14px; }
  .sd-status { font-size: 12.5px; color: #16a34a; }
  .sd-status.is-saving { color: #8a8a8a; }
  .sd-status.is-offline { color: #b42318; }
  .sd-stage { max-width: 1100px; }

  /* A slide: 16:9, everything sized by its width (cqw). */
  .sd-slide { container-type: inline-size; position: relative; aspect-ratio: 16 / 9; width: 100%; background: #fff; border-radius: 14px; box-shadow: 0 20px 50px -28px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.06); display: grid; grid-template-columns: 1fr; overflow: hidden; }
  .sd-slide.has-image { grid-template-columns: 1.15fr 1fr; }
  .sd-slide-text { display: flex; flex-direction: column; padding: 6cqw 6cqw 5cqw; min-height: 0; }
  .sd-slide-num { font-size: 1.4cqw; font-weight: 700; letter-spacing: 0.1em; color: #8e8e93; margin-bottom: 1.6cqw; }
  .sd-slide-title { font: inherit; font-size: 5.2cqw; font-weight: 700; letter-spacing: -0.035em; line-height: 1.02; color: #0a0a0a; border: 0; outline: none; background: transparent; padding: 0; resize: none; width: 100%; field-sizing: content; }
  .sd-slide-body { font: inherit; font-size: 2cqw; line-height: 1.5; color: #2c2c2e; border: 0; outline: none; background: transparent; padding: 0; resize: none; width: 100%; flex: 1; margin-top: 2.4cqw; white-space: pre-wrap; overflow: hidden; }
  .sd-slide-title::placeholder, .sd-slide-body::placeholder { color: #c7c7cc; }
  .sd-slide-image { position: relative; min-height: 0; }
  .sd-slide-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .sd-image-x { position: absolute; top: 10px; right: 10px; width: 30px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 999px; background: rgba(0,0,0,0.6); color: #fff; }
  .sd-image-add { position: absolute; right: 14px; bottom: 14px; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.12); background: #fff; color: #3a3a3e; font-size: 13px; font-weight: 600; }
  .sd-image-add:hover { border-color: #0a0a0a; color: #0a0a0a; }
  .sd-spin { animation: sd-spin 0.9s linear infinite; }
  @keyframes sd-spin { to { transform: rotate(360deg); } }

  .sd-present { font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #0a0a0a; }
  .sd-present * { box-sizing: border-box; }
  .sd-present { position: fixed; inset: 0; z-index: 200; background: #0a0a0a; display: grid; place-items: center; padding: 3vw; cursor: pointer; }
  .sd-slide.is-presenting { width: min(100%, calc((100vh - 6vw) * 16 / 9)); border-radius: 6px; box-shadow: none; cursor: pointer; }
  .sd-present-bar { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 999px; background: rgba(255,255,255,0.12); color: #fff; font-size: 13px; font-variant-numeric: tabular-nums; opacity: 0.35; transition: opacity 0.2s; cursor: default; }
  .sd-present-bar:hover { opacity: 1; }
  .sd-present-bar span { min-width: 54px; text-align: center; }
  .sd-present-bar button { width: 34px; height: 34px; display: grid; place-items: center; border: 0; border-radius: 999px; background: none; color: #fff; cursor: pointer; }
  .sd-present-bar button:disabled { opacity: 0.3; }

  @media (max-width: 760px) {
    .sd-grid { grid-template-columns: 1fr; padding-top: 120px; }
    .sd-rail ol { display: flex; overflow-x: auto; gap: 6px; }
    .sd-rail li { flex: none; }
    .sd-thumb-tools { display: none !important; }
    .sd-slide-body { font-size: 3cqw; }
  }
`;
