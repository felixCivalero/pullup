import { useState, useRef, useEffect } from "react";
import { FaPaperPlane, FaCalendar, FaMapMarkerAlt, FaInstagram, FaSpotify, FaTiktok, FaSoundcloud } from "react-icons/fa";
import { formatEventDate, formatEventTime } from "../lib/dateUtils.js";
import { formatLocationShort } from "../lib/urlUtils";
import { Button } from "./ui/Button";
import { MediaCarousel, CarouselDots, useCarouselSwipe } from "./MediaCarousel";

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

  const buttonLabel = (() => {
    if (ticketType === "paid" && ticketPrice) {
      const currency = (ticketCurrency || "usd").toLowerCase();
      const symbol =
        currency === "sek"
          ? "kr"
          : currency === "eur"
            ? "\u20ac"
            : currency === "gbp"
              ? "\u00a3"
              : "$";
      const amount = (ticketPrice / 100).toFixed(2);
      return `Pull up \u2014 from ${symbol}${amount}`;
    }
    return "Pull up";
  })();

  return (
    <>
      <style>{`
        .event-preview-container {
          min-height: 100%;
          height: 100%;
          overflow: hidden;
        }
        .event-preview-content {
          height: calc(100% - 90px);
          max-height: calc(100% - 90px);
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
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background:
                  "linear-gradient(to bottom, transparent 0%, transparent 40%, rgba(5, 4, 10, 0.3) 60%, rgba(5, 4, 10, 0.7) 75%, #05040a 100%)",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
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
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background:
                  "linear-gradient(to bottom, transparent 0%, transparent 40%, rgba(5, 4, 10, 0.3) 60%, rgba(5, 4, 10, 0.7) 75%, #05040a 100%)",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
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
          {/* Title at the top */}
          <h1
            style={{
              fontSize: "clamp(28px, 8vw, 40px)",
              fontWeight: 800,
              lineHeight: "1.2",
              color: title ? "#fff" : "rgba(255,255,255,0.3)",
              letterSpacing: "-0.02em",
              margin: 0,
              marginTop: "20px",
              marginBottom: "0",
              paddingBottom: "12px",
              flexShrink: 0,
            }}
          >
            {title || "Event Name"}
          </h1>

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
              <FaPaperPlane
                size={20}
                style={{ color: "rgba(255, 255, 255, 0.8)" }}
              />
              {instagram && (
                <a
                  href={instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "rgba(255, 255, 255, 0.8)", display: "inline-flex" }}
                >
                  <FaInstagram size={20} />
                </a>
              )}
              {spotify && (
                <a
                  href={spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "rgba(255, 255, 255, 0.8)", display: "inline-flex" }}
                >
                  <FaSpotify size={20} />
                </a>
              )}
              {tiktok && (
                <a
                  href={tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "rgba(255, 255, 255, 0.8)", display: "inline-flex" }}
                >
                  <FaTiktok size={20} />
                </a>
              )}
              {soundcloud && (
                <a
                  href={soundcloud}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "rgba(255, 255, 255, 0.8)", display: "inline-flex" }}
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
                  ? "rgba(255, 255, 255, 0.9)"
                  : "rgba(255,255,255,0.3)",
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
                    ? "rgba(255, 255, 255, 0.7)"
                    : "rgba(255,255,255,0.2)",
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
                  ? "rgba(255, 255, 255, 0.9)"
                  : "rgba(255,255,255,0.3)",
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
                    ? "rgba(255, 255, 255, 0.7)"
                    : "rgba(255,255,255,0.2)",
                }}
              />
              <span
                style={{
                  borderBottom: location
                    ? "1px solid rgba(255, 255, 255, 0.3)"
                    : "none",
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
                    color: "rgba(255, 255, 255, 0.85)",
                    margin: 0,
                    marginBottom: showDescription ? "4px" : "0",
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
                    color: "rgba(229, 229, 229, 0.8)",
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

        {/* Sticky CTA Button — matches EventPage */}
        {!hideCta && <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "16px 20px",
            paddingBottom: "max(16px, env(safe-area-inset-bottom))",
            background:
              "linear-gradient(to top, #05040a 0%, rgba(5, 4, 10, 0.98) 70%, transparent 100%)",
            backdropFilter: "blur(20px)",
            zIndex: 100,
            boxSizing: "border-box",
            width: "100%",
          }}
        >
          <Button
            fullWidth
            size="lg"
            disabled={!rsvpContent}
            onClick={rsvpContent ? () => setShowRsvp(true) : undefined}
          >
            {buttonLabel}
          </Button>
        </div>}

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
