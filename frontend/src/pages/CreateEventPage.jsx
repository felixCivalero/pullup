import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import { LocationAutocomplete } from "../components/LocationAutocomplete";

const API_BASE = "http://localhost:3001";

function isNetworkError(error) {
  return (
    error instanceof TypeError ||
    error.message.includes("Failed to fetch") ||
    error.message.includes("NetworkError")
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.04)",
  background: "rgba(20, 16, 30, 0.2)",
  color: "#fff",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
};

const focusedInputStyle = {
  ...inputStyle,
  border: "1px solid rgba(139, 92, 246, 0.4)",
  background: "rgba(20, 16, 30, 0.5)",
  boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.1)",
};

// Get user's timezone
function getUserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
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

  const isToday =
    date.toDateString() === today.toDateString();
  const isTomorrow =
    date.toDateString() === tomorrow.toDateString();

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

export function CreateEventPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [focusedField, setFocusedField] = useState(null);
  const fileInputRef = useRef(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [timezone, setTimezone] = useState(getUserTimezone());
  const [maxAttendees, setMaxAttendees] = useState("");
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [imageUrl, setImageUrl] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [theme] = useState("minimal");
  const [calendar] = useState("personal");
  const [visibility] = useState("public");
  const [ticketType, setTicketType] = useState("free");
  const [requireApproval, setRequireApproval] = useState(false);

  // NEW: plus-ones
  const [allowPlusOnes, setAllowPlusOnes] = useState(false);
  const [maxPlusOnesPerGuest, setMaxPlusOnesPerGuest] = useState("3");

  // NEW: dinner
  const [dinnerEnabled, setDinnerEnabled] = useState(false);
  const [dinnerStartTime, setDinnerStartTime] = useState("");
  const [dinnerEndTime, setDinnerEndTime] = useState("");
  const [dinnerSeatingIntervalHours, setDinnerSeatingIntervalHours] =
    useState("2");
  const [dinnerMaxSeatsPerSlot, setDinnerMaxSeatsPerSlot] = useState("");
  const [dinnerOverflowAction, setDinnerOverflowAction] = useState("waitlist");

  const [loading, setLoading] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isMounted, setIsMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    function handleMouseMove(e) {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

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

  function handleImageUpload(e) {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    if (!file) return;

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
      showToast("Failed to read image file", "error");
    };
    reader.onloadend = () => {
      if (reader.result) {
        setImagePreview(reader.result);
        setImageUrl(reader.result);
        showToast("Image uploaded successfully! ✨", "success");
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setLoading(true);

    try {
      // derive maxPlusOnesPerGuest
      const parsedMaxPlus =
        allowPlusOnes && maxPlusOnesPerGuest
          ? Math.max(1, Math.min(3, parseInt(maxPlusOnesPerGuest, 10) || 1))
          : 0;

      const requestBody = {
        title,
        description,
        location,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        timezone,
        maxAttendees: maxAttendees ? Number(maxAttendees) : null,
        waitlistEnabled,
        theme,
        calendar,
        visibility,
        ticketType,
        requireApproval,

        // NEW
        maxPlusOnesPerGuest: parsedMaxPlus,
        dinnerEnabled,
        dinnerStartTime:
          dinnerEnabled && dinnerStartTime
            ? new Date(dinnerStartTime).toISOString()
            : null,
        dinnerEndTime:
          dinnerEnabled && dinnerEndTime
            ? new Date(dinnerEndTime).toISOString()
            : null,
        dinnerSeatingIntervalHours: dinnerEnabled
          ? Number(dinnerSeatingIntervalHours) || 2
          : 2,
        dinnerMaxSeatsPerSlot:
          dinnerEnabled && dinnerMaxSeatsPerSlot
            ? Number(dinnerMaxSeatsPerSlot)
            : null,
        dinnerOverflowAction: dinnerEnabled ? dinnerOverflowAction : "waitlist",
      };

      if (imageUrl) {
        requestBody.imageUrl = imageUrl;
      }

      const res = await fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create event");
      }

      const created = await res.json();
      showToast("Event created successfully! 🎉", "success");
      navigate(`/e/${created.slug}`);
    } catch (err) {
      console.error(err);
      if (isNetworkError(err)) {
        showToast(
          "Network error. Please check your connection and try again.",
          "error"
        );
      } else {
        showToast(
          err.message || "Failed to create event. Please try again.",
          "error"
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const tzInfo = formatTimezone(timezone);

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        position: "relative",
        background:
          "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.12) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.12) 0%, transparent 50%), #05040a",
        paddingBottom: "40px",
        overflow: "hidden",
      }}
    >
      {/* animated background */}
      <div
        style={{
          position: "fixed",
          width: "100%",
          height: "100%",
          top: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 0,
          opacity: isMounted ? 1 : 0,
          transition: "opacity 1s ease-out",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "800px",
            height: "800px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)",
            top: "-400px",
            left: "-400px",
            animation: "float 20s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(236, 72, 153, 0.15) 0%, transparent 70%)",
            bottom: "-300px",
            right: "-300px",
            animation: "float 25s ease-in-out infinite reverse",
          }}
        />
      </div>

      {/* cursor glow */}
      <div
        style={{
          position: "fixed",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)",
          left: mousePosition.x - 300,
          top: mousePosition.y - 300,
          pointerEvents: "none",
          transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: 1,
        }}
      />

      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(1.1); }
        }
      `}</style>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: "900px",
          margin: "0 auto",
          padding: "16px",
          boxSizing: "border-box",
          opacity: isMounted ? 1 : 0,
          transform: isMounted ? "translateY(0)" : "translateY(20px)",
          transition: "all 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <form onSubmit={handleCreate}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(280px, 1fr) minmax(500px, 2fr)",
              gap: "40px",
              alignItems: "start",
            }}
            className="create-event-grid"
          >
            {/* LEFT: image */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                position: "sticky",
                top: "80px",
              }}
            >
              <div
                style={{
                  aspectRatio: "1",
                  borderRadius: "16px",
                  overflow: "hidden",
                  background: isDragging
                    ? "rgba(139, 92, 246, 0.2)"
                    : imagePreview
                      ? "transparent"
                      : "rgba(20, 16, 30, 0.3)",
                  border: isDragging
                    ? "2px dashed rgba(139, 92, 246, 0.5)"
                    : imagePreview
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
                {imagePreview ? (
                  <>
                    <img
                      src={imagePreview}
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
                {imagePreview && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImagePreview(null);
                      setImageUrl(null);
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

            {/* RIGHT: form */}
            <div
              style={{
                background: "rgba(12, 10, 18, 0.25)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: "20px",
                padding: "48px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              }}
            >
              {/* title */}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event Name"
                required
                style={{
                  width: "100%",
                  fontSize: "clamp(36px, 7vw, 52px)",
                  fontWeight: 400,
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.98)",
                  outline: "none",
                  marginBottom: "48px",
                  padding: 0,
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                }}
              />

              {/* date/time */}
              <div
                style={{
                  marginBottom: "32px",
                  background: "rgba(20, 16, 30, 0.3)",
                  borderRadius: "20px",
                  padding: "28px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(10px)",
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

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "24px",
                    alignItems: "start",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    {/* start */}
                    <div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          marginBottom: "12px",
                          fontSize: "13px",
                          fontWeight: 600,
                          opacity: 0.9,
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
                      </label>
                      
                      {/* Quick shortcuts */}
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          marginBottom: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        {getQuickDateOptions().map((option) => (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => {
                              const date = option.getDate();
                              setStartsAt(date.toISOString());
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
                      </div>

                      <div style={{ position: "relative" }}>
                        <input
                          type="datetime-local"
                          value={
                            startsAt
                              ? new Date(startsAt).toISOString().slice(0, 16)
                              : ""
                          }
                          onChange={(e) => {
                            if (e.target.value) {
                              setStartsAt(new Date(e.target.value).toISOString());
                            }
                          }}
                          style={{
                            ...(focusedField === "startDateTime"
                              ? focusedInputStyle
                              : inputStyle),
                            fontSize: "15px",
                            padding: "14px 16px 14px 48px",
                            width: "100%",
                            cursor: "pointer",
                            position: "relative",
                          }}
                          onFocus={() => setFocusedField("startDateTime")}
                          onBlur={() => setFocusedField(null)}
                          required
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
                        {startsAt && (
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
                            {formatRelativeTime(new Date(startsAt))}
                          </div>
                        )}
                      </div>
                      {startsAt && (
                        <div
                          style={{
                            fontSize: "12px",
                            opacity: 0.7,
                            marginTop: "8px",
                            paddingLeft: "4px",
                            fontStyle: "italic",
                          }}
                        >
                          {formatReadableDateTime(new Date(startsAt))}
                        </div>
                      )}
                    </div>

                    {/* end */}
                    <div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          marginBottom: "12px",
                          fontSize: "13px",
                          fontWeight: 600,
                          opacity: 0.9,
                        }}
                      >
                        <div
                          style={{
                            width: "12px",
                            height: "12px",
                            borderRadius: "50%",
                            border: "2px solid rgba(255,255,255,0.3)",
                            background: "transparent",
                          }}
                        />
                        <span>End Date & Time</span>
                        <span style={{ opacity: 0.5, fontWeight: 400 }}>
                          (optional)
                        </span>
                      </label>

                      <div style={{ position: "relative" }}>
                        <input
                          type="datetime-local"
                          value={
                            endsAt
                              ? new Date(endsAt).toISOString().slice(0, 16)
                              : ""
                          }
                          onChange={(e) => {
                            if (e.target.value) {
                              setEndsAt(new Date(e.target.value).toISOString());
                            } else {
                              setEndsAt("");
                            }
                          }}
                          min={
                            startsAt
                              ? new Date(startsAt).toISOString().slice(0, 16)
                              : undefined
                          }
                          style={{
                            ...(focusedField === "endDateTime"
                              ? focusedInputStyle
                              : inputStyle),
                            fontSize: "15px",
                            padding: "14px 16px 14px 48px",
                            width: "100%",
                            cursor: "pointer",
                          }}
                          onFocus={() => setFocusedField("endDateTime")}
                          onBlur={() => setFocusedField(null)}
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
                        {endsAt && (
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
                            {formatRelativeTime(new Date(endsAt))}
                          </div>
                        )}
                      </div>
                      {endsAt && (
                        <div
                          style={{
                            fontSize: "12px",
                            opacity: 0.7,
                            marginTop: "8px",
                            paddingLeft: "4px",
                            fontStyle: "italic",
                          }}
                        >
                          {formatReadableDateTime(new Date(endsAt))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* timezone pill */}
                  <div
                    style={{
                      padding: "18px 20px",
                      background: "rgba(139, 92, 246, 0.12)",
                      borderRadius: "16px",
                      border: "1px solid rgba(139, 92, 246, 0.25)",
                      fontSize: "12px",
                      textAlign: "center",
                      minWidth: "150px",
                      alignSelf: "center",
                      boxShadow: "0 4px 16px rgba(139, 92, 246, 0.1)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "24px",
                        marginBottom: "10px",
                        opacity: 0.9,
                      }}
                    >
                      🌐
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        marginBottom: "6px",
                        fontSize: "15px",
                        color: "#8b5cf6",
                      }}
                    >
                      {tzInfo.tzName}
                    </div>
                    <div
                      style={{
                        opacity: 0.7,
                        fontSize: "12px",
                        textTransform: "capitalize",
                      }}
                    >
                      {tzInfo.city}
                    </div>
                  </div>
                </div>
              </div>

              {/* location */}
              <div style={{ marginBottom: "28px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "9px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    opacity: 0.4,
                    marginBottom: "10px",
                  }}
                >
                  <span>📍</span>
                  <span>Add Event Location</span>
                </div>
                <LocationAutocomplete
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  style={{
                    ...(focusedField === "location"
                      ? focusedInputStyle
                      : inputStyle),
                    padding: "10px 12px",
                  }}
                  onFocus={() => setFocusedField("location")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Offline location or virtual link"
                  disabled={loading}
                />
              </div>

              {/* description */}
              <div style={{ marginBottom: "36px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "9px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    opacity: 0.4,
                    marginBottom: "10px",
                  }}
                >
                  <span>📄</span>
                  <span>Add Description</span>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onFocus={() => setFocusedField("description")}
                  onBlur={() => setFocusedField(null)}
                  style={{
                    ...(focusedField === "description"
                      ? focusedInputStyle
                      : inputStyle),
                    minHeight: "100px",
                    resize: "vertical",
                    fontFamily: "inherit",
                    padding: "10px 12px",
                  }}
                  placeholder="Tell people what to expect..."
                />
              </div>

              {/* event options */}
              <div style={{ marginBottom: "36px" }}>
                <h3
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    marginBottom: "14px",
                    opacity: 0.8,
                  }}
                >
                  Event Options
                </h3>

                {/* tickets */}
                <OptionRow
                  icon="🎫"
                  label="Tickets"
                  right={
                    <select
                      value={ticketType}
                      onChange={(e) => setTicketType(e.target.value)}
                      style={{
                        padding: "5px 20px 5px 10px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.04)",
                        background: "rgba(12, 10, 18, 0.4)",
                        color: "#fff",
                        fontSize: "14px",
                        cursor: "pointer",
                        appearance: "none",
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23ffffff' stroke-width='1.5' stroke-linecap='round' stroke-opacity='0.5'/%3E%3C/svg%3E\")",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 8px center",
                        paddingRight: "28px",
                      }}
                    >
                      <option value="free">Free</option>
                      <option value="paid">Paid</option>
                    </select>
                  }
                />

                {/* approval */}
                <OptionRow
                  icon="🤝"
                  label="Require Approval"
                  right={
                    <Toggle
                      checked={requireApproval}
                      onChange={setRequireApproval}
                    />
                  }
                />

                {/* capacity */}
                <OptionRow
                  icon="👥"
                  label="Capacity"
                  right={
                    <input
                      type="number"
                      min="1"
                      value={maxAttendees}
                      onChange={(e) => setMaxAttendees(e.target.value)}
                      placeholder="Unlimited"
                      style={{
                        width: "95px",
                        padding: "5px 10px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.04)",
                        background: "rgba(12, 10, 18, 0.4)",
                        color: "#fff",
                        fontSize: "14px",
                        textAlign: "right",
                        outline: "none",
                      }}
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
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <Toggle
                        checked={allowPlusOnes}
                        onChange={setAllowPlusOnes}
                      />
                      {allowPlusOnes && (
                        <input
                          type="number"
                          min="1"
                          max="3"
                          value={maxPlusOnesPerGuest}
                          onChange={(e) =>
                            setMaxPlusOnesPerGuest(e.target.value)
                          }
                          style={{
                            width: "50px",
                            padding: "5px 8px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(12, 10, 18, 0.7)",
                            color: "#fff",
                            fontSize: "13px",
                            textAlign: "center",
                            outline: "none",
                          }}
                        />
                      )}
                    </div>
                  }
                />

                {/* DINNER */}
                <OptionRow
                  icon="🍽️"
                  label="Dinner Option"
                  description="Offer an optional dinner slot with limited seats."
                  right={
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <Toggle
                        checked={dinnerEnabled}
                        onChange={setDinnerEnabled}
                      />
                    </div>
                  }
                />

                {dinnerEnabled && (
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
                        Dinner Configuration
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
                        Dinner Time Window
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
                            Start Time <span style={{ color: "#ef4444" }}>*</span>
                          </label>
                          <input
                            type="datetime-local"
                            value={dinnerStartTime}
                            onChange={(e) =>
                              setDinnerStartTime(e.target.value)
                            }
                            required={dinnerEnabled}
                            style={{
                              ...inputStyle,
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
                            End Time <span style={{ color: "#ef4444" }}>*</span>
                          </label>
                          <input
                            type="datetime-local"
                            value={dinnerEndTime}
                            onChange={(e) => setDinnerEndTime(e.target.value)}
                            required={dinnerEnabled}
                            min={dinnerStartTime || undefined}
                            style={{
                              ...inputStyle,
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
                            Hours Between Seatings
                          </label>
                          <input
                            type="number"
                            min="0.5"
                            max="12"
                            step="0.5"
                            value={dinnerSeatingIntervalHours}
                            onChange={(e) =>
                              setDinnerSeatingIntervalHours(e.target.value)
                            }
                            placeholder="2"
                            style={{
                              ...inputStyle,
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
                            e.g., 2 = seatings at 6pm, 8pm, 10pm
                          </div>
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
                            value={dinnerMaxSeatsPerSlot}
                            onChange={(e) =>
                              setDinnerMaxSeatsPerSlot(e.target.value)
                            }
                            placeholder="Unlimited"
                            style={{
                              ...inputStyle,
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
                    {dinnerMaxSeatsPerSlot && (
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
                          When Dinner Seats Are Full
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}
                        >
                          {[
                            {
                              value: "waitlist",
                              label: "Add to Waitlist",
                              description:
                                "Keep them on the waitlist for dinner seats",
                              icon: "📋",
                            },
                            {
                              value: "cocktails",
                              label: "Invite for Cocktails",
                              description:
                                "Invite them to join for cocktails after dinner",
                              icon: "🥂",
                            },
                            {
                              value: "both",
                              label: "Both Options",
                              description:
                                "Add to waitlist AND invite for cocktails",
                              icon: "✨",
                            },
                          ].map((option) => (
                            <label
                              key={option.value}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "12px",
                                padding: "14px",
                                borderRadius: "12px",
                                border:
                                  dinnerOverflowAction === option.value
                                    ? "2px solid #8b5cf6"
                                    : "1px solid rgba(255,255,255,0.1)",
                                background:
                                  dinnerOverflowAction === option.value
                                    ? "rgba(139, 92, 246, 0.15)"
                                    : "rgba(20, 16, 30, 0.4)",
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                              }}
                              onMouseEnter={(e) => {
                                if (
                                  dinnerOverflowAction !== option.value
                                ) {
                                  e.currentTarget.style.background =
                                    "rgba(20, 16, 30, 0.6)";
                                  e.currentTarget.style.borderColor =
                                    "rgba(255,255,255,0.2)";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (
                                  dinnerOverflowAction !== option.value
                                ) {
                                  e.currentTarget.style.background =
                                    "rgba(20, 16, 30, 0.4)";
                                  e.currentTarget.style.borderColor =
                                    "rgba(255,255,255,0.1)";
                                }
                              }}
                            >
                              <input
                                type="radio"
                                name="dinnerOverflow"
                                value={option.value}
                                checked={dinnerOverflowAction === option.value}
                                onChange={(e) =>
                                  setDinnerOverflowAction(e.target.value)
                                }
                                style={{
                                  marginTop: "2px",
                                  width: "18px",
                                  height: "18px",
                                  cursor: "pointer",
                                  accentColor: "#8b5cf6",
                                }}
                              />
                              <div style={{ flex: 1 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    marginBottom: "4px",
                                  }}
                                >
                                  <span style={{ fontSize: "16px" }}>
                                    {option.icon}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "14px",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {option.label}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    opacity: 0.7,
                                    paddingLeft: "24px",
                                  }}
                                >
                                  {option.description}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {dinnerStartTime &&
                      dinnerEndTime &&
                      dinnerSeatingIntervalHours && (
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
                            Time slots will be generated automatically based on
                            your settings.
                          </span>
                        </div>
                      )}
                  </div>
                )}
              </div>

              {/* waitlist */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "36px",
                  padding: "10px 14px",
                  background: "rgba(20, 16, 30, 0.15)",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.03)",
                }}
              >
                <input
                  type="checkbox"
                  checked={waitlistEnabled}
                  onChange={(e) => setWaitlistEnabled(e.target.checked)}
                  style={{
                    width: "18px",
                    height: "18px",
                    cursor: "pointer",
                    accentColor: "#8b5cf6",
                  }}
                />
                <span style={{ fontSize: "14px", opacity: 0.85 }}>
                  Enable waitlist when full
                </span>
              </div>

              {/* submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "16px 24px",
                  borderRadius: "10px",
                  border: "none",
                  background: loading
                    ? "#666"
                    : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  boxShadow: loading
                    ? "none"
                    : "0 8px 24px rgba(139, 92, 246, 0.4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                {loading ? "Creating…" : "Create Event"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// small helper components
function OptionRow({ icon, label, description, right }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        background: "rgba(20, 16, 30, 0.15)",
        borderRadius: "10px",
        marginBottom: "6px",
        border: "1px solid rgba(255,255,255,0.03)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
        }}
      >
        <span style={{ fontSize: "15px" }}>{icon}</span>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 500 }}>{label}</div>
          {description && (
            <div style={{ fontSize: "11px", opacity: 0.6 }}>{description}</div>
          )}
        </div>
      </div>
      <div>{right}</div>
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
