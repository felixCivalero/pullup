import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Users,
  Download,
  Wine,
  UtensilsCrossed,
  RefreshCw,
  Link2,
  Check,
  Clock,
  AlertTriangle,
  Loader2,
  QrCode,
} from "lucide-react";
import { useToast } from "../components/Toast";
import { FaPaperPlane, FaCalendar } from "react-icons/fa";
import { getEventShareUrl } from "../lib/urlUtils";
import { logger } from "../lib/logger.js";
import { PullupEyes } from "../components/PullupEyes.jsx";
import { NativeLaneActions } from "../components/NativeLaneActions.jsx";

import { authenticatedFetch, API_BASE } from "../lib/api.js";
import { useEventNav } from "../contexts/EventNavContext.jsx";
import { formatEventTime, formatEventDate } from "../lib/dateUtils.js";
import { colors } from "../theme/colors.js";
import { useHostActions } from "../lib/useHostActions.js";
import { useSetHostResource } from "../contexts/useHostResource.js";

// -----------------------------
// Helpers: stats, filtering, sorting
// -----------------------------

function computeGuestStats(guests) {
  return guests.reduce(
    (acc, g) => {
      const totalGuests = g.totalGuests ?? g.partySize ?? 1;
      const partySize = g.partySize || 1;
      const dinnerPartySize = g.dinnerPartySize || partySize;

      if (g.bookingStatus === "WAITLIST" || g.status === "waitlist") {
        acc.waitlist += totalGuests;
      }

      if (g.status === "attending") {
        acc.attending += partySize;
        acc.cocktailList += partySize;

        const wantsDinner = g.dinner?.enabled || g.wantsDinner || false;
        const plusOnes = g.plusOnes ?? 0;

        if (wantsDinner) {
          acc.cocktailsOnly += plusOnes;
        } else {
          acc.cocktailsOnly += partySize;
        }
      }

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
    },
  );
}

function filterGuests(guests, searchQuery) {
  const query = searchQuery.toLowerCase().trim();
  if (!query) return guests;

  return guests.filter((g) => {
    const name = (g.name || "").toLowerCase();
    const email = (g.email || "").toLowerCase();
    return name.includes(query) || email.includes(query);
  });
}

