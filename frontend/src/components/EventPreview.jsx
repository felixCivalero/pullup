import { useState, useRef, useEffect, useCallback } from "react";
import { FaCalendar, FaMapMarkerAlt, FaInstagram, FaSpotify, FaTiktok, FaSoundcloud } from "react-icons/fa";
import { ChevronDown } from "lucide-react";
import { formatEventDate, formatEventTime } from "../lib/dateUtils.js";
import { formatLocationShort } from "../lib/urlUtils";
import { MediaCarousel, CarouselDots, useCarouselSwipe } from "./MediaCarousel";
import { EventCTA, getCtaLabel, EVENT_CTA_HEIGHT } from "./EventCTA";

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
  rsvpContent,
  autoShowRsvp = false,
  activeStep,
}) {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [rsvpRevealPx, setRsvpRevealPx] = useState(0); // actual pixels to reveal
  const [formHeight, setFormHeight] = useState(0); // track actual form height
  const scrollRef = useRef(null);
  const rsvpSentinelRef = useRef(null);
  const rsvpFormRef = useRef(null);
  const ctaBarRef = useRef(null);
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

  // Track scroll to calculate how much to reveal the RSVP form
  const handleScroll = useCallback(() => {
    if (!rsvpSentinelRef.current || !scrollRef.current || !rsvpFormRef.current) {
      setRsvpReveal(0);
      return;
    }
    const container = scrollRef.current;
    const sentinel = rsvpSentinelRef.current;
    const sentinelRect = sentinel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const formHeight = rsvpFormRef.current.scrollHeight || 300;

    // How far the sentinel top is above the container bottom (the CTA bar position)
    // Subtract CTA_BAR_HEIGHT so we only trigger once sentinel clears the bar
    const distancePastTrigger = containerRect.bottom - sentinelRect.top - CTA_BAR_HEIGHT;

    if (distancePastTrigger <= 0) {
      setRsvpRevealPx(0);
    } else {
      // 1:1 mapping — each pixel scrolled reveals one pixel of form
      setRsvpRevealPx(distancePastTrigger);
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Track form height dynamically (dinner slots, plus ones can change it)
  useEffect(() => {
    if (!rsvpFormRef.current) return;
    const ro = new ResizeObserver(() => {
      // Form content height + extra for the expanded header (title + location + date + price ≈ 80px)
      if (rsvpFormRef.current) setFormHeight(rsvpFormRef.current.scrollHeight);
    });
    ro.observe(rsvpFormRef.current);
    return () => ro.disconnect();
  }, [rsvpContent]);

  // Auto-scroll to RSVP
  useEffect(() => {
    if (autoShowRsvp && rsvpSentinelRef.current) {
      setTimeout(() => {
        rsvpSentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, [autoShowRsvp]);

  function scrollToRsvp() {
    if (rsvpSentinelRef.current) {
      rsvpSentinelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const buttonLabel = getCtaLabel({ ticketType, ticketPrice, ticketCurrency });
  const hasContent = description || (sections && sections.length > 0);
  const formRevealed = rsvpRevealPx > 0;

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
            padding: "28px 20px 0",
            minHeight: hasContent ? "40%" : undefined,
                      }}>
            {(!sections || sections.length === 0) && (
              <>
                {title && <h1 style={{ fontSize: "clamp(22px, 6vw, 30px)", fontWeight: 800, lineHeight: "1.2", color: "#fff", margin: "0 0 12px 0" }}>{title}</h1>}
                {location && <div style={{ fontSize: "14px", fontWeight: 500, color: "#fff", opacity: 0.6, marginBottom: "4px" }}>{formatLocationShort(location)}</div>}
                {formattedDate && <div style={{ fontSize: "14px", fontWeight: 600, color: "#a3e635", marginBottom: "20px" }}>{formattedDate}</div>}
                {description && <div style={{ marginBottom: "24px" }}><p style={{ fontSize: "15px", lineHeight: "1.6", color: "#fff", opacity: 0.85, margin: 0, whiteSpace: "pre-line", wordWrap: "break-word", overflowWrap: "break-word" }}>{description}</p></div>}
              </>
            )}

            {sections && sections.map((section, i) => (
              <div key={i} style={{ marginBottom: section.type === "location" ? "4px" : "16px" }}>
                {section.type === "title" ? (
                  title ? <h1 style={{ fontSize: "clamp(22px, 6vw, 30px)", fontWeight: 800, lineHeight: "1.2", color: "#fff", margin: 0 }}>{title}</h1> : null
                ) : section.type === "location" ? (
                  location ? <div style={{ fontSize: "14px", fontWeight: 500, color: "#fff", opacity: 0.6 }}>{formatLocationShort(location)}</div> : null
                ) : section.type === "datetime" ? (
                  formattedDate ? <div style={{ fontSize: "14px", fontWeight: 600, color: "#a3e635" }}>{formattedDate}</div> : null
                ) : section.type === "spotify" && section.url && section.url.includes("spotify.com") ? (
                  <iframe src={section.url.replace("spotify.com/", "spotify.com/embed/").split("?")[0]} width="100%" height={section.url.includes("/track/") ? "80" : "152"} frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style={{ borderRadius: "12px", border: "none" }} />
                ) : section.type === "socials" ? (
                  <div style={{ display: "flex", gap: "14px" }}>
                    {section.instagram && <a href={section.instagram} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", opacity: 0.6, display: "inline-flex" }}><FaInstagram size={18} /></a>}
                    {section.spotify && <a href={section.spotify} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", opacity: 0.6, display: "inline-flex" }}><FaSpotify size={18} /></a>}
                    {section.tiktok && <a href={section.tiktok} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", opacity: 0.6, display: "inline-flex" }}><FaTiktok size={18} /></a>}
                    {section.soundcloud && <a href={section.soundcloud} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", opacity: 0.6, display: "inline-flex" }}><FaSoundcloud size={18} /></a>}
                  </div>
                ) : (
                  <>
                    {section.title && <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", margin: "0 0 8px 0", textTransform: "uppercase", letterSpacing: "0.04em" }}>{section.title}</h3>}
                    {section.text && <p style={{ fontSize: "15px", lineHeight: "1.6", color: "#fff", opacity: 0.8, margin: 0, whiteSpace: "pre-line", wordWrap: "break-word", overflowWrap: "break-word" }}>{section.text}</p>}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* ─── RSVP SCROLL SPACER ─── */}
          {rsvpContent && (
            <div
              ref={rsvpSentinelRef}
              style={{
                height: formHeight > 0 ? `${formHeight + 20}px` : "50vh",
              }}
            />
          )}
        </div>

        {/* ─── FIXED CTA BAR — always at bottom, grows upward to reveal form ─── */}
        {!hideCta && (
          <div
            ref={ctaBarRef}
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
              display: "flex",
              flexDirection: "column",
              maxHeight: "55vh",
            }}
          >
            {/* Header — event info + price, matches content section */}
            <div
              onWheel={(e) => {
                if (scrollRef.current) scrollRef.current.scrollTop += e.deltaY;
              }}
              style={{
                padding: "12px 20px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>
                  {ticketType === "paid" && ticketPrice
                    ? `${(ticketPrice / 100).toLocaleString()} ${(ticketCurrency || "sek").toUpperCase()}`
                    : "Free entry"}
                </div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: rsvpRevealPx > 20 ? "#a3e635" : "rgba(255,255,255,0.4)", marginTop: "1px" }}>
                  {formattedDate}
                </div>
              </div>
              {/* Compact REGISTER button — visible only when form is collapsed */}
              <button
                type="button"
                disabled={!rsvpContent}
                onClick={rsvpContent ? scrollToRsvp : undefined}
                style={{
                  padding: "12px 24px",
                  background: "#fff", color: "#000", border: "none", borderRadius: "999px",
                  fontSize: "14px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                  cursor: !rsvpContent ? "not-allowed" : "pointer",
                  opacity: rsvpRevealPx > 20 ? 0 : (!rsvpContent ? 0.5 : 1),
                  flexShrink: 0, whiteSpace: "nowrap",
                  pointerEvents: rsvpRevealPx > 20 ? "none" : "auto",
                  position: rsvpRevealPx > 20 ? "absolute" : "relative",
                  right: rsvpRevealPx > 20 ? "20px" : undefined,
                }}
              >
                {buttonLabel}
              </button>
            </div>

            {/* Form fields — expand from below the price/date row */}
            <div style={{
              overflow: "hidden",
              height: `${rsvpRevealPx}px`,
              maxHeight: "calc(55vh - 62px)",
              opacity: rsvpRevealPx > 5 ? Math.min(rsvpRevealPx / 40, 1) : 0,
              overflowY: formHeight > 0 && rsvpRevealPx >= formHeight ? "auto" : "hidden",
            }}>
              <div
                ref={rsvpFormRef}
                onWheel={(e) => {
                  // Forward scroll to the main scroll container so scrolling over the form works
                  if (scrollRef.current) {
                    scrollRef.current.scrollTop += e.deltaY;
                  }
                }}
                style={{
                  padding: "8px 20px 60px",
                }}
              >
                {/* Event info — part of the form unit */}
                <div style={{ marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {title && <div style={{ fontSize: "14px", fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "2px" }}>{title}</div>}
                  {location && <div style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.4)", marginBottom: "1px" }}>{formatLocationShort(location)}</div>}
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
