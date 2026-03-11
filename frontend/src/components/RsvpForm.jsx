// frontend/src/components/RsvpForm.jsx
// Sleek, native-feeling RSVP form
import { useState, useEffect } from "react";
import { publicFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { formatEventTime } from "../lib/dateUtils.js";

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
  waitlistOffer = null,
  waitlistToken = null,
  // VIP invite props
  vipOffer = null,
  vipToken = null,
  // Payment-related props
  isPaidEvent = false,
  ticketPrice = null,
  ticketCurrency = "usd",
  currentPartySize = 1,
  pendingPayment = null,
  PaymentFormComponent = null,
  // Preview mode: pass pre-built slots to skip API call
  previewSlots = null,
}) {
  const [email, setEmail] = useState(vipOffer?.invite?.email || "");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [wantsDinner, setWantsDinner] = useState(false);
  const [dinnerTimeSlot, setDinnerTimeSlot] = useState(null);
  const [dinnerSeats, setDinnerSeats] = useState(1);
  const [cocktailGuests, setCocktailGuests] = useState(0);
  const [dinnerSlots, setDinnerSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  useEffect(() => {
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }, []);

  const baseMaxPlusOnes =
    typeof event?.maxPlusOnesPerGuest === "number" &&
    event?.maxPlusOnesPerGuest > 0
      ? event?.maxPlusOnesPerGuest
      : 0;

  const vipMaxGuests =
    vipOffer && vipOffer.invite && typeof vipOffer.invite.maxGuests === "number"
      ? vipOffer.invite.maxGuests
      : null;

  const maxPlusOnes =
    vipMaxGuests && vipMaxGuests > 0
      ? Math.max(0, vipMaxGuests - 1)
      : baseMaxPlusOnes;

  useEffect(() => {
    if (!event?.dinnerEnabled) return;

    // Preview mode: use pre-built slots directly
    if (previewSlots && previewSlots.length > 0) {
      setDinnerSlots(previewSlots);
      const first = previewSlots.find((s) => s.available !== false) || previewSlots[0];
      if (first) setDinnerTimeSlot(first.time);
      return;
    }

    if (event?.slug) {
      setLoadingSlots(true);
      publicFetch(`/events/${event.slug}/dinner-slots`)
        .then((res) => res.json())
        .then((data) => {
          setDinnerSlots(data.slots || []);
          if (data.slots && data.slots.length > 0) {
            const firstAvailable = data.slots.find((s) => s.available);
            if (firstAvailable) {
              setDinnerTimeSlot(firstAvailable.time);
            } else {
              setDinnerTimeSlot(data.slots[0].time);
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
  }, [event?.dinnerEnabled, event?.slug, previewSlots]);

  const totalPartySize = wantsDinner
    ? dinnerSeats + cocktailGuests
    : 1 + cocktailGuests;
  const dinnerCount = wantsDinner ? dinnerSeats : 0;
  const cocktailsOnlyCount = cocktailGuests;

  useEffect(() => {
    if (onPartySizeChange) {
      onPartySizeChange(totalPartySize);
    }
  }, [totalPartySize, onPartySizeChange]);

  const cocktailSpotsLeft = event?._attendance?.cocktailSpotsLeft ?? null;
  const selectedSlot =
    wantsDinner && dinnerTimeSlot
      ? dinnerSlots.find((s) => s.time === dinnerTimeSlot)
      : null;

  const maxDinnerPerBooking =
    (selectedSlot && selectedSlot.maxGuestsPerBooking) || 8;

  const cocktailsOnlyForThisBooking = wantsDinner
    ? cocktailGuests
    : 1 + cocktailGuests;

  const willGoToWaitlist =
    event?.waitlistEnabled &&
    ((cocktailSpotsLeft !== null &&
      cocktailsOnlyForThisBooking > cocktailSpotsLeft) ||
      (wantsDinner &&
        selectedSlot &&
        selectedSlot.remaining !== null &&
        dinnerSeats > selectedSlot.remaining));

  async function handleSubmit(e) {
    e.preventDefault();
    e.stopPropagation();

    if (document.activeElement) {
      document.activeElement.blur();
    }

    if (loading) return;
    setError("");

    if (isWaitlistUpgrade) {
      if (onSubmit) {
        try {
          const details = waitlistOffer.rsvpDetails;
          const result = await onSubmit({
            email: details.email,
            name: details.name || null,
            plusOnes: details.plusOnes || 0,
            wantsDinner: details.wantsDinner || false,
            dinnerTimeSlot: details.dinnerTimeSlot || null,
            dinnerPartySize: details.dinnerPartySize || null,
          });
          if (result !== false) { /* success */ }
        } catch (err) {
          console.error("RSVP submission error:", err);
        }
      }
      return;
    }

    if (!isVipInvite) {
      if (!email.trim()) {
        setError("Email is required");
        return;
      }
      if (!validateEmail(email.trim())) {
        setError("Please enter a valid email address");
        return;
      }
    }

    if (wantsDinner && !dinnerTimeSlot) {
      setError("Please select a dinner time");
      return;
    }

    if (wantsDinner && dinnerSeats > maxDinnerPerBooking) {
      setError("For parties larger than this slot allows, please contact the host directly");
      return;
    }

    if (!marketingOptIn) {
      setError("You must agree to the terms and privacy policy");
      return;
    }

    if (onSubmit) {
      try {
        const result = await onSubmit({
          email: isVipInvite ? (vipOffer.invite?.email || "").trim() : email.trim(),
          name: name.trim() || null,
          plusOnes: cocktailGuests,
          wantsDinner,
          dinnerTimeSlot: wantsDinner ? dinnerTimeSlot : null,
          dinnerPartySize: wantsDinner ? dinnerSeats : null,
          marketingOptIn,
        });
        if (result !== false) { /* success */ }
      } catch (err) {
        console.error("RSVP submission error:", err);
      }
    }
  }

  const isWaitlistUpgrade = waitlistOffer && waitlistOffer.rsvpDetails;
  const isVipInvite = !!vipOffer && !!vipOffer.invite;

  // ─── Waitlist Upgrade: read-only summary ───
  if (isWaitlistUpgrade) {
    const details = waitlistOffer.rsvpDetails;
    const waitlistEvent = waitlistOffer.event || event;
    const waitlistTicketPrice = waitlistEvent?.ticketPrice || ticketPrice;
    const waitlistTicketCurrency = (waitlistEvent?.ticketCurrency || ticketCurrency || "usd").toLowerCase();
    const waitlistIsPaidEvent = waitlistEvent?.ticketType === "paid" || isPaidEvent;
    return (
      <form onSubmit={handleSubmit} style={{ width: "100%", touchAction: "manipulation" }}>
        <div style={{
          padding: "16px",
          background: "rgba(255, 255, 255, 0.04)",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          marginBottom: "16px",
        }}>
          <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.5, marginBottom: "12px" }}>
            Your Booking
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ opacity: 0.6 }}>Name</span>
              <span style={{ fontWeight: 500 }}>{details.name || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ opacity: 0.6 }}>Email</span>
              <span style={{ fontWeight: 500 }}>{details.email}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ opacity: 0.6 }}>Guests</span>
              <span style={{ fontWeight: 500 }}>
                {(() => {
                  const ps = details.partySize || 1;
                  const wd = details.wantsDinner || false;
                  const dp = details.dinnerPartySize || 0;
                  const po = details.plusOnes || 0;
                  if (wd && dp > 0) return `${ps} (${dp} dinner${po > 0 ? ` + ${po} cocktails` : ""})`;
                  if (po > 0) return `${ps} (you + ${po})`;
                  return `${ps}`;
                })()}
              </span>
            </div>
          </div>
          <div style={{
            marginTop: "12px",
            padding: "10px 12px",
            background: "rgba(59, 130, 246, 0.08)",
            borderRadius: "10px",
            fontSize: "12px",
            opacity: 0.8,
            lineHeight: "1.4",
          }}>
            Details locked from your original request. Complete payment to confirm.
          </div>
        </div>

        {waitlistIsPaidEvent && waitlistTicketPrice && details.partySize && (
          <PaymentBreakdown
            ticketPrice={waitlistTicketPrice}
            partySize={details.partySize}
            currency={pendingPayment?.currency ?? waitlistTicketCurrency}
            pendingPayment={pendingPayment}
          />
        )}

        {PaymentFormComponent && pendingPayment && (
          <PaymentFormComponent
            clientSecret={pendingPayment.clientSecret}
            amount={pendingPayment.amount}
            currency={pendingPayment.currency}
            onSuccess={() => handleSubmit({ preventDefault: () => {}, stopPropagation: () => {} })}
            onError={(err) => setError(err.message || "Payment failed")}
            showButton={true}
          />
        )}
        {!pendingPayment && (
          <button type="submit" disabled={loading} style={submitButtonStyle(loading)}>
            {loading ? "Processing..." : "Proceed to Payment"}
          </button>
        )}
      </form>
    );
  }

  // ─── Normal RSVP Form ───
  return (
    <form
      onSubmit={handleSubmit}
      style={{ width: "100%", touchAction: "manipulation" }}
      onTouchStart={(e) => { if (e.touches.length > 1) e.preventDefault(); }}
    >
      {/* Email & Name — compact stacked inputs */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
        <div style={{ position: "relative" }}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => { if (!isVipInvite) { setEmail(e.target.value); setError(""); } }}
            placeholder="Email"
            disabled={loading}
            readOnly={isVipInvite}
            autoComplete="email"
            style={{
              ...inputStyle,
              borderColor: error && error.includes("email") ? "rgba(239, 68, 68, 0.5)" : undefined,
              ...(isVipInvite ? { opacity: 0.7, cursor: "default" } : {}),
            }}
          />
          {error && error.includes("email") && (
            <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "4px", paddingLeft: "2px" }}>
              {error}
            </div>
          )}
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          disabled={loading}
          autoComplete="name"
          style={inputStyle}
        />
      </div>

      {/* Dinner toggle — sleek card */}
      {event?.dinnerEnabled && (
        <div style={{ marginBottom: "16px" }}>
          <button
            type="button"
            onClick={() => !loading && !loadingSlots && setWantsDinner(!wantsDinner)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "14px 16px",
              borderRadius: "14px",
              border: wantsDinner ? `1px solid ${colors.silverRgba}` : "1px solid rgba(255, 255, 255, 0.08)",
              background: wantsDinner ? "rgba(192, 192, 192, 0.08)" : "rgba(255, 255, 255, 0.03)",
              cursor: loading || loadingSlots ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              WebkitTapHighlightColor: "transparent",
              textAlign: "left",
              color: "#fff",
            }}
          >
            <span style={{ fontSize: "20px", lineHeight: 1 }}>🍽</span>
            <span style={{ flex: 1, fontSize: "15px", fontWeight: 500 }}>
              Add dinner
            </span>
            {/* Toggle pill */}
            <div style={{
              width: "44px",
              height: "26px",
              borderRadius: "13px",
              background: wantsDinner
                ? colors.gradientPrimary
                : "rgba(255, 255, 255, 0.1)",
              padding: "3px",
              transition: "background 0.2s ease",
              flexShrink: 0,
              boxSizing: "border-box",
            }}>
              <div style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: wantsDinner ? "#05040a" : "rgba(255, 255, 255, 0.4)",
                transform: wantsDinner ? "translateX(18px)" : "translateX(0)",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              }} />
            </div>
          </button>

          {/* Dinner details — time + seats in one compact block */}
          {wantsDinner && (
            <div style={{
              marginTop: "10px",
              padding: "14px",
              borderRadius: "14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}>
              {loadingSlots ? (
                <div style={{ fontSize: "13px", opacity: 0.5, textAlign: "center", padding: "8px" }}>
                  Loading times...
                </div>
              ) : dinnerSlots.length === 0 ? (
                <div style={{ fontSize: "13px", opacity: 0.5, textAlign: "center", padding: "8px" }}>
                  No dinner slots available
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {dinnerSlots.map((slot) => {
                      const isFull = slot.remaining !== null && slot.remaining === 0;
                      const isSelected = dinnerTimeSlot === slot.time;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => setDinnerTimeSlot(slot.time)}
                          disabled={loading}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: isSelected ? "10px 10px 10px 14px" : "10px 14px",
                            borderRadius: "12px",
                            border: isSelected
                              ? `1.5px solid ${colors.silver}`
                              : isFull
                              ? "1px solid rgba(245, 158, 11, 0.2)"
                              : "1px solid rgba(255, 255, 255, 0.06)",
                            background: isSelected
                              ? "rgba(192, 192, 192, 0.1)"
                              : "transparent",
                            color: "#fff",
                            cursor: loading ? "not-allowed" : "pointer",
                            transition: "all 0.15s ease",
                            WebkitTapHighlightColor: "transparent",
                            textAlign: "left",
                          }}
                        >
                          <span style={{
                            fontSize: "15px",
                            fontWeight: isSelected ? 600 : 400,
                            color: isFull && !isSelected ? "rgba(245, 158, 11, 0.8)" : "#fff",
                          }}>
                            {formatEventTime(slot.time, event?.timezone)}
                          </span>
                          {slot.remaining !== null && (
                            <span style={{
                              fontSize: "11px",
                              opacity: 0.5,
                              color: isFull ? "rgba(245, 158, 11, 0.7)" : undefined,
                            }}>
                              {isFull ? "waitlist" : `${slot.remaining} left`}
                            </span>
                          )}
                          {/* Seats stepper — only on selected row */}
                          {isSelected && (
                            <div
                              style={{ marginLeft: "auto" }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <InlineStepper
                                value={dinnerSeats}
                                onChange={setDinnerSeats}
                                min={1}
                                max={maxDinnerPerBooking}
                              />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {event?.dinnerBookingEmail && (
                    <div style={{
                      fontSize: "12px", opacity: 0.5, lineHeight: "1.4", marginTop: "4px",
                    }}>
                      For large or specific bookings:{" "}
                      <a
                        href={`mailto:${event.dinnerBookingEmail}`}
                        style={{ color: colors.silverText, textDecoration: "underline" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {event.dinnerBookingEmail}
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bring friends — always same name, consistent UX */}
      {maxPlusOnes > 0 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderRadius: "14px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          marginBottom: "16px",
        }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "#fff" }}>
              Bring friends
            </div>
            <div style={{ fontSize: "12px", opacity: 0.4, marginTop: "2px" }}>
              Up to {maxPlusOnes}{wantsDinner ? " · cocktails only" : ""}
            </div>
          </div>
          <InlineStepper
            value={cocktailGuests}
            onChange={setCocktailGuests}
            min={0}
            max={maxPlusOnes}
          />
        </div>
      )}

      {/* Party summary — always visible */}
      {!isPaidEvent && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 16px",
          borderRadius: "12px",
          background: "rgba(255, 255, 255, 0.02)",
          marginBottom: "16px",
          fontSize: "13px",
        }}>
          <span style={{ opacity: 0.5 }}>Your party</span>
          <span style={{ fontWeight: 600 }}>
            {totalPartySize} {totalPartySize === 1 ? "person" : "people"}
            {wantsDinner && dinnerCount > 0 && (
              <span style={{ fontWeight: 400, opacity: 0.5, marginLeft: "6px" }}>
                ({dinnerCount} dinner{cocktailsOnlyCount > 0 ? ` + ${cocktailsOnlyCount} cocktails` : ""})
              </span>
            )}
          </span>
        </div>
      )}

      {/* Payment section for paid events */}
      {isPaidEvent && ticketPrice && !willGoToWaitlist && (
        <div style={{
          padding: "16px",
          borderRadius: "14px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          marginBottom: "16px",
        }}>
          {/* Party summary inside payment */}
          {(wantsDinner || cocktailGuests > 0) && (
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
              paddingBottom: "12px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
              fontSize: "13px",
            }}>
              <span style={{ opacity: 0.6 }}>Your party</span>
              <span style={{ fontWeight: 500 }}>
                {totalPartySize} {totalPartySize === 1 ? "person" : "people"}
              </span>
            </div>
          )}
          <PaymentBreakdown
            ticketPrice={ticketPrice}
            partySize={currentPartySize}
            currency={pendingPayment?.currency ?? ticketCurrency}
            pendingPayment={pendingPayment}
          />
          {!pendingPayment && PaymentFormComponent && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.5)", cursor: "pointer", textAlign: "left", margin: "12px 0", padding: "0 2px" }}>
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                  style={{ accentColor: "#fbbf24", flexShrink: 0, width: 16, height: 16 }}
                />
                <span>I agree to the <a href="/terms" target="_blank" rel="noopener" style={{ color: "rgba(255,255,255,0.7)", textDecoration: "underline" }}>terms</a> and <a href="/privacy" target="_blank" rel="noopener" style={{ color: "rgba(255,255,255,0.7)", textDecoration: "underline" }}>privacy policy</a></span>
              </label>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const form = e.target.closest("form");
                  if (form) form.requestSubmit();
                }}
                disabled={loading}
                style={submitButtonStyle(loading)}
              >
                Proceed to payment
              </button>
            </>
          )}
          {pendingPayment && PaymentFormComponent && (
            <div key={`payment-form-${pendingPayment.clientSecret}`}>
              <PaymentFormComponent
                clientSecret={pendingPayment.clientSecret}
                amount={pendingPayment.amount}
                currency={pendingPayment.currency}
                onSuccess={() => {}}
                onError={() => {}}
                showButton={true}
              />
            </div>
          )}
        </div>
      )}

      {/* Waitlist notice */}
      {willGoToWaitlist && event?.waitlistEnabled && (
        <div style={{
          padding: "12px 14px",
          borderRadius: "12px",
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.15)",
          marginBottom: "16px",
          fontSize: "13px",
          color: "#fbbf24",
          lineHeight: "1.5",
        }}>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>You'll join the waitlist</div>
          <div style={{ opacity: 0.8, fontSize: "12px" }}>
            {isPaidEvent
              ? "No payment now. You'll get a link to confirm if spots open."
              : "The host will contact you if a spot becomes available."}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !error.includes("email") && (
        <div style={{
          padding: "10px 14px",
          borderRadius: "10px",
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          fontSize: "13px",
          color: "#ef4444",
          marginBottom: "16px",
        }}>
          {error}
        </div>
      )}

      {/* Marketing opt-in (shown here for free events, inside payment section for paid) */}
      {!(isPaidEvent && ticketPrice && !willGoToWaitlist) && (
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.5)", cursor: "pointer", textAlign: "left", margin: "16px 0 12px", padding: "0 2px" }}>
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            style={{ accentColor: "#fbbf24", flexShrink: 0, width: 16, height: 16 }}
          />
          <span>I agree to the <a href="/terms" target="_blank" rel="noopener" style={{ color: "rgba(255,255,255,0.7)", textDecoration: "underline" }}>terms</a> and <a href="/privacy" target="_blank" rel="noopener" style={{ color: "rgba(255,255,255,0.7)", textDecoration: "underline" }}>privacy policy</a></span>
        </label>
      )}

      {/* Submit — single gorgeous button, no cancel */}
      {!isPaidEvent && (
        <button
          type="submit"
          disabled={loading || (wantsDinner && !dinnerTimeSlot)}
          style={submitButtonStyle(loading || (wantsDinner && !dinnerTimeSlot))}
          onClick={(e) => e.stopPropagation()}
        >
          {loading
            ? "Processing..."
            : willGoToWaitlist && event?.waitlistEnabled
            ? "Join waitlist"
            : "Pull up"}
        </button>
      )}

      {/* For paid events: show waitlist button or cancel */}
      {isPaidEvent && willGoToWaitlist && event?.waitlistEnabled && (
        <button
          type="submit"
          disabled={loading || (wantsDinner && !dinnerTimeSlot)}
          style={{
            ...submitButtonStyle(loading || (wantsDinner && !dinnerTimeSlot)),
            background: loading || (wantsDinner && !dinnerTimeSlot)
              ? "rgba(255, 255, 255, 0.08)"
              : "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {loading ? "Processing..." : "Join waitlist"}
        </button>
      )}
    </form>
  );
}

