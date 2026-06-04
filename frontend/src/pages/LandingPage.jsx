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

/* ─── Scenes — animated mocks of the REAL platform ─── */

// 1 · THE ROOM — the real-world people who showed up, kept across every night.
// `arc` = which of your nights they came to (filled = attended); it's what makes
// the room persist and grow instead of resetting when an event ends.
const ROOM_PEOPLE = [
  { initials: "SL", color: "#ec4899", name: "Sara Lindqvist", arc: [1, 0, 1, 1], rel: "A regular — three nights and counting", need: true },
  { initials: "AB", color: "#8b5cf6", name: "Adam Berg", arc: [1, 1, 1, 1], rel: "Your most loyal — brings friends every time", need: false },
  { initials: "PR", color: "#d97706", name: "Priya Raman", arc: [1, 1, 0, 1], rel: "Drifted five months — just came back", need: true },
  { initials: "TH", color: "#16a34a", name: "Tobias Hane", arc: [0, 0, 0, 1], rel: "First night — found you through your reel", need: false },
  { initials: "JW", color: "#0d9488", name: "Jonas Wikström", arc: [0, 0, 1, 1], rel: "Reliable — pays, shows up early, party of 3", need: false },
];
function RoomScene() {
  return (
    <SceneFrame className="mk-room">
      <div className="mk-room-head">
        <div className="mk-room-title">Your room</div>
        <div className="mk-room-stats">
          <span><strong>248</strong> who've shown up</span>
          <span className="mk-room-need-stat"><strong>6</strong> need you</span>
        </div>
      </div>
      <div className="mk-room-axis" aria-hidden="true">
        <span>Vol. 1 · last spring</span>
        <span className="mk-room-axis-line" />
        <span>Vol. 4 · Saturday</span>
      </div>
      <div className="mk-room-rows">
        {ROOM_PEOPLE.map((p, i) => (
          <div className="mk-rp" key={p.name} style={{ "--i": i }}>
            <span className="mk-rp-av" style={{ background: p.color }}>{p.initials}</span>
            <div className="mk-rp-id">
              <span className="mk-rp-name">
                {p.name}
                {p.need && <span className="mk-rp-need">needs you</span>}
              </span>
              <span className="mk-rp-rel">{p.rel}</span>
            </div>
            <span className="mk-arc" title="Nights they came">
              {p.arc.map((on, j) => (
                <span key={j} className={`mk-arc-dot${on ? " on" : ""}`} />
              ))}
            </span>
          </div>
        ))}
      </div>
    </SceneFrame>
  );
}

// 2 · INSIDE THE ROOM — the exclusive stuff only your pullupers get.
// Mirrors the federated-room model: memories (photos from the night) +
// artifacts (a track, a drop) shared with the people who actually showed up.
function RoomDropScene() {
  return (
    <SceneFrame className="mk-drop">
      <div className="mk-drop-head">
        <span className="mk-drop-title">Inside the room</span>
        <span className="mk-drop-lock">only for people who pulled up</span>
      </div>
      <div className="mk-drop-grid">
        {/* music */}
        <div className="mk-tile" style={{ "--i": 0 }}>
          <div className="mk-tile-music">
            <span className="mk-tile-play" />
            <span className="mk-wave" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} style={{ "--b": i }} />
              ))}
            </span>
          </div>
          <span className="mk-tile-label">Sunset set · unreleased</span>
        </div>
        {/* photos */}
        <div className="mk-tile" style={{ "--i": 1 }}>
          <div className="mk-tile-photos">
            <span style={{ background: "linear-gradient(135deg,#ff8a4c,#ec178f)" }} />
            <span style={{ background: "linear-gradient(135deg,#7b2ff7,#0d9488)" }} />
            <span style={{ background: "linear-gradient(135deg,#fbbf24,#dc2743)" }} />
          </div>
          <span className="mk-tile-label">Vol. 3 night · 48 photos</span>
        </div>
        {/* product drop */}
        <div className="mk-tile" style={{ "--i": 2 }}>
          <div className="mk-tile-drop">
            <span className="mk-tile-swatch" />
            <span className="mk-tile-pill">20% for the room</span>
          </div>
          <span className="mk-tile-label">Studio print · early drop</span>
        </div>
        {/* next invite */}
        <div className="mk-tile" style={{ "--i": 3 }}>
          <div className="mk-tile-invite">
            <span className="mk-tile-invite-eyes">Vol. 5</span>
            <span className="mk-tile-invite-note">you're first</span>
          </div>
          <span className="mk-tile-label">Next night · before it's public</span>
        </div>
      </div>
    </SceneFrame>
  );
}

