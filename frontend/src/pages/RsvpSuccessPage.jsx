// frontend/src/pages/RsvpSuccessPage.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  FaPaperPlane,
  FaCalendar,
  FaMapMarkerAlt,
  FaCheckCircle,
  FaClock,
  FaUtensils,
  FaWineGlass,
} from "react-icons/fa";
import { getEventShareUrl, generateCalendarUrls } from "../lib/urlUtils";
import { formatEventTime, formatReadableDateTime } from "../lib/dateUtils.js";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { ModalOrDrawer } from "../components/ui/ModalOrDrawer";
import { useToast } from "../components/Toast";
import { publicFetch } from "../lib/api.js";

// Single Share Button Component (Instagram-style with conditional logic)
// URL-only sharing to ensure rich previews (OG tags) are shown
function ShareButton({ url }) {
  const { showToast } = useToast();

  const handleShare = async () => {
    // URL ONLY - no title, no text, no files
    // This ensures rich preview (OG tags) is shown, not custom text
    if (navigator.share) {
      try {
        await navigator.share({ url });
      } catch (err) {
        // User cancelled - do nothing
        if (err?.name === "AbortError") return;
        // Error - fallback to copy
        console.error("Error sharing:", err);
        handleCopy();
      }
    } else {
      // Fallback: Copy to clipboard
      handleCopy();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied!", "success");
    } catch (err) {
      console.error("Failed to copy:", err);
      showToast("Failed to copy link", "error");
    }
  };

  return (
    <Button onClick={handleShare} variant="secondary" fullWidth>
      <FaPaperPlane size={18} />
      <span>Share</span>
    </Button>
  );
}

