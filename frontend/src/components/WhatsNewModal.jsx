// frontend/src/components/WhatsNewModal.jsx
//
// First-login-after-redesign "what's new" walkthrough. Desktop-only, skippable,
// shows once per browser (see lib/whatsNew.js). Mounted once in ProtectedLayout
// so it can auto-open on the first landing and be re-opened from Settings via
// the WHATS_NEW_REOPEN_EVENT.
//
// The per-feature "media" is built as animated CSS/SVG scenes rather than video
// files — crisp at any size, nothing to host, on-brand by construction.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { colors } from "../theme/colors.js";
import { PullupEyes } from "./PullupEyes.jsx";
import {
  WHATS_NEW_REOPEN_EVENT,
  hasSeenWhatsNew,
  markWhatsNewSeen,
} from "../lib/whatsNew.js";

const IG_GRADIENT =
  "linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)";

// ── Scenes ──────────────────────────────────────────────────────────────────
// Each scene fills the media area (full card width, fixed height) and loops.

function WelcomeScene() {
  return (
    <div className="wn-scene" style={{ background: colors.accentSoft }}>
      <div className="wn-glow" />
      <div className="wn-eyes">
        <PullupEyes variant="big" style={{ width: 150, height: 130 }} />
      </div>
      <div className="wn-chips">
        <span className="wn-chip" style={{ animationDelay: "0s" }}>
          Your brand
        </span>
        <span className="wn-chip" style={{ animationDelay: ".5s" }}>
          AI control
        </span>
        <span className="wn-chip" style={{ animationDelay: "1s" }}>
          Instagram
        </span>
      </div>
    </div>
  );
}

function BrandScene() {
  return (
    <div className="wn-scene" style={{ background: colors.surface }}>
      <div className="wn-card">
        <div className="wn-card-cover" />
        <div className="wn-card-body">
          <div className="wn-card-title" />
          <div className="wn-card-sub" />
          <div className="wn-card-cta">RSVP</div>
        </div>
      </div>
      <div className="wn-swatches">
        <span className="wn-swatch" style={{ background: colors.accent }} />
        <span className="wn-swatch" style={{ background: colors.secondary }} />
        <span className="wn-swatch" style={{ background: "#7c3aed" }} />
        <span className="wn-swatch" style={{ background: "#b45309" }} />
        <span className="wn-cursor" />
      </div>
    </div>
  );
}

function McpScene() {
  return (
    <div className="wn-scene" style={{ background: colors.surface }}>
      <div className="wn-mcp">
        <div className="wn-prompt">
          <span className="wn-prompt-dot" />
          <span className="wn-typed">make a rooftop dinner, Fri 8pm, 40 guests</span>
          <span className="wn-caret" />
        </div>
        <div className="wn-mcp-card">
          <div className="wn-mcp-cover" />
          <div className="wn-mcp-meta">
            <div className="wn-mcp-line wn-mcp-line-1" />
            <div className="wn-mcp-line wn-mcp-line-2" />
          </div>
          <span className="wn-mcp-check">✓ Created</span>
        </div>
        <div className="wn-mcp-foot">Claude · ChatGPT · Cursor · your AI</div>
      </div>
    </div>
  );
}

function InstagramScene() {
  return (
    <div className="wn-scene" style={{ background: "rgba(220, 39, 67, 0.06)" }}>
      <span className="wn-soon" style={{ background: IG_GRADIENT }}>
        Coming in 2 weeks
      </span>
      <div className="wn-ig">
        <div className="wn-ig-comment">
          <span className="wn-ig-avatar" style={{ background: IG_GRADIENT }} />
          <span>🔥 how do I get in??</span>
        </div>
        <div className="wn-ig-arrow">↓ auto-DM</div>
        <div className="wn-ig-dm" style={{ borderColor: "rgba(220,39,67,0.3)" }}>
          Tap to grab your spot
          <span className="wn-ig-pill" style={{ background: IG_GRADIENT }}>
            RSVP →
          </span>
        </div>
      </div>
    </div>
  );
}

