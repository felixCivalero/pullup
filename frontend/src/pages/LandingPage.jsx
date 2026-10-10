import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { AuthGate, resolveNext } from "../components/auth/AuthGate.jsx";
import { supabase } from "../lib/supabase.js";
import { resolveStoredSession } from "../lib/validateStoredSession.mjs";
import { trackEvent } from "../lib/analytics.js";
import { initTracking, trackPageView } from "../lib/track.js";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { AgencyOffer } from "../components/agency/AgencyOffer.jsx";
import { DeckGate } from "../components/agency/DeckGate.jsx";
import { Reveal } from "../components/agency/Reveal.jsx";
import { CASES, casePath } from "../components/agency/agencyData.js";
import { STIGA_TOTALS } from "./work/caseContent.js";

/* The public front door: PullUp as an agency — The Production Core.
   Black and white, typography first. Each story here is a teaser for its full
   case page at /work/:slug; the only product surface is "Log in" in the nav. */

const TESTIMONIALS = [
  {
    name: "Li Karlsén",
    role: "Co-founder, BKM",
    quote:
      "The 30-minute BKM flow completely stripped the noise from my messaging. It brought the exact discipline of deep freediving straight into our content production.",
  },
  {
    name: "Tolga Duran",
    quote:
      "We didn't just scale; we built an infrastructure. The alignment between our internal systems and our market narrative became unshakeable.",
  },
  {
    name: "Sebastian Ramsey",
    quote:
      "The shift to a production core eliminated the constant pressure to invent new angles. Our actual work became our greatest marketing asset.",
  },
  {
    name: "Adam Flambo",
    quote:
      "Execution used to be our bottleneck. Turning our mission into a structured dramaturgical script completely changed how our team produces.",
  },
];

