// frontend/src/pages/ManageEventPage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useToast } from "../components/Toast";
import { LocationAutocomplete } from "../components/LocationAutocomplete";

const API_BASE = "http://localhost:3001";

function isNetworkError(error) {
  return (
    error instanceof TypeError ||
    error.message.includes("Failed to fetch") ||
    error.message.includes("NetworkError")
  );
}

const inputStyle = {
  width: "100%",
  marginTop: "8px",
  padding: "12px 16px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(20, 16, 30, 0.6)",
  color: "#fff",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
  transition: "all 0.3s ease",
  backdropFilter: "blur(10px)",
};

const focusedInputStyle = {
  ...inputStyle,
  border: "1px solid rgba(139, 92, 246, 0.5)",
  boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.1)",
};

export function ManageEventPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
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
        const res = await fetch(`${API_BASE}/host/events/${id}`);
        if (!res.ok) throw new Error("Failed to load event");
        const data = await res.json();

        setEvent({
          ...data,
          startsAtLocal: data.startsAt
            ? new Date(data.startsAt).toISOString().slice(0, 16)
            : "",
          dinnerTimeLocal: data.dinnerTime
            ? new Date(data.dinnerTime).toISOString().slice(0, 16)
            : "",
          maxAttendeesInput:
            typeof data.maxAttendees === "number"
              ? String(data.maxAttendees)
              : "",
          maxPlusOnesPerGuestInput:
            typeof data.maxPlusOnesPerGuest === "number"
              ? String(data.maxPlusOnesPerGuest)
              : "0",
          dinnerMaxSeatsInput:
            typeof data.dinnerMaxSeats === "number"
              ? String(data.dinnerMaxSeats)
              : "",
          waitlistEnabled:
            typeof data.waitlistEnabled === "boolean"
              ? data.waitlistEnabled
              : true,
        });
      } catch (err) {
        console.error(err);
        if (isNetworkError(err)) {
          setNetworkError(true);
        } else {
          showToast("Could not load event", "error");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, showToast]);

  async function handleSave(e) {
    e.preventDefault();
    if (!event) return;

    setSaving(true);
    try {
      const maxAttendees =
        event.maxAttendeesInput === "" ? null : Number(event.maxAttendeesInput);

      const maxPlusOnesPerGuest = Number(event.maxPlusOnesPerGuestInput || 0);

      const dinnerMaxSeats =
        event.dinnerMaxSeatsInput === ""
          ? null
          : Number(event.dinnerMaxSeatsInput);

      const body = {
        title: event.title,
        description: event.description,
        location: event.location,
        startsAt: event.startsAtLocal
          ? new Date(event.startsAtLocal).toISOString()
          : null,
        maxAttendees,
        waitlistEnabled: !!event.waitlistEnabled,
        maxPlusOnesPerGuest,
        dinnerEnabled: !!event.dinnerEnabled,
        dinnerTime: event.dinnerTimeLocal
          ? new Date(event.dinnerTimeLocal).toISOString()
          : null,
        dinnerMaxSeats,
      };

      const res = await fetch(`${API_BASE}/host/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save event");
      }
      const updated = await res.json();
      setEvent({
        ...updated,
        startsAtLocal: updated.startsAt
          ? new Date(updated.startsAt).toISOString().slice(0, 16)
          : "",
        dinnerTimeLocal: updated.dinnerTime
          ? new Date(updated.dinnerTime).toISOString().slice(0, 16)
          : "",
        maxAttendeesInput:
          typeof updated.maxAttendees === "number"
            ? String(updated.maxAttendees)
            : "",
        maxPlusOnesPerGuestInput:
          typeof updated.maxPlusOnesPerGuest === "number"
            ? String(updated.maxPlusOnesPerGuest)
            : "0",
        dinnerMaxSeatsInput:
          typeof updated.dinnerMaxSeats === "number"
            ? String(updated.dinnerMaxSeats)
            : "",
        waitlistEnabled:
          typeof updated.waitlistEnabled === "boolean"
            ? updated.waitlistEnabled
            : true,
      });
      showToast("Event updated successfully!", "success");
    } catch (err) {
      console.error(err);
      if (isNetworkError(err)) {
        showToast(
          "Network error. Please check your connection and try again.",
          "error"
        );
      } else {
        showToast(
          err.message || "Failed to save event. Please try again.",
          "error"
        );
      }
    } finally {
      setSaving(false);
    }
  }

  // ---- loading / error states (unchanged) ----

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
            Loading event…
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

  // ---- main manage UI ----

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
            maxWidth: "800px",
            margin: "0 auto",
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
                alt={event.title || "Event"}
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
              marginBottom: "8px",
              fontSize: "clamp(24px, 4vw, 32px)",
              fontWeight: 700,
            }}
          >
            {event.title || "Untitled event"}
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

          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom: "32px",
              fontSize: "14px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              paddingBottom: "16px",
            }}
          >
            <span style={{ fontWeight: 600, color: "#fff" }}>Overview</span>
            <button
              onClick={() => navigate(`/app/events/${id}/guests`)}
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
              Guests
            </button>
          </div>

          <form
            onSubmit={handleSave}
            style={{
              background: "rgba(20, 16, 30, 0.4)",
              padding: "32px",
              borderRadius: "20px",
              border: "1px solid rgba(255,255,255,0.05)",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            {/* Basic info */}
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                opacity: 0.9,
              }}
            >
              Title
              <input
                value={event.title || ""}
                onChange={(e) => setEvent({ ...event, title: e.target.value })}
                onFocus={() => setFocusedField("title")}
                onBlur={() => setFocusedField(null)}
                style={
                  focusedField === "title" ? focusedInputStyle : inputStyle
                }
              />
            </label>

            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                opacity: 0.9,
              }}
            >
              Description
              <textarea
                value={event.description || ""}
                onChange={(e) =>
                  setEvent({ ...event, description: e.target.value })
                }
                onFocus={() => setFocusedField("description")}
                onBlur={() => setFocusedField(null)}
                style={{
                  ...(focusedField === "description"
                    ? focusedInputStyle
                    : inputStyle),
                  minHeight: "100px",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </label>

            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                opacity: 0.9,
              }}
            >
              Location
              <LocationAutocomplete
                value={event.location || ""}
                onChange={(e) =>
                  setEvent({ ...event, location: e.target.value })
                }
                onFocus={() => setFocusedField("location")}
                onBlur={() => setFocusedField(null)}
                style={
                  focusedField === "location" ? focusedInputStyle : inputStyle
                }
                disabled={saving}
              />
            </label>

            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                opacity: 0.9,
              }}
            >
              Starts at
              <input
                type="datetime-local"
                value={event.startsAtLocal || ""}
                onChange={(e) =>
                  setEvent({ ...event, startsAtLocal: e.target.value })
                }
                onFocus={() => setFocusedField("startsAt")}
                onBlur={() => setFocusedField(null)}
                style={
                  focusedField === "startsAt" ? focusedInputStyle : inputStyle
                }
              />
            </label>

            {/* Capacity + waitlist */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr",
                gap: "16px",
                alignItems: "flex-end",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.9,
                }}
              >
                Max attendees
                <input
                  type="number"
                  min="1"
                  value={event.maxAttendeesInput}
                  placeholder="Unlimited"
                  onChange={(e) =>
                    setEvent({ ...event, maxAttendeesInput: e.target.value })
                  }
                  onFocus={() => setFocusedField("maxAttendees")}
                  onBlur={() => setFocusedField(null)}
                  style={
                    focusedField === "maxAttendees"
                      ? focusedInputStyle
                      : inputStyle
                  }
                />
              </label>

              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  fontSize: "13px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.9,
                  gap: "8px",
                }}
              >
                Waitlist
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 12px",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(20, 16, 30, 0.6)",
                  }}
                >
                  <span style={{ fontSize: "14px", opacity: 0.8 }}>
                    Enable waitlist when full
                  </span>
                  <label
                    style={{
                      position: "relative",
                      display: "inline-block",
                      width: "40px",
                      height: "20px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!event.waitlistEnabled}
                      onChange={(e) =>
                        setEvent({
                          ...event,
                          waitlistEnabled: e.target.checked,
                        })
                      }
                      style={{ display: "none" }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: event.waitlistEnabled
                          ? "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)"
                          : "rgba(255,255,255,0.15)",
                        borderRadius: "10px",
                        transition: "all 0.3s ease",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: "2px",
                          left: event.waitlistEnabled ? "22px" : "2px",
                          width: "16px",
                          height: "16px",
                          background: "#fff",
                          borderRadius: "50%",
                          transition: "all 0.3s ease",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                        }}
                      />
                    </span>
                  </label>
                </div>
              </label>
            </div>

            {/* Plus-ones + dinner */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.9,
                }}
              >
                Max plus-ones per guest
                <input
                  type="number"
                  min="0"
                  max="3"
                  value={event.maxPlusOnesPerGuestInput}
                  onChange={(e) =>
                    setEvent({
                      ...event,
                      maxPlusOnesPerGuestInput: e.target.value,
                    })
                  }
                  onFocus={() => setFocusedField("maxPlusOnes")}
                  onBlur={() => setFocusedField(null)}
                  style={
                    focusedField === "maxPlusOnes"
                      ? focusedInputStyle
                      : inputStyle
                  }
                />
              </label>

              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  fontSize: "13px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.9,
                  gap: "8px",
                }}
              >
                Dinner option
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 12px",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(20, 16, 30, 0.6)",
                  }}
                >
                  <span style={{ fontSize: "14px", opacity: 0.8 }}>
                    Allow guests to opt into dinner
                  </span>
                  <label
                    style={{
                      position: "relative",
                      display: "inline-block",
                      width: "40px",
                      height: "20px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!event.dinnerEnabled}
                      onChange={(e) =>
                        setEvent({
                          ...event,
                          dinnerEnabled: e.target.checked,
                        })
                      }
                      style={{ display: "none" }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: event.dinnerEnabled
                          ? "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)"
                          : "rgba(255,255,255,0.15)",
                        borderRadius: "10px",
                        transition: "all 0.3s ease",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: "2px",
                          left: event.dinnerEnabled ? "22px" : "2px",
                          width: "16px",
                          height: "16px",
                          background: "#fff",
                          borderRadius: "50%",
                          transition: "all 0.3s ease",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                        }}
                      />
                    </span>
                  </label>
                </div>
              </label>
            </div>

            {event.dinnerEnabled && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.3fr 0.7fr",
                  gap: "16px",
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    opacity: 0.9,
                  }}
                >
                  Dinner time
                  <input
                    type="datetime-local"
                    value={event.dinnerTimeLocal || ""}
                    onChange={(e) =>
                      setEvent({ ...event, dinnerTimeLocal: e.target.value })
                    }
                    onFocus={() => setFocusedField("dinnerTime")}
                    onBlur={() => setFocusedField(null)}
                    style={
                      focusedField === "dinnerTime"
                        ? focusedInputStyle
                        : inputStyle
                    }
                  />
                </label>

                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    opacity: 0.9,
                  }}
                >
                  Dinner seats
                  <input
                    type="number"
                    min="1"
                    value={event.dinnerMaxSeatsInput}
                    placeholder="Unlimited"
                    onChange={(e) =>
                      setEvent({
                        ...event,
                        dinnerMaxSeatsInput: e.target.value,
                      })
                    }
                    onFocus={() => setFocusedField("dinnerSeats")}
                    onBlur={() => setFocusedField(null)}
                    style={
                      focusedField === "dinnerSeats"
                        ? focusedInputStyle
                        : inputStyle
                    }
                  />
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{
                marginTop: "8px",
                padding: "14px 28px",
                borderRadius: "999px",
                border: "none",
                background: saving
                  ? "#666"
                  : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "15px",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                boxShadow: saving
                  ? "none"
                  : "0 10px 30px rgba(139, 92, 246, 0.4)",
                transition: "all 0.3s ease",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                alignSelf: "flex-start",
              }}
              onMouseEnter={(e) => {
                if (!saving) {
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow =
                    "0 15px 40px rgba(139, 92, 246, 0.6)";
                }
              }}
              onMouseLeave={(e) => {
                if (!saving) {
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow =
                    "0 10px 30px rgba(139, 92, 246, 0.4)";
                }
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
