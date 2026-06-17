import { useState, useRef, useEffect, useMemo } from "react";
import { MediaCarousel } from "./MediaCarousel";
import { WebGLHero } from "./WebGLHero";
import { SceneFrame } from "./SceneFrame";
import { EventPageContent } from "./EventPageContent";
import { getCtaLabel } from "./EventCTA";
import { formatEventTime } from "../lib/dateUtils.js";
import { formatLocationShort, getGoogleMapsUrl } from "../lib/urlUtils";
import { useHeroFocusDrag } from "./useHeroFocusDrag";
import { transformedImageUrl } from "../lib/imageUtils";
import { normalizeDesktopMode, heroFrameStyle, modeCrops, useMediaAspect } from "./mediaFormat";
import { formatPrice } from "../lib/money.js";

const CTA_BAR_HEIGHT = 62;

export function DesktopEventLayout({
  title,
  description,
  location,
  locationLat = null,
  locationLng = null,
  showCoordinates = false,
  startsAt,
  timezone,
  imagePreview,
  media,
  mediaSettings,
  design = null,
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
  isEventPast = false,
  isSoldOut = false,
  rsvpContent,
  autoShowRsvp = false,
  activeStep,
  onFocusDrag,
  kind = "event",
  // Host control over the on-page sign-up surface (mig 096). hideSignup
  // suppresses BOTH the inline block and the pinned bottom bar; the two
  // labels override the eyebrow ("Free to join") and the button text.
  hideSignup = false,
  signupLabel = null,
  signupCta = null,
  // Product pages: sanitized delivery summary + buyer's rsvpId (?purchase=).
  productDelivery = null,
  purchaseRsvpId = null,
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

  // Resolve the cover format up front — the drag hook depends on it.
  const desktopFormat = mediaSettings?.desktop || {};
  const desktopMode = normalizeDesktopMode(desktopFormat, mediaSettings);
  const desktopCrops = modeCrops(desktopMode);
  const mediaAspect = useMediaAspect(media, imagePreview);

  // Drag-to-reposition only applies to the cover-cropped modes (height/card).
  // "width" shows the whole media, so there's nothing to pan.
  const focusDrag = useHeroFocusDrag({
    onDrag: onFocusDrag,
    frameRef: heroFrameRef,
    enabled: !!onFocusDrag && desktopCrops,
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

  // External storefront link-out (product pages): "Buy now" opens the creator's
  // own store; the inline RSVP/checkout is suppressed so there's one buy path.
  const externalUrl = kind === "product" && productDelivery?.external?.url ? productDelivery.external.url : null;
  const handleCta = () => {
    if (externalUrl) { window.open(externalUrl, "_blank", "noopener"); return; }
    scrollToRsvp();
  };

  const buttonLabel = getCtaLabel({
    kind,
    ticketType,
    ticketPrice,
    ticketCurrency,
    instantWaitlist,
    isEventPast,
    isSoldOut,
  });

  const formattedDate = useMemo(() => {
    if (kind === "community") return ""; // a community signup has no date
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
  }, [startsAt, timezone, hideDate, dateRevealHint, kind]);

  const priceLabel =
    kind === "community"
      ? "Free to join"
      : ticketType === "paid" && ticketPrice
        ? formatPrice(ticketPrice, ticketCurrency)
        : "Free entry";

  // Host overrides (mig 096) for the eyebrow + button; fall back to defaults.
  const eyebrowLabel = signupLabel || priceLabel;
  const ctaLabel = signupCta || buttonLabel;

  // Per-screen focus (drag-to-reposition) — desktop view reads from .desktop,
  // with graceful fallback to top-level fields (legacy events). The frame
  // geometry comes from `desktopMode`/`mediaAspect`, resolved at the top.
  const heroFrame = heroFrameStyle(desktopMode, mediaAspect);
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
  // crop + focus rather than phone's. "width" and "card" hold ratio with no crop
  // (contain) — card additionally pads so the page bg shows around it; only
  // "height" fills and pans via focus.
  const desktopFit = desktopMode === "card" ? "contain" : "cover";
  const desktopMediaSettings = useMemo(
    () => ({
      ...(mediaSettings || {}),
      fit: desktopFit,
      focusX: desktopFocusX,
      focusY: desktopFocusY,
    }),
    [mediaSettings, desktopFit, desktopFocusX, desktopFocusY],
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#05040a",
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
            // "card" floats with breathing room around it; the other modes use
            // the full cell.
            padding: desktopMode === "card" ? "28px" : 0,
            boxSizing: "border-box",
          }}
        >
          <div
            ref={heroFrameRef}
            style={{
              ...heroFrame,
              borderRadius: "16px",
              overflow: "hidden",
              position: "relative",
              background:
                "radial-gradient(circle at 30% 30%, rgba(192,192,192,0.08) 0%, transparent 60%), #0a0913",
              border: "1px solid rgba(255,255,255,0.06)",
              userSelect: "none",
            }}
          >
            {design?.archetype === "webgl" ? (
              <WebGLHero params={design.params || {}} />
            ) : design?.archetype === "scene" ? (
              <SceneFrame
                html={design.html}
                poster={design.poster || imagePreview || null}
                palette={design.params?.colors || null}
              />
            ) : media && media.length > 0 ? (
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
                  objectFit: desktopFit,
                  objectPosition: fallbackObjectPosition,
                  pointerEvents: "none",
                }}
              />
            ) : null}

            {/* Drag-to-reposition overlay (editor only; crop modes only) */}
            {onFocusDrag && desktopCrops && (
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
              locationLat={locationLat}
              locationLng={locationLng}
              showCoordinates={showCoordinates}
              startsAt={startsAt}
              timezone={timezone}
              sections={sections}
              hoveredSection={hoveredSection}
              hideLocation={hideLocation}
              hideDate={hideDate}
              revealHint={revealHint}
              dateRevealHint={dateRevealHint}
              productDelivery={productDelivery}
              purchaseRsvpId={purchaseRsvpId}
            />

            {/* Inline RSVP — mirrors mobile, scrolled to from sticky CTA
                (suppressed when the host has hidden the sign-up surface) */}
            {rsvpContent && !externalUrl && !hideSignup && (
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
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>
                      {eyebrowLabel}
                    </div>
                    {formattedDate && (
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#fff",
                          marginTop: "1px",
                          opacity: hideDate ? 0.4 : 0.7,
                        }}
                      >
                        {formattedDate}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    marginBottom: "16px",
                    paddingBottom: "12px",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {title && (
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 800,
                        color: "#fff",
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
                        color: "#fff",
                        opacity: 0.5,
                        marginTop: "1px",
                      }}
                    >
                      <a
                        href={getGoogleMapsUrl(location, locationLat, locationLng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px", textDecorationThickness: "1px" }}
                      >
                        {formatLocationShort(location)}
                      </a>
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
          {(rsvpContent || externalUrl) && !hideSignup && (
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
                    {eyebrowLabel}
                  </div>
                  {formattedDate && (
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
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCta}
                  style={{
                    padding: "10px 22px",
                    background: "#fff",
                    color: "#000",
                    fontFamily: "inherit",
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
                  {ctaLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
