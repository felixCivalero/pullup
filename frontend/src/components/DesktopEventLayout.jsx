import { useState, useRef, useEffect, useMemo } from "react";
import { MediaCarousel } from "./MediaCarousel";
import { EventPageContent } from "./EventPageContent";
import { getCtaLabel } from "./EventCTA";
import { formatEventTime } from "../lib/dateUtils.js";
import { formatLocationShort } from "../lib/urlUtils";
import { useHeroFocusDrag } from "./useHeroFocusDrag";
import { transformedImageUrl } from "../lib/imageUtils";

const CTA_BAR_HEIGHT = 62;

// Desktop has two preset modes:
//   "fit"  → portrait 4:5 frame
//   "real" → wide 16:9 frame
// Both are cropped (object-fit: cover) and support drag-to-reposition.
function aspectRatioFromMode(mode) {
  return mode === "real" ? "16 / 9" : "4 / 5";
}

// Legacy: derive a mode from old "aspect" + "fit" fields so events saved with
// the previous schema still render predictably.
function legacyToMode(format, top) {
  if (format?.mode) return format.mode;
  const aspect = format?.aspect ?? top?.aspect;
  if (aspect === "landscape") return "real";
  return "fit";
}

export function DesktopEventLayout({
  title,
  description,
  location,
  startsAt,
  timezone,
  imagePreview,
  media,
  mediaSettings,
  ticketType,
  ticketPrice,
  ticketCurrency,
  sections = [],
  hoveredSection = null,
  hideLocation = false,
  hideDate = false,
  revealHint = null,
  dateRevealHint = null,
  instantWaitlist = false,
  rsvpContent,
  autoShowRsvp = false,
  activeStep,
  onFocusDrag,
}) {
  const rightScrollRef = useRef(null);
  const rsvpSectionRef = useRef(null);
  const heroFrameRef = useRef(null);
  const [rsvpVisible, setRsvpVisible] = useState(false);

  // Observe hero width to request right-sized image variants.
  const [heroWidth, setHeroWidth] = useState(0);
  useEffect(() => {
    if (!heroFrameRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setHeroWidth(Math.round(w));
    });
    ro.observe(heroFrameRef.current);
    return () => ro.disconnect();
  }, []);

  // Both desktop modes are cover-cropped, so drag-to-reposition is always
  // available when the parent provides a drag handler.
  const focusDrag = useHeroFocusDrag({
    onDrag: onFocusDrag,
    frameRef: heroFrameRef,
    enabled: !!onFocusDrag,
  });

  // Editor: scroll the right column to the hovered section
  useEffect(() => {
    if (hoveredSection === null || !rightScrollRef.current) return;
    const el = rightScrollRef.current.querySelector(
      `[data-section-index="${hoveredSection}"]`
    );
    if (!el) return;
    const container = rightScrollRef.current;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offset = elRect.top - containerRect.top + container.scrollTop;
    container.scrollTo({
      top: Math.max(0, offset - containerRect.height * 0.25),
      behavior: "smooth",
    });
  }, [hoveredSection]);

  // Editor: scroll on step change
  useEffect(() => {
    if (!rightScrollRef.current) return;
    if (activeStep === 1 || activeStep === 2) {
      rightScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else if ((activeStep === 3 || activeStep === 5) && rsvpSectionRef.current) {
      rsvpSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeStep]);

  // Auto-scroll to RSVP if VIP/waitlist offer
  useEffect(() => {
    if (autoShowRsvp && rsvpSectionRef.current) {
      setTimeout(() => {
        rsvpSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, [autoShowRsvp]);

  // Hide bottom CTA when inline RSVP is on screen
  useEffect(() => {
    if (!rsvpSectionRef.current || !rsvpContent) return;
    const observer = new IntersectionObserver(
      ([entry]) => setRsvpVisible(entry.isIntersecting),
      { root: rightScrollRef.current, threshold: 0.2 }
    );
    observer.observe(rsvpSectionRef.current);
    return () => observer.disconnect();
  }, [rsvpContent]);

  const scrollToRsvp = () => {
    rsvpSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const buttonLabel = getCtaLabel({
    ticketType,
    ticketPrice,
    ticketCurrency,
    instantWaitlist,
  });

  const formattedDate = useMemo(() => {
    if (hideDate) return dateRevealHint || "Date TBA";
    if (!startsAt) return "";
    const d = new Date(startsAt);
    const tzOpt = timezone ? { timeZone: timezone } : {};
    const day = d.toLocaleDateString("en-US", { weekday: "short", ...tzOpt });
    const dateNum = d.toLocaleDateString("en-US", { day: "numeric", ...tzOpt });
    const month = d
      .toLocaleDateString("en-US", { month: "short", ...tzOpt })
      .toLowerCase();
    const t = formatEventTime(d, timezone);
    return `${day} ${dateNum} ${month}${t ? `, ${t}` : ""}`;
  }, [startsAt, timezone, hideDate, dateRevealHint]);

  const priceLabel =
    ticketType === "paid" && ticketPrice
      ? `${(ticketPrice / 100).toLocaleString()} ${(ticketCurrency || "sek").toUpperCase()}`
      : "Free entry";

  // Per-screen format settings — desktop view reads from .desktop, with
  // graceful fallback to top-level fields (legacy events).
  const desktopFormat = mediaSettings?.desktop || {};
  const desktopMode = legacyToMode(desktopFormat, mediaSettings);
  const heroAspect = aspectRatioFromMode(desktopMode);
  // Support both numeric focusX/focusY and legacy "top"/"center"/"bottom"
  const legacyFocusY = mediaSettings?.focus === "top"
    ? 0
    : mediaSettings?.focus === "bottom"
      ? 100
      : 50;
  const desktopFocusX = typeof desktopFormat.focusX === "number" ? desktopFormat.focusX : 50;
  const desktopFocusY = typeof desktopFormat.focusY === "number" ? desktopFormat.focusY : legacyFocusY;
  const fallbackObjectPosition = `${desktopFocusX}% ${desktopFocusY}%`;
  // Scope the mediaSettings passed to MediaCarousel so it picks up desktop
  // crop + focus rather than phone's. Both desktop modes are cover-cropped.
  const desktopMediaSettings = useMemo(
    () => ({
      ...(mediaSettings || {}),
      fit: "cover",
      focusX: desktopFocusX,
      focusY: desktopFocusY,
    }),
    [mediaSettings, desktopFocusX, desktopFocusY],
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--brand-bg, #05040a)",
        position: "relative",
      }}
    >
      <style>{`
        .desktop-event-right-scroll::-webkit-scrollbar { width: 8px; }
        .desktop-event-right-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.08);
          border-radius: 4px;
        }
        .desktop-event-right-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      <div
        style={{
          maxWidth: "1280px",
          height: "100%",
          margin: "0 auto",
          padding: "32px 28px",
          boxSizing: "border-box",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)",
          gap: "32px",
          alignItems: "stretch",
        }}
      >
        {/* ─── LEFT: hero media, fits the viewport, no scroll ─── */}
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <div
            ref={heroFrameRef}
            style={{
              aspectRatio: heroAspect,
              maxHeight: "100%",
              maxWidth: "100%",
              width: "100%",
              borderRadius: "16px",
              overflow: "hidden",
              position: "relative",
              background:
                "radial-gradient(circle at 30% 30%, rgba(192,192,192,0.08) 0%, transparent 60%), #0a0913",
              border: "1px solid rgba(255,255,255,0.06)",
              userSelect: "none",
            }}
          >
            {media && media.length > 0 ? (
              <div style={{ position: "absolute", inset: 0 }}>
                <MediaCarousel
                  media={media}
                  mediaSettings={desktopMediaSettings}
                  displayWidth={heroWidth}
                />
              </div>
            ) : imagePreview ? (
              <img
                src={transformedImageUrl(imagePreview, { width: heroWidth })}
                alt={title || "Event"}
                draggable={false}
                loading="eager"
                decoding="async"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: fallbackObjectPosition,
                  pointerEvents: "none",
                }}
              />
            ) : null}

            {/* Drag-to-reposition overlay (editor only) */}
            {onFocusDrag && (
              <div
                {...focusDrag.bind}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 4,
                  cursor: focusDrag.dragging ? "grabbing" : "grab",
                  touchAction: "none",
                }}
              />
            )}
          </div>
        </div>

        {/* ─── RIGHT: only thing that scrolls ─── */}
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <div
            ref={rightScrollRef}
            className="desktop-event-right-scroll"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              paddingRight: "4px",
            }}
          >
            <EventPageContent
              title={title}
              description={description}
              location={location}
              startsAt={startsAt}
              timezone={timezone}
              sections={sections}
              hoveredSection={hoveredSection}
              hideLocation={hideLocation}
              hideDate={hideDate}
              revealHint={revealHint}
              dateRevealHint={dateRevealHint}
            />

            {/* Inline RSVP — mirrors mobile, scrolled to from sticky CTA */}
            {rsvpContent && (
              <div
                ref={rsvpSectionRef}
                style={{
                  marginTop: "24px",
                  paddingTop: "20px",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  paddingBottom: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: `${CTA_BAR_HEIGHT}px`,
                    boxSizing: "border-box",
                    padding: "12px 0",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--brand-on-bg, #fff)" }}>
                      {priceLabel}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--brand-on-bg, #fff)",
                        marginTop: "1px",
                        opacity: hideDate ? 0.4 : 0.7,
                      }}
                    >
                      {formattedDate}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginBottom: "16px",
                    paddingBottom: "12px",
                    borderBottom: "1px solid var(--brand-hairline, rgba(255,255,255,0.08))",
                  }}
                >
                  {title && (
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 800,
                        color: "var(--brand-on-bg, #fff)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {title}
                    </div>
                  )}
                  {location && (
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 500,
                        color: "var(--brand-on-bg, #fff)",
                        opacity: 0.5,
                        marginTop: "1px",
                      }}
                    >
                      {formatLocationShort(location)}
                    </div>
                  )}
                </div>

                {typeof rsvpContent === "function"
                  ? rsvpContent({ onClose: () => {} })
                  : rsvpContent}
              </div>
            )}
          </div>

          {/* Pinned bottom CTA — at the foot of the right column */}
          {rsvpContent && (
            <div
              style={{
                flexShrink: 0,
                paddingTop: "12px",
                opacity: rsvpVisible ? 0 : 1,
                pointerEvents: rsvpVisible ? "none" : "auto",
                transition: "opacity 0.25s ease",
              }}
            >
              <div
                style={{
                  height: `${CTA_BAR_HEIGHT}px`,
                  background: "rgba(5, 4, 10, 0.92)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                  padding: "0 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  boxSizing: "border-box",
                  boxShadow: "0 16px 40px rgba(0, 0, 0, 0.5)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>
                    {priceLabel}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.4)",
                      marginTop: "1px",
                    }}
                  >
                    {formattedDate}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={scrollToRsvp}
                  style={{
                    padding: "10px 22px",
                    background: "var(--brand-primary, #fff)",
                    color: "var(--brand-ink-on-primary, #000)",
                    fontFamily: "var(--brand-btn-font, inherit)",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "13px",
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {buttonLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
