import React, { useEffect, useState } from "react";

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 720px)").matches;
}

export default function LandingStickyMobileCta({ heroRef, onSignupClick }) {
  const [mounted] = useState(() => isMobileViewport());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!mounted) return;

    const heroNode = heroRef?.current;
    if (!heroNode) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(heroNode);
    return () => observer.disconnect();
  }, [heroRef, mounted]);

  if (!mounted) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
        background: "rgba(10,10,10,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        zIndex: 100,
        transform: visible ? "translateY(0)" : "translateY(120%)",
        opacity: visible ? 1 : 0,
        transition: "transform 220ms ease, opacity 220ms ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <button
        type="button"
        onClick={onSignupClick}
        style={{
          width: "100%",
          background: "#f4c24a",
          color: "#111",
          border: "none",
          padding: "15px 18px",
          fontSize: 16,
          fontWeight: 600,
          borderRadius: 999,
          cursor: "pointer",
          letterSpacing: "-0.01em",
        }}
      >
        Create your account →
      </button>
    </div>
  );
}
