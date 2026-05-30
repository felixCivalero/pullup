// frontend/src/components/EventOverviewStats.jsx
// Extracted overview stats for ManageEventPage

import React from "react";
import { BarChart2, Wine, ClipboardList, Check, UtensilsCrossed } from "lucide-react";
import { formatEventTime } from "../lib/dateUtils.js";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { colors } from "../theme/colors.js";

// Reuse StatCard shape from ManageEventPage via props
export function EventOverviewStats({
  event,
  guests,
  dinnerSlots,
  isMobile,
  StatCard,
}) {
  const stats = guests.reduce(
    (acc, g) => {
      const totalGuests = g.totalGuests ?? g.partySize ?? 1;
      const partySize = g.partySize || 1;
      const dinnerPartySize = g.dinnerPartySize || partySize;

      const bookingStatus =
        g.bookingStatus ||
        (g.status === "attending"
          ? "CONFIRMED"
          : g.status === "waitlist"
          ? "WAITLIST"
          : "CANCELLED");
      const wantsDinner = g.dinner?.enabled || g.wantsDinner;
      const dinnerBookingStatus =
        g.dinner?.bookingStatus ||
        (g.dinnerStatus === "confirmed"
          ? "CONFIRMED"
          : g.dinnerStatus === "waitlist"
          ? "WAITLIST"
          : null);
      const dinnerPartySizeNew = g.dinner?.partySize || dinnerPartySize;

      if (bookingStatus === "WAITLIST" || g.status === "waitlist") {
        acc.waitlist += totalGuests;
      }

      if (bookingStatus === "CONFIRMED" || g.status === "attending") {
        acc.attending += partySize;
        acc.cocktailList += partySize;

        const plusOnes = g.plusOnes ?? 0;
        if (wantsDinner && dinnerBookingStatus === "CONFIRMED") {
          acc.cocktailsOnly += plusOnes;
        } else {
          acc.cocktailsOnly += partySize;
        }
      }

      if (wantsDinner) {
        if (dinnerBookingStatus === "CONFIRMED") {
          acc.dinnerConfirmed += dinnerPartySizeNew;
        } else if (dinnerBookingStatus === "WAITLIST") {
          acc.dinnerWaitlist += dinnerPartySizeNew;
        }
      }

      const cocktailsPulledUp =
        g.cocktailOnlyPullUpCount ?? g.pulledUpForCocktails ?? 0;
      const dinnerPulledUp = g.dinnerPullUpCount ?? g.pulledUpForDinner ?? 0;
      if (cocktailsPulledUp > 0) acc.cocktailsPulledUp += cocktailsPulledUp;
      if (dinnerPulledUp > 0) acc.dinnerPulledUp += dinnerPulledUp;

      return acc;
    },
    {
      waitlist: 0,
      attending: 0,
      cocktailList: 0,
      cocktailsOnly: 0,
      dinnerConfirmed: 0,
      dinnerWaitlist: 0,
      dinnerCocktails: 0,
      pulledUpTotal: 0,
      cocktailsPulledUp: 0,
      dinnerPulledUp: 0,
    }
  );

  stats.pulledUpTotal = stats.cocktailsPulledUp + stats.dinnerPulledUp;

  const attending = stats.attending;
  const cocktailCapacity = event.cocktailCapacity ?? null;
  const totalCapacity = event.totalCapacity ?? null;

  const totalOverCapacity =
    totalCapacity != null ? Math.max(0, attending - totalCapacity) : 0;
  const cocktailOverCapacity =
    cocktailCapacity != null
      ? Math.max(0, stats.cocktailsOnly - cocktailCapacity)
      : 0;

  return (
    <>
      {/* Summary Stats */}
      <div
        style={{
          marginBottom: "32px",
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "20px",
        }}
      >
        {totalCapacity != null && (
          <div style={{ position: "relative" }}>
            <StatCard
              icon={<SilverIcon as={BarChart2} size={24} />}
              label="Total Capacity"
              value={`${attending}/${totalCapacity}`}
              color={totalOverCapacity > 0 ? colors.warning : colors.text}
            />
            {totalOverCapacity > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "8px",
                  right: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: colors.warning,
                  padding: "4px 8px",
                  background: colors.warningRgba,
                  borderRadius: "6px",
                  border: `1px solid rgba(180,83,9,0.25)`,
                }}
              >
                Over by {totalOverCapacity}
              </div>
            )}
          </div>
        )}

        {cocktailCapacity != null && (
          <div style={{ position: "relative" }}>
            <StatCard
              icon={<SilverIcon as={Wine} size={24} />}
              label="List Capacity"
              value={`${stats.cocktailsOnly}/${cocktailCapacity}`}
              color={cocktailOverCapacity > 0 ? colors.warning : colors.textMuted}
            />
            {cocktailOverCapacity > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "8px",
                  right: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: colors.warning,
                  padding: "4px 8px",
                  background: colors.warningRgba,
                  borderRadius: "6px",
                  border: `1px solid rgba(180,83,9,0.25)`,
                }}
              >
                Over by {cocktailOverCapacity}
              </div>
            )}
          </div>
        )}

        <StatCard
          icon={<SilverIcon as={ClipboardList} size={24} />}
          label="Waitlist"
          value={stats.waitlist}
          color={colors.textMuted}
        />

        <StatCard
          icon={<SilverIcon as={Check} size={24} />}
          label="Pulled Up"
          value={`${stats.pulledUpTotal}/${attending}`}
          color={colors.secondary}
        />
      </div>

      {/* Dinner Slots Section */}
      {event.dinnerEnabled &&
        event.dinnerMaxSeatsPerSlot &&
        dinnerSlots.length > 0 && (
          <div
            style={{
              marginBottom: "32px",
              padding: "28px",
              background: colors.surface,
              borderRadius: "18px",
              border: `1px solid ${colors.border}`,
              boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "24px",
              }}
            >
              <SilverIcon as={UtensilsCrossed} size={22} style={{ color: colors.secondary }} />
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: colors.secondary,
                }}
              >
                Dinner Slots
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "16px",
              }}
            >
              {dinnerSlots.map((slot) => {
                const slotTime = new Date(slot.time);
                const capacity = event.dinnerMaxSeatsPerSlot;

                const confirmed = guests
                  .filter((g) => {
                    const wantsDinner = g.dinner?.enabled || g.wantsDinner;
                    const slotMatches =
                      g.dinner?.slotTime === slot.time ||
                      g.dinnerTimeSlot === slot.time;
                    const isConfirmed =
                      g.dinner?.bookingStatus === "CONFIRMED" ||
                      g.dinnerStatus === "confirmed";
                    return wantsDinner && slotMatches && isConfirmed;
                  })
                  .reduce((sum, g) => {
                    const partySize = g.dinnerPartySize || g.partySize || 1;
                    return sum + partySize;
                  }, 0);

                const remaining = Math.max(capacity - confirmed, 0);
                const isOverCapacity = confirmed > capacity;

                return (
                  <div
                    key={slot.time}
                    style={{
                      padding: "18px 16px",
                      borderRadius: "14px",
                      background: colors.background,
                      border: isOverCapacity
                        ? `1px solid rgba(220,38,38,0.4)`
                        : `1px solid ${colors.border}`,
                      boxShadow: isOverCapacity
                        ? "0 0 0 1px rgba(220,38,38,0.12)"
                        : "0 8px 30px rgba(10,10,10,0.06)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: colors.textMuted,
                        marginBottom: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {formatEventTime(slotTime, event?.timezone)}
                    </div>
                    <div
                      style={{
                        fontSize: "28px",
                        fontWeight: 700,
                        color: isOverCapacity ? colors.warning : colors.secondary,
                        display: "flex",
                        alignItems: "baseline",
                        gap: "6px",
                        lineHeight: "1",
                        marginBottom: "8px",
                      }}
                    >
                      <span>{confirmed}</span>
                      <span
                        style={{
                          fontSize: "18px",
                          fontWeight: 500,
                          color: colors.textSubtle,
                        }}
                      >
                        /{capacity}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: colors.textMuted,
                      }}
                    >
                      {remaining > 0
                        ? `${remaining} seats left`
                        : isOverCapacity
                        ? "Over capacity"
                        : "Full"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
    </>
  );
}
