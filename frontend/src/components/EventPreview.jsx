import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { formatEventTime } from "../lib/dateUtils.js";
import { formatLocationShort } from "../lib/urlUtils";
import { EventPageContent } from "./EventPageContent";
import { MediaCarousel, CarouselDots, useCarouselSwipe } from "./MediaCarousel";
import { EventCTA, getCtaLabel, EVENT_CTA_HEIGHT } from "./EventCTA";
import { useStickyReveal } from "./useStickyReveal";

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
  hideLocation = false,
  rsvpContent,
  autoShowRsvp = false,
  activeStep,
}) {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const scrollRef = useRef(null);

  const ctaBarRef = useRef(null);
  const {
    sentinelRef,
    formRef,
    revealPx: rsvpRevealPx,
    isRevealed: formRevealed,
    scrollToPanel: scrollToRsvp,
    spacerHeight,
    barStyle,
    barScrollHandlers,
  } = useStickyReveal({
    scrollRef,
    barHeight: CTA_BAR_HEIGHT,
    enabled: !!rsvpContent,
    autoShow: autoShowRsvp,
    contentKey: rsvpContent,
  });

  const mediaCount = media?.length || 0;
  const canSwipe = mediaCount > 1 && !mediaSettings?.autoscroll;
  const swipeHandlers = useCarouselSwipe(mediaCount, setCarouselIndex);

  const eventTime = startsAt ? formatEventTime(new Date(startsAt), timezone) : "";

  const formattedDate = startsAt ? (() => {
    const d = new Date(startsAt);
    const tzOpt = timezone ? { timeZone: timezone } : {};
    const day = d.toLocaleDateString("en-US", { weekday: "short", ...tzOpt });
    const dateNum = d.toLocaleDateString("en-US", { day: "numeric", ...tzOpt });
    const month = d.toLocaleDateString("en-US", { month: "short", ...tzOpt }).toLowerCase();
    return `${day} ${dateNum} ${month}${eventTime ? `, ${eventTime}` : ""}`;
  })() : "";

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

  const buttonLabel = getCtaLabel({ ticketType, ticketPrice, ticketCurrency });
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
          background: "#05040a",
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
            data-hero
            {...(canSwipe ? swipeHandlers : {})}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              minHeight: "100%",
              flexShrink: 0,
                            cursor: canSwipe ? "grab" : undefined,
            }}
          >
            {media && media.length > 0 ? (
              <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                <MediaCarousel media={media} mediaSettings={mediaSettings} hideDots controlledIndex={canSwipe ? carouselIndex : undefined} onIndexChange={setCarouselIndex} />
              </div>
            ) : imagePreview ? (
              <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                <img src={imagePreview} alt="Event preview" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
            ) : (
              <div style={{
                position: "absolute", inset: 0, zIndex: 0,
                background: "radial-gradient(circle at 20% 50%, rgba(192,192,192,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232,232,232,0.06) 0%, transparent 50%), #05040a",
              }} />
            )}

            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
              background: "linear-gradient(to bottom, transparent 0%, rgba(5,4,10,0.6) 60%, #05040a 100%)",
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
            background: "#05040a",
            padding: `28px 20px ${CTA_BAR_HEIGHT}px`,
            minHeight: hasContent ? "40%" : undefined,
          }}>
            <EventPageContent
              title={title}
              description={description}
              location={location}
              startsAt={startsAt}
              timezone={timezone}
              sections={sections}
              hideLocation={hideLocation}
            />
          </div>

          {/* ─── RSVP SCROLL SPACER ─── */}
          {rsvpContent && (
            <div
              ref={sentinelRef}
              style={{ height: spacerHeight }}
            />
          )}
        </div>

        {/* ─── FIXED CTA — one single unit, clips from bottom ─── */}
        {!hideCta && (
          <div
            ref={ctaBarRef}
            {...barScrollHandlers}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 10,
              background: "rgba(5, 4, 10, 0.96)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              overflowX: "hidden",
              ...barStyle,
            }}
          >
            {/* Everything is one ref'd unit */}
            <div ref={formRef} style={{ padding: "0 20px" }}>
              {/* Row 1: Price/date + Register button */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: `${CTA_BAR_HEIGHT}px`,
                boxSizing: "border-box",
                padding: "12px 0",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>
                    {ticketType === "paid" && ticketPrice
                      ? `${(ticketPrice / 100).toLocaleString()} ${(ticketCurrency || "sek").toUpperCase()}`
                      : "Free entry"}
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: formRevealed ? "#a3e635" : "rgba(255,255,255,0.4)", marginTop: "1px" }}>
                    {formattedDate}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!rsvpContent}
                  onClick={rsvpContent ? scrollToRsvp : undefined}
                  style={{
                    padding: "12px 24px",
                    background: "#fff", color: "#000", border: "none", borderRadius: "999px",
                    fontSize: "14px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                    cursor: !rsvpContent ? "not-allowed" : "pointer",
                    opacity: formRevealed ? 0 : (!rsvpContent ? 0.5 : 1),
                    visibility: formRevealed ? "hidden" : "visible",
                    flexShrink: 0, whiteSpace: "nowrap",
                    pointerEvents: formRevealed ? "none" : "auto",
                  }}
                >
                  {buttonLabel}
                </button>
              </div>

              {/* Row 2+: Title, location, form fields — all one continuous block */}
              <div style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))" }}>
                <div style={{ marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {title && <div style={{ fontSize: "14px", fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>}
                  {location && <div style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.4)", marginTop: "1px" }}>{formatLocationShort(location)}</div>}
                </div>
                {typeof rsvpContent === "function" ? rsvpContent({ onClose: () => {} }) : rsvpContent}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
