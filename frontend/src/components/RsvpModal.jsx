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

const errorInputStyle = {
  ...inputStyle,
  border: "1px solid #ef4444",
};

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function formatTimeSlot(slotTime) {
  const date = new Date(slotTime);
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RsvpModal({ event, onClose, onSubmit, loading }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [plusOnes, setPlusOnes] = useState(0);
  const [wantsDinner, setWantsDinner] = useState(false);
  const [dinnerTimeSlot, setDinnerTimeSlot] = useState(null);
  const [dinnerPartySize, setDinnerPartySize] = useState(1);
  const [dinnerSlots, setDinnerSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const maxPlusOnes =
    typeof event?.maxPlusOnesPerGuest === "number"
      ? event.maxPlusOnesPerGuest
      : 0;

  useEffect(() => {
    if (event?.dinnerEnabled && event?.slug) {
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
  }, [event?.dinnerEnabled, event?.slug]);

  function handleSubmit(e) {
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

    onSubmit({
      email: email.trim(),
      name: name.trim() || null,
      plusOnes,
      wantsDinner,
      dinnerTimeSlot: wantsDinner ? dinnerTimeSlot : null,
      dinnerPartySize: wantsDinner ? dinnerPartySize : null,
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgba(12, 10, 18, 0.95)",
          borderRadius: "24px",
          padding: "32px",
          maxWidth: "420px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(20px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: "clamp(20px, 4vw, 24px)",
            marginBottom: "24px",
            fontWeight: 700,
            background:
              "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.8) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          RSVP to {event?.title}
        </h2>

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 600,
              marginBottom: "20px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              opacity: 0.9,
            }}
          >
            Email *
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              style={
                error
                  ? {
                      ...inputStyle,
                      border: "1px solid #ef4444",
                      boxShadow: "0 0 0 3px rgba(239, 68, 68, 0.1)",
                    }
                  : inputStyle
              }
              placeholder="you@example.com"
              disabled={loading}
              autoFocus
            />
          </label>

          <label
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 600,
              marginBottom: "20px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              opacity: 0.9,
            }}
          >
            Name (optional)
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="Your name"
              disabled={loading}
            />
          </label>

          {maxPlusOnes > 0 && (
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: "20px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                opacity: 0.9,
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

          {event?.dinnerEnabled && (
            <div
              style={{
                marginBottom: "20px",
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
                        fontSize: "13px",
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
                        fontSize: "13px",
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
                          fontSize: "12px",
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
                          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
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
                              padding: "10px 12px",
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
                              color: slot.available ? "#fff" : "rgba(255,255,255,0.4)",
                              fontSize: "12px",
                              cursor: slot.available && !loading ? "pointer" : "not-allowed",
                              opacity: slot.available ? 1 : 0.5,
                              transition: "all 0.2s ease",
                            }}
                            onMouseEnter={(e) => {
                              if (slot.available && !loading) {
                                e.target.style.background = "rgba(139, 92, 246, 0.3)";
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
                              {new Date(slot.time).toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </div>
                            {slot.remaining !== null && (
                              <div
                                style={{
                                  fontSize: "10px",
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
                          fontSize: "12px",
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

          {error && (
            <div
              style={{
                color: "#ef4444",
                fontSize: "13px",
                marginBottom: "16px",
                padding: "12px",
                background: "rgba(239, 68, 68, 0.1)",
                borderRadius: "12px",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                flex: 1,
                padding: "12px 20px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                transition: "all 0.3s ease",
                backdropFilter: "blur(10px)",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.background = "rgba(255,255,255,0.1)";
                  e.target.style.borderColor = "rgba(255,255,255,0.3)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.target.style.background = "rgba(255,255,255,0.05)";
                  e.target.style.borderColor = "rgba(255,255,255,0.2)";
                }
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: "12px 20px",
                borderRadius: "999px",
                border: "none",
                background: loading
                  ? "#666"
                  : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading
                  ? "none"
                  : "0 10px 30px rgba(139, 92, 246, 0.4)",
                transition: "all 0.3s ease",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow = "0 15px 40px rgba(139, 92, 246, 0.6)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow = "0 10px 30px rgba(139, 92, 246, 0.4)";
                }
              }}
            >
              {loading ? "Submitting…" : "RSVP"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

