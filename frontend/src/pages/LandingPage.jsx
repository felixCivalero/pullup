import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef, useMemo } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AuthGate, resolveNext } from "../components/auth/AuthGate.jsx";
import { supabase } from "../lib/supabase.js";
import { resolveStoredSession } from "../lib/validateStoredSession.mjs";
import { trackEvent } from "../lib/analytics.js";
import { initTracking, trackPageView, track } from "../lib/track.js";

/* The public front door: PullUp as an agency — The Production Core.
   Black and white, typography first. The only product surface left on the
   page is "Log in" in the nav (→ /login modal → the host's room). */

const CONTACT = "hello@pullup.se";
const mailto = (subject) =>
  `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}`;

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

const DRAMATURGY = ["Hook", "Credibility", "Core", "Outro"];

const OFFERS = [
  {
    name: "The Blueprint Restructure",
    price: "$4,820",
    cadence: "One-time",
    body: "We audit your stack, build your content templates, and map your 3-part BKM engine.",
    cta: "Secure the Blueprint",
  },
  {
    name: "The Retained Architecture",
    price: "$3,000",
    cadence: "/ month · 12+ months",
    body: "A global partnership where we run the engine, moderate the dual tracks, and script your dramaturgical assets line-by-line.",
    cta: "Apply for retainer",
  },
];

/* ─── scroll reveal ─── */
function Reveal({ children, delay = 0, className }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`pc-reveal${visible ? " is-in" : ""}${className ? ` ${className}` : ""}`}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
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

