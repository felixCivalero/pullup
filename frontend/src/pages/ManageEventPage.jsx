// frontend/src/pages/ManageEventPage.jsx
import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useToast } from "../components/Toast";
import { LocationAutocomplete } from "../components/LocationAutocomplete";

import { authenticatedFetch, publicFetch, API_BASE } from "../lib/api.js";

function isNetworkError(error) {
  return (
    error instanceof TypeError ||
    error.message.includes("Failed to fetch") ||
    error.message.includes("NetworkError")
  );
}

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

const focusedInputStyle = {
  ...inputStyle,
  border: "1px solid rgba(139, 92, 246, 0.5)",
  boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.1)",
};

// Helper function to calculate cuisine timeslots (same as CreateEventPage)
function calculateCuisineTimeslots(startTime, endTime, intervalHours) {
  if (!startTime || !endTime || !intervalHours) {
    return [];
  }

  try {
    // Parse datetime-local strings to Date objects
    const [startDatePart, startTimePart] = startTime.split("T");
    const [endDatePart, endTimePart] = endTime.split("T");

    if (!startDatePart || !startTimePart || !endDatePart || !endTimePart) {
      return [];
    }

    const [startYear, startMonth, startDay] = startDatePart
      .split("-")
      .map(Number);
    const [startHour, startMinute] = startTimePart.split(":").map(Number);
    const [endYear, endMonth, endDay] = endDatePart.split("-").map(Number);
    const [endHour, endMinute] = endTimePart.split(":").map(Number);

    const startDate = new Date(
      startYear,
      startMonth - 1,
      startDay,
      startHour,
      startMinute
    );
    const endDate = new Date(endYear, endMonth - 1, endDay, endHour, endMinute);
    const interval = parseFloat(intervalHours);

    if (
      isNaN(startDate.getTime()) ||
      isNaN(endDate.getTime()) ||
      isNaN(interval) ||
      interval <= 0
    ) {
      return [];
    }

    if (endDate <= startDate) {
      return [];
    }

    const slots = [];
    let currentTime = new Date(startDate);

    while (currentTime <= endDate) {
      // Format time as "18:00", "20:30", etc. (24-hour format)
      const hours = currentTime.getHours();
      const minutes = currentTime.getMinutes();
      const formattedTime = `${String(hours).padStart(2, "0")}:${String(
        minutes
      ).padStart(2, "0")}`;
      slots.push(formattedTime);

      // Move to next slot
      currentTime = new Date(currentTime.getTime() + interval * 60 * 60 * 1000);
    }

    return slots;
  } catch (error) {
    console.error("Error calculating timeslots:", error);
    return [];
  }
}

