// frontend/src/components/EventOverviewStats.jsx
// Extracted overview stats for ManageEventPage

import React from "react";
import { formatEventTime } from "../lib/dateUtils.js";

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
              icon="📊"
              label="Total Capacity"
              value={`${attending}/${totalCapacity}`}
              color={totalOverCapacity > 0 ? "#f59e0b" : "#fff"}
            />
            {totalOverCapacity > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "8px",
                  right: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#f59e0b",
                  padding: "4px 8px",
                  background: "rgba(245, 158, 11, 0.2)",
                  borderRadius: "6px",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
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
              icon="🥂"
              label="Cocktail Capacity"
              value={`${stats.cocktailsOnly}/${cocktailCapacity}`}
              color={cocktailOverCapacity > 0 ? "#f59e0b" : "#f59e0b"}
            />
            {cocktailOverCapacity > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "8px",
                  right: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#f59e0b",
                  padding: "4px 8px",
                  background: "rgba(245, 158, 11, 0.2)",
                  borderRadius: "6px",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                }}
              >
                Over by {cocktailOverCapacity}
              </div>
            )}
          </div>
        )}

        <StatCard
          icon="📋"
          label="Waitlist"
          value={stats.waitlist}
          color="#ec4899"
        />

        <StatCard
          icon="✓"
          label="Pulled Up"
          value={`${stats.pulledUpTotal}/${attending}`}
          color="#10b981"
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
              background: "rgb(12 10 18 / 10%)",
              borderRadius: "18px",
              border: "1px solid rgba(255,255,255,0.05)",
              backdropFilter: "blur(10px)",
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
              <span style={{ fontSize: "22px" }}>🍽️</span>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  opacity: 0.95,
                  color: "#10b981",
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
                      background: "rgba(12, 10, 18, 0.9)",
                      border: isOverCapacity
                        ? "1px solid rgba(239, 68, 68, 0.7)"
                        : "1px solid rgba(255,255,255,0.08)",
                      boxShadow: isOverCapacity
                        ? "0 0 0 1px rgba(239, 68, 68, 0.4)"
                        : "0 10px 40px rgba(0,0,0,0.45)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        opacity: 0.75,
                        marginBottom: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "rgba(255, 255, 255, 0.8)",
                      }}
                    >
                      {formatEventTime(slotTime)}
                    </div>
                    <div
                      style={{
                        fontSize: "28px",
                        fontWeight: 700,
                        color: isOverCapacity ? "#f59e0b" : "#10b981",
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
                          opacity: 0.5,
                          fontWeight: 500,
                          color: "rgba(255, 255, 255, 0.6)",
                        }}
                      >
                        /{capacity}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        opacity: 0.8,
                        color: "rgba(229, 231, 235, 0.9)",
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
