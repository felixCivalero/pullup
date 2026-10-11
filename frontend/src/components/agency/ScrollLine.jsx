import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/* The far-left scroll line: a hairline that fills as you read, ticks where
   each section starts, and a drop that falls with you — it trails the page a
   touch, stretches when you scroll fast and settles when you stop. */
export function ScrollLine() {
  const { pathname } = useLocation();
  const rootRef = useRef(null);
  const dropRef = useRef(null);
  const fillRef = useRef(null);
  const ticksRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    const drop = dropRef.current;
    const fill = fillRef.current;
    const ticks = ticksRef.current;
    if (!root || !drop || !fill || !ticks) return undefined;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const progress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };

    // Section ticks, placed by where each beat sits in the page.
    const placeTicks = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      ticks.replaceChildren();
      if (max <= 0) return;
      document.querySelectorAll("[data-pc-section]").forEach((el, i) => {
        if (i === 0) return;
        const top = el.getBoundingClientRect().top + window.scrollY;
        const at = Math.min(1, Math.max(0, (top - window.innerHeight * 0.35) / max));
        const t = document.createElement("span");
        t.style.top = `${at * 100}%`;
        ticks.appendChild(t);
      });
    };

    let shown = progress();
    let velocity = 0;
    let raf = null;
    const frame = () => {
      const target = progress();
      const delta = target - shown;
      shown = still ? target : shown + delta * 0.14;
      velocity = velocity * 0.82 + Math.abs(delta) * 0.18;
      const h = root.clientHeight;
      const stretch = still ? 1 : 1 + Math.min(velocity * 22, 0.9);
      fill.style.transform = `scaleY(${shown})`;
      drop.style.transform = `translate3d(-50%, ${shown * h}px, 0) scale(${1 / Math.sqrt(stretch)}, ${stretch})`;
      if (Math.abs(delta) > 0.0002 || velocity > 0.0002) raf = requestAnimationFrame(frame);
      else raf = null;
    };
    const kick = () => {
      if (raf == null) raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(() => {
      placeTicks();
      kick();
    });
    ro.observe(document.body);
    const t = setTimeout(placeTicks, 400); // after reveals and images settle
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    kick();
    return () => {
      clearTimeout(t);
      ro.disconnect();
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return (
    <div className="pc-line" ref={rootRef} aria-hidden="true">
      <span className="pc-line-track" />
      <span className="pc-line-fill" ref={fillRef} />
      <span className="pc-line-ticks" ref={ticksRef} />
      <span className="pc-line-drop" ref={dropRef}>
        <svg viewBox="0 0 20 28" width="14" height="20">
          <path d="M10 1 C 10 1, 19 12.5, 19 18.5 A 9 9 0 0 1 1 18.5 C 1 12.5, 10 1, 10 1 Z" />
        </svg>
      </span>
    </div>
  );
}
