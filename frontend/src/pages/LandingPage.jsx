import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { AuthGate, resolveNext } from "../components/auth/AuthGate.jsx";
import { supabase } from "../lib/supabase.js";
import { resolveStoredSession } from "../lib/validateStoredSession.mjs";
import { trackEvent } from "../lib/analytics.js";
import { initTracking, trackPageView } from "../lib/track.js";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { DeckTeaser } from "../components/agency/DeckTeaser.jsx";
import { Superpowers } from "../components/agency/Superpowers.jsx";
import { Reveal } from "../components/agency/Reveal.jsx";
import { StoryMark } from "../components/agency/CaseNav.jsx";
import { BASE_MONTHLY, FLOW, MESSAGE, OUTPUT, SERIES, casePath, storyCountWord } from "../components/agency/agencyData.js";
import { StoryChart, STORY_CHART_CSS } from "../components/agency/StoryChart.jsx";
import { EngineChart, ENGINE_CSS } from "../components/agency/EngineChart.jsx";
import { openRequest } from "../components/agency/request.js";
import { useT } from "../components/agency/i18n.js";

/* The public front door. One message (MESSAGE): we grow the people who grow
   the brand. Readable without reading: the hero's three-step flow, a coloured
   scoreboard (one number per story), then the stories — each one a headline,
   person → brand, and a chart of its real numbers (agencyData SERIES) —
   then what you get → why → superpowers → booklet. */

const scrollToId = (id) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

// Brand marks. Pure-black silhouettes (Zoda ships white) — the hero band
// forces them all to white. `boost` evens out the optical size of the
// square badges against the wide wordmarks.
const LOGOS = [
  { src: "/landing/logos/soho-house.png", alt: "Soho House", width: 280, height: 179, boost: 1.6 },
  { src: "/landing/logos/doberman.png", alt: "EY Doberman", width: 705, height: 139 },
  { src: "/landing/logos/cliff-barnes.svg", alt: "Cliff Barnes Bränneri", width: 408, height: 176 },
  { src: "/landing/logos/aperol.png", alt: "Aperol", width: 1280, height: 618, boost: 1.2 },
  { src: "/zoda_logotype_white.webp", alt: "Zoda", width: 1600, height: 541 },
  { src: "/landing/logos/showlighters.png", alt: "Kaijas", // file is the Kaijas mark
    width: 3830, height: 2267 },
  { src: "/landing/logos/hendricks-gin.png", alt: "Hendrick's Gin", width: 160, height: 160, boost: 2.6 },
  { src: "/landing/logos/jagermeister.png", alt: "Jägermeister", width: 160, height: 160, boost: 1.9 },
];

