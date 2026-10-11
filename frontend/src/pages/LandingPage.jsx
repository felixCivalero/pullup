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
import { Reveal } from "../components/agency/Reveal.jsx";
import { casePath, mailto } from "../components/agency/agencyData.js";
import { CASE_STATS as FLAMBO } from "./stories/adamFlamboData.js";

/* The public front door: PullUp builds brands people actually feel — for
   brands and creators. Black and white, typography first. Stories link to
   their full case pages at /work/:slug; the product door is "Log in". */

const PROOF = [
  { v: "28.1M", l: "views for STIGA in seven months" },
  { v: "Sony Music", l: "Adam Dawood, from zero to signed" },
  { v: "10,000+", l: "BKM Health community, zero paid spend" },
  { v: "4 nights", l: "a week of live music at Kaijas" },
];

// Every claim: Felix's brief; STIGA figures trace to the Growhouse report
// (1 Dec 2024 – 30 Jun 2025); Adam Flambo's from his rooms (adamFlamboData).
const STORIES = [
  {
    slug: "stiga",
    kicker: "Brand · Sport · with Sebastian",
    name: "STIGA Table Tennis",
    body: "A heritage brand with almost no social presence. We worked with Sebastian to put the people and the play at the centre, and let the sport speak in its own voice. From December 2024 to June 2025, STIGA went from about 50 Instagram followers to more than 15,000 — and from near zero to 11,000+ on Facebook.",
    stats: [["28.1M", "views"], ["+32,000", "followers"], ["335,000", "interactions"], ["Dec – Jun", "all organic channels"]],
  },
  {
    slug: "bkm",
    kicker: "Brand · Health · with Li and Tolga",
    name: "BKM Health",
    body: "Li and Tolga had a vision. We helped turn it into a community: people who show up, talk back and bring their friends. That community is now the foundation the whole brand stands on — built in one to two years, without a single paid ad.",
    stats: [["10,000+", "followers"], ["0 kr", "paid spend"], ["Community first", "the brand is built on it today", true]],
  },
  {
    slug: "adam-dawood",
    tone: "dark",
    kicker: "Creator · Music",
    name: "Adam Dawood",
    body: "An artist with a sound, a world and nobody watching yet. We built the identity around who he actually is — from the visual language to the story the music tells — and grew it step by step. From zero to signed by Sony Music.",
    hero: ["0 → Sony", "Identity, story, rollout and growth"],
  },
  {
    slug: "adam-flambo",
    kicker: "Creator · @adam_flambo",
    name: "Adam Flambo",
    body: "A creator who turns his following into real rooms full of people. Adam runs his events and his community through PullUp, so every person who pulls up stays part of his world — and he owns that relationship, not a platform.",
    stats: [[String(FLAMBO.walks), "events hosted"], [String(FLAMBO.pulledUnique), "people pulled up"], [String(FLAMBO.community), "in his community", true]],
  },
  {
    tone: "dark",
    kicker: "Our own · Live music venue, Stockholm",
    name: "Kaijas Musiksalong",
    body: "Before we did this for anyone else, we did it for ourselves. We took an empty room and built a live-music venue: the brand, the programme, the people, and the systems to run it. Instagram became the main way guests found us and booked.",
    stats: [["4 nights", "of live music a week"], ["10,000+", "Instagram followers"], ["Built in-house", "our own booking system and operations dashboard", true]],
  },
];

const PRINCIPLES = [
  ["Listen", "Find the self.", "We listen past the pitch, to what you actually care about, how you talk, and what you would never do. That is the brand. It was there all along."],
  ["Express", "Say it purely.", "One voice across everything, with nothing borrowed. No chasing trends or formats. Just you, said clearly enough that the right people recognise themselves in it."],
  ["Become", "Live it in public.", "Expression, repeated, becomes identity. Content, community and real rooms on PullUp, until the brand is simply who you are, everywhere you show up."],
];