// Overview Tab Component - shows event statistics
function OverviewTabContent({ event, guests, dinnerSlots }) {
  // Calculate stats from guests
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
        acc.attending += partySize; // Use partySize, not totalGuests
        acc.cocktailList += partySize;

        // Calculate cocktails-only for this guest
        const plusOnes = g.plusOnes ?? 0;

        // If no dinner: all partySize is cocktails-only (booker + plusOnes)
        // If dinner: only plusOnes are cocktails-only (dinnerPartySize goes to dinner)
        if (wantsDinner && dinnerBookingStatus === "CONFIRMED") {
          acc.cocktailsOnly += plusOnes; // Only plusOnes are cocktails-only
        } else {
          acc.cocktailsOnly += partySize; // Entire party is cocktails-only
        }
      }

      if (wantsDinner) {
        if (dinnerBookingStatus === "CONFIRMED") {
          acc.dinnerConfirmed += dinnerPartySizeNew;
        } else if (dinnerBookingStatus === "WAITLIST") {
          acc.dinnerWaitlist += dinnerPartySizeNew;
        }
      }

      // Calculate pulled up stats
      const cocktailsPulledUp =
        g.cocktailOnlyPullUpCount ?? g.pulledUpForCocktails ?? 0;
      const dinnerPulledUp = g.dinnerPullUpCount ?? g.pulledUpForDinner ?? 0;
      if (cocktailsPulledUp > 0) {
        acc.cocktailsPulledUp += cocktailsPulledUp;
      }
      if (dinnerPulledUp > 0) {
        acc.dinnerPulledUp += dinnerPulledUp;
      }

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

  // Calculate total pulled up (sum of both)
  stats.pulledUpTotal = stats.cocktailsPulledUp + stats.dinnerPulledUp;

  const attending = stats.attending;
  const cocktailCapacity = event.cocktailCapacity ?? null;
  const totalCapacity = event.totalCapacity ?? null;

  // Calculate over-capacity indicators
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
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
                  fontSize: "9px",
                  fontWeight: 600,
                  color: "#f59e0b",
                  padding: "3px 6px",
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
                  fontSize: "9px",
                  fontWeight: 600,
                  color: "#f59e0b",
                  padding: "3px 6px",
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

      {/* Pulled Up Details */}
      <div
        style={{
          marginBottom: "32px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "20px",
        }}
      >
        <StatCard
          icon="🥂✓"
          label="Cocktails Pulled Up"
          value={`${stats.cocktailsPulledUp}/${stats.cocktailsOnly}`}
          color="#f59e0b"
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
              background:
                "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(139, 92, 246, 0.06) 100%)",
              borderRadius: "18px",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 8px 32px rgba(16, 185, 129, 0.1)",
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
                  fontSize: "13px",
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
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "16px",
              }}
            >
              {dinnerSlots.map((slot) => {
                const slotTime = new Date(slot.time);
                const capacity = event.dinnerMaxSeatsPerSlot;

                // Calculate confirmed count for this specific slot from guest data
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
                  .reduce(
                    (sum, g) =>
                      sum +
                      (g.dinner?.partySize ||
                        g.dinnerPartySize ||
                        g.partySize ||
                        1),
                    0
                  );

                // Calculate pulled up count for this specific slot
                const slotPulledUp = guests
                  .filter((g) => {
                    const wantsDinner = g.dinner?.enabled || g.wantsDinner;
                    const slotMatches =
                      g.dinner?.slotTime === slot.time ||
                      g.dinnerTimeSlot === slot.time;
                    const isConfirmed =
                      g.dinner?.bookingStatus === "CONFIRMED" ||
                      g.dinnerStatus === "confirmed";
                    const hasPulledUp =
                      (g.dinnerPullUpCount ?? g.pulledUpForDinner ?? 0) > 0;
                    return (
                      wantsDinner && slotMatches && isConfirmed && hasPulledUp
                    );
                  })
                  .reduce(
                    (sum, g) =>
                      sum + (g.dinnerPullUpCount ?? g.pulledUpForDinner ?? 0),
                    0
                  );

                const slotOverCapacity = confirmed > capacity;

                return (
                  <div
                    key={slot.time}
                    style={{
                      padding: "18px",
                      background: "rgba(20, 16, 30, 0.7)",
                      borderRadius: "14px",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                      transition: "all 0.3s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.borderColor =
                        "rgba(16, 185, 129, 0.4)";
                      e.currentTarget.style.boxShadow =
                        "0 4px 16px rgba(16, 185, 129, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.borderColor =
                        "rgba(16, 185, 129, 0.25)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        opacity: 0.75,
                        marginBottom: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "rgba(255, 255, 255, 0.8)",
                      }}
                    >
                      {slotTime.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                    <div
                      style={{
                        fontSize: "28px",
                        fontWeight: 700,
                        color: slotOverCapacity ? "#f59e0b" : "#10b981",
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
                    {slotOverCapacity && (
                      <div
                        style={{
                          fontSize: "10px",
                          fontWeight: 600,
                          color: "#f59e0b",
                          marginBottom: "8px",
                          padding: "4px 8px",
                          background: "rgba(245, 158, 11, 0.15)",
                          borderRadius: "6px",
                          display: "inline-block",
                        }}
                      >
                        Over capacity by {confirmed - capacity}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: "20px",
                        fontWeight: 700,
                        color: "#10b981",
                        display: "flex",
                        alignItems: "baseline",
                        gap: "6px",
                        lineHeight: "1",
                        opacity: slotPulledUp > 0 ? 1 : 0.5,
                      }}
                    >
                      <span>✓ {slotPulledUp}</span>
                      <span
                        style={{
                          fontSize: "14px",
                          opacity: 0.6,
                          fontWeight: 500,
                          color: "rgba(255, 255, 255, 0.6)",
                        }}
                      >
                        /{confirmed} pulled up
                      </span>
                    </div>
                    {slot.waitlist > 0 && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#ec4899",
                          marginTop: "8px",
                          opacity: 0.9,
                          fontWeight: 600,
                        }}
                      >
                        {slot.waitlist} on waitlist
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
    </>
  );
}

// StatCard component for Overview tab
function StatCard({ icon, label, value, color }) {
  const isGradient = color.includes("gradient");
  return (
    <div
      style={{
        padding: "20px",
        background: "rgba(20, 16, 30, 0.6)",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(10px)",
        transition: "all 0.3s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.3)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(139, 92, 246, 0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          fontSize: "24px",
          marginBottom: "8px",
          opacity: 0.9,
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: "10px",
          opacity: 0.7,
          marginBottom: "8px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "32px",
          fontWeight: 700,
          ...(isGradient
            ? {
                background: color,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }
            : { color }),
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return diffMins > 0 ? `in ${diffMins}m` : "now";
  } else if (diffHours < 24) {
    return diffHours > 0 ? `in ${diffHours}h` : "today";
  } else if (diffDays === 1) {
    return "tomorrow";
  } else if (diffDays < 7) {
    return `in ${diffDays}d`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

function formatReadableDateTime(date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  let dateStr = "";
  if (isToday) {
    dateStr = "Today";
  } else if (isTomorrow) {
    dateStr = "Tomorrow";
  } else {
    dateStr = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${dateStr} at ${timeStr}`;
}

function getQuickDateOptions() {
  const now = new Date();
  const options = [];

  // Today at 7pm
  const today7pm = new Date(now);
  today7pm.setHours(19, 0, 0, 0);
  if (today7pm > now) {
    options.push({
      label: "Today 7pm",
      getDate: () => today7pm,
    });
  }

  // Tomorrow at 7pm
  const tomorrow7pm = new Date(now);
  tomorrow7pm.setDate(tomorrow7pm.getDate() + 1);
  tomorrow7pm.setHours(19, 0, 0, 0);
  options.push({
    label: "Tomorrow 7pm",
    getDate: () => tomorrow7pm,
  });

  // This weekend (next Saturday at 7pm)
  const nextSaturday = new Date(now);
  const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;
  nextSaturday.setDate(now.getDate() + daysUntilSaturday);
  nextSaturday.setHours(19, 0, 0, 0);
  options.push({
    label: "This Weekend",
    getDate: () => nextSaturday,
  });

  // Next week (same day next week at 7pm)
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);
  nextWeek.setHours(19, 0, 0, 0);
  options.push({
    label: "Next Week",
    getDate: () => nextWeek,
  });

  return options;
}

export function ManageEventPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [imagePreview, setImagePreview] = useState(undefined);
  const [hasUnsavedImage, setHasUnsavedImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [guestsCount, setGuestsCount] = useState(0);
  const [activeTab, setActiveTab] = useState("overview"); // "overview" or "edit"
  const [guests, setGuests] = useState([]);
  const [dinnerSlots, setDinnerSlots] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    function handleMouseMove(e) {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Update activeTab when URL changes
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabFromUrl = urlParams.get("tab") || "overview";
    if (tabFromUrl === "overview" || tabFromUrl === "edit") {
      setActiveTab(tabFromUrl);
    }
  }, [window.location.search]);

  useEffect(() => {
    async function load() {
      setNetworkError(false);
      try {
        const res = await authenticatedFetch(`/host/events/${id}`);
        if (!res.ok) throw new Error("Failed to load event");
        const data = await res.json();

        setEvent({
          ...data,
          startsAtLocal: data.startsAt
            ? new Date(data.startsAt).toISOString().slice(0, 16)
            : "",
          endsAtLocal: data.endsAt
            ? new Date(data.endsAt).toISOString().slice(0, 16)
            : "",
          timezone:
            data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          theme: data.theme || "minimal",
          calendar: data.calendar || "personal",
          visibility: data.visibility || "public",
          ticketType: data.ticketType || "free",
          requireApproval:
            typeof data.requireApproval === "boolean"
              ? data.requireApproval
              : false,
          dinnerStartTimeLocal: data.dinnerStartTime
            ? new Date(data.dinnerStartTime).toISOString().slice(0, 16)
            : "",
          dinnerEndTimeLocal: data.dinnerEndTime
            ? new Date(data.dinnerEndTime).toISOString().slice(0, 16)
            : "",
          maxAttendeesInput:
            typeof data.maxAttendees === "number"
              ? String(data.maxAttendees)
              : "",
          maxPlusOnesPerGuestInput:
            typeof data.maxPlusOnesPerGuest === "number"
              ? String(data.maxPlusOnesPerGuest)
              : "0",
          dinnerSeatingIntervalHoursInput:
            typeof data.dinnerSeatingIntervalHours === "number"
              ? String(data.dinnerSeatingIntervalHours)
              : "2",
          dinnerMaxSeatsPerSlotInput:
            typeof data.dinnerMaxSeatsPerSlot === "number"
              ? String(data.dinnerMaxSeatsPerSlot)
              : "",
          dinnerOverflowAction: data.dinnerOverflowAction || "waitlist",
          waitlistEnabled:
            typeof data.waitlistEnabled === "boolean"
              ? data.waitlistEnabled
              : true,
        });
        console.log("📥 [Load] Event loaded:", {
          eventImageUrl: data.imageUrl
            ? `${data.imageUrl.substring(0, 50)}...`
            : null,
          eventImageUrlLength: data.imageUrl?.length,
          hasUnsavedImage,
          currentImagePreview: imagePreview
            ? `${imagePreview.substring(0, 50)}...`
            : imagePreview,
        });

        // Only update imagePreview if user hasn't made unsaved changes
        if (!hasUnsavedImage) {
          if (data.imageUrl) {
            console.log(
              "📥 [Load] Setting imagePreview from loaded event (no unsaved changes)"
            );
            setImagePreview(data.imageUrl);
          } else {
            console.log(
              "📥 [Load] No imageUrl in loaded event, setting imagePreview to null"
            );
            setImagePreview(null);
          }
        } else {
          console.log(
            "📥 [Load] Skipping imagePreview update - user has unsaved image changes"
          );
        }

        // Fetch guests data for Overview tab
        try {
          const guestsRes = await authenticatedFetch(
            `/host/events/${id}/guests`
          );
          if (guestsRes.ok) {
            const guestsData = await guestsRes.json();
            setGuests(guestsData.guests || []);
            setGuestsCount(guestsData.guests?.length || 0);

            // Load dinner slots if dinner is enabled
            if (data.dinnerEnabled && data.slug) {
              try {
                const slotsRes = await publicFetch(
                  `/events/${data.slug}/dinner-slots`
                );
                if (slotsRes.ok) {
                  const slotsData = await slotsRes.json();
                  setDinnerSlots(slotsData.slots || []);
                }
              } catch (err) {
                console.error("Failed to load dinner slots", err);
              }
            }
          }
        } catch (err) {
          // Ignore guest count errors
        }
      } catch (err) {
        console.error(err);
        if (isNetworkError(err)) {
          setNetworkError(true);
        } else {
          showToast("Could not load event", "error");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, showToast]);

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("🖼️ [Image Upload] Starting upload:", {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      currentImagePreview: imagePreview,
      currentEventImageUrl: event?.imageUrl,
    });

    if (!file.type.startsWith("image/")) {
      showToast("Please upload an image file", "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be less than 5MB", "error");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      console.error("🖼️ [Image Upload] FileReader error");
      showToast("Failed to read image file", "error");
    };
    reader.onloadend = () => {
      if (reader.result) {
        const base64Image = reader.result;
        console.log("🖼️ [Image Upload] File read successfully:", {
          base64Length: base64Image.length,
          base64Preview: base64Image.substring(0, 50) + "...",
          settingImagePreview: true,
        });
        setImagePreview(base64Image);
        setHasUnsavedImage(true); // Mark that user has unsaved image changes
        // Update event state with the new image URL
        setEvent((prev) => {
          console.log("🖼️ [Image Upload] Updating event state:", {
            previousImageUrl: prev?.imageUrl,
            newImageUrl: base64Image,
          });
          return { ...prev, imageUrl: base64Image };
        });
        showToast("Image uploaded successfully! ✨", "success");
      } else {
        console.error("🖼️ [Image Upload] No result from FileReader");
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!event) return;

    setSaving(true);
    try {
      const maxAttendees =
        event.maxAttendeesInput === "" ? null : Number(event.maxAttendeesInput);

      const maxPlusOnesPerGuest = Number(event.maxPlusOnesPerGuestInput || 0);

      const dinnerMaxSeatsPerSlot =
        event.dinnerMaxSeatsPerSlotInput === ""
          ? null
          : Number(event.dinnerMaxSeatsPerSlotInput);

      const dinnerSeatingIntervalHours = Number(
        event.dinnerSeatingIntervalHoursInput || 2
      );

      // Calculate capacities (same logic as CreateEventPage)
      const cocktailCapacity = maxAttendees ? Number(maxAttendees) : null;

      // Calculate food capacity: max seats per slot * number of timeslots
      let foodCapacity = null;
      if (
        event.dinnerEnabled &&
        event.dinnerStartTimeLocal &&
        event.dinnerEndTimeLocal &&
        dinnerSeatingIntervalHours &&
        dinnerMaxSeatsPerSlot
      ) {
        // Helper function to calculate number of timeslots
        const calculateTimeslotCount = (startTime, endTime, intervalHours) => {
          if (!startTime || !endTime || !intervalHours) return 0;
          try {
            const [startDatePart, startTimePart] = startTime.split("T");
            const [endDatePart, endTimePart] = endTime.split("T");
            if (
              !startDatePart ||
              !startTimePart ||
              !endDatePart ||
              !endTimePart
            )
              return 0;
            const [startYear, startMonth, startDay] = startDatePart
              .split("-")
              .map(Number);
            const [startHour, startMinute] = startTimePart
              .split(":")
              .map(Number);
            const [endYear, endMonth, endDay] = endDatePart
              .split("-")
              .map(Number);
            const [endHour, endMinute] = endTimePart.split(":").map(Number);
            const startDate = new Date(
              startYear,
              startMonth - 1,
              startDay,
              startHour,
              startMinute
            );
            const endDate = new Date(
              endYear,
              endMonth - 1,
              endDay,
              endHour,
              endMinute
            );
            const interval = parseFloat(intervalHours);
            if (
              isNaN(startDate.getTime()) ||
              isNaN(endDate.getTime()) ||
              isNaN(interval) ||
              interval <= 0
            )
              return 0;
            if (endDate <= startDate) return 0;
            let count = 0;
            let currentTime = new Date(startDate);
            while (currentTime <= endDate) {
              count++;
              currentTime = new Date(
                currentTime.getTime() + interval * 60 * 60 * 1000
              );
            }
            return count;
          } catch (error) {
            return 0;
          }
        };

        const slotCount = calculateTimeslotCount(
          event.dinnerStartTimeLocal,
          event.dinnerEndTimeLocal,
          dinnerSeatingIntervalHours
        );
        const maxSeatsPerSlot = Number(dinnerMaxSeatsPerSlot);
        if (slotCount > 0 && maxSeatsPerSlot > 0) {
          foodCapacity = slotCount * maxSeatsPerSlot;
        }
      }

      // Calculate total capacity
      let totalCapacity = null;
      if (cocktailCapacity !== null || foodCapacity !== null) {
        totalCapacity = (cocktailCapacity || 0) + (foodCapacity || 0);
      }

      // Determine what imageUrl to send
      const imageUrlToSend =
        imagePreview !== undefined ? imagePreview : event.imageUrl || null;

      console.log("💾 [Save] Preparing to save event:", {
        imagePreview,
        imagePreviewDefined: imagePreview !== undefined,
        imagePreviewType: typeof imagePreview,
        eventImageUrl: event.imageUrl,
        imageUrlToSend: imageUrlToSend
          ? `${imageUrlToSend.substring(0, 50)}...`
          : null,
        imageUrlToSendLength: imageUrlToSend?.length,
        imageUrlToSendType: typeof imageUrlToSend,
      });

      const body = {
        title: event.title,
        description: event.description,
        location: event.location,
        startsAt: event.startsAtLocal
          ? new Date(event.startsAtLocal).toISOString()
          : null,
        endsAt: event.endsAtLocal
          ? new Date(event.endsAtLocal).toISOString()
          : null,
        timezone:
          event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        theme: event.theme || "minimal",
        calendar: event.calendar || "personal",
        visibility: event.visibility || "public",
        ticketType: event.ticketType || "free",
        requireApproval: !!event.requireApproval,
        maxAttendees,
        waitlistEnabled: !!event.waitlistEnabled,
        maxPlusOnesPerGuest,
        dinnerEnabled: !!event.dinnerEnabled,
        dinnerStartTime: event.dinnerStartTimeLocal
          ? new Date(event.dinnerStartTimeLocal).toISOString()
          : null,
        dinnerEndTime: event.dinnerEndTimeLocal
          ? new Date(event.dinnerEndTimeLocal).toISOString()
          : null,
        dinnerSeatingIntervalHours,
        dinnerMaxSeatsPerSlot,
        dinnerOverflowAction: event.dinnerOverflowAction || "waitlist",
        imageUrl: imageUrlToSend,
        cocktailCapacity,
        foodCapacity,
        totalCapacity,
      };

      console.log("💾 [Save] Request body:", {
        ...body,
        imageUrl: body.imageUrl
          ? `${body.imageUrl.substring(0, 50)}...`
          : body.imageUrl,
      });

      const res = await authenticatedFetch(`/host/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save event");
      }
      const updated = await res.json();

      console.log("💾 [Save] Server response received:", {
        updatedImageUrl: updated.imageUrl
          ? `${updated.imageUrl.substring(0, 50)}...`
          : null,
        updatedImageUrlLength: updated.imageUrl?.length,
        updatedImageUrlType: typeof updated.imageUrl,
        currentImagePreview: imagePreview
          ? `${imagePreview.substring(0, 50)}...`
          : imagePreview,
        currentImagePreviewLength: imagePreview?.length,
        currentImagePreviewType: typeof imagePreview,
        imagePreviewDefined: imagePreview !== undefined,
        currentEventImageUrl: event.imageUrl
          ? `${event.imageUrl.substring(0, 50)}...`
          : event.imageUrl,
        currentEventImageUrlLength: event.imageUrl?.length,
      });

      // Store what we sent - if imagePreview is defined (even if null), use it
      // Otherwise use event.imageUrl
      const sentImageUrl =
        imagePreview !== undefined ? imagePreview : event.imageUrl || null;

      console.log("💾 [Save] Updating state:", {
        sentImageUrl: sentImageUrl
          ? `${sentImageUrl.substring(0, 50)}...`
          : sentImageUrl,
        sentImageUrlLength: sentImageUrl?.length,
        updatedImageUrl: updated.imageUrl
          ? `${updated.imageUrl.substring(0, 50)}...`
          : updated.imageUrl,
        imagePreviewWasDefined: imagePreview !== undefined,
        willSetImagePreviewTo: updated.imageUrl || null,
      });

      // Update imagePreview based on what we sent vs what came back
      if (imagePreview !== undefined) {
        // We explicitly set imagePreview (either uploaded new or deleted)
        // Use what server returned to confirm
        console.log(
          "💾 [Save] imagePreview was defined, updating from server response"
        );
        setImagePreview(updated.imageUrl || null);
      } else {
        // We didn't change imagePreview, so update it from server response
        console.log(
          "💾 [Save] imagePreview was undefined, updating from server response"
        );
        setImagePreview(updated.imageUrl || null);
      }

      // Clear the unsaved flag since we just saved
      console.log("💾 [Save] Clearing hasUnsavedImage flag");
      setHasUnsavedImage(false);

      setEvent({
        ...updated,
        // Use server response for imageUrl
        imageUrl: updated.imageUrl || null,
        startsAtLocal: updated.startsAt
          ? new Date(updated.startsAt).toISOString().slice(0, 16)
          : "",
        endsAtLocal: updated.endsAt
          ? new Date(updated.endsAt).toISOString().slice(0, 16)
          : "",
        timezone:
          updated.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        theme: updated.theme || "minimal",
        calendar: updated.calendar || "personal",
        visibility: updated.visibility || "public",
        ticketType: updated.ticketType || "free",
        requireApproval:
          typeof updated.requireApproval === "boolean"
            ? updated.requireApproval
            : false,
        dinnerStartTimeLocal: updated.dinnerStartTime
          ? new Date(updated.dinnerStartTime).toISOString().slice(0, 16)
          : "",
        dinnerEndTimeLocal: updated.dinnerEndTime
          ? new Date(updated.dinnerEndTime).toISOString().slice(0, 16)
          : "",
        maxAttendeesInput:
          typeof updated.maxAttendees === "number"
            ? String(updated.maxAttendees)
            : "",
        maxPlusOnesPerGuestInput:
          typeof updated.maxPlusOnesPerGuest === "number"
            ? String(updated.maxPlusOnesPerGuest)
            : "0",
        dinnerSeatingIntervalHoursInput:
          typeof updated.dinnerSeatingIntervalHours === "number"
            ? String(updated.dinnerSeatingIntervalHours)
            : "2",
        dinnerMaxSeatsPerSlotInput:
          typeof updated.dinnerMaxSeatsPerSlot === "number"
            ? String(updated.dinnerMaxSeatsPerSlot)
            : "",
        dinnerOverflowAction: updated.dinnerOverflowAction || "waitlist",
        waitlistEnabled:
          typeof updated.waitlistEnabled === "boolean"
            ? updated.waitlistEnabled
            : true,
      });
      showToast("Event updated successfully!", "success");
    } catch (err) {
      console.error(err);
      if (isNetworkError(err)) {
        showToast(
          "Network error. Please check your connection and try again.",
          "error"
        );
      } else {
        showToast(
          err.message || "Failed to save event. Please try again.",
          "error"
        );
      }
    } finally {
      setSaving(false);
    }
  }

  // ---- loading / error states (unchanged) ----

  if (loading) {
    return (
      <div
        className="page-with-header"
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            Loading event…
          </div>
        </div>
      </div>
    );
  }

  if (networkError) {
    return (
      <div
        className="page-with-header"
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              textAlign: "center",
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <h2 style={{ marginBottom: "8px", fontSize: "24px" }}>
              Connection Error
            </h2>
            <p style={{ opacity: 0.7, marginBottom: "16px" }}>
              Unable to connect to the server. Please check your internet
              connection and try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 24px",
                borderRadius: "999px",
                border: "none",
                background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div
        className="page-with-header"
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            Event not found.
          </div>
        </div>
      </div>
    );
  }

  // ---- main manage UI ----

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        position: "relative",
        background:
          "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        paddingBottom: "40px",
      }}
    >
      {/* Cursor glow effect */}
      <div
        style={{
          position: "fixed",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)",
          left: mousePosition.x - 300,
          top: mousePosition.y - 300,
          pointerEvents: "none",
          transition: "all 0.3s ease-out",
          zIndex: 1,
        }}
      />

      <div
        className="responsive-container responsive-container-wide"
        style={{ position: "relative", zIndex: 2 }}
      >
        <div
          className="responsive-card"
          style={{
            background: "rgba(12, 10, 18, 0.6)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ marginBottom: "24px", fontSize: "14px", opacity: 0.7 }}>
            <Link
              to="/home"
              style={{
                color: "#aaa",
                textDecoration: "none",
                transition: "color 0.3s ease",
              }}
              onMouseEnter={(e) => (e.target.style.color = "#fff")}
              onMouseLeave={(e) => (e.target.style.color = "#aaa")}
            >
              ← Back to home
            </Link>
          </div>

          {/* Image Upload Section */}
          <div
            style={{
              marginBottom: "32px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                opacity: 0.7,
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>🖼️</span>
              <span>Event Cover Image</span>
            </div>
            <div
              style={{
                width: "100%",
                maxWidth: "500px",
                aspectRatio: "16/9",
                borderRadius: "16px",
                overflow: "hidden",
                background: isDragging
                  ? "rgba(139, 92, 246, 0.2)"
                  : (imagePreview !== undefined ? imagePreview : event.imageUrl)
                  ? "transparent"
                  : "rgba(20, 16, 30, 0.3)",
                border: isDragging
                  ? "2px dashed rgba(139, 92, 246, 0.5)"
                  : (imagePreview !== undefined ? imagePreview : event.imageUrl)
                  ? "1px solid rgba(255,255,255,0.1)"
                  : "1px solid rgba(255,255,255,0.06)",
                position: "relative",
                cursor: "pointer",
                transition: "all 0.3s ease",
                transform: isDragging ? "scale(1.01)" : "scale(1)",
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) {
                  handleImageUpload({ target: { files: [file] } });
                }
              }}
            >
              {(imagePreview !== undefined ? imagePreview : event.imageUrl) ? (
                <>
                  <img
                    src={
                      imagePreview !== undefined ? imagePreview : event.imageUrl
                    }
                    alt={event.title || "Event"}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background:
                        "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.5) 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: 0,
                      transition: "opacity 0.3s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "8px",
                        color: "#fff",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "32px",
                          marginBottom: "4px",
                        }}
                      >
                        📷
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Change Image
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px",
                    background:
                      "linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(236, 72, 153, 0.12) 100%)",
                    color: "#fff",
                  }}
                >
                  <div
                    style={{
                      fontSize: "48px",
                      opacity: 0.9,
                    }}
                  >
                    🖼️
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      opacity: 0.9,
                      textAlign: "center",
                      padding: "0 16px",
                    }}
                  >
                    {isDragging ? "Drop image here" : "Click or drag to upload"}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      opacity: 0.6,
                      textAlign: "center",
                      padding: "0 16px",
                    }}
                  >
                    JPG, PNG, or GIF (max 5MB)
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: "none" }}
              />
              {(imagePreview !== undefined ? imagePreview : event.imageUrl) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log("🗑️ [Delete Image] Removing image:", {
                      currentImagePreview: imagePreview
                        ? `${imagePreview.substring(0, 50)}...`
                        : imagePreview,
                      currentImagePreviewType: typeof imagePreview,
                      currentEventImageUrl: event.imageUrl
                        ? `${event.imageUrl.substring(0, 50)}...`
                        : event.imageUrl,
                    });
                    setImagePreview(null);
                    setHasUnsavedImage(true); // Mark that user has unsaved image changes
                    setEvent((prev) => {
                      console.log(
                        "🗑️ [Delete Image] Updating event state to remove imageUrl"
                      );
                      return { ...prev, imageUrl: null };
                    });
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  style={{
                    position: "absolute",
                    top: "12px",
                    right: "12px",
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.7)",
                    backdropFilter: "blur(10px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid rgba(255,255,255,0.2)",
                    fontSize: "16px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    color: "#fff",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "rgba(239, 68, 68, 0.8)";
                    e.target.style.transform = "scale(1.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "rgba(0,0,0,0.7)";
                    e.target.style.transform = "scale(1)";
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <h1
            style={{
              marginBottom: "8px",
              fontSize: "clamp(24px, 4vw, 32px)",
              fontWeight: 700,
            }}
          >
            {event.title || "Untitled event"}
          </h1>

          <div
            style={{
              marginBottom: "24px",
              fontSize: "14px",
              opacity: 0.8,
              padding: "12px 16px",
              background: "rgba(20, 16, 30, 0.6)",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            Public link:{" "}
            <a
              href={`/e/${event.slug}`}
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#8b5cf6",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              pullup.se/e/{event.slug}
            </a>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "32px",
              fontSize: "14px",
              borderBottom: "2px solid rgba(255,255,255,0.08)",
              paddingBottom: "0",
            }}
          >
            <button
              onClick={() => {
                setActiveTab("overview");
                navigate(`/app/events/${id}/manage`);
              }}
              style={{
                padding: "12px 20px",
                fontWeight: activeTab === "overview" ? 700 : 500,
                color: activeTab === "overview" ? "#fff" : "#9ca3af",
                borderBottom:
                  activeTab === "overview"
                    ? "2px solid #8b5cf6"
                    : "2px solid transparent",
                marginBottom: "-2px",
                background:
                  activeTab === "overview"
                    ? "rgba(139, 92, 246, 0.1)"
                    : "transparent",
                borderRadius: "8px 8px 0 0",
                border: "none",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== "overview") {
                  e.target.style.color = "#fff";
                  e.target.style.background = "rgba(255,255,255,0.05)";
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "overview") {
                  e.target.style.color = "#9ca3af";
                  e.target.style.background = "transparent";
                }
              }}
            >
              Overview
            </button>
            <button
              onClick={() => navigate(`/app/events/${id}/guests`)}
              style={{
                background: "transparent",
                border: "none",
                color: "#9ca3af",
                cursor: "pointer",
                transition: "all 0.3s ease",
                padding: "12px 20px",
                borderRadius: "8px 8px 0 0",
                fontWeight: 500,
                borderBottom: "2px solid transparent",
                marginBottom: "-2px",
              }}
              onMouseEnter={(e) => {
                e.target.style.color = "#fff";
                e.target.style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                e.target.style.color = "#9ca3af";
                e.target.style.background = "transparent";
              }}
            >
              👥 Guests ({guestsCount})
            </button>
            <button
              onClick={() => {
                setActiveTab("edit");
                navigate(`/app/events/${id}/manage?tab=edit`);
              }}
              style={{
                padding: "12px 20px",
                fontWeight: activeTab === "edit" ? 700 : 500,
                color: activeTab === "edit" ? "#fff" : "#9ca3af",
                borderBottom:
                  activeTab === "edit"
                    ? "2px solid #8b5cf6"
                    : "2px solid transparent",
                marginBottom: "-2px",
                background:
                  activeTab === "edit"
                    ? "rgba(139, 92, 246, 0.1)"
                    : "transparent",
                borderRadius: "8px 8px 0 0",
                border: "none",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== "edit") {
                  e.target.style.color = "#fff";
                  e.target.style.background = "rgba(255,255,255,0.05)";
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "edit") {
                  e.target.style.color = "#9ca3af";
                  e.target.style.background = "transparent";
                }
              }}
            >
              Edit
            </button>
          </div>

          {/* Overview Tab Content */}
          {activeTab === "overview" && event && (
            <OverviewTabContent
              event={event}
              guests={guests}
              dinnerSlots={dinnerSlots}
            />
          )}

          {/* Edit Tab Content */}
          {activeTab === "edit" && (
            <form
              onSubmit={handleSave}
              style={{
                background: "rgba(20, 16, 30, 0.4)",
                padding: "32px",
                borderRadius: "20px",
                border: "1px solid rgba(255,255,255,0.05)",
                display: "flex",
                flexDirection: "column",
                gap: "24px",
              }}
            >
              {/* Basic info */}
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.9,
                }}
              >
                Title
                <input
                  value={event.title || ""}
                  onChange={(e) =>
                    setEvent({ ...event, title: e.target.value })
                  }
                  onFocus={() => setFocusedField("title")}
                  onBlur={() => setFocusedField(null)}
                  style={
                    focusedField === "title" ? focusedInputStyle : inputStyle
                  }
                />
              </label>

              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.9,
                }}
              >
                Description
                <textarea
                  value={event.description || ""}
                  onChange={(e) =>
                    setEvent({ ...event, description: e.target.value })
                  }
                  onFocus={() => setFocusedField("description")}
                  onBlur={() => setFocusedField(null)}
                  style={{
                    ...(focusedField === "description"
                      ? focusedInputStyle
                      : inputStyle),
                    minHeight: "100px",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </label>

              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.9,
                }}
              >
                Location
                <LocationAutocomplete
                  value={event.location || ""}
                  onChange={(e) =>
                    setEvent({ ...event, location: e.target.value })
                  }
                  onFocus={() => setFocusedField("location")}
                  onBlur={() => setFocusedField(null)}
                  style={
                    focusedField === "location" ? focusedInputStyle : inputStyle
                  }
                  disabled={saving}
                />
              </label>

              <div
                style={{
                  background: "rgba(20, 16, 30, 0.3)",
                  borderRadius: "20px",
                  padding: "28px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(10px)",
                  marginBottom: "24px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "24px",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>🕒</span>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      opacity: 0.9,
                    }}
                  >
                    Event Schedule
                  </div>
                </div>

                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    marginBottom: "12px",
                    opacity: 0.9,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        background:
                          "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                        border: "2px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 0 0 2px rgba(139, 92, 246, 0.2)",
                      }}
                    />
                    <span>Start Date & Time</span>
                    <span style={{ opacity: 0.5, fontWeight: 400 }}>*</span>
                  </div>

                  {/* Quick shortcuts */}
                  {getQuickDateOptions().map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => {
                        const date = option.getDate();
                        setEvent({
                          ...event,
                          startsAtLocal: date.toISOString().slice(0, 16),
                        });
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.05)",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        opacity: 0.8,
                        marginRight: "8px",
                        marginBottom: "8px",
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.opacity = "1";
                        e.target.style.background = "rgba(139, 92, 246, 0.15)";
                        e.target.style.borderColor = "rgba(139, 92, 246, 0.3)";
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.opacity = "0.8";
                        e.target.style.background = "rgba(255,255,255,0.05)";
                        e.target.style.borderColor = "rgba(255,255,255,0.1)";
                      }}
                    >
                      {option.label}
                    </button>
                  ))}

                  <div style={{ position: "relative", marginTop: "12px" }}>
                    <input
                      type="datetime-local"
                      value={event.startsAtLocal || ""}
                      onChange={(e) =>
                        setEvent({ ...event, startsAtLocal: e.target.value })
                      }
                      onFocus={() => setFocusedField("startsAt")}
                      onBlur={() => setFocusedField(null)}
                      style={{
                        ...(focusedField === "startsAt"
                          ? focusedInputStyle
                          : inputStyle),
                        fontSize: "15px",
                        padding: "14px 16px 14px 48px",
                        cursor: "pointer",
                        width: "100%",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: "16px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "18px",
                        opacity: 0.7,
                        pointerEvents: "none",
                      }}
                    >
                      📅
                    </div>
                    {event.startsAtLocal && (
                      <div
                        style={{
                          position: "absolute",
                          right: "16px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          fontSize: "11px",
                          opacity: 0.6,
                          pointerEvents: "none",
                          fontWeight: 600,
                        }}
                      >
                        {formatRelativeTime(new Date(event.startsAtLocal))}
                      </div>
                    )}
                  </div>
                  {event.startsAtLocal && (
                    <div
                      style={{
                        fontSize: "12px",
                        opacity: 0.7,
                        marginTop: "8px",
                        paddingLeft: "4px",
                        fontStyle: "italic",
                      }}
                    >
                      {formatReadableDateTime(new Date(event.startsAtLocal))}
                    </div>
                  )}
                </label>

                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    marginTop: "20px",
                    opacity: 0.9,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        background:
                          "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                        border: "2px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 0 0 2px rgba(139, 92, 246, 0.2)",
                      }}
                    />
                    <span>End Date & Time</span>
                    <span style={{ opacity: 0.5, fontWeight: 400 }}>
                      (Optional)
                    </span>
                  </div>
                  <div style={{ position: "relative", marginTop: "12px" }}>
                    <input
                      type="datetime-local"
                      value={event.endsAtLocal || ""}
                      onChange={(e) =>
                        setEvent({ ...event, endsAtLocal: e.target.value })
                      }
                      onFocus={() => setFocusedField("endsAt")}
                      onBlur={() => setFocusedField(null)}
                      style={{
                        ...(focusedField === "endsAt"
                          ? focusedInputStyle
                          : inputStyle),
                        fontSize: "15px",
                        padding: "14px 16px 14px 48px",
                        cursor: "pointer",
                        width: "100%",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: "16px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "18px",
                        opacity: 0.7,
                        pointerEvents: "none",
                      }}
                    >
                      🕐
                    </div>
                  </div>
                  {event.endsAtLocal && (
                    <div
                      style={{
                        fontSize: "12px",
                        opacity: 0.7,
                        marginTop: "8px",
                        paddingLeft: "4px",
                        fontStyle: "italic",
                      }}
                    >
                      {formatReadableDateTime(new Date(event.endsAtLocal))}
                    </div>
                  )}
                </label>

                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    marginTop: "20px",
                    opacity: 0.9,
                  }}
                >
                  Timezone
                  <select
                    value={
                      event.timezone ||
                      Intl.DateTimeFormat().resolvedOptions().timeZone
                    }
                    onChange={(e) =>
                      setEvent({ ...event, timezone: e.target.value })
                    }
                    onFocus={() => setFocusedField("timezone")}
                    onBlur={() => setFocusedField(null)}
                    style={{
                      ...(focusedField === "timezone"
                        ? focusedInputStyle
                        : inputStyle),
                      fontSize: "15px",
                      cursor: "pointer",
                      marginTop: "8px",
                    }}
                  >
                    {Intl.supportedValuesOf("timeZone").map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Event Options */}
              <div
                style={{
                  background: "rgba(20, 16, 30, 0.3)",
                  borderRadius: "20px",
                  padding: "28px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(10px)",
                  marginBottom: "24px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "24px",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>⚙️</span>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      opacity: 0.9,
                    }}
                  >
                    Event Options
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "20px",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 600,
                      opacity: 0.9,
                    }}
                  >
                    Ticket Type
                    <select
                      value={event.ticketType || "free"}
                      onChange={(e) =>
                        setEvent({ ...event, ticketType: e.target.value })
                      }
                      onFocus={() => setFocusedField("ticketType")}
                      onBlur={() => setFocusedField(null)}
                      style={{
                        ...(focusedField === "ticketType"
                          ? focusedInputStyle
                          : inputStyle),
                        fontSize: "15px",
                        cursor: "pointer",
                        marginTop: "8px",
                      }}
                    >
                      <option value="free">Free</option>
                      <option value="paid">Paid</option>
                    </select>
                  </label>

                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 600,
                      opacity: 0.9,
                    }}
                  >
                    Visibility
                    <select
                      value={event.visibility || "public"}
                      onChange={(e) =>
                        setEvent({ ...event, visibility: e.target.value })
                      }
                      onFocus={() => setFocusedField("visibility")}
                      onBlur={() => setFocusedField(null)}
                      style={{
                        ...(focusedField === "visibility"
                          ? focusedInputStyle
                          : inputStyle),
                        fontSize: "15px",
                        cursor: "pointer",
                        marginTop: "8px",
                      }}
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </label>

                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 600,
                      opacity: 0.9,
                    }}
                  >
                    Theme
                    <select
                      value={event.theme || "minimal"}
                      onChange={(e) =>
                        setEvent({ ...event, theme: e.target.value })
                      }
                      onFocus={() => setFocusedField("theme")}
                      onBlur={() => setFocusedField(null)}
                      style={{
                        ...(focusedField === "theme"
                          ? focusedInputStyle
                          : inputStyle),
                        fontSize: "15px",
                        cursor: "pointer",
                        marginTop: "8px",
                      }}
                    >
                      <option value="minimal">Minimal</option>
                    </select>
                  </label>

                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 600,
                      opacity: 0.9,
                    }}
                  >
                    Calendar
                    <select
                      value={event.calendar || "personal"}
                      onChange={(e) =>
                        setEvent({ ...event, calendar: e.target.value })
                      }
                      onFocus={() => setFocusedField("calendar")}
                      onBlur={() => setFocusedField(null)}
                      style={{
                        ...(focusedField === "calendar"
                          ? focusedInputStyle
                          : inputStyle),
                        fontSize: "15px",
                        cursor: "pointer",
                        marginTop: "8px",
                      }}
                    >
                      <option value="personal">Personal</option>
                      <option value="business">Business</option>
                    </select>
                  </label>
                </div>

                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    fontSize: "13px",
                    fontWeight: 600,
                    marginTop: "20px",
                    gap: "8px",
                  }}
                >
                  <div style={{ opacity: 0.9 }}>Require Approval</div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 12px",
                      borderRadius: "12px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(20, 16, 30, 0.6)",
                    }}
                  >
                    <span style={{ fontSize: "14px", opacity: 0.8 }}>
                      Manually approve RSVPs before confirming
                    </span>
                    <label
                      style={{
                        position: "relative",
                        display: "inline-block",
                        width: "40px",
                        height: "20px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!event.requireApproval}
                        onChange={(e) =>
                          setEvent({
                            ...event,
                            requireApproval: e.target.checked,
                          })
                        }
                        style={{ display: "none" }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: event.requireApproval
                            ? "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)"
                            : "rgba(255,255,255,0.15)",
                          borderRadius: "10px",
                          transition: "all 0.3s ease",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            top: "2px",
                            left: event.requireApproval ? "22px" : "2px",
                            width: "16px",
                            height: "16px",
                            background: "#fff",
                            borderRadius: "50%",
                            transition: "all 0.3s ease",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                          }}
                        />
                      </span>
                    </label>
                  </div>
                </label>
              </div>

              {/* Capacity + waitlist */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr",
                  gap: "16px",
                  alignItems: "flex-end",
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    opacity: 0.9,
                  }}
                >
                  Max attendees
                  <input
                    type="number"
                    min="1"
                    value={event.maxAttendeesInput}
                    placeholder="Unlimited"
                    onChange={(e) =>
                      setEvent({ ...event, maxAttendeesInput: e.target.value })
                    }
                    onFocus={() => setFocusedField("maxAttendees")}
                    onBlur={() => setFocusedField(null)}
                    style={
                      focusedField === "maxAttendees"
                        ? focusedInputStyle
                        : inputStyle
                    }
                  />
                </label>

                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    fontSize: "13px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    opacity: 0.9,
                    gap: "8px",
                  }}
                >
                  Waitlist
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 12px",
                      borderRadius: "12px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(20, 16, 30, 0.6)",
                    }}
                  >
                    <span style={{ fontSize: "14px", opacity: 0.8 }}>
                      Enable waitlist when full
                    </span>
                    <label
                      style={{
                        position: "relative",
                        display: "inline-block",
                        width: "40px",
                        height: "20px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!event.waitlistEnabled}
                        onChange={(e) =>
                          setEvent({
                            ...event,
                            waitlistEnabled: e.target.checked,
                          })
                        }
                        style={{ display: "none" }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: event.waitlistEnabled
                            ? "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)"
                            : "rgba(255,255,255,0.15)",
                          borderRadius: "10px",
                          transition: "all 0.3s ease",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            top: "2px",
                            left: event.waitlistEnabled ? "22px" : "2px",
                            width: "16px",
                            height: "16px",
                            background: "#fff",
                            borderRadius: "50%",
                            transition: "all 0.3s ease",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                          }}
                        />
                      </span>
                    </label>
                  </div>
                </label>
              </div>

              {/* Plus-ones + dinner */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    opacity: 0.9,
                  }}
                >
                  Max plus-ones per guest
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={event.maxPlusOnesPerGuestInput}
                    onChange={(e) =>
                      setEvent({
                        ...event,
                        maxPlusOnesPerGuestInput: e.target.value,
                      })
                    }
                    onFocus={() => setFocusedField("maxPlusOnes")}
                    onBlur={() => setFocusedField(null)}
                    style={
                      focusedField === "maxPlusOnes"
                        ? focusedInputStyle
                        : inputStyle
                    }
                  />
                </label>

                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    fontSize: "13px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    opacity: 0.9,
                    gap: "8px",
                  }}
                >
                  Dinner option
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 12px",
                      borderRadius: "12px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(20, 16, 30, 0.6)",
                    }}
                  >
                    <span style={{ fontSize: "14px", opacity: 0.8 }}>
                      Allow guests to opt into dinner
                    </span>
                    <label
                      style={{
                        position: "relative",
                        display: "inline-block",
                        width: "40px",
                        height: "20px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!event.dinnerEnabled}
                        onChange={(e) =>
                          setEvent({
                            ...event,
                            dinnerEnabled: e.target.checked,
                          })
                        }
                        style={{ display: "none" }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: event.dinnerEnabled
                            ? "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)"
                            : "rgba(255,255,255,0.15)",
                          borderRadius: "10px",
                          transition: "all 0.3s ease",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            top: "2px",
                            left: event.dinnerEnabled ? "22px" : "2px",
                            width: "16px",
                            height: "16px",
                            background: "#fff",
                            borderRadius: "50%",
                            transition: "all 0.3s ease",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                          }}
                        />
                      </span>
                    </label>
                  </div>
                </label>
              </div>

              {event.dinnerEnabled && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "20px",
                    padding: "24px",
                    background:
                      "linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(236, 72, 153, 0.05) 100%)",
                    borderRadius: "16px",
                    border: "1px solid rgba(139, 92, 246, 0.2)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ fontSize: "20px" }}>🍽️</span>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        opacity: 0.9,
                      }}
                    >
                      Cuisine Configuration
                    </div>
                  </div>

                  {/* Time Range */}
                  <div>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        opacity: 0.7,
                        marginBottom: "12px",
                      }}
                    >
                      Cuisine Time Window
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "12px",
                            opacity: 0.8,
                            marginBottom: "8px",
                          }}
                        >
                          First Slot Start{" "}
                          <span style={{ color: "#ef4444" }}>*</span>
                        </label>
                        <input
                          type="datetime-local"
                          value={event.dinnerStartTimeLocal || ""}
                          onChange={(e) =>
                            setEvent({
                              ...event,
                              dinnerStartTimeLocal: e.target.value,
                            })
                          }
                          required={event.dinnerEnabled}
                          onFocus={() => setFocusedField("dinnerStartTime")}
                          onBlur={() => setFocusedField(null)}
                          style={{
                            ...(focusedField === "dinnerStartTime"
                              ? focusedInputStyle
                              : inputStyle),
                            fontSize: "14px",
                            padding: "12px 14px",
                            width: "100%",
                            cursor: "pointer",
                          }}
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "12px",
                            opacity: 0.8,
                            marginBottom: "8px",
                          }}
                        >
                          Last Slot Start{" "}
                          <span style={{ color: "#ef4444" }}>*</span>
                        </label>
                        <input
                          type="datetime-local"
                          value={event.dinnerEndTimeLocal || ""}
                          onChange={(e) =>
                            setEvent({
                              ...event,
                              dinnerEndTimeLocal: e.target.value,
                            })
                          }
                          required={event.dinnerEnabled}
                          min={event.dinnerStartTimeLocal || undefined}
                          onFocus={() => setFocusedField("dinnerEndTime")}
                          onBlur={() => setFocusedField(null)}
                          style={{
                            ...(focusedField === "dinnerEndTime"
                              ? focusedInputStyle
                              : inputStyle),
                            fontSize: "14px",
                            padding: "12px 14px",
                            width: "100%",
                            cursor: "pointer",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Seating Configuration */}
                  <div>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        opacity: 0.7,
                        marginBottom: "12px",
                      }}
                    >
                      Seating Settings
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "12px",
                            opacity: 0.8,
                            marginBottom: "8px",
                          }}
                        >
                          Hours per slot
                        </label>
                        <input
                          type="number"
                          min="0.5"
                          max="12"
                          step="0.5"
                          value={event.dinnerSeatingIntervalHoursInput || "2"}
                          onChange={(e) =>
                            setEvent({
                              ...event,
                              dinnerSeatingIntervalHoursInput: e.target.value,
                            })
                          }
                          placeholder="2"
                          onFocus={() => setFocusedField("dinnerInterval")}
                          onBlur={() => setFocusedField(null)}
                          style={{
                            ...(focusedField === "dinnerInterval"
                              ? focusedInputStyle
                              : inputStyle),
                            fontSize: "14px",
                            padding: "12px 14px",
                            width: "100%",
                          }}
                        />
                        {event.dinnerStartTimeLocal &&
                          event.dinnerEndTimeLocal &&
                          event.dinnerSeatingIntervalHoursInput && (
                            <div
                              style={{
                                marginTop: "10px",
                                padding: "12px 14px",
                                background: "rgba(139, 92, 246, 0.08)",
                                borderRadius: "8px",
                                border: "1px solid rgba(139, 92, 246, 0.15)",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  marginBottom: "8px",
                                  fontSize: "10px",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.08em",
                                  opacity: 0.75,
                                  color: "rgba(139, 92, 246, 0.9)",
                                }}
                              >
                                Calculated Timeslots
                              </div>
                              {(() => {
                                const slots = calculateCuisineTimeslots(
                                  event.dinnerStartTimeLocal,
                                  event.dinnerEndTimeLocal,
                                  event.dinnerSeatingIntervalHoursInput
                                );
                                if (slots.length === 0) {
                                  return (
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        opacity: 0.6,
                                        fontStyle: "italic",
                                      }}
                                    >
                                      Invalid time window or interval
                                    </div>
                                  );
                                }
                                return (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexWrap: "wrap",
                                      gap: "6px",
                                    }}
                                  >
                                    {slots.map((slot, index) => (
                                      <span
                                        key={index}
                                        style={{
                                          padding: "4px 10px",
                                          background:
                                            "rgba(139, 92, 246, 0.15)",
                                          borderRadius: "6px",
                                          border:
                                            "1px solid rgba(139, 92, 246, 0.25)",
                                          fontSize: "12px",
                                          fontWeight: 500,
                                          color: "rgba(255, 255, 255, 0.95)",
                                          fontFamily: "monospace",
                                          letterSpacing: "0.5px",
                                        }}
                                      >
                                        {slot}
                                      </span>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        {(!event.dinnerStartTimeLocal ||
                          !event.dinnerEndTimeLocal ||
                          !event.dinnerSeatingIntervalHoursInput) && (
                          <div
                            style={{
                              fontSize: "10px",
                              opacity: 0.6,
                              marginTop: "4px",
                            }}
                          >
                            Set time window above to see calculated timeslots
                          </div>
                        )}
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "12px",
                            opacity: 0.8,
                            marginBottom: "8px",
                          }}
                        >
                          Max Seats Per Slot
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={event.dinnerMaxSeatsPerSlotInput || ""}
                          onChange={(e) =>
                            setEvent({
                              ...event,
                              dinnerMaxSeatsPerSlotInput: e.target.value,
                            })
                          }
                          placeholder="Unlimited"
                          onFocus={() => setFocusedField("dinnerSeats")}
                          onBlur={() => setFocusedField(null)}
                          style={{
                            ...(focusedField === "dinnerSeats"
                              ? focusedInputStyle
                              : inputStyle),
                            fontSize: "14px",
                            padding: "12px 14px",
                            width: "100%",
                          }}
                        />
                        <div
                          style={{
                            fontSize: "10px",
                            opacity: 0.6,
                            marginTop: "4px",
                          }}
                        >
                          Leave empty for unlimited
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Overflow Handling */}
                  {event.dinnerMaxSeatsPerSlotInput && (
                    <div>
                      <div
                        style={{
                          padding: "14px",
                          borderRadius: "12px",
                          border: "1px solid rgba(139, 92, 246, 0.3)",
                          background: "rgba(139, 92, 246, 0.1)",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "12px",
                        }}
                      >
                        <span style={{ fontSize: "16px" }}>📋</span>
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "14px",
                              color: "#fff",
                              marginBottom: "4px",
                            }}
                          >
                            Add to Waitlist
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              opacity: 0.7,
                              color: "rgba(255,255,255,0.8)",
                            }}
                          >
                            When dinner seats are full, guests will be added to
                            the waitlist
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                style={{
                  marginTop: "8px",
                  padding: "14px 28px",
                  borderRadius: "999px",
                  border: "none",
                  background: saving
                    ? "#666"
                    : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "15px",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  boxShadow: saving
                    ? "none"
                    : "0 10px 30px rgba(139, 92, 246, 0.4)",
                  transition: "all 0.3s ease",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  alignSelf: "flex-start",
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.target.style.transform = "translateY(-2px)";
                    e.target.style.boxShadow =
                      "0 15px 40px rgba(139, 92, 246, 0.6)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow =
                      "0 10px 30px rgba(139, 92, 246, 0.4)";
                  }
                }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
