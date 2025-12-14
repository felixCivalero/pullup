import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import { authenticatedFetch } from "../lib/api.js";
import { getEventShareUrl } from "../lib/urlUtils";

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

    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file", "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("Image size must be less than 5MB", "error");
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

  // Compress image before upload
  function compressImage(
    file,
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.85
  ) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(compressedDataUrl);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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

      // Debug logging
      console.log("Event times (before API call):", {
        input: startsAt,
        startsAtISO,
        endsAt,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        durationHours,
        startLocal: startDate.toLocaleString(),
        endLocal: endDate.toLocaleString(),
        timezone: getUserTimezone(),
      });

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
          const compressedImage = await compressImage(imageFile);
          const imageRes = await authenticatedFetch(
            `/host/events/${event.id}/image`,
            {
              method: "POST",
              body: JSON.stringify({ imageData: compressedImage }),
            }
          );

          if (imageRes.ok) {
            // Image uploaded successfully - fetch updated event with image URL
            const updatedEventRes = await authenticatedFetch(
              `/host/events/${event.id}`
            );
            if (updatedEventRes.ok) {
              finalEvent = await updatedEventRes.json();
            }
          }
        } catch (imageError) {
          console.error("Image upload failed:", imageError);
          // Event is created, continue without image
        }
      }

      // Navigate to success page with event data (including image if uploaded)
      navigate(`/events/${finalEvent.slug}/success`, {
        state: { event: finalEvent },
      });
    } catch (error) {
      console.error("Error posting event:", error);
      showToast(error.message || "Failed to post event", "error");
      setLoading(false);
    }
  }

  // Calendar functions
  function getCalendarUrls() {
    if (!postedEvent) return {};

    const formatDateForGoogle = (dateString) => {
      if (!dateString) return null;

      // Parse the date string - it should be ISO format from backend
      const date = new Date(dateString);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.error("Invalid date:", dateString);
        return null;
      }

      // Format as YYYYMMDDTHHMMSSZ (UTC)
      // Google Calendar expects UTC time in this exact format
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      const hours = String(date.getUTCHours()).padStart(2, "0");
      const minutes = String(date.getUTCMinutes()).padStart(2, "0");
      const seconds = String(date.getUTCSeconds()).padStart(2, "0");

      const formatted = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

      // Debug: log the conversion
      console.log("Date formatting:", {
        input: dateString,
        date: date.toISOString(),
        formatted,
        local: date.toLocaleString(),
        utc: `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`,
      });

      return formatted;
    };

    // Get start date
    if (!postedEvent.startsAt) {
      console.error("No start date in event");
      return {};
    }

    const startDate = formatDateForGoogle(postedEvent.startsAt);
    if (!startDate) {
      console.error("Failed to format start date");
      return {};
    }

    // Calculate end date: 2 hours after start
    let endDate;
    if (postedEvent.endsAt) {
      // Use provided end date (should always be set)
      endDate = formatDateForGoogle(postedEvent.endsAt);

      // Verify it's 2 hours after start
      const start = new Date(postedEvent.startsAt);
      const end = new Date(postedEvent.endsAt);
      const durationHours =
        (end.getTime() - start.getTime()) / (60 * 60 * 1000);

      if (Math.abs(durationHours - 2) > 0.01) {
        console.warn("Event duration is not 2 hours:", {
          durationHours,
          startsAt: postedEvent.startsAt,
          endsAt: postedEvent.endsAt,
        });
        // Recalculate to ensure it's exactly 2 hours
        const recalculatedEnd = new Date(start.getTime() + 2 * 60 * 60 * 1000);
        endDate = formatDateForGoogle(recalculatedEnd.toISOString());
      }
    } else {
      // Fallback: Calculate 2 hours after start (shouldn't happen if backend works)
      console.warn("No endsAt in event, calculating from startsAt");
      const start = new Date(postedEvent.startsAt);
      if (isNaN(start.getTime())) {
        console.error("Invalid start date");
        return {};
      }
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // Add 2 hours
      endDate = formatDateForGoogle(end.toISOString());
    }

    // Ensure we have both dates
    if (!startDate || !endDate) {
      console.error("Missing dates for calendar", {
        startDate,
        endDate,
        startsAt: postedEvent.startsAt,
        endsAt: postedEvent.endsAt,
      });
      return {};
    }

    // Debug logging
    console.log("Calendar dates:", {
      startsAt: postedEvent.startsAt,
      endsAt: postedEvent.endsAt,
      startDate,
      endDate,
      startObj: new Date(postedEvent.startsAt),
      endObj: postedEvent.endsAt
        ? new Date(postedEvent.endsAt)
        : new Date(
            new Date(postedEvent.startsAt).getTime() + 2 * 60 * 60 * 1000
          ),
    });

    const eventUrl = `${window.location.origin}/e/${postedEvent.slug}`;
    const description = `${
      postedEvent.description || ""
    }\n\nEvent page: ${eventUrl}`;

    const location = encodeURIComponent(postedEvent.location || "");
    const title = encodeURIComponent(postedEvent.title);
    const desc = encodeURIComponent(description);

    return {
      google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&details=${desc}&location=${location}`,
      outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${startDate}&enddt=${endDate}&body=${desc}&location=${location}`,
      yahoo: `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${title}&st=${startDate}&dur=${endDate}&desc=${desc}&in_loc=${location}`,
      apple: `data:text/calendar;charset=utf8,BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${startDate}\nDTEND:${endDate}\nSUMMARY:${title}\nDESCRIPTION:${desc}\nLOCATION:${location}\nEND:VEVENT\nEND:VCALENDAR`,
    };
  }

  function handleAddToCalendar(service) {
    const urls = getCalendarUrls();
    const url = urls[service];

    if (service === "apple") {
      // Download iCal file
      const blob = new Blob([url.split(",")[1]], { type: "text/calendar" });
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

  function formatEventDate(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
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
