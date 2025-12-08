// frontend/src/pages/ManageEventPage.jsx
import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
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
  const [imagePreview, setImagePreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [guestsCount, setGuestsCount] = useState(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    function handleMouseMove(e) {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    async function load() {
      setNetworkError(false);
      try {
        const res = await fetch(`${API_BASE}/host/events/${id}`);
        if (!res.ok) throw new Error("Failed to load event");
        const data = await res.json();

        setEvent({
          ...data,
          startsAtLocal: data.startsAt
            ? new Date(data.startsAt).toISOString().slice(0, 16)
            : "",
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
          dinnerOverflowAction:
            data.dinnerOverflowAction || "waitlist",
          waitlistEnabled:
            typeof data.waitlistEnabled === "boolean"
              ? data.waitlistEnabled
              : true,
        });
        if (data.imageUrl) {
          setImagePreview(data.imageUrl);
        }

        // Fetch guests count
        try {
          const guestsRes = await fetch(`${API_BASE}/host/events/${id}/guests`);
          if (guestsRes.ok) {
            const guestsData = await guestsRes.json();
            setGuestsCount(guestsData.guests?.length || 0);
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
        setEvent({ ...event, imageUrl: reader.result });
        showToast("Image uploaded successfully! ✨", "success");
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

      const body = {
        title: event.title,
        description: event.description,
        location: event.location,
        startsAt: event.startsAtLocal
          ? new Date(event.startsAtLocal).toISOString()
          : null,
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
        imageUrl: event.imageUrl || null,
      };

      const res = await fetch(`${API_BASE}/host/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save event");
      }
      const updated = await res.json();
      setEvent({
        ...updated,
        startsAtLocal: updated.startsAt
          ? new Date(updated.startsAt).toISOString().slice(0, 16)
          : "",
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
        dinnerOverflowAction:
          updated.dinnerOverflowAction || "waitlist",
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
        <div className="responsive-container">
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
        <div className="responsive-container">
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
        <div className="responsive-container">
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
        className="responsive-container"
        style={{ position: "relative", zIndex: 2 }}
      >
        <div
          className="responsive-card"
          style={{
            maxWidth: "800px",
            margin: "0 auto",
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
                  : imagePreview || event.imageUrl
                    ? "transparent"
                    : "rgba(20, 16, 30, 0.3)",
                border: isDragging
                  ? "2px dashed rgba(139, 92, 246, 0.5)"
                  : imagePreview || event.imageUrl
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
              {imagePreview || event.imageUrl ? (
                <>
                  <img
                    src={imagePreview || event.imageUrl}
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
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: "none" }}
              />
              {(imagePreview || event.imageUrl) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImagePreview(null);
                    setEvent({ ...event, imageUrl: null });
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

          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom: "32px",
              fontSize: "14px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              paddingBottom: "16px",
            }}
          >
            <span
              style={{
                fontWeight: 600,
                color: "#fff",
                padding: "8px 16px",
                background: "rgba(139, 92, 246, 0.1)",
                borderRadius: "8px",
                border: "1px solid rgba(139, 92, 246, 0.2)",
              }}
            >
              Overview
            </span>
            <button
              onClick={() => navigate(`/app/events/${id}/guests`)}
              style={{
                background: "transparent",
                border: "none",
                color: "#bbb",
                cursor: "pointer",
                transition: "all 0.3s ease",
                padding: "8px 16px",
                borderRadius: "8px",
              }}
              onMouseEnter={(e) => {
                e.target.style.color = "#fff";
                e.target.style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                e.target.style.color = "#bbb";
                e.target.style.background = "transparent";
              }}
            >
              👥 Guests ({guestsCount})
            </button>
          </div>

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
                onChange={(e) => setEvent({ ...event, title: e.target.value })}
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
                background: "rgba(20, 16, 30, 0.2)",
                borderRadius: "16px",
                padding: "20px",
                border: "1px solid rgba(255,255,255,0.05)",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "16px",
                }}
              >
                <span style={{ fontSize: "18px" }}>🕒</span>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    opacity: 0.7,
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
                  marginBottom: "10px",
                  opacity: 0.9,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      background:
                        "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                      border: "2px solid rgba(255,255,255,0.1)",
                    }}
                  />
                  <span>Start Date & Time</span>
                  <span style={{ opacity: 0.5, fontWeight: 400 }}>*</span>
                </div>
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
                    padding: "12px 16px",
                    cursor: "pointer",
                  }}
                />
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
                  max="3"
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
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        opacity: 0.8,
                        marginBottom: "8px",
                      }}
                    >
                      Start Time
                      <input
                        type="datetime-local"
                        value={event.dinnerStartTimeLocal || ""}
                        onChange={(e) =>
                          setEvent({
                            ...event,
                            dinnerStartTimeLocal: e.target.value,
                          })
                        }
                        onFocus={() => setFocusedField("dinnerStartTime")}
                        onBlur={() => setFocusedField(null)}
                        style={{
                          ...(focusedField === "dinnerStartTime"
                            ? focusedInputStyle
                            : inputStyle),
                          fontSize: "14px",
                          padding: "12px 14px",
                          marginTop: "8px",
                          cursor: "pointer",
                        }}
                      />
                    </label>

                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        opacity: 0.8,
                        marginBottom: "8px",
                      }}
                    >
                      End Time
                      <input
                        type="datetime-local"
                        value={event.dinnerEndTimeLocal || ""}
                        onChange={(e) =>
                          setEvent({
                            ...event,
                            dinnerEndTimeLocal: e.target.value,
                          })
                        }
                        onFocus={() => setFocusedField("dinnerEndTime")}
                        onBlur={() => setFocusedField(null)}
                        style={{
                          ...(focusedField === "dinnerEndTime"
                            ? focusedInputStyle
                            : inputStyle),
                          fontSize: "14px",
                          padding: "12px 14px",
                          marginTop: "8px",
                          cursor: "pointer",
                        }}
                      />
                    </label>
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
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        opacity: 0.8,
                        marginBottom: "8px",
                      }}
                    >
                      Hours Between Seatings
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
                        onFocus={() => setFocusedField("dinnerInterval")}
                        onBlur={() => setFocusedField(null)}
                        style={{
                          ...(focusedField === "dinnerInterval"
                            ? focusedInputStyle
                            : inputStyle),
                          fontSize: "14px",
                          padding: "12px 14px",
                          marginTop: "8px",
                        }}
                      />
                    </label>

                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        opacity: 0.8,
                        marginBottom: "8px",
                      }}
                    >
                      Max Seats Per Slot
                      <input
                        type="number"
                        min="1"
                        value={event.dinnerMaxSeatsPerSlotInput || ""}
                        placeholder="Unlimited"
                        onChange={(e) =>
                          setEvent({
                            ...event,
                            dinnerMaxSeatsPerSlotInput: e.target.value,
                          })
                        }
                        onFocus={() => setFocusedField("dinnerSeats")}
                        onBlur={() => setFocusedField(null)}
                        style={{
                          ...(focusedField === "dinnerSeats"
                            ? focusedInputStyle
                            : inputStyle),
                          fontSize: "14px",
                          padding: "12px 14px",
                          marginTop: "8px",
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Overflow Handling */}
                {event.dinnerMaxSeatsPerSlotInput && (
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
                              event.dinnerOverflowAction === option.value
                                ? "2px solid #8b5cf6"
                                : "1px solid rgba(255,255,255,0.1)",
                            background:
                              event.dinnerOverflowAction === option.value
                                ? "rgba(139, 92, 246, 0.15)"
                                : "rgba(20, 16, 30, 0.4)",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (
                              event.dinnerOverflowAction !== option.value
                            ) {
                              e.currentTarget.style.background =
                                "rgba(20, 16, 30, 0.6)";
                              e.currentTarget.style.borderColor =
                                "rgba(255,255,255,0.2)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (
                              event.dinnerOverflowAction !== option.value
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
                            checked={
                              event.dinnerOverflowAction === option.value
                            }
                            onChange={(e) =>
                              setEvent({
                                ...event,
                                dinnerOverflowAction: e.target.value,
                              })
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
        </div>
      </div>
    </div>
  );
}
