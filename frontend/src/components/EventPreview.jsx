import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import CoverDropzone from "./CoverDropzone.jsx";
import { formatEventTime } from "../lib/dateUtils.js";
import { formatLocationShort, getGoogleMapsUrl } from "../lib/urlUtils";
import { EventPageContent } from "./EventPageContent";
import { WebGLHero } from "./WebGLHero";
import { SceneFrame } from "./SceneFrame";
import { MediaCarousel, CarouselDots, useCarouselSwipe } from "./MediaCarousel";
import { EventCTA, getCtaLabel, EVENT_CTA_HEIGHT } from "./EventCTA";
import { useHeroFocusDrag } from "./useHeroFocusDrag";
import { formatPrice } from "../lib/money.js";
import { transformedImageUrl } from "../lib/imageUtils";
import { normalizePhoneMode, modeCrops, modeObjectFit, useMediaAspect } from "./mediaFormat";

const CTA_BAR_HEIGHT = 62;

export function EventPreview({
  title,
  description,
  location,
  locationLat = null,
  locationLng = null,
  showCoordinates = false,
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
  isEventPast = false,
  isSoldOut = false,
  rsvpsPaused = false,
  rsvpContent,
  autoShowRsvp = false,
  activeStep,
  onFocusDrag,
  // Editor-only: point at a part of the preview to open its editor.
  // onEditPart({ kind: "cover" | "section" | "rsvp", index? }).
  onEditPart = null,
  // Editor-only: files dropped/picked on the EMPTY cover land here (the
  // preview doubles as the upload dropzone until media exists).
  onCoverFiles = null,
  // Editor-only: hover a part of the preview to peek its editor open.
  // onHoverPart({ kind }) on enter, onHoverPart(null) on leave.
  onHoverPart = null,
  // Page kind ('event' | 'community' | …) — drives the CTA label.
  kind = "event",
  // Host control over the on-page sign-up surface (mig 096). hideSignup
  // suppresses BOTH the inline block and the sticky bar; the two labels
  // override the eyebrow ("Free to join") and the button text.
  hideSignup = false,
  signupLabel = null,
  signupCta = null,
  // Product pages: sanitized delivery summary + buyer's rsvpId (?purchase=).
  productDelivery = null,
  purchaseRsvpId = null,
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

  // Phone-scoped cover format. "width" takes the media's own aspect (whole, no
  // crop); "height" fills the screen; "card" is a fixed 4:5 — both crop and
  // support drag-to-reposition.
  const phoneMode = normalizePhoneMode(mediaSettings?.phone, mediaSettings);
  const phoneCrops = modeCrops(phoneMode);
  const mediaAspect = useMediaAspect(media, imagePreview);
  // "Fit width" derives its height from the first image itself (a hidden in-flow
  // sizer rendered inside the hero), NOT from `mediaAspect`. `mediaAspect`
  // resolves a beat AFTER first paint, so keying the frame's aspect-ratio off it
  // makes the frame snap shape once the image loads — that snap is the black
  // letterbox that flashes in on the live page. Letting the image lay itself out
  // (width:100%, height:auto) means the frame is the image's true shape from the
  // moment it loads: no fallback ratio, no snap, no border. Videos (nothing to
  // lay out) keep the measured-aspect path.
  const firstMedia = (Array.isArray(media) && media[0]) || null;
  const widthSizerUrl =
    phoneMode === "width"
      ? ((firstMedia && firstMedia.mediaType !== "video" && firstMedia.url) || imagePreview || null)
      : null;
  // The hero frame: full-bleed when filling height; "width" takes the image's own
  // height (via the sizer); "card" floats as a rounded 4:5 with space around it.
  const heroFrameStyle =
    phoneMode === "height"
      ? { height: "100%", minHeight: "100%" }
      : phoneMode === "card"
        ? {
            // "Card" — the media's OWN ratio, floated with space around every
            // edge so the whole clip is visible inside the viewport, never
            // cropped, regardless of shape.
            width: "calc(100% - 36px)",
            margin: "18px auto",
            maxHeight: "calc(100% - 36px)",
            aspectRatio: mediaAspect ? String(mediaAspect) : "4 / 5",
            borderRadius: "18px",
            overflow: "hidden",
          }
        : // "Fit width" — full width, L/R edges flush to the sides; height comes
          // from the in-flow sizer image below (no aspect snap). Videos fall back
          // to the measured ratio.
          widthSizerUrl
          ? { width: "100%" }
          : { width: "100%", aspectRatio: mediaAspect ? String(mediaAspect) : "4 / 5" };
  const focusDrag = useHeroFocusDrag({
    onDrag: onFocusDrag,
    frameRef: heroRef,
    enabled: !!onFocusDrag && phoneCrops,
  });

  const mediaCount = media?.length || 0;
  const canSwipe = mediaCount > 1 && !mediaSettings?.autoscroll;
  const swipeHandlers = useCarouselSwipe(mediaCount, setCarouselIndex);

  const eventTime = (!hideDate && startsAt) ? formatEventTime(new Date(startsAt), timezone) : "";

  // A community signup has no date — never show "Date TBA".
  const formattedDate = kind === "community" ? "" : hideDate ? (dateRevealHint || "Date TBA") : startsAt ? (() => {
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

  // External storefront link-out (product pages): "Buy now" hands off to the
  // creator's own store instead of opening PullUp's checkout, and the inline
  // RSVP/checkout section is suppressed so there's only one buy path.
  const externalUrl = kind === "product" && productDelivery?.external?.url ? productDelivery.external.url : null;
  const handleCta = useCallback(() => {
    if (externalUrl) { window.open(externalUrl, "_blank", "noopener"); return; }
    scrollToRsvp();
  }, [externalUrl, scrollToRsvp]);

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

  const buttonLabel = getCtaLabel({ kind, ticketType, ticketPrice, ticketCurrency, instantWaitlist, isEventPast, isSoldOut, rsvpsPaused });
  // Eyebrow + button labels with host overrides (mig 096); fall back to the
  // kind-derived defaults when the host hasn't set custom text.
  const defaultEyebrow = kind === "community"
    ? "Free to join"
    : ticketType === "paid" && ticketPrice
      ? formatPrice(ticketPrice, ticketCurrency)
      : "Free entry";
  const eyebrowLabel = signupLabel || defaultEyebrow;
  const ctaLabel = signupCta || buttonLabel;
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
            ref={heroRef}
            data-hero
            {...(canSwipe && !(onFocusDrag && phoneCrops) ? swipeHandlers : {})}
            onMouseEnter={onHoverPart ? () => onHoverPart({ kind: "cover" }) : undefined}
            onMouseLeave={onHoverPart ? () => onHoverPart(null) : undefined}
            style={{
              position: "relative",
              width: "100%",
              ...heroFrameStyle,
              flexShrink: 0,
              cursor: focusDrag.dragging
                ? "grabbing"
                : (onFocusDrag && phoneCrops)
                  ? "grab"
                  : (canSwipe ? "grab" : undefined),
              userSelect: "none",
              touchAction: onFocusDrag && phoneCrops ? "none" : "pan-y",
            }}
          >
            {/* "Fit width" height driver: a hidden, in-flow copy of the first
                image at width:100%/height:auto. It gives the (position:relative)
                hero its exact natural height the instant the image loads, so the
                absolutely-positioned media below fills the full width at the
                image's own ratio — no measured-aspect fallback, no shape snap,
                no black-border flash. */}
            {widthSizerUrl && (
              <img
                // A FIXED tiny width — the sizer is invisible and only needs the
                // image's aspect ratio, which is identical at any resolution.
                // Crucially this URL never changes with heroWidth, so the sizer
                // never reloads and the hero never reflows/"pumps" after load.
                src={transformedImageUrl(widthSizerUrl, { width: 64 })}
                alt=""
                aria-hidden
                draggable={false}
                style={{ width: "100%", height: "auto", display: "block", visibility: "hidden", pointerEvents: "none" }}
              />
            )}
            {/* Editor-only: point at the cover to open the media editor. Sits
                above the drag layer with its own pointer target so it never
                fights the reposition-drag. */}
            {onEditPart && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEditPart({ kind: "cover" }); }}
                style={{
                  position: "absolute", top: 10, right: 10, zIndex: 20,
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
                  color: "#fff", background: "rgba(236,23,143,0.92)", border: "none",
                  padding: "5px 10px", borderRadius: "999px", cursor: "pointer",
                  backdropFilter: "blur(3px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
                }}
              >
                ✎ Cover
              </button>
            )}
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
              // Fit modes: "width" shows the whole media at its own ratio,
              // "card" shows it fully-visible + padded (page bg around it), and
              // only "height" crops/pans via focusX/focusY (mediaSettings.phone
              // .focusX/Y, legacy fallback to top-level focus).
              const phoneFormat = mediaSettings?.phone || {};
              const legacyY = mediaSettings?.focus === "top"
                ? 0
                : mediaSettings?.focus === "bottom"
                  ? 100
                  : 50;
              const focusX = typeof phoneFormat.focusX === "number" ? phoneFormat.focusX : 50;
              const focusY = typeof phoneFormat.focusY === "number" ? phoneFormat.focusY : legacyY;
              // "Fit width" and "Card" show the whole media, never cropped
              // (contain); only "Fit height" fills + pans (cover). Sharing
              // modeObjectFit keeps this identical to the desktop renderer.
              const fitMode = modeObjectFit(phoneMode);
              const phoneMediaSettings = {
                ...(mediaSettings || {}),
                fit: fitMode,
                focusX,
                focusY,
              };
              const objectFit = fitMode;
              const objectPosition = `${focusX}% ${focusY}%`;
              if (media && media.length > 0) {
                return (
                  <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
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
                  <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
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
                  background: "radial-gradient(circle at 20% 50%, rgba(192,192,192,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232,232,232,0.06) 0%, transparent 50%), #05040a",
                }} />
              );
            })()}

            {/* Editor-only: the empty hero IS the upload target — click or
                drop media right where it will appear. */}
            {onCoverFiles && !design && !(media && media.length > 0) && !imagePreview && (
              <CoverDropzone onFiles={onCoverFiles} />
            )}

            {/* Drag-to-reposition overlay (editor only, crop modes only) */}
            {onFocusDrag && phoneCrops && (
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
          <div
            onMouseEnter={onHoverPart ? () => onHoverPart({ kind: "section" }) : undefined}
            onMouseLeave={onHoverPart ? () => onHoverPart(null) : undefined}
            style={{
            background: "#05040a",
            padding: `28px 20px ${rsvpContent ? "8px" : `${CTA_BAR_HEIGHT}px`}`,
            minHeight: hasContent ? "40%" : undefined,
          }}>
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
              onEditSection={onEditPart ? (index) => onEditPart({ kind: "section", index }) : null}
              productDelivery={productDelivery}
              purchaseRsvpId={purchaseRsvpId}
            />
          </div>

          {/* ─── INLINE RSVP SECTION ─── (suppressed when buying links out,
              or when the host has hidden the sign-up surface) */}
          {rsvpContent && !externalUrl && !hideSignup && (
            <div
              ref={rsvpSectionRef}
              onMouseEnter={onHoverPart ? () => onHoverPart({ kind: "rsvp" }) : undefined}
              onMouseLeave={onHoverPart ? () => onHoverPart(null) : undefined}
              style={{
                position: "relative",
                background: "#05040a",
                padding: `0 20px max(20px, env(safe-area-inset-bottom, 20px))`,
              }}
            >
              {/* Editor-only: point at the sign-up box to edit what you collect. */}
              {onEditPart && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEditPart({ kind: "rsvp" }); }}
                  style={{
                    position: "absolute", top: 14, right: 16, zIndex: 6,
                    fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
                    color: "#fff", background: "rgba(236,23,143,0.92)", border: "none",
                    padding: "4px 9px", borderRadius: "999px", cursor: "pointer",
                  }}
                >
                  ✎ Sign-up
                </button>
              )}
              {/* Price/date row — same as the fixed CTA bar, now inline */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: `${CTA_BAR_HEIGHT}px`,
                boxSizing: "border-box",
                padding: "12px 0",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>
                    {eyebrowLabel}
                  </div>
                  {formattedDate && (
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "#fff", opacity: 0.7, marginTop: "1px" }}>
                      {formattedDate}
                    </div>
                  )}
                </div>
              </div>

              {/* Title/location + form */}
              <div style={{ marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {title && <div style={{ fontSize: "14px", fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>}
                {location && <div style={{ fontSize: "12px", fontWeight: 500, color: "#fff", opacity: 0.5, marginTop: "1px" }}><a href={getGoogleMapsUrl(location, locationLat, locationLng)} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px", textDecorationThickness: "1px" }}>{formatLocationShort(location)}</a></div>}
              </div>
              {typeof rsvpContent === "function" ? rsvpContent({ onClose: () => {} }) : rsvpContent}
            </div>
          )}
        </div>

        {/* ─── FIXED CTA BAR — disappears when RSVP section is in view ─── */}
        {!hideCta && !hideSignup && (
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
                {eyebrowLabel}
              </div>
              {formattedDate && (
                <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.4)", marginTop: "1px" }}>
                  {formattedDate}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={!rsvpContent && !externalUrl}
              onClick={(rsvpContent || externalUrl) ? handleCta : undefined}
              style={{
                padding: "12px 24px",
                background: "#fff", color: "#000", border: "none", borderRadius: "4px",
                fontFamily: "inherit",
                fontSize: "14px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                cursor: (!rsvpContent && !externalUrl) ? "not-allowed" : "pointer",
                opacity: (!rsvpContent && !externalUrl) ? 0.5 : 1,
                flexShrink: 0, whiteSpace: "nowrap",
              }}
            >
              {ctaLabel}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
