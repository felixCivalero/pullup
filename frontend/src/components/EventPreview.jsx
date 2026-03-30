import { useState, useRef, useEffect } from "react";
import { FaCalendar, FaMapMarkerAlt, FaInstagram, FaSpotify, FaTiktok, FaSoundcloud } from "react-icons/fa";
import { formatEventDate, formatEventTime } from "../lib/dateUtils.js";
import { formatLocationShort } from "../lib/urlUtils";
import { MediaCarousel, CarouselDots, useCarouselSwipe } from "./MediaCarousel";
import { EventCTA, getCtaLabel, EVENT_CTA_HEIGHT } from "./EventCTA";

const TITLE_FONTS = {
  default: "inherit",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', 'Consolas', monospace",
  condensed: "'Arial Narrow', 'Impact', sans-serif",
};

const TITLE_SIZES = {
  sm: "clamp(20px, 6vw, 28px)",
  md: "clamp(28px, 8vw, 40px)",
  lg: "clamp(36px, 10vw, 52px)",
};

export function EventPreview({
  title,
  titleVisible = true,
  titleAlign = "left",
  titleFont = "default",
  titleSize = "md",
  titleColor = "#ffffff",
  detailsColor = "#ffffff",
  detailsGradient = null,
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
  rsvpContent,
}) {
  const [showDescription, setShowDescription] = useState(false);
  const [showRsvp, setShowRsvp] = useState(false);
  const [rsvpVisible, setRsvpVisible] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const rsvpSheetRef = useRef(null);
  const mediaCount = media?.length || 0;
  const canSwipe = mediaCount > 1 && !mediaSettings?.autoscroll;
  const swipeHandlers = useCarouselSwipe(mediaCount, setCarouselIndex);

  const eventDate = startsAt ? formatEventDate(new Date(startsAt), timezone) : "";
  const eventTime = startsAt ? formatEventTime(new Date(startsAt), timezone) : "";

  // Animate the RSVP sheet in/out
  useEffect(() => {
    if (showRsvp) {
      // Mount then animate in
      setRsvpVisible(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setRsvpVisible(true));
      });
    }
  }, [showRsvp]);

  function closeRsvp() {
    setRsvpVisible(false);
    setTimeout(() => setShowRsvp(false), 300);
  }

  const buttonLabel = getCtaLabel({ ticketType, ticketPrice, ticketCurrency });

  return (
    <>
      <style>{`
        .event-preview-container {
          min-height: 100%;
          height: 100%;
          overflow: hidden;
        }
        .event-preview-content {
          height: calc(100% - ${EVENT_CTA_HEIGHT}px);
          max-height: calc(100% - ${EVENT_CTA_HEIGHT}px);
          box-sizing: border-box;
        }
        @media (min-width: 969px) {
          .event-preview-description {
            max-width: 60%;
          }
        }
      `}</style>
      <div
        className="event-preview-container"
        {...(canSwipe ? swipeHandlers : {})}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "100%",
          overflowX: "hidden",
          overflowY: "hidden",
          background: "#05040a",
          cursor: canSwipe ? "grab" : undefined,
        }}
      >
        {/* Background — carousel or single image */}
        {media && media.length > 0 ? (
          <>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: "100%",
                height: "100%",
                zIndex: 0,
              }}
            >
              <MediaCarousel media={media} mediaSettings={mediaSettings} hideDots controlledIndex={canSwipe ? carouselIndex : undefined} onIndexChange={setCarouselIndex} />
            </div>
          </>
        ) : imagePreview ? (
          <>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: "100%",
                height: "100%",
                zIndex: 0,
              }}
            >
              <img
                src={imagePreview}
                alt="Event preview"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>
          </>
        ) : (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background:
                "radial-gradient(circle at 20% 50%, rgba(192, 192, 192, 0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 232, 232, 0.06) 0%, transparent 50%), #05040a",
              zIndex: 0,
            }}
          />
        )}

        {/* Details gradient background — between bg image and content */}
        {detailsGradient && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "55%",
              background: `linear-gradient(to bottom, ${detailsGradient}00 0%, ${detailsGradient}80 15%, ${detailsGradient}cc 30%, ${detailsGradient} 50%, ${detailsGradient} 100%)`,
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        )}

        {/* Content — matches EventPage .event-content-container */}
        <div
          className={hideCta ? undefined : "event-preview-content"}
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            padding: "20px",
            overflow: "hidden",
            pointerEvents: "none",
            ...(hideCta
              ? { height: "100%", maxHeight: "100%", boxSizing: "border-box" }
              : {}),
          }}
        >
          {/* Title at the top — only shown when set and visible */}
          {title && titleVisible && (
            <h1
              style={{
                fontSize: TITLE_SIZES[titleSize] || TITLE_SIZES.md,
                fontWeight: titleFont === "condensed" ? 900 : 800,
                lineHeight: "1.2",
                color: titleColor || "#fff",
                letterSpacing: titleFont === "mono" ? "0" : titleFont === "condensed" ? "0.02em" : "-0.02em",
                fontFamily: TITLE_FONTS[titleFont] || TITLE_FONTS.default,
                textAlign: titleAlign,
                margin: 0,
                marginTop: "20px",
                marginBottom: "0",
                paddingBottom: "12px",
                flexShrink: 0,
              }}
            >
              {title}
            </h1>
          )}

          {/* Content group pushed to bottom — matches EventPage */}
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              flexDirection: "column",
              pointerEvents: "auto",
            }}
          >
            {/* Carousel dots — above share row, visible in the content zone */}
            {media && media.length > 1 && !mediaSettings?.autoscroll && (
              <CarouselDots
                count={media.length}
                currentIndex={carouselIndex}
                style={{ paddingTop: "12px", paddingBottom: "4px" }}
              />
            )}

            {/* Share icon row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                marginBottom: "12px",
                flexShrink: 0,
                paddingTop: "16px",
              }}
            >
              {instagram && (
                <a
                  href={instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: detailsColor, opacity: 0.8, display: "inline-flex" }}
                >
                  <FaInstagram size={20} />
                </a>
              )}
              {spotify && (
                <a
                  href={spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: detailsColor, opacity: 0.8, display: "inline-flex" }}
                >
                  <FaSpotify size={20} />
                </a>
              )}
              {tiktok && (
                <a
                  href={tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: detailsColor, opacity: 0.8, display: "inline-flex" }}
                >
                  <FaTiktok size={20} />
                </a>
              )}
              {soundcloud && (
                <a
                  href={soundcloud}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: detailsColor, opacity: 0.8, display: "inline-flex" }}
                >
                  <FaSoundcloud size={20} />
                </a>
              )}
            </div>

            {/* Date & Time */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                marginBottom: "12px",
                fontSize: "16px",
                lineHeight: "1.4",
                color: eventDate
                  ? detailsColor
                  : "rgba(255,255,255,0.3)",
                opacity: eventDate ? 0.9 : 1,
              }}
            >
              <FaCalendar
                size={18}
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  marginTop: "1px",
                  color: eventDate
                    ? detailsColor
                    : "rgba(255,255,255,0.2)",
                  opacity: eventDate ? 0.7 : 1,
                }}
              />
              <span>
                {eventDate
                  ? `${eventDate}${eventTime ? ` at ${eventTime}` : ""}`
                  : "When is it?"}
              </span>
            </div>

            {/* Location */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                marginBottom: "12px",
                fontSize: "16px",
                lineHeight: "1.4",
                color: location
                  ? detailsColor
                  : "rgba(255,255,255,0.3)",
                opacity: location ? 0.9 : 1,
              }}
            >
              <FaMapMarkerAlt
                size={18}
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  marginTop: "1px",
                  color: location
                    ? detailsColor
                    : "rgba(255,255,255,0.2)",
                  opacity: location ? 0.7 : 1,
                }}
              />
              <span
                style={{
                  borderBottom: location
                    ? `1px solid ${detailsColor}`
                    : "none",
                  opacity: location ? 0.7 : 1,
                }}
              >
                {location ? formatLocationShort(location) : "Where is it?"}
              </span>
            </div>

            {/* Description */}
            {description && (
              <div
                style={{
                  paddingTop: "16px",
                }}
              >
                <p
                  className={compact ? undefined : "event-preview-description"}
                  style={{
                    fontSize: "16px",
                    lineHeight: "1.5",
                    color: detailsColor,
                    opacity: 0.85,
                    margin: 0,
                    marginBottom: showDescription ? "4px" : "0",
                    whiteSpace: "pre-line",
                    wordWrap: "break-word",
                    overflowWrap: "break-word",
                    display: showDescription ? "block" : "-webkit-box",
                    WebkitLineClamp: showDescription ? "none" : 2,
                    WebkitBoxOrient: "vertical",
                    overflow: showDescription ? "visible" : "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {description}
                </p>
                <button
                  type="button"
                  onClick={() => setShowDescription(!showDescription)}
                  style={{
                    background: "none",
                    border: "none",
                    color: detailsColor,
                    opacity: 0.8,
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: "pointer",
                    padding: "4px 0",
                    margin: "4px 0 0 0",
                    textDecoration: "none",
                    display: "inline-block",
                    WebkitTapHighlightColor: "transparent",
                    flexShrink: 0,
                  }}
                >
                  {showDescription ? "Read less" : "Read more"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sticky CTA Button — shared with EventPage */}
        {!hideCta && (
          <EventCTA
            label={buttonLabel}
            disabled={!rsvpContent}
            onClick={rsvpContent ? () => setShowRsvp(true) : undefined}
            bgColor={detailsGradient}
          />
        )}

        {/* Inline RSVP bottom-sheet — scoped to the preview container */}
        {showRsvp && rsvpContent && (
          <>
            {/* Backdrop */}
            <div
              onClick={closeRsvp}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: rsvpVisible ? "rgba(0, 0, 0, 0.5)" : "transparent",
                backdropFilter: rsvpVisible ? "blur(4px)" : "none",
                zIndex: 200,
                transition: "background 0.3s ease, backdrop-filter 0.3s ease",
              }}
            />
            {/* Bottom sheet */}
            <div
              ref={rsvpSheetRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "rgba(12, 10, 18, 0.97)",
                backdropFilter: "blur(20px)",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                borderTopLeftRadius: "20px",
                borderTopRightRadius: "20px",
                maxHeight: "85%",
                overflowY: "auto",
                zIndex: 201,
                padding: "20px",
                paddingTop: "12px",
                boxSizing: "border-box",
                transform: rsvpVisible ? "translateY(0)" : "translateY(100%)",
                transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              {/* Handle — tap to close */}
              <div
                onClick={closeRsvp}
                style={{
                  padding: "8px 0 16px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <div style={{
                  width: "36px",
                  height: "4px",
                  background: "rgba(255, 255, 255, 0.2)",
                  borderRadius: "2px",
                }} />
              </div>
              {/* Form content */}
              {typeof rsvpContent === "function" ? rsvpContent({ onClose: closeRsvp }) : rsvpContent}
            </div>
          </>
        )}
      </div>
    </>
  );
}
