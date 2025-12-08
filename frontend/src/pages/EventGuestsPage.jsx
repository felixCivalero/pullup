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

export function EventGuestsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [event, setEvent] = useState(null);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

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

  // Stats
  const stats = guests.reduce(
    (acc, g) => {
      if (g.status === "attending") acc.attending += 1;
      if (g.status === "waitlist") acc.waitlist += 1;
      return acc;
    },
    { attending: 0, waitlist: 0 }
  );

  const capacity = event.maxAttendees || null;
  const spotsLeft =
    capacity != null ? Math.max(capacity - stats.attending, 0) : null;

  const filteredGuests =
    statusFilter === "all"
      ? guests
      : guests.filter((g) => g.status === statusFilter);

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
        className="responsive-container"
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

          {event.imageUrl && (
            <div
              style={{
                width: "100%",
                maxWidth: "400px",
                aspectRatio: "16/9",
                borderRadius: "16px",
                overflow: "hidden",
                marginBottom: "24px",
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

          <h1
            style={{
              marginBottom: "4px",
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
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Guests
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom: "24px",
              fontSize: "14px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              paddingBottom: "16px",
            }}
          >
            <button
              onClick={() => navigate(`/app/events/${id}/manage`)}
              style={{
                background: "transparent",
                border: "none",
                color: "#bbb",
                cursor: "pointer",
                transition: "color 0.3s ease",
              }}
              onMouseEnter={(e) => (e.target.style.color = "#fff")}
              onMouseLeave={(e) => (e.target.style.color = "#bbb")}
            >
              Overview
            </button>
            <span style={{ fontWeight: 600, color: "#fff" }}>Guests</span>
          </div>

          {/* Summary */}
          <div
            style={{
              marginBottom: "24px",
              padding: "20px",
              background: "rgba(20, 16, 30, 0.6)",
              borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.05)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "16px",
            }}
          >
            <div>
              <div
                style={{ fontSize: "12px", opacity: 0.7, marginBottom: "4px" }}
              >
                Attending
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  background:
                    "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {stats.attending}
              </div>
            </div>
            <div>
              <div
                style={{ fontSize: "12px", opacity: 0.7, marginBottom: "4px" }}
              >
                Waitlist
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700 }}>
                {stats.waitlist}
              </div>
            </div>
            {capacity != null && (
              <>
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      opacity: 0.7,
                      marginBottom: "4px",
                    }}
                  >
                    Capacity
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 700 }}>
                    {capacity}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      opacity: 0.7,
                      marginBottom: "4px",
                    }}
                  >
                    Spots left
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 700 }}>
                    {spotsLeft}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Filters */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "24px",
              flexWrap: "wrap",
            }}
          >
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

          {/* Guests list */}
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
                No guests in this segment yet.
              </div>
            </div>
          ) : (
            <div
              style={{
                background: "rgba(20, 16, 30, 0.6)",
                padding: "24px",
                borderRadius: "16px",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              {filteredGuests.map((g) => (
                <div
                  key={g.id}
                  style={{
                    padding: "16px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    fontSize: "14px",
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    e.currentTarget.style.paddingLeft = "12px";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.paddingLeft = "0";
                  }}
                >
                  <div style={{ fontWeight: 500, marginBottom: "4px" }}>
                    {g.email}
                    {g.status && (
                      <span
                        style={{
                          fontSize: "12px",
                          opacity: 0.7,
                          marginLeft: "8px",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          background:
                            g.status === "attending"
                              ? "rgba(139, 92, 246, 0.2)"
                              : "rgba(236, 72, 153, 0.2)",
                        }}
                      >
                        {g.status}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", opacity: 0.6 }}>
                    {new Date(g.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        borderRadius: "999px",
        border: active
          ? "1px solid rgba(139, 92, 246, 0.5)"
          : "1px solid rgba(255,255,255,0.15)",
        background: active
          ? "rgba(139, 92, 246, 0.2)"
          : "rgba(255,255,255,0.05)",
        color: "#fff",
        fontSize: "13px",
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        transition: "all 0.3s ease",
        backdropFilter: "blur(10px)",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.target.style.borderColor = "rgba(255,255,255,0.3)";
          e.target.style.background = "rgba(255,255,255,0.1)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.target.style.borderColor = "rgba(255,255,255,0.15)";
          e.target.style.background = "rgba(255,255,255,0.05)";
        }
      }}
    >
      {label}
    </button>
  );
}
