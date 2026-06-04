import { useNavigate, useLocation, useSearchParams, Link, Navigate } from "react-router-dom";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { AuthCard } from "../components/AuthCard";
import { hasStoredSession } from "../lib/session.js";
import { publicFetch, authenticatedFetch } from "../lib/api.js";
import { trackEvent, getVisitorId } from "../lib/analytics.js";
import { PullupEyes } from "../components/PullupEyes.jsx";

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
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/room";
  return raw;
}

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
function Reveal({ children, delay = 0, y = 24, className, style }) {
  const [ref, visible] = useReveal(0.12);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        transform: visible ? "translateY(0)" : `translateY(${y}px)`,
        opacity: visible ? 1 : 0,
        transition: `transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s, opacity 0.8s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ─── Login slide panel ───
   Light AuthCard + "back to landing" + link to onboarding. Auto-routes
   to ?next= (or /room) once user is signed in. Only fires that effect
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
      navigate("/room", { replace: true });
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

/* ─── Auth shell ───
   Login + onboarding live in one horizontal track that slides between the
   two. /login → panel 0, /start → panel 1. Rendered only when the URL is on
   an auth route; the marketing scroll owns the bare "/" view. */
function AuthShell({ view, user }) {
  return (
    <div className="auth-shell">
      <div className="auth-track" data-view={view}>
        <div className="auth-slot">
          <LoginPanel isActive={view === "login"} user={user} />
        </div>
        <div className="auth-slot">
          <OnboardingPanel isActive={view === "onboarding"} user={user} />
        </div>
      </div>
    </div>
  );
}

/* ─── Marketing primitives ─── */

// A numbered chapter label — "01 · The split" — that anchors each beat.
function Chapter({ n, label }) {
  return (
    <div className="mk-chapter">
      <span className="mk-chapter-n">{n}</span>
      <span className="mk-chapter-label">{label}</span>
    </div>
  );
}

// Scene frame — wraps an animated mock and only kicks its CSS animations off
// once it scrolls into view (adds `.mk-in`). Mirrors the WhatsNewModal scene
// language: real platform surfaces, built as animated CSS rather than video.
function SceneFrame({ children, className = "" }) {
  const [ref, visible] = useReveal(0.28);
  return (
    <div ref={ref} className={`mk-scene ${className}${visible ? " mk-in" : ""}`}>
      {children}
    </div>
  );
}

// Channel glyph — the real Room's cross-channel identity chips.
const CH = {
  whatsapp: { glyph: "WA", color: "#25D366", soft: "#e7f9ee" },
  instagram: { glyph: "IG", color: "#d6249f", soft: "#fdeef7" },
  email: { glyph: "@", color: "#6b6b6b", soft: "#f0f0ee" },
};
function ChannelChip({ ch }) {
  const c = CH[ch] || CH.email;
  return (
    <span className="mk-chchip" style={{ background: c.soft, color: c.color }}>
      {c.glyph}
    </span>
  );
}

// The recurring trust marquee, reused in the proof section + page foot.
function LogoMarquee() {
  return (
    <div className="logo-marquee" aria-hidden="true">
      <div className="logo-marquee-track">
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
                    loading="lazy"
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── The marketing scroll ───
   Eight beats that take a cold visitor from "what is this" to "get started".
   Brand-soul kept: light canvas, pink accent, the eyes as the recurring
   motif, pixel cursor, trust marquee. */
function MarketingScroll({ onGetStarted, onLogin, user }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const cta = (location, label = "Get started") => (
    <button
      type="button"
      className="mk-cta"
      onClick={() => {
        trackEvent("cta_click", { location, user_logged_in: !!user });
        onGetStarted();
      }}
    >
      {user ? "Open your room" : label}
      <ArrowRight size={17} />
    </button>
  );

  return (
    <div className="mk">
      {/* ─── Top bar — wordmark + log in / get started, fades in on scroll ─── */}
      <header className={`mk-nav${scrolled ? " is-scrolled" : ""}`}>
        <button
          type="button"
          className="mk-nav-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="PullUp — back to top"
        >
          <img src="/pullup-textlogo.svg" alt="PullUp" />
        </button>
        <div className="mk-nav-actions">
          {!user && (
            <button
              type="button"
              className="mk-nav-login"
              onClick={() => {
                trackEvent("cta_click", { location: "nav_login", user_logged_in: false });
                onLogin();
              }}
            >
              Log in
            </button>
          )}
          <button
            type="button"
            className="mk-nav-cta"
            onClick={() => {
              trackEvent("cta_click", { location: "nav", user_logged_in: !!user });
              onGetStarted();
            }}
          >
            {user ? "Open your room" : "Get started"}
          </button>
        </div>
      </header>

      {/* ─── 1 · HERO ─── */}
      <section className="mk-hero">
        <Reveal y={16}>
          <PullupEyes variant="big" className="mk-hero-eyes" />
        </Reveal>
        <Reveal delay={0.06}>
          <p className="mk-eyebrow">For creators &amp; solopreneurs</p>
        </Reveal>
        <Reveal delay={0.12}>
          <h1 className="mk-hero-h">
            Your people don't live<br />in one place.{" "}
            <span className="pink">Now they do.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.18}>
          <p className="mk-hero-sub">
            The home for everyone behind your work — the followers and the
            friends, the DMs and the dinners. PullUp holds them as one living
            thing. Then it reaches out, before you remember to.
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="mk-hero-cta">{cta("hero")}</div>
        </Reveal>
        <Reveal delay={0.4}>
          <div className="mk-scrollcue" aria-hidden="true">
            <span>see how it works</span>
            <span className="mk-scrollcue-line" />
          </div>
        </Reveal>
      </section>

      {/* ─── 2 · THE SPLIT ─── */}
      <section className="mk-section">
        <Reveal><Chapter n="01" label="The split" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            Your life as a creator is split in two.
          </h2>
        </Reveal>
        <div className="mk-split">
          <Reveal delay={0.1} className="mk-split-col">
            <p className="mk-split-kicker">Online</p>
            <p className="mk-split-big">Followers. DMs. Likes.</p>
            <p className="mk-split-note">Reach you can measure but never feel.</p>
          </Reveal>
          <Reveal delay={0.18} className="mk-split-vs">
            <span>vs</span>
          </Reveal>
          <Reveal delay={0.26} className="mk-split-col">
            <p className="mk-split-kicker">In real life</p>
            <p className="mk-split-big">Who showed up. Who you'd call.</p>
            <p className="mk-split-note">Presence you feel but can't scale.</p>
          </Reveal>
        </div>
        <Reveal delay={0.32}>
          <p className="mk-lede">
            You're the only thing connecting the two. Every name, every promise
            to follow up, every "we should do this again" — held in your head.
            <strong> And you're tired.</strong>
          </p>
        </Reveal>
      </section>

      {/* ─── 3 · ONE PERSON ─── */}
      <section className="mk-section mk-section-tint">
        <Reveal><Chapter n="02" label="One person" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            The two halves are the <span className="pink">same human</span>.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            The handle that comments on every post is the same person who came
            to your last three nights. PullUp resolves them into one —
            across Instagram, WhatsApp, email, and the door. A single thread
            per person that outlives any one event.
          </p>
        </Reveal>

        {/* Room card mock — a person's living timeline */}
        <Reveal delay={0.16}>
          <div className="mk-room">
            <div className="mk-room-head">
              <div className="mk-room-stat">
                <strong>248</strong> in your world
              </div>
              <div className="mk-room-dot">·</div>
              <div className="mk-room-stat mk-room-need">
                <strong>6</strong> need you
              </div>
            </div>
            <div className="mk-room-people">
              {[
                { i: "MA", n: "Maya", m: "Showed up twice · no thank-you yet", hot: true },
                { i: "JN", n: "Jonas", m: "RSVP'd Friday · first time" },
                { i: "TL", n: "Talia", m: "Quiet 4 months · was a regular", hot: true },
                { i: "Re", n: "Rema", m: "Replied to your story · not invited yet" },
              ].map((p) => (
                <div className={`mk-room-row${p.hot ? " is-hot" : ""}`} key={p.n}>
                  <span className="mk-room-av">{p.i}</span>
                  <span className="mk-room-name">{p.n}</span>
                  <span className="mk-room-meta">{p.m}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.22}>
          <p className="mk-aside">
            Not a follower count. A responsibility count. The number that
            matters is the one that needs you back.
          </p>
        </Reveal>
      </section>

      {/* ─── 4 · ONE NODE THAT ACTS ─── */}
      <section className="mk-section">
        <Reveal><Chapter n="03" label="It acts" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            It doesn't wait to be asked.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            Most tools sit there until you open them. PullUp notices. Who's gone
            quiet. Who came twice and never heard back. Who's on the waitlist for
            the night that just opened up. Then it does the hard part — it writes
            the first draft.
          </p>
        </Reveal>

        {/* Proactive nudge mock */}
        <Reveal delay={0.16}>
          <div className="mk-nudge">
            <div className="mk-nudge-tag">PullUp noticed</div>
            <p className="mk-nudge-line">
              Maya came to your last two dinners and never got a word after.
              Want to close the loop?
            </p>
            <div className="mk-nudge-draft">
              "Maya — it genuinely made both nights better having you there.
              Doing a small one in May, you're first on the list. ✨"
            </div>
            <div className="mk-nudge-actions">
              <span className="mk-nudge-send">Send</span>
              <span className="mk-nudge-edit">Edit</span>
              <span className="mk-nudge-skip">Not now</span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.22}>
          <p className="mk-creed">
            It drafts. <span className="pink">You send.</span>
          </p>
        </Reveal>
        <Reveal delay={0.28}>
          <p className="mk-aside">
            PullUp amplifies care that already exists. It never manufactures
            care that doesn't. The warmth is yours — it just makes sure you
            never drop it.
          </p>
        </Reveal>
      </section>

      {/* ─── 5 · MEETS YOU WHERE YOU WORK ─── */}
      <section className="mk-section mk-section-tint">
        <Reveal><Chapter n="04" label="No new tab" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            It lives where you already are.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            Not one more dashboard to forget about. Talk to PullUp inside the
            tools you already keep open — Claude, ChatGPT, Cursor. Spin up an
            event, pull a person's whole history, draft the follow-up, all in
            a sentence.
          </p>
        </Reveal>
        <Reveal delay={0.16}>
          <div className="mk-term">
            <div className="mk-term-bar">
              <span /><span /><span />
            </div>
            <pre className="mk-term-body">
{`you  ›  make a small dinner for 12, friday the 9th, my place

pullup  ›  Done — draft event "Friday Supper" is live.
           Pulled 18 people who'd fit. 6 are overdue a
           reach-out. Want the invites drafted?`}
            </pre>
          </div>
        </Reveal>
      </section>

      {/* ─── 6 · YOUR PEOPLE STAY YOURS ─── */}
      <section className="mk-section">
        <Reveal><Chapter n="05" label="Yours" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            Your people are yours. Full stop.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            We don't sell contacts. We don't market to your audience. Your
            memories live in your own cloud — PullUp is the thread that renders
            them, not the landlord that owns them. Your fans only ever hear from
            one person: you.
          </p>
        </Reveal>
      </section>

      {/* ─── 7 · PROOF ─── */}
      <section className="mk-section mk-section-proof">
        <Reveal>
          <p className="mk-proof-label">The rooms already run on PullUp</p>
        </Reveal>
      </section>
      <LogoMarquee />

      {/* ─── 8 · FINAL CTA ─── */}
      <section className="mk-final">
        <Reveal y={16}>
          <PullupEyes variant="big" className="mk-final-eyes" />
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="mk-final-h">
            Stop managing your people.<br />
            <span className="pink">Start tending them.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mk-final-sub">
            We're early, and that's the point — we're taking on one creator at a
            time, and doing it properly. Pull up.
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="mk-final-cta">{cta("final")}</div>
        </Reveal>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="mk-footer">
        <span>Pullup &copy; {new Date().getFullYear()}</span>
        <span className="mk-footer-dot">·</span>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/cookies">Cookies</a>
        <span className="mk-footer-dot">·</span>
        <a href="mailto:hello@pullup.se">hello@pullup.se</a>
      </footer>
    </div>
  );
}

/* ─── component ─── */
export function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const redirectedRef = useRef(false);

  // URL → which surface we show. /login + /start are the auth shell;
  // anything else is the marketing scroll.
  const view = useMemo(() => {
    if (location.pathname === "/login") return "login";
    if (location.pathname === "/start") return "onboarding";
    return "hero";
  }, [location.pathname]);

  // Pre-paint session gate. If a returning user lands on /, /login (or any
  // non-onboarding entry) with a stored Supabase session, redirect to /room
  // on the FIRST frame — before the marketing/login shell paints — so they
  // never see it flash in and jump away. /start (onboarding) is exempt: that
  // flow flushes the name+brand draft to the profile before forwarding.
  const sessionGate = useMemo(() => {
    if (location.pathname === "/start") return false;
    return hasStoredSession();
  }, [location.pathname]);

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

  // Auto-redirect signed-in users to their room, with a sessionStorage
  // circuit-breaker so a background 401 bouncing us back to "/" doesn't
  // ping-pong with /room.
  //
  // Skip when view === "onboarding" — OnboardingPanel owns that path so
  // the draft (name + brand) gets flushed to /host/profile before the
  // user lands on /room.
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
    // LoginPanel pushes its own ?next= → /room redirect; we only kick
    // in here for the bare hero/login states.
    navigate("/room", { replace: true });
  }, [user, loading, view, navigate]);

  // Marketing scroll needs the document to scroll normally; auth shell is a
  // single locked screen. Toggle a body class so the lock only applies to
  // auth and the marketing page scrolls freely.
  useEffect(() => {
    const cls = "pullup-auth-locked";
    if (view === "hero") document.body.classList.remove(cls);
    else document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [view]);

  // Returning user with a stored session — skip the shell entirely.
  if (sessionGate) {
    return <Navigate to="/room" replace />;
  }

  return (
    <div className="landing-root">
      <style>{STYLES}</style>

      {view === "hero" ? (
        <MarketingScroll
          user={user}
          onGetStarted={() => navigate(user ? "/room" : "/start")}
          onLogin={() => navigate("/login")}
        />
      ) : (
        <AuthShell view={view} user={user} />
      )}
    </div>
  );
}

/* ─── styles ─── */
const STYLES = `
  /* Pixel-art pink hand cursor across the entire landing page. Forced on
     every descendant so images don't fall back to the default arrow. Form
     inputs are excluded so the text caret still works in the auth fields. */
  html, body, body *:not(input):not(textarea):not(select) {
    cursor: url('/cursor-finger.png') 11 2, pointer !important;
  }
  html, body { overflow-x: hidden; overscroll-behavior-x: none; }
  body { touch-action: pan-y; }

  /* Auth surfaces lock the screen to a single non-scrolling view; the
     marketing scroll leaves the document free to scroll. */
  body.pullup-auth-locked { overflow: hidden; }

  .landing-root {
    min-height: 100dvh;
    background: ${SURFACE};
    color: ${INK};
    position: relative;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .pink { color: ${PINK}; }

  /* ════════ MARKETING SCROLL ════════ */
  .mk {
    width: 100%;
    max-width: 100%;
  }

  /* ─── top nav ─── */
  .mk-nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 50;
    height: 60px;
    padding: 0 clamp(16px, 4vw, 40px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(255,255,255,0);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border-bottom: 1px solid transparent;
    transition: background 0.3s, border-color 0.3s, backdrop-filter 0.3s;
  }
  .mk-nav.is-scrolled {
    background: rgba(255,255,255,0.86);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(10,10,10,0.06);
  }
  .mk-nav-brand {
    background: none; border: 0; padding: 0; display: flex; align-items: center;
  }
  .mk-nav-brand img { height: 26px; width: auto; display: block; }
  .mk-nav-actions { display: flex; align-items: center; gap: clamp(8px, 2vw, 20px); }
  .mk-nav-login {
    background: none; border: 0; padding: 8px 6px;
    font: inherit; font-size: 14px; font-weight: 500;
    color: rgba(10,10,10,0.6);
    transition: color 0.18s;
  }
  .mk-nav-login:hover { color: ${INK}; }
  .mk-nav-cta {
    padding: 9px 20px; border-radius: 999px; border: 0;
    background: ${INK}; color: #fff;
    font: inherit; font-size: 14px; font-weight: 600;
    transition: transform 0.18s, background 0.18s;
  }
  .mk-nav-cta:hover { transform: translateY(-1px); background: ${PINK}; }

  /* ─── shared section frame ─── */
  .mk-section {
    max-width: 880px;
    margin: 0 auto;
    padding: clamp(72px, 13vh, 150px) clamp(22px, 6vw, 48px);
  }
  .mk-section-tint { background: linear-gradient(180deg, #fafafa, #fff); max-width: none; }
  .mk-section-tint > * { max-width: 880px; margin-left: auto; margin-right: auto; }
  .mk-eyebrow {
    margin: 0;
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
    color: rgba(10,10,10,0.42);
    font-weight: 600;
  }
  .mk-chapter { display: flex; align-items: baseline; gap: 12px; margin-bottom: 22px; }
  .mk-chapter-n {
    font-size: 13px; font-weight: 700; color: ${PINK};
    font-variant-numeric: tabular-nums; letter-spacing: 0.04em;
  }
  .mk-chapter-label {
    font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
    color: rgba(10,10,10,0.4); font-weight: 600;
  }
  .mk-h2 {
    margin: 0 0 28px;
    font-size: clamp(30px, 5.4vw, 52px);
    font-weight: 800; letter-spacing: -0.03em; line-height: 1.06;
  }
  .mk-lede {
    margin: 0;
    font-size: clamp(17px, 2.3vw, 22px);
    line-height: 1.55;
    color: rgba(10,10,10,0.72);
    max-width: 40ch;
  }
  .mk-lede strong { color: ${INK}; font-weight: 700; }
  .mk-aside {
    margin: 28px 0 0;
    font-size: 15px; line-height: 1.6;
    color: rgba(10,10,10,0.5);
    max-width: 46ch;
    border-left: 2px solid rgba(236,23,143,0.35);
    padding-left: 16px;
  }

  /* ─── 1 · hero ─── */
  .mk-hero {
    min-height: 100dvh;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center;
    padding: 100px clamp(22px, 6vw, 48px) 60px;
    gap: 22px;
  }
  .mk-hero-eyes {
    height: clamp(90px, 16vmin, 150px);
    width: auto; display: block; margin-bottom: 4px;
  }
  .mk-hero-eyes svg { width: 100%; height: 100%; display: block; }
  .mk-hero-h {
    margin: 0;
    font-size: clamp(38px, 7.4vw, 78px);
    font-weight: 800; letter-spacing: -0.035em; line-height: 1.02;
    max-width: 16ch;
  }
  .mk-hero-sub {
    margin: 0;
    font-size: clamp(17px, 2.4vw, 21px);
    line-height: 1.55;
    color: rgba(10,10,10,0.66);
    max-width: 52ch;
  }
  .mk-hero-cta { margin-top: 8px; }

  .mk-cta {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 15px 30px; border-radius: 999px; border: 0;
    background: ${PINK}; color: #fff;
    font: inherit; font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
    box-shadow: 0 10px 30px -8px rgba(236,23,143,0.5);
    transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s;
  }
  .mk-cta:hover { transform: translateY(-2px); box-shadow: 0 16px 40px -10px rgba(236,23,143,0.6); }
  .mk-cta:active { transform: translateY(0); }
  .mk-cta svg { transition: transform 0.2s; }
  .mk-cta:hover svg { transform: translateX(3px); }

  .mk-scrollcue {
    margin-top: 36px;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
    color: rgba(10,10,10,0.34);
  }
  .mk-scrollcue-line {
    width: 1px; height: 40px;
    background: linear-gradient(180deg, rgba(10,10,10,0.3), transparent);
    animation: cue 2s ease-in-out infinite;
  }
  @keyframes cue {
    0%, 100% { opacity: 0.3; transform: scaleY(0.6); transform-origin: top; }
    50% { opacity: 1; transform: scaleY(1); transform-origin: top; }
  }

  /* ─── 2 · split ─── */
  .mk-split {
    display: flex; align-items: stretch; gap: clamp(16px, 4vw, 40px);
    margin: 40px 0 8px;
  }
  .mk-split-col {
    flex: 1 1 0; min-width: 0;
    padding: 28px; border-radius: 18px;
    background: #fff; border: 1px solid rgba(10,10,10,0.08);
  }
  .mk-split-kicker {
    margin: 0 0 14px;
    font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
    color: ${PINK}; font-weight: 700;
  }
  .mk-split-big { margin: 0 0 10px; font-size: clamp(20px, 3vw, 28px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; }
  .mk-split-note { margin: 0; font-size: 14px; line-height: 1.5; color: rgba(10,10,10,0.5); }
  .mk-split-vs {
    flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-style: italic; font-weight: 600; color: rgba(10,10,10,0.32);
  }
  @media (max-width: 640px) {
    .mk-split { flex-direction: column; }
    .mk-split-vs { padding: 4px 0; }
  }

  /* ─── 3 · room card ─── */
  .mk-room {
    margin: 40px 0 4px;
    border-radius: 22px;
    border: 1px solid rgba(10,10,10,0.1);
    background: #fff;
    box-shadow: 0 30px 70px -40px rgba(10,10,10,0.4);
    overflow: hidden;
  }
  .mk-room-head {
    display: flex; align-items: center; gap: 10px;
    padding: 18px 22px;
    border-bottom: 1px solid rgba(10,10,10,0.07);
    font-size: clamp(15px, 2vw, 18px);
    color: rgba(10,10,10,0.55);
  }
  .mk-room-head strong { color: ${INK}; font-weight: 800; }
  .mk-room-need strong { color: ${PINK}; }
  .mk-room-dot { color: rgba(10,10,10,0.25); }
  .mk-room-people { padding: 8px; }
  .mk-room-row {
    display: flex; align-items: center; gap: 14px;
    padding: 13px 14px; border-radius: 12px;
    transition: background 0.15s;
  }
  .mk-room-row:hover { background: rgba(10,10,10,0.025); }
  .mk-room-row.is-hot { background: rgba(236,23,143,0.05); }
  .mk-room-av {
    flex: 0 0 auto;
    width: 38px; height: 38px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(10,10,10,0.06); color: rgba(10,10,10,0.6);
    font-size: 12px; font-weight: 700; letter-spacing: 0.02em;
  }
  .mk-room-row.is-hot .mk-room-av { background: ${PINK}; color: #fff; }
  .mk-room-name { font-weight: 700; font-size: 15px; flex: 0 0 auto; }
  .mk-room-meta { font-size: 13px; color: rgba(10,10,10,0.5); margin-left: auto; text-align: right; }
  @media (max-width: 560px) {
    .mk-room-meta { display: none; }
  }

  /* ─── 4 · nudge ─── */
  .mk-nudge {
    margin: 40px 0 4px;
    border-radius: 20px;
    border: 1px solid rgba(236,23,143,0.25);
    background: linear-gradient(180deg, rgba(236,23,143,0.04), #fff);
    padding: clamp(20px, 4vw, 30px);
    box-shadow: 0 24px 60px -38px rgba(236,23,143,0.5);
  }
  .mk-nudge-tag {
    display: inline-block; margin-bottom: 14px;
    font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
    color: ${PINK}; font-weight: 700;
  }
  .mk-nudge-line { margin: 0 0 18px; font-size: clamp(16px, 2.2vw, 19px); font-weight: 600; line-height: 1.4; }
  .mk-nudge-draft {
    margin: 0 0 18px; padding: 16px 18px;
    border-radius: 14px; background: rgba(10,10,10,0.035);
    font-size: 15px; line-height: 1.55; color: rgba(10,10,10,0.78);
    font-style: italic;
  }
  .mk-nudge-actions { display: flex; align-items: center; gap: 10px; }
  .mk-nudge-send {
    padding: 9px 22px; border-radius: 999px; background: ${PINK}; color: #fff;
    font-size: 14px; font-weight: 700;
  }
  .mk-nudge-edit, .mk-nudge-skip {
    padding: 9px 16px; font-size: 14px; font-weight: 500; color: rgba(10,10,10,0.55);
  }

  .mk-creed {
    margin: 36px 0 0;
    font-size: clamp(24px, 4vw, 38px);
    font-weight: 800; letter-spacing: -0.03em;
  }

  /* ─── 5 · terminal ─── */
  .mk-term {
    margin: 40px 0 4px;
    border-radius: 16px; overflow: hidden;
    border: 1px solid rgba(10,10,10,0.1);
    background: #0d0d0f;
    box-shadow: 0 30px 70px -40px rgba(10,10,10,0.6);
  }
  .mk-term-bar {
    display: flex; gap: 7px; padding: 13px 16px;
    background: #18181b; border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .mk-term-bar span { width: 11px; height: 11px; border-radius: 999px; background: rgba(255,255,255,0.18); }
  .mk-term-bar span:first-child { background: ${PINK}; }
  .mk-term-body {
    margin: 0; padding: clamp(18px, 3vw, 26px);
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: clamp(12px, 1.8vw, 14.5px); line-height: 1.7;
    color: rgba(255,255,255,0.82);
    white-space: pre-wrap; word-break: break-word;
  }

  /* ─── 7 · proof ─── */
  .mk-section-proof { padding-bottom: 8px; text-align: center; }
  .mk-proof-label {
    margin: 0;
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
    color: rgba(10,10,10,0.4); font-weight: 600;
  }

  /* ─── 8 · final ─── */
  .mk-final {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; gap: 22px;
    padding: clamp(80px, 16vh, 180px) clamp(22px, 6vw, 48px) clamp(60px, 10vh, 110px);
  }
  .mk-final-eyes { height: clamp(80px, 14vmin, 130px); width: auto; display: block; }
  .mk-final-eyes svg { width: 100%; height: 100%; display: block; }
  .mk-final-h {
    margin: 0;
    font-size: clamp(34px, 6.4vw, 66px);
    font-weight: 800; letter-spacing: -0.035em; line-height: 1.04;
  }
  .mk-final-sub {
    margin: 0; font-size: clamp(16px, 2.3vw, 20px); line-height: 1.55;
    color: rgba(10,10,10,0.6); max-width: 46ch;
  }
  .mk-final-cta { margin-top: 8px; }

  /* ─── footer ─── */
  .mk-footer {
    padding: 30px 16px calc(30px + env(safe-area-inset-bottom));
    display: flex; align-items: center; justify-content: center;
    gap: clamp(10px, 3vw, 20px); flex-wrap: wrap;
    font-size: 11px; color: rgba(10,10,10,0.55);
    border-top: 1px solid rgba(10,10,10,0.06);
  }
  .mk-footer a { color: inherit; text-decoration: none; }
  .mk-footer a:hover { color: ${INK}; }
  .mk-footer-dot { opacity: 0.4; }

  /* ════════ TRUST MARQUEE ════════ */
  @keyframes logo-marquee {
    from { transform: translate3d(0, 0, 0); }
    to   { transform: translate3d(-50%, 0, 0); }
  }
  .logo-marquee {
    position: relative; width: 100%; overflow: hidden;
    background: transparent; line-height: 0;
    padding: 26px 0;
  }
  .logo-marquee-track {
    display: flex; flex-direction: row; align-items: center;
    width: max-content;
    animation: logo-marquee 40s linear infinite;
    will-change: transform; backface-visibility: hidden;
    transform: translate3d(0, 0, 0);
  }
  .logo-marquee-group {
    display: flex; flex-direction: row; align-items: center; justify-content: space-around;
    flex: none; min-width: 100dvw; gap: 48px; padding: 0 24px;
  }
  @media (min-width: 768px) {
    .logo-marquee-group { gap: 64px; padding: 0 32px; }
  }
  .logo-marquee-item {
    flex: none; display: flex; align-items: center; justify-content: center;
    opacity: 0.5; transition: opacity 0.2s;
  }
  .logo-marquee-item:hover { opacity: 0.85; }
  .logo-marquee-item img { width: auto; display: block; filter: brightness(0); }

  /* ════════ AUTH SHELL ════════ */
  .auth-shell {
    position: relative;
    width: 100%; height: 100dvh;
    overflow: hidden;
  }
  .auth-track {
    display: flex; width: 200%; height: 100%;
    transition: transform 0.6s cubic-bezier(0.16,1,0.3,1);
    will-change: transform;
  }
  .auth-track[data-view="login"]      { transform: translate3d(0, 0, 0); }
  .auth-track[data-view="onboarding"] { transform: translate3d(-50%, 0, 0); }
  .auth-slot {
    width: 50%; flex: 0 0 auto; height: 100%;
    display: flex; align-items: center; justify-content: center;
    padding: 60px clamp(20px, 5vw, 40px);
    overflow-y: auto; box-sizing: border-box;
  }
  @media (prefers-reduced-motion: reduce) {
    .auth-track { transition: none; }
  }

  /* ─── auth panels (light) ─── */
  .auth-panel {
    width: 100%; max-width: 460px;
    display: flex; flex-direction: column; gap: 22px;
    color: ${INK}; text-align: left;
  }
  .auth-panel-topbar {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }
  .auth-back {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: 999px;
    border: 1px solid rgba(10,10,10,0.12); background: transparent;
    color: ${INK}; font-family: inherit; font-size: 13px; font-weight: 500;
    transition: background 0.18s, border-color 0.18s;
  }
  .auth-back:hover { background: rgba(10,10,10,0.04); border-color: rgba(10,10,10,0.22); }
  .auth-link-small { font-size: 12px; color: rgba(10,10,10,0.55); text-decoration: none; letter-spacing: 0.02em; }
  .auth-link-small strong { color: ${PINK}; font-weight: 600; }
  .auth-step-dots { display: flex; gap: 6px; align-items: center; }
  .auth-step-dot {
    height: 4px; width: 14px; border-radius: 2px; background: rgba(10,10,10,0.14);
    transition: all 0.4s cubic-bezier(0.16,1,0.3,1);
  }
  .auth-step-dot.is-past    { background: rgba(10,10,10,0.45); }
  .auth-step-dot.is-current { background: ${PINK}; width: 28px; }
  .auth-card-wrap { display: flex; flex-direction: column; gap: 16px; }
  .auth-kicker { margin: 0; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(10,10,10,0.42); }
  .auth-title { margin: 0; font-size: clamp(28px, 4.6vw, 40px); font-weight: 800; letter-spacing: -0.025em; line-height: 1.08; color: ${INK}; }
  .auth-title .pink { color: ${PINK}; }
  .auth-sub { margin: 0; font-size: 15px; line-height: 1.5; color: rgba(10,10,10,0.6); }
  .auth-input {
    width: 100%; padding: 14px 16px; border-radius: 12px;
    border: 1px solid rgba(10,10,10,0.16); background: #fff; color: ${INK};
    font-size: 16px; font-family: inherit; outline: none; box-sizing: border-box;
    transition: border-color 0.18s, box-shadow 0.18s;
  }
  .auth-input:focus { border-color: ${PINK}; box-shadow: 0 0 0 3px rgba(236,23,143,0.16); }
  .auth-actions { display: flex; gap: 12px; align-items: center; justify-content: flex-end; }
  .auth-skip { padding: 10px 16px; border-radius: 999px; background: transparent; border: none; color: rgba(10,10,10,0.55); font-family: inherit; font-size: 13px; }
  .auth-continue {
    display: inline-flex; align-items: center; gap: 8px; padding: 12px 22px;
    border-radius: 999px; border: none; background: ${PINK}; color: #fff;
    font-family: inherit; font-size: 14px; font-weight: 700;
    transition: opacity 0.18s, transform 0.18s;
  }
  .auth-continue:hover { transform: translateY(-1px); }
  .auth-continue:disabled { background: rgba(10,10,10,0.08); color: rgba(10,10,10,0.4); transform: none; }
  .auth-finalizing { text-align: center; padding: 60px 20px; font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(10,10,10,0.55); }

  @media (prefers-reduced-motion: reduce) {
    .mk-scrollcue-line, .logo-marquee-track { animation: none; }
  }
`;