const SLIDES = [
  {
    id: "welcome",
    Scene: WelcomeScene,
    eyebrow: "New look, new powers",
    title: "PullUp just got an upgrade",
    body: "A cleaner home for your events — plus a few new ways to fill the room. Here's a 30-second tour.",
    accent: colors.accent,
  },
  {
    id: "brand",
    Scene: BrandScene,
    eyebrow: "Live now",
    title: "Make the page yours",
    body: "Your colors, your identity — carried from your event page into your emails. Get creative with the form; the page updates as you go.",
    accent: colors.secondary,
    cta: { label: "Style your page", path: "/settings" },
  },
  {
    id: "mcp",
    Scene: McpScene,
    eyebrow: "Live now · for the nerds",
    title: "Run PullUp from your AI",
    body: "Connect PullUp to Claude, ChatGPT, Cursor — any AI that speaks MCP — and create, edit, and follow up by just asking.",
    accent: colors.text,
    cta: { label: "Connect your AI", path: "/settings" },
  },
  {
    id: "instagram",
    Scene: InstagramScene,
    eyebrow: "Coming in 2 weeks",
    title: "Instagram DMs, on autopilot",
    body: "Someone comments on your post — PullUp slides into their DMs with a sign-up link. Comment → DM → guest, hands-free.",
    accent: "#dc2743",
  },
];

// ── Modal shell ───────────────────────────────────────────────────────────
export function WhatsNewModal() {
  const navigate = useNavigate();
  // Auto-open once, desktop only, first time after the redesign. Computed at
  // mount via lazy initializer (no effect needed — window/localStorage are
  // available at render time in this SPA).
  const [open, setOpen] = useState(
    () => window.innerWidth >= 768 && !hasSeenWhatsNew(),
  );
  const [index, setIndex] = useState(0);

  // Re-open on demand (Settings → "What's new"). Allowed regardless of size
  // since it's an explicit request.
  useEffect(() => {
    const reopen = () => {
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(WHATS_NEW_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(WHATS_NEW_REOPEN_EVENT, reopen);
  }, []);

  function close() {
    markWhatsNewSeen();
    setOpen(false);
  }

  function goCta(path) {
    close();
    navigate(path);
  }

  // Lock scroll + keyboard nav while open.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") {
        markWhatsNewSeen();
        setOpen(false);
      } else if (e.key === "ArrowRight") {
        setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
      } else if (e.key === "ArrowLeft") {
        setIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const Scene = slide.Scene;

  return (
    <>
      <div className="wn-backdrop" onClick={close} />
      <div className="wn-modal" role="dialog" aria-modal="true" aria-label="What's new in PullUp">
        <button className="wn-x" onClick={close} aria-label="Close">
          ×
        </button>

        {/* Media area — re-mounts per slide via key so the scene animation restarts */}
        <div className="wn-media" key={slide.id}>
          <Scene />
        </div>

        {/* Copy */}
        <div className="wn-copy" key={`copy-${slide.id}`}>
          <div className="wn-eyebrow" style={{ color: slide.accent }}>
            {slide.eyebrow}
          </div>
          <h2 className="wn-title">{slide.title}</h2>
          <p className="wn-body">{slide.body}</p>
          {slide.cta && (
            <button
              className="wn-cta-link"
              style={{ color: slide.accent }}
              onClick={() => goCta(slide.cta.path)}
            >
              {slide.cta.label} →
            </button>
          )}
        </div>

        {/* Dots */}
        <div className="wn-dots">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              className={`wn-dot${i === index ? " wn-dot-on" : ""}`}
              style={i === index ? { background: slide.accent } : undefined}
              onClick={() => setIndex(i)}
              aria-label={`Go to ${s.title}`}
            />
          ))}
        </div>

        {/* Footer nav */}
        <div className="wn-foot">
          {index === 0 ? (
            <button className="wn-ghost" onClick={close}>
              Skip tour
            </button>
          ) : (
            <button className="wn-ghost" onClick={() => setIndex((i) => i - 1)}>
              Back
            </button>
          )}
          <button
            className="wn-next"
            style={{ background: isLast ? colors.accent : slide.accent }}
            onClick={() => (isLast ? close() : setIndex((i) => i + 1))}
          >
            {isLast ? "Get started" : "Next"}
          </button>
        </div>
      </div>

      <style>{styles}</style>
    </>
  );
}

