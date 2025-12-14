// frontend/src/components/RsvpForm.jsx
// Mobile-first RSVP form with improved dinner UX
import { useState, useEffect } from "react";
import { Input } from "./ui/Input";
import { Stepper } from "./ui/Stepper";
import { Button } from "./ui/Button";
import { publicFetch } from "../lib/api.js";

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function RsvpForm({ event, onSubmit, loading, onClose }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [wantsDinner, setWantsDinner] = useState(false);
  const [dinnerTimeSlot, setDinnerTimeSlot] = useState(null);
  const [dinnerSeats, setDinnerSeats] = useState(1);
  const [cocktailGuests, setCocktailGuests] = useState(0);
  const [dinnerSlots, setDinnerSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const maxPlusOnes =
    typeof event?.maxPlusOnesPerGuest === "number" &&
    event?.maxPlusOnesPerGuest > 0
      ? event?.maxPlusOnesPerGuest
      : 0;

  // Load dinner slots if dinner is enabled
  useEffect(() => {
    if (event?.dinnerEnabled && event?.slug) {
      setLoadingSlots(true);
      publicFetch(`/events/${event.slug}/dinner-slots`)
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

  // Calculate live summary
  const totalPartySize = wantsDinner
    ? dinnerSeats + cocktailGuests
    : 1 + cocktailGuests;
  const dinnerCount = wantsDinner ? dinnerSeats : 0;
  const cocktailsOnlyCount = cocktailGuests;

  // Check capacity
  const cocktailSpotsLeft = event?._attendance?.cocktailSpotsLeft ?? null;
  const selectedSlot =
    wantsDinner && dinnerTimeSlot
      ? dinnerSlots.find((s) => s.time === dinnerTimeSlot)
      : null;

  const willGoToWaitlist =
    event?.waitlistEnabled &&
    ((cocktailSpotsLeft !== null && cocktailsOnlyCount > cocktailSpotsLeft) ||
      (wantsDinner &&
        selectedSlot &&
        selectedSlot.remaining !== null &&
        dinnerSeats > selectedSlot.remaining));

  async function handleSubmit(e) {
    e.preventDefault();
    e.stopPropagation();

    // Prevent viewport zoom and scrolling on mobile
    if (document.activeElement) {
      document.activeElement.blur();
    }

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
      setError("Please select a dinner time");
      return;
    }

    if (wantsDinner && dinnerSeats > 8) {
      setError("For parties larger than 8, please contact the host directly");
      return;
    }

    if (onSubmit) {
      try {
        const result = await onSubmit({
          email: email.trim(),
          name: name.trim() || null,
          plusOnes: cocktailGuests,
          wantsDinner,
          dinnerTimeSlot: wantsDinner ? dinnerTimeSlot : null,
          dinnerPartySize: wantsDinner ? dinnerSeats : null,
        });

        if (result !== false) {
          // Success - form will be closed by parent
        }
      } catch (err) {
        console.error("RSVP submission error:", err);
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        width: "100%",
        // Prevent viewport zoom on mobile
        touchAction: "manipulation",
      }}
      onTouchStart={(e) => {
        // Prevent double-tap zoom
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      }}
    >
      <Input
        label="Email"
        type="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError("");
        }}
        placeholder="you@example.com"
        disabled={loading}
        error={error && error.includes("email") ? error : null}
        autoFocus
      />

      <Input
        label="Name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name (optional)"
        disabled={loading}
      />

      {/* Dinner Toggle */}
      {event?.dinnerEnabled && (
        <div
          style={{
            marginBottom: "24px",
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
              marginBottom: wantsDinner ? "20px" : "0",
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
            <span style={{ fontSize: "16px", fontWeight: 600, color: "#fff" }}>
              Dinner?
            </span>
          </label>

          {wantsDinner && (
            <div style={{ marginTop: "20px" }}>
              {loadingSlots ? (
                <div
                  style={{
                    fontSize: "16px",
                    opacity: 0.7,
                    textAlign: "center",
                    padding: "12px",
                  }}
                >
                  Loading times...
                </div>
              ) : dinnerSlots.length === 0 ? (
                <div
                  style={{
                    fontSize: "16px",
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
                      fontSize: "16px",
                      fontWeight: 600,
                      marginBottom: "12px",
                      opacity: 0.8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "#fff",
                    }}
                  >
                    Select Time
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(90px, 1fr))",
                      gap: "10px",
                      marginBottom: "20px",
                    }}
                  >
                    {dinnerSlots.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => setDinnerTimeSlot(slot.time)}
                        disabled={!slot.available || loading}
                        style={{
                          padding: "14px 10px",
                          borderRadius: "10px",
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
                          fontSize: "16px",
                          fontWeight: 600,
                          cursor:
                            slot.available && !loading
                              ? "pointer"
                              : "not-allowed",
                          opacity: slot.available ? 1 : 0.5,
                          transition: "all 0.2s ease",
                          WebkitTapHighlightColor: "transparent",
                          touchAction: "manipulation",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: "16px" }}>
                          {new Date(slot.time).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </div>
                        {slot.remaining !== null && (
                          <div
                            style={{
                              fontSize: "14px",
                              marginTop: "4px",
                              opacity: 0.7,
                            }}
                          >
                            {slot.remaining} left
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  <Stepper
                    label="Dinner seats"
                    value={dinnerSeats}
                    onChange={setDinnerSeats}
                    min={1}
                    max={8}
                    helperText="Total number of people for dinner (including you)"
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cocktails-only guests */}
      {maxPlusOnes > 0 && (
        <Stepper
          label={
            wantsDinner ? "Bring extra friends for cocktails" : "Add guests"
          }
          value={cocktailGuests}
          onChange={setCocktailGuests}
          min={0}
          max={maxPlusOnes}
          helperText={
            wantsDinner
              ? "Friends who'll join for cocktails only"
              : `Up to ${maxPlusOnes} guests`
          }
        />
      )}

      {/* Live Summary */}
      {(wantsDinner || cocktailGuests > 0) && (
        <div
          style={{
            marginTop: "24px",
            padding: "16px",
            background: "rgba(139, 92, 246, 0.1)",
            borderRadius: "12px",
            border: "1px solid rgba(139, 92, 246, 0.2)",
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "8px",
              color: "#fff",
            }}
          >
            Your party
          </div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              marginBottom: "8px",
              color: "#a78bfa",
            }}
          >
            Total: {totalPartySize} {totalPartySize === 1 ? "person" : "people"}
          </div>
          <div
            style={{
              fontSize: "16px",
              color: "rgba(255, 255, 255, 0.7)",
              lineHeight: "1.6",
            }}
          >
            {wantsDinner ? (
              <>
                Dinner: {dinnerCount} • Cocktails-only: {cocktailsOnlyCount}
              </>
            ) : (
              <>All {totalPartySize} for cocktails</>
            )}
          </div>
        </div>
      )}

      {/* Waitlist Warning */}
      {willGoToWaitlist && event?.waitlistEnabled && (
        <div
          style={{
            marginTop: "16px",
            padding: "14px",
            background: "rgba(245, 158, 11, 0.15)",
            borderRadius: "12px",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            fontSize: "16px",
            color: "#fbbf24",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>
            You'll join the waitlist
          </div>
          <div style={{ opacity: 0.9, fontSize: "16px" }}>
            If spots open up, the host will contact you.
          </div>
        </div>
      )}

      {/* Error */}
      {error && !error.includes("email") && (
        <div
          style={{
            marginTop: "16px",
            padding: "14px",
            background: "rgba(239, 68, 68, 0.15)",
            borderRadius: "12px",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            fontSize: "16px",
            color: "#ef4444",
          }}
        >
          {error}
        </div>
      )}

      {/* Submit Button */}
      <div
        style={{
          marginTop: "24px",
          display: "flex",
          gap: "12px",
          // Prevent scroll/zoom issues on mobile
          position: "relative",
          zIndex: 1,
        }}
      >
        {onClose && (
          <Button
            type="button"
            variant="secondary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (document.activeElement) {
                document.activeElement.blur();
              }
              onClose();
            }}
            disabled={loading}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          loading={loading}
          disabled={loading || (wantsDinner && !dinnerTimeSlot)}
          fullWidth={!onClose}
          style={{
            ...(onClose ? { flex: 2 } : {}),
            // Prevent mobile zoom/scroll issues
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
          onClick={(e) => {
            // Additional prevention of unwanted behavior
            e.stopPropagation();
          }}
        >
          {willGoToWaitlist && event?.waitlistEnabled
            ? "Join waitlist"
            : "Pull up"}
        </Button>
      </div>
    </form>
  );
}
