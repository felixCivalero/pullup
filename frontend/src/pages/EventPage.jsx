// frontend/src/pages/EventPage.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { EventCard } from "../components/EventCard";
import { useToast } from "../components/Toast";
import { ShareActions } from "../components/ShareActions";
import { buildShareText } from "../lib/shareUtils";
import { getEventUrl } from "../lib/urlUtils";

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

  const shareUrl = event ? getEventUrl(event.slug) : "";
  const shareText = event
    ? buildShareText({ event, url: shareUrl, variant: "invite" })
    : shareUrl;

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
        {/* Share Actions - Above RSVP form */}
        {event && (
          <div
            style={{
              marginBottom: "24px",
              display: "flex",
              justifyContent: "flex-end",
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
        <EventCard
          event={event}
          onSubmit={handleRsvpSubmit}
          loading={rsvpLoading}
        />
      </div>
    </div>
  );
}
