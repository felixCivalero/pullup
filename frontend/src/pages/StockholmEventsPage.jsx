import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { useToast } from "../components/Toast";

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "newsletter", label: "Sent" },
];

const CATEGORY_EMOJI = {
  music: "🎵",
  club: "🎧",
  exhibition: "🖼️",
  culture: "🎭",
  theatre: "🎭",
  arts: "🎨",
};

const WEEK_FILTERS = [
  { key: "all", label: "All dates" },
  { key: "this_week", label: "This week" },
  { key: "next_week", label: "Next week" },
  { key: "2_weeks", label: "Next 2 weeks" },
  { key: "this_month", label: "This month" },
];

const CATEGORY_FILTERS = [
  { key: "all", label: "All categories" },
  { key: "music", label: "Music" },
  { key: "club", label: "Club" },
  { key: "exhibition", label: "Exhibition" },
  { key: "culture", label: "Culture" },
  { key: "theatre", label: "Theatre" },
  { key: "arts", label: "Arts" },
  { key: "other", label: "Other" },
];

function getWeekRange(key) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = startOfToday.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const thisMonday = new Date(startOfToday);
  thisMonday.setDate(startOfToday.getDate() + mondayOffset);

  switch (key) {
    case "this_week": {
      const end = new Date(thisMonday);
      end.setDate(thisMonday.getDate() + 7);
      return [startOfToday, end];
    }
    case "next_week": {
      const start = new Date(thisMonday);
      start.setDate(thisMonday.getDate() + 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return [start, end];
    }
    case "2_weeks": {
      const end = new Date(thisMonday);
      end.setDate(thisMonday.getDate() + 21);
      return [startOfToday, end];
    }
    case "this_month": {
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return [startOfToday, end];
    }
    default:
      return null;
  }
}

function extractCity(location) {
  if (!location) return null;
  // Try to get city from "Venue, City" or "Venue, City, Country" patterns
  const parts = location.split(",").map((s) => s.trim());
  if (parts.length >= 2) return parts[parts.length - 1];
  return location.trim();
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateRange(starts, ends) {
  if (!starts && !ends) return null;
  const fmtShort = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
  };
  if (starts && ends) return `${fmtShort(starts)} – ${fmtShort(ends)}`;
  if (starts) return `Från ${fmtShort(starts)}`;
  return `Till ${fmtShort(ends)}`;
}

