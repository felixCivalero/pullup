import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { initTracking, trackPageView } from "../lib/track.js";
import { trackEvent } from "../lib/analytics.js";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { AgencyOffer } from "../components/agency/AgencyOffer.jsx";
import { DeckTeaser } from "../components/agency/DeckTeaser.jsx";
import { Reveal } from "../components/agency/Reveal.jsx";
import { EngineChart } from "../components/agency/EngineChart.jsx";
import { Toolkit } from "../components/agency/Toolkit.jsx";
import { MESSAGE, SERIES } from "../components/agency/agencyData.js";
import { openRequest } from "../components/agency/request.js";
import { useT } from "../components/agency/i18n.js";
import { LANDING_CSS, LogoBand, SectionLabel, StoryCard } from "./LandingPage.jsx";
import { CORE_CSS, Clip, Field, Line, Spike } from "./CorePage.jsx";

/* /mix — the third option: the sales path of / (who it's for, proof, how,
   toolkit, one offer, booklet) with the /core story told between its
   chapters. Story scenes are unnumbered interludes on black; the sales
   chapters keep their numbers and grounds. Same ids as / so the nav works. */

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
        <Line label="" />
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
          <div className="st-list">
            {SERIES.map((story) => (
              <StoryCard key={story.slug} story={story} source="mix" />
            ))}
          </div>
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
  /* the core styles darken the page ground; the booklet keeps its white */
  .agency-root:has(.fx) .pc-deck { background: var(--pc-white); color: var(--pc-black); }
`;
