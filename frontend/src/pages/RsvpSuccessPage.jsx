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
} from "react-icons/fa";
import { getEventShareUrl } from "../lib/urlUtils";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { ModalOrDrawer } from "../components/ui/ModalOrDrawer";
import { useToast } from "../components/Toast";
import { publicFetch } from "../lib/api.js";

// Single Share Button Component (Instagram-style with conditional logic)
function ShareButton({ url, title, text, imageUrl }) {
  const { showToast } = useToast();
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);
  }, []);

  const handleShare = async () => {
    // On iOS: Use native share sheet (includes copy link option)
    if (isIOS && navigator.share) {
      try {
        const shareData = {
          title: title || "Check this out",
          text: text || url,
          url: url,
        };

        // Include image if provided
        if (imageUrl && navigator.canShare) {
          try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const file = new File([blob], "event-image.jpg", {
              type: blob.type,
            });

            if (navigator.canShare({ files: [file] })) {
              shareData.files = [file];
            }
          } catch (imgError) {
            console.log("Could not include image in share:", imgError);
          }
        }

        await navigator.share(shareData);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Error sharing:", err);
          // Fallback to copy on error
          handleCopy();
        }
      }
    } else {
      // On desktop/other: Copy to clipboard
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
    <Button
      onClick={async () => {
        const shareUrl = getEventShareUrl(event.slug);
        if (navigator.share) {
          try {
            await navigator.share({ url: shareUrl });
            return;
          } catch (err) {
            if (err?.name === "AbortError") return;
          }
        }
        await navigator.clipboard.writeText(shareUrl);
        showToast("Link copied!", "success");
      }}
      variant="secondary"
      fullWidth
    >
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

  // Get booking details from navigation state
  const booking = location.state?.booking || null;

  useEffect(() => {
    async function loadEvent() {
      try {
        const res = await publicFetch(`/events/${slug}`);
        if (!res.ok) throw new Error("Failed to load event");
        const data = await res.json();
        setEvent(data);
      } catch (err) {
        console.error("Error loading event", err);
      } finally {
        setLoading(false);
      }
    }

    if (slug) loadEvent();
  }, [slug]);

  // Generate calendar service URLs
  // Rule: One event in the user's head. One anchor in the calendar. Dinner is an optional precision layer.
  // If dinner is booked, user can choose between dinner time or event time as anchor
  function getCalendarUrls(useDinnerTime = false) {
    if (!event) return {};

    const formatDateForGoogle = (dateString) => {
      const date = new Date(dateString);
      return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const hasConfirmedDinner =
      booking?.wantsDinner &&
      booking?.dinnerTimeSlot &&
      booking?.dinnerBookingStatus === "CONFIRMED";

    let anchorStartDate;
    let anchorEndDate;
    let calendarTitle = event.title;
    let calendarDescription = event.description || "";

    if (hasConfirmedDinner && useDinnerTime) {
      // Dinner is the anchor - use dinner time as the calendar event time
      anchorStartDate = formatDateForGoogle(booking.dinnerTimeSlot);
      // Calculate end time: dinner start + 2 hours for smooth calendar experience
      const dinnerStart = new Date(booking.dinnerTimeSlot);
      anchorEndDate = formatDateForGoogle(
        new Date(dinnerStart.getTime() + 2 * 60 * 60 * 1000)
      );

      // Add dinner precision to title
      calendarTitle = `${event.title} - Dinner`;

      // Build comprehensive description with all event details
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
      // Event start is the anchor
      anchorStartDate = event.startsAt
        ? formatDateForGoogle(event.startsAt)
        : formatDateForGoogle(new Date());
      anchorEndDate = event.endsAt
        ? formatDateForGoogle(event.endsAt)
        : formatDateForGoogle(new Date(Date.now() + 2 * 60 * 60 * 1000));

      // Add dinner info to description if they have dinner
      if (hasConfirmedDinner) {
        const dinnerTime = new Date(booking.dinnerTimeSlot).toLocaleTimeString(
          "en-US",
          { hour: "numeric", minute: "2-digit" }
        );
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

    const eventUrl = `${window.location.origin}/e/${slug}`;
    calendarDescription += `\n\nEvent page: ${eventUrl}`;

    const location = encodeURIComponent(event.location || "");
    const title = encodeURIComponent(calendarTitle);
    const description = encodeURIComponent(calendarDescription);

    // Google Calendar
    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${anchorStartDate}/${anchorEndDate}&details=${description}&location=${location}`;

    // Outlook Calendar
    const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${anchorStartDate}&enddt=${anchorEndDate}&body=${description}&location=${location}`;

    // Yahoo Calendar
    const yahooUrl = `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${title}&st=${anchorStartDate}&dur=${anchorEndDate}&desc=${description}&in_loc=${location}`;

    // Apple Calendar (iCal) - fallback to download
    // Use the same anchor dates as web calendars
    const formatDateForIcs = (dateString) => {
      const date = new Date(dateString);
      return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const icsStartDate = anchorStartDate;
    const icsEndDate = anchorEndDate;

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PullUp//Event//EN",
      "BEGIN:VEVENT",
      `UID:${event.id}@pullup.se`,
      `DTSTAMP:${formatDateForIcs(new Date())}`,
      `DTSTART:${icsStartDate}`,
      `DTEND:${icsEndDate}`,
      `SUMMARY:${calendarTitle}`,
      `DESCRIPTION:${calendarDescription.replace(/\n/g, "\\n")}`,
      location ? `LOCATION:${event.location}` : "",
      `URL:${eventUrl}`,
      "STATUS:CONFIRMED",
      "SEQUENCE:0",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .filter((line) => line !== "")
      .join("\r\n");

    return {
      google: googleUrl,
      outlook: outlookUrl,
      yahoo: yahooUrl,
      icsContent,
    };
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
    ? new Date(event.startsAt).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
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
                <Badge
                  variant="warning"
                  style={{
                    fontSize: "15px",
                    padding: "12px 24px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "10px",
                    background: "rgba(251, 191, 36, 0.25)",
                    border: "1px solid rgba(251, 191, 36, 0.4)",
                    color: "#fff",
                    backdropFilter: "blur(20px)",
                    borderRadius: "12px",
                    fontWeight: 600,
                    boxShadow: "0 4px 20px rgba(251, 191, 36, 0.2)",
                  }}
                >
                  <FaClock size={18} />
                  <span>You're on the list</span>
                </Badge>
              )}
            </div>

            {/* Success Message */}
            <h1
              style={{
                fontSize: "clamp(36px, 8vw, 56px)",
                fontWeight: 800,
                marginBottom: "16px",
                textAlign: "center",
                background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                lineHeight: "1.1",
                letterSpacing: "-0.03em",
                textShadow: "0 4px 30px rgba(139, 92, 246, 0.4)",
                marginTop: "0",
              }}
            >
              {booking?.bookingStatus === "WAITLIST"
                ? "You're on the list"
                : booking?.name
                ? `See you there, ${booking.name.split(" ")[0]}!`
                : "See you there!"}
            </h1>

            <p
              style={{
                fontSize: "clamp(16px, 4vw, 20px)",
                opacity: 0.95,
                marginBottom: "40px",
                lineHeight: 1.5,
                textAlign: "center",
                color: "#fff",
                fontWeight: 400,
                letterSpacing: "-0.01em",
              }}
            >
              {booking?.bookingStatus === "WAITLIST"
                ? "If spots open up, you'll get the link."
                : "We're excited to see you!"}
            </p>

            {/* Primary Action: Add to Calendar */}
            <div
              style={{
                marginBottom: "24px",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <Button
                onClick={() => {
                  const urls = getCalendarUrls(false);
                  if (urls?.google) {
                    window.open(urls.google, "_blank");
                  }
                }}
                fullWidth
                size="lg"
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 25px rgba(0, 0, 0, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 20px rgba(0, 0, 0, 0.3)";
                }}
              >
                <FaCalendar
                  size={20}
                  style={{ display: "flex", alignItems: "center" }}
                />
                <span>Add to Calendar</span>
              </Button>
            </div>

            {/* Calendar Provider Selection (if dinner confirmed) */}
            {(() => {
              const hasConfirmedDinner =
                booking?.wantsDinner &&
                booking?.dinnerTimeSlot &&
                booking?.dinnerBookingStatus === "CONFIRMED";

              if (!hasConfirmedDinner) return null;

              return (
                <>
                  <Button
                    onClick={() => setShowCalendarMenu(true)}
                    variant="secondary"
                    fullWidth
                    style={{
                      marginBottom: "24px",
                      width: "100%",
                      maxWidth: "100%",
                      boxSizing: "border-box",
                      boxShadow: "0 2px 15px rgba(0, 0, 0, 0.2)",
                      transition: "all 0.3s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow =
                        "0 4px 20px rgba(0, 0, 0, 0.3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow =
                        "0 2px 15px rgba(0, 0, 0, 0.2)";
                    }}
                  >
                    <FaUtensils
                      size={18}
                      style={{ display: "flex", alignItems: "center" }}
                    />
                    <span>Add Dinner Time</span>
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
                </>
              );
            })()}

            {/* Your Details - Edge-to-edge, no card */}
            <div style={{ marginBottom: "40px", textAlign: "left" }}>
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  opacity: 0.8,
                  marginBottom: "24px",
                  color: "rgba(255, 255, 255, 0.9)",
                  fontWeight: 600,
                }}
              >
                Your details
              </div>
              <h2
                style={{
                  fontSize: "clamp(32px, 6vw, 42px)",
                  fontWeight: 800,
                  marginBottom: "24px",
                  color: "#fff",
                  lineHeight: "1.2",
                  letterSpacing: "-0.03em",
                  textShadow: "0 2px 10px rgba(0, 0, 0, 0.3)",
                }}
              >
                {event.title}
              </h2>

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

              {event.location && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "14px",
                    marginBottom: "24px",
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

              {booking && (
                <>
                  <div
                    style={{
                      marginTop: "32px",
                      paddingTop: "28px",
                      borderTop: "1px solid rgba(255, 255, 255, 0.15)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "16px",
                        flexWrap: "wrap",
                      }}
                    >
                      <Badge
                        variant={
                          booking.bookingStatus === "CONFIRMED"
                            ? "success"
                            : "warning"
                        }
                        style={{
                          fontSize: "14px",
                          padding: "10px 18px",
                          fontWeight: 600,
                          borderRadius: "8px",
                        }}
                      >
                        {booking.bookingStatus === "CONFIRMED"
                          ? "Confirmed"
                          : "Waitlist"}
                      </Badge>
                      {booking.partySize > 1 && (
                        <span
                          style={{
                            opacity: 0.9,
                            fontSize: "17px",
                            color: "rgba(255, 255, 255, 0.95)",
                            fontWeight: 400,
                          }}
                        >
                          {booking.partySize}{" "}
                          {booking.partySize === 1 ? "person" : "people"}
                        </span>
                      )}
                    </div>

                    {/* Dinner Details */}
                    {booking.wantsDinner && booking.dinnerBookingStatus && (
                      <div
                        style={{
                          marginTop: "20px",
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
                            marginBottom: "8px",
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
                              marginTop: "4px",
                              color: "rgba(255, 255, 255, 0.9)",
                            }}
                          >
                            {new Date(
                              booking.dinnerTimeSlot
                            ).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                            {booking.dinnerPartySize > 1 &&
                              ` • ${booking.dinnerPartySize} people`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

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