// 3 · the living cross-channel thread + the draft in your voice.
const THREAD = [
  { from: "them", ch: "instagram", text: "saw your story — is Vol 4 happening?? 🙌" },
  { from: "you", ch: "instagram", text: "Sara!! yes — this Saturday. sending the link" },
  { from: "sys", ch: "email", text: "RSVP'd to Vol. 4 · confirmed, bringing 1" },
  { from: "them", ch: "whatsapp", text: "is there parking nearby or should I take the metro?" },
];
function ThreadScene() {
  return (
    <SceneFrame className="mk-thread">
      <div className="mk-thread-head">
        <span className="mk-thread-av" style={{ background: "#ec4899" }}>SL</span>
        <div className="mk-thread-who">
          <span className="mk-thread-name">Sara Lindqvist</span>
          <span className="mk-thread-sub">A regular · Vol. 1 → 3 → 4</span>
        </div>
        <span className="mk-window">WhatsApp · open · 21h left</span>
      </div>
      <div className="mk-thread-body">
        {THREAD.map((m, i) => (
          <div className={`mk-msg mk-msg-${m.from}`} key={i} style={{ "--i": i }}>
            {m.from !== "you" && <ChannelChip ch={m.ch} />}
            <span className="mk-msg-bub">{m.text}</span>
          </div>
        ))}
      </div>
      <div className="mk-draft">
        <span className="mk-draft-tag">Your move · reply about parking</span>
        <p className="mk-draft-text">
          "Metro's easiest — Ringen, 4 min walk. But there's free street parking
          on Skånegatan after 6 if you'd rather drive 🙂 so glad you're in again."
        </p>
        <div className="mk-draft-actions">
          <span className="mk-draft-send">Send as you</span>
          <span className="mk-draft-edit">Edit</span>
          <span className="mk-draft-skip">Skip</span>
        </div>
      </div>
    </SceneFrame>
  );
}

// 5 · fill the room — comment → auto-DM → WhatsApp confirm (Tobias' real arc).
function InboundScene() {
  return (
    <SceneFrame className="mk-inbound">
      <div className="mk-in-comment">
        <ChannelChip ch="instagram" />
        <span>🔥 how do I get in??</span>
      </div>
      <div className="mk-in-arrow">↓ auto-DM with your link</div>
      <div className="mk-in-dm">
        Tap to grab your spot
        <span className="mk-in-pill">RSVP →</span>
      </div>
      <div className="mk-in-arrow mk-in-arrow-2">↓ confirm where they actually reply</div>
      <div className="mk-in-wa">
        <ChannelChip ch="whatsapp" />
        You're in — see you Saturday, 6pm ✓
      </div>
    </SceneFrame>
  );
}

// 6 · run it from your AI (MCP) — typed prompt → event created.
function McpScene() {
  return (
    <SceneFrame className="mk-mcp">
      <div className="mk-mcp-prompt">
        <span className="mk-mcp-pdot" />
        <span className="mk-mcp-typed">make a rooftop dinner, Sat 6pm, 50 guests</span>
        <span className="mk-mcp-caret" />
      </div>
      <div className="mk-mcp-card">
        <span className="mk-mcp-cover" />
        <div className="mk-mcp-meta">
          <span className="mk-mcp-l1" />
          <span className="mk-mcp-l2" />
        </div>
        <span className="mk-mcp-check">✓ Created</span>
      </div>
      <div className="mk-mcp-foot">Claude · ChatGPT · Cursor · your AI</div>
    </SceneFrame>
  );
}

