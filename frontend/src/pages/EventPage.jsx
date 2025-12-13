// frontend/src/pages/EventPage.jsx
// Mobile-first, Instagram-friendly event page
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FaPaperPlane,
  FaInstagram,
  FaSpotify,
  FaCalendar,
  FaMapMarkerAlt,
} from "react-icons/fa";
import { useToast } from "../components/Toast";
import { ShareActions } from "../components/ShareActions";
import { buildShareText } from "../lib/shareUtils";
import { getEventShareUrl } from "../lib/urlUtils";
import { ModalOrDrawer } from "../components/ui/ModalOrDrawer";
import { RsvpForm } from "../components/RsvpForm";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { publicFetch } from "../lib/api.js";

function isNetworkError(error) {
  return (
    error instanceof TypeError ||
    error.message.includes("Failed to fetch") ||
    error.message.includes("NetworkError")
  );
}

export function EventPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [showRsvpForm, setShowRsvpForm] = useState(false);
  const [showDescription, setShowDescription] = useState(false);

  useEffect(() => {
    async function loadEvent() {
      setLoading(true);
      setNotFound(false);
      try {
        const res = await publicFetch(`/events/${slug}`);
        if (res.status === 404) {
          setNotFound(true);
          setEvent(null);
          return;
        }
        if (!res.ok) throw new Error("Failed to load event");
        const data = await res.json();
        // Debug: Log event structure to verify slug exists
        console.log("[EventPage] Loaded event:", {
          id: data.id,
          slug: data.slug,
          title: data.title,
          hasImage: !!data.imageUrl,
        });
        if (!data.slug) {
          console.error("[EventPage] WARNING: Event missing slug!", data);
        }
        setEvent(data);
      } catch (err) {
        console.error("Error loading event", err);
        showToast("Failed to load event", "error");
      } finally {
        setLoading(false);
      }
    }

    if (slug) loadEvent();
  }, [slug, showToast]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
          padding: "40px 16px",
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "18px", opacity: 0.8 }}>Loading event…</div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
          padding: "40px 16px",
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "18px", opacity: 0.8 }}>
              Event not found.
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function handleRsvpSubmit(data) {
    setRsvpLoading(true);
    const submittedData = data; // Store submitted data for later use
    try {
      const res = await publicFetch(`/events/${event.slug}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));

        if (res.status === 409 && err.error === "full") {
          showToast(
            "Event is full and waitlist is disabled. Please try another event.",
            "error"
          );
          return false;
        }

        if (res.status === 409 && err.error === "duplicate") {
          showToast("You've already RSVP'd for this event.", "error");
          return false;
        }

        throw new Error(err.error || "Failed to RSVP");
      }

      const body = await res.json();

      // Handle different status scenarios with appropriate messages
      const statusDetails = body.statusDetails || {
        bookingStatus:
          body.rsvp?.bookingStatus ||
          (body.rsvp?.status === "attending" ? "CONFIRMED" : "WAITLIST"),
        dinnerBookingStatus:
          body.rsvp?.dinner?.bookingStatus ||
          (body.rsvp?.dinnerStatus === "confirmed"
            ? "CONFIRMED"
            : body.rsvp?.dinnerStatus === "waitlist"
            ? "WAITLIST"
            : null),
        wantsDinner:
          body.rsvp?.dinner?.enabled || body.rsvp?.wantsDinner || false,
        // Backward compatibility
        cocktailStatus: body.rsvp?.status || "attending",
        dinnerStatus: body.rsvp?.dinnerStatus || null,
      };

      const bookingStatus =
        statusDetails.bookingStatus ||
        (statusDetails.cocktailStatus === "attending"
          ? "CONFIRMED"
          : "WAITLIST");
      const dinnerBookingStatus =
        statusDetails.dinnerBookingStatus ||
        (statusDetails.dinnerStatus === "confirmed"
          ? "CONFIRMED"
          : statusDetails.dinnerStatus === "waitlist"
          ? "WAITLIST"
          : null);
      const wantsDinner = statusDetails.wantsDinner;

      // Build appropriate message based on status
      let message = "";
      let subtext = "";
      let toastType = "success";

      if (bookingStatus === "WAITLIST") {
        // Entire booking is on waitlist (all-or-nothing)
        message = "You're on the waitlist";
        toastType = "info";

        if (wantsDinner && dinnerBookingStatus === "WAITLIST") {
          subtext =
            "Dinner is full right now. The host will reach out if a table opens.";
        } else {
          subtext =
            "The event is full right now. The host will reach out if a spot opens.";
        }
      } else if (bookingStatus === "CONFIRMED") {
        // Fully confirmed
        message = "You're in 🎉";
        if (wantsDinner && dinnerBookingStatus === "CONFIRMED") {
          subtext = "Your dinner time is confirmed. Check the details above.";
        }
      }

      showToast(message, toastType, subtext);

      // Close RSVP form
      setShowRsvpForm(false);

      // Redirect to success page with booking details
      setTimeout(() => {
        navigate(`/e/${event.slug}/success`, {
          state: {
            booking: {
              name: body.rsvp?.name || submittedData?.name || null,
              email: body.rsvp?.email || submittedData?.email || null,
              bookingStatus: bookingStatus,
              dinnerBookingStatus: dinnerBookingStatus,
              wantsDinner: wantsDinner,
              partySize:
                body.rsvp?.partySize ||
                (submittedData?.plusOnes ? 1 + submittedData.plusOnes : 1),
              plusOnes: body.rsvp?.plusOnes || submittedData?.plusOnes || 0,
              dinnerPartySize:
                body.rsvp?.dinnerPartySize ||
                body.rsvp?.dinner?.partySize ||
                submittedData?.dinnerPartySize ||
                null,
              dinnerTimeSlot:
                body.rsvp?.dinnerTimeSlot ||
                body.rsvp?.dinner?.slotTime ||
                submittedData?.dinnerTimeSlot ||
                null,
              statusDetails: statusDetails,
            },
          },
        });
      }, 1000);

      return true; // Success
    } catch (err) {
      console.error(err);
      if (isNetworkError(err)) {
        showToast("Network error. Please try again.", "error");
      } else {
        showToast(err.message || "Failed to RSVP.", "error");
      }
    } finally {
      setRsvpLoading(false);
    }
  }

  // Use share URL for better link previews (returns HTML with OG tags)
  const shareUrl = event && event.slug ? getEventShareUrl(event.slug) : "";
  const shareText = event
    ? buildShareText({ event, url: shareUrl, variant: "invite" })
    : shareUrl;

  // Format date/time
  const eventDate = event?.startsAt
    ? new Date(event.startsAt).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "";
  const eventTime = event?.startsAt
    ? new Date(event.startsAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <>
      <style>{`
        /* Prevent horizontal scroll and ensure proper alignment */
        body {
          overflow-x: hidden;
          overflow-y: hidden;
          width: 100%;
          height: 100vh;
          height: 100dvh; /* Dynamic viewport height for mobile */
        }
        html {
          overflow: hidden;
          height: 100vh;
          height: 100dvh; /* Dynamic viewport height for mobile */
        }
        @supports (height: 100dvh) {
          body, html {
            height: 100dvh;
          }
        }
        * {
          box-sizing: border-box;
        }
        /* Hide read more button on larger screens */
        @media (min-width: 768px) {
          .read-more-button {
            display: none !important;
          }
          .description-text {
            display: block !important;
            -webkit-line-clamp: none !important;
            overflow: visible !important;
          }
          .description-scrollable {
            overflow-y: visible !important;
            max-height: none !important;
          }
        }
        /* Content group - contains Share/Event Details + Description, moves up together */
        @media (max-width: 767px) {
          .content-group {
            flex-shrink: 0;
            flex: 0 0 auto;
          }
          /* When description is expanded, content group takes available space */
          .content-group-expanded {
            flex: 1;
            min-height: 0;
          }
        }
        /* Static info section - sticks to top of description */
        @media (max-width: 767px) {
          .static-info-section {
            flex-shrink: 0;
          }
        }
        /* Scrollable description container on mobile when expanded */
        @media (max-width: 767px) {
          .description-scrollable {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            padding-right: 4px; /* Space for scrollbar */
          }
          .description-scrollable::-webkit-scrollbar {
            width: 4px;
          }
          .description-scrollable::-webkit-scrollbar-track {
            background: transparent;
          }
          .description-scrollable::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 2px;
          }
          .description-scrollable::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
          }
        }
        /* Content container accounts for sticky button - mobile optimized */
        .event-content-container {
          height: calc(100vh - 90px);
          height: calc(100dvh - 90px); /* Use dynamic viewport height when supported (better for mobile) */
          max-height: calc(100vh - 90px);
          max-height: calc(100dvh - 90px);
          box-sizing: border-box;
        }
        @supports (height: 100dvh) {
          .event-content-container {
            height: calc(100dvh - 90px);
            max-height: calc(100dvh - 90px);
          }
        }
        /* Outer container for proper viewport handling */
        .event-page-container {
          min-height: 100vh;
          min-height: 100dvh; /* Use dynamic viewport height when supported */
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
        }
      `}</style>
      <div
        className="event-page-container"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "100vw",
          overflowX: "hidden",
          overflowY: "hidden",
          background: "#05040a",
        }}
      >
        {/* Event Image as Full Background */}
        {event?.imageUrl && (
          <>
            <div
              style={{
                position: "fixed",
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
                src={event.imageUrl}
                alt={event.title}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>
            {/* Gradient overlay - fades to black at bottom */}
            <div
              style={{
                position: "fixed",
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
        )}

        {/* Content - Overlaid on background */}
        <div
          className="event-content-container"
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            padding: "20px",
            overflow: "hidden",
          }}
        >
          {/* Title at the top - always visible */}
          <h1
            style={{
              fontSize: "clamp(28px, 8vw, 40px)",
              fontWeight: 800,
              lineHeight: "1.2",
              color: "#fff",
              letterSpacing: "-0.02em",
              margin: 0,
              marginTop: "20px",
              marginBottom: "0",
              paddingBottom: "12px",
              flexShrink: 0,
            }}
          >
            {event?.title}
          </h1>

          {/* Content group - Share/Event Details + Description - moves up together when expanded */}
          <div
            className={`content-group ${
              showDescription ? "content-group-expanded" : ""
            }`}
            style={{
              marginTop: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Static info section - sticks to top of description */}
            <div
              className="static-info-section"
              style={{
                flexShrink: 0,
                paddingTop: "16px",
              }}
            >
              {/* Social Icons - Share, Instagram, Spotify */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  marginBottom: "12px",
                }}
              >
                {/* Share icon - always visible */}
                <button
                  onClick={async () => {
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title: event?.title,
                          text: shareText,
                          url: shareUrl,
                        });
                      } catch (err) {
                        if (err.name !== "AbortError") {
                          // Fallback to copy
                          try {
                            await navigator.clipboard.writeText(shareUrl);
                            showToast("Link copied!", "success");
                          } catch (copyErr) {
                            console.error("Failed to copy:", copyErr);
                          }
                        }
                      }
                    } else {
                      // Desktop: copy to clipboard
                      try {
                        await navigator.clipboard.writeText(shareUrl);
                        showToast("Link copied!", "success");
                      } catch (err) {
                        console.error("Failed to copy:", err);
                        showToast("Failed to copy link", "error");
                      }
                    }
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255, 255, 255, 0.8)",
                    cursor: "pointer",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.color = "#fff";
                    e.target.style.transform = "scale(1.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.color = "rgba(255, 255, 255, 0.8)";
                    e.target.style.transform = "scale(1)";
                  }}
                >
                  <FaPaperPlane size={20} />
                </button>

                {/* Instagram icon - conditional */}
                {event?.instagram && (
                  <a
                    href={event.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "rgba(255, 255, 255, 0.8)",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.color = "#fff";
                      e.target.style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.color = "rgba(255, 255, 255, 0.8)";
                      e.target.style.transform = "scale(1)";
                    }}
                  >
                    <FaInstagram size={20} />
                  </a>
                )}

                {/* Spotify icon - conditional */}
                {event?.spotify && (
                  <a
                    href={event.spotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "rgba(255, 255, 255, 0.8)",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.color = "#fff";
                      e.target.style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.color = "rgba(255, 255, 255, 0.8)";
                      e.target.style.transform = "scale(1)";
                    }}
                  >
                    <FaSpotify size={20} />
                  </a>
                )}
              </div>

              {/* Date & Time */}
              {(eventDate || eventTime) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    marginBottom: "12px",
                    fontSize: "16px",
                    lineHeight: "1.4",
                    color: "rgba(255, 255, 255, 0.9)",
                  }}
                >
                  <FaCalendar
                    size={18}
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      marginTop: "1px",
                      color: "rgba(255, 255, 255, 0.7)",
                    }}
                  />
                  <span>
                    {eventDate}
                    {eventTime && ` at ${eventTime}`}
                  </span>
                </div>
              )}

              {/* Location */}
              {event?.location && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    marginBottom: "12px",
                    fontSize: "16px",
                    lineHeight: "1.4",
                    color: "rgba(255, 255, 255, 0.9)",
                  }}
                >
                  <FaMapMarkerAlt
                    size={18}
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      marginTop: "1px",
                      color: "rgba(255, 255, 255, 0.7)",
                    }}
                  />
                  <span>{event.location}</span>
                </div>
              )}
            </div>

            {/* Description - sticks below Share/Event Details, becomes scrollable when group reaches minimum */}
            {event?.description && (
              <div
                className={showDescription ? "description-scrollable" : ""}
                style={{
                  flex: showDescription ? "1" : "0 0 auto",
                  minHeight: showDescription ? 0 : "auto",
                  paddingTop: "16px",
                  paddingBottom: showDescription ? "0" : "0",
                }}
              >
                <div style={{ marginBottom: showDescription ? "0" : "8px" }}>
                  <p
                    className="description-text"
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
                    {event.description}
                  </p>
                  <button
                    className="read-more-button"
                    onClick={() => setShowDescription(!showDescription)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#a78bfa",
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
                    onMouseEnter={(e) => {
                      e.target.style.textDecoration = "underline";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.textDecoration = "none";
                    }}
                  >
                    {showDescription ? "Read less" : "Read more"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky CTA Button */}
        <div
          style={{
            position: "fixed",
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
            onClick={() => setShowRsvpForm(true)}
            fullWidth
            size="lg"
            disabled={loading || !event}
          >
            Pull up
          </Button>
        </div>

        {/* RSVP Form Modal/Drawer */}
        <ModalOrDrawer
          isOpen={showRsvpForm}
          onClose={() => setShowRsvpForm(false)}
          title="RSVP"
        >
          <RsvpForm
            event={event}
            onSubmit={handleRsvpSubmit}
            loading={rsvpLoading}
            onClose={() => setShowRsvpForm(false)}
          />
        </ModalOrDrawer>
      </div>
    </>
  );
}
