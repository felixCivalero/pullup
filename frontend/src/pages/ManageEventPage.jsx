// frontend/src/pages/ManageEventPage.jsx
import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useToast } from "../components/Toast";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { getEventUrl, getEventShareUrl } from "../lib/urlUtils";
import { FaPaperPlane, FaCalendar } from "react-icons/fa";
import { logger } from "../lib/logger.js";
import { EventOverviewStats } from "../components/EventOverviewStats.jsx";

import { authenticatedFetch, publicFetch, API_BASE } from "../lib/api.js";
import { uploadEventImage, validateImageFile } from "../lib/imageUtils.js";

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
  fontSize: "16px",
  outline: "none",
  boxSizing: "border-box",
  transition: "all 0.3s ease",
  backdropFilter: "blur(10px)",
  minHeight: "44px", // Touch-friendly minimum height
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
function OverviewTabContent({ event, guests, dinnerSlots, isMobile = false }) {
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

      {/* Pulled Up Details */}
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
                      background: "rgb(12 10 18 / 10%)",
                      borderRadius: "14px",
                      border: "1px solid rgba(255,255,255,0.05)",
                      backdropFilter: "blur(10px)",
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
                        fontSize: "14px",
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
                          fontSize: "14px",
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
                          fontSize: "14px",
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
        background: "rgb(12 10 18 / 10%)",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.05)",
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
          fontSize: "14px",
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

// Helper function to convert ISO string to datetime-local format (local time)
function isoToLocalDateTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Helper function to convert datetime-local string to ISO string
function localDateTimeToIso(localDateTimeString) {
  if (!localDateTimeString) return "";

  const [datePart, timePart] = localDateTimeString.split("T");
  if (!datePart || !timePart) return "";

  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);

  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (isNaN(localDate.getTime())) return "";

  return localDate.toISOString();
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