export function RsvpSuccessPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCalendarMenu, setShowCalendarMenu] = useState(false);
  const [showCocktailsCalendarMenu, setShowCocktailsCalendarMenu] =
    useState(false);

  // Get booking and payment details from navigation state
  const booking = location.state?.booking || null;
  const paymentFromState = location.state?.payment || null; // Payment info for paid events

  // State for payment data (fetched from database if needed)
  const [payment, setPayment] = useState(paymentFromState);
  const [loadingPayment, setLoadingPayment] = useState(false);

  useEffect(() => {
    async function loadEvent() {
      try {
        const res = await publicFetch(`/events/${slug}`);
        if (!res.ok) throw new Error("Failed to load event");
        const data = await res.json();
        setEvent(data);

        // If event is paid, fetch full payment details from database
        // This ensures we have receipt URL, paid_at timestamp, etc. from Stripe
        if (data.ticketType === "paid") {
          // Try to get payment ID from state first
          const paymentId = paymentFromState?.id;

          if (paymentId) {
            // We have payment ID from navigation state, fetch full details
            await loadPaymentDetails(paymentId);
          } else if (booking?.email) {
            // Fallback: Try to find payment by RSVP email and event
            // This handles cases where user refreshes the page
            await findPaymentByRsvp(booking.email, data.id);
          }
        }
      } catch (err) {
        console.error("Error loading event", err);
      } finally {
        setLoading(false);
      }
    }

    if (slug) loadEvent();
  }, [slug]);

  // Load full payment details from database (includes receipt URL, paid_at, etc.)
  async function loadPaymentDetails(paymentId) {
    if (!paymentId) return;

    setLoadingPayment(true);
    try {
      const res = await publicFetch(`/payments/${paymentId}/details`);
      if (res.ok) {
        const paymentData = await res.json();
        // Merge with existing payment data to preserve paymentBreakdown if available
        setPayment({
          ...paymentFromState,
          ...paymentData,
          paymentBreakdown: paymentFromState?.paymentBreakdown || null,
        });
      } else {
        console.warn("Failed to load payment details:", await res.text());
        // Keep payment from state if fetch fails
      }
    } catch (err) {
      console.error("Error loading payment details:", err);
      // Keep payment from state if fetch fails
    } finally {
      setLoadingPayment(false);
    }
  }

  // Find payment by RSVP email and event (fallback for page refresh)
  async function findPaymentByRsvp(email, eventId) {
    if (!email || !eventId) return;

    try {
      // This would require a new endpoint - for now, we'll rely on payment ID from state
      // In the future, we could add: GET /events/:slug/rsvps/:email/payment
      console.log(
        "[RsvpSuccessPage] Payment ID not in state, would need to fetch by RSVP"
      );
    } catch (err) {
      console.error("Error finding payment by RSVP:", err);
    }
  }

  function getCalendarUrls(useDinnerTime = false) {
    if (!event) return null;

    const eventUrl = `${window.location.origin}/e/${slug}`;

    // Use dinner slot if dinner selected, otherwise use event start/end
    const anchorStart = useDinnerTime
      ? booking?.dinnerTimeSlot || event.startsAt
      : event.startsAt;
    const anchorEnd = useDinnerTime
      ? booking?.dinnerTimeSlot
        ? new Date(
            new Date(booking.dinnerTimeSlot).getTime() + 2 * 60 * 60 * 1000
          ) // 2 hours by default
        : event.endsAt || event.startsAt
      : event.endsAt ||
        new Date(new Date(event.startsAt).getTime() + 2 * 60 * 60 * 1000); // default +2h

    const hasConfirmedDinner =
      booking?.wantsDinner &&
      booking?.dinnerTimeSlot &&
      booking?.dinnerBookingStatus === "CONFIRMED";

    let calendarTitle = event.title || "Pull Up Event";
    let calendarDescription = event.description || "";

    if (hasConfirmedDinner && useDinnerTime && booking?.dinnerTimeSlot) {
      // Dinner is the anchor - use dinner time as the calendar event time
      calendarTitle = `${event.title} - Dinner`;

      const dinnerTime = new Date(booking.dinnerTimeSlot).toLocaleTimeString(
        "en-US",
        { hour: "numeric", minute: "2-digit" }
      );
      const eventStartTime = event.startsAt
        ? new Date(event.startsAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })
        : null;

      calendarDescription = `${event.description || ""}\n\n`;
      calendarDescription += `🍽️ Dinner: ${dinnerTime}`;
      if (booking.dinnerPartySize > 1) {
        calendarDescription += ` (${booking.dinnerPartySize} people)`;
      }
      if (eventStartTime && eventStartTime !== dinnerTime) {
        calendarDescription += `\n🥂 Cocktails: ${eventStartTime}`;
      }
      if (event.location) {
        calendarDescription += `\n📍 Location: ${event.location}`;
      }
    } else {
      // Event start is the anchor, add dinner info if applicable
      if (hasConfirmedDinner && booking?.dinnerTimeSlot) {
        const dinnerTime = formatEventTime(booking.dinnerTimeSlot);
        calendarDescription += `\n\n🍽️ Dinner: ${dinnerTime}`;
        if (booking.dinnerPartySize > 1) {
          calendarDescription += ` (${booking.dinnerPartySize} people)`;
        }
      } else if (
        booking?.wantsDinner &&
        booking?.dinnerBookingStatus === "WAITLIST"
      ) {
        calendarDescription += `\n\n🍽️ Dinner: Waitlisted (host will notify if a spot opens)`;
      }
      if (event.location) {
        calendarDescription += `\n📍 Location: ${event.location}`;
      }
    }

    calendarDescription += `\n\nEvent page: ${eventUrl}`;

    return generateCalendarUrls({
      title: calendarTitle,
      description: calendarDescription,
      location: event.location || "",
      slug: event.slug,
      startsAt: anchorStart,
      endsAt: anchorEnd,
    });
  }

  // Handle calendar service selection
  function handleCalendarService(service, useDinnerTime = false) {
    const urls = getCalendarUrls(useDinnerTime);
    if (!urls) return;

    if (service === "apple") {
      // Download .ics file for Apple Calendar
      const blob = new Blob([urls.icsContent], {
        type: "text/calendar;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const fileName = useDinnerTime
        ? `${event.title.replace(/[^a-z0-9]/gi, "_")}-dinner.ics`
        : `${event.title.replace(/[^a-z0-9]/gi, "_")}.ics`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } else {
      // Open calendar service in new tab
      window.open(urls[service], "_blank");
    }
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        }}
      >
        <div style={{ fontSize: "18px", opacity: 0.8 }}>Loading...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        }}
      >
        <div style={{ fontSize: "18px", opacity: 0.8 }}>Event not found</div>
      </div>
    );
  }

  const eventDate = event?.startsAt
    ? formatReadableDateTime(event.startsAt)
    : "";

  return (
    <>
      <style>{`
        /* Prevent horizontal scroll and ensure proper button sizing */
        body {
          overflow-x: hidden;
          width: 100%;
        }
        * {
          box-sizing: border-box;
        }
        
        /* Responsive container: edge-to-edge on mobile, centered on desktop */
        .success-page-content {
          width: 100%;
          max-width: 100%;
          margin: 0 auto;
        }
        
        @media (min-width: 640px) {
          .success-page-content {
            max-width: 600px;
          }
        }
        
        @media (min-width: 768px) {
          .success-page-content {
            max-width: 640px;
          }
        }
        
        @media (min-width: 1024px) {
          .success-page-content {
            max-width: 700px;
          }
        }
      `}</style>
      <div
        style={{
          minHeight: "100vh",
          position: "relative",
          width: "100%",
          maxWidth: "100vw",
          overflowX: "hidden",
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
          style={{
            position: "relative",
            zIndex: 2,
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            padding: "clamp(20px, 5vw, 40px)",
            paddingBottom: "120px", // Space for actions
            alignItems: "center",
          }}
        >
          {/* Content - Responsive container: edge-to-edge on mobile, constrained on desktop */}
          <div
            className="success-page-content"
            style={{
              position: "relative",
              width: "100%",
              boxSizing: "border-box",
              marginTop: "auto",
              paddingTop: "clamp(40px, 8vh, 60px)",
            }}
          >
            {/* Status Badge */}
            <div style={{ marginBottom: "32px", textAlign: "center" }}>
              {booking?.bookingStatus === "CONFIRMED" ? (
                <Badge
                  variant="success"
                  style={{
                    fontSize: "15px",
                    padding: "12px 24px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "10px",
                    background: "rgba(34, 197, 94, 0.25)",
                    border: "1px solid rgba(34, 197, 94, 0.4)",
                    color: "#fff",
                    backdropFilter: "blur(20px)",
                    borderRadius: "12px",
                    fontWeight: 600,
                    boxShadow: "0 4px 20px rgba(34, 197, 94, 0.2)",
                  }}
                >
                  <FaCheckCircle size={18} />
                  <span>You're in</span>
                </Badge>
              ) : (
                <>
                  <Badge
                    variant="warning"
                    style={{
                      fontSize: "15px",
                      padding: "12px 24px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "10px",
                      background: "rgba(245, 158, 11, 0.25)",
                      border: "1px solid rgba(245, 158, 11, 0.4)",
                      color: "#fbbf24",
                      backdropFilter: "blur(20px)",
                      borderRadius: "12px",
                      fontWeight: 600,
                      boxShadow: "0 4px 20px rgba(245, 158, 11, 0.2)",
                      marginBottom: "12px",
                    }}
                  >
                    <FaClock size={18} />
                    <span>You're on the waitlist</span>
                  </Badge>
                  {/* Waitlist explanation message */}
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "16px",
                      background: "rgba(245, 158, 11, 0.1)",
                      borderRadius: "12px",
                      border: "1px solid rgba(245, 158, 11, 0.2)",
                      fontSize: "15px",
                      color: "rgba(255, 255, 255, 0.9)",
                      lineHeight: "1.6",
                      maxWidth: "500px",
                      margin: "16px auto 0",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: "8px",
                        color: "#fbbf24",
                      }}
                    >
                      What happens next?
                    </div>
                    <div style={{ fontSize: "14px", opacity: 0.9 }}>
                      {event?.ticketType === "paid" ? (
                        <>
                          If spots open up, you'll receive a link via SMS or
                          email to confirm and complete payment. Once payment is
                          done, you'll be confirmed for the event.
                        </>
                      ) : (
                        <>
                          If spots open up, the host will contact you via email
                          or SMS to confirm your attendance.
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Event Name */}
            <h2
              style={{
                fontSize: "clamp(32px, 6vw, 42px)",
                fontWeight: 800,
                marginBottom: "24px",
                textAlign: "left",
                color: "#fff",
                lineHeight: "1.2",
                letterSpacing: "-0.03em",
                textShadow: "0 2px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              {event.title}
            </h2>

            {/* Date */}
            {eventDate && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "14px",
                  marginBottom: "20px",
                  fontSize: "17px",
                  lineHeight: "1.6",
                  color: "rgba(255, 255, 255, 0.95)",
                }}
              >
                <FaCalendar
                  size={20}
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    marginTop: "2px",
                    color: "rgba(255, 255, 255, 0.8)",
                  }}
                />
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    fontWeight: 400,
                  }}
                >
                  {eventDate}
                </span>
              </div>
            )}

            {/* Location */}
            {event.location && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "14px",
                  marginBottom: "32px",
                  fontSize: "17px",
                  lineHeight: "1.6",
                  color: "rgba(255, 255, 255, 0.95)",
                }}
              >
                <FaMapMarkerAlt
                  size={20}
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    marginTop: "2px",
                    color: "rgba(255, 255, 255, 0.8)",
                  }}
                />
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    fontWeight: 400,
                  }}
                >
                  {event.location}
                </span>
              </div>
            )}

            {/* Confirmation Badges with Integrated Calendar Buttons */}
            {booking && (
              <>
                {/* Cocktails Confirmation */}
                {booking.bookingStatus && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "20px",
                      background: "rgba(236, 72, 153, 0.15)",
                      borderRadius: "16px",
                      border: "1px solid rgba(236, 72, 153, 0.3)",
                      backdropFilter: "blur(10px)",
                      boxShadow: "0 4px 20px rgba(236, 72, 153, 0.15)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "12px",
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "#f472b6",
                      }}
                    >
                      <FaWineGlass
                        size={18}
                        style={{ display: "flex", alignItems: "center" }}
                      />
                      <span>Cocktails</span>
                      <Badge
                        variant={
                          booking.bookingStatus === "CONFIRMED"
                            ? "success"
                            : "warning"
                        }
                        style={{ marginLeft: "auto", fontSize: "12px" }}
                      >
                        {booking.bookingStatus === "CONFIRMED"
                          ? "Confirmed"
                          : "Waitlist"}
                      </Badge>
                    </div>
                    {event?.startsAt && (
                      <div
                        style={{
                          fontSize: "14px",
                          opacity: 0.85,
                          marginBottom:
                            booking.bookingStatus === "WAITLIST"
                              ? "12px"
                              : "16px",
                          color: "rgba(255, 255, 255, 0.9)",
                        }}
                      >
                        {new Date(event.startsAt).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {booking.partySize > 1 &&
                          ` • ${booking.partySize} people`}
                      </div>
                    )}
                    {booking.bookingStatus === "WAITLIST" && (
                      <div
                        style={{
                          fontSize: "13px",
                          opacity: 0.8,
                          marginBottom: "16px",
                          padding: "10px",
                          background: "rgba(245, 158, 11, 0.1)",
                          borderRadius: "8px",
                          border: "1px solid rgba(245, 158, 11, 0.2)",
                          color: "rgba(255, 255, 255, 0.85)",
                          lineHeight: "1.5",
                        }}
                      >
                        You're on the waitlist for cocktails. The host will
                        contact you if spots become available.
                      </div>
                    )}
                    <Button
                      onClick={() => setShowCocktailsCalendarMenu(true)}
                      variant="secondary"
                      fullWidth
                      size="sm"
                      style={{
                        width: "100%",
                        fontSize: "14px",
                        padding: "10px 16px",
                      }}
                    >
                      <FaCalendar size={16} />
                      <span>Add to Calendar</span>
                    </Button>
                    <ModalOrDrawer
                      isOpen={showCocktailsCalendarMenu}
                      onClose={() => setShowCocktailsCalendarMenu(false)}
                      title="Add Cocktails to Calendar"
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                        }}
                      >
                        <Button
                          onClick={() => {
                            handleCalendarService("google", false);
                            setShowCocktailsCalendarMenu(false);
                          }}
                          variant="secondary"
                          fullWidth
                        >
                          <FaCalendar size={18} />
                          <span>Google Calendar</span>
                        </Button>
                        <Button
                          onClick={() => {
                            handleCalendarService("outlook", false);
                            setShowCocktailsCalendarMenu(false);
                          }}
                          variant="secondary"
                          fullWidth
                        >
                          <FaCalendar size={18} />
                          <span>Outlook</span>
                        </Button>
                        <Button
                          onClick={() => {
                            handleCalendarService("yahoo", false);
                            setShowCocktailsCalendarMenu(false);
                          }}
                          variant="secondary"
                          fullWidth
                        >
                          <FaCalendar size={18} />
                          <span>Yahoo Calendar</span>
                        </Button>
                        <Button
                          onClick={() => {
                            handleCalendarService("apple", false);
                            setShowCocktailsCalendarMenu(false);
                          }}
                          variant="secondary"
                          fullWidth
                        >
                          <FaCalendar size={18} />
                          <span>Apple Calendar</span>
                        </Button>
                      </div>
                    </ModalOrDrawer>
                  </div>
                )}

                {/* Dinner Confirmation */}
                {/* Show dinner section if wantsDinner is true AND (dinnerBookingStatus exists OR dinnerTimeSlot exists) */}
                {booking.wantsDinner &&
                  (booking.dinnerBookingStatus || booking.dinnerTimeSlot) && (
                    <div
                      style={{
                        marginBottom: "24px",
                        padding: "20px",
                        background: "rgba(139, 92, 246, 0.15)",
                        borderRadius: "16px",
                        border: "1px solid rgba(139, 92, 246, 0.3)",
                        backdropFilter: "blur(10px)",
                        boxShadow: "0 4px 20px rgba(139, 92, 246, 0.15)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "12px",
                          fontSize: "15px",
                          fontWeight: 600,
                          color: "#a78bfa",
                        }}
                      >
                        <FaUtensils
                          size={18}
                          style={{ display: "flex", alignItems: "center" }}
                        />
                        <span>Dinner</span>
                        <Badge
                          variant={
                            booking.dinnerBookingStatus === "CONFIRMED"
                              ? "success"
                              : "warning"
                          }
                          style={{ marginLeft: "auto", fontSize: "12px" }}
                        >
                          {booking.dinnerBookingStatus === "CONFIRMED"
                            ? "Confirmed"
                            : "Waitlist"}
                        </Badge>
                      </div>
                      {booking.dinnerTimeSlot && (
                        <div
                          style={{
                            fontSize: "14px",
                            opacity: 0.85,
                            marginBottom:
                              booking.dinnerBookingStatus === "WAITLIST"
                                ? "12px"
                                : "16px",
                            color: "rgba(255, 255, 255, 0.9)",
                          }}
                        >
                          {new Date(booking.dinnerTimeSlot).toLocaleTimeString(
                            "en-US",
                            {
                              hour: "numeric",
                              minute: "2-digit",
                            }
                          )}
                          {booking.dinnerPartySize > 1 &&
                            ` • ${booking.dinnerPartySize} people`}
                        </div>
                      )}
                      {booking.dinnerBookingStatus === "WAITLIST" && (
                        <div
                          style={{
                            fontSize: "13px",
                            opacity: 0.8,
                            marginBottom: "16px",
                            padding: "10px",
                            background: "rgba(245, 158, 11, 0.1)",
                            borderRadius: "8px",
                            border: "1px solid rgba(245, 158, 11, 0.2)",
                            color: "rgba(255, 255, 255, 0.85)",
                            lineHeight: "1.5",
                          }}
                        >
                          You're on the waitlist for dinner. The host will
                          contact you if a table becomes available.
                        </div>
                      )}
                      <Button
                        onClick={() => setShowCalendarMenu(true)}
                        variant="secondary"
                        fullWidth
                        size="sm"
                        style={{
                          width: "100%",
                          fontSize: "14px",
                          padding: "10px 16px",
                        }}
                      >
                        <FaCalendar size={16} />
                        <span>Add to Calendar</span>
                      </Button>
                      <ModalOrDrawer
                        isOpen={showCalendarMenu}
                        onClose={() => setShowCalendarMenu(false)}
                        title="Add Dinner to Calendar"
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "12px",
                          }}
                        >
                          <Button
                            onClick={() => {
                              handleCalendarService("google", true);
                              setShowCalendarMenu(false);
                            }}
                            variant="secondary"
                            fullWidth
                          >
                            <FaCalendar size={18} />
                            <span>Google Calendar</span>
                          </Button>
                          <Button
                            onClick={() => {
                              handleCalendarService("outlook", true);
                              setShowCalendarMenu(false);
                            }}
                            variant="secondary"
                            fullWidth
                          >
                            <FaCalendar size={18} />
                            <span>Outlook</span>
                          </Button>
                          <Button
                            onClick={() => {
                              handleCalendarService("yahoo", true);
                              setShowCalendarMenu(false);
                            }}
                            variant="secondary"
                            fullWidth
                          >
                            <FaCalendar size={18} />
                            <span>Yahoo Calendar</span>
                          </Button>
                          <Button
                            onClick={() => {
                              handleCalendarService("apple", true);
                              setShowCalendarMenu(false);
                            }}
                            variant="secondary"
                            fullWidth
                          >
                            <FaCalendar size={18} />
                            <span>Apple Calendar</span>
                          </Button>
                        </div>
                      </ModalOrDrawer>
                    </div>
                  )}
              </>
            )}

            {/* Payment Receipt Section (for paid events only) - Moved below calendar modules */}
            {event?.ticketType === "paid" &&
              payment &&
              payment.status === "succeeded" && (
                <div
                  style={{
                    marginBottom: "24px",
                    padding: "24px",
                    background: "rgba(20, 16, 30, 0.95)",
                    borderRadius: "16px",
                    border: "2px solid rgba(139, 92, 246, 0.3)",
                    backdropFilter: "blur(10px)",
                    boxShadow: "0 8px 32px rgba(139, 92, 246, 0.2)",
                  }}
                >
                  {/* Receipt Header */}
                  <div
                    style={{
                      marginBottom: "20px",
                      paddingBottom: "16px",
                      borderBottom: "2px solid rgba(139, 92, 246, 0.3)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "20px",
                        fontWeight: 700,
                        marginBottom: "8px",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <span style={{ color: "#22c55e", fontSize: "24px" }}>
                        ✓
                      </span>
                      <span>Payment Receipt</span>
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "rgba(255, 255, 255, 0.5)",
                        marginTop: "4px",
                      }}
                    >
                      Paid on{" "}
                      {payment.paidAt
                        ? new Date(payment.paidAt).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : new Date().toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                    </div>
                  </div>

                  {/* Payment Breakdown */}
                  {/* Calculate breakdown from payment amount if not provided */}
                  {(() => {
                    const currencySymbol =
                      payment.currency === "sek" ? "kr" : "$";
                    const totalAmount = payment.amount || 0;

                    // If we have paymentBreakdown from state, use it
                    // Otherwise, calculate from total amount (estimate service fee ~3%)
                    const hasBreakdown = payment.paymentBreakdown;
                    const ticketAmount = hasBreakdown
                      ? payment.paymentBreakdown.ticketAmount
                      : Math.round(totalAmount / 1.03); // Approximate ticket amount (3% fee)
                    const platformFeeAmount = hasBreakdown
                      ? payment.paymentBreakdown.platformFeeAmount
                      : totalAmount - ticketAmount;
                    const customerTotalAmount = totalAmount;

                    return (
                      <div style={{ marginBottom: "20px" }}>
                        <div
                          style={{
                            fontSize: "15px",
                            color: "rgba(255, 255, 255, 0.8)",
                            marginBottom: "12px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span>
                            Ticket
                            {booking?.partySize > 1
                              ? `s (${booking.partySize}x)`
                              : ""}
                          </span>
                          <span style={{ fontWeight: 600 }}>
                            {currencySymbol}
                            {(ticketAmount / 100).toFixed(2)}
                          </span>
                        </div>
                        {platformFeeAmount > 0 && (
                          <div
                            style={{
                              fontSize: "15px",
                              color: "rgba(255, 255, 255, 0.8)",
                              marginBottom: "16px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span>Service fee</span>
                            <span style={{ fontWeight: 600 }}>
                              {currencySymbol}
                              {(platformFeeAmount / 100).toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: "20px",
                            fontWeight: 700,
                            color: "#a78bfa",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            paddingTop: "16px",
                            borderTop: "2px solid rgba(139, 92, 246, 0.3)",
                          }}
                        >
                          <span>Total Paid</span>
                          <span>
                            {currencySymbol}
                            {(customerTotalAmount / 100).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Payment Details */}
                  <div
                    style={{
                      fontSize: "11px",
                      color: "rgba(255, 255, 255, 0.4)",
                      marginTop: "20px",
                      paddingTop: "16px",
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                      fontFamily: "monospace",
                    }}
                  >
                    <div
                      style={{ marginBottom: "4px", wordBreak: "break-all" }}
                    >
                      Transaction ID: {payment.id}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "8px",
                      }}
                    >
                      <span>Status:</span>
                      <span
                        style={{
                          color: "#22c55e",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span style={{ fontSize: "10px" }}>●</span>
                        Paid
                      </span>
                    </div>
                    {/* Receipt URL from Stripe */}
                    {payment.receiptUrl && (
                      <div style={{ marginTop: "12px" }}>
                        <a
                          href={payment.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#a78bfa",
                            textDecoration: "underline",
                            fontSize: "12px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span>📄</span>
                          <span>View Receipt</span>
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {/* Share Invite - Single button with conditional logic */}
            {/* {event && (
            <div
              style={{
                marginBottom: "24px",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <ShareButton
                url={getEventShareUrl(event.slug)}
                title={`I'm going to ${event.title}!`}
                imageUrl={event.imageUrl}
              />
            </div>
          )} */}

            {/* Back to Event Link */}
            {/* <div
            style={{
              marginTop: "32px",
              fontSize: "14px",
              opacity: 0.7,
              textAlign: "center",
            }}
          >
            <button
              onClick={() => navigate(`/e/${slug}`)}
              style={{
                background: "none",
                border: "none",
                color: "#a78bfa",
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: "14px",
                padding: 0,
              }}
            >
              ← Back to event
            </button>
          </div> */}
          </div>
        </div>

        {/* CSS Animations */}
        <style>{`
        @keyframes scaleIn {
          from {
            transform: scale(0);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
      </div>
    </>
  );
}