const STEPS = [
  ["Sit down", "A 30-minute sprint with you or your team. We ask, you talk."],
  ["We find the story", "What in your week will make people stop, feel something and follow."],
  ["We produce", "Short-form video, posts and copy in your voice, ready to publish."],
  ["We measure and repeat", "We track what actually moves people and do more of it."],
];

const AUDIENCES = [
  {
    k: "For brands",
    t: "Put the people behind your brand in front of it.",
    items: ["Organic growth on the channels that matter to you", "A community that becomes the foundation of the brand", "Content made from your real operations, not stock ideas"],
  },
  {
    k: "For creators",
    t: "Turn who you are into a world people want in on.",
    items: ["Identity and story that fit who you actually are", "From followers to real rooms, events and fans", "Your audience and its data stay yours, on PullUp"],
  },
];

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
  return (
    <div className="pc-logos">
      <p className="pc-logos-label">Trusted by</p>
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

const CONVERSATION = mailto("Let's build — PullUp");

function StoryCard({ story, i }) {
  const navigate = useNavigate();
  const { slug, tone, kicker, name, body, stats, hero } = story;
  return (
    <Reveal delay={0.04}>
      <article className={`st-card${tone === "dark" ? " is-dark" : ""}`} data-pc-tone={tone === "dark" ? "dark" : undefined}>
        <div className="st-copy">
          <p className="st-kicker"><span>{String(i + 1).padStart(2, "0")}</span>{kicker}</p>
          <h3 className="st-name">{name}</h3>
          <p className="st-body">{body}</p>
          {slug && (
            <a
              className="st-link"
              href={casePath(slug)}
              onClick={(e) => {
                e.preventDefault();
                trackEvent("cta_click", { location: `landing_story_${slug}` });
                navigate(casePath(slug));
              }}
            >
              Read the story
              <ArrowRight size={16} strokeWidth={1.75} />
            </a>
          )}
        </div>
        {hero ? (
          <div className="st-hero">
            <p className="st-hero-v">{hero[0]}</p>
            <p className="st-hero-l">{hero[1]}</p>
          </div>
        ) : (
          <div className="st-stats">
            {stats.map(([v, l, wide]) => (
              <div key={l} className={`st-stat${wide ? " is-wide" : ""}`}>
                <p className="st-stat-v">{v}</p>
                <p className="st-stat-l">{l}</p>
              </div>
            ))}
          </div>
        )}
      </article>
    </Reveal>
  );
}

function AgencyPage() {
  const navigate = useNavigate();
  const toStories = () => {
    trackEvent("cta_click", { location: "hero_stories" });
    document.getElementById("stories")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* ─── HERO ─── */}
      <section className="pc-hero pc-dark" data-pc-tone="dark" data-pc-section="hero" data-pc-order="1">
        <div className="pc-wrap">
          <Reveal>
            <p className="pc-eyebrow">For brands and creators · Stockholm · Nairobi</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="pc-hero-h">We build brands people actually feel.</h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="pc-hero-sub">
              Success for a brand or a creator starts with the people inside it. We find what
              makes you worth following, turn your everyday work into content, and grow an
              audience that stays — organically.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="pc-hero-cta">
              <a className="pc-btn pc-btn-light" href={CONVERSATION} onClick={() => trackEvent("cta_click", { location: "hero_build" })}>
                Build yours with us
                <ArrowRight size={18} strokeWidth={1.75} />
              </a>
              <button type="button" className="pc-btn pc-btn-ghost" onClick={toStories}>
                See the stories
              </button>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.36} className="pc-hero-logos">
          <LogoBand />
        </Reveal>
      </section>

      {/* ─── PROOF STRIP ─── */}
      <section className="pf" data-pc-section="proof" data-pc-order="2">
        <div className="pc-wrap pf-in">
          {PROOF.map((p, i) => (
            <Reveal key={p.l} delay={i * 0.06} className="pf-cell">
              <p className="pf-v">{p.v}</p>
              <p className="pf-l">{p.l}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── THE STORIES ─── */}
      <section id="stories" className="pc-section" data-pc-section="stories" data-pc-order="3">
        <div className="pc-wrap">
          <SectionLabel n="01">The stories</SectionLabel>
          <Reveal>
            <h2 className="pc-h2 st-h2">Every one of these started with a person, not a post.</h2>
          </Reveal>
          <div className="st-list">
            {STORIES.map((story, i) => (
              <StoryCard key={story.name} story={story} i={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHY IT WORKS ─── */}
      <section id="why" className="pc-section pc-dark" data-pc-tone="dark" data-pc-section="why" data-pc-order="4">
        <div className="pc-wrap">
          <SectionLabel n="02">Why it works</SectionLabel>
          <Reveal>
            <h2 className="pc-h2 pc-h2-xl wy-h2">
              The strongest brands aren't invented. <span>They're revealed.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="wy-lede">
              Every brand already has a self. Most just haven't been allowed to express it. We don't
              build you a persona. We help you become what you already are, out loud and without
              compromise, until people can feel it.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="wy-bio">
              PullUp is led by Felix Civalero Stolpe, who spent four years studying people, with a
              focus on cognition and pain, and more than three years treating them. He has published
              a book and is writing the next. What it taught him: people trust what is real.
            </p>
          </Reveal>
          <div className="wy-rows">
            {PRINCIPLES.map(([word, title, text], i) => (
              <Reveal key={word} delay={i * 0.06}>
                <div className="wy-row">
                  <p className="wy-word">{word}</p>
                  <div>
                    <h3 className="wy-title">{title}</h3>
                    <p className="wy-text">{text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p className="wy-close">Not marketing. <span>Becoming.</span></p>
          </Reveal>
        </div>
      </section>

      {/* ─── HOW WE WORK ─── */}
      <section id="how" className="pc-section" data-pc-section="how" data-pc-order="5">
        <div className="pc-wrap">
          <SectionLabel n="03">How we work</SectionLabel>
          <Reveal>
            <h2 className="pc-h2 hw-h2">30 minutes of you. A week of content.</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="hw-lede">
              Stop inventing marketing content. Your daily work and your vision are already the best
              material you have. We run short, focused sprints with you and turn them into content
              that grows.
            </p>
          </Reveal>
          <ol className="hw-steps">
            {STEPS.map(([t, b], i) => (
              <li key={t}>
                <Reveal delay={i * 0.06} className="hw-step">
                  <span className="hw-n">{i + 1}</span>
                  <h3>{t}</h3>
                  <p>{b}</p>
                </Reveal>
              </li>
            ))}
          </ol>
          <div className="hw-for">
            {AUDIENCES.map((a, i) => (
              <Reveal key={a.k} delay={i * 0.06} className="hw-card">
                <p className="hw-k">{a.k}</p>
                <h3>{a.t}</h3>
                <ul>
                  {a.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <DeckTeaser source="landing" />

      {/* ─── CLOSE ─── */}
      <section id="start" className="pc-section pc-dark cl" data-pc-tone="dark" data-pc-section="close" data-pc-order="90">
        <div className="pc-wrap">
          <Reveal>
            <h2 className="pc-h2 pc-h2-xl cl-h2">Your brand could be the next story.</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="cl-lede">
              We take on a few brands and creators at a time. Tell us who you are and where you want to go.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="cl-cta">
              <a className="pc-btn pc-btn-light" href={CONVERSATION} onClick={() => trackEvent("cta_click", { location: "close_conversation" })}>
                Start a conversation
                <ArrowRight size={18} strokeWidth={1.75} />
              </a>
              <a
                className="pc-btn pc-btn-ghost"
                href="/start"
                onClick={(e) => {
                  e.preventDefault();
                  trackEvent("cta_click", { location: "close_host" });
                  navigate("/start");
                }}
              >
                Host on PullUp
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
    const prev = document.title;
    document.title = "PullUp — We build brands people actually feel";
    return () => {
      document.title = prev;
    };
  }, []);

  // Arriving via a link from another page (/#stories, /#deck …) lands on it.
  useEffect(() => {
    const target = { "#stories": "stories", "#work": "stories", "#why": "why", "#how": "how", "#deck": "deck", "#start": "start" }[location.hash];
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

  /* ─── proof strip ─── */
  .pf { border-bottom: 1px solid var(--pc-black); }
  .pf-in { display: grid; grid-template-columns: 1fr 1fr; }
  @media (min-width: 900px) { .pf-in { grid-template-columns: repeat(4, 1fr); } }
  .pf-cell { padding: clamp(24px, 3vw, 36px) clamp(12px, 2vw, 24px) clamp(24px, 3vw, 36px) 0; }
  .pf-v { font-size: clamp(28px, 3.4vw, 44px); font-weight: 600; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
  .pf-l { margin-top: 10px; font-size: 14px; line-height: 1.4; color: var(--pc-grey); max-width: 26ch; }

  /* ─── stories ─── */
  .st-h2 { max-width: 18ch; }
  .st-list { display: grid; gap: clamp(16px, 2vw, 24px); }
  .st-card {
    display: grid; grid-template-columns: 1fr; gap: clamp(28px, 4vw, 56px);
    padding: clamp(24px, 4vw, 48px);
    border: 1px solid var(--pc-black); border-radius: 20px; background: #fff; color: #000;
  }
  @media (min-width: 900px) { .st-card { grid-template-columns: 6fr 5fr; align-items: center; } }
  .st-card.is-dark { background: #000; color: #fff; border-color: #000; }
  .st-kicker { display: flex; gap: 14px; font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pc-grey); }
  .st-card.is-dark .st-kicker { color: rgba(255,255,255,0.5); }
  .st-name { margin-top: 14px; font-size: clamp(32px, 4.4vw, 56px); font-weight: 600; line-height: 0.98; letter-spacing: -0.045em; }
  .st-body { margin-top: 18px; font-size: 17px; line-height: 1.6; color: #333; max-width: 56ch; }
  .st-card.is-dark .st-body { color: rgba(255,255,255,0.72); }
  .st-link {
    margin-top: 22px; display: inline-flex; align-items: center; gap: 8px;
    font-size: 15px; font-weight: 600; color: inherit; text-decoration: none;
    border-bottom: 1px solid currentColor; padding-bottom: 3px;
  }
  .st-link svg { transition: transform 0.2s ease; }
  .st-link:hover svg { transform: translateX(4px); }
  .st-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .st-stat { background: #f3f3f1; border-radius: 14px; padding: 18px 18px 16px; }
  .st-card.is-dark .st-stat { background: rgba(255,255,255,0.08); }
  .st-stat.is-wide { grid-column: 1 / -1; }
  .st-stat-v { font-size: clamp(24px, 2.6vw, 34px); font-weight: 600; letter-spacing: -0.035em; line-height: 1; font-variant-numeric: tabular-nums; }
  .st-stat.is-wide .st-stat-v { font-size: clamp(20px, 2vw, 24px); letter-spacing: -0.02em; }
  .st-stat-l { margin-top: 8px; font-size: 13px; line-height: 1.35; color: var(--pc-grey); }
  .st-card.is-dark .st-stat-l { color: rgba(255,255,255,0.55); }
  .st-hero-v { font-size: clamp(56px, 8vw, 112px); font-weight: 600; letter-spacing: -0.05em; line-height: 0.92; }
  .st-hero-l { margin-top: 14px; font-size: 15px; color: rgba(255,255,255,0.6); }

  /* ─── why it works ─── */
  .wy-h2 { max-width: 16ch; }
  .wy-h2 span, .wy-close span { color: rgba(255,255,255,0.45); }
  .wy-lede { margin-top: clamp(28px, 4vw, 44px); max-width: 52ch; font-size: clamp(19px, 1.9vw, 24px); line-height: 1.45; letter-spacing: -0.01em; }
  .wy-bio { margin-top: 20px; max-width: 64ch; font-size: 15px; line-height: 1.6; color: rgba(255,255,255,0.55); }
  .wy-rows { margin-top: clamp(48px, 7vw, 88px); border-top: 1px solid var(--pc-line-dark); }
  .wy-row {
    display: grid; grid-template-columns: 1fr; gap: 10px 48px;
    padding: clamp(24px, 3vw, 36px) 0; border-bottom: 1px solid var(--pc-line-dark);
  }
  @media (min-width: 800px) { .wy-row { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); align-items: center; } }
  .wy-word { font-size: clamp(48px, 7vw, 104px); font-weight: 600; letter-spacing: -0.05em; line-height: 0.9; }
  .wy-title { font-size: clamp(20px, 2vw, 26px); font-weight: 600; letter-spacing: -0.02em; }
  .wy-text { margin-top: 8px; font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.68); max-width: 56ch; }
  .wy-close { margin-top: clamp(40px, 6vw, 72px); font-size: clamp(28px, 4vw, 52px); font-weight: 600; letter-spacing: -0.04em; line-height: 1; }

  /* ─── how we work ─── */
  .hw-h2 { max-width: 16ch; }
  .hw-lede { max-width: 56ch; font-size: clamp(17px, 1.6vw, 20px); line-height: 1.55; color: #333; }
  .hw-steps { list-style: none; padding: 0; margin-top: clamp(36px, 5vw, 56px); display: grid; grid-template-columns: 1fr; gap: 12px; }
  @media (min-width: 640px) { .hw-steps { grid-template-columns: 1fr 1fr; } }
  @media (min-width: 1000px) { .hw-steps { grid-template-columns: repeat(4, 1fr); } }
  .hw-step { height: 100%; border: 1px solid var(--pc-black); border-radius: 18px; padding: 24px 22px 26px; }
  .hw-n { display: block; font-size: 36px; font-weight: 600; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
  .hw-step h3 { margin-top: 18px; font-size: 19px; font-weight: 600; letter-spacing: -0.02em; }
  .hw-step p { margin-top: 8px; font-size: 15px; line-height: 1.5; color: #444; }
  .hw-for { margin-top: clamp(40px, 6vw, 72px); display: grid; grid-template-columns: 1fr; gap: 12px; }
  @media (min-width: 800px) { .hw-for { grid-template-columns: 1fr 1fr; } }
  .hw-card { height: 100%; background: #000; color: #fff; border-radius: 20px; padding: clamp(24px, 3.4vw, 40px); }
  .hw-k { font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
  .hw-card h3 { margin-top: 14px; font-size: clamp(24px, 2.6vw, 32px); font-weight: 600; letter-spacing: -0.03em; line-height: 1.08; max-width: 20ch; }
  .hw-card ul { list-style: none; padding: 0; margin: 24px 0 0; border-top: 1px solid var(--pc-line-dark); }
  .hw-card li { padding: 14px 0; border-bottom: 1px solid var(--pc-line-dark); font-size: 16px; line-height: 1.45; color: rgba(255,255,255,0.8); }
  .hw-card li:last-child { border-bottom: 0; padding-bottom: 0; }

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
    .pf-cell { padding: 22px 12px 22px 0; }
    .pf-cell:nth-child(n+3) { border-top: 1px solid var(--pc-line); }
    .pf-v { font-size: 26px; }
    .pf-l { font-size: 13px; }
    .st-card { border-radius: 18px; padding: 22px 20px 24px; }
    .st-body { font-size: 16px; }
    .st-stat { padding: 14px 14px 12px; border-radius: 12px; }
    .st-stat-v { font-size: 22px; }
    .wy-text { font-size: 15px; }
    .hw-for .hw-card, .hw-step { border-radius: 16px; }
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
