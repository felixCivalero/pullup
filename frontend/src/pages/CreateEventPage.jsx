import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useEventNav } from "../contexts/EventNavContext.jsx";
import {
  Camera,
  Image as ImageIcon,
  Clock,
  Globe,
  Users,
  RefreshCw,
  Trophy,
  UtensilsCrossed,
  ClipboardList,
  Lightbulb,
  Ticket,
  AlertTriangle,
  Eye,
  Pencil,
  Monitor,
  Smartphone,
  Plus,
  X,
  Star,
  Film,
  GripVertical,
  Layers,
  ArrowRight,
  ZoomIn,
  Grid3X3,
  Blend,
  EyeOff,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
} from "lucide-react";
import { FaInstagram, FaSpotify, FaTiktok, FaSoundcloud } from "react-icons/fa";
import { EventPreview } from "../components/EventPreview";
import { VideoPlayer } from "../components/MediaCarousel";
import { RsvpForm } from "../components/RsvpForm";
import { useToast } from "../components/Toast";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { SilverIcon } from "../components/ui/SilverIcon.jsx";
import { authenticatedFetch } from "../lib/api.js";
import {
  formatRelativeTime,
  formatReadableDateTime,
  formatEventTime,
} from "../lib/dateUtils.js";
import { uploadEventImage, validateMediaFile, uploadEventMedia, deleteEventMedia, reorderEventMedia, generateVideoThumbnail } from "../lib/imageUtils.js";
import {
  isNetworkError,
  handleNetworkError,
  handleApiError,
} from "../lib/errorHandler.js";
import { fetchTimezoneForLocation } from "../lib/timezone.js";

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
  border: "1px solid rgba(192, 192, 192, 0.4)",
  background: "rgba(20, 16, 30, 0.5)",
  boxShadow: "0 0 0 3px rgba(192, 192, 192, 0.1)",
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

// Helper function to convert ISO string to datetime-local format (local time)
// This ensures the displayed time matches what the user selected, accounting for timezone
function isoToLocalDateTime(isoString) {
  if (!isoString) return "";
  // Create Date object from ISO string (which is in UTC)
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";

  // Get local date/time components (not UTC)
  // These methods automatically return values in the local timezone
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Helper function to convert datetime-local string to ISO string
// datetime-local inputs provide values in local time (e.g., "2025-12-10T19:00")
// The key: when you create a Date from "YYYY-MM-DDTHH:mm" (without timezone),
// JavaScript interprets it as local time. When we call toISOString(), it converts to UTC.
// This is correct - we store in UTC, and when displaying, we convert back to local.
function localDateTimeToIso(localDateTimeString) {
  if (!localDateTimeString) return "";

  // Parse the local datetime string
  // Format: "YYYY-MM-DDTHH:mm" (local time, no timezone)
  // JavaScript will interpret this as local time
  const [datePart, timePart] = localDateTimeString.split("T");
  if (!datePart || !timePart) return "";

  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);

  // Create a Date object in local time
  // Using the Date constructor with individual components ensures local time interpretation
  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (isNaN(localDate.getTime())) return "";

  // Convert to ISO string (UTC)
  // When we convert back using isoToLocalDateTime, it will show the correct local time
  return localDate.toISOString();
}

// Calculate cuisine timeslots based on time window and interval
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
      startMinute,
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
      const timeStr = `${String(hours).padStart(2, "0")}:${String(
        minutes,
      ).padStart(2, "0")}`;

      slots.push(timeStr);

      // Move to next slot
      currentTime = new Date(currentTime.getTime() + interval * 60 * 60 * 1000);
    }

    return slots;
  } catch (error) {
    console.error("Error calculating timeslots:", error);
    return [];
  }
}

