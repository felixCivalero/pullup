import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { initTracking, trackPageView } from "../lib/track.js";
import { trackEvent } from "../lib/analytics.js";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { OFFER, SERIES, casePath } from "../components/agency/agencyData.js";
import { openRequest } from "../components/agency/request.js";
import { useT } from "../components/agency/i18n.js";

/* /core — the optional, animated landing. One argument told while you scroll:
   people look at the clip, but virality is random — an occasional ego
   boost. What lasts is the coherent line of the people behind it. Every scene is a tall section with a sticky
   stage; scroll progress (0–1) drives it. Research is cited; anything drawn
   to explain an idea is marked as an illustration. Numbers are the real
   case numbers from agencyData. */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
// Progress of p inside [a, b], 0–1.
const seg = (p, a, b) => clamp((p - a) / (b - a));
// Deterministic "random" so every visitor sees the same picture.
const rnd = (i, salt = 1) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const reduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Scroll progress of a tall scene: 0 when its top meets the viewport top,
// 1 when its bottom meets the viewport bottom. Also mirrored to --p.
function useScene() {
  const ref = useRef(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = null;
    const run = () => {
      raf = null;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.bottom < -vh || r.top > vh * 2) return;
      const span = r.height - vh;
      const v = span > 0 ? clamp(-r.top / span) : r.top < 0 ? 1 : 0;
      el.style.setProperty("--p", v.toFixed(4));
      setP((prev) => (Math.abs(prev - v) > 0.003 || (v === 1 && prev !== 1) || (v === 0 && prev !== 0) ? v : prev));
    };
    const on = () => {
      if (raf == null) raf = requestAnimationFrame(run);
    };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    run();
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []);
  return [ref, p];
}

// Lines that take turns on one spot: [from, to, text]. Each fades and rises in.
function Phases({ p, lines, className = "" }) {
  return (
    <div className={`fx-phases ${className}`}>
      {lines.map(([a, b, text], i) => {
        // Out over the last stretch before b, in just after a — never two at once.
        const fadeIn = a <= 0 ? 1 : seg(p, a, a + 0.05);
        const fadeOut = b >= 1 ? 1 : 1 - seg(p, b - 0.05, b);
        const o = Math.min(fadeIn, fadeOut);
        return (
          <p
            key={i}
            className="fx-phase"
            aria-hidden={o < 0.5 ? "true" : undefined}
            style={{ opacity: o, transform: `translateY(${(1 - fadeIn) * 24 - (1 - fadeOut) * 24}px)`, filter: `blur(${(1 - o) * 6}px)` }}
          >
            {text}
          </p>
        );
      })}
    </div>
  );
}

// Words rise in one after another the first time they come into view.
function Words({ text, as = "p", className = "" }) {
  const Tag = as;
  const ref = useRef(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setInView(true);
        obs.disconnect();
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`fx-words${inView ? " is-in" : ""} ${className}`} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i}>
          <span aria-hidden="true" style={{ transitionDelay: `${i * 0.045}s` }}>{w}</span>{" "}
        </span>
      ))}
    </Tag>
  );
}

/* ── 00 · Field ─────────────────────────────────────────────────────────
   A slow constellation. Points drift, link when close, and lean toward the
   pointer. Paused off screen; static under reduced motion. */
