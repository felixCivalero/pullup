// frontend/src/components/EyesCursor.jsx
//
// The PullUp eyes as the mouse cursor. The pupils roll toward wherever the
// pointer is heading (velocity, eased), go wide over anything clickable and
// blink on press. Pointer-fine devices only — touch keeps the native
// behaviour. The host page hides the native cursor via `cursor: none`.
import { useEffect, useMemo, useRef, useState } from "react";

// Pupil paths in the small-eyes SVG, keyed by their original translate().
const PUPILS = [
  { x: 1135, y: 1160 },
  { x: 1614, y: 1162 },
];
const MAX_OFFSET = 55; // svg units — keeps the pupil inside the ring
// Crop the 2761×2418 canvas down to the eyes (bbox ≈ 925,989 917×440).
const VIEWBOX = "905 969 957 480";
const WIDTH = 46;
const HEIGHT = Math.round((WIDTH * 480) / 957);
const CLICKABLE = "a, button, [role='button'], label, summary, input, select, textarea";

export function EyesCursor(props) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setEnabled(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  // Touch devices never load the SVG.
  return enabled ? <Cursor {...props} /> : null;
}

function Cursor({ color = "#FF5F1F", hidden = false }) {
  const rootRef = useRef(null);
  const [rawSvg, setRawSvg] = useState(null);

  // Own async chunk, same file the brand eyes use.
  useEffect(() => {
    let alive = true;
    import("/pullup-smalleyes.svg?raw")
      .then((m) => alive && setRawSvg(m.default))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Crop to the eyes, size to the box, recolor black → brand orange.
  const svgHtml = useMemo(() => {
    if (!rawSvg) return "";
    return rawSvg
      .replace(/<svg\b([^>]*)>/i, (_m, attrs) => {
        const cleaned = attrs
          .replace(/\s(width|height|viewBox)="[^"]*"/gi, "");
        // solid whites behind the rings so text never shows through
        return `<svg${cleaned} viewBox="${VIEWBOX}" width="100%" height="100%">` +
          `<circle cx="1145" cy="1209" r="185" fill="#fff"/><circle cx="1622" cy="1209" r="185" fill="#fff"/>`;
      })
      .replace(/fill="#000000"/gi, `fill="${color}"`);
  }, [rawSvg, color]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !svgHtml) return;

    const pupils = [];
    root.querySelectorAll("path").forEach((node) => {
      const m = (node.getAttribute("transform") || "").match(/translate\(([-\d.]+)\s*,\s*([-\d.]+)\)/);
      if (!m) return;
      const ox = parseFloat(m[1]);
      const oy = parseFloat(m[2]);
      if (PUPILS.some((p) => Math.abs(p.x - ox) < 6 && Math.abs(p.y - oy) < 6)) {
        pupils.push({ node, ox, oy });
      }
    });

    let x = -100, y = -100, lastX = null, lastY = null;
    let vx = 0, vy = 0; // smoothed velocity
    let px = 0, py = 0; // current pupil offset
    let raf = null;
    let lastMove = 0;

    const frame = () => {
      raf = null;
      const idle = performance.now() - lastMove > 120;
      if (idle) { vx *= 0.82; vy *= 0.82; }
      const speed = Math.hypot(vx, vy);
      const k = Math.min(speed / 14, 1);
      const tx = speed > 0.01 ? (vx / speed) * MAX_OFFSET * k : 0;
      const ty = speed > 0.01 ? (vy / speed) * MAX_OFFSET * k : 0;
      px += (tx - px) * 0.25;
      py += (ty - py) * 0.25;
      for (const { node, ox, oy } of pupils) {
        node.setAttribute("transform", `translate(${ox + px},${oy + py})`);
      }
      root.style.transform = `translate3d(${x - WIDTH / 2}px, ${y - HEIGHT / 2}px, 0)`;
      if (Math.abs(px) > 0.2 || Math.abs(py) > 0.2 || speed > 0.05) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (raf == null) raf = requestAnimationFrame(frame); };

    const onMove = (e) => {
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      x = e.clientX;
      y = e.clientY;
      if (lastX != null) {
        vx = vx * 0.6 + (x - lastX) * 0.4;
        vy = vy * 0.6 + (y - lastY) * 0.4;
      }
      lastX = x;
      lastY = y;
      lastMove = performance.now();
      root.dataset.visible = "1";
      const target = e.target instanceof Element ? e.target : null;
      root.dataset.hover = target?.closest(CLICKABLE) ? "1" : "0";
      kick();
    };
    const onDown = () => { root.dataset.down = "1"; };
    const onUp = () => { root.dataset.down = "0"; };
    const onLeave = () => { root.dataset.visible = "0"; lastX = lastY = null; };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [svgHtml]);

  return (
    <div
      ref={rootRef}
      className="eyes-cursor"
      data-visible="0"
      data-hidden={hidden ? "1" : "0"}
      aria-hidden="true"
      style={{ width: WIDTH, height: HEIGHT }}
    >
      <style>{CURSOR_STYLES}</style>
      <div className="eyes-cursor-inner" dangerouslySetInnerHTML={{ __html: svgHtml }} />
    </div>
  );
}

const CURSOR_STYLES = `
  .eyes-cursor {
    position: fixed; top: 0; left: 0; z-index: 2147483000;
    pointer-events: none;
    will-change: transform;
    transition: opacity 0.15s ease;
  }
  .eyes-cursor[data-visible="0"], .eyes-cursor[data-hidden="1"] { opacity: 0; }
  .eyes-cursor-inner {
    width: 100%; height: 100%;
    transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1);
  }
  .eyes-cursor-inner svg { display: block; overflow: visible; }
  .eyes-cursor[data-hover="1"] .eyes-cursor-inner { transform: scale(1.35); }
  .eyes-cursor[data-down="1"] .eyes-cursor-inner { transform: scale(1.2, 0.18); transition-duration: 0.07s; }
  @media (prefers-reduced-motion: reduce) {
    .eyes-cursor-inner { transition: none; }
  }
`;
