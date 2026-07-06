import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ArrowRight, ArrowLeft, Instagram, Music2, Twitter, Youtube, Linkedin, Globe, X, FolderPlus, Check,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { AuthCard } from "../AuthCard";
import { authenticatedFetch } from "../../lib/api.js";
import { trackEvent, getVisitorId } from "../../lib/analytics.js";

// ════════════════════════════════════════════════════════════════════════
// AuthGate — THE one door. The single auth surface for the entire system.
//
// A blocking popup modal that holds BOTH sides of getting in: "log in" and
// "create account" (the full onboarding flow), with an in-modal switch
// between them. It carries its own styles so it works ANYWHERE — the landing
// page, an in-app wall (no session on a gated route), the event Room's door,
// the publish gate. There is no other login/onboarding component; this is it.
//
// Props:
//   initialMode  – "login" | "onboarding" (default "login"). Seeds the view;
//                  the in-modal links flip it after that.
//   redirectTo   – where a successful login lands (default "/room"). Ignored
//                  when `onAuthed` is given.
//   onDismiss    – when provided, the modal is DISMISSABLE (backdrop click,
//                  Esc, and the panel "Back" affordance all call it). When
//                  ABSENT, the modal is blocking — signing in is the only way
//                  out. In-app walls pass nothing; the landing/publish pass a
//                  closer.
//   onAuthed     – optional. Called once auth succeeds, INSTEAD of navigating
//                  (used by the publish flow to resume where it left off).
// ════════════════════════════════════════════════════════════════════════

const PINK = "#EC178F";
const INK = "#0a0a0a";

// ─── Onboarding draft persistence ───
const DRAFT_KEY = "pullup_onboarding_draft";
const EMPTY_DRAFT = { name: "", city: "", brand: "", socials: {}, storage: "", resumeStep: 0 };
const ONBOARDING_TOTAL_STEPS = 6;
const ONBOARDING_STEP_AUTH = 5;

const ONB_CHANNELS = [
  { key: "instagram", label: "Instagram", icon: Instagram, ph: "yourhandle" },
  { key: "tiktok", label: "TikTok", icon: Music2, ph: "yourhandle" },
  { key: "x", label: "X", icon: Twitter, ph: "yourhandle" },
  { key: "youtube", label: "YouTube", icon: Youtube, ph: "channel link" },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, ph: "profile link" },
  { key: "website", label: "Website", icon: Globe, ph: "yoursite.com" },
];