function sortGuests(guests, sortColumn, sortDirection) {
  if (!sortColumn) return guests;

  const sorted = [...guests].sort((a, b) => {
    let aValue;
    let bValue;

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

  return sorted;
}
import { isNetworkError, handleNetworkError } from "../lib/errorHandler.js";


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
  const { setEventNav } = useEventNav();
  // Tell the floating coach widget which event the host is viewing.
  useSetHostResource(id ? { type: "event", id } : null);
  const [event, setEvent] = useState(null);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [editingGuest, setEditingGuest] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showRefundConfirm, setShowRefundConfirm] = useState(null);
  const [refunding, setRefunding] = useState(false);
  const [pulledUpModalGuest, setPulledUpModalGuest] = useState(null);
  const [dinnerSlots, setDinnerSlots] = useState([]);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc"); // "asc" or "desc"
  const [searchQuery, setSearchQuery] = useState(""); // Search query for guest name/email
  const searchInputRef = useRef(null);
  const [showCancelled, setShowCancelled] = useState(false); // Toggle to show/hide cancelled guests
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);

  // Detect mobile viewport
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Auto-focus search on mobile for fast check-in flow
  useEffect(() => {
    if (window.innerWidth < 768 && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 300);
    }
  }, [loading]); // Re-focus after initial load completes
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

  // Chat → UI live sync. When MCP updates an RSVP or refunds a payment on
  // this event, refetch the guest list so the dashboard stays current
  // without a manual reload. Best-effort; failures are silent.
  useHostActions({
    enabled: !!id,
    targetType: "event",
    targetId: id,
    tools: ["update_rsvp", "refund_payment", "update_event", "publish_event", "unpublish_event"],
    onInsert: async () => {
      try {
        const res = await authenticatedFetch(`/host/events/${id}/guests`);
        if (!res.ok) return;
        const data = await res.json();
        setGuests(data.guests || []);
        if (data.event) setEvent(data.event);
      } catch (err) {
        console.warn("[EventGuests] live refresh failed:", err?.message);
      }
    },
  });
  // RSVPs target type is "rsvp" not "event" — listen for those too,
  // scoped by no targetId (we filter client-side by tool name).
  useHostActions({
    enabled: !!id,
    targetType: "rsvp",
    tools: ["update_rsvp"],
    onInsert: async () => {
      try {
        const res = await authenticatedFetch(`/host/events/${id}/guests`);
        if (!res.ok) return;
        const data = await res.json();
        setGuests(data.guests || []);
      } catch (err) {
        console.warn("[EventGuests] live refresh failed:", err?.message);
      }
    },
  });

  useEffect(() => {
    async function load() {
      setNetworkError(false);
      try {
        const res = await authenticatedFetch(`/host/events/${id}/guests`);
        // Not your event → don't show a broken page; drop them into the room
        // they CAN see (guest view). One graceful exit, no dead end.
        if (res.status === 403) { navigate(`/events/${id}/room`, { replace: true }); return; }
        if (!res.ok) throw new Error("Failed to load guests");
        const data = await res.json();
        setEvent(data.event);
        setGuests(data.guests || []);

        // Update navbar with event context
        setEventNav({
          title: data.event?.title,
          slug: data.event?.slug,
          status: data.event?.status,
          guestsCount: data.guests?.length || 0,
          myRole: data.event?.myRole,
        });

        // Redirect analytics-only users to the analytics page
        if (data.event?.myRole === "analytics") {
          navigate(`/app/events/${id}/analytics`, { replace: true });
          return;
        }

        // Load dinner slots if dinner is enabled
        if (data.event?.dinnerEnabled) {
          try {
            const slotsRes = await fetch(
              `${API_BASE}/events/${data.event.slug}/dinner-slots`,
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
          handleNetworkError(err, showToast, "Could not load guests");
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
                  null,
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

  // Keep navbar guest count in sync
  useEffect(() => {
    if (event) {
      setEventNav({
        title: event.title,
        slug: event.slug,
        status: event.status,
        guestsCount: guests.length,
        myRole: event.myRole,
      });
    }
  }, [guests.length, event, setEventNav]);

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
            showToast("Link copied to clipboard!", "success");
          }
        });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(shareUrl);
      showToast("Link copied to clipboard!", "success");
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
                  null,
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
        },
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
        },
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

  async function handlePromoteGuest(guestId, sendEmail = false) {
    try {
      const res = await authenticatedFetch(
        `/host/events/${id}/rsvps/${guestId}/promote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sendEmail }),
        },
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to promote guest");
      }
      showToast(sendEmail ? "Guest confirmed and notified!" : "Guest confirmed!", "success");
      // Reload guests
      const guestsRes = await authenticatedFetch(`/host/events/${id}/guests`);
      if (guestsRes.ok) {
        const data = await guestsRes.json();
        setGuests(data.guests || []);
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || "Could not promote guest", "error");
    }
  }

  async function handleCancelGuest(guestId) {
    try {
      const res = await authenticatedFetch(
        `/host/events/${id}/rsvps/${guestId}/cancel`,
        {
          method: "POST",
        },
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to cancel guest");
      }
      showToast("Guest cancelled", "success");
      // Reload guests
      const guestsRes = await authenticatedFetch(`/host/events/${id}/guests`);
      if (guestsRes.ok) {
        const data = await guestsRes.json();
        setGuests(data.guests || []);
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || "Could not cancel guest", "error");
    }
  }

  async function handleRefundGuest(guest, moveToWaitlist = true) {
    if (!guest.paymentId) {
      showToast("No payment found for this guest", "error");
      return;
    }

    setRefunding(true);
    try {
      const res = await authenticatedFetch(
        `/host/events/${id}/payments/${guest.paymentId}/refund`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moveToWaitlist: moveToWaitlist,
            reason: "requested_by_host",
          }),
        },
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to process refund");
      }

      const result = await res.json();
      showToast(
        `Refund processed successfully${
          result.isFullRefund && moveToWaitlist
            ? " - Guest moved to waitlist"
            : ""
        }`,
        "success",
      );

      // Close modal
      setShowRefundConfirm(null);

      // Reload guests
      const guestsRes = await authenticatedFetch(`/host/events/${id}/guests`);
      if (guestsRes.ok) {
        const data = await guestsRes.json();
        setGuests(data.guests || []);
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || "Could not process refund", "error");
    } finally {
      setRefunding(false);
    }
  }

  // Update local state immediately (optimistic update)
  function updateLocalPulledUpState(
    rsvpId,
    dinnerPullUpCount,
    cocktailOnlyPullUpCount,
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
          : g,
      ),
    );
  }

  // API call to persist changes
  async function persistPulledUpChange(
    rsvpId,
    dinnerPullUpCount,
    cocktailOnlyPullUpCount,
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
        },
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
    debounce = false,
  ) {
    // Update local state immediately for instant UI feedback
    updateLocalPulledUpState(
      rsvpId,
      dinnerPullUpCount,
      cocktailOnlyPullUpCount,
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
          cocktailOnlyPullUpCount,
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
    if (!canCheckIn) return;
    if (
      e.target.closest("button") ||
      e.target.closest("input") ||
      e.target.closest("select")
    ) {
      return;
    }
    if (guest.bookingStatus !== "CONFIRMED" && guest.status !== "attending") {
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
          background: colors.background,
        }}
      >
        <div className="responsive-container">
          <div
            className="responsive-card"
            style={{
              background: colors.background,
              border: `1px solid ${colors.border}`,
              color: colors.textMuted,
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
          background: colors.background,
        }}
      >
        <div className="responsive-container">
          <div
            className="responsive-card"
            style={{
              textAlign: "center",
              background: colors.background,
              border: `1px solid ${colors.border}`,
            }}
          >
            <h2 style={{ marginBottom: "8px", fontSize: "24px", color: colors.text }}>
              Connection Error
            </h2>
            <p style={{ color: colors.textMuted, marginBottom: "16px" }}>
              Unable to connect to the server. Please check your internet
              connection and try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 24px",
                borderRadius: "999px",
                border: "none",
                background: colors.accent,
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
          background: colors.background,
        }}
      >
        <div className="responsive-container">
          <div
            className="responsive-card"
            style={{
              background: colors.background,
              border: `1px solid ${colors.border}`,
              color: colors.textMuted,
            }}
          >
            Event not found.
          </div>
        </div>
      </div>
    );
  }

  // Stats - count people, not just RSVPs (computed via helper)
  const stats = computeGuestStats(guests);

  // Use the calculated attending value
  const attending = stats.attending;

  // Structured debug logging for stats (dev-only via logger)
  logger.debug("🔍 [Stats Debug]", {
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

  const canEditGuests =
    event?.myRole && ["owner", "admin", "editor"].includes(event.myRole);
  const canCheckIn =
    event?.myRole &&
    ["owner", "admin", "editor", "reception"].includes(event.myRole);

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

  // Count cancelled guests
  const cancelledCount = guests.filter(
    (g) => g.bookingStatus === "CANCELLED" || g.status === "cancelled",
  ).length;

  // Filter + sort guests via helpers (exclude cancelled unless toggled)
  const filteredGuests = filterGuests(guests, searchQuery).filter((g) => {
    if (!showCancelled && (g.bookingStatus === "CANCELLED" || g.status === "cancelled")) {
      return false;
    }
    return true;
  });
  const sortedGuests = sortGuests(filteredGuests, sortColumn, sortDirection);

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        position: "relative",
        background: colors.background,
        paddingBottom: "40px",
      }}
    >
      <style>{`
        @media (max-width: 767px) {
          .export-csv-button-container {
            display: none !important;
          }
          .guests-desktop-table {
            display: none !important;
          }
          .guests-mobile-list {
            display: block !important;
          }
          .guests-search-sticky {
            position: sticky !important;
            top: 0 !important;
            z-index: 50 !important;
            background: #ffffff !important;
            padding-top: 12px !important;
            padding-bottom: 4px !important;
            margin-bottom: 12px !important;
          }
          .guests-page-content {
            padding: 8px 12px !important;
          }
        }
        @media (min-width: 768px) {
          .guests-mobile-list {
            display: none !important;
          }
        }
      `}</style>

      {/* Content */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "100%",
          padding: "0",
          margin: "0",
        }}
      >
          {/* Tab Content */}
          <div
            className="guests-page-content"
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
                      `/host/events/${id}/guests/export`,
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
                  padding: "10px 18px",
                  borderRadius: "999px",
                  border: `1px solid ${colors.borderStrong}`,
                  background: colors.background,
                  color: colors.text,
                  fontSize: "14px",
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
                  e.currentTarget.style.background = colors.surfaceMuted;
                  e.currentTarget.style.borderColor = colors.borderStrong;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.background;
                  e.currentTarget.style.borderColor = colors.borderStrong;
                }}
              >
                <Download size={18} style={{ color: colors.textMuted }} />
                Export CSV
              </button>
            </div>

            {/* Compact Stats Summary */}
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "16px",
              padding: "0 20px",
            }}>
              {[
                { label: "Total", value: attending, cap: totalCapacity, color: totalCapacity != null && attending > totalCapacity ? colors.warning : colors.text },
                { label: "List", value: stats.cocktailsOnly, cap: cocktailCapacity, color: cocktailCapacity != null && stats.cocktailsOnly > cocktailCapacity ? colors.warning : colors.text },
                ...(event.dinnerEnabled ? [{ label: "Dinner", value: stats.dinnerConfirmed, cap: foodCapacity, color: colors.success }] : []),
                { label: "Waitlist", value: stats.waitlist, cap: null, color: colors.textMuted },
              ].map((s) => (
                <div key={s.label} style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  background: colors.surface,
                  border: `1px solid ${colors.border}`,
                  display: "flex",
                  alignItems: "baseline",
                  gap: "6px",
                }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: s.color }}>
                    {s.value}{s.cap != null ? <span style={{ fontSize: "11px", fontWeight: 500, color: colors.textFaded }}>/{s.cap}</span> : null}
                  </span>
                  <span style={{ fontSize: "11px", color: colors.textSubtle, fontWeight: 500 }}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Live check-in — the rotating QR the host holds up at the door. */}
            <div style={{ padding: "0 20px", marginBottom: "16px" }}>
              <button
                onClick={() => navigate(`/app/events/${id}/checkin`)}
                style={{
                  width: "100%",
                  padding: "13px 16px",
                  borderRadius: "12px",
                  border: "none",
                  background: colors.accent,
                  color: "#fff",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <QrCode size={18} /> Live check-in QR
              </button>
            </div>

            {/* Search Bar - Smartphone Friendly */}
            <div
              className="guests-search-sticky"
              style={{
                marginBottom: "24px",
                padding: "0",
                margin: "0 16px 24px",
              }}
            >
              <div style={{ position: "relative" }}>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search guests by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "14px 18px",
                    paddingRight: searchQuery ? "48px" : "18px",
                    borderRadius: "14px",
                    border: `1px solid ${colors.borderStrong}`,
                    background: colors.background,
                    color: colors.text,
                    fontSize: "16px",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "all 0.2s ease",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = colors.accentBorder;
                    e.target.style.boxShadow = `0 0 0 3px ${colors.accentSoft}`;
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = colors.borderStrong;
                    e.target.style.boxShadow = "none";
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      searchInputRef.current?.focus();
                    }}
                    style={{
                      position: "absolute",
                      right: "8px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: colors.surfaceMuted,
                      border: "none",
                      borderRadius: "8px",
                      width: "32px",
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      color: colors.textSubtle,
                      fontSize: "16px",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Show Cancelled Toggle */}
            {cancelledCount > 0 && (
              <div
                style={{
                  marginBottom: "16px",
                  padding: "0 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "13px",
                    color: colors.textMuted,
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showCancelled}
                    onChange={(e) => setShowCancelled(e.target.checked)}
                    style={{
                      width: "16px",
                      height: "16px",
                      cursor: "pointer",
                      accentColor: colors.accent,
                    }}
                  />
                  Show cancelled ({cancelledCount})
                </label>
              </div>
            )}

            {/* Guests Table */}
            {sortedGuests.length === 0 ? (
              <div
                style={{
                  background: colors.background,
                  padding: "60px 24px",
                  borderRadius: "16px",
                  textAlign: "center",
                  border: `1px solid ${colors.border}`,
                }}
              >
                {!searchQuery.trim() && (
                  <div style={{ marginBottom: "20px", display: "flex", justifyContent: "center" }}>
                    <PullupEyes variant="small" style={{ width: 72, height: 63 }} />
                  </div>
                )}
                {searchQuery.trim() && (
                  <div style={{ marginBottom: "16px" }}>
                    <Users size={32} style={{ color: colors.textFaded }} />
                  </div>
                )}
                <div style={{ fontSize: "16px", color: colors.textMuted }}>
                  {searchQuery.trim()
                    ? `No guests found matching "${searchQuery}"`
                    : "No guests yet."}
                </div>
              </div>
            ) : (
              <>
              {/* Mobile Card Layout */}
              <div className="guests-mobile-list" style={{ display: "none", flexDirection: "column", gap: "8px" }}>
                {sortedGuests.filter(g => g.bookingStatus === "CONFIRMED" || g.status === "attending").map((g) => {
                  const isConfirmed = g.bookingStatus === "CONFIRMED" || g.status === "attending";
                  const partySize = g.partySize || 1;
                  const wantsDinner = g.wantsDinner || g.dinner?.enabled || false;
                  const dinnerPartySize = g.dinnerPartySize || g.dinner?.partySize || 0;
                  const plusOnes = g.plusOnes ?? 0;
                  const dinnerConfirmed = g.dinner?.bookingStatus === "CONFIRMED" || g.dinnerStatus === "confirmed";
                  const cocktailsPulledUp = g.cocktailOnlyPullUpCount ?? g.pulledUpForCocktails ?? 0;
                  const dinnerPulledUp = g.dinnerPullUpCount ?? g.pulledUpForDinner ?? 0;

                  // DPCS pull-up totals
                  const cocktailOnlyMax = wantsDinner && dinnerConfirmed ? plusOnes : partySize;
                  const totalExpected = (wantsDinner && dinnerConfirmed ? dinnerPartySize : 0) + cocktailOnlyMax;
                  const totalArrived = dinnerPulledUp + cocktailsPulledUp;
                  const allPulledUp = totalArrived > 0 && totalArrived >= totalExpected;
                  const hasPartial = totalArrived > 0 && !allPulledUp;

                  return (
                    <div
                      key={g.id}
                      onClick={(e) => {
                        if (e.target.closest("button")) return;
                        handleRowClick(g, e);
                      }}
                      style={{
                        background: allPulledUp
                          ? colors.successRgba
                          : hasPartial
                          ? colors.warningRgba
                          : colors.background,
                        borderRadius: "16px",
                        border: allPulledUp
                          ? `1px solid rgba(22, 163, 74, 0.2)`
                          : hasPartial
                          ? `1px solid rgba(180, 83, 9, 0.15)`
                          : `1px solid ${colors.border}`,
                        padding: "16px",
                        cursor: isConfirmed && !allPulledUp ? "pointer" : "default",
                        WebkitTapHighlightColor: "transparent",
                        transition: "all 0.15s ease",
                        opacity: allPulledUp ? 0.75 : 1,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        {/* Left: Name + party size */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontWeight: 600,
                            fontSize: "17px",
                            color: colors.text,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            marginBottom: "2px",
                          }}>
                            {g.name || "Guest"}
                          </div>
                          <div style={{ fontSize: "12px", color: colors.textFaded, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {g.email}
                          </div>
                          <div style={{ fontSize: "13px", color: colors.textSubtle, marginTop: "2px" }}>
                            {partySize} {partySize === 1 ? "guest" : "guests"}
                          </div>
                        </div>

                        {/* Right: Arrival status */}
                        <div style={{ flexShrink: 0, marginLeft: "12px", textAlign: "right" }}>
                          {allPulledUp && (
                            <div style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color: colors.success,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}>
                              <Check size={16} /> arrived
                            </div>
                          )}
                          {hasPartial && (
                            <div style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color: colors.warning,
                            }}>
                              {totalArrived}/{totalExpected} arrived
                            </div>
                          )}
                          {!allPulledUp && !hasPartial && isConfirmed && (
                            <div style={{
                              fontSize: "12px",
                              color: colors.textFaded,
                              fontStyle: "italic",
                            }}>
                              tap to check in
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table */}
              <div
                className="guests-desktop-table"
                style={{
                  background: colors.background,
                  borderRadius: "16px",
                  border: `1px solid ${colors.border}`,
                  overflow: "hidden",
                  overflowX: "auto",
                  boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
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
                        background: colors.surface,
                        borderBottom: `1px solid ${colors.border}`,
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
                            label="List"
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
                          padding: "16px 24px",
                          textAlign: "center",
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          color: colors.textSubtle,
                          width: "140px",
                        }}
                      >
                        Pulled Up
                      </th>
                      <th
                        style={{
                          padding: "16px 24px",
                          textAlign: "center",
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          color: colors.textSubtle,
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
                              ? `1px solid ${colors.border}`
                              : "none",
                          transition: "background 0.15s ease",
                          background:
                            idx % 2 === 0
                              ? colors.background
                              : colors.surface,
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = colors.surfaceMuted;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            idx % 2 === 0
                              ? colors.background
                              : colors.surface;
                        }}
                      >
                        <td style={{ padding: "18px 24px" }}>
                          <div
                            style={{
                              fontWeight: 600,
                              marginBottom: "4px",
                              fontSize: "15px",
                              color: colors.text,
                            }}
                          >
                            {g.name || "—"}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              wordBreak: "break-word",
                              color: colors.textMuted,
                            }}
                          >
                            {g.email}
                          </div>
                        </td>
                        <td style={{ padding: "20px 24px" }}>
                          <CombinedStatusBadge
                            guest={g}
                            event={event}
                            eventId={id}
                            onPromote={handlePromoteGuest}
                            onLinkGenerated={async () => {
                              // Refresh guests list after link generation
                              try {
                                const res = await authenticatedFetch(
                                  `/host/events/${id}/guests`,
                                );
                                if (res.ok) {
                                  const data = await res.json();
                                  setGuests(data.guests || []);
                                }
                              } catch (err) {
                                console.error("Error reloading guests:", err);
                              }
                            }}
                          />
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
                                        padding: "4px 10px",
                                        background: colors.warningRgba,
                                        borderRadius: "6px",
                                        border: `1px solid rgba(180, 83, 9, 0.25)`,
                                        color: colors.warning,
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
                                      color: colors.textFaded,
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
                              {(() => {
                                // Show dinner party size if guest wants dinner and has dinnerPartySize
                                // This applies to both confirmed and waitlist guests
                                const wantsDinner =
                                  g.wantsDinner || g.dinner?.enabled || false;
                                const dinnerPartySize =
                                  g.dinnerPartySize || g.dinner?.partySize || 0;

                                if (wantsDinner && dinnerPartySize > 0) {
                                  // Determine color based on dinner status
                                  const isConfirmed =
                                    g.dinnerStatus === "confirmed" ||
                                    g.dinner?.bookingStatus === "CONFIRMED";
                                  const isWaitlist =
                                    g.dinnerStatus === "waitlist" ||
                                    g.dinner?.bookingStatus === "WAITLIST";

                                  return (
                                    <div
                                      style={{
                                        fontSize: "16px",
                                        fontWeight: 700,
                                        color: isConfirmed
                                          ? colors.success
                                          : isWaitlist
                                            ? colors.warning
                                            : colors.warning,
                                      }}
                                    >
                                      {dinnerPartySize}
                                    </div>
                                  );
                                }

                                return (
                                  <span
                                    style={{
                                      fontSize: "13px",
                                      color: colors.textFaded,
                                      fontStyle: "italic",
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
                              {(() => {
                                // TOTAL ATTENDING = partySize (total unique guests)
                                const partySize = g.partySize || 1;

                                return (
                                  <div
                                    style={{
                                      fontSize: "18px",
                                      fontWeight: 700,
                                      color: colors.text,
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
                                    fontWeight: 600,
                                    color: colors.secondary,
                                  }}
                                >
                                  {formatEventTime(g.dinnerTimeSlot, event?.timezone)}
                                </div>
                              ) : (
                                <span
                                  style={{
                                    fontSize: "13px",
                                    color: colors.textFaded,
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
                                color: colors.text,
                              }}
                            >
                              {g.partySize || 1}
                            </div>
                            {g.plusOnes > 0 && (
                              <div
                                style={{
                                  fontSize: "11px",
                                  padding: "3px 8px",
                                  background: colors.surface,
                                  borderRadius: "6px",
                                  border: `1px solid ${colors.border}`,
                                  color: colors.textMuted,
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
                            color: colors.textMuted,
                          }}
                        >
                          {formatEventDate(g.createdAt)}
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
                                      color: colors.textFaded,
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
                                        color: colors.warning,
                                        padding: "4px 8px",
                                        background: colors.warningRgba,
                                        borderRadius: "6px",
                                        border: `1px solid rgba(180, 83, 9, 0.25)`,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      <Wine size={14} style={{ color: colors.warning }} />{" "}
                                      {cocktailsPulledUp}
                                    </div>
                                  )}
                                  {dinnerPulledUp > 0 && (
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        fontWeight: 600,
                                        color: colors.success,
                                        padding: "4px 8px",
                                        background: colors.successRgba,
                                        borderRadius: "6px",
                                        border: `1px solid rgba(22, 163, 74, 0.25)`,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      <UtensilsCrossed
                                        size={14}
                                        style={{ color: colors.success }}
                                      />{" "}
                                      {dinnerPulledUp}
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
                              flexWrap: "wrap",
                            }}
                          >
                            {canEditGuests && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditGuest(g);
                                  }}
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: "999px",
                                    border: `1px solid ${colors.borderStrong}`,
                                    background: colors.background,
                                    color: colors.text,
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = colors.surfaceMuted;
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = colors.background;
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
                                    borderRadius: "999px",
                                    border: `1px solid ${colors.dangerRgba}`,
                                    background: colors.dangerRgba,
                                    color: colors.danger,
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = `rgba(220, 38, 38, 0.16)`;
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = colors.dangerRgba;
                                  }}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
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
          onPromote={handlePromoteGuest}
          onCancel={handleCancelGuest}
          onRefund={
            canEditGuests ? (guest) => setShowRefundConfirm(guest) : undefined
          }
        />
      )}

      {/* Pulled Up Modal */}
      {pulledUpModalGuest && (
        <PulledUpModal
          guest={pulledUpModalGuest}
          event={event}
          onClose={() => setPulledUpModalGuest(null)}
          onCheckInComplete={() => {
            setPulledUpModalGuest(null);
            setSearchQuery("");
            setTimeout(() => searchInputRef.current?.focus(), 100);
          }}
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
                },
              );

              if (!res.ok) {
                throw new Error("Failed to update pulled up status");
              }

              // Refetch guests to get latest data
              const guestsRes = await authenticatedFetch(
                `/host/events/${id}/guests`,
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

      {/* Refund Confirmation Modal */}
      {showRefundConfirm && (
        <RefundConfirmModal
          guest={showRefundConfirm}
          event={event}
          refunding={refunding}
          onClose={() => setShowRefundConfirm(null)}
          onConfirm={(moveToWaitlist) =>
            handleRefundGuest(showRefundConfirm, moveToWaitlist)
          }
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  const isGradient = typeof color === "string" && color.includes("gradient");
  return (
    <div
      style={{
        padding: "20px",
        background: colors.background,
        borderRadius: "16px",
        border: `1px solid ${colors.border}`,
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = colors.borderStrong;
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(10,10,10,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = colors.border;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          fontSize: "24px",
          marginBottom: "8px",
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: "10px",
          color: colors.textSubtle,
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
        padding: "16px 24px",
        textAlign: align,
        fontSize: "11px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: isActive ? colors.accent : colors.textSubtle,
        cursor: "pointer",
        userSelect: "none",
        transition: "all 0.15s ease",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = colors.surfaceMuted;
        e.currentTarget.style.color = colors.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = isActive ? colors.accent : colors.textSubtle;
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
                  ? colors.accent
                  : colors.textFaded,
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
                  ? colors.accent
                  : colors.textFaded,
            }}
          >
            ▼
          </span>
        </div>
      </div>
    </th>
  );
}

function CombinedStatusBadge({ guest, event, eventId, onLinkGenerated, onPromote }) {
  const [generatingLink, setGeneratingLink] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [selectedExpiry, setSelectedExpiry] = useState(null); // minutes
  const { showToast } = useToast();

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

  // Get payment status (for paid events)
  const paymentStatus = guest.paymentStatus || null;
  const isPaidEvent = event?.ticketType === "paid";

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

  // Determine combined status label (with payment status for paid events)
  let label = "";
  let bg = "";
  let border = "";
  let color = "";

  if (bookingStatus === "PENDING_PAYMENT") {
    // Awaiting payment - RSVP created but not yet paid
    label = "AWAITING PAYMENT";
    bg = colors.warningRgba;
    border = "rgba(180, 83, 9, 0.35)";
    color = colors.warning;
  } else if (bookingStatus === "CONFIRMED") {
    // For paid events, check payment status
    if (isPaidEvent) {
      if (paymentStatus === "paid") {
        // Confirmed and paid
        label = "CONFIRMED";
        bg = colors.successRgba;
        border = "rgba(22, 163, 74, 0.35)";
        color = colors.success;
      } else if (paymentStatus === "pending") {
        // Payment initiated but not yet confirmed
        label = "AWAITING PAYMENT";
        bg = colors.warningRgba;
        border = "rgba(180, 83, 9, 0.35)";
        color = colors.warning;
      } else {
        // Confirmed but unpaid (unpaid or null)
        label = "UNPAID";
        bg = colors.dangerRgba;
        border = "rgba(220, 38, 38, 0.35)";
        color = colors.danger;
      }
    } else {
      // Free event - just show confirmed
      label = "CONFIRMED";
      bg = colors.successRgba;
      border = "rgba(22, 163, 74, 0.35)";
      color = colors.success;
    }
  } else if (bookingStatus === "WAITLIST") {
    // Entire booking is on waitlist (all-or-nothing)
    label = "WAITLIST";
    bg = colors.warningRgba;
    border = "rgba(180, 83, 9, 0.30)";
    color = colors.warning;
  } else if (bookingStatus === "CANCELLED") {
    label = "CANCELLED";
    bg = colors.surface;
    border = colors.border;
    color = colors.textSubtle;
  }

  // Fallback
  if (!label) {
    label = status === "attending" ? "Attending" : "Waitlist";
    bg = status === "attending" ? colors.successRgba : colors.warningRgba;
    border = status === "attending" ? "rgba(22, 163, 74, 0.35)" : "rgba(180, 83, 9, 0.30)";
    color = status === "attending" ? colors.success : colors.warning;
  }

  // Add arrival status indicator (only for truly CONFIRMED bookings, not PENDING_PAYMENT)
  let arrivalIndicator = "";
  if (
    guest.bookingStatus === "CONFIRMED" &&
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

  // Smart default expiry based on time until event
  function getDefaultExpiryMinutes() {
    if (!event?.startsAt) return 360; // 6 hours
    const minutesUntil = (new Date(event.startsAt).getTime() - Date.now()) / (60 * 1000);
    if (minutesUntil <= 120) return 30;        // < 2h away: 30 min
    if (minutesUntil <= 360) return 60;        // 2-6h away: 1 hour
    if (minutesUntil <= 1440) return 180;      // 6-24h away: 3 hours
    return 360;                                // > 24h away: 6 hours
  }

  // Generate waitlist link handler (for paid events only)
  async function handleGenerateLink(e, expiryMinutes) {
    e?.stopPropagation();
    if (!eventId || !isPaidEvent || bookingStatus !== "WAITLIST") return;

    setGeneratingLink(true);
    setShowExpiryPicker(false);
    try {
      const body = expiryMinutes ? { expiresInMinutes: expiryMinutes } : {};
      const res = await authenticatedFetch(
        `/host/events/${eventId}/waitlist-link/${guest.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate link");
      }

      const data = await res.json();
      // Copy to clipboard automatically
      await navigator.clipboard.writeText(data.link);
      showToast("Link sent to guest and copied to clipboard!", "success");
      if (onLinkGenerated) {
        onLinkGenerated(data.link);
      }
    } catch (err) {
      showToast(err.message || "Failed to generate link", "error");
    } finally {
      setGeneratingLink(false);
    }
  }

  // Check if link was already generated
  const linkStatus = (() => {
    if (bookingStatus !== "WAITLIST") return null;
    if (guest.waitlistLinkUsedAt) return "CONFIRMED";
    if (
      guest.waitlistLinkExpiresAt &&
      new Date(guest.waitlistLinkExpiresAt) < new Date()
    ) {
      return "EXPIRED";
    }
    if (guest.waitlistLinkGeneratedAt) return "SENT";
    return "WAITLIST";
  })();

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
              background: colors.warningRgba,
              border: `1px solid rgba(180, 83, 9, 0.30)`,
              color: colors.warning,
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
                ? colors.success
                : pullUpStatus === "PARTIAL"
                  ? colors.warning
                  : colors.textSubtle,
            textTransform: "none",
            letterSpacing: "0.02em",
            marginTop: "2px",
          }}
        >
          {arrivalIndicator}
        </span>
      )}
      {/* Generate Link button for waitlist guests in paid events */}
      {isPaidEvent &&
        bookingStatus === "WAITLIST" &&
        linkStatus !== "CONFIRMED" && !showExpiryPicker && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedExpiry(getDefaultExpiryMinutes());
              setShowExpiryPicker(true);
            }}
            disabled={generatingLink}
            style={{
              padding: "4px 10px",
              fontSize: "10px",
              fontWeight: 600,
              background:
                linkStatus === "SENT" || linkStatus === "EXPIRED"
                  ? colors.warningRgba
                  : colors.accentSoft,
              border:
                linkStatus === "SENT" || linkStatus === "EXPIRED"
                  ? `1px solid rgba(180, 83, 9, 0.30)`
                  : `1px solid ${colors.accentBorder}`,
              borderRadius: "999px",
              color:
                linkStatus === "SENT" || linkStatus === "EXPIRED"
                  ? colors.warning
                  : colors.accent,
              cursor: generatingLink ? "not-allowed" : "pointer",
              opacity: generatingLink ? 0.6 : 1,
              transition: "all 0.15s ease",
              marginTop: "4px",
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            onMouseEnter={(e) => {
              if (!generatingLink) {
                e.target.style.opacity = "0.8";
              }
            }}
            onMouseLeave={(e) => {
              if (!generatingLink) {
                e.target.style.opacity = "1";
              }
            }}
          >
            {generatingLink ? (
              "Sending..."
            ) : linkStatus === "SENT" ? (
              <>
                <RefreshCw size={14} /> Resend
              </>
            ) : linkStatus === "EXPIRED" ? (
              <>
                <RefreshCw size={14} /> New Link
              </>
            ) : (
              <>
                <Link2 size={14} /> Send Payment Link
              </>
            )}
          </button>
        )}
      {/* Expiry picker for payment link */}
      {showExpiryPicker && isPaidEvent && bookingStatus === "WAITLIST" && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            marginTop: "4px",
            padding: "8px",
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "10px",
            alignSelf: "flex-start",
          }}
        >
          <div style={{ fontSize: "10px", color: colors.textSubtle, fontWeight: 600 }}>
            Expires in
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {[
              { label: "30m", value: 30 },
              { label: "1h", value: 60 },
              { label: "3h", value: 180 },
              { label: "6h", value: 360 },
              { label: "12h", value: 720 },
              { label: "24h", value: 1440 },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedExpiry(opt.value)}
                style={{
                  padding: "2px 8px",
                  fontSize: "10px",
                  fontWeight: 600,
                  background: selectedExpiry === opt.value ? colors.accentSoftStrong : colors.background,
                  border: selectedExpiry === opt.value ? `1px solid ${colors.accentBorder}` : `1px solid ${colors.borderStrong}`,
                  borderRadius: "6px",
                  color: selectedExpiry === opt.value ? colors.accent : colors.textMuted,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              onClick={(e) => handleGenerateLink(e, selectedExpiry)}
              disabled={generatingLink}
              style={{
                padding: "4px 10px",
                fontSize: "10px",
                fontWeight: 600,
                background: colors.accent,
                border: "none",
                borderRadius: "6px",
                color: "#fff",
                cursor: generatingLink ? "not-allowed" : "pointer",
                opacity: generatingLink ? 0.6 : 1,
              }}
            >
              {generatingLink ? "Sending..." : "Send"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowExpiryPicker(false); }}
              style={{
                padding: "4px 8px",
                fontSize: "10px",
                background: "transparent",
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                color: colors.textSubtle,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* Confirm buttons for all waitlist guests */}
      {bookingStatus === "WAITLIST" && onPromote && (
        <div style={{ display: "flex", gap: "4px", marginTop: "4px", alignSelf: "flex-start" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPromoting(true);
              onPromote(guest.id, false).finally(() => setPromoting(false));
            }}
            disabled={promoting}
            style={{
              padding: "3px 10px",
              fontSize: "10px",
              fontWeight: 600,
              background: colors.successRgba,
              border: `1px solid rgba(22, 163, 74, 0.30)`,
              borderRadius: "999px",
              color: colors.success,
              cursor: promoting ? "not-allowed" : "pointer",
              opacity: promoting ? 0.6 : 1,
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            {promoting ? "..." : "Confirm"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPromoting(true);
              onPromote(guest.id, true).finally(() => setPromoting(false));
            }}
            disabled={promoting}
            style={{
              padding: "3px 10px",
              fontSize: "10px",
              fontWeight: 600,
              background: colors.accentSoft,
              border: `1px solid ${colors.accentBorder}`,
              borderRadius: "999px",
              color: colors.accent,
              cursor: promoting ? "not-allowed" : "pointer",
              opacity: promoting ? 0.6 : 1,
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            {promoting ? "..." : "Confirm & Notify"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    attending: {
      label: "Attending",
      bg: colors.successRgba,
      border: "rgba(22, 163, 74, 0.35)",
      color: colors.success,
    },
    waitlist: {
      label: "Waitlist",
      bg: colors.warningRgba,
      border: "rgba(180, 83, 9, 0.30)",
      color: colors.warning,
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
      label: "Confirmed",
      icon: <Check size={12} style={{ color: colors.success }} />,
      bg: colors.successRgba,
      border: "rgba(22, 163, 74, 0.35)",
      color: colors.success,
    },
    waitlist: {
      label: "Waitlist",
      icon: <Clock size={12} style={{ color: colors.warning }} />,
      bg: colors.warningRgba,
      border: "rgba(180, 83, 9, 0.30)",
      color: colors.warning,
    },
    cocktails: {
      label: "List",
      icon: <Wine size={12} style={{ color: colors.warning }} />,
      bg: colors.warningRgba,
      border: "rgba(180, 83, 9, 0.30)",
      color: colors.warning,
    },
    cocktails_waitlist: {
      label: "Both",
      icon: <Wine size={12} style={{ color: colors.textMuted }} />,
      bg: colors.surface,
      border: colors.border,
      color: colors.textMuted,
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

function EditGuestModal({
  guest,
  event,
  onClose,
  onSave,
  allGuests,
  onPromote,
  onCancel,
  onRefund,
}) {
  // Identity (name / email) is canonical on the person — read-only here. This
  // modal is a service desk: the host adjusts the BOOKING, never who the person
  // is. We still echo the current values back unchanged in the save payload.

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
        : guest.bookingStatus === "CANCELLED"
          ? "cancelled"
          : guest.status || "attending",
  );
  const [promoteSendEmail, setPromoteSendEmail] = useState(false);
  const [promotingFromModal, setPromotingFromModal] = useState(false);
  const [wantsDinner, setWantsDinner] = useState(guestWantsDinner);
  const [dinnerTimeSlot, setDinnerTimeSlot] = useState(guestDinnerTimeSlot);
  const [dinnerPartySize, setDinnerPartySize] = useState(
    guestDinnerPartySize > 0 ? guestDinnerPartySize : guestPartySize,
  );
  // Use new model fields with backward compatibility
  const [pulledUpForDinner, setPulledUpForDinner] = useState(
    guest.dinnerPullUpCount ?? guest.pulledUpForDinner ?? null,
  );
  const [pulledUpForCocktails, setPulledUpForCocktails] = useState(
    guest.cocktailOnlyPullUpCount ?? guest.pulledUpForCocktails ?? null,
  );
  // Enrichment answers are RSVP data (not identity), so the host CAN edit them
  // here — the service desk: guest didn't fill allergies, host calls and types
  // it in. Seeded from a full copy so other answer keys are never lost on save.
  const [answers, setAnswers] = useState(() => ({ ...(guest.customAnswers || {}) }));
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
          (g.bookingStatus === "CONFIRMED" || g.status === "attending"),
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
              0,
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

  // BUSINESS RULE: Cannot change status for paid and confirmed guests
  // If guest has paid and is confirmed, they cannot be moved to waitlist
  // This would require a refund, which is a separate process
  const isPaidEvent = event.ticketType === "paid";
  const isPaidAndConfirmed =
    isPaidEvent &&
    guest.paymentStatus === "paid" &&
    guest.bookingStatus === "CONFIRMED";
  const canChangeStatus = !isPaidAndConfirmed;

  // Generate dinner time slots
  const dinnerSlots =
    event.dinnerEnabled && event.dinnerStartTime && event.dinnerEndTime
      ? generateDinnerTimeSlots(event)
      : [];

  function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    // Map status to bookingStatus for backend
    const bookingStatus =
      status === "attending"
        ? "CONFIRMED"
        : status === "cancelled"
          ? "CANCELLED"
          : "WAITLIST";

    const newPlusOnes = Math.max(0, Math.min(maxPlusOnes, parseInt(plusOnes) || 0));
    const newPartySize = 1 + newPlusOnes;
    const newDinnerPartySize = wantsDinner
      ? Math.max(1, parseInt(dinnerPartySize) || 1)
      : 0;
    const newCocktailsOnlyCount = wantsDinner ? newPlusOnes : newPartySize;

    // Clamp pull-up counts to not exceed new party sizes
    const clampedDinnerPullUp = Math.min(
      pulledUpForDinner || 0,
      newDinnerPartySize,
    );
    const clampedCocktailPullUp = Math.min(
      pulledUpForCocktails || 0,
      newCocktailsOnlyCount,
    );

    const updates = {
      name: (guest.name || "").trim() || null,
      email: (guest.email || "").trim(),
      plusOnes: newPlusOnes,
      status, // Backward compatibility
      bookingStatus, // New model field
      wantsDinner: event.dinnerEnabled ? wantsDinner : false,
      dinnerTimeSlot: wantsDinner && dinnerTimeSlot ? dinnerTimeSlot : null,
      dinnerPartySize: wantsDinner
        ? Math.max(1, parseInt(dinnerPartySize) || 1)
        : null,
      // Use new model field names (clamped)
      dinnerPullUpCount: clampedDinnerPullUp,
      cocktailOnlyPullUpCount: clampedCocktailPullUp,
      // Backward compatibility
      pulledUpForDinner: clampedDinnerPullUp || null,
      pulledUpForCocktails: clampedCocktailPullUp || null,
      // Admin override: include forceConfirm if capacity would be exceeded
      forceConfirm:
        capacityCheck.willExceedCocktail || capacityCheck.willExceedDinner,
      // Host-managed enrichment answers — full set, trimmed empties dropped.
      customAnswers: Object.fromEntries(
        Object.entries(answers)
          .map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
          .filter(([, v]) => v !== "" && v !== null && v !== undefined),
      ),
    };

    onSave(updates);
    setLoading(false);
  }

  const editIsMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(10, 10, 10, 0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: editIsMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: editIsMobile ? "0" : "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.background,
          border: editIsMobile ? "none" : `1px solid ${colors.border}`,
          borderRadius: editIsMobile ? "0" : "24px",
          padding: editIsMobile ? "20px 16px 32px" : "32px",
          maxWidth: editIsMobile ? "100%" : "600px",
          width: "100%",
          maxHeight: editIsMobile ? "100vh" : "90vh",
          overflowY: "auto",
          boxShadow: editIsMobile ? "none" : "0 8px 30px rgba(10,10,10,0.12)",
          WebkitOverflowScrolling: "touch",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: editIsMobile ? "16px" : "24px",
          }}
        >
          <h2
            style={{
              fontSize: editIsMobile ? "20px" : "24px",
              fontWeight: 700,
              margin: 0,
              color: colors.text,
            }}
          >
            Edit Guest
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: colors.textSubtle,
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
              e.target.style.background = colors.surfaceMuted;
              e.target.style.color = colors.text;
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "transparent";
              e.target.style.color = colors.textSubtle;
            }}
          >
            ×
          </button>
        </div>

        {/* Promote to Confirmed button for waitlisted guests */}
        {(guest.bookingStatus === "WAITLIST" || guest.status === "waitlist") &&
          guest.bookingStatus !== "CONFIRMED" &&
          onPromote && (
            <div
              style={{
                marginBottom: "20px",
                padding: "16px",
                background: colors.successRgba,
                border: `1px solid rgba(22, 163, 74, 0.20)`,
                borderRadius: "14px",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: colors.success,
                  marginBottom: "12px",
                }}
              >
                This guest is on the waitlist
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: colors.textMuted,
                  marginBottom: "12px",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={promoteSendEmail}
                  onChange={(e) => setPromoteSendEmail(e.target.checked)}
                  style={{
                    width: "16px",
                    height: "16px",
                    cursor: "pointer",
                    accentColor: colors.accent,
                  }}
                />
                Send confirmation email
              </label>
              <button
                type="button"
                disabled={promotingFromModal}
                onClick={async () => {
                  setPromotingFromModal(true);
                  try {
                    await onPromote(guest.id, promoteSendEmail);
                    onClose();
                  } finally {
                    setPromotingFromModal(false);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  borderRadius: "999px",
                  border: "none",
                  background: colors.success,
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: promotingFromModal ? "not-allowed" : "pointer",
                  opacity: promotingFromModal ? 0.6 : 1,
                  transition: "all 0.2s ease",
                }}
              >
                {promotingFromModal ? "Promoting..." : "Promote to Confirmed"}
              </button>
            </div>
          )}

        <form onSubmit={handleSubmit}>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            {/* Identity — read-only. The person is canonical; here the host
                only adjusts the booking, never who the person is. */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  color: colors.textSubtle,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Guest
              </label>
              <div style={{ padding: "12px 16px", borderRadius: "12px", border: `1px solid ${colors.border}`, background: colors.surface }}>
                <div style={{ fontSize: "16px", fontWeight: 600, color: colors.text }}>{guest.name || "Guest"}</div>
                {guest.email && <div style={{ fontSize: "13px", color: colors.textMuted, marginTop: "2px", wordBreak: "break-all" }}>{guest.email}</div>}
                {(guest.phone || guest.instagram) && (
                  <div style={{ fontSize: "13px", color: colors.textMuted, marginTop: "2px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    {guest.phone && <span>{guest.phone}</span>}
                    {guest.instagram && <span>@{String(guest.instagram).replace(/^@+/, "")}</span>}
                  </div>
                )}
                <div style={{ fontSize: "11px", color: colors.textFaded, marginTop: "8px", lineHeight: 1.4 }}>
                  Managed on their profile — here you only adjust their booking.
                </div>
              </div>
            </div>

            {/* Their answers — editable. Host can fill what a guest left blank
                (call them, type it in). These are RSVP data, not identity. */}
            {Array.isArray(event.enrichmentQuestions) && event.enrichmentQuestions.length > 0 && (
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    marginBottom: "8px",
                    color: colors.textSubtle,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Their answers
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {event.enrichmentQuestions.map((q) => (
                    <div key={q.id}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: colors.textSubtle, marginBottom: "5px" }}>{q.label}</div>
                      <textarea
                        value={answers[q.id] || ""}
                        onChange={(e) => { const v = e.target.value; setAnswers((prev) => ({ ...prev, [q.id]: v })); }}
                        placeholder="No answer yet — add one"
                        rows={2}
                        style={{
                          width: "100%",
                          resize: "vertical",
                          padding: "10px 14px",
                          borderRadius: "12px",
                          border: `1px solid ${colors.borderStrong}`,
                          background: colors.background,
                          color: colors.text,
                          fontSize: "14px",
                          fontFamily: "inherit",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  color: colors.textSubtle,
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
                  background: colors.surface,
                  borderRadius: "12px",
                  padding: "8px",
                  border: `1px solid ${colors.border}`,
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
                        ? colors.surfaceMuted
                        : colors.surfaceMuted,
                    color: plusOnes <= 0 ? colors.textFaded : colors.text,
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
                    color: colors.text,
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
                        ? colors.surfaceMuted
                        : colors.surfaceMuted,
                    color:
                      plusOnes >= maxPlusOnes
                        ? colors.textFaded
                        : colors.text,
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
                  color: colors.textSubtle,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={!canChangeStatus}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: `1px solid ${colors.borderStrong}`,
                  background: colors.background,
                  color: canChangeStatus ? colors.text : colors.textSubtle,
                  fontSize: "15px",
                  outline: "none",
                  boxSizing: "border-box",
                  cursor: canChangeStatus ? "pointer" : "not-allowed",
                  opacity: canChangeStatus ? 1 : 0.6,
                }}
              >
                <option value="attending">Attending</option>
                <option value="waitlist">Waitlist</option>
                {canChangeStatus && (
                  <option value="cancelled">Cancelled</option>
                )}
              </select>
              {!canChangeStatus && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px 12px",
                    background: colors.warningRgba,
                    border: `1px solid rgba(180, 83, 9, 0.25)`,
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: colors.warning,
                    lineHeight: "1.4",
                  }}
                >
                  This guest has paid and is confirmed. Status cannot be changed
                  to waitlist. To remove this guest, process a refund first.
                </div>
              )}
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
                          color: colors.textSubtle,
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
                          border: `1px solid ${colors.borderStrong}`,
                          background: colors.background,
                          color: colors.text,
                          fontSize: "15px",
                          outline: "none",
                          boxSizing: "border-box",
                          cursor: "pointer",
                        }}
                      >
                        <option value="">Select time slot</option>
                        {dinnerSlots.map((slot) => (
                          <option key={slot} value={slot}>
                            {formatEventTime(slot, event?.timezone)}
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
                          color: colors.textSubtle,
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
                          background: colors.surface,
                          borderRadius: "12px",
                          padding: "8px",
                          border: `1px solid ${colors.border}`,
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
                                ? colors.surfaceMuted
                                : colors.successRgba,
                            color:
                              dinnerPartySize <= 1
                                ? colors.textFaded
                                : colors.success,
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
                            color: colors.success,
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
                                ? colors.surfaceMuted
                                : colors.successRgba,
                            color:
                              dinnerPartySize >= 8
                                ? colors.textFaded
                                : colors.success,
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
                          color: colors.textSubtle,
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
                  color: colors.textSubtle,
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
                      // Use current form values for max calculation (DPCS model)
                      const currentPlusOnes = parseInt(plusOnes) || 0;
                      const cocktailsMax = wantsDinner
                        ? currentPlusOnes
                        : 1 + currentPlusOnes;

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
                      accentColor: colors.warning,
                    }}
                  />
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: pulledUpForCocktails !== null ? colors.warning : colors.text,
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Wine size={18} style={{ color: pulledUpForCocktails !== null ? colors.warning : colors.textSubtle }} /> List
                  </span>
                </label>
                {pulledUpForCocktails !== null && (
                  <div style={{ marginLeft: "30px", marginTop: "8px" }}>
                    {(() => {
                      // Use current form values for max calculation (DPCS model)
                      const currentPlusOnes = parseInt(plusOnes) || 0;
                      const cocktailsMax = wantsDinner
                        ? currentPlusOnes
                        : 1 + currentPlusOnes;
                      const currentValue = pulledUpForCocktails || 0;
                      return (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            background: colors.warningRgba,
                            borderRadius: "12px",
                            padding: "8px",
                            border: `1px solid rgba(180, 83, 9, 0.25)`,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const newValue = Math.max(0, currentValue - 1);
                              setPulledUpForCocktails(
                                newValue === 0 ? 0 : newValue,
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
                                  ? colors.surfaceMuted
                                  : `rgba(180, 83, 9, 0.15)`,
                              color:
                                currentValue <= 0
                                  ? colors.textFaded
                                  : colors.warning,
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
                              color: colors.warning,
                            }}
                          >
                            {currentValue}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newValue = Math.min(
                                cocktailsMax,
                                currentValue + 1,
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
                                  ? colors.surfaceMuted
                                  : `rgba(180, 83, 9, 0.15)`,
                              color:
                                currentValue >= cocktailsMax
                                  ? colors.textFaded
                                  : colors.warning,
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
                        marginTop: "6px",
                        textAlign: "center",
                        color: colors.textSubtle,
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
                        accentColor: colors.success,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: pulledUpForDinner !== null ? colors.success : colors.text,
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <UtensilsCrossed size={18} style={{ color: pulledUpForDinner !== null ? colors.success : colors.textSubtle }} /> Dinner
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
                              background: colors.successRgba,
                              borderRadius: "12px",
                              padding: "8px",
                              border: `1px solid rgba(22, 163, 74, 0.25)`,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                const newValue = Math.max(0, currentValue - 1);
                                setPulledUpForDinner(
                                  newValue === 0 ? 0 : newValue,
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
                                    ? colors.surfaceMuted
                                    : `rgba(22, 163, 74, 0.15)`,
                                color:
                                  currentValue <= 0
                                    ? colors.textFaded
                                    : colors.success,
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
                                color: colors.success,
                              }}
                            >
                              {currentValue}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newValue = Math.min(
                                  dinnerMax,
                                  currentValue + 1,
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
                                    ? colors.surfaceMuted
                                    : `rgba(22, 163, 74, 0.15)`,
                                color:
                                  currentValue >= dinnerMax
                                    ? colors.textFaded
                                    : colors.success,
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
                          marginTop: "6px",
                          textAlign: "center",
                          color: colors.textSubtle,
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
                background: colors.dangerRgba,
                borderRadius: "14px",
                border: `1px solid rgba(220, 38, 38, 0.20)`,
                fontSize: "13px",
                color: colors.danger,
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
                <AlertTriangle
                  size={18}
                  style={{ color: colors.warning }}
                />
                <span>You're overriding capacity</span>
              </div>
              <div style={{ opacity: 0.9 }}>
                {capacityCheck.willExceedCocktail &&
                  !capacityCheck.willExceedDinner && (
                    <div>
                      Confirming this guest will put the event over list
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
                      Confirming this guest will put both list and dinner
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
              marginTop: editIsMobile ? "20px" : "32px",
              paddingBottom: editIsMobile ? "env(safe-area-inset-bottom, 0px)" : "0",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: editIsMobile ? "16px 24px" : "14px 24px",
                borderRadius: "999px",
                border: `1px solid ${colors.borderStrong}`,
                background: colors.background,
                color: colors.text,
                fontSize: editIsMobile ? "16px" : "15px",
                fontWeight: 600,
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: editIsMobile ? "16px 24px" : "14px 24px",
                borderRadius: "999px",
                border: "none",
                background:
                  capacityCheck.willExceedCocktail ||
                  capacityCheck.willExceedDinner
                    ? colors.danger
                    : colors.accent,
                color: "#fff",
                fontSize: editIsMobile ? "16px" : "15px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                WebkitTapHighlightColor: "transparent",
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

          {/* Refund button for paid guests - only when caller has permission */}
          {onRefund &&
            event.ticketType === "paid" &&
            guest.paymentId &&
            guest.paymentStatus === "paid" &&
            guest.bookingStatus === "CONFIRMED" && (
              <div
                style={{
                  marginTop: "24px",
                  paddingTop: "24px",
                  borderTop: `1px solid ${colors.border}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onRefund) {
                      onRefund(guest);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "14px 24px",
                    borderRadius: "999px",
                    border: `1px solid rgba(180, 83, 9, 0.30)`,
                    background: colors.warningRgba,
                    color: colors.warning,
                    fontSize: "15px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `rgba(180, 83, 9, 0.16)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = colors.warningRgba;
                  }}
                >
                  Process Refund
                </button>
              </div>
            )}
        </form>
      </div>
    </div>
  );
}

function PulledUpModal({ guest, event, onClose, onSave, onCheckInComplete }) {
  const [isMobileView] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);

  const partySize = guest.partySize || 1;
  const dinnerPartySize = guest.dinner?.partySize ?? guest.dinnerPartySize ?? 0;
  const dinnerConfirmed =
    guest.dinner?.bookingStatus === "CONFIRMED" ||
    guest.dinnerStatus === "confirmed";
  const wantsDinner = guest.dinner?.enabled ?? guest.wantsDinner ?? false;
  const plusOnes = guest.plusOnes ?? 0;
  const cocktailsMax = wantsDinner && dinnerConfirmed ? plusOnes : partySize;
  const totalExpected = (wantsDinner && dinnerConfirmed ? dinnerPartySize : 0) + cocktailsMax;

  // Current arrival counts
  const alreadyCocktails = guest.cocktailOnlyPullUpCount ?? guest.pulledUpForCocktails ?? 0;
  const alreadyDinner = guest.dinnerPullUpCount ?? guest.pulledUpForDinner ?? 0;
  const alreadyArrived = alreadyCocktails + alreadyDinner;
  const remaining = Math.max(0, totalExpected - alreadyArrived);

  // Total checked-in counter — just the total, tap +/- to adjust
  const [total, setTotal] = useState(alreadyArrived);
  const [loading, setLoading] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const changed = total !== alreadyArrived;

  async function handleSave() {
    if (!changed) return;
    setLoading(true);

    try {
      // Distribute total across dinner + cocktails slots
      let newDinner = 0;
      let newCocktails = 0;

      if (wantsDinner && dinnerConfirmed) {
        // Fill dinner slots first, overflow to cocktails
        newDinner = Math.min(total, dinnerPartySize);
        newCocktails = Math.min(total - newDinner, cocktailsMax);
      } else {
        newCocktails = Math.min(total, cocktailsMax);
      }

      const success = await onSave(newDinner, newCocktails);
      if (success) {
        if (total > alreadyArrived && onCheckInComplete) {
          onCheckInComplete();
        } else {
          onClose();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const btnSize = isMobileView ? "60px" : "48px";
  const counterFontSize = isMobileView ? "32px" : "28px";
  const btnFontSize = isMobileView ? "28px" : "24px";

  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(10, 10, 10, 0.40)",
        backdropFilter: "blur(2px)",
        zIndex: 1000,
        display: "flex",
        alignItems: isMobileView ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobileView ? "0" : "20px",
      }}
      onClick={() => { if (changed) { setShowDiscard(true); } else { onClose(); } }}
    >
      <div
        style={{
          position: "relative",
          background: colors.background,
          border: isMobileView ? "none" : `1px solid ${colors.border}`,
          borderRadius: isMobileView ? "24px 24px 0 0" : "24px",
          padding: isMobileView ? "24px 20px 36px" : "32px",
          maxWidth: isMobileView ? "100%" : "420px",
          width: "100%",
          boxShadow: "0 -4px 20px rgba(10,10,10,0.08)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag indicator for mobile */}
        {isMobileView && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
            <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: colors.border }} />
          </div>
        )}

        {/* Guest name + email + party size */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{
            fontSize: isMobileView ? "22px" : "20px",
            fontWeight: 700,
            color: colors.text,
            marginBottom: "2px",
          }}>
            {guest.name || "Guest"}
          </div>
          <div style={{
            fontSize: "12px",
            color: colors.textFaded,
            marginBottom: "4px",
          }}>
            {guest.email}
          </div>
          {/* Native lane: tel:, wa.me, mailto: — when host wants the
              "where are you" gesture during an event */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px" }}>
            <NativeLaneActions person={guest} compact />
          </div>
          <div style={{
            fontSize: "14px",
            color: colors.textSubtle,
          }}>
            {totalExpected} {totalExpected === 1 ? "guest" : "guests"} expected
          </div>
        </div>

        {/* Counter — shows total checked in */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          marginBottom: "28px",
        }}>
          <button
            type="button"
            onClick={() => setTotal(Math.max(0, total - 1))}
            disabled={total <= 0}
            style={{
              width: btnSize, height: btnSize,
              borderRadius: "14px",
              border: `1px solid ${colors.border}`,
              background: total <= 0
                ? colors.surfaceMuted
                : colors.surface,
              color: total <= 0
                ? colors.textFaded
                : colors.text,
              fontSize: btnFontSize, fontWeight: 600,
              cursor: total <= 0 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            −
          </button>
          <div style={{
            fontSize: counterFontSize,
            fontWeight: 700,
            color: colors.text,
            minWidth: "80px",
            textAlign: "center",
          }}>
            {total}<span style={{ fontSize: "0.55em", fontWeight: 500, color: colors.textFaded }}>/{totalExpected}</span>
          </div>
          <button
            type="button"
            onClick={() => setTotal(Math.min(totalExpected, total + 1))}
            disabled={total >= totalExpected}
            style={{
              width: btnSize, height: btnSize,
              borderRadius: "14px",
              border: `1px solid ${colors.border}`,
              background: total >= totalExpected
                ? colors.surfaceMuted
                : colors.surface,
              color: total >= totalExpected
                ? colors.textFaded
                : colors.text,
              fontSize: btnFontSize, fontWeight: 600,
              cursor: total >= totalExpected ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            +
          </button>
        </div>

        {/* Save button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !changed}
          style={{
            width: "100%",
            padding: isMobileView ? "18px" : "16px",
            borderRadius: "14px",
            border: "none",
            background: !changed
              ? colors.surfaceMuted
              : total < alreadyArrived
              ? colors.danger
              : colors.success,
            color: !changed
              ? colors.textFaded
              : "#fff",
            fontSize: isMobileView ? "17px" : "16px",
            fontWeight: 700,
            cursor: loading || !changed ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            WebkitTapHighlightColor: "transparent",
            transition: "all 0.15s ease",
          }}
        >
          {loading
            ? "Saving..."
            : !changed
            ? `${total}/${totalExpected} checked in`
            : total < alreadyArrived
            ? `Remove ${alreadyArrived - total}`
            : `Check in ${total}/${totalExpected}`
          }
        </button>

      </div>

      {/* Discard confirmation — centered alert */}
      {showDiscard && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(10,10,10,0.45)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={(e) => { e.stopPropagation(); setShowDiscard(false); }}
        >
          <div
            style={{
              background: colors.background,
              border: `1px solid ${colors.border}`,
              borderRadius: "20px",
              padding: "28px 24px 20px",
              maxWidth: "300px",
              width: "100%",
              boxShadow: "0 8px 30px rgba(10,10,10,0.10)",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              fontSize: "17px",
              fontWeight: 700,
              color: colors.text,
              marginBottom: "6px",
            }}>
              Unsaved changes
            </div>
            <div style={{
              fontSize: "14px",
              color: colors.textSubtle,
              marginBottom: "24px",
            }}>
              You have unsaved check-in changes for {guest.name || "this guest"}.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleSave(); }}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "999px",
                  border: "none",
                  background: total < alreadyArrived
                    ? colors.danger
                    : colors.success,
                  color: "#fff",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {total < alreadyArrived ? `Remove ${alreadyArrived - total}` : `Check in ${total}/${totalExpected}`}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "999px",
                  border: `1px solid ${colors.borderStrong}`,
                  background: "transparent",
                  color: colors.textMuted,
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
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
        background: "rgba(10, 10, 10, 0.55)",
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
          background: colors.background,
          border: `1px solid ${colors.border}`,
          borderRadius: "24px",
          padding: "32px",
          maxWidth: "500px",
          width: "100%",
          boxShadow: "0 8px 30px rgba(10,10,10,0.10)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            marginBottom: "16px",
            color: colors.text,
          }}
        >
          Delete Guest?
        </h2>
        <p
          style={{
            fontSize: "15px",
            color: colors.textMuted,
            marginBottom: "24px",
            lineHeight: "1.6",
          }}
        >
          Are you sure you want to delete{" "}
          <strong style={{ color: colors.text }}>{guest.name || guest.email}</strong>? This action cannot be
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
              borderRadius: "999px",
              border: `1px solid ${colors.borderStrong}`,
              background: colors.background,
              color: colors.text,
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.surfaceMuted;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.background;
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: "14px 24px",
              borderRadius: "999px",
              border: "none",
              background: colors.danger,
              color: "#fff",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function RefundConfirmModal({ guest, event, refunding, onClose, onConfirm }) {
  // Calculate payment amount (if available from guest data or we'd need to fetch it)
  // For now, we'll show a generic message
  const currencySymbol = event?.ticketCurrency === "sek" ? "kr" : "$";

  // Try to get payment amount from guest data if available
  // This would require the guest object to include payment details
  // For now, we'll show a clear explanation

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(10, 10, 10, 0.55)",
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
          background: colors.background,
          border: `1px solid ${colors.border}`,
          borderRadius: "24px",
          padding: "32px",
          maxWidth: "500px",
          width: "100%",
          boxShadow: "0 8px 30px rgba(10,10,10,0.10)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            marginBottom: "16px",
            color: colors.warning,
          }}
        >
          Process Refund?
        </h2>
        <p
          style={{
            fontSize: "15px",
            color: colors.textMuted,
            marginBottom: "20px",
            lineHeight: "1.6",
          }}
        >
          You are about to refund the payment for{" "}
          <strong style={{ color: colors.text }}>{guest.name || guest.email}</strong>.
        </p>

        <div
          style={{
            padding: "16px",
            background: colors.warningRgba,
            border: `1px solid rgba(180, 83, 9, 0.25)`,
            borderRadius: "12px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: "8px",
              color: colors.warning,
            }}
          >
            What happens next:
          </div>
          <ul
            style={{
              fontSize: "13px",
              color: colors.textMuted,
              lineHeight: "1.8",
              margin: 0,
              paddingLeft: "20px",
            }}
          >
            <li>
              The ticket amount will be refunded to the customer (platform fee
              is non-refundable)
            </li>
            <li>
              The platform fee will be <strong>kept by the platform</strong>{" "}
              (standard practice)
            </li>
            <li>The transfer to your Stripe account will be reversed</li>
            <li>
              The guest will be moved to <strong>waitlist</strong> status
            </li>
            <li>They can re-pay later if a spot becomes available</li>
          </ul>
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
          }}
        >
          <button
            onClick={onClose}
            disabled={refunding}
            style={{
              flex: 1,
              padding: "14px 24px",
              borderRadius: "999px",
              border: `1px solid ${colors.borderStrong}`,
              background: colors.background,
              color: colors.text,
              fontSize: "15px",
              fontWeight: 600,
              cursor: refunding ? "not-allowed" : "pointer",
              opacity: refunding ? 0.5 : 1,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!refunding) {
                e.currentTarget.style.background = colors.surfaceMuted;
              }
            }}
            onMouseLeave={(e) => {
              if (!refunding) {
                e.currentTarget.style.background = colors.background;
              }
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(true)}
            disabled={refunding}
            style={{
              flex: 1,
              padding: "14px 24px",
              borderRadius: "999px",
              border: "none",
              background: refunding
                ? colors.warningRgba
                : colors.warning,
              color: "#fff",
              fontSize: "15px",
              fontWeight: 600,
              cursor: refunding ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {refunding ? "Processing..." : "Process Refund"}
          </button>
        </div>
      </div>
    </div>
  );
}
