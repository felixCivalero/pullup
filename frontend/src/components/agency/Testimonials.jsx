import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { COVERS } from "./agencyData.js";
import { useT } from "./i18n.js";

/* What clients say — one quote at a time. Real words from real people ONLY:
   an entry with `quote: null` is a reserved slot and never renders. Paste the
   person's own words in when they send them (English here = translation; the
   Swedish dictionary holds the original). */
export const WORDS = [
  {
    who: "Emma Lerider Harrsson",
    org: "POC",
    quote: "Everyone should have a Felix.",
  },
  {
    who: "Anton Dalsätt",
    org: "BKM Health",
    quote: "We'd never have got here without you.",
  },
  {
    who: "Sebastian Ramsay",
    org: "STIGA",
    quote: "If Mulle Meck were a real person, it would probably be Felix. Whatever you need, he fixes it. Either himself or with help from someone he knows.",
  },
  {
    who: "Adam Flambo",
    org: "Creator",
    photo: COVERS["adam-flambo"],
    quote: "That's how I see you. Besides being a super chill guy, you're the one who set up my studio in a single day while I stood there navel-gazing. That's what you wish clients understood — that you're a fucking maker. An action taker.",
  },
  // Reserved — waiting for their own words.
  { who: "Tolga Duran", org: "BKM Health", quote: null },
  { who: "Li Karlsén", org: "Freediver", photo: COVERS["li-karlsen"], quote: null },
  { who: "Adam Dawood", org: "Artist", photo: COVERS["adam-dawood"], quote: null },
];
const LIVE = WORDS.filter((w) => w.quote);
const initials = (name) => name.split(" ").map((p) => p[0]).slice(0, 2).join("");
const EVERY = 7000;

export function Testimonials() {
  const t = useT();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = LIVE.length;
  const go = useCallback((to, how) => {
    setI(((to % n) + n) % n);
    if (how) trackEvent("testimonial_nav", { how });
  }, [n]);

  // Auto-advance, unless the reader is on it or prefers no motion.
  useEffect(() => {
    if (n < 2 || paused) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const id = setTimeout(() => go(i + 1), EVERY);
    return () => clearTimeout(id);
  }, [i, paused, n, go]);

  // Swipe on touch.
  const x0 = useRef(null);
  const onDown = (e) => { x0.current = e.clientX; };
  const onUp = (e) => {
    if (x0.current == null) return;
    const dx = e.clientX - x0.current;
    x0.current = null;
    if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1), "swipe");
  };

  if (!n) return null;
  return (
    <div
      className={`tm${paused ? " is-paused" : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onPointerDown={onDown}
      onPointerUp={onUp}
      aria-roledescription="carousel"
    >
      <div className="tm-stage">
        {LIVE.map((w, k) => (
          <figure key={w.who} className={`tm-slide${k === i ? " is-on" : ""}${t(w.quote).length < 60 ? " is-short" : ""}`} aria-hidden={k !== i}>
            <blockquote>“{t(w.quote)}”</blockquote>
            <figcaption>
              {w.photo
                ? <img src={w.photo} alt="" loading="lazy" decoding="async" />
                : <span className="tm-mono" aria-hidden="true">{initials(w.who)}</span>}
              <span><b>{w.who}</b>{t(w.org)}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      {n > 1 && (
        <div className="tm-nav">
          <div className="tm-dots">
            {LIVE.map((w, k) => (
              <button key={w.who} type="button" className={k === i ? "is-on" : ""} onClick={() => go(k, "dot")} aria-label={w.who}>
                {k === i && <span key={i} style={{ animationDuration: `${EVERY}ms` }} />}
              </button>
            ))}
          </div>
          <div className="tm-arrows">
            <button type="button" onClick={() => go(i - 1, "prev")} aria-label={t("Previous")}><ArrowLeft size={18} strokeWidth={1.75} /></button>
            <button type="button" onClick={() => go(i + 1, "next")} aria-label={t("Next")}><ArrowRight size={18} strokeWidth={1.75} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

export const TESTIMONIALS_CSS = `
  .tm { margin-top: clamp(28px, 4vw, 44px); touch-action: pan-y; user-select: none; }
  /* every slide in one cell: the stage is as tall as the longest quote, so nothing jumps */
  .tm-stage { display: grid; }
  .tm-slide { grid-area: 1 / 1; margin: 0; max-width: 940px; opacity: 0; transform: translateY(10px); transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.16,1,0.3,1); pointer-events: none; display: grid; align-content: start; align-self: center; }
  .tm-slide.is-on { opacity: 1; transform: none; pointer-events: auto; }
  .tm-slide blockquote { margin: 0; font-size: clamp(24px, 2.7vw, 38px); font-weight: 600; line-height: 1.2; letter-spacing: -0.03em; }
  .tm-slide.is-short blockquote { font-size: clamp(40px, 5.6vw, 80px); font-weight: 700; line-height: 1.02; letter-spacing: -0.05em; }
  .tm-slide figcaption { margin-top: 24px; display: flex; align-items: center; gap: 12px; }
  .tm-slide figcaption img, .tm-mono { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex: none; }
  .tm-mono { display: grid; place-items: center; background: #f2f2f2; color: #0a0a0a; font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
  .tm-slide figcaption > span:last-child { display: grid; gap: 1px; font-size: 15px; color: var(--grey, #6e6e73); }
  .tm-slide figcaption b { font-size: 16px; color: #0a0a0a; letter-spacing: -0.01em; }

  .tm-nav { margin-top: clamp(28px, 4vw, 40px); display: flex; align-items: center; justify-content: space-between; gap: 16px; max-width: 940px; }
  .tm-dots { display: flex; gap: 8px; }
  .tm-dots button { position: relative; overflow: hidden; width: 28px; height: 4px; border-radius: 2px; border: 0; padding: 0; background: rgba(0,0,0,0.12); cursor: pointer; }
  .tm-dots button.is-on { width: 56px; background: rgba(0,0,0,0.28); }
  .tm-dots button span { position: absolute; inset: 0; background: #0a0a0a; transform-origin: left; animation: tm-fill linear forwards; }
  .tm.is-paused .tm-dots button span { animation-play-state: paused; }
  @keyframes tm-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  .tm-arrows { display: flex; gap: 8px; }
  .tm-arrows button { width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.16); background: #fff; color: #0a0a0a; display: grid; place-items: center; cursor: pointer; transition: background-color 0.2s ease, color 0.2s ease; }
  .tm-arrows button:hover { background: #0a0a0a; color: #fff; }
  @media (prefers-reduced-motion: reduce) {
    .tm-slide { transition: none; }
    .tm-dots button span { animation: none; transform: none; }
  }
`;
