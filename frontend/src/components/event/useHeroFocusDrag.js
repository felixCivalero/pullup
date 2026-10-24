import { useEffect, useRef, useState } from "react";

/**
 * Drag-to-reposition overlay for the event hero.
 *
 * Returns a `{ bind, dragging, overlayCursor }` object:
 *  - `bind` is a set of pointer event handlers to attach to a positioned
 *    overlay div that sits above the hero media.
 *  - `dragging` indicates whether the user is currently dragging.
 *
 * Coordinates: the hook reports raw pixel deltas plus the frame size on each
 * move. The caller converts those to focus percentages (see
 * `makeFocusDragHandler` in CreateEventPage).
 *
 * The overlay is only useful when fit === "cover" — otherwise the image
 * doesn't crop, so positioning has no effect.
 */
export function useHeroFocusDrag({ onDrag, frameRef, enabled }) {
  const startRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  // Bind global pointer move/up while dragging so the user can drag outside
  // the overlay bounds without losing the gesture.
  useEffect(() => {
    if (!dragging) return;

    const handleMove = (clientX, clientY) => {
      const start = startRef.current;
      if (!start) return;
      const dx = clientX - start.x;
      const dy = clientY - start.y;
      onDrag?.(dx, dy, start.frameW, start.frameH);
      startRef.current = { ...start, x: clientX, y: clientY };
    };

    const onMouseMove = (e) => handleMove(e.clientX, e.clientY);
    const onMouseUp = () => {
      startRef.current = null;
      setDragging(false);
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 0) return;
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => {
      startRef.current = null;
      setDragging(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [dragging, onDrag]);

  const startDrag = (clientX, clientY) => {
    if (!enabled) return;
    const frame = frameRef?.current;
    const rect = frame?.getBoundingClientRect();
    if (!rect) return;
    startRef.current = { x: clientX, y: clientY, frameW: rect.width, frameH: rect.height };
    setDragging(true);
  };

  const bind = {
    onMouseDown: (e) => {
      e.preventDefault();
      startDrag(e.clientX, e.clientY);
    },
    onTouchStart: (e) => {
      if (e.touches.length === 0) return;
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
    },
  };

  return { bind, dragging };
}