// An endless strip: two identical groups slide left by exactly one group.
function LogoBand() {
  const t = useT();
  return (
    <div className="pc-logos">
      <p className="pc-logos-label">{t("Trusted by")}</p>
      <div className="pc-logos-viewport">
        <div className="pc-logos-track">
          {[0, 1].map((copy) => (
            <ul className="pc-logos-group" key={copy} aria-hidden={copy === 1 ? "true" : undefined}>
              {LOGOS.map((logo) => (
                <li key={logo.alt}>
                  <img
                    src={logo.src}
                    alt={copy === 0 ? logo.alt : ""}
                    width={logo.width}
                    height={logo.height}
                    style={{ "--boost": logo.boost || 1 }}
                    decoding="async"
                  />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ n, children }) {
  return (
    <p className="pc-label">
      <span>{n}</span>
      {children}
    </p>
  );
}


function StoryCard({ story }) {
  const navigate = useNavigate();
  const t = useT();
  const { slug, color, kicker, name, title, person, brand, chart } = story;
  return (
    <Reveal delay={0.04}>
      <article id={`story-${slug}`} className="st-card" style={{ "--sc": color }}>
        <div className="st-top">
          <p className="st-kicker"><StoryMark slug={slug} />{t(kicker)}</p>
          <p className="st-name">{name}</p>
          <h3 className="st-title">{t(title)}</h3>
        </div>
        <div className="st-body">
          <dl className="st-pb">
            <div className="st-pb-row">
              <dt>{t("The person")}</dt>
              <dd>{t(person)}</dd>
            </div>
            <div className="st-pb-row is-brand">
              <dt>{t("What the brand got")}</dt>
              <dd>{t(brand)}</dd>
            </div>
          </dl>
          <div className="st-chart">
            <StoryChart chart={chart} />
          </div>
        </div>
        <a
          className="st-link"
          href={casePath(slug)}
          onClick={(e) => {
            e.preventDefault();
            trackEvent("cta_click", { location: `landing_story_${slug}` });
            navigate(casePath(slug));
          }}
        >
          {t("Read the story")}
          <ArrowRight size={16} strokeWidth={1.75} />
        </a>
      </article>
    </Reveal>
  );
}

function AgencyPage() {
  const navigate = useNavigate();
  const t = useT();
  const toStories = () => {
    trackEvent("cta_click", { location: "hero_stories" });
    scrollToId("stories");
  };

  return (
    <>
      {/* ─── HERO ─── */}
      <section className="pc-hero pc-dark" data-pc-tone="dark" data-pc-section="hero" data-pc-order="1">
        <div className="pc-wrap">
          <Reveal>
            <p className="pc-eyebrow">{t("For brands and creators · Stockholm · Nairobi")}</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="pc-hero-h">{t(MESSAGE.promise)}</h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="pc-hero-sub">
              {t(MESSAGE.deal)}
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <ol className="hf">
              {FLOW.map(([k, v], i) => (
                <li key={k} className={`hf-step hf-${i}`}>
                  <span className="hf-k">{t(k)}</span>
                  <span className="hf-v">{t(v)}</span>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="pc-hero-cta">
              <button
                type="button"
                className="pc-btn pc-btn-light"
                onClick={() => {
                  trackEvent("cta_click", { location: "hero_build" });
                  openRequest({ source: "hero" });
                }}
              >
                {t("Build with us")}
                <ArrowRight size={18} strokeWidth={1.75} />
              </button>
              <button type="button" className="pc-btn pc-btn-ghost" onClick={toStories}>
                {t("See the stories")}
              </button>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.36} className="pc-hero-logos">
          <LogoBand />
        </Reveal>
      </section>

      {/* ─── THE STORIES ─── */}
      <section id="stories" className="pc-section" data-pc-section="stories" data-pc-order="3">
        <div className="pc-wrap">
          <SectionLabel n="01">{t("The stories")}</SectionLabel>
          <Reveal>
            <h2 className="pc-h2 st-h2">{t("Grow the person. The brand follows.")}</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="st-lede">
              {t(`${storyCountWord} people, ${storyCountWord.toLowerCase()} brands. Every story reads the same way: who we grew — and what the brand got.`)}
            </p>
          </Reveal>
          <div className="st-list">
            {SERIES.map((story) => (
              <StoryCard key={story.slug} story={story} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHAT YOU GET ─── */}
      <section id="services" className="pc-section pc-rule" data-pc-section="services" data-pc-order="4">
        <div className="pc-wrap">
          <SectionLabel n="02">{t("What you get")}</SectionLabel>
          <Reveal>
            <h2 className="pc-h2 hw-h2">{t("A clear direction. Then we scale.")}</h2>
          </Reveal>
          <EngineChart />
          <ul className="og-grid">
            {OUTPUT.map((o, i) => (
              <li key={o.t}>
                <Reveal delay={i * 0.06} className="og-cell">
                  <span className="og-when">{t(o.when)}</span>
                  <b>{t(o.t)}</b>
                  <span className="og-b">{t(o.b)}</span>
                </Reveal>
              </li>
            ))}
          </ul>
          <Reveal className="hw-cta">
            <div>
              <p className="hw-cta-k">{t("Start with the core")}</p>
              <p className="hw-cta-v">
                ${BASE_MONTHLY.toLocaleString("en-US")}<span> {t("/ month")}</span>
              </p>
              <p className="hw-cta-l">{t("The first 3 months are a trust period — full work, no commitment.")}</p>
            </div>
            <div className="hw-cta-actions">
              <button
                type="button"
                className="pc-btn hw-cta-btn"
                onClick={() => {
                  trackEvent("cta_click", { location: "services_build" });
                  openRequest({ source: "services" });
                }}
              >
                {t("Build with us")}
                <ArrowRight size={18} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="pc-btn pc-btn-ghost"
                onClick={() => {
                  trackEvent("cta_click", { location: "services_superpowers" });
                  document.getElementById("superpowers")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {t("Add superpowers")}
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── WHY IT WORKS ─── */}
      <section id="why" className="pc-section pc-dark" data-pc-tone="dark" data-pc-section="why" data-pc-order="5">
        <div className="pc-wrap">
          <SectionLabel n="03">{t("Why it works")}</SectionLabel>
          <Reveal>
            <h2 className="pc-h2 pc-h2-xl wy-h2">
              {t("The strongest brands aren't invented.")} <span>{t("They're revealed.")}</span>
            </h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="wy-lede">
              {t("Every brand already has a self. Most just haven't been allowed to express it. We don't build you a persona. We help you become what you already are, out loud and without compromise, until people can feel it.")}
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="wy-bio">
              {t("PullUp is led by Felix Civalero Stolpe, who spent four years studying people, with a focus on cognition and pain, and more than three years treating them. He has published a book and is writing the next. What it taught him: people trust what is real.")}
            </p>
          </Reveal>
          <Reveal>
            <p className="wy-close">{t("Not marketing.")} <span>{t("Becoming.")}</span></p>
          </Reveal>
        </div>
      </section>

      <Superpowers />

      <DeckTeaser source="landing" />

      {/* ─── CLOSE ─── */}
      <section id="start" className="pc-section pc-dark cl" data-pc-tone="dark" data-pc-section="close" data-pc-order="90">
        <div className="pc-wrap">
          <Reveal>
            <h2 className="pc-h2 pc-h2-xl cl-h2">{t("Your brand could be the next story.")}</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="cl-lede">
              {t("We take on a few brands and creators at a time. Tell us who you are and where you want to go.")}
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="cl-cta">
              <button
                type="button"
                className="pc-btn pc-btn-light"
                onClick={() => {
                  trackEvent("cta_click", { location: "close_conversation" });
                  openRequest({ source: "close" });
                }}
              >
                {t("Start a conversation")}
                <ArrowRight size={18} strokeWidth={1.75} />
              </button>
              <a
                className="pc-btn pc-btn-ghost"
                href="/start"
                onClick={(e) => {
                  e.preventDefault();
                  trackEvent("cta_click", { location: "close_host" });
                  navigate("/start");
                }}
              >
                {t("Host on PullUp")}
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/* ─── component ─── */
export function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // /login floats the auth modal over the page; everything else is the page.
  const view = useMemo(
    () => (location.pathname === "/login" ? "login" : "hero"),
    [location.pathname],
  );

  useEffect(() => {
    initTracking();
    trackPageView("landing");
  }, []);
  const t = useT();
  useEffect(() => {
    const prev = document.title;
    document.title = `PullUp — ${t(MESSAGE.promise).replace(/\.$/, "")}`;
    return () => {
      document.title = prev;
    };
  }, [t]);

  // Arriving via a link from another page (/#stories, /#deck …) lands on it.
  useEffect(() => {
    const target = { "#stories": "stories", "#cases": "stories", "#work": "stories", "#why": "why", "#services": "services", "#how": "services", "#superpowers": "superpowers", "#deck": "deck", "#start": "start" }[location.hash];
    if (!target) return;
    const t = setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => clearTimeout(t);
  }, [location.hash]);

  // The one auth check — only on the login action. A stored session is
  // validated server-side: valid → straight into the room; dead → cleared so
  // the form shows cleanly; unknown (network blip) → left untouched.
  useEffect(() => {
    if (view !== "login") return;
    let cancelled = false;
    (async () => {
      const { status } = await resolveStoredSession({
        auth: {
          getSession: () => supabase.auth.getSession(),
          getUser: () => supabase.auth.getUser(),
          refreshSession: () => supabase.auth.refreshSession(),
        },
      });
      if (cancelled) return;
      if (status === "valid") {
        navigate(resolveNext(searchParams), { replace: true });
      } else if (status === "dead") {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, navigate, searchParams]);

  // The auth modal locks the screen; the page itself scrolls freely.
  useEffect(() => {
    const cls = "pullup-auth-locked";
    if (view === "hero") document.body.classList.remove(cls);
    else document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [view]);

  return (
    <>
      <AgencyShell css={STYLES} hideCursor={view === "login"}>
        <AgencyPage />
      </AgencyShell>
      {view === "login" && (
        <AuthGate
          initialMode="login"
          redirectTo={resolveNext(searchParams)}
          onDismiss={() => navigate("/")}
          onSignupIntent={() => navigate("/start")}
        />
      )}
    </>
  );
}

/* ─── styles ─── */
const STYLES = `
  /* ─── hero ─── */
  .pc-hero {
    min-height: 100svh;
    display: flex; flex-direction: column; justify-content: flex-end;
    padding: clamp(104px, 14vh, 140px) 0 clamp(24px, 3.4vh, 40px);
  }
  .pc-hero-logos { margin-top: clamp(40px, 7vh, 88px); }

  /* ─── brand band ─── */
  .pc-logos {
    border-top: 1px solid var(--pc-line-dark);
    padding-top: clamp(20px, 2.6vw, 28px);
  }
  .pc-logos-label {
    max-width: 1240px; margin: 0 auto 18px;
    padding: 0 clamp(16px, 5vw, 56px);
    font-size: 12px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase;
    color: rgba(255,255,255,0.45);
  }
  .pc-logos-viewport {
    overflow: hidden;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
    mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  }
  .pc-logos-track {
    display: flex; width: max-content;
    animation: pc-logos 40s linear infinite;
  }
  .pc-logos-viewport:hover .pc-logos-track { animation-play-state: paused; }
  .pc-logos-group {
    list-style: none; margin: 0; padding: 0;
    display: flex; align-items: center; flex: none;
  }
  .pc-logos-group li { flex: none; padding: 0 clamp(26px, 3.4vw, 48px); display: flex; align-items: center; height: 48px; }
  .pc-logos-group img {
    display: block; width: auto;
    height: calc(24px * var(--boost, 1));
    max-width: 150px; max-height: 62px; object-fit: contain;
    filter: brightness(0) invert(1);
    opacity: 0.85;
  }
  @keyframes pc-logos { to { transform: translateX(-50%); } }
  @media (prefers-reduced-motion: reduce) {
    .pc-logos-track { animation: none; width: 100%; }
    .pc-logos-group { flex-wrap: wrap; justify-content: center; row-gap: 12px; }
    .pc-logos-group + .pc-logos-group { display: none; }
    .pc-logos-viewport { -webkit-mask-image: none; mask-image: none; }
  }
  .pc-hero-h {
    font-size: clamp(40px, min(8.6vw, 10vh), 128px);
    font-weight: 600; line-height: 0.96; letter-spacing: -0.045em;
    max-width: 14ch;
  }
  .pc-hero-sub {
    margin-top: clamp(20px, 3.4vh, 44px);
    max-width: 64ch;
    font-size: clamp(17px, 1.6vw, 20px); line-height: 1.55;
    color: rgba(255,255,255,0.7);
  }
  .pc-hero-cta {
    margin-top: clamp(24px, 4.4vh, 56px);
    display: flex; flex-wrap: wrap; align-items: center; gap: 16px 28px;
  }

  /* ─── hero flow: person → content → brand, at a glance ─── */
  .hf {
    list-style: none; padding: 0; margin: clamp(24px, 4vh, 44px) 0 0;
    display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px;
  }
  .hf-step {
    position: relative; display: grid; gap: 2px;
    padding: 12px 18px 13px; border-radius: 14px;
    background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14);
  }
  .hf-step + .hf-step { margin-left: 22px; }
  .hf-step + .hf-step::before {
    content: "→"; position: absolute; left: -22px; top: 50%; transform: translateY(-50%);
    width: 22px; text-align: center; color: rgba(255,255,255,0.45); font-size: 16px;
  }
  .hf-k { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
  .hf-v { font-size: 13px; color: rgba(255,255,255,0.6); }
  .hf-2 { background: #D9480F; border-color: #D9480F; }
  .hf-2 .hf-v { color: rgba(255,255,255,0.85); }

  /* ─── stories ─── */
  .st-h2 { max-width: 18ch; }
  .st-lede { margin: -16px 0 clamp(32px, 4vw, 48px); max-width: 56ch; font-size: clamp(17px, 1.6vw, 20px); line-height: 1.55; color: #333; }
  .st-list { display: grid; gap: clamp(16px, 2vw, 24px); }
  .st-card {
    position: relative; overflow: hidden; scroll-margin-top: 88px;
    display: grid; grid-template-columns: 1fr; gap: clamp(24px, 3vw, 36px);
    padding: clamp(28px, 4vw, 48px) clamp(22px, 4vw, 48px) clamp(24px, 4vw, 44px);
    border: 1px solid var(--pc-black); border-radius: 20px; background: #fff; color: #000;
  }
  .st-card::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 6px; background: var(--sc); }
  .st-kicker { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pc-grey); }
  .st-name { margin-top: 18px; font-size: clamp(17px, 1.6vw, 20px); font-weight: 700; letter-spacing: -0.01em; color: var(--sc); }
  .st-title { margin-top: 6px; font-size: clamp(32px, 4.4vw, 60px); font-weight: 600; line-height: 0.98; letter-spacing: -0.045em; max-width: 18ch; }
  .st-body { display: grid; grid-template-columns: 1fr; gap: clamp(28px, 3vw, 40px); border-top: 1px solid var(--pc-line); padding-top: clamp(24px, 3vw, 32px); }
  @media (min-width: 900px) { .st-body { grid-template-columns: 5fr 6fr; align-items: center; gap: 56px; } }
  .st-pb { margin: 0; display: grid; gap: 0; }
  .st-pb-row { position: relative; padding: 0 0 22px 28px; }
  .st-pb-row::before { content: ""; position: absolute; left: 5px; top: 6px; width: 10px; height: 10px; border-radius: 50%; border: 2px solid #000; background: #fff; }
  .st-pb-row:first-child::after { content: ""; position: absolute; left: 10px; top: 20px; bottom: 2px; width: 2px; background: linear-gradient(#000, var(--sc)); }
  .st-pb-row.is-brand { padding-bottom: 0; }
  .st-pb-row.is-brand::before { border-color: var(--sc); background: var(--sc); }
  .st-pb dt { font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--pc-grey); }
  .st-pb-row.is-brand dt { color: var(--sc); }
  .st-pb dd { margin: 6px 0 0; font-size: 17px; line-height: 1.45; color: #222; max-width: 40ch; }
  .st-pb-row.is-brand dd { font-size: clamp(19px, 1.8vw, 22px); font-weight: 600; letter-spacing: -0.015em; color: #000; }
  .st-chart { min-width: 0; border-radius: 16px; padding: clamp(18px, 2.4vw, 26px); background: color-mix(in srgb, var(--sc) 5%, #fafaf8); }
  .st-link {
    justify-self: start; display: inline-flex; align-items: center; gap: 8px;
    font-size: 15px; font-weight: 600; color: inherit; text-decoration: none;
    border-bottom: 1px solid currentColor; padding-bottom: 3px;
  }
  .st-link svg { transition: transform 0.2s ease; }
  .st-link:hover svg { transform: translateX(4px); }
${STORY_CHART_CSS}

  /* ─── why it works ─── */
  .wy-h2 { max-width: 16ch; }
  .wy-h2 span, .wy-close span { color: rgba(255,255,255,0.45); }
  .wy-lede { margin-top: clamp(28px, 4vw, 44px); max-width: 52ch; font-size: clamp(19px, 1.9vw, 24px); line-height: 1.45; letter-spacing: -0.01em; }
  .wy-bio { margin-top: 20px; max-width: 64ch; font-size: 15px; line-height: 1.6; color: rgba(255,255,255,0.55); }
  .wy-close { margin-top: clamp(40px, 6vw, 72px); font-size: clamp(28px, 4vw, 52px); font-weight: 600; letter-spacing: -0.04em; line-height: 1; }

  /* ─── how we work ─── */
  .hw-h2 { max-width: 16ch; }
  .og-grid { list-style: none; margin: 12px 0 0; padding: 0; display: grid; grid-template-columns: 1fr; gap: 12px; }
  @media (min-width: 640px) { .og-grid { grid-template-columns: 1fr 1fr; } }
  @media (min-width: 1000px) { .og-grid { grid-template-columns: repeat(4, 1fr); } }
  .og-grid > li, .og-cell { height: 100%; }
  .og-cell { display: grid; align-content: start; gap: 6px; border-radius: 18px; background: #f3f3f1; padding: 20px 20px 22px; }
  .og-when { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #D9480F; }
  .og-cell b { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
  .og-b { font-size: 14px; line-height: 1.5; color: #444; }
${ENGINE_CSS}

  .hw-cta {
    margin-top: clamp(28px, 4vw, 48px);
    display: grid; grid-template-columns: 1fr; gap: 24px; align-items: center;
    background: #000; color: #fff; border-radius: 20px; padding: clamp(24px, 3.4vw, 40px);
  }
  @media (min-width: 900px) { .hw-cta { grid-template-columns: 1fr auto; } }
  .hw-cta-k { font-size: 13px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
  .hw-cta-v { margin-top: 10px; font-size: clamp(40px, 4.4vw, 60px); font-weight: 600; letter-spacing: -0.045em; line-height: 1; font-variant-numeric: tabular-nums; }
  .hw-cta-v span { font-size: 18px; letter-spacing: 0; font-weight: 500; color: rgba(255,255,255,0.55); }
  .hw-cta-l { margin-top: 12px; font-size: 15px; line-height: 1.5; color: rgba(255,255,255,0.7); max-width: 46ch; }
  .hw-cta-actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .hw-cta-btn { background: #D9480F; border-color: #D9480F; color: #fff; }
  .hw-cta-btn:hover { background: #B83C0B; border-color: #B83C0B; }

  /* ─── close ─── */
  .cl-h2 { max-width: 14ch; }
  .cl-lede { margin-top: 24px; max-width: 48ch; font-size: clamp(17px, 1.6vw, 20px); line-height: 1.55; color: rgba(255,255,255,0.7); }
  .cl-cta { margin-top: clamp(28px, 4vw, 44px); display: flex; flex-wrap: wrap; gap: 12px; }

  /* ─── phone ─── */
  @media (max-width: 640px) {
    .pc-hero { padding: clamp(88px, 13vh, 112px) 0 calc(20px + env(safe-area-inset-bottom, 0px)); }
    .pc-hero-logos { margin-top: clamp(28px, 5vh, 44px); }
    .pc-logos-label { margin-bottom: 12px; font-size: 11px; }
    .pc-logos-group li { padding: 0 22px; height: 40px; }
    .pc-logos-group img { height: calc(19px * var(--boost, 1)); max-width: 112px; max-height: 50px; }
    .pc-logos-track { animation-duration: 30s; }
    .pc-eyebrow { margin-bottom: 20px; font-size: 12px; }
    .pc-hero-h { font-size: clamp(40px, 11.6vw, 56px); line-height: 0.98; letter-spacing: -0.04em; }
    .pc-hero-sub { margin-top: clamp(16px, 2.8vh, 24px); font-size: 17px; }
    .pc-hero-cta { margin-top: clamp(22px, 3.8vh, 32px); flex-direction: column; align-items: stretch; gap: 12px; }
    .hf { gap: 6px; }
    .hf-step { padding: 9px 12px 10px; border-radius: 12px; }
    .hf-step + .hf-step { margin-left: 16px; }
    .hf-step + .hf-step::before { left: -16px; width: 16px; font-size: 13px; }
    .hf-k { font-size: 14px; }
    .hf-v { font-size: 11px; }
    .st-card { border-radius: 18px; }
    .st-title { font-size: clamp(30px, 8.6vw, 40px); }
    .st-pb dd { font-size: 16px; }
    .og-cell, .hw-cta { border-radius: 16px; }
    .hw-cta-actions { flex-direction: column; }
    .cl-cta .pc-btn { width: 100%; }
  }

  /* ─── short screens (small laptops, iPhone SE): keep the brand band above the fold ─── */
  @media (max-height: 760px) {
    .pc-hero { padding-top: 84px; padding-bottom: 16px; }
    .pc-hero-logos { margin-top: 24px; }
    .pc-logos { padding-top: 14px; }
    .pc-logos-label { margin-bottom: 8px; }
    .pc-logos-group li { height: 36px; }
  }
`;
