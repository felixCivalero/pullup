// frontend/src/components/PullupEyes.jsx
//
// The PullUp brand "eyes" — rendered inline (via Vite's ?raw import) so we can
// mutate the pupil paths' transforms on pointer move and have them track the
// cursor. Small eyes = the event platform (this app). Big eyes = marketing.
// Across the dashboard we use the small variant: logo slot, empty states,
// loading and error screens.
//
// Each eye tracks from its own center, so the pupils naturally diverge or
// converge. Pupil paths were identified by inspecting the source SVGs: their
// path elements carry translate(x, y) transforms; the pupils are the paths
// whose (x, y) sit where the eyes are in the 2761×2418 canvas. For bigeyes
// there's an extra highlight path that moves with the right pupil so the
// sparkle stays attached.
import { useEffect, useMemo, useRef } from "react";

import smalleyesSvg from "/pullup-smalleyes.svg?raw";
import bigeyesSvg from "/pullup-bigeyes.svg?raw";

const EYE_VARIANTS = {
  small: {
    svg: smalleyesSvg,
    movables: [
      { x: 1135, y: 1160 },
      { x: 1614, y: 1162 },
    ],
    maxOffset: 55,
  },
  big: {
    svg: bigeyesSvg,
    movables: [
      { x: 1129, y: 1097 },
      { x: 1620, y: 1097 },
      { x: 1515, y: 1012 }, // highlight sparkle on the right pupil
    ],
    maxOffset: 70,
  },
};

export const SVG_W = 2761;
export const SVG_H = 2418;

// Both source SVGs declare an intrinsic width/height (2761×2418) and no
// viewBox. Two things must be normalized for the inline SVG to behave:
//   1. Inject a viewBox so the path coordinate space scales to fit the box.
//   2. Replace the intrinsic width/height with 100% so the SVG fills its
//      wrapper. Left intact, a wrapper sized only by inline `style` (rather
//      than the `.hero-cta-eyes svg { width/height:100% }` CSS the landing
//      page relies on) lets the SVG render at full 2761px and overflow as a
//      viewport-covering, click-eating transparent layer.
function injectViewBox(rawSvg) {
  let svg = rawSvg;
  if (!/\sviewBox=/i.test(svg)) {
    svg = svg.replace(
      /<svg\b([^>]*)>/i,
      `<svg$1 viewBox="0 0 ${SVG_W} ${SVG_H}">`,
    );
  }
  return svg.replace(/<svg\b([^>]*)>/i, (_m, attrs) => {
    const cleaned = attrs
      .replace(/\swidth="[^"]*"/i, "")
      .replace(/\sheight="[^"]*"/i, "");
    return `<svg${cleaned} width="100%" height="100%">`;
  });
}

export function PullupEyes({ variant = "small", className, style }) {
  const wrapRef = useRef(null);
  const config = EYE_VARIANTS[variant] || EYE_VARIANTS.small;
  const svgHtml = useMemo(() => injectViewBox(config.svg), [config.svg]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Find the pupil/highlight paths by matching their original translate(...)
    // against the known coords for this variant. Stash originals via data-*
    // so we can recover them even after our transform has been mutated.
    const findTargets = () => {
      const found = [];
      const paths = wrap.querySelectorAll("path");
      paths.forEach((node) => {
        let ox = node.dataset.origX != null ? parseFloat(node.dataset.origX) : NaN;
        let oy = node.dataset.origY != null ? parseFloat(node.dataset.origY) : NaN;
        if (Number.isNaN(ox)) {
          const m = (node.getAttribute("transform") || "").match(
            /translate\(([-\d.]+)\s*,\s*([-\d.]+)\)/,
          );
          if (!m) return;
          ox = parseFloat(m[1]);
          oy = parseFloat(m[2]);
        }
        const isTarget = config.movables.some(
          (p) => Math.abs(p.x - ox) < 6 && Math.abs(p.y - oy) < 6,
        );
        if (isTarget) {
          if (node.dataset.origX == null) {
            node.dataset.origX = String(ox);
            node.dataset.origY = String(oy);
            node.style.transition = "transform 90ms linear";
          }
          found.push({ node, ox, oy });
        }
      });
      return found;
    };

    let targets = findTargets();
    let raf = null;
    let mouseX = 0;
    let mouseY = 0;
    let primed = false;

    const apply = () => {
      raf = null;
      if (!primed || !wrap.isConnected) return;
      // Self-heal: if any cached path got detached, re-query from the wrap.
      if (targets.length === 0 || !targets[0].node.isConnected) {
        targets = findTargets();
        if (targets.length === 0) return;
      }
      const rect = wrap.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const scaleX = rect.width / SVG_W;
      const scaleY = rect.height / SVG_H;
      for (let i = 0; i < targets.length; i++) {
        const { node, ox, oy } = targets[i];
        const ex = rect.left + ox * scaleX;
        const ey = rect.top + oy * scaleY;
        const dx = mouseX - ex;
        const dy = mouseY - ey;
        const dist = Math.hypot(dx, dy) || 1;
        const ratio = Math.min(dist / 240, 1);
        const dxSvg = (dx / dist) * config.maxOffset * ratio;
        const dySvg = (dy / dist) * config.maxOffset * ratio;
        node.setAttribute("transform", `translate(${ox + dxSvg},${oy + dySvg})`);
      }
    };

    const onMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      primed = true;
      if (raf == null) raf = requestAnimationFrame(apply);
    };

    // pointermove covers mouse + pen + touch, more reliable on hybrid devices.
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [variant, config]);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={style}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}
