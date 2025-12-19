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

export function RsvpForm({
  event,
  onSubmit,
  loading,
  onClose,
  onPartySizeChange,
  // Waitlist upgrade props
  waitlistOffer = null, // { valid, event, rsvpDetails, expiresAt }
  waitlistToken = null, // JWT token
  // Payment-related props (for paid events)
  isPaidEvent = false,
  ticketPrice = null,
  ticketCurrency = "usd",
  currentPartySize = 1,
  pendingPayment = null, // { clientSecret, amount, currency, paymentBreakdown, ... }
  PaymentFormComponent = null, // Pass PaymentForm component from parent
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [wantsDinner, setWantsDinner] = useState(false);
  const [dinnerTimeSlot, setDinnerTimeSlot] = useState(null);
  const [dinnerSeats, setDinnerSeats] = useState(1);
  const [cocktailGuests, setCocktailGuests] = useState(0);
  const [dinnerSlots, setDinnerSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Ensure no auto-focus when form mounts (prevents mobile zoom)
  useEffect(() => {
    // Blur any focused elements when form first renders
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }, []);

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

  // Notify parent of party size changes for price calculation
  useEffect(() => {
    if (onPartySizeChange) {
      onPartySizeChange(totalPartySize);
    }
  }, [totalPartySize, onPartySizeChange]);

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

    // Prevent double submission
    if (loading) {
      return;
    }

    setError("");

    // For waitlist upgrades, use locked values directly (no validation needed)
    if (waitlistOffer && waitlistOffer.rsvpDetails) {
      if (onSubmit) {
        try {
          const result = await onSubmit({
            email: waitlistOffer.rsvpDetails.email,
            name: waitlistOffer.rsvpDetails.name || null,
            plusOnes: waitlistOffer.rsvpDetails.plusOnes || 0,
            wantsDinner: waitlistOffer.rsvpDetails.wantsDinner || false,
            dinnerTimeSlot: waitlistOffer.rsvpDetails.dinnerTimeSlot || null,
            dinnerPartySize: waitlistOffer.rsvpDetails.dinnerPartySize || null,
          });

          if (result !== false) {
            // Success - form will be closed by parent
          }
        } catch (err) {
          console.error("RSVP submission error:", err);
          // Error handling is done in parent component
        }
      }
      return;
    }

    // Normal flow - validate inputs
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
        // Error handling is done in parent component
      }
    }
  }

  // If waitlist upgrade, show read-only booking summary instead of form
  const isWaitlistUpgrade = waitlistOffer && waitlistOffer.rsvpDetails;

  // If waitlist upgrade, show read-only booking summary
  if (isWaitlistUpgrade) {
    const details = waitlistOffer.rsvpDetails;
    return (
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          touchAction: "manipulation",
        }}
      >
        <div
          style={{
            padding: "20px",
            background: "rgba(255, 255, 255, 0.05)",
            borderRadius: "12px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              opacity: 0.7,
              marginBottom: "16px",
            }}
          >
            Your Booking Details
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div>
              <div
                style={{ fontSize: "12px", opacity: 0.7, marginBottom: "4px" }}
              >
                Name
              </div>
              <div style={{ fontSize: "16px", fontWeight: 500 }}>
                {details.name || "Not provided"}
              </div>
            </div>
            <div>
              <div
                style={{ fontSize: "12px", opacity: 0.7, marginBottom: "4px" }}
              >
                Email
              </div>
              <div style={{ fontSize: "16px", fontWeight: 500 }}>
                {details.email}
              </div>
            </div>
            <div>
              <div
                style={{ fontSize: "12px", opacity: 0.7, marginBottom: "4px" }}
              >
                Cocktail Guests
              </div>
              <div style={{ fontSize: "16px", fontWeight: 500 }}>
                {details.partySize || 1}{" "}
                {details.partySize === 1 ? "guest" : "guests"}
                {details.plusOnes > 0 && ` (${details.plusOnes} +1)`}
              </div>
            </div>
            {details.wantsDinner && (
              <>
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      opacity: 0.7,
                      marginBottom: "4px",
                    }}
                  >
                    Dinner
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 500 }}>
                    {details.dinnerPartySize || 1}{" "}
                    {details.dinnerPartySize === 1 ? "seat" : "seats"}
                  </div>
                </div>
                {details.dinnerTimeSlot && (
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        opacity: 0.7,
                        marginBottom: "4px",
                      }}
                    >
                      Dinner Time
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: 500 }}>
                      {new Date(details.dinnerTimeSlot).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              background: "rgba(59, 130, 246, 0.1)",
              borderRadius: "8px",
              fontSize: "13px",
              opacity: 0.9,
            }}
          >
            All details are locked - Based on your original waitlist request.
            Complete payment below to confirm your spot.
          </div>
        </div>
        {PaymentFormComponent && pendingPayment && (
          <PaymentFormComponent
            clientSecret={pendingPayment.clientSecret}
            amount={pendingPayment.amount}
            currency={pendingPayment.currency}
            onSuccess={() => {
              handleSubmit({
                preventDefault: () => {},
                stopPropagation: () => {},
              });
            }}
            onError={(err) => {
              setError(err.message || "Payment failed");
            }}
            showButton={true}
          />
        )}
        {!pendingPayment && (
          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading ? "Processing..." : "Proceed to Payment"}
          </Button>
        )}
      </form>
    );
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

      {/* Combined Party Summary + Payment Details (for paid events) or just Party Summary (for free events) */}
      {(wantsDinner || cocktailGuests > 0 || isPaidEvent) && (
        <div
          style={{
            marginTop: "24px",
            padding: "20px",
            background: isPaidEvent
              ? "rgba(20, 16, 30, 0.8)"
              : "rgba(139, 92, 246, 0.1)",
            borderRadius: "12px",
            border: isPaidEvent
              ? "1px solid rgba(255,255,255,0.1)"
              : "1px solid rgba(139, 92, 246, 0.2)",
          }}
        >
          {/* Party Summary Section */}
          {(wantsDinner || cocktailGuests > 0 || isPaidEvent) && (
            <div style={{ marginBottom: isPaidEvent ? "20px" : "0" }}>
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
                  color: isPaidEvent ? "#fff" : "#a78bfa",
                }}
              >
                Total: {totalPartySize}{" "}
                {totalPartySize === 1 ? "person" : "people"}
              </div>
              {(wantsDinner || cocktailGuests > 0) && (
                <div
                  style={{
                    fontSize: "16px",
                    color: "rgba(255, 255, 255, 0.7)",
                    lineHeight: "1.6",
                  }}
                >
                  {wantsDinner ? (
                    <>
                      Dinner: {dinnerCount} • Cocktails-only:{" "}
                      {cocktailsOnlyCount}
                    </>
                  ) : (
                    <>All {totalPartySize} for cocktails</>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Payment Details Section (only for paid events) */}
          {isPaidEvent && ticketPrice && (
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.1)",
                paddingTop: "20px",
                marginTop: "20px",
              }}
            >
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  marginBottom: "16px",
                  color: "#fff",
                }}
              >
                Payment Details
              </div>
              {/* Show payment breakdown: ticket amount + service fee = total */}
              {(() => {
                const currencyCode = pendingPayment?.currency ?? ticketCurrency;
                const symbol = currencyCode === "sek" ? "kr" : "$";

                // Calculate breakdown (use backend data if available, otherwise calculate client-side)
                let breakdown;
                if (pendingPayment?.paymentBreakdown) {
                  // Use backend-provided breakdown (after PaymentIntent is created)
                  breakdown = pendingPayment.paymentBreakdown;
                } else if (ticketPrice && currentPartySize) {
                  // Calculate client-side breakdown (before PaymentIntent is created)
                  // Platform fee percentage: 3% (should match backend)
                  const platformFeePercentage = 0.03; // 3%
                  const ticketAmount = ticketPrice * currentPartySize;
                  const platformFeeAmount = Math.round(
                    ticketAmount * platformFeePercentage
                  );
                  const customerTotalAmount = ticketAmount + platformFeeAmount;

                  breakdown = {
                    ticketAmount,
                    platformFeeAmount,
                    customerTotalAmount,
                    platformFeePercentage: platformFeePercentage * 100,
                  };
                }

                if (breakdown) {
                  // Show breakdown: ticket + service fee = total
                  const ticketAmount = (breakdown.ticketAmount / 100).toFixed(
                    2
                  );
                  const serviceFee = (
                    breakdown.platformFeeAmount / 100
                  ).toFixed(2);
                  const total = (breakdown.customerTotalAmount / 100).toFixed(
                    2
                  );

                  return (
                    <div style={{ marginBottom: "16px" }}>
                      <div
                        style={{
                          fontSize: "14px",
                          color: "rgba(255, 255, 255, 0.7)",
                          marginBottom: "4px",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>
                          Ticket
                          {currentPartySize > 1
                            ? `s (${currentPartySize}x)`
                            : ""}
                        </span>
                        <span>
                          {symbol}
                          {ticketAmount}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          color: "rgba(255, 255, 255, 0.7)",
                          marginBottom: "8px",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>Service fee</span>
                        <span>
                          {symbol}
                          {serviceFee}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: 700,
                          color: "#a78bfa",
                          display: "flex",
                          justifyContent: "space-between",
                          paddingTop: "8px",
                          borderTop: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        <span>Total</span>
                        <span>
                          {symbol}
                          {total}
                        </span>
                      </div>
                    </div>
                  );
                } else {
                  // Fallback: show simple total if breakdown not available
                  const total =
                    pendingPayment?.amount ?? ticketPrice * currentPartySize;
                  const amount = (total / 100).toFixed(2);
                  return (
                    <div
                      style={{
                        fontSize: "18px",
                        fontWeight: 700,
                        marginBottom: "16px",
                        color: "#a78bfa",
                      }}
                    >
                      Total: {symbol}
                      {amount}
                    </div>
                  );
                }
              })()}

              {/* Show "Proceed to payment" button BEFORE PaymentIntent is created */}
              {!pendingPayment && PaymentFormComponent && (
                <Button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Trigger form submission to create PaymentIntent
                    const form = e.target.closest("form");
                    if (form) {
                      form.requestSubmit();
                    }
                  }}
                  disabled={loading}
                  fullWidth
                  style={{
                    background:
                      "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                    marginBottom: "16px",
                  }}
                >
                  Proceed to payment
                </Button>
              )}

              {/* Show PaymentForm ONLY after PaymentIntent is created */}
              {pendingPayment && PaymentFormComponent && (
                <div key={`payment-form-${pendingPayment.clientSecret}`}>
                  <PaymentFormComponent
                    clientSecret={pendingPayment.clientSecret}
                    amount={pendingPayment.amount}
                    currency={pendingPayment.currency}
                    onSuccess={() => {}} // Handled by EventPage
                    onError={() => {}} // Handled by EventPage
                    showButton={true} // Always show Stripe Pay button when payment is pending
                  />
                </div>
              )}
            </div>
          )}
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
      {/* For paid events: Hide "Pull up" button entirely.
          User clicks "Proceed to payment" in the payment section instead. */}
      {!isPaidEvent && (
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
      )}

      {/* For paid events: Show Cancel button at bottom.
          "Proceed to payment" button is in the payment section above.
          Once payment is pending, Stripe's "Pay" button handles completion. */}
      {isPaidEvent && (
        <div
          style={{
            marginTop: "24px",
            display: "flex",
            gap: "12px",
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
              fullWidth
            >
              Cancel
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