function AgencyPage({ onLogin }) {
  const [scrolled, setScrolled] = useState(false);
  const [navDark, setNavDark] = useState(true);
  const navRef = useRef(null);

  // The bar takes the tone of whatever section sits under it — black over
  // the dark beats, white over the light ones — so it never sits on text.
  useEffect(() => {
    let raf = null;
    const compute = () => {
      raf = null;
      setScrolled(window.scrollY > 8);
      const probe = (navRef.current?.getBoundingClientRect().bottom || 64) - 1;
      let dark = false;
      document.querySelectorAll("[data-pc-tone='dark']").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top <= probe && r.bottom > probe) dark = true;
      });
      setNavDark(dark);
    };
    const onScroll = () => {
      if (raf == null) raf = requestAnimationFrame(compute);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    compute();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []);

  // Scroll-depth: each named beat fires section_view once per mount.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          const section = el.getAttribute("data-pc-section");
          if (!section || seen.has(section)) continue;
          seen.add(section);
          track("section_view", {
            section,
            order: Number(el.getAttribute("data-pc-order")) || 0,
          });
          observer.unobserve(el);
        }
      },
      { threshold: 0.2 },
    );
    document.querySelectorAll("[data-pc-section]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const toOffer = (location) => {
    trackEvent("cta_click", { location });
    document.getElementById("offer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="pc">
      <header
        ref={navRef}
        className={`pc-nav${scrolled ? " is-scrolled" : ""}${navDark ? " is-dark" : " is-light"}`}
      >
        <button
          type="button"
          className="pc-nav-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="PullUp — back to top"
        >
          <img src="/pullup-textlogo.svg" alt="PullUp" />
        </button>
        <button
          type="button"
          className="pc-nav-login"
          onClick={() => {
            trackEvent("cta_click", { location: "nav_login" });
            onLogin();
          }}
        >
          Log in
        </button>
      </header>

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
              content engine — driven by a precise, 12+ month BKM alignment flow
              and high-frequency, 30-minute tactical sprints.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="pc-hero-cta">
              <button type="button" className="pc-btn pc-btn-light" onClick={() => toOffer("hero")}>
                Secure your operational blueprint
                <ArrowRight size={18} strokeWidth={1.75} />
              </button>
              <p className="pc-hero-price">
                $4,820 one-time <span>/</span> $3,000 per month
              </p>
            </div>
          </Reveal>
        </div>
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

      {/* ─── 3. BKM 0–10k — founder-led marketing ─── */}
      <section className="pc-section pc-rule" data-pc-section="bkm" data-pc-order="3">
        <div className="pc-wrap pc-split">
          <div>
            <SectionLabel n="02">Founder-led marketing</SectionLabel>
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
          </div>
        </div>
      </section>

      {/* ─── the method — dual-track 30-minute system ─── */}
      <section className="pc-section pc-rule" data-pc-section="method" data-pc-order="4">
        <div className="pc-wrap">
          <SectionLabel n="03">The 30-minute BKM flow</SectionLabel>
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
      <section className="pc-section pc-dark pc-li" data-pc-tone="dark" data-pc-section="li" data-pc-order="5">
        <div className="pc-wrap">
          <SectionLabel n="04">Profile — Li Karlsén</SectionLabel>
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
        </div>
      </section>

      {/* ─── 5. STIGA — enterprise validation ─── */}
      <section className="pc-section" data-pc-section="stiga" data-pc-order="6">
        <div className="pc-wrap">
          <SectionLabel n="05">Enterprise — STIGA</SectionLabel>
          <Reveal>
            <h2 className="pc-h2">
              Not just for agile startups. It scales to legacy global giants.
            </h2>
          </Reveal>
          <div className="pc-metrics">
            <Reveal>
              <div className="pc-metric">
                <p className="pc-metric-k">Operational drag</p>
                <p className="pc-metric-v">Eliminated</p>
                <p>
                  Internal corporate alignment sped up by turning legacy communication
                  models into high-frequency, 30-minute tactical structures.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="pc-metric">
                <p className="pc-metric-k">Production core volume</p>
                <p className="pc-metric-v">Month after month</p>
                <p>
                  Massive corporate systems and technical data pipelines translated
                  into premium public-facing assets — running sustainably.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── 6. ADAM FLAMBO — the execution case ─── */}
      <section className="pc-section pc-rule" data-pc-section="adam" data-pc-order="7">
        <div className="pc-wrap">
          <SectionLabel n="06">Case — Adam Flambo</SectionLabel>
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
        </div>
      </section>

      {/* ─── 7. THE OFFER & CLOSE ─── */}
      <section id="offer" className="pc-section pc-dark pc-close" data-pc-tone="dark" data-pc-section="offer" data-pc-order="8">
        <div className="pc-wrap">
          <Reveal>
            <h2 className="pc-h2 pc-h2-xl">
              Your business does incredible work behind closed doors.
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="pc-close-sub">
              Stop letting your marketing team guess what that work looks like.
              Restructure your organization around a Production Core.
            </p>
          </Reveal>
          <div className="pc-offers">
            {OFFERS.map((o, i) => (
              <Reveal key={o.name} delay={i * 0.08}>
                <div className="pc-offer">
                  <p className="pc-offer-name">{o.name}</p>
                  <p className="pc-offer-price">
                    {o.price}
                    <span>{o.cadence}</span>
                  </p>
                  <p className="pc-offer-body">{o.body}</p>
                  <a
                    className={`pc-btn ${i === 0 ? "pc-btn-light" : "pc-btn-ghost"}`}
                    href={mailto(o.name)}
                    onClick={() => trackEvent("cta_click", { location: `offer_${i === 0 ? "blueprint" : "retained"}` })}
                  >
                    {o.cta}
                    <ArrowUpRight size={18} strokeWidth={1.75} />
                  </a>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <footer className="pc-footer" data-pc-tone="dark">
        <span>PullUp &copy; {new Date().getFullYear()}</span>
        <nav>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/cookies">Cookies</a>
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </nav>
      </footer>
    </div>
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
    <div className="landing-root">
      <style>{STYLES}</style>
      <AgencyPage onLogin={() => navigate("/login")} />
      {view === "login" && (
        <AuthGate
          initialMode="login"
          redirectTo={resolveNext(searchParams)}
          onDismiss={() => navigate("/")}
          onSignupIntent={() => navigate("/start")}
        />
      )}
    </div>
  );
}

/* ─── styles ─── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap');

  html, body { overflow-x: clip; }
  body.pullup-auth-locked { overflow: hidden; }

  .landing-root {
    --pc-black: #000;
    --pc-white: #fff;
    --pc-grey: #6b6b6b;
    --pc-line: rgba(0,0,0,0.12);
    --pc-line-dark: rgba(255,255,255,0.16);
    min-height: 100dvh;
    background: var(--pc-white);
    color: var(--pc-black);
    font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow-x: clip;
  }
  .pc { width: 100%; }
  .pc *, .pc *::before, .pc *::after { box-sizing: border-box; }
  :where(.pc) :where(p, h1, h2, h3, figure, blockquote, ol) { margin: 0; }
  .pc h1, .pc h2, .pc h3 { text-wrap: balance; }
  .pc p, .pc blockquote { text-wrap: pretty; }
  .pc button, .pc a { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  .landing-root { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  .pc :focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }

  .pc-wrap {
    width: 100%;
    max-width: 1240px;
    margin: 0 auto;
    padding: 0 clamp(16px, 5vw, 56px);
  }

  .pc-reveal {
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.9s ease, transform 0.9s cubic-bezier(0.16,1,0.3,1);
  }
  .pc-reveal.is-in { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) {
    .pc-reveal { opacity: 1; transform: none; transition: none; }
  }

  /* ─── nav: takes the tone of the section beneath it ─── */
  .pc-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 50;
    height: 64px;
    padding: env(safe-area-inset-top, 0px) clamp(16px, 5vw, 56px) 0;
    box-sizing: content-box;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid transparent;
    transition: background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease;
  }
  .pc-nav.is-dark { color: #fff; }
  .pc-nav.is-light { color: #000; }
  .pc-nav.is-scrolled.is-dark { background: rgba(0,0,0,0.88); border-bottom-color: rgba(255,255,255,0.08); }
  .pc-nav.is-scrolled.is-light { background: rgba(255,255,255,0.9); border-bottom-color: rgba(0,0,0,0.08); }
  .pc-nav.is-scrolled { backdrop-filter: saturate(1.4) blur(14px); -webkit-backdrop-filter: saturate(1.4) blur(14px); }
  .pc-nav-brand {
    background: none; border: 0; padding: 10px 0; margin: -10px 0;
    display: flex; cursor: pointer;
  }
  .pc-nav-brand img { height: 22px; width: auto; display: block; transition: filter 0.25s ease; }
  .pc-nav.is-dark .pc-nav-brand img { filter: brightness(0) invert(1); }
  .pc-nav.is-light .pc-nav-brand img { filter: brightness(0); }
  .pc-nav-login {
    background: none; border: 1px solid currentColor; color: inherit;
    font: inherit; font-size: 14px; font-weight: 500; letter-spacing: 0.01em;
    min-height: 40px; padding: 0 18px; border-radius: 999px; cursor: pointer;
    position: relative;
    transition: background-color 0.2s ease, color 0.2s ease;
  }
  /* 44px hit area without a bigger pill */
  .pc-nav-login::after { content: ""; position: absolute; inset: -4px -6px; }
  .pc-nav.is-dark .pc-nav-login:hover { background: #fff; color: #000; }
  .pc-nav.is-light .pc-nav-login:hover { background: #000; color: #fff; }

  /* ─── shared type ─── */
  .pc-dark { background: var(--pc-black); color: var(--pc-white); }
  .pc-section { padding: clamp(80px, 12vw, 160px) 0; }
  .pc-rule { border-top: 1px solid var(--pc-line); }
  .pc-label {
    display: flex; gap: 14px; align-items: baseline;
    font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--pc-grey);
    margin-bottom: clamp(32px, 5vw, 56px);
  }
  .pc-label span { color: inherit; font-variant-numeric: tabular-nums; }
  .pc-dark .pc-label { color: rgba(255,255,255,0.5); }
  .pc-h2 {
    font-size: clamp(32px, 5vw, 60px);
    font-weight: 600; line-height: 1.04; letter-spacing: -0.03em;
    max-width: 18ch;
    margin-bottom: clamp(40px, 6vw, 72px);
  }
  .pc-h2-xl { font-size: clamp(36px, 6.4vw, 84px); max-width: 20ch; }
  .pc-close .pc-h2-xl { margin-bottom: 28px; }
  .pc-lead { font-size: clamp(20px, 2.2vw, 26px); line-height: 1.4; letter-spacing: -0.01em; }
  .pc-prose { display: grid; gap: 28px; font-size: 18px; line-height: 1.6; }
  .pc-split {
    display: grid; gap: clamp(32px, 6vw, 96px);
    grid-template-columns: 1fr;
  }
  @media (min-width: 900px) { .pc-split { grid-template-columns: 5fr 7fr; } }

  /* ─── buttons ─── */
  .pc-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 10px;
    font: inherit; font-size: 16px; font-weight: 600; letter-spacing: -0.005em;
    padding: 18px 28px; border-radius: 999px; cursor: pointer;
    text-decoration: none; border: 1px solid transparent;
    transition: transform 0.2s ease, opacity 0.2s ease, background 0.2s ease, color 0.2s ease;
  }
  .pc-btn:hover { transform: translateY(-1px); }
  .pc-btn svg { transition: transform 0.2s ease; }
  .pc-btn:hover svg { transform: translateX(3px); }
  .pc-btn-light { background: var(--pc-white); color: var(--pc-black); }
  .pc-btn-ghost { background: transparent; color: var(--pc-white); border-color: var(--pc-line-dark); }
  .pc-btn-ghost:hover { border-color: var(--pc-white); }

  /* ─── hero ─── */
  .pc-hero {
    min-height: 100svh;
    display: flex; align-items: flex-end;
    padding: 140px 0 clamp(56px, 9vw, 112px);
  }
  .pc-eyebrow {
    font-size: 13px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase;
    color: rgba(255,255,255,0.55);
    margin-bottom: 28px;
  }
  .pc-hero-h {
    font-size: clamp(44px, 8.6vw, 128px);
    font-weight: 600; line-height: 0.96; letter-spacing: -0.045em;
    max-width: 14ch;
  }
  .pc-hero-sub {
    margin-top: clamp(28px, 4vw, 44px);
    max-width: 58ch;
    font-size: clamp(17px, 1.6vw, 20px); line-height: 1.55;
    color: rgba(255,255,255,0.7);
  }
  .pc-hero-cta {
    margin-top: clamp(36px, 5vw, 56px);
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

  /* ─── close / offer ─── */
  .pc-close-sub {
    max-width: 52ch;
    font-size: clamp(18px, 1.8vw, 22px); line-height: 1.5; color: rgba(255,255,255,0.7);
  }
  .pc-offers {
    margin-top: clamp(56px, 8vw, 96px);
    display: grid; grid-template-columns: 1fr; gap: 16px;
  }
  @media (min-width: 900px) { .pc-offers { grid-template-columns: 1fr 1fr; gap: 24px; } }
  .pc-offer {
    height: 100%;
    border: 1px solid var(--pc-line-dark); border-radius: 20px;
    padding: clamp(28px, 4vw, 48px);
    display: flex; flex-direction: column; gap: 20px;
  }
  .pc-offer-name { font-size: 15px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(255,255,255,0.6); }
  .pc-offer-price {
    font-size: clamp(48px, 6vw, 80px); font-weight: 600; line-height: 1; letter-spacing: -0.045em;
    font-variant-numeric: tabular-nums;
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px;
  }
  .pc-offer-price span { font-size: 16px; font-weight: 500; letter-spacing: 0; color: rgba(255,255,255,0.55); }
  .pc-offer-body { flex: 1; font-size: 17px; line-height: 1.55; color: rgba(255,255,255,0.75); max-width: 44ch; }
  .pc-offer .pc-btn { align-self: flex-start; margin-top: 8px; }

  /* ─── footer ─── */
  .pc-footer {
    background: var(--pc-black); color: rgba(255,255,255,0.45);
    border-top: 1px solid var(--pc-line-dark);
    padding: 28px clamp(16px, 5vw, 56px) calc(28px + env(safe-area-inset-bottom, 0px));
    display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px 24px;
    font-size: 13px;
  }
  .pc-footer nav { display: flex; flex-wrap: wrap; gap: 20px; }
  .pc-footer a { color: inherit; text-decoration: none; }
  .pc-footer a:hover { color: #fff; }

  /* ─── phone ─── */
  @media (max-width: 640px) {
    .pc-section { padding: 72px 0; }
    .pc-label { margin-bottom: 28px; font-size: 12px; }
    .pc-h2 { margin-bottom: 36px; }
    .pc-hero { padding: 120px 0 calc(40px + env(safe-area-inset-bottom, 0px)); }
    .pc-eyebrow { margin-bottom: 20px; font-size: 12px; }
    .pc-hero-h { font-size: clamp(40px, 11.6vw, 56px); line-height: 0.98; letter-spacing: -0.04em; }
    .pc-hero-sub { margin-top: 24px; font-size: 17px; }
    .pc-hero-cta { margin-top: 32px; flex-direction: column; align-items: stretch; gap: 14px; }
    .pc-hero-price { text-align: center; font-size: 14px; }
    .pc-btn { width: 100%; min-height: 56px; padding: 0 22px; }
    .pc-quote { padding: 32px 0; gap: 24px; }
    .pc-quote blockquote { font-size: 20px; }
    .pc-prose, .pc-li-body, .pc-case-col { font-size: 17px; }
    .pc-lead { font-size: 21px; }
    .pc-track { padding: 28px 0; }
    .pc-track h3 { font-size: 22px; }
    .pc-dramaturgy { margin-top: 56px; }
    .pc-dramaturgy li { padding: 24px 0 20px; font-size: 26px; }
    .pc-dramaturgy li:nth-child(odd) { padding-right: 12px; }
    .pc-dramaturgy li:nth-child(n+3) { border-top: 1px solid var(--pc-line-dark); }
    .pc-metric { padding: 28px 0; }
    .pc-metric-v { font-size: 44px; }
    .pc-close-sub { font-size: 18px; }
    .pc-offers { margin-top: 48px; gap: 12px; }
    .pc-offer { padding: 28px 22px; border-radius: 18px; gap: 16px; }
    .pc-offer-price { font-size: 52px; }
    .pc-offer .pc-btn { align-self: stretch; }
    .pc-footer { flex-direction: column; gap: 16px; padding-top: 32px; }
    .pc-footer nav { gap: 8px 20px; }
    .pc-footer a { padding: 6px 0; }
  }
`;
