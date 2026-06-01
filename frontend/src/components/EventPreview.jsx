import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { formatEventTime } from "../lib/dateUtils.js";
import { formatLocationShort } from "../lib/urlUtils";
import { EventPageContent } from "./EventPageContent";
import { WebGLHero } from "./WebGLHero";
import { SceneFrame } from "./SceneFrame";
import { MediaCarousel, CarouselDots, useCarouselSwipe } from "./MediaCarousel";
import { EventCTA, getCtaLabel, EVENT_CTA_HEIGHT } from "./EventCTA";
import { useHeroFocusDrag } from "./useHeroFocusDrag";
import { transformedImageUrl } from "../lib/imageUtils";

const CTA_BAR_HEIGHT = 62;

export function EventPreview({
  title,
  description,
  location,
  startsAt,
  endsAt,
  imagePreview,
  media,
  mediaSettings,
  ticketType,
  ticketPrice,
  ticketCurrency,
  hideCta,
  compact,
  instagram,
  spotify,
  tiktok,
  soundcloud,
  timezone,
  sections = [],
  design = null,
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
  const [carouselIndex, setCarouselIndex] = useState(0);
  const scrollRef = useRef(null);
  const rsvpSectionRef = useRef(null);
  const heroRef = useRef(null);
  const [rsvpVisible, setRsvpVisible] = useState(false);

  // Observe hero width so we can request appropriately-sized images from
  // Supabase's transform endpoint.
  const [heroWidth, setHeroWidth] = useState(0);
  useEffect(() => {
    if (!heroRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setHeroWidth(Math.round(w));
    });
    ro.observe(heroRef.current);
    return () => ro.disconnect();
  }, []);

  // Phone-scoped fit (used to gate the drag overlay and the fallback img)
  const phoneFit = (mediaSettings?.phone?.fit) || mediaSettings?.fit || "cover";
  const focusDrag = useHeroFocusDrag({
    onDrag: onFocusDrag,
    frameRef: heroRef,
    enabled: !!onFocusDrag && phoneFit === "cover",
  });

  const mediaCount = media?.length || 0;
  const canSwipe = mediaCount > 1 && !mediaSettings?.autoscroll;
  const swipeHandlers = useCarouselSwipe(mediaCount, setCarouselIndex);

  const eventTime = (!hideDate && startsAt) ? formatEventTime(new Date(startsAt), timezone) : "";

  const formattedDate = hideDate ? (dateRevealHint || "Date TBA") : startsAt ? (() => {
    const d = new Date(startsAt);
    const tzOpt = timezone ? { timeZone: timezone } : {};
    const day = d.toLocaleDateString("en-US", { weekday: "short", ...tzOpt });
    const dateNum = d.toLocaleDateString("en-US", { day: "numeric", ...tzOpt });
    const month = d.toLocaleDateString("en-US", { month: "short", ...tzOpt }).toLowerCase();
    return `${day} ${dateNum} ${month}${eventTime ? `, ${eventTime}` : ""}`;
  })() : "";

  // IntersectionObserver: detect when inline RSVP section is visible
  useEffect(() => {
    if (!rsvpSectionRef.current || !rsvpContent) return;
    const observer = new IntersectionObserver(
      ([entry]) => setRsvpVisible(entry.isIntersecting),
      { root: scrollRef.current, threshold: 0.15 },
    );
    observer.observe(rsvpSectionRef.current);
    return () => observer.disconnect();
  }, [rsvpContent]);

  // Auto-scroll to RSVP form on mount (for VIP/waitlist offers)
  useEffect(() => {
    if (autoShowRsvp && rsvpSectionRef.current) {
      setTimeout(() => {
        rsvpSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, [autoShowRsvp]);

  const scrollToRsvp = useCallback(() => {
    rsvpSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Scroll preview when switching between Media/Details
  useEffect(() => {
    if (!scrollRef.current) return;
    if (activeStep === 1) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else if (activeStep === 2) {
      const heroHeight = scrollRef.current.querySelector("[data-hero]")?.offsetHeight;
      if (heroHeight) {
        scrollRef.current.scrollTo({ top: heroHeight, behavior: "smooth" });
      }
    }
  }, [activeStep]);

  // Scroll preview to hovered section
  useEffect(() => {
    if (hoveredSection === null || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-section-index="${hoveredSection}"]`);
    if (!el) return;
    const container = scrollRef.current;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offsetInContainer = elRect.top - containerRect.top + container.scrollTop;
    const target = offsetInContainer - containerRect.height * 0.3;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [hoveredSection]);

  const buttonLabel = getCtaLabel({ ticketType, ticketPrice, ticketCurrency, instantWaitlist });
  const hasContent = description || (sections && sections.length > 0);

  return (
    <>
      <style>{`
        @keyframes scroll-chevron {
          0% { opacity: 0; transform: translateY(-4px); }
          30% { opacity: 0.6; }
          60% { opacity: 0.6; }
          100% { opacity: 0; transform: translateY(6px); }
        }
        .event-preview-scroll-container {
        }
        .event-preview-scroll-container::-webkit-scrollbar { display: none; }
      `}</style>
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "100%",
          height: "100%",
          overflow: "hidden",
          background: "var(--brand-bg, #05040a)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="event-preview-scroll-container"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {/* ─── HERO SECTION ─── */}
          <div
            ref={heroRef}
            data-hero
            {...(canSwipe && !(onFocusDrag && phoneFit === "cover") ? swipeHandlers : {})}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              minHeight: "100%",
              flexShrink: 0,
              cursor: focusDrag.dragging
                ? "grabbing"
                : (onFocusDrag && phoneFit === "cover")
                  ? "grab"
                  : (canSwipe ? "grab" : undefined),
              userSelect: "none",
              touchAction: onFocusDrag && phoneFit === "cover" ? "none" : "pan-y",
            }}
          >
            {(() => {
              // Design archetype overrides the media hero with a generative
              // render (same component in editor preview and live page).
              if (design?.archetype === "webgl") {
                return <WebGLHero params={design.params || {}} />;
              }
              // Generative scene: AI-authored animated hero, sandboxed.
              if (design?.archetype === "scene") {
                return (
                  <SceneFrame
                    html={design.html}
                    poster={design.poster || imagePreview || null}
                    palette={design.params?.colors || null}
                  />
                );
              }
              // Phone view uses mediaSettings.phone.fit/focusX/focusY (with
              // legacy fallback to top-level fit/focus on old events).
              const phoneFormat = mediaSettings?.phone || {};
              const fit = phoneFormat.fit || mediaSettings?.fit || "cover";
              const legacyY = mediaSettings?.focus === "top"
                ? 0
                : mediaSettings?.focus === "bottom"
                  ? 100
                  : 50;
              const focusX = typeof phoneFormat.focusX === "number" ? phoneFormat.focusX : 50;
              const focusY = typeof phoneFormat.focusY === "number" ? phoneFormat.focusY : legacyY;
              const phoneMediaSettings = {
                ...(mediaSettings || {}),
                fit,
                focusX,
                focusY,
              };
              const objectFit = fit === "contain" ? "contain" : "cover";
              const objectPosition = `${focusX}% ${focusY}%`;
              // Real (contain) mode on phone: inset the media so it floats with
              // visible black framing on all sides — makes the native aspect feel
              // intentional, and wide media reads as "small inside the frame".
              const mediaInset = fit === "contain" ? "32px" : 0;
              if (media && media.length > 0) {
                return (
                  <div style={{ position: "absolute", inset: mediaInset, zIndex: 0 }}>
                    <MediaCarousel
                      media={media}
                      mediaSettings={phoneMediaSettings}
                      hideDots
                      controlledIndex={canSwipe ? carouselIndex : undefined}
                      onIndexChange={setCarouselIndex}
                      displayWidth={heroWidth}
                    />
                  </div>
                );
              }
              if (imagePreview) {
                return (
                  <div style={{ position: "absolute", inset: mediaInset, zIndex: 0 }}>
                    <img
                      src={transformedImageUrl(imagePreview, { width: heroWidth })}
                      alt="Event preview"
                      draggable={false}
                      loading="eager"
                      decoding="async"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit,
                        objectPosition,
                        display: "block",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                );
              }
              return (
                <div style={{
                  position: "absolute", inset: 0, zIndex: 0,
                  background: "radial-gradient(circle at 20% 50%, rgba(192,192,192,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232,232,232,0.06) 0%, transparent 50%), var(--brand-bg, #05040a)",
                }} />
              );
            })()}

            {/* Drag-to-reposition overlay (editor only, when Fit is on) */}
            {onFocusDrag && phoneFit === "cover" && (
              <div
                {...focusDrag.bind}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 4,
                  cursor: focusDrag.dragging ? "grabbing" : "grab",
                }}
              />
            )}

            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
              background: "linear-gradient(to bottom, transparent 0%, rgba(5,4,10,0.6) 60%, var(--brand-bg, #05040a) 100%)",
              pointerEvents: "none", zIndex: 1,
            }} />

            {media && media.length > 1 && !mediaSettings?.autoscroll && (
              <div style={{
                position: "absolute", bottom: `${CTA_BAR_HEIGHT + 60}px`, left: 0, right: 0,
                zIndex: 2, pointerEvents: "none",
              }}>
                <CarouselDots count={media.length} currentIndex={carouselIndex} />
              </div>
            )}

            {hasContent && (
              <div style={{
                position: "absolute", bottom: `${CTA_BAR_HEIGHT + 16}px`, left: "50%", transform: "translateX(-50%)",
                zIndex: 3, pointerEvents: "none",
                display: "flex", flexDirection: "column", alignItems: "center",
              }}>
                {[0, 1, 2].map((i) => (
                  <ChevronDown key={i} size={22} color="#fff" style={{
                    opacity: 0,
                    animation: `scroll-chevron 1.8s ease-in-out ${i * 0.2}s infinite`,
                    marginTop: i > 0 ? "-8px" : 0,
                  }} />
                ))}
              </div>
            )}
          </div>

          {/* ─── CONTENT SECTION ─── */}
          <div style={{
            background: "var(--brand-bg, #05040a)",
            padding: `28px 20px ${rsvpContent ? "8px" : `${CTA_BAR_HEIGHT}px`}`,
            minHeight: hasContent ? "40%" : undefined,
          }}>
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
          </div>

          {/* ─── INLINE RSVP SECTION ─── */}
          {rsvpContent && (
            <div
              ref={rsvpSectionRef}
              style={{
                background: "var(--brand-bg, #05040a)",
                padding: `0 20px max(20px, env(safe-area-inset-bottom, 20px))`,
              }}
            >
              {/* Price/date row — same as the fixed CTA bar, now inline */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: `${CTA_BAR_HEIGHT}px`,
                boxSizing: "border-box",
                padding: "12px 0",
                borderTop: "1px solid var(--brand-hairline, rgba(255, 255, 255, 0.08))",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--brand-on-bg, #fff)" }}>
                    {ticketType === "paid" && ticketPrice
                      ? `${(ticketPrice / 100).toLocaleString()} ${(ticketCurrency || "sek").toUpperCase()}`
                      : "Free entry"}
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--brand-on-bg, #fff)", opacity: 0.7, marginTop: "1px" }}>
                    {formattedDate}
                  </div>
                </div>
              </div>

              {/* Title/location + form */}
              <div style={{ marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid var(--brand-hairline, rgba(255,255,255,0.08))" }}>
                {title && <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--brand-on-bg, #fff)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>}
                {location && <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--brand-on-bg, #fff)", opacity: 0.5, marginTop: "1px" }}>{formatLocationShort(location)}</div>}
              </div>
              {typeof rsvpContent === "function" ? rsvpContent({ onClose: () => {} }) : rsvpContent}
            </div>
          )}
        </div>

        {/* ─── FIXED CTA BAR — disappears when RSVP section is in view ─── */}
        {!hideCta && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 10,
              height: `${CTA_BAR_HEIGHT}px`,
              background: "rgba(5, 4, 10, 0.96)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              padding: "0 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxSizing: "border-box",
              opacity: rsvpVisible ? 0 : 1,
              pointerEvents: rsvpVisible ? "none" : "auto",
              transition: "opacity 0.25s ease",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>
                {ticketType === "paid" && ticketPrice
                  ? `${(ticketPrice / 100).toLocaleString()} ${(ticketCurrency || "sek").toUpperCase()}`
                  : "Free entry"}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.4)", marginTop: "1px" }}>
                {formattedDate}
              </div>
            </div>
            <button
              type="button"
              disabled={!rsvpContent}
              onClick={rsvpContent ? scrollToRsvp : undefined}
              style={{
                padding: "12px 24px",
                background: "var(--brand-primary, #fff)", color: "var(--brand-ink-on-primary, #000)", border: "none", borderRadius: "4px",
                fontFamily: "var(--brand-btn-font, inherit)",
                fontSize: "14px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                cursor: !rsvpContent ? "not-allowed" : "pointer",
                opacity: !rsvpContent ? 0.5 : 1,
                flexShrink: 0, whiteSpace: "nowrap",
              }}
            >
              {buttonLabel}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
