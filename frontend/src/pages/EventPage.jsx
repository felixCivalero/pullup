// frontend/src/pages/EventPage.jsx
// Mobile-first, Instagram-friendly event page
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
    <div
      style={{
        minHeight: "100vh",
        background: "#05040a",
        position: "relative",
      }}
    >
      {/* Cover Image */}
      {event?.imageUrl && (
        <div
          style={{
            width: "100%",
            aspectRatio: "16/9",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <img
            src={event.imageUrl}
            alt={event.title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          {/* Gradient overlay */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "60%",
              background:
                "linear-gradient(to top, #05040a 0%, transparent 100%)",
            }}
          />
        </div>
      )}

      {/* Content - One screen clarity */}
      <div
        style={{
          position: "relative",
          padding: "24px 20px",
          paddingBottom: "100px", // Space for sticky button
        }}
      >
        {/* Share button (top right) */}
        {event && (
          <div
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              zIndex: 10,
            }}
          >
            <ShareActions
              url={shareUrl}
              title={event.title}
              text={shareText}
              imageUrl={event.imageUrl}
            />
          </div>
        )}

        {/* Title */}
        <h1
          style={{
            fontSize: "clamp(28px, 8vw, 40px)",
            fontWeight: 800,
            lineHeight: "1.1",
            marginBottom: "16px",
            color: "#fff",
            letterSpacing: "-0.02em",
          }}
        >
          {event?.title}
        </h1>

        {/* Date & Time */}
        {(eventDate || eventTime) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "12px",
              fontSize: "16px",
              color: "rgba(255, 255, 255, 0.9)",
            }}
          >
            <span>📅</span>
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
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
              fontSize: "16px",
              color: "rgba(255, 255, 255, 0.9)",
            }}
          >
            <span>📍</span>
            <span>{event.location}</span>
          </div>
        )}

        {/* Description (collapsed by default) */}
        {event?.description && (
          <div style={{ marginBottom: "24px" }}>
            {!showDescription ? (
              <button
                onClick={() => setShowDescription(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#a78bfa",
                  fontSize: "14px",
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                Read more
              </button>
            ) : (
              <div>
                <p
                  style={{
                    fontSize: "16px",
                    lineHeight: "1.6",
                    color: "rgba(255, 255, 255, 0.8)",
                    marginBottom: "12px",
                  }}
                >
                  {event.description}
                </p>
                <button
                  onClick={() => setShowDescription(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#a78bfa",
                    fontSize: "14px",
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  Show less
                </button>
              </div>
            )}
          </div>
        )}

        {/* Capacity info (if available) */}
        {event?._attendance?.cocktailSpotsLeft !== null &&
          event._attendance.cocktailSpotsLeft <= 10 && (
            <div style={{ marginBottom: "24px" }}>
              <Badge
                variant={
                  event._attendance.cocktailSpotsLeft <= 5
                    ? "danger"
                    : "warning"
                }
              >
                {event._attendance.cocktailSpotsLeft <= 5
                  ? `Only ${event._attendance.cocktailSpotsLeft} spot${
                      event._attendance.cocktailSpotsLeft === 1 ? "" : "s"
                    } left`
                  : "Few spots left"}
              </Badge>
            </div>
          )}
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
            "linear-gradient(to top, #05040a 0%, rgba(5, 4, 10, 0.95) 80%, transparent 100%)",
          backdropFilter: "blur(10px)",
          zIndex: 100,
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
  );
}
