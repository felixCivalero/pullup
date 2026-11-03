import { useEffect, useRef, useState } from "react";
import { useLang, useT } from "./i18n.js";

/* The front page's opening, one pinned scene played by scrolling (scrubbed
   both ways):
   0. the hero: on landing, pieces fly in and build a turning world on pink,
      with what we make written on it and a ring with a white moon;
   1. noise: scrolling blows that world apart into drifting dots on black,
      the feeds full of AI;
   2. the funnel: the dots are drawn into a funnel and fall through strategy,
      identity and story, thinning at each level, until one pink dot is left:
      the core of the brand;
   3. the core: that dot moves to the middle on its own;
   4. amplified: waves go out from it and the same dots come back out of it,
      building a world of channels around it, the core at its heart.
   Plain canvas. Positions are a function of scroll (plus the landing build
   and a little drift), so scrolling back plays it backwards. Reduced motion
   keeps the scroll, drops the build, spin and drift. The hero's own text is
   passed in as children. */

const N = 1200;
const RING = 220;
const LEVELS = [0.25, 0.5, 0.75];
const HERO_WORDS = {
  sv: ["Film", "Foto", "AI", "Google", "TikTok", "Instagram", "Events", "Community", "E-handel", "Spårning", "Annonser", "Mejl", "Photowalks", "Varumärke", "Sajt", "Content", "Kultur", "Stockholm", "Stamkunder", "ChatGPT", "Claude", "UGC"],
  en: ["Film", "Photo", "AI", "Google", "TikTok", "Instagram", "Events", "Community", "Shop", "Tracking", "Ads", "Email", "Photo walks", "Brand", "Site", "Content", "Culture", "Stockholm", "Regulars", "ChatGPT", "Claude", "UGC"],
};
const LEVEL_NAMES = {
  sv: ["Strategi", "Identitet", "Berättelse", "Kärnan"],
  en: ["Strategy", "Identity", "Story", "The core"],
};
const WORLD_WORDS = {
  sv: ["Content", "Film", "Foto", "Events", "Sajt", "AI-svar", "Community", "Kampanjer", "Stamkunder"],
  en: ["Content", "Film", "Photo", "Events", "Site", "AI answers", "Community", "Campaigns", "Regulars"],
};
// Where each part of the scene plays, as a share of the scroll.
const AT = { away: [0.012, 0.12], dark: [0.008, 0.14], gather: [0.14, 0.25], fall: [0.22, 0.61], lift: [0.62, 0.71], grow: [0.72, 0.96] };
const STEPS = [
  { at: 0.07, title: "Everything is noise.", line: "Feeds fill up with AI. Thousands of impressions a day, and almost all of it sounds the same. In 2027, what's real wins." },
  { at: 0.22, title: "We find the core.", line: "Strategy, identity and story. We strip away everything that isn't you, until only what's yours is left." },
  { at: 0.62, title: "The core of your brand.", line: "What no one else can copy. Everything we make starts here." },
  { at: 0.73, title: "Through us, it amplifies.", line: "Content, film, events, site and AI answers, all carrying the same core. That's how we build your world, and it grows with every person who steps in." },
];

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function fibonacci(i, n) {
  const y = 1 - (i / Math.max(1, n - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const th = i * 2.399963;
  return [Math.cos(th) * r, y, Math.sin(th) * r];
}

const smooth = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const out3 = (p) => 1 - (1 - p) ** 3;
const clamp = (v) => Math.max(0, Math.min(1, v));
const mix = (a, b, k) => a + (b - a) * k;
const span = (p, [a, b]) => clamp((p - a) / (b - a));
const rgba = (a, b, k, alpha) => `rgba(${Math.round(mix(a[0], b[0], k))},${Math.round(mix(a[1], b[1], k))},${Math.round(mix(a[2], b[2], k))},${alpha})`;
const INK = [10, 10, 10];
const WHITE = [255, 255, 255];
const PINK = [236, 23, 143];

// The hero's ring, tilted once.
const TILT = [-0.42, 0.28];
function onRing(a) {
  let [x, y, z] = [Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5];
  [y, z] = [y * Math.cos(TILT[0]) - z * Math.sin(TILT[0]), y * Math.sin(TILT[0]) + z * Math.cos(TILT[0])];
  [x, y] = [x * Math.cos(TILT[1]) - y * Math.sin(TILT[1]), x * Math.sin(TILT[1]) + y * Math.cos(TILT[1])];
  return [x, y, z];
}

function particles() {
  const rand = seeded(29);
  const scatter = () => [(rand() - 0.5) * 7, (rand() - 0.5) * 5, (rand() - 0.5) * 4];
  const out = [];
  for (let i = 0; i < N + RING; i += 1) {
    const ring = i >= N;
    const r = rand();
    out.push({
      ring,
      hero: ring ? onRing(((i - N) / RING) * Math.PI * 2) : fibonacci(i, N),
      from: scatter(),
      delay: ring ? 1.2 + ((i - N) / RING) * 0.6 : rand() * 1.1,
      u: rand(),
      v: rand(),
      vx: (rand() - 0.5) * 0.03,
      vy: (rand() - 0.5) * 0.02,
      lane: i === 0 ? 0 : rand() * 2 - 1,
      o: i === 0 ? 0.6 : rand(),
      // How far down the funnel this one gets before it drops out.
      stop: i === 0 ? 2 : r < 0.55 ? LEVELS[0] : r < 0.82 ? LEVELS[1] : r < 0.95 ? LEVELS[2] : 0.93,
      world: fibonacci(i % N, N),
      accent: rand() < 0.08,
      size: 0.7 + rand() * 1.1,
    });
  }
  return out;
}

export function FunnelWorld({ children }) {
  const t = useT();
  const lang = useLang();
  const wrap = useRef(null);
  const ref = useRef(null);
  const pinkRef = useRef(null);
  const heroRef = useRef(null);
  const [step, setStep] = useState(-1);

  useEffect(() => {
    const canvas = ref.current;
    const box = wrap.current;
    if (!canvas || !box) return undefined;
    const ctx = canvas.getContext("2d");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pts = particles();
    const heroWords = (HERO_WORDS[lang] || HERO_WORDS.en).map((word, i, all) => ({ word, at: fibonacci(i, all.length), delay: 0.9 + (i % 7) * 0.13 }));
    const names = LEVEL_NAMES[lang] || LEVEL_NAMES.en;
    const worldWords = (WORLD_WORDS[lang] || WORLD_WORDS.en).map((word, i, all) => ({ word, at: fibonacci(i, all.length) }));
    const font = getComputedStyle(canvas).fontFamily;
    const start = performance.now();
    let last = start;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let shown = -1;
    let p = -1;
    let tone = -1;
    let spinHero = 0.6;
    let tiltHero = 0.3;
    const aim = { x: 0, y: 0 };

    const size = () => {
      const r = canvas.getBoundingClientRect();
      // A full-screen canvas at 2x is four times the pixels to clear and
      // fill every frame; 1.5x looks the same for soft dots.
      dpr = Math.min(r.width * r.height > 700000 ? 1.5 : 2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    function draw(now) {
      const time = still ? 1e3 : (now - start) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const r = box.getBoundingClientRect();
      const target = clamp(-r.top / Math.max(1, r.height - window.innerHeight));
      // The scene eases after the scroll instead of jumping with each wheel
      // notch or touch frame, so steps blend into one glide.
      p = still || p < 0 ? target : p + (target - p) * (1 - Math.exp(-dt * 9));
      if (Math.abs(target - p) < 0.0003) p = target;
      const at = STEPS.reduce((n, s, i) => (p >= s.at ? i : n), -1);
      if (at !== shown) {
        shown = at;
        setStep(at);
      }

      const away = smooth(span(p, AT.away));
      const dark = smooth(span(p, AT.dark));
      const gather = smooth(span(p, AT.gather));
      const q = span(p, AT.fall);
      const lift = smooth(span(p, AT.lift));
      const grow = span(p, AT.grow);
      const funnelVis = gather * (1 - lift);

      // Pink fades to black; the bar on top follows the same value
      // (--pc-tone, read by .pc-nav.is-blend), so they move as one.
      const toneNow = Math.round(dark * 500) / 500;
      if (toneNow !== tone) {
        tone = toneNow;
        if (pinkRef.current) pinkRef.current.style.opacity = String(1 - tone);
        document.documentElement.style.setProperty("--pc-tone", String(tone));
      }
      // The colour behind the canvas right now, for halos that should vanish into it.
      const bg = [mix(PINK[0], 10, dark), mix(PINK[1], 10, dark), mix(PINK[2], 10, dark)];
      if (heroRef.current) {
        const k = clamp(p / 0.06);
        heroRef.current.style.opacity = String(1 - k);
        heroRef.current.style.transform = `translateY(${-k * 40}px)`;
        heroRef.current.style.visibility = k >= 1 ? "hidden" : "visible";
      }

      const phone = w < 760;
      // The hero world.
      const R0 = phone ? Math.min(w * 0.34, h * 0.2) : Math.min(w * 0.21, h * 0.37);
      const hx = phone ? w * 0.5 : Math.min(w * 0.74, w - R0 * 1.45);
      const hy = phone ? h * 0.3 : h * 0.46;
      if (!still) {
        spinHero += dt * (0.16 + aim.x * 0.22);
        tiltHero += (0.3 + aim.y * 0.35 - tiltHero) * Math.min(1, dt * 3);
      }
      const hc = Math.cos(spinHero);
      const hs = Math.sin(spinHero);
      const htc = Math.cos(tiltHero);
      const hts = Math.sin(tiltHero);
      const heroProject = ([x0, y0, z0], turn) => {
        let x = x0;
        let z = z0;
        if (turn) [x, z] = [x * hc - z * hs, x * hs + z * hc];
        const y = y0 * htc - z * hts;
        z = y0 * hts + z * htc;
        const s = 3.2 / Math.max(0.4, 3.2 - z);
        return [hx + x * R0 * s, hy + y * R0 * s, z, s];
      };

      // The funnel.
      const fx = phone ? w * 0.5 : w * 0.66;
      const y0 = phone ? h * 0.38 : h * 0.12;
      const y1 = phone ? h * 0.84 : h * 0.88;
      const W0 = phone ? w * 0.38 : Math.min(w * 0.26, 420);
      const half = (k) => W0 * (1 - k) ** 1.25 + 1.5;

      // The new world.
      const wx = fx;
      const wy = phone ? h * 0.62 : h * 0.5;
      const Rw = phone ? Math.min(w * 0.34, h * 0.2) : Math.min(w * 0.2, h * 0.34);
      const spin = (still ? 0 : time * 0.18) + grow * 1.2;
      const cs = Math.cos(spin);
      const sn = Math.sin(spin);
      const ct = Math.cos(0.35);
      const st = Math.sin(0.35);
      const worldProject = ([sx, sy, sz], R) => {
        const x = sx * cs - sz * sn;
        let z = sx * sn + sz * cs;
        const y = sy * ct - z * st;
        z = sy * st + z * ct;
        const s = 3.2 / (3.2 - z);
        return [wx + x * R * s, wy + y * R * s, z];
      };
      const core = [mix(fx, wx, lift), mix(y1, wy, lift)];

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (funnelVis > 0.01) {
        ctx.strokeStyle = `rgba(255,255,255,${0.16 * funnelVis})`;
        ctx.lineWidth = 1;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          for (let k = 0; k <= 1.0001; k += 0.02) {
            const x = fx + side * half(k);
            const y = mix(y0, y1, k);
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.font = `600 ${phone ? 12 : 14}px ${font}`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        [...LEVELS, 1].forEach((k, i) => {
          const y = mix(y0, y1, k);
          const reached = clamp((q * 1.5 - 0.5 - k * 0.5 + 0.35) / 0.15);
          ctx.setLineDash([3, 5]);
          ctx.strokeStyle = `rgba(255,255,255,${(0.1 + 0.25 * reached) * funnelVis})`;
          ctx.beginPath();
          ctx.moveTo(fx - half(k), y);
          ctx.lineTo(fx + half(k), y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = i === 3 ? `rgba(236,23,143,${(0.4 + 0.6 * reached) * funnelVis})` : `rgba(255,255,255,${(0.35 + 0.65 * reached) * funnelVis})`;
          ctx.fillText(names[i], fx + half(k) + (phone ? 10 : 18), y);
        });
      }

      // The hero world's words, drawn under its front dots is fine: they
      // carry their own pink edge.
      const drawHeroWords = (front) => {
        if (away >= 1) return;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const { word, at: pos, delay } of heroWords) {
          const build = still ? 1 : out3(clamp((time * 0.85 - delay) / 1.25));
          if (build <= 0) continue;
          const [x, y, z] = heroProject(pos.map((v) => v * 1.06), true);
          if ((z > 0) !== front) continue;
          const depth = clamp((z + 1.2) / 2.4);
          const fade = build * (1 - away);
          ctx.font = `${depth > 0.55 ? 700 : 500} ${Math.round((phone ? 11 : 13) + depth * (phone ? 7 : 13))}px ${font}`;
          ctx.lineWidth = 5;
          ctx.lineJoin = "round";
          ctx.strokeStyle = rgba(bg, bg, 0, 0.9 * depth * fade);
          ctx.strokeText(word, x, y);
          ctx.fillStyle = rgba(INK, WHITE, dark, (0.12 + depth * 0.88) * fade);
          ctx.fillText(word, x, y);
        }
      };
      drawHeroWords(false);

      // Dots are grouped by colour (alpha in 1/24 steps) and filled once per
      // group: a few dozen fills a frame instead of 1,400.
      const groups = new Map();
      for (let i = 1; i < pts.length; i += 1) {
        const d = pts[i];
        let x;
        let y;
        let a;
        let rad = d.size;
        let color;
        const back = d.ring ? 0 : smooth(clamp(grow * 1.7 - d.o * 0.7));
        if (back > 0) {
          const [px, py, pz] = worldProject(d.world, Rw);
          const depth = clamp((pz + 1) / 2);
          x = mix(core[0], px, back);
          y = mix(core[1], py, back);
          a = back * (0.25 + depth * 0.75);
          rad = (0.8 + depth * 1.4) * back;
          color = d.accent || d.o < 0.08 ? PINK : WHITE;
        } else {
          // Hero world → noise → funnel.
          const build = still ? 1 : out3(clamp((time * 0.85 - d.delay) / 1.25));
          const [bx, by, bz] = [mix(d.from[0], d.hero[0], build), mix(d.from[1], d.hero[1], build), mix(d.from[2], d.hero[2], build)];
          const [hx2, hy2, hz, hsz] = heroProject([bx, by, bz], !d.ring);
          const hDepth = clamp((hz + 1.2) / 2.4);
          const hAlpha = 3.2 - hz < 0.6 ? 0 : build * (d.ring ? 0.1 + hDepth * 0.8 : 0.1 + hDepth * 0.8);
          const hRad = (d.ring ? 0.9 : 1.1 + hDepth * 1.7) * hsz;

          const nx = ((((d.u + time * d.vx) % 1) + 1) % 1) * w;
          const ny = ((((d.v + time * d.vy) % 1) + 1) % 1) * h;
          const k = clamp(q * 1.5 - d.o * 0.5);
          const lane = d.lane + (still ? 0 : Math.sin(time * 1.3 + i) * 0.03);
          let ffx = fx + lane * half(k);
          const ffy = mix(y0, y1, k);
          let fa = d.ring ? 0 : 1;
          if (k > d.stop) {
            const gone = clamp((k - d.stop) / 0.05);
            ffx += Math.sign(lane || 1) * gone * 60;
            fa *= 1 - gone;
          }
          const nAlpha = mix(0.35, 0.85, gather) * mix(1, fa, gather);
          x = mix(mix(hx2, nx, away), ffx, gather);
          y = mix(mix(hy2, ny, away), ffy, gather);
          a = mix(hAlpha, nAlpha, away);
          rad = mix(hRad, d.size, away);
          color = d.accent ? [mix(WHITE[0], PINK[0], dark), mix(WHITE[1], PINK[1], dark), mix(WHITE[2], PINK[2], dark)] : [mix(INK[0], WHITE[0], dark), mix(INK[1], WHITE[1], dark), mix(INK[2], WHITE[2], dark)];
        }
        if (a <= 0.01) continue;
        const key = `${Math.round(color[0])},${Math.round(color[1])},${Math.round(color[2])},${Math.round(Math.min(1, a) * 24)}`;
        let path = groups.get(key);
        if (!path) {
          path = new Path2D();
          groups.set(key, path);
        }
        const rr = Math.max(0.3, rad);
        path.moveTo(x + rr, y);
        path.arc(x, y, rr, 0, Math.PI * 2);
      }
      for (const [key, path] of groups) {
        const [cr, cg, cb, ca] = key.split(",");
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${ca / 24})`;
        ctx.fill(path);
      }
      drawHeroWords(true);

      // The hero's moon, riding the ring.
      const moonIn = (still ? 1 : clamp((time * 0.85 - 1.9) / 0.8)) * (1 - away);
      if (moonIn > 0) {
        const [mx, my, mz, ms] = heroProject(onRing(still ? 2.2 : time * 0.55), false);
        ctx.fillStyle = `rgba(255,255,255,${moonIn * (mz < 0 ? 0.45 : 1)})`;
        ctx.beginPath();
        ctx.arc(mx, my, (phone ? 5 : 7) * ms, 0, Math.PI * 2);
        ctx.fill();
      }

      const wordsIn = clamp((grow - 0.55) / 0.3);
      if (wordsIn > 0) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const { word, at: pos } of worldWords) {
          const [x, y, z] = worldProject(pos.map((v) => v * 1.08), Rw);
          const depth = clamp((z + 1) / 2);
          ctx.font = `${depth > 0.55 ? 700 : 500} ${Math.round((phone ? 11 : 13) + depth * (phone ? 5 : 9))}px ${font}`;
          ctx.fillStyle = `rgba(255,255,255,${wordsIn * (0.15 + depth * 0.85)})`;
          ctx.fillText(word, x, y);
        }
      }

      // The core amplifies: waves go out from it while the world grows.
      if (grow > 0) {
        const waves = Math.min(1, grow * 3);
        ctx.lineWidth = 1.5;
        for (let n = 0; n < 3; n += 1) {
          const f = ((still ? 0.2 : time * 0.45) + n / 3) % 1;
          ctx.strokeStyle = `rgba(236,23,143,${(1 - f) * 0.5 * waves})`;
          ctx.beginPath();
          ctx.arc(core[0], core[1], 8 + f * Rw * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // The core dot: one of the crowd at first, pink once the funnel forms.
      if (gather > 0) {
        const c = pts[0];
        const k0 = clamp(q * 1.5 - c.o * 0.5);
        const cxn = ((((c.u + time * c.vx) % 1) + 1) % 1) * w;
        let x = mix(cxn, fx + c.lane * half(k0), gather);
        let y = mix(c.v * h, mix(y0, y1, k0), gather);
        if (lift > 0 || grow > 0) [x, y] = core;
        const pulse = still ? 0 : Math.sin(time * 2.4) * 0.5 + 0.5;
        const big = 1.5 + gather * 3.5 + lift * 3 + grow * 2 + pulse * (lift > 0 ? 1.4 : 0);
        ctx.shadowColor = "rgba(236,23,143,.9)";
        ctx.shadowBlur = gather * 26 + lift * 16;
        ctx.fillStyle = `rgba(236,23,143,${gather})`;
        ctx.beginPath();
        ctx.arc(x, y, big, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    const loop = (now) => {
      raf = 0;
      if (!visible || document.hidden) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (!raf && visible && !document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    const onMove = (e) => {
      aim.x = (e.clientX / window.innerWidth) * 2 - 1;
      aim.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const resize = new ResizeObserver(() => { size(); draw(performance.now()); });
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      wake();
    });
    resize.observe(canvas);
    seen.observe(box);
    size();
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      seen.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", wake);
      document.documentElement.style.removeProperty("--pc-tone");
    };
  }, [lang]);

  return (
    <section className="fw" ref={wrap} data-pc-blend="" data-pc-section="hero" data-pc-order="1">
      <div className="fw-pin">
        <div className="fw-pink" ref={pinkRef} aria-hidden="true" />
        <canvas ref={ref} className="fw-canvas" aria-hidden="true" />
        <div className="fw-hero" ref={heroRef}>{children}</div>
        <div className="fw-text">
          {STEPS.map((s, i) => (
            <div key={s.title} className={i === step ? "is-on" : ""}>
              <h2>{t(s.title)}</h2>
              <p>{t(s.line)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export const FUNNEL_CSS = `
  .fw { position: relative; height: 560vh; background: #0a0a0a; color: #fff; }
  .fw-pin { position: sticky; top: 0; height: 100svh; overflow: hidden; }
  .fw-pink { position: absolute; inset: 0; background: radial-gradient(120% 90% at 74% 46%, #f43aa5 0%, #ec178f 55%, #d90f80 100%); }
  @media (max-width: 759px) { .fw-pink { background: radial-gradient(120% 70% at 50% 30%, #f43aa5 0%, #ec178f 55%, #d90f80 100%); } }
  .fw-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .fw-hero { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; padding: 120px clamp(20px, 3.4vw, 48px) clamp(48px, 8vw, 96px); color: #0a0a0a; pointer-events: none; }
  .fw-hero > * { pointer-events: auto; }
  .fw-text { position: absolute; left: clamp(20px, 3.4vw, 48px); top: 50%; transform: translateY(-50%); width: min(34vw, 520px); display: grid; }
  .fw-text > div { grid-area: 1 / 1; opacity: 0; transform: translateY(18px); transition: opacity .5s ease, transform .6s cubic-bezier(.16,1,.3,1); pointer-events: none; }
  .fw-text > .is-on { opacity: 1; transform: none; }
  .fw-text h2 { margin: 0 0 18px; font-size: clamp(40px, 5.4vw, 88px); line-height: .92; letter-spacing: -0.055em; font-weight: 700; }
  .fw-text p { margin: 0; font-size: clamp(17px, 1.6vw, 22px); line-height: 1.35; letter-spacing: -0.015em; color: rgba(255,255,255,.72); }
  @media (max-width: 759px) {
    .fw-text { top: calc(76px + 2vh); transform: none; width: auto; right: 20px; }
    .fw-text h2 { font-size: clamp(34px, 10vw, 48px); margin-bottom: 12px; }
    .fw-text p { font-size: 16px; }
  }
  @media (prefers-reduced-motion: reduce) { .fw-text > div { transition: none; transform: none; } }
`;