const ONB_STORAGE = [
  { key: "gdrive", label: "Google Drive", desc: "A “PullUp” folder in your Drive", color: "#1a9b6c" },
  { key: "dropbox", label: "Dropbox", desc: "A “PullUp” folder in Dropbox", color: "#0061ff" },
  { key: "icloud", label: "iCloud Drive", desc: "A “PullUp” folder in iCloud", color: "#3b9cf0" },
  { key: "onedrive", label: "OneDrive", desc: "A “PullUp” folder in OneDrive", color: "#0a66c2" },
  { key: "other", label: "Somewhere else", desc: "Tell us where later", color: "#6b6b6b" },
];

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
export function resolveNext(params, fallback = "/room") {
  const raw = params?.get?.("next");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

/* ─── Login panel ───
   Light AuthCard. Once a session resolves, hands off to onAuthed (publish
   resume) or routes to `redirectTo`. */
function LoginPanel({ redirectTo, onAuthed, onDismiss, onSwitchToOnboarding, onSignupIntent }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  // When a signup-intent handler is present (the landing), login is for
  // existing accounts ONLY — new people go through /start (plan + payment +
  // account in one flow), so both the "New here?" link and an unknown email
  // hand over to the signup intent instead of a dead-end code screen.
  const waitlistMode = typeof onSignupIntent === "function";

  const complete = useCallback(() => {
    if (onAuthed) onAuthed();
    else navigate(redirectTo, { replace: true });
  }, [onAuthed, navigate, redirectTo]);

  useEffect(() => {
    if (user) complete();
  }, [user, complete]);

  return (
    <div className="auth-panel">
      <div className="auth-panel-topbar">
        {onDismiss ? (
          <button type="button" className="auth-back" onClick={onDismiss} aria-label="Close">
            <ArrowLeft size={16} />
            Back
          </button>
        ) : <span />}
        <button
          type="button"
          className="auth-link-small auth-link-btn"
          onClick={waitlistMode ? () => onSignupIntent() : onSwitchToOnboarding}
        >
          New here? <strong>{waitlistMode ? "Create account" : "Get started"}</strong>
        </button>
      </div>
      <div className="auth-card-wrap">
        <p className="auth-kicker">Welcome back</p>
        <h2 className="auth-title">
          Step back into <span className="pink">pullup</span>.
        </h2>
        <AuthCard
          theme="light"
          redirectTo={redirectTo}
          submitLabel="Log in"
          trackingPrefix="login"
          showForgotPassword
          loginOnly={waitlistMode}
          onNoAccount={waitlistMode ? (email) => onSignupIntent(email) : undefined}
          onSuccess={complete}
        />
      </div>
    </div>
  );
}

/* ─── Onboarding panel ───
   Six-step flow (name → city → brand → socials → storage → auth). Draft
   persists in localStorage so an interrupted flow (incl. the Google OAuth
   round-trip) resumes on the right step. finalize() flushes the draft to the
   profile BEFORE handing off. */
function OnboardingPanel({ onAuthed, onDismiss, onSwitchToLogin }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => readDraft() || { ...EMPTY_DRAFT });
  const [finalizing, setFinalizing] = useState(false);
  const finalizingRef = useRef(false);

  useEffect(() => {
    writeDraft({ ...draft, resumeStep: step });
  }, [draft, step]);

  useEffect(() => {
    trackEvent("onboarding_step_view", { step });
  }, [step]);

  // On mount, resume an in-flight draft on the right step (e.g. a user who
  // bounced through the Google OAuth round-trip mid-flow).
  useEffect(() => {
    const existing = readDraft();
    if (existing && typeof existing.resumeStep === "number" && existing.resumeStep > 0) {
      setStep(Math.min(existing.resumeStep, ONBOARDING_STEP_AUTH));
    }
  }, []);

  const finalize = useCallback(async () => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    setFinalizing(true);
    try {
      const pendingFlag = sessionStorage.getItem("pullup_signin_pending") === "1";
      sessionStorage.removeItem("pullup_signin_pending");
      trackEvent("signed_in", { via: pendingFlag ? "google" : "email" });

      // CRITICAL GUARD: this flow can be entered by an ALREADY-established user
      // (e.g. "Get started" while signed in, or authenticating into an existing
      // account mid-onboarding). The onboarding draft must NEVER overwrite a
      // real profile. So read the profile first and only flush for a genuinely
      // new account (no name yet) — and even then, only send fields the user
      // actually filled, so a blank value can never blank out real data.
      let existing = null;
      try {
        const r = await authenticatedFetch("/host/profile");
        if (r.ok) existing = await r.json();
      } catch {
        /* network hiccup — fall through; the name-only guard below still holds */
      }
      const alreadyEstablished = !!(existing && String(existing.name || "").trim());

      if (!alreadyEstablished) {
        const stored = readDraft();
        const socials = stored?.socials || {};
        const brandingLinks = Object.fromEntries(
          Object.entries(socials).filter(([, v]) => v && String(v).trim()),
        );
        const payload = { visitorId: getVisitorId() || null };
        if (stored?.name && stored.name.trim()) payload.name = stored.name.trim();
        if (stored?.city && stored.city.trim()) payload.city = stored.city.trim();
        if (stored?.brand && stored.brand.trim()) payload.brand = stored.brand.trim();
        if (Object.keys(brandingLinks).length) payload.brandingLinks = brandingLinks;
        // No real name → no flush. Onboarding never writes a nameless profile.
        if (payload.name) {
          try {
            await authenticatedFetch("/host/profile", {
              method: "PUT",
              body: JSON.stringify(payload),
            });
          } catch (err) {
            console.error("Failed to save onboarding profile:", err);
          }
        }
      }
    } finally {
      clearDraft();
      if (onAuthed) onAuthed();
      else navigate("/room", { replace: true });
    }
  }, [navigate, onAuthed]);

  useEffect(() => {
    // Only finalize at the auth step. A user who is ALREADY signed in (an
    // RSVP-level account completing their profile to become a host) must walk
    // the profile steps first — without this guard, finalize would fire on
    // mount and skip the whole flow.
    if (user && step >= ONBOARDING_STEP_AUTH) finalize();
  }, [user, step, finalize]);

  const [shownSocials, setShownSocials] = useState(() => {
    const started = Object.keys(draft.socials || {}).filter((k) => draft.socials[k]);
    return Array.from(new Set(["instagram", ...started]));
  });

  const update = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const updateSocial = (key, val) =>
    setDraft((prev) => ({ ...prev, socials: { ...prev.socials, [key]: val } }));
  const addChannel = (key) => setShownSocials((s) => (s.includes(key) ? s : [...s, key]));
  const removeChannel = (key) => {
    setShownSocials((s) => s.filter((k) => k !== key));
    updateSocial(key, "");
  };

  const goNext = () => setStep((s) => Math.min(s + 1, ONBOARDING_STEP_AUTH));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));
  const canAdvance = step === 0 ? draft.name.trim().length > 1 : true;
  const remaining = ONB_CHANNELS.filter((c) => !shownSocials.includes(c.key));

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
        {step > 0 ? (
          <button type="button" className="auth-back" onClick={goBack} aria-label="Previous step">
            <ArrowLeft size={16} />
            Previous
          </button>
        ) : onDismiss ? (
          <button type="button" className="auth-back" onClick={onDismiss} aria-label="Close">
            <ArrowLeft size={16} />
            Back
          </button>
        ) : <span />}
        <div className="auth-step-dots" aria-hidden="true">
          {Array.from({ length: ONBOARDING_TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`auth-step-dot${i === step ? " is-current" : ""}${i < step ? " is-past" : ""}`}
            />
          ))}
        </div>
        <button type="button" className="auth-link-small auth-link-btn" onClick={onSwitchToLogin}>
          Already in? <strong>Log in</strong>
        </button>
      </div>

      <div className="auth-card-wrap">
        {step === 0 && (
          <>
            <p className="auth-kicker">Step 1 of 6 · You</p>
            <h2 className="auth-title">
              What should we <span className="pink">call you</span>?
            </h2>
            <p className="auth-sub">
              How you show up on invites, event pages and your room.
            </p>
            <input
              className="auth-input"
              type="text"
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Your full name"
            />
          </>
        )}

        {step === 1 && (
          <>
            <p className="auth-kicker">Step 2 of 6 · Where</p>
            <h2 className="auth-title">
              Where are you <span className="pink">based</span>?
            </h2>
            <p className="auth-sub">
              Your home base helps put your events on the map and surface the
              people near you. Skip if you'd rather not say.
            </p>
            <input
              className="auth-input"
              type="text"
              value={draft.city}
              onChange={(e) => update({ city: e.target.value })}
              placeholder="Your city"
            />
          </>
        )}

        {step === 2 && (
          <>
            <p className="auth-kicker">Step 3 of 6 · Your brand</p>
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
            />
          </>
        )}

        {step === 3 && (
          <>
            <p className="auth-kicker">Step 4 of 6 · Channels</p>
            <h2 className="auth-title">
              Where can people <span className="pink">find you</span>?
            </h2>
            <p className="auth-sub">
              Link your socials so every event page points back to you. Instagram's
              a great start — add as many as you like.
            </p>
            <div className="onb-socials">
              {shownSocials.map((key) => {
                const ch = ONB_CHANNELS.find((c) => c.key === key);
                if (!ch) return null;
                const Icon = ch.icon;
                return (
                  <div className="onb-social-row" key={key}>
                    <span className="onb-social-ic"><Icon size={17} /></span>
                    <input
                      className="auth-input onb-social-input"
                      type="text"
                      value={draft.socials[key] || ""}
                      onChange={(e) => updateSocial(key, e.target.value)}
                      placeholder={ch.ph}
                      aria-label={ch.label}
                    />
                    {key !== "instagram" && (
                      <button
                        type="button"
                        className="onb-social-remove"
                        onClick={() => removeChannel(key)}
                        aria-label={`Remove ${ch.label}`}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {remaining.length > 0 && (
              <div className="onb-add-row">
                <span className="onb-add-label">Add</span>
                {remaining.map((ch) => {
                  const Icon = ch.icon;
                  return (
                    <button
                      type="button"
                      key={ch.key}
                      className="onb-add-chip"
                      onClick={() => addChannel(ch.key)}
                    >
                      <Icon size={14} /> {ch.label}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <p className="auth-kicker">Step 5 of 6 · Your storage</p>
            <h2 className="auth-title">
              Give your stuff a <span className="pink">home you own</span>.
            </h2>
            <p className="auth-sub">
              Your photos, recaps and files live in your own cloud — PullUp just
              renders them in the room. Pick where your “PullUp” folder should go.
            </p>
            <div className="onb-storage-list">
              {ONB_STORAGE.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`onb-storage${draft.storage === s.key ? " is-on" : ""}`}
                  onClick={() => update({ storage: draft.storage === s.key ? "" : s.key })}
                >
                  <span
                    className="onb-storage-ic"
                    style={{ background: `${s.color}1a`, color: s.color }}
                  >
                    <FolderPlus size={18} />
                  </span>
                  <span className="onb-storage-txt">
                    <span className="onb-storage-t">{s.label}</span>
                    <span className="onb-storage-d">{s.desc}</span>
                  </span>
                  <span className="onb-storage-check">
                    {draft.storage === s.key ? <Check size={18} /> : null}
                  </span>
                </button>
              ))}
            </div>
            <p className="onb-note">
              Cloud sync is rolling out — pick your home now and you'll be first
              to get your PullUp folder. Your files never leave your control.
            </p>
          </>
        )}

        {step === ONBOARDING_STEP_AUTH && (
          <>
            <p className="auth-kicker">Step 6 of 6 · Claim it</p>
            <h2 className="auth-title">
              {draft.name ? `Welcome, ${draft.name.split(" ")[0]}.` : "Almost there."}
            </h2>
            <p className="auth-sub">Sign in to lock everything in. Google is fastest.</p>
            <AuthCard
              theme="light"
              redirectTo="/start"
              submitLabel="Create my account"
              trackingPrefix="onboarding"
              funnelTrack
              onSuccess={finalize}
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

/* ─── AuthGate — the modal shell + mode switch ─── */
export function AuthGate({ initialMode = "login", redirectTo = "/room", onDismiss, onAuthed, onSignupIntent }) {
  const [mode, setMode] = useState(initialMode);

  // Keep the view in sync if the caller changes initialMode (e.g. the landing
  // URL flips /login ↔ /start).
  useEffect(() => { setMode(initialMode); }, [initialMode]);

  // Esc closes only when dismissable.
  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (e) => { if (e.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      className="auth-modal-backdrop"
      onClick={onDismiss ? onDismiss : undefined}
    >
      <style>{AUTH_STYLES}</style>
      <div
        className="auth-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "login" ? "Log in" : "Get started"}
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "login" ? (
          <LoginPanel
            redirectTo={redirectTo}
            onAuthed={onAuthed}
            onDismiss={onDismiss}
            onSwitchToOnboarding={() => setMode("onboarding")}
            onSignupIntent={onSignupIntent}
          />
        ) : (
          <OnboardingPanel
            onAuthed={onAuthed}
            onDismiss={onDismiss}
            onSwitchToLogin={() => setMode("login")}
          />
        )}
      </div>
    </div>
  );
}

// All auth styling travels with the component so the one door works on the
// landing page AND on any in-app wall (the landing no longer owns this CSS).
const AUTH_STYLES = `
  .auth-modal-backdrop {
    position: fixed; inset: 0; z-index: 200;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    background: rgba(10,10,12,0.5);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    overscroll-behavior: contain;
    animation: auth-fade 0.25s ease;
  }
  .auth-modal-card {
    position: relative;
    display: flex; flex-direction: column;
    width: 100%; max-width: 460px;
    max-height: calc(100dvh - 48px); overflow: hidden;
    background: #fff;
    border: 1px solid rgba(10,10,10,0.08);
    border-radius: 24px;
    box-shadow: 0 30px 80px -16px rgba(10,10,10,0.4);
    padding: 28px clamp(20px, 5vw, 32px);
    box-sizing: border-box;
    animation: auth-pop 0.32s cubic-bezier(0.16,1,0.3,1);
  }
  @keyframes auth-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes auth-pop {
    from { opacity: 0; transform: translateY(10px) scale(0.97); }
    to   { opacity: 1; transform: none; }
  }
  @media (max-width: 560px) {
    .auth-modal-backdrop { align-items: flex-end; padding: 0; }
    .auth-modal-card {
      max-width: none; max-height: 94dvh;
      border-radius: 22px 22px 0 0;
      padding: 18px 20px calc(16px + env(safe-area-inset-bottom));
      animation: auth-sheet 0.36s cubic-bezier(0.16,1,0.3,1);
    }
  }
  @keyframes auth-sheet { from { transform: translateY(100%); } to { transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    .auth-modal-backdrop, .auth-modal-card { animation: none; }
  }

  .auth-panel {
    width: 100%; max-width: 460px;
    flex: 1 1 auto; min-height: 0;
    display: flex; flex-direction: column;
    color: ${INK}; text-align: left;
  }
  .auth-panel-topbar {
    flex: 0 0 auto;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding-bottom: 18px;
  }
  .auth-back {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: 999px;
    border: 1px solid rgba(10,10,10,0.12); background: transparent;
    color: ${INK}; font-family: inherit; font-size: 13px; font-weight: 500;
    cursor: pointer; transition: background 0.18s, border-color 0.18s;
  }
  .auth-back:hover { background: rgba(10,10,10,0.04); border-color: rgba(10,10,10,0.22); }
  .auth-link-small { font-size: 12px; color: rgba(10,10,10,0.55); text-decoration: none; letter-spacing: 0.02em; }
  .auth-link-small strong { color: ${PINK}; font-weight: 600; }
  .auth-link-btn { background: none; border: none; cursor: pointer; font-family: inherit; padding: 0; }
  .auth-step-dots { display: flex; gap: 6px; align-items: center; }
  .auth-step-dot {
    height: 4px; width: 14px; border-radius: 2px; background: rgba(10,10,10,0.14);
    transition: all 0.4s cubic-bezier(0.16,1,0.3,1);
  }
  .auth-step-dot.is-past    { background: rgba(10,10,10,0.45); }
  .auth-step-dot.is-current { background: ${PINK}; width: 28px; }
  .auth-card-wrap {
    flex: 1 1 auto; min-height: 0;
    overflow-y: auto; -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    display: flex; flex-direction: column; gap: 16px;
    /* breathing room so the last option never hides under the pinned footer */
    padding-bottom: 4px;
  }
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
  .auth-actions {
    flex: 0 0 auto;
    display: flex; gap: 12px; align-items: center; justify-content: flex-end;
    padding-top: 16px; margin-top: 4px;
    border-top: 1px solid rgba(10,10,10,0.07);
  }
  .auth-continue { flex: 0 0 auto; }
  .auth-skip { padding: 10px 16px; border-radius: 999px; background: transparent; border: none; color: rgba(10,10,10,0.55); font-family: inherit; font-size: 13px; cursor: pointer; }
  .auth-continue {
    display: inline-flex; align-items: center; gap: 8px; padding: 12px 22px;
    border-radius: 999px; border: none; background: ${PINK}; color: #fff;
    font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer;
    transition: opacity 0.18s, transform 0.18s;
  }
  .auth-continue:hover { transform: translateY(-1px); }
  .auth-continue:disabled { background: rgba(10,10,10,0.08); color: rgba(10,10,10,0.4); transform: none; cursor: default; }
  .auth-finalizing { text-align: center; padding: 60px 20px; font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(10,10,10,0.55); }

  .onb-socials { display: flex; flex-direction: column; gap: 10px; }
  .onb-social-row { display: flex; align-items: center; gap: 10px; }
  .onb-social-ic {
    flex: 0 0 auto; width: 40px; height: 40px; border-radius: 11px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(236,23,143,0.08); color: ${PINK};
  }
  .onb-social-input { flex: 1; min-width: 0; }
  .onb-social-remove {
    flex: 0 0 auto; width: 32px; height: 32px; border-radius: 999px;
    border: none; background: transparent; color: rgba(10,10,10,0.4); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .onb-social-remove:hover { background: rgba(10,10,10,0.06); color: ${INK}; }
  .onb-add-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 4px; }
  .onb-add-label { font-size: 12px; font-weight: 600; color: rgba(10,10,10,0.4); }
  .onb-add-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: 999px;
    border: 1px solid rgba(10,10,10,0.14); background: #fff; cursor: pointer;
    color: rgba(10,10,10,0.7); font: inherit; font-size: 13px; font-weight: 600;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .onb-add-chip:hover { border-color: ${PINK}; color: ${PINK}; background: rgba(236,23,143,0.04); }

  .onb-storage-list { display: flex; flex-direction: column; gap: 8px; }
  .onb-storage {
    display: flex; align-items: center; gap: 13px; width: 100%;
    padding: 12px 14px; border-radius: 14px; text-align: left; cursor: pointer;
    border: 1px solid rgba(10,10,10,0.14); background: #fff;
    font: inherit; transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
  }
  .onb-storage:hover { border-color: rgba(236,23,143,0.4); }
  .onb-storage.is-on {
    border-color: ${PINK}; background: rgba(236,23,143,0.04);
    box-shadow: 0 0 0 3px rgba(236,23,143,0.12);
  }
  .onb-storage-ic {
    flex: 0 0 auto; width: 40px; height: 40px; border-radius: 11px;
    display: flex; align-items: center; justify-content: center;
  }
  .onb-storage-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .onb-storage-t { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 800; color: ${INK}; }
  .onb-storage-d { font-size: 13px; color: rgba(10,10,10,0.55); }
  .onb-storage-check { flex: 0 0 auto; color: ${PINK}; display: flex; align-items: center; }
  .onb-note { margin: 0; font-size: 12.5px; line-height: 1.5; color: rgba(10,10,10,0.48); }
`;
