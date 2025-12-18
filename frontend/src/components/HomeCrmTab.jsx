import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "./Toast";
import { authenticatedFetch } from "../lib/api.js";

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
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0); // zero-based page index
  const [savedViews, setSavedViews] = useState([]);
  const [activeView, setActiveView] = useState(null);
  const [events, setEvents] = useState([]);

  // Load people with filters
  useEffect(() => {
    async function loadPeople() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.append("search", searchQuery);
        if (filters.email) params.append("email", filters.email);
        if (filters.name) params.append("name", filters.name);
        if (filters.totalSpendMin)
          params.append("totalSpendMin", filters.totalSpendMin);
        if (filters.totalSpendMax)
          params.append("totalSpendMax", filters.totalSpendMax);
        if (filters.paymentCountMin)
          params.append("paymentCountMin", filters.paymentCountMin);
        if (filters.paymentCountMax)
          params.append("paymentCountMax", filters.paymentCountMax);
        if (filters.subscriptionType)
          params.append("subscriptionType", filters.subscriptionType);
        if (filters.interestedIn)
          params.append("interestedIn", filters.interestedIn);
        if (filters.hasStripeCustomerId !== undefined)
          params.append(
            "hasStripeCustomerId",
            filters.hasStripeCustomerId.toString()
          );
        if (filters.attendedEventId) {
          console.log(
            "[CRM] Filtering by event ID:",
            filters.attendedEventId,
            "Event title:",
            events.find((e) => e.id === filters.attendedEventId)?.title
          );
          params.append("attendedEventId", filters.attendedEventId);
        }
        if (filters.hasDinner !== undefined)
          params.append("hasDinner", filters.hasDinner.toString());
        if (filters.attendanceStatus)
          params.append("attendanceStatus", filters.attendanceStatus);
        if (filters.eventsAttendedMin !== undefined)
          params.append(
            "eventsAttendedMin",
            filters.eventsAttendedMin.toString()
          );
        if (filters.eventsAttendedMax !== undefined)
          params.append(
            "eventsAttendedMax",
            filters.eventsAttendedMax.toString()
          );
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
          } (total: ${data.total || 0})`
        );
        setPeople(data.people || []);
        setTotal(data.total || 0);
      } catch (err) {
        console.error(err);
        showToast("Failed to load contacts", "error");
      } finally {
        setLoading(false);
      }
    }
    loadPeople();
  }, [searchQuery, filters, page, showToast, events]);

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
            (data || []).map((e) => ({ id: e.id, title: e.title }))
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
                "Could not find event. Please check the URL or use the event ID directly."
              );
            }
          } else {
            throw new Error(
              "Invalid event URL. Please use format: https://pullup.se/e/event-slug or paste the event ID directly."
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
        "success"
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
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
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
        {/* Top Row: Search and Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
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
              e.target.style.borderColor = "rgba(139, 92, 246, 0.4)";
              e.target.style.background = "rgba(20, 16, 30, 0.8)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "rgba(255,255,255,0.1)";
              e.target.style.background = "rgba(20, 16, 30, 0.6)";
            }}
          />

          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              background: showFilters
                ? "rgba(139, 92, 246, 0.2)"
                : "rgba(139, 92, 246, 0.1)",
              color: "#a78bfa",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            🔍 Filters
          </button>

          <button
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
            📥 Import CSV
          </button>

          <button
            onClick={async () => {
              try {
                const res = await authenticatedFetch("/host/crm/people/export");
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
                showToast("CSV exported successfully", "success");
              } catch (err) {
                console.error(err);
                showToast("Failed to export CSV", "error");
              }
            }}
            className="export-csv-button"
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              background: "rgba(139, 92, 246, 0.1)",
              color: "#a78bfa",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            📤 Export CSV
          </button>
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
                      ? "1px solid rgba(139, 92, 246, 0.5)"
                      : "1px solid rgba(255,255,255,0.1)",
                  background:
                    activeView?.id === view.id
                      ? "rgba(139, 92, 246, 0.2)"
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
                border: "1px solid rgba(139, 92, 246, 0.3)",
                background: "rgba(139, 92, 246, 0.1)",
                color: "#a78bfa",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              + Save View
            </button>
          </div>
        )}

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div
            style={{
              padding: "20px",
              background: "rgba(20, 16, 30, 0.6)",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  opacity: 0.7,
                  marginBottom: "6px",
                }}
              >
                Attended Event
              </label>
              <select
                value={filters.attendedEventId || ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    attendedEventId: e.target.value || undefined,
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(12, 10, 18, 0.6)",
                  color: "#fff",
                  fontSize: "14px",
                }}
              >
                <option value="">All Events</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  opacity: 0.7,
                  marginBottom: "6px",
                }}
              >
                Attendance Status
              </label>
              <select
                value={filters.attendanceStatus || ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    attendanceStatus: e.target.value || undefined,
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(12, 10, 18, 0.6)",
                  color: "#fff",
                  fontSize: "14px",
                }}
              >
                <option value="">All Statuses</option>
                <option value="attended">Attended</option>
                <option value="waitlisted">Waitlisted</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  opacity: 0.7,
                  marginBottom: "6px",
                }}
              >
                Had Dinner
              </label>
              <select
                value={
                  filters.hasDinner === undefined
                    ? ""
                    : filters.hasDinner
                    ? "yes"
                    : "no"
                }
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    hasDinner:
                      e.target.value === ""
                        ? undefined
                        : e.target.value === "yes",
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(12, 10, 18, 0.6)",
                  color: "#fff",
                  fontSize: "14px",
                }}
              >
                <option value="">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  opacity: 0.7,
                  marginBottom: "6px",
                }}
              >
                Events Attended (min)
              </label>
              <input
                type="number"
                value={filters.eventsAttendedMin || ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    eventsAttendedMin: e.target.value
                      ? parseInt(e.target.value, 10)
                      : undefined,
                  })
                }
                placeholder="Min events"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(12, 10, 18, 0.6)",
                  color: "#fff",
                  fontSize: "14px",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  opacity: 0.7,
                  marginBottom: "6px",
                }}
              >
                Events Attended (max)
              </label>
              <input
                type="number"
                value={filters.eventsAttendedMax || ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    eventsAttendedMax: e.target.value
                      ? parseInt(e.target.value, 10)
                      : undefined,
                  })
                }
                placeholder="Max events"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(12, 10, 18, 0.6)",
                  color: "#fff",
                  fontSize: "14px",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "8px",
              }}
            >
              <button
                onClick={() => {
                  setFilters({});
                  setActiveView(null);
                  setPage(0); // Reset to first page when clearing filters
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(20, 16, 30, 0.6)",
                  color: "#fff",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>
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
                  e.target.style.borderColor = "rgba(139, 92, 246, 0.4)";
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
                      ? "rgba(139, 92, 246, 0.3)"
                      : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
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

      {/* Total Summary */}
      {total > 0 && (
        <div
          style={{
            padding: "16px 20px",
            background: "rgba(139, 92, 246, 0.1)",
            borderRadius: "12px",
            border: "1px solid rgba(139, 92, 246, 0.3)",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "14px",
                opacity: 0.7,
                marginBottom: "4px",
              }}
            >
              Total Unique Contacts
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#a78bfa",
              }}
            >
              {total.toLocaleString()}
            </div>
          </div>
          <div
            style={{
              fontSize: "13px",
              opacity: 0.6,
            }}
          >
            {total === 0 ? (
              "Showing 0 of 0"
            ) : (
              <>
                Showing {(page * PAGE_SIZE + 1).toLocaleString()} –{" "}
                {Math.min((page + 1) * PAGE_SIZE, total).toLocaleString()} of{" "}
                {total.toLocaleString()}
              </>
            )}
          </div>
        </div>
      )}

      {/* People List */}
      {people.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 24px",
            opacity: 0.6,
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>👥</div>
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
            {people.map((person) => (
              <div
                key={person.id}
                style={{
                  padding: "20px",
                  background: "rgba(20, 16, 30, 0.6)",
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.05)",
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.3)";
                  e.currentTarget.style.boxShadow =
                    "0 10px 30px rgba(0,0,0,0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                onClick={() => navigate(`/app/crm/${person.id}`)}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "20px",
                    flexWrap: "wrap",
                  }}
                >
                  {/* Left: Person Info */}
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: 600,
                        marginBottom: "6px",
                        color: "#fff",
                      }}
                    >
                      {person.name || "Unnamed Contact"}
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        opacity: 0.7,
                        marginBottom: "12px",
                        wordBreak: "break-word",
                      }}
                    >
                      {person.email}
                    </div>

                    {/* CRM Stats */}
                    {(person.totalSpend > 0 ||
                      person.paymentCount > 0 ||
                      person.subscriptionType) && (
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                          marginBottom: "12px",
                        }}
                      >
                        {person.totalSpend > 0 && (
                          <StatBadge
                            label="Total Spend"
                            value={formatCurrency(person.totalSpend)}
                            icon="💰"
                            color="#10b981"
                          />
                        )}
                        {person.paymentCount > 0 && (
                          <StatBadge
                            label="Payments"
                            value={person.paymentCount}
                            icon="💳"
                            color="#8b5cf6"
                          />
                        )}
                        {person.subscriptionType && (
                          <StatBadge
                            label="Type"
                            value={person.subscriptionType}
                            icon="📋"
                            color="#f59e0b"
                          />
                        )}
                      </div>
                    )}

                    {/* Event Stats */}
                    {person.stats && (
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <StatBadge
                          label="Events"
                          value={person.stats.totalEvents}
                          icon="📅"
                        />
                        <StatBadge
                          label="Attended"
                          value={person.stats.eventsAttended}
                          icon="✅"
                          color="#10b981"
                        />
                        {person.stats.eventsWaitlisted > 0 && (
                          <StatBadge
                            label="Waitlisted"
                            value={person.stats.eventsWaitlisted}
                            icon="⏳"
                            color="#f59e0b"
                          />
                        )}
                        {person.stats.totalGuestsBrought > 0 && (
                          <StatBadge
                            label="Guests"
                            value={person.stats.totalGuestsBrought}
                            icon="👥"
                            color="#8b5cf6"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Event History */}
                  <div style={{ flex: 1, minWidth: "300px" }}>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        opacity: 0.7,
                        marginBottom: "12px",
                      }}
                    >
                      Event History
                    </div>
                    {person.eventHistory && person.eventHistory.length === 0 ? (
                      <div
                        style={{
                          fontSize: "13px",
                          opacity: 0.5,
                          fontStyle: "italic",
                        }}
                      >
                        No events yet
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        {person.eventHistory?.slice(0, 3).map((history) => {
                          const isAttended =
                            history.attendanceStatus === "attended";
                          const isConfirmed =
                            history.attendanceStatus === "confirmed";

                          return (
                            <div
                              key={history.rsvpId}
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
                                    fontSize: "16px",
                                    opacity: 0.8,
                                  }}
                                >
                                  {isAttended
                                    ? "✅"
                                    : isConfirmed
                                    ? "📝"
                                    : "⏳"}
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
                                    {history.eventTitle}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      opacity: 0.6,
                                      marginBottom: "4px",
                                    }}
                                  >
                                    {formatEventDate(history.eventDate)}
                                  </div>
                                </div>
                                {history.plusOnes > 0 && (
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      opacity: 0.7,
                                      whiteSpace: "nowrap",
                                      padding: "2px 6px",
                                      background: "rgba(139, 92, 246, 0.15)",
                                      borderRadius: "6px",
                                      border:
                                        "1px solid rgba(139, 92, 246, 0.3)",
                                    }}
                                  >
                                    +{history.plusOnes}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {person.eventHistory &&
                          person.eventHistory.length > 3 && (
                            <div
                              style={{
                                fontSize: "12px",
                                opacity: 0.6,
                                fontStyle: "italic",
                                paddingLeft: "8px",
                              }}
                            >
                              +{person.eventHistory.length - 3} more event
                              {person.eventHistory.length - 3 !== 1 ? "s" : ""}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer: First seen */}
                <div
                  style={{
                    marginTop: "16px",
                    paddingTop: "16px",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    fontSize: "12px",
                    opacity: 0.5,
                  }}
                >
                  First seen: {formatDate(person.createdAt)}
                </div>
              </div>
            ))}
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
                  border: "1px solid rgba(139, 92, 246, 0.3)",
                  background: hasPrevPage
                    ? "rgba(139, 92, 246, 0.1)"
                    : "rgba(139, 92, 246, 0.05)",
                  color: hasPrevPage ? "#a78bfa" : "rgba(167, 139, 250, 0.5)",
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
                  border: "1px solid rgba(139, 92, 246, 0.3)",
                  background: hasNextPage
                    ? "rgba(139, 92, 246, 0.1)"
                    : "rgba(139, 92, 246, 0.05)",
                  color: hasNextPage ? "#a78bfa" : "rgba(167, 139, 250, 0.5)",
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

function StatBadge({ label, value, icon, color = "#8b5cf6" }) {
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