// Helper to adjust a datetime-local string by a number of hours
function shiftLocalDateTimeString(localDateTimeString, hoursDelta) {
  if (!localDateTimeString || typeof localDateTimeString !== "string") {
    return localDateTimeString;
  }

  const [datePart, timePart] = localDateTimeString.split("T");
  if (!datePart || !timePart) return localDateTimeString;

  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (isNaN(date.getTime())) return localDateTimeString;

  const shifted = new Date(date.getTime() + hoursDelta * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, "0");
  const d = String(shifted.getDate()).padStart(2, "0");
  const hh = String(shifted.getHours()).padStart(2, "0");
  const mm = String(shifted.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
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
  const { id: editEventId } = useParams(); // present when editing
  const isEditMode = !!editEventId;
  const { showToast } = useToast();
  const { setEventNav } = useEventNav();
  const [editLoading, setEditLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [profileChecked, setProfileChecked] = useState(isEditMode);

  // Redirect to /events if profile is incomplete (create mode only)
  useEffect(() => {
    if (isEditMode) return;
    async function checkProfile() {
      try {
        const res = await authenticatedFetch("/host/profile");
        if (res.ok) {
          const profile = await res.json();
          if (!profile.brand?.trim() || !profile.contactEmail?.trim()) {
            showToast("Complete your profile before creating events", "error");
            navigate("/events", { replace: true });
            return;
          }
        }
      } catch {}
      setProfileChecked(true);
    }
    checkProfile();
  }, [isEditMode, navigate, showToast]);
  const [showStartDateTimePicker, setShowStartDateTimePicker] = useState(false);
  const [showEndDateTimePicker, setShowEndDateTimePicker] = useState(false);
  const fileInputRef = useRef(null);
  const startDateTimeInputRef = useRef(null);
  const endDateTimeInputRef = useRef(null);
  const dinnerStartTimeInputRef = useRef(null);
  const dinnerEndTimeInputRef = useRef(null);

  // Restore draft from localStorage (create mode only, expires after 24h)
  const draft = !isEditMode ? (() => {
    try {
      const raw = localStorage.getItem("pullup_event_draft");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed._savedAt && Date.now() - parsed._savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem("pullup_event_draft");
        return null;
      }
      return parsed;
    } catch { return null; }
  })() : null;
  const [showDraftBanner, setShowDraftBanner] = useState(!!draft);
  const [hoveredSection, setHoveredSection] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const [title, setTitle] = useState(draft?.title || "Summer Rooftop Party");
  const [titleVisible, setTitleVisible] = useState(draft?.titleVisible !== false);
  const [titleAlign, setTitleAlign] = useState(draft?.titleAlign || "left"); // "left"|"center"|"right"
  const [titleFont, setTitleFont] = useState(draft?.titleFont || "default"); // "default"|"serif"|"mono"|"condensed"
  const [titleSize, setTitleSize] = useState(draft?.titleSize || "md"); // "sm"|"md"|"lg"
  const [titleColor, setTitleColor] = useState(draft?.titleColor || "#ffffff");
  const [detailsColor, setDetailsColor] = useState(draft?.detailsColor || "#ffffff");
  const [detailsGradient, setDetailsGradient] = useState(draft?.detailsGradient || "#000000");
  const [detailsGradientEnabled, setDetailsGradientEnabled] = useState(draft?.detailsGradientEnabled === true);
  const [description, setDescription] = useState(draft?.description || "");
  const [sections, setSections] = useState(() => {
    const saved = draft?.sections || [];
    const hasTitle = saved.some(s => s.type === "title");
    const hasLocation = saved.some(s => s.type === "location");
    const hasDatetime = saved.some(s => s.type === "datetime");
    const defaults = [];
    if (!hasTitle) defaults.push({ type: "title" });
    if (!hasLocation) defaults.push({ type: "location" });
    if (!hasDatetime) defaults.push({ type: "datetime" });
    // Pre-fill with template sections for new events (no draft / no custom sections yet)
    if (saved.length === 0 && !draft?.sections?.length) {
      return [...defaults,
        { type: "text", title: "", text: "A short description about something nice maybe a quote yes." },
        { type: "text", title: "About the artist", text: "A boundary-pushing creative known for blending electronic, soul, and experimental sounds into immersive live experiences. With roots in Stockholm\u2019s underground scene, they\u2019ve built a reputation for high-energy sets that blur the line between DJ performance and live act." },
      ];
    }
    return [...defaults, ...saved];
  });
  // showSectionPicker state removed — grid is always visible
  const [location, setLocation] = useState(draft?.location || "Slakthusomr\u00e5det, Stockholm");
  const [locationLat, setLocationLat] = useState(draft?.locationLat || null);
  const [locationLng, setLocationLng] = useState(draft?.locationLng || null);
  const [hideLocation, setHideLocation] = useState(draft?.hideLocation || false);
  const [startsAt, setStartsAt] = useState(draft?.startsAt || (() => {
    // Default to 14 days from now at 21:00
    const d = new Date();
    d.setDate(d.getDate() + 14);
    d.setHours(21, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  })());
  const [endsAt, setEndsAt] = useState(draft?.endsAt || "");
  const [timezone, setTimezone] = useState(draft?.timezone || getUserTimezone());
  const [maxAttendees, setMaxAttendees] = useState(draft?.maxAttendees || "");
  const [waitlistEnabled, setWaitlistEnabled] = useState(draft?.waitlistEnabled || false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]); // [{file, preview, mediaType, id}]
  const [mediaMode, setMediaMode] = useState(null); // null | "images" | "video"
  const [mediaIntent, setMediaIntent] = useState(null); // null | "image" | "carousel" | "video" — user's selection before upload
  // Video settings
  const [videoLoop, setVideoLoop] = useState(true);
  const [videoAutoplay, setVideoAutoplay] = useState(true);
  const [videoAudio, setVideoAudio] = useState(false);
  const [customThumbnail, setCustomThumbnail] = useState(null); // { file, preview }
  const thumbnailInputRef = useRef(null);
  // Carousel settings
  const [carouselAutoscroll, setCarouselAutoscroll] = useState(true);
  const [carouselInterval, setCarouselInterval] = useState(5);
  const [carouselLoop, setCarouselLoop] = useState(true);
  const [carouselTransitions, setCarouselTransitions] = useState([]); // per-gap: "slide"|"fade"|"zoom"|"pixelate"
  const [theme] = useState("minimal");
  const [calendar] = useState("personal");
  const [visibility] = useState("public");
  const [sellTicketsEnabled, setSellTicketsEnabled] = useState(draft?.sellTicketsEnabled || false);
  const [ticketPrice, setTicketPrice] = useState(draft?.ticketPrice || "");
  const [ticketCurrency, setTicketCurrency] = useState(draft?.ticketCurrency || "SEK");
  const isPaidEvent = sellTicketsEnabled && ticketPrice && parseFloat(ticketPrice) > 0;

  // NEW: plus-ones
  const [allowPlusOnes, setAllowPlusOnes] = useState(draft?.allowPlusOnes || false);
  const [maxPlusOnesPerGuest, setMaxPlusOnesPerGuest] = useState(draft?.maxPlusOnesPerGuest || "3");

  // NEW: dinner
  const [dinnerEnabled, setDinnerEnabled] = useState(draft?.dinnerEnabled || false);
  const [dinnerStartTime, setDinnerStartTime] = useState(draft?.dinnerStartTime || "");
  const [dinnerEndTime, setDinnerEndTime] = useState(draft?.dinnerEndTime || "");
  const [dinnerSeatingIntervalHours] = useState("1.5");
  const [dinnerMaxSeatsPerSlot, setDinnerMaxSeatsPerSlot] = useState(draft?.dinnerMaxSeatsPerSlot || "");
  const [dinnerMaxGuestsPerBooking, setDinnerMaxGuestsPerBooking] =
    useState(draft?.dinnerMaxGuestsPerBooking || "");
  const [dinnerOverflowAction, setDinnerOverflowAction] = useState(draft?.dinnerOverflowAction || "waitlist");
  const [dinnerBookingEmail, setDinnerBookingEmail] = useState(draft?.dinnerBookingEmail || "");
  const [hideDinnerRemaining, setHideDinnerRemaining] = useState(draft?.hideDinnerRemaining || false);
  const [dinnerSlotsConfig, setDinnerSlotsConfig] = useState(draft?.dinnerSlotsConfig || []);

  // Social links
  const [instagram, setInstagram] = useState(draft?.instagram || "");
  const [spotify, setSpotify] = useState(draft?.spotify || "");
  const [tiktok, setTiktok] = useState(draft?.tiktok || "");
  const [soundcloud, setSoundcloud] = useState(draft?.soundcloud || "");

  const [loading, setLoading] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isMounted, setIsMounted] = useState(false);
  const [mobileView, setMobileView] = useState("edit"); // "edit" or "preview"
  const [desktopPreviewMode, setDesktopPreviewMode] = useState("phone"); // "desktop" or "phone"
  const [currentStep, setCurrentStep] = useState(draft?.currentStep || 1);
  const [stepDirection, setStepDirection] = useState("forward");
  const [hasAttemptedPublish, setHasAttemptedPublish] = useState(false);
  const [goldFlash, setGoldFlash] = useState({}); // { title: true, startsAt: true, media: true }
  const sidebarRef = useRef(null);

  // Compute missing required fields
  const missingFields = {
    media: mediaFiles.length === 0 && !(isEditMode),
    title: !title.trim(),
    startsAt: !startsAt,
  };
  const missingCount = Object.values(missingFields).filter(Boolean).length;
  const tabHasMissing = {
    1: missingFields.media, // Media tab
    2: missingFields.title || missingFields.startsAt, // Details tab
  };

  // Gold flash when a field goes from missing to filled
  const prevMissing = useRef(missingFields);
  useEffect(() => {
    if (!hasAttemptedPublish) return;
    const prev = prevMissing.current;
    const flashes = {};
    if (prev.title && !missingFields.title) flashes.title = true;
    if (prev.startsAt && !missingFields.startsAt) flashes.startsAt = true;
    if (prev.media && !missingFields.media) flashes.media = true;
    if (Object.keys(flashes).length > 0) {
      setGoldFlash((f) => ({ ...f, ...flashes }));
      setTimeout(() => setGoldFlash({}), 1200);
    }
    prevMissing.current = { ...missingFields };
  }, [missingFields.title, missingFields.startsAt, missingFields.media, hasAttemptedPublish]);

  // Build preview dinner slots from config for the RSVP preview
  const previewDinnerSlots = useMemo(() => {
    if (!dinnerEnabled || dinnerSlotsConfig.length === 0 || !startsAt) return null;
    const eventLocal = isoToLocalDateTime(startsAt);
    const datePart = (eventLocal || "").split("T")[0];
    if (!datePart) return null;
    return dinnerSlotsConfig
      .filter((s) => s.time)
      .map((slot) => {
        const iso = localDateTimeToIso(`${datePart}T${slot.time}`);
        return {
          time: iso || `${datePart}T${slot.time}:00`,
          available: true,
          remaining: slot.maxSeats ? Number(slot.maxSeats) : null,
          maxGuestsPerBooking: slot.maxGuestsPerBooking ? Number(slot.maxGuestsPerBooking) : null,
        };
      })
      .filter((s) => s.time);
  }, [dinnerEnabled, dinnerSlotsConfig, startsAt]);

  // Stripe connection status - load from backend
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeAccountEmail, setStripeAccountEmail] = useState("");
  const [stripeBusinessName, setStripeBusinessName] = useState("");
  const [stripeConnecting, setStripeConnecting] = useState(false);

  // Load Stripe connection status from backend
  useEffect(() => {
    loadStripeStatus();
  }, []);

  async function loadStripeStatus() {
    try {
      const { authenticatedFetch } = await import("../lib/api.js");
      const response = await authenticatedFetch(
        "/host/stripe/connect/status",
      );
      if (response.ok) {
        const data = await response.json();
        setStripeConnected(data.connected && data.accountDetails?.charges_enabled);
        setStripeAccountEmail(data.accountDetails?.email || "");
        setStripeBusinessName(data.accountDetails?.businessName || "");
      }
    } catch (error) {
      console.error("Failed to load Stripe status:", error);
      setStripeConnected(false);
      setStripeAccountEmail("");
      setStripeBusinessName("");
    }
  }

  async function handleConnectStripeInline() {
    try {
      setStripeConnecting(true);
      const { authenticatedFetch } = await import("../lib/api.js");
      const response = await authenticatedFetch(
        "/host/stripe/connect/initiate",
        { method: "POST" },
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to initiate connection");
      }
      const data = await response.json();
      if (data.alreadyComplete) {
        loadStripeStatus();
        setStripeConnecting(false);
        return;
      }
      window.location.href = data.authorizationUrl;
    } catch (error) {
      console.error("Failed to initiate Stripe Connect:", error);
      setStripeConnecting(false);
    }
  }
  const [isDragging, setIsDragging] = useState(false);

  // Warn before navigating away if there are unsaved media files
  const hasUnsavedMedia = mediaFiles.length > 0;
  const hasUnsavedMediaRef = useRef(false);
  hasUnsavedMediaRef.current = hasUnsavedMedia;

  // Expose to global so nav can check before navigating
  useEffect(() => {
    window.__pullupUnsavedMedia = hasUnsavedMedia;
    return () => { window.__pullupUnsavedMedia = false; };
  }, [hasUnsavedMedia]);

  useEffect(() => {
    if (!hasUnsavedMedia) return;

    // Browser tab close / reload
    const beforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);

    // Browser back/forward button
    const handlePopState = (e) => {
      if (!hasUnsavedMediaRef.current) return;
      const confirmed = window.confirm(
        "You have uploaded media that hasn't been saved. If you leave, your images/video will be lost.\n\nLeave anyway?"
      );
      if (!confirmed) {
        // Push state back to prevent navigation
        window.history.pushState(null, "", window.location.href);
      }
    };
    // Push an extra history entry so we can intercept back
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    // In-app link clicks — intercept <a> clicks within the app
    const clickHandler = (e) => {
      if (!hasUnsavedMediaRef.current) return;
      const link = e.target.closest("a[href]");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#")) return;
      // It's an in-app link
      const confirmed = window.confirm(
        "You have uploaded media that hasn't been saved. If you leave, your images/video will be lost.\n\nLeave anyway?"
      );
      if (!confirmed) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", clickHandler, true);

    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", clickHandler, true);
    };
  }, [hasUnsavedMedia]);


  // Save draft to localStorage (create mode only, debounced)
  useEffect(() => {
    if (isEditMode) return;
    const timeout = setTimeout(() => {
      try {
        const draftData = {
          title, titleVisible, titleAlign, titleFont, titleSize, titleColor, detailsColor, detailsGradient, detailsGradientEnabled,
          description, location, locationLat, locationLng,
          startsAt, endsAt, timezone, maxAttendees, waitlistEnabled,
          sellTicketsEnabled, ticketPrice, ticketCurrency,
          allowPlusOnes, maxPlusOnesPerGuest,
          dinnerEnabled, dinnerStartTime, dinnerEndTime,
          dinnerMaxSeatsPerSlot, dinnerMaxGuestsPerBooking,
          dinnerOverflowAction, dinnerBookingEmail, hideDinnerRemaining,
          dinnerSlotsConfig,
          instagram, spotify, tiktok, soundcloud,
          currentStep,
          _savedAt: Date.now(),
        };
        localStorage.setItem("pullup_event_draft", JSON.stringify(draftData));
      } catch { /* storage full or unavailable */ }
    }, 500);
    return () => clearTimeout(timeout);
  }, [
    isEditMode, title, description, location, locationLat, locationLng,
    startsAt, endsAt, timezone, maxAttendees, waitlistEnabled,
    sellTicketsEnabled, ticketPrice, ticketCurrency,
    allowPlusOnes, maxPlusOnesPerGuest,
    dinnerEnabled, dinnerStartTime, dinnerEndTime,
    dinnerMaxSeatsPerSlot, dinnerMaxGuestsPerBooking,
    dinnerOverflowAction, dinnerBookingEmail, hideDinnerRemaining,
    dinnerSlotsConfig,
    instagram, spotify, tiktok, soundcloud,
    currentStep, detailsColor, detailsGradient, detailsGradientEnabled,
  ]);

  function clearDraft() {
    try { localStorage.removeItem("pullup_event_draft"); } catch {}
  }

  function discardDraft() {
    clearDraft();
    setShowDraftBanner(false);
    setTitle(""); setDescription(""); setLocation("");
    setLocationLat(null); setLocationLng(null); setHideLocation(false);
    setStartsAt(""); setEndsAt(""); setTimezone(getUserTimezone());
    setMaxAttendees(""); setWaitlistEnabled(false);
    setImageFile(null); setImagePreview(null);
    setMediaFiles([]); setMediaMode(null);
    setVideoLoop(true); setVideoAutoplay(true); setVideoAudio(false);
    setCarouselAutoscroll(false); setCarouselInterval(5); setCarouselLoop(true);
    setSellTicketsEnabled(false); setTicketPrice(""); setTicketCurrency("USD");
    setAllowPlusOnes(false); setMaxPlusOnesPerGuest("3");
    setDinnerEnabled(false); setDinnerStartTime(""); setDinnerEndTime("");
    setDinnerMaxSeatsPerSlot(""); setDinnerOverflowAction("waitlist");
    setDinnerBookingEmail(""); setDinnerSlotsConfig([]);
    setInstagram(""); setSpotify(""); setTiktok(""); setSoundcloud("");
    setCurrentStep(1);
  }

  function goToStep(step) {
    setStepDirection(step > currentStep ? "forward" : "backward");
    setCurrentStep(step);
    sidebarRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateStep() {
    // Check date logic errors (these are hard errors, not missing fields)
    if (startsAt && new Date(startsAt) < new Date()) {
      goToStep(2);
      showToast("Event start date cannot be in the past", "error");
      return false;
    }
    if (endsAt && new Date(endsAt) < new Date()) {
      goToStep(2);
      showToast("Event end date cannot be in the past", "error");
      return false;
    }
    // Check missing required fields
    if (missingCount > 0) {
      setHasAttemptedPublish(true);
      // Navigate to first tab with issues
      if (missingFields.media) {
        goToStep(1);
      } else {
        goToStep(2);
      }
      return false;
    }
    return true;
  }

  // Reset form when switching between create/edit modes
  useEffect(() => {
    if (editEventId) return; // edit mode handles its own loading
    // Don't reset if we have a draft (page reload scenario)
    if (draft) return;
    setTitle(""); setDescription(""); setLocation("");
    setLocationLat(null); setLocationLng(null); setHideLocation(false);
    setStartsAt(""); setEndsAt(""); setTimezone(getUserTimezone());
    setMaxAttendees(""); setWaitlistEnabled(false);
    setImageFile(null); setImagePreview(null);
    setMediaFiles([]); setMediaMode(null);
    setVideoLoop(true); setVideoAutoplay(true); setVideoAudio(false);
    setCarouselAutoscroll(false); setCarouselInterval(5); setCarouselLoop(true);
    setSellTicketsEnabled(false); setTicketPrice(""); setTicketCurrency("USD");
    setAllowPlusOnes(false); setMaxPlusOnesPerGuest("3");
    setDinnerEnabled(false); setDinnerStartTime(""); setDinnerEndTime("");
    setDinnerMaxSeatsPerSlot(""); setDinnerOverflowAction("waitlist");
    setDinnerSlotsConfig([]);
    setInstagram(""); setSpotify(""); setTiktok(""); setSoundcloud("");
  }, [editEventId]);

  // Load existing event data when in edit mode
  useEffect(() => {
    if (!editEventId) return;
    let cancelled = false;
    async function loadEvent() {
      setEditLoading(true);
      try {
        const res = await authenticatedFetch(`/host/events/${editEventId}`);
        if (!res.ok) throw new Error("Failed to load event");
        const ev = await res.json();
        if (cancelled) return;

        // Analytics-only users cannot edit events
        if (ev.myRole === "analytics" || ev.myRole === "viewer") {
          navigate(`/app/events/${editEventId}/analytics`, { replace: true });
          return;
        }

        // Helper: ISO string → datetime-local input value
        const toLocal = (iso) => {
          if (!iso) return "";
          const d = new Date(iso);
          if (isNaN(d.getTime())) return "";
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const hh = String(d.getHours()).padStart(2, "0");
          const mm = String(d.getMinutes()).padStart(2, "0");
          return `${y}-${m}-${day}T${hh}:${mm}`;
        };

        // Populate form fields
        setTitle(ev.title || "");
        if (ev.titleSettings) {
          if (ev.titleSettings.visible !== undefined) setTitleVisible(ev.titleSettings.visible);
          if (ev.titleSettings.align) setTitleAlign(ev.titleSettings.align);
          if (ev.titleSettings.font) setTitleFont(ev.titleSettings.font);
          if (ev.titleSettings.size) setTitleSize(ev.titleSettings.size);
          if (ev.titleSettings.color) setTitleColor(ev.titleSettings.color);
          if (ev.titleSettings.detailsColor) setDetailsColor(ev.titleSettings.detailsColor);
          if (ev.titleSettings.detailsGradient) setDetailsGradient(ev.titleSettings.detailsGradient);
          if (ev.titleSettings.detailsGradientEnabled !== undefined) setDetailsGradientEnabled(ev.titleSettings.detailsGradientEnabled);
        }
        setDescription(ev.description || "");
        (() => {
          const saved = ev.sections || [];
          const hasT = saved.some(s => s.type === "title");
          const hasLoc = saved.some(s => s.type === "location");
          const hasDt = saved.some(s => s.type === "datetime");
          const defaults = [];
          if (!hasT) defaults.push({ type: "title" });
          if (!hasLoc) defaults.push({ type: "location" });
          if (!hasDt) defaults.push({ type: "datetime" });
          setSections([...defaults, ...saved]);
        })();
        setLocation(ev.location || "");
        setLocationLat(ev.locationLat || null);
        setLocationLng(ev.locationLng || null);
        setHideLocation(ev.hideLocation || false);
        setStartsAt(ev.startsAt || "");
        setEndsAt(ev.endsAt || "");
        setTimezone(ev.timezone || getUserTimezone());
        setMaxAttendees(ev.cocktailCapacity ? String(ev.cocktailCapacity) : "");
        setWaitlistEnabled(!!ev.waitlistEnabled);

        // Tickets
        if (ev.ticketType === "paid") {
          setSellTicketsEnabled(true);
          setTicketPrice(ev.ticketPrice ? String(ev.ticketPrice / 100) : "");
          setTicketCurrency((ev.ticketCurrency || "USD").toUpperCase());
        }

        // Plus-ones
        if (ev.maxPlusOnesPerGuest > 0) {
          setAllowPlusOnes(true);
          setMaxPlusOnesPerGuest(String(ev.maxPlusOnesPerGuest));
        }

        // Dinner
        if (ev.dinnerEnabled) {
          setDinnerEnabled(true);
          setDinnerStartTime(ev.dinnerStartTime ? toLocal(ev.dinnerStartTime) : "");
          setDinnerEndTime(ev.dinnerEndTime ? toLocal(ev.dinnerEndTime) : "");
          if (ev.dinnerMaxSeatsPerSlot) setDinnerMaxSeatsPerSlot(String(ev.dinnerMaxSeatsPerSlot));
          setDinnerOverflowAction(ev.dinnerOverflowAction || "waitlist");
          if (ev.dinnerBookingEmail) setDinnerBookingEmail(ev.dinnerBookingEmail);
          if (ev.hideDinnerRemaining) setHideDinnerRemaining(ev.hideDinnerRemaining);
          if (ev.dinnerSlots && ev.dinnerSlots.length > 0) {
            const slotConfigs = ev.dinnerSlots.map((s) => ({
              time: s.time ? toLocal(s.time).split("T")[1] || "" : "",
              maxSeats: s.capacity ? String(s.capacity) : "",
              maxGuestsPerBooking: s.maxGuestsPerBooking ? String(s.maxGuestsPerBooking) : "",
            }));
            setDinnerSlotsConfig(slotConfigs);
            // Set global fallback from first slot
            const firstBooking = slotConfigs.find((s) => s.maxGuestsPerBooking);
            if (firstBooking) setDinnerMaxGuestsPerBooking(firstBooking.maxGuestsPerBooking);
          }
        }

        // Social links
        setInstagram(ev.instagram || "");
        setSpotify(ev.spotify || "");
        setTiktok(ev.tiktok || "");
        setSoundcloud(ev.soundcloud || "");

        // Media settings
        const ms = ev.mediaSettings || {};
        if (ms.mode === "video") {
          setVideoLoop(ms.loop !== undefined ? ms.loop : true);
          setVideoAutoplay(ms.autoplay !== undefined ? ms.autoplay : true);
          setVideoAudio(ms.audio !== undefined ? ms.audio : false);
        } else if (ms.mode === "carousel") {
          setCarouselAutoscroll(!!ms.autoscroll);
          setCarouselInterval(ms.interval || 5);
          setCarouselLoop(ms.loop !== undefined ? ms.loop : true);
          if (ms.transitions) setCarouselTransitions(ms.transitions);
        }

        // Load existing media items
        if (ev.media && ev.media.length > 0) {
          const mode = ev.media[0].mediaType === "video" ? "video" : "images";
          setMediaMode(mode);
          const loaded = ev.media.map((m) => ({
            id: m.id,
            serverId: m.id, // track that this is already on server
            file: null, // no local file
            preview: m.thumbnailUrl || m.url,
            previewUrl: m.url,
            mediaType: m.mediaType || "image",
            url: m.url,
          }));
          setMediaFiles(loaded);
          setImagePreview(loaded[0].previewUrl || loaded[0].preview);
          // If event has a custom imageUrl different from the video thumbnail, load it as custom thumbnail
          if (mode === "video" && ev.imageUrl && ev.media[0].thumbnailUrl && ev.imageUrl !== ev.media[0].thumbnailUrl) {
            setCustomThumbnail({ file: null, preview: ev.imageUrl });
          }
        } else if (ev.imageUrl) {
          setImagePreview(ev.imageUrl);
        }

        // Update navbar with event context
        setEventNav({
          title: ev.title,
          slug: ev.slug,
          guestsCount: null,
        });
      } catch (err) {
        console.error("Error loading event for edit:", err);
        showToast("Failed to load event", "error");
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    }
    loadEvent();
    return () => { cancelled = true; };
  }, [editEventId]);

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
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleMediaAdd(files);
    }
  }

  function handleToggleDinnerEnabled(nextValue) {
    if (nextValue && !startsAt) {
      showToast(
        "Set an event start date and time before adding food serving slots.",
        "warning",
      );
      return;
    }
    setDinnerEnabled(nextValue);
    setDinnerSlotsConfig((prev) => {
      if (!nextValue) {
        // Turning dinner off clears slot configuration
        return [];
      }
      // Ensure at least one slot exists when enabling
      if (prev.length > 0) return prev;
      return [
        {
          time: "18:00",
          maxSeats: dinnerMaxSeatsPerSlot || "20",
          maxGuestsPerBooking: dinnerMaxGuestsPerBooking || "4",
        },
      ];
    });
  }

  function handleAddDinnerSlot() {
    if (!dinnerEnabled) return;
    setDinnerSlotsConfig((prev) => {
      const last = prev[prev.length - 1] || {
        time: "18:00",
        maxSeats: dinnerMaxSeatsPerSlot || "20",
        maxGuestsPerBooking: dinnerMaxGuestsPerBooking || "4",
      };
      // Auto-increment by 1 hour from last slot
      let nextTime = "18:00";
      if (last.time) {
        const [h, m] = last.time.split(":");
        const nextH = String(parseInt(h, 10) + 1).padStart(2, "0");
        nextTime = `${nextH}:${m}`;
      }
      return [
        ...prev,
        {
          time: nextTime,
          maxSeats: last.maxSeats,
          maxGuestsPerBooking: last.maxGuestsPerBooking,
        },
      ];
    });
  }

  function handleRemoveDinnerSlot() {
    if (!dinnerEnabled) return;
    setDinnerSlotsConfig((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, prev.length - 1);
    });
  }

  async function handleMediaAdd(files) {
    const fileList = Array.isArray(files) ? files : [files];
    const maxItems = 10;

    for (const file of fileList) {
      const validation = validateMediaFile(file);
      if (!validation.valid) {
        showToast(validation.error, "error");
        continue;
      }

      const isVideo = validation.mediaType === "video";
      const isImage = validation.mediaType === "image" || validation.mediaType === "gif";

      // Enforce content type separation
      if (mediaMode === "video" && isImage) {
        showToast("Remove the video first to add images", "error");
        continue;
      }
      if (mediaMode === "images" && isVideo) {
        showToast("Remove images first to add a video", "error");
        continue;
      }
      // Video mode: only 1 video allowed
      if (isVideo && mediaFiles.length > 0) {
        showToast("Only one video is allowed. Remove existing media first.", "error");
        continue;
      }
      // Image mode: max 10
      if (isImage && mediaFiles.length >= maxItems) {
        showToast(`Maximum ${maxItems} images allowed`, "error");
        continue;
      }

      // Generate preview
      let preview;
      if (isVideo) {
        try {
          const thumbBlob = await generateVideoThumbnail(file);
          preview = URL.createObjectURL(thumbBlob);
        } catch {
          preview = null;
        }
      } else {
        preview = URL.createObjectURL(file);
      }

      const mediaItem = {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        preview,
        mediaType: validation.mediaType,
        previewUrl: isVideo ? URL.createObjectURL(file) : preview,
      };

      setMediaFiles((prev) => {
        const updated = [...prev, mediaItem];
        // Sync legacy preview
        setImagePreview(updated[0].previewUrl || updated[0].preview);
        setImageFile(updated[0].file);
        // Sync transitions — add a default for the new gap
        if (updated.length > 1) {
          setCarouselTransitions((t) => {
            const needed = updated.length - 1;
            const copy = [...t];
            while (copy.length < needed) copy.push("slide");
            return copy.slice(0, needed);
          });
        }
        return updated;
      });

      // Set media mode
      setMediaMode(isVideo ? "video" : "images");
    }

    showToast(`Media added! It will be uploaded when you ${isEditMode ? "save" : "create the event"}.`, "success");
  }

  function handleMediaRemove(id) {
    // If editing and item is already on server, delete it
    const item = mediaFiles.find((m) => m.id === id);
    if (isEditMode && item?.serverId) {
      deleteEventMedia(editEventId, item.serverId).catch((err) =>
        console.error("Failed to delete media from server:", err)
      );
    }
    setMediaFiles((prev) => {
      const removeIdx = prev.findIndex((m) => m.id === id);
      const updated = prev.filter((m) => m.id !== id);
      if (updated.length > 0) {
        setImagePreview(updated[0].previewUrl || updated[0].preview);
        setImageFile(updated[0].file);
      } else {
        setImagePreview(null);
        setImageFile(null);
        setMediaMode(null);
      }
      // Sync transitions — remove the gap
      if (updated.length > 1) {
        setCarouselTransitions((t) => {
          const copy = [...t];
          const gapIdx = Math.min(removeIdx, copy.length - 1);
          if (gapIdx >= 0) copy.splice(gapIdx, 1);
          return copy.slice(0, updated.length - 1);
        });
      } else {
        setCarouselTransitions([]);
      }
      return updated;
    });
  }

  function handleMediaReorder(fromIndex, toIndex) {
    setMediaFiles((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      // Update legacy preview from first item
      if (updated.length > 0) {
        setImagePreview(updated[0].previewUrl || updated[0].preview);
        setImageFile(updated[0].file);
      }
      return updated;
    });
    // Reorder transitions to match
    setCarouselTransitions((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const [movedT] = copy.splice(Math.min(fromIndex, copy.length - 1), 1);
      copy.splice(Math.min(toIndex, copy.length), 0, movedT);
      return copy;
    });
  }

  // Legacy handler for file input
  function handleImageUpload(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleMediaAdd(Array.from(files));
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!validateStep()) return;
    setLoading(true);

    try {
      // derive maxPlusOnesPerGuest
      const parsedMaxPlus =
        allowPlusOnes && maxPlusOnesPerGuest
          ? Math.max(1, Math.min(5, parseInt(maxPlusOnesPerGuest, 10) || 1))
          : 0;

      // Calculate capacities
      const cocktailCapacity = maxAttendees ? Number(maxAttendees) : null;

      // Calculate food capacity and slot metadata based on per-slot configuration
      let foodCapacity = null;
      let backendDinnerMaxSeatsPerSlot = null;
      let dinnerSlotsIso = [];
      let dinnerStartTimeIso = null;
      let dinnerEndTimeIso = null;

      if (dinnerEnabled && startsAt && dinnerSlotsConfig.length > 0) {
        const eventLocalStart = isoToLocalDateTime(startsAt);
        const [eventDatePart] = (eventLocalStart || "").split("T");

        const slotLocalDateTimes =
          eventDatePart && dinnerSlotsConfig.length > 0
            ? dinnerSlotsConfig
                .map((slot) => slot?.time)
                .filter(Boolean)
                .map((time) => `${eventDatePart}T${time}`)
            : [];

        const slotsWithIso = slotLocalDateTimes
          .map((local, index) => {
            const iso = localDateTimeToIso(local);
            if (!iso) return null;
            const baseConfig = dinnerSlotsConfig[index] || {};
            const capacity =
              Number(baseConfig.maxSeats || dinnerMaxSeatsPerSlot || 0) || 0;
            const maxGuestsPerBooking =
              Number(
                baseConfig.maxGuestsPerBooking ||
                  dinnerMaxGuestsPerBooking ||
                  0,
              ) || null;
            return {
              time: iso,
              capacity: capacity > 0 ? capacity : null,
              maxGuestsPerBooking,
            };
          })
          .filter(Boolean);

        dinnerSlotsIso = slotsWithIso.map((slot) => slot.time);

        if (dinnerSlotsIso.length > 0) {
          const sorted = [...dinnerSlotsIso].sort(
            (a, b) => new Date(a) - new Date(b),
          );
          dinnerStartTimeIso = sorted[0];
          dinnerEndTimeIso = sorted[sorted.length - 1];
        }

        // Seats per slot
        let totalSeats = 0;
        let minSeats = null;

        slotsWithIso.forEach((slot) => {
          if (slot.capacity && slot.capacity > 0) {
            totalSeats += slot.capacity;
            if (minSeats === null || slot.capacity < minSeats) {
              minSeats = slot.capacity;
            }
          }
        });

        if (totalSeats > 0) {
          foodCapacity = totalSeats;
        }
        if (minSeats !== null) {
          backendDinnerMaxSeatsPerSlot = minSeats;
        }
      }

      // Calculate total capacity
      // If either capacity is null (unlimited), total is also null (unlimited)
      // Otherwise, sum the capacities
      let totalCapacity = null;
      if (cocktailCapacity !== null || foodCapacity !== null) {
        totalCapacity = (cocktailCapacity || 0) + (foodCapacity || 0);
      }

      const requestBody = {
        title,
        titleSettings: { visible: titleVisible, align: titleAlign, font: titleFont, size: titleSize, color: titleColor, detailsColor, detailsGradient, detailsGradientEnabled },
        description,
        sections: sections.filter(s => {
          if (s.type === "title" || s.type === "location" || s.type === "datetime") return true;
          if (s.type === "socials") return s.instagram || s.spotify || s.tiktok || s.soundcloud;
          if (s.type === "spotify" || s.type === "applemusic" || s.type === "soundcloud" || s.type === "youtube") return (s.url || "").trim();
          return (s.title || "").trim() || (s.text || "").trim();
        }),
        instagram: sections.find(s => s.type === "socials")?.instagram || "",
        spotify: sections.find(s => s.type === "socials")?.spotify || "",
        tiktok: sections.find(s => s.type === "socials")?.tiktok || "",
        soundcloud: sections.find(s => s.type === "socials")?.soundcloud || "",
        location,
        locationLat: locationLat || null,
        locationLng: locationLng || null,
        hideLocation,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        timezone,
        maxAttendees: maxAttendees ? Number(maxAttendees) : null,
        cocktailCapacity,
        foodCapacity,
        totalCapacity,
        waitlistEnabled,
        theme,
        calendar,
        visibility,
        ticketType: sellTicketsEnabled ? "paid" : "free",
        ticketPrice:
          sellTicketsEnabled && ticketPrice
            ? Math.round(parseFloat(ticketPrice) * 100)
            : null, // Convert to cents
        ticketCurrency: sellTicketsEnabled ? ticketCurrency : null,
        // Stripe product and price will be auto-created by backend
        // NEW
        maxPlusOnesPerGuest: parsedMaxPlus,
        dinnerEnabled,
        dinnerStartTime: dinnerEnabled ? dinnerStartTimeIso : null,
        dinnerEndTime: dinnerEnabled ? dinnerEndTimeIso : null,
        dinnerSeatingIntervalHours: dinnerEnabled
          ? Number(dinnerSeatingIntervalHours) || 2
          : 2,
        dinnerMaxSeatsPerSlot:
          dinnerEnabled && backendDinnerMaxSeatsPerSlot != null
            ? backendDinnerMaxSeatsPerSlot
            : dinnerEnabled && dinnerMaxSeatsPerSlot
              ? Number(dinnerMaxSeatsPerSlot)
              : null,
        dinnerOverflowAction: dinnerEnabled ? dinnerOverflowAction : "waitlist",
        dinnerBookingEmail: dinnerEnabled && dinnerBookingEmail ? dinnerBookingEmail.trim() : null,
        hideDinnerRemaining: hideDinnerRemaining || false,
        // Explicit per-slot configuration for backend & analytics
        dinnerSlots:
          dinnerEnabled && dinnerSlotsIso.length > 0
            ? dinnerSlotsIso.map((timeIso, index) => {
                const baseConfig = dinnerSlotsConfig[index] || {};
                const capacity =
                  Number(baseConfig.maxSeats || dinnerMaxSeatsPerSlot || 0) ||
                  null;
                const maxGuestsPerBooking =
                  Number(
                    baseConfig.maxGuestsPerBooking ||
                      dinnerMaxGuestsPerBooking ||
                      0,
                  ) || null;
                return {
                  time: timeIso,
                  capacity,
                  maxGuestsPerBooking,
                };
              })
            : null,

        // Deliberate Planner flow: create as DRAFT
        ...(isEditMode ? {} : { createdVia: "create", status: "PUBLISHED" }),
        instagram: instagram || null,
        spotify: spotify || null,
        tiktok: tiktok || null,
        soundcloud: soundcloud || null,
        mediaSettings: mediaMode === "video"
          ? { mode: "video", loop: videoLoop, autoplay: videoAutoplay, audio: videoAudio }
          : mediaMode === "images" && mediaFiles.length > 1
            ? { mode: "carousel", autoscroll: carouselAutoscroll, interval: carouselInterval, loop: carouselLoop, transitions: carouselTransitions }
            : {},
      };

      if (isEditMode) {
        // --- EDIT MODE: PUT to update ---
        const res = await authenticatedFetch(`/host/events/${editEventId}`, {
          method: "PUT",
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update event");
        }

        const updated = await res.json();

        // Upload any NEW media items (ones without serverId)
        const newMedia = mediaFiles.filter((m) => !m.serverId && m.file);
        if (newMedia.length > 0) {
          try {
            for (let i = 0; i < newMedia.length; i++) {
              const position = mediaFiles.indexOf(newMedia[i]);
              await uploadEventMedia(editEventId, newMedia[i].file, position);
            }
          } catch (mediaError) {
            console.error("Error uploading new media:", mediaError);
            showToast("Event saved, but some media failed to upload", "warning");
          }
        }

        // Reorder all media to match current order (server items use their position in the full array)
        const serverItems = mediaFiles.filter((m) => m.serverId);
        if (serverItems.length > 1) {
          try {
            await reorderEventMedia(
              editEventId,
              serverItems.map((m) => ({ id: m.serverId, position: mediaFiles.indexOf(m) }))
            );
          } catch (err) {
            console.error("Error reordering media:", err);
          }
        }

        // Upload custom thumbnail if provided
        if (customThumbnail?.file) {
          try {
            await uploadEventImage(editEventId, customThumbnail.file);
          } catch (err) {
            console.error("Error uploading custom thumbnail:", err);
          }
        }

        showToast("Event updated successfully!", "success");
        navigate(`/app/events/${editEventId}/guests`);
      } else {
        // --- CREATE MODE: POST new event ---
        const res = await authenticatedFetch("/events", {
          method: "POST",
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to create event");
        }

        const created = await res.json();

        // Upload all media items
        let finalEvent = created;
        if (mediaFiles.length > 0) {
          try {
            for (let i = 0; i < mediaFiles.length; i++) {
              await uploadEventMedia(created.id, mediaFiles[i].file, i);
            }
            // Fetch updated event with media URLs
            const updatedRes = await authenticatedFetch(`/host/events/${created.id}`);
            if (updatedRes.ok) {
              finalEvent = await updatedRes.json();
            }
          } catch (mediaError) {
            console.error("Error uploading media:", mediaError);
            showToast("Event created, but some media failed to upload", "warning");
          }
        } else if (imageFile) {
          // Fallback for legacy single image
          try {
            finalEvent = await uploadEventImage(created.id, imageFile);
          } catch (imageError) {
            console.error("Error uploading image:", imageError);
            showToast("Event created, but image upload failed", "warning");
          }
        }

        // Upload custom thumbnail if provided (overrides auto-generated one)
        if (customThumbnail?.file) {
          try {
            finalEvent = await uploadEventImage(created.id, customThumbnail.file);
          } catch (err) {
            console.error("Error uploading custom thumbnail:", err);
          }
        }

        clearDraft();
        showToast("Event created successfully!", "success");
        navigate(`/events/${finalEvent.slug}/success`, {
          state: { event: finalEvent },
        });
      }
    } catch (err) {
      if (isNetworkError(err)) {
        handleNetworkError(err, showToast);
      } else {
        // Generic fallback (we don't have a Response object here)
        console.error(err);
        showToast(
          err?.message || "Failed to create event. Please try again.",
          "error",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const tzInfo = formatTimezone(timezone);

  if (!profileChecked) return null;

  if (editLoading) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#05040a",
        color: "rgba(255,255,255,0.5)",
        fontSize: "14px",
      }}>
        Loading event...
      </div>
    );
  }

  return (
    <div
      className="page-with-header create-event-page"
      style={{
        height: "100vh",
        height: "100dvh",
        position: "relative",
        background:
          "radial-gradient(circle at 20% 50%, rgba(192, 192, 192, 0.12) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 232, 232, 0.12) 0%, transparent 50%), #05040a",
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
              "radial-gradient(circle, rgba(192, 192, 192, 0.15) 0%, transparent 70%)",
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
              "radial-gradient(circle, rgba(232, 232, 232, 0.15) 0%, transparent 70%)",
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
            "radial-gradient(circle, rgba(192, 192, 192, 0.1) 0%, transparent 70%)",
          left: mousePosition.x - 300,
          top: mousePosition.y - 300,
          pointerEvents: "none",
          transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: 1,
        }}
      />

      <style>{`
        @keyframes goldFlash {
          0% { border-color: #d4a012; box-shadow: 0 0 12px rgba(212, 160, 18, 0.4); }
          50% { border-color: #f0c040; box-shadow: 0 0 20px rgba(240, 192, 64, 0.3); }
          100% { border-color: rgba(255,255,255,0.1); box-shadow: none; }
        }
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(1.1); }
        }
        @keyframes stepSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes stepSlideInReverse {
          from { opacity: 0; transform: translateX(-24px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div
        className="create-event-layout"
        style={{
          position: "relative",
          zIndex: 2,
          opacity: isMounted ? 1 : 0,
          transition: "opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          height: "calc(100vh - 56px)",
          height: "calc(100dvh - 56px)",
        }}
      >
        <form onSubmit={handleCreate} style={{ height: "100%" }}>
          <div
            className="create-event-grid"
            style={{
              display: "flex",
              height: "100%",
            }}
          >
          {/* LEFT SIDE: Form sidebar */}
          <div
            ref={sidebarRef}
            className="create-event-sidebar"
            style={{
              width: "440px",
              minWidth: "440px",
              height: "100%",
              overflowY: "auto",
              overflowX: "hidden",
              padding: "0",
              boxSizing: "border-box",
              borderRight: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(12, 10, 18, 0.4)",
              display: mobileView === "preview" ? "none" : "flex",
              flexDirection: "column",
            }}
          >
            {/* Tab bar */}
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 10,
                background: "rgba(12, 10, 18, 0.95)",
                backdropFilter: "blur(12px)",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", position: "relative" }}>
                {[
                  { num: 1, label: "Media" },
                  { num: 2, label: "Details" },
                  { num: 3, label: "Settings" },
                  { num: 5, label: "Tickets" },
                ].map((tab) => (
                  <button
                    key={tab.num}
                    type="button"
                    onClick={() => goToStep(tab.num)}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: "14px 0",
                      background: "none",
                      border: "none",
                      cursor: loading ? "not-allowed" : "pointer",
                      WebkitTapHighlightColor: "transparent",
                      fontSize: "10.5px",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: currentStep === tab.num ? "#fff" : "rgba(255,255,255,0.3)",
                      transition: "color 0.2s ease",
                      whiteSpace: "nowrap",
                      position: "relative",
                    }}
                  >
                    {tab.label}
                    {hasAttemptedPublish && tabHasMissing[tab.num] && (
                      <span style={{
                        position: "absolute",
                        top: "8px",
                        right: "4px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#ef4444",
                      }} />
                    )}
                  </button>
                ))}
                {/* Sliding underline indicator */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: `${((currentStep - 1) / 5) * 100}%`,
                    width: `${100 / 5}%`,
                    height: "1.5px",
                    background: "rgba(255,255,255,0.9)",
                    transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                />
                {/* Bottom border behind the indicator */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "1px",
                    background: "rgba(255,255,255,0.06)",
                  }}
                />
              </div>
            </div>

            {/* Step content */}
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "24px" }}>
            <div
              key={`step-anim-${currentStep}`}
              style={{
                animation: `${stepDirection === "forward" ? "stepSlideIn" : "stepSlideInReverse"} 0.25s ease`,
              }}
            >

            {/* === STEP 1: THE VIBE === */}
            <div
              style={{
                display: currentStep === 1 ? "block" : "none",
              }}
            >
            {/* Media upload area */}
            <div style={{
              marginBottom: "24px",
              borderRadius: "14px",
              border: hasAttemptedPublish && missingFields.media
                ? "2px solid rgba(239, 68, 68, 0.5)"
                : "2px solid transparent",
              ...(goldFlash.media ? { animation: "goldFlash 1.2s ease forwards" } : {}),
              transition: "border-color 0.3s ease",
              padding: hasAttemptedPublish && missingFields.media ? "12px" : "0",
            }}>
              {/* Media type selector */}
              {mediaFiles.length === 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "8px",
                    marginBottom: "12px",
                  }}
                >
                  {[
                    { id: "image", icon: ImageIcon, label: "Image", desc: "Single cover" },
                    { id: "carousel", icon: Layers, label: "Carousel", desc: "Multiple images" },
                    { id: "video", icon: Film, label: "Video", desc: "Single video" },
                  ].map((opt) => {
                    const active = mediaIntent === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setMediaIntent(opt.id);
                          setMediaMode(opt.id === "video" ? "video" : "images");
                        }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "6px",
                          padding: "14px 8px",
                          borderRadius: "10px",
                          border: active
                            ? "1px solid rgba(255,255,255,0.35)"
                            : "1px solid rgba(255,255,255,0.06)",
                          background: active
                            ? "rgba(255,255,255,0.08)"
                            : "transparent",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          WebkitTapHighlightColor: "transparent",
                        }}
                      >
                        <opt.icon
                          size={20}
                          style={{
                            color: active ? "#fff" : "rgba(255,255,255,0.4)",
                            transition: "color 0.15s ease",
                          }}
                        />
                        <span style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: active ? "#fff" : "rgba(255,255,255,0.5)",
                          letterSpacing: "0.02em",
                          transition: "color 0.15s ease",
                        }}>
                          {opt.label}
                        </span>
                        <span style={{
                          fontSize: "9.5px",
                          color: active ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)",
                          transition: "color 0.15s ease",
                        }}>
                          {opt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Main drop zone / first item preview */}
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16/9",
                  borderRadius: "16px",
                  overflow: "hidden",
                  background: isDragging
                    ? "rgba(192, 192, 192, 0.2)"
                    : mediaFiles.length > 0
                      ? "transparent"
                      : "rgba(20, 16, 30, 0.3)",
                  border: isDragging
                    ? "2px dashed rgba(192, 192, 192, 0.5)"
                    : mediaFiles.length > 0
                      ? "1px solid rgba(255,255,255,0.1)"
                      : "1px solid rgba(255,255,255,0.06)",
                  position: "relative",
                  cursor: mediaFiles.length === 0 ? "pointer" : "default",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  transform: isDragging ? "scale(1.02)" : "scale(1)",
                }}
                onClick={() => mediaFiles.length === 0 && fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {mediaFiles.length > 0 ? (
                  <>
                    {mediaFiles[0].mediaType === "video" ? (
                      <VideoPlayer
                        src={mediaFiles[0].previewUrl}
                        autoPlay={videoAutoplay}
                        muted={!videoAudio}
                        loop={videoLoop}
                      />
                    ) : (
                      <img
                        src={mediaFiles[0].preview}
                        alt="Cover"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    )}
                    {/* Cover badge */}
                    <div
                      style={{
                        position: "absolute",
                        top: "10px",
                        left: "10px",
                        background: "rgba(0,0,0,0.7)",
                        backdropFilter: "blur(10px)",
                        borderRadius: "6px",
                        padding: "4px 8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.9)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        pointerEvents: "none",
                      }}
                    >
                      <Star size={10} fill="currentColor" /> COVER
                    </div>
                    {/* Media type badge */}
                    <div
                      style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        background: "rgba(0,0,0,0.7)",
                        backdropFilter: "blur(10px)",
                        borderRadius: "6px",
                        padding: "4px 8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.9)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        pointerEvents: "none",
                      }}
                    >
                      {mediaMode === "video" ? (
                        <><Film size={10} /> VIDEO</>
                      ) : mediaFiles.length > 1 ? (
                        <><ImageIcon size={10} /> {mediaFiles.length} IMAGES</>
                      ) : (
                        <><ImageIcon size={10} /> IMAGE</>
                      )}
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
                        "linear-gradient(135deg, rgba(192, 192, 192, 0.12) 0%, rgba(232, 232, 232, 0.12) 100%)",
                      color: "#fff",
                    }}
                  >
                    <div style={{ fontSize: "56px", opacity: 0.9 }}>
                      <SilverIcon as={ImageIcon} size={20} />
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
                        ? "Drop files here"
                        : mediaIntent
                          ? "Click or drag to upload"
                          : "Select a type above, or drag files here"}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        opacity: 0.6,
                        textAlign: "center",
                        padding: "0 16px",
                      }}
                    >
                      {mediaIntent === "video"
                        ? "MP4, MOV, or WebM"
                        : mediaIntent === "carousel"
                          ? "JPG, PNG, GIF — up to 10 images"
                          : mediaIntent === "image"
                            ? "JPG, PNG, or GIF"
                            : "Image, carousel, or video"}
                    </div>
                  </div>
                )}
              </div>

              {/* Thumbnail strip */}
              {mediaFiles.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    marginTop: "10px",
                    overflowX: "auto",
                    paddingBottom: "4px",
                    alignItems: "center",
                  }}
                >
                  {mediaFiles.flatMap((item, index) => {
                    const transitionTypes = ["slide", "fade", "zoom", "pixelate"];
                    const transitionIcons = { slide: ArrowRight, fade: Blend, zoom: ZoomIn, pixelate: Grid3X3 };
                    const transitionLabels = { slide: "Slide", fade: "Fade", zoom: "Zoom", pixelate: "Pixel" };

                    const thumb = (
                    <div
                      key={item.id}
                      draggable={mediaMode === "images"}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", index.toString());
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
                        if (!isNaN(fromIndex) && fromIndex !== index) {
                          handleMediaReorder(fromIndex, index);
                        }
                      }}
                      style={{
                        position: "relative",
                        width: "64px",
                        height: "64px",
                        borderRadius: "10px",
                        overflow: "hidden",
                        flexShrink: 0,
                        border: index === 0
                          ? "2px solid rgba(255,255,255,0.4)"
                          : "1px solid rgba(255,255,255,0.1)",
                        cursor: mediaMode === "images" ? "grab" : "default",
                      }}
                    >
                      {item.mediaType === "video" ? (
                        item.preview ? (
                          <img src={item.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(20, 16, 30, 0.5)" }}>
                            <Film size={18} color="rgba(255,255,255,0.5)" />
                          </div>
                        )
                      ) : (
                        <img src={item.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                      {/* Position number */}
                      {mediaMode === "images" && mediaFiles.length > 1 && (
                        <div style={{
                          position: "absolute",
                          bottom: "3px",
                          left: "3px",
                          background: "rgba(0,0,0,0.75)",
                          borderRadius: "4px",
                          padding: "1px 4px",
                          fontSize: "9px",
                          fontWeight: 700,
                          color: "#fff",
                        }}>
                          {index + 1}
                        </div>
                      )}
                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleMediaRemove(item.id); }}
                        style={{
                          position: "absolute",
                          top: "3px",
                          right: "3px",
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          background: "rgba(0,0,0,0.75)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid rgba(255,255,255,0.15)",
                          cursor: "pointer",
                          padding: 0,
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.9)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.75)"; }}
                      >
                        <X size={10} color="#fff" />
                      </button>
                    </div>
                    );

                    // Transition indicator between this thumb and the next
                    if (index < mediaFiles.length - 1 && mediaMode === "images") {
                      const tType = carouselTransitions[index] || "slide";
                      const TIcon = transitionIcons[tType];
                      const indicator = (
                        <button
                          key={`tr-${index}`}
                          type="button"
                          title={transitionLabels[tType]}
                          onClick={() => {
                            setCarouselTransitions((prev) => {
                              const copy = [...prev];
                              while (copy.length <= index) copy.push("slide");
                              const curIdx = transitionTypes.indexOf(copy[index] || "slide");
                              copy[index] = transitionTypes[(curIdx + 1) % transitionTypes.length];
                              return copy;
                            });
                          }}
                          style={{
                            flexShrink: 0,
                            width: "28px",
                            height: "28px",
                            borderRadius: "6px",
                            border: "1px solid rgba(255,255,255,0.1)",
                            background: "rgba(255,255,255,0.04)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            padding: 0,
                            transition: "all 0.15s ease",
                            WebkitTapHighlightColor: "transparent",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                          }}
                        >
                          <TIcon size={12} color="rgba(255,255,255,0.5)" />
                        </button>
                      );
                      return [thumb, indicator];
                    }
                    return [thumb];
                  })}

                  {/* Add more — only for images mode */}
                  {mediaMode === "images" && mediaFiles.length < 10 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "10px",
                        border: "1px dashed rgba(255,255,255,0.15)",
                        background: "rgba(20, 16, 30, 0.3)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "2px",
                        cursor: "pointer",
                        flexShrink: 0,
                        transition: "all 0.2s ease",
                        color: "rgba(255,255,255,0.5)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
                        e.currentTarget.style.background = "rgba(20, 16, 30, 0.5)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                        e.currentTarget.style.background = "rgba(20, 16, 30, 0.3)";
                      }}
                    >
                      <Plus size={16} />
                      <span style={{ fontSize: "8px", fontWeight: 600 }}>ADD</span>
                    </button>
                  )}
                </div>
              )}

              {/* Media settings — show based on intent (before upload) or actual mode (after upload) */}
              {(mediaFiles.length > 0 || mediaIntent === "carousel" || mediaIntent === "video") && (
                <div
                  style={{
                    marginTop: "14px",
                    padding: "14px 16px",
                    borderRadius: "12px",
                    background: "rgba(20, 16, 30, 0.3)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.45)",
                    marginBottom: "12px",
                  }}>
                    {(mediaMode === "video" || (mediaFiles.length === 0 && mediaIntent === "video"))
                      ? "Video Settings"
                      : (mediaFiles.length > 1 || (mediaFiles.length === 0 && mediaIntent === "carousel"))
                        ? "Carousel Settings"
                        : "Media Settings"}
                  </div>

                  {(mediaMode === "video" || (mediaFiles.length === 0 && mediaIntent === "video")) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {/* Loop */}
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>Loop</span>
                        <div
                          onClick={() => setVideoLoop(!videoLoop)}
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: videoLoop ? "rgba(192, 192, 192, 0.5)" : "rgba(255,255,255,0.1)",
                            position: "relative",
                            cursor: "pointer",
                            transition: "background 0.2s ease",
                          }}
                        >
                          <div style={{
                            position: "absolute",
                            top: "2px",
                            left: videoLoop ? "18px" : "2px",
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            background: videoLoop ? "#fff" : "rgba(255,255,255,0.4)",
                            transition: "all 0.2s ease",
                          }} />
                        </div>
                      </label>
                      {/* Autoplay */}
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>Autoplay</span>
                        <div
                          onClick={() => setVideoAutoplay(!videoAutoplay)}
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: videoAutoplay ? "rgba(192, 192, 192, 0.5)" : "rgba(255,255,255,0.1)",
                            position: "relative",
                            cursor: "pointer",
                            transition: "background 0.2s ease",
                          }}
                        >
                          <div style={{
                            position: "absolute",
                            top: "2px",
                            left: videoAutoplay ? "18px" : "2px",
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            background: videoAutoplay ? "#fff" : "rgba(255,255,255,0.4)",
                            transition: "all 0.2s ease",
                          }} />
                        </div>
                      </label>
                      {/* Audio */}
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>Audio</span>
                        <div
                          onClick={() => setVideoAudio(!videoAudio)}
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: videoAudio ? "rgba(192, 192, 192, 0.5)" : "rgba(255,255,255,0.1)",
                            position: "relative",
                            cursor: "pointer",
                            transition: "background 0.2s ease",
                          }}
                        >
                          <div style={{
                            position: "absolute",
                            top: "2px",
                            left: videoAudio ? "18px" : "2px",
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            background: videoAudio ? "#fff" : "rgba(255,255,255,0.4)",
                            transition: "all 0.2s ease",
                          }} />
                        </div>
                      </label>

                      {/* Thumbnail */}
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.05)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>Thumbnail</span>
                          {(customThumbnail?.preview || mediaFiles[0]?.preview) && (
                            <div style={{
                              width: "40px", height: "28px", borderRadius: "4px",
                              overflow: "hidden", background: "rgba(0,0,0,0.3)",
                              border: "1px solid rgba(255,255,255,0.1)",
                            }}>
                              <img
                                src={customThumbnail?.preview || mediaFiles[0]?.preview}
                                alt="Thumbnail"
                                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                              />
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          {customThumbnail && (
                            <button
                              type="button"
                              onClick={() => setCustomThumbnail(null)}
                              style={{
                                padding: "4px 8px", borderRadius: "6px", border: "none",
                                background: "rgba(255,100,100,0.1)", color: "rgba(255,100,100,0.7)",
                                fontSize: "11px", cursor: "pointer",
                              }}
                            >
                              Reset
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => thumbnailInputRef.current?.click()}
                            style={{
                              padding: "4px 10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)",
                              background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)",
                              fontSize: "11px", cursor: "pointer",
                            }}
                          >
                            {customThumbnail ? "Change" : "Replace"}
                          </button>
                        </div>
                        <input
                          ref={thumbnailInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setCustomThumbnail({ file, preview: URL.createObjectURL(file) });
                            }
                            e.target.value = "";
                          }}
                        />
                      </div>
                      <div style={{ fontSize: "11px", opacity: 0.35, marginTop: "4px" }}>
                        Used in dashboard, emails, and link previews
                      </div>
                    </div>
                  )}

                  {((mediaMode === "images" && mediaFiles.length > 1) || (mediaFiles.length === 0 && mediaIntent === "carousel")) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {/* Autoscroll */}
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>Autoscroll</span>
                        <div
                          onClick={() => setCarouselAutoscroll(!carouselAutoscroll)}
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: carouselAutoscroll ? "rgba(192, 192, 192, 0.5)" : "rgba(255,255,255,0.1)",
                            position: "relative",
                            cursor: "pointer",
                            transition: "background 0.2s ease",
                          }}
                        >
                          <div style={{
                            position: "absolute",
                            top: "2px",
                            left: carouselAutoscroll ? "18px" : "2px",
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            background: carouselAutoscroll ? "#fff" : "rgba(255,255,255,0.4)",
                            transition: "all 0.2s ease",
                          }} />
                        </div>
                      </label>
                      {/* Interval slider — only shown when autoscroll is on */}
                      <style>{`
                        .interval-slider::-webkit-slider-thumb {
                          -webkit-appearance: none;
                          appearance: none;
                          width: 16px;
                          height: 16px;
                          border-radius: 50%;
                          background: #fff;
                          cursor: pointer;
                          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
                        }
                        .interval-slider::-moz-range-thumb {
                          width: 16px;
                          height: 16px;
                          border-radius: 50%;
                          background: #fff;
                          cursor: pointer;
                          border: none;
                          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
                        }
                      `}</style>
                      {carouselAutoscroll && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>Interval</span>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.6)", fontVariantNumeric: "tabular-nums" }}>
                              {carouselInterval < 1 ? `${Math.round(carouselInterval * 1000)}ms` : `${carouselInterval.toFixed(1)}s`}
                            </span>
                          </div>
                          <div style={{ position: "relative", height: "20px", display: "flex", alignItems: "center" }}>
                            <input
                              type="range"
                              min="0.2"
                              max="8"
                              step="0.1"
                              value={carouselInterval}
                              onChange={(e) => setCarouselInterval(parseFloat(e.target.value))}
                              className="interval-slider"
                              style={{
                                width: "100%",
                                height: "4px",
                                WebkitAppearance: "none",
                                appearance: "none",
                                background: `linear-gradient(to right, rgba(255,255,255,0.5) ${((carouselInterval - 0.2) / 7.8) * 100}%, rgba(255,255,255,0.1) ${((carouselInterval - 0.2) / 7.8) * 100}%)`,
                                borderRadius: "2px",
                                outline: "none",
                                cursor: "pointer",
                              }}
                            />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                            <span>FAST</span>
                            <span>SLOW</span>
                          </div>
                        </div>
                      )}
                      {/* Loop mode — only shown when autoscroll is on */}
                      {carouselAutoscroll && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>
                              {carouselLoop ? "Loop" : "Bounce"}
                            </span>
                            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>
                              {carouselLoop ? "Infinite scroll forward" : "Reverses at each end"}
                            </span>
                          </div>
                          <div
                            onClick={() => setCarouselLoop(!carouselLoop)}
                            style={{
                              width: "36px",
                              height: "20px",
                              borderRadius: "10px",
                              background: carouselLoop ? "rgba(192, 192, 192, 0.5)" : "rgba(255,255,255,0.1)",
                              position: "relative",
                              cursor: "pointer",
                              transition: "background 0.2s ease",
                              flexShrink: 0,
                            }}
                          >
                            <div style={{
                              position: "absolute",
                              top: "2px",
                              left: carouselLoop ? "18px" : "2px",
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              background: carouselLoop ? "#fff" : "rgba(255,255,255,0.4)",
                              transition: "all 0.2s ease",
                            }} />
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: "11px", opacity: 0.35, paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        First image is used as thumbnail in dashboard, emails, and link previews
                      </div>
                    </div>
                  )}

                  {/* Single image — just a note */}
                  {mediaMode === "images" && mediaFiles.length === 1 && (
                    <div style={{ fontSize: "11px", opacity: 0.35 }}>
                      This image is used as thumbnail in dashboard, emails, and link previews. Add more to create a carousel.
                    </div>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={mediaMode === "video" ? "video/mp4,video/quicktime,video/webm" : mediaMode === "images" ? "image/*" : "image/*,video/mp4,video/quicktime,video/webm"}
                multiple={mediaIntent === "carousel"}
                onChange={(e) => {
                  handleMediaAdd(Array.from(e.target.files));
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </div>
            </div>

            {/* === STEP 2: DETAILS === */}
            <div
              style={{
                display: currentStep === 2 ? "block" : "none",
              }}
            >

            {/* PULLUP · EVENT label - matching EventCard */}
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                opacity: 0.7,
                letterSpacing: "0.15em",
                fontWeight: 600,
                marginBottom: "16px",
              }}
            >
              {isEditMode ? "PULLUP · EDIT EVENT" : "PULLUP · CREATE EVENT"}
            </div>

            {/* Draft restored banner */}
            {showDraftBanner && !isEditMode && (
              <div
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  background: "rgba(99, 102, 241, 0.1)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "8px",
                }}
              >
                <span style={{ fontSize: "13px", opacity: 0.8 }}>
                  Draft restored from your last session
                </span>
                <button
                  type="button"
                  onClick={discardDraft}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "transparent",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "rgba(255,255,255,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "transparent";
                  }}
                >
                  Discard
                </button>
              </div>
            )}



            {/* OLD Location and Date/Time — REMOVED, now in sections builder */}
            {false && <div><div>
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
                        ? "1px solid rgba(192, 192, 192, 0.4)"
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
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    onLocationSelect={async (locationData) => {
                      setLocation(locationData.address);
                      setLocationLat(locationData.lat);
                      setLocationLng(locationData.lng);

                      const tz = await fetchTimezoneForLocation(
                        locationData.lat,
                        locationData.lng,
                      );
                      if (tz) {
                        setTimezone(tz);
                      }
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
                    placeholder="Where's the event?"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Start Date & Time */}
              <div style={{
                marginBottom: "8px",
                borderRadius: "14px",
                border: hasAttemptedPublish && missingFields.startsAt
                  ? "2px solid rgba(239, 68, 68, 0.5)"
                  : "2px solid transparent",
                ...(goldFlash.startsAt ? { animation: "goldFlash 1.2s ease forwards" } : {}),
                transition: "border-color 0.3s ease",
              }}>
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
                    value={isoToLocalDateTime(startsAt)}
                    onChange={(e) => {
                      const localValue = e.target.value;
                      if (localValue) {
                        // Update event start
                        setStartsAt(localDateTimeToIso(localValue));

                        // Keep dinner slot date in sync with event date
                        const [eventDatePart] = localValue.split("T");
                        if (eventDatePart) {
                          if (dinnerStartTime) {
                            const [, timePart] = dinnerStartTime.split("T");
                            if (timePart) {
                              setDinnerStartTime(
                                `${eventDatePart}T${timePart}`,
                              );
                            }
                          }
                          if (dinnerEndTime) {
                            const [, timePart] = dinnerEndTime.split("T");
                            if (timePart) {
                              setDinnerEndTime(`${eventDatePart}T${timePart}`);
                            }
                          }
                        }
                      }
                    }}
                    onFocus={() => setFocusedField("startDateTime")}
                    onBlur={() => setFocusedField(null)}
                    style={{
                      ...(focusedField === "startDateTime"
                        ? {
                            ...focusedInputStyle,
                            border: "1px solid rgba(192, 192, 192, 0.4)",
                            background: "rgba(255,255,255,0.05)",
                          }
                        : {
                            ...inputStyle,
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.08)",
                          }),
                      fontSize: "16px",
                      padding: "16px 18px 16px 48px",
                      paddingRight: startsAt ? "120px" : "18px",
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
                    <SilverIcon as={Clock} size={18} />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      left: "48px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: startsAt ? "#fff" : "rgba(255,255,255,0.5)",
                      fontSize: "15px",
                      zIndex: 3,
                    }}
                  >
                    {startsAt
                      ? formatReadableDateTime(new Date(startsAt), timezone)
                      : "Event start"}
                  </div>
                  {startsAt && (
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
                      {formatRelativeTime(new Date(startsAt))}
                    </div>
                  )}
                </div>
              </div>

              {/* End Date & Time */}
              <div style={{ marginBottom: "0" }}>
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
                    value={isoToLocalDateTime(endsAt)}
                    onChange={(e) => {
                      if (e.target.value) {
                        setEndsAt(localDateTimeToIso(e.target.value));
                      } else {
                        setEndsAt("");
                      }
                    }}
                    onFocus={() => setFocusedField("endDateTime")}
                    onBlur={() => setFocusedField(null)}
                    min={isoToLocalDateTime(startsAt) || undefined}
                    style={{
                      ...(focusedField === "endDateTime"
                        ? {
                            ...focusedInputStyle,
                            border: "1px solid rgba(192, 192, 192, 0.4)",
                            background: "rgba(255,255,255,0.05)",
                          }
                        : {
                            ...inputStyle,
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.08)",
                          }),
                      fontSize: "16px",
                      padding: "16px 18px 16px 48px",
                      paddingRight: endsAt ? "120px" : "18px",
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
                    <SilverIcon as={Clock} size={18} />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      left: "48px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: endsAt ? "#fff" : "rgba(255,255,255,0.5)",
                      fontSize: "15px",
                      zIndex: 3,
                    }}
                  >
                    {endsAt
                      ? formatReadableDateTime(new Date(endsAt), timezone)
                      : "Event end"}
                  </div>
                  {endsAt && (
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
                      {formatRelativeTime(new Date(endsAt))}
                    </div>
                  )}
                </div>
              </div>

            </div>}

            {/* Content sections builder */}
            <div style={{ marginBottom: "16px" }}>
              {sections.map((section, i) => (
                <div key={i}
                  data-section-card
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragIndex === null) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    const dropIdx = e.clientY < midY ? i : i + 1;
                    if (dropIdx !== dragOverIndex) {
                      setDragOverIndex(dropIdx);
                      const targetPreview = dropIdx > dragIndex ? Math.min(dropIdx - 1, sections.length - 1) : dropIdx;
                      setHoveredSection(targetPreview);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex === null || dragOverIndex === null) return;
                    const u = [...sections];
                    const [moved] = u.splice(dragIndex, 1);
                    const insertAt = dragOverIndex > dragIndex ? dragOverIndex - 1 : dragOverIndex;
                    u.splice(insertAt, 0, moved);
                    setSections(u);
                    setHoveredSection(insertAt);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onMouseEnter={() => { if (dragIndex === null) setHoveredSection(i); }}
                  onMouseLeave={() => { if (dragIndex === null) setHoveredSection(null); }}
                  style={{
                    padding: "14px 16px",
                    background: dragIndex === i ? "rgba(163, 230, 53, 0.06)" : "rgba(255,255,255,0.04)",
                    border: hoveredSection === i ? "1px solid rgba(163, 230, 53, 0.5)" : "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    marginBottom: "8px",
                    transition: dragIndex !== null ? "none" : "border-color 0.15s ease",
                    opacity: dragIndex === i ? 0.4 : 1,
                    position: "relative",
                  }}>
                  {/* Drop indicator line */}
                  {dragIndex !== null && dragOverIndex === i && dragIndex !== i && dragIndex !== i - 1 && (
                    <div style={{
                      position: "absolute",
                      top: "-5px",
                      left: "8px",
                      right: "8px",
                      height: "2px",
                      background: "#a3e635",
                      borderRadius: "1px",
                    }} />
                  )}
                  {dragIndex !== null && dragOverIndex === i + 1 && dragIndex !== i && dragIndex !== i + 1 && (
                    <div style={{
                      position: "absolute",
                      bottom: "-5px",
                      left: "8px",
                      right: "8px",
                      height: "2px",
                      background: "#a3e635",
                      borderRadius: "1px",
                    }} />
                  )}
                  {/* Section header: drag handle + type label + delete */}
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(i);
                      setHoveredSection(i);
                      e.dataTransfer.effectAllowed = "move";
                      // Use the whole card as drag image
                      const card = e.currentTarget.closest("[data-section-card]");
                      if (card) e.dataTransfer.setDragImage(card, card.offsetWidth / 2, 20);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                      setHoveredSection(null);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: section.type === "title" || section.type === "location" || section.type === "datetime" ? "0" : "10px", cursor: "grab" }}
                  >
                    {/* Up/down reorder */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", flexShrink: 0 }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button type="button" draggable={false} disabled={i === 0} onClick={() => {
                        const u = [...sections]; [u[i-1], u[i]] = [u[i], u[i-1]]; setSections(u);
                        setHoveredSection(i - 1);
                      }} style={{ background: "none", border: "none", color: i === 0 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.4)", cursor: i === 0 ? "default" : "pointer", padding: 0, fontSize: "12px", lineHeight: 1 }}>&#9650;</button>
                      <button type="button" draggable={false} disabled={i === sections.length - 1} onClick={() => {
                        const u = [...sections]; [u[i], u[i+1]] = [u[i+1], u[i]]; setSections(u);
                        setHoveredSection(i + 1);
                      }} style={{ background: "none", border: "none", color: i === sections.length - 1 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.4)", cursor: i === sections.length - 1 ? "default" : "pointer", padding: 0, fontSize: "12px", lineHeight: 1 }}>&#9660;</button>
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.25)", flexShrink: 0, userSelect: "none" }}>
                      {({ title: "Title", location: "Location", datetime: "Date & Time", socials: "Social Links", spotify: "Spotify", applemusic: "Apple Music", soundcloud: "SoundCloud", youtube: "YouTube", text: "Text" })[section.type] || "Text"}
                    </span>
                    <div style={{ flex: 1 }} />
                    {section.type !== "title" && section.type !== "location" && section.type !== "datetime" && (
                      <button type="button" draggable={false} onClick={() => setSections(sections.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: "18px", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>
                        &times;
                      </button>
                    )}
                  </div>

                  {section.type === "title" ? (
                    /* Title input */
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Event Name"
                      style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", color: "#fff", fontSize: "18px", fontWeight: 700, outline: "none", padding: 0, fontFamily: "inherit" }}
                    />
                  ) : section.type === "location" ? (
                    /* Location input */
                    <>
                      <LocationAutocomplete
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        onLocationSelect={async (locationData) => {
                          setLocation(locationData.address);
                          setLocationLat(locationData.lat);
                          setLocationLng(locationData.lng);
                          const tz = await fetchTimezoneForLocation(locationData.lat, locationData.lng);
                          if (tz) setTimezone(tz);
                        }}
                        onFocus={() => setFocusedField("location")}
                        onBlur={() => setFocusedField(null)}
                        style={{ flex: 1, background: "transparent", border: "none", color: "#fff", fontSize: "15px", outline: "none", padding: 0, width: "100%", fontFamily: "inherit" }}
                        placeholder="Where's the event?"
                        disabled={loading}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                        <button
                          type="button"
                          onClick={() => setHideLocation(!hideLocation)}
                          style={{
                            width: "36px", height: "20px", borderRadius: "10px", border: "none",
                            background: hideLocation ? "#a3e635" : "rgba(255,255,255,0.15)",
                            position: "relative", cursor: "pointer", transition: "background 0.2s ease", flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: "16px", height: "16px", borderRadius: "50%", background: "#fff",
                            position: "absolute", top: "2px",
                            left: hideLocation ? "18px" : "2px",
                            transition: "left 0.2s ease",
                          }} />
                        </button>
                        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>Reveal later</span>
                      </div>
                    </>
                  ) : section.type === "datetime" ? (
                    /* Date/time inputs */
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div
                        style={{ position: "relative", width: "100%", cursor: "pointer" }}
                        onClick={() => { startDateTimeInputRef.current?.focus(); startDateTimeInputRef.current?.showPicker?.(); }}
                      >
                        <input
                          ref={startDateTimeInputRef}
                          type="datetime-local"
                          value={isoToLocalDateTime(startsAt)}
                          onChange={(e) => {
                            const localValue = e.target.value;
                            if (localValue) {
                              setStartsAt(localDateTimeToIso(localValue));
                              const [eventDatePart] = localValue.split("T");
                              if (eventDatePart) {
                                if (dinnerStartTime) { const [, tp] = dinnerStartTime.split("T"); if (tp) setDinnerStartTime(`${eventDatePart}T${tp}`); }
                                if (dinnerEndTime) { const [, tp] = dinnerEndTime.split("T"); if (tp) setDinnerEndTime(`${eventDatePart}T${tp}`); }
                              }
                            }
                          }}
                          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", zIndex: 1 }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", color: startsAt ? "#fff" : "rgba(255,255,255,0.4)", fontSize: "14px" }}>
                          <SilverIcon as={Clock} size={16} />
                          <span>{startsAt ? formatReadableDateTime(new Date(startsAt), timezone) : "Event start"}</span>
                          {startsAt && <span style={{ marginLeft: "auto", fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>{formatRelativeTime(new Date(startsAt))}</span>}
                        </div>
                      </div>
                      <div
                        style={{ position: "relative", width: "100%", cursor: "pointer" }}
                        onClick={() => { endDateTimeInputRef.current?.focus(); endDateTimeInputRef.current?.showPicker?.(); }}
                      >
                        <input
                          ref={endDateTimeInputRef}
                          type="datetime-local"
                          value={isoToLocalDateTime(endsAt)}
                          onChange={(e) => { if (e.target.value) setEndsAt(localDateTimeToIso(e.target.value)); }}
                          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", zIndex: 1 }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", color: endsAt ? "#fff" : "rgba(255,255,255,0.4)", fontSize: "14px" }}>
                          <SilverIcon as={Clock} size={16} />
                          <span>{endsAt ? formatReadableDateTime(new Date(endsAt), timezone) : "Event end"}</span>
                          {endsAt && <span style={{ marginLeft: "auto", fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>{formatRelativeTime(new Date(endsAt))}</span>}
                        </div>
                      </div>
                    </div>
                  ) : section.type === "spotify" ? (
                    /* Spotify embed section */
                    <div>
                      <input
                        type="url"
                        value={section.url || ""}
                        onChange={(e) => {
                          const u = [...sections]; u[i] = { ...u[i], url: e.target.value }; setSections(u);
                        }}
                        placeholder="Paste Spotify URL (track, album, artist, or playlist)"
                        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#fff", fontSize: "13px", padding: "10px 12px", outline: "none", fontFamily: "inherit" }}
                      />
                      {section.url && section.url.includes("spotify.com") && (
                        <iframe
                          src={section.url.replace("spotify.com/", "spotify.com/embed/").split("?")[0]}
                          width="100%"
                          height={section.url.includes("/track/") ? "80" : "152"}
                          frameBorder="0"
                          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                          loading="lazy"
                          style={{ borderRadius: "8px", marginTop: "10px" }}
                        />
                      )}
                    </div>
                  ) : section.type === "applemusic" ? (
                    /* Apple Music embed section */
                    <div>
                      <input
                        type="url"
                        value={section.url || ""}
                        onChange={(e) => {
                          const u = [...sections]; u[i] = { ...u[i], url: e.target.value }; setSections(u);
                        }}
                        placeholder="Paste Apple Music URL (song, album, or playlist)"
                        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#fff", fontSize: "13px", padding: "10px 12px", outline: "none", fontFamily: "inherit" }}
                      />
                      {section.url && section.url.includes("music.apple.com") && (
                        <iframe
                          src={section.url.replace("music.apple.com", "embed.music.apple.com")}
                          width="100%"
                          height={section.url.includes("/song/") || section.url.includes("?i=") ? "175" : "450"}
                          frameBorder="0"
                          allow="autoplay *; encrypted-media *; fullscreen *"
                          sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
                          loading="lazy"
                          style={{ borderRadius: "8px", marginTop: "10px", border: "none" }}
                        />
                      )}
                    </div>
                  ) : section.type === "soundcloud" ? (
                    /* SoundCloud embed section */
                    <div>
                      <input
                        type="url"
                        value={section.url || ""}
                        onChange={(e) => {
                          const u = [...sections]; u[i] = { ...u[i], url: e.target.value }; setSections(u);
                        }}
                        placeholder="Paste SoundCloud URL (track or playlist)"
                        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#fff", fontSize: "13px", padding: "10px 12px", outline: "none", fontFamily: "inherit" }}
                      />
                      {section.url && section.url.includes("soundcloud.com") && (
                        <iframe
                          src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(section.url)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true`}
                          width="100%"
                          height={section.url.includes("/sets/") ? "300" : "166"}
                          frameBorder="0"
                          allow="autoplay"
                          loading="lazy"
                          style={{ borderRadius: "8px", marginTop: "10px", border: "none" }}
                        />
                      )}
                    </div>
                  ) : section.type === "youtube" ? (
                    /* YouTube embed section */
                    <div>
                      <input
                        type="url"
                        value={section.url || ""}
                        onChange={(e) => {
                          const u = [...sections]; u[i] = { ...u[i], url: e.target.value }; setSections(u);
                        }}
                        placeholder="Paste YouTube URL"
                        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#fff", fontSize: "13px", padding: "10px 12px", outline: "none", fontFamily: "inherit" }}
                      />
                      {section.url && (section.url.includes("youtube.com") || section.url.includes("youtu.be")) && (() => {
                        let videoId = null;
                        try {
                          const u = new URL(section.url);
                          if (u.hostname === "youtu.be") videoId = u.pathname.slice(1);
                          else if (u.hostname.includes("youtube.com")) {
                            if (u.pathname.startsWith("/embed/")) videoId = u.pathname.split("/embed/")[1];
                            else videoId = u.searchParams.get("v");
                          }
                        } catch {}
                        return videoId ? (
                          <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            width="100%"
                            style={{ aspectRatio: "16/9", borderRadius: "8px", marginTop: "10px", border: "none" }}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            loading="lazy"
                          />
                        ) : null;
                      })()}
                    </div>
                  ) : section.type === "socials" ? (
                    /* Social links section */
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {[
                        { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
                        { key: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/..." },
                        { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@..." },
                        { key: "soundcloud", label: "SoundCloud", placeholder: "https://soundcloud.com/..." },
                      ].map(({ key, label, placeholder }) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", width: "76px", flexShrink: 0 }}>{label}</span>
                          <input
                            type="url"
                            value={section[key] || ""}
                            onChange={(e) => {
                              const u = [...sections]; u[i] = { ...u[i], [key]: e.target.value }; setSections(u);
                            }}
                            placeholder={placeholder}
                            style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#fff", fontSize: "13px", padding: "8px 10px", outline: "none", fontFamily: "inherit", minWidth: 0 }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Header & text section */
                    <>
                      <input
                        type="text"
                        value={section.title || ""}
                        onChange={(e) => {
                          const u = [...sections]; u[i] = { ...u[i], title: e.target.value }; setSections(u);
                        }}
                        placeholder="Section title (e.g. About, Lineup, Menu...)"
                        style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", color: "#fff", fontSize: "15px", fontWeight: 600, outline: "none", padding: 0, marginBottom: "8px", fontFamily: "inherit" }}
                      />
                      <textarea
                        value={section.text || ""}
                        onChange={(e) => {
                          const u = [...sections]; u[i] = { ...u[i], text: e.target.value }; setSections(u);
                        }}
                        placeholder="Write your content..."
                        style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", color: "#fff", fontSize: "14px", lineHeight: "1.6", outline: "none", resize: "vertical", minHeight: "60px", padding: 0, fontFamily: "inherit", opacity: 0.85 }}
                      />
                    </>
                  )}
                </div>
              ))}

              {/* Add section grid — always visible */}
              <div style={{
                borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.12)",
                background: "rgba(12, 10, 18, 0.6)", padding: "10px 8px 8px",
              }}>
                <div style={{ fontSize: "11px", fontWeight: 500, color: "rgba(255,255,255,0.3)", textAlign: "center", marginBottom: "8px" }}>Add section</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "2px" }}>
                  {[
                    { data: { type: "text", title: "Heading", text: "Write something here..." }, icon: "T", label: "Text", color: "#fff" },
                    { data: { type: "spotify", url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT" }, icon: "\u266B", label: "Spotify", color: "#1DB954" },
                    { data: { type: "applemusic", url: "https://music.apple.com/us/album/blinding-lights/1499378108?i=1499378615" }, icon: "\u266A", label: "Apple", color: "#FC3C44" },
                    { data: { type: "soundcloud", url: "https://soundcloud.com/fredagain" }, icon: "\u266A", label: "SoundCloud", color: "#FF5500" },
                    { data: { type: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }, icon: "\u25B6", label: "YouTube", color: "#FF0000" },
                    { data: { type: "socials", instagram: "https://instagram.com/pullup", spotify: "https://open.spotify.com/artist/example", tiktok: "https://tiktok.com/@pullup", soundcloud: "" }, icon: "@", label: "Socials", color: "#E1306C" },
                  ].map((item) => (
                    <button
                      key={item.data.type}
                      type="button"
                      onClick={() => { setSections([...sections, item.data]); }}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                        padding: "10px 2px 8px", background: "transparent", border: "none", borderRadius: "8px",
                        cursor: "pointer", transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                        e.currentTarget.querySelector("[data-icon]").style.color = item.color;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.querySelector("[data-icon]").style.color = "rgba(255,255,255,0.35)";
                      }}
                    >
                      <span data-icon style={{ fontSize: "20px", color: "rgba(255,255,255,0.35)", transition: "color 0.15s ease", lineHeight: 1 }}>{item.icon}</span>
                      <span style={{ fontSize: "9px", fontWeight: 500, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            </div>

            {/* === STEP 3 (tab position): SOCIALS === */}
            <div
              style={{
                display: currentStep === 4 ? "block" : "none",
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
                SOCIALS
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    background: "rgba(20, 16, 30, 0.25)",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <FaInstagram size={20} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <input
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="Instagram URL"
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      color: "#fff",
                      fontSize: "14px",
                      outline: "none",
                      padding: 0,
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    background: "rgba(20, 16, 30, 0.25)",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <FaSpotify size={20} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <input
                    value={spotify}
                    onChange={(e) => setSpotify(e.target.value)}
                    placeholder="Spotify URL"
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      color: "#fff",
                      fontSize: "14px",
                      outline: "none",
                      padding: 0,
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    background: "rgba(20, 16, 30, 0.25)",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <FaTiktok size={20} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <input
                    value={tiktok}
                    onChange={(e) => setTiktok(e.target.value)}
                    placeholder="TikTok URL"
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      color: "#fff",
                      fontSize: "14px",
                      outline: "none",
                      padding: 0,
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    background: "rgba(20, 16, 30, 0.25)",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <FaSoundcloud size={20} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <input
                    value={soundcloud}
                    onChange={(e) => setSoundcloud(e.target.value)}
                    placeholder="SoundCloud URL"
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      color: "#fff",
                      fontSize: "14px",
                      outline: "none",
                      padding: 0,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* === STEP 4 (tab position): SETTINGS === */}
            <div
              style={{
                display: currentStep === 3 ? "block" : "none",
              }}
            >

            {/* Event Settings Section */}
            <div>
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

              {/* event options */}
              <div style={{ marginBottom: "16px" }}>
                <h3
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    marginBottom: "10px",
                    opacity: 0.6,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Event Options
                </h3>

                {/* capacity */}
                <OptionRow
                  icon={<SilverIcon as={Users} size={20} />}
                  label="List capacity"
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
                        fontSize: "16px",
                        textAlign: "right",
                        outline: "none",
                      }}
                    />
                  }
                />
                {/* waitlist */}
                <OptionRow
                  icon={<SilverIcon as={RefreshCw} size={20} />}
                  label="Enable waitlist when full"
                  right={
                    <Toggle
                      checked={waitlistEnabled}
                      onChange={setWaitlistEnabled}
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
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      {allowPlusOnes && (
                        <div style={{
                          display: "flex", alignItems: "center", gap: "2px",
                          background: "rgba(255,255,255,0.05)", borderRadius: "8px",
                          border: "1px solid rgba(255,255,255,0.08)", padding: "2px",
                        }}>
                          <button type="button" onClick={() => {
                            const c = parseInt(maxPlusOnesPerGuest, 10) || 1;
                            if (c > 1) setMaxPlusOnesPerGuest(String(c - 1));
                          }} disabled={parseInt(maxPlusOnesPerGuest, 10) <= 1} style={{
                            width: "28px", height: "28px", borderRadius: "6px", border: "none",
                            background: parseInt(maxPlusOnesPerGuest, 10) <= 1 ? "transparent" : "rgba(192,192,192,0.15)",
                            color: "#fff", fontSize: "16px", fontWeight: 600,
                            cursor: parseInt(maxPlusOnesPerGuest, 10) <= 1 ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            opacity: parseInt(maxPlusOnesPerGuest, 10) <= 1 ? 0.3 : 1, transition: "all 0.15s ease",
                          }}>−</button>
                          <div style={{
                            minWidth: "24px", textAlign: "center", fontSize: "14px",
                            fontWeight: 600, color: "#fff", padding: "0 2px",
                          }}>{maxPlusOnesPerGuest}</div>
                          <button type="button" onClick={() => {
                            const c = parseInt(maxPlusOnesPerGuest, 10) || 1;
                            if (c < 5) setMaxPlusOnesPerGuest(String(c + 1));
                          }} disabled={parseInt(maxPlusOnesPerGuest, 10) >= 5} style={{
                            width: "28px", height: "28px", borderRadius: "6px", border: "none",
                            background: parseInt(maxPlusOnesPerGuest, 10) >= 5 ? "transparent" : "rgba(192,192,192,0.15)",
                            color: "#fff", fontSize: "16px", fontWeight: 600,
                            cursor: parseInt(maxPlusOnesPerGuest, 10) >= 5 ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            opacity: parseInt(maxPlusOnesPerGuest, 10) >= 5 ? 0.3 : 1, transition: "all 0.15s ease",
                          }}>+</button>
                        </div>
                      )}
                      <Toggle
                        checked={allowPlusOnes}
                        onChange={setAllowPlusOnes}
                      />
                    </div>
                  }
                />

                {/* DINNER */}
                <OptionRow
                  icon={<SilverIcon as={UtensilsCrossed} size={20} />}
                  label="Food Serving Options"
                  description="Offer an optional food serving slot with limited seats."
                  right={
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <Toggle
                        checked={dinnerEnabled}
                        onChange={handleToggleDinnerEnabled}
                      />
                    </div>
                  }
                />

                {dinnerEnabled && (
                  <div
                    style={{
                      marginTop: "8px",
                      padding: "16px",
                      borderRadius: "12px",
                      border: "1px solid rgba(192, 192, 192, 0.15)",
                      background:
                        "linear-gradient(135deg, rgba(192, 192, 192, 0.06) 0%, rgba(232, 232, 232, 0.03) 100%)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
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
                      <SilverIcon as={UtensilsCrossed} size={20} />
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          opacity: 0.9,
                          flex: 1,
                        }}
                      >
                        Cuisine Configuration
                      </div>
                    </div>

                    {/* Slot cards */}
                    <style>{`
                      .cuisine-time-input::-webkit-calendar-picker-indicator,
                      .cuisine-time-input::-webkit-inner-spin-button,
                      .cuisine-time-input::-webkit-clear-button {
                        display: none !important;
                        -webkit-appearance: none !important;
                      }
                    `}</style>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {(() => {
                        const slotCount = Math.max(1, dinnerSlotsConfig.length || 0);

                        const getSlotTimeDisplay = (index) => {
                          const timeValue = dinnerSlotsConfig[index]?.time;
                          if (!timeValue || !startsAt) return null;
                          const localEventStart = isoToLocalDateTime(startsAt);
                          if (!localEventStart) return timeValue;
                          const [eventDatePart] = localEventStart.split("T");
                          return formatEventTime(new Date(`${eventDatePart}T${timeValue}`), timezone);
                        };

                        const updateSlotField = (index, field, value) => {
                          setDinnerSlotsConfig((prev) => {
                            const next = [...prev];
                            const current = next[index] || {
                              time: "18:00",
                              maxSeats: dinnerMaxSeatsPerSlot || "20",
                              maxGuestsPerBooking: dinnerMaxGuestsPerBooking || "4",
                            };
                            next[index] = { ...current, [field]: value };
                            return next;
                          });
                        };

                        const stepValue = (index, field, delta, min, max) => {
                          const raw = dinnerSlotsConfig[index]?.[field] ||
                            (field === "maxSeats" ? dinnerMaxSeatsPerSlot : dinnerMaxGuestsPerBooking) || "0";
                          const current = parseInt(raw, 10) || 0;
                          const next = current + delta;
                          if (next < min) {
                            if (field === "maxSeats") updateSlotField(index, field, "");
                            return;
                          }
                          if (max !== undefined && next > max) return;
                          updateSlotField(index, field, String(next));
                        };

                        const MiniStepper = ({ label, value, onMinus, onPlus, disableMinus, disablePlus, labelExtra }) => (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                              <span style={{ fontSize: "10px", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                              {labelExtra}
                            </div>
                            <div style={{
                              display: "flex", alignItems: "center", gap: "2px",
                              background: "rgba(255,255,255,0.05)", borderRadius: "8px",
                              border: "1px solid rgba(255,255,255,0.08)", padding: "2px",
                            }}>
                              <button type="button" onClick={onMinus} disabled={disableMinus} style={{
                                width: "28px", height: "28px", borderRadius: "6px", border: "none",
                                background: disableMinus ? "transparent" : "rgba(192,192,192,0.15)",
                                color: "#fff", fontSize: "16px", fontWeight: 600, cursor: disableMinus ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                opacity: disableMinus ? 0.3 : 1, transition: "all 0.15s ease",
                              }}>−</button>
                              <div style={{
                                flex: 1, textAlign: "center", fontSize: "14px",
                                fontWeight: 600, color: "#fff", padding: "0 4px",
                              }}>{value || "—"}</div>
                              <button type="button" onClick={onPlus} disabled={disablePlus} style={{
                                width: "28px", height: "28px", borderRadius: "6px", border: "none",
                                background: disablePlus ? "transparent" : "rgba(192,192,192,0.15)",
                                color: "#fff", fontSize: "16px", fontWeight: 600, cursor: disablePlus ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                opacity: disablePlus ? 0.3 : 1, transition: "all 0.15s ease",
                              }}>+</button>
                            </div>
                          </div>
                        );

                        return (
                          <>
                            {Array.from({ length: slotCount }).map((_, index) => {
                              const seatsVal = dinnerSlotsConfig[index]?.maxSeats ?? dinnerMaxSeatsPerSlot ?? "";
                              const guestsVal = dinnerSlotsConfig[index]?.maxGuestsPerBooking ?? dinnerMaxGuestsPerBooking ?? "";
                              const seatsNum = parseInt(seatsVal, 10) || 0;
                              const guestsNum = parseInt(guestsVal, 10) || 0;

                              return (
                                <div key={index} style={{
                                  background: "rgba(255,255,255,0.03)", borderRadius: "12px",
                                  border: "1px solid rgba(255,255,255,0.06)", padding: "12px",
                                  display: "flex", flexDirection: "column", gap: "10px",
                                }}>
                                  {/* Row 1: Time input */}
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <div style={{
                                      fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                                      letterSpacing: "0.05em", opacity: 0.5, minWidth: "16px",
                                    }}>
                                      {slotCount > 1 ? `${index + 1}` : ""}
                                    </div>
                                    {(() => {
                                      const timeVal = dinnerSlotsConfig[index]?.time || "18:00";
                                      const [hh, mm] = timeVal.split(":");
                                      const selStyle = {
                                        flex: 1, height: "38px", borderRadius: "10px",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        background: "rgba(255,255,255,0.04)",
                                        color: "#fff", fontSize: "14px", fontWeight: 600,
                                        textAlign: "center", cursor: "pointer",
                                        outline: "none", appearance: "none",
                                        WebkitAppearance: "none", MozAppearance: "none",
                                        padding: "0 8px",
                                      };
                                      return (
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                                          <SilverIcon as={Clock} size={16} style={{ opacity: 0.6, flexShrink: 0 }} />
                                          <select
                                            value={hh}
                                            onChange={(e) => updateSlotField(index, "time", `${e.target.value}:${mm}`)}
                                            style={selStyle}
                                          >
                                            {Array.from({ length: 24 }, (_, i) => {
                                              const h = String(i).padStart(2, "0");
                                              return <option key={h} value={h}>{h}</option>;
                                            })}
                                          </select>
                                          <span style={{ fontSize: "16px", fontWeight: 700, opacity: 0.5 }}>:</span>
                                          <select
                                            value={mm}
                                            onChange={(e) => updateSlotField(index, "time", `${hh}:${e.target.value}`)}
                                            style={selStyle}
                                          >
                                            {["00", "10", "20", "30", "40", "50"].map((m) => (
                                              <option key={m} value={m}>{m}</option>
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    })()}
                                    {slotCount > 1 && index === slotCount - 1 && (
                                      <button type="button" onClick={handleRemoveDinnerSlot} style={{
                                        width: "28px", height: "28px", borderRadius: "8px", border: "none",
                                        background: "rgba(255,100,100,0.1)", color: "rgba(255,100,100,0.7)",
                                        fontSize: "14px", cursor: "pointer", display: "flex",
                                        alignItems: "center", justifyContent: "center", flexShrink: 0,
                                      }}>×</button>
                                    )}
                                  </div>

                                  {/* Row 2: Seats + Max guests inline */}
                                  <div style={{ display: "flex", gap: "12px", paddingLeft: slotCount > 1 ? "26px" : "0" }}>
                                    <MiniStepper
                                      label="Seats"
                                      value={seatsVal}
                                      onMinus={() => stepValue(index, "maxSeats", -1, 0)}
                                      onPlus={() => stepValue(index, "maxSeats", 1)}
                                      disableMinus={seatsNum <= 0}
                                      labelExtra={index === 0 ? (
                                        <button
                                          type="button"
                                          onClick={() => setHideDinnerRemaining(!hideDinnerRemaining)}
                                          title={hideDinnerRemaining ? "Show remaining seats to guests" : "Hide remaining seats from guests"}
                                          style={{
                                            background: "none", border: "none", padding: "2px",
                                            cursor: "pointer", display: "flex", alignItems: "center",
                                            color: hideDinnerRemaining ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.5)",
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

                            {/* Add slot button */}
                            <button
                              type="button"
                              onClick={handleAddDinnerSlot}
                              style={{
                                padding: "8px 14px", borderRadius: "10px", border: "1px dashed rgba(255,255,255,0.15)",
                                background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: "13px",
                                fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center",
                                justifyContent: "center", gap: "6px", transition: "all 0.2s ease",
                              }}
                            >
                              <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span>
                              <span>Add slot</span>
                            </button>
                          </>
                        );
                      })()}
                    </div>

                    {/* Booking email */}
                    <div>
                      <label style={{
                        display: "block", fontSize: "11px", fontWeight: 500,
                        textTransform: "uppercase", letterSpacing: "0.05em",
                        opacity: 0.6, marginBottom: "8px",
                      }}>
                        Booking contact email
                      </label>
                      <input
                        type="email"
                        value={dinnerBookingEmail}
                        onChange={(e) => setDinnerBookingEmail(e.target.value)}
                        placeholder="e.g. bookings@yourrestaurant.com"
                        style={{
                          ...inputStyle,
                          fontSize: "14px",
                          padding: "10px 14px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "10px",
                        }}
                      />
                      <div style={{ fontSize: "11px", opacity: 0.4, marginTop: "6px" }}>
                        Shown to guests for large or specific bookings
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>

            {/* === STEP 5: TICKETS === */}
            <div
              style={{
                display: currentStep === 5 ? "block" : "none",
              }}
            >
              <div style={{ fontSize: "13px", opacity: 0.4, marginBottom: "16px" }}>
                Set a price to sell tickets. Leave empty for a free event.
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  borderRadius: "12px",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={ticketPrice}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTicketPrice(val);
                    setSellTicketsEnabled(val && parseFloat(val) > 0);
                  }}
                  placeholder="0"
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    fontSize: "24px",
                    fontWeight: 700,
                    padding: "14px 18px",
                    outline: "none",
                    minWidth: 0,
                  }}
                />
                <select
                  value={ticketCurrency}
                  onChange={(e) => setTicketCurrency(e.target.value)}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "none",
                    borderLeft: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.6)",
                    fontSize: "14px",
                    fontWeight: 600,
                    padding: "0 16px",
                    cursor: "pointer",
                    outline: "none",
                    appearance: "none",
                    WebkitAppearance: "none",
                  }}
                >
                  <option value="SEK">SEK</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="DKK">DKK</option>
                  <option value="NOK">NOK</option>
                </select>
              </div>

              <div style={{ marginTop: "8px", fontSize: "12px", opacity: 0.4, display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: isPaidEvent ? "#22c55e" : "rgba(255,255,255,0.4)" }}>
                  {isPaidEvent ? "●" : "○"}
                </span>
                {isPaidEvent ? `Paid event — ${ticketPrice} ${ticketCurrency}` : "Free event"}
              </div>

              {/* Stripe — only when paid */}
              {isPaidEvent && (
                <div style={{ marginTop: "20px", padding: "16px", borderRadius: "12px",
                  border: stripeConnected ? "1px solid rgba(34, 197, 94, 0.2)" : "1px solid rgba(251, 191, 36, 0.3)",
                  background: stripeConnected ? "rgba(34, 197, 94, 0.05)" : "rgba(251, 191, 36, 0.05)",
                }}>
                  {stripeConnected ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
                      <span style={{ color: "#22c55e", fontSize: "16px" }}>✓</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{stripeBusinessName || "Stripe connected"}</div>
                        {stripeAccountEmail && <div style={{ opacity: 0.5, fontSize: "11px" }}>{stripeAccountEmail}</div>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <SilverIcon as={AlertTriangle} size={18} style={{ color: "#f59e0b", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Connect Stripe to accept payments</div>
                        <button type="button" onClick={handleConnectStripeInline} disabled={stripeConnecting}
                          style={{
                            padding: "8px 16px", borderRadius: "8px", border: "none",
                            background: "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
                            color: "#111", fontSize: "13px", fontWeight: 600,
                            cursor: stripeConnecting ? "default" : "pointer",
                            opacity: stripeConnecting ? 0.6 : 1,
                          }}
                        >{stripeConnecting ? "Connecting..." : "Connect Stripe"}</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
            {/* end animation wrapper */}
            </div>
            {/* end step content wrapper */}
            </div>

            {/* Fixed Publish bar at bottom of sidebar */}
            <div
              style={{
                position: "sticky",
                bottom: 0,
                zIndex: 10,
                padding: "12px 24px",
                paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                background: "linear-gradient(to top, rgba(12, 10, 18, 0.98) 0%, rgba(12, 10, 18, 0.95) 80%, transparent 100%)",
                backdropFilter: "blur(12px)",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                flexShrink: 0,
              }}
            >
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px 24px",
                  borderRadius: "8px",
                  border: "none",
                  background: loading
                    ? "#666"
                    : "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
                  color: "#111",
                  fontWeight: 700,
                  fontSize: "15px",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: loading
                    ? "none"
                    : "0 4px 16px rgba(192, 192, 192, 0.3)",
                  transition: "all 0.2s ease",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  opacity: loading ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.target.style.transform = "translateY(-1px)";
                    e.target.style.boxShadow = "0 6px 20px rgba(192, 192, 192, 0.4)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow = "0 4px 16px rgba(192, 192, 192, 0.3)";
                  }
                }}
              >
                {loading ? (isEditMode ? "Saving…" : "Creating…") : (isEditMode ? "SAVE CHANGES" : "PUBLISH")}
              </button>
              {hasAttemptedPublish && missingCount > 0 && (
                <div style={{
                  textAlign: "center",
                  marginTop: "8px",
                  fontSize: "12px",
                  color: "rgba(239, 68, 68, 0.8)",
                  fontWeight: 500,
                }}>
                  {missingCount} {missingCount === 1 ? "field" : "fields"} missing
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDE: Live Preview (desktop only) */}
          <div
            className="create-event-preview-desktop"
            style={{
              flex: 1,
              height: "100%",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(5, 4, 10, 0.8)",
            }}
          >
            {/* Desktop/Phone toggle */}
            <div
              className="create-event-desktop-toggle"
              style={{
                position: "absolute",
                top: "16px",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 20,
                display: "flex",
                background: "rgba(12, 10, 18, 0.9)",
                backdropFilter: "blur(20px)",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.1)",
                padding: "3px",
              }}
            >
              <button
                type="button"
                onClick={() => setDesktopPreviewMode("desktop")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "7px",
                  border: "none",
                  background:
                    desktopPreviewMode === "desktop"
                      ? "rgba(255,255,255,0.12)"
                      : "transparent",
                  color:
                    desktopPreviewMode === "desktop"
                      ? "#fff"
                      : "rgba(255,255,255,0.4)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  transition: "all 0.2s ease",
                }}
              >
                <Monitor size={13} />
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setDesktopPreviewMode("phone")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "7px",
                  border: "none",
                  background:
                    desktopPreviewMode === "phone"
                      ? "rgba(255,255,255,0.12)"
                      : "transparent",
                  color:
                    desktopPreviewMode === "phone"
                      ? "#fff"
                      : "rgba(255,255,255,0.4)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  transition: "all 0.2s ease",
                }}
              >
                <Smartphone size={13} />
                Phone
              </button>
            </div>

            {/* Preview frame */}
            <div
              style={{
                ...(desktopPreviewMode === "phone"
                  ? {
                      width: "390px",
                      height: "calc(100% - 60px)",
                      marginTop: "50px",
                      borderRadius: "40px",
                      border: "3px solid rgba(255,255,255,0.12)",
                      boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255,255,255,0.05)",
                    }
                  : {
                      width: "90%",
                      maxWidth: "900px",
                      aspectRatio: "16 / 10",
                      maxHeight: "calc(100% - 80px)",
                      marginTop: "50px",
                      borderRadius: "12px",
                      border: "2px solid rgba(255,255,255,0.12)",
                      boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255,255,255,0.05)",
                    }),
                overflow: "hidden",
                transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                position: "relative",
              }}
            >
              {/* Phone chrome — status bar + Safari URL bar */}
              {desktopPreviewMode === "phone" && (
                <div style={{ flexShrink: 0, background: "rgba(18, 16, 24, 0.95)", position: "relative", zIndex: 10 }}>
                  {/* Status bar */}
                  <div style={{
                    height: "28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 20px",
                  }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>
                      {new Date().getHours().toString().padStart(2, "0")}:{new Date().getMinutes().toString().padStart(2, "0")}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                        <rect x="0" y="4" width="2.5" height="6" rx="0.5" fill="rgba(255,255,255,0.9)"/>
                        <rect x="4" y="2.5" width="2.5" height="7.5" rx="0.5" fill="rgba(255,255,255,0.9)"/>
                        <rect x="8" y="0.5" width="2.5" height="9.5" rx="0.5" fill="rgba(255,255,255,0.9)"/>
                        <rect x="12" y="0" width="2" height="10" rx="0.5" fill="rgba(255,255,255,0.3)"/>
                      </svg>
                      <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                        <path d="M0.5 3C3.5 0 9.5 0 12.5 3" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" strokeLinecap="round"/>
                        <path d="M2.5 5.5C4.5 3.5 8.5 3.5 10.5 5.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" strokeLinecap="round"/>
                        <path d="M4.5 8C5.5 7 7.5 7 8.5 8" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinecap="round"/>
                        <circle cx="6.5" cy="9.5" r="1" fill="#fff"/>
                      </svg>
                      <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
                        <rect x="0.5" y="0.5" width="16" height="9" rx="2" stroke="rgba(255,255,255,0.4)" strokeWidth="1"/>
                        <rect x="17.5" y="3" width="2" height="4" rx="0.5" fill="rgba(255,255,255,0.3)"/>
                        <rect x="2" y="2" width="10" height="6" rx="1" fill="rgba(251,191,36,0.9)"/>
                      </svg>
                    </div>
                  </div>
                  {/* Safari URL bar */}
                  <div style={{
                    margin: "2px 8px 6px",
                    height: "32px",
                    borderRadius: "10px",
                    background: "rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.5)",
                    fontWeight: 500,
                  }}>
                    pullup.se
                  </div>
                </div>
              )}
              {/* Desktop browser chrome */}
              {desktopPreviewMode === "desktop" && (
                <div style={{
                  height: "32px",
                  background: "rgba(30, 28, 36, 0.95)",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  gap: "6px",
                  flexShrink: 0,
                }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "rgba(255,95,87,0.8)" }} />
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "rgba(255,189,46,0.8)" }} />
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "rgba(39,201,63,0.8)" }} />
                  <div style={{
                    flex: 1, marginLeft: "12px", height: "20px", borderRadius: "6px",
                    background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center",
                    padding: "0 10px", fontSize: "10px", color: "rgba(255,255,255,0.3)",
                  }}>
                    pullup.se/e/{title ? title.toLowerCase().replace(/\s+/g, "-").slice(0, 30) : "your-event"}
                  </div>
                </div>
              )}
              <div style={{
                width: "100%",
                height: desktopPreviewMode === "desktop" ? "calc(100% - 32px)" : desktopPreviewMode === "phone" ? "calc(100% - 102px)" : "100%",
                overflow: "hidden",
              }}>
              <EventPreview
                title={title}
                autoShowRsvp={currentStep === 3 || currentStep === 5}
                activeStep={currentStep}
                description={description}
                location={location}
                locationLat={locationLat}
                locationLng={locationLng}
                startsAt={startsAt}
                endsAt={endsAt}
                timezone={timezone}
                imagePreview={imagePreview}
                media={mediaFiles.length > 0 ? mediaFiles.map((m, i) => ({
                  id: m.id,
                  url: m.previewUrl || m.preview,
                  mediaType: m.mediaType,
                  position: i,
                })) : null}
                mediaSettings={mediaMode === "video"
                  ? { mode: "video", loop: videoLoop, autoplay: videoAutoplay, audio: videoAudio }
                  : { mode: "carousel", autoscroll: carouselAutoscroll, interval: carouselInterval, loop: carouselLoop, transitions: carouselTransitions }}
                ticketType={sellTicketsEnabled ? "paid" : "free"}
                compact={desktopPreviewMode === "phone"}
                instagram={instagram}
                spotify={spotify}
                tiktok={tiktok}
                soundcloud={soundcloud}
                ticketPrice={
                  sellTicketsEnabled && ticketPrice
                    ? Math.round(parseFloat(ticketPrice) * 100)
                    : null
                }
                ticketCurrency={sellTicketsEnabled ? ticketCurrency : null}
                sections={sections}
                hoveredSection={hoveredSection}
                hideLocation={hideLocation}
                rsvpContent={({ onClose }) => (
                  <RsvpForm
                    event={{
                      slug: null,
                      dinnerEnabled: dinnerEnabled,
                      dinnerBookingEmail: dinnerBookingEmail || null,
                      waitlistEnabled: waitlistEnabled,
                      hideDinnerRemaining: hideDinnerRemaining,
                      maxPlusOnesPerGuest: allowPlusOnes ? parseInt(maxPlusOnesPerGuest, 10) || 0 : 0,
                      timezone: timezone,
                    }}
                    previewSlots={previewDinnerSlots}
                    onSubmit={async () => {
                      onClose();
                      showToast("This is a preview — no RSVP was submitted", "info");
                    }}
                    loading={false}
                    onClose={onClose}
                  />
                )}
              />
              </div>
              {/* Phone bottom Safari toolbar */}
              {desktopPreviewMode === "phone" && (
                <div style={{
                  height: "36px",
                  background: "rgba(18, 16, 24, 0.95)",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-around",
                  padding: "0 16px",
                  flexShrink: 0,
                }}>
                  {/* Back */}
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 4L6 10L12 16" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {/* Forward */}
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M8 4L14 10L8 16" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {/* Share */}
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2V11M9 2L5 6M9 2L13 6" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 10V14C3 15.1 3.9 16 5 16H13C14.1 16 15 15.1 15 14V10" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  {/* Tabs */}
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="14" height="14" rx="3" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1"/></svg>
                  {/* Menu */}
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="4" cy="9" r="1.5" fill="rgba(255,255,255,0.4)"/><circle cx="9" cy="9" r="1.5" fill="rgba(255,255,255,0.4)"/><circle cx="14" cy="9" r="1.5" fill="rgba(255,255,255,0.4)"/></svg>
                </div>
              )}
            </div>
          </div>

          </div>
        </form>

      </div>

      {/* MOBILE: Full-screen preview overlay (outside transform container) */}
      {mobileView === "preview" && (
        <div
          className="create-event-preview-mobile"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            height: "100dvh",
            zIndex: 100,
            background: "#05040a",
          }}
        >
          <EventPreview
            title={title}
            description={description}
            location={location}
            locationLat={locationLat}
            locationLng={locationLng}
            startsAt={startsAt}
            endsAt={endsAt}
            timezone={timezone}
            imagePreview={imagePreview}
            media={mediaFiles.length > 0 ? mediaFiles.map((m, i) => ({
              id: m.id,
              url: m.previewUrl || m.preview,
              mediaType: m.mediaType,
              position: i,
            })) : null}
            mediaSettings={mediaMode === "video"
              ? { mode: "video", loop: videoLoop, autoplay: videoAutoplay, audio: videoAudio }
              : { mode: "carousel", autoscroll: carouselAutoscroll, interval: carouselInterval, loop: carouselLoop, transitions: carouselTransitions }}
            ticketType={sellTicketsEnabled ? "paid" : "free"}
            compact
            autoShowRsvp={currentStep === 4 || currentStep === 5}
            activeStep={currentStep}
            instagram={instagram}
            spotify={spotify}
            ticketPrice={
              sellTicketsEnabled && ticketPrice
                ? Math.round(parseFloat(ticketPrice) * 100)
                : null
            }
            ticketCurrency={sellTicketsEnabled ? ticketCurrency : null}
            sections={sections}
            rsvpContent={({ onClose }) => (
              <RsvpForm
                event={{
                  slug: null,
                  dinnerEnabled: dinnerEnabled,
                  dinnerBookingEmail: dinnerBookingEmail || null,
                  waitlistEnabled: waitlistEnabled,
                  hideDinnerRemaining: hideDinnerRemaining,
                  maxPlusOnesPerGuest: allowPlusOnes ? parseInt(maxPlusOnesPerGuest, 10) || 0 : 0,
                }}
                previewSlots={previewDinnerSlots}
                onSubmit={async () => {
                  onClose();
                  showToast("This is a preview — no RSVP was submitted", "info");
                }}
                loading={false}
                onClose={onClose}
              />
            )}
          />
        </div>
      )}

      {/* Mobile toggle: Edit / Preview (outside transform container) */}
      <div
        className="create-event-mobile-toggle"
        style={{
          position: "fixed",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 110,
          display: "flex",
          gap: "0",
          background: "rgba(12, 10, 18, 0.9)",
          backdropFilter: "blur(20px)",
          borderRadius: "14px",
          border: "1px solid rgba(255,255,255,0.1)",
          padding: "4px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        <button
          type="button"
          onClick={() => setMobileView("edit")}
          style={{
            padding: "10px 20px",
            borderRadius: "10px",
            border: "none",
            background:
              mobileView === "edit"
                ? "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)"
                : "transparent",
            color: mobileView === "edit" ? "#000" : "rgba(255,255,255,0.6)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.2s ease",
          }}
        >
          <Pencil size={14} />
          Edit
        </button>
        <button
          type="button"
          onClick={() => setMobileView("preview")}
          style={{
            padding: "10px 20px",
            borderRadius: "10px",
            border: "none",
            background:
              mobileView === "preview"
                ? "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)"
                : "transparent",
            color: mobileView === "preview" ? "#000" : "rgba(255,255,255,0.6)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.2s ease",
          }}
        >
          <Eye size={14} />
          Preview
        </button>
      </div>
    </div>
  );
}

// small helper components - Mobile-first with better visual hierarchy
function OptionRow({ icon, label, description, right }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        background: "rgba(20, 16, 30, 0.25)",
        borderRadius: "10px",
        marginBottom: "6px",
        border: "1px solid rgba(255,255,255,0.06)",
        transition: "all 0.2s ease",
        minHeight: "44px",
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
          alignItems: "center",
          gap: "10px",
          flex: 1,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: "16px",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: description ? "2px" : "0",
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
            ? "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)"
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
