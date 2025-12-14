import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useToast } from "../components/Toast";
import { publicFetch, API_BASE } from "../lib/api.js";
import { getEventShareUrl } from "../lib/urlUtils";

export function EventSuccessPage() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [event, setEvent] = useState(location.state?.event || null);
  const [loading, setLoading] = useState(!location.state?.event);
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);
  const calendarDropdownRef = useRef(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!slug) {
      navigate("/");
      return;
    }

    // If we have event data from navigation state, use it immediately
    if (location.state?.event) {
      console.log(
        "[EventSuccessPage] Using event from navigation state:",
        location.state.event.slug
      );
      setEvent(location.state.event);
      setLoading(false);

      // If event doesn't have image, try to refetch once (but don't fail if it doesn't work)
      // Only retry if we're authenticated (for DRAFT events)
      if (!location.state.event.imageUrl && retryCountRef.current < 1) {
        // Check if user is authenticated before retrying (needed for DRAFT events)
        const checkAuthAndRetry = async () => {
          const { supabase } = await import("../lib/supabase.js");
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.access_token) {
            // User is authenticated, safe to retry for DRAFT events
            setTimeout(() => {
              fetchEvent(true);
            }, 1000);
          } else {
            // Not authenticated - can't fetch DRAFT events, but that's okay
            // The event from state is good enough
            console.log(
              "[EventSuccessPage] Not authenticated, skipping image refetch for DRAFT event"
            );
          }
        };
        checkAuthAndRetry();
      }
      return;
    }

    // Otherwise, fetch event details
    fetchEvent();
  }, [slug, navigate, showToast, location.state]);

  // Fetch event details
  async function fetchEvent(isRetry = false) {
    if (isRetry) {
      retryCountRef.current += 1;
      if (retryCountRef.current > 3) {
        return; // Stop retrying after 3 attempts
      }
    }

    try {
      // First, check if user is authenticated to decide which endpoint to use
      const { supabase } = await import("../lib/supabase.js");
      const {
        data: { session },
      } = await supabase.auth.getSession();

      let response;

      if (session?.access_token) {
        // User is authenticated - try authenticated endpoint first (for DRAFT events)
        try {
          // Make authenticated request manually to avoid redirect on 401
          const authHeaders = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          };

          response = await fetch(`${API_BASE}/events/${slug}`, {
            headers: authHeaders,
          });

          // If 401/403, fallback to public endpoint
          if (response.status === 401 || response.status === 403) {
            console.log("Auth failed, trying public endpoint");
            response = await publicFetch(`/events/${slug}`);
          }
        } catch (authError) {
          // Network error or other issue - try public endpoint
          console.log("Auth request failed, trying public endpoint");
          response = await publicFetch(`/events/${slug}`);
        }
      } else {
        // No session - use public endpoint directly
        response = await publicFetch(`/events/${slug}`);
      }

      if (response && response.ok) {
        const eventData = await response.json();
        setEvent(eventData);

        // If this was a retry and we still don't have an image, retry again
        if (isRetry && !eventData.imageUrl && retryCountRef.current < 3) {
          setTimeout(() => {
            fetchEvent(true);
          }, 2000); // Wait 2 seconds before next retry
        }
      } else {
        // If we have event from state, don't navigate away - just log the error
        if (location.state?.event) {
          console.warn(
            "Failed to refetch event, but using event from navigation state"
          );
          // Keep using the event from state
        } else if (!isRetry) {
          console.error(
            `Failed to fetch event: ${response?.status} ${response?.statusText}`
          );
          const errorData = response
            ? await response.json().catch(() => ({}))
            : {};
          console.error("Error details:", errorData);
          showToast("Event not found", "error");
          navigate("/");
        }
      }
    } catch (error) {
      console.error("Error fetching event:", error);
      if (!isRetry) {
        showToast("Failed to load event", "error");
        navigate("/");
      }
    } finally {
      if (!isRetry) {
        setLoading(false);
      }
    }
  }

  // Close calendar dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        calendarDropdownRef.current &&
        !calendarDropdownRef.current.contains(event.target)
      ) {
        setShowCalendarDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function formatEventDate(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };
    return date.toLocaleDateString("en-US", options);
  }

  function getCalendarUrls() {
    if (!event || !event.startsAt) {
      return {};
    }

    const formatDateForGoogle = (dateString) => {
      if (!dateString) return null;
      const date = new Date(dateString);
      return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const startDate = formatDateForGoogle(event.startsAt);
    if (!startDate) {
      return {};
    }

    let endDate;
    if (event.endsAt) {
      endDate = formatDateForGoogle(event.endsAt);
    } else {
      // Default to 2 hours after start if no end date
      const start = new Date(event.startsAt);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      endDate = formatDateForGoogle(end.toISOString());
    }

    const eventUrl = `${window.location.origin}/e/${event.slug}`;
    const description = `${event.description || ""}\n\nEvent page: ${eventUrl}`;

    const location = encodeURIComponent(event.location || "");
    const title = encodeURIComponent(event.title);
    const desc = encodeURIComponent(description);

    return {
      google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&details=${desc}&location=${location}`,
      outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${startDate}&enddt=${endDate}&body=${desc}&location=${location}`,
      yahoo: `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${title}&st=${startDate}&dur=${endDate}&desc=${desc}&in_loc=${location}`,
      apple: `data:text/calendar;charset=utf8,BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${startDate}\nDTEND:${endDate}\nSUMMARY:${title}\nDESCRIPTION:${desc}\nLOCATION:${location}\nEND:VEVENT\nEND:VCALENDAR`,
    };
  }

  function handleAddToCalendar(provider) {
    const urls = getCalendarUrls();
    const url = urls[provider];

    if (!url) {
      showToast("Unable to generate calendar link", "error");
      return;
    }

    if (provider === "apple") {
      // For Apple Calendar, create a downloadable .ics file
      const blob = new Blob([url.split(",")[1]], { type: "text/calendar" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${event.slug}.ics`;
      link.click();
    } else {
      window.open(url, "_blank");
    }
    setShowCalendarDropdown(false);
  }

  function handleShare() {
    if (!event) return;

    const shareUrl = getEventShareUrl(event.slug);

    if (navigator.share) {
      // URL ONLY - no title, no text, no files
      // This ensures rich preview (OG tags) is shown, not custom text
      navigator
        .share({
          url: shareUrl,
        })
        .then(() => {
          showToast("Event shared! 🎉", "success");
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            navigator.clipboard.writeText(shareUrl);
            showToast("Link copied to clipboard! 📋", "success");
          }
        });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(shareUrl);
      showToast("Link copied to clipboard! 📋", "success");
    }
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#05040a",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontSize: "24px" }}>Loading...</div>
      </div>
    );
  }

  if (!event) {
    return null;
  }

  const eventImageUrl = event.imageUrl || null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#05040a",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Event image background */}
      {eventImageUrl && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `url(${eventImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.3,
            filter: "blur(20px)",
            zIndex: 0,
          }}
        />
      )}

      {/* Overlay gradient */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "linear-gradient(to bottom, rgba(5,4,10,0.95) 0%, rgba(5,4,10,0.85) 50%, rgba(5,4,10,0.95) 100%)",
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "100vh",
          padding: "24px 20px",
          paddingBottom: "120px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ maxWidth: "400px", width: "100%", textAlign: "center" }}>
          {/* Success icon */}
          <div
            style={{
              fontSize: "64px",
              marginBottom: "24px",
            }}
          >
            ✨
          </div>

          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              marginBottom: "12px",
            }}
          >
            Event {event.status === "DRAFT" ? "saved" : "posted"}!
          </h1>

          {/* Event preview card */}
          <div
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(10px)",
              borderRadius: "16px",
              padding: "20px",
              marginBottom: "32px",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {/* Event image */}
            {eventImageUrl && (
              <div
                style={{
                  width: "100%",
                  height: "200px",
                  borderRadius: "12px",
                  marginBottom: "16px",
                  overflow: "hidden",
                  backgroundImage: `url(${eventImageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            )}

            {/* Event title */}
            <h2
              style={{
                fontSize: "22px",
                fontWeight: 700,
                marginBottom: "8px",
                textAlign: "left",
              }}
            >
              {event.title}
            </h2>

            {/* Event description */}
            {event.description && (
              <p
                style={{
                  fontSize: "14px",
                  opacity: 0.8,
                  marginBottom: "12px",
                  textAlign: "left",
                  lineHeight: "1.5",
                }}
              >
                {event.description}
              </p>
            )}

            {/* Event details */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                textAlign: "left",
              }}
            >
              {event.startsAt && (
                <div
                  style={{
                    fontSize: "14px",
                    opacity: 0.9,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>📅</span>
                  <span>{formatEventDate(event.startsAt)}</span>
                </div>
              )}

              {event.location && (
                <div
                  style={{
                    fontSize: "14px",
                    opacity: 0.9,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>📍</span>
                  <span>{event.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Share button - Primary action */}
          <div style={{ marginBottom: "12px", width: "100%" }}>
            <button
              onClick={handleShare}
              style={{
                width: "100%",
                padding: "18px",
                borderRadius: "12px",
                border: "none",
                background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                fontSize: "18px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              🔗 Share Event
            </button>
          </div>

          {/* Add to calendar dropdown */}
          <div
            ref={calendarDropdownRef}
            style={{
              position: "relative",
              width: "100%",
              marginBottom: "16px",
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCalendarDropdown(!showCalendarDropdown);
              }}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: "16px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <span>📅</span>
              <span>Add to calendar</span>
              <span>{showCalendarDropdown ? "▲" : "▼"}</span>
            </button>

            {showCalendarDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: "8px",
                  background: "rgba(20, 16, 30, 0.95)",
                  backdropFilter: "blur(10px)",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  overflow: "hidden",
                  zIndex: 10,
                }}
              >
                <button
                  onClick={() => handleAddToCalendar("google")}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    border: "none",
                    background: "transparent",
                    color: "#fff",
                    fontSize: "15px",
                    textAlign: "left",
                    cursor: "pointer",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "transparent";
                  }}
                >
                  Google Calendar
                </button>
                <button
                  onClick={() => handleAddToCalendar("outlook")}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    border: "none",
                    background: "transparent",
                    color: "#fff",
                    fontSize: "15px",
                    textAlign: "left",
                    cursor: "pointer",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "transparent";
                  }}
                >
                  Outlook
                </button>
                <button
                  onClick={() => handleAddToCalendar("yahoo")}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    border: "none",
                    background: "transparent",
                    color: "#fff",
                    fontSize: "15px",
                    textAlign: "left",
                    cursor: "pointer",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "transparent";
                  }}
                >
                  Yahoo Calendar
                </button>
                <button
                  onClick={() => handleAddToCalendar("apple")}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    border: "none",
                    background: "transparent",
                    color: "#fff",
                    fontSize: "15px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "transparent";
                  }}
                >
                  Apple Calendar
                </button>
              </div>
            )}
          </div>

          {/* View event link */}
          <a
            href={`/e/${event.slug}`}
            onClick={(e) => {
              e.preventDefault();
              window.open(`/e/${event.slug}`, "_blank");
            }}
            style={{
              color: "rgba(255,255,255,0.6)",
              textDecoration: "none",
              fontSize: "14px",
            }}
          >
            View event page →
          </a>
        </div>
      </div>
    </div>
  );
}
