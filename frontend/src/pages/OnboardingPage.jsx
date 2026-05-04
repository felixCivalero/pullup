import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { trackEvent, getVisitorId } from "../lib/analytics.js";
import { colors } from "../theme/colors.js";
import { ParticleField } from "../components/ParticleField";
import { AuthCard } from "../components/AuthCard";

const DRAFT_KEY = "pullup_onboarding_draft";

const EMPTY_DRAFT = {
  name: "",
  brand: "",
  // Mid-flow checkpoint so a returning user resumes on the right screen.
  resumeStep: 0,
};

const TOTAL_STEPS = 3;

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

function writeDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {}
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    // Legacy keys from earlier flow versions — clean up so old drafts don't
    // shadow new ones across upgrades.
    localStorage.removeItem("pullup_onboarding_logo_b64");
  } catch {}
}

const inputStyle = {
  width: "100%",
  padding: "16px 18px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#fff",
  fontSize: 17,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const inputFocusGlow = {
  boxShadow: "0 0 0 3px rgba(251,191,36,0.10)",
  borderColor: "rgba(251,191,36,0.5)",
};

function FieldInput({ value, onChange, placeholder, type = "text", autoFocus, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputStyle,
        ...(focused ? inputFocusGlow : null),
      }}
      {...rest}
    />
  );
}

function StepDots({ current, total }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 4,
            width: i === current ? 28 : 14,
            borderRadius: 2,
            background:
              i < current
                ? colors.gradientGold
                : i === current
                ? colors.gradientGold
                : "rgba(255,255,255,0.10)",
            transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
            opacity: i <= current ? 1 : 0.6,
          }}
        />
      ))}
    </div>
  );
}

function StepFrame({ stepKey, kicker, headline, sub, children, footer, direction = 1 }) {
  // Cinematic in/out: previous content slides up & fades, new content
  // slides in from below.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, [stepKey]);

  return (
    <div
      key={stepKey}
      style={{
        position: "relative",
        zIndex: 2,
        width: "min(560px, 100%)",
        margin: "0 auto",
        padding: "0 24px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
        transform: mounted
          ? "translateY(0)"
          : `translateY(${direction > 0 ? 28 : -28}px)`,
        opacity: mounted ? 1 : 0,
        transition:
          "transform 0.55s cubic-bezier(0.16,1,0.3,1), opacity 0.45s ease",
      }}
    >
      {kicker && (
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.38)",
          }}
        >
          {kicker}
        </div>
      )}
      <h1
        style={{
          fontSize: "clamp(30px, 5.2vw, 44px)",
          lineHeight: 1.08,
          fontWeight: 700,
          margin: 0,
          letterSpacing: "-0.02em",
        }}
      >
        {headline}
      </h1>
      {sub && (
        <p
          style={{
            margin: 0,
            color: "rgba(255,255,255,0.55)",
            fontSize: 15,
            lineHeight: 1.5,
          }}
        >
          {sub}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
      {footer}
    </div>
  );
}

const STEP_AUTH = 2;

