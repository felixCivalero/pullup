import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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

export function CrmTab() {
  const navigate = useNavigate();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function loadPeople() {
      try {
        const res = await authenticatedFetch("/host/crm/people");
        if (!res.ok) throw new Error("Failed to load people");
        const data = await res.json();
        setPeople(data.people || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadPeople();
  }, []);

  const filteredPeople = people.filter((person) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      person.name?.toLowerCase().includes(query) ||
      person.email?.toLowerCase().includes(query)
    );
  });

  if (loading) {
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

  return (
    <div>
      <style>{`
        @media (max-width: 767px) {
          .export-csv-button {
            display: none !important;
          }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "24px",
          gap: "12px",
        }}
      >
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: "8px 16px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(20, 16, 30, 0.6)",
            color: "#fff",
            fontSize: "14px",
            outline: "none",
            flex: "1 1 auto",
            minWidth: 0,
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
            } catch (err) {
              console.error(err);
              alert("Failed to export CSV");
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
            flexShrink: 0,
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

      {filteredPeople.length === 0 ? (
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
            {searchQuery ? "No contacts found" : "No contacts yet"}
          </div>
          <div style={{ fontSize: "14px", opacity: 0.7 }}>
            {searchQuery
              ? "Try a different search term"
              : "People who RSVP to your events will appear here"}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {filteredPeople.map((person) => (
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
                e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                e.currentTarget.style.boxShadow = "none";
              }}
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

                  {/* Stats */}
                  <div
                    style={{
                      display: "flex",
                      gap: "16px",
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
                        label="Guests Brought"
                        value={person.stats.totalGuestsBrought}
                        icon="👥"
                        color="#8b5cf6"
                      />
                    )}
                    {person.stats.totalDinners > 0 && (
                      <StatBadge
                        label="Dinners"
                        value={person.stats.totalDinners}
                        icon="🍽️"
                        color="#f59e0b"
                      />
                    )}
                    {person.stats.totalDinnerGuests > 0 && (
                      <StatBadge
                        label="Dinner Guests"
                        value={person.stats.totalDinnerGuests}
                        icon="👨‍🍳"
                        color="#ec4899"
                      />
                    )}
                  </div>
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
                  {person.eventHistory.length === 0 ? (
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
                      {person.eventHistory.slice(0, 3).map((history) => (
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
                              marginBottom: history.wantsDinner ? "8px" : "0",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "16px",
                                opacity: 0.8,
                              }}
                            >
                              {history.status === "attending" ? "✅" : "⏳"}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  marginBottom: "2px",
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
                                  border: "1px solid rgba(139, 92, 246, 0.3)",
                                }}
                              >
                                +{history.plusOnes}
                              </div>
                            )}
                          </div>
                          {history.wantsDinner && (
                            <div
                              style={{
                                marginTop: "8px",
                                paddingTop: "8px",
                                borderTop: "1px solid rgba(255,255,255,0.05)",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ fontSize: "14px" }}>🍽️</span>
                              <div
                                style={{
                                  fontSize: "12px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span style={{ opacity: 0.8 }}>Dinner:</span>
                                {history.dinnerStatus === "confirmed" && (
                                  <span
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: "6px",
                                      background: "rgba(16, 185, 129, 0.15)",
                                      border:
                                        "1px solid rgba(16, 185, 129, 0.3)",
                                      color: "#10b981",
                                      fontWeight: 600,
                                      fontSize: "11px",
                                    }}
                                  >
                                    ✅ Confirmed
                                  </span>
                                )}
                                {history.dinnerStatus === "waitlist" && (
                                  <span
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: "6px",
                                      background: "rgba(236, 72, 153, 0.15)",
                                      border:
                                        "1px solid rgba(236, 72, 153, 0.3)",
                                      color: "#f472b6",
                                      fontWeight: 600,
                                      fontSize: "11px",
                                    }}
                                  >
                                    ⏳ Waitlist
                                  </span>
                                )}
                                {history.dinnerStatus === "cocktails" && (
                                  <span
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: "6px",
                                      background: "rgba(245, 158, 11, 0.15)",
                                      border:
                                        "1px solid rgba(245, 158, 11, 0.3)",
                                      color: "#f59e0b",
                                      fontWeight: 600,
                                      fontSize: "11px",
                                    }}
                                  >
                                    🥂 Cocktails
                                  </span>
                                )}
                                {history.dinnerStatus ===
                                  "cocktails_waitlist" && (
                                  <span
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: "6px",
                                      background: "rgba(139, 92, 246, 0.15)",
                                      border:
                                        "1px solid rgba(139, 92, 246, 0.3)",
                                      color: "#a78bfa",
                                      fontWeight: 600,
                                      fontSize: "11px",
                                    }}
                                  >
                                    🥂⏳ Both
                                  </span>
                                )}
                                {history.dinnerTimeSlot && (
                                  <span
                                    style={{
                                      opacity: 0.7,
                                      fontSize: "11px",
                                    }}
                                  >
                                    @{" "}
                                    {new Date(
                                      history.dinnerTimeSlot
                                    ).toLocaleTimeString("en-US", {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                )}
                                {history.dinnerPartySize &&
                                  history.dinnerPartySize > 1 && (
                                    <span
                                      style={{
                                        opacity: 0.7,
                                        fontSize: "11px",
                                      }}
                                    >
                                      ({history.dinnerPartySize} people)
                                    </span>
                                  )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {person.eventHistory.length > 3 && (
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
