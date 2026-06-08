// frontend/src/components/LoadingScreen.jsx
//
// The PullUp system loading screen: the brand eyes, big, centered, watching.
// Move your cursor and they follow you (PullupEyes already tracks pointermove
// globally). Sit still and they don't go dead — we drive a slow idle "wander"
// by dispatching synthetic pointermove events along a lazy Lissajous path, so
// the eyes glance around on their own. The moment you move a real (trusted)
// pointer, we back off and let your cursor lead again.
import { useEffect, useRef } from "react";

import { PullupEyes } from "./PullupEyes.jsx";
import { colors } from "../theme/colors.js";

export function LoadingScreen({ label = "pulling up", fullScreen = true }) {
  const lastRealMove = useRef(0);

  // Idle wander: when no real pointer has moved for a beat, nudge the eyes
  // along a slow looping path so the screen feels alive. PullupEyes listens on
  // window.pointermove; a synthetic event (isTrusted === false) drives it just
  // like a mouse would. We pause while a real cursor is active.
  useEffect(() => {
    const onReal = (e) => {
      if (e.isTrusted) lastRealMove.current = e.timeStamp || performance.now();
    };
    window.addEventListener("pointermove", onReal, { passive: true });

    let raf = null;
    let start = null;
    const tick = (now) => {
      if (start == null) start = now;
      const t = (now - start) / 1000;
      // Back off for 1.5s after any real movement.
      if (now - lastRealMove.current > 1500) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        // Lazy figure-eight, comfortably inside the viewport.
        const rx = Math.min(cx * 0.55, 340);
        const ry = Math.min(cy * 0.45, 240);
        const x = cx + Math.sin(t * 0.7) * rx;
        const y = cy + Math.sin(t * 1.1) * ry;
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            clientX: x,
            clientY: y,
            bubbles: true,
          }),
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onReal);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: fullScreen ? "100vh" : "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        background: colors.background,
        userSelect: "none",
      }}
    >
      <PullupEyes
        variant="big"
        style={{
          width: "min(46vw, 240px)",
          aspectRatio: "2761 / 2418",
          cursor: "none",
        }}
      />
      <div
        style={{
          fontSize: 13,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: colors.textSubtle,
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <span>{label}</span>
        <span className="pu-load-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>

      <style>{`
        .pu-load-dots { display: inline-flex; gap: 4px; }
        .pu-load-dots i {
          width: 5px; height: 5px; border-radius: 50%;
          background: ${colors.accent};
          display: inline-block;
          animation: pu-load-bob 1.1s ease-in-out infinite;
        }
        .pu-load-dots i:nth-child(2) { animation-delay: 0.18s; }
        .pu-load-dots i:nth-child(3) { animation-delay: 0.36s; }
        @keyframes pu-load-bob {
          0%, 100% { opacity: 0.25; transform: translateY(0); }
          50%      { opacity: 1;    transform: translateY(-4px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pu-load-dots i { animation: none; opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

export default LoadingScreen;
