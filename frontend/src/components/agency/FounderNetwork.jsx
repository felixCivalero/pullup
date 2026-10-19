import { useEffect, useRef, useState } from "react";
import {
  AudioWaveform, Box, Brush, CalendarDays, Camera, Clapperboard, Code, Droplet, Lightbulb,
  Music, Palette, PenLine, PenTool, Scissors, Shirt, Sparkles, Star, Video,
} from "lucide-react";
import { useT } from "./i18n.js";

/* Felix's network as a live graph — Felix at the centre, the core of a
   production around him, the wider ring beyond. The network shows ROLES,
   never names or headcounts: people he has worked with and pulls in when a
   brand's direction needs them. Edit the lists below to prune or add. */

// Inner ring: the core of most productions.
const CORE = [
  ["Photographers", Camera],
  ["Videographers", Video],
  ["3D animators", Box],
  ["Producers", Clapperboard],
  ["Art directors", Palette],
  ["Editors", Scissors],
];
// Outer ring: pulled in when the direction calls for it.
const WIDE = [
  ["Colorists", Droplet],
  ["Motion designers", Sparkles],
  ["Copywriters", PenLine],
  ["Sound designers", AudioWaveform],
  ["Music producers", Music],
  ["Stylists", Shirt],
  ["Make-up artists", Brush],
  ["Graphic designers", PenTool],
  ["Developers", Code],
  ["Light & stage", Lightbulb],
  ["Event producers", CalendarDays],
  ["Artists & talent", Star],
];

// Geometry in a 1000 × 640 box; labels sit on the same coordinates in %.
const W = 1000, H = 640, CX = 500, CY = 320;
const at = (i, n, rx, ry, turn = 0) => {
  const a = -Math.PI / 2 + turn + (i / n) * Math.PI * 2;
  return [CX + rx * Math.cos(a), CY + ry * Math.sin(a)];
};
const INNER = CORE.map((_, i) => at(i, CORE.length, 230, 150));
const OUTER = WIDE.map((_, i) => at(i, WIDE.length, 440, 272, Math.PI / WIDE.length));
// Each outer node hangs off the nearest inner node.
const PARENT = OUTER.map(([x, y]) => {
  let best = 0, d = Infinity;
  INNER.forEach(([ix, iy], k) => {
    const dd = (ix - x) ** 2 + (iy - y) ** 2;
    if (dd < d) { d = dd; best = k; }
  });
  return best;
});
const curve = ([x1, y1], [x2, y2], bend = 0.12) => {
  const mx = (x1 + x2) / 2 - (y2 - y1) * bend, my = (y1 + y2) / 2 + (x2 - x1) * bend;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};
const pct = ([x, y]) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

function useInView(threshold = 0.25) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return undefined;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [seen, threshold]);
  return [ref, seen];
}

