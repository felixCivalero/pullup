import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import { authenticatedFetch } from "../lib/api.js";
import { getEventShareUrl, generateCalendarUrls } from "../lib/urlUtils";
import { uploadEventImage, validateImageFile } from "../lib/imageUtils.js";
import { handleNetworkError } from "../lib/errorHandler.js";
import { formatEventDate } from "../lib/dateUtils.js";

// Get user's timezone
function getUserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function PostEventPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [postedEvent, setPostedEvent] = useState(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);
  const calendarDropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        calendarDropdownRef.current &&
        !calendarDropdownRef.current.contains(event.target)
      ) {
        setShowCalendarDropdown(false);
      }
    }

    if (showCalendarDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showCalendarDropdown]);

  // Handle image selection
  function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file using utility
    const validation = validateImageFile(file);
    if (!validation.valid) {
      showToast(validation.error, "error");
      return;
    }

    setImageFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  // Post event
  async function handlePost() {
    if (!title.trim()) {
      showToast("Event name is required", "error");
      return;
    }

    if (!startsAt) {
      showToast("Date and time is required", "error");
      return;
    }

    setLoading(true);

    try {
      // Calculate end time (2 hours after start)
      // datetime-local input gives us a string like "2025-12-15T19:50" (local time, no timezone)
      // JavaScript's Date constructor interprets this as local time, which is correct
      const startDate = new Date(startsAt);

      // Verify the date is valid
      if (isNaN(startDate.getTime())) {
        throw new Error("Invalid date/time");
      }

      // Convert start to ISO string (this converts local time to UTC)
      const startsAtISO = startDate.toISOString();

      // Add exactly 2 hours (2 * 60 * 60 * 1000 milliseconds = 7,200,000 ms)
      const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
      const endsAt = endDate.toISOString();

      // Verify the calculation
      const durationMs = endDate.getTime() - startDate.getTime();
      const durationHours = durationMs / (60 * 60 * 1000);

      if (Math.abs(durationHours - 2) > 0.01) {
        console.error("Duration calculation error:", {
          durationHours,
          expected: 2,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });
        throw new Error("Failed to calculate end time");
      }

      // Create event first (image will be uploaded after)
      const eventRes = await authenticatedFetch("/events", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          startsAt: startsAtISO, // Use ISO format (UTC)
          endsAt, // Automatically set to 2 hours after start (ISO format, UTC)
          location: location.trim() || null,
          timezone: getUserTimezone(),
          imageUrl: null, // Will be set after upload
          // Fast flow defaults (hidden from user)
          waitlistEnabled: true,
          requireApproval: false,
          maxAttendees: null, // Unlimited
          dinnerEnabled: false,
          ticketType: "free",
          // Dual personality tracking
          createdVia: "post",
          status: "PUBLISHED",
        }),
      });

      if (!eventRes.ok) {
        const error = await eventRes.json();
        throw new Error(error.error || "Failed to post event");
      }

      const event = await eventRes.json();

      // Verify the event has correct times
      console.log("Event created with times:", {
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        startDate: event.startsAt
          ? new Date(event.startsAt).toISOString()
          : null,
        endDate: event.endsAt ? new Date(event.endsAt).toISOString() : null,
        duration:
          event.startsAt && event.endsAt
            ? (new Date(event.endsAt).getTime() -
                new Date(event.startsAt).getTime()) /
              (60 * 60 * 1000)
            : null,
      });

      // Upload image after event creation if provided
      let finalEvent = event;
      if (imageFile) {
        try {
          finalEvent = await uploadEventImage(event.id, imageFile);
        } catch (imageError) {
          console.error("Image upload failed:", imageError);
          showToast(
            "Event created, but image upload failed. You can add an image later.",
            "warning"
          );
        }
      }

      // Navigate to success page with event data (including image if uploaded)
      navigate(`/events/${finalEvent.slug}/success`, {
        state: { event: finalEvent },
      });
    } catch (error) {
      handleNetworkError(
        error,
        showToast,
        error?.message || "Failed to post event"
      );
      setLoading(false);
    }
  }

  // Calendar functions
  function getCalendarUrls() {
    if (!postedEvent) return {};

    return generateCalendarUrls({
      title: postedEvent.title,
      description: postedEvent.description || "",
      location: postedEvent.location || "",
      slug: postedEvent.slug,
      startsAt: postedEvent.startsAt,
      endsAt: postedEvent.endsAt,
    });
  }

  function handleAddToCalendar(service) {
    const urls = getCalendarUrls();
    const url = urls[service];

    if (!url) {
      showToast("Unable to generate calendar link", "error");
      return;
    }

    if (service === "apple") {
      // Use raw ICS content if available (better file encoding)
      const icsContent = urls.icsContent;
      const blob = new Blob(
        [icsContent || decodeURIComponent(url.split(",")[1])],
        {
          type: "text/calendar",
        }
      );
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${postedEvent.slug}.ics`;
      link.click();
    } else {
      window.open(url, "_blank");
    }
    setShowCalendarDropdown(false);
  }

  function handleShare() {
    // Use share URL for rich previews (has OG tags)
    const shareUrl = getEventShareUrl(postedEvent.slug);

    if (navigator.share) {
      // URL ONLY - no title, no text, no files
      // This ensures rich preview (OG tags) is shown, not custom text
      navigator
        .share({
          url: shareUrl,
        })
        .catch((err) => {
          // User cancelled - do nothing
          if (err?.name === "AbortError") return;
          // Error - fallback to copy
          navigator.clipboard.writeText(shareUrl);
          showToast("Link copied to clipboard! 📋", "success");
        });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(shareUrl);
      showToast("Link copied to clipboard! 📋", "success");
    }
  }

  // Note: Success screen is now handled by EventSuccessPage component
  // Navigation happens after event creation

  // Form screen
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#05040a",
        color: "#fff",
        padding: "24px 20px",
        paddingBottom: "100px", // Space for fixed button
      }}
    >
      <div style={{ maxWidth: "400px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              fontSize: "16px",
              cursor: "pointer",
              marginBottom: "24px",
              padding: "0",
            }}
          >
            ← Back
          </button>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              marginBottom: "8px",
            }}
          >
            Post event quick ⚡
          </h1>
          <p style={{ fontSize: "14px", opacity: 0.7 }}>
            Create and share in seconds
          </p>
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Event name */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                marginBottom: "8px",
                opacity: 0.9,
              }}
            >
              Event name *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Friday Night Vibes"
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: "16px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                marginBottom: "8px",
                opacity: 0.9,
              }}
            >
              Write a fun description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's happening?"
              rows={4}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: "16px",
                outline: "none",
                boxSizing: "border-box",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Date and time */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                marginBottom: "8px",
                opacity: 0.9,
              }}
            >
              Date & time *
            </label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              onInvalid={(e) => {
                // Prevent default browser validation message
                e.preventDefault();
                showToast("Please enter a valid date and time", "error");
              }}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: "16px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Location */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                marginBottom: "8px",
                opacity: 0.9,
              }}
            >
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Central Park, NYC"
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: "16px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Image upload */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                marginBottom: "8px",
                opacity: 0.9,
              }}
            >
              Add image
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: "100%",
                minHeight: "200px",
                borderRadius: "12px",
                border: "2px dashed rgba(255,255,255,0.2)",
                background: imagePreview
                  ? `url(${imagePreview}) center/cover`
                  : "rgba(255,255,255,0.03)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {!imagePreview && (
                <>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>
                    📷
                  </div>
                  <div style={{ fontSize: "14px", opacity: 0.7 }}>
                    Tap to add image
                  </div>
                </>
              )}
              {imagePreview && (
                <div
                  style={{
                    position: "absolute",
                    top: "8px",
                    right: "8px",
                    background: "rgba(0,0,0,0.6)",
                    borderRadius: "50%",
                    width: "32px",
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: "18px",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageFile(null);
                    setImagePreview(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  ×
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: "none" }}
            />
          </div>
        </div>
      </div>

      {/* Fixed Post button */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "20px",
          background:
            "linear-gradient(to top, #05040a 0%, rgba(5,4,10,0.8) 80%, transparent 100%)",
          backdropFilter: "blur(10px)",
        }}
      >
        <button
          onClick={handlePost}
          disabled={loading || !title.trim() || !startsAt}
          style={{
            width: "100%",
            maxWidth: "400px",
            margin: "0 auto",
            display: "block",
            padding: "18px",
            borderRadius: "12px",
            border: "none",
            background:
              loading || !title.trim() || !startsAt
                ? "rgba(255,255,255,0.1)"
                : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
            color: "#fff",
            fontSize: "18px",
            fontWeight: 700,
            cursor:
              loading || !title.trim() || !startsAt ? "not-allowed" : "pointer",
            opacity: loading || !title.trim() || !startsAt ? 0.5 : 1,
          }}
        >
          {loading ? "Posting..." : "⚡ Post Event"}
        </button>
      </div>
    </div>
  );
}