/* ─── The marketing scroll ───
   Takes a creator who already throws events from "what is this" to
   "get started", mirroring the real platform: signals that come find you,
   one identity across channels, the WhatsApp window, drafts in your voice.
   Brand-soul kept: light canvas, pink accent, the eyes, pixel cursor,
   trust marquee. */
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
          <p className="mk-eyebrow">The event platform for creators</p>
        </Reveal>
        <Reveal delay={0.12}>
          <h1 className="mk-hero-h">
            Where your followers<br />
            <span className="pink">become your people.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.18}>
          <p className="mk-hero-sub">
            PullUp is the bridge between your online world and your real one.
            Your events bring people together — and PullUp keeps every one of
            them, across Instagram, WhatsApp and real life, long after the
            night's over.
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

      {/* ─── 1 · THE ROOM (exclusive drops + who's in it) ─── */}
      <section className="mk-section">
        <Reveal><Chapter n="01" label="The Room" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            Some things are only for the people <span className="pink">who showed up.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            The Room is everyone who's ever pulled up — kept long after the
            night's over — and the place you share what no one else gets. Drop
            the unreleased track, the photos from the night, the early product,
            the next invite before it's public. The stuff that never touches
            your grid lives here, just for them.
          </p>
        </Reveal>
        <RoomDropScene />
        <Reveal delay={0.1}>
          <p className="mk-creed">
            Showing up is the password. <span className="pink">What's inside is the reward.</span>
          </p>
        </Reveal>
      </section>

      {/* ─── 2 · EVERY PERSON, IN FULL (thread + draft) ─── */}
      <section className="mk-section mk-section-tint">
        <Reveal><Chapter n="02" label="Every person, in full" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            Tap anyone. See the whole story.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            One tap opens a person's entire history with you — every night they
            came, every message, across Instagram, WhatsApp and email, stitched
            into one thread. And when they need a reply, PullUp drafts it in your
            voice, ready the moment you are.
          </p>
        </Reveal>
        <ThreadScene />
        <Reveal delay={0.1}>
          <p className="mk-creed">
            It drafts. <span className="pink">You send.</span>
          </p>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="mk-aside">
            PullUp amplifies care that already exists. It never manufactures
            care that doesn't. The warmth is yours — it just makes sure you
            never drop it. And it only sends when you say so.
          </p>
        </Reveal>
      </section>

      {/* ─── 3 · FILL THE ROOM (INBOUND) ─── */}
      <section className="mk-section">
        <Reveal><Chapter n="03" label="Fill the room" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            A comment on your reel becomes a guest at your door.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            Someone comments asking to get in — PullUp slides into their DMs
            with your sign-up link, then lands the confirmation on WhatsApp,
            where people actually open and reply. The whole funnel, from hype to
            RSVP, without you lifting a finger.
          </p>
        </Reveal>
        <InboundScene />
      </section>

      {/* ─── 5 · RUN IT FROM YOUR AI ─── */}
      <section className="mk-section mk-section-tint">
        <Reveal><Chapter n="05" label="No new app to learn" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            Or just tell your AI to do it.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            PullUp plugs into Claude, ChatGPT, Cursor — any AI that speaks MCP.
            Spin up an event, pull a person's whole history, draft the
            follow-ups, all in a sentence. The platform, run from wherever you
            already think out loud.
          </p>
        </Reveal>
        <McpScene />
      </section>

      {/* ─── 7 · YOUR PEOPLE STAY YOURS ─── */}
      <section className="mk-section mk-section-tint">
        <Reveal><Chapter n="06" label="Yours" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            Your people are yours. Full stop.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            We don't sell contacts. We don't market to your audience behind your
            back. Your memories live in your own cloud — PullUp is the thread
            that renders them, not the landlord that owns them. Your people only
            ever hear from one person: you.
          </p>
        </Reveal>
      </section>

      {/* ─── 8 · PROOF ─── */}
      <section className="mk-section mk-section-proof">
        <Reveal>
          <p className="mk-proof-label">The rooms already run on PullUp</p>
        </Reveal>
      </section>
      <LogoMarquee />

      {/* ─── 9 · FINAL CTA ─── */}
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
            We're early, and that's on purpose — we're taking on one creator at
            a time, and doing it properly. Pull up.
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

  /* ════════ SCENES (animated platform mocks) ════════ */
  .mk-scene {
    margin: 40px 0 4px;
    position: relative;
  }
  .mk-creed {
    margin: 36px 0 0;
    font-size: clamp(24px, 4vw, 38px);
    font-weight: 800; letter-spacing: -0.03em;
  }

  /* cross-channel identity chip */
  .mk-chchip {
    flex: 0 0 auto;
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 7px;
    font-size: 10.5px; font-weight: 800; letter-spacing: -0.01em;
  }

  /* ─── 1 · the room (real people, kept across every night) ─── */
  .mk-room {
    max-width: 620px;
    border-radius: 22px; overflow: hidden;
    background: #fff; border: 1px solid rgba(10,10,10,0.1);
    box-shadow: 0 36px 80px -44px rgba(10,10,10,0.45);
  }
  .mk-room-head {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 18px 20px 14px;
  }
  .mk-room-title { font-size: 16px; font-weight: 800; letter-spacing: -0.01em; }
  .mk-room-stats { display: flex; align-items: center; gap: 16px; font-size: 13px; color: rgba(10,10,10,0.5); }
  .mk-room-stats strong { color: ${INK}; font-weight: 800; }
  .mk-room-need-stat strong { color: ${PINK}; }
  .mk-room-axis {
    display: flex; align-items: center; gap: 12px;
    padding: 0 20px 14px; font-size: 10.5px; letter-spacing: 0.02em;
    color: rgba(10,10,10,0.38); white-space: nowrap;
  }
  .mk-room-axis-line {
    flex: 1; height: 1px;
    background: repeating-linear-gradient(90deg, rgba(10,10,10,0.18) 0 4px, transparent 4px 9px);
  }
  .mk-room-rows { padding: 4px; border-top: 1px solid rgba(10,10,10,0.07); }
  .mk-rp {
    display: flex; align-items: center; gap: 14px;
    padding: 12px 14px; border-radius: 13px;
    opacity: 0; transform: translateY(8px);
  }
  .mk-in .mk-rp { animation: mk-msgin 0.45s ease forwards; animation-delay: calc(var(--i) * 0.12s + 0.15s); }
  .mk-rp-av {
    flex: 0 0 auto; width: 42px; height: 42px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 14px; font-weight: 800;
  }
  .mk-rp-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .mk-rp-name { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; }
  .mk-rp-need {
    font-size: 10px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
    color: ${PINK}; background: rgba(236,23,143,0.1);
    padding: 2px 8px; border-radius: 999px;
  }
  .mk-rp-rel { font-size: 13px; color: rgba(10,10,10,0.52); line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mk-arc { flex: 0 0 auto; display: inline-flex; gap: 6px; align-items: center; }
  .mk-arc-dot {
    width: 9px; height: 9px; border-radius: 999px;
    background: rgba(10,10,10,0.1);
  }
  .mk-arc-dot.on { background: ${PINK}; box-shadow: 0 0 0 3px rgba(236,23,143,0.1); }
  @media (max-width: 540px) {
    .mk-rp-rel { white-space: normal; }
    .mk-room-axis span:not(.mk-room-axis-line) { font-size: 9.5px; }
  }

  /* ─── 2 · inside the room (exclusive drops) ─── */
  .mk-drop {
    max-width: 620px;
    border-radius: 22px; overflow: hidden;
    background: #fff; border: 1px solid rgba(10,10,10,0.1);
    box-shadow: 0 36px 80px -44px rgba(236,23,143,0.4);
  }
  .mk-drop-head {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 16px 18px; border-bottom: 1px solid rgba(10,10,10,0.07);
  }
  .mk-drop-title { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
  .mk-drop-lock {
    font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
    color: ${PINK}; background: rgba(236,23,143,0.1);
    padding: 5px 11px; border-radius: 999px;
  }
  .mk-drop-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    padding: 16px;
  }
  @media (max-width: 480px) { .mk-drop-grid { grid-template-columns: 1fr; } }
  .mk-tile {
    display: flex; flex-direction: column; gap: 9px;
    opacity: 0; transform: translateY(10px) scale(0.97);
  }
  .mk-in .mk-tile { animation: mk-tilein 0.5s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay: calc(var(--i) * 0.12s + 0.15s); }
  @keyframes mk-tilein { to { opacity: 1; transform: none; } }
  .mk-tile-label { font-size: 12.5px; font-weight: 600; color: rgba(10,10,10,0.6); }
  .mk-tile-music, .mk-tile-photos, .mk-tile-drop, .mk-tile-invite {
    height: 96px; border-radius: 14px; overflow: hidden;
    display: flex; align-items: center; justify-content: center; position: relative;
  }
  /* music */
  .mk-tile-music { background: #0d0d0f; gap: 12px; }
  .mk-tile-play {
    width: 0; height: 0; flex: 0 0 auto;
    border-left: 14px solid #fff; border-top: 9px solid transparent; border-bottom: 9px solid transparent;
    margin-left: 4px;
  }
  .mk-wave { display: inline-flex; align-items: center; gap: 3px; height: 40px; }
  .mk-wave span {
    width: 3px; border-radius: 2px;
    background: linear-gradient(180deg, #ff8a4c, ${PINK});
    height: 30%;
  }
  .mk-in .mk-wave span { animation: mk-eq 1.1s ease-in-out infinite; animation-delay: calc(var(--b) * -0.09s); }
  @keyframes mk-eq { 0%,100% { height: 22%; } 50% { height: 92%; } }
  /* photos */
  .mk-tile-photos { background: rgba(10,10,10,0.04); }
  .mk-tile-photos span {
    position: absolute; width: 46px; height: 58px; border-radius: 8px;
    box-shadow: 0 6px 16px -6px rgba(10,10,10,0.45); border: 2px solid #fff;
  }
  .mk-tile-photos span:nth-child(1) { transform: rotate(-9deg) translateX(-26px); }
  .mk-tile-photos span:nth-child(2) { transform: rotate(0deg) translateY(-3px); z-index: 2; }
  .mk-tile-photos span:nth-child(3) { transform: rotate(9deg) translateX(26px); }
  /* product drop */
  .mk-tile-drop { background: rgba(10,10,10,0.04); flex-direction: column; gap: 8px; }
  .mk-tile-swatch {
    width: 44px; height: 44px; border-radius: 10px;
    background: linear-gradient(150deg, #fbbf24, #f97316 60%, #b91c1c);
    box-shadow: 0 8px 18px -8px rgba(185,28,28,0.6);
  }
  .mk-tile-pill {
    font-size: 10.5px; font-weight: 800; color: #fff; background: ${PINK};
    padding: 4px 10px; border-radius: 999px;
  }
  /* invite */
  .mk-tile-invite { background: linear-gradient(150deg, rgba(236,23,143,0.14), rgba(123,47,247,0.12)); flex-direction: column; gap: 2px; }
  .mk-tile-invite-eyes { font-size: 22px; font-weight: 900; letter-spacing: -0.03em; color: ${INK}; }
  .mk-tile-invite-note { font-size: 12px; font-weight: 700; color: ${PINK}; }

  /* ─── 3 · thread + draft ─── */
  .mk-thread {
    max-width: 560px;
    border-radius: 22px; overflow: hidden;
    background: #fff; border: 1px solid rgba(10,10,10,0.1);
    box-shadow: 0 36px 80px -44px rgba(10,10,10,0.5);
  }
  .mk-thread-head {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 18px; border-bottom: 1px solid rgba(10,10,10,0.07);
  }
  .mk-thread-av {
    flex: 0 0 auto; width: 40px; height: 40px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 14px; font-weight: 800;
  }
  .mk-thread-who { display: flex; flex-direction: column; min-width: 0; }
  .mk-thread-name { font-size: 15px; font-weight: 800; }
  .mk-thread-sub { font-size: 12px; color: rgba(10,10,10,0.5); }
  .mk-window {
    margin-left: auto; flex: 0 0 auto;
    font-size: 11px; font-weight: 700; color: #0a7d54;
    background: #e7f9ee; border: 1px solid rgba(37,211,102,0.3);
    padding: 5px 10px; border-radius: 999px;
  }
  @media (max-width: 480px) { .mk-window { font-size: 10px; padding: 4px 8px; } }
  .mk-thread-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
  .mk-msg { display: flex; align-items: flex-end; gap: 8px; max-width: 86%; opacity: 0; transform: translateY(8px); }
  .mk-in .mk-msg { animation: mk-msgin 0.45s ease forwards; animation-delay: calc(var(--i) * 0.5s + 0.2s); }
  @keyframes mk-msgin { to { opacity: 1; transform: translateY(0); } }
  .mk-msg-you { align-self: flex-end; flex-direction: row-reverse; }
  .mk-msg-bub {
    padding: 10px 14px; border-radius: 16px;
    font-size: 14px; line-height: 1.4;
    background: rgba(10,10,10,0.05); color: ${INK};
  }
  .mk-msg-you .mk-msg-bub { background: ${PINK}; color: #fff; border-bottom-right-radius: 5px; }
  .mk-msg-them .mk-msg-bub, .mk-msg-sys .mk-msg-bub { border-bottom-left-radius: 5px; }
  .mk-msg-sys .mk-msg-bub {
    background: transparent; border: 1px dashed rgba(10,10,10,0.2);
    color: rgba(10,10,10,0.55); font-size: 13px;
  }
  .mk-draft {
    margin: 4px 14px 18px; padding: 16px 18px;
    border-radius: 16px;
    background: linear-gradient(180deg, rgba(236,23,143,0.05), rgba(236,23,143,0.02));
    border: 1px solid rgba(236,23,143,0.25);
    opacity: 0; transform: translateY(10px);
  }
  .mk-in .mk-draft { animation: mk-msgin 0.5s ease 2.4s forwards; }
  .mk-draft-tag {
    display: inline-block; margin-bottom: 9px;
    font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase;
    color: ${PINK}; font-weight: 800;
  }
  .mk-draft-text { margin: 0 0 14px; font-size: 14px; line-height: 1.5; color: rgba(10,10,10,0.8); font-style: italic; }
  .mk-draft-actions { display: flex; align-items: center; gap: 9px; }
  .mk-draft-send { padding: 9px 18px; border-radius: 999px; background: ${PINK}; color: #fff; font-size: 13px; font-weight: 700; }
  .mk-draft-edit, .mk-draft-skip { padding: 9px 12px; font-size: 13px; font-weight: 500; color: rgba(10,10,10,0.5); }

  /* ─── 5 · inbound (comment → DM → WhatsApp) ─── */
  .mk-inbound { display: flex; flex-direction: column; align-items: center; gap: 9px; max-width: 420px; margin-left: auto; margin-right: auto; }
  .mk-in-comment, .mk-in-dm, .mk-in-wa {
    display: flex; align-items: center; gap: 9px;
    padding: 11px 15px; border-radius: 15px; font-size: 14px;
    background: #fff; border: 1px solid rgba(10,10,10,0.1);
    box-shadow: 0 8px 22px -14px rgba(10,10,10,0.3);
    opacity: 0;
  }
  .mk-in-comment { align-self: flex-start; transform: translateX(-12px); }
  .mk-in .mk-in-comment { animation: mk-slidein 0.45s ease 0.2s forwards; }
  .mk-in-dm { align-self: flex-end; transform: translateX(12px); border-color: rgba(214,36,159,0.3); }
  .mk-in .mk-in-dm { animation: mk-in-r 0.45s ease 1.1s forwards; }
  @keyframes mk-in-r { to { opacity: 1; transform: translateX(0); } }
  .mk-in-pill { background: #d6249f; color: #fff; font-size: 11px; font-weight: 800; padding: 5px 11px; border-radius: 999px; }
  .mk-in-wa { align-self: flex-start; transform: translateX(-12px); background: #e7f9ee; border-color: rgba(37,211,102,0.3); color: #0a5c3d; font-weight: 600; }
  .mk-in .mk-in-wa { animation: mk-slidein 0.45s ease 2s forwards; }
  .mk-in-arrow { font-size: 11.5px; font-weight: 700; color: rgba(10,10,10,0.4); opacity: 0; }
  .mk-in .mk-in-arrow { animation: mk-fade 0.4s ease 0.8s forwards; }
  .mk-in .mk-in-arrow-2 { animation-delay: 1.7s; }
  @keyframes mk-fade { to { opacity: 1; } }

  /* ─── 6 · mcp terminal ─── */
  .mk-mcp { display: flex; flex-direction: column; gap: 12px; max-width: 460px; }
  .mk-mcp-prompt {
    display: flex; align-items: center; gap: 9px;
    background: #fff; border: 1px solid rgba(10,10,10,0.12);
    border-radius: 13px; padding: 13px 15px;
    font-size: 14px; color: ${INK}; box-shadow: 0 4px 14px -8px rgba(10,10,10,0.25);
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  .mk-mcp-pdot { width: 8px; height: 8px; border-radius: 999px; background: ${PINK}; flex: 0 0 auto; }
  .mk-mcp-typed { white-space: nowrap; overflow: hidden; display: inline-block; max-width: 0; }
  .mk-in .mk-mcp-typed { animation: mk-type 1.6s steps(40) 0.3s forwards; }
  @keyframes mk-type { to { max-width: 360px; } }
  .mk-mcp-caret { width: 2px; height: 16px; background: ${INK}; animation: mk-blink 1s step-end infinite; }
  .mk-mcp-card {
    display: flex; align-items: center; gap: 12px;
    background: #fff; border: 1px solid rgba(10,10,10,0.12);
    border-radius: 14px; padding: 13px; box-shadow: 0 12px 30px -18px rgba(10,10,10,0.4);
    opacity: 0; transform: translateY(10px); position: relative;
  }
  .mk-in .mk-mcp-card { animation: mk-msgin 0.5s ease 2.1s forwards; }
  .mk-mcp-cover { width: 50px; height: 50px; border-radius: 10px; flex: 0 0 auto; background: linear-gradient(150deg, #ff8a4c, #ec178f 62%, #7b2ff7); }
  .mk-mcp-meta { flex: 1; display: flex; flex-direction: column; gap: 7px; }
  .mk-mcp-l1 { height: 9px; width: 72%; border-radius: 4px; background: rgba(10,10,10,0.16); }
  .mk-mcp-l2 { height: 8px; width: 42%; border-radius: 4px; background: rgba(10,10,10,0.1); }
  .mk-mcp-check { font-size: 12px; font-weight: 800; color: #16a34a; flex: 0 0 auto; }
  .mk-mcp-foot { text-align: center; font-size: 12px; font-weight: 600; color: rgba(10,10,10,0.4); }
  @keyframes mk-blink { 50% { opacity: 0; } }

  @media (prefers-reduced-motion: reduce) {
    .mk-scene *,
    .mk-scene .mk-mcp-typed {
      opacity: 1 !important; transform: none !important;
      max-width: none !important; height: auto !important; animation: none !important;
    }
    .mk-mcp-l1 { height: 9px !important; }
    .mk-mcp-l2 { height: 8px !important; }
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