function formatTimezone(timezone) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    timeZoneName: "short",
  });
  const parts = formatter.formatToParts(now);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "";
  const city = timezone.split("/").pop()?.replace(/_/g, " ") || timezone;
  return { tzName, city };
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);
  const calendarDropdownRef = useRef(null);
  const fileInputRef = useRef(null);
  const startDateTimeInputRef = useRef(null);
  const endDateTimeInputRef = useRef(null);
  const dinnerStartTimeInputRef = useRef(null);
  const dinnerEndTimeInputRef = useRef(null);

  useEffect(() => {
    function handleMouseMove(e) {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Update activeTab when URL changes
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabFromUrl = urlParams.get("tab") || "overview";
    if (tabFromUrl === "overview" || tabFromUrl === "edit") {
      setActiveTab(tabFromUrl);
    }
  }, [window.location.search]);

  // Close calendar dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        calendarDropdownRef.current &&
        !calendarDropdownRef.current.contains(event.target)
      ) {
        setShowCalendarDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    async function load() {
      setNetworkError(false);
      try {
        const res = await authenticatedFetch(`/host/events/${id}`);
        if (!res.ok) throw new Error("Failed to load event");
        const data = await res.json();

        setEvent({
          ...data,
          startsAt: data.startsAt || null, // Keep ISO string
          endsAt: data.endsAt || null, // Keep ISO string
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
          dinnerStartTime: data.dinnerStartTime || null, // Keep ISO string
          dinnerEndTime: data.dinnerEndTime || null, // Keep ISO string
          dinnerStartTimeLocal: data.dinnerStartTime
            ? new Date(data.dinnerStartTime).toISOString().slice(0, 16)
            : "",
          dinnerEndTimeLocal: data.dinnerEndTime
            ? new Date(data.dinnerEndTime).toISOString().slice(0, 16)
            : "",
          locationLat: data.locationLat || null,
          locationLng: data.locationLng || null,
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
        logger.debug("📥 [Load] Event loaded", {
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
            logger.debug(
              "📥 [Load] Setting imagePreview from loaded event (no unsaved changes)"
            );
            setImagePreview(data.imageUrl);
          } else {
            logger.debug(
              "📥 [Load] No imageUrl in loaded event, setting imagePreview to null"
            );
            setImagePreview(null);
          }
        } else {
          logger.debug(
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

  function getCalendarUrls() {
    if (!event || !event.startsAt) {
      return {};
    }

    const formatDateForGoogle = (dateString) => {
      if (!dateString) return null;
      const date = new Date(dateString);
      return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const startDate = formatDateForGoogle(event.startsAt);
    if (!startDate) {
      return {};
    }

    let endDate;
    if (event.endsAt) {
      endDate = formatDateForGoogle(event.endsAt);
    } else {
      // Default to 2 hours after start if no end date
      const start = new Date(event.startsAt);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      endDate = formatDateForGoogle(end.toISOString());
    }

    const eventUrl = `${window.location.origin}/e/${event.slug}`;
    const description = `${event.description || ""}\n\nEvent page: ${eventUrl}`;

    const location = encodeURIComponent(event.location || "");
    const title = encodeURIComponent(event.title);
    const desc = encodeURIComponent(description);

    return {
      google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&details=${desc}&location=${location}`,
      outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${startDate}&enddt=${endDate}&body=${desc}&location=${location}`,
      yahoo: `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${title}&st=${startDate}&dur=${endDate}&desc=${desc}&in_loc=${location}`,
      apple: `data:text/calendar;charset=utf8,BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${startDate}\nDTEND:${endDate}\nSUMMARY:${title}\nDESCRIPTION:${desc}\nLOCATION:${location}\nEND:VEVENT\nEND:VCALENDAR`,
    };
  }

  function handleAddToCalendar(provider) {
    const urls = getCalendarUrls();
    const url = urls[provider];

    if (!url) {
      showToast("Unable to generate calendar link", "error");
      return;
    }

    if (provider === "apple") {
      // For Apple Calendar, create a downloadable .ics file
      const blob = new Blob([url.split(",")[1]], { type: "text/calendar" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${event.slug}.ics`;
      link.click();
    } else {
      window.open(url, "_blank");
    }
    setShowCalendarDropdown(false);
  }

  function handleShare() {
    if (!event) return;

    const shareUrl = getEventShareUrl(event.slug);

    if (navigator.share) {
      // URL ONLY - no title, no text, no files
      // This ensures rich preview (OG tags) is shown, not custom text
      navigator
        .share({
          url: shareUrl,
        })
        .then(() => {
          showToast("Event shared! 🎉", "success");
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            navigator.clipboard.writeText(shareUrl);
            showToast("Link copied to clipboard! 📋", "success");
          }
        });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(shareUrl);
      showToast("Link copied to clipboard! 📋", "success");
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const syntheticEvent = {
        target: { files: [file] },
        dataTransfer: { files: [file] },
      };
      handleImageUpload(syntheticEvent);
    }
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    if (!file) return;

    // Validate file using utility
    const validation = validateImageFile(file);
    if (!validation.valid) {
      showToast(validation.error, "error");
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onerror = () => {
      console.error("🖼️ [Image Upload] FileReader error");
      showToast("Failed to read image file", "error");
    };
    reader.onloadend = async () => {
      if (reader.result) {
        const base64Image = reader.result;
        setImagePreview(base64Image);
        setHasUnsavedImage(true);

        // Upload to API immediately using utility
        try {
          const updated = await uploadEventImage(id, file);
          setEvent((prev) => ({
            ...prev,
            imageUrl: updated.imageUrl, // Use the URL from server
          }));
          setImagePreview(updated.imageUrl); // Update preview with URL
          setHasUnsavedImage(false); // Image is now saved
          showToast("Image uploaded successfully! ✨", "success");
        } catch (error) {
          console.error("🖼️ [Image Upload] API error:", error);
          showToast("Failed to upload image. Please try again.", "error");
          // Keep preview for retry
        }
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
      const dinnerStartTimeForCalc =
        event.dinnerStartTimeLocal ||
        (event.dinnerStartTime
          ? isoToLocalDateTime(event.dinnerStartTime)
          : "");
      const dinnerEndTimeForCalc =
        event.dinnerEndTimeLocal ||
        (event.dinnerEndTime ? isoToLocalDateTime(event.dinnerEndTime) : "");

      if (
        event.dinnerEnabled &&
        dinnerStartTimeForCalc &&
        dinnerEndTimeForCalc &&
        dinnerSeatingIntervalHours &&
        dinnerMaxSeatsPerSlot
      ) {
        const slots = calculateCuisineTimeslots(
          dinnerStartTimeForCalc,
          dinnerEndTimeForCalc,
          event.dinnerSeatingIntervalHoursInput || "2"
        );
        const maxSeatsPerSlot = Number(dinnerMaxSeatsPerSlot);
        if (slots.length > 0 && maxSeatsPerSlot > 0) {
          foodCapacity = slots.length * maxSeatsPerSlot;
        }
      }

      // Calculate total capacity
      let totalCapacity = null;
      if (cocktailCapacity !== null || foodCapacity !== null) {
        totalCapacity = (cocktailCapacity || 0) + (foodCapacity || 0);
      }

      // Don't send imageUrl in the update - it's handled separately via upload endpoint
      // Only send imageUrl: null if user explicitly deleted it
      const imageUrlToSend = null; // Images are uploaded separately

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

      // Use ISO strings if available, otherwise convert from local datetime strings
      const startsAtISO =
        event.startsAt ||
        (event.startsAtLocal ? localDateTimeToIso(event.startsAtLocal) : null);
      const endsAtISO =
        event.endsAt ||
        (event.endsAtLocal ? localDateTimeToIso(event.endsAtLocal) : null);
      const dinnerStartTimeISO =
        event.dinnerStartTime ||
        (event.dinnerStartTimeLocal
          ? localDateTimeToIso(event.dinnerStartTimeLocal)
          : null);
      const dinnerEndTimeISO =
        event.dinnerEndTime ||
        (event.dinnerEndTimeLocal
          ? localDateTimeToIso(event.dinnerEndTimeLocal)
          : null);

      const body = {
        title: event.title,
        description: event.description,
        location: event.location,
        locationLat: event.locationLat || null,
        locationLng: event.locationLng || null,
        startsAt: startsAtISO,
        endsAt: endsAtISO,
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
        dinnerStartTime: dinnerStartTimeISO,
        dinnerEndTime: dinnerEndTimeISO,
        dinnerSeatingIntervalHours,
        dinnerMaxSeatsPerSlot,
        dinnerOverflowAction: event.dinnerOverflowAction || "waitlist",
        // Don't send imageUrl - it's handled via separate upload endpoint
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
            <p style={{ opacity: 0.7, marginBottom: "16px", fontSize: "16px" }}>
              Unable to connect to the server. Please check your internet
              connection and try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "14px 24px",
                minHeight: "44px",
                borderRadius: "999px",
                border: "none",
                background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "16px",
                cursor: "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
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

      {/* Hero Image Background - Full Screen */}
      {(imagePreview !== undefined ? imagePreview : event.imageUrl) && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              height: "100%",
              zIndex: 0,
            }}
            onClick={() => {
              // Click on image to change it
              fileInputRef.current?.click();
            }}
            onContextMenu={(e) => {
              // Right-click to remove image
              e.preventDefault();
              if (
                window.confirm(
                  "Are you sure you want to remove this image? You can add a new one by clicking on the image."
                )
              ) {
                async function deleteImage() {
                  try {
                    const updateRes = await authenticatedFetch(
                      `/host/events/${id}`,
                      {
                        method: "PUT",
                        body: JSON.stringify({ imageUrl: null }),
                      }
                    );

                    if (updateRes.ok) {
                      const updated = await updateRes.json();
                      setEvent((prev) => ({
                        ...prev,
                        imageUrl: null,
                      }));
                      setImagePreview(null);
                      setHasUnsavedImage(false);
                      showToast("Image removed", "success");
                    } else {
                      throw new Error("Failed to remove image");
                    }
                  } catch (error) {
                    console.error("Error removing image:", error);
                    showToast("Failed to remove image", "error");
                  }
                }
                deleteImage();
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }
            }}
          >
            <img
              src={imagePreview !== undefined ? imagePreview : event.imageUrl}
              alt={event.title || "Event"}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                cursor: "pointer",
              }}
            />
          </div>
          {/* Gradient overlay - fades to dark at bottom where menu is */}
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background:
                "linear-gradient(to bottom, transparent 0%, transparent 30%, rgba(5, 4, 10, 0.2) 50%, rgba(5, 4, 10, 0.5) 65%, rgba(12, 10, 18, 0.8) 80%, rgba(12, 10, 18, 0.95) 90%, #0c0a12 100%)",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        </>
      )}

      {/* Content - Overlaid on background */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: "100%",
          padding: "0",
          margin: "0",
        }}
      >
        {/* Share and Calendar Icons - Above Title */}
        {event && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "20px 20px 12px 20px",
            }}
          >
            {/* Share button */}
            <button
              onClick={handleShare}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                boxShadow: "none",
                appearance: "none",
                WebkitAppearance: "none",
                MozAppearance: "none",
                cursor: "pointer",
                color: "rgba(255, 255, 255, 0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.color = "#fff";
                e.target.style.transform = "scale(1.1)";
              }}
              onMouseLeave={(e) => {
                e.target.style.color = "rgba(255, 255, 255, 0.8)";
                e.target.style.transform = "scale(1)";
              }}
            >
              <FaPaperPlane size={20} />
            </button>

            {/* Calendar dropdown */}
            <div
              ref={calendarDropdownRef}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCalendarDropdown(!showCalendarDropdown);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  margin: 0,
                  boxShadow: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  cursor: "pointer",
                  color: "rgba(255, 255, 255, 0.7)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = "rgba(255, 255, 255, 0.9)";
                  e.target.style.transform = "scale(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = "rgba(255, 255, 255, 0.7)";
                  e.target.style.transform = "scale(1)";
                }}
              >
                <FaCalendar size={18} />
              </button>

              {showCalendarDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: "8px",
                    background: "rgba(20, 16, 30, 0.95)",
                    backdropFilter: "blur(10px)",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    overflow: "hidden",
                    zIndex: 10,
                    minWidth: "180px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  }}
                >
                  <button
                    onClick={() => handleAddToCalendar("google")}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      border: "none",
                      background: "transparent",
                      color: "#fff",
                      fontSize: "15px",
                      textAlign: "left",
                      cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = "rgba(255,255,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = "transparent";
                    }}
                  >
                    Google Calendar
                  </button>
                  <button
                    onClick={() => handleAddToCalendar("outlook")}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      border: "none",
                      background: "transparent",
                      color: "#fff",
                      fontSize: "15px",
                      textAlign: "left",
                      cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = "rgba(255,255,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = "transparent";
                    }}
                  >
                    Outlook
                  </button>
                  <button
                    onClick={() => handleAddToCalendar("yahoo")}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      border: "none",
                      background: "transparent",
                      color: "#fff",
                      fontSize: "15px",
                      textAlign: "left",
                      cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = "rgba(255,255,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = "transparent";
                    }}
                  >
                    Yahoo Calendar
                  </button>
                  <button
                    onClick={() => handleAddToCalendar("apple")}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      border: "none",
                      background: "transparent",
                      color: "#fff",
                      fontSize: "15px",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = "rgba(255,255,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = "transparent";
                    }}
                  >
                    Apple Calendar
                  </button>
                </div>
              )}
            </div>

            {/* Go to live link */}
            <div
              style={{
                fontSize: "16px",
                opacity: 0.8,
                color: "rgba(255, 255, 255, 0.8)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flex: 1,
              }}
            >
              <a
                href={`/e/${event.slug}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#8b5cf6",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "16px",
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = "#a78bfa";
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = "#8b5cf6";
                }}
              >
                go to live
              </a>
            </div>
          </div>
        )}

        {/* Title - Above Menu */}
        <h1
          style={{
            marginBottom: "20px",
            padding: "0 20px",
            fontSize: "clamp(28px, 8vw, 40px)",
            fontWeight: 800,
            lineHeight: "1.2",
            color: "#fff",
            letterSpacing: "-0.02em",
            maxWidth: "100%",
          }}
        >
          {event.title || "Untitled event"}
        </h1>

        {/* Content Card - Contains tabs and tab content */}
        <div
          style={{
            background: "rgba(12, 10, 18, 0.6)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.05)",
            marginTop: "0",
            width: "100%",
            maxWidth: "100%",
            borderRadius: "0",
            padding: "0",
            boxSizing: "border-box",
          }}
        >
          {/* Hidden file input - shared by both banner and upload section */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: "none" }}
          />

          {/* Image Upload Section - Only shown when no image exists */}
          {!(imagePreview !== undefined ? imagePreview : event.imageUrl) && (
            <>
              <div
                style={{
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "200px",
                    borderRadius: "16px",
                    overflow: "hidden",
                    background: isDragging
                      ? "rgba(139, 92, 246, 0.2)"
                      : "rgba(20, 16, 30, 0.3)",
                    border: isDragging
                      ? "2px dashed rgba(139, 92, 246, 0.5)"
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
                      {isDragging
                        ? "Drop image here"
                        : "Click or drag to upload"}
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
                </div>
              </div>

              {/* Title and Card - Normal layout when no image */}
              <div
                className="responsive-card"
                style={{
                  background: "rgba(12, 10, 18, 0.6)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  marginBottom: "20px",
                }}
              >
                {/* Title */}
                <h1
                  style={{
                    marginBottom: "16px",
                    fontSize: "clamp(28px, 8vw, 40px)",
                    fontWeight: 800,
                    lineHeight: "1.2",
                    color: "#fff",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {event.title || "Untitled event"}
                </h1>
              </div>
            </>
          )}

          {/* Content Card - Contains tabs and tab content */}
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
              marginTop: (
                imagePreview !== undefined ? imagePreview : event.imageUrl
              )
                ? "0"
                : "0",
              maxWidth: "100%",
              borderRadius: "0",
              marginLeft: "0",
              marginRight: "0",
              padding: "20px",
            }}
          >
            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                marginBottom: "0",
                padding: "20px 20px 0 20px",
                fontSize: "16px",
                borderBottom: "2px solid rgba(255,255,255,0.08)",
                paddingBottom: "0",
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <button
                onClick={() => {
                  setActiveTab("overview");
                  navigate(`/app/events/${id}/manage`);
                }}
                style={{
                  padding: "14px 20px",
                  minHeight: "44px",
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
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  fontSize: "16px",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
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
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  padding: "14px 20px",
                  minHeight: "44px",
                  borderRadius: "8px 8px 0 0",
                  fontWeight: 500,
                  borderBottom: "2px solid transparent",
                  marginBottom: "-2px",
                  fontSize: "16px",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
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
                  padding: "14px 20px",
                  minHeight: "44px",
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
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  fontSize: "16px",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
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

            {/* Tab Content Container */}
            <div
              style={{
                padding: "24px 20px",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {/* Overview Tab Content */}
              {activeTab === "overview" && event && (
                <OverviewTabContent
                  event={event}
                  guests={guests}
                  dinnerSlots={dinnerSlots}
                  isMobile={isMobile}
                />
              )}

              {/* Edit Tab Content */}
              {activeTab === "edit" && event && (
                <form
                  onSubmit={handleSave}
                  style={{
                    width: "100%",
                    maxWidth: "100%",
                    margin: "0",
                  }}
                >
                  <h2
                    style={{
                      fontSize: "11px",
                      textTransform: "uppercase",
                      opacity: 0.7,
                      letterSpacing: "0.15em",
                      fontWeight: 600,
                      marginBottom: "24px",
                      color: "#fff",
                    }}
                  >
                    PULLUP · EDIT EVENT
                  </h2>

                  {/* Image upload section */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: "none" }}
                  />
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "16/9",
                      borderRadius: "16px",
                      overflow: "hidden",
                      marginBottom: "24px",
                      background: isDragging
                        ? "rgba(139, 92, 246, 0.2)"
                        : (
                            imagePreview !== undefined
                              ? imagePreview
                              : event.imageUrl
                          )
                        ? "transparent"
                        : "rgba(20, 16, 30, 0.3)",
                      border: isDragging
                        ? "2px dashed rgba(139, 92, 246, 0.5)"
                        : (
                            imagePreview !== undefined
                              ? imagePreview
                              : event.imageUrl
                          )
                        ? "1px solid rgba(255,255,255,0.1)"
                        : "1px solid rgba(255,255,255,0.06)",
                      position: "relative",
                      cursor: "pointer",
                      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      transform: isDragging ? "scale(1.02)" : "scale(1)",
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    {(
                      imagePreview !== undefined ? imagePreview : event.imageUrl
                    ) ? (
                      <>
                        <img
                          src={
                            imagePreview !== undefined
                              ? imagePreview
                              : event.imageUrl
                          }
                          alt="Event cover"
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
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.opacity = "1")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.opacity = "0")
                          }
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
                            fontSize: "56px",
                            opacity: 0.9,
                            transition: "transform 0.3s ease",
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
                          {isDragging
                            ? "Drop image here"
                            : "Click or drag to upload"}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            opacity: 0.6,
                            textAlign: "center",
                            padding: "0 16px",
                          }}
                        >
                          Recommended: 16:9 ratio, max 5MB
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Title input - Enhanced visibility with subtle background */}
                  <input
                    value={event.title || ""}
                    onChange={(e) =>
                      setEvent({ ...event, title: e.target.value })
                    }
                    placeholder="Event Name"
                    required
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      fontSize: "clamp(24px, 5vw, 32px)",
                      fontWeight: 700,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "12px",
                      color: event.title ? "#fff" : "rgba(255,255,255,0.6)",
                      outline: "none",
                      marginBottom: "16px",
                      padding: "16px 18px",
                      lineHeight: "1.3",
                      textShadow: "0 2px 8px rgba(0,0,0,0.3)",
                      transition: "all 0.2s ease",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}
                    onFocus={(e) => {
                      e.target.style.background = "rgba(255,255,255,0.05)";
                      e.target.style.border =
                        "1px solid rgba(139, 92, 246, 0.3)";
                      e.target.style.boxShadow =
                        "0 4px 12px rgba(139, 92, 246, 0.15)";
                      e.target.style.color = "#fff";
                    }}
                    onBlur={(e) => {
                      e.target.style.background = "rgba(255,255,255,0.03)";
                      e.target.style.border =
                        "1px solid rgba(255,255,255,0.08)";
                      e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
                      e.target.style.color = event.title
                        ? "#fff"
                        : "rgba(255,255,255,0.6)";
                    }}
                  />

                  {/* Description textarea - More visual but subtle */}
                  <textarea
                    value={event.description || ""}
                    onChange={(e) =>
                      setEvent({ ...event, description: e.target.value })
                    }
                    placeholder="Tell people what to expect..."
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      fontSize: "16px",
                      lineHeight: "1.7",
                      marginBottom: "24px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      color: "#fff",
                      outline: "none",
                      resize: "vertical",
                      minHeight: "80px",
                      padding: "16px 18px",
                      fontFamily: "inherit",
                      fontWeight: 400,
                      transition: "all 0.2s ease",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}
                    onFocus={(e) => {
                      e.target.style.background = "rgba(255,255,255,0.06)";
                      e.target.style.border =
                        "1px solid rgba(139, 92, 246, 0.3)";
                      e.target.style.boxShadow =
                        "0 4px 12px rgba(139, 92, 246, 0.15)";
                    }}
                    onBlur={(e) => {
                      e.target.style.background = "rgba(255,255,255,0.04)";
                      e.target.style.border = "1px solid rgba(255,255,255,0.1)";
                      e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
                    }}
                  />

                  {/* Location and Date/Time - Integrated together */}
                  <div
                    style={{
                      marginTop: "28px",
                      marginBottom: "32px",
                    }}
                  >
                    {/* Location - Enhanced with autocomplete and current location */}
                    <div style={{ marginBottom: "20px", width: "100%" }}>
                      <div
                        style={{
                          position: "relative",
                          padding: "16px 18px",
                          background:
                            focusedField === "location"
                              ? "rgba(255,255,255,0.05)"
                              : "rgba(255,255,255,0.03)",
                          borderRadius: "12px",
                          border:
                            focusedField === "location"
                              ? "1px solid rgba(139, 92, 246, 0.4)"
                              : "1px solid rgba(255,255,255,0.08)",
                          transition: "all 0.2s ease",
                          width: "100%",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                        }}
                      >
                        <LocationAutocomplete
                          value={event.location || ""}
                          onChange={(e) =>
                            setEvent({ ...event, location: e.target.value })
                          }
                          onLocationSelect={(locationData) => {
                            setEvent({
                              ...event,
                              location: locationData.address,
                              locationLat: locationData.lat,
                              locationLng: locationData.lng,
                            });
                          }}
                          onFocus={() => setFocusedField("location")}
                          onBlur={() => setFocusedField(null)}
                          style={{
                            flex: 1,
                            background: "transparent",
                            border: "none",
                            color: "#fff",
                            fontSize: "15px",
                            outline: "none",
                            padding: "0",
                            width: "100%",
                          }}
                          placeholder="📍 Where's the event?"
                          disabled={saving}
                        />
                      </div>
                    </div>

                    {/* Start Date & Time - Simple button interface */}
                    <div style={{ marginBottom: "20px" }}>
                      <div
                        style={{
                          position: "relative",
                          width: "100%",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          startDateTimeInputRef.current?.focus();
                          startDateTimeInputRef.current?.showPicker?.();
                        }}
                      >
                        <input
                          ref={startDateTimeInputRef}
                          type="datetime-local"
                          value={
                            event.startsAt
                              ? isoToLocalDateTime(event.startsAt)
                              : event.startsAtLocal || ""
                          }
                          onChange={(e) => {
                            if (e.target.value) {
                              const isoValue = localDateTimeToIso(
                                e.target.value
                              );
                              setEvent({
                                ...event,
                                startsAtLocal: e.target.value,
                                startsAt: isoValue,
                              });
                            }
                          }}
                          onFocus={() => setFocusedField("startDateTime")}
                          onBlur={() => setFocusedField(null)}
                          style={{
                            ...(focusedField === "startDateTime"
                              ? {
                                  ...focusedInputStyle,
                                  border: "1px solid rgba(139, 92, 246, 0.4)",
                                  background: "rgba(255,255,255,0.05)",
                                }
                              : {
                                  ...inputStyle,
                                  background: "rgba(255,255,255,0.03)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                }),
                            fontSize: "16px",
                            padding: "16px 18px 16px 48px",
                            paddingRight:
                              event.startsAt || event.startsAtLocal
                                ? "120px"
                                : "18px",
                            width: "100%",
                            height: "52px",
                            fontWeight: 500,
                            borderRadius: "12px",
                            textAlign: "left",
                            color: "transparent",
                            cursor: "pointer",
                            boxSizing: "border-box",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                            appearance: "none",
                            WebkitAppearance: "none",
                            MozAppearance: "textfield",
                            position: "relative",
                            zIndex: 2,
                          }}
                          required
                        />
                        <div
                          style={{
                            position: "absolute",
                            left: "18px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            pointerEvents: "none",
                            fontSize: "16px",
                            opacity: 0.7,
                            zIndex: 3,
                          }}
                        >
                          🕒
                        </div>
                        <div
                          style={{
                            position: "absolute",
                            left: "48px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            pointerEvents: "none",
                            color:
                              event.startsAt || event.startsAtLocal
                                ? "#fff"
                                : "rgba(255,255,255,0.5)",
                            fontSize: "15px",
                            zIndex: 3,
                          }}
                        >
                          {event.startsAt || event.startsAtLocal
                            ? formatReadableDateTime(
                                new Date(event.startsAt || event.startsAtLocal)
                              )
                            : "Event start"}
                        </div>
                        {(event.startsAt || event.startsAtLocal) && (
                          <div
                            style={{
                              position: "absolute",
                              right: "18px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              pointerEvents: "none",
                              fontSize: "11px",
                              opacity: 0.6,
                              fontWeight: 600,
                              zIndex: 3,
                            }}
                          >
                            {formatRelativeTime(
                              new Date(event.startsAt || event.startsAtLocal)
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* End Date & Time - Simple button interface */}
                    <div style={{ marginBottom: "20px" }}>
                      <div
                        style={{
                          position: "relative",
                          width: "100%",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          endDateTimeInputRef.current?.focus();
                          endDateTimeInputRef.current?.showPicker?.();
                        }}
                      >
                        <input
                          ref={endDateTimeInputRef}
                          type="datetime-local"
                          value={
                            event.endsAt
                              ? isoToLocalDateTime(event.endsAt)
                              : event.endsAtLocal || ""
                          }
                          onChange={(e) => {
                            if (e.target.value) {
                              const isoValue = localDateTimeToIso(
                                e.target.value
                              );
                              setEvent({
                                ...event,
                                endsAtLocal: e.target.value,
                                endsAt: isoValue,
                              });
                            } else {
                              setEvent({
                                ...event,
                                endsAtLocal: "",
                                endsAt: null,
                              });
                            }
                          }}
                          onFocus={() => setFocusedField("endDateTime")}
                          onBlur={() => setFocusedField(null)}
                          min={
                            event.startsAt
                              ? isoToLocalDateTime(event.startsAt)
                              : event.startsAtLocal || undefined
                          }
                          style={{
                            ...(focusedField === "endDateTime"
                              ? {
                                  ...focusedInputStyle,
                                  border: "1px solid rgba(139, 92, 246, 0.4)",
                                  background: "rgba(255,255,255,0.05)",
                                }
                              : {
                                  ...inputStyle,
                                  background: "rgba(255,255,255,0.03)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                }),
                            fontSize: "16px",
                            padding: "16px 18px 16px 48px",
                            paddingRight:
                              event.endsAt || event.endsAtLocal
                                ? "120px"
                                : "18px",
                            width: "100%",
                            height: "52px",
                            fontWeight: 500,
                            borderRadius: "12px",
                            textAlign: "left",
                            color: "transparent",
                            cursor: "pointer",
                            boxSizing: "border-box",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                            appearance: "none",
                            WebkitAppearance: "none",
                            MozAppearance: "textfield",
                            position: "relative",
                            zIndex: 2,
                          }}
                          required
                        />
                        <div
                          style={{
                            position: "absolute",
                            left: "18px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            pointerEvents: "none",
                            fontSize: "16px",
                            opacity: 0.7,
                            zIndex: 3,
                          }}
                        >
                          🕒
                        </div>
                        <div
                          style={{
                            position: "absolute",
                            left: "48px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            pointerEvents: "none",
                            color:
                              event.endsAt || event.endsAtLocal
                                ? "#fff"
                                : "rgba(255,255,255,0.5)",
                            fontSize: "15px",
                            zIndex: 3,
                          }}
                        >
                          {event.endsAt || event.endsAtLocal
                            ? formatReadableDateTime(
                                new Date(event.endsAt || event.endsAtLocal)
                              )
                            : "Event end"}
                        </div>
                        {(event.endsAt || event.endsAtLocal) && (
                          <div
                            style={{
                              position: "absolute",
                              right: "18px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              pointerEvents: "none",
                              fontSize: "11px",
                              opacity: 0.6,
                              fontWeight: 600,
                              zIndex: 3,
                            }}
                          >
                            {formatRelativeTime(
                              new Date(event.endsAt || event.endsAtLocal)
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Timezone - Subtle, integrated at bottom */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginTop: "8px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const tzInfo = formatTimezone(
                            event.timezone ||
                              Intl.DateTimeFormat().resolvedOptions().timeZone
                          );
                          showToast(
                            `Timezone: ${tzInfo.tzName} ${tzInfo.city}`,
                            "info"
                          );
                        }}
                        style={{
                          padding: "8px 12px",
                          background: "rgba(139, 92, 246, 0.1)",
                          borderRadius: "8px",
                          border: "1px solid rgba(139, 92, 246, 0.2)",
                          fontSize: "10px",
                          textAlign: "center",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                        onTouchStart={(e) => {
                          e.target.style.background =
                            "rgba(139, 92, 246, 0.15)";
                        }}
                        onTouchEnd={(e) => {
                          e.target.style.background = "rgba(139, 92, 246, 0.1)";
                        }}
                      >
                        <span style={{ fontSize: "14px" }}>🌐</span>
                        <span style={{ fontWeight: 600, color: "#a78bfa" }}>
                          {
                            formatTimezone(
                              event.timezone ||
                                Intl.DateTimeFormat().resolvedOptions().timeZone
                            ).tzName
                          }
                        </span>
                        <span style={{ opacity: 0.7, fontSize: "9px" }}>
                          {
                            formatTimezone(
                              event.timezone ||
                                Intl.DateTimeFormat().resolvedOptions().timeZone
                            ).city
                          }
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Advanced Options Section */}
                  <div
                    style={{
                      marginTop: "32px",
                      paddingTop: "32px",
                      borderTop: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "0.15em",
                        opacity: 0.7,
                        fontWeight: 600,
                        marginBottom: "20px",
                      }}
                    >
                      EVENT SETTINGS
                    </div>

                    {/* event options - Better mobile hierarchy */}
                    <div style={{ marginBottom: "36px" }}>
                      <h3
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          marginBottom: "18px",
                          opacity: 0.9,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        Event Options
                      </h3>

                      {/* capacity */}
                      <OptionRow
                        icon="👥"
                        label="Cocktail capacity"
                        right={
                          <input
                            type="number"
                            min="1"
                            value={event.maxAttendeesInput || ""}
                            onChange={(e) =>
                              setEvent({
                                ...event,
                                maxAttendeesInput: e.target.value,
                              })
                            }
                            placeholder="Unlimited"
                            style={{
                              width: "95px",
                              padding: "5px 10px",
                              borderRadius: "8px",
                              border: "1px solid rgba(255,255,255,0.04)",
                              background: "rgba(12, 10, 18, 0.4)",
                              color: "#fff",
                              fontSize: "16px",
                              textAlign: "right",
                              outline: "none",
                            }}
                          />
                        }
                      />
                      {/* waitlist */}
                      <OptionRow
                        icon="🔄"
                        label="Enable waitlist when full"
                        right={
                          <Toggle
                            checked={event.waitlistEnabled !== false}
                            onChange={(checked) =>
                              setEvent({ ...event, waitlistEnabled: checked })
                            }
                          />
                        }
                      />
                      {/* approval */}
                      <OptionRow
                        icon="🏆"
                        label="Require Approval"
                        right={
                          <Toggle
                            checked={!!event.requireApproval}
                            onChange={(checked) =>
                              setEvent({ ...event, requireApproval: checked })
                            }
                          />
                        }
                      />

                      {/* PLUS-ONES */}
                      <OptionRow
                        icon="➕"
                        label="Plus-Ones"
                        description="Let guests bring friends on a single RSVP."
                        right={
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            {parseInt(
                              event.maxPlusOnesPerGuestInput || "0",
                              10
                            ) > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  background: "rgba(255,255,255,0.05)",
                                  borderRadius: "10px",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  padding: "4px",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    const current =
                                      parseInt(
                                        event.maxPlusOnesPerGuestInput || "0",
                                        10
                                      ) || 1;
                                    if (current > 1) {
                                      setEvent({
                                        ...event,
                                        maxPlusOnesPerGuestInput: String(
                                          current - 1
                                        ),
                                      });
                                    } else {
                                      setEvent({
                                        ...event,
                                        maxPlusOnesPerGuestInput: "0",
                                      });
                                    }
                                  }}
                                  disabled={
                                    parseInt(
                                      event.maxPlusOnesPerGuestInput || "0",
                                      10
                                    ) <= 1
                                  }
                                  style={{
                                    width: "40px",
                                    height: "40px",
                                    borderRadius: "8px",
                                    border: "none",
                                    background:
                                      parseInt(
                                        event.maxPlusOnesPerGuestInput || "0",
                                        10
                                      ) <= 1
                                        ? "rgba(255,255,255,0.05)"
                                        : "rgba(139, 92, 246, 0.2)",
                                    color: "#fff",
                                    fontSize: "20px",
                                    fontWeight: 600,
                                    cursor:
                                      parseInt(
                                        event.maxPlusOnesPerGuestInput || "0",
                                        10
                                      ) <= 1
                                        ? "not-allowed"
                                        : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "all 0.2s ease",
                                    opacity:
                                      parseInt(
                                        event.maxPlusOnesPerGuestInput || "0",
                                        10
                                      ) <= 1
                                        ? 0.4
                                        : 1,
                                  }}
                                  onTouchStart={(e) => {
                                    if (
                                      parseInt(
                                        event.maxPlusOnesPerGuestInput || "0",
                                        10
                                      ) > 1
                                    ) {
                                      e.target.style.background =
                                        "rgba(139, 92, 246, 0.3)";
                                      e.target.style.transform = "scale(0.95)";
                                    }
                                  }}
                                  onTouchEnd={(e) => {
                                    if (
                                      parseInt(
                                        event.maxPlusOnesPerGuestInput || "0",
                                        10
                                      ) > 1
                                    ) {
                                      e.target.style.background =
                                        "rgba(139, 92, 246, 0.2)";
                                      e.target.style.transform = "scale(1)";
                                    }
                                  }}
                                >
                                  −
                                </button>
                                <div
                                  style={{
                                    minWidth: "32px",
                                    textAlign: "center",
                                    fontSize: "18px",
                                    fontWeight: 600,
                                    color: "#fff",
                                    padding: "0 8px",
                                  }}
                                >
                                  {event.maxPlusOnesPerGuestInput || "0"}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const current =
                                      parseInt(
                                        event.maxPlusOnesPerGuestInput || "0",
                                        10
                                      ) || 1;
                                    if (current < 5) {
                                      setEvent({
                                        ...event,
                                        maxPlusOnesPerGuestInput: String(
                                          current + 1
                                        ),
                                      });
                                    }
                                  }}
                                  disabled={
                                    parseInt(
                                      event.maxPlusOnesPerGuestInput || "0",
                                      10
                                    ) >= 5
                                  }
                                  style={{
                                    width: "40px",
                                    height: "40px",
                                    borderRadius: "8px",
                                    border: "none",
                                    background:
                                      parseInt(
                                        event.maxPlusOnesPerGuestInput || "0",
                                        10
                                      ) >= 5
                                        ? "rgba(255,255,255,0.05)"
                                        : "rgba(139, 92, 246, 0.2)",
                                    color: "#fff",
                                    fontSize: "20px",
                                    fontWeight: 600,
                                    cursor:
                                      parseInt(
                                        event.maxPlusOnesPerGuestInput || "0",
                                        10
                                      ) >= 5
                                        ? "not-allowed"
                                        : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "all 0.2s ease",
                                    opacity:
                                      parseInt(
                                        event.maxPlusOnesPerGuestInput || "0",
                                        10
                                      ) >= 5
                                        ? 0.4
                                        : 1,
                                  }}
                                  onTouchStart={(e) => {
                                    if (
                                      parseInt(
                                        event.maxPlusOnesPerGuestInput || "0",
                                        10
                                      ) < 5
                                    ) {
                                      e.target.style.background =
                                        "rgba(139, 92, 246, 0.3)";
                                      e.target.style.transform = "scale(0.95)";
                                    }
                                  }}
                                  onTouchEnd={(e) => {
                                    if (
                                      parseInt(
                                        event.maxPlusOnesPerGuestInput || "0",
                                        10
                                      ) < 5
                                    ) {
                                      e.target.style.background =
                                        "rgba(139, 92, 246, 0.2)";
                                      e.target.style.transform = "scale(1)";
                                    }
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            )}
                            <Toggle
                              checked={
                                parseInt(
                                  event.maxPlusOnesPerGuestInput || "0",
                                  10
                                ) > 0
                              }
                              onChange={(checked) =>
                                setEvent({
                                  ...event,
                                  maxPlusOnesPerGuestInput: checked ? "3" : "0",
                                })
                              }
                            />
                          </div>
                        }
                      />

                      {/* DINNER */}
                      <OptionRow
                        icon="🍽️"
                        label="Food Serving Options"
                        description="Offer an optional food serving slot with limited seats."
                        right={
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <Toggle
                              checked={!!event.dinnerEnabled}
                              onChange={(checked) =>
                                setEvent({ ...event, dinnerEnabled: checked })
                              }
                            />
                          </div>
                        }
                      />

                      {event.dinnerEnabled && (
                        <div
                          style={{
                            marginTop: "16px",
                            padding: "24px",
                            borderRadius: "16px",
                            border: "1px solid rgba(139, 92, 246, 0.2)",
                            background:
                              "linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(236, 72, 153, 0.05) 100%)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "20px",
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
                                display: "flex",
                                flexDirection: "column",
                                gap: "16px",
                              }}
                            >
                              {/* First Slot Start */}
                              <div
                                style={{
                                  position: "relative",
                                  width: "100%",
                                  cursor: "pointer",
                                }}
                                onClick={() => {
                                  dinnerStartTimeInputRef.current?.focus();
                                  dinnerStartTimeInputRef.current?.showPicker?.();
                                }}
                              >
                                <input
                                  ref={dinnerStartTimeInputRef}
                                  type="datetime-local"
                                  value={
                                    event.dinnerStartTime
                                      ? isoToLocalDateTime(
                                          event.dinnerStartTime
                                        )
                                      : event.dinnerStartTimeLocal || ""
                                  }
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      const isoValue = localDateTimeToIso(
                                        e.target.value
                                      );
                                      setEvent({
                                        ...event,
                                        dinnerStartTimeLocal: e.target.value,
                                        dinnerStartTime: isoValue,
                                      });
                                    }
                                  }}
                                  required={event.dinnerEnabled}
                                  style={{
                                    ...inputStyle,
                                    fontSize: "16px",
                                    padding: "14px 16px 14px 48px",
                                    width: "100%",
                                    height: "48px",
                                    textAlign: "left",
                                    color: "transparent",
                                    cursor: "pointer",
                                    boxSizing: "border-box",
                                    background: "rgba(255,255,255,0.03)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: "12px",
                                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                                    appearance: "none",
                                    WebkitAppearance: "none",
                                    MozAppearance: "textfield",
                                    position: "relative",
                                    zIndex: 2,
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    left: "16px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    pointerEvents: "none",
                                    fontSize: "16px",
                                    opacity: 0.7,
                                    zIndex: 3,
                                  }}
                                >
                                  🕒
                                </div>
                                <div
                                  style={{
                                    position: "absolute",
                                    left: "48px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    pointerEvents: "none",
                                    color:
                                      event.dinnerStartTime ||
                                      event.dinnerStartTimeLocal
                                        ? "#fff"
                                        : "rgba(255,255,255,0.5)",
                                    fontSize: "14px",
                                    zIndex: 3,
                                  }}
                                >
                                  {event.dinnerStartTime ||
                                  event.dinnerStartTimeLocal
                                    ? formatReadableDateTime(
                                        new Date(
                                          event.dinnerStartTime ||
                                            event.dinnerStartTimeLocal
                                        )
                                      )
                                    : "First slot start *"}
                                </div>
                              </div>
                              {/* Last Slot Start */}
                              <div
                                style={{
                                  position: "relative",
                                  width: "100%",
                                  cursor: "pointer",
                                }}
                                onClick={() => {
                                  dinnerEndTimeInputRef.current?.focus();
                                  dinnerEndTimeInputRef.current?.showPicker?.();
                                }}
                              >
                                <input
                                  ref={dinnerEndTimeInputRef}
                                  type="datetime-local"
                                  value={
                                    event.dinnerEndTime
                                      ? isoToLocalDateTime(event.dinnerEndTime)
                                      : event.dinnerEndTimeLocal || ""
                                  }
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      const isoValue = localDateTimeToIso(
                                        e.target.value
                                      );
                                      setEvent({
                                        ...event,
                                        dinnerEndTimeLocal: e.target.value,
                                        dinnerEndTime: isoValue,
                                      });
                                    }
                                  }}
                                  required={event.dinnerEnabled}
                                  min={
                                    event.dinnerStartTime
                                      ? isoToLocalDateTime(
                                          event.dinnerStartTime
                                        )
                                      : event.dinnerStartTimeLocal || undefined
                                  }
                                  style={{
                                    ...inputStyle,
                                    fontSize: "16px",
                                    padding: "14px 16px 14px 48px",
                                    width: "100%",
                                    height: "48px",
                                    textAlign: "left",
                                    color: "transparent",
                                    cursor: "pointer",
                                    boxSizing: "border-box",
                                    background: "rgba(255,255,255,0.03)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: "12px",
                                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                                    appearance: "none",
                                    WebkitAppearance: "none",
                                    MozAppearance: "textfield",
                                    position: "relative",
                                    zIndex: 2,
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    left: "16px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    pointerEvents: "none",
                                    fontSize: "16px",
                                    opacity: 0.7,
                                    zIndex: 3,
                                  }}
                                >
                                  🕒
                                </div>
                                <div
                                  style={{
                                    position: "absolute",
                                    left: "48px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    pointerEvents: "none",
                                    color:
                                      event.dinnerEndTime ||
                                      event.dinnerEndTimeLocal
                                        ? "#fff"
                                        : "rgba(255,255,255,0.5)",
                                    fontSize: "14px",
                                    zIndex: 3,
                                  }}
                                >
                                  {event.dinnerEndTime ||
                                  event.dinnerEndTimeLocal
                                    ? formatReadableDateTime(
                                        new Date(
                                          event.dinnerEndTime ||
                                            event.dinnerEndTimeLocal
                                        )
                                      )
                                    : "Last slot start *"}
                                </div>
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
                                display: "flex",
                                flexDirection: "column",
                                gap: "20px",
                              }}
                            >
                              {/* Hours per slot - Counter */}
                              <div>
                                <label
                                  style={{
                                    display: "block",
                                    fontSize: "12px",
                                    opacity: 0.8,
                                    marginBottom: "12px",
                                    fontWeight: 500,
                                  }}
                                >
                                  Hours per slot
                                </label>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    background: "rgba(255,255,255,0.05)",
                                    borderRadius: "12px",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    padding: "6px",
                                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const current =
                                        parseFloat(
                                          event.dinnerSeatingIntervalHoursInput ||
                                            "2"
                                        ) || 2;
                                      if (current > 0.5) {
                                        setEvent({
                                          ...event,
                                          dinnerSeatingIntervalHoursInput:
                                            String(
                                              Math.max(0.5, current - 0.5)
                                            ),
                                        });
                                      }
                                    }}
                                    disabled={
                                      parseFloat(
                                        event.dinnerSeatingIntervalHoursInput ||
                                          "2"
                                      ) <= 0.5
                                    }
                                    style={{
                                      width: "44px",
                                      height: "44px",
                                      borderRadius: "10px",
                                      border: "none",
                                      background:
                                        parseFloat(
                                          event.dinnerSeatingIntervalHoursInput ||
                                            "2"
                                        ) <= 0.5
                                          ? "rgba(255,255,255,0.05)"
                                          : "rgba(139, 92, 246, 0.2)",
                                      color: "#fff",
                                      fontSize: "22px",
                                      fontWeight: 600,
                                      cursor:
                                        parseFloat(
                                          event.dinnerSeatingIntervalHoursInput ||
                                            "2"
                                        ) <= 0.5
                                          ? "not-allowed"
                                          : "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      transition: "all 0.2s ease",
                                      opacity:
                                        parseFloat(
                                          event.dinnerSeatingIntervalHoursInput ||
                                            "2"
                                        ) <= 0.5
                                          ? 0.4
                                          : 1,
                                    }}
                                    onTouchStart={(e) => {
                                      if (
                                        parseFloat(
                                          event.dinnerSeatingIntervalHoursInput ||
                                            "2"
                                        ) > 0.5
                                      ) {
                                        e.target.style.background =
                                          "rgba(139, 92, 246, 0.3)";
                                        e.target.style.transform =
                                          "scale(0.95)";
                                      }
                                    }}
                                    onTouchEnd={(e) => {
                                      if (
                                        parseFloat(
                                          event.dinnerSeatingIntervalHoursInput ||
                                            "2"
                                        ) > 0.5
                                      ) {
                                        e.target.style.background =
                                          "rgba(139, 92, 246, 0.2)";
                                        e.target.style.transform = "scale(1)";
                                      }
                                    }}
                                  >
                                    −
                                  </button>
                                  <div
                                    style={{
                                      flex: 1,
                                      textAlign: "center",
                                      fontSize: "18px",
                                      fontWeight: 600,
                                      color: "#fff",
                                      padding: "0 12px",
                                    }}
                                  >
                                    {event.dinnerSeatingIntervalHoursInput ||
                                      "2"}
                                    h
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const current =
                                        parseFloat(
                                          event.dinnerSeatingIntervalHoursInput ||
                                            "2"
                                        ) || 2;
                                      if (current < 12) {
                                        setEvent({
                                          ...event,
                                          dinnerSeatingIntervalHoursInput:
                                            String(Math.min(12, current + 0.5)),
                                        });
                                      }
                                    }}
                                    disabled={
                                      parseFloat(
                                        event.dinnerSeatingIntervalHoursInput ||
                                          "2"
                                      ) >= 12
                                    }
                                    style={{
                                      width: "44px",
                                      height: "44px",
                                      borderRadius: "10px",
                                      border: "none",
                                      background:
                                        parseFloat(
                                          event.dinnerSeatingIntervalHoursInput ||
                                            "2"
                                        ) >= 12
                                          ? "rgba(255,255,255,0.05)"
                                          : "rgba(139, 92, 246, 0.2)",
                                      color: "#fff",
                                      fontSize: "22px",
                                      fontWeight: 600,
                                      cursor:
                                        parseFloat(
                                          event.dinnerSeatingIntervalHoursInput ||
                                            "2"
                                        ) >= 12
                                          ? "not-allowed"
                                          : "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      transition: "all 0.2s ease",
                                      opacity:
                                        parseFloat(
                                          event.dinnerSeatingIntervalHoursInput ||
                                            "2"
                                        ) >= 12
                                          ? 0.4
                                          : 1,
                                    }}
                                    onTouchStart={(e) => {
                                      if (
                                        parseFloat(
                                          event.dinnerSeatingIntervalHoursInput ||
                                            "2"
                                        ) < 12
                                      ) {
                                        e.target.style.background =
                                          "rgba(139, 92, 246, 0.3)";
                                        e.target.style.transform =
                                          "scale(0.95)";
                                      }
                                    }}
                                    onTouchEnd={(e) => {
                                      if (
                                        parseFloat(
                                          event.dinnerSeatingIntervalHoursInput ||
                                            "2"
                                        ) < 12
                                      ) {
                                        e.target.style.background =
                                          "rgba(139, 92, 246, 0.2)";
                                        e.target.style.transform = "scale(1)";
                                      }
                                    }}
                                  >
                                    +
                                  </button>
                                </div>
                                {(event.dinnerStartTime ||
                                  event.dinnerStartTimeLocal) &&
                                  (event.dinnerEndTime ||
                                    event.dinnerEndTimeLocal) &&
                                  event.dinnerSeatingIntervalHoursInput && (
                                    <div
                                      style={{
                                        marginTop: "10px",
                                        padding: "12px 14px",
                                        background: "rgba(139, 92, 246, 0.08)",
                                        borderRadius: "8px",
                                        border:
                                          "1px solid rgba(139, 92, 246, 0.15)",
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
                                          event.dinnerStartTimeLocal ||
                                            (event.dinnerStartTime
                                              ? isoToLocalDateTime(
                                                  event.dinnerStartTime
                                                )
                                              : ""),
                                          event.dinnerEndTimeLocal ||
                                            (event.dinnerEndTime
                                              ? isoToLocalDateTime(
                                                  event.dinnerEndTime
                                                )
                                              : ""),
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
                                                  color:
                                                    "rgba(255, 255, 255, 0.95)",
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
                                {(!(
                                  event.dinnerStartTime ||
                                  event.dinnerStartTimeLocal
                                ) ||
                                  !(
                                    event.dinnerEndTime ||
                                    event.dinnerEndTimeLocal
                                  ) ||
                                  !event.dinnerSeatingIntervalHoursInput) && (
                                  <div
                                    style={{
                                      fontSize: "10px",
                                      opacity: 0.6,
                                      marginTop: "4px",
                                    }}
                                  >
                                    Set time window above to see calculated
                                    timeslots
                                  </div>
                                )}
                              </div>
                              {/* Max Seats Per Slot - Counter with Unlimited */}
                              <div>
                                <label
                                  style={{
                                    display: "block",
                                    fontSize: "12px",
                                    opacity: 0.8,
                                    marginBottom: "12px",
                                    fontWeight: 500,
                                  }}
                                >
                                  Max Seats Per Slot
                                </label>
                                {!event.dinnerMaxSeatsPerSlotInput ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEvent({
                                        ...event,
                                        dinnerMaxSeatsPerSlotInput: "10",
                                      })
                                    }
                                    style={{
                                      width: "100%",
                                      padding: "14px 16px",
                                      background: "rgba(255,255,255,0.05)",
                                      border: "1px solid rgba(255,255,255,0.1)",
                                      borderRadius: "12px",
                                      color: "rgba(255,255,255,0.6)",
                                      fontSize: "14px",
                                      fontWeight: 500,
                                      cursor: "pointer",
                                      textAlign: "left",
                                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                                      transition: "all 0.2s ease",
                                    }}
                                    onTouchStart={(e) => {
                                      e.target.style.background =
                                        "rgba(255,255,255,0.08)";
                                    }}
                                    onTouchEnd={(e) => {
                                      e.target.style.background =
                                        "rgba(255,255,255,0.05)";
                                    }}
                                  >
                                    Unlimited
                                  </button>
                                ) : (
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "12px",
                                      background: "rgba(255,255,255,0.05)",
                                      borderRadius: "12px",
                                      border: "1px solid rgba(255,255,255,0.1)",
                                      padding: "6px",
                                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const current =
                                          parseInt(
                                            event.dinnerMaxSeatsPerSlotInput,
                                            10
                                          ) || 1;
                                        if (current > 1) {
                                          setEvent({
                                            ...event,
                                            dinnerMaxSeatsPerSlotInput: String(
                                              current - 1
                                            ),
                                          });
                                        } else {
                                          setEvent({
                                            ...event,
                                            dinnerMaxSeatsPerSlotInput: "",
                                          });
                                        }
                                      }}
                                      style={{
                                        width: "44px",
                                        height: "44px",
                                        borderRadius: "10px",
                                        border: "none",
                                        background: "rgba(139, 92, 246, 0.2)",
                                        color: "#fff",
                                        fontSize: "22px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        transition: "all 0.2s ease",
                                      }}
                                      onTouchStart={(e) => {
                                        e.target.style.background =
                                          "rgba(139, 92, 246, 0.3)";
                                        e.target.style.transform =
                                          "scale(0.95)";
                                      }}
                                      onTouchEnd={(e) => {
                                        e.target.style.background =
                                          "rgba(139, 92, 246, 0.2)";
                                        e.target.style.transform = "scale(1)";
                                      }}
                                    >
                                      {parseInt(
                                        event.dinnerMaxSeatsPerSlotInput,
                                        10
                                      ) === 1
                                        ? "∞"
                                        : "−"}
                                    </button>
                                    <div
                                      style={{
                                        flex: 1,
                                        textAlign: "center",
                                        fontSize: "18px",
                                        fontWeight: 600,
                                        color: "#fff",
                                        padding: "0 12px",
                                      }}
                                    >
                                      {event.dinnerMaxSeatsPerSlotInput}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const current =
                                          parseInt(
                                            event.dinnerMaxSeatsPerSlotInput,
                                            10
                                          ) || 1;
                                        setEvent({
                                          ...event,
                                          dinnerMaxSeatsPerSlotInput: String(
                                            current + 1
                                          ),
                                        });
                                      }}
                                      style={{
                                        width: "44px",
                                        height: "44px",
                                        borderRadius: "10px",
                                        border: "none",
                                        background: "rgba(139, 92, 246, 0.2)",
                                        color: "#fff",
                                        fontSize: "22px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        transition: "all 0.2s ease",
                                      }}
                                      onTouchStart={(e) => {
                                        e.target.style.background =
                                          "rgba(139, 92, 246, 0.3)";
                                        e.target.style.transform =
                                          "scale(0.95)";
                                      }}
                                      onTouchEnd={(e) => {
                                        e.target.style.background =
                                          "rgba(139, 92, 246, 0.2)";
                                        e.target.style.transform = "scale(1)";
                                      }}
                                    >
                                      +
                                    </button>
                                  </div>
                                )}
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
                                    When dinner seats are full, guests will be
                                    added to the waitlist
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {(event.dinnerStartTime ||
                            event.dinnerStartTimeLocal) &&
                            (event.dinnerEndTime || event.dinnerEndTimeLocal) &&
                            event.dinnerSeatingIntervalHoursInput && (
                              <div
                                style={{
                                  fontSize: "11px",
                                  opacity: 0.7,
                                  padding: "12px",
                                  background: "rgba(139, 92, 246, 0.1)",
                                  borderRadius: "10px",
                                  border: "1px solid rgba(139, 92, 246, 0.2)",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <span>💡</span>
                                <span>
                                  Time slots will be generated automatically
                                  based on your settings.
                                </span>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Submit Button - Mobile-first, prominent */}
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      marginTop: "40px",
                      width: "100%",
                      padding: "18px 24px",
                      borderRadius: "14px",
                      border: "none",
                      background: saving
                        ? "#666"
                        : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: "17px",
                      cursor: saving ? "not-allowed" : "pointer",
                      boxShadow: saving
                        ? "none"
                        : "0 8px 24px rgba(139, 92, 246, 0.5)",
                      transition: "all 0.3s ease",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      opacity: saving ? 0.7 : 1,
                      minHeight: "56px",
                    }}
                    onMouseEnter={(e) => {
                      if (!saving) {
                        e.target.style.transform = "translateY(-2px)";
                        e.target.style.boxShadow =
                          "0 12px 32px rgba(139, 92, 246, 0.6)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!saving) {
                        e.target.style.transform = "translateY(0)";
                        e.target.style.boxShadow =
                          "0 8px 24px rgba(139, 92, 246, 0.5)";
                      }
                    }}
                    onTouchStart={(e) => {
                      if (!saving) {
                        e.target.style.transform = "scale(0.98)";
                      }
                    }}
                    onTouchEnd={(e) => {
                      if (!saving) {
                        e.target.style.transform = "scale(1)";
                      }
                    }}
                  >
                    {saving ? "Saving…" : "SAVE CHANGES"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper components - matching CreateEventPage
function OptionRow({ icon, label, description, right }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px",
        background: "rgba(20, 16, 30, 0.25)",
        borderRadius: "12px",
        marginBottom: "8px",
        border: "1px solid rgba(255,255,255,0.06)",
        transition: "all 0.2s ease",
        minHeight: "56px",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(20, 16, 30, 0.35)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(20, 16, 30, 0.25)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          flex: 1,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: "18px",
            flexShrink: 0,
            marginTop: "2px",
          }}
        >
          {icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "15px",
              fontWeight: 600,
              marginBottom: description ? "4px" : "0",
              lineHeight: "1.3",
            }}
          >
            {label}
          </div>
          {description && (
            <div
              style={{
                fontSize: "12px",
                opacity: 0.7,
                lineHeight: "1.4",
                marginTop: "2px",
              }}
            >
              {description}
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          flexShrink: 0,
          marginLeft: "12px",
        }}
      >
        {right}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
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
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ display: "none" }}
      />
      <span
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: checked
            ? "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)"
            : "rgba(255,255,255,0.1)",
          borderRadius: "10px",
          transition: "all 0.3s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: checked ? "22px" : "2px",
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
  );
}
