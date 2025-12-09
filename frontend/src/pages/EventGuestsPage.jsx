import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useToast } from "../components/Toast";

const API_BASE = "http://localhost:3001";

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
  const [statusFilter, setStatusFilter] = useState("all");
  const [dinnerFilter, setDinnerFilter] = useState("all");
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [editingGuest, setEditingGuest] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

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
        const res = await fetch(`${API_BASE}/host/events/${id}/guests`);
        if (!res.ok) throw new Error("Failed to load guests");
        const data = await res.json();
        setEvent(data.event);
        setGuests(data.guests || []);
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
  }, [id, showToast]);

  async function handleUpdateGuest(rsvpId, updates) {
    try {
      const res = await fetch(`${API_BASE}/host/events/${id}/rsvps/${rsvpId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update guest");
      }

      showToast("Guest updated successfully! ✨", "success");
      setEditingGuest(null);

      // Reload guests
      const guestsRes = await fetch(`${API_BASE}/host/events/${id}/guests`);
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
      const res = await fetch(
        `${API_BASE}/host/events/${id}/rsvps/${guest.id}`,
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
      const guestsRes = await fetch(`${API_BASE}/host/events/${id}/guests`);
      if (guestsRes.ok) {
        const data = await guestsRes.json();
        setGuests(data.guests || []);
      }
    } catch (err) {
      console.error(err);
      showToast("Could not delete guest", "error");
    }
  }

  function handleEditGuest(guest) {
    setEditingGuest(guest);
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
  // Restructured to ensure all calculations are consistent:
  // - Cocktail List = all people attending the event (base partySize)
  // - Dinner Confirmed = people confirmed for dinner (dinnerPartySize)
  // - Cocktails Only = people on cocktail list who are NOT confirmed for dinner
  // - Attending = Cocktails Only + Dinner Confirmed
  const stats = guests.reduce(
    (acc, g) => {
      const partySize = g.partySize || 1;
      const dinnerPartySize = g.dinnerPartySize || partySize;

      if (g.status === "waitlist") {
        acc.waitlist += partySize;
      }

      // Count all attending guests in cocktail list
      if (g.status === "attending") {
        acc.cocktailList += partySize;
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
      cocktailList: 0,
      dinnerConfirmed: 0,
      dinnerWaitlist: 0,
      dinnerCocktails: 0,
    }
  );

  // Calculate cocktails only: people on cocktail list who are NOT confirmed for dinner
  // For each guest confirmed for dinner, we need to subtract the overlap
  // The overlap is the minimum of their cocktail list size and dinner party size
  let cocktailsOnly = stats.cocktailList;
  guests.forEach((g) => {
    if (
      g.status === "attending" &&
      g.wantsDinner &&
      g.dinnerStatus === "confirmed"
    ) {
      const partySize = g.partySize || 1;
      const dinnerPartySize = g.dinnerPartySize || partySize;
      // Subtract the overlap: people from cocktail list who are going to dinner
      const overlap = Math.min(partySize, dinnerPartySize);
      cocktailsOnly -= overlap;
    }
  });
  stats.cocktailsOnly = Math.max(0, cocktailsOnly);

  // Attending = Cocktails Only + Dinner Confirmed
  const attending = stats.cocktailsOnly + stats.dinnerConfirmed;

  // Debug: Log stats calculation
  console.log("🔍 [Stats Debug]:", {
    cocktailList: stats.cocktailList,
    dinnerConfirmed: stats.dinnerConfirmed,
    cocktailsOnly: stats.cocktailsOnly,
    attending,
    calculation: `${stats.cocktailsOnly} (cocktails only) + ${stats.dinnerConfirmed} (dinner confirmed) = ${attending} (attending)`,
  });

  // Capacities
  const cocktailCapacity = event.maxAttendees || null;
  const cocktailSpotsLeft =
    cocktailCapacity != null
      ? Math.max(cocktailCapacity - stats.cocktailList, 0)
      : null;

  // Dinner capacity = sum of all time slots capacity
  // If dinnerMaxSeatsPerSlot is set, calculate total across all slots
  let dinnerCapacity = null;
  if (event.dinnerEnabled && event.dinnerMaxSeatsPerSlot) {
    const slots = generateDinnerTimeSlots(event);
    dinnerCapacity = slots.length * event.dinnerMaxSeatsPerSlot;
  }
  const dinnerSpotsLeft =
    dinnerCapacity != null
      ? Math.max(dinnerCapacity - stats.dinnerConfirmed, 0)
      : null;

  // Total capacity and spots (for overall event)
  const totalCapacity = event.maxAttendees || null;
  const totalSpotsLeft =
    totalCapacity != null ? Math.max(totalCapacity - attending, 0) : null;

  const filteredGuests = guests.filter((g) => {
    if (statusFilter !== "all" && g.status !== statusFilter) return false;
    if (dinnerFilter === "with_dinner" && !g.wantsDinner) return false;
    if (dinnerFilter === "no_dinner" && g.wantsDinner) return false;
    if (dinnerFilter === "dinner_confirmed" && g.dinnerStatus !== "confirmed")
      return false;
    if (dinnerFilter === "dinner_waitlist" && g.dinnerStatus !== "waitlist")
      return false;
    if (dinnerFilter === "cocktails" && g.dinnerStatus !== "cocktails")
      return false;
    return true;
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

      <div
        className="responsive-container responsive-container-wide"
        style={{ position: "relative", zIndex: 2 }}
      >
        <div
          className="responsive-card"
          style={{
            background: "rgba(12, 10, 18, 0.6)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ marginBottom: "24px", fontSize: "14px", opacity: 0.7 }}>
            <Link
              to="/home"
              style={{
                color: "#aaa",
                textDecoration: "none",
                transition: "color 0.3s ease",
              }}
              onMouseEnter={(e) => (e.target.style.color = "#fff")}
              onMouseLeave={(e) => (e.target.style.color = "#aaa")}
            >
              ← Back to home
            </Link>
          </div>

          {/* Image section - matches Overview page structure for consistent spacing */}
          <div
            style={{
              marginBottom: "32px",
            }}
          >
            {/* Spacer to match the "Event Cover Image" label height on Overview page */}
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                opacity: 0,
                marginBottom: "12px",
                height: "20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                pointerEvents: "none",
              }}
            >
              <span>🖼️</span>
              <span>Event Cover Image</span>
            </div>
            {event.imageUrl && (
              <div
                style={{
                  width: "100%",
                  maxWidth: "500px",
                  aspectRatio: "16/9",
                  borderRadius: "16px",
                  overflow: "hidden",
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <img
                  src={event.imageUrl}
                  alt={event.title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </div>
            )}
          </div>

          <h1
            style={{
              marginBottom: "8px",
              fontSize: "clamp(24px, 4vw, 32px)",
              fontWeight: 700,
            }}
          >
            {event.title}
          </h1>

          <div
            style={{
              marginBottom: "24px",
              fontSize: "14px",
              opacity: 0.8,
              padding: "12px 16px",
              background: "rgba(20, 16, 30, 0.6)",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            Public link:{" "}
            <a
              href={`/e/${event.slug}`}
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#8b5cf6",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              pullup.se/e/{event.slug}
            </a>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "32px",
              fontSize: "14px",
              borderBottom: "2px solid rgba(255,255,255,0.08)",
              paddingBottom: "0",
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
                padding: "12px 20px",
                borderRadius: "8px 8px 0 0",
                fontWeight: 500,
                borderBottom: "2px solid transparent",
                marginBottom: "-2px",
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
                padding: "12px 20px",
                fontWeight: 700,
                color: "#fff",
                borderBottom: "2px solid #8b5cf6",
                marginBottom: "-2px",
                background: "rgba(139, 92, 246, 0.1)",
                borderRadius: "8px 8px 0 0",
              }}
            >
              👥 Guests
            </div>
          </div>

          {/* Summary Stats */}
          <div
            style={{
              marginBottom: "32px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "20px",
            }}
          >
            <StatCard
              icon="👥"
              label="Total attending"
              value={attending}
              color="linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)"
            />
            <StatCard
              icon="📋"
              label="Waitlist"
              value={stats.waitlist}
              color="#ec4899"
            />
            {event.dinnerEnabled && (
              <>
                <StatCard
                  icon="🍽️"
                  label="Dinner Confirmed"
                  value={stats.dinnerConfirmed}
                  color="#10b981"
                />
                <StatCard
                  icon="🥂"
                  label="Cocktails"
                  value={stats.cocktailsOnly}
                  color="#f59e0b"
                />
                {stats.dinnerWaitlist > 0 && (
                  <StatCard
                    icon="⏳"
                    label="Dinner Waitlist"
                    value={stats.dinnerWaitlist}
                    color="#ec4899"
                  />
                )}
                {cocktailCapacity != null && (
                  <>
                    <StatCard
                      icon="🥂"
                      label="Cocktail Capacity"
                      value={cocktailCapacity}
                      color="#f59e0b"
                    />
                    <StatCard
                      icon="✨"
                      label="Cocktail Spots Left"
                      value={cocktailSpotsLeft}
                      color="#f59e0b"
                    />
                  </>
                )}
                {dinnerCapacity != null && (
                  <>
                    <StatCard
                      icon="🍽️"
                      label="Dinner Capacity"
                      value={dinnerCapacity}
                      color="#10b981"
                    />
                    <StatCard
                      icon="✨"
                      label="Dinner Spots Left"
                      value={dinnerSpotsLeft}
                      color="#10b981"
                    />
                  </>
                )}
              </>
            )}
            {totalCapacity != null && (
              <>
                <StatCard
                  icon="📊"
                  label="Total Capacity"
                  value={totalCapacity}
                  color="#fff"
                />
                <StatCard
                  icon="✨"
                  label="Total Spots Left"
                  value={totalSpotsLeft}
                  color="#8b5cf6"
                />
              </>
            )}
          </div>

          {/* Filters */}
          <div
            style={{
              marginBottom: "32px",
              padding: "24px",
              background: "rgba(20, 16, 30, 0.5)",
              borderRadius: "20px",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                opacity: 0.9,
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>🔍</span>
              <span>Filters</span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    opacity: 0.8,
                    marginBottom: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Event Status
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <FilterChip
                    label="All"
                    active={statusFilter === "all"}
                    onClick={() => setStatusFilter("all")}
                  />
                  <FilterChip
                    label="Attending"
                    active={statusFilter === "attending"}
                    onClick={() => setStatusFilter("attending")}
                  />
                  <FilterChip
                    label="Waitlist"
                    active={statusFilter === "waitlist"}
                    onClick={() => setStatusFilter("waitlist")}
                  />
                </div>
              </div>
              {event.dinnerEnabled && (
                <div>
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      opacity: 0.8,
                      marginBottom: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Dinner Status
                  </div>
                  <div
                    style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}
                  >
                    <FilterChip
                      label="All"
                      active={dinnerFilter === "all"}
                      onClick={() => setDinnerFilter("all")}
                    />
                    <FilterChip
                      label="With Dinner"
                      active={dinnerFilter === "with_dinner"}
                      onClick={() => setDinnerFilter("with_dinner")}
                    />
                    <FilterChip
                      label="No Dinner"
                      active={dinnerFilter === "no_dinner"}
                      onClick={() => setDinnerFilter("no_dinner")}
                    />
                    <FilterChip
                      label="Dinner Confirmed"
                      active={dinnerFilter === "dinner_confirmed"}
                      onClick={() => setDinnerFilter("dinner_confirmed")}
                    />
                    <FilterChip
                      label="Cocktails"
                      active={dinnerFilter === "cocktails"}
                      onClick={() => setDinnerFilter("cocktails")}
                    />
                    <FilterChip
                      label="Dinner Waitlist"
                      active={dinnerFilter === "dinner_waitlist"}
                      onClick={() => setDinnerFilter("dinner_waitlist")}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Guests Table */}
          {filteredGuests.length === 0 ? (
            <div
              style={{
                background: "rgba(20, 16, 30, 0.6)",
                padding: "40px 24px",
                borderRadius: "16px",
                textAlign: "center",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div
                style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.5 }}
              >
                👥
              </div>
              <div style={{ fontSize: "16px", opacity: 0.7 }}>
                No guests match the selected filters.
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
                    <th
                      style={{
                        padding: "20px 24px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        opacity: 0.95,
                        color: "#fff",
                      }}
                    >
                      Guest
                    </th>
                    <th
                      style={{
                        padding: "20px 24px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        opacity: 0.95,
                        color: "#fff",
                      }}
                    >
                      Status
                    </th>
                    {event.dinnerEnabled && (
                      <>
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
                          }}
                        >
                          Cocktail List
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
                          }}
                        >
                          Dinner Party
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
                          }}
                        >
                          Total Guests
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
                          }}
                        >
                          Dinner Time
                        </th>
                      </>
                    )}
                    {!event.dinnerEnabled && (
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
                        }}
                      >
                        Total Guests
                      </th>
                    )}
                    <th
                      style={{
                        padding: "20px 24px",
                        textAlign: "right",
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        opacity: 0.95,
                        color: "#fff",
                      }}
                    >
                      RSVP Date
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
                  {filteredGuests.map((g, idx) => (
                    <tr
                      key={g.id}
                      style={{
                        borderBottom:
                          idx < filteredGuests.length - 1
                            ? "1px solid rgba(255,255,255,0.06)"
                            : "none",
                        transition: "all 0.2s ease",
                        background:
                          idx % 2 === 0
                            ? "transparent"
                            : "rgba(255,255,255,0.01)",
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
                          <td style={{ padding: "20px", textAlign: "center" }}>
                            {(() => {
                              // Cocktail List = base party size with plus-ones badge
                              const cocktailListBase = g.partySize || 1;
                              const plusOnes = g.plusOnes || 0;

                              return (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "16px",
                                      fontWeight: 700,
                                      color: "#f59e0b",
                                    }}
                                  >
                                    {cocktailListBase}
                                  </div>
                                  {plusOnes > 0 && (
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        opacity: 0.8,
                                        padding: "3px 8px",
                                        background: "rgba(245, 158, 11, 0.15)",
                                        borderRadius: "6px",
                                        border:
                                          "1px solid rgba(245, 158, 11, 0.3)",
                                        color: "#f59e0b",
                                        fontWeight: 600,
                                      }}
                                    >
                                      +{plusOnes} guest
                                      {plusOnes > 1 ? "s" : ""}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td style={{ padding: "20px", textAlign: "center" }}>
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
                          <td style={{ padding: "20px", textAlign: "center" }}>
                            {(() => {
                              // Total Guests = Dinner Party + Cocktail List (base only, plus-ones are just info)
                              const cocktailListBase = g.partySize || 1;
                              const dinnerPartySize =
                                g.dinnerStatus === "confirmed" &&
                                g.dinnerPartySize
                                  ? g.dinnerPartySize
                                  : 0;
                              const totalGuests =
                                cocktailListBase + dinnerPartySize;

                              return (
                                <div
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: 700,
                                    color: "#fff",
                                  }}
                                >
                                  {totalGuests}
                                </div>
                              );
                            })()}
                          </td>
                          <td style={{ padding: "20px", textAlign: "center" }}>
                            {g.dinnerTimeSlot ? (
                              <div
                                style={{
                                  fontSize: "13px",
                                  opacity: 0.9,
                                  fontWeight: 600,
                                  color: "#fff",
                                }}
                              >
                                {new Date(g.dinnerTimeSlot).toLocaleTimeString(
                                  "en-US",
                                  {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  }
                                )}
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
                            gap: "8px",
                            justifyContent: "center",
                          }}
                        >
                          <button
                            onClick={() => handleEditGuest(g)}
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
                            onClick={() => setShowDeleteConfirm(g)}
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

      {/* Edit Guest Modal */}
      {editingGuest && (
        <EditGuestModal
          guest={editingGuest}
          event={event}
          onClose={() => setEditingGuest(null)}
          onSave={(updates) => handleUpdateGuest(editingGuest.id, updates)}
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
        background: "rgba(20, 16, 30, 0.6)",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.08)",
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

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 18px",
        borderRadius: "999px",
        border: active
          ? "2px solid rgba(139, 92, 246, 0.6)"
          : "1px solid rgba(255,255,255,0.15)",
        background: active
          ? "rgba(139, 92, 246, 0.25)"
          : "rgba(255,255,255,0.05)",
        color: "#fff",
        fontSize: "13px",
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        transition: "all 0.2s ease",
        backdropFilter: "blur(10px)",
        boxShadow: active ? "0 4px 12px rgba(139, 92, 246, 0.2)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.target.style.borderColor = "rgba(255,255,255,0.3)";
          e.target.style.background = "rgba(255,255,255,0.1)";
          e.target.style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.target.style.borderColor = "rgba(255,255,255,0.15)";
          e.target.style.background = "rgba(255,255,255,0.05)";
          e.target.style.transform = "translateY(0)";
        }
      }}
    >
      {label}
    </button>
  );
}

function CombinedStatusBadge({ guest }) {
  const { status, wantsDinner, dinnerStatus } = guest;

  // Determine combined status label
  let label = "";
  let bg = "";
  let border = "";
  let color = "";

  if (status === "attending") {
    if (!wantsDinner || dinnerStatus === null) {
      // Attending event, no dinner
      label = "Attending";
      bg = "rgba(139, 92, 246, 0.2)";
      border = "rgba(139, 92, 246, 0.5)";
      color = "#a78bfa";
    } else if (dinnerStatus === "confirmed") {
      // Attending event + dinner confirmed
      label = "Attending";
      bg = "rgba(16, 185, 129, 0.2)";
      border = "rgba(16, 185, 129, 0.5)";
      color = "#10b981";
    } else if (dinnerStatus === "cocktails") {
      // Attending event, invited for cocktails (dinner full)
      label = "Attending cocktail";
      bg = "rgba(245, 158, 11, 0.2)";
      border = "rgba(245, 158, 11, 0.5)";
      color = "#f59e0b";
    } else if (
      dinnerStatus === "waitlist" ||
      dinnerStatus === "cocktails_waitlist"
    ) {
      // Attending event, waiting for dinner
      label = "Attending cocktail, waiting dinner";
      bg = "rgba(245, 158, 11, 0.2)";
      border = "rgba(236, 72, 153, 0.5)";
      color = "#f59e0b";
    }
  } else if (status === "waitlist") {
    if (!wantsDinner || dinnerStatus === null) {
      // Waiting for event, no dinner
      label = "Waiting cocktail";
      bg = "rgba(236, 72, 153, 0.2)";
      border = "rgba(236, 72, 153, 0.5)";
      color = "#f472b6";
    } else if (dinnerStatus === "waitlist") {
      // Waiting for event + waiting for dinner
      label = "Waiting cocktail, waiting dinner";
      bg = "rgba(236, 72, 153, 0.2)";
      border = "rgba(236, 72, 153, 0.5)";
      color = "#f472b6";
    }
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

  return (
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

function EditGuestModal({ guest, event, onClose, onSave }) {
  const [name, setName] = useState(guest.name || "");
  const [email, setEmail] = useState(guest.email || "");
  const [plusOnes, setPlusOnes] = useState(guest.plusOnes || 0);
  const [status, setStatus] = useState(guest.status || "attending");
  const [wantsDinner, setWantsDinner] = useState(guest.wantsDinner || false);
  const [dinnerTimeSlot, setDinnerTimeSlot] = useState(
    guest.dinnerTimeSlot || ""
  );
  const [dinnerPartySize, setDinnerPartySize] = useState(
    guest.dinnerPartySize || guest.partySize || 1
  );
  const [loading, setLoading] = useState(false);

  const maxPlusOnes = event.maxPlusOnesPerGuest || 0;

  // Generate dinner time slots
  const dinnerSlots =
    event.dinnerEnabled && event.dinnerStartTime && event.dinnerEndTime
      ? generateDinnerTimeSlots(event)
      : [];

  function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    const updates = {
      name: name.trim() || null,
      email: email.trim(),
      plusOnes: Math.max(0, Math.min(maxPlusOnes, parseInt(plusOnes) || 0)),
      status,
      wantsDinner: event.dinnerEnabled ? wantsDinner : false,
      dinnerTimeSlot: wantsDinner && dinnerTimeSlot ? dinnerTimeSlot : null,
      dinnerPartySize: wantsDinner
        ? Math.max(1, parseInt(dinnerPartySize) || 1)
        : null,
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
              <input
                type="number"
                min="0"
                max={maxPlusOnes}
                value={plusOnes}
                onChange={(e) =>
                  setPlusOnes(
                    Math.max(
                      0,
                      Math.min(maxPlusOnes, parseInt(e.target.value) || 0)
                    )
                  )
                }
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
                      <input
                        type="number"
                        min="1"
                        value={dinnerPartySize}
                        onChange={(e) =>
                          setDinnerPartySize(
                            Math.max(1, parseInt(e.target.value) || 1)
                          )
                        }
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
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>

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
                background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                transition: "all 0.2s ease",
              }}
            >
              {loading ? "Saving..." : "Save Changes"}
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
