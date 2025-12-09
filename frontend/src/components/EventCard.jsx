// frontend/src/components/EventCard.jsx
import { useState, useEffect } from "react";

const API_BASE = "http://localhost:3001";

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

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function EventCard({ event, onSubmit, loading, label = "Pull up" }) {
  if (!event) return null;

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [plusOnes, setPlusOnes] = useState(0);
  const [wantsDinner, setWantsDinner] = useState(false);
  const [dinnerTimeSlot, setDinnerTimeSlot] = useState(null);
  const [dinnerPartySize, setDinnerPartySize] = useState(1);
  const [dinnerSlots, setDinnerSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const hasCapacity =
    typeof event.maxAttendees === "number" && event.maxAttendees > 0;
  const maxPlusOnes =
    typeof event.maxPlusOnesPerGuest === "number" &&
    event.maxPlusOnesPerGuest > 0
      ? event.maxPlusOnesPerGuest
      : 0;

  const dinnerEnabled = !!event.dinnerEnabled;
  const dinnerStartTime = event.dinnerStartTime
    ? new Date(event.dinnerStartTime)
    : null;
  const dinnerEndTime = event.dinnerEndTime
    ? new Date(event.dinnerEndTime)
    : null;
  const dinnerSeatingIntervalHours =
    typeof event.dinnerSeatingIntervalHours === "number"
      ? event.dinnerSeatingIntervalHours
      : 2;

  useEffect(() => {
    if (event.dinnerEnabled && event.slug) {
      setLoadingSlots(true);
      fetch(`${API_BASE}/events/${event.slug}/dinner-slots`)
        .then((res) => res.json())
        .then((data) => {
          setDinnerSlots(data.slots || []);
          if (data.slots && data.slots.length > 0) {
            const firstAvailable = data.slots.find((s) => s.available);
            if (firstAvailable) {
              setDinnerTimeSlot(firstAvailable.time);
            }
          }
        })
        .catch((err) => {
          console.error("Failed to load dinner slots", err);
        })
        .finally(() => {
          setLoadingSlots(false);
        });
    }
  }, [event.dinnerEnabled, event.slug]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!validateEmail(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    if (wantsDinner && !dinnerTimeSlot) {
      setError("Please select a dinner time slot");
      return;
    }

    if (onSubmit) {
      try {
        const result = await onSubmit({
          email: email.trim(),
          name: name.trim() || null,
          plusOnes,
          wantsDinner,
          dinnerTimeSlot: wantsDinner ? dinnerTimeSlot : null,
          dinnerPartySize: wantsDinner ? dinnerPartySize : null,
        });

        // Reset form on success
        if (result !== false) {
          setEmail("");
          setName("");
          setPlusOnes(0);
          setWantsDinner(false);
          setDinnerTimeSlot(null);
          setDinnerPartySize(1);
          setError("");
        }
      } catch (err) {
        // Error handling is done in EventPage
        console.error("RSVP submission error:", err);
      }
    }
  }

  return (
    <div
      style={{
        background:
          "linear-gradient(145deg, rgba(37, 19, 47, 0.9), rgba(66, 27, 79, 0.9))",
        padding: "clamp(24px, 5vw, 40px)",
        borderRadius: "24px",
        maxWidth: "480px",
        width: "100%",
        margin: "40px auto",
        boxShadow:
          "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.1)",
        transition: "all 0.3s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow =
          "0 30px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(139, 92, 246, 0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow =
          "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)";
      }}
    >
      {event.imageUrl && (
        <div
          style={{
            width: "100%",
            aspectRatio: "16/9",
            borderRadius: "16px",
            overflow: "hidden",
            marginBottom: "24px",
            background: "rgba(0,0,0,0.2)",
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

      <div
        style={{
          fontSize: "11px",
          textTransform: "uppercase",
          opacity: 0.7,
          letterSpacing: "0.15em",
          fontWeight: 600,
          marginBottom: "16px",
        }}
      >
        PULLUP · EVENT
      </div>

      <h1
        style={{
          fontSize: "clamp(24px, 5vw, 32px)",
          margin: "0 0 8px 0",
          fontWeight: 700,
          lineHeight: "1.2",
        }}
      >
        {event.title}
      </h1>

      {event.description && (
        <p
          style={{
            fontSize: "clamp(14px, 2vw, 16px)",
            opacity: 0.8,
            lineHeight: "1.6",
            marginBottom: "24px",
          }}
        >
          {event.description}
        </p>
      )}

      <div
        style={{
          marginTop: "24px",
          fontSize: "clamp(13px, 2vw, 15px)",
          opacity: 0.9,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {event.location && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📍</span>
            <span>{event.location}</span>
          </div>
        )}
        {event.startsAt && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🕒</span>
            <span>{new Date(event.startsAt).toLocaleString()}</span>
          </div>
        )}

        {hasCapacity && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>👥</span>
            <span>Max {event.maxAttendees} attending</span>
          </div>
        )}

        {maxPlusOnes > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>➕</span>
            <span>Bring up to {maxPlusOnes} friends</span>
          </div>
        )}

        {dinnerEnabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🍽️</span>
              <span>Dinner option available</span>
            </div>
            {dinnerStartTime && dinnerEndTime && (
              <div
                style={{
                  fontSize: "12px",
                  opacity: 0.75,
                  paddingLeft: "24px",
                }}
              >
                {dinnerStartTime.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                -{" "}
                {dinnerEndTime.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            )}
            {dinnerStartTime && dinnerEndTime && (
              <div
                style={{
                  fontSize: "11px",
                  opacity: 0.65,
                  paddingLeft: "24px",
                }}
              >
                Seatings every {dinnerSeatingIntervalHours}{" "}
                {dinnerSeatingIntervalHours === 1 ? "hour" : "hours"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* RSVP Form */}
      {onSubmit && (
        <form onSubmit={handleSubmit} style={{ marginTop: "32px" }}>
          <div
            style={{
              paddingTop: "32px",
              borderTop: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                opacity: 0.7,
                fontWeight: 600,
                marginBottom: "20px",
              }}
            >
              RSVP
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              {/* Email */}
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  opacity: 0.9,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Email <span style={{ color: "#ef4444" }}>*</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  style={{
                    ...inputStyle,
                    ...(error
                      ? {
                          border: "1px solid #ef4444",
                          boxShadow: "0 0 0 3px rgba(239, 68, 68, 0.1)",
                        }
                      : {}),
                  }}
                  placeholder="you@example.com"
                  disabled={loading}
                  autoFocus
                />
              </label>

              {/* Name */}
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  opacity: 0.9,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Name <span style={{ opacity: 0.5 }}>(optional)</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                  placeholder="Your name"
                  disabled={loading}
                />
              </label>

              {/* Plus-ones */}
              {maxPlusOnes > 0 && (
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    opacity: 0.9,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Bringing friends? (0–{maxPlusOnes})
                  <input
                    type="number"
                    min="0"
                    max={maxPlusOnes}
                    value={plusOnes}
                    onChange={(e) => {
                      const val = Math.max(
                        0,
                        Math.min(maxPlusOnes, parseInt(e.target.value, 10) || 0)
                      );
                      setPlusOnes(val);
                    }}
                    style={inputStyle}
                    placeholder="0"
                    disabled={loading}
                  />
                </label>
              )}

              {/* Dinner */}
              {event.dinnerEnabled && (
                <div
                  style={{
                    padding: "16px",
                    background: "rgba(139, 92, 246, 0.1)",
                    borderRadius: "12px",
                    border: "1px solid rgba(139, 92, 246, 0.2)",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginBottom: wantsDinner ? "16px" : "0",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={wantsDinner}
                      onChange={(e) => setWantsDinner(e.target.checked)}
                      disabled={loading || loadingSlots}
                      style={{
                        width: "20px",
                        height: "20px",
                        cursor: "pointer",
                        accentColor: "#8b5cf6",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        opacity: 0.9,
                      }}
                    >
                      🍽️ Join for dinner
                    </span>
                  </label>

                  {wantsDinner && (
                    <div style={{ marginTop: "16px" }}>
                      {loadingSlots ? (
                        <div
                          style={{
                            fontSize: "12px",
                            opacity: 0.7,
                            textAlign: "center",
                            padding: "12px",
                          }}
                        >
                          Loading available times...
                        </div>
                      ) : dinnerSlots.length === 0 ? (
                        <div
                          style={{
                            fontSize: "12px",
                            opacity: 0.7,
                            textAlign: "center",
                            padding: "12px",
                          }}
                        >
                          No dinner slots available
                        </div>
                      ) : (
                        <>
                          <div
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              marginBottom: "12px",
                              opacity: 0.8,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            Select Time Slot
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fill, minmax(100px, 1fr))",
                              gap: "8px",
                              marginBottom: "16px",
                            }}
                          >
                            {dinnerSlots.map((slot) => (
                              <button
                                key={slot.time}
                                type="button"
                                onClick={() => setDinnerTimeSlot(slot.time)}
                                disabled={!slot.available || loading}
                                style={{
                                  padding: "10px 8px",
                                  borderRadius: "8px",
                                  border:
                                    dinnerTimeSlot === slot.time
                                      ? "2px solid #8b5cf6"
                                      : "1px solid rgba(255,255,255,0.2)",
                                  background:
                                    dinnerTimeSlot === slot.time
                                      ? "rgba(139, 92, 246, 0.2)"
                                      : slot.available
                                      ? "rgba(20, 16, 30, 0.6)"
                                      : "rgba(20, 16, 30, 0.3)",
                                  color: slot.available
                                    ? "#fff"
                                    : "rgba(255,255,255,0.4)",
                                  fontSize: "11px",
                                  cursor:
                                    slot.available && !loading
                                      ? "pointer"
                                      : "not-allowed",
                                  opacity: slot.available ? 1 : 0.5,
                                  transition: "all 0.2s ease",
                                }}
                                onMouseEnter={(e) => {
                                  if (slot.available && !loading) {
                                    e.target.style.background =
                                      "rgba(139, 92, 246, 0.3)";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (slot.available && !loading) {
                                    e.target.style.background =
                                      dinnerTimeSlot === slot.time
                                        ? "rgba(139, 92, 246, 0.2)"
                                        : "rgba(20, 16, 30, 0.6)";
                                  }
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>
                                  {new Date(slot.time).toLocaleTimeString(
                                    "en-US",
                                    {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    }
                                  )}
                                </div>
                                {slot.remaining !== null && (
                                  <div
                                    style={{
                                      fontSize: "9px",
                                      opacity: 0.7,
                                      marginTop: "2px",
                                    }}
                                  >
                                    {slot.remaining} left
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>

                          <label
                            style={{
                              display: "block",
                              fontSize: "11px",
                              fontWeight: 600,
                              marginBottom: "8px",
                              opacity: 0.8,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            Party Size for Dinner
                            <input
                              type="number"
                              min="1"
                              value={dinnerPartySize}
                              onChange={(e) => {
                                const val = Math.max(
                                  1,
                                  parseInt(e.target.value, 10) || 1
                                );
                                setDinnerPartySize(val);
                              }}
                              style={{
                                ...inputStyle,
                                marginTop: "8px",
                                fontSize: "14px",
                              }}
                              placeholder="1"
                              disabled={loading}
                            />
                          </label>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div
                  style={{
                    color: "#ef4444",
                    fontSize: "12px",
                    padding: "12px",
                    background: "rgba(239, 68, 68, 0.1)",
                    borderRadius: "12px",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                  }}
                >
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: "8px",
                  width: "100%",
                  padding: "14px 20px",
                  borderRadius: "999px",
                  border: "none",
                  background: loading
                    ? "#666"
                    : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "16px",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: loading
                    ? "none"
                    : "0 10px 30px rgba(139, 92, 246, 0.4)",
                  transition: "all 0.3s ease",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: loading ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.target.style.transform = "translateY(-2px)";
                    e.target.style.boxShadow =
                      "0 15px 40px rgba(139, 92, 246, 0.6)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow =
                      "0 10px 30px rgba(139, 92, 246, 0.4)";
                  }
                }}
              >
                {loading ? "Submitting…" : label}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
