// frontend/src/pages/RsvpSuccessPage.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { publicFetch } from "../lib/api.js";

export function RsvpSuccessPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDinnerDropdown, setShowDinnerDropdown] = useState(false);
  const [showEventDropdown, setShowEventDropdown] = useState(false);

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
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        background:
          "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.15) 0%, transparent 50%), #05040a",
        padding: "40px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Animated background particles */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: "4px",
              height: "4px",
              background: "rgba(139, 92, 246, 0.5)",
              borderRadius: "50%",
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      <div
        className="responsive-container responsive-container-wide"
        style={{ position: "relative", zIndex: 2, maxWidth: "600px" }}
      >
        <div
          className="responsive-card"
          style={{
            background: "rgba(12, 10, 18, 0.8)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(139, 92, 246, 0.3)",
            borderRadius: "24px",
            padding: "48px 32px",
            textAlign: "center",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
          }}
        >
          {/* Success Icon */}
          <div
            style={{
              fontSize: "80px",
              marginBottom: "24px",
              animation: "scaleIn 0.5s ease-out",
            }}
          >
            🎉
          </div>

          {/* Success Message */}
          <h1
            style={{
              fontSize: "clamp(28px, 5vw, 36px)",
              fontWeight: 700,
              marginBottom: "12px",
              background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {booking?.bookingStatus === "WAITLIST"
              ? "You're on the waitlist!"
              : booking?.name
              ? `You're all set, ${booking.name.split(" ")[0]}!`
              : "You're all set!"}
          </h1>

          <p
            style={{
              fontSize: "18px",
              opacity: 0.8,
              marginBottom: "32px",
              lineHeight: 1.6,
            }}
          >
            {booking?.bookingStatus === "WAITLIST"
              ? "We'll notify you if a spot opens up. In the meantime, feel free to share the event with friends!"
              : "We're excited to see you at the event!"}
          </p>

          {/* Calendar Buttons - Above summary for click optimization */}
          {(() => {
            const hasConfirmedDinner =
              booking?.wantsDinner &&
              booking?.dinnerTimeSlot &&
              booking?.dinnerBookingStatus === "CONFIRMED";

            return (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  marginBottom: "32px",
                }}
              >
                {hasConfirmedDinner && (
                  <div style={{ position: "relative" }} data-calendar-dropdown>
                    <button
                      onClick={() => {
                        setShowDinnerDropdown(!showDinnerDropdown);
                        setShowEventDropdown(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "16px 24px",
                        borderRadius: "12px",
                        border: "none",
                        background:
                          "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                        color: "#fff",
                        fontSize: "16px",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "10px",
                        boxShadow: "0 4px 20px rgba(139, 92, 246, 0.3)",
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.transform = "translateY(-2px)";
                        e.target.style.boxShadow =
                          "0 6px 25px rgba(139, 92, 246, 0.4)";
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = "translateY(0)";
                        e.target.style.boxShadow =
                          "0 4px 20px rgba(139, 92, 246, 0.3)";
                      }}
                    >
                      <span style={{ fontSize: "20px" }}>🍽️</span>
                      <span>Add Dinner to Calendar</span>
                      <span style={{ fontSize: "12px", marginLeft: "auto" }}>
                        {showDinnerDropdown ? "▲" : "▼"}
                      </span>
                    </button>

                    {showDinnerDropdown && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          marginTop: "8px",
                          background: "rgba(20, 16, 30, 0.95)",
                          backdropFilter: "blur(10px)",
                          border: "1px solid rgba(139, 92, 246, 0.3)",
                          borderRadius: "12px",
                          padding: "8px",
                          zIndex: 1000,
                          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.5)",
                        }}
                      >
                        <button
                          onClick={() => handleCalendarService("google", true)}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "8px",
                            border: "none",
                            background: "transparent",
                            color: "#fff",
                            fontSize: "15px",
                            fontWeight: 500,
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background =
                              "rgba(139, 92, 246, 0.2)";
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = "transparent";
                          }}
                        >
                          <span style={{ fontSize: "20px" }}>📅</span>
                          <span>Google Calendar</span>
                        </button>

                        <button
                          onClick={() => handleCalendarService("outlook", true)}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "8px",
                            border: "none",
                            background: "transparent",
                            color: "#fff",
                            fontSize: "15px",
                            fontWeight: 500,
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background =
                              "rgba(139, 92, 246, 0.2)";
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = "transparent";
                          }}
                        >
                          <span style={{ fontSize: "20px" }}>📧</span>
                          <span>Outlook</span>
                        </button>

                        <button
                          onClick={() => handleCalendarService("yahoo", true)}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "8px",
                            border: "none",
                            background: "transparent",
                            color: "#fff",
                            fontSize: "15px",
                            fontWeight: 500,
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background =
                              "rgba(139, 92, 246, 0.2)";
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = "transparent";
                          }}
                        >
                          <span style={{ fontSize: "20px" }}>📮</span>
                          <span>Yahoo Calendar</span>
                        </button>

                        <div
                          style={{
                            height: "1px",
                            background: "rgba(255, 255, 255, 0.1)",
                            margin: "8px 0",
                          }}
                        />

                        <button
                          onClick={() => handleCalendarService("apple", true)}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "8px",
                            border: "none",
                            background: "transparent",
                            color: "#fff",
                            fontSize: "15px",
                            fontWeight: 500,
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background =
                              "rgba(139, 92, 246, 0.2)";
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = "transparent";
                          }}
                        >
                          <span style={{ fontSize: "20px" }}>🍎</span>
                          <span>Apple Calendar (.ics)</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ position: "relative" }} data-calendar-dropdown>
                  <button
                    onClick={() => {
                      setShowEventDropdown(!showEventDropdown);
                      setShowDinnerDropdown(false);
                    }}
                    style={{
                      width: "100%",
                      padding: "16px 24px",
                      borderRadius: "12px",
                      border: "none",
                      background:
                        "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                      color: "#fff",
                      fontSize: "16px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      boxShadow: "0 4px 20px rgba(139, 92, 246, 0.3)",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = "translateY(-2px)";
                      e.target.style.boxShadow =
                        "0 6px 25px rgba(139, 92, 246, 0.4)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = "translateY(0)";
                      e.target.style.boxShadow =
                        "0 4px 20px rgba(139, 92, 246, 0.3)";
                    }}
                  >
                    <span style={{ fontSize: "20px" }}>📅</span>
                    <span>Add Event to Calendar</span>
                    <span style={{ fontSize: "12px", marginLeft: "auto" }}>
                      {showEventDropdown ? "▲" : "▼"}
                    </span>
                  </button>

                  {showEventDropdown && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        marginTop: "8px",
                        background: "rgba(20, 16, 30, 0.95)",
                        backdropFilter: "blur(10px)",
                        border: "1px solid rgba(139, 92, 246, 0.3)",
                        borderRadius: "12px",
                        padding: "8px",
                        zIndex: 1000,
                        boxShadow: "0 10px 40px rgba(0, 0, 0, 0.5)",
                      }}
                    >
                      <button
                        onClick={() => handleCalendarService("google", false)}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          borderRadius: "8px",
                          border: "none",
                          background: "transparent",
                          color: "#fff",
                          fontSize: "15px",
                          fontWeight: 500,
                          cursor: "pointer",
                          textAlign: "left",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = "rgba(139, 92, 246, 0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = "transparent";
                        }}
                      >
                        <span style={{ fontSize: "20px" }}>📅</span>
                        <span>Google Calendar</span>
                      </button>

                      <button
                        onClick={() => handleCalendarService("outlook", false)}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          borderRadius: "8px",
                          border: "none",
                          background: "transparent",
                          color: "#fff",
                          fontSize: "15px",
                          fontWeight: 500,
                          cursor: "pointer",
                          textAlign: "left",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = "rgba(139, 92, 246, 0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = "transparent";
                        }}
                      >
                        <span style={{ fontSize: "20px" }}>📧</span>
                        <span>Outlook</span>
                      </button>

                      <button
                        onClick={() => handleCalendarService("yahoo", false)}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          borderRadius: "8px",
                          border: "none",
                          background: "transparent",
                          color: "#fff",
                          fontSize: "15px",
                          fontWeight: 500,
                          cursor: "pointer",
                          textAlign: "left",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = "rgba(139, 92, 246, 0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = "transparent";
                        }}
                      >
                        <span style={{ fontSize: "20px" }}>📮</span>
                        <span>Yahoo Calendar</span>
                      </button>

                      <div
                        style={{
                          height: "1px",
                          background: "rgba(255, 255, 255, 0.1)",
                          margin: "8px 0",
                        }}
                      />

                      <button
                        onClick={() => handleCalendarService("apple", false)}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          borderRadius: "8px",
                          border: "none",
                          background: "transparent",
                          color: "#fff",
                          fontSize: "15px",
                          fontWeight: 500,
                          cursor: "pointer",
                          textAlign: "left",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = "rgba(139, 92, 246, 0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = "transparent";
                        }}
                      >
                        <span style={{ fontSize: "20px" }}>🍎</span>
                        <span>Apple Calendar (.ics)</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Event Details Card */}
          <div
            style={{
              background: "rgba(20, 16, 30, 0.6)",
              borderRadius: "16px",
              padding: "24px",
              marginBottom: "32px",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              textAlign: "left",
            }}
          >
            <h2
              style={{
                fontSize: "22px",
                fontWeight: 600,
                marginBottom: "16px",
                color: "#fff",
              }}
            >
              {event.title}
            </h2>

            {eventDate && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "12px",
                  fontSize: "15px",
                  opacity: 0.9,
                }}
              >
                <span style={{ fontSize: "20px" }}>📅</span>
                <span>{eventDate}</span>
              </div>
            )}

            {event.location && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "12px",
                  fontSize: "15px",
                  opacity: 0.9,
                }}
              >
                <span style={{ fontSize: "20px" }}>📍</span>
                <span>{event.location}</span>
              </div>
            )}

            {/* Booking Status Badge */}
            {booking && (
              <div
                style={{
                  marginTop: "16px",
                  paddingTop: "16px",
                  borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "12px",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: "8px",
                      background:
                        booking.bookingStatus === "CONFIRMED"
                          ? "rgba(16, 185, 129, 0.2)"
                          : "rgba(245, 158, 11, 0.2)",
                      border:
                        booking.bookingStatus === "CONFIRMED"
                          ? "1px solid rgba(16, 185, 129, 0.4)"
                          : "1px solid rgba(245, 158, 11, 0.4)",
                      color:
                        booking.bookingStatus === "CONFIRMED"
                          ? "#10b981"
                          : "#f59e0b",
                    }}
                  >
                    {booking.bookingStatus === "CONFIRMED"
                      ? "✅ Confirmed"
                      : "⏳ Waitlist"}
                  </span>
                  {booking.partySize > 1 && (
                    <span style={{ opacity: 0.7, fontSize: "13px" }}>
                      {booking.partySize}{" "}
                      {booking.partySize === 1 ? "guest" : "guests"}
                    </span>
                  )}
                </div>

                {/* Dinner Details */}
                {booking.wantsDinner && booking.dinnerBookingStatus && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "12px",
                      background: "rgba(139, 92, 246, 0.1)",
                      borderRadius: "8px",
                      border: "1px solid rgba(139, 92, 246, 0.2)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "8px",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#a78bfa",
                      }}
                    >
                      <span>🍽️</span>
                      <span>Dinner</span>
                      <span
                        style={{
                          marginLeft: "auto",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background:
                            booking.dinnerBookingStatus === "CONFIRMED"
                              ? "rgba(16, 185, 129, 0.2)"
                              : "rgba(245, 158, 11, 0.2)",
                          border:
                            booking.dinnerBookingStatus === "CONFIRMED"
                              ? "1px solid rgba(16, 185, 129, 0.4)"
                              : "1px solid rgba(245, 158, 11, 0.4)",
                          color:
                            booking.dinnerBookingStatus === "CONFIRMED"
                              ? "#10b981"
                              : "#f59e0b",
                          fontSize: "12px",
                        }}
                      >
                        {booking.dinnerBookingStatus === "CONFIRMED"
                          ? "Confirmed"
                          : "Waitlist"}
                      </span>
                    </div>
                    {booking.dinnerTimeSlot && (
                      <div
                        style={{
                          fontSize: "13px",
                          opacity: 0.8,
                          marginTop: "4px",
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
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Back to Event Link */}
          <div style={{ marginTop: "32px", fontSize: "14px", opacity: 0.7 }}>
            <button
              onClick={() => navigate(`/e/${slug}`)}
              style={{
                background: "none",
                border: "none",
                color: "#a78bfa",
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: "14px",
              }}
            >
              ← Back to event
            </button>
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

        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0.5;
          }
          50% {
            transform: translateY(-20px) translateX(10px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
