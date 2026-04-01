import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Hook that manages scroll-driven reveal of a fixed bottom panel.
 *
 * Performance: all per-frame updates (bar height) are applied directly to the
 * DOM via refs — no React state is set during scrolling.  Only the boolean
 * `isRevealed` goes through React (changes once, not per-pixel).
 *
 * @param {Object} options
 * @param {React.RefObject} options.scrollRef - ref to the scrollable container
 * @param {number} [options.barHeight=62] - collapsed bar height in px
 * @param {boolean} [options.enabled=true] - whether reveal behavior is active
 * @param {boolean} [options.autoShow=false] - auto-scroll to sentinel on mount
 * @param {any} [options.contentKey] - dependency to re-measure form height
 */
export function useStickyReveal({
  scrollRef,
  barHeight = 62,
  enabled = true,
  autoShow = false,
  contentKey,
}) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [spacerHeight, setSpacerHeight] = useState("50vh");

  const sentinelRef = useRef(null);
  const formRef = useRef(null);
  const barNodeRef = useRef(null);
  const revealPxRef = useRef(0);
  const formHeightRef = useRef(0);

  // Callback ref — attach to the bar DOM node for direct style manipulation
  const barRef = useCallback(
    (node) => {
      barNodeRef.current = node;
      if (node) {
        node.style.height = `${barHeight}px`;
        node.style.overflowY = "hidden";
        node.style.willChange = "height";
      }
    },
    [barHeight],
  );

  // Scroll handler — direct DOM, no setState per-frame
  const handleScroll = useCallback(() => {
    if (!sentinelRef.current || !scrollRef.current || !barNodeRef.current)
      return;

    const containerRect = scrollRef.current.getBoundingClientRect();
    const sentinelRect = sentinelRef.current.getBoundingClientRect();
    const dist = containerRect.bottom - sentinelRect.top - barHeight;
    const px = dist <= 0 ? 0 : dist;

    revealPxRef.current = px;

    // Direct DOM update — bypasses React entirely
    barNodeRef.current.style.height = `${barHeight + px}px`;

    // Only flip the boolean (changes once per reveal/hide cycle)
    const revealed = px > 0;
    setIsRevealed((prev) => (prev === revealed ? prev : revealed));
  }, [scrollRef, barHeight]);

  // Attach scroll listener
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollRef, handleScroll]);

  // Track form height — updates spacer (infrequent, only on resize/mutation)
  useEffect(() => {
    if (!formRef.current) return;
    const update = () => {
      if (formRef.current) {
        const h = Math.max(0, formRef.current.scrollHeight - barHeight);
        formHeightRef.current = h;
        setSpacerHeight(h > 0 ? `${h + barHeight}px` : "50vh");
      }
    };
    const ro = new ResizeObserver(update);
    ro.observe(formRef.current);
    const mo = new MutationObserver(() => requestAnimationFrame(update));
    mo.observe(formRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    update();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [contentKey, barHeight]);

  // Auto-scroll to sentinel
  useEffect(() => {
    if (autoShow && sentinelRef.current) {
      setTimeout(() => {
        sentinelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 300);
    }
  }, [autoShow]);

  const scrollToPanel = useCallback(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Forward wheel events from the bar to the scroll container
  const handleBarWheel = useCallback(
    (e) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop += e.deltaY;
    },
    [scrollRef],
  );

  // Forward touch events from the bar to the scroll container
  const touchStartY = useRef(0);
  const handleBarTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleBarTouchMove = useCallback(
    (e) => {
      const el = scrollRef.current;
      if (!el || !barNodeRef.current) return;
      const deltaY = touchStartY.current - e.touches[0].clientY;
      touchStartY.current = e.touches[0].clientY;

      // Update scroll position — this fires the scroll handler which
      // updates the bar directly via DOM, no React in the loop.
      el.scrollTop += deltaY;
    },
    [scrollRef],
  );

  return {
    sentinelRef,
    formRef,
    barRef, // callback ref — attach to the bar container
    isRevealed,
    scrollToPanel,
    spacerHeight,
    barScrollHandlers: {
      onWheel: handleBarWheel,
      onTouchStart: handleBarTouchStart,
      onTouchMove: handleBarTouchMove,
    },
  };
}