function EventCard({ event, onStatusChange, onDelete, onSpotifyChange }) {
  const [loading, setLoading] = useState(false);
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const [spotifyDraft, setSpotifyDraft] = useState(event.spotify_url || "");
  const [spotifySaving, setSpotifySaving] = useState(false);

  // Keep draft in sync when parent state updates (e.g. after save)
  useEffect(() => {
    setSpotifyDraft(event.spotify_url || "");
  }, [event.spotify_url]);

  async function handleStatus(status) {
    setLoading(true);
    await onStatusChange(event.id, status);
    setLoading(false);
  }

  async function handleSpotifySave() {
    setSpotifySaving(true);
    await onSpotifyChange(event.id, spotifyDraft.trim() || null);
    setSpotifySaving(false);
    if (!spotifyDraft.trim()) setSpotifyOpen(false);
  }

  const isApproved = event.status === "approved";
  const isRejected = event.status === "rejected";
  const isPending = event.status === "pending";

  return (
    <div
      style={{
        borderRadius: "16px",
        background: "linear-gradient(145deg, rgba(14,12,24,0.97), rgba(20,17,34,0.98))",
        border: `1px solid ${
          isApproved
            ? "rgba(34,197,94,0.3)"
            : isRejected
            ? "rgba(239,68,68,0.2)"
            : "rgba(255,255,255,0.1)"
        }`,
        overflow: "hidden",
        opacity: isRejected ? 0.5 : 1,
        transition: "opacity 0.2s, border-color 0.2s",
      }}
    >
      {/* Image */}
      {event.image_url && (
        <div style={{ width: "100%", height: "200px", overflow: "hidden" }}>
          <img
            src={event.image_url}
            alt={event.title}
            referrerPolicy="no-referrer"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        </div>
      )}

      <div style={{ padding: "16px" }}>
        {/* Category + Source */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "8px",
            alignItems: "center",
          }}
        >
          {event.category && (
            <span
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: colors.silverMuted,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {CATEGORY_EMOJI[event.category] || "✨"} {event.category}
            </span>
          )}
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "11px" }}>·</span>
          <span style={{ fontSize: "11px", color: colors.textFaded }}>
            {event.source?.replace(/_/g, " ")}
          </span>
        </div>

        {/* Title */}
        <h3
          style={{
            margin: "0 0 6px",
            fontSize: "16px",
            fontWeight: 600,
            color: colors.text,
            lineHeight: 1.3,
          }}
        >
          {event.title}
        </h3>

        {/* Description */}
        {event.description && (
          <p
            style={{
              margin: "0 0 10px",
              fontSize: "13px",
              color: colors.textSubtle,
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {event.description}
          </p>
        )}

        {/* Date + Location */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "3px",
            marginBottom: "14px",
          }}
        >
          {event.starts_at && (
            <span style={{ fontSize: "12px", color: colors.silverMuted }}>
              📅 {event.ends_at
                ? formatDateRange(event.starts_at, event.ends_at)
                : formatDate(event.starts_at)}
            </span>
          )}
          {event.location && (
            <span style={{ fontSize: "12px", color: colors.silverMuted }}>
              📍 {event.location}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {/* Approve / Reject */}
          {!isApproved && (
            <button
              onClick={() => handleStatus("approved")}
              disabled={loading}
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(34,197,94,0.4)",
                background: "rgba(34,197,94,0.1)",
                color: colors.success,
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              ✓ Approve
            </button>
          )}
          {!isRejected && (
            <button
              onClick={() => handleStatus("rejected")}
              disabled={loading}
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(239,68,68,0.3)",
                background: "rgba(239,68,68,0.08)",
                color: "#ef4444",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✕ Reject
            </button>
          )}
          {isPending && (
            <span style={{ fontSize: "11px", color: colors.textFaded, alignSelf: "center" }}>
              pending
            </span>
          )}
          {isApproved && (
            <button
              onClick={() => handleStatus("pending")}
              disabled={loading}
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: colors.textFaded,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              ↩ Undo
            </button>
          )}

          {/* Sent indicator */}
          {event.newsletter_sent_at && (
            <span
              style={{
                marginLeft: "auto",
                padding: "7px 14px",
                fontSize: "12px",
                fontWeight: 600,
                color: colors.gold,
              }}
            >
              ★ Sent
            </span>
          )}

          {/* External link */}
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "7px 10px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.08)",
                color: colors.textFaded,
                fontSize: "12px",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
              }}
            >
              ↗
            </a>
          )}

          {/* Spotify toggle */}
          <button
            onClick={() => setSpotifyOpen((o) => !o)}
            style={{
              marginLeft: event.newsletter_sent_at ? "0" : "auto",
              padding: "7px 10px",
              borderRadius: "8px",
              border: `1px solid ${event.spotify_url ? "rgba(30,215,96,0.35)" : "rgba(255,255,255,0.08)"}`,
              background: event.spotify_url ? "rgba(30,215,96,0.1)" : "transparent",
              color: event.spotify_url ? "#1ed760" : colors.textFaded,
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            title={event.spotify_url ? "Edit Spotify link" : "Add Spotify link"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
          </button>
        </div>

        {/* Spotify URL input */}
        {spotifyOpen && (
          <div
            style={{
              marginTop: "10px",
              display: "flex",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#1ed760" style={{ flexShrink: 0 }}><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
            <input
              type="url"
              placeholder="https://open.spotify.com/..."
              value={spotifyDraft}
              onChange={(e) => setSpotifyDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSpotifySave()}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(30,215,96,0.25)",
                background: "rgba(30,215,96,0.05)",
                color: "#fff",
                fontSize: "12px",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={handleSpotifySave}
              disabled={spotifySaving}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(30,215,96,0.4)",
                background: "rgba(30,215,96,0.15)",
                color: "#1ed760",
                fontSize: "12px",
                fontWeight: 600,
                cursor: spotifySaving ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {spotifySaving ? "..." : "Save"}
            </button>
            {event.spotify_url && (
              <button
                onClick={async () => {
                  setSpotifyDraft("");
                  setSpotifySaving(true);
                  await onSpotifyChange(event.id, null);
                  setSpotifySaving(false);
                  setSpotifyOpen(false);
                }}
                disabled={spotifySaving}
                style={{
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid rgba(239,68,68,0.3)",
                  background: "rgba(239,68,68,0.08)",
                  color: "#ef4444",
                  fontSize: "12px",
                  cursor: spotifySaving ? "not-allowed" : "pointer",
                  flexShrink: 0,
                }}
                title="Remove Spotify link"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function StockholmEventsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [scraping, setScraping] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [weekFilter, setWeekFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const EMPTY_FORM = { title: "", description: "", image_url: "", starts_at: "", ends_at: "", location: "", url: "", category: "culture", spotify_url: "" };
  const [manualForm, setManualForm] = useState(EMPTY_FORM);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const EMPTY_SOURCE = { name: "", source_key: "", scrape_url: "", location: "Stockholm", category: "culture", strategy: "auto", link_selector: "", image_attr: "" };
  const [sourceForm, setSourceForm] = useState(EMPTY_SOURCE);
  const [sourceFormLoading, setSourceFormLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [loading, user, navigate]);

  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab === "newsletter") {
        params.set("newsletter", "true");
      } else if (activeTab !== "all") {
        params.set("status", activeTab);
      }
      const res = await authenticatedFetch(
        `/admin/stockholm-events?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      setEvents(await res.json());
    } catch (err) {
      showToast("Failed to load events", "error");
    } finally {
      setEventsLoading(false);
    }
  }, [activeTab, showToast]);

  useEffect(() => {
    if (!loading && user) fetchEvents();
  }, [loading, user, fetchEvents]);

  async function handleStatusChange(id, status) {
    try {
      const res = await authenticatedFetch(`/admin/stockholm-events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status } : e))
      );
    } catch {
      showToast("Failed to update event", "error");
    }
  }

  async function handleSpotifyChange(id, spotifyUrl) {
    try {
      const res = await authenticatedFetch(`/admin/stockholm-events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ spotify_url: spotifyUrl }),
      });
      if (!res.ok) throw new Error();
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, spotify_url: spotifyUrl } : e))
      );
      showToast(spotifyUrl ? "Spotify link saved!" : "Spotify link removed", "success");
    } catch {
      showToast("Failed to update Spotify link", "error");
    }
  }

  async function handleScrape() {
    setScraping(true);
    try {
      const res = await authenticatedFetch("/admin/stockholm-events/scrape", {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      showToast("Scrape started — check back in a minute!", "success");
      setTimeout(() => fetchEvents(), 8000);
    } catch {
      showToast("Failed to trigger scrape", "error");
    } finally {
      setScraping(false);
    }
  }

  function setField(key, value) {
    setManualForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAutofillUrl() {
    if (!manualForm.url.trim()) return;
    setManualLoading(true);
    try {
      const res = await authenticatedFetch("/admin/stockholm-events/fetch-url", {
        method: "POST",
        body: JSON.stringify({ url: manualForm.url.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setManualForm((prev) => ({
        ...prev,
        title: data.title || prev.title,
        description: data.description || prev.description,
        image_url: data.image_url || prev.image_url,
        starts_at: data.starts_at || prev.starts_at,
        ends_at: data.ends_at || prev.ends_at,
        location: data.location || prev.location,
      }));
      showToast("Fields auto-filled!", "success");
    } catch {
      showToast("Could not autofill — fill in manually", "error");
    } finally {
      setManualLoading(false);
    }
  }

  async function handleManualSave() {
    if (!manualForm.title.trim()) return;
    setManualLoading(true);
    try {
      const res = await authenticatedFetch("/admin/stockholm-events", {
        method: "POST",
        body: JSON.stringify({ ...manualForm, source: "manual" }),
      });
      if (!res.ok) throw new Error();
      showToast("Event added to pending!", "success");
      setManualForm(EMPTY_FORM);
      setManualOpen(false);
      fetchEvents();
    } catch {
      showToast("Failed to save event", "error");
    } finally {
      setManualLoading(false);
    }
  }

  async function fetchSources() {
    setSourcesLoading(true);
    try {
      const res = await authenticatedFetch("/admin/scrape-sources");
      if (!res.ok) throw new Error();
      setSources(await res.json());
    } catch {
      showToast("Failed to load scrape sources", "error");
    } finally {
      setSourcesLoading(false);
    }
  }

  useEffect(() => {
    if (sourcesOpen && sources.length === 0) fetchSources();
  }, [sourcesOpen]);

  async function handleToggleSource(id, enabled) {
    try {
      const res = await authenticatedFetch(`/admin/scrape-sources/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error();
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
    } catch {
      showToast("Failed to update source", "error");
    }
  }

  async function handleDeleteSource(id) {
    try {
      const res = await authenticatedFetch(`/admin/scrape-sources/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSources((prev) => prev.filter((s) => s.id !== id));
      showToast("Source removed", "success");
    } catch {
      showToast("Failed to delete source", "error");
    }
  }

  async function handleAddSource() {
    if (!sourceForm.name.trim() || !sourceForm.scrape_url.trim()) return;
    setSourceFormLoading(true);
    try {
      const key = sourceForm.source_key.trim() || sourceForm.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const res = await authenticatedFetch("/admin/scrape-sources", {
        method: "POST",
        body: JSON.stringify({ ...sourceForm, source_key: key }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      const created = await res.json();
      setSources((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSourceForm(EMPTY_SOURCE);
      setAddSourceOpen(false);
      showToast("Source added!", "success");
    } catch (err) {
      showToast(err.message || "Failed to add source", "error");
    } finally {
      setSourceFormLoading(false);
    }
  }

  // Derive unique cities from events
  const cities = [...new Set(events.map((e) => extractCity(e.location)).filter(Boolean))].sort();

  // Apply filters
  const filteredEvents = events.filter((event) => {
    // Week filter
    if (weekFilter !== "all") {
      const range = getWeekRange(weekFilter);
      if (range && event.starts_at) {
        const eventStart = new Date(event.starts_at);
        const eventEnd = event.ends_at ? new Date(event.ends_at) : eventStart;
        // Show if the event's date range overlaps with the filter range
        if (eventEnd < range[0] || eventStart >= range[1]) return false;
      } else if (range && !event.starts_at) {
        return false;
      }
    }
    // Category filter
    if (categoryFilter !== "all" && event.category !== categoryFilter) return false;
    // City filter
    if (cityFilter !== "all" && extractCity(event.location) !== cityFilter) return false;
    return true;
  });

  const readyToSendCount = events.filter((e) => e.status === "approved" && !e.newsletter_sent_at).length;

  const inputStyle = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "9px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: colors.text,
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
  };
  const labelStyle = {
    display: "block",
    fontSize: "11px",
    color: colors.textFaded,
    marginBottom: "5px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };

  if (loading) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "80px 16px 60px",
        background: colors.background,
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "24px",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                opacity: 0.5,
                marginBottom: "6px",
                color: colors.silverText,
              }}
            >
              Admin · Stockholm
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: "26px",
                fontWeight: 700,
                color: colors.text,
              }}
            >
              Cultural Events
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: "13px",
                color: colors.textSubtle,
              }}
            >
              Curate Stockholm events for the newsletter.
              {readyToSendCount > 0 && (
                <span
                  style={{
                    marginLeft: "8px",
                    color: colors.gold,
                    fontWeight: 600,
                  }}
                >
                  ★ {readyToSendCount} ready to send
                </span>
              )}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              onClick={() => navigate("/admin")}
              style={{
                padding: "9px 16px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: colors.textMuted,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              ← Newsletter
            </button>
            <button
              onClick={handleScrape}
              disabled={scraping}
              style={{
                padding: "9px 18px",
                borderRadius: "10px",
                border: "1px solid rgba(192,192,192,0.3)",
                background: scraping
                  ? "rgba(192,192,192,0.05)"
                  : "rgba(192,192,192,0.1)",
                color: colors.silverText,
                fontSize: "13px",
                fontWeight: 600,
                cursor: scraping ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {scraping ? "Scraping..." : "↻ Fetch new events"}
            </button>
          </div>
        </div>

        {/* Manual Add */}
        <div style={{ marginBottom: "24px" }}>
          {/* Toggle button */}
          <button
            onClick={() => { setManualOpen((o) => !o); setManualForm(EMPTY_FORM); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "12px",
              border: `1px solid ${manualOpen ? "rgba(192,192,192,0.3)" : "rgba(255,255,255,0.1)"}`,
              background: manualOpen ? "rgba(192,192,192,0.08)" : "transparent",
              color: manualOpen ? colors.silverText : colors.textFaded,
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <span style={{ fontSize: "16px" }}>{manualOpen ? "✕" : "＋"}</span>
            Add event manually
          </button>

          {/* Expandable form */}
          {manualOpen && (
            <div
              style={{
                marginTop: "12px",
                borderRadius: "16px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "linear-gradient(145deg, rgba(14,12,24,0.97), rgba(20,17,34,0.98))",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div style={{ fontSize: "11px", color: colors.textFaded, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                New event
              </div>

              {/* URL autofill helper */}
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="url"
                  placeholder="Optional: paste a URL to autofill fields below →"
                  value={manualForm.url}
                  onChange={(e) => setField("url", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAutofillUrl()}
                  style={inputStyle}
                />
                <button
                  onClick={handleAutofillUrl}
                  disabled={manualLoading || !manualForm.url.trim()}
                  style={{
                    padding: "9px 14px",
                    borderRadius: "9px",
                    border: "1px solid rgba(192,192,192,0.2)",
                    background: "rgba(192,192,192,0.06)",
                    color: colors.silverMuted,
                    fontSize: "12px",
                    cursor: manualLoading || !manualForm.url.trim() ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {manualLoading ? "..." : "Autofill ↓"}
                </button>
              </div>

              {/* Image preview */}
              {manualForm.image_url && (
                <div style={{ width: "100%", height: "160px", borderRadius: "10px", overflow: "hidden" }}>
                  <img
                    src={manualForm.image_url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => (e.target.style.display = "none")}
                  />
                </div>
              )}

              {/* Title */}
              <div>
                <label style={labelStyle}>Event title *</label>
                <input
                  type="text"
                  placeholder="e.g. Süda — Intimate music gathering"
                  value={manualForm.title}
                  onChange={(e) => setField("title", e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  placeholder="What is this event about?"
                  value={manualForm.description}
                  onChange={(e) => setField("description", e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                />
              </div>

              {/* Image URL */}
              <div>
                <label style={labelStyle}>Image URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={manualForm.image_url}
                  onChange={(e) => setField("image_url", e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Date row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelStyle}>Start date & time</label>
                  <input
                    type="datetime-local"
                    value={manualForm.starts_at}
                    onChange={(e) => setField("starts_at", e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>End date & time</label>
                  <input
                    type="datetime-local"
                    value={manualForm.ends_at}
                    onChange={(e) => setField("ends_at", e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Location + Category row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelStyle}>Location / Venue</label>
                  <input
                    type="text"
                    placeholder="e.g. Trädgården, Stockholm"
                    value={manualForm.location}
                    onChange={(e) => setField("location", e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select
                    value={manualForm.category}
                    onChange={(e) => setField("category", e.target.value)}
                    style={{ ...inputStyle, cursor: "pointer" }}
                  >
                    <option value="culture">Culture</option>
                    <option value="music">Music</option>
                    <option value="club">Club / Electronic</option>
                    <option value="exhibition">Exhibition</option>
                    <option value="theatre">Theatre</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Spotify URL */}
              <div>
                <label style={labelStyle}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#1ed760"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                    Spotify link
                  </span>
                </label>
                <input
                  type="url"
                  placeholder="https://open.spotify.com/..."
                  value={manualForm.spotify_url}
                  onChange={(e) => setField("spotify_url", e.target.value)}
                  style={{
                    ...inputStyle,
                    borderColor: manualForm.spotify_url ? "rgba(30,215,96,0.25)" : undefined,
                    background: manualForm.spotify_url ? "rgba(30,215,96,0.05)" : inputStyle.background,
                  }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", paddingTop: "4px" }}>
                <button
                  onClick={() => { setManualOpen(false); setManualForm(EMPTY_FORM); }}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "transparent",
                    color: colors.textFaded,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualSave}
                  disabled={manualLoading || !manualForm.title.trim()}
                  style={{
                    padding: "9px 22px",
                    borderRadius: "10px",
                    border: "1px solid rgba(34,197,94,0.4)",
                    background: "rgba(34,197,94,0.12)",
                    color: colors.success,
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: manualLoading || !manualForm.title.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {manualLoading ? "Saving..." : "＋ Add to pending"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scrape Sources Manager */}
        <div style={{ marginBottom: "24px" }}>
          <button
            onClick={() => setSourcesOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "12px",
              border: `1px solid ${sourcesOpen ? "rgba(192,192,192,0.3)" : "rgba(255,255,255,0.1)"}`,
              background: sourcesOpen ? "rgba(192,192,192,0.08)" : "transparent",
              color: sourcesOpen ? colors.silverText : colors.textFaded,
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <span style={{ fontSize: "16px" }}>{sourcesOpen ? "✕" : "⚙"}</span>
            Scrape sources
            {sources.length > 0 && (
              <span style={{ fontSize: "11px", opacity: 0.6 }}>
                ({sources.filter((s) => s.enabled).length} active)
              </span>
            )}
          </button>

          {sourcesOpen && (
            <div
              style={{
                marginTop: "12px",
                borderRadius: "16px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "linear-gradient(145deg, rgba(14,12,24,0.97), rgba(20,17,34,0.98))",
                padding: "20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: colors.textFaded, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  Venues & pages to scrape
                </div>
                <button
                  onClick={() => setAddSourceOpen((o) => !o)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(34,197,94,0.3)",
                    background: "rgba(34,197,94,0.08)",
                    color: colors.success,
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {addSourceOpen ? "Cancel" : "＋ Add source"}
                </button>
              </div>

              {/* Add source form */}
              {addSourceOpen && (
                <div
                  style={{
                    marginBottom: "16px",
                    padding: "16px",
                    borderRadius: "12px",
                    border: "1px solid rgba(34,197,94,0.15)",
                    background: "rgba(34,197,94,0.03)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={labelStyle}>Venue name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Mosebacke"
                        value={sourceForm.name}
                        onChange={(e) => setSourceForm((p) => ({ ...p, name: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Scrape URL *</label>
                      <input
                        type="url"
                        placeholder="https://venue.com/events/"
                        value={sourceForm.scrape_url}
                        onChange={(e) => setSourceForm((p) => ({ ...p, scrape_url: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={labelStyle}>Location</label>
                      <input
                        type="text"
                        placeholder="Venue, Stockholm"
                        value={sourceForm.location}
                        onChange={(e) => setSourceForm((p) => ({ ...p, location: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Category</label>
                      <select
                        value={sourceForm.category}
                        onChange={(e) => setSourceForm((p) => ({ ...p, category: e.target.value }))}
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        <option value="culture">Culture</option>
                        <option value="music">Music</option>
                        <option value="club">Club</option>
                        <option value="exhibition">Exhibition</option>
                        <option value="theatre">Theatre</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Strategy</label>
                      <select
                        value={sourceForm.strategy}
                        onChange={(e) => setSourceForm((p) => ({ ...p, strategy: e.target.value }))}
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        <option value="auto">Auto (JSON-LD + CSS)</option>
                        <option value="json_ld">JSON-LD only</option>
                        <option value="css">CSS selectors only</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={labelStyle}>Link selector (optional)</label>
                      <input
                        type="text"
                        placeholder='e.g. a[href*="/events/"]'
                        value={sourceForm.link_selector}
                        onChange={(e) => setSourceForm((p) => ({ ...p, link_selector: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Image attribute (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. data-lazy-src"
                        value={sourceForm.image_attr}
                        onChange={(e) => setSourceForm((p) => ({ ...p, image_attr: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "4px" }}>
                    <button
                      onClick={handleAddSource}
                      disabled={sourceFormLoading || !sourceForm.name.trim() || !sourceForm.scrape_url.trim()}
                      style={{
                        padding: "8px 20px",
                        borderRadius: "8px",
                        border: "1px solid rgba(34,197,94,0.4)",
                        background: "rgba(34,197,94,0.12)",
                        color: colors.success,
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: sourceFormLoading || !sourceForm.name.trim() || !sourceForm.scrape_url.trim() ? "not-allowed" : "pointer",
                      }}
                    >
                      {sourceFormLoading ? "Saving..." : "Add source"}
                    </button>
                  </div>
                </div>
              )}

              {/* Sources list */}
              {sourcesLoading ? (
                <div style={{ textAlign: "center", padding: "20px", color: colors.textFaded, fontSize: "13px" }}>
                  Loading sources...
                </div>
              ) : sources.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: colors.textFaded, fontSize: "13px" }}>
                  No scrape sources configured yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {sources.map((source) => (
                    <div
                      key={source.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px 14px",
                        borderRadius: "10px",
                        background: source.enabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.01)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        opacity: source.enabled ? 1 : 0.5,
                        transition: "opacity 0.15s",
                      }}
                    >
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggleSource(source.id, !source.enabled)}
                        style={{
                          width: "36px",
                          height: "20px",
                          borderRadius: "10px",
                          border: "none",
                          background: source.enabled ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)",
                          cursor: "pointer",
                          position: "relative",
                          flexShrink: 0,
                          transition: "background 0.15s",
                        }}
                      >
                        <div
                          style={{
                            width: "14px",
                            height: "14px",
                            borderRadius: "50%",
                            background: source.enabled ? "#22c55e" : "rgba(255,255,255,0.3)",
                            position: "absolute",
                            top: "3px",
                            left: source.enabled ? "19px" : "3px",
                            transition: "left 0.15s, background 0.15s",
                          }}
                        />
                      </button>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: colors.text }}>
                            {source.name}
                          </span>
                          <span style={{ fontSize: "10px", color: colors.textFaded, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            {source.category}
                          </span>
                        </div>
                        <div style={{ fontSize: "11px", color: colors.textFaded, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {source.scrape_url}
                        </div>
                      </div>

                      {/* Stats */}
                      {source.last_event_count > 0 && (
                        <span style={{ fontSize: "11px", color: colors.textFaded, flexShrink: 0 }}>
                          {source.last_event_count} events
                        </span>
                      )}

                      {/* Strategy badge */}
                      <span style={{
                        fontSize: "10px",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: "rgba(255,255,255,0.05)",
                        color: colors.textFaded,
                        flexShrink: 0,
                      }}>
                        {source.strategy}
                      </span>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteSource(source.id)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: "1px solid rgba(239,68,68,0.2)",
                          background: "transparent",
                          color: "#ef4444",
                          fontSize: "11px",
                          cursor: "pointer",
                          flexShrink: 0,
                          opacity: 0.6,
                          transition: "opacity 0.15s",
                        }}
                        onMouseEnter={(e) => (e.target.style.opacity = 1)}
                        onMouseLeave={(e) => (e.target.style.opacity = 0.6)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            marginBottom: "24px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            paddingBottom: "1px",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px 8px 0 0",
                border: "none",
                background: "transparent",
                color:
                  activeTab === tab.key ? colors.silverText : colors.textFaded,
                fontSize: "13px",
                fontWeight: activeTab === tab.key ? 600 : 400,
                cursor: "pointer",
                borderBottom:
                  activeTab === tab.key
                    ? "2px solid rgba(192,192,192,0.6)"
                    : "2px solid transparent",
                transition: "color 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "20px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <select
            value={weekFilter}
            onChange={(e) => setWeekFilter(e.target.value)}
            style={{
              padding: "7px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: weekFilter !== "all" ? "rgba(192,192,192,0.1)" : "rgba(255,255,255,0.04)",
              color: weekFilter !== "all" ? colors.silverText : colors.textFaded,
              fontSize: "12px",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {WEEK_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: "7px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: categoryFilter !== "all" ? "rgba(192,192,192,0.1)" : "rgba(255,255,255,0.04)",
              color: categoryFilter !== "all" ? colors.silverText : colors.textFaded,
              fontSize: "12px",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {CATEGORY_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.key !== "all" && CATEGORY_EMOJI[f.key] ? `${CATEGORY_EMOJI[f.key]} ` : ""}{f.label}
              </option>
            ))}
          </select>

          {cities.length > 1 && (
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              style={{
                padding: "7px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: cityFilter !== "all" ? "rgba(192,192,192,0.1)" : "rgba(255,255,255,0.04)",
                color: cityFilter !== "all" ? colors.silverText : colors.textFaded,
                fontSize: "12px",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="all">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          {(weekFilter !== "all" || categoryFilter !== "all" || cityFilter !== "all") && (
            <button
              onClick={() => { setWeekFilter("all"); setCategoryFilter("all"); setCityFilter("all"); }}
              style={{
                padding: "7px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "transparent",
                color: colors.textFaded,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Clear filters
            </button>
          )}

          <span style={{ fontSize: "11px", color: colors.textFaded, marginLeft: "auto" }}>
            {filteredEvents.length} of {events.length} events
          </span>
        </div>

        {/* Grid */}
        {eventsLoading ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px",
              color: colors.textFaded,
            }}
          >
            Loading events...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px",
              color: colors.textFaded,
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>🌆</div>
            <div style={{ fontSize: "15px" }}>
              {events.length > 0
                ? "No events match the current filters."
                : <>No events here yet.{" "}
                    {activeTab === "pending" && (
                      <span>Hit "Fetch new events" to scrape Stockholm!</span>
                    )}
                  </>
              }
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "16px",
            }}
          >
            {filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onStatusChange={handleStatusChange}
                onSpotifyChange={handleSpotifyChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
