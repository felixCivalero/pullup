import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useToast } from "../components/Toast";
import { FaPaperPlane, FaCalendar } from "react-icons/fa";
import { getEventShareUrl } from "../lib/urlUtils";

import { authenticatedFetch, API_BASE } from "../lib/api.js";

function isNetworkError(error) {
  return (
    error instanceof TypeError ||
    error.message.includes("Failed to fetch") ||
    error.message.includes("NetworkError")
  );
}

function generateDinnerTimeSlots(event) {
  if (!event.dinnerEnabled || !event.dinnerStartTime || !event.dinnerEndTime) {
    return [];
  }

  const slots = [];
  const start = new Date(event.dinnerStartTime);
  const end = new Date(event.dinnerEndTime);
  const intervalMs = (event.dinnerSeatingIntervalHours || 2) * 60 * 60 * 1000;

  let current = new Date(start);
  while (current <= end) {
    slots.push(new Date(current).toISOString());
    current = new Date(current.getTime() + intervalMs);
  }

  return slots;
}

export function EventGuestsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [event, setEvent] = useState(null);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [editingGuest, setEditingGuest] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [pulledUpModalGuest, setPulledUpModalGuest] = useState(null);
  const [dinnerSlots, setDinnerSlots] = useState([]);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc"); // "asc" or "desc"
  const [searchQuery, setSearchQuery] = useState(""); // Search query for guest name/email
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);
  const calendarDropdownRef = useRef(null);

  // Debounce timers for number inputs
  const debounceTimers = useRef({});

  useEffect(() => {
    function handleMouseMove(e) {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    async function load() {
      setNetworkError(false);
      try {
        const res = await authenticatedFetch(`/host/events/${id}/guests`);
        if (!res.ok) throw new Error("Failed to load guests");
        const data = await res.json();
        setEvent(data.event);
        setGuests(data.guests || []);

        // Load dinner slots if dinner is enabled
        if (data.event?.dinnerEnabled) {
          try {
            const slotsRes = await fetch(
              `${API_BASE}/events/${data.event.slug}/dinner-slots`
            );
            if (slotsRes.ok) {
              const slotsData = await slotsRes.json();
              setDinnerSlots(slotsData.slots || []);
            }
          } catch (err) {
            console.error("Failed to load dinner slots", err);
          }
        }
      } catch (err) {
        console.error(err);
        if (isNetworkError(err)) {
          setNetworkError(true);
        } else {
          showToast("Could not load guests", "error");
        }
      } finally {
        setLoading(false);
      }
    }
    load();

    // Cleanup: flush pending changes and clear timers on unmount
    return () => {
      // Flush all pending debounced calls before unmounting
      Object.keys(debounceTimers.current).forEach((rsvpId) => {
        const timer = debounceTimers.current[rsvpId];
        if (timer) {
          clearTimeout(timer);
          // Get the current guest state from the closure
          setGuests((currentGuests) => {
            const guest = currentGuests.find((g) => g.id === rsvpId);
            if (guest) {
              // Fire and forget - persist the change
              persistPulledUpChange(
                rsvpId,
                guest.dinnerPullUpCount ?? guest.pulledUpForDinner ?? null,
                guest.cocktailOnlyPullUpCount ??
                  guest.pulledUpForCocktails ??
                  null
              );
            }
            return currentGuests;
          });
          delete debounceTimers.current[rsvpId];
        }
      });
      debounceTimers.current = {};
    };
  }, [id, showToast]);

  // Handle click outside calendar dropdown
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

  // Refetch guests when component mounts or when returning to tab
  // This ensures we always have the latest data from the server
  useEffect(() => {
    let isMounted = true;

    const flushAndRefetch = async () => {
      // Flush any pending debounced changes
      Object.keys(debounceTimers.current).forEach((rsvpId) => {
        const timer = debounceTimers.current[rsvpId];
        if (timer) {
          clearTimeout(timer);
          setGuests((currentGuests) => {
            const guest = currentGuests.find((g) => g.id === rsvpId);
            if (guest) {
              persistPulledUpChange(
                rsvpId,
                guest.dinnerPullUpCount ?? guest.pulledUpForDinner ?? null,
                guest.cocktailOnlyPullUpCount ??
                  guest.pulledUpForCocktails ??
                  null
              );
            }
            return currentGuests;
          });
          delete debounceTimers.current[rsvpId];
        }
      });

      // Wait a bit for pending API calls to complete, then refetch
      setTimeout(async () => {
        if (!isMounted) return;
        try {
          const res = await authenticatedFetch(`/host/events/${id}/guests`);
          if (res.ok && isMounted) {
            const data = await res.json();
            setGuests(data.guests || []);
          }
        } catch (err) {
          console.error("Failed to refetch guests", err);
        }
      }, 300);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        flushAndRefetch();
      }
    };

    const handleFocus = () => {
      flushAndRefetch();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [id]);

  async function handleUpdateGuest(rsvpId, updates) {
    try {
      const res = await authenticatedFetch(
        `/host/events/${id}/rsvps/${rsvpId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update guest");
      }

      showToast("Guest updated successfully! ✨", "success");
      setEditingGuest(null);

      // Reload guests
      const guestsRes = await authenticatedFetch(`/host/events/${id}/guests`);
      if (guestsRes.ok) {
        const data = await guestsRes.json();
        setGuests(data.guests || []);
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || "Could not update guest", "error");
    }
  }

  async function handleDeleteGuest(guest) {
    try {
      const res = await authenticatedFetch(
        `/host/events/${id}/rsvps/${guest.id}`,
        {
          method: "DELETE",
        }
      );

      if (!res.ok) {
        throw new Error("Failed to delete guest");
      }

      showToast("Guest deleted successfully", "success");
      setShowDeleteConfirm(null);

      // Reload guests
      const guestsRes = await authenticatedFetch(`/host/events/${id}/guests`);
      if (guestsRes.ok) {
        const data = await guestsRes.json();
        setGuests(data.guests || []);
      }
    } catch (err) {
      console.error(err);
      showToast("Could not delete guest", "error");
    }
  }

  // Update local state immediately (optimistic update)
  function updateLocalPulledUpState(
    rsvpId,
    dinnerPullUpCount,
    cocktailOnlyPullUpCount
  ) {
    setGuests((prev) =>
      prev.map((g) =>
        g.id === rsvpId
          ? {
              ...g,
              dinnerPullUpCount: dinnerPullUpCount || 0,
              cocktailOnlyPullUpCount: cocktailOnlyPullUpCount || 0,
              // Backward compatibility
              pulledUpForDinner: dinnerPullUpCount || null,
              pulledUpForCocktails: cocktailOnlyPullUpCount || null,
              pulledUp:
                (dinnerPullUpCount && dinnerPullUpCount > 0) ||
                (cocktailOnlyPullUpCount && cocktailOnlyPullUpCount > 0),
              pulledUpCount:
                (dinnerPullUpCount || 0) + (cocktailOnlyPullUpCount || 0) ||
                null,
            }
          : g
      )
    );
  }

  // API call to persist changes
  async function persistPulledUpChange(
    rsvpId,
    dinnerPullUpCount,
    cocktailOnlyPullUpCount
  ) {
    try {
      const res = await authenticatedFetch(
        `/host/events/${id}/rsvps/${rsvpId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dinnerPullUpCount: dinnerPullUpCount || 0,
            cocktailOnlyPullUpCount: cocktailOnlyPullUpCount || 0,
            // Backward compatibility
            pulledUpForDinner: dinnerPullUpCount || null,
            pulledUpForCocktails: cocktailOnlyPullUpCount || null,
          }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to update pulled up status");
      }
    } catch (err) {
      console.error(err);
      showToast("Could not update pulled up status", "error");
      // Reload guests on error to get correct state
      const guestsRes = await authenticatedFetch(`/host/events/${id}/guests`);
      if (guestsRes.ok) {
        const data = await guestsRes.json();
        setGuests(data.guests || []);
      }
    }
  }

  // Handle pulled up change - immediate for checkboxes, debounced for number inputs
  function handlePulledUpChange(
    rsvpId,
    dinnerPullUpCount,
    cocktailOnlyPullUpCount,
    debounce = false
  ) {
    // Update local state immediately for instant UI feedback
    updateLocalPulledUpState(
      rsvpId,
      dinnerPullUpCount,
      cocktailOnlyPullUpCount
    );

    if (debounce) {
      // Clear existing timer for this RSVP
      if (debounceTimers.current[rsvpId]) {
        clearTimeout(debounceTimers.current[rsvpId]);
      }
      // Set new timer to persist after 300ms of no changes (reduced for faster persistence)
      debounceTimers.current[rsvpId] = setTimeout(() => {
        persistPulledUpChange(
          rsvpId,
          dinnerPullUpCount,
          cocktailOnlyPullUpCount
        );
        delete debounceTimers.current[rsvpId];
      }, 300);
    } else {
      // Immediate API call for checkbox toggles
      persistPulledUpChange(rsvpId, dinnerPullUpCount, cocktailOnlyPullUpCount);
    }
  }

  function handleEditGuest(guest) {
    setEditingGuest(guest);
  }

  function handleRowClick(guest, e) {
    // Don't open modal if clicking on action buttons or inputs
    if (
      e.target.closest("button") ||
      e.target.closest("input") ||
      e.target.closest("select")
    ) {
      return;
    }
    setPulledUpModalGuest(guest);
  }

  if (loading) {
    return (
      <div
        className="page-with-header"
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        }}
      >
        <div className="responsive-container">
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            Loading guests…
          </div>
        </div>
      </div>
    );
  }

  if (networkError) {
    return (
      <div
        className="page-with-header"
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        }}
      >
        <div className="responsive-container">
          <div
            className="responsive-card"
            style={{
              textAlign: "center",
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <h2 style={{ marginBottom: "8px", fontSize: "24px" }}>
              Connection Error
            </h2>
            <p style={{ opacity: 0.7, marginBottom: "16px" }}>
              Unable to connect to the server. Please check your internet
              connection and try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 24px",
                borderRadius: "999px",
                border: "none",
                background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div
        className="page-with-header"
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        }}
      >
        <div className="responsive-container">
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            Event not found.
          </div>
        </div>
      </div>
    );
  }

  // Stats - count people, not just RSVPs
  // Use stored totalGuests value (calculated once in backend) for consistency
  const stats = guests.reduce(
    (acc, g) => {
      // Use stored totalGuests, fallback to partySize for backward compatibility
      const totalGuests = g.totalGuests ?? g.partySize ?? 1;
      const partySize = g.partySize || 1;
      const dinnerPartySize = g.dinnerPartySize || partySize;

      // Count waitlist using totalGuests
      if (g.bookingStatus === "WAITLIST" || g.status === "waitlist") {
        acc.waitlist += totalGuests;
      }

      // Count all attending guests using totalGuests
      if (g.status === "attending") {
        acc.attending += partySize; // Use partySize, not totalGuests
        // Also track cocktail list (partySize) for display purposes
        acc.cocktailList += partySize;

        // Calculate cocktails-only for this guest
        const wantsDinner = g.dinner?.enabled || g.wantsDinner || false;
        const plusOnes = g.plusOnes ?? 0;

        // If no dinner: all partySize is cocktails-only (booker + plusOnes)
        // If dinner: only plusOnes are cocktails-only (dinnerPartySize goes to dinner)
        if (wantsDinner) {
          acc.cocktailsOnly += plusOnes; // Only plusOnes are cocktails-only
        } else {
          acc.cocktailsOnly += partySize; // Entire party is cocktails-only
        }
      }

      // Count dinner-related stats
      if (g.wantsDinner) {
        if (g.dinnerStatus === "confirmed") {
          acc.dinnerConfirmed += dinnerPartySize;
        } else if (g.dinnerStatus === "cocktails") {
          acc.dinnerCocktails += dinnerPartySize;
        } else if (g.dinnerStatus === "cocktails_waitlist") {
          acc.dinnerCocktails += dinnerPartySize;
          acc.dinnerWaitlist += dinnerPartySize;
        } else if (g.dinnerStatus === "waitlist") {
          acc.dinnerWaitlist += dinnerPartySize;
        }
      }

      return acc;
    },
    {
      waitlist: 0,
      attending: 0,
      cocktailList: 0,
      cocktailsOnly: 0,
      dinnerConfirmed: 0,
      dinnerWaitlist: 0,
      dinnerCocktails: 0,
    }
  );

  // Use the calculated attending value
  const attending = stats.attending;

  // Debug: Log stats calculation
  console.log("🔍 [Stats Debug]:", {
    cocktailList: stats.cocktailList,
    dinnerConfirmed: stats.dinnerConfirmed,
    cocktailsOnly: stats.cocktailsOnly,
    attending,
    calculation: `Total Attending: ${attending} (sum of totalGuests), Cocktails Only: ${stats.cocktailsOnly} (attending - dinner confirmed), Dinner Confirmed: ${stats.dinnerConfirmed}`,
  });

  // Capacities - use stored values from event object
  const cocktailCapacity = event.cocktailCapacity ?? null;
  // Cocktail spots left = capacity - cocktails only (people attending cocktails but not dinner)
  const cocktailSpotsLeft =
    cocktailCapacity != null
      ? Math.max(cocktailCapacity - stats.cocktailsOnly, 0)
      : null;

  // Food capacity (stored in event object)
  const foodCapacity = event.foodCapacity ?? null;
  const foodSpotsLeft =
    foodCapacity != null
      ? Math.max(foodCapacity - stats.dinnerConfirmed, 0)
      : null;

  // Total capacity (stored in event object)
  const totalCapacity = event.totalCapacity ?? null;
  const totalSpotsLeft =
    totalCapacity != null ? Math.max(totalCapacity - attending, 0) : null;

  // Filter guests by search query (name or email)
  const filteredGuests = guests.filter((g) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase().trim();
    const name = (g.name || "").toLowerCase();
    const email = (g.email || "").toLowerCase();

    // Prioritize name matches, then email matches
    return name.includes(query) || email.includes(query);
  });

  // Sorting function
  const handleSort = (column) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Apply sorting
  const sortedGuests = [...filteredGuests].sort((a, b) => {
    if (!sortColumn) return 0;

    let aValue, bValue;

    switch (sortColumn) {
      case "guest":
        aValue = (a.name || "").toLowerCase();
        bValue = (b.name || "").toLowerCase();
        break;
      case "status":
        aValue = a.status || "";
        bValue = b.status || "";
        break;
      case "cocktailList":
        aValue = a.partySize || 1;
        bValue = b.partySize || 1;
        break;
      case "dinnerParty":
        aValue = a.dinnerPartySize || 0;
        bValue = b.dinnerPartySize || 0;
        break;
      case "totalAttending":
        aValue = a.totalGuests ?? a.partySize ?? 1;
        bValue = b.totalGuests ?? b.partySize ?? 1;
        break;
      case "dinnerTime":
        aValue = a.dinnerTimeSlot ? new Date(a.dinnerTimeSlot).getTime() : 0;
        bValue = b.dinnerTimeSlot ? new Date(b.dinnerTimeSlot).getTime() : 0;
        break;
      case "rsvpDate":
        aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        position: "relative",
        background:
          "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        paddingBottom: "40px",
      }}
    >
      {/* Hero Image Background - Full Screen */}
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
              alt={event.title || "Event"}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>
          {/* Gradient overlay - fades to dark at bottom where menu is */}
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background:
                "linear-gradient(to bottom, transparent 0%, transparent 30%, rgba(5, 4, 10, 0.2) 50%, rgba(5, 4, 10, 0.5) 65%, rgba(12, 10, 18, 0.8) 80%, rgba(12, 10, 18, 0.95) 90%, #0c0a12 100%)",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        </>
      )}

      {/* Cursor glow effect */}
      <div
        style={{
          position: "fixed",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)",
          left: mousePosition.x - 300,
          top: mousePosition.y - 300,
          pointerEvents: "none",
          transition: "all 0.3s ease-out",
          zIndex: 1,
        }}
      />

      <style>{`
        @media (max-width: 767px) {
          .export-csv-button-container {
            display: none !important;
          }
        }
      `}</style>

      {/* Content - Overlaid on background */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: "100%",
          padding: "0",
          margin: "0",
        }}
      >
        {/* Share and Calendar Icons - Above Title */}
        {event && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "20px 20px 12px 20px",
            }}
          >
            {/* Share button */}
            <button
              onClick={handleShare}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                boxShadow: "none",
                appearance: "none",
                WebkitAppearance: "none",
                MozAppearance: "none",
                cursor: "pointer",
                color: "rgba(255, 255, 255, 0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
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

            {/* Calendar dropdown */}
            <div
              ref={calendarDropdownRef}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCalendarDropdown(!showCalendarDropdown);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  margin: 0,
                  boxShadow: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  cursor: "pointer",
                  color: "rgba(255, 255, 255, 0.7)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = "rgba(255, 255, 255, 0.9)";
                  e.target.style.transform = "scale(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = "rgba(255, 255, 255, 0.7)";
                  e.target.style.transform = "scale(1)";
                }}
              >
                <FaCalendar size={18} />
              </button>

              {showCalendarDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: "8px",
                    background: "rgba(20, 16, 30, 0.95)",
                    backdropFilter: "blur(10px)",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    overflow: "hidden",
                    zIndex: 10,
                    minWidth: "180px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
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

            {/* Go to live link */}
            <div
              style={{
                fontSize: "16px",
                opacity: 0.8,
                color: "rgba(255, 255, 255, 0.8)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flex: 1,
              }}
            >
              <a
                href={`/e/${event.slug}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#8b5cf6",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "16px",
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = "#a78bfa";
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = "#8b5cf6";
                }}
              >
                go to live
              </a>
            </div>
          </div>
        )}

        {/* Title - Above Menu */}
        {event && (
          <h1
            style={{
              marginBottom: "20px",
              padding: "0 20px",
              fontSize: "clamp(28px, 8vw, 40px)",
              fontWeight: 800,
              lineHeight: "1.2",
              color: "#fff",
              letterSpacing: "-0.02em",
              maxWidth: "100%",
            }}
          >
            {event.title || "Untitled event"}
          </h1>
        )}
        <div
          style={{
            background: "rgba(12, 10, 18, 0.6)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.05)",
            width: "100%",
            maxWidth: "100%",
            borderRadius: "0",
            padding: "0",
            boxSizing: "border-box",
          }}
        >
          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "0",
              padding: "20px 20px 0 20px",
              fontSize: "16px",
              borderBottom: "2px solid rgba(255,255,255,0.08)",
              paddingBottom: "0",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <button
              onClick={() => navigate(`/app/events/${id}/manage`)}
              style={{
                background: "transparent",
                border: "none",
                color: "#9ca3af",
                cursor: "pointer",
                transition: "all 0.3s ease",
                padding: "14px 20px",
                minHeight: "44px",
                borderRadius: "8px 8px 0 0",
                fontWeight: 500,
                borderBottom: "2px solid transparent",
                marginBottom: "-2px",
                fontSize: "16px",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
              onMouseEnter={(e) => {
                e.target.style.color = "#fff";
                e.target.style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                e.target.style.color = "#9ca3af";
                e.target.style.background = "transparent";
              }}
            >
              Overview
            </button>
            <div
              style={{
                padding: "14px 20px",
                minHeight: "44px",
                fontWeight: 700,
                color: "#fff",
                borderBottom: "2px solid #8b5cf6",
                marginBottom: "-2px",
                background: "rgba(139, 92, 246, 0.1)",
                borderRadius: "8px 8px 0 0",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              👥 Guests ({guests.length})
            </div>
            <button
              onClick={() => navigate(`/app/events/${id}/manage?tab=edit`)}
              style={{
                background: "transparent",
                border: "none",
                color: "#9ca3af",
                cursor: "pointer",
                transition: "all 0.3s ease",
                padding: "14px 20px",
                minHeight: "44px",
                borderRadius: "8px 8px 0 0",
                fontWeight: 500,
                borderBottom: "2px solid transparent",
                marginBottom: "-2px",
                fontSize: "16px",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
              onMouseEnter={(e) => {
                e.target.style.color = "#fff";
                e.target.style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                e.target.style.color = "#9ca3af";
                e.target.style.background = "transparent";
              }}
            >
              Edit
            </button>
          </div>

          {/* Tab Content Container */}
          <div
            style={{
              padding: "24px 20px",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            {/* Export CSV Button */}
            <div
              className="export-csv-button-container"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "20px",
              }}
            >
              <button
                onClick={async () => {
                  try {
                    const res = await authenticatedFetch(
                      `/host/events/${id}/guests/export`
                    );
                    if (!res.ok) throw new Error("Export failed");
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `event-guests-${event.slug || id}-${
                      new Date().toISOString().split("T")[0]
                    }.csv`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                  } catch (err) {
                    console.error(err);
                    showToast("Failed to export CSV", "error");
                  }
                }}
                style={{
                  padding: "12px 20px",
                  borderRadius: "12px",
                  border: "1px solid rgba(139, 92, 246, 0.3)",
                  background: "rgba(139, 92, 246, 0.1)",
                  color: "#a78bfa",
                  fontSize: "16px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  minHeight: "44px",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "rgba(139, 92, 246, 0.2)";
                  e.target.style.borderColor = "rgba(139, 92, 246, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "rgba(139, 92, 246, 0.1)";
                  e.target.style.borderColor = "rgba(139, 92, 246, 0.3)";
                }}
              >
                📥 Export CSV
              </button>
            </div>

            {/* Search Bar - Smartphone Friendly */}
            <div
              style={{
                marginBottom: "24px",
                padding: "0 20px",
              }}
            >
              <input
                type="text"
                placeholder="Search guests by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgb(12 10 18 / 10%)",
                  color: "#fff",
                  fontSize: "16px",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "all 0.2s ease",
                  backdropFilter: "blur(10px)",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "rgba(139, 92, 246, 0.5)";
                  e.target.style.background = "rgb(12 10 18 / 15%)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(255,255,255,0.05)";
                  e.target.style.background = "rgb(12 10 18 / 10%)";
                }}
              />
            </div>

            {/* Guests Table */}
            {sortedGuests.length === 0 ? (
              <div
                style={{
                  background: "rgb(12 10 18 / 10%)",
                  padding: "40px 24px",
                  borderRadius: "16px",
                  textAlign: "center",
                  border: "1px solid rgba(255,255,255,0.05)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    fontSize: "48px",
                    marginBottom: "16px",
                    opacity: 0.5,
                  }}
                >
                  👥
                </div>
                <div style={{ fontSize: "16px", opacity: 0.7 }}>
                  {searchQuery.trim()
                    ? `No guests found matching "${searchQuery}"`
                    : "No guests yet."}
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: "rgba(20, 16, 30, 0.5)",
                  borderRadius: "20px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  overflow: "hidden",
                  overflowX: "auto",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: "1000px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(236, 72, 153, 0.1) 100%)",
                        borderBottom: "2px solid rgba(139, 92, 246, 0.3)",
                      }}
                    >
                      <SortableHeader
                        column="guest"
                        label="Guest"
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        align="left"
                      />
                      <SortableHeader
                        column="status"
                        label="Status"
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        align="left"
                      />
                      {event.dinnerEnabled && (
                        <>
                          <SortableHeader
                            column="cocktailList"
                            label="Cocktail List"
                            sortColumn={sortColumn}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            align="center"
                          />
                          <SortableHeader
                            column="dinnerParty"
                            label="Dinner Party"
                            sortColumn={sortColumn}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            align="center"
                          />
                          <SortableHeader
                            column="totalAttending"
                            label="Total Attending"
                            sortColumn={sortColumn}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            align="center"
                          />
                          <SortableHeader
                            column="dinnerTime"
                            label="Dinner Time"
                            sortColumn={sortColumn}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            align="center"
                          />
                        </>
                      )}
                      {!event.dinnerEnabled && (
                        <SortableHeader
                          column="totalAttending"
                          label="Total Guests"
                          sortColumn={sortColumn}
                          sortDirection={sortDirection}
                          onSort={handleSort}
                          align="center"
                        />
                      )}
                      <SortableHeader
                        column="rsvpDate"
                        label="RSVP Date"
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        align="right"
                      />
                      <th
                        style={{
                          padding: "20px 24px",
                          textAlign: "center",
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          opacity: 0.95,
                          color: "#fff",
                          width: "140px",
                        }}
                      >
                        Pulled Up
                      </th>
                      <th
                        style={{
                          padding: "20px 24px",
                          textAlign: "center",
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          opacity: 0.95,
                          color: "#fff",
                          width: "120px",
                        }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedGuests.map((g, idx) => (
                      <tr
                        key={g.id}
                        onClick={(e) => handleRowClick(g, e)}
                        style={{
                          borderBottom:
                            idx < sortedGuests.length - 1
                              ? "1px solid rgba(255,255,255,0.06)"
                              : "none",
                          transition: "all 0.2s ease",
                          background:
                            idx % 2 === 0
                              ? "transparent"
                              : "rgba(255,255,255,0.01)",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "rgba(139, 92, 246, 0.08)";
                          e.currentTarget.style.transform = "scale(1.002)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            idx % 2 === 0
                              ? "transparent"
                              : "rgba(255,255,255,0.01)";
                          e.currentTarget.style.transform = "scale(1)";
                        }}
                      >
                        <td style={{ padding: "20px 24px" }}>
                          <div
                            style={{
                              fontWeight: 600,
                              marginBottom: "6px",
                              fontSize: "15px",
                              color: "#fff",
                            }}
                          >
                            {g.name || "—"}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              opacity: 0.7,
                              wordBreak: "break-word",
                              color: "#e5e7eb",
                            }}
                          >
                            {g.email}
                          </div>
                        </td>
                        <td style={{ padding: "20px 24px" }}>
                          <CombinedStatusBadge guest={g} />
                        </td>
                        {event.dinnerEnabled && (
                          <>
                            <td
                              style={{ padding: "20px", textAlign: "center" }}
                            >
                              {(() => {
                                // Cocktail List = plusOnes (cocktails-only people)
                                // With new model: partySize = dinnerPartySize + plusOnes
                                const plusOnes = g.plusOnes ?? 0;

                                if (plusOnes > 0) {
                                  return (
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        opacity: 0.9,
                                        padding: "4px 10px",
                                        background: "rgba(245, 158, 11, 0.15)",
                                        borderRadius: "6px",
                                        border:
                                          "1px solid rgba(245, 158, 11, 0.3)",
                                        color: "#f59e0b",
                                        fontWeight: 600,
                                        display: "inline-block",
                                      }}
                                    >
                                      +{plusOnes} guest{plusOnes > 1 ? "s" : ""}
                                    </div>
                                  );
                                }

                                return (
                                  <span
                                    style={{
                                      fontSize: "14px",
                                      opacity: 0.5,
                                      color: "#fff",
                                    }}
                                  >
                                    —
                                  </span>
                                );
                              })()}
                            </td>
                            <td
                              style={{ padding: "20px", textAlign: "center" }}
                            >
                              {g.dinnerStatus === "confirmed" &&
                              g.dinnerPartySize ? (
                                <div
                                  style={{
                                    fontSize: "16px",
                                    fontWeight: 700,
                                    color: "#10b981",
                                  }}
                                >
                                  {g.dinnerPartySize}
                                </div>
                              ) : (
                                <span
                                  style={{
                                    fontSize: "13px",
                                    opacity: 0.4,
                                    fontStyle: "italic",
                                  }}
                                >
                                  —
                                </span>
                              )}
                            </td>
                            <td
                              style={{ padding: "20px", textAlign: "center" }}
                            >
                              {(() => {
                                // TOTAL ATTENDING = partySize (total unique guests)
                                const partySize = g.partySize || 1;

                                return (
                                  <div
                                    style={{
                                      fontSize: "18px",
                                      fontWeight: 700,
                                      color: "#fff",
                                    }}
                                  >
                                    {partySize}
                                  </div>
                                );
                              })()}
                            </td>
                            <td
                              style={{ padding: "20px", textAlign: "center" }}
                            >
                              {g.dinnerTimeSlot ? (
                                <div
                                  style={{
                                    fontSize: "13px",
                                    opacity: 0.9,
                                    fontWeight: 600,
                                    color: "#fff",
                                  }}
                                >
                                  {new Date(
                                    g.dinnerTimeSlot
                                  ).toLocaleTimeString("en-US", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </div>
                              ) : (
                                <span
                                  style={{
                                    fontSize: "13px",
                                    opacity: 0.4,
                                    fontStyle: "italic",
                                  }}
                                >
                                  —
                                </span>
                              )}
                            </td>
                          </>
                        )}
                        {!event.dinnerEnabled && (
                          <td style={{ padding: "20px", textAlign: "center" }}>
                            <div
                              style={{
                                fontSize: "18px",
                                fontWeight: 700,
                                color: "#fff",
                              }}
                            >
                              {g.partySize || 1}
                            </div>
                            {g.plusOnes > 0 && (
                              <div
                                style={{
                                  fontSize: "11px",
                                  opacity: 0.8,
                                  padding: "3px 8px",
                                  background: "rgba(139, 92, 246, 0.15)",
                                  borderRadius: "6px",
                                  border: "1px solid rgba(139, 92, 246, 0.3)",
                                  color: "#a78bfa",
                                  fontWeight: 600,
                                  marginTop: "4px",
                                }}
                              >
                                +{g.plusOnes} guest{g.plusOnes > 1 ? "s" : ""}
                              </div>
                            )}
                          </td>
                        )}
                        <td
                          style={{
                            padding: "20px",
                            textAlign: "right",
                            fontSize: "13px",
                            opacity: 0.7,
                            color: "#d1d5db",
                          }}
                        >
                          {new Date(g.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td style={{ padding: "20px", textAlign: "center" }}>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            {(() => {
                              const cocktailsPulledUp =
                                g.cocktailOnlyPullUpCount ??
                                g.pulledUpForCocktails ??
                                0;
                              const dinnerPulledUp =
                                g.dinnerPullUpCount ?? g.pulledUpForDinner ?? 0;
                              const hasAnyPulledUp =
                                cocktailsPulledUp > 0 || dinnerPulledUp > 0;

                              if (!hasAnyPulledUp) {
                                return (
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      opacity: 0.5,
                                      color: "rgba(255,255,255,0.5)",
                                      fontStyle: "italic",
                                    }}
                                  >
                                    Not checked in
                                  </span>
                                );
                              }

                              return (
                                <>
                                  {cocktailsPulledUp > 0 && (
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        fontWeight: 600,
                                        color: "#f59e0b",
                                        padding: "4px 8px",
                                        background: "rgba(245, 158, 11, 0.15)",
                                        borderRadius: "6px",
                                        border:
                                          "1px solid rgba(245, 158, 11, 0.3)",
                                      }}
                                    >
                                      🥂 {cocktailsPulledUp}
                                    </div>
                                  )}
                                  {dinnerPulledUp > 0 && (
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        fontWeight: 600,
                                        color: "#10b981",
                                        padding: "4px 8px",
                                        background: "rgba(16, 185, 129, 0.15)",
                                        borderRadius: "6px",
                                        border:
                                          "1px solid rgba(16, 185, 129, 0.3)",
                                      }}
                                    >
                                      🍽️ {dinnerPulledUp}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </td>
                        <td style={{ padding: "20px", textAlign: "center" }}>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              justifyContent: "center",
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditGuest(g);
                              }}
                              style={{
                                padding: "6px 12px",
                                borderRadius: "8px",
                                border: "1px solid rgba(139, 92, 246, 0.4)",
                                background: "rgba(139, 92, 246, 0.1)",
                                color: "#a78bfa",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background =
                                  "rgba(139, 92, 246, 0.2)";
                                e.target.style.borderColor =
                                  "rgba(139, 92, 246, 0.6)";
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background =
                                  "rgba(139, 92, 246, 0.1)";
                                e.target.style.borderColor =
                                  "rgba(139, 92, 246, 0.4)";
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDeleteConfirm(g);
                              }}
                              style={{
                                padding: "6px 12px",
                                borderRadius: "8px",
                                border: "1px solid rgba(236, 72, 153, 0.4)",
                                background: "rgba(236, 72, 153, 0.1)",
                                color: "#f472b6",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background =
                                  "rgba(236, 72, 153, 0.2)";
                                e.target.style.borderColor =
                                  "rgba(236, 72, 153, 0.6)";
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background =
                                  "rgba(236, 72, 153, 0.1)";
                                e.target.style.borderColor =
                                  "rgba(236, 72, 153, 0.4)";
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Guest Modal */}
      {editingGuest && (
        <EditGuestModal
          guest={editingGuest}
          event={event}
          allGuests={guests}
          onClose={() => setEditingGuest(null)}
          onSave={(updates) => handleUpdateGuest(editingGuest.id, updates)}
        />
      )}

      {/* Pulled Up Modal */}
      {pulledUpModalGuest && (
        <PulledUpModal
          guest={pulledUpModalGuest}
          event={event}
          onClose={() => setPulledUpModalGuest(null)}
          onSave={async (dinnerPullUpCount, cocktailOnlyPullUpCount) => {
            try {
              const res = await authenticatedFetch(
                `/host/events/${id}/rsvps/${pulledUpModalGuest.id}`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    dinnerPullUpCount: dinnerPullUpCount || 0,
                    cocktailOnlyPullUpCount: cocktailOnlyPullUpCount || 0,
                    // Backward compatibility
                    pulledUpForDinner: dinnerPullUpCount || null,
                    pulledUpForCocktails: cocktailOnlyPullUpCount || null,
                  }),
                }
              );

              if (!res.ok) {
                throw new Error("Failed to update pulled up status");
              }

              // Refetch guests to get latest data
              const guestsRes = await authenticatedFetch(
                `/host/events/${id}/guests`
              );
              if (guestsRes.ok) {
                const data = await guestsRes.json();
                setGuests(data.guests || []);
              }

              setPulledUpModalGuest(null);
              showToast("Check-in status updated successfully! ✨", "success");
              return true; // Success
            } catch (err) {
              console.error(err);
              showToast("Could not update check-in status", "error");
              return false; // Error
            }
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          guest={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(null)}
          onConfirm={() => handleDeleteGuest(showDeleteConfirm)}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  const isGradient = color.includes("gradient");
  return (
    <div
      style={{
        padding: "20px",
        background: "rgb(12 10 18 / 10%)",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.05)",
        backdropFilter: "blur(10px)",
        transition: "all 0.3s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.3)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(139, 92, 246, 0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          fontSize: "24px",
          marginBottom: "8px",
          opacity: 0.9,
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: "10px",
          opacity: 0.7,
          marginBottom: "8px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "32px",
          fontWeight: 700,
          ...(isGradient
            ? {
                background: color,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }
            : { color }),
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SortableHeader({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  align = "left",
}) {
  const isActive = sortColumn === column;
  return (
    <th
      onClick={() => onSort(column)}
      style={{
        padding: "20px 24px",
        textAlign: align,
        fontSize: "11px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        opacity: 0.95,
        color: "#fff",
        cursor: "pointer",
        userSelect: "none",
        transition: "all 0.2s ease",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(139, 92, 246, 0.1)";
        e.currentTarget.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.opacity = "0.95";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          justifyContent:
            align === "center"
              ? "center"
              : align === "right"
              ? "flex-end"
              : "flex-start",
        }}
      >
        <span>{label}</span>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            opacity: isActive ? 1 : 0.4,
            transition: "opacity 0.2s ease",
          }}
        >
          <span
            style={{
              fontSize: "8px",
              lineHeight: "1",
              color:
                isActive && sortDirection === "asc"
                  ? "#8b5cf6"
                  : "rgba(255, 255, 255, 0.6)",
            }}
          >
            ▲
          </span>
          <span
            style={{
              fontSize: "8px",
              lineHeight: "1",
              color:
                isActive && sortDirection === "desc"
                  ? "#8b5cf6"
                  : "rgba(255, 255, 255, 0.6)",
            }}
          >
            ▼
          </span>
        </div>
      </div>
    </th>
  );
}

function CombinedStatusBadge({ guest }) {
  // Use new model fields with backward compatibility
  const bookingStatus =
    guest.bookingStatus ||
    (guest.status === "attending"
      ? "CONFIRMED"
      : guest.status === "waitlist"
      ? "WAITLIST"
      : "CANCELLED");
  const wantsDinner = guest.dinner?.enabled || guest.wantsDinner || false;
  const dinnerBookingStatus =
    guest.dinner?.bookingStatus ||
    (guest.dinnerStatus === "confirmed"
      ? "CONFIRMED"
      : guest.dinnerStatus === "waitlist"
      ? "WAITLIST"
      : null);

  // Backward compatibility for display
  const status =
    guest.status || (bookingStatus === "CONFIRMED" ? "attending" : "waitlist");
  const dinnerStatus =
    guest.dinnerStatus ||
    (dinnerBookingStatus === "CONFIRMED"
      ? "confirmed"
      : dinnerBookingStatus === "WAITLIST"
      ? "waitlist"
      : null);

  // Get pull-up counts (new model with backward compatibility)
  const dinnerPullUpCount =
    guest.dinnerPullUpCount ?? guest.pulledUpForDinner ?? 0;
  const cocktailOnlyPullUpCount =
    guest.cocktailOnlyPullUpCount ?? guest.pulledUpForCocktails ?? 0;

  // Calculate expected counts for arrival status using DPCS
  const partySize = guest.partySize ?? 1;
  const plusOnes = guest.plusOnes ?? 0;
  const dinnerPartySize = guest.dinner?.partySize ?? guest.dinnerPartySize ?? 0;

  // Use DPCS to calculate cocktail-only max
  const cocktailOnlyMax = wantsDinner ? plusOnes : partySize;
  const totalExpected = dinnerPartySize + cocktailOnlyMax;
  const totalArrived = dinnerPullUpCount + cocktailOnlyPullUpCount;

  // Derive pull-up status (only for CONFIRMED bookings)
  let pullUpStatus = "NONE";
  if (bookingStatus === "CONFIRMED") {
    if (totalArrived === 0) {
      pullUpStatus = "NONE";
    } else if (totalArrived > 0 && totalArrived < totalExpected) {
      pullUpStatus = "PARTIAL";
    } else if (totalArrived === totalExpected) {
      pullUpStatus = "FULL";
    }
  }

  // Determine combined status label
  let label = "";
  let bg = "";
  let border = "";
  let color = "";

  if (bookingStatus === "CONFIRMED") {
    if (!wantsDinner || dinnerBookingStatus === null) {
      // Confirmed for event, no dinner
      label = "CONFIRMED";
      bg = "rgba(16, 185, 129, 0.2)";
      border = "rgba(16, 185, 129, 0.5)";
      color = "#10b981";
    } else if (dinnerBookingStatus === "CONFIRMED") {
      // Confirmed for event + dinner confirmed
      label = "CONFIRMED";
      bg = "rgba(16, 185, 129, 0.2)";
      border = "rgba(16, 185, 129, 0.5)";
      color = "#10b981";
    } else if (dinnerBookingStatus === "WAITLIST") {
      // Confirmed for event, waiting for dinner (shouldn't happen with all-or-nothing, but handle it)
      label = "CONFIRMED";
      bg = "rgba(16, 185, 129, 0.2)";
      border = "rgba(16, 185, 129, 0.5)";
      color = "#10b981";
    }
  } else if (bookingStatus === "WAITLIST") {
    // Entire booking is on waitlist (all-or-nothing)
    label = "WAITLIST";
    bg = "rgba(236, 72, 153, 0.2)";
    border = "rgba(236, 72, 153, 0.5)";
    color = "#f472b6";
  } else if (bookingStatus === "CANCELLED") {
    label = "CANCELLED";
    bg = "rgba(107, 114, 128, 0.2)";
    border = "rgba(107, 114, 128, 0.5)";
    color = "#9ca3af";
  }

  // Fallback
  if (!label) {
    label = status === "attending" ? "Attending" : "Waitlist";
    bg =
      status === "attending"
        ? "rgba(139, 92, 246, 0.2)"
        : "rgba(236, 72, 153, 0.2)";
    border =
      status === "attending"
        ? "rgba(139, 92, 246, 0.5)"
        : "rgba(236, 72, 153, 0.5)";
    color = status === "attending" ? "#a78bfa" : "#f472b6";
  }

  // Add arrival status indicator (only for CONFIRMED bookings)
  let arrivalIndicator = "";
  if (
    (guest.bookingStatus === "CONFIRMED" || status === "attending") &&
    totalExpected > 0
  ) {
    if (pullUpStatus === "FULL") {
      arrivalIndicator = "all pulled up";
    } else if (pullUpStatus === "PARTIAL") {
      arrivalIndicator = `${totalArrived}/${totalExpected} pulled up`;
    } else {
      arrivalIndicator = "haven't pulled up";
    }
  }

  // Check if capacity was overridden
  const capacityOverridden = guest.capacityOverridden === true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            padding: "6px 12px",
            borderRadius: "999px",
            background: bg,
            border: `1.5px solid ${border}`,
            color: color,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            display: "inline-block",
            lineHeight: "1.3",
          }}
        >
          {label}
        </span>
        {capacityOverridden && bookingStatus === "CONFIRMED" && (
          <span
            title="This guest was confirmed by overriding capacity limits."
            style={{
              fontSize: "9px",
              fontWeight: 600,
              padding: "4px 8px",
              borderRadius: "999px",
              background: "rgba(245, 158, 11, 0.2)",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              color: "#f59e0b",
              textTransform: "none",
              letterSpacing: "0.02em",
              cursor: "help",
              whiteSpace: "nowrap",
            }}
          >
            Over capacity
          </span>
        )}
      </div>
      {arrivalIndicator && (
        <span
          style={{
            fontSize: "9px",
            fontWeight: 500,
            color:
              pullUpStatus === "FULL"
                ? "#10b981"
                : pullUpStatus === "PARTIAL"
                ? "#f59e0b"
                : "rgba(255,255,255,0.5)",
            textTransform: "none",
            letterSpacing: "0.02em",
            marginTop: "2px",
          }}
        >
          {arrivalIndicator}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    attending: {
      label: "Attending",
      bg: "rgba(139, 92, 246, 0.2)",
      border: "rgba(139, 92, 246, 0.5)",
      color: "#a78bfa",
    },
    waitlist: {
      label: "Waitlist",
      bg: "rgba(236, 72, 153, 0.2)",
      border: "rgba(236, 72, 153, 0.5)",
      color: "#f472b6",
    },
  };

  const style = config[status] || config.waitlist;

  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 700,
        padding: "6px 12px",
        borderRadius: "999px",
        background: style.bg,
        border: `1.5px solid ${style.border}`,
        color: style.color,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        display: "inline-block",
      }}
    >
      {style.label}
    </span>
  );
}

function DinnerStatusBadge({ status }) {
  const config = {
    confirmed: {
      label: "✅ Confirmed",
      bg: "rgba(16, 185, 129, 0.2)",
      border: "rgba(16, 185, 129, 0.5)",
      color: "#10b981",
    },
    waitlist: {
      label: "⏳ Waitlist",
      bg: "rgba(236, 72, 153, 0.2)",
      border: "rgba(236, 72, 153, 0.5)",
      color: "#f472b6",
    },
    cocktails: {
      label: "🥂 Cocktails",
      bg: "rgba(245, 158, 11, 0.2)",
      border: "rgba(245, 158, 11, 0.5)",
      color: "#f59e0b",
    },
    cocktails_waitlist: {
      label: "🥂⏳ Both",
      bg: "rgba(139, 92, 246, 0.2)",
      border: "rgba(139, 92, 246, 0.5)",
      color: "#a78bfa",
    },
  };

  const style = config[status] || config.waitlist;

  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 700,
        padding: "6px 12px",
        borderRadius: "999px",
        background: style.bg,
        border: `1.5px solid ${style.border}`,
        color: style.color,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        display: "inline-block",
      }}
    >
      {style.label}
    </span>
  );
}

function EditGuestModal({ guest, event, onClose, onSave, allGuests }) {
  const [name, setName] = useState(guest.name || "");
  const [email, setEmail] = useState(guest.email || "");

  // Use new model fields with backward compatibility
  const guestPartySize = guest.partySize || 1;
  const guestDinnerPartySize =
    guest.dinner?.partySize || guest.dinnerPartySize || 0;
  const guestWantsDinner = guest.dinner?.enabled || guest.wantsDinner || false;
  const guestDinnerTimeSlot =
    guest.dinner?.slotTime || guest.dinnerTimeSlot || "";

  // Initialize plusOnes - if dinnerPartySize > partySize, adjust accordingly
  const initialPlusOnes =
    guest.plusOnes !== undefined
      ? guest.plusOnes
      : Math.max(0, guestPartySize - 1);

  const [plusOnes, setPlusOnes] = useState(initialPlusOnes);
  const [status, setStatus] = useState(
    guest.bookingStatus === "CONFIRMED"
      ? "attending"
      : guest.bookingStatus === "WAITLIST"
      ? "waitlist"
      : guest.status || "attending"
  );
  const [wantsDinner, setWantsDinner] = useState(guestWantsDinner);
  const [dinnerTimeSlot, setDinnerTimeSlot] = useState(guestDinnerTimeSlot);
  const [dinnerPartySize, setDinnerPartySize] = useState(
    guestDinnerPartySize > 0 ? guestDinnerPartySize : guestPartySize
  );
  // Use new model fields with backward compatibility
  const [pulledUpForDinner, setPulledUpForDinner] = useState(
    guest.dinnerPullUpCount ?? guest.pulledUpForDinner ?? null
  );
  const [pulledUpForCocktails, setPulledUpForCocktails] = useState(
    guest.cocktailOnlyPullUpCount ?? guest.pulledUpForCocktails ?? null
  );
  const [loading, setLoading] = useState(false);

  const maxPlusOnes = event.maxPlusOnesPerGuest || 0;

  // Calculate if changes would exceed capacity (for admin override warning)
  const calculateCapacityExceedance = () => {
    if (status !== "attending") {
      // Only check capacity for confirmed bookings
      return {
        willExceedCocktail: false,
        willExceedDinner: false,
        cocktailOverBy: 0,
        dinnerOverBy: 0,
      };
    }

    // Calculate new partySize and cocktailsOnly based on current form values
    const newPartySize = 1 + (parseInt(plusOnes) || 0);
    const newCocktailsOnly = wantsDinner
      ? parseInt(plusOnes) || 0
      : newPartySize;
    const newDinnerPartySize = wantsDinner
      ? Math.max(1, parseInt(dinnerPartySize) || 1)
      : 0;

    // Calculate current confirmed counts (excluding this guest)
    const currentCocktailsOnly = (allGuests || [])
      .filter(
        (g) =>
          g.id !== guest.id &&
          (g.bookingStatus === "CONFIRMED" || g.status === "attending")
      )
      .reduce((sum, g) => {
        const gWantsDinner = g.dinner?.enabled || g.wantsDinner || false;
        const gPlusOnes = g.plusOnes ?? 0;
        return sum + (gWantsDinner ? gPlusOnes : g.partySize || 1);
      }, 0);

    const currentDinnerSlotConfirmed =
      wantsDinner && dinnerTimeSlot
        ? (allGuests || [])
            .filter((g) => {
              if (g.id === guest.id) return false;
              const gWantsDinner = g.dinner?.enabled || g.wantsDinner || false;
              const gSlot = g.dinner?.slotTime || g.dinnerTimeSlot;
              const gDinnerStatus =
                g.dinner?.bookingStatus === "CONFIRMED" ||
                g.dinnerStatus === "confirmed";
              return gWantsDinner && gSlot === dinnerTimeSlot && gDinnerStatus;
            })
            .reduce(
              (sum, g) => sum + (g.dinner?.partySize || g.dinnerPartySize || 1),
              0
            )
        : 0;

    // Calculate new totals
    const newCocktailsOnlyTotal = currentCocktailsOnly + newCocktailsOnly;
    const newDinnerSlotTotal = currentDinnerSlotConfirmed + newDinnerPartySize;

    // Check against capacities
    const cocktailCapacity = event.cocktailCapacity ?? null;
    const dinnerMaxSeatsPerSlot = event.dinnerMaxSeatsPerSlot ?? null;

    const willExceedCocktail =
      cocktailCapacity != null && newCocktailsOnlyTotal > cocktailCapacity;
    const cocktailOverBy = willExceedCocktail
      ? newCocktailsOnlyTotal - cocktailCapacity
      : 0;

    const willExceedDinner =
      wantsDinner &&
      dinnerTimeSlot &&
      dinnerMaxSeatsPerSlot != null &&
      newDinnerSlotTotal > dinnerMaxSeatsPerSlot;
    const dinnerOverBy = willExceedDinner
      ? newDinnerSlotTotal - dinnerMaxSeatsPerSlot
      : 0;

    return {
      willExceedCocktail,
      willExceedDinner,
      cocktailOverBy,
      dinnerOverBy,
    };
  };

  const capacityCheck = calculateCapacityExceedance();

  // Derive dinnerStatus from new model with backward compatibility
  const dinnerStatus =
    guest.dinner?.bookingStatus === "CONFIRMED"
      ? "confirmed"
      : guest.dinner?.bookingStatus === "WAITLIST"
      ? "waitlist"
      : guest.dinnerStatus || null;

  // Generate dinner time slots
  const dinnerSlots =
    event.dinnerEnabled && event.dinnerStartTime && event.dinnerEndTime
      ? generateDinnerTimeSlots(event)
      : [];

  function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    // Map status to bookingStatus for backend
    const bookingStatus = status === "attending" ? "CONFIRMED" : "WAITLIST";

    const updates = {
      name: name.trim() || null,
      email: email.trim(),
      plusOnes: Math.max(0, Math.min(maxPlusOnes, parseInt(plusOnes) || 0)),
      status, // Backward compatibility
      bookingStatus, // New model field
      wantsDinner: event.dinnerEnabled ? wantsDinner : false,
      dinnerTimeSlot: wantsDinner && dinnerTimeSlot ? dinnerTimeSlot : null,
      dinnerPartySize: wantsDinner
        ? Math.max(1, parseInt(dinnerPartySize) || 1)
        : null,
      // Use new model field names
      dinnerPullUpCount: pulledUpForDinner || 0,
      cocktailOnlyPullUpCount: pulledUpForCocktails || 0,
      // Backward compatibility
      pulledUpForDinner: pulledUpForDinner || null,
      pulledUpForCocktails: pulledUpForCocktails || null,
      // Admin override: include forceConfirm if capacity would be exceeded
      forceConfirm:
        capacityCheck.willExceedCocktail || capacityCheck.willExceedDinner,
    };

    onSave(updates);
    setLoading(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgba(12, 10, 18, 0.95)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "24px",
          padding: "32px",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              margin: 0,
            }}
          >
            Edit Guest
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              fontSize: "24px",
              cursor: "pointer",
              padding: "0",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "8px",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "rgba(255,255,255,0.1)";
              e.target.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "transparent";
              e.target.style.color = "#9ca3af";
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  opacity: 0.8,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(20, 16, 30, 0.6)",
                  color: "#fff",
                  fontSize: "15px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                placeholder="Guest name"
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  opacity: 0.8,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(20, 16, 30, 0.6)",
                  color: "#fff",
                  fontSize: "15px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                placeholder="guest@example.com"
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  opacity: 0.8,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Plus-Ones ({maxPlusOnes} max)
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: "rgb(12 10 18 / 10%)",
                  borderRadius: "12px",
                  padding: "8px",
                  border: "1px solid rgba(255,255,255,0.05)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    const newValue = Math.max(0, plusOnes - 1);
                    setPlusOnes(newValue);
                  }}
                  disabled={plusOnes <= 0}
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "10px",
                    border: "none",
                    background:
                      plusOnes <= 0
                        ? "rgba(255, 255, 255, 0.05)"
                        : "rgba(139, 92, 246, 0.2)",
                    color: plusOnes <= 0 ? "rgba(255, 255, 255, 0.3)" : "#fff",
                    fontSize: "22px",
                    fontWeight: 600,
                    cursor: plusOnes <= 0 ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s ease",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  −
                </button>
                <div
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  {plusOnes}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newValue = Math.min(maxPlusOnes, plusOnes + 1);
                    setPlusOnes(newValue);
                  }}
                  disabled={plusOnes >= maxPlusOnes}
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "10px",
                    border: "none",
                    background:
                      plusOnes >= maxPlusOnes
                        ? "rgba(255, 255, 255, 0.05)"
                        : "rgba(139, 92, 246, 0.2)",
                    color:
                      plusOnes >= maxPlusOnes
                        ? "rgba(255, 255, 255, 0.3)"
                        : "#fff",
                    fontSize: "22px",
                    fontWeight: 600,
                    cursor: plusOnes >= maxPlusOnes ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s ease",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  opacity: 0.8,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(20, 16, 30, 0.6)",
                  color: "#fff",
                  fontSize: "15px",
                  outline: "none",
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                <option value="attending">Attending</option>
                <option value="waitlist">Waitlist</option>
              </select>
            </div>

            {event.dinnerEnabled && (
              <>
                <div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={wantsDinner}
                      onChange={(e) => setWantsDinner(e.target.checked)}
                      style={{
                        width: "20px",
                        height: "20px",
                        cursor: "pointer",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                      }}
                    >
                      Wants Dinner
                    </span>
                  </label>
                </div>

                {wantsDinner && dinnerSlots.length > 0 && (
                  <>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: 600,
                          marginBottom: "8px",
                          opacity: 0.8,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        Dinner Time Slot
                      </label>
                      <select
                        value={dinnerTimeSlot}
                        onChange={(e) => setDinnerTimeSlot(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          borderRadius: "12px",
                          border: "1px solid rgba(255,255,255,0.1)",
                          background: "rgba(20, 16, 30, 0.6)",
                          color: "#fff",
                          fontSize: "15px",
                          outline: "none",
                          boxSizing: "border-box",
                          cursor: "pointer",
                        }}
                      >
                        <option value="">Select time slot</option>
                        {dinnerSlots.map((slot) => (
                          <option key={slot} value={slot}>
                            {new Date(slot).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: 600,
                          marginBottom: "8px",
                          opacity: 0.8,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        Dinner Party Size
                      </label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          background: "rgb(12 10 18 / 10%)",
                          borderRadius: "12px",
                          padding: "8px",
                          border: "1px solid rgba(255,255,255,0.05)",
                          backdropFilter: "blur(10px)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const newValue = Math.max(1, dinnerPartySize - 1);
                            setDinnerPartySize(newValue);
                          }}
                          disabled={dinnerPartySize <= 1}
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "10px",
                            border: "none",
                            background:
                              dinnerPartySize <= 1
                                ? "rgba(255, 255, 255, 0.05)"
                                : "rgba(16, 185, 129, 0.2)",
                            color:
                              dinnerPartySize <= 1
                                ? "rgba(255, 255, 255, 0.3)"
                                : "#10b981",
                            fontSize: "22px",
                            fontWeight: 600,
                            cursor:
                              dinnerPartySize <= 1 ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s ease",
                            WebkitTapHighlightColor: "transparent",
                          }}
                        >
                          −
                        </button>
                        <div
                          style={{
                            flex: 1,
                            textAlign: "center",
                            fontSize: "24px",
                            fontWeight: 700,
                            color: "#10b981",
                          }}
                        >
                          {dinnerPartySize}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newValue = Math.min(8, dinnerPartySize + 1);
                            setDinnerPartySize(newValue);
                          }}
                          disabled={dinnerPartySize >= 8}
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "10px",
                            border: "none",
                            background:
                              dinnerPartySize >= 8
                                ? "rgba(255, 255, 255, 0.05)"
                                : "rgba(16, 185, 129, 0.2)",
                            color:
                              dinnerPartySize >= 8
                                ? "rgba(255, 255, 255, 0.3)"
                                : "#10b981",
                            fontSize: "22px",
                            fontWeight: 600,
                            cursor:
                              dinnerPartySize >= 8 ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s ease",
                            WebkitTapHighlightColor: "transparent",
                          }}
                        >
                          +
                        </button>
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          opacity: 0.6,
                          marginTop: "4px",
                          fontStyle: "italic",
                        }}
                      >
                        Total number of people for dinner (including the guest)
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Pulled Up Section */}
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "12px",
                  opacity: 0.8,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Check-In Status
              </div>

              {/* Cocktails Check-in */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                    userSelect: "none",
                    marginBottom: "8px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={pulledUpForCocktails !== null}
                    onChange={(e) => {
                      const totalGuests =
                        guest.totalGuests ?? guest.partySize ?? 1;
                      const guestDinnerPartySize =
                        wantsDinner && dinnerStatus === "confirmed"
                          ? dinnerPartySize || 0
                          : 0;
                      const cocktailsMax =
                        wantsDinner && dinnerStatus === "confirmed"
                          ? Math.max(0, totalGuests - guestDinnerPartySize)
                          : totalGuests;

                      if (e.target.checked) {
                        setPulledUpForCocktails(0); // Start at 0, user can increase with buttons
                      } else {
                        setPulledUpForCocktails(null);
                      }
                    }}
                    style={{
                      width: "20px",
                      height: "20px",
                      cursor: "pointer",
                      accentColor: "#f59e0b",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: pulledUpForCocktails !== null ? "#f59e0b" : "#fff",
                    }}
                  >
                    🥂 Cocktails
                  </span>
                </label>
                {pulledUpForCocktails !== null && (
                  <div style={{ marginLeft: "30px", marginTop: "8px" }}>
                    {(() => {
                      const totalGuests =
                        guest.totalGuests ?? guest.partySize ?? 1;
                      const guestDinnerPartySize =
                        wantsDinner && dinnerStatus === "confirmed"
                          ? dinnerPartySize || 0
                          : 0;
                      const cocktailsMax =
                        wantsDinner && dinnerStatus === "confirmed"
                          ? Math.max(0, totalGuests - guestDinnerPartySize)
                          : totalGuests;
                      const currentValue = pulledUpForCocktails || 0;
                      return (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            background: "rgba(245, 158, 11, 0.1)",
                            borderRadius: "12px",
                            padding: "8px",
                            border: "1px solid rgba(245, 158, 11, 0.3)",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const newValue = Math.max(0, currentValue - 1);
                              setPulledUpForCocktails(
                                newValue === 0 ? 0 : newValue
                              );
                            }}
                            disabled={currentValue <= 0}
                            style={{
                              width: "44px",
                              height: "44px",
                              borderRadius: "10px",
                              border: "none",
                              background:
                                currentValue <= 0
                                  ? "rgba(255, 255, 255, 0.05)"
                                  : "rgba(245, 158, 11, 0.2)",
                              color:
                                currentValue <= 0
                                  ? "rgba(255, 255, 255, 0.3)"
                                  : "#f59e0b",
                              fontSize: "22px",
                              fontWeight: 600,
                              cursor:
                                currentValue <= 0 ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              transition: "all 0.2s ease",
                              WebkitTapHighlightColor: "transparent",
                            }}
                          >
                            −
                          </button>
                          <div
                            style={{
                              flex: 1,
                              textAlign: "center",
                              fontSize: "24px",
                              fontWeight: 700,
                              color: "#f59e0b",
                            }}
                          >
                            {currentValue}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newValue = Math.min(
                                cocktailsMax,
                                currentValue + 1
                              );
                              setPulledUpForCocktails(newValue || null);
                            }}
                            disabled={currentValue >= cocktailsMax}
                            style={{
                              width: "44px",
                              height: "44px",
                              borderRadius: "10px",
                              border: "none",
                              background:
                                currentValue >= cocktailsMax
                                  ? "rgba(255, 255, 255, 0.05)"
                                  : "rgba(245, 158, 11, 0.2)",
                              color:
                                currentValue >= cocktailsMax
                                  ? "rgba(255, 255, 255, 0.3)"
                                  : "#f59e0b",
                              fontSize: "22px",
                              fontWeight: 600,
                              cursor:
                                currentValue >= cocktailsMax
                                  ? "not-allowed"
                                  : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              transition: "all 0.2s ease",
                              WebkitTapHighlightColor: "transparent",
                            }}
                          >
                            +
                          </button>
                        </div>
                      );
                    })()}
                    <div
                      style={{
                        fontSize: "11px",
                        opacity: 0.6,
                        marginTop: "6px",
                        textAlign: "center",
                        color: "#f59e0b",
                      }}
                    >
                      Max:{" "}
                      {(() => {
                        const totalGuests =
                          guest.totalGuests ?? guest.partySize ?? 1;
                        const guestDinnerPartySize =
                          wantsDinner && dinnerStatus === "confirmed"
                            ? dinnerPartySize || 0
                            : 0;
                        return wantsDinner && dinnerStatus === "confirmed"
                          ? Math.max(0, totalGuests - guestDinnerPartySize)
                          : totalGuests;
                      })()}{" "}
                      {(() => {
                        const totalGuests =
                          guest.totalGuests ?? guest.partySize ?? 1;
                        const guestDinnerPartySize =
                          wantsDinner && dinnerStatus === "confirmed"
                            ? dinnerPartySize || 0
                            : 0;
                        const max =
                          wantsDinner && dinnerStatus === "confirmed"
                            ? Math.max(0, totalGuests - guestDinnerPartySize)
                            : totalGuests;
                        return max === 1 ? "person" : "people";
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Dinner Check-in */}
              {wantsDinner && dinnerStatus === "confirmed" && (
                <div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      userSelect: "none",
                      marginBottom: "8px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={pulledUpForDinner !== null}
                      onChange={(e) => {
                        const dinnerMax = dinnerPartySize || 1;
                        if (e.target.checked) {
                          setPulledUpForDinner(0); // Start at 0, user can increase with buttons
                        } else {
                          setPulledUpForDinner(null);
                        }
                      }}
                      style={{
                        width: "20px",
                        height: "20px",
                        cursor: "pointer",
                        accentColor: "#10b981",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: pulledUpForDinner !== null ? "#10b981" : "#fff",
                      }}
                    >
                      🍽️ Dinner
                    </span>
                  </label>
                  {pulledUpForDinner !== null && (
                    <div style={{ marginLeft: "30px", marginTop: "8px" }}>
                      {(() => {
                        const dinnerMax = dinnerPartySize || 1;
                        const currentValue = pulledUpForDinner || 0;
                        return (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              background: "rgba(16, 185, 129, 0.1)",
                              borderRadius: "12px",
                              padding: "8px",
                              border: "1px solid rgba(16, 185, 129, 0.3)",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                const newValue = Math.max(0, currentValue - 1);
                                setPulledUpForDinner(
                                  newValue === 0 ? 0 : newValue
                                );
                              }}
                              disabled={currentValue <= 0}
                              style={{
                                width: "44px",
                                height: "44px",
                                borderRadius: "10px",
                                border: "none",
                                background:
                                  currentValue <= 0
                                    ? "rgba(255, 255, 255, 0.05)"
                                    : "rgba(16, 185, 129, 0.2)",
                                color:
                                  currentValue <= 0
                                    ? "rgba(255, 255, 255, 0.3)"
                                    : "#10b981",
                                fontSize: "22px",
                                fontWeight: 600,
                                cursor:
                                  currentValue <= 0 ? "not-allowed" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.2s ease",
                                WebkitTapHighlightColor: "transparent",
                              }}
                            >
                              −
                            </button>
                            <div
                              style={{
                                flex: 1,
                                textAlign: "center",
                                fontSize: "24px",
                                fontWeight: 700,
                                color: "#10b981",
                              }}
                            >
                              {currentValue}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newValue = Math.min(
                                  dinnerMax,
                                  currentValue + 1
                                );
                                setPulledUpForDinner(newValue || null);
                              }}
                              disabled={currentValue >= dinnerMax}
                              style={{
                                width: "44px",
                                height: "44px",
                                borderRadius: "10px",
                                border: "none",
                                background:
                                  currentValue >= dinnerMax
                                    ? "rgba(255, 255, 255, 0.05)"
                                    : "rgba(16, 185, 129, 0.2)",
                                color:
                                  currentValue >= dinnerMax
                                    ? "rgba(255, 255, 255, 0.3)"
                                    : "#10b981",
                                fontSize: "22px",
                                fontWeight: 600,
                                cursor:
                                  currentValue >= dinnerMax
                                    ? "not-allowed"
                                    : "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.2s ease",
                                WebkitTapHighlightColor: "transparent",
                              }}
                            >
                              +
                            </button>
                          </div>
                        );
                      })()}
                      <div
                        style={{
                          fontSize: "11px",
                          opacity: 0.6,
                          marginTop: "6px",
                          textAlign: "center",
                          color: "#10b981",
                        }}
                      >
                        Max: {dinnerPartySize || 1}{" "}
                        {(dinnerPartySize || 1) === 1 ? "person" : "people"}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Capacity Warning - Admin Override */}
          {(capacityCheck.willExceedCocktail ||
            capacityCheck.willExceedDinner) && (
            <div
              style={{
                marginTop: "20px",
                padding: "16px 20px",
                background: "rgba(239, 68, 68, 0.15)",
                borderRadius: "14px",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                fontSize: "13px",
                color: "#f87171",
                lineHeight: "1.6",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "14px",
                }}
              >
                <span style={{ fontSize: "18px" }}>⚠️</span>
                <span>You're overriding capacity</span>
              </div>
              <div style={{ opacity: 0.9 }}>
                {capacityCheck.willExceedCocktail &&
                  !capacityCheck.willExceedDinner && (
                    <div>
                      Confirming this guest will put the event over cocktail
                      capacity by {capacityCheck.cocktailOverBy} guest
                      {capacityCheck.cocktailOverBy === 1 ? "" : "s"}.
                    </div>
                  )}
                {capacityCheck.willExceedDinner &&
                  !capacityCheck.willExceedCocktail && (
                    <div>
                      Confirming this guest will put the {dinnerTimeSlot} dinner
                      over capacity by {capacityCheck.dinnerOverBy} guest
                      {capacityCheck.dinnerOverBy === 1 ? "" : "s"}.
                    </div>
                  )}
                {capacityCheck.willExceedCocktail &&
                  capacityCheck.willExceedDinner && (
                    <div>
                      Confirming this guest will put both cocktails and dinner
                      over their current capacities.
                    </div>
                  )}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "32px",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "14px 24px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "rgba(255,255,255,0.05)";
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: "14px 24px",
                borderRadius: "12px",
                border: "none",
                background:
                  capacityCheck.willExceedCocktail ||
                  capacityCheck.willExceedDinner
                    ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                    : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                transition: "all 0.2s ease",
              }}
            >
              {loading
                ? "Saving..."
                : capacityCheck.willExceedCocktail ||
                  capacityCheck.willExceedDinner
                ? "Confirm anyway (over capacity)"
                : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PulledUpModal({ guest, event, onClose, onSave }) {
  const [dinnerPullUpCount, setDinnerPullUpCount] = useState(
    guest.dinnerPullUpCount ?? guest.pulledUpForDinner ?? 0
  );
  const [cocktailOnlyPullUpCount, setCocktailOnlyPullUpCount] = useState(
    guest.cocktailOnlyPullUpCount ?? guest.pulledUpForCocktails ?? 0
  );
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const totalGuests = guest.totalGuests ?? guest.partySize ?? 1;
  const dinnerPartySize = guest.dinner?.partySize ?? guest.dinnerPartySize ?? 0;
  const dinnerConfirmed =
    guest.dinner?.bookingStatus === "CONFIRMED" ||
    guest.dinnerStatus === "confirmed";
  const wantsDinner = guest.dinner?.enabled ?? guest.wantsDinner ?? false;
  const cocktailsMax =
    wantsDinner && dinnerConfirmed
      ? Math.max(0, totalGuests - dinnerPartySize)
      : totalGuests;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    try {
      const success = await onSave(
        dinnerPullUpCount || 0,
        cocktailOnlyPullUpCount || 0
      );

      if (success) {
        setSaved(true);
        setTimeout(() => {
          onClose();
        }, 1000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgba(12, 10, 18, 0.95)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "24px",
          padding: "32px",
          maxWidth: "500px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#fff",
            }}
          >
            Check-In Status
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              fontSize: "24px",
              cursor: "pointer",
              padding: "0",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "8px",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "rgba(255,255,255,0.1)";
              e.target.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "transparent";
              e.target.style.color = "rgba(255,255,255,0.6)";
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            marginBottom: "20px",
            padding: "16px",
            background: "rgba(139, 92, 246, 0.1)",
            borderRadius: "12px",
            border: "1px solid rgba(139, 92, 246, 0.2)",
          }}
        >
          <div style={{ fontSize: "14px", opacity: 0.8, marginBottom: "8px" }}>
            {guest.name || "Guest"}
          </div>
          <div style={{ fontSize: "12px", opacity: 0.6 }}>{guest.email}</div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Cocktails Check-in */}
          <div style={{ marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: "12px",
                opacity: 0.9,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#f59e0b",
              }}
            >
              🥂 Cocktails
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                background: "rgba(245, 158, 11, 0.1)",
                borderRadius: "12px",
                padding: "8px",
                border: "1px solid rgba(245, 158, 11, 0.3)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  const newValue = Math.max(
                    0,
                    (cocktailOnlyPullUpCount || 0) - 1
                  );
                  setCocktailOnlyPullUpCount(newValue);
                }}
                disabled={(cocktailOnlyPullUpCount || 0) <= 0}
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "10px",
                  border: "none",
                  background:
                    (cocktailOnlyPullUpCount || 0) <= 0
                      ? "rgba(255, 255, 255, 0.05)"
                      : "rgba(245, 158, 11, 0.2)",
                  color:
                    (cocktailOnlyPullUpCount || 0) <= 0
                      ? "rgba(255, 255, 255, 0.3)"
                      : "#f59e0b",
                  fontSize: "22px",
                  fontWeight: 600,
                  cursor:
                    (cocktailOnlyPullUpCount || 0) <= 0
                      ? "not-allowed"
                      : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                −
              </button>
              <div
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "#f59e0b",
                }}
              >
                {cocktailOnlyPullUpCount || 0}
              </div>
              <button
                type="button"
                onClick={() => {
                  const newValue = Math.min(
                    cocktailsMax,
                    (cocktailOnlyPullUpCount || 0) + 1
                  );
                  setCocktailOnlyPullUpCount(newValue);
                }}
                disabled={(cocktailOnlyPullUpCount || 0) >= cocktailsMax}
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "10px",
                  border: "none",
                  background:
                    (cocktailOnlyPullUpCount || 0) >= cocktailsMax
                      ? "rgba(255, 255, 255, 0.05)"
                      : "rgba(245, 158, 11, 0.2)",
                  color:
                    (cocktailOnlyPullUpCount || 0) >= cocktailsMax
                      ? "rgba(255, 255, 255, 0.3)"
                      : "#f59e0b",
                  fontSize: "22px",
                  fontWeight: 600,
                  cursor:
                    (cocktailOnlyPullUpCount || 0) >= cocktailsMax
                      ? "not-allowed"
                      : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                +
              </button>
            </div>
            <div
              style={{
                fontSize: "11px",
                opacity: 0.6,
                marginTop: "6px",
                textAlign: "center",
                color: "#f59e0b",
              }}
            >
              Max: {cocktailsMax} {cocktailsMax === 1 ? "person" : "people"}
            </div>
          </div>

          {/* Dinner Check-in */}
          {wantsDinner && dinnerConfirmed && (
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "12px",
                  opacity: 0.9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#10b981",
                }}
              >
                🍽️ Dinner
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: "rgba(16, 185, 129, 0.1)",
                  borderRadius: "12px",
                  padding: "8px",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    const newValue = Math.max(0, (dinnerPullUpCount || 0) - 1);
                    setDinnerPullUpCount(newValue);
                  }}
                  disabled={(dinnerPullUpCount || 0) <= 0}
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "10px",
                    border: "none",
                    background:
                      (dinnerPullUpCount || 0) <= 0
                        ? "rgba(255, 255, 255, 0.05)"
                        : "rgba(16, 185, 129, 0.2)",
                    color:
                      (dinnerPullUpCount || 0) <= 0
                        ? "rgba(255, 255, 255, 0.3)"
                        : "#10b981",
                    fontSize: "22px",
                    fontWeight: 600,
                    cursor:
                      (dinnerPullUpCount || 0) <= 0 ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s ease",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  −
                </button>
                <div
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#10b981",
                  }}
                >
                  {dinnerPullUpCount || 0}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newValue = Math.min(
                      dinnerPartySize,
                      (dinnerPullUpCount || 0) + 1
                    );
                    setDinnerPullUpCount(newValue);
                  }}
                  disabled={(dinnerPullUpCount || 0) >= dinnerPartySize}
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "10px",
                    border: "none",
                    background:
                      (dinnerPullUpCount || 0) >= dinnerPartySize
                        ? "rgba(255, 255, 255, 0.05)"
                        : "rgba(16, 185, 129, 0.2)",
                    color:
                      (dinnerPullUpCount || 0) >= dinnerPartySize
                        ? "rgba(255, 255, 255, 0.3)"
                        : "#10b981",
                    fontSize: "22px",
                    fontWeight: 600,
                    cursor:
                      (dinnerPullUpCount || 0) >= dinnerPartySize
                        ? "not-allowed"
                        : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s ease",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  +
                </button>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  opacity: 0.6,
                  marginTop: "6px",
                  textAlign: "center",
                  color: "#10b981",
                }}
              >
                Max: {dinnerPartySize}{" "}
                {dinnerPartySize === 1 ? "person" : "people"}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "32px",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                flex: 1,
                padding: "14px 24px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.background = "rgba(255,255,255,0.1)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.target.style.background = "rgba(255,255,255,0.05)";
                }
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || saved}
              style={{
                flex: 1,
                padding: "14px 24px",
                borderRadius: "12px",
                border: "none",
                background: saved
                  ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                  : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 600,
                cursor: loading || saved ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {loading ? (
                <>
                  <span>⏳</span> Saving...
                </>
              ) : saved ? (
                <>
                  <span>✓</span> Saved!
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ guest, onClose, onConfirm }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgba(12, 10, 18, 0.95)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "24px",
          padding: "32px",
          maxWidth: "500px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            marginBottom: "16px",
          }}
        >
          Delete Guest?
        </h2>
        <p
          style={{
            fontSize: "15px",
            opacity: 0.8,
            marginBottom: "24px",
            lineHeight: "1.6",
          }}
        >
          Are you sure you want to delete{" "}
          <strong>{guest.name || guest.email}</strong>? This action cannot be
          undone.
        </p>
        <div
          style={{
            display: "flex",
            gap: "12px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "14px 24px",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "rgba(255,255,255,0.05)";
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: "14px 24px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #ec4899 0%, #dc2626 100%)",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "scale(1.02)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "scale(1)";
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
