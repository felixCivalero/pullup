import { useState, useRef, useCallback, useEffect } from "react";
import { transformedImageUrl } from "../lib/imageUtils";

// Reactive video player that responds to setting changes
export function VideoPlayer({ src, autoPlay, muted, loop, playsInline = true, style = {}, objectFit = "cover", objectPosition = "center center" }) {
  const videoRef = useRef(null);
  const [ended, setEnded] = useState(false);
  const [paused, setPaused] = useState(!autoPlay);
  const prevLoopRef = useRef(loop);

  // Sync loop attribute — restart when loop is toggled ON
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.loop = loop;
    const wasOff = !prevLoopRef.current;
    prevLoopRef.current = loop;
    // Loop just turned ON — restart if ended or paused
    if (loop && wasOff && (v.ended || v.paused)) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  }, [loop]);

  // Sync muted attribute
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
  }, [muted]);

  // Sync autoplay — when turned on, start playing if paused
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (autoPlay && (v.paused || v.ended)) {
      if (v.ended) v.currentTime = 0;
      v.play().catch(() => {});
    }
  }, [autoPlay]);

  // Keep paused/ended state in sync with the actual video element
  const syncState = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setEnded(v.ended);
    setPaused(v.paused || v.ended);
  }, []);

  const handleEnded = useCallback(() => {
    setEnded(true);
    setPaused(true);
  }, []);

  const handlePlay = useCallback(() => {
    setPaused(false);
    setEnded(false);
  }, []);

  const handlePause = useCallback(() => {
    const v = videoRef.current;
    // Only show paused state if not ended (ended has its own state)
    setPaused(v ? (v.ended || v.paused) : true);
  }, []);

  const togglePlayback = useCallback((e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) {
      if (v.ended) v.currentTime = 0;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, []);

  if (!src) return null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      <video
        ref={videoRef}
        src={src}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        playsInline={playsInline}
        onEnded={handleEnded}
        onPlay={handlePlay}
        onPause={handlePause}
        onLoadedData={syncState}
        onClick={togglePlayback}
        style={{
          width: "100%",
          height: "100%",
          objectFit,
          objectPosition,
          display: "block",
          cursor: "pointer",
        }}
      />
      {/* Play button overlay when paused or ended */}
      {paused && (
        <div
          onClick={togglePlayback}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            background: "rgba(0,0,0,0.15)",
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <polygon points="8,5 19,12 8,19" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

// Hook for swipe/drag handling — attach to any parent element
export function useCarouselSwipe(count, onIndexChange) {
  const startX = useRef(null);
  const deltaX = useRef(0);
  const isDragging = useRef(false);

  const handleStart = useCallback((clientX) => {
    startX.current = clientX;
    isDragging.current = true;
    deltaX.current = 0;
  }, []);

  const handleMove = useCallback((clientX) => {
    if (startX.current === null) return;
    deltaX.current = clientX - startX.current;
  }, []);

  const handleEnd = useCallback(() => {
    isDragging.current = false;
    const threshold = 50;
    if (deltaX.current < -threshold) {
      onIndexChange?.((i) => Math.min(i + 1, count - 1));
    } else if (deltaX.current > threshold) {
      onIndexChange?.((i) => Math.max(i - 1, 0));
    }
    startX.current = null;
    deltaX.current = 0;
  }, [count, onIndexChange]);

  const swipeHandlers = {
    onTouchStart: (e) => handleStart(e.touches[0].clientX),
    onTouchMove: (e) => handleMove(e.touches[0].clientX),
    onTouchEnd: handleEnd,
    onMouseDown: (e) => { e.preventDefault(); handleStart(e.clientX); },
    onMouseMove: (e) => { if (isDragging.current) handleMove(e.clientX); },
    onMouseUp: handleEnd,
    onMouseLeave: () => { if (isDragging.current) handleEnd(); },
  };

  return swipeHandlers;
}

export function CarouselDots({ count, currentIndex, onDotClick, style: wrapperStyle = {} }) {
  if (count <= 1) return null;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: "6px",
        ...wrapperStyle,
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onDotClick?.(i)}
          style={{
            width: i === currentIndex ? "20px" : "7px",
            height: "7px",
            borderRadius: "4px",
            background: i === currentIndex ? "#fff" : "rgba(255,255,255,0.5)",
            border: "none",
            padding: 0,
            cursor: onDotClick ? "pointer" : "default",
            transition: "all 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

// Determine which transition to use between two slide indices
function getTransition(fromIndex, toIndex, transitions, count) {
  if (!transitions?.length) return "slide";
  if ((fromIndex === count - 1 && toIndex === 0) || (fromIndex === 0 && toIndex === count - 1)) {
    return transitions[transitions.length - 1] || "slide";
  }
  const gapIndex = Math.min(fromIndex, toIndex);
  return transitions[gapIndex] || "slide";
}

// Build inline styles for a slide based on transition type and phase
function getSlideStyle({ type, phase, direction, progress, dragOffset }) {
  // phase: "current" (active visible), "entering", "leaving", or "hidden"
  const base = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  };

  if (phase === "hidden") {
    return { ...base, opacity: 0, pointerEvents: "none", zIndex: 0 };
  }

  if (phase === "current" && type === "slide" && dragOffset !== 0) {
    // Live drag for slide transition
    return {
      ...base,
      transform: `translateX(${dragOffset}px)`,
      transition: "none",
      zIndex: 2,
    };
  }

  if (phase === "drag-peek") {
    // The slide peeking in during drag (slide type only)
    const side = dragOffset < 0 ? "100%" : "-100%";
    return {
      ...base,
      transform: `translateX(calc(${side} + ${dragOffset}px))`,
      transition: "none",
      zIndex: 2,
    };
  }

  switch (type) {
    case "fade":
      if (phase === "current") {
        return { ...base, opacity: 1, zIndex: 2, transition: `opacity ${progress}s ease` };
      }
      if (phase === "entering") {
        return { ...base, opacity: 1, zIndex: 2, transition: `opacity ${progress}s ease` };
      }
      if (phase === "leaving") {
        return { ...base, opacity: 0, zIndex: 1, transition: `opacity ${progress}s ease` };
      }
      break;

    case "zoom":
      if (phase === "current") {
        return { ...base, opacity: 1, transform: "scale(1)", zIndex: 2, transition: `opacity ${progress}s ease, transform ${progress}s ease` };
      }
      if (phase === "entering") {
        return { ...base, opacity: 1, transform: "scale(1)", zIndex: 2, transition: `opacity ${progress}s ease, transform ${progress}s ease` };
      }
      if (phase === "leaving") {
        return { ...base, opacity: 0, transform: "scale(1.15)", zIndex: 1, transition: `opacity ${progress}s ease, transform ${progress}s ease` };
      }
      break;

    case "pixelate":
      if (phase === "current") {
        return { ...base, opacity: 1, filter: "blur(0px)", zIndex: 2, transition: `opacity ${progress}s ease, filter ${progress}s ease` };
      }
      if (phase === "entering") {
        return { ...base, opacity: 1, filter: "blur(0px)", zIndex: 2, transition: `opacity ${progress}s ease, filter ${progress}s ease` };
      }
      if (phase === "leaving") {
        return { ...base, opacity: 0, filter: "blur(8px)", zIndex: 1, transition: `opacity ${progress}s ease, filter ${progress}s ease` };
      }
      break;

    case "slide":
    default:
      if (phase === "current") {
        return { ...base, transform: "translateX(0)", zIndex: 2, transition: `transform ${progress}s cubic-bezier(0.4, 0, 0.2, 1)` };
      }
      if (phase === "entering") {
        return { ...base, transform: "translateX(0)", zIndex: 2, transition: `transform ${progress}s cubic-bezier(0.4, 0, 0.2, 1)` };
      }
      if (phase === "leaving") {
        const translateOut = direction > 0 ? "-100%" : "100%";
        return { ...base, transform: `translateX(${translateOut})`, zIndex: 1, transition: `transform ${progress}s cubic-bezier(0.4, 0, 0.2, 1)` };
      }
      break;
  }

  return { ...base, opacity: 0, pointerEvents: "none", zIndex: 0 };
}

// Initial style for entering slides (before transition triggers)
function getSlideInitialStyle(type, direction) {
  switch (type) {
    case "fade":
      return { opacity: 0 };
    case "zoom":
      return { opacity: 0, transform: "scale(0.85)" };
    case "pixelate":
      return { opacity: 0, filter: "blur(8px)" };
    case "slide":
    default: {
      const translateIn = direction > 0 ? "100%" : "-100%";
      return { transform: `translateX(${translateIn})` };
    }
  }
}

export function MediaCarousel({
  media = [],
  mediaSettings = {},
  style = {},
  hideDots = false,
  onIndexChange,
  controlledIndex,
  // Target rendered width in CSS pixels. When provided, image sources are
  // routed through Supabase's image transform endpoint so we don't ship 4K
  // originals to a 400px hero.
  displayWidth,
}) {
  const [internalIndex, setInternalIndex] = useState(0);
  const isControlled = controlledIndex !== undefined;
  const currentIndex = isControlled ? controlledIndex : internalIndex;
  const setCurrentIndex = isControlled ? (v) => {
    const next = typeof v === "function" ? v(controlledIndex) : v;
    onIndexChange?.(next);
  } : setInternalIndex;

  const touchStartX = useRef(null);
  const touchDeltaX = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  // Transition tracking
  const prevIndexRef = useRef(currentIndex);
  const [transitionState, setTransitionState] = useState(null); // { from, to, direction }
  const transitionTimerRef = useRef(null);

  const isVideoMode = mediaSettings.mode === "video";
  const loopVideo = mediaSettings.loop !== undefined ? mediaSettings.loop : true;
  const autoplay = mediaSettings.autoplay !== undefined ? mediaSettings.autoplay : true;
  const audio = mediaSettings.audio !== undefined ? mediaSettings.audio : false;
  const autoscroll = mediaSettings.autoscroll || false;
  const interval = mediaSettings.interval || 5;
  const loopCarousel = mediaSettings.loop !== undefined ? mediaSettings.loop : true;
  const transitions = mediaSettings.transitions;

  // Crop / fit settings (default: cover from center — matches legacy behavior).
  // Supports both the legacy "top"/"center"/"bottom" focus and the new numeric
  // focusX/focusY (percentages 0–100).
  const fit = mediaSettings.fit === "contain" ? "contain" : "cover";
  const focusX = typeof mediaSettings.focusX === "number" ? mediaSettings.focusX : 50;
  const legacyFocusY = mediaSettings.focus === "top"
    ? 0
    : mediaSettings.focus === "bottom"
      ? 100
      : 50;
  const focusY = typeof mediaSettings.focusY === "number" ? mediaSettings.focusY : legacyFocusY;
  const objectPosition = `${focusX}% ${focusY}%`;

  const count = media?.length || 0;

  // Notify parent of index changes (uncontrolled mode)
  const displayIndex = currentIndex >= count ? 0 : currentIndex;
  useEffect(() => {
    if (!isControlled) onIndexChange?.(displayIndex);
  }, [displayIndex, onIndexChange, isControlled]);

  const isLoop = loopCarousel && autoscroll && count > 1;

  const directionRef = useRef(1);

  // Scale transition duration based on interval
  const autoTransitionDuration = Math.min(interval * 0.6, 0.35);
  const manualTransitionDuration = 0.4;

  // Determine if current transition was manual or auto
  const isManualRef = useRef(false);
  const getTransitionDuration = useCallback(() => {
    return isManualRef.current ? manualTransitionDuration : autoTransitionDuration;
  }, [autoTransitionDuration]);

  // Detect index changes and trigger transitions
  useEffect(() => {
    const prev = prevIndexRef.current;
    const curr = currentIndex;
    prevIndexRef.current = curr;

    if (prev === curr) return;
    if (count <= 1) return;

    // Determine direction
    let direction;
    if (isLoop && prev === count - 1 && curr === 0) {
      // Loop-back: last -> first, forward
      direction = 1;
    } else if (isLoop && prev === 0 && curr === count - 1) {
      // Loop-back: first -> last, backward
      direction = -1;
    } else {
      direction = curr > prev ? 1 : -1;
    }

    // Start transition
    setTransitionState({ from: prev, to: curr, direction });

    // Clear any pending timer
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);

    const duration = getTransitionDuration();
    transitionTimerRef.current = setTimeout(() => {
      setTransitionState(null);
      transitionTimerRef.current = null;
    }, duration * 1000 + 50);

    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, [currentIndex, count, isLoop, getTransitionDuration]);

  // Autoscroll
  useEffect(() => {
    if (!autoscroll || count <= 1) return;
    const timer = setInterval(() => {
      isManualRef.current = false;
      if (isLoop) {
        setCurrentIndex((i) => {
          if (i >= count - 1) return 0;
          return i + 1;
        });
      } else {
        setCurrentIndex((i) => {
          const next = i + directionRef.current;
          if (next > count - 1) {
            directionRef.current = -1;
            return count - 2;
          }
          if (next < 0) {
            directionRef.current = 1;
            return 1;
          }
          return next;
        });
      }
    }, interval * 1000);
    return () => clearInterval(timer);
  }, [autoscroll, interval, count, isLoop, loopCarousel]);

  // Determine current transition type for drag behavior
  const currentTransitionType = useCallback((targetDirection) => {
    if (!transitions?.length) return "slide";
    const nextIndex = targetDirection > 0
      ? (currentIndex + 1) % count
      : (currentIndex - 1 + count) % count;
    return getTransition(currentIndex, nextIndex, transitions, count).type;
  }, [currentIndex, count, transitions]);

  // Internal touch/mouse handlers
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    setDragging(true);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (touchStartX.current === null) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    touchDeltaX.current = delta;
    // Only show live drag offset for "slide" transitions
    const dir = delta < 0 ? 1 : -1;
    const type = currentTransitionType(dir);
    if (type === "slide") {
      setDragOffset(delta);
    }
  }, [currentTransitionType]);

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
    setDragOffset(0);
    const threshold = 50;
    isManualRef.current = true;
    if (touchDeltaX.current < -threshold && (isLoop || currentIndex < count - 1)) {
      setCurrentIndex((i) => isLoop ? (i + 1) % count : Math.min(i + 1, count - 1));
    } else if (touchDeltaX.current > threshold && (isLoop || currentIndex > 0)) {
      setCurrentIndex((i) => isLoop ? (i - 1 + count) % count : Math.max(i - 1, 0));
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
  }, [currentIndex, count, isLoop]);

  // Mouse drag (desktop)
  const mouseDown = useRef(false);
  const mouseStartX = useRef(0);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    mouseDown.current = true;
    mouseStartX.current = e.clientX;
    touchDeltaX.current = 0;
    setDragging(true);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!mouseDown.current) return;
    const delta = e.clientX - mouseStartX.current;
    touchDeltaX.current = delta;
    const dir = delta < 0 ? 1 : -1;
    const type = currentTransitionType(dir);
    if (type === "slide") {
      setDragOffset(delta);
    }
  }, [currentTransitionType]);

  const handleMouseUp = useCallback(() => {
    if (!mouseDown.current) return;
    mouseDown.current = false;
    setDragging(false);
    setDragOffset(0);
    const threshold = 50;
    isManualRef.current = true;
    if (touchDeltaX.current < -threshold && (isLoop || currentIndex < count - 1)) {
      setCurrentIndex((i) => isLoop ? (i + 1) % count : Math.min(i + 1, count - 1));
    } else if (touchDeltaX.current > threshold && (isLoop || currentIndex > 0)) {
      setCurrentIndex((i) => isLoop ? (i - 1 + count) % count : Math.max(i - 1, 0));
    }
    touchDeltaX.current = 0;
  }, [currentIndex, count, isLoop]);

  if (!media || count === 0) return null;

  // Single item
  if (count === 1) {
    const item = media[0];
    if (!item?.url) return null;
    return item.mediaType === "video" ? (
      <VideoPlayer
        src={item.url}
        autoPlay={autoplay}
        muted={!audio}
        loop={loopVideo}
        objectFit={fit}
        objectPosition={objectPosition}
        style={style}
      />
    ) : (
      <img
        src={transformedImageUrl(item.url, { width: displayWidth })}
        alt=""
        loading="lazy"
        decoding="async"
        style={{
          width: "100%",
          height: "100%",
          objectFit: fit,
          objectPosition,
          display: "block",
          ...style,
        }}
      />
    );
  }

  // Determine what to render for each slide
  const transitionDuration = getTransitionDuration();
  const activeTransitionType = transitionState
    ? getTransition(transitionState.from, transitionState.to, transitions, count)
    : "slide";

  // Figure out which slide is peeking during drag (slide-type only)
  let dragPeekIndex = null;
  if (dragging && dragOffset !== 0 && !transitionState) {
    const peekDir = dragOffset < 0 ? 1 : -1;
    const type = currentTransitionType(peekDir);
    if (type === "slide") {
      if (peekDir > 0 && (isLoop || currentIndex < count - 1)) {
        dragPeekIndex = isLoop ? (currentIndex + 1) % count : currentIndex + 1;
      } else if (peekDir < 0 && (isLoop || currentIndex > 0)) {
        dragPeekIndex = isLoop ? (currentIndex - 1 + count) % count : currentIndex - 1;
      }
    }
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: !autoscroll ? "grab" : "default",
        ...style,
      }}
      onTouchStart={!isControlled ? handleTouchStart : undefined}
      onTouchMove={!isControlled ? handleTouchMove : undefined}
      onTouchEnd={!isControlled ? handleTouchEnd : undefined}
      onMouseDown={!isControlled ? handleMouseDown : undefined}
      onMouseMove={!isControlled ? handleMouseMove : undefined}
      onMouseUp={!isControlled ? handleMouseUp : undefined}
      onMouseLeave={!isControlled ? handleMouseUp : undefined}
    >
      {/* Stacked absolute-positioned slides */}
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {media.map((item, i) => {
          // Determine phase for this slide
          let phase = "hidden";
          let slideStyle;
          const isTransitioning = transitionState !== null;

          if (isTransitioning) {
            const { from, to, direction } = transitionState;
            if (i === to) {
              phase = "entering";
            } else if (i === from) {
              phase = "leaving";
            }
          } else if (i === currentIndex) {
            phase = "current";
          }

          // Handle drag-peek separately
          if (!isTransitioning && dragging && i === dragPeekIndex) {
            phase = "drag-peek";
          }

          if (phase === "hidden" && i !== currentIndex) {
            slideStyle = getSlideStyle({ type: activeTransitionType, phase: "hidden", direction: 1, progress: transitionDuration, dragOffset: 0 });
          } else if (phase === "drag-peek") {
            slideStyle = getSlideStyle({ type: "slide", phase: "drag-peek", direction: 1, progress: transitionDuration, dragOffset });
          } else if (phase === "current") {
            // Check if dragging with slide-type
            const isDragSlide = dragging && dragOffset !== 0 && currentTransitionType(dragOffset < 0 ? 1 : -1) === "slide";
            slideStyle = getSlideStyle({
              type: "slide",
              phase: "current",
              direction: 1,
              progress: transitionDuration,
              dragOffset: isDragSlide ? dragOffset : 0,
            });
            if (!isDragSlide && !dragging) {
              // Static current slide
              slideStyle = { ...slideStyle, transform: "translateX(0)", transition: "none" };
            }
          } else if (isTransitioning) {
            slideStyle = getSlideStyle({
              type: activeTransitionType,
              phase,
              direction: transitionState.direction,
              progress: transitionDuration,
              dragOffset: 0,
            });
          } else {
            slideStyle = getSlideStyle({ type: "slide", phase: "hidden", direction: 1, progress: transitionDuration, dragOffset: 0 });
          }

          // For entering slides, we need to set initial offscreen style first frame, then animate in
          // We handle this with a data attribute + useEffect trick below
          const isVisible = phase !== "hidden";

          return (
            <SlideRenderer
              key={`${item?.id || i}-${i}`}
              item={item}
              phase={phase}
              slideStyle={slideStyle}
              transitionType={activeTransitionType}
              direction={isTransitioning ? transitionState.direction : 1}
              transitionDuration={transitionDuration}
              isVisible={isVisible}
            />
          );
        })}
      </div>

      {/* Dot indicators */}
      {!hideDots && <div
        style={{
          position: "absolute",
          bottom: "16px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "6px",
          zIndex: 10,
        }}
      >
        {media.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              isManualRef.current = true;
              setCurrentIndex(i);
            }}
            style={{
              width: i === displayIndex ? "20px" : "7px",
              height: "7px",
              borderRadius: "4px",
              background: i === displayIndex ? "#fff" : "rgba(255,255,255,0.5)",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>}
    </div>
  );
}

