import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Search,
  Download,
  Upload,
  Users,
  CircleDollarSign,
  CreditCard,
  ClipboardList,
  Calendar,
  Check,
  Clock,
  FileEdit,
  Tag,
} from "lucide-react";
import { useToast } from "./Toast";
import { authenticatedFetch } from "../lib/api.js";
import { getEventUrl } from "../lib/urlUtils.js";
import { colors } from "../theme/colors.js";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { AutoTagButton, AutoTagFlashStyle } from "./crm/AutoTagButton.jsx";

function formatDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(amount, currency = "SEK") {
  if (!amount) return "0";
  const formatted = (amount / 100).toFixed(2);
  return `${formatted} ${currency.toUpperCase()}`;
}

const PAGE_SIZE = 20;

export function CrmTab({ onSegmentChange }) {
  const { showToast } = useToast();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importEventUrl, setImportEventUrl] = useState("");
  const [filters, setFilters] = useState({});
  const [total, setTotal] = useState(0);
  const [baselineTotal, setBaselineTotal] = useState(null);
  const [page, setPage] = useState(0); // zero-based page index
  const [savedViews, setSavedViews] = useState([]);
  const [activeView, setActiveView] = useState(null);
  const [events, setEvents] = useState([]);

  // CRM UI state
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const [expandedPersonId, setExpandedPersonId] = useState(null);
  const [personDetails, setPersonDetails] = useState({});
  const [showAllEventsByPerson, setShowAllEventsByPerson] = useState({});

  // Auto-tagging state — drives the per-event "watch it work" animation
  // inside the event filter dropdown. Tags persist on the events themselves
  // so they're visible after the run.
  const [taggingEventId, setTaggingEventId] = useState(null);
  const [newTagsByEventId, setNewTagsByEventId] = useState({});
  const [flashedEventIds, setFlashedEventIds] = useState({});

  // Load people with filters
  useEffect(() => {
    let cancelled = false;
    async function loadPeople() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.append("search", searchQuery);

        // Event attending filter: allow multi-select (comma-separated IDs)
        if (
          filters.attendedEventIds &&
          Array.isArray(filters.attendedEventIds) &&
          filters.attendedEventIds.length > 0
        ) {
          params.append("attendedEventIds", filters.attendedEventIds.join(","));
        }

        // Event tag filter: AI-generated tags that classify event type
        if (
          filters.attendedEventTags &&
          Array.isArray(filters.attendedEventTags) &&
          filters.attendedEventTags.length > 0
        ) {
          params.append(
            "attendedEventTags",
            filters.attendedEventTags.join(","),
          );
        }

        // Dinner filter: true = only guests who had dinner, undefined = no filter
        if (filters.hasDinner !== undefined) {
          params.append("hasDinner", filters.hasDinner.toString());
        }

        // Always route through the advanced CRM filters pipeline so we
        // get enriched eventHistory (with attendanceStatus, cocktails/dinner, etc.)
        // for consistent Pull Up scoring, even when no visible filters are set.
        params.append("eventsAttendedMin", "0");

        params.append("sortBy", "created_at");
        params.append("sortOrder", "desc");
        params.append("limit", PAGE_SIZE.toString());
        params.append("offset", (page * PAGE_SIZE).toString());

        const res = await authenticatedFetch(`/host/crm/people?${params}`);
        if (cancelled) return;
        if (!res.ok) throw new Error("Failed to load people");
        const data = await res.json();
        if (cancelled) return;
        console.log(
          `[CRM] Received ${data.people?.length || 0} people for page ${
            page + 1
          } (total: ${data.total || 0})`,
        );
        const nextTotal = data.total || 0;
        setPeople(data.people || []);
        setTotal(nextTotal);

        // Capture the unfiltered baseline when there are no search/filters
        if (
          (baselineTotal === null || baselineTotal === 0) &&
          !searchQuery &&
          Object.keys(filters).length === 0
        ) {
          setBaselineTotal(nextTotal);
        }
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        showToast("Failed to load contacts", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadPeople();
    return () => { cancelled = true; };
  }, [searchQuery, filters, page, showToast, events, baselineTotal]);

  // Push current segment selection up to the parent (CrmPage). Runs whenever
  // search, filters, or total change so the Email tab + Send button stay in sync.
  useEffect(() => {
    if (!onSegmentChange) return;
    const filterCriteria = {
      search: searchQuery || undefined,
      attendedEventIds:
        filters.attendedEventIds && filters.attendedEventIds.length > 0
          ? filters.attendedEventIds
          : undefined,
      attendedEventTags:
        filters.attendedEventTags && filters.attendedEventTags.length > 0
          ? filters.attendedEventTags
          : undefined,
      hasDinner: filters.hasDinner !== undefined ? filters.hasDinner : undefined,
      eventsAttendedMin: 0,
    };
    onSegmentChange({ filterCriteria, total });
  }, [searchQuery, filters, total, onSegmentChange]);

  // Load detailed touchpoints (campaign history etc.) for a single person
  async function loadPersonDetails(personId) {
    // Avoid refetch if we already have data or currently loading
    setPersonDetails((prev) => {
      const current = prev[personId] || {};
      if (current.loading) return prev;
      return {
        ...prev,
        [personId]: { ...current, loading: true, error: null },
      };
    });

    try {
      const res = await authenticatedFetch(`/host/crm/people/${personId}`);
      if (!res.ok) {
        throw new Error("Failed to load person details");
      }
      const data = await res.json();
      const emails = data.touchpoints?.emails || [];

      // Compute simple campaign stats
      const campaignIds = new Set();
      let lastCampaignAt = null;
      let openCount = 0;
      let clickCount = 0;
      let bounceCount = 0;

      emails.forEach((email) => {
        if (email.campaignId) {
          campaignIds.add(email.campaignId);
        }

        const ts = email.sentAt || email.deliveredAt || email.createdAt;
        if (
          ts &&
          (!lastCampaignAt || new Date(ts) > new Date(lastCampaignAt))
        ) {
          lastCampaignAt = ts;
        }

        if (email.openedAt) openCount += 1;
        if (email.clickedAt) clickCount += 1;

        const status = (email.status || "").toLowerCase();
        if (
          status.includes("bounce") ||
          status.includes("failed") ||
          status.includes("error")
        ) {
          bounceCount += 1;
        }
      });

      const recentEmails = emails.slice(0, 5);

      setPersonDetails((prev) => ({
        ...prev,
        [personId]: {
          ...prev[personId],
          loading: false,
          error: null,
          campaignsSent: campaignIds.size,
          lastCampaignAt,
          recentEmails,
          openCount,
          clickCount,
          bounceCount,
        },
      }));
    } catch (error) {
      console.error("Failed to load person details:", error);
      setPersonDetails((prev) => ({
        ...prev,
        [personId]: {
          ...prev[personId],
          loading: false,
          error: error.message || "Failed to load details",
        },
      }));
    }
  }

  // Load saved views
  useEffect(() => {
    async function loadViews() {
      try {
        const res = await authenticatedFetch("/host/crm/views");
        if (res.ok) {
          const data = await res.json();
          setSavedViews(data.views || []);
        }
      } catch (err) {
        console.error("Failed to load views:", err);
      }
    }
    loadViews();
  }, []);

  // Load user's events for filter dropdown
  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await authenticatedFetch("/events");
        if (res.ok) {
          const data = await res.json();
          setEvents(data || []);
          console.log(
            "[CRM] Loaded events for filter:",
            (data || []).map((e) => ({ id: e.id, title: e.title })),
          );
        }
      } catch (err) {
        console.error("Failed to load events:", err);
      }
    }
    loadEvents();
  }, []);

  // Apply saved view
  useEffect(() => {
    if (activeView) {
      setFilters(activeView.filters || {});
      setPage(0); // Reset to first page when view changes
    }
  }, [activeView]);

  // Flatten the host's event admin_tags into a frequency-sorted vocabulary —
  // drives the tag filter chip cloud below the event dropdown.
  const tagVocabulary = useMemo(() => {
    const counts = {};
    for (const ev of events) {
      for (const t of ev.adminTags || []) {
        if (typeof t !== "string") continue;
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [events]);

  // Patch local events state when AI returns new tags for one of them.
  function handleEventTagged({ eventId, adminTags, generatedTags }) {
    setEvents((prev) =>
      prev.map((ev) => (ev.id === eventId ? { ...ev, adminTags } : ev)),
    );
    setNewTagsByEventId((prev) => ({ ...prev, [eventId]: new Set(generatedTags || []) }));
    setFlashedEventIds((prev) => ({ ...prev, [eventId]: Date.now() }));
    setTaggingEventId(null);
    setTimeout(() => {
      setNewTagsByEventId((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
    }, 2500);
  }

  function handleAutoTagStart(eventId) {
    setTaggingEventId(eventId);
    // Pop the dropdown open so the host can actually see the rows updating.
    setShowEventDropdown(true);
  }

  const handleImportCsv = async () => {
    if (!importFile) {
      showToast("Please select a CSV file", "error");
      return;
    }

    setImporting(true);
    try {
      const fileText = await importFile.text();

      // Extract event ID from URL if provided
      let eventId = null;
      if (importEventUrl.trim()) {
        const url = importEventUrl.trim();

        // Check if it's a UUID (direct event ID)
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(url)) {
          eventId = url;
        } else {
          // Try to extract slug from URL (e.g., /e/slug or /events/slug)
          const slugMatch = url.match(/\/(?:e|events)\/([^\/?]+)/);
          if (slugMatch) {
            const slug = slugMatch[1];
            // Fetch event by slug to get ID
            try {
              const eventRes = await authenticatedFetch(`/host/events/${slug}`);
              if (eventRes.ok) {
                const event = await eventRes.json();
                eventId = event.id;
              } else {
                throw new Error("Event not found. Please check the URL.");
              }
            } catch (err) {
              throw new Error(
                "Could not find event. Please check the URL or use the event ID directly.",
              );
            }
          } else {
            throw new Error(
              "Invalid event URL. Please use format: https://pullup.se/e/event-slug or paste the event ID directly.",
            );
          }
        }
      }

      const res = await authenticatedFetch("/host/crm/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: fileText,
          eventId: eventId,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Import failed");
      }

      const result = await res.json();
      const rsvpMessage =
        result.summary.rsvpsCreated > 0
          ? `, ${result.summary.rsvpsCreated} RSVP${
              result.summary.rsvpsCreated !== 1 ? "s" : ""
            } created`
          : "";
      showToast(
        `Import complete: ${result.summary.created} created, ${result.summary.updated} updated${rsvpMessage}`,
        "success",
      );

      // Reload people
      setPage(0); // Reset to first page after import
      setImportFile(null);
      setImportEventUrl("");
      setShowImportModal(false);
    } catch (error) {
      console.error("Import error:", error);
      showToast(error.message || "Failed to import CSV", "error");
    } finally {
      setImporting(false);
    }
  };

  const handleSaveView = async () => {
    const viewName = prompt("Enter a name for this view:");
    if (!viewName) return;

    try {
      const res = await authenticatedFetch("/host/crm/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: viewName,
          filters,
          sortBy: "created_at",
          sortOrder: "desc",
        }),
      });

      if (res.ok) {
        const newView = await res.json();
        setSavedViews([...savedViews, newView]);
        setActiveView(newView);
        showToast("View saved successfully", "success");
      }
    } catch (error) {
      showToast("Failed to save view", "error");
    }
  };

  if (loading && people.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "60px 24px",
          opacity: 0.6,
        }}
      >
        <div
          style={{
            marginBottom: "16px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <SilverIcon
            as={Loader2}
            size={48}
            style={{ animation: "crm-spin 1s linear infinite" }}
          />
        </div>
        <div style={{ fontSize: "18px", fontWeight: 600 }}>
          Loading contacts...
        </div>
      </div>
    );
  }

  const hasNextPage = (page + 1) * PAGE_SIZE < total;
  const hasPrevPage = page > 0;

  return (
    <div>
      <style>{`
        @keyframes crm-spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 767px) {
          .export-csv-button, .import-csv-button {
            display: none !important;
          }
        }
      `}</style>

      {/* Header with Search, Actions, and Saved Views */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {/* Segment container */}
        <div
          style={{
            marginTop: "8px",
            padding: "16px 18px 14px",
            background: "rgba(20, 16, 30, 0.7)",
            borderRadius: "16px",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            boxShadow:
              "0 0 0 1px rgba(34,197,94,0.12), 0 14px 40px rgba(0,0,0,0.55)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {/* Segment heading + recipient count */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#22c55e",
                  display: "inline-block",
                  boxShadow: "0 0 6px rgba(34,197,94,0.5)",
                }} />
                Email audience
              </div>
              <div
                style={{
                  fontSize: "12px",
                  opacity: 0.5,
                  paddingLeft: "16px",
                }}
              >
                Filter contacts below to define who receives your next email
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <AutoTagButton
                events={events}
                endpoint={(id) => `/events/${id}/auto-tag`}
                onEventStart={handleAutoTagStart}
                onEventTagged={handleEventTagged}
                label="Auto-tag events"
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "6px",
                  background: "rgba(34, 197, 94, 0.08)",
                  border: "1px solid rgba(34, 197, 94, 0.2)",
                  borderRadius: "999px",
                  padding: "5px 14px",
                }}
              >
                <span style={{ fontSize: "18px", fontWeight: 700, color: "#4ade80" }}>
                  {total.toLocaleString()}
                </span>
                <span style={{ fontSize: "12px", opacity: 0.6 }}>
                  {total === 1 ? "recipient" : "recipients"}
                </span>
              </div>
            </div>
          </div>
          {AutoTagFlashStyle}

          {/* Divider */}
          <div style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />
          {/* Filters + CTA row */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "16px",
              alignItems: "center",
            }}
          >
            {/* Event attending multi-select dropdown */}
            <div
              style={{
                minWidth: "220px",
                flex: "1 1 220px",
                position: "relative",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  opacity: 0.5,
                  marginBottom: "4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Filter by event
              </label>
              <button
                type="button"
                onClick={() => setShowEventDropdown((open) => !open)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(12, 10, 18, 0.8)",
                  color: "#fff",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
              >
                <span style={{ opacity: 0.85 }}>
                  {filters.attendedEventIds &&
                  Array.isArray(filters.attendedEventIds) &&
                  filters.attendedEventIds.length > 0
                    ? `${filters.attendedEventIds.length} event${
                        filters.attendedEventIds.length > 1 ? "s" : ""
                      } selected`
                    : "All events"}
                </span>
                <span
                  style={{
                    marginLeft: "8px",
                    fontSize: "10px",
                    opacity: 0.7,
                  }}
                >
                  ▼
                </span>
              </button>
              {showEventDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: 6,
                    zIndex: 10,
                    background: "rgba(12, 10, 18, 0.98)",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    padding: "8px",
                    maxHeight: "220px",
                    overflowY: "auto",
                    minWidth: "100%",
                    boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                  }}
                >
                  {events.map((event) => {
                    const selectedIds = filters.attendedEventIds || [];
                    const checked = selectedIds.includes(event.id);
                    const isTagging = taggingEventId === event.id;
                    const flashKey = flashedEventIds[event.id];
                    const newTagSet = newTagsByEventId[event.id] || new Set();
                    const eventTags = event.adminTags || [];
                    return (
                      <label
                        key={event.id}
                        className={flashKey ? "autotag-flash" : undefined}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          padding: "8px 6px",
                          fontSize: "13px",
                          cursor: "pointer",
                          borderRadius: 6,
                          border: isTagging
                            ? "1px solid rgba(251,191,36,0.5)"
                            : "1px solid transparent",
                          transition: "border-color 0.25s",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const current = filters.attendedEventIds || [];
                              let next;
                              if (e.target.checked) {
                                next = [...current, event.id];
                              } else {
                                next = current.filter((id) => id !== event.id);
                              }
                              setFilters((prev) => ({
                                ...prev,
                                attendedEventIds: next.length ? next : undefined,
                              }));
                              setPage(0);
                            }}
                            style={{ margin: 0 }}
                          />
                          <span style={{ opacity: 0.9, flex: 1, minWidth: 0 }}>{event.title}</span>
                        </div>
                        {(eventTags.length > 0 || isTagging) && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingLeft: 24 }}>
                            {isTagging && eventTags.length === 0 && (
                              <span style={{ fontSize: 10, color: "rgba(251,191,36,0.85)", fontStyle: "italic" }}>
                                Generating tags…
                              </span>
                            )}
                            {eventTags.map((tag) => {
                              const isNew = newTagSet.has(tag);
                              return (
                                <span
                                  key={tag}
                                  className={isNew ? "autotag-tag-new" : undefined}
                                  style={{
                                    padding: "1px 7px",
                                    borderRadius: 999,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    background: isNew ? "rgba(251,191,36,0.22)" : "rgba(251,191,36,0.10)",
                                    color: isNew ? "#fde68a" : "rgba(251,191,36,0.85)",
                                    border: isNew
                                      ? "1px solid rgba(251,191,36,0.55)"
                                      : "1px solid rgba(251,191,36,0.18)",
                                    boxShadow: isNew ? "0 0 6px rgba(251,191,36,0.35)" : "none",
                                  }}
                                >
                                  {tag}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </label>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setFilters((prev) => ({
                        ...prev,
                        attendedEventIds: undefined,
                      }));
                      setPage(0);
                    }}
                    style={{
                      marginTop: "6px",
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "none",
                      background: "rgba(255,255,255,0.06)",
                      color: "#fff",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </div>

            {/* Dinner filter: Yes / No (dinners only) */}
            <div style={{ minWidth: "180px", flex: "0 0 auto" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  opacity: 0.5,
                  marginBottom: "4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Dinner guests only
              </label>
              <div
                style={{
                  display: "inline-flex",
                  borderRadius: "999px",
                  padding: "3px",
                  background: "rgba(12, 10, 18, 0.8)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  gap: "4px",
                }}
              >
                {[
                  { key: "no", label: "No" },
                  { key: "yes", label: "Yes" },
                ].map((option) => {
                  const isActive =
                    (option.key === "yes" && filters.hasDinner === true) ||
                    (option.key === "no" && filters.hasDinner !== true);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setFilters((prev) => ({
                          ...prev,
                          hasDinner: option.key === "yes" ? true : undefined,
                        }));
                        setPage(0);
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        border: "none",
                        background: isActive
                          ? "rgba(34, 197, 94, 0.2)"
                          : "transparent",
                        color: isActive ? "#4ade80" : "#fff",
                        fontSize: "11px",
                        fontWeight: 500,
                        cursor: "pointer",
                        minWidth: 40,
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>{" "}
          {/* End filters row */}

          {/* Filter by event-tag (admin_tags). Multi-select; OR semantics —
              any selected tag matches. Driven by the host's own event tag
              vocabulary so the chips reflect their actual events. */}
          {tagVocabulary.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                alignItems: "center",
                paddingTop: 2,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.45)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginRight: 4,
                }}
              >
                <Tag size={10} style={{ color: "rgba(251,191,36,0.7)" }} />
                Event tags:
              </span>
              {tagVocabulary.map(({ tag, count }) => {
                const selected = (filters.attendedEventTags || []).includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      const current = filters.attendedEventTags || [];
                      const next = selected
                        ? current.filter((t) => t !== tag)
                        : [...current, tag];
                      setFilters((prev) => ({
                        ...prev,
                        attendedEventTags: next.length ? next : undefined,
                      }));
                      setPage(0);
                    }}
                    style={{
                      padding: "3px 9px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: selected
                        ? "1px solid rgba(251,191,36,0.6)"
                        : "1px solid rgba(255,255,255,0.1)",
                      background: selected ? "rgba(251,191,36,0.22)" : "rgba(255,255,255,0.03)",
                      color: selected ? "#fde68a" : "rgba(255,255,255,0.75)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {tag}
                    <span style={{ opacity: 0.5, fontSize: 10, fontWeight: 500 }}>{count}</span>
                  </button>
                );
              })}
              {(filters.attendedEventTags || []).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, attendedEventTags: undefined }));
                    setPage(0);
                  }}
                  style={{
                    padding: "3px 9px",
                    borderRadius: 999,
                    fontSize: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "transparent",
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Saved Views Tabs */}
        {savedViews.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                opacity: 0.7,
                marginRight: "8px",
              }}
            >
              Saved audiences:
            </span>
            {savedViews.map((view) => (
              <button
                key={view.id}
                onClick={() => setActiveView(view)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border:
                    activeView?.id === view.id
                      ? `1px solid ${colors.silverRgba}`
                      : "1px solid rgba(255,255,255,0.1)",
                  background:
                    activeView?.id === view.id
                      ? colors.silverRgbaHover
                      : "rgba(20, 16, 30, 0.4)",
                  color: "#fff",
                  fontSize: "12px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {view.name}
              </button>
            ))}
            <button
              onClick={handleSaveView}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: `1px solid ${colors.silverRgba}`,
                background: colors.silverRgbaHover,
                color: colors.silverText,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              + Save View
            </button>
          </div>
        )}
      </div>

      {/* CSV Import Modal */}
      {showImportModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => !importing && setShowImportModal(false)}
        >
          <div
            style={{
              background: "rgba(12, 10, 18, 0.95)",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "500px",
              width: "100%",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 600,
                marginBottom: "16px",
              }}
            >
              Import CSV
            </h2>
            <p
              style={{
                fontSize: "14px",
                opacity: 0.7,
                marginBottom: "20px",
              }}
            >
              Select a CSV file to import contacts. The file should have
              columns: Email, Name, and optionally Stripe customer data.
            </p>

            <input
              type="file"
              accept=".csv"
              onChange={(e) => setImportFile(e.target.files[0])}
              disabled={importing}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(20, 16, 30, 0.6)",
                color: "#fff",
                marginBottom: "16px",
                cursor: "pointer",
              }}
            />

            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  opacity: 0.7,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Link to Event (Optional)
              </label>
              <input
                type="text"
                value={importEventUrl}
                onChange={(e) => setImportEventUrl(e.target.value)}
                placeholder="Event URL (e.g., https://pullup.se/e/event-slug) or Event ID"
                disabled={importing}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(20, 16, 30, 0.6)",
                  color: "#fff",
                  fontSize: "14px",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = colors.silverRgbaStrong;
                  e.target.style.background = "rgba(20, 16, 30, 0.8)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(255,255,255,0.1)";
                  e.target.style.background = "rgba(20, 16, 30, 0.6)";
                }}
              />
              <p
                style={{
                  fontSize: "11px",
                  opacity: 0.6,
                  marginTop: "6px",
                  marginBottom: 0,
                }}
              >
                Paste the event URL or event ID to automatically create RSVPs
                for all imported contacts
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setImportEventUrl("");
                }}
                disabled={importing}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(20, 16, 30, 0.6)",
                  color: "#fff",
                  fontSize: "14px",
                  cursor: importing ? "not-allowed" : "pointer",
                  opacity: importing ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleImportCsv}
                disabled={!importFile || importing}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background:
                    !importFile || importing
                      ? colors.silverRgba
                      : colors.gradientPrimary,
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: !importFile || importing ? "not-allowed" : "pointer",
                  opacity: importing ? 0.7 : 1,
                }}
              >
                {importing ? "Importing..." : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Top Row: Search and Actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "24px",
        }}
      >
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(0); // Reset to first page on search
          }}
          style={{
            padding: "8px 16px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(20, 16, 30, 0.6)",
            color: "#fff",
            fontSize: "14px",
            outline: "none",
            flex: "1 1 auto",
            minWidth: "200px",
            maxWidth: "400px",
            transition: "all 0.2s ease",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = colors.silverRgbaStrong;
            e.target.style.background = "rgba(20, 16, 30, 0.8)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "rgba(255,255,255,0.1)";
            e.target.style.background = "rgba(20, 16, 30, 0.6)";
          }}
        />

        <button
          style={{
            padding: "8px",
            borderRadius: "999px",
            border: `1px solid ${colors.silverRgba}`,
            background: colors.silverRgbaHover,
            color: colors.silverText,
            cursor: "default",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SilverIcon as={Search} size={16} />
        </button>

        {/* <button
            onClick={() => setShowImportModal(true)}
            className="import-csv-button"
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              background: "rgba(34, 197, 94, 0.1)",
              color: "#4ade80",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <SilverIcon as={Download} size={16} />
            Import CSV
          </button> */}

        <button
          onClick={async () => {
            try {
              // Build the same filter query used for the list, but without
              // pagination, so the export matches the current filtered view.
              const params = new URLSearchParams();
              if (searchQuery) params.append("search", searchQuery);
              if (
                filters.attendedEventIds &&
                Array.isArray(filters.attendedEventIds) &&
                filters.attendedEventIds.length > 0
              ) {
                params.append(
                  "attendedEventIds",
                  filters.attendedEventIds.join(","),
                );
              }
              if (
                filters.attendedEventTags &&
                Array.isArray(filters.attendedEventTags) &&
                filters.attendedEventTags.length > 0
              ) {
                params.append(
                  "attendedEventTags",
                  filters.attendedEventTags.join(","),
                );
              }
              if (filters.hasDinner !== undefined) {
                params.append("hasDinner", filters.hasDinner.toString());
              }

              const queryString =
                params.toString().length > 0 ? `?${params.toString()}` : "";

              const res = await authenticatedFetch(
                `/host/crm/people/export${queryString}`,
              );
              if (!res.ok) throw new Error("Export failed");
              const blob = await res.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `crm-contacts-${
                new Date().toISOString().split("T")[0]
              }.csv`;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
              showToast(
                "Exported current filtered view to CSV successfully",
                "success",
              );
            } catch (err) {
              console.error(err);
              showToast("Failed to export CSV", "error");
            }
          }}
          className="export-csv-button"
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: `1px solid ${colors.silverRgba}`,
            background: colors.silverRgbaHover,
            color: colors.silverText,
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <SilverIcon as={Upload} size={16} />
          Export filtered CSV
        </button>
      </div>

      {/* People List */}
      {people.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 24px",
            opacity: 0.6,
          }}
        >
          <div
            style={{
              marginBottom: "16px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <SilverIcon as={Users} size={48} />
          </div>
          <div
            style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}
          >
            {searchQuery || Object.keys(filters).length > 0
              ? "No contacts found"
              : "No contacts yet"}
          </div>
          <div style={{ fontSize: "14px", opacity: 0.7 }}>
            {searchQuery || Object.keys(filters).length > 0
              ? "Try adjusting your search or filters"
              : "Import a CSV file or wait for people to RSVP to your events"}
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {people.map((person) => {
              const metrics = computePersonMetrics(person);
              const isExpanded = expandedPersonId === person.id;
              const details = personDetails[person.id] || {};

              return (
                <div
                  key={person.id}
                  style={{
                    padding: "18px 20px",
                    background: "rgba(20, 16, 30, 0.6)",
                    borderRadius: "16px",
                    border: "1px solid rgba(255,255,255,0.05)",
                    transition: "all 0.3s ease",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.borderColor = colors.silverRgba;
                    e.currentTarget.style.boxShadow =
                      "0 10px 30px rgba(0,0,0,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.borderColor =
                      "rgba(255,255,255,0.05)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  onClick={() => {
                    setExpandedPersonId((prev) =>
                      prev === person.id ? null : person.id,
                    );
                    if (!personDetails[person.id]) {
                      void loadPersonDetails(person.id);
                    }
                  }}
                >
                  {/* Collapsed header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "16px",
                      flexWrap: "wrap",
                    }}
                  >
                    {/* Identity + last seen */}
                    <div style={{ flex: 1, minWidth: "180px" }}>
                      <div
                        style={{
                          fontSize: "16px",
                          fontWeight: 600,
                          marginBottom: "4px",
                          color: "#fff",
                        }}
                      >
                        {person.name || "Unnamed contact"}
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          opacity: 0.7,
                          marginBottom: "4px",
                          wordBreak: "break-word",
                        }}
                      >
                        {person.email}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "11px",
                          opacity: 0.65,
                        }}
                      >
                        <SilverIcon as={Clock} size={12} />
                        <span>
                          Last seen ·{" "}
                          {metrics.lastAttendedAt
                            ? formatDate(metrics.lastAttendedAt)
                            : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Golden Pull Up score */}
                    {metrics.pullUpScore !== null && (
                      <div
                        style={{
                          flex: "0 0 auto",
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: "999px",
                            border: "1px solid rgba(255, 215, 0, 0.35)",
                            background:
                              "radial-gradient(circle at 30% 0%, rgba(255,255,255,0.12), rgba(12,10,18,0.95))",
                            boxShadow:
                              "0 0 0 1px rgba(0,0,0,0.6), 0 10px 25px rgba(0,0,0,0.75)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "4px 6px",
                            transform: "translateY(0)",
                          }}
                        >
                          <div
                            style={{
                              background:
                                "linear-gradient(90deg, #FFD700 0%, #FFB200 40%, #FFF7AA 100%)",
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                              fontWeight: 800,
                              letterSpacing: "0.01em",
                              textShadow: "0 2px 8px rgba(255, 215, 0, 0.28)",
                              fontSize: "18px",
                              lineHeight: 1,
                            }}
                          >
                            {metrics.pullUpScore}
                          </div>
                          <div
                            style={{
                              fontSize: "10px",
                              textTransform: "uppercase",
                              letterSpacing: "0.14em",
                              opacity: 0.8,
                              marginTop: "2px",
                              color: "rgba(255,255,255,0.85)",
                            }}
                          >
                            Pull Up
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: "14px",
                        paddingTop: "14px",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                      }}
                    >
                      {/* All-time stats */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(160px, 1fr))",
                          gap: "10px",
                          fontSize: "13px",
                        }}
                      >
                        <div>
                          <div style={{ opacity: 0.7, marginBottom: "2px" }}>
                            Events
                          </div>
                          <div>
                            {metrics.eventsAttended} attended /{" "}
                            {metrics.eventsBooked} booked
                          </div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.7, marginBottom: "2px" }}>
                            Guests
                          </div>
                          <div>
                            {metrics.guestsAttended} showed /{" "}
                            {metrics.guestsBooked} expected
                          </div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.7, marginBottom: "2px" }}>
                            Dinners
                          </div>
                          <div>
                            {metrics.dinnersAttendedEvents} attended /{" "}
                            {metrics.dinnersBookedEvents} booked
                          </div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.7, marginBottom: "2px" }}>
                            Dinner guests
                          </div>
                          <div>
                            {metrics.dinnerGuestsAttended} showed /{" "}
                            {metrics.dinnerGuestsBooked} booked
                          </div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.7, marginBottom: "2px" }}>
                            Spend
                          </div>
                          <div>
                            {person.totalSpend > 0
                              ? formatCurrency(person.totalSpend)
                              : "—"}
                            {metrics.avgTicket && (
                              <span style={{ opacity: 0.7 }}>
                                {" "}
                                · Avg {formatCurrency(metrics.avgTicket)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.7, marginBottom: "2px" }}>
                            Activity
                          </div>
                          <div>
                            {metrics.eventsLast12Months} events last 12 months
                          </div>
                        </div>
                      </div>

                      {/* Campaign history (from detailed touchpoints) */}
                      <div
                        style={{
                          fontSize: "12px",
                          opacity: 0.8,
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "8px",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              textTransform: "uppercase",
                              letterSpacing: "0.12em",
                              opacity: 0.7,
                            }}
                          >
                            Campaign history
                          </span>
                          {details.loading ? (
                            <span>Loading…</span>
                          ) : details.error ? (
                            <span style={{ color: "#f97373" }}>
                              {details.error}
                            </span>
                          ) : (
                            <>
                              <span>
                                {details.campaignsSent || 0} campaigns sent
                              </span>
                              <span style={{ opacity: 0.7 }}>
                                · Last{" "}
                                {details.lastCampaignAt
                                  ? formatDate(details.lastCampaignAt)
                                  : "—"}
                              </span>
                              <span style={{ opacity: 0.7 }}>
                                · Opens {details.openCount || 0} · Clicks{" "}
                                {details.clickCount || 0} · Bounces{" "}
                                {details.bounceCount || 0}
                              </span>
                            </>
                          )}
                        </div>

                        {!details.loading &&
                          !details.error &&
                          details.recentEmails &&
                          details.recentEmails.length > 0 && (
                            <div
                              style={{
                                marginTop: "4px",
                                paddingLeft: "2px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                              }}
                            >
                              {details.recentEmails.map((email) => (
                                <div
                                  key={email.id}
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px",
                                    fontSize: "11px",
                                    opacity: 0.85,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      gap: "8px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        maxWidth: "70%",
                                      }}
                                    >
                                      <span style={{ fontWeight: 500 }}>
                                        {email.campaignName}
                                      </span>
                                      {email.subject && (
                                        <span style={{ opacity: 0.8 }}>
                                          {" "}
                                          · {email.subject}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ opacity: 0.7 }}>
                                      {email.sentAt
                                        ? formatDate(email.sentAt)
                                        : "—"}
                                    </div>
                                  </div>
                                  <div style={{ opacity: 0.7 }}>
                                    {(() => {
                                      const statusStr = (email.status || "")
                                        .toLowerCase();
                                      let statusLabel = "Sent";
                                      if (email.clickedAt) statusLabel = "Clicked";
                                      else if (email.openedAt)
                                        statusLabel = "Opened";
                                      else if (email.deliveredAt)
                                        statusLabel = "Delivered";
                                      else if (
                                        statusStr.includes("bounce") ||
                                        statusStr.includes("failed") ||
                                        statusStr.includes("error")
                                      ) {
                                        statusLabel = "Bounced / failed";
                                      }

                                      const opens = email.openedAt ? 1 : 0;
                                      const clicks = email.clickedAt ? 1 : 0;
                                      const bounces =
                                        statusStr.includes("bounce") ||
                                        statusStr.includes("failed") ||
                                        statusStr.includes("error")
                                          ? 1
                                          : 0;

                                      return `${statusLabel} · Opens ${opens} · Clicks ${clicks} · Bounces ${bounces}`;
                                    })()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>

                      {/* Event history preview */}
                      <div>
                        {(() => {
                          const history = person.eventHistory || [];
                          if (history.length === 0) {
                            return (
                              <>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.1em",
                                    opacity: 0.7,
                                    marginBottom: "8px",
                                  }}
                                >
                                  Event history
                                </div>
                                <div
                                  style={{
                                    fontSize: "13px",
                                    opacity: 0.5,
                                    fontStyle: "italic",
                                  }}
                                >
                                  No events yet
                                </div>
                              </>
                            );
                          }

                          const now = new Date();
                          const upcoming = [];
                          const past = [];

                          history.forEach((h) => {
                            const eventDate = h.eventDate
                              ? new Date(h.eventDate)
                              : null;
                            const status = h.attendanceStatus || h.status;
                            const isAttendingFuture =
                              eventDate &&
                              eventDate >= now &&
                              (status === "attended" ||
                                status === "CONFIRMED" ||
                                status === "attending" ||
                                status === "confirmed");

                            if (isAttendingFuture) {
                              upcoming.push(h);
                            } else {
                              past.push(h);
                            }
                          });

                          // Sort upcoming by soonest first
                          upcoming.sort((a, b) => {
                            const da = a.eventDate ? new Date(a.eventDate) : 0;
                            const db = b.eventDate ? new Date(b.eventDate) : 0;
                            return da - db;
                          });

                          const showAllEvents =
                            !!showAllEventsByPerson[person.id];
                          const visiblePast = showAllEvents
                            ? past
                            : past.slice(0, 3);
                          const hasMorePast = past.length > 3;

                          const renderEventRow = (item) => {
                            const status = item.attendanceStatus || item.status;
                            const isAttended =
                              status === "attended" ||
                              status === "CONFIRMED" ||
                              status === "attending";
                            const isConfirmed =
                              !isAttended &&
                              (status === "confirmed" ||
                                status === "CONFIRMED");

                            return (
                              <div
                                key={item.rsvpId}
                                style={{
                                  padding: "12px",
                                  background: "rgba(12, 10, 18, 0.4)",
                                  borderRadius: "8px",
                                  fontSize: "13px",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      opacity: 0.8,
                                    }}
                                  >
                                    {isAttended ? (
                                      <SilverIcon as={Check} size={16} />
                                    ) : isConfirmed ? (
                                      <SilverIcon as={FileEdit} size={16} />
                                    ) : (
                                      <SilverIcon as={Clock} size={16} />
                                    )}
                                  </span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                      style={{
                                        fontWeight: 600,
                                        marginBottom: "4px",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {item.eventTitle}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        opacity: 0.6,
                                        marginBottom: "4px",
                                      }}
                                    >
                                      {formatEventDate(item.eventDate)}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        opacity: 0.75,
                                      }}
                                    >
                                      Party{" "}
                                      {(item.cocktailsBooked || 0) +
                                        (item.dinnerBooked || 0)}{" "}
                                      booked ·{" "}
                                      {(item.cocktailsAttended || 0) +
                                        (item.dinnerAttended || 0)}{" "}
                                      attended
                                    </div>
                                    {item.dinnerBooked > 0 && (
                                      <div
                                        style={{
                                          fontSize: "11px",
                                          opacity: 0.75,
                                          marginTop: "2px",
                                        }}
                                      >
                                        Dinner {item.dinnerAttended || 0} /{" "}
                                        {item.dinnerBooked}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          };

                          return (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px",
                              }}
                            >
                              {upcoming.length > 0 && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.1em",
                                      opacity: 0.7,
                                      marginBottom: "4px",
                                    }}
                                  >
                                    Upcoming events
                                  </div>
                                  {upcoming.map((item) => renderEventRow(item))}
                                </div>
                              )}

                              {past.length > 0 && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.1em",
                                      opacity: 0.7,
                                      marginBottom: "4px",
                                    }}
                                  >
                                    Event history
                                  </div>
                                  {visiblePast.map((item) =>
                                    renderEventRow(item),
                                  )}
                                  {hasMorePast && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowAllEventsByPerson((prev) => ({
                                          ...prev,
                                          [person.id]: !showAllEvents,
                                        }));
                                      }}
                                      style={{
                                        alignSelf: "flex-start",
                                        marginTop: "2px",
                                        fontSize: "12px",
                                        color: colors.silverText,
                                        background: "transparent",
                                        border: "none",
                                        padding: 0,
                                        cursor: "pointer",
                                        opacity: 0.75,
                                      }}
                                    >
                                      {showAllEvents
                                        ? "Show fewer events"
                                        : "Show more events"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Footer: First seen */}
                      <div
                        style={{
                          paddingTop: "8px",
                          borderTop: "1px solid rgba(255,255,255,0.05)",
                          fontSize: "12px",
                          opacity: 0.5,
                        }}
                      >
                        First seen: {formatDate(person.createdAt)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <button
                onClick={() =>
                  hasPrevPage && setPage((p) => Math.max(0, p - 1))
                }
                disabled={!hasPrevPage || loading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: `1px solid ${colors.silverRgba}`,
                  background: hasPrevPage
                    ? colors.silverRgbaHover
                    : "rgba(255, 255, 255, 0.05)",
                  color: hasPrevPage
                    ? colors.silverText
                    : "rgba(255, 255, 255, 0.4)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: !hasPrevPage || loading ? "not-allowed" : "pointer",
                  opacity: !hasPrevPage || loading ? 0.6 : 1,
                }}
              >
                Previous
              </button>
              <span
                style={{
                  fontSize: "13px",
                  opacity: 0.7,
                }}
              >
                Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
              </span>
              <button
                onClick={() => hasNextPage && setPage((p) => p + 1)}
                disabled={!hasNextPage || loading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: `1px solid ${colors.silverRgba}`,
                  background: hasNextPage
                    ? colors.silverRgbaHover
                    : "rgba(255, 255, 255, 0.05)",
                  color: hasNextPage
                    ? colors.silverText
                    : "rgba(255, 255, 255, 0.4)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: !hasNextPage || loading ? "not-allowed" : "pointer",
                  opacity: !hasNextPage || loading ? 0.6 : 1,
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatBadge({ label, value, icon, color = "#c0c0c0" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        borderRadius: "8px",
        background: `${color}15`,
        border: `1px solid ${color}30`,
        fontSize: "12px",
      }}
    >
      <span>{icon}</span>
      <span style={{ fontWeight: 600, opacity: 0.9 }}>{value}</span>
      <span style={{ opacity: 0.7, fontSize: "11px" }}>{label}</span>
    </div>
  );
}

// Derive all-time stats + Pull Up score for a person
function computePersonMetrics(person) {
  const history = person.eventHistory || [];

  const eventsBooked = history.length;
  const eventsAttended = history.filter((h) => {
    const status = h.attendanceStatus || h.status;
    return (
      status === "attended" || status === "CONFIRMED" || status === "attending"
    );
  }).length;

  let guestsBooked = 0;
  let guestsAttended = 0;
  let dinnersBookedEvents = 0;
  let dinnersAttendedEvents = 0;
  let dinnerGuestsBooked = 0;
  let dinnerGuestsAttended = 0;
  let lastAttendedAt = null;
  let eventsLast12Months = 0;

  const now = new Date();
  const twelveMonthsAgo = new Date(
    now.getFullYear() - 1,
    now.getMonth(),
    now.getDate(),
  );

  history.forEach((h) => {
    const date = h.eventDate ? new Date(h.eventDate) : null;

    const booked =
      (h.cocktailsBooked || 0) + (h.dinnerBooked || 0) + (h.plusOnes || 0);
    const attended =
      (h.cocktailsAttended || 0) +
      (h.dinnerAttended || 0) +
      (h.plusOnesAttended || 0);

    guestsBooked += booked;
    guestsAttended += attended;

    if (h.dinnerBooked > 0) {
      dinnersBookedEvents += 1;
      dinnerGuestsBooked += h.dinnerBooked || 0;
    }
    if (h.dinnerAttended > 0) {
      dinnersAttendedEvents += 1;
      dinnerGuestsAttended += h.dinnerAttended || 0;
    }

    const status = h.attendanceStatus || h.status;
    if (
      (status === "attended" ||
        status === "CONFIRMED" ||
        status === "attending") &&
      date
    ) {
      if (!lastAttendedAt || date > new Date(lastAttendedAt)) {
        lastAttendedAt = date.toISOString();
      }
      if (date >= twelveMonthsAgo) {
        eventsLast12Months += 1;
      }
    }
  });

  const payments = person.paymentCount || 0;
  const totalSpend = person.totalSpend || 0;
  const avgTicket = payments > 0 ? totalSpend / payments : null;

  const attendanceRate =
    eventsBooked > 0 ? eventsAttended / eventsBooked : null;
  const guestRate = guestsBooked > 0 ? guestsAttended / guestsBooked : null;
  const dinnerRate =
    dinnerGuestsBooked > 0 ? dinnerGuestsAttended / dinnerGuestsBooked : null;

  let score = 0;
  if (attendanceRate != null) score += attendanceRate * 40;
  if (guestRate != null) score += guestRate * 30;
  if (dinnerRate != null) score += dinnerRate * 20;

  // Light bonus from spend (0–10 range)
  if (totalSpend > 0) {
    const spendK = totalSpend / 100_000; // assume cents; 100k = 1,000 SEK
    const spendBonus = Math.min(10, spendK * 2);
    score += spendBonus;
  }

  const pullUpScore =
    score > 0 ? Math.max(1, Math.min(100, Math.round(score))) : null;

  return {
    eventsBooked,
    eventsAttended,
    guestsBooked,
    guestsAttended,
    dinnersBookedEvents,
    dinnersAttendedEvents,
    dinnerGuestsBooked,
    dinnerGuestsAttended,
    lastAttendedAt,
    eventsLast12Months,
    avgTicket,
    pullUpScore,
  };
}
