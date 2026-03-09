import { useState, useRef, useCallback, useEffect } from "react";

// Reactive video player that responds to setting changes
export function VideoPlayer({ src, autoPlay, muted, loop, playsInline = true, style = {} }) {
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
          objectFit: "cover",
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

export function MediaCarousel({
  media = [],
  mediaSettings = {},
  style = {},
  hideDots = false,
  onIndexChange,
  controlledIndex,
}) {
  const [internalIndex, setInternalIndex] = useState(0);
  const isControlled = controlledIndex !== undefined;
  const currentIndex = isControlled ? controlledIndex : internalIndex;
  const setCurrentIndex = isControlled ? (v) => {
    const next = typeof v === "function" ? v(controlledIndex) : v;
    onIndexChange?.(next);
  } : setInternalIndex;

  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const touchStartX = useRef(null);
  const touchDeltaX = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const isVideoMode = mediaSettings.mode === "video";
  const loopVideo = mediaSettings.loop !== undefined ? mediaSettings.loop : true;
  const autoplay = mediaSettings.autoplay !== undefined ? mediaSettings.autoplay : true;
  const audio = mediaSettings.audio !== undefined ? mediaSettings.audio : false;
  const autoscroll = mediaSettings.autoscroll || false;
  const interval = mediaSettings.interval || 5;
  const loopCarousel = mediaSettings.loop !== undefined ? mediaSettings.loop : true;

  const count = media?.length || 0;

  // Notify parent of index changes (uncontrolled mode)
  const displayIndex = currentIndex >= count ? 0 : currentIndex;
  useEffect(() => {
    if (!isControlled) onIndexChange?.(displayIndex);
  }, [displayIndex, onIndexChange, isControlled]);

  // Infinite loop clone
  const isLoop = loopCarousel && autoscroll && count > 1;
  const slides = isLoop ? [...media, media[0]] : media;
  const slideCount = slides.length;

  const directionRef = useRef(1);
  const snapPending = useRef(false);

  // Scale transition duration based on interval — never longer than the interval itself
  const transitionDuration = Math.min(interval * 0.6, 0.35);

  // Snap back after reaching clone
  useEffect(() => {
    if (!isLoop || currentIndex !== count) return;
    snapPending.current = true;
    const snapDelay = transitionDuration * 1000 + 20; // wait for CSS transition + small buffer
    const timeout = setTimeout(() => {
      setTransitionEnabled(false);
      setCurrentIndex(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransitionEnabled(true);
          snapPending.current = false;
        });
      });
    }, snapDelay);
    return () => { clearTimeout(timeout); snapPending.current = false; };
  }, [currentIndex, count, isLoop, transitionDuration]);

  // Autoscroll
  useEffect(() => {
    if (!autoscroll || count <= 1) return;
    const timer = setInterval(() => {
      // Don't advance while snap-back is in progress
      if (snapPending.current) return;
      if (isLoop) {
        setCurrentIndex((i) => {
          // Guard: never go past the clone slide
          if (i >= count) return i;
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

  // Internal touch/mouse handlers (used when not controlled externally)
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    setDragging(true);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (touchStartX.current === null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
    setDragOffset(touchDeltaX.current);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
    setDragOffset(0);
    const threshold = 50;
    if (touchDeltaX.current < -threshold && currentIndex < count - 1) {
      setCurrentIndex((i) => i + 1);
    } else if (touchDeltaX.current > threshold && currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
  }, [currentIndex, count]);

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
    setDragOffset(delta);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!mouseDown.current) return;
    mouseDown.current = false;
    setDragging(false);
    setDragOffset(0);
    const threshold = 50;
    if (touchDeltaX.current < -threshold && currentIndex < count - 1) {
      setCurrentIndex((i) => i + 1);
    } else if (touchDeltaX.current > threshold && currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
    touchDeltaX.current = 0;
  }, [currentIndex, count]);

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
        style={style}
      />
    ) : (
      <img
        src={item.url}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          ...style,
        }}
      />
    );
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
      <div
        style={{
          display: "flex",
          width: `${slideCount * 100}%`,
          height: "100%",
          transform: `translateX(calc(-${currentIndex * (100 / slideCount)}% + ${dragging ? dragOffset : 0}px))`,
          transition: !transitionEnabled || dragging
            ? "none"
            : `transform ${transitionDuration}s cubic-bezier(0.4, 0, 0.2, 1)`,
          userSelect: "none",
        }}
      >
        {slides.map((item, i) => (
          <div
            key={`${item.id || i}-${i}`}
            style={{
              width: `${100 / slideCount}%`,
              height: "100%",
              flexShrink: 0,
            }}
          >
            {item?.url ? (
              <img
                src={item.url}
                alt=""
                draggable={false}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  pointerEvents: "none",
                }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", background: "#1a1a2e" }} />
            )}
          </div>
        ))}
      </div>

      {/* Dot indicators — only rendered inside carousel when not hidden */}
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
            onClick={() => setCurrentIndex(i)}
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
