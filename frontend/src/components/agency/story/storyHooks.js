import { useEffect, useRef } from "react";

export const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;


/* Scroll progress through a pinned section, 0 → 1, written onto the element
   as --p (no re-render per frame); `onP` gets the same value. */
export function usePinProgress(ref, onP) {
  const cb = useRef(onP);
  useEffect(() => {
    cb.current = onP;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let raf = null;
    const run = () => {
      raf = null;
      const r = el.getBoundingClientRect();
      const span = Math.max(r.height - window.innerHeight, 1);
      const p = Math.min(Math.max(-r.top / span, 0), 1);
      el.style.setProperty("--p", p.toFixed(4));
      cb.current?.(p);
    };
    const on = () => {
      if (raf == null) raf = requestAnimationFrame(run);
    };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    run();
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [ref]);
}