const styles = `
  .wn-backdrop {
    position: fixed; inset: 0; z-index: 12000;
    background: rgba(10,10,10,0.5); backdrop-filter: blur(6px);
    animation: wn-fade .2s ease;
  }
  .wn-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    z-index: 12001; width: min(560px, calc(100vw - 32px));
    background: #fff; border: 1px solid ${colors.border};
    border-radius: 24px; box-shadow: 0 28px 80px rgba(10,10,10,0.28);
    overflow: hidden; animation: wn-pop .24s cubic-bezier(.2,.8,.2,1);
  }
  .wn-x {
    position: absolute; top: 14px; right: 14px; z-index: 5;
    width: 32px; height: 32px; border-radius: 50%; border: none;
    background: rgba(255,255,255,0.85); color: ${colors.text};
    font-size: 20px; line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(10,10,10,0.12);
  }
  .wn-x:hover { background: #fff; }

  /* Media area */
  .wn-media { height: 248px; position: relative; }
  .wn-scene {
    width: 100%; height: 100%; position: relative; overflow: hidden;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 14px;
  }

  /* Copy */
  .wn-copy { padding: 24px 32px 4px; animation: wn-rise .35s ease; }
  .wn-eyebrow {
    font-size: 12px; font-weight: 700; letter-spacing: .04em;
    text-transform: uppercase; margin-bottom: 8px;
  }
  .wn-title { font-size: 22px; font-weight: 800; color: ${colors.text}; margin: 0 0 8px; }
  .wn-body { font-size: 14.5px; line-height: 1.55; color: ${colors.textMuted}; margin: 0; }
  .wn-cta-link {
    margin-top: 14px; background: none; border: none; padding: 0;
    font-size: 14px; font-weight: 700; cursor: pointer;
  }
  .wn-cta-link:hover { text-decoration: underline; }

  /* Dots */
  .wn-dots { display: flex; gap: 7px; justify-content: center; padding: 22px 0 4px; }
  .wn-dot {
    width: 7px; height: 7px; border-radius: 999px; border: none; padding: 0;
    background: ${colors.border}; cursor: pointer; transition: width .2s, background .2s;
  }
  .wn-dot-on { width: 22px; }

  /* Footer */
  .wn-foot { display: flex; align-items: center; justify-content: space-between; padding: 8px 24px 24px; }
  .wn-ghost {
    background: none; border: none; color: ${colors.textMuted};
    font-size: 14px; font-weight: 600; cursor: pointer; padding: 10px 12px;
  }
  .wn-ghost:hover { color: ${colors.text}; }
  .wn-next {
    border: none; color: #fff; font-size: 14px; font-weight: 700;
    padding: 11px 26px; border-radius: 999px; cursor: pointer;
    box-shadow: 0 6px 18px rgba(10,10,10,0.18); transition: transform .12s, filter .12s;
  }
  .wn-next:hover { transform: translateY(-1px); filter: brightness(1.05); }

  @keyframes wn-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes wn-pop { from { transform: translate(-50%,-48%) scale(.96); opacity: 0; } to { transform: translate(-50%,-50%) scale(1); opacity: 1; } }
  @keyframes wn-rise { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  /* ── Welcome ── */
  .wn-glow {
    position: absolute; width: 260px; height: 260px; border-radius: 50%;
    background: radial-gradient(circle, ${colors.accentSoftStrong} 0%, transparent 70%);
    animation: wn-pulse 3s ease-in-out infinite;
  }
  .wn-eyes { position: relative; z-index: 2; }
  .wn-chips { position: relative; z-index: 2; display: flex; gap: 8px; }
  .wn-chip {
    font-size: 12px; font-weight: 700; color: ${colors.text};
    background: #fff; border: 1px solid ${colors.border}; border-radius: 999px;
    padding: 6px 12px; box-shadow: 0 4px 12px rgba(10,10,10,0.06);
    animation: wn-floatup 2.4s ease-in-out infinite;
  }
  @keyframes wn-pulse { 0%,100% { transform: scale(.9); opacity: .7; } 50% { transform: scale(1.08); opacity: 1; } }
  @keyframes wn-floatup { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

  /* ── Brand ── */
  .wn-card {
    width: 168px; background: #fff; border: 1px solid ${colors.border};
    border-radius: 14px; overflow: hidden; box-shadow: 0 8px 22px rgba(10,10,10,0.1);
  }
  .wn-card-cover { height: 64px; animation: wn-recolor 6s ease-in-out infinite; }
  .wn-card-body { padding: 10px 12px 12px; }
  .wn-card-title { height: 9px; width: 70%; border-radius: 4px; background: ${colors.borderStrong}; margin-bottom: 6px; }
  .wn-card-sub { height: 7px; width: 45%; border-radius: 4px; background: ${colors.border}; margin-bottom: 12px; }
  .wn-card-cta {
    font-size: 11px; font-weight: 700; color: #fff; text-align: center;
    padding: 7px; border-radius: 999px; animation: wn-recolor 6s ease-in-out infinite;
  }
  .wn-swatches { display: flex; gap: 10px; align-items: center; position: relative; padding-bottom: 8px; }
  .wn-swatch { width: 20px; height: 20px; border-radius: 50%; box-shadow: 0 2px 6px rgba(10,10,10,0.15); }
  .wn-cursor {
    position: absolute; top: 22px; left: 4px; width: 10px; height: 10px;
    border-radius: 50%; border: 2px solid ${colors.text}; background: rgba(255,255,255,0.6);
    animation: wn-cursor-move 6s ease-in-out infinite;
  }
  @keyframes wn-recolor {
    0%,20% { background: ${colors.accent}; }
    30%,45% { background: ${colors.secondary}; }
    55%,70% { background: #7c3aed; }
    80%,95% { background: #b45309; }
    100% { background: ${colors.accent}; }
  }
  @keyframes wn-cursor-move {
    0%,20% { transform: translateX(0); }
    30%,45% { transform: translateX(30px); }
    55%,70% { transform: translateX(60px); }
    80%,95% { transform: translateX(90px); }
    100% { transform: translateX(0); }
  }

  /* ── MCP ── */
  .wn-mcp { width: 320px; display: flex; flex-direction: column; gap: 10px; }
  .wn-prompt {
    display: flex; align-items: center; gap: 8px; background: #fff;
    border: 1px solid ${colors.border}; border-radius: 12px; padding: 10px 12px;
    font-size: 12.5px; color: ${colors.text}; box-shadow: 0 2px 6px rgba(10,10,10,0.06);
  }
  .wn-prompt-dot { width: 8px; height: 8px; border-radius: 50%; background: ${colors.accent}; flex-shrink: 0; }
  .wn-typed {
    white-space: nowrap; overflow: hidden; display: inline-block;
    animation: wn-type 2.4s steps(40) infinite;
  }
  .wn-caret { width: 2px; height: 14px; background: ${colors.text}; animation: wn-blink 1s step-end infinite; }
  .wn-mcp-card {
    display: flex; align-items: center; gap: 10px; background: #fff;
    border: 1px solid ${colors.border}; border-radius: 12px; padding: 10px;
    box-shadow: 0 6px 16px rgba(10,10,10,0.08); position: relative;
    opacity: 0; animation: wn-rise-card .5s ease forwards 2.6s;
  }
  .wn-mcp-cover { width: 46px; height: 46px; border-radius: 8px; background: ${colors.accent}; flex-shrink: 0; }
  .wn-mcp-meta { flex: 1; }
  .wn-mcp-line { height: 8px; border-radius: 4px; background: ${colors.borderStrong}; }
  .wn-mcp-line-1 { width: 70%; margin-bottom: 6px; }
  .wn-mcp-line-2 { width: 40%; background: ${colors.border}; }
  .wn-mcp-check { font-size: 11px; font-weight: 700; color: ${colors.live}; }
  .wn-mcp-foot { font-size: 11px; color: ${colors.textSubtle}; text-align: center; font-weight: 600; }
  @keyframes wn-type { 0% { width: 0; } 55%,100% { width: 252px; } }
  @keyframes wn-blink { 50% { opacity: 0; } }
  @keyframes wn-rise-card { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  /* ── Instagram ── */
  .wn-soon {
    position: absolute; top: 14px; right: 14px; color: #fff;
    font-size: 11px; font-weight: 800; letter-spacing: .02em;
    padding: 5px 11px; border-radius: 999px; box-shadow: 0 4px 12px rgba(220,39,67,0.3);
  }
  .wn-ig { width: 250px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .wn-ig-comment {
    align-self: flex-start; display: flex; align-items: center; gap: 8px;
    background: #fff; border: 1px solid ${colors.border}; border-radius: 12px;
    padding: 8px 12px; font-size: 13px; color: ${colors.text};
    box-shadow: 0 2px 6px rgba(10,10,10,0.08); opacity: 0;
    animation: wn-in-l .4s ease forwards .2s;
  }
  .wn-ig-avatar { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; }
  .wn-ig-arrow { font-size: 11px; font-weight: 700; color: ${colors.textSubtle}; opacity: 0; animation: wn-fade .4s ease forwards 1s; }
  .wn-ig-dm {
    align-self: flex-end; display: flex; align-items: center; gap: 10px;
    background: #fff; border: 1px solid; border-radius: 12px; padding: 8px 10px 8px 12px;
    font-size: 13px; color: ${colors.text}; box-shadow: 0 4px 12px rgba(220,39,67,0.12);
    opacity: 0; animation: wn-in-r .4s ease forwards 1.5s;
  }
  .wn-ig-pill { color: #fff; font-size: 11px; font-weight: 800; padding: 5px 10px; border-radius: 999px; }
  @keyframes wn-in-l { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: none; } }
  @keyframes wn-in-r { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
`;
