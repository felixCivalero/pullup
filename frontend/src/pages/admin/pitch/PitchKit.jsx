import { createElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/* The pitch player: one pitch = a list of slides drawn on a fixed 1920×1080
   stage that scales to the screen, so a slide is laid out in plain pixels and
   looks the same on a laptop, a TV or a shared Meet window. Keys: → / space /
   click = next, ← = back, F = full screen, N = speaker notes (off by default,
   so a shared screen never shows them), Esc = back to the list (not on a shared link, which has no list). A slide is
   remounted each time it comes on, so its animations play again; <A> is the
   building block for them (rise, fade, scale, wipe, zoom) with a delay in
   seconds. Pitches live in pitch/<slug>.jsx and are listed in pitch/index.js. */

export const W = 1920;
export const H = 1080;

// One animated element. `d` = delay (s), `kind` = how it comes in, `as` = tag.
export function A({ as = "div", d = 0, kind = "rise", dur, style, className = "", children, ...rest }) {
  return createElement(
    as,
    {
      className: `pk-a pk-${kind} ${className}`.trim(),
      style: { "--d": `${d}s`, ...(dur ? { "--t": `${dur}s` } : null), ...style },
      ...rest,
    },
    children,
  );
}

// A number that counts up from 0 when the slide comes on.
export function CountUp({ to, d = 0, dur = 1.4, style, className }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + d * 1000;
    const tick = (t) => {
      const p = Math.min(1, Math.max(0, (t - start) / (dur * 1000)));
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, d, dur]);
  return <span className={className} style={style}>{n}</span>;
}

function useStageScale(ref) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(el.clientWidth / W, el.clientHeight / H));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

export function PitchPlayer({ pitch, onExit }) {
  const { slides } = pitch;
  const [i, setI] = useState(() => {
    const n = Number(new URLSearchParams(window.location.search).get("s"));
    return Number.isInteger(n) && n >= 1 && n <= slides.length ? n - 1 : 0;
  });
  const [notes, setNotes] = useState(false);
  const box = useRef(null);
  const scale = useStageScale(box);

  const go = useCallback((to) => setI((cur) => Math.max(0, Math.min(slides.length - 1, typeof to === "function" ? to(cur) : to))), [slides.length]);

  // Keep the slide in the address (?s=3), so a reload stays put.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("s", String(i + 1));
    window.history.replaceState(null, "", url);
  }, [i]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); go((c) => c + 1); }
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); go((c) => c - 1); }
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(slides.length - 1);
      else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen();
        else box.current?.parentElement?.requestFullscreen?.();
      } else if (e.key === "n" || e.key === "N") setNotes((v) => !v);
      else if (e.key === "Escape" && !document.fullscreenElement && onExit) onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onExit, slides.length]);

  const slide = slides[i];
  const Slide = slide.Slide;
  const onClick = (e) => {
    const x = e.clientX / window.innerWidth;
    go((c) => (x < 0.2 ? c - 1 : c + 1));
  };

  return (
    <div className="pk">
      <style>{PITCH_CSS}</style>
      <div className="pk-box" ref={box} onClick={onClick}>
        <div className="pk-stage" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})`, background: slide.bg || "#fbfbf9" }}>
          <div className="pk-slide" key={i}>
            <Slide />
          </div>
        </div>
      </div>
      <div className="pk-bar" onClick={(e) => e.stopPropagation()}>
        {onExit ? <button type="button" onClick={onExit} title="Tillbaka (Esc)">← Pitcher</button> : <span>PullUp</span>}
        <div className="pk-dots">
          {slides.map((s, n) => (
            <button key={s.id} type="button" className={n === i ? "is-on" : undefined} onClick={() => go(n)} title={`${n + 1}. ${s.title || s.id}`} aria-label={`Bild ${n + 1}`} />
          ))}
        </div>
        <span className="pk-num">{i + 1} / {slides.length}</span>
      </div>
      {notes && slide.notes && <div className="pk-notes" onClick={(e) => e.stopPropagation()}>{slide.notes}</div>}
    </div>
  );
}

const PITCH_CSS = `
  .pk { position: fixed; inset: 0; z-index: 60; background: #0b0b0b; color: #151515; font-family: "Inter Tight", Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; }
  .pk-box { position: absolute; inset: 0 0 44px 0; overflow: hidden; cursor: pointer; }
  .pk:fullscreen .pk-box { inset: 0; }
  .pk:fullscreen .pk-bar { opacity: 0; }
  .pk:fullscreen .pk-bar:hover { opacity: 1; }
  .pk-stage { position: absolute; left: 50%; top: 50%; transform-origin: center; overflow: hidden; }
  .pk-slide { position: absolute; inset: 0; animation: pkSlideIn .5s ease both; }
  .pk-slide * { box-sizing: border-box; }
  .pk-slide h1, .pk-slide h2, .pk-slide h3, .pk-slide p { margin: 0; }
  .pk-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 16px; background: #0b0b0b; color: #9a9a95; font: 12px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .06em; transition: opacity .2s; }
  .pk-bar > button { font: inherit; color: #c8c8c3; background: none; border: 0; cursor: pointer; text-transform: uppercase; }
  .pk-bar > button:hover { color: #fff; }
  .pk-dots { display: flex; gap: 6px; }
  .pk-dots button { width: 22px; height: 4px; border-radius: 2px; border: 0; padding: 0; background: #3a3a37; cursor: pointer; }
  .pk-dots button.is-on { background: #ec178f; }
  .pk-notes { position: absolute; left: 50%; bottom: 60px; transform: translateX(-50%); width: min(900px, 90vw); padding: 16px 20px; border-radius: 10px; background: rgba(20,20,20,.92); color: #eee; font: 15px/1.5 -apple-system, sans-serif; }

  .pk-a { animation-duration: var(--t, .9s); animation-delay: var(--d, 0s); animation-fill-mode: both; animation-timing-function: cubic-bezier(.2,.75,.2,1); }
  .pk-rise { animation-name: pkRise; }
  .pk-fade { animation-name: pkFade; }
  .pk-scale { animation-name: pkScale; animation-timing-function: cubic-bezier(.3,1.5,.5,1); }
  .pk-wipe { animation-name: pkWipe; animation-duration: var(--t, 1.2s); animation-timing-function: cubic-bezier(.7,0,.2,1); }
  .pk-left { animation-name: pkLeft; }
  .pk-zoom { animation-name: pkZoom; animation-duration: var(--t, 14s); animation-timing-function: linear; }
  @keyframes pkSlideIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes pkRise { from { opacity: 0; transform: translateY(48px) } to { opacity: 1; transform: none } }
  @keyframes pkFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes pkScale { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: none } }
  @keyframes pkWipe { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }
  @keyframes pkLeft { from { opacity: 0; transform: translateX(-80px) } to { opacity: 1; transform: none } }
  @keyframes pkZoom { from { transform: scale(1.12) } to { transform: scale(1) } }
  @media (prefers-reduced-motion: reduce) { .pk-a { animation: none !important; } }
`;
