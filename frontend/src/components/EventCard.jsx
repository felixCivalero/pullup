// frontend/src/components/EventCard.jsx
//
// DYNAMIC PARTY COMPOSITION SYSTEM (DPCS) - CRITICAL SYSTEM
// See PULLUP_SYSTEM_DOCUMENTATION_V2.md for full documentation
//
// This component implements DPCS for RSVP calculations:
// - partySize = wantsDinner ? (dinnerPartySize + plusOnes) : (1 + plusOnes)
// - cocktailsOnly = wantsDinner ? plusOnes : partySize
//
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

  // Use stored capacity fields
  const cocktailCapacity = event.cocktailCapacity ?? null;
  const foodCapacity = event.foodCapacity ?? null;
  const totalCapacity = event.totalCapacity ?? null;
  const hasCapacity = cocktailCapacity !== null && cocktailCapacity > 0;

  // Get attendance data for capacity warnings
  const cocktailSpotsLeft = event._attendance?.cocktailSpotsLeft ?? null;
  const confirmed = event._attendance?.confirmed ?? 0;

  // Calculate if booking will go to waitlist (all-or-nothing)
  // ============================================================================
  // DYNAMIC PARTY COMPOSITION SYSTEM (DPCS) - CRITICAL SYSTEM
  // See PULLUP_SYSTEM_DOCUMENTATION_V2.md for full documentation
  // ============================================================================
  const dinnerPartySizeValue =
    wantsDinner && dinnerPartySize ? dinnerPartySize : 0;
  const partySize = wantsDinner
    ? dinnerPartySizeValue + plusOnes // Dinner includes booker, add cocktails-only
    : 1 + plusOnes; // No dinner: booker + cocktails-only guests

  const cocktailsOnlyForThisBooking = wantsDinner
    ? plusOnes // Only plusOnes are cocktails-only
    : partySize; // Entire party is cocktails-only

  // Check cocktail capacity (all-or-nothing)
  const willGoToWaitlistForCocktails =
    cocktailCapacity !== null &&
    cocktailSpotsLeft !== null &&
    cocktailsOnlyForThisBooking > cocktailSpotsLeft;

  // Check dinner capacity
  const selectedDinnerSlot =
    wantsDinner && dinnerTimeSlot
      ? dinnerSlots.find((s) => s.time === dinnerTimeSlot)
      : null;

  // If dinner is selected but no slot chosen yet, check if all slots are full
  const allDinnerSlotsFull =
    wantsDinner &&
    !dinnerTimeSlot &&
    dinnerSlots.length > 0 &&
    dinnerSlots.every(
      (slot) => slot.remaining !== null && slot.remaining === 0
    );

  const willGoToWaitlistForDinner =
    wantsDinner &&
    ((selectedDinnerSlot &&
      selectedDinnerSlot.remaining !== null &&
      dinnerPartySize > selectedDinnerSlot.remaining) ||
      allDinnerSlotsFull);

  // Entire booking goes to waitlist if either capacity is exceeded
  // Only if waitlist is enabled (per documentation)
  const willGoToWaitlist =
    event.waitlistEnabled &&
    (willGoToWaitlistForCocktails || willGoToWaitlistForDinner);

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
    } else {
      // Clear dinner slots if dinner is disabled
      setDinnerSlots([]);
    }
  }, [event.dinnerEnabled, event.slug, event._attendance?.cocktailSpotsLeft]); // Refetch dinner slots when capacity updates

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

    // Validate dinner party size limit (max 8)
    if (wantsDinner && dinnerPartySize > 8) {
      setError(
        "For parties larger than 8, please contact us directly via email or phone to make arrangements."
      );
      return;
    }

    // Validate dinner capacity before submission
    if (wantsDinner && dinnerTimeSlot) {
      const selectedSlot = dinnerSlots.find((s) => s.time === dinnerTimeSlot);
      if (selectedSlot) {
        // Warn if slot is not available
        if (!selectedSlot.available) {
          setError(
            "This time slot is no longer available. Please select another time."
          );
          return;
        }
        // Note: We allow booking even if capacity exceeded - it will go to waitlist
        // The UI already shows this with the button text change
      }
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
      className="responsive-card"
      style={{
        background:
          "linear-gradient(135deg, rgba(12, 10, 18, 0.95) 0%, rgba(20, 16, 30, 0.9) 100%)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        maxWidth: "900px",
        margin: "0 auto",
        boxShadow:
          "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(139, 92, 246, 0.1)",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.4)";
        e.currentTarget.style.boxShadow =
          "0 30px 80px rgba(139, 92, 246, 0.3), 0 0 0 1px rgba(139, 92, 246, 0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.boxShadow =
          "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(139, 92, 246, 0.1)";
      }}
    >
      {/* Subtle gradient overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "200px",
          background:
            "linear-gradient(180deg, rgba(139, 92, 246, 0.1) 0%, transparent 100%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div style={{ position: "relative", zIndex: 1, padding: "40px" }}>
        {event.imageUrl && (
          <div
            style={{
              width: "100%",
              aspectRatio: "16/9",
              borderRadius: "20px",
              overflow: "hidden",
              marginBottom: "32px",
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow:
                "0 20px 60px rgba(0,0,0,0.5), inset 0 0 100px rgba(139, 92, 246, 0.1)",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.4) 100%)",
                zIndex: 1,
                pointerEvents: "none",
              }}
            />
            <img
              src={event.imageUrl}
              alt={event.title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "scale(1)";
              }}
            />
          </div>
        )}

        <div
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            opacity: 0.6,
            letterSpacing: "0.2em",
            fontWeight: 700,
            marginBottom: "20px",
            background:
              "linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)",
            padding: "6px 12px",
            borderRadius: "8px",
            display: "inline-block",
            border: "1px solid rgba(139, 92, 246, 0.3)",
          }}
        >
          PULLUP · EVENT
        </div>

        <h1
          style={{
            fontSize: "clamp(32px, 6vw, 48px)",
            margin: "0 0 16px 0",
            fontWeight: 800,
            lineHeight: "1.1",
            background:
              "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.9) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "-0.02em",
          }}
        >
          {event.title}
        </h1>

        {event.description && (
          <p
            style={{
              fontSize: "clamp(15px, 2.5vw, 18px)",
              opacity: 0.85,
              lineHeight: "1.7",
              marginBottom: "32px",
              fontWeight: 400,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            {event.description}
          </p>
        )}

        <div
          style={{
            marginTop: "32px",
            marginBottom: "32px",
            padding: "24px",
            background: "rgba(20, 16, 30, 0.5)",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            {event.location && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "12px",
                  background: "rgba(139, 92, 246, 0.1)",
                  borderRadius: "12px",
                  border: "1px solid rgba(139, 92, 246, 0.2)",
                }}
              >
                <span style={{ fontSize: "20px", lineHeight: "1" }}>📍</span>
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      opacity: 0.6,
                      letterSpacing: "0.1em",
                      marginBottom: "4px",
                      fontWeight: 600,
                    }}
                  >
                    Location
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#fff",
                    }}
                  >
                    {event.location}
                  </div>
                </div>
              </div>
            )}
            {event.startsAt && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "12px",
                  background: "rgba(236, 72, 153, 0.1)",
                  borderRadius: "12px",
                  border: "1px solid rgba(236, 72, 153, 0.2)",
                }}
              >
                <span style={{ fontSize: "20px", lineHeight: "1" }}>🕒</span>
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      opacity: 0.6,
                      letterSpacing: "0.1em",
                      marginBottom: "4px",
                      fontWeight: 600,
                    }}
                  >
                    Date & Time
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#fff",
                    }}
                  >
                    {new Date(event.startsAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      opacity: 0.8,
                      marginTop: "2px",
                    }}
                  >
                    {new Date(event.startsAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RSVP Form */}
        {onSubmit && (
          <form onSubmit={handleSubmit} style={{ marginTop: "40px" }}>
            <div
              style={{
                paddingTop: "40px",
                borderTop: "2px solid rgba(255,255,255,0.1)",
                background:
                  "linear-gradient(to bottom, transparent 0%, rgba(139, 92, 246, 0.05) 100%)",
                borderRadius: "20px",
                padding: "40px",
                margin: "0 -40px -40px -40px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  opacity: 0.8,
                  fontWeight: 700,
                  marginBottom: "24px",
                  background:
                    "linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  display: "inline-block",
                  border: "1px solid rgba(139, 92, 246, 0.3)",
                }}
              >
                RSVP
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
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
                {/* Cocktail Capacity Warning */}
                {cocktailSpotsLeft !== null && cocktailSpotsLeft <= 10 && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      background:
                        cocktailSpotsLeft <= 5
                          ? "rgba(239, 68, 68, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      border:
                        cocktailSpotsLeft <= 5
                          ? "1px solid rgba(239, 68, 68, 0.3)"
                          : "1px solid rgba(245, 158, 11, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: cocktailSpotsLeft <= 5 ? "#ef4444" : "#f59e0b",
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>
                      {cocktailSpotsLeft <= 5 ? "⚠️" : "⚡"}
                    </span>
                    <span>
                      {cocktailSpotsLeft <= 5
                        ? `Only ${cocktailSpotsLeft} spot${
                            cocktailSpotsLeft === 1 ? "" : "s"
                          } left`
                        : "Few spots left"}
                    </span>
                  </div>
                )}
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
                    Add plus-ones?{" "}
                    <span style={{ opacity: 0.5 }}>
                      (max: +{maxPlusOnes} on your list)
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={maxPlusOnes}
                      value={plusOnes}
                      onChange={(e) => {
                        const val = Math.max(
                          0,
                          Math.min(
                            maxPlusOnes,
                            parseInt(e.target.value, 10) || 0
                          )
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
                                        fontSize:
                                          slot.remaining <= 5 ? "10px" : "9px",
                                        fontWeight:
                                          slot.remaining <= 5 ? 700 : 500,
                                        marginTop: "4px",
                                        color:
                                          slot.remaining <= 5
                                            ? "#ef4444"
                                            : slot.remaining <= 10
                                            ? "#f59e0b"
                                            : "rgba(255, 255, 255, 0.7)",
                                      }}
                                    >
                                      {slot.remaining <= 5
                                        ? `Only ${slot.remaining} left`
                                        : slot.remaining <= 10
                                        ? "Few spots left"
                                        : `${slot.remaining} left`}
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
                              Seats for cuisine{" "}
                              <span style={{ opacity: 0.5 }}>
                                (If more than 8, please contact us directly via
                                email or phone)
                              </span>
                              <input
                                type="number"
                                min="1"
                                max="8"
                                value={dinnerPartySize}
                                onChange={(e) => {
                                  const val = Math.max(
                                    1,
                                    Math.min(
                                      8,
                                      parseInt(e.target.value, 10) || 1
                                    )
                                  );
                                  setDinnerPartySize(val);
                                }}
                                style={{
                                  ...inputStyle,
                                  marginTop: "8px",
                                  fontSize: "14px",
                                  ...(dinnerPartySize > 8
                                    ? {
                                        border: "1px solid #ef4444",
                                        boxShadow:
                                          "0 0 0 3px rgba(239, 68, 68, 0.1)",
                                      }
                                    : {}),
                                }}
                                placeholder="1"
                                disabled={loading}
                              />
                              <div
                                style={{
                                  fontSize: "10px",
                                  opacity: 0.6,
                                  marginTop: "4px",
                                  fontStyle: "italic",
                                }}
                              >
                                Total number of people for dinner (including
                                you)
                              </div>
                              {dinnerPartySize > 8 && (
                                <div
                                  style={{
                                    marginTop: "10px",
                                    padding: "14px 16px",
                                    background: "rgba(239, 68, 68, 0.12)",
                                    borderRadius: "12px",
                                    border: "1px solid rgba(239, 68, 68, 0.3)",
                                    fontSize: "12px",
                                    color: "#ef4444",
                                    lineHeight: "1.6",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      marginBottom: "6px",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      fontSize: "13px",
                                    }}
                                  >
                                    <span style={{ fontSize: "16px" }}>⚠️</span>
                                    <span>Large party booking</span>
                                  </div>
                                  <div style={{ opacity: 0.95 }}>
                                    For parties larger than 8, please contact us
                                    directly via email or phone to make
                                    arrangements.
                                  </div>
                                </div>
                              )}
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

                {/* Summary */}
                {(wantsDinner || plusOnes > 0) && (
                  <div
                    style={{
                      marginTop: "24px",
                      padding: "18px 20px",
                      background:
                        "linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(236, 72, 153, 0.08) 100%)",
                      borderRadius: "14px",
                      border: "1px solid rgba(139, 92, 246, 0.25)",
                      backdropFilter: "blur(10px)",
                      boxShadow: "0 4px 20px rgba(139, 92, 246, 0.1)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                        flexWrap: "wrap",
                        marginBottom: "12px",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#fff",
                      }}
                    >
                      {wantsDinner && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "4px 0",
                          }}
                        >
                          <span style={{ fontSize: "16px", opacity: 0.9 }}>
                            🍽️
                          </span>
                          <span style={{ fontWeight: 600 }}>
                            {dinnerPartySize} dinner seat
                            {dinnerPartySize !== 1 ? "s" : ""}
                          </span>
                        </span>
                      )}
                      {plusOnes > 0 && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "4px 0",
                          }}
                        >
                          <span style={{ fontSize: "16px", opacity: 0.9 }}>
                            👥
                          </span>
                          <span style={{ fontWeight: 600 }}>
                            +{plusOnes} on the list
                          </span>
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "rgba(255, 255, 255, 0.75)",
                        paddingTop: "12px",
                        borderTop: "1px solid rgba(255, 255, 255, 0.12)",
                        lineHeight: "1.5",
                      }}
                    >
                      {(() => {
                        // Calculate partySize based on whether dinner is selected
                        const dinnerPartySizeValue =
                          wantsDinner && dinnerPartySize ? dinnerPartySize : 0;
                        const totalPartySize = wantsDinner
                          ? dinnerPartySizeValue + plusOnes // Dinner includes booker, add cocktails-only
                          : 1 + plusOnes; // No dinner: booker + cocktails-only guests
                        const cocktailOnlyCount = plusOnes;

                        // Show breakdown if dinner is selected
                        if (wantsDinner && dinnerPartySizeValue > 0) {
                          return (
                            <>
                              Your total party is{" "}
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: "#fff",
                                  background:
                                    "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                                  WebkitBackgroundClip: "text",
                                  WebkitTextFillColor: "transparent",
                                  backgroundClip: "text",
                                }}
                              >
                                {totalPartySize}
                              </span>{" "}
                              including you
                              {cocktailOnlyCount > 0 && (
                                <>
                                  {" "}
                                  ({dinnerPartySizeValue} for dinner
                                  {cocktailOnlyCount > 0 &&
                                    `, ${cocktailOnlyCount} for cocktails only`}
                                  )
                                </>
                              )}
                              {cocktailOnlyCount === 0 && (
                                <> (all {dinnerPartySizeValue} for dinner)</>
                              )}
                            </>
                          );
                        }

                        // No dinner selected
                        return (
                          <>
                            Your total party is{" "}
                            <span
                              style={{
                                fontWeight: 700,
                                color: "#fff",
                                background:
                                  "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text",
                              }}
                            >
                              {totalPartySize}
                            </span>{" "}
                            including you
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Error Message - Waitlist Disabled */}
                {!event.waitlistEnabled &&
                  (willGoToWaitlistForCocktails ||
                    willGoToWaitlistForDinner) && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "16px 20px",
                        background: "rgba(239, 68, 68, 0.15)",
                        borderRadius: "14px",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        fontSize: "13px",
                        color: "#f87171",
                        lineHeight: "1.6",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          marginBottom: "8px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "14px",
                        }}
                      >
                        <span style={{ fontSize: "18px" }}>⚠️</span>
                        <span>Event is full</span>
                      </div>
                      <div style={{ opacity: 0.9 }}>
                        The event is fully booked and waitlist is disabled.
                        Please try another event or contact the host directly.
                      </div>
                    </div>
                  )}

                {/* Warning - Will Go to Waitlist */}
                {willGoToWaitlist && event.waitlistEnabled && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "16px 20px",
                      background: "rgba(236, 72, 153, 0.15)",
                      borderRadius: "14px",
                      border: "1px solid rgba(236, 72, 153, 0.3)",
                      fontSize: "13px",
                      color: "#f472b6",
                      lineHeight: "1.6",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        marginBottom: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "14px",
                      }}
                    >
                      <span style={{ fontSize: "18px" }}>👀</span>
                      <span>You'll join the waitlist</span>
                    </div>
                    <div style={{ opacity: 0.9 }}>
                      {willGoToWaitlistForCocktails &&
                        !willGoToWaitlistForDinner && (
                          <div>
                            Cocktail capacity is full. If a spot opens up, the
                            host will contact you.
                          </div>
                        )}
                      {willGoToWaitlistForDinner &&
                        !willGoToWaitlistForCocktails && (
                          <div>
                            {selectedDinnerSlot
                              ? "Dinner for this time slot is full. You'll be waitlisted for dinner and contacted if a seat opens."
                              : "All dinner time slots are full. You'll be waitlisted for dinner and contacted if a seat opens."}
                          </div>
                        )}
                      {willGoToWaitlistForCocktails &&
                        willGoToWaitlistForDinner && (
                          <div>
                            This booking exceeds the current capacity. You'll be
                            added to the waitlist and contacted if a spot opens.
                          </div>
                        )}
                    </div>
                  </div>
                )}

                {/* Info - Normal Confirmed RSVP */}
                {!willGoToWaitlist && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "16px 20px",
                      background: "rgba(139, 92, 246, 0.15)",
                      borderRadius: "14px",
                      border: "1px solid rgba(139, 92, 246, 0.3)",
                      fontSize: "13px",
                      color: "#a78bfa",
                      lineHeight: "1.6",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        marginBottom: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "14px",
                      }}
                    >
                      <span style={{ fontSize: "18px" }}>ℹ️</span>
                      <span>Confirmation</span>
                    </div>
                    <div style={{ opacity: 0.9 }}>
                      You'll receive a confirmation on this screen once your
                      RSVP is submitted.
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={
                    loading || (!event.waitlistEnabled && willGoToWaitlist)
                  }
                  style={{
                    marginTop: "16px",
                    width: "100%",
                    padding: "18px 24px",
                    borderRadius: "16px",
                    border: "none",
                    background: loading
                      ? "#666"
                      : willGoToWaitlist
                      ? "linear-gradient(135deg, #ec4899 0%, #be185d 100%)"
                      : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "16px",
                    cursor:
                      loading || (!event.waitlistEnabled && willGoToWaitlist)
                        ? "not-allowed"
                        : "pointer",
                    boxShadow:
                      loading || (!event.waitlistEnabled && willGoToWaitlist)
                        ? "none"
                        : willGoToWaitlist
                        ? "0 10px 40px rgba(236, 72, 153, 0.5), 0 0 0 1px rgba(255,255,255,0.1)"
                        : "0 10px 40px rgba(139, 92, 246, 0.5), 0 0 0 1px rgba(255,255,255,0.1)",
                    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    opacity:
                      loading || (!event.waitlistEnabled && willGoToWaitlist)
                        ? 0.7
                        : 1,
                    position: "relative",
                    overflow: "hidden",
                  }}
                  onMouseEnter={(e) => {
                    if (
                      !loading &&
                      !(!event.waitlistEnabled && willGoToWaitlist)
                    ) {
                      e.target.style.transform = "translateY(-3px) scale(1.01)";
                      e.target.style.boxShadow = willGoToWaitlist
                        ? "0 20px 60px rgba(236, 72, 153, 0.7), 0 0 0 1px rgba(255,255,255,0.2)"
                        : "0 20px 60px rgba(139, 92, 246, 0.7), 0 0 0 1px rgba(255,255,255,0.2)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (
                      !loading &&
                      !(!event.waitlistEnabled && willGoToWaitlist)
                    ) {
                      e.target.style.transform = "translateY(0) scale(1)";
                      e.target.style.boxShadow = willGoToWaitlist
                        ? "0 10px 40px rgba(236, 72, 153, 0.5), 0 0 0 1px rgba(255,255,255,0.1)"
                        : "0 10px 40px rgba(139, 92, 246, 0.5), 0 0 0 1px rgba(255,255,255,0.1)";
                    }
                  }}
                >
                  <span style={{ position: "relative", zIndex: 1 }}>
                    {loading
                      ? "Submitting…"
                      : willGoToWaitlist && event.waitlistEnabled
                      ? "Join Waitlist"
                      : label}
                  </span>
                  {!loading && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: "-100%",
                        width: "100%",
                        height: "100%",
                        background:
                          "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                        transition: "left 0.6s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.left = "100%";
                      }}
                    />
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