// ─── Inline Stepper ───
function InlineStepper({ value, onChange, min = 0, max = 10 }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "2px",
      background: "rgba(255, 255, 255, 0.06)",
      borderRadius: "10px",
      padding: "3px",
    }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        style={stepperBtnStyle(value <= min)}
      >
        −
      </button>
      <div style={{
        minWidth: "32px",
        textAlign: "center",
        fontSize: "15px",
        fontWeight: 600,
        color: "#fff",
        userSelect: "none",
      }}>
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        style={stepperBtnStyle(value >= max)}
      >
        +
      </button>
    </div>
  );
}

function stepperBtnStyle(disabled) {
  return {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    border: "none",
    background: disabled ? "transparent" : "rgba(255, 255, 255, 0.08)",
    color: disabled ? "rgba(255, 255, 255, 0.2)" : "#fff",
    fontSize: "16px",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s ease",
    WebkitTapHighlightColor: "transparent",
    padding: 0,
  };
}

// ─── Payment Breakdown ───
function PaymentBreakdown({ ticketPrice, partySize, currency, pendingPayment }) {
  const symbol = currency === "sek" ? "kr" : currency === "eur" ? "€" : currency === "gbp" ? "£" : "$";

  let breakdown;
  if (pendingPayment?.paymentBreakdown) {
    breakdown = pendingPayment.paymentBreakdown;
  } else if (ticketPrice && partySize) {
    const platformFeePercentage = 0.03;
    const ticketAmount = ticketPrice * partySize;
    const platformFeeAmount = Math.round(ticketAmount * platformFeePercentage);
    breakdown = {
      ticketAmount,
      platformFeeAmount,
      customerTotalAmount: ticketAmount + platformFeeAmount,
    };
  }

  if (!breakdown) {
    const total = pendingPayment?.amount ?? ticketPrice * partySize;
    return (
      <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px", color: colors.silverText }}>
        Total: {symbol}{(total / 100).toFixed(2)}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "14px", fontSize: "13px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", opacity: 0.6, marginBottom: "4px" }}>
        <span>Ticket{partySize > 1 ? `s (${partySize}x)` : ""}</span>
        <span>{symbol}{(breakdown.ticketAmount / 100).toFixed(2)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", opacity: 0.6, marginBottom: "8px" }}>
        <span>Service fee</span>
        <span>{symbol}{(breakdown.platformFeeAmount / 100).toFixed(2)}</span>
      </div>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontWeight: 700,
        fontSize: "15px",
        color: colors.silverText,
        paddingTop: "8px",
        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
      }}>
        <span>Total</span>
        <span>{symbol}{(breakdown.customerTotalAmount / 100).toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── Shared Styles ───
const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  background: "rgba(255, 255, 255, 0.04)",
  color: "#fff",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s ease",
  WebkitAppearance: "none",
  appearance: "none",
};

function submitButtonStyle(disabled) {
  return {
    width: "100%",
    padding: "16px",
    borderRadius: "14px",
    border: "none",
    background: disabled
      ? "rgba(255, 255, 255, 0.08)"
      : colors.gradientPrimary,
    color: disabled ? "rgba(255, 255, 255, 0.4)" : "#05040a",
    fontSize: "16px",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.2s ease",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
    letterSpacing: "-0.01em",
    boxShadow: disabled ? "none" : `0 4px 20px ${colors.silverShadow}`,
    opacity: disabled ? 0.5 : 1,
  };
}
