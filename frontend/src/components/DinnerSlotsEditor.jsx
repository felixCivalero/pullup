// DinnerSlotsEditor — the FULL food-serving-slot configuration, shared by the
// event editor and the create wizard so a host can finish slots wherever they
// are (the wizard used to say "configure in the editor"; now it IS the editor).
//
// Slots are plain { time: "HH:mm", maxSeats: "20", maxGuestsPerBooking: "4" }
// — local times against the event date; the publish path converts to ISO.
// This component owns add/remove/update; the parent owns the array.

import { Clock, UtensilsCrossed, EyeOff } from "lucide-react";
import { colors } from "../theme/colors.js";

const DEFAULT_SLOT_TIME = "18:00";

function seedSlot(defaultSeats, defaultPerBooking) {
  return {
    time: DEFAULT_SLOT_TIME,
    maxSeats: defaultSeats || "20",
    maxGuestsPerBooking: defaultPerBooking || "4",
  };
}

function MiniStepper({ label, value, onMinus, onPlus, disableMinus, disablePlus, labelExtra }) {
  const btn = (disabled) => ({
    width: "28px", height: "28px", borderRadius: "6px", border: "none",
    background: disabled ? "transparent" : colors.accentSoft,
    color: colors.text, fontSize: "16px", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    opacity: disabled ? 0.3 : 1, transition: "all 0.15s ease",
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
        <span style={{ fontSize: "10px", color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        {labelExtra}
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: "2px",
        background: colors.surface, borderRadius: "8px",
        border: `1px solid ${colors.border}`, padding: "2px",
      }}>
        <button type="button" onClick={onMinus} disabled={disableMinus} style={btn(disableMinus)}>−</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: "14px", fontWeight: 600, color: colors.text, padding: "0 4px" }}>
          {value || "—"}
        </div>
        <button type="button" onClick={onPlus} disabled={disablePlus} style={btn(disablePlus)}>+</button>
      </div>
    </div>
  );
}

