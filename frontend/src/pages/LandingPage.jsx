import { useNavigate, useLocation, useSearchParams, Link } from "react-router-dom";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { AuthCard } from "../components/AuthCard";
import { publicFetch, authenticatedFetch } from "../lib/api.js";
import { trackEvent, getVisitorId } from "../lib/analytics.js";
import { PullupEyes, SVG_W, SVG_H } from "../components/PullupEyes.jsx";

// ─── Onboarding draft persistence ───
// Mirrors the schema OnboardingPage was using so existing in-flight drafts
// transfer across to the new slide-shell version.
const DRAFT_KEY = "pullup_onboarding_draft";
const EMPTY_DRAFT = { name: "", brand: "", resumeStep: 0 };
const ONBOARDING_TOTAL_STEPS = 3;
const ONBOARDING_STEP_AUTH = 2;

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return { ...EMPTY_DRAFT, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}
function writeDraft(draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem("pullup_onboarding_logo_b64");
  } catch {}
}

// Same-origin-only redirect resolver for ?next=. Open redirects bad.
function resolveNext(params) {
  const raw = params.get("next");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/events";
  return raw;
}

// 3D cube of words spinning on its X axis behind the gazing star.
// One word faces the camera at a time. The cube rotateX(0 → -360deg) over
// CUBE_PERIOD seconds; each face is placed at translateZ(depth) on its own
// fixed rotateX so the front-face sequence is: people → life → art → culture.
const CUBE_PERIOD = 10; // seconds — matches the old cube tempo
// `fadeDelay` is the negative animation-delay (in seconds) that makes each
// face's opacity fade-keyframe peak exactly when that face is forward-facing.
// Formula: delay = period * (faceAngle - 360) / 360, mod period.
const CUBE_WORDS = [
  { word: "people",  faceAngle: 0,   fadeDelay: 0    }, // front at t=0
  { word: "life",    faceAngle: 90,  fadeDelay: -7.5 }, // front at t=2.5s
  { word: "art",     faceAngle: 180, fadeDelay: -5   }, // front at t=5s
  { word: "culture", faceAngle: -90, fadeDelay: -2.5 }, // front at t=7.5s
];

const LOGOS = [
  // All logos render as solid black silhouettes via `filter: brightness(0)`
  // so the marquee sits on the white page without needing a dark backdrop.
  { type: "image", src: "/landing/logos/soho-house.png", alt: "Soho House", width: 280, height: 179 },
  { type: "image", src: "/landing/logos/doberman.png", alt: "EY Doberman", width: 705, height: 139 },
  { type: "image", src: "/landing/logos/cliff-barnes.svg", alt: "Cliff Barnes Bränneri", width: 408, height: 176 },
  { type: "image", src: "/landing/logos/aperol.png", alt: "Aperol", width: 1280, height: 618 },
  { type: "image", src: "/zoda_logotype_white.webp", alt: "Zoda", width: 1600, height: 541 },
  { type: "image", src: "/landing/logos/showlighters.png", alt: "Showlighters", width: 3830, height: 2267 },
  { type: "image", src: "/landing/logos/hendricks-gin.png", alt: "Hendrick's Gin", width: 160, height: 160, boost: 1.7 },
  { type: "image", src: "/landing/logos/jagermeister.png", alt: "Jägermeister", width: 160, height: 160, boost: 1.7 },
];

const PINK = "#EC178F";
const INK = "#0a0a0a";
const SURFACE = "#ffffff";

