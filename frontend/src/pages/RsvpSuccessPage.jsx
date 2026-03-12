// frontend/src/pages/RsvpSuccessPage.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { FileText, ArrowLeft } from "lucide-react";
import {
  FaPaperPlane,
  FaCalendar,
  FaMapMarkerAlt,
  FaCheckCircle,
  FaClock,
  FaUtensils,
  FaWineGlass,
} from "react-icons/fa";
import { SilverIcon } from "../components/ui/SilverIcon.jsx";
import { getEventShareUrl, generateCalendarUrls } from "../lib/urlUtils";
import { formatEventTime, formatReadableDateTime } from "../lib/dateUtils.js";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { ModalOrDrawer } from "../components/ui/ModalOrDrawer";
import { useToast } from "../components/Toast";
import { publicFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

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

  // Get booking and payment details from navigation state or localStorage
  const stateBooking = location.state?.booking || null;
  const statePayment = location.state?.payment || null;

  const [booking, setBooking] = useState(stateBooking);
  const [storedPayment, setStoredPayment] = useState(statePayment);
  const [verifyError, setVerifyError] = useState(null);
  const [verifying, setVerifying] = useState(false);

  // Persist to / restore from localStorage
  useEffect(() => {
    const storageKey = `pullup_booking_${slug}`;
    if (stateBooking) {
      // Save fresh state to localStorage
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          booking: stateBooking,
          payment: statePayment,
        }));
      } catch {}
    } else if (!booking) {
      // No state from navigation — try localStorage
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey));
        if (stored?.booking) {
          setBooking(stored.booking);
          setStoredPayment(stored.payment || null);
        }
      } catch {}
    }
  }, [slug, stateBooking]);

  // Handle redirect-based payment methods (Klarna, bank transfer etc.)
  // Stripe appends ?payment_intent=pi_xxx&payment_intent_client_secret=pi_xxx_secret_yyy
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentIntentId = params.get('payment_intent');
    if (paymentIntentId && !booking) {
      // User returned from redirect-based payment — fetch booking from backend
      async function fetchBookingFromPayment() {
        setVerifying(true);
        setVerifyError(null);
        try {
          const res = await publicFetch(`/payments/verify/${paymentIntentId}`, {
            method: 'POST',
          });
          if (res.ok) {
            const data = await res.json();
            if (data.success === false) {
              setVerifyError("Your payment is still being processed. Please check back in a moment or contact the event organizer.");
              return;
            }
            if (data.rsvp && data.event) {
              const redirectBooking = {
                name: data.rsvp.name || null,
                email: data.rsvp.email || null,
                bookingStatus: data.rsvp.bookingStatus || 'CONFIRMED',
                dinnerBookingStatus: data.rsvp.dinnerBookingStatus || null,
                wantsDinner: data.rsvp.wantsDinner || false,
                partySize: data.rsvp.partySize || 1,
                plusOnes: data.rsvp.plusOnes || 0,
                dinnerPartySize: data.rsvp.dinnerPartySize || null,
                dinnerTimeSlot: data.rsvp.dinnerTimeSlot || null,
              };
              const redirectPayment = data.payment ? {
                id: data.payment.id,
                status: data.payment.status,
                amount: data.payment.amount,
                currency: data.payment.currency,
              } : null;
              setBooking(redirectBooking);
              setStoredPayment(redirectPayment);
              // Save to localStorage
              try {
                localStorage.setItem(`pullup_booking_${slug}`, JSON.stringify({
                  booking: redirectBooking,
                  payment: redirectPayment,
                }));
              } catch {}
            }
          } else {
            setVerifyError("We couldn't verify your payment. Please check your email for a confirmation, or contact the event organizer.");
          }
        } catch (err) {
          console.error('Error fetching booking from redirect payment:', err);
          setVerifyError("Something went wrong verifying your payment. Please check your email for a confirmation, or contact the event organizer.");
        } finally {
          setVerifying(false);
        }
      }
      fetchBookingFromPayment();
      // Clean up URL params
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [slug]);

  // State for payment data (fetched from database if needed)
  const [payment, setPayment] = useState(storedPayment);
  const [loadingPayment, setLoadingPayment] = useState(false);

  // Sync payment state when storedPayment updates (e.g. from localStorage restore or redirect)
  useEffect(() => {
    if (storedPayment && !payment) {
      setPayment(storedPayment);
    }
  }, [storedPayment]);

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
          const paymentId = storedPayment?.id;

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
          ...storedPayment,
          ...paymentData,
          paymentBreakdown: storedPayment?.paymentBreakdown || null,
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
            new Date(booking.dinnerTimeSlot).getTime() + 3 * 60 * 60 * 1000
          ) // 3 hours by default when using dinner as anchor
        : event.endsAt || event.startsAt
      : event.endsAt ||
        // If no explicit end time, default to 3 hours after start for calendar only
        new Date(new Date(event.startsAt).getTime() + 3 * 60 * 60 * 1000);

    const hasConfirmedDinner =
      booking?.wantsDinner &&
      booking?.dinnerTimeSlot &&
      booking?.dinnerBookingStatus === "CONFIRMED";

    let calendarTitle = event.title || "Pull Up Event";
    let calendarDescription = event.description || "";

    if (hasConfirmedDinner && useDinnerTime && booking?.dinnerTimeSlot) {
      // Dinner is the anchor - use dinner time as the calendar event time
      calendarTitle = `${event.title} - Dinner`;

      const dinnerTime = formatEventTime(booking.dinnerTimeSlot, event.timezone);
      const eventStartTime = event.startsAt
        ? formatEventTime(event.startsAt, event.timezone)
        : null;

      calendarDescription = `${event.description || ""}\n\n`;
      calendarDescription += `Dinner: ${dinnerTime}`;
      if (booking.dinnerPartySize > 1) {
        calendarDescription += ` (${booking.dinnerPartySize} people)`;
      }
      if (eventStartTime && eventStartTime !== dinnerTime) {
        calendarDescription += `\nCocktails: ${eventStartTime}`;
      }
      if (event.location) {
        calendarDescription += `\nLocation: ${event.location}`;
      }
    } else {
      // Event start is the anchor, add dinner info if applicable
      if (hasConfirmedDinner && booking?.dinnerTimeSlot) {
        const dinnerTime = formatEventTime(booking.dinnerTimeSlot, event.timezone);
        calendarDescription += `\n\nDinner: ${dinnerTime}`;
        if (booking.dinnerPartySize > 1) {
          calendarDescription += ` (${booking.dinnerPartySize} people)`;
        }
      } else if (
        booking?.wantsDinner &&
        booking?.dinnerBookingStatus === "WAITLIST"
      ) {
        calendarDescription += `\n\nDinner: Waitlisted (host will notify if a spot opens)`;
      }
      if (event.location) {
        calendarDescription += `\nLocation: ${event.location}`;
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
      timezone: event.timezone,
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
            `${colors.gradientGlow}, ${colors.background}`,
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
            `${colors.gradientGlow}, ${colors.background}`,
        }}
      >
        <div style={{ fontSize: "18px", opacity: 0.8 }}>Event not found</div>
      </div>
    );
  }

  if (verifying) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            `${colors.gradientGlow}, ${colors.background}`,
        }}
      >
        <div style={{ fontSize: "18px", opacity: 0.8 }}>Verifying your payment...</div>
      </div>
    );
  }

  if (verifyError && !booking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            `${colors.gradientGlow}, ${colors.background}`,
          padding: "20px",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "400px" }}>
          <div style={{ fontSize: "18px", marginBottom: "16px", color: "#f59e0b" }}>{verifyError}</div>
          <button
            onClick={() => navigate(`/e/${slug}`)}
            style={{
              padding: "12px 24px",
              background: colors.gold,
              color: "#000",
              border: "none",
              borderRadius: "8px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: "15px",
            }}
          >
            Back to Event
          </button>
        </div>
      </div>
    );
  }

  const eventDate = event?.startsAt
    ? formatReadableDateTime(event.startsAt, event.timezone)
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
        {(event?.coverImageUrl || event?.imageUrl) && (
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
                src={event.coverImageUrl || event.imageUrl}
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
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Content - Responsive container: edge-to-edge on mobile, constrained on desktop */}
          <div
            className="success-page-content"
            style={{
              position: "relative",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            {/* Centered card container */}
            <div
              style={{
                background: "rgba(5, 4, 10, 0.88)",
                borderRadius: "20px",
                padding: "24px 20px 22px",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
                backdropFilter: "blur(18px)",
              }}
            >
              {/* Status Badge */}
              <div style={{ marginBottom: "24px", textAlign: "center" }}>
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
                  fontSize: "clamp(26px, 5vw, 34px)",
                  fontWeight: 800,
                  marginBottom: "18px",
                  textAlign: "center",
                  color: "#fff",
                  lineHeight: "1.2",
                  letterSpacing: "-0.03em",
                  textShadow: "0 2px 10px rgba(0, 0, 0, 0.35)",
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
                    justifyContent: "center",
                    gap: "10px",
                    marginBottom: "12px",
                    fontSize: "15px",
                    lineHeight: "1.5",
                    color: "rgba(255, 255, 255, 0.95)",
                  }}
                >
                  <FaCalendar
                    size={18}
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      marginTop: "1px",
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
                    justifyContent: "center",
                    gap: "10px",
                    marginBottom: "22px",
                    fontSize: "15px",
                    lineHeight: "1.5",
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
                      background: colors.silverRgbaHover,
                      borderRadius: "16px",
                      border: `1px solid ${colors.silverRgba}`,
                      backdropFilter: "blur(10px)",
                      boxShadow: `0 4px 20px ${colors.silverShadow}`,
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
                        color: colors.silverText,
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
                        {formatEventTime(event.startsAt, event.timezone)}
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
                        background: "rgba(255, 255, 255, 0.2)",
                        color: "#fff",
                        border: "1px solid rgba(255, 255, 255, 0.3)",
                        fontWeight: 600,
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
                        background: colors.silverRgbaHover,
                        borderRadius: "16px",
                        border: `1px solid ${colors.silverRgba}`,
                        backdropFilter: "blur(10px)",
                        boxShadow: `0 4px 20px ${colors.silverShadow}`,
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
                          color: colors.silverText,
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
                          {formatEventTime(booking.dinnerTimeSlot, event.timezone)}
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
                          background: "rgba(255, 255, 255, 0.2)",
                          color: "#fff",
                          border: "1px solid rgba(255, 255, 255, 0.3)",
                          fontWeight: 600,
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
                    border: `2px solid ${colors.silverRgba}`,
                    backdropFilter: "blur(10px)",
                    boxShadow: `0 8px 32px ${colors.silverShadow}`,
                  }}
                >
                  {/* Receipt Header */}
                  <div
                    style={{
                      marginBottom: "20px",
                      paddingBottom: "16px",
                      borderBottom: `2px solid ${colors.silverRgba}`,
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
                      { sek: "kr", usd: "$", eur: "\u20AC", gbp: "\u00A3" }[
                        (payment.currency || "").toLowerCase()
                      ] || payment.currency?.toUpperCase() || "$";
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
                            color: colors.silverText,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            paddingTop: "16px",
                            borderTop: `2px solid ${colors.silverRgba}`,
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
                            color: colors.silverText,
                            textDecoration: "underline",
                            fontSize: "12px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <SilverIcon as={FileText} size={16} />
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
                color: colors.silverText,
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
