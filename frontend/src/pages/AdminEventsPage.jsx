import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { Users, MapPin, Calendar, ChevronDown, ChevronUp, ExternalLink, Clock, Tag } from "lucide-react";

function getEventStatus(ev) {
  const now = new Date();
  const start = new Date(ev.startsAt);
  const end = ev.endsAt ? new Date(ev.endsAt) : new Date(start.getTime() + 3 * 60 * 60 * 1000);
  if (now > end) return "past";
  if (now >= start && now <= end) return "live";
  return "upcoming";
}

const STATUS_BADGE = {
  live: { bg: "rgba(16,185,129,0.15)", text: "#10b981", border: "rgba(16,185,129,0.3)", label: "LIVE" },
  upcoming: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", border: "rgba(59,130,246,0.3)", label: "Upcoming" },
  past: { bg: "rgba(107,114,128,0.15)", text: "#9ca3af", border: "rgba(107,114,128,0.3)", label: "Past" },
};

export function AdminEventsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [filter, setFilter] = useState("upcoming");
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [guests, setGuests] = useState(null);
  const [guestsLoading, setGuestsLoading] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [tagsSaving, setTagsSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    async function fetchEvents() {
      setEventsLoading(true);
      try {
        const res = await authenticatedFetch(`/admin/platform-events?filter=${filter}`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch {
        setEvents([]);
      } finally {
        setEventsLoading(false);
      }
    }
    fetchEvents();
  }, [user, filter]);

  async function loadGuests(eventId) {
    if (expandedEvent === eventId) {
      setExpandedEvent(null);
      setGuests(null);
      return;
    }
    setExpandedEvent(eventId);
    const ev = events.find((e) => e.id === eventId);
    setTagsInput((ev?.adminTags || []).join(", "));
    setGuestsLoading(true);
    try {
      const res = await authenticatedFetch(`/admin/platform-events/${eventId}/guests`);
      if (res.ok) {
        const data = await res.json();
        setGuests(data.guests || []);
      }
    } catch {
      setGuests([]);
    } finally {
      setGuestsLoading(false);
    }
  }

  async function saveTags(eventId) {
    setTagsSaving(true);
    try {
      const res = await authenticatedFetch(
        `/admin/platform-events/${eventId}/tags`,
        {
          method: "PATCH",
          body: JSON.stringify({ tags: tagsInput }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setEvents((prev) =>
          prev.map((e) =>
            e.id === eventId ? { ...e, adminTags: data.adminTags || [] } : e,
          ),
        );
        setTagsInput((data.adminTags || []).join(", "));
      }
    } finally {
      setTagsSaving(false);
    }
  }

  function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="page-with-header" style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at 20% 50%, rgba(192,192,192,0.1) 0%, transparent 50%), #05040a",
    }}>
      <div className="responsive-container" style={{ maxWidth: 900, margin: "0 auto", padding: "80px 16px 40px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#fff", marginBottom: 4 }}>Platform Events</h1>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
          All events across the platform. View guest lists and monitor activity.
        </p>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[
            { key: "upcoming", label: "Upcoming" },
            { key: "past", label: "Past" },
            { key: "all", label: "All" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "6px 16px", borderRadius: "999px",
                border: filter === f.key ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
                background: filter === f.key ? "rgba(255,255,255,0.1)" : "transparent",
                color: filter === f.key ? "#fff" : "rgba(255,255,255,0.4)",
                fontSize: "13px", fontWeight: filter === f.key ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {eventsLoading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)" }}>Loading...</div>
        ) : events.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)" }}>No events found</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {events.map((ev) => {
              const status = getEventStatus(ev);
              const badge = STATUS_BADGE[status];
              const isExpanded = expandedEvent === ev.id;

              return (
                <div key={ev.id}>
                  <div
                    onClick={() => loadGuests(ev.id)}
                    style={{
                      background: "rgba(20,16,30,0.5)",
                      border: isExpanded ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.06)",
                      borderRadius: isExpanded ? "16px 16px 0 0" : "16px",
                      padding: "14px 16px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {/* Status badge */}
                      <span style={{
                        padding: "2px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 600,
                        background: badge.bg, color: badge.text, border: `1px solid ${badge.border}`,
                        textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
                      }}>
                        {badge.label}
                      </span>

                      {/* Title + details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: "15px", fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ev.title || "Untitled"}
                          </span>
                          {ev.host && (
                            <span style={{
                              fontSize: "11px", color: "rgba(255,255,255,0.35)", flexShrink: 0,
                              padding: "1px 7px", borderRadius: "999px",
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220,
                            }}>
                              {ev.host.name || ev.host.email}{ev.host.brand ? ` · ${ev.host.brand}` : ""}
                            </span>
                          )}
                          {ev.adminTags?.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              style={{
                                fontSize: "10px",
                                color: "rgba(251,191,36,0.85)",
                                padding: "1px 7px",
                                borderRadius: "999px",
                                background: "rgba(251,191,36,0.06)",
                                border: "1px solid rgba(251,191,36,0.18)",
                                flexShrink: 0,
                              }}
                            >
                              {t}
                            </span>
                          ))}
                          {ev.adminTags?.length > 3 && (
                            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                              +{ev.adminTags.length - 3}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {ev.location && (
                            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                              <MapPin size={10} /> {ev.location.length > 30 ? ev.location.slice(0, 30) + "..." : ev.location}
                            </span>
                          )}
                          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <Calendar size={10} /> {formatDate(ev.startsAt)}
                          </span>
                        </div>
                      </div>

                      {/* Guest count */}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
                        fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.5)",
                      }}>
                        <Users size={14} />
                        {ev.confirmedGuests}{ev.capacity > 0 && <span style={{ opacity: 0.5 }}>/{ev.capacity}</span>}
                      </div>

                      {/* Expand arrow */}
                      <div style={{ flexShrink: 0, color: "rgba(255,255,255,0.3)" }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded guest list */}
                  {isExpanded && (
                    <div style={{
                      background: "rgba(15,12,24,0.6)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderTop: "none",
                      borderRadius: "0 0 16px 16px",
                      padding: "12px 16px 16px",
                    }}>
                      {/* Quick actions */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        <a
                          href={`/e/${ev.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "flex", alignItems: "center", gap: 4,
                            padding: "4px 10px", borderRadius: "999px",
                            border: "1px solid rgba(255,255,255,0.1)",
                            background: "rgba(255,255,255,0.04)",
                            color: "rgba(255,255,255,0.5)",
                            fontSize: "11px", textDecoration: "none",
                          }}
                        >
                          <ExternalLink size={10} /> View event
                        </a>
                      </div>

                      {/* Internal tags — admin-only classification of the event.
                          Comma-separated input; backend normalizes (lowercase,
                          trim, dedupe, cap 32) on save. Surfaces as pills on
                          the row above, and aggregates per-host in the
                          forthcoming admin CRM. */}
                      <div
                        style={{
                          marginBottom: 12,
                          padding: "10px 12px",
                          borderRadius: 10,
                          background: "rgba(251,191,36,0.04)",
                          border: "1px solid rgba(251,191,36,0.12)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            color: "rgba(251,191,36,0.8)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          <Tag size={11} /> Internal tags
                          <span
                            style={{
                              marginLeft: "auto",
                              fontWeight: 400,
                              textTransform: "none",
                              letterSpacing: 0,
                              color: "rgba(255,255,255,0.35)",
                            }}
                          >
                            comma separated · admin only
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder="dinner, networking, art, fashion..."
                            style={{
                              flex: 1,
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "1px solid rgba(255,255,255,0.1)",
                              background: "rgba(12,10,20,0.7)",
                              color: "#fff",
                              fontSize: 13,
                              outline: "none",
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                saveTags(ev.id);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => saveTags(ev.id)}
                            disabled={
                              tagsSaving ||
                              tagsInput === (ev.adminTags || []).join(", ")
                            }
                            style={{
                              padding: "8px 16px",
                              borderRadius: 8,
                              border: "none",
                              background:
                                tagsSaving ||
                                tagsInput === (ev.adminTags || []).join(", ")
                                  ? "rgba(255,255,255,0.06)"
                                  : "rgba(251,191,36,0.2)",
                              color:
                                tagsSaving ||
                                tagsInput === (ev.adminTags || []).join(", ")
                                  ? "rgba(255,255,255,0.3)"
                                  : "#fbbf24",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor:
                                tagsSaving ||
                                tagsInput === (ev.adminTags || []).join(", ")
                                  ? "default"
                                  : "pointer",
                            }}
                          >
                            {tagsSaving ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </div>

                      {guestsLoading ? (
                        <div style={{ textAlign: "center", padding: "16px 0", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>
                          Loading guest list...
                        </div>
                      ) : !guests || guests.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "16px 0", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>
                          No guests yet
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
                            {guests.length} {guests.length === 1 ? "guest" : "guests"}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {guests.map((g) => {
                              const isConfirmed = g.bookingStatus === "CONFIRMED" || g.status === "attending";
                              return (
                                <div key={g.id} style={{
                                  display: "flex", alignItems: "center", gap: 8,
                                  padding: "8px 10px", borderRadius: 8,
                                  background: "rgba(255,255,255,0.02)",
                                }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                      fontSize: "13px", fontWeight: 500, color: "#fff",
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>
                                      {g.name || "Guest"}
                                    </div>
                                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)" }}>
                                      {g.email}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                                    {g.partySize || 1} {(g.partySize || 1) === 1 ? "guest" : "guests"}
                                  </div>
                                  <span style={{
                                    padding: "2px 6px", borderRadius: "999px", fontSize: "9px", fontWeight: 600,
                                    background: isConfirmed ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                                    color: isConfirmed ? "#10b981" : "#f59e0b",
                                    border: `1px solid ${isConfirmed ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
                                    textTransform: "uppercase", flexShrink: 0,
                                  }}>
                                    {g.bookingStatus || g.status || "unknown"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