export default function DinnerSlotsEditor({
  slots,
  onChange,
  defaultSeats = "20",
  defaultPerBooking = "4",
  hideRemaining = false,
  onToggleHideRemaining,
  bookingEmail = "",
  onBookingEmailChange,
}) {
  const slotCount = Math.max(1, slots?.length || 0);

  const updateSlotField = (index, field, value) => {
    onChange((prev) => {
      const next = [...(prev || [])];
      const current = next[index] || seedSlot(defaultSeats, defaultPerBooking);
      next[index] = { ...current, [field]: value };
      return next;
    });
  };

  const stepValue = (index, field, delta, min, max) => {
    const raw = slots?.[index]?.[field] || (field === "maxSeats" ? defaultSeats : defaultPerBooking) || "0";
    const current = parseInt(raw, 10) || 0;
    const next = current + delta;
    if (next < min) {
      if (field === "maxSeats") updateSlotField(index, field, "");
      return;
    }
    if (max !== undefined && next > max) return;
    updateSlotField(index, field, String(next));
  };

  const addSlot = () => {
    onChange((prev) => {
      const list = prev || [];
      const last = list[list.length - 1] || seedSlot(defaultSeats, defaultPerBooking);
      let nextTime = DEFAULT_SLOT_TIME;
      if (last.time) {
        const [h, m] = last.time.split(":");
        const nextH = String(parseInt(h, 10) + 1).padStart(2, "0");
        nextTime = `${nextH}:${m}`;
      }
      return [...list, { time: nextTime, maxSeats: last.maxSeats, maxGuestsPerBooking: last.maxGuestsPerBooking }];
    });
  };

  const removeSlot = () => {
    onChange((prev) => {
      const list = prev || [];
      if (list.length <= 1) return list;
      return list.slice(0, list.length - 1);
    });
  };

  return (
    <div
      style={{
        marginTop: "8px", padding: "16px", borderRadius: "12px",
        border: `1px solid ${colors.border}`, background: "#fff",
        boxShadow: "0 2px 8px rgba(10,10,10,0.04)",
        display: "flex", flexDirection: "column", gap: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <UtensilsCrossed size={20} style={{ color: colors.textSubtle }} />
        <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: colors.text, flex: 1 }}>
          Cuisine Configuration
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {Array.from({ length: slotCount }).map((_, index) => {
          const seatsVal = slots?.[index]?.maxSeats ?? defaultSeats ?? "";
          const guestsVal = slots?.[index]?.maxGuestsPerBooking ?? defaultPerBooking ?? "";
          const seatsNum = parseInt(seatsVal, 10) || 0;
          const guestsNum = parseInt(guestsVal, 10) || 0;
          const timeVal = slots?.[index]?.time || DEFAULT_SLOT_TIME;
          const [hh, mm] = timeVal.split(":");
          const selStyle = {
            flex: 1, height: "38px", borderRadius: "10px",
            border: `1px solid ${colors.border}`, background: "#fff",
            color: colors.text, fontSize: "14px", fontWeight: 600,
            textAlign: "center", cursor: "pointer", outline: "none",
            appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
            padding: "0 8px",
          };

          return (
            <div key={index} style={{
              background: colors.surface, borderRadius: "12px",
              border: `1px solid ${colors.border}`, padding: "12px",
              display: "flex", flexDirection: "column", gap: "10px",
            }}>
              {/* Row 1: time */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: colors.textSubtle, minWidth: "16px" }}>
                  {slotCount > 1 ? `${index + 1}` : ""}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                  <Clock size={16} style={{ opacity: 0.6, flexShrink: 0, color: colors.textSubtle }} />
                  <select value={hh} onChange={(e) => updateSlotField(index, "time", `${e.target.value}:${mm}`)} style={selStyle}>
                    {Array.from({ length: 24 }, (_, i) => {
                      const h = String(i).padStart(2, "0");
                      return <option key={h} value={h}>{h}</option>;
                    })}
                  </select>
                  <span style={{ fontSize: "16px", fontWeight: 700, color: colors.textSubtle }}>:</span>
                  <select value={mm} onChange={(e) => updateSlotField(index, "time", `${hh}:${e.target.value}`)} style={selStyle}>
                    {["00", "10", "20", "30", "40", "50"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                {slotCount > 1 && index === slotCount - 1 && (
                  <button type="button" onClick={removeSlot} style={{
                    width: "28px", height: "28px", borderRadius: "8px", border: "none",
                    background: colors.dangerRgba, color: colors.danger,
                    fontSize: "14px", cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>×</button>
                )}
              </div>

              {/* Row 2: seats + per booking */}
              <div style={{ display: "flex", gap: "12px", paddingLeft: slotCount > 1 ? "26px" : "0" }}>
                <MiniStepper
                  label="Seats"
                  value={seatsVal}
                  onMinus={() => stepValue(index, "maxSeats", -1, 0)}
                  onPlus={() => stepValue(index, "maxSeats", 1)}
                  disableMinus={seatsNum <= 0}
                  labelExtra={index === 0 && onToggleHideRemaining ? (
                    <button
                      type="button"
                      onClick={() => onToggleHideRemaining(!hideRemaining)}
                      title={hideRemaining ? "Show remaining seats to guests" : "Hide remaining seats from guests"}
                      style={{
                        background: "none", border: "none", padding: "2px",
                        cursor: "pointer", display: "flex", alignItems: "center",
                        color: hideRemaining ? colors.textFaded : colors.textSubtle,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <EyeOff size={11} />
                    </button>
                  ) : undefined}
                />
                <MiniStepper
                  label="Per booking"
                  value={guestsVal}
                  onMinus={() => stepValue(index, "maxGuestsPerBooking", -1, 1)}
                  onPlus={() => stepValue(index, "maxGuestsPerBooking", 1, undefined, 12)}
                  disableMinus={guestsNum <= 1}
                  disablePlus={guestsNum >= 12}
                />
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={addSlot}
          style={{
            padding: "8px 14px", borderRadius: "10px", border: `1px dashed ${colors.border}`,
            background: "transparent", color: colors.textMuted, fontSize: "13px",
            fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: "6px", transition: "all 0.2s ease",
          }}
        >
          <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span>
          <span>Add slot</span>
        </button>
      </div>

      {/* Booking email */}
      {onBookingEmailChange && (
        <div>
          <label style={{
            display: "block", fontSize: "11px", fontWeight: 500,
            textTransform: "uppercase", letterSpacing: "0.05em",
            color: colors.textSubtle, marginBottom: "8px",
          }}>
            Booking contact email
          </label>
          <input
            type="email"
            value={bookingEmail}
            onChange={(e) => onBookingEmailChange(e.target.value)}
            placeholder="e.g. bookings@yourrestaurant.com"
            style={{
              width: "100%", boxSizing: "border-box",
              fontSize: "14px", padding: "10px 14px",
              background: "#fff", color: colors.text,
              border: `1px solid ${colors.border}`, borderRadius: "10px",
              outline: "none", fontFamily: "inherit",
            }}
          />
          <div style={{ fontSize: "11px", color: colors.textFaded, marginTop: "6px" }}>
            Shown to guests for large or specific bookings
          </div>
        </div>
      )}
    </div>
  );
}