export function OnboardingPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [draft, setDraft] = useState(() => readDraft() || { ...EMPTY_DRAFT });
  const [finalizing, setFinalizing] = useState(false);
  const finalizingRef = useRef(false);

  // Persist every change to localStorage so an interrupted flow resumes.
  useEffect(() => {
    writeDraft({ ...draft, resumeStep: step });
  }, [draft, step]);

  // Funnel: fire one step-view event per landing so admin analytics can see
  // drop-off between screens. Whitelisted in lib/analytics.js so this POSTs
  // to /t/event in addition to gtag.
  useEffect(() => {
    trackEvent("onboarding_step_view", { step });
  }, [step]);

  // Resume mid-flow if a saved draft exists.
  useEffect(() => {
    const existing = readDraft();
    if (existing && typeof existing.resumeStep === "number" && existing.resumeStep > 0) {
      setStep(Math.min(existing.resumeStep, STEP_AUTH));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once we have a user (post-auth, including OAuth round-trip), flush draft
  // and route to /events. signed_in fires here (not in AuthCard) so both the
  // email path and the Google OAuth round-trip funnel through one place, and
  // login users — who never enter this component — don't fire it.
  const finalize = useCallback(async () => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    setFinalizing(true);
    try {
      const pendingFlag =
        sessionStorage.getItem("pullup_signin_pending") === "1";
      sessionStorage.removeItem("pullup_signin_pending");
      trackEvent("signed_in", { via: pendingFlag ? "google" : "email" });

      const stored = readDraft();
      // Always send visitorId on finalize — even if there's no draft. This
      // is what links the user's pre-signup landing page visits to their
      // new profile so the admin CRM can surface "took N visits before
      // they signed up" patterns.
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
    if (authLoading) return;
    if (!user) return;
    finalize();
  }, [user, authLoading, finalize]);

  // ─── field setters ───
  const update = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

  const goNext = () => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, STEP_AUTH));
  };
  const goBack = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  // Validation per step
  const canAdvance = useMemo(() => {
    if (step === 0) return draft.name.trim().length > 1;
    return true;
  }, [step, draft.name]);

  if (finalizing) {
    return (
      <div
        style={{
          height: "100dvh",
          background: colors.background,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        Setting up your space…
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100dvh",
        overflow: "hidden",
        background: colors.background,
        color: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ParticleField intensity={1.4} zIndex={0} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.65) 100%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Top bar — wordmark + step dots */}
      <div
        style={{
          position: "relative",
          zIndex: 3,
          padding: "20px 24px 4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <a
          href="/"
          style={{
            color: "#fff",
            textDecoration: "none",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              background: colors.gradientGold,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            pullup
          </span>
        </a>
        <StepDots current={step} total={TOTAL_STEPS} />
        <a
          href="/login"
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
            textDecoration: "none",
            letterSpacing: "0.04em",
          }}
        >
          Already in? <span style={{ color: "#fff" }}>Log in</span>
        </a>
      </div>

      {/* Step body */}
      <div
        style={{
          flex: 1,
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 0 88px",
        }}
      >
        {step === 0 && (
          <StepFrame
            stepKey="0"
            direction={direction}
            kicker="Step 1 of 3 · You"
            headline={
              <>
                What should we{" "}
                <span
                  style={{
                    background: colors.gradientGold,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  call you
                </span>
                ?
              </>
            }
            sub="Your name shows on invites and event pages."
          >
            <FieldInput
              value={draft.name}
              onChange={(v) => update({ name: v })}
              placeholder="Your full name"
              autoFocus
            />
          </StepFrame>
        )}

        {step === 1 && (
          <StepFrame
            stepKey="1"
            direction={direction}
            kicker="Step 2 of 3 · Your brand"
            headline="Have a brand or studio?"
            sub="If you host under a brand, drop the name. Skip if it's just you for now — you can add this later in settings."
          >
            <FieldInput
              value={draft.brand}
              onChange={(v) => update({ brand: v })}
              placeholder="Brand or studio name"
              autoFocus
            />
          </StepFrame>
        )}

        {step === STEP_AUTH && (
          <StepFrame
            stepKey="2"
            direction={direction}
            kicker="Step 3 of 3 · Claim it"
            headline={
              draft.name
                ? `Welcome, ${draft.name.split(" ")[0]}.`
                : "Almost there."
            }
            sub="Sign in to lock everything in. Google is fastest."
          >
            <AuthCard
              redirectTo="/start"
              submitLabel="Create my account"
              trackingPrefix="onboarding"
              funnelTrack
              onSuccess={() => finalize()}
            />
          </StepFrame>
        )}
      </div>

      {/* Footer actions — Back / Skip / Continue.
          Stays pinned across all steps so Back never moves. On the auth step
          AuthCard owns the primary action, so Skip + Continue hide; Back
          stays in the same spot for muscle memory. */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 5,
          padding: "16px 20px calc(16px + env(safe-area-inset-bottom))",
          background:
            "linear-gradient(180deg, rgba(5,4,10,0) 0%, rgba(5,4,10,0.85) 50%, rgba(5,4,10,1) 100%)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "min(560px, 100%)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0}
            style={{
              padding: "12px 16px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.02)",
              color: "rgba(255,255,255,0.7)",
              cursor: step === 0 ? "default" : "pointer",
              opacity: step === 0 ? 0.4 : 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
            }}
          >
            <ArrowLeft size={16} />
            Back
          </button>

          {step > 0 && step < STEP_AUTH && (
            <button
              type="button"
              onClick={() => {
                trackEvent("onboarding_skip", { from: step });
                goNext();
              }}
              style={{
                padding: "12px 16px",
                borderRadius: 999,
                border: "none",
                background: "transparent",
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Skip
            </button>
          )}

          <div style={{ flex: 1 }} />

          {step < STEP_AUTH && (
            <button
              type="button"
              onClick={() => {
                if (!canAdvance) return;
                trackEvent("onboarding_step_advance", { from: step });
                goNext();
              }}
              disabled={!canAdvance}
              style={{
                padding: "14px 22px",
                borderRadius: 999,
                border: "none",
                background: canAdvance
                  ? colors.gradientGold
                  : "rgba(255,255,255,0.08)",
                color: canAdvance ? "#111" : "rgba(255,255,255,0.4)",
                fontWeight: 700,
                fontSize: 14,
                cursor: canAdvance ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: canAdvance
                  ? "0 12px 30px rgba(245,158,11,0.35)"
                  : "none",
                transition: "all 0.2s ease",
              }}
            >
              Continue
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
