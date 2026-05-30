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
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [wantsDinner, setWantsDinner] = useState(false);
  const [dinnerTimeSlot, setDinnerTimeSlot] = useState(null);
  const [dinnerSeats, setDinnerSeats] = useState(1);
  const [cocktailGuests, setCocktailGuests] = useState(0);
  const [dinnerSlots, setDinnerSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [capacityExceeded, setCapacityExceeded] = useState(false);
  const [customAnswers, setCustomAnswers] = useState({});

  // Render-order: walk event.formFields, padding with the locked sentinels
  // the event's contact channel requires. WhatsApp events lock a verified
  // phone instead of email; "both" locks both. customFields excludes the
  // sentinels — those are rendered via dedicated inputs below.
  const NAME_FIELD_ID = "__name__";
  const EMAIL_FIELD_ID = "__email__";
  const PHONE_FIELD_ID = "__phone__";
  const rawFields = Array.isArray(event?.formFields) ? event.formFields : [];
  const channel = ["email", "whatsapp", "both"].includes(event?.contactChannel)
    ? event.contactChannel
    : "email";
  const wantsEmail = channel === "email" || channel === "both";
  const wantsPhone = channel === "whatsapp" || channel === "both";
  const orderedFields = (() => {
    const hasName  = rawFields.some((f) => f && f.id === NAME_FIELD_ID);
    const hasEmail = rawFields.some((f) => f && f.id === EMAIL_FIELD_ID);
    const hasPhone = rawFields.some((f) => f && f.id === PHONE_FIELD_ID);
    const prefix = [];
    if (!hasName)                  prefix.push({ id: NAME_FIELD_ID,  type: "name"  });
    if (wantsEmail && !hasEmail)   prefix.push({ id: EMAIL_FIELD_ID, type: "email" });
    if (wantsPhone && !hasPhone)   prefix.push({ id: PHONE_FIELD_ID, type: "phone", verify: "whatsapp" });
    return [...prefix, ...rawFields];
  })();
  const customFields = orderedFields.filter(
    (f) =>
      f &&
      f.id &&
      f.id !== NAME_FIELD_ID &&
      f.id !== EMAIL_FIELD_ID &&
      f.id !== PHONE_FIELD_ID &&
      (f.label || "").trim(),
  );

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
          if (result && result.error) {
            setError(result.error);
          }
        } catch (err) {
          console.error("RSVP submission error:", err);
          setError(err.message || "Something went wrong. Please try again.");
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

    if (!name.trim()) {
      setError("Full name is required");
      return;
    }

    // Required custom fields
    for (const f of customFields) {
      if (f.required) {
        const val = (customAnswers[f.id] || "").trim();
        if (!val) {
          setError(`${f.label} is required`);
          return;
        }
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
        const trimmedAnswers = {};
        for (const f of customFields) {
          const val = (customAnswers[f.id] || "").trim();
          if (val) trimmedAnswers[f.id] = val;
        }
        const result = await onSubmit({
          email: isVipInvite ? (vipOffer.invite?.email || "").trim() : email.trim(),
          name: name.trim() || null,
          phone: wantsPhone ? phone.trim() : (phone.trim() || null),
          contactChannel: channel,
          plusOnes: cocktailGuests,
          wantsDinner,
          dinnerTimeSlot: wantsDinner ? dinnerTimeSlot : null,
          dinnerPartySize: wantsDinner ? dinnerSeats : null,
          marketingOptIn,
          customAnswers: trimmedAnswers,
        });
        if (result && result.error) {
          if (result.capacityExceeded) {
            setCapacityExceeded(true);
            setError("");
          } else {
            setError(result.error);
          }
        } else if ((phone || "").trim()) {
          // RSVP succeeded AND guest gave a phone — fire the magic-link
          // verification in parallel. Stash the result in sessionStorage
          // so RsvpSuccessPage can render the "tap the link in WhatsApp"
          // notice without coupling navigation timing to the verify call.
          publicFetch("/verify/phone/start", {
            method: "POST",
            body: JSON.stringify({
              phone: phone.trim(),
              intent: "rsvp_verify",
              payload: {
                source: "rsvp_form",
                event_slug: event?.slug || null,
              },
            }),
          })
            .then((r) => r.json())
            .then((json) => {
              if (json?.ok) {
                try {
                  sessionStorage.setItem(
                    "pullup_pending_phone_verify",
                    JSON.stringify({
                      e164: json.e164,
                      sandbox_link: json.sandbox_link || null,
                      ts: Date.now(),
                    }),
                  );
                } catch { /* private mode / no storage */ }
              }
            })
            .catch(() => { /* non-blocking */ });
        }
      } catch (err) {
        console.error("RSVP submission error:", err);
        setError(err.message || "Something went wrong. Please try again.");
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
          borderRadius: "4px",
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
            borderRadius: "4px",
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
            {loading ? "Processing..." : "Get Tickets"}
          </button>
        )}
      </form>
    );
  }

  // ─── Normal RSVP Form ───
  return (
    <form
      onSubmit={handleSubmit}
      style={{
        width: "100%",
        touchAction: "manipulation",
        background: "rgba(255, 255, 255, 0.02)",
        padding: "20px 16px",
        margin: "0 -16px",
        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
      }}
      onTouchStart={(e) => { if (e.touches.length > 1) e.preventDefault(); }}
    >
      {/* Name + email + custom — rendered in the order set by the host */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
        {orderedFields.map((f) => {
          if (f.id === NAME_FIELD_ID) {
            return (
              <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={fieldLabelStyle}>
                  Full name<span style={requiredMarkStyle}>*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                  disabled={loading}
                  autoComplete="name"
                  style={inputStyle}
                />
              </div>
            );
          }
          if (f.id === EMAIL_FIELD_ID) {
            return (
              <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={fieldLabelStyle}>
                  Email{wantsEmail && <span style={requiredMarkStyle}>*</span>}
                </label>
                <input
                  type="email"
                  required={wantsEmail}
                  value={email}
                  onChange={(e) => { if (!isVipInvite) { setEmail(e.target.value); setError(""); } }}
                  placeholder="you@example.com"
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
            );
          }
          if (f.id === PHONE_FIELD_ID) {
            return (
              <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={fieldLabelStyle}>
                  WhatsApp number<span style={requiredMarkStyle}>*</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setError(""); }}
                  placeholder="+46 70 123 45 67"
                  disabled={loading}
                  style={{
                    ...inputStyle,
                    borderColor: error && error.toLowerCase().includes("phone") ? "rgba(239, 68, 68, 0.5)" : undefined,
                  }}
                />
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", paddingLeft: "2px", lineHeight: 1.45 }}>
                  We'll WhatsApp you a one-tap link to confirm — no codes to type.
                </div>
              </div>
            );
          }
          if (!(f.label || "").trim()) return null;
          const inputType =
            f.type === "phone" ? "tel" :
            f.type === "birthday" ? "date" :
            (f.inputType || "text");
          const placeholder =
            f.placeholder || (f.type === "custom" ? "Placeholder" : f.label);
          return (
            <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={fieldLabelStyle}>
                {f.label}{f.required && <span style={requiredMarkStyle}>*</span>}
              </label>
              <input
                type={inputType}
                value={customAnswers[f.id] || ""}
                onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))}
                placeholder={placeholder}
                disabled={loading}
                required={!!f.required}
                autoComplete={
                  f.type === "phone" ? "tel" :
                  f.type === "company" ? "organization" :
                  "off"
                }
                style={inputStyle}
              />
            </div>
          );
        })}
      </div>

      {/* Party options block */}
      {(event?.dinnerEnabled || maxPlusOnes > 0) && (
        <div style={{
          borderRadius: "4px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(255, 255, 255, 0.02)",
          marginBottom: "16px",
          overflow: "hidden",
        }}>
          {/* Dinner toggle */}
          {event?.dinnerEnabled && (
            <>
              <button
                type="button"
                onClick={() => !loading && !loadingSlots && setWantsDinner(!wantsDinner)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "14px 16px",
                  border: "none",
                  borderBottom: (wantsDinner || maxPlusOnes > 0) ? "1px solid rgba(255, 255, 255, 0.06)" : "none",
                  background: wantsDinner ? "rgba(192, 192, 192, 0.06)" : "transparent",
                  cursor: loading || loadingSlots ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                  WebkitTapHighlightColor: "transparent",
                  textAlign: "left",
                  color: "#fff",
                }}
              >
                <span style={{ flex: 1, fontSize: "14px", fontWeight: 500 }}>
                  Book dinner
                </span>
                <div style={{
                  width: "40px",
                  height: "24px",
                  borderRadius: "12px",
                  background: wantsDinner
                    ? colors.gradientPrimary
                    : "rgba(255, 255, 255, 0.1)",
                  padding: "3px",
                  transition: "background 0.2s ease",
                  flexShrink: 0,
                  boxSizing: "border-box",
                }}>
                  <div style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: wantsDinner ? "#05040a" : "rgba(255, 255, 255, 0.4)",
                    transform: wantsDinner ? "translateX(16px)" : "translateX(0)",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  }} />
                </div>
              </button>

              {/* Dinner details */}
              {wantsDinner && (
                <div style={{
                  padding: "12px 16px",
                  borderBottom: maxPlusOnes > 0 ? "1px solid rgba(255, 255, 255, 0.06)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
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
                              padding: "10px 12px",
                              borderRadius: "4px",
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
                              fontSize: "14px",
                              fontWeight: isSelected ? 600 : 400,
                              color: isFull && !isSelected ? "rgba(245, 158, 11, 0.8)" : "#fff",
                            }}>
                              {formatEventTime(slot.time, event?.timezone)}
                            </span>
                            {slot.remaining !== null && !event?.hideDinnerRemaining && (
                              <span style={{
                                fontSize: "11px",
                                opacity: 0.5,
                                color: isFull ? "rgba(245, 158, 11, 0.7)" : undefined,
                              }}>
                                {isFull ? "waitlist" : `${slot.remaining} left`}
                              </span>
                            )}
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
            </>
          )}

          {/* Bring friends */}
          {maxPlusOnes > 0 && (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
            }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "#fff" }}>
                  Bring friends
                </div>
                <div style={{ fontSize: "11px", opacity: 0.4, marginTop: "2px" }}>
                  Up to {maxPlusOnes}{wantsDinner ? " · list only" : ""}
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
        </div>
      )}

      {/* Party summary — only when guest can bring extras or there's dinner */}
      {!isPaidEvent && (event?.dinnerEnabled || maxPlusOnes > 0) && (
        <div style={{
          padding: "10px 12px",
          marginBottom: "16px",
          borderRadius: "8px",
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.04)",
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: (wantsDinner && dinnerCount > 0) || cocktailsOnlyCount > 0 ? "6px" : 0,
          }}>
            <span style={{
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.4)",
            }}>
              Total
            </span>
            <span style={{ fontWeight: 600, fontSize: "13px", color: "rgba(255,255,255,0.85)" }}>
              {totalPartySize} {totalPartySize === 1 ? "person" : "people"}
            </span>
          </div>
          {((wantsDinner && dinnerCount > 0) || cocktailsOnlyCount > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {wantsDinner && dinnerCount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", opacity: 0.45 }}>
                  <span>Dinner</span>
                  <span>{dinnerCount} {dinnerCount === 1 ? "seat" : "seats"}</span>
                </div>
              )}
              {cocktailsOnlyCount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", opacity: 0.45 }}>
                  <span>{wantsDinner ? "List only" : "Extra guests"}</span>
                  <span>{cocktailsOnlyCount}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Payment section for paid events */}
      {isPaidEvent && ticketPrice && !willGoToWaitlist && (
        <div style={{
          padding: "16px",
          borderRadius: "4px",
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
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.5)", cursor: "pointer", textAlign: "left", margin: "12px 0", padding: "0 2px", minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                  style={{ accentColor: "#fbbf24", flexShrink: 0, width: 18, height: 18 }}
                />
                <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "rgba(255,255,255,0.7)", textDecoration: "underline" }}>terms</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "rgba(255,255,255,0.7)", textDecoration: "underline" }}>privacy policy</a></span>
              </label>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "-4px 2px 10px", lineHeight: 1.5, textAlign: "left" }}>
                The organiser may occasionally email you about future events you might like — unsubscribe anytime. We never sell your details or share them with other organisers.
              </p>
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

      {/* Capacity exceeded — event filled during submission */}
      {capacityExceeded && (
        <div style={{
          padding: "20px",
          borderRadius: "8px",
          background: "rgba(245, 158, 11, 0.06)",
          border: "1px solid rgba(245, 158, 11, 0.15)",
          marginBottom: "16px",
          textAlign: "center",
        }}>
          <div style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "#fbbf24",
            marginBottom: "8px",
          }}>
            This event just filled up
          </div>
          <div style={{
            fontSize: "13px",
            color: "rgba(255, 255, 255, 0.6)",
            marginBottom: "20px",
            lineHeight: "1.5",
          }}>
            A spot was taken while you were registering. Want to join the waitlist? We'll reach out if a spot opens up.
          </div>
          <button
            type="button"
            onClick={() => {
              setCapacityExceeded(false);
              if (onSubmit) {
                onSubmit({
                  email: email.trim(),
                  name: name.trim() || null,
                  plusOnes: cocktailGuests,
                  wantsDinner,
                  dinnerTimeSlot: wantsDinner ? dinnerTimeSlot : null,
                  dinnerPartySize: wantsDinner ? dinnerSeats : null,
                  marketingOptIn,
                  joinWaitlist: true,
                });
              }
            }}
            style={{
              ...submitButtonStyle(false),
              background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
              marginBottom: "12px",
            }}
          >
            Join waitlist
          </button>
          <button
            type="button"
            onClick={() => setCapacityExceeded(false)}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255, 255, 255, 0.4)",
              fontSize: "13px",
              cursor: "pointer",
              padding: "8px",
            }}
          >
            Go back
          </button>
        </div>
      )}

      {!capacityExceeded && (
        <>
          {/* Waitlist notice */}
          {willGoToWaitlist && event?.waitlistEnabled && (
            <div style={{
              padding: "12px 14px",
              borderRadius: "4px",
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
              borderRadius: "4px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              fontSize: "13px",
              color: "#ef4444",
              marginBottom: "16px",
            }}>
              {error}
            </div>
          )}

          {/* Terms agreement + legitimate-interest transparency (shown here for
              free events, inside payment section for paid) */}
          {!(isPaidEvent && ticketPrice && !willGoToWaitlist) && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "rgba(255,255,255,0.35)", cursor: "pointer", textAlign: "left", margin: "12px 0 6px", padding: 0, minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                  style={{ accentColor: "#fbbf24", flexShrink: 0, width: 18, height: 18 }}
                />
                <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "rgba(255,255,255,0.5)", textDecoration: "underline" }}>terms</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "rgba(255,255,255,0.5)", textDecoration: "underline" }}>privacy policy</a></span>
              </label>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "0 2px 16px", lineHeight: 1.5, textAlign: "left" }}>
                The organiser may occasionally email you about future events you might like — unsubscribe anytime. We never sell your details or share them with other organisers.
              </p>
            </>
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
                : "Register"}
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
        </>
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
      borderRadius: "4px",
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
    borderRadius: "3px",
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
  padding: "12px 0",
  borderRadius: "0",
  border: "none",
  borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
  background: "transparent",
  color: "#fff",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s ease",
  WebkitAppearance: "none",
  appearance: "none",
  fontFamily: "inherit",
};

const fieldLabelStyle = {
  fontSize: "11px",
  fontWeight: 600,
  color: "rgba(255,255,255,0.55)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const requiredMarkStyle = {
  color: "#ef4444",
  marginLeft: "4px",
};

function submitButtonStyle(disabled) {
  return {
    width: "100%",
    padding: "14px",
    borderRadius: "4px",
    border: "none",
    background: disabled
      ? "rgba(255, 255, 255, 0.08)"
      : "#fff",
    color: disabled ? "rgba(255, 255, 255, 0.4)" : "#000",
    fontSize: "14px",
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.2s ease",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
    opacity: disabled ? 0.5 : 1,
  };
}
