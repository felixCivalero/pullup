import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { initTracking, trackPageView } from "../lib/track.js";
import { trackEvent } from "../lib/analytics.js";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { AgencyOffer } from "../components/agency/AgencyOffer.jsx";
import { DeckTeaser } from "../components/agency/DeckTeaser.jsx";
import { Reveal } from "../components/agency/Reveal.jsx";
import { EngineChart } from "../components/agency/EngineChart.jsx";
import { Toolkit } from "../components/agency/Toolkit.jsx";
import { COVERS, MESSAGE, SERIES, casePath } from "../components/agency/agencyData.js";
import { StoryChart } from "../components/agency/StoryChart.jsx";
import { StoryMark } from "../components/agency/CaseNav.jsx";
import { openRequest } from "../components/agency/request.js";
import { useT } from "../components/agency/i18n.js";
import { LANDING_CSS, LogoBand, SectionLabel } from "./LandingPage.jsx";
import { CORE_CSS, Clip, Field, Spike } from "./CorePage.jsx";

/* /mix — the third option: the sales path of / (who it's for, proof, how,
   toolkit, one offer, booklet) with the /core story told between its
   chapters. Story scenes are unnumbered interludes on black; the sales
   chapters keep their numbers and grounds. Same ids as / so the nav works. */

// Counts every number in a string up from zero the first time it's seen:
// "28.1M" → 0.0M…28.1M, "10,000+" → 0…10,000+. Words stay as they are.
function CountUp({ text }) {
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
        const x = Math.min(1, (now - t0) / 1400);
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
  return <span ref={ref} aria-label={text}>{out}</span>;
}

/* One story per screen. On wide screens the cards stack as you scroll —
   each one slides up over the last — and each leads with its best number. */
function StoryStack() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className="mx-stack">
      {SERIES.map((c, i) => (
        <article key={c.slug} id={`story-${c.slug}`} className="mx-story" style={{ "--sc": c.color, "--i": i }}>
          <div className="mx-story-photo">
            <img src={COVERS[c.slug] || c.image} alt="" loading="lazy" decoding="async" />
          </div>
          <div className="mx-story-body">
            <p className="st-kicker"><StoryMark slug={c.slug} />{t(c.kicker)}</p>
            <p className="mx-story-name">{c.name}</p>
            <p className={`mx-story-big${t(c.score[0]).length > 8 ? " is-long" : ""}`}><CountUp text={t(c.score[0])} /></p>
            <p className="mx-story-big-l">{t(c.score[1])}</p>
            <dl className="mx-story-pb">
              <div><dt>{t("Who")}</dt><dd>{t(c.who)}</dd></div>
              <div><dt>{t("What they gained")}</dt><dd>{t(c.gained)}</dd></div>
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

const scrollToId = (id) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function Hero() {
  const t = useT();
  return (
    <section className="pc-hero pc-dark mx-hero" data-pc-tone="dark" data-pc-section="mix_hero" data-pc-order="1">
      <Field />
      <div className="pc-wrap mx-hero-in">
        <Reveal>
          <p className="pc-eyebrow">{t("For founders, artists and small brands · Stockholm · Nairobi")}</p>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="pc-hero-h mx-hero-h">
            {t("Everyone looks at the clip.")} <span>{t("We look at the people behind it.")}</span>
          </h1>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="pc-hero-sub">{t(MESSAGE.deal)}</p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="pc-hero-cta">
            <button
              type="button"
              className="pc-btn pc-btn-light"
              onClick={() => {
                trackEvent("cta_click", { location: "mix_hero_build" });
                openRequest({ source: "mix_hero" });
              }}
            >
              {t("Build with us")}
              <ArrowRight size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="pc-btn pc-btn-ghost"
              onClick={() => {
                trackEvent("cta_click", { location: "mix_hero_stories" });
                scrollToId("stories");
              }}
            >
              {t("See the stories")}
            </button>
          </div>
        </Reveal>
        <Reveal delay={0.3}>
          <p className="pc-hero-offer">
            <b>{t("One offer")}</b> {t("$3,000 / month · first 3 months, no commitment")}
          </p>
        </Reveal>
      </div>
      <Reveal delay={0.36} className="pc-hero-logos mx-hero-in">
        <LogoBand />
      </Reveal>
    </section>
  );
}

export default function MixPage() {
  const t = useT();
  useEffect(() => {
    initTracking();
    trackPageView("mix");
  }, []);

  return (
    <AgencyShell css={LANDING_CSS + CORE_CSS + MIX_CSS} home>
      <Hero />

      {/* the story, part one: what everyone sees → what's behind it */}
      <div className="fx" data-pc-tone="dark">
        <Clip label="" />
      </div>

      {/* proof */}
      <section id="stories" className="pc-section ch-1" data-pc-section="stories" data-pc-order="3">
        <div className="pc-wrap">
          <SectionLabel n="01">{t("Where we've taken people")}</SectionLabel>
          <Reveal>
            <h2 className="pc-h2 st-h2">{t("They didn't reach a goal. They lived it.")}</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="st-lede">
              {t("Every story starts with a person living their goal as fully as they could at the time. People followed the journey — and the business got the numbers.")}
            </p>
          </Reveal>
          <StoryStack />
        </div>
      </section>

      {/* the story, part two: spikes fade, the line stays → how we build the line */}
      <div className="fx" data-pc-tone="dark">
        <Spike label="" />
      </div>

      <section id="services" className="pc-section ch-2" data-pc-section="services" data-pc-order="4">
        <div className="pc-wrap">
          <SectionLabel n="02">{t("How we take you there")}</SectionLabel>
          <Reveal>
            <h2 className="pc-h2 hw-h2">{t("We build the line. Every week.")}</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="st-lede hw-lede">
              {t("A clear direction first. Then a 30-minute sprint every week that turns where you are right now into content — and every piece measured, so we scale what works.")}
            </p>
          </Reveal>
          <EngineChart />
        </div>
      </section>

      <section id="toolkit" className="pc-section ch-3" data-pc-tone="dark" data-pc-section="toolkit" data-pc-order="5">
        <div className="pc-wrap">
          <SectionLabel n="03">{t("What we build along the way")}</SectionLabel>
          <Reveal>
            <h2 className="pc-h2 tk-h2">{t("Everything we can build. Pulled in when you need it.")}</h2>
          </Reveal>
          <Toolkit />
        </div>
      </section>

      <AgencyOffer
        id="offer"
        source="mix"
        chapter={["04", "One offer"]}
        heading="$3,000 a month. No tiers, no add-ons."
        sub="Strategy, the weekly sprint and every tool behind it — apps, dashboards, tracking. Content is scoped to what actually moves your brand, not a quota of reels."
      />

      <DeckTeaser source="mix" />
    </AgencyShell>
  );
}

const MIX_CSS = `
  .mx-hero { position: relative; overflow: hidden; }
  .mx-hero .fx-field { opacity: 0.7; }
  .mx-hero-in { position: relative; z-index: 1; }
  .mx-hero-h { max-width: 15ch; }
  /* the story interludes sit flush between the sales chapters */
  .fx + .pc-section, .pc-section + .fx { margin-top: 0; }
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
  .mx-story-name { margin-top: 14px; font-size: 18px; font-weight: 700; color: var(--sc); }
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

  /* the core styles darken the page ground; the booklet keeps its white */
  .agency-root:has(.fx) .pc-deck { background: var(--pc-white); color: var(--pc-black); }
`;
