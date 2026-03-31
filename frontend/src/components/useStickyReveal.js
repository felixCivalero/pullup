import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Hook that manages scroll-driven reveal of a fixed bottom panel.
 *
 * Place `sentinelRef` on a spacer div inside the scroll container.
 * Place `formRef` on the panel content wrapper in the fixed bar.
 * The hook tracks scrolling past the sentinel and maps it 1:1 to reveal pixels.
 *
 * @param {Object} options
 * @param {React.RefObject} options.scrollRef - ref to the scrollable container
 * @param {number} [options.barHeight=62] - collapsed bar height in px
 * @param {boolean} [options.enabled=true] - whether reveal behavior is active
 * @param {boolean} [options.autoShow=false] - auto-scroll to sentinel on mount
 * @param {any} [options.contentKey] - dependency to re-measure form height (e.g. rsvpContent)
 */
export function useStickyReveal({
  scrollRef,
  barHeight = 62,
  enabled = true,
  autoShow = false,
  contentKey,
}) {
  const [revealPx, setRevealPx] = useState(0);
  const [formHeight, setFormHeight] = useState(0);
  const sentinelRef = useRef(null);
  const formRef = useRef(null);

  // Scroll handler — compute how far sentinel has scrolled past the bar trigger line
  const handleScroll = useCallback(() => {
    if (!sentinelRef.current || !scrollRef.current || !formRef.current) {
      setRevealPx(0);
      return;
    }
    const containerRect = scrollRef.current.getBoundingClientRect();
    const sentinelRect = sentinelRef.current.getBoundingClientRect();

    // How far sentinel top is above the bar's top edge (container bottom - barHeight)
    const distancePastTrigger = containerRect.bottom - sentinelRect.top - barHeight;

    setRevealPx(distancePastTrigger <= 0 ? 0 : distancePastTrigger);
  }, [scrollRef, barHeight]);

  // Attach scroll listener
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollRef, handleScroll]);

  // Track form height — watches resizes AND DOM mutations (toggles, dynamic content)
  useEffect(() => {
    if (!formRef.current) return;
    const update = () => {
      if (formRef.current) {
        setFormHeight(Math.max(0, formRef.current.scrollHeight - barHeight));
      }
    };
    const ro = new ResizeObserver(update);
    ro.observe(formRef.current);
    const mo = new MutationObserver(() => requestAnimationFrame(update));
    mo.observe(formRef.current, { childList: true, subtree: true, attributes: true });
    update();
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [contentKey, barHeight]);

  // Auto-scroll to sentinel
  useEffect(() => {
    if (autoShow && sentinelRef.current) {
      setTimeout(() => {
        sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, [autoShow]);

  const scrollToPanel = useCallback(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // The bar is "capped" when its natural height would exceed maxHeight
  const maxHeight = "80vh";
  const atMaxHeight = revealPx > 0 && (barHeight + revealPx) >= window.innerHeight * 0.8;

  return {
    sentinelRef,
    formRef,
    revealPx,
    isRevealed: revealPx > 0,
    scrollToPanel,
    spacerHeight: formHeight > 0 ? `${formHeight}px` : "50vh",
    barStyle: {
      height: `${barHeight + revealPx}px`,
      maxHeight,
      // During reveal: clip content. Once at max: allow internal scrolling.
      overflowY: atMaxHeight ? "auto" : "hidden",
    },
  };
}
