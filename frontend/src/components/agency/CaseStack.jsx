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

/* The cases as one horizontal rail. On wide screens the section pins and the
   page's vertical scroll slides the cards sideways; on phones it's a native
   swipe with snap. `head` (label + heading) stays put above the rail. */
export function CaseStack({ head }) {
  const t = useT();
  const navigate = useNavigate();
  const outerRef = useRef(null);
  const viewRef = useRef(null);
  const trackRef = useRef(null);
  const [pinned, setPinned] = useState(false);
  const [height, setHeight] = useState(null);
  const barRef = useRef(null);
  const countRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia?.("(min-width: 900px) and (prefers-reduced-motion: no-preference)");
    const outer = outerRef.current, view = viewRef.current, track = trackRef.current;
    if (!outer || !view || !track) return undefined;
    let dist = 0, raf = null;
    const n = STORIES.length;
    const show = (k) => {
      if (barRef.current) barRef.current.style.transform = `scaleX(${Math.max(0.04, k)})`;
      if (countRef.current) countRef.current.textContent = String(Math.min(n, Math.floor(k * (n - 1) + 0.5) + 1)).padStart(2, "0");
    };
    const measure = () => {
      const on = !!mq?.matches;
      setPinned(on);
      if (!on) { setHeight(null); track.style.transform = ""; return; }
      dist = Math.max(0, track.scrollWidth - view.clientWidth);
      setHeight(dist + window.innerHeight);
    };
    const onScroll = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        if (mq?.matches) {
          const k = dist ? Math.min(1, Math.max(0, -outer.getBoundingClientRect().top / dist)) : 0;
          track.style.transform = `translate3d(${-k * dist}px, 0, 0)`;
          show(k);
        } else {
          const max = view.scrollWidth - view.clientWidth;
          show(max > 0 ? view.scrollLeft / max : 0);
        }
      });
    };
    measure();
    onScroll();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { measure(); onScroll(); }) : null;
    ro?.observe(view);
    ro?.observe(track);
    mq?.addEventListener?.("change", measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    view.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro?.disconnect();
      mq?.removeEventListener?.("change", measure);
      window.removeEventListener("scroll", onScroll);
      view.removeEventListener("scroll", onScroll);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={outerRef} className={`cr${pinned ? " is-pinned" : ""}`} style={height ? { height } : undefined}>
      <div className="cr-pin">
        {head && <div className="cr-head">{head}</div>}
        <div ref={viewRef} className="cr-view">
          <div ref={trackRef} className="cr-track">
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
                      trackEvent("cta_click", { location: `case_rail_${c.slug}` });
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
        </div>
        <div className="cr-foot">
          <span className="cr-bar"><span ref={barRef} /></span>
          <span className="cr-count"><b ref={countRef}>01</b> <span>/ {String(STORIES.length).padStart(2, "0")}</span></span>
        </div>
      </div>
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
  /* rail geometry: the track starts where the page's content column starts */
  .cr { --gut: max(clamp(16px, 5vw, 56px), calc((100vw - 1180px) / 2 + clamp(16px, 5vw, 56px))); position: relative; }
  .cr-head { padding: 0 var(--gut); }
  .cr-view { overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scrollbar-width: none; margin-top: clamp(24px, 3vw, 40px); }
  .cr-view::-webkit-scrollbar { display: none; }
  .cr-track { display: flex; gap: clamp(14px, 1.6vw, 24px); padding: 4px var(--gut) 8px; width: max-content; will-change: transform; }
  .cr-foot { padding: 0 var(--gut); margin-top: clamp(16px, 2vw, 24px); display: flex; align-items: center; gap: 16px; }
  .cr-bar { flex: 1; max-width: 320px; height: 2px; background: rgba(0,0,0,0.1); border-radius: 1px; overflow: hidden; }
  .cr-bar span { display: block; height: 100%; background: #0a0a0a; transform-origin: left; transform: scaleX(0.04); transition: transform 0.15s linear; }
  .cr-count { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: 0.06em; }
  .cr-count span { color: #6e6e73; }
  .cr-count b { font-weight: inherit; }

  /* the card */
  .mx-story {
    position: relative; overflow: hidden; display: grid; grid-template-columns: 1fr; flex: none;
    width: min(86vw, 420px); scroll-snap-align: start; scroll-margin-left: var(--gut);
    border: 1px solid rgba(0,0,0,0.14); border-radius: 22px; background: #fff; color: #000;
  }
  .mx-story::before { content: ""; position: absolute; z-index: 2; left: 0; right: 0; top: 0; height: 5px; background: var(--sc); }
  .mx-story-photo { position: relative; height: 200px; overflow: hidden; background: #111; }
  .mx-story-photo img { width: 100%; height: 100%; object-fit: cover; }
  .mx-story-body { padding: clamp(20px, 2.6vw, 36px); display: grid; align-content: start; }
  .mx-story-name { margin-top: 12px; font-size: clamp(24px, 2.4vw, 34px); font-weight: 700; letter-spacing: -0.03em; line-height: 1.05; }
  .mx-story-tog { margin-top: 16px; font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--sc); }
  .mx-story-big { margin-top: 4px; font-size: clamp(48px, 6vw, 96px); font-weight: 700; line-height: 0.95; letter-spacing: -0.05em; font-variant-numeric: tabular-nums; color: var(--sc); }
  .mx-story-big.is-long { font-size: clamp(40px, 4.6vw, 72px); }
  .mx-story-big-l { margin-top: 8px; font-size: clamp(16px, 1.5vw, 19px); font-weight: 600; letter-spacing: -0.01em; }
  .mx-story-pb { margin: 20px 0 0; display: grid; gap: 12px; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 16px; }
  .mx-story-pb dt { font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #6e6e73; }
  .mx-story-pb dd { margin: 3px 0 0; font-size: 15px; line-height: 1.45; }
  .mx-story-chart { margin-top: 20px; }
  .mx-story .st-link { margin-top: 18px; }
  @media (max-width: 899px) { .mx-story { align-content: start; } }

  /* wide screens: pinned, the vertical scroll drives the rail */
  @media (min-width: 900px) {
    .cr.is-pinned .cr-pin { position: sticky; top: 0; height: 100svh; box-sizing: border-box; padding: 88px 0 clamp(20px, 3vh, 32px); display: flex; flex-direction: column; }
    .cr.is-pinned .cr-view { flex: 1; min-height: 0; overflow: visible; scroll-snap-type: none; }
    .cr.is-pinned .cr-track { height: 100%; box-sizing: border-box; }
    .mx-story { width: min(1000px, 76vw); grid-template-columns: 5fr 6fr; }
    .cr.is-pinned .mx-story { height: 100%; max-height: 720px; }
    .mx-story-photo { height: auto; }
    .mx-story-body { overflow: hidden; }
    .mx-story-pb { grid-template-columns: 1fr 1fr; gap: 20px; }
  }
  @media (min-width: 900px) and (max-height: 820px) {
    .mx-story-pb { grid-template-columns: 1fr; margin-top: 14px; padding-top: 12px; }
    .mx-story-pb > div:first-child { display: none; }
    .mx-story-chart { margin-top: 14px; }
  }
`;