/* ─── scroll reveal hook ─── */
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ─── generic reveal wrapper ─── */
function Reveal({ children, delay = 0, y = 24 }) {
  const [ref, visible] = useReveal(0.12);
  return (
    <div
      ref={ref}
      style={{
        transform: visible ? "translateY(0)" : `translateY(${y}px)`,
        opacity: visible ? 1 : 0,
        transition: `transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, opacity 0.7s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ─── Login slide panel ───
   Light AuthCard + "back to landing" + link to onboarding. Auto-routes
   to ?next= (or /events) once user is signed in. Only fires that effect
   while this panel is the active view, so the global auto-redirect on
   the landing shell doesn't double-fire it. */
function LoginPanel({ isActive, user }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = useMemo(() => resolveNext(params), [params]);

  useEffect(() => {
    if (!isActive || !user) return;
    navigate(next, { replace: true });
  }, [isActive, user, navigate, next]);

  return (
    <div className="auth-panel">
      <div className="auth-panel-topbar">
        <button
          type="button"
          className="auth-back"
          onClick={() => navigate("/")}
          aria-label="Back to landing"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <Link to="/start" className="auth-link-small">
          New here? <strong>Get started</strong>
        </Link>
      </div>
      <div className="auth-card-wrap">
        <p className="auth-kicker">Welcome back</p>
        <h2 className="auth-title">
          Step back into <span className="pink">pullup</span>.
        </h2>
        <AuthCard
          theme="light"
          redirectTo={next}
          submitLabel="Log in"
          trackingPrefix="login"
          showForgotPassword
          onSuccess={() => navigate(next, { replace: true })}
        />
      </div>
    </div>
  );
}

/* ─── Onboarding slide panel ───
   Three-step flow ported from the legacy OnboardingPage: name → studio
   → AuthCard. Draft persists in localStorage so an interrupted flow
   (incl. the Google OAuth round-trip) resumes on the right step. */
function OnboardingPanel({ isActive, user }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => readDraft() || { ...EMPTY_DRAFT });
  const [finalizing, setFinalizing] = useState(false);
  const finalizingRef = useRef(false);

  useEffect(() => {
    writeDraft({ ...draft, resumeStep: step });
  }, [draft, step]);

  useEffect(() => {
    if (!isActive) return;
    trackEvent("onboarding_step_view", { step });
  }, [isActive, step]);

  // When the panel becomes active, re-read the draft so a user who
  // bounced through /login → /start mid-flow lands on the right step.
  useEffect(() => {
    if (!isActive) return;
    const existing = readDraft();
    if (existing && typeof existing.resumeStep === "number" && existing.resumeStep > 0) {
      setStep(Math.min(existing.resumeStep, ONBOARDING_STEP_AUTH));
    }
  }, [isActive]);

  const finalize = useCallback(async () => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    setFinalizing(true);
    try {
      const pendingFlag = sessionStorage.getItem("pullup_signin_pending") === "1";
      sessionStorage.removeItem("pullup_signin_pending");
      trackEvent("signed_in", { via: pendingFlag ? "google" : "email" });

      const stored = readDraft();
      const payload = {
        name: stored?.name || "",
        brand: stored?.brand || "",
        visitorId: getVisitorId() || null,
      };
      try {
        await authenticatedFetch("/host/profile", {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.error("Failed to save onboarding profile:", err);
      }
    } finally {
      clearDraft();
      navigate("/events", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!isActive || !user) return;
    finalize();
  }, [isActive, user, finalize]);

  const update = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const goNext = () => setStep((s) => Math.min(s + 1, ONBOARDING_STEP_AUTH));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));
  const canAdvance = step === 0 ? draft.name.trim().length > 1 : true;

  if (finalizing) {
    return (
      <div className="auth-panel">
        <div className="auth-finalizing">Setting up your space…</div>
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <div className="auth-panel-topbar">
        <button
          type="button"
          className="auth-back"
          onClick={() => (step > 0 ? goBack() : navigate("/"))}
          aria-label={step === 0 ? "Back to landing" : "Previous step"}
        >
          <ArrowLeft size={16} />
          {step === 0 ? "Back" : "Previous"}
        </button>
        <div className="auth-step-dots" aria-hidden="true">
          {Array.from({ length: ONBOARDING_TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`auth-step-dot${i === step ? " is-current" : ""}${i < step ? " is-past" : ""}`}
            />
          ))}
        </div>
        <Link to="/login" className="auth-link-small">
          Already in? <strong>Log in</strong>
        </Link>
      </div>

      <div className="auth-card-wrap">
        {step === 0 && (
          <>
            <p className="auth-kicker">Step 1 of 3 · You</p>
            <h2 className="auth-title">
              What should we <span className="pink">call you</span>?
            </h2>
            <p className="auth-sub">
              Your name shows on invites and event pages.
            </p>
            <input
              className="auth-input"
              type="text"
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Your full name"
              autoFocus={isActive}
            />
          </>
        )}
        {step === 1 && (
          <>
            <p className="auth-kicker">Step 2 of 3 · Your brand</p>
            <h2 className="auth-title">Have a brand or studio?</h2>
            <p className="auth-sub">
              Drop the name if you host under one. Skip if it's just you for now — you can add this later in settings.
            </p>
            <input
              className="auth-input"
              type="text"
              value={draft.brand}
              onChange={(e) => update({ brand: e.target.value })}
              placeholder="Brand or studio name"
              autoFocus={isActive}
            />
          </>
        )}
        {step === ONBOARDING_STEP_AUTH && (
          <>
            <p className="auth-kicker">Step 3 of 3 · Claim it</p>
            <h2 className="auth-title">
              {draft.name
                ? `Welcome, ${draft.name.split(" ")[0]}.`
                : "Almost there."}
            </h2>
            <p className="auth-sub">
              Sign in to lock everything in. Google is fastest.
            </p>
            <AuthCard
              theme="light"
              redirectTo="/start"
              submitLabel="Create my account"
              trackingPrefix="onboarding"
              funnelTrack
              onSuccess={() => finalize()}
            />
          </>
        )}
      </div>

      {step < ONBOARDING_STEP_AUTH && (
        <div className="auth-actions">
          {step > 0 && (
            <button
              type="button"
              className="auth-skip"
              onClick={() => {
                trackEvent("onboarding_skip", { from: step });
                goNext();
              }}
            >
              Skip
            </button>
          )}
          <button
            type="button"
            className="auth-continue"
            disabled={!canAdvance}
            onClick={() => {
              if (!canAdvance) return;
              trackEvent("onboarding_step_advance", { from: step });
              goNext();
            }}
          >
            Continue
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── component ─── */
export function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const redirectedRef = useRef(false);

  // URL → which slide is "front and center". /login → login panel,
  // /start → onboarding panel, anything else → hero. Browser back/forward
  // updates the URL which re-derives the view and triggers the slide
  // animation in reverse.
  const view = useMemo(() => {
    if (location.pathname === "/login") return "login";
    if (location.pathname === "/start") return "onboarding";
    return "hero";
  }, [location.pathname]);

  const handleNavCta = () => {
    trackEvent("cta_click", { location: "nav", user_logged_in: !!user });
    navigate(user ? "/events" : "/login");
  };

  const handleEventsCta = () => {
    trackEvent("cta_click", { location: "hero_events", user_logged_in: !!user });
    navigate(user ? "/events" : "/login");
  };

  const handleMarketingCta = () => {
    trackEvent("cta_click", { location: "hero_marketing", user_logged_in: !!user });
    // external link — anchor handles the actual navigation, this just tracks
  };

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const visitorId = getVisitorId();
    if (!visitorId) return;
    publicFetch("/t/pageview", {
      method: "POST",
      body: JSON.stringify({
        page: "landing",
        visitorId,
        referrer: document.referrer || null,
        deviceType: window.innerWidth < 768 ? "mobile" : "desktop",
      }),
    }).catch(() => {});
  }, []);

  // Auto-redirect signed-in users to dashboard, with a sessionStorage
  // circuit-breaker so a background 401 bouncing us back to "/" doesn't
  // ping-pong with /events.
  //
  // Skip when view === "onboarding" — OnboardingPanel owns that path so
  // the draft (name + brand) gets flushed to /host/profile before the
  // user lands on /events.
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (view === "onboarding") return;
    if (redirectedRef.current) return;

    const LAST_KEY = "pullup_landing_redirected_at";
    const lastAt = Number(sessionStorage.getItem(LAST_KEY)) || 0;
    if (Date.now() - lastAt < 4000) return;

    redirectedRef.current = true;
    sessionStorage.setItem(LAST_KEY, String(Date.now()));

    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const pendingFlag = sessionStorage.getItem("pullup_signin_pending") === "1";
    const justCompletedOAuth =
      pendingFlag ||
      hash.includes("access_token") ||
      hash.includes("refresh_token") ||
      search.includes("code=");
    if (justCompletedOAuth) {
      sessionStorage.removeItem("pullup_signin_pending");
      trackEvent("signed_in", { via: pendingFlag ? "google" : "auto" });
    }
    // LoginPanel pushes its own ?next= → /events redirect; we only kick
    // in here for the bare hero/login states.
    navigate(view === "login" ? "/events" : "/events", { replace: true });
  }, [user, loading, view, navigate]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: SURFACE,
        color: INK,
        position: "relative",
        overflowX: "hidden",
      }}
    >
      <style>{`
        /* Pixel-art pink hand cursor across the entire landing page —
           same size everywhere (matches the system pointer the footer
           links would otherwise show). Forced on every descendant so
           images (incl. the marquee logos) don't fall back to the
           default arrow. Single 32x32 file with no @2x fallback: the
           marquee is a GPU-composited layer (translate3d + will-change),
           and offering two sizes causes the browser to re-rasterize at
           a different scale over that layer, so the cursor visibly
           jumps size. One file = one size, everywhere. Form inputs are
           excluded so the text caret still works in the login /
           onboarding fields. */
        html, body, body *:not(input):not(textarea):not(select) {
          cursor: url('/cursor-finger.png') 11 2, pointer !important;
        }
        /* Lock horizontal scroll/swipe on the landing so the slide track
           never feels like a swipeable carousel on phones — slides are
           triggered by URL changes only. overflow-x: hidden contains
           the marquee + slide track, overscroll-behavior-x: none kills
           the iOS swipe-back gesture inside the page. Both rules
           unmount with this <style> block when the user navigates away,
           so other routes get their default scroll back. */
        html, body {
          overflow-x: hidden;
          overscroll-behavior-x: none;
        }
        body { touch-action: pan-y; }
        /* ─── 3D word cube spinning behind the gazing star ─── */
        /* translateX shifts the rotation axis right so the front-facing
           word sits along the gaze tail. Y-shift is 0 here because the
           star itself is shifted DOWN inside the wrap so its gaze line
           already lines up with the wrap's vertical center (and with
           "for"/"pullup" in the flex row). */
        @keyframes cube-spin {
          from { transform: translateX(60px) rotateX(0deg);    }
          to   { transform: translateX(60px) rotateX(-360deg); }
        }
        .hero-row {
          display: flex;
          align-items: center;
          justify-content: center;
          /* Normal word-spacing between "pullup" and "for". */
          gap: clamp(8px, 1.5vmin, 18px);
        }
        .hero-pullup-logo {
          /* SVG was re-viewBoxed to crop the original whitespace, so the
             rendered height equals the visible cap-height directly. */
          height: clamp(36px, 7vmin, 70px);
          width: auto;
          display: block;
          flex: none;
        }
        .hero-for {
          font-size: clamp(36px, 7vmin, 70px);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1;
          color: ${INK};
          flex: none;
          /* Lift above the cube-wrap's 3D context so the star can't
             overlap "for" when the negative margin pulls them together. */
          position: relative;
          z-index: 10;
        }
        .cube-wrap {
          position: relative;
          width: clamp(220px, 40vmin, 360px);
          height: clamp(220px, 40vmin, 360px);
          flex: none;
          /* Aggressively pull the cube-wrap leftward so the star body
             sits directly after "for" — the wrap has tons of empty space
             on its left side before the centered star image. */
          margin-left: clamp(-120px, -20vmin, -70px);
        }
        .cube-stage {
          position: absolute;
          inset: 0;
          perspective: 900px;
          transform-style: preserve-3d;
        }
        .word-cube {
          --depth: clamp(16px, 3vmin, 28px);
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
          animation: cube-spin ${CUBE_PERIOD}s linear infinite;
          will-change: transform;
        }
        .cube-face {
          position: absolute;
          top: 50%;
          left: 50%;
          font-size: clamp(36px, 7vmin, 70px);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1;
          color: ${INK};
          white-space: nowrap;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform:
            translate(-50%, -50%)
            rotateX(var(--face-angle))
            translateZ(var(--depth));
        }
        .star-3d {
          position: absolute;
          top: 50%;
          left: 50%;
          width: clamp(150px, 30vmin, 260px);
          height: auto;
          /* Shift DOWN so the star's gaze line (in its upper half) lands
             on the wrap's vertical center — that's the line where "for"
             and the spinning word sit. translateZ(0) keeps the star at
             z=0 in 3D so the front-facing word renders in front of it. */
          transform: translate(-50%, calc(-50% + 20px)) translateZ(0);
          pointer-events: none;
          user-select: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .word-cube { animation: none; }
        }
        /* ─── Hero stage: [events] [pullup for word] [marketing] ───
           Three flex children in one row — the two CTAs flank the hero.
           Each CTA pairs one of the PullUp eyes variants (small for
           events, big for marketing) above an italic wordmark sized by
           height so events and marketing read at the same scale despite
           having different aspect ratios. On narrow screens the row
           wraps and the CTAs drop below the hero. */
        /* ─── Hero stage: Instagram-triptych layout ───
           Three flex children: [big eyes flank] [hero center] [small
           eyes flank]. Flanks take flex:1 each, so each one is
           centered in the space between the viewport edge and the hero
           center column — matching the @pullupfortheculture IG grid
           (big eyes left of the wordmark, small eyes right). On hover
           each eye crossfades into its wordmark (marketing / events). */
        .hero-stage {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          gap: clamp(16px, 3vw, 56px);
        }
        .hero-flank {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .hero-center {
          flex: 0 0 auto;
        }
        .hero-cta-btn {
          position: relative;
          background: transparent;
          border: 0;
          margin: 0;
          /* Generous hit area around the eyes so hover/click is easy
             even though the visible glyph is small. */
          padding: clamp(12px, 1.6vh, 28px) clamp(16px, 2.5vw, 40px);
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          text-decoration: none;
          color: inherit;
          font: inherit;
          flex: 0 0 auto;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        /* Eyes + crossfade label share this anchor — keeps the absolute
           label positioned over the eyes regardless of the caption below. */
        .hero-cta-stack {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        /* Static caption — only visible on devices that can't hover.
           On desktop the hover swap reveals the full wordmark; on phones
           we show the same word in plain italic so it's discoverable. */
        .hero-cta-caption {
          display: none;
          font-style: italic;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.01em;
          color: ${INK};
        }
        @media (hover: none) {
          .hero-cta-caption { display: block; }
        }
        .hero-cta-btn:hover  { transform: translateY(-3px); }
        .hero-cta-btn:active { transform: translateY(-1px); }
        .hero-cta-btn:focus  { outline: none; }
        .hero-cta-btn:focus-visible {
          outline: 2px dashed ${PINK};
          outline-offset: 6px;
          border-radius: 10px;
        }
        /* Eyes are the in-flow element; label is absolutely centered
           over the eyes and crossfades in on hover. Container size
           stays anchored to the eyes so the layout doesn't jump. */
        .hero-cta-eyes {
          height: clamp(80px, 13vmin, 170px);
          aspect-ratio: ${SVG_W} / ${SVG_H};
          width: auto;
          display: block;
          flex: none;
          transition: opacity 0.22s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hero-cta-eyes svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .hero-cta-label {
          position: absolute;
          top: 50%;
          left: 50%;
          /* Same height for events + marketing so both read at the
             same type size despite different wordmark widths. */
          height: clamp(30px, 4.5vmin, 56px);
          width: auto;
          max-width: 90%;
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.92);
          transition: opacity 0.22s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          pointer-events: none;
        }
        .hero-cta-btn:hover .hero-cta-eyes,
        .hero-cta-btn:focus-visible .hero-cta-eyes {
          opacity: 0;
          transform: scale(0.94);
        }
        .hero-cta-btn:hover .hero-cta-label,
        .hero-cta-btn:focus-visible .hero-cta-label {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        @media (max-width: 720px) {
          .hero-stage { flex-wrap: wrap; gap: clamp(20px, 5vw, 40px); }
          .hero-flank { flex: 0 0 auto; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-cta-btn,
          .hero-cta-btn:hover,
          .hero-cta-btn:active { transform: none; }
        }
        /* ─── Slide shell (hero | login | onboarding) ───
           Three-panel horizontal track. URL drives which one is
           "centered" via the data-view attribute, and the track
           translates by 0 / -33.333% / -66.666%. Hero is panel 0;
           login and onboarding both slide in from the right. */
        .slide-viewport {
          flex: 1;
          min-height: 0;
          position: relative;
          overflow: hidden;
          width: 100%;
        }
        .slide-track {
          display: flex;
          width: 300%;
          height: 100%;
          transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .slide-track[data-view="hero"]       { transform: translate3d(0, 0, 0); }
        .slide-track[data-view="login"]      { transform: translate3d(-33.3333%, 0, 0); }
        .slide-track[data-view="onboarding"] { transform: translate3d(-66.6666%, 0, 0); }
        .slide-panel {
          width: calc(100% / 3);
          flex: 0 0 auto;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px clamp(20px, 5vw, 40px) 40px;
          /* X explicitly hidden so a hero-row that's a few pixels too
             wide on a narrow phone can't leak out and create a page
             scroll. Y stays scrollable for tall auth forms. */
          overflow-x: hidden;
          overflow-y: auto;
          box-sizing: border-box;
          text-align: center;
        }
        /* Footer hides itself until you hover the strip — space stays
           reserved so the marquee never jumps. */
        .landing-footer { opacity: 0; transition: opacity 200ms ease; }
        .landing-footer:hover,
        .landing-footer:focus-within { opacity: 1; }

        /* The slide-viewport sits above the marquee, so content centered
           inside it lands above the window's visual center. Bias the hero
           panel's vertical padding to push it down by roughly half the
           marquee height so it reads as centered on the whole window
           rather than just the viewport. */
        .slide-panel-hero {
          padding-top: clamp(80px, 18vh, 200px);
          padding-bottom: clamp(20px, 4vh, 40px);
        }
        @media (prefers-reduced-motion: reduce) {
          .slide-track { transition: none; }
        }

        /* ─── Auth panels (light theme to match the landing) ─── */
        .auth-panel {
          width: 100%;
          max-width: 460px;
          display: flex;
          flex-direction: column;
          gap: 22px;
          color: ${INK};
          text-align: left;
        }
        .auth-panel-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .auth-back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(10, 10, 10, 0.12);
          background: transparent;
          color: ${INK};
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          transition: background 0.18s, border-color 0.18s;
        }
        .auth-back:hover {
          background: rgba(10, 10, 10, 0.04);
          border-color: rgba(10, 10, 10, 0.22);
        }
        .auth-link-small {
          font-size: 12px;
          color: rgba(10, 10, 10, 0.55);
          text-decoration: none;
          letter-spacing: 0.02em;
        }
        .auth-link-small strong {
          color: ${PINK};
          font-weight: 600;
        }
        .auth-step-dots {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .auth-step-dot {
          height: 4px;
          width: 14px;
          border-radius: 2px;
          background: rgba(10, 10, 10, 0.14);
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .auth-step-dot.is-past    { background: rgba(10, 10, 10, 0.45); }
        .auth-step-dot.is-current { background: ${PINK}; width: 28px; }
        .auth-card-wrap {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .auth-kicker {
          margin: 0;
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(10, 10, 10, 0.42);
        }
        .auth-title {
          margin: 0;
          font-size: clamp(28px, 4.6vw, 40px);
          font-weight: 800;
          letter-spacing: -0.025em;
          line-height: 1.08;
          color: ${INK};
        }
        .auth-title .pink { color: ${PINK}; }
        .auth-sub {
          margin: 0;
          font-size: 15px;
          line-height: 1.5;
          color: rgba(10, 10, 10, 0.6);
        }
        .auth-input {
          width: 100%;
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid rgba(10, 10, 10, 0.16);
          background: #fff;
          color: ${INK};
          font-size: 16px;
          font-family: inherit;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .auth-input:focus {
          border-color: ${PINK};
          box-shadow: 0 0 0 3px rgba(236, 23, 143, 0.16);
        }
        .auth-actions {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: flex-end;
        }
        .auth-skip {
          padding: 10px 16px;
          border-radius: 999px;
          background: transparent;
          border: none;
          color: rgba(10, 10, 10, 0.55);
          font-family: inherit;
          font-size: 13px;
        }
        .auth-continue {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 22px;
          border-radius: 999px;
          border: none;
          background: ${PINK};
          color: #fff;
          font-family: inherit;
          font-size: 14px;
          font-weight: 700;
          transition: opacity 0.18s, transform 0.18s;
        }
        .auth-continue:hover { transform: translateY(-1px); }
        .auth-continue:disabled {
          background: rgba(10, 10, 10, 0.08);
          color: rgba(10, 10, 10, 0.4);
          transform: none;
        }
        .auth-finalizing {
          text-align: center;
          padding: 60px 20px;
          font-size: 12px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(10, 10, 10, 0.55);
        }

        @keyframes logo-marquee {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
        .logo-marquee {
          /* Horizontal strip at the very bottom of the page, sitting
             below the footer links — scrolls right-to-left so the page
             "ends" with a slow trust-marquee. */
          position: relative;
          width: 100%;
          overflow: hidden;
          background: transparent;
          line-height: 0;
          padding: 18px 0 calc(18px + env(safe-area-inset-bottom));
        }
        .logo-marquee-track {
          display: flex;
          flex-direction: row;
          align-items: center;
          width: max-content;
          animation: logo-marquee 40s linear infinite;
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform: translate3d(0, 0, 0);
        }
        .logo-marquee-group {
          /* Each group is forced to at least one viewport wide so the
             track (= 2 groups) is always ≥ 2 viewports — translating by
             -50% (one group width) is therefore guaranteed seamless on
             ANY screen, including ultrawides. Extra space is distributed
             via space-around so the logos spread out rather than
             leaving a visible gap. */
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-around;
          flex: none;
          /* dvw = dynamic viewport width — excludes scrollbar area, so
             this won't be a hair wider than the visible viewport and
             trigger a phantom horizontal scrollbar on mobile. */
          min-width: 100dvw;
          gap: 48px;
          padding: 0 24px;
        }
        @media (min-width: 768px) {
          .logo-marquee-group { gap: 64px; padding: 0 32px; }
        }
        .logo-marquee-item {
          flex: none;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.55;
          transition: opacity 0.2s;
        }
        .logo-marquee-item:hover { opacity: 0.9; }
        .logo-marquee-item img {
          width: auto;
          display: block;
          /* Force every logo to a solid black silhouette so they read on
             the white page — alpha is preserved, so transparent areas
             stay transparent. */
          filter: brightness(0);
        }

      `}</style>

      {/* ─── NAV (temporarily hidden — flip false→true to bring back) ─── */}
      {false && (
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          padding: "0 calc(44px + clamp(16px, 4vw, 40px)) 0 clamp(12px, 2vw, 24px)",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: scrolled ? "rgba(255,255,255,0.92)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(10,10,10,0.06)" : "none",
          transition: "background 0.3s, border-color 0.3s",
        }}
      >
        <div
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          <img
            src="/pullup-logo.svg"
            alt="PullUp"
            style={{ height: 44, width: "auto", display: "block" }}
          />
        </div>
        <button
          onClick={handleNavCta}
          style={{
            padding: "8px 22px",
            borderRadius: "999px",
            border: `1px solid ${PINK}`,
            background: "transparent",
            color: PINK,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = PINK;
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = PINK;
          }}
        >
          Log in
        </button>
      </nav>
      )}

      {/* ─── SLIDE SHELL (hero ↔ login ↔ onboarding) ───
          Three panels live in one horizontal track. Switching URL
          (/, /login, /start) re-derives `view`, which sets data-view on
          the track and animates the translateX. Footer + marquee sit
          outside the viewport, so they stay pinned through every slide. */}
      <div className="slide-viewport">
        <div className="slide-track" data-view={view}>
          <section className="slide-panel slide-panel-hero">
            <div style={{ width: "100%", position: "relative", zIndex: 3 }}>
              <h1
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: "hidden",
                  clip: "rect(0,0,0,0)",
                  whiteSpace: "nowrap",
                  border: 0,
                }}
              >
                Pullup for people, culture, art, and life.
              </h1>

              <Reveal delay={0.05}>
                <div className="hero-stage">
                  {/* LEFT: big eyes → marketing (Instagram). */}
                  <div className="hero-flank">
                    <a
                      className="hero-cta-btn"
                      href="https://instagram.com/pullupfortheculture"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleMarketingCta}
                      aria-label="Marketing — opens PullUp on Instagram"
                    >
                      <span className="hero-cta-stack">
                        <PullupEyes variant="big" className="hero-cta-eyes" />
                        <img
                          src="/cta-marketing.png"
                          alt="marketing"
                          className="hero-cta-label"
                        />
                      </span>
                      <span className="hero-cta-caption">marketing</span>
                    </a>
                  </div>

                  {/* CENTER: pullup for [word] hero. */}
                  <div className="hero-center">
                    <div className="hero-row" aria-hidden="true">
                      <img
                        src="/pullup-textlogo.svg"
                        alt=""
                        className="hero-pullup-logo"
                      />
                      <span className="hero-for">for</span>
                      <div className="cube-wrap">
                        <div className="cube-stage">
                          <div className="word-cube">
                            {CUBE_WORDS.map((w) => (
                              <span
                                key={w.word}
                                className="cube-face"
                                style={{ "--face-angle": `${w.faceAngle}deg` }}
                              >
                                {w.word}
                              </span>
                            ))}
                          </div>
                          <img
                            src="/pullup-logo.svg"
                            alt=""
                            className="star-3d"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: small eyes → events (login). */}
                  <div className="hero-flank">
                    <button
                      type="button"
                      className="hero-cta-btn"
                      onClick={handleEventsCta}
                      aria-label={user ? "Go to your events dashboard" : "Sign in to PullUp events"}
                    >
                      <span className="hero-cta-stack">
                        <PullupEyes variant="small" className="hero-cta-eyes" />
                        <img
                          src="/cta-events.png"
                          alt="events"
                          className="hero-cta-label"
                        />
                      </span>
                      <span className="hero-cta-caption">events</span>
                    </button>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          <section className="slide-panel">
            <LoginPanel isActive={view === "login"} user={user} />
          </section>

          <section className="slide-panel">
            <OnboardingPanel isActive={view === "onboarding"} user={user} />
          </section>
        </div>
      </div>

      {/* ─── FOOTER (hidden until you hover its strip) ─── */}
      <footer
        className="landing-footer"
        style={{
          position: "relative",
          padding: "16px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "clamp(10px, 3vw, 20px)",
          flexWrap: "wrap",
          fontSize: 11,
          color: INK,
          background: SURFACE,
        }}
      >
        <span>Pullup &copy; {new Date().getFullYear()}</span>
        <span style={{ opacity: 0.5 }}>&middot;</span>
        <a href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>Privacy</a>
        <a href="/terms" style={{ color: "inherit", textDecoration: "none" }}>Terms</a>
        <a href="/cookies" style={{ color: "inherit", textDecoration: "none" }}>Cookies</a>
        <span style={{ opacity: 0.5 }}>&middot;</span>
        <a href="mailto:hello@pullup.se" style={{ color: "inherit", textDecoration: "none" }}>hello@pullup.se</a>
      </footer>

      {/* ─── TRUST LOGOS MARQUEE (bottom-of-page horizontal strip) ─── */}
      <div className="logo-marquee" aria-hidden="true">
        <div className="logo-marquee-track">
          {/* Two identical viewport-wide groups; animation translates the
              track by -50% (= one group), so the second group seamlessly
              takes the first's place. Works on any screen width because
              each group is min-width: 100vw. */}
          {[0, 1].map((copy) => (
            <div className="logo-marquee-group" key={copy}>
              {LOGOS.map((logo, i) => {
                const renderH = 22 * (logo.boost || 1);
                return (
                  <div className="logo-marquee-item" key={i}>
                    <img
                      src={logo.src}
                      alt={copy === 0 ? logo.alt : ""}
                      width={logo.width}
                      height={logo.height}
                      style={{ height: renderH }}
                      decoding="async"
                      loading="eager"
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