// Individual slide component that handles enter animation via two-frame mount
function SlideRenderer({ item, phase, slideStyle, transitionType, direction, transitionDuration, isVisible }) {
  const ref = useRef(null);
  const hasAnimatedIn = useRef(false);

  useEffect(() => {
    if (phase !== "entering") {
      hasAnimatedIn.current = false;
      return;
    }
    if (hasAnimatedIn.current) return;

    const el = ref.current;
    if (!el) return;

    // First frame: set initial position (offscreen/invisible)
    const initial = getSlideInitialStyle(transitionType, direction);
    Object.assign(el.style, {
      transition: "none",
      opacity: initial.opacity !== undefined ? initial.opacity : "",
      transform: initial.transform || "",
      filter: initial.filter || "",
    });

    // Second frame: animate to final position
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!ref.current) return;
        Object.assign(el.style, {
          transition: slideStyle.transition || "",
          opacity: slideStyle.opacity !== undefined ? slideStyle.opacity : "",
          transform: slideStyle.transform || "",
          filter: slideStyle.filter || "",
        });
        hasAnimatedIn.current = true;
      });
    });
  }, [phase, transitionType, direction, transitionDuration, slideStyle]);

  // For non-entering phases, apply style directly
  const appliedStyle = phase === "entering" ? {
    ...slideStyle,
    // Start with initial style; the useEffect will animate
    ...getSlideInitialStyle(transitionType, direction),
    transition: "none",
  } : slideStyle;

  if (!isVisible) {
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
    );
  }

  return (
    <div
      ref={ref}
      style={{
        ...appliedStyle,
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {item?.url ? (
        item.mediaType === "video" ? (
          <VideoPlayer
            src={item.url}
            autoPlay
            muted
            loop
            objectFit={fit}
            objectPosition={objectPosition}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <img
            src={transformedImageUrl(item.url, { width: displayWidth })}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            style={{
              width: "100%",
              height: "100%",
              objectFit: fit,
              objectPosition,
              display: "block",
              pointerEvents: "none",
            }}
          />
        )
      ) : (
        <div style={{ width: "100%", height: "100%", background: "#1a1a2e" }} />
      )}
    </div>
  );
}