export function Network() {
  const t = useT();
  const [ref, on] = useInView();
  const [hot, setHot] = useState(null); // ["c", k] | ["w", k]
  const lit = (kind, k) => {
    if (!hot) return false;
    if (hot[0] === kind && hot[1] === k) return true;
    if (hot[0] === "w" && kind === "c") return PARENT[hot[1]] === k;
    if (hot[0] === "c" && kind === "w") return PARENT[k] === hot[1];
    return false;
  };
  const node = (kind, k, label, Icon, p, i) => (
    <li
      key={`${kind}${k}`}
      className={`fn-node fn-${kind}${lit(kind, k) ? " is-lit" : ""}`}
      style={{ ...pct(p), "--i": i }}
      onMouseEnter={() => setHot([kind, k])}
      onMouseLeave={() => setHot(null)}
    >
      <Icon size={kind === "c" ? 17 : 15} strokeWidth={1.75} aria-hidden="true" />
      <span>{t(label)}</span>
    </li>
  );

  return (
    <div ref={ref} className={`fn-graph${on ? " is-on" : ""}${hot ? " is-hot" : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <g className="fn-links">
          {INNER.map((p, k) => (
            <path key={`ci${k}`} d={curve([CX, CY], p, 0.08)} pathLength="1" className={`fn-l fn-l1${lit("c", k) ? " is-lit" : ""}`} style={{ "--i": k }} />
          ))}
          {OUTER.map((p, k) => (
            <path key={`io${k}`} d={curve(INNER[PARENT[k]], p, -0.1)} pathLength="1" className={`fn-l fn-l2${lit("w", k) ? " is-lit" : ""}`} style={{ "--i": k }} />
          ))}
          {INNER.map((p, k) => (
            <path key={`ii${k}`} d={curve(p, INNER[(k + 1) % INNER.length], 0.18)} pathLength="1" className="fn-l fn-l3" style={{ "--i": k }} />
          ))}
        </g>
        {/* signals: out from the centre, through the core, to the edge */}
        <g className="fn-pulses">
          {OUTER.map((p, k) => (
            <circle key={k} r="3.2">
              <animateMotion
                dur={`${3.2 + (k % 4) * 0.55}s`}
                begin={`${(k * 0.37).toFixed(2)}s`}
                repeatCount="indefinite"
                path={`${curve([CX, CY], INNER[PARENT[k]], 0.08)} ${curve(INNER[PARENT[k]], p, -0.1).replace(/^M[^Q]+/, "")}`}
              />
            </circle>
          ))}
        </g>
      </svg>

      <div className="fn-me" style={pct([CX, CY])}>
        <span className="fn-me-ring" aria-hidden="true" />
        <img src="/felix.jpg" alt="Felix Civalero Stolpe" decoding="async" />
        <b>Felix</b>
      </div>
      <ul className="fn-nodes">
        {CORE.map(([label, Icon], k) => node("c", k, label, Icon, INNER[k], k))}
        {WIDE.map(([label, Icon], k) => node("w", k, label, Icon, OUTER[k], CORE.length + k))}
      </ul>
    </div>
  );
}

export const FOUNDER_CSS = `
  .fn-graph { position: relative; margin: clamp(28px, 4vw, 48px) auto 0; max-width: 1120px; aspect-ratio: 1000 / 640; }
  .fn-graph { isolation: isolate; }
  .fn-graph > svg { position: absolute; z-index: 0; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .fn-l { fill: none; stroke: #000; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1), stroke 0.25s ease, opacity 0.25s ease; }
  .fn-l1 { stroke-width: 1.6; opacity: 0.55; }
  .fn-l2 { stroke-width: 1.1; opacity: 0.28; }
  .fn-l3 { stroke-width: 1; opacity: 0.14; stroke-dasharray: 0.012 0.02; }
  .is-on .fn-l1 { stroke-dashoffset: 0; transition-delay: calc(0.2s + var(--i) * 0.08s); }
  .is-on .fn-l2 { stroke-dashoffset: 0; transition-delay: calc(0.8s + var(--i) * 0.05s); }
  .is-on .fn-l3 { stroke-dashoffset: 0; transition-delay: 1.4s; }
  .is-hot .fn-l { opacity: 0.08; }
  .is-hot .fn-l.is-lit { opacity: 1; stroke: #D9480F; stroke-width: 2; }
  .fn-pulses circle { fill: #D9480F; opacity: 0; transition: opacity 0.6s ease 1.8s; }
  .is-on .fn-pulses circle { opacity: 0.9; }

  .fn-me { position: absolute; z-index: 2; translate: -50% -50%; display: grid; justify-items: center; gap: 8px; }
  .fn-me img { width: clamp(64px, 9vw, 112px); aspect-ratio: 1; border-radius: 50%; object-fit: cover; object-position: 50% 25%; box-shadow: 0 0 0 4px #fff, 0 0 0 6px #000; position: relative; }
  .fn-me b { font-size: clamp(13px, 1.2vw, 16px); letter-spacing: -0.01em; background: #000; color: #fff; padding: 4px 12px; border-radius: 999px; }
  .fn-me-ring { position: absolute; top: 0; left: 50%; translate: -50% 0; width: clamp(64px, 9vw, 112px); aspect-ratio: 1; border-radius: 50%; border: 2px solid #D9480F; animation: fn-ring 2.8s ease-out infinite; }
  @keyframes fn-ring { from { transform: scale(1); opacity: 0.7; } to { transform: scale(1.9); opacity: 0; } }

  .fn-nodes { list-style: none; margin: 0; padding: 0; }
  .fn-node {
    position: absolute; z-index: 1; translate: -50% -50%;
    display: inline-flex; align-items: center; gap: 7px; white-space: nowrap;
    background: #fff; border: 1px solid rgba(0,0,0,0.16); border-radius: 999px;
    font-size: clamp(11px, 1.1vw, 14px); font-weight: 600; letter-spacing: -0.01em;
    padding: 0.5em 0.95em 0.5em 0.8em; cursor: default;
    opacity: 0; scale: 0.85;
    transition: opacity 0.6s ease, scale 0.6s cubic-bezier(0.16,1,0.3,1), border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
  }
  .fn-c { font-size: clamp(12px, 1.3vw, 16px); border-color: #000; }
  .is-on .fn-node { opacity: 1; scale: 1; transition-delay: calc(0.3s + var(--i) * 0.05s), calc(0.3s + var(--i) * 0.05s), 0s, 0s, 0s; }
  .fn-node:hover, .fn-node.is-lit { background: #000; color: #fff; border-color: #000; }
  .fn-node:hover svg, .fn-node.is-lit svg { color: #D9480F; }
  .is-hot .fn-node:not(.is-lit):not(:hover) { opacity: 0.45; }

  @media (prefers-reduced-motion: reduce) {
    .fn-l, .fn-node { transition: none; }
    .fn-pulses, .fn-me-ring { display: none; }
  }

  /* phones: the graph turns tall — core ring around Felix, the wider ring as a cloud below */
  @media (max-width: 719px) {
    .fn-graph { aspect-ratio: auto; display: grid; justify-items: center; gap: 28px; }
    .fn-graph > svg { display: none; }
    .fn-me { position: static; translate: none; }
    .fn-nodes { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
    .fn-node { position: static !important; translate: none; font-size: 14px; }
    .fn-c { font-size: 15px; }
  }
`;