const TRACKS = [
  {
    tag: "Track A",
    title: "Operational Sprints",
    body: "30 minutes on the tech stack, automated pipelines and system architecture. Nothing else.",
  },
  {
    tag: "Track B",
    title: "Content Extraction Sprints",
    body: "30 minutes of the founder expressing the message, run through a strict dramaturgical framework.",
  },
  {
    tag: "Bridge",
    title: "The Alignment Bridge",
    body: "Where A and B fuse: cold internal systems translated into line-by-line reel blueprints your team executes.",
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

const DRAMATURGY = ["Hook", "Credibility", "Core", "Outro"];

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

// SPA link styled as an underlined "Read the case →".
function CaseLink({ slug, children = "Read the case" }) {
  const navigate = useNavigate();
  return (
    <a
      className="pc-caselink"
      href={casePath(slug)}
      onClick={(e) => {
        e.preventDefault();
        trackEvent("cta_click", { location: `landing_case_${slug}` });
        navigate(casePath(slug));
      }}
    >
      {children}
      <ArrowRight size={16} strokeWidth={1.75} />
    </a>
  );
}

// The index of full case pages — every story on the page has a door here.
function WorkIndex() {
  const navigate = useNavigate();
  return (
    <section id="work" className="pc-section pc-rule" data-pc-section="work" data-pc-order="3">
      <div className="pc-wrap">
        <SectionLabel n="02">Selected work</SectionLabel>
        <Reveal>
          <h2 className="pc-h2">Four organizations. One production core.</h2>
        </Reveal>
        <div className="pc-work">
          {CASES.map((c, i) => (
            <Reveal key={c.slug} delay={(i % 2) * 0.08}>
              <a
                className={`pc-workcard${c.image ? " has-image" : ""}`}
                href={casePath(c.slug)}
                onClick={(e) => {
                  e.preventDefault();
                  trackEvent("cta_click", { location: `work_card_${c.slug}` });
                  navigate(casePath(c.slug));
                }}
              >
                {c.image && <img src={c.image} alt="" loading="lazy" decoding="async" />}
                <span className="pc-workcard-top">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span>{c.kicker}</span>
                </span>
                <span className="pc-workcard-client">{c.client}</span>
                <span className="pc-workcard-bottom">
                  <span className="pc-workcard-title">{c.title}</span>
                  <ArrowRight className="pc-workcard-arrow" size={22} strokeWidth={1.75} />
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function AgencyPage() {
  const toOffer = (location) => {
    trackEvent("cta_click", { location });
    document.getElementById("offer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* ─── 1. HERO — the solo offer ─── */}
      <section className="pc-hero pc-dark" data-pc-tone="dark" data-pc-section="hero" data-pc-order="1">
        <div className="pc-wrap">
          <Reveal>
            <p className="pc-eyebrow">The Production Core</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="pc-hero-h">
              Restructure your organization for 2027 and onwards.
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="pc-hero-sub">
              Stop inventing marketing content. We turn your daily operational
              deliverables and high-level vision into a high-retention, global
              content engine — driven by a precise, long-term BKM alignment flow
              and high-frequency, 30-minute tactical sprints.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="pc-hero-cta">
              <button type="button" className="pc-btn pc-btn-light" onClick={() => toOffer("hero")}>
                Start with a 3‑month trust period
                <ArrowRight size={18} strokeWidth={1.75} />
              </button>
              <p className="pc-hero-price">
                $3,000 per month <span>/</span> lower for longer commitments
              </p>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.36} className="pc-hero-logos">
          <LogoBand />
        </Reveal>
      </section>

      {/* ─── 2. WALL OF AUTHORITY ─── */}
      <section className="pc-section" data-pc-section="authority" data-pc-order="2">
        <div className="pc-wrap">
          <SectionLabel n="01">In their words</SectionLabel>
          <div className="pc-quotes">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={(i % 2) * 0.08}>
                <figure className="pc-quote">
                  <blockquote>“{t.quote}”</blockquote>
                  <figcaption>
                    <strong>{t.name}</strong>
                    {t.role && <span>{t.role}</span>}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <WorkIndex />

      {/* ─── 3. BKM 0–10k — founder-led marketing ─── */}
      <section className="pc-section pc-rule" data-pc-section="bkm" data-pc-order="4">
        <div className="pc-wrap pc-split">
          <div>
            <SectionLabel n="03">Founder-led marketing</SectionLabel>
            <Reveal>
              <p className="pc-bignum">
                BKM
                <br />
                0–10k
              </p>
            </Reveal>
          </div>
          <div className="pc-prose">
            <Reveal>
              <p className="pc-lead">
                When BKM was moving from 0 to 10k, we faced the ultimate founder
                dilemma: how to scale market authority without spending 20 hours a
                week trapped in creative loops.
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <p>
                The answer wasn't hiring a massive, expensive marketing agency. The
                answer was a strict, 30-minute operational rhythm.
              </p>
            </Reveal>
            <Reveal delay={0.14}>
              <div className="pc-insight">
                <p className="pc-insight-k">The insight</p>
                <p>
                  Founder-led marketing only succeeds when it is systematic. Capture
                  raw founder genius, filter it instantly into operational proof — and
                  you don't need a massive team. You need a bulletproof flow.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.18}><CaseLink slug="bkm">Read the BKM case</CaseLink></Reveal>
          </div>
        </div>
      </section>

      {/* ─── the method — dual-track 30-minute system ─── */}
      <section className="pc-section pc-rule" data-pc-section="method" data-pc-order="5">
        <div className="pc-wrap">
          <SectionLabel n="04">The 30-minute BKM flow</SectionLabel>
          <Reveal>
            <h2 className="pc-h2">Two tracks. Thirty minutes each. One bridge.</h2>
          </Reveal>
          <div className="pc-tracks">
            {TRACKS.map((t, i) => (
              <Reveal key={t.tag} delay={i * 0.08}>
                <div className="pc-track">
                  <p className="pc-track-tag">{t.tag}</p>
                  <h3>{t.title}</h3>
                  <p>{t.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 4. LI KARLSÉN — cinematic profile ─── */}
      <section className="pc-section pc-dark pc-li" data-pc-tone="dark" data-pc-section="li" data-pc-order="6">
        <div className="pc-wrap">
          <SectionLabel n="05">Profile — Li Karlsén</SectionLabel>
          <Reveal>
            <h2 className="pc-h2 pc-h2-xl">
              Content doesn't need to be loud to be powerful. It needs to be precise.
            </h2>
          </Reveal>
          <div className="pc-split pc-li-body">
            <Reveal>
              <p className="pc-lead">
                Picture Li Karlsén, co-founder of BKM and elite freediver, descending
                into absolute silence. In the deep ocean there is no room for wasted
                energy, rambling thoughts, or hesitation. Every movement is deliberate.
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <p>
                We brought that exact operational stillness to her content. Dedicated,
                hyper-focused 30-minute extraction sprints. No brainstorming. Her deep
                expertise passed through a strict dramaturgical framework — raw thought
                shaped instantly into a perfect sequence.
              </p>
            </Reveal>
          </div>
          <ol className="pc-dramaturgy">
            {DRAMATURGY.map((step, i) => (
              <li key={step}>
                <Reveal delay={i * 0.08}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {step}
                </Reveal>
              </li>
            ))}
          </ol>
          <Reveal><CaseLink slug="li-karlsen">Read Li's profile</CaseLink></Reveal>
        </div>
      </section>

      {/* ─── 5. STIGA — enterprise validation ─── */}
      <section className="pc-section" data-pc-section="stiga" data-pc-order="7">
        <div className="pc-wrap">
          <SectionLabel n="06">Enterprise — STIGA</SectionLabel>
          <Reveal>
            <h2 className="pc-h2">
              Not just for agile startups. It scales to legacy global giants.
            </h2>
          </Reveal>
          <div className="pc-metrics pc-metrics-3">
            {[
              [STIGA_TOTALS.views, "Views"],
              [STIGA_TOTALS.interactions, "Interactions"],
              [STIGA_TOTALS.followers, "Followers"],
            ].map(([n, l], i) => (
              <Reveal key={l} delay={i * 0.08}>
                <div className="pc-metric">
                  <p className="pc-metric-k">{l}</p>
                  <p className="pc-metric-v">
                    {new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p className="pc-metrics-note">
              Facebook, Instagram, TikTok and YouTube · 1 Dec 2024 – 30 Jun 2025. Growing on
              every metric, across every channel.
            </p>
          </Reveal>
          <Reveal><CaseLink slug="stiga">Read the STIGA case</CaseLink></Reveal>
        </div>
      </section>

      {/* ─── 6. ADAM FLAMBO — the execution case ─── */}
      <section className="pc-section pc-rule" data-pc-section="adam" data-pc-order="8">
        <div className="pc-wrap">
          <SectionLabel n="07">Case — Adam Flambo</SectionLabel>
          <Reveal>
            <h2 className="pc-h2">Out of the execution trap.</h2>
          </Reveal>
          <div className="pc-case">
            <Reveal>
              <div className="pc-case-col">
                <p className="pc-case-k">The problem</p>
                <p>
                  Like many visionary operators, Adam had deep messages and a profound
                  mission — but traditional structures let execution slip through the
                  cracks. The content team operated in a vacuum, disconnected from
                  daily operational reality.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="pc-case-col">
                <p className="pc-case-k">The turnaround</p>
                <p>
                  We deployed the Alignment Bridge: Adam's high-level philosophy wired
                  directly into his team's real-time project tracking. His core
                  concepts became line-by-line reel scripts in brief, focused syncs —
                  and his team was held accountable to a flawless publishing pipeline.
                </p>
              </div>
            </Reveal>
          </div>
          <Reveal><CaseLink slug="adam-flambo">Read Adam's story</CaseLink></Reveal>
        </div>
      </section>

      <DeckGate source="landing" />
      <AgencyOffer id="offer" />
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
    document.title = "PullUp — The Production Core";
    return () => {
      document.title = prev;
    };
  }, []);

  // Arriving from a case page's "Work" link (/#work) lands on the index.
  useEffect(() => {
    if (location.hash !== "#work") return;
    const t = setTimeout(() => {
      document.getElementById("work")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  .pc-hero-price { font-size: 15px; color: rgba(255,255,255,0.6); font-variant-numeric: tabular-nums; }
  .pc-hero-price span { margin: 0 6px; opacity: 0.5; }

  /* ─── wall of authority ─── */
  .pc-quotes {
    display: grid; grid-template-columns: 1fr;
    border-top: 1px solid var(--pc-line);
  }
  @media (min-width: 800px) {
    .pc-quotes { grid-template-columns: 1fr 1fr; }
    .pc-quotes > :nth-child(odd) .pc-quote { border-right: 1px solid var(--pc-line); padding-right: clamp(24px, 4vw, 56px); }
    .pc-quotes > :nth-child(even) .pc-quote { padding-left: clamp(24px, 4vw, 56px); }
  }
  .pc-quote {
    height: 100%;
    display: flex; flex-direction: column; justify-content: space-between; gap: 32px;
    padding: clamp(32px, 4vw, 52px) 0;
    border-bottom: 1px solid var(--pc-line);
  }
  .pc-quote blockquote {
    font-size: clamp(20px, 2vw, 26px); line-height: 1.35; letter-spacing: -0.015em;
  }
  .pc-quote figcaption { display: flex; flex-direction: column; gap: 2px; font-size: 15px; }
  .pc-quote figcaption strong { font-weight: 600; }
  .pc-quote figcaption span { color: var(--pc-grey); }

  /* ─── BKM ─── */
  .pc-bignum {
    font-size: clamp(64px, 10vw, 148px);
    font-weight: 600; line-height: 0.9; letter-spacing: -0.05em;
    font-variant-numeric: tabular-nums;
  }
  .pc-insight { border-top: 1px solid var(--pc-black); padding-top: 24px; margin-top: 12px; }
  .pc-insight-k {
    font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
    margin-bottom: 12px;
  }

  /* ─── method tracks ─── */
  .pc-tracks { display: grid; grid-template-columns: 1fr; border-top: 1px solid var(--pc-line); }
  @media (min-width: 900px) {
    .pc-tracks { grid-template-columns: repeat(3, 1fr); }
    .pc-tracks > * + * .pc-track { border-left: 1px solid var(--pc-line); padding-left: clamp(24px, 3vw, 40px); }
    .pc-tracks > :not(:last-child) .pc-track { padding-right: clamp(24px, 3vw, 40px); }
  }
  .pc-track {
    height: 100%; padding: 32px 0; border-bottom: 1px solid var(--pc-line);
    display: grid; gap: 12px; align-content: start;
  }
  .pc-track-tag { font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pc-grey); }
  .pc-track h3 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
  .pc-track p:last-child { font-size: 16px; line-height: 1.55; color: #333; }

  /* ─── Li ─── */
  .pc-li-body { font-size: 18px; line-height: 1.6; color: rgba(255,255,255,0.72); }
  .pc-li-body .pc-lead { color: var(--pc-white); }
  .pc-dramaturgy {
    list-style: none; padding: 0;
    margin-top: clamp(56px, 8vw, 104px);
    display: grid; grid-template-columns: repeat(2, 1fr);
    border-top: 1px solid var(--pc-line-dark);
  }
  @media (min-width: 800px) { .pc-dramaturgy { grid-template-columns: repeat(4, 1fr); } }
  .pc-dramaturgy li {
    padding: 28px 0 0;
    font-size: clamp(24px, 3vw, 40px); font-weight: 600; letter-spacing: -0.03em;
  }
  .pc-dramaturgy li span {
    display: block; margin-bottom: 10px;
    font-size: 13px; font-weight: 500; letter-spacing: 0.08em;
    color: rgba(255,255,255,0.45); font-variant-numeric: tabular-nums;
  }

  /* ─── STIGA ─── */
  .pc-metrics { display: grid; grid-template-columns: 1fr; gap: 0; border-top: 1px solid var(--pc-black); }
  @media (min-width: 800px) {
    .pc-metrics { grid-template-columns: 1fr 1fr; }
    .pc-metrics > :first-child .pc-metric { border-right: 1px solid var(--pc-line); padding-right: clamp(24px, 4vw, 56px); }
    .pc-metrics > :last-child .pc-metric { padding-left: clamp(24px, 4vw, 56px); }
  }
  .pc-metric { height: 100%; padding: 36px 0; display: grid; gap: 14px; align-content: start; border-bottom: 1px solid var(--pc-line); }
  .pc-metric-k { font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pc-grey); }
  .pc-metric-v { font-size: clamp(40px, 5.6vw, 72px); font-weight: 600; line-height: 1; letter-spacing: -0.04em; }
  .pc-metric p:last-child { font-size: 17px; line-height: 1.55; color: #333; max-width: 46ch; }

  /* ─── Adam ─── */
  .pc-case { display: grid; grid-template-columns: 1fr; gap: clamp(32px, 5vw, 72px); }
  @media (min-width: 800px) { .pc-case { grid-template-columns: 1fr 1fr; } }
  .pc-case-col { border-top: 1px solid var(--pc-black); padding-top: 24px; font-size: 18px; line-height: 1.6; }
  .pc-case-k { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 14px; }


  /* ─── selected work ─── */
  .pc-work { display: grid; grid-template-columns: 1fr; gap: 16px; }
  @media (min-width: 800px) { .pc-work { grid-template-columns: 1fr 1fr; gap: 20px; } }
  .pc-workcard {
    position: relative; overflow: hidden; isolation: isolate;
    min-height: clamp(300px, 34vw, 440px);
    display: flex; flex-direction: column; justify-content: space-between; gap: 24px;
    padding: clamp(24px, 3vw, 36px);
    border-radius: 20px; background: #000; color: #fff; text-decoration: none;
    transition: transform 0.35s cubic-bezier(0.16,1,0.3,1);
  }
  .pc-workcard:hover { transform: translateY(-4px); }
  .pc-workcard img {
    position: absolute; inset: 0; z-index: -1; width: 100%; height: 100%; object-fit: cover;
    filter: grayscale(1) contrast(1.05) brightness(0.55);
    transition: transform 0.8s cubic-bezier(0.16,1,0.3,1), filter 0.4s ease;
  }
  .pc-workcard:hover img { transform: scale(1.04); filter: grayscale(0.2) brightness(0.6); }
  .pc-workcard-top { display: flex; gap: 14px; font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.6); }
  .pc-workcard-client { font-size: clamp(44px, 6vw, 84px); font-weight: 600; line-height: 0.92; letter-spacing: -0.05em; }
  .pc-workcard-bottom { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; border-top: 1px solid rgba(255,255,255,0.18); padding-top: 18px; }
  .pc-workcard-title { font-size: 17px; line-height: 1.35; max-width: 30ch; color: rgba(255,255,255,0.85); }
  .pc-workcard-arrow { flex: none; transition: transform 0.25s ease; }
  .pc-workcard:hover .pc-workcard-arrow { transform: translateX(6px); }

  .pc-metrics-note { margin-top: 20px; font-size: 15px; line-height: 1.5; color: var(--pc-grey); max-width: 56ch; }
  @media (min-width: 800px) {
    .pc-metrics-3 { grid-template-columns: repeat(3, 1fr); }
    .pc-metrics-3 > * .pc-metric { border-right: 0 !important; padding-right: 0 !important; padding-left: 0 !important; }
    .pc-metrics-3 > * + * .pc-metric { border-left: 1px solid var(--pc-line); padding-left: clamp(24px, 3vw, 40px) !important; }
  }

  /* ─── phone ─── */
  @media (max-width: 640px) {
    .pc-workcard { min-height: 280px; border-radius: 18px; }
    .pc-workcard-client { font-size: 48px; }
    .pc-workcard-title { font-size: 15px; }
    .pc-hero { padding: clamp(88px, 13vh, 112px) 0 calc(20px + env(safe-area-inset-bottom, 0px)); }
    .pc-hero-logos { margin-top: clamp(28px, 5vh, 44px); }
    .pc-logos-label { margin-bottom: 12px; font-size: 11px; }
    .pc-logos-group li { padding: 0 22px; height: 40px; }
    .pc-logos-group img { height: calc(19px * var(--boost, 1)); max-width: 112px; max-height: 50px; }
    .pc-logos-track { animation-duration: 30s; }
    .pc-eyebrow { margin-bottom: 20px; font-size: 12px; }
    .pc-hero-h { font-size: clamp(40px, 11.6vw, 56px); line-height: 0.98; letter-spacing: -0.04em; }
    .pc-hero-sub { margin-top: clamp(16px, 2.8vh, 24px); font-size: 17px; }
    .pc-hero-cta { margin-top: clamp(22px, 3.8vh, 32px); flex-direction: column; align-items: stretch; gap: 14px; }
    .pc-hero-price { text-align: center; font-size: 14px; }
    .pc-quote { padding: 32px 0; gap: 24px; }
    .pc-quote blockquote { font-size: 20px; }
    .pc-li-body, .pc-case-col { font-size: 17px; }
    .pc-track { padding: 28px 0; }
    .pc-track h3 { font-size: 22px; }
    .pc-dramaturgy { margin-top: 56px; }
    .pc-dramaturgy li { padding: 24px 0 20px; font-size: 26px; }
    .pc-dramaturgy li:nth-child(odd) { padding-right: 12px; }
    .pc-dramaturgy li:nth-child(n+3) { border-top: 1px solid var(--pc-line-dark); }
    .pc-metric { padding: 28px 0; }
    .pc-metric-v { font-size: 44px; }
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