function Field() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0, raf = null, running = false;
    const mouse = { x: -9999, y: -9999 };
    let pts = [];
    const size = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(clamp((w * h) / 9000, 50, 160));
      pts = Array.from({ length: n }, (_, i) => ({
        x: rnd(i, 1) * w,
        y: rnd(i, 2) * h,
        vx: (rnd(i, 3) - 0.5) * 0.25,
        vy: (rnd(i, 4) - 0.5) * 0.25,
        r: 0.6 + rnd(i, 5) * 1.4,
        hot: rnd(i, 6) > 0.93,
      }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const a of pts) {
        const dx = mouse.x - a.x, dy = mouse.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 180) {
          a.vx += (dx / d) * 0.012;
          a.vy += (dy / d) * 0.012;
        }
        a.vx *= 0.985;
        a.vy *= 0.985;
        a.x += a.vx + 0.04;
        a.y += a.vy;
        if (a.x < -10) a.x = w + 10; if (a.x > w + 10) a.x = -10;
        if (a.y < -10) a.y = h + 10; if (a.y > h + 10) a.y = -10;
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 110) {
            ctx.strokeStyle = `rgba(244,241,234,${(1 - d / 110) * 0.14})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const a of pts) {
        ctx.fillStyle = a.hot ? "rgba(255,106,43,0.95)" : "rgba(244,241,234,0.6)";
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.hot ? a.r + 0.8 : a.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const loop = () => {
      draw();
      raf = running ? requestAnimationFrame(loop) : null;
    };
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    size();
    draw();
    const still = reduced();
    const obs = new IntersectionObserver(([e]) => {
      running = e.isIntersecting && !still;
      if (running && raf == null) raf = requestAnimationFrame(loop);
    });
    obs.observe(canvas);
    window.addEventListener("resize", size);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      running = false;
      obs.disconnect();
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);
  return <canvas ref={ref} className="fx-field" aria-hidden="true" />;
}

function Hero() {
  const t = useT();
  return (
    <section className="fx-hero" data-pc-section="core_hero" data-pc-order="0">
      <Field />
      <div className="fx-hero-in">
        <p className="fx-mono fx-rise" style={{ "--d": "0.1s" }}>{t("PullUp · A study in coherence")}</p>
        <h1 className="fx-h1">
          <span className="fx-rise" style={{ "--d": "0.3s" }}>{t("Everyone looks at the clip.")}</span>
          <span className="fx-rise fx-glow" style={{ "--d": "0.9s" }}>{t("We look at the people behind it.")}</span>
        </h1>
        <p className="fx-hero-sub fx-rise" style={{ "--d": "1.4s" }}>
          {t("A viral moment is a spark. What lasts is the people it comes from. Five minutes of scrolling on why.")}
        </p>
      </div>
      <div className="fx-cue fx-rise" style={{ "--d": "1.8s" }} aria-hidden="true">
        <span className="fx-mono">{t("Scroll")}</span>
        <i />
      </div>
    </section>
  );
}

/* ── 01 · The clip ──────────────────────────────────────────────────────
   A wall of clips seen from the outside — the sound, the hook, the cut. As you
   scroll, one by one they open up to the life behind them. */
const PHOTOS = [
  "/stories/stiga/arena.jpg", "/stories/bkm/big-blue.jpg", "/stories/kaijas/crowd.jpg", "/stories/dawood/studio.jpg",
  "/stories/li/sunburst.jpg", "/stories/adam-hero.jpg", "/stories/stiga/paddle-blue.jpg", "/stories/bkm/moon-jelly.jpg",
  "/stories/kaijas/piano-red.jpg", "/stories/dawood/mic.jpg", "/stories/li/pool-glide.jpg", "/stories/photogang.jpg",
  "/stories/stiga/net.jpg", "/stories/bkm/into-the-light.jpg", "/stories/kaijas/stortorget.jpg", "/stories/dawood/vinyl.jpg",
  "/stories/li/platform.jpg", "/stories/eveningalley.jpeg", "/stories/stiga/top-down.jpg", "/stories/bkm/monofin.jpg",
  "/stories/kaijas/keys.jpg", "/stories/dawood/faders.jpg", "/stories/birdinsky.jpg", "/stories/sthlmneveninglight.jpg",
];
const TILES = 36;

// A clip seen from the outside: no person in it, just the hook.
const HOOKS = ["wait for it…", "POV:", "day in my life", "3 things nobody tells you"];
const SURFACE = ["Trending sound", "Hook in 2 seconds", "Jump cut", "POV"];
function Template({ hook = HOOKS[0] }) {
  const t = useT();
  return (
    <span className="fx-tmpl" aria-hidden="true">
      <i className="fx-tmpl-blob" />
      {hook && <em>{t(hook)}</em>}
    </span>
  );
}

function Clip() {
  const t = useT();
  const [ref, p] = useScene();
  // The wall starts lying almost flat and rises up into the screen as you
  // scroll in, then keeps drifting gently toward you.
  const rise = 1 - (1 - seg(p, 0, 0.3)) ** 3;
  const drift = seg(p, 0.3, 1);
  const open = seg(p, 0.26, 0.9);
  // Each tile has its own moment: it buffers (ring fills), then the life
  // behind the surface resolves out of the blur — all scrubbed by scroll.
  const tiles = Array.from({ length: TILES }, (_, i) => {
    const th = 0.14 + rnd(i, 9) * 0.76;
    return { load: seg(open, th - 0.16, th), res: seg(open, th, th + 0.1) };
  });
  const story = tiles.reduce((a, x) => a + x.res, 0) / TILES;
  const buffering = tiles.reduce((a, x) => a + x.load, 0) / TILES;
  return (
    <section ref={ref} className="fx-scene fx-copy" style={{ height: "340vh" }} data-pc-section="core_clip" data-pc-order="10">
      <div className="fx-stage">
        <div
          className="fx-wall"
          style={{
            transform: `perspective(1100px) rotateX(${76 - rise * 57 - drift * 7}deg) translateY(${(1 - rise) * 22 - drift * 6}%) scale(${0.82 + rise * 0.18 + drift * 0.08})`,
            opacity: 0.35 + rise * 0.65,
          }}
        >
          {tiles.map(({ load, res }, i) => {
            const life = res > 0.6;
            return (
              <div key={i} className={`fx-tile${life ? " is-life" : " is-surface"}${load > 0 && res < 1 ? " is-loading" : ""}`} style={{ "--i": i }}>
                <span style={{ opacity: 1 - res }} className="fx-tile-layer">
                  <Template hook={HOOKS[i % HOOKS.length]} />
                </span>
                {load > 0 && (
                  <img
                    className="fx-tile-life"
                    src={PHOTOS[i % PHOTOS.length]}
                    alt=""
                    decoding="async"
                    style={{
                      opacity: res,
                      filter: res >= 1 ? "none" : `blur(${(1 - res) * 18}px) saturate(${res}) brightness(${0.7 + res * 0.5})`,
                      transform: `scale(${1.18 - res * 0.18})`,
                    }}
                  />
                )}
                {load > 0 && res < 1 && (
                  <span className="fx-buf" style={{ "--l": load, opacity: 1 - res }} aria-hidden="true">
                    <b>{Math.round(load * 100)}</b>
                  </span>
                )}
                {!life && <span className="fx-tile-cap">{t(SURFACE[i % SURFACE.length])}</span>}
                {life ? (
                  <span className="fx-tile-time" aria-hidden="true">
                    <i />
                    <em>15s</em>
                  </span>
                ) : (
                  <span className="fx-tile-bar" />
                )}
              </div>
            );
          })}
        </div>
        <div className="fx-copy-veil" />
        <div className="fx-copy-text">
          <p className="fx-mono">01 · {t("The clip")}</p>
          <Phases
            p={p}
            className="fx-big"
            lines={[
              [0, 0.32, t("What everyone sees: the sound, the hook, the cut.")],
              [0.32, 0.64, t("But a clip is only the last fifteen seconds of something much longer.")],
              [0.64, 1, t("Behind every one that lands is someone with a direction.")],
            ]}
          />
          <div className="fx-load fx-mono" aria-hidden="true" style={{ opacity: buffering > 0 ? 1 : 0 }}>
            <span className="fx-load-track"><i style={{ transform: `scaleX(${story})` }} /><i className="is-buf" style={{ transform: `scaleX(${buffering})` }} /></span>
            <span>{story < 1 ? t("Loading the story behind the clip") : t("The whole story")} · {Math.round(story * 100)}%</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 02 · The line ─────────────────────────────────────────────────────
   One hairline: a life. Moments mark it as you scroll — most of them quiet,
   one that lands out of nowhere. It still sits on the line. */
const LN = 46;
const LANDED = 31;
const MOMENTS = Array.from({ length: LN }, (_, i) => {
  const x = 40 + ((i + 0.5 + (rnd(i, 51) - 0.5) * 0.7) / LN) * 920;
  const h = i === LANDED ? 150 : rnd(i, 52) > 0.9 ? 26 + rnd(i, 53) * 26 : 4 + rnd(i, 54) * 10;
  return { x, h };
});
const LY = 210;

function Line() {
  const t = useT();
  const [ref, p] = useScene();
  const draw = seg(p, 0.06, 0.8);
  const warm = seg(p, 0.78, 0.95);
  const at = 40 + draw * 920;
  const landed = MOMENTS[LANDED];
  const lit = at >= landed.x;
  return (
    <section ref={ref} className="fx-scene fx-line" style={{ height: "300vh" }} data-pc-section="core_line" data-pc-order="30">
      <div className="fx-stage fx-stage-col">
        <p className="fx-mono">02 · {t("The line")}</p>
        <Phases
          p={p}
          className="fx-mid fx-center"
          lines={[
            [0, 0.34, t("A clip is fifteen seconds. A life is the whole line.")],
            [0.34, 0.7, t("Most moments are quiet. Now and then one lands — and you never know which.")],
            [0.7, 1, t("But it always comes from the line. So that's what we work on.")],
          ]}
        />
        <svg className="fx-line-svg" viewBox="0 0 1000 260" aria-hidden="true">
          <line x1="40" x2="960" y1={LY} y2={LY} className="fx-line-track" />
          <line x1="40" x2={at} y1={LY} y2={LY} className="fx-line-now" style={{ opacity: 0.7 + warm * 0.3, stroke: warm > 0 ? `rgba(255,${Math.round(244 - warm * 138)},${Math.round(234 - warm * 191)},1)` : undefined }} />
          {MOMENTS.map(({ x, h }, i) => {
            const on = at >= x;
            const isLanded = i === LANDED;
            return (
              <g key={i} className={`fx-mom${on ? " is-on" : ""}${isLanded ? " is-landed" : ""}`}>
                <line x1={x} x2={x} y1={LY} y2={on ? LY - h : LY} />
                <circle cx={x} cy={on ? LY - h : LY} r={isLanded ? 5 : 2.5} />
              </g>
            );
          })}
          <circle cx={at} cy={LY} r="4" className="fx-line-head" />
          <text x={landed.x} y={LY - landed.h - 18} className="fx-line-label" style={{ opacity: lit ? 1 : 0 }}>{t("The one that landed")}</text>
        </svg>
      </div>
    </section>
  );
}

/* ── 03 · The person ────────────────────────────────────────────────────
   A person at the center, their life in orbit. Content leaves the orbit as
   you scroll: it's where who they are shows. */
const ORBIT = ["Life", "Work", "Energy", "Voice", "Taste", "People"];
const CLIPS = 18;

function Person() {
  const t = useT();
  const [ref, p] = useScene();
  const out = seg(p, 0.3, 0.9);
  return (
    <section ref={ref} className="fx-scene fx-person" style={{ height: "320vh" }} data-pc-section="core_person" data-pc-order="40">
      <div className="fx-stage fx-stage-split fx-stage-rev">
        <div className="fx-orbit" aria-hidden="true" style={{ "--out": out }}>
          <svg viewBox="-100 -100 200 200" className="fx-orbit-svg">
            <circle r="44" />
            <circle r="72" className="is-faint" />
            {ORBIT.map((_, i) => {
              const a = (i / ORBIT.length) * Math.PI * 2;
              return <line key={i} x1="0" y1="0" x2={Math.cos(a) * 44} y2={Math.sin(a) * 44} />;
            })}
          </svg>
          <div className="fx-ring">
            {ORBIT.map((name, i) => (
              <span key={name} className="fx-node" style={{ "--a": `${(i / ORBIT.length) * 360}deg` }}>
                <em>{t(name)}</em>
              </span>
            ))}
          </div>
          {Array.from({ length: CLIPS }, (_, i) => {
            const a = (i / CLIPS) * 360 + rnd(i, 4) * 14;
            const start = rnd(i, 7) * 0.5;
            const go = clamp((out - start) / 0.5);
            return (
              <span
                key={i}
                className="fx-clip"
                style={{
                  transform: `rotate(${a}deg) translateX(${22 + go * 26}vmin) rotate(${-a}deg)`,
                  opacity: go > 0 ? Math.min(1, go * 3) * (1 - Math.max(0, go - 0.85) * 4) : 0,
                }}
              />
            );
          })}
          <div className="fx-core">
            <b>{t("You")}</b>
          </div>
        </div>
        <div className="fx-copyblock">
          <p className="fx-mono">03 · {t("The person")}</p>
          <Phases
            p={p}
            className="fx-mid"
            lines={[
              [0, 0.32, t("Everything you do already says who you are.")],
              [0.32, 0.64, t("Content is just where it shows.")],
              [0.64, 1, t("When what you make is coherent with who you are, it compounds.")],
            ]}
          />
        </div>
      </div>
    </section>
  );
}

/* ── 04 · The spike ────────────────────────────────────────────────────
   Virality isn't coherent with what a creator makes: spikes come out of
   nowhere and fade. They're ego boosts. What stays is the line underneath —
   the person, showing up — and that's what you learn into and scale. */
const SN = 120;
const SPIKES = [[18, 190], [46, 140], [73, 235], [99, 165]];
const BASE = Array.from({ length: SN }, (_, i) => 26 + 150 * (i / (SN - 1)) ** 1.6);
const VIEWS = BASE.map((b, i) => {
  let v = b * 0.82 + rnd(i, 21) * 14;
  for (const [at, h] of SPIKES) {
    if (i === at - 1) v += h * 0.35;
    else if (i >= at) v += h * Math.exp(-(i - at) / 2.4);
  }
  return v;
});
const SW = 1000, SH = 380, SMAX = 310;
const sx = (i) => 20 + (i / (SN - 1)) * (SW - 40);
const sy = (v) => SH - 24 - (v / SMAX) * (SH - 60);
const spath = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("");
const VIEWS_D = spath(VIEWS);
const BASE_D = spath(BASE);

function Spike() {
  const t = useT();
  const [ref, p] = useScene();
  const draw = seg(p, 0.04, 0.36);
  const fade = seg(p, 0.4, 0.56);
  const line = seg(p, 0.46, 0.74);
  const learn = seg(p, 0.74, 0.9);
  return (
    <section ref={ref} className="fx-scene fx-spike" style={{ height: "320vh" }} data-pc-section="core_spike" data-pc-order="50">
      <div className="fx-stage fx-stage-col">
        <p className="fx-mono">04 · {t("The spike")}</p>
        <Phases
          p={p}
          className="fx-mid fx-center"
          lines={[
            [0, 0.38, t("Sometimes something random goes viral. Out of nowhere.")],
            [0.38, 0.72, t("It feels great. But a spike is an ego boost — it fades as fast as it came.")],
            [0.72, 1, t("What stays is the line underneath: you, showing up. Learn from the spikes. Build the line.")],
          ]}
        />
        <svg className="fx-chart" viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
          <defs>
            <linearGradient id="fx-line-g" x1="0" x2="1">
              <stop offset="0" stopColor="#FF6A2B" stopOpacity="0.5" />
              <stop offset="1" stopColor="#FF6A2B" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="20" x2={SW - 20} y1={sy(SMAX * g)} y2={sy(SMAX * g)} className="fx-chart-grid" />
          ))}
          <path d={VIEWS_D} pathLength="1" className="fx-chart-views" style={{ strokeDashoffset: 1 - draw, opacity: 1 - fade * 0.72 }} />
          <path d={BASE_D} pathLength="1" className="fx-chart-line" style={{ strokeDashoffset: 1 - line }} />
          {SPIKES.map(([at], k) => {
            const peak = sy(VIEWS[at]);
            const seen = draw >= at / (SN - 1);
            return (
              <g key={at}>
                <g className="fx-chart-tag" style={{ opacity: seen ? 1 - fade * 0.8 : 0, transform: `translateY(${seen ? 0 : 10}px)` }}>
                  <circle cx={sx(at)} cy={peak} r="4" />
                  <text x={sx(at)} y={peak - 14}>{k === 2 ? t("viral") : t("ego boost")}</text>
                </g>
                <g style={{ opacity: learn > (k + 1) / (SPIKES.length + 1) ? 1 : 0 }} className="fx-chart-learn">
                  <line x1={sx(at)} x2={sx(at)} y1={peak + 6} y2={sy(BASE[at]) - 6} />
                  <circle cx={sx(at)} cy={sy(BASE[at])} r="5" />
                  <text x={sx(at) + 10} y={sy(BASE[at]) + 22}>{t("learned")}</text>
                </g>
              </g>
            );
          })}
        </svg>
        <div className="fx-legend fx-mono" aria-hidden="true">
          <span><i className="is-views" />{t("Spikes — out of nowhere")}</span>
          <span><i className="is-line" />{t("The line — who you are, showing up")}</span>
        </div>
        <p className="fx-cite fx-center">{t("Illustration.")}</p>
      </div>
    </section>
  );
}

/* ── 05 · The people ────────────────────────────────────────────────────
   Real stories, real numbers, sliding past sideways. */
const COVERS = {
  "li-karlsen": "/stories/li/sunburst.jpg",
  bkm: "/stories/bkm/big-blue.jpg",
  kaijas: "/stories/kaijas/crowd.jpg",
  stiga: "/stories/stiga/arena.jpg",
  "adam-dawood": "/stories/dawood/studio.jpg",
  "adam-flambo": "/stories/adam-hero.jpg",
};

function People() {
  const t = useT();
  const navigate = useNavigate();
  const [ref, p] = useScene();
  const track = useRef(null);
  const [span, setSpan] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const el = track.current;
      if (el) setSpan(Math.max(0, el.scrollWidth - window.innerWidth));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const x = seg(p, 0.08, 0.95) * span;
  return (
    <section ref={ref} className="fx-scene fx-people" style={{ height: `${SERIES.length * 70 + 60}vh` }} data-pc-section="core_people" data-pc-order="60">
      <div className="fx-stage fx-stage-track">
        <div className="fx-people-head">
          <p className="fx-mono">05 · {t("The people")}</p>
          <h2 className="fx-h2">{t("Not spikes. People.")}</h2>
        </div>
        <div className="fx-track" ref={track} style={{ transform: `translate3d(${-x}px,0,0)` }}>
          {SERIES.map((c, i) => (
            <a
              key={c.slug}
              href={casePath(c.slug)}
              className="fx-card"
              style={{ "--c": c.color }}
              onClick={(e) => {
                e.preventDefault();
                trackEvent("cta_click", { location: `core_card_${c.slug}` });
                navigate(casePath(c.slug));
              }}
            >
              <div className="fx-card-img">
                <img src={COVERS[c.slug] || c.image} alt="" loading="lazy" decoding="async" style={{ transform: `translateX(${(x / Math.max(1, span)) * 40 - i * 6}px) scale(1.15)` }} />
              </div>
              <div className="fx-card-body">
                <p className="fx-mono">{String(i + 1).padStart(2, "0")} · {t(c.kicker)}</p>
                <p className="fx-card-score">{t(c.score[0])}</p>
                <p className="fx-card-score-l">{t(c.score[1])}</p>
                <p className="fx-card-who"><b>{c.name}.</b> {t(c.gained)}</p>
                <span className="fx-card-go">{t("Read the story")} <ArrowRight size={16} strokeWidth={1.75} /></span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 06 · The offer ─────────────────────────────────────────────────── */
function Close() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <section className="fx-close" data-pc-section="core_close" data-pc-order="70">
      <div className="fx-close-glow" aria-hidden="true" />
      <div className="fx-close-in">
        <p className="fx-mono">06 · {t("What we do")}</p>
        <Words as="h2" className="fx-h1 fx-close-h" text={t("We don't make you go viral. We make you more you — then we scale it.")} />
        <Words className="fx-close-sub" text={t("A clear direction, content that sounds like you, and growth you can measure.")} />
        <p className="fx-close-offer fx-mono">
          {t(OFFER.label)} · {OFFER.price} / {t("month")} · {t("first 3 months, no commitment")}
        </p>
        <div className="fx-close-ctas">
          <button
            type="button"
            className="fx-btn fx-btn-hot"
            onClick={() => {
              trackEvent("cta_click", { location: "core_close_build" });
              openRequest({ source: "core" });
            }}
          >
            {t("Build with us")} <ArrowRight size={18} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="fx-btn"
            onClick={() => {
              trackEvent("cta_click", { location: "core_close_home" });
              navigate("/");
            }}
          >
            {t("See the whole picture")}
          </button>
        </div>
      </div>
    </section>
  );
}

export default function CorePage() {
  useEffect(() => {
    initTracking();
    trackPageView("core");
    window.scrollTo(0, 0);
  }, []);
  return (
    <AgencyShell css={CORE_CSS} cursor={false}>
      <main className="fx" data-pc-tone="dark">
        <div className="fx-grain" aria-hidden="true" />
        <Hero />
        <Clip />
        <Line />
        <Person />
        <Spike />
        <People />
        <Close />
      </main>
    </AgencyShell>
  );
}

const CORE_CSS = `
  .agency-root:has(.fx) { background: #060608; }
  .fx {
    --ink: #F4F1EA; --dim: rgba(244,241,234,0.56); --faint: rgba(244,241,234,0.1);
    --hot: #FF6A2B; --bg: #060608;
    position: relative; background: var(--bg); color: var(--ink); overflow-x: clip;
  }
  .fx-grain {
    position: fixed; inset: -50%; z-index: 60; pointer-events: none; opacity: 0.07; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    animation: fx-grain 1.2s steps(4) infinite;
  }
  @keyframes fx-grain { 0%{transform:translate(0,0)} 25%{transform:translate(-3%,2%)} 50%{transform:translate(2%,-3%)} 75%{transform:translate(-1%,3%)} 100%{transform:translate(0,0)} }

  .fx-mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--dim); }
  .fx-h1 { font-size: clamp(40px, 7.4vw, 108px); line-height: 0.98; letter-spacing: -0.045em; font-weight: 600; }
  .fx-h2 { font-size: clamp(34px, 5vw, 72px); line-height: 1; letter-spacing: -0.04em; font-weight: 600; }
  .fx-glow { color: #fff; text-shadow: 0 0 40px rgba(255,106,43,0.45), 0 0 120px rgba(255,106,43,0.25); }
  .fx-cite { font-size: 12px; line-height: 1.5; color: rgba(244,241,234,0.4); max-width: 52ch; }
  .fx-center { text-align: center; margin-left: auto; margin-right: auto; }

  .fx-rise { display: block; opacity: 0; transform: translateY(28px); filter: blur(10px); animation: fx-rise 1.1s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay: var(--d, 0s); }
  @keyframes fx-rise { to { opacity: 1; transform: none; filter: blur(0); } }

  /* hero */
  .fx-hero { position: relative; min-height: 100svh; display: grid; place-items: center; overflow: hidden; }
  .fx-hero::after { content: ""; position: absolute; inset: auto 0 0 0; height: 30%; background: linear-gradient(transparent, var(--bg)); pointer-events: none; }
  .fx-field { position: absolute; inset: 0; width: 100%; height: 100%; }
  .fx-hero-in { position: relative; z-index: 1; padding: 0 clamp(16px, 5vw, 56px); max-width: 1200px; text-align: center; }
  .fx-hero-in .fx-h1 { margin-top: 22px; }
  .fx-hero-sub { margin: 28px auto 0; max-width: 46ch; font-size: clamp(16px, 1.5vw, 19px); line-height: 1.5; color: var(--dim); }
  .fx-cue { position: absolute; bottom: 28px; left: 50%; translate: -50% 0; z-index: 1; display: grid; justify-items: center; gap: 10px; }
  .fx-cue i { width: 1px; height: 44px; background: linear-gradient(var(--ink), transparent); animation: fx-cue 2s ease-in-out infinite; transform-origin: top; }
  @keyframes fx-cue { 0%{transform:scaleY(0)} 50%{transform:scaleY(1)} 100%{transform:scaleY(1); opacity:0} }

  /* scenes */
  .fx-scene { position: relative; }
  .fx-stage { position: sticky; top: 0; height: 100svh; overflow: hidden; display: flex; align-items: center; }
  .fx-stage-col { flex-direction: column; justify-content: center; gap: 28px; padding: 80px clamp(16px, 5vw, 56px) 40px; text-align: center; }
  .fx-stage-split { display: grid; grid-template-columns: 1fr; gap: 32px; align-content: center; padding: 80px clamp(16px, 5vw, 56px) 32px; }
  @media (min-width: 900px) { .fx-stage-split { grid-template-columns: 0.9fr 1.1fr; gap: 64px; align-items: center; } .fx-stage-rev { grid-template-columns: 1.1fr 0.9fr; } }
  .fx-copyblock { display: grid; gap: 20px; align-content: center; }
  .fx-phases { display: grid; }
  .fx-phase { grid-area: 1 / 1; will-change: opacity, transform; }
  .fx-big .fx-phase { font-size: clamp(32px, 5.4vw, 76px); line-height: 1.02; letter-spacing: -0.04em; font-weight: 600; }
  .fx-mid .fx-phase { font-size: clamp(26px, 3.4vw, 48px); line-height: 1.08; letter-spacing: -0.035em; font-weight: 600; }

  /* 01 copy */
  .fx-wall {
    position: absolute; left: 50%; top: 50%; width: max(120vw, 1100px); translate: -50% -50%;
    display: grid; grid-template-columns: repeat(9, 1fr); gap: 14px; transform-origin: 50% 40%;
  }
  @media (max-width: 700px) { .fx-wall { grid-template-columns: repeat(6, 1fr); width: 180vw; gap: 8px; } .fx-tile { border-radius: 9px; } .fx-tile-cap { font-size: 8px; left: 6px; bottom: 10px; } }
  .fx-tile { position: relative; aspect-ratio: 9/16; border-radius: 14px; overflow: hidden; background: #111; border: 1px solid var(--faint); animation: fx-float 7s ease-in-out infinite; animation-delay: calc(var(--i) * -0.37s); }
  @keyframes fx-float { 50% { transform: translateY(-10px); } }
  .fx-tile img { width: 100%; height: 100%; object-fit: cover; transition: filter 0.8s ease, opacity 0.8s ease; }
  .fx-tmpl { position: absolute; inset: 0; display: grid; place-items: center; overflow: hidden; background: linear-gradient(160deg, #26262b, #121215); animation: fx-in 0.6s ease; }
  @keyframes fx-in { from { opacity: 0; } }
  .fx-tmpl-blob { position: absolute; width: 70%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #5a5a62, #2a2a30 70%); filter: blur(2px); }
  .fx-tmpl em, .fx-phone-hook { position: relative; font-style: normal; font-weight: 700; font-size: clamp(9px, 0.9vw, 13px); color: #fff; background: rgba(0,0,0,0.55); padding: 4px 8px; border-radius: 6px; }
  .fx-phone-hook { position: absolute; top: 50%; left: 50%; translate: -50% -50%; font-size: 13px; }
  .fx-phone .fx-tmpl em { font-size: 13px; }
  .fx-tile-cap { position: absolute; left: 10px; right: 10px; bottom: 16px; font-size: 11px; font-weight: 600; color: #fff; text-shadow: 0 1px 8px rgba(0,0,0,0.7); }
  .fx-tile-bar { position: absolute; left: 10px; right: 10px; bottom: 8px; height: 2px; background: rgba(255,255,255,0.25); border-radius: 2px; overflow: hidden; }
  .fx-tile-bar::after { content: ""; position: absolute; inset: 0; background: #fff; transform-origin: left; animation: fx-play 4s linear infinite; animation-delay: calc(var(--i) * -0.53s); }
  .fx-tile-layer { position: absolute; inset: 0; }
  .fx-tile-life { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; will-change: filter, transform, opacity; }
  .fx-tile.is-loading { border-color: rgba(255,106,43,0.35); }
  .fx-tmpl::after { content: ""; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.07) 50%, transparent 65%); background-size: 250% 100%; animation: fx-shimmer 2.4s ease-in-out infinite; animation-delay: calc(var(--i) * -0.21s); }
  @keyframes fx-shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }
  .fx-buf { position: absolute; left: 50%; top: 50%; translate: -50% -50%; width: 40%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; z-index: 2;
    background: conic-gradient(var(--hot) calc(var(--l) * 1turn), rgba(255,255,255,0.14) 0);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px));
    filter: drop-shadow(0 0 8px rgba(255,106,43,0.6)); }
  .fx-buf b { display: none; }
  .fx-tile-time { position: absolute; left: 10px; right: 10px; bottom: 8px; height: 2px; background: rgba(255,255,255,0.18); border-radius: 2px; }
  .fx-tile-time i { position: absolute; right: 0; top: -1px; height: 4px; width: 9%; border-radius: 2px; background: var(--hot); box-shadow: 0 0 10px rgba(255,106,43,0.9); }
  .fx-tile-time em { position: absolute; right: 0; bottom: 8px; font-style: normal; font-family: ui-monospace, Menlo, monospace; font-size: 10px; color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,0.8); }
  .fx-load { display: grid; justify-items: center; gap: 10px; transition: opacity 0.4s ease; }
  .fx-load-track { position: relative; width: min(320px, 70vw); height: 2px; background: rgba(244,241,234,0.12); border-radius: 2px; overflow: hidden; }
  .fx-load-track i { position: absolute; inset: 0; transform-origin: left; background: var(--hot); box-shadow: 0 0 12px rgba(255,106,43,0.8); }
  .fx-load-track i.is-buf { background: rgba(244,241,234,0.3); box-shadow: none; z-index: -0; }
  .fx-load-track i:first-child { z-index: 1; }
  @keyframes fx-play { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  .fx-copy-veil { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 60% at 50% 55%, rgba(6,6,8,0.88), rgba(6,6,8,0.35) 70%, transparent), linear-gradient(var(--bg), transparent 22%, transparent 78%, var(--bg)); }
  .fx-copy-text { position: relative; z-index: 1; width: 100%; max-width: 1000px; margin: 0 auto; padding: 0 clamp(16px, 5vw, 56px); text-align: center; display: grid; gap: 22px; }

  /* 02 line */
  .fx-line .fx-phases { width: 100%; max-width: 900px; }
  .fx-line-svg { width: min(1100px, 100%); height: auto; overflow: visible; margin-top: 8px; }
  .fx-line-track { stroke: rgba(244,241,234,0.1); stroke-width: 1; }
  .fx-line-now { stroke: rgba(244,241,234,0.85); stroke-width: 1.2; }
  .fx-line-head { fill: #fff; filter: drop-shadow(0 0 8px rgba(255,255,255,0.8)); }
  .fx-mom line { stroke: rgba(244,241,234,0.45); stroke-width: 1; transition: y2 0.7s cubic-bezier(0.16,1,0.3,1); }
  .fx-mom circle { fill: rgba(244,241,234,0.75); opacity: 0; transition: cy 0.7s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease; }
  .fx-mom.is-on circle { opacity: 1; }
  .fx-mom.is-landed line { stroke: #FF6A2B; stroke-width: 1.5; }
  .fx-mom.is-landed circle { fill: #FF6A2B; filter: drop-shadow(0 0 10px rgba(255,106,43,0.9)); }
  .fx-line-label { font-family: ui-monospace, Menlo, monospace; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; fill: #FF8A57; text-anchor: middle; transition: opacity 0.6s ease; }
  @media (max-width: 700px) { .fx-line-label { font-size: 22px; } .fx-mom circle { r: 4; } }

  /* 04 spike */
  .fx-spike .fx-phases { width: 100%; max-width: 980px; }
  .fx-chart { width: min(1100px, 100%); height: auto; overflow: visible; margin-top: 12px; }
  .fx-chart-grid { stroke: rgba(244,241,234,0.06); stroke-width: 1; }
  .fx-chart-views { fill: none; stroke: rgba(244,241,234,0.75); stroke-width: 1.6; stroke-linejoin: round; stroke-dasharray: 1; transition: opacity 0.3s ease; }
  .fx-chart-line { fill: none; stroke: url(#fx-line-g); stroke-width: 4; stroke-linecap: round; stroke-dasharray: 1; filter: drop-shadow(0 0 10px rgba(255,106,43,0.7)); }
  .fx-chart-tag { transition: opacity 0.4s ease, transform 0.5s cubic-bezier(0.16,1,0.3,1); }
  .fx-chart-tag circle { fill: #fff; }
  .fx-chart-tag text, .fx-chart-learn text { font-family: ui-monospace, Menlo, monospace; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; fill: rgba(244,241,234,0.85); text-anchor: middle; }
  .fx-chart-learn { transition: opacity 0.5s ease; }
  .fx-chart-learn line { stroke: rgba(255,106,43,0.6); stroke-width: 1.2; stroke-dasharray: 3 4; }
  .fx-chart-learn circle { fill: #060608; stroke: #FF6A2B; stroke-width: 2.5; }
  .fx-chart-learn text { fill: #FF8A57; text-anchor: start; font-size: 12px; }
  .fx-legend { display: flex; flex-wrap: wrap; gap: 10px 28px; justify-content: center; }
  .fx-legend span { display: inline-flex; align-items: center; gap: 10px; }
  .fx-legend i { width: 22px; height: 2px; border-radius: 2px; background: rgba(244,241,234,0.75); }
  .fx-legend i.is-line { height: 4px; background: #FF6A2B; box-shadow: 0 0 8px rgba(255,106,43,0.8); }
  @media (max-width: 700px) { .fx-chart-tag text, .fx-chart-learn text { font-size: 22px; } }

  /* 05 person */
  .fx-orbit { --size: min(84vw, 62vmin); position: relative; width: var(--size); aspect-ratio: 1; margin: 0 auto; }
  .fx-orbit-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; animation: fx-spin 80s linear infinite; }
  .fx-orbit-svg circle { fill: none; stroke: rgba(244,241,234,0.18); stroke-width: 0.3; }
  .fx-orbit-svg circle.is-faint { stroke-dasharray: 1 3; stroke: rgba(244,241,234,0.12); }
  .fx-orbit-svg line { stroke: rgba(255,106,43,0.35); stroke-width: 0.3; }
  @keyframes fx-spin { to { transform: rotate(360deg); } }
  .fx-ring { position: absolute; inset: 0; animation: fx-spin 80s linear infinite; }
  .fx-node { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transform: rotate(var(--a)) translateX(calc(var(--size) * 0.22)) rotate(calc(-1 * var(--a))); }
  .fx-node em { position: absolute; translate: -50% -50%; font-style: normal; font-size: 13px; font-weight: 600; padding: 7px 12px; border-radius: 999px; background: #0d0d10; border: 1px solid rgba(244,241,234,0.2); white-space: nowrap; animation: fx-spin 80s linear infinite reverse; display: block; }
  .fx-clip { position: absolute; left: 50%; top: 50%; width: 14px; height: 24px; margin: -12px 0 0 -7px; border-radius: 3px; background: linear-gradient(160deg, var(--hot), #ffb38a); box-shadow: 0 0 16px rgba(255,106,43,0.6); }
  .fx-core { position: absolute; left: 50%; top: 50%; translate: -50% -50%; width: 26%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; background: radial-gradient(circle at 35% 30%, #ff9a66, var(--hot) 45%, #8a2a06); box-shadow: 0 0 calc(40px + var(--out) * 80px) rgba(255,106,43,calc(0.35 + var(--out) * 0.4)); }
  .fx-core::before { content: ""; position: absolute; inset: -14%; border-radius: 50%; border: 1px solid rgba(255,106,43,0.4); animation: fx-pulse 3s ease-out infinite; }
  @keyframes fx-pulse { from { transform: scale(0.85); opacity: 1; } to { transform: scale(1.5); opacity: 0; } }
  .fx-core b { font-size: clamp(16px, 2.2vw, 26px); color: #fff; letter-spacing: -0.02em; }

  @media (max-width: 700px) {
    .fx-orbit { --size: min(80vw, 46svh); }
    .fx-orbit-svg circle:first-child { r: 60; }
    .fx-node { transform: rotate(var(--a)) translateX(calc(var(--size) * 0.3)) rotate(calc(-1 * var(--a))); }
    .fx-node em { font-size: 11px; padding: 5px 9px; }
    .fx-core { width: 24%; }
    .fx-copy-veil { background: radial-gradient(ellipse 95% 50% at 50% 50%, rgba(6,6,8,0.92), rgba(6,6,8,0.55) 75%, rgba(6,6,8,0.3)), linear-gradient(var(--bg), transparent 22%, transparent 78%, var(--bg)); }
  }

  /* 06 people */
  .fx-stage-track { flex-direction: column; align-items: stretch; justify-content: center; gap: 28px; }
  .fx-people-head { padding: 0 clamp(16px, 5vw, 56px); display: grid; gap: 12px; }
  .fx-track { display: flex; gap: 20px; padding: 0 clamp(16px, 5vw, 56px); width: max-content; will-change: transform; }
  .fx-card { --c: var(--hot); position: relative; display: grid; grid-template-rows: auto 1fr; width: min(78vw, 400px); border-radius: 22px; overflow: hidden; background: #0e0e12; border: 1px solid var(--faint); color: var(--ink); text-decoration: none; transition: border-color 0.3s ease, transform 0.4s cubic-bezier(0.16,1,0.3,1); }
  .fx-card:hover { border-color: var(--c); transform: translateY(-6px); }
  .fx-card-img { height: min(34vh, 260px); overflow: hidden; position: relative; }
  .fx-card-img::after { content: ""; position: absolute; inset: 0; background: linear-gradient(transparent 40%, #0e0e12); }
  .fx-card-img img { width: 100%; height: 100%; object-fit: cover; }
  .fx-card-body { padding: 18px 22px 22px; display: grid; gap: 6px; align-content: start; }
  .fx-card-score { font-size: clamp(40px, 4.6vw, 60px); font-weight: 700; letter-spacing: -0.045em; line-height: 1; color: var(--c); filter: brightness(1.35) saturate(1.1); margin-top: 6px; }
  .fx-card-score-l { font-size: 14px; color: var(--dim); }
  .fx-card-who { font-size: 15px; line-height: 1.45; margin-top: 10px; }
  .fx-card-go { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; margin-top: 8px; }

  /* 07 close */
  .fx-close { position: relative; min-height: 100svh; display: grid; place-items: center; overflow: hidden; padding: 120px clamp(16px, 5vw, 56px); text-align: center; }
  .fx-close-glow { position: absolute; left: 50%; top: 60%; width: 120vmax; height: 120vmax; translate: -50% -50%; background: radial-gradient(circle, rgba(255,106,43,0.22), transparent 55%); animation: fx-breathe-bg 8s ease-in-out infinite; }
  @keyframes fx-breathe-bg { 50% { transform: scale(1.12); opacity: 0.8; } }
  .fx-close-in { position: relative; max-width: 1100px; display: grid; gap: 26px; justify-items: center; }
  .fx-close-h { font-size: clamp(36px, 6vw, 88px); }
  .fx-close-sub { font-size: clamp(17px, 1.7vw, 22px); color: var(--dim); max-width: 44ch; }
  .fx-close-offer { color: var(--ink); }
  .fx-close-ctas { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
  .fx-btn { font: inherit; font-size: 16px; font-weight: 600; display: inline-flex; align-items: center; gap: 10px; padding: 15px 24px; border-radius: 999px; cursor: pointer; color: var(--ink); background: transparent; border: 1px solid rgba(244,241,234,0.3); transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.3s ease; }
  .fx-btn:hover { transform: translateY(-2px); border-color: var(--ink); }
  .fx-btn-hot { background: var(--hot); border-color: var(--hot); color: #fff; box-shadow: 0 10px 40px -10px rgba(255,106,43,0.8); }
  .fx-btn-hot:hover { border-color: var(--hot); box-shadow: 0 14px 50px -8px rgba(255,106,43,0.95); }

  .fx-words > span > span { display: inline-block; opacity: 0; transform: translateY(0.4em); filter: blur(8px); transition: opacity 0.7s ease, transform 0.9s cubic-bezier(0.16,1,0.3,1), filter 0.7s ease; }
  .fx-words.is-in > span > span { opacity: 1; transform: none; filter: blur(0); }

  @media (prefers-reduced-motion: reduce) {
    .fx-grain, .fx-tile, .fx-tile-bar::after, .fx-tmpl::after, .fx-orbit-svg, .fx-ring, .fx-node em, .fx-core::before, .fx-close-glow, .fx-cue i { animation: none !important; }
    .fx-rise { animation: none; opacity: 1; transform: none; filter: none; }
    .fx-phase { filter: none !important; }
  }
`;
