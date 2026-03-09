import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  Search,
  Download,
  Upload,
  Mail,
  Users,
  CircleDollarSign,
  CreditCard,
  ClipboardList,
  Calendar,
  Check,
  Clock,
  FileEdit,
} from "lucide-react";
import { useToast } from "./Toast";
import { authenticatedFetch } from "../lib/api.js";
import { getEventUrl } from "../lib/urlUtils.js";
import { colors } from "../theme/colors.js";
import { SilverIcon } from "./ui/SilverIcon.jsx";

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

export function CrmTab() {
  const navigate = useNavigate();
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
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("event"); // "event" is the default template
  const [selectedEventId, setSelectedEventId] = useState("");
  const [subjectLine, setSubjectLine] = useState("");

  // Email template editable fields (matching Resend template variables)
  const [headlineText, setHeadlineText] = useState("");
  const [introQuote, setIntroQuote] = useState("");
  const [introBody, setIntroBody] = useState("");
  const [introGreeting, setIntroGreeting] = useState("");
  const [introNote, setIntroNote] = useState("");
  const [signoffText, setSignoffText] = useState("");

  // Track which field is currently being edited inline
  const [editingField, setEditingField] = useState(null);

  // CRM UI state
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const [expandedPersonId, setExpandedPersonId] = useState(null);
  const [personDetails, setPersonDetails] = useState({});
  const [showAllEventsByPerson, setShowAllEventsByPerson] = useState({});
  const [segmentRecipients, setSegmentRecipients] = useState([]);
  const [excludedRecipientIds, setExcludedRecipientIds] = useState(
    () => new Set(),
  );
  const [isConfirmSendOpen, setIsConfirmSendOpen] = useState(false);
  const [sendStage, setSendStage] = useState("confirm"); // "confirm" | "sending" | "success" | "error"
  const [sendingCampaignId, setSendingCampaignId] = useState(null);
  const [sendingStats, setSendingStats] = useState({
    totalRecipients: 0,
    totalSent: 0,
    totalFailed: 0,
  });
  const [sendingErrorMessage, setSendingErrorMessage] = useState("");

  const selectedEvent =
    events.find((event) => event.id === selectedEventId) || null;

  // Auto-populate email fields when event is selected (only for event template)
  useEffect(() => {
    if (selectedTemplate === "event" && selectedEvent) {
      // Populate fields from event data
      setHeadlineText(selectedEvent.title || "");
      setSubjectLine(`You're invited to ${selectedEvent.title}.`);

      // Use event description if available, otherwise use default
      const bodyText = selectedEvent.description
        ? selectedEvent.description.trim()
        : "Skriv om du vill komma så får du länk till gästlistan!";
      setIntroBody(bodyText);

      // Leave greeting/signoff empty by default; UI will show placeholders
      setIntroGreeting("");
      setSignoffText("");

      // Keep quote and note empty by default (user can add)
      setIntroQuote("");
      setIntroNote("");
    } else if (selectedTemplate !== "event" || !selectedEvent) {
      // Clear all fields when template changes or no event selected
      setHeadlineText("");
      setSubjectLine("");
      setIntroQuote("");
      setIntroBody("");
      setIntroGreeting("");
      setIntroNote("");
      setSignoffText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, selectedTemplate]);

  // Load people with filters
  useEffect(() => {
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
        if (!res.ok) throw new Error("Failed to load people");
        const data = await res.json();
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
        console.error(err);
        showToast("Failed to load contacts", "error");
      } finally {
        setLoading(false);
      }
    }
    loadPeople();
  }, [searchQuery, filters, page, showToast, events, baselineTotal]);

  // Open "Send campaign" modal and load concrete recipients for current segment
  async function openSendModal() {
    if (!total) {
      showToast("There are no contacts in this view to send to.", "error");
      return;
    }

    setShowSendModal(true);
    setSegmentRecipients([]);
    setExcludedRecipientIds(() => new Set());

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);

      if (
        filters.attendedEventIds &&
        Array.isArray(filters.attendedEventIds) &&
        filters.attendedEventIds.length > 0
      ) {
        params.append("attendedEventIds", filters.attendedEventIds.join(","));
      }

      if (filters.hasDinner !== undefined) {
        params.append("hasDinner", filters.hasDinner.toString());
      }

      // Route via advanced CRM filters so we get enriched stats
      params.append("eventsAttendedMin", "0");
      params.append("sortBy", "created_at");
      params.append("sortOrder", "desc");
      params.append("limit", "1000");
      params.append("offset", "0");

      const res = await authenticatedFetch(`/host/crm/people?${params}`);
      if (!res.ok) {
        throw new Error("Failed to load recipients for this segment");
      }
      const data = await res.json();
      setSegmentRecipients(data.people || []);
    } catch (error) {
      console.error("Failed to load segment recipients:", error);
      showToast("Failed to load recipients for this segment", "error");
    }
  }

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

  const effectiveRecipientCount =
    segmentRecipients.length > 0
      ? segmentRecipients.filter((p) => !excludedRecipientIds.has(p.id)).length
      : total;

  async function handleConfirmSendCampaign() {
    if (!selectedEventId) {
      setSendStage("error");
      setSendingErrorMessage("No event selected.");
      return;
    }

    const filterCriteria = {
      search: searchQuery || undefined,
      attendedEventIds: filters.attendedEventIds,
      hasDinner: filters.hasDinner,
      eventsAttendedMin: 0,
      excludePersonIds: Array.from(excludedRecipientIds),
    };

    setSendStage("sending");
    setSendingErrorMessage("");

    try {
      const campaignData = {
        templateType: "event",
        eventId: selectedEventId,
        subject:
          subjectLine ||
          (selectedEvent ? `You're invited to ${selectedEvent.title}.` : ""),
        templateContent: {
          headline: headlineText || selectedEvent?.title || "",
          introQuote: introQuote || "",
          introBody: introBody || "",
          introGreeting: introGreeting || "",
          introNote: introNote || "",
          signoffText: signoffText || "",
          ctaLabel: "TO EVENT",
        },
        filterCriteria,
      };

      // 1) Create campaign
      const createRes = await authenticatedFetch("/host/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignData),
      });

      if (!createRes.ok) {
        const errJson = await createRes.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to create campaign");
      }

      const { campaignId, totalRecipients } = await createRes.json();
      setSendingCampaignId(campaignId);
      setSendingStats((prev) => ({
        ...prev,
        totalRecipients:
          totalRecipients != null ? totalRecipients : prev.totalRecipients,
      }));

      // 2) Start sending
      const sendRes = await authenticatedFetch(
        `/host/crm/campaigns/${campaignId}/send`,
        { method: "POST" },
      );
      if (!sendRes.ok) {
        const errJson = await sendRes.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to start sending");
      }

      // 3) Poll status until "sent" or "failed"
      let attempts = 0;
      const maxAttempts = 60; // ~2 minutes at 2s intervals

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (attempts >= maxAttempts) {
          setSendStage("error");
          setSendingErrorMessage(
            "Timed out while waiting for campaign to finish.",
          );
          return;
        }

        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const statusRes = await authenticatedFetch(
          `/host/crm/campaigns/${campaignId}`,
        );
        if (!statusRes.ok) {
          continue;
        }

        const statusJson = await statusRes.json();

        setSendingStats({
          totalRecipients: statusJson.totalRecipients || 0,
          totalSent: statusJson.totalSent || 0,
          totalFailed: statusJson.totalFailed || 0,
        });

        if (statusJson.status === "sent") {
          setSendStage("success");
          return;
        }
        if (statusJson.status === "failed") {
          setSendStage("error");
          setSendingErrorMessage("The email provider reported a failure.");
          return;
        }
        // statuses "queued" or "sending" -> keep polling
      }
    } catch (error) {
      console.error("Error sending campaign:", error);
      setSendStage("error");
      setSendingErrorMessage(
        error.message || "Unexpected error while sending campaign.",
      );
    }
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
            padding: "14px 16px 12px",
            background: "rgba(20, 16, 30, 0.7)",
            borderRadius: "16px",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            boxShadow:
              "0 0 0 1px rgba(34,197,94,0.12), 0 14px 40px rgba(0,0,0,0.55)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {/* Segment heading + total counter */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "4px",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                opacity: 0.8,
              }}
            >
              Segment
            </div>
            <div
              style={{
                fontSize: "13px",
                opacity: 0.8,
              }}
            >
              {total.toLocaleString()} /{" "}
              {(baselineTotal ?? total).toLocaleString()} contacts
            </div>
          </div>
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
                  fontSize: "12px",
                  opacity: 0.7,
                  marginBottom: "4px",
                }}
              >
                Attended events
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
                    return (
                      <label
                        key={event.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "6px 4px",
                          fontSize: "13px",
                          cursor: "pointer",
                        }}
                      >
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
                        <span style={{ opacity: 0.9 }}>{event.title}</span>
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
                  fontSize: "12px",
                  opacity: 0.7,
                  marginBottom: "4px",
                }}
              >
                Dinners only
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

            {/* Segment CTA */}
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={openSendModal}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  background: "rgba(34, 197, 94, 0.08)",
                  color: "#4ade80",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: total ? "pointer" : "not-allowed",
                  opacity: total ? 1 : 0.6,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <SilverIcon as={Mail} size={16} />
                Create email
              </button>
            </div>
          </div>{" "}
          {/* End filters + CTA row */}
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
              Views:
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

      {/* Send Invite Modal */}
      {showSendModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            zIndex: 1000,
            padding: "80px 20px 20px",
          }}
          onClick={() => setShowSendModal(false)}
        >
          <div
            style={{
              background: "rgba(12, 10, 18, 0.95)",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "520px",
              width: "100%",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 600,
                marginBottom: "8px",
              }}
            >
              Send campaign to segment
            </h2>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "10px",
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.25)",
                fontSize: "13px",
                marginBottom: "16px",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                <span
                  style={{
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#4ade80",
                  }}
                >
                  {effectiveRecipientCount.toLocaleString()}
                </span>
              </div>
              <div
                style={{
                  marginTop: "10px",
                  maxHeight: "140px",
                  overflowY: "auto",
                  paddingRight: "4px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                {segmentRecipients.length === 0 ? (
                  <div
                    style={{
                      fontSize: "12px",
                      opacity: 0.7,
                      fontStyle: "italic",
                    }}
                  >
                    Loading recipients for this segment…
                  </div>
                ) : (
                  segmentRecipients
                    .filter((p) => !excludedRecipientIds.has(p.id))
                    .map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 10px",
                          borderRadius: "999px",
                          background: "rgba(12,10,18,0.9)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          fontSize: "12px",
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            marginRight: "8px",
                          }}
                        >
                          {p.email || "Unknown contact"}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExcludedRecipientIds((prev) => {
                              const next = new Set(prev);
                              next.add(p.id);
                              return next;
                            });
                          }}
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            border: "none",
                            background: "rgba(239,68,68,0.25)",
                            color: "#fecaca",
                            fontSize: "11px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  opacity: 0.7,
                  marginBottom: "6px",
                }}
              >
                Template
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => {
                  setSelectedTemplate(e.target.value);
                  // Reset event selection when template changes
                  if (e.target.value !== "event") {
                    setSelectedEventId("");
                  }
                }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(12,10,18,0.8)",
                  color: "#fff",
                  fontSize: "14px",
                }}
              >
                <option value="event">Event email template</option>
                {/* Future templates can be added here */}
              </select>
            </div>

            {selectedTemplate === "event" && (
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    opacity: 0.7,
                    marginBottom: "6px",
                  }}
                >
                  Event content
                </label>
                <select
                  value={selectedEventId}
                  onChange={(e) => {
                    setSelectedEventId(e.target.value);
                    // Reset editable fields when event changes
                    setHeadlineText("");
                    setSubjectLine("");
                    setIntroQuote("");
                    setIntroBody("");
                    setIntroGreeting("");
                    setIntroNote("");
                    setSignoffText("");
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(12,10,18,0.8)",
                    color: "#fff",
                    fontSize: "14px",
                  }}
                >
                  <option value="">Choose event to use as email content</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedTemplate === "event" && selectedEvent && (
              <div
                style={{
                  background: "rgba(20, 16, 30, 0.7)",
                  borderRadius: "16px",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  boxShadow:
                    "0 0 0 1px rgba(34,197,94,0.12), 0 14px 40px rgba(0,0,0,0.55)",
                  margin: "0px -25px 0px -24px",
                  padding: "22px",
                }}
              >
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      opacity: 0.7,
                      marginBottom: "6px",
                    }}
                  >
                    Subject line
                  </label>
                  <input
                    type="text"
                    placeholder="E.g. Love Rönnlund till [Event Name]"
                    value={
                      subjectLine && subjectLine.trim().length > 0
                        ? subjectLine
                        : selectedEvent
                          ? `You're invited to ${selectedEvent.title}.`
                          : ""
                    }
                    onChange={(e) => setSubjectLine(e.target.value)}
                    style={{
                      width: "92%",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(12,10,18,0.8)",
                      color: "#fff",
                      fontSize: "14px",
                    }}
                  />
                </div>

                {/* Email preview - matches Resend template structure */}

                <div
                  style={{
                    marginTop: "4px",
                    marginBottom: "20px",
                    borderRadius: "16px",
                    background: "rgba(12,10,18,0.9)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    overflow: "hidden",
                    boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
                  }}
                >
                  {/* Hero image */}
                  {(selectedEvent.coverImageUrl || selectedEvent.imageUrl) && (
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "4/5",
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={selectedEvent.coverImageUrl || selectedEvent.imageUrl}
                        alt={selectedEvent.title}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </div>
                  )}

                  <div style={{ padding: "20px 20px 24px" }}>
                    {/* Headline - inline editable */}
                    {editingField === "headline" ? (
                      <input
                        type="text"
                        value={headlineText || selectedEvent.title}
                        onChange={(e) => setHeadlineText(e.target.value)}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.target.blur();
                          }
                        }}
                        autoFocus
                        style={{
                          width: "100%",
                          margin: 0,
                          padding: "12px",
                          fontSize: "28px",
                          lineHeight: "1.3",
                          fontWeight: 600,
                          textAlign: "center",
                          marginBottom: "12px",
                          background: "transparent",
                          border: "1px dashed rgba(255,255,255,0.3)",
                          borderRadius: "4px",
                          color: "#fff",
                          outline: "none",
                        }}
                      />
                    ) : (
                      <h1
                        onClick={() => setEditingField("headline")}
                        style={{
                          margin: 0,
                          padding: "12px",
                          fontSize: "28px",
                          lineHeight: "1.3",
                          paddingTop: "12px",
                          fontWeight: 600,
                          textAlign: "center",
                          marginBottom: "12px",
                          cursor: "pointer",
                          borderRadius: "8px",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            colors.silverRgbaHover;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {headlineText || selectedEvent.title}
                      </h1>
                    )}

                    {/* Intro quote - inline editable */}
                    {editingField === "quote" ? (
                      <input
                        type="text"
                        value={introQuote}
                        onChange={(e) => setIntroQuote(e.target.value)}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.target.blur();
                          }
                        }}
                        placeholder='E.g. "Ett gratiserbjudande faller från ovan"'
                        autoFocus
                        style={{
                          width: "100%",
                          margin: 0,
                          padding: "8px 12px",
                          fontSize: "15px",
                          paddingTop: "8px",
                          paddingBottom: "8px",
                          textAlign: "center",
                          fontStyle: "italic",
                          background: "transparent",
                          border: "1px dashed rgba(255,255,255,0.3)",
                          borderRadius: "4px",
                          color: "#fff",
                          opacity: 0.9,
                          outline: "none",
                        }}
                      />
                    ) : (
                      <div
                        onClick={() => setEditingField("quote")}
                        style={{
                          margin: 0,
                          padding: "8px 12px",
                          fontSize: "15px",
                          paddingTop: "8px",
                          paddingBottom: "8px",
                          textAlign: "center",
                          fontStyle: "italic",
                          opacity: introQuote ? 0.9 : 0.4,
                          cursor: "pointer",
                          borderRadius: "8px",
                          minHeight: "32px",
                          transition: "all 0.2s ease",
                          border: introQuote
                            ? "none"
                            : "1px dashed rgba(255,255,255,0.2)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            colors.silverRgbaHover;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {introQuote ? (
                          <>&quot;{introQuote}&quot;</>
                        ) : (
                          <span style={{ fontSize: "12px" }}>
                            Click to add quote / hook
                          </span>
                        )}
                      </div>
                    )}

                    {/* Intro body - inline editable */}
                    {editingField === "body" ? (
                      <textarea
                        value={introBody}
                        onChange={(e) => setIntroBody(e.target.value)}
                        onBlur={() => setEditingField(null)}
                        autoFocus
                        rows={3}
                        style={{
                          width: "100%",
                          margin: 0,
                          padding: "8px 12px",
                          fontSize: "15px",
                          paddingTop: "8px",
                          paddingBottom: "8px",
                          textAlign: "center",
                          background: "transparent",
                          border: "1px dashed rgba(255,255,255,0.3)",
                          borderRadius: "4px",
                          color: "#fff",
                          opacity: 0.85,
                          outline: "none",
                          resize: "vertical",
                          fontFamily: "inherit",
                        }}
                      />
                    ) : (
                      <p
                        onClick={() => setEditingField("body")}
                        style={{
                          margin: 0,
                          padding: "8px 12px",
                          fontSize: "15px",
                          paddingTop: "8px",
                          paddingBottom: "8px",
                          textAlign: "center",
                          opacity: 0.85,
                          cursor: "pointer",
                          borderRadius: "8px",
                          minHeight: "24px",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            colors.silverRgbaHover;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {introBody}
                      </p>
                    )}

                    {/* Divider */}
                    <hr
                      style={{
                        width: "100%",
                        border: "none",
                        borderTop: "1px solid rgba(255,255,255,0.1)",
                        paddingBottom: "12px",
                        marginTop: "12px",
                        marginBottom: "12px",
                      }}
                    />

                    {/* Intro greeting - inline editable */}
                    {editingField === "greeting" ? (
                      <input
                        type="text"
                        value={introGreeting}
                        onChange={(e) => setIntroGreeting(e.target.value)}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.target.blur();
                          }
                        }}
                        placeholder="Click to add greeting"
                        autoFocus
                        style={{
                          width: "100%",
                          margin: 0,
                          padding: "8px 12px",
                          fontSize: "15px",
                          paddingTop: "8px",
                          paddingBottom: "8px",
                          textAlign: "center",
                          background: "transparent",
                          border: "1px dashed rgba(255,255,255,0.3)",
                          borderRadius: "4px",
                          color: "#fff",
                          opacity: 0.85,
                          outline: "none",
                        }}
                      />
                    ) : (
                      <p
                        onClick={() => setEditingField("greeting")}
                        style={{
                          margin: 0,
                          padding: "8px 12px",
                          fontSize: "15px",
                          paddingTop: "8px",
                          paddingBottom: "8px",
                          textAlign: "center",
                          opacity: 0.85,
                          cursor: "pointer",
                          borderRadius: "8px",
                          minHeight: "24px",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            colors.silverRgbaHover;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {introGreeting ? (
                          introGreeting
                        ) : (
                          <span style={{ fontSize: "12px", opacity: 0.6 }}>
                            Click to add greeting
                          </span>
                        )}
                      </p>
                    )}

                    {/* Intro note - inline editable */}
                    {editingField === "note" ? (
                      <input
                        type="text"
                        value={introNote}
                        onChange={(e) => setIntroNote(e.target.value)}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.target.blur();
                          }
                        }}
                        placeholder='E.g. "Mask och foto av @partillejohnny"'
                        autoFocus
                        style={{
                          width: "100%",
                          margin: 0,
                          padding: "8px 12px",
                          fontSize: "13px",
                          paddingTop: "8px",
                          paddingBottom: "8px",
                          textAlign: "center",
                          background: "transparent",
                          border: "1px dashed rgba(255,255,255,0.3)",
                          borderRadius: "4px",
                          color: "#fff",
                          opacity: 0.7,
                          outline: "none",
                        }}
                      />
                    ) : (
                      <div
                        onClick={() => setEditingField("note")}
                        style={{
                          margin: 0,
                          padding: "8px 12px",
                          fontSize: "13px",
                          paddingTop: "8px",
                          paddingBottom: "8px",
                          textAlign: "center",
                          opacity: introNote ? 0.7 : 0.4,
                          cursor: "pointer",
                          borderRadius: "8px",
                          minHeight: "24px",
                          transition: "all 0.2s ease",
                          border: introNote
                            ? "none"
                            : "1px dashed rgba(255,255,255,0.2)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            colors.silverRgbaHover;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {introNote || (
                          <span style={{ fontSize: "11px" }}>
                            Click to add credits / note
                          </span>
                        )}
                      </div>
                    )}

                    {/* CTA Button (visual preview only, actual link handled in template) */}
                    <div style={{ textAlign: "center", marginTop: "20px" }}>
                      <button
                        type="button"
                        style={{
                          padding: "10px 24px",
                          borderRadius: "999px",
                          border: `1px solid ${colors.silverRgbaBorder}`,
                          background: colors.gradientPrimary,
                          color: "#05040a",
                          fontSize: "14px",
                          fontWeight: 600,
                          cursor: "default",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                        }}
                      >
                        TO EVENT
                      </button>
                    </div>

                    {/* Signoff - inline editable */}
                    {editingField === "signoff" ? (
                      <input
                        type="text"
                        value={signoffText}
                        onChange={(e) => setSignoffText(e.target.value)}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.target.blur();
                          }
                        }}
                        placeholder="Click to add signoff"
                        autoFocus
                        style={{
                          width: "100%",
                          margin: 0,
                          padding: "16px 12px 8px",
                          fontSize: "15px",
                          paddingTop: "16px",
                          paddingBottom: "8px",
                          textAlign: "center",
                          background: "transparent",
                          border: "1px dashed rgba(255,255,255,0.3)",
                          borderRadius: "4px",
                          color: "#fff",
                          opacity: 0.85,
                          outline: "none",
                        }}
                      />
                    ) : (
                      <p
                        onClick={() => setEditingField("signoff")}
                        style={{
                          margin: 0,
                          padding: "16px 12px 8px",
                          fontSize: "15px",
                          paddingTop: "16px",
                          paddingBottom: "8px",
                          textAlign: "center",
                          opacity: 0.85,
                          cursor: "pointer",
                          borderRadius: "8px",
                          minHeight: "24px",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            colors.silverRgbaHover;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {signoffText ? (
                          signoffText
                        ) : (
                          <span style={{ fontSize: "12px", opacity: 0.6 }}>
                            Click to add signoff
                          </span>
                        )}
                      </p>
                    )}

                    {/* Footer (read-only) */}
                    <div
                      style={{
                        marginTop: "24px",
                        paddingTop: "20px",
                        borderTop: "2px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          padding: 0,
                          fontSize: "12px",
                          paddingTop: "8px",
                          paddingBottom: "8px",
                          textAlign: "center",
                          opacity: 0.6,
                        }}
                      >
                        You are receiving this email because you opted in via
                        our site.
                        <br />
                        <br />
                        Want to change how you receive these emails?
                        <br />
                        You can{" "}
                        <span
                          style={{
                            color: "#0670DB",
                            textDecoration: "underline",
                          }}
                        >
                          unsubscribe from this list
                        </span>
                        .
                      </p>
                      <p
                        style={{
                          margin: 0,
                          padding: 0,
                          fontSize: "12px",
                          paddingTop: "8px",
                          paddingBottom: "8px",
                          textAlign: "center",
                          opacity: 0.6,
                        }}
                      >
                        Pullup.se
                        <br />
                        Lorensbergsgatan 3b
                        <br />
                        117 33, Stockholm
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                marginTop: "20px",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowSendModal(false);
                  // Reset all fields
                  setSelectedTemplate("event");
                  setSubjectLine("");
                  setSelectedEventId("");
                  setHeadlineText("");
                  setIntroQuote("");
                  setIntroBody("");
                  setIntroGreeting("");
                  setIntroNote("");
                  setSignoffText("");
                  setEditingField(null);
                }}
                style={{
                  padding: "10px 18px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(12,10,18,0.6)",
                  color: "#fff",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedEventId) {
                    showToast("Pick an event before sending.", "error");
                    return;
                  }
                  if (!effectiveRecipientCount) {
                    showToast(
                      "There are no contacts in this view to send to.",
                      "error",
                    );
                    return;
                  }

                  setSendStage("confirm");
                  setSendingCampaignId(null);
                  setSendingStats({
                    totalRecipients: effectiveRecipientCount,
                    totalSent: 0,
                    totalFailed: 0,
                  });
                  setSendingErrorMessage("");
                  setIsConfirmSendOpen(true);
                }}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background:
                    selectedEventId === ""
                      ? "rgba(139,92,246,0.3)"
                      : colors.gradientPrimary,
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: selectedEventId === "" ? "not-allowed" : "pointer",
                  opacity: selectedEventId === "" ? 0.7 : 1,
                }}
              >
                Send campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm / Sending Campaign Modal */}
      {isConfirmSendOpen &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1100,
              padding: "20px",
            }}
            onClick={() => {
              if (
                sendStage === "confirm" ||
                sendStage === "success" ||
                sendStage === "error"
              ) {
                setIsConfirmSendOpen(false);
              }
            }}
          >
            <div
              style={{
                background: "rgba(12, 10, 18, 0.97)",
                borderRadius: "16px",
                padding: "24px 24px 20px",
                width: "100%",
                maxWidth: "460px",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 600,
                marginBottom: "8px",
              }}
            >
              {sendStage === "confirm"
                ? "Send campaign to segment?"
                : sendStage === "sending"
                ? "Sending campaign…"
                : sendStage === "success"
                ? "Campaign sent"
                : "Campaign failed"}
            </h3>

            {sendStage === "confirm" && (
              <div
                style={{
                  fontSize: "14px",
                  opacity: 0.85,
                  marginBottom: "16px",
                }}
              >
                <p style={{ marginBottom: "8px" }}>
                  This email will be sent to{" "}
                  <span style={{ fontWeight: 600 }}>
                    {sendingStats.totalRecipients.toLocaleString()}
                  </span>{" "}
                  contacts in the current segment.
                </p>
                {selectedEvent && (
                  <p style={{ margin: 0 }}>
                    <span style={{ fontWeight: 600 }}>Event:</span>{" "}
                    {selectedEvent.title}
                    <br />
                    <span style={{ fontWeight: 600 }}>Subject:</span>{" "}
                    {subjectLine && subjectLine.trim().length > 0
                      ? subjectLine
                      : `You're invited to ${selectedEvent.title}.`}
                  </p>
                )}
              </div>
            )}

            {sendStage === "sending" && (
              <div
                style={{
                  fontSize: "14px",
                  opacity: 0.85,
                  marginBottom: "12px",
                }}
              >
                <p style={{ marginBottom: "8px" }}>
                  Sending to{" "}
                  <span style={{ fontWeight: 600 }}>
                    {sendingStats.totalRecipients.toLocaleString()}
                  </span>{" "}
                  contacts…
                </p>
                <p style={{ margin: 0 }}>
                  Sent{" "}
                  <span style={{ fontWeight: 600 }}>
                    {sendingStats.totalSent.toLocaleString()}
                  </span>{" "}
                  / {sendingStats.totalRecipients.toLocaleString()}
                  {sendingStats.totalFailed
                    ? ` · ${sendingStats.totalFailed.toLocaleString()} failed`
                    : ""}
                </p>
              </div>
            )}

            {sendStage === "success" && (
              <div
                style={{
                  fontSize: "14px",
                  opacity: 0.9,
                  marginBottom: "12px",
                }}
              >
                <p style={{ marginBottom: "6px" }}>
                  Successfully sent to{" "}
                  <span style={{ fontWeight: 600 }}>
                    {sendingStats.totalSent.toLocaleString()}
                  </span>{" "}
                  contacts.
                </p>
                {sendingStats.totalFailed > 0 && (
                  <p style={{ margin: 0, opacity: 0.8 }}>
                    {sendingStats.totalFailed.toLocaleString()} deliveries
                    reported as failed.
                  </p>
                )}
              </div>
            )}

            {sendStage === "error" && (
              <div
                style={{
                  fontSize: "14px",
                  color: "#f97373",
                  marginBottom: "12px",
                }}
              >
                <p style={{ marginBottom: "6px" }}>
                  We couldn’t complete this send. No more emails will be sent.
                </p>
                {sendingErrorMessage && (
                  <p style={{ margin: 0, opacity: 0.8 }}>
                    {sendingErrorMessage}
                  </p>
                )}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "8px",
              }}
            >
              {sendStage === "confirm" && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsConfirmSendOpen(false)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(12,10,18,0.8)",
                      color: "#fff",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSendCampaign}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "none",
                      background: colors.gradientPrimary,
                      color: "#05040a",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Send campaign
                  </button>
                </>
              )}

              {sendStage === "sending" && (
                <button
                  type="button"
                  disabled
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(12,10,18,0.8)",
                    color: "#fff",
                    fontSize: "14px",
                    opacity: 0.7,
                    cursor: "not-allowed",
                  }}
                >
                  Sending…
                </button>
              )}

              {(sendStage === "success" || sendStage === "error") && (
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmSendOpen(false);
                    setShowSendModal(false);
                    setSelectedTemplate("event");
                    setSubjectLine("");
                    setSelectedEventId("");
                    setHeadlineText("");
                    setIntroQuote("");
                    setIntroBody("");
                    setIntroGreeting("");
                    setIntroNote("");
                    setSignoffText("");
                    setEditingField(null);
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(12,10,18,0.8)",
                    color: "#fff",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              )}
            </div>
            </div>
          </div>,
          document.body,
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
