import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { Reveal } from "./Reveal.jsx";
import { StoryChart } from "./StoryChart.jsx";
import { COVERS, SERIES, casePath } from "./agencyData.js";
import { useT } from "./i18n.js";

/* The cases on the front page: one card per case — photo, what followed (the
   number), where they started, how they grew, the chart — stacking as you
   scroll on wide screens. */

// Counts every number in a string up from zero the first time it's seen:
// "28.1M" → 0.0M…28.1M, "10,000+" → 0…10,000+. Words stay as they are.
// Animates the English source; every frame goes through t(), so Swedish reads
// "10 000+" and "28,1 milj." all the way up.
function CountUp({ text }) {
  const t = useT();
  const ref = useRef(null);
  const [k, setK] = useState(() =>
    typeof IntersectionObserver === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 1 : 0,
  );
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let raf = null;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const t0 = performance.now();
      const tick = (now) => {
        const x = Math.min(1, Math.max(0, (now - t0) / 1400));
        setK(1 - (1 - x) ** 3);
        if (x < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => { obs.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const out = text.replace(/\d[\d,]*(\.\d+)?/g, (m) => {
    const dec = (m.split(".")[1] || "").length;
    const v = Number(m.replace(/,/g, "")) * k;
    return m.includes(",") ? Math.round(v).toLocaleString("en-US") : v.toFixed(dec);
  });
  return <span ref={ref} aria-label={t(text)}>{t(out)}</span>;
}

/* One story per screen. On wide screens the cards stack as you scroll —
   each one slides up over the last — and each leads with its best number. */
export function CaseStack() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className="mx-stack">
      {STORIES.map((c, i) => (
        <article key={c.slug} id={`story-${c.slug}`} className="mx-story" style={{ "--sc": c.color, "--i": i }}>
          <div className="mx-story-photo">
            <img src={COVERS[c.slug] || c.image} alt="" loading="lazy" decoding="async" />
          </div>
          <div className="mx-story-body">
            <p className="st-kicker">
              <span className="pc-storymark">{t("Story")} {String(i + 1).padStart(2, "0")} <span>/ {String(STORIES.length).padStart(2, "0")}</span></span>
              {t(c.kicker)}
            </p>
            <h3 className="mx-story-name">{c.name}</h3>
            <p className="mx-story-tog">{t("What followed")}</p>
            <p className={`mx-story-big${t(c.score[0]).length > 8 ? " is-long" : ""}`}><CountUp text={c.score[0]} /></p>
            <p className="mx-story-big-l">{t(c.score[1])}</p>
            <dl className="mx-story-pb">
              <div><dt>{t("Where they started")}</dt><dd>{t(c.who)}</dd></div>
              <div><dt>{t("How they grew")}</dt><dd>{t(c.gained)}</dd></div>
            </dl>
            <Reveal className="mx-story-chart"><StoryChart chart={c.chart} /></Reveal>
            <a
              className="st-link"
              href={casePath(c.slug)}
              onClick={(e) => {
                e.preventDefault();
                trackEvent("cta_click", { location: `mix_story_${c.slug}` });
                navigate(casePath(c.slug));
              }}
            >
              {t("Read the story")}
              <ArrowRight size={16} strokeWidth={1.75} />
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}

// The order and emphasis for this page: STIGA right after BKM, and Kaijas
// led by its people — artists, team and guests — not the room.
const ORDER = ["li-karlsen", "bkm", "stiga", "kaijas", "adam-dawood", "adam-flambo"];
const MIX_EDIT = {
  kaijas: {
    score: ["Artists. Team. Guests.", "the brand was the people — never the room"],
    gained: "The artists, the team and the guests became the brand — and the reason people kept coming back.",
  },
};
const STORIES = ORDER.map((slug) => SERIES.find((c) => c.slug === slug))
  .filter(Boolean)
  .concat(SERIES.filter((c) => !ORDER.includes(c.slug)))
  .map((c) => ({ ...c, ...MIX_EDIT[c.slug] }));



export const CASE_STACK_CSS = `
  /* stories: one per screen, stacking on wide screens */
  .mx-stack { display: grid; gap: 20px; }
  .mx-story {
    position: relative; overflow: hidden; display: grid; grid-template-columns: 1fr;
    border: 1px solid #000; border-radius: 24px; background: #fff; color: #000;
    box-shadow: 0 -24px 60px -30px rgba(0,0,0,0.35);
  }
  .mx-story::before { content: ""; position: absolute; z-index: 2; left: 0; right: 0; top: 0; height: 6px; background: var(--sc); }
  .mx-story-photo { position: relative; height: 220px; overflow: hidden; background: #111; }
  .mx-story-photo img { width: 100%; height: 100%; object-fit: cover; }
  .mx-story-photo::after { content: ""; position: absolute; inset: 0; background: linear-gradient(transparent 50%, rgba(0,0,0,0.45)); }
  .mx-story-body { padding: clamp(22px, 3vw, 40px); display: grid; align-content: start; gap: 0; }
  .mx-story-name { margin-top: 14px; font-size: clamp(26px, 2.6vw, 38px); font-weight: 700; letter-spacing: -0.03em; line-height: 1.05; }
  .mx-story-tog { margin-top: 18px; font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--sc); }
  .mx-story-big { margin-top: 4px; font-size: clamp(56px, 7.4vw, 112px); font-weight: 700; line-height: 0.95; letter-spacing: -0.05em; font-variant-numeric: tabular-nums; color: var(--sc); }
  .mx-story-big.is-long { font-size: clamp(44px, 5.4vw, 80px); }
  .mx-story-big-l { margin-top: 8px; font-size: clamp(17px, 1.6vw, 20px); font-weight: 600; letter-spacing: -0.01em; }
  .mx-story-pb { margin: 22px 0 0; display: grid; gap: 12px; border-top: 1px solid var(--pc-line); padding-top: 18px; }
  .mx-story-pb dt { font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--pc-grey); }
  .mx-story-pb dd { margin: 3px 0 0; font-size: 16px; line-height: 1.45; }
  .mx-story-chart { margin-top: 22px; }
  .mx-story .st-link { margin-top: 18px; }
  @media (min-width: 900px) {
    .mx-stack { gap: 0; }
    .mx-story {
      position: sticky; top: calc(84px + var(--i) * 14px);
      height: calc(100svh - 104px); min-height: 600px; max-height: 760px;
      grid-template-columns: 5fr 6fr; margin-bottom: 18vh;
    }
    .mx-story:last-child { margin-bottom: 0; }
    .mx-story-photo { height: auto; }
    .mx-story-body { overflow: hidden; }
    .mx-story-pb { grid-template-columns: 1fr 1fr; gap: 20px; }
  }

  @media (min-width: 900px) and (max-height: 820px) {
    .mx-story-pb { grid-template-columns: 1fr; margin-top: 16px; padding-top: 14px; }
    .mx-story-pb > div:first-child { display: none; }
    .mx-story-chart { margin-top: 16px; }
  }

`;
