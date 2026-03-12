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

  const [title, setTitle] = useState(draft?.title || "");
  const [description, setDescription] = useState(draft?.description || "");
  const [location, setLocation] = useState(draft?.location || "");
  const [locationLat, setLocationLat] = useState(draft?.locationLat || null);
  const [locationLng, setLocationLng] = useState(draft?.locationLng || null);
  const [startsAt, setStartsAt] = useState(draft?.startsAt || "");
  const [endsAt, setEndsAt] = useState(draft?.endsAt || "");
  const [timezone, setTimezone] = useState(draft?.timezone || getUserTimezone());
  const [maxAttendees, setMaxAttendees] = useState(draft?.maxAttendees || "");
  const [waitlistEnabled, setWaitlistEnabled] = useState(draft?.waitlistEnabled || false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]); // [{file, preview, mediaType, id}]
  const [mediaMode, setMediaMode] = useState(null); // null | "images" | "video"
  // Video settings
  const [videoLoop, setVideoLoop] = useState(true);
  const [videoAutoplay, setVideoAutoplay] = useState(true);
  const [videoAudio, setVideoAudio] = useState(false);
  const [customThumbnail, setCustomThumbnail] = useState(null); // { file, preview }
  const thumbnailInputRef = useRef(null);
  // Carousel settings
  const [carouselAutoscroll, setCarouselAutoscroll] = useState(false);
  const [carouselInterval, setCarouselInterval] = useState(5);
  const [carouselLoop, setCarouselLoop] = useState(true);
  const [theme] = useState("minimal");
  const [calendar] = useState("personal");
  const [visibility] = useState("public");
  const [sellTicketsEnabled, setSellTicketsEnabled] = useState(draft?.sellTicketsEnabled || false);
  const [ticketPrice, setTicketPrice] = useState(draft?.ticketPrice || "");
  const [ticketCurrency, setTicketCurrency] = useState(draft?.ticketCurrency || "USD");

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
  const [dinnerSlotsConfig, setDinnerSlotsConfig] = useState([]);

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

  // Save draft to localStorage (create mode only, debounced)
  useEffect(() => {
    if (isEditMode) return;
    const timeout = setTimeout(() => {
      try {
        const draftData = {
          title, description, location, locationLat, locationLng,
          startsAt, endsAt, timezone, maxAttendees, waitlistEnabled,
          sellTicketsEnabled, ticketPrice, ticketCurrency,
          allowPlusOnes, maxPlusOnesPerGuest,
          dinnerEnabled, dinnerStartTime, dinnerEndTime,
          dinnerMaxSeatsPerSlot, dinnerMaxGuestsPerBooking,
          dinnerOverflowAction, dinnerBookingEmail,
          instagram, spotify, tiktok, soundcloud,
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
    dinnerOverflowAction, dinnerBookingEmail,
    instagram, spotify, tiktok, soundcloud,
  ]);

  function clearDraft() {
    try { localStorage.removeItem("pullup_event_draft"); } catch {}
  }

  function discardDraft() {
    clearDraft();
    setShowDraftBanner(false);
    setTitle(""); setDescription(""); setLocation("");
    setLocationLat(null); setLocationLng(null);
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
  }

  // Reset form when switching between create/edit modes
  useEffect(() => {
    if (editEventId) return; // edit mode handles its own loading
    // Don't reset if we have a draft (page reload scenario)
    if (draft) return;
    setTitle(""); setDescription(""); setLocation("");
    setLocationLat(null); setLocationLng(null);
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
        setDescription(ev.description || "");
        setLocation(ev.location || "");
        setLocationLat(ev.locationLat || null);
        setLocationLng(ev.locationLng || null);
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
          time: "",
          maxSeats: dinnerMaxSeatsPerSlot || "",
          maxGuestsPerBooking: dinnerMaxGuestsPerBooking || "",
        },
      ];
    });
  }

  function handleAddDinnerSlot() {
    if (!dinnerEnabled) return;
    setDinnerSlotsConfig((prev) => {
      const last = prev[prev.length - 1] || {
        time: "",
        maxSeats: dinnerMaxSeatsPerSlot || "",
        maxGuestsPerBooking: dinnerMaxGuestsPerBooking || "",
      };
      return [
        ...prev,
        {
          time: "",
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
      const updated = prev.filter((m) => m.id !== id);
      if (updated.length > 0) {
        setImagePreview(updated[0].previewUrl || updated[0].preview);
        setImageFile(updated[0].file);
      } else {
        setImagePreview(null);
        setImageFile(null);
        setMediaMode(null);
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
        description,
        location,
        locationLat: locationLat || null,
        locationLng: locationLng || null,
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
            ? { mode: "carousel", autoscroll: carouselAutoscroll, interval: carouselInterval, loop: carouselLoop }
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
        navigate(`/app/events/${editEventId}/manage`);
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
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(1.1); }
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
            className="create-event-sidebar"
            style={{
              width: "440px",
              minWidth: "440px",
              height: "100%",
              overflowY: "auto",
              overflowX: "hidden",
              padding: "24px",
              boxSizing: "border-box",
              borderRight: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(12, 10, 18, 0.4)",
              display: mobileView === "preview" ? "none" : "block",
            }}
          >
            {/* Media upload area */}
            <div style={{ marginBottom: "24px" }}>
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
                      {isDragging ? "Drop files here" : "Click or drag to upload"}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        opacity: 0.6,
                        textAlign: "center",
                        padding: "0 16px",
                      }}
                    >
                      Images (carousel) or a single Video
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
                  {mediaFiles.map((item, index) => (
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
                      {/* Delete button — always visible */}
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
                  ))}

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

              {/* Media settings */}
              {mediaFiles.length > 0 && (
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
                    {mediaMode === "video" ? "Video Settings" : mediaFiles.length > 1 ? "Carousel Settings" : "Media Settings"}
                  </div>

                  {mediaMode === "video" && (
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

                  {mediaMode === "images" && mediaFiles.length > 1 && (
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
                multiple={mediaMode !== "video"}
                onChange={(e) => {
                  handleMediaAdd(Array.from(e.target.files));
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </div>

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

            {/* Title input - Enhanced visibility with subtle background */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
                color: title ? "#fff" : "rgba(255,255,255,0.6)",
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
                e.target.style.border = "1px solid rgba(192, 192, 192, 0.3)";
                e.target.style.boxShadow =
                  "0 4px 12px rgba(192, 192, 192, 0.15)";
                e.target.style.color = "#fff";
              }}
              onBlur={(e) => {
                e.target.style.background = "rgba(255,255,255,0.03)";
                e.target.style.border = "1px solid rgba(255,255,255,0.08)";
                e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
                e.target.style.color = title ? "#fff" : "rgba(255,255,255,0.6)";
              }}
            />

            {/* Description textarea - More visual but subtle */}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
                e.target.style.border = "1px solid rgba(192, 192, 192, 0.3)";
                e.target.style.boxShadow =
                  "0 4px 12px rgba(192, 192, 192, 0.15)";
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
                    showToast(
                      `Timezone: ${tzInfo.tzName} ${tzInfo.city}`,
                      "info",
                    );
                  }}
                  style={{
                    padding: "8px 12px",
                    background: "rgba(192, 192, 192, 0.1)",
                    borderRadius: "8px",
                    border: "1px solid rgba(192, 192, 192, 0.2)",
                    fontSize: "10px",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  onTouchStart={(e) => {
                    e.target.style.background = "rgba(192, 192, 192, 0.15)";
                  }}
                  onTouchEnd={(e) => {
                    e.target.style.background = "rgba(192, 192, 192, 0.1)";
                  }}
                >
                  <SilverIcon as={Globe} size={14} />
                  <span style={{ fontWeight: 600, color: "#e5e5e5" }}>
                    {tzInfo.tzName}
                  </span>
                  <span style={{ opacity: 0.7, fontSize: "9px" }}>
                    {tzInfo.city}
                  </span>
                </button>
              </div>
            </div>

            {/* Socials Section */}
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

            {/* Event Settings Section */}
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
                      marginTop: "16px",
                      padding: "24px",
                      borderRadius: "16px",
                      border: "1px solid rgba(192, 192, 192, 0.2)",
                      background:
                        "linear-gradient(135deg, rgba(192, 192, 192, 0.08) 0%, rgba(232, 232, 232, 0.05) 100%)",
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
                      <SilverIcon as={UtensilsCrossed} size={20} />
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
                              time: "",
                              maxSeats: dinnerMaxSeatsPerSlot || "",
                              maxGuestsPerBooking: dinnerMaxGuestsPerBooking || "",
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

                        const MiniStepper = ({ label, value, onMinus, onPlus, disableMinus, disablePlus }) => (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                            <span style={{ fontSize: "10px", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>{label}</span>
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
                                    <div style={{ position: "relative", flex: 1, cursor: "pointer" }}
                                      onClick={(e) => {
                                        const input = e.currentTarget.querySelector('input[type="time"]');
                                        if (input) { input.showPicker?.(); input.focus(); }
                                      }}
                                    >
                                      <input
                                        className="cuisine-time-input"
                                        ref={index === 0 ? dinnerStartTimeInputRef : null}
                                        type="time"
                                        value={dinnerSlotsConfig[index]?.time || ""}
                                        onChange={(e) => updateSlotField(index, "time", e.target.value)}
                                        required={dinnerEnabled}
                                        style={{
                                          ...inputStyle, fontSize: "14px", padding: "8px 12px 8px 36px",
                                          width: "100%", height: "38px", color: "transparent", cursor: "pointer",
                                          boxSizing: "border-box", background: "rgba(255,255,255,0.04)",
                                          border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px",
                                          appearance: "none", WebkitAppearance: "none", MozAppearance: "textfield",
                                          position: "relative", zIndex: 2,
                                        }}
                                      />
                                      <div style={{
                                        position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
                                        pointerEvents: "none", zIndex: 3, opacity: 0.6,
                                      }}>
                                        <SilverIcon as={Clock} size={16} />
                                      </div>
                                      <div style={{
                                        position: "absolute", left: "36px", top: "50%", transform: "translateY(-50%)",
                                        pointerEvents: "none", zIndex: 3, fontSize: "13px",
                                        color: dinnerSlotsConfig[index]?.time ? "#fff" : "rgba(255,255,255,0.4)",
                                      }}>
                                        {getSlotTimeDisplay(index) || "Slot time *"}
                                      </div>
                                    </div>
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
                                    />
                                    <MiniStepper
                                      label="Max/booking"
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
              {/* tickets */}
              <OptionRow
                icon={<SilverIcon as={Ticket} size={20} />}
                label="Sell tickets to this event"
                right={
                  <Toggle
                    checked={sellTicketsEnabled}
                    onChange={setSellTicketsEnabled}
                  />
                }
              />

              {sellTicketsEnabled && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "24px",
                    borderRadius: "16px",
                    border: "1px solid rgba(192, 192, 192, 0.2)",
                    background:
                      "linear-gradient(135deg, rgba(192, 192, 192, 0.08) 0%, rgba(232, 232, 232, 0.05) 100%)",
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
                    <SilverIcon as={Ticket} size={20} />
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        opacity: 0.9,
                      }}
                    >
                      Ticket Configuration
                    </div>
                  </div>

                  {/* Stripe Connection Check */}
                  {!stripeConnected && (
                    <div
                      style={{
                        padding: "16px",
                        borderRadius: "12px",
                        border: "1px solid rgba(251, 191, 36, 0.3)",
                        background: "rgba(251, 191, 36, 0.1)",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                      }}
                    >
                      <div style={{ flexShrink: 0 }}>
                        <SilverIcon
                          as={AlertTriangle}
                          size={20}
                          style={{ color: "#f59e0b" }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            marginBottom: "6px",
                          }}
                        >
                          Stripe Account Required
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            opacity: 0.8,
                            marginBottom: "12px",
                            lineHeight: "1.5",
                          }}
                        >
                          Connect your Stripe account to accept payments for
                          this event.
                        </div>
                        <button
                          type="button"
                          onClick={handleConnectStripeInline}
                          disabled={stripeConnecting}
                          style={{
                            padding: "8px 16px",
                            borderRadius: "8px",
                            border: "none",
                            background:
                              "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
                            color: "#fff",
                            fontSize: "13px",
                            fontWeight: 600,
                            cursor: stripeConnecting ? "default" : "pointer",
                            opacity: stripeConnecting ? 0.6 : 1,
                            transition: "all 0.2s ease",
                          }}
                        >
                          {stripeConnecting ? "Connecting..." : "Connect Stripe"}
                        </button>
                      </div>
                    </div>
                  )}

                  {stripeConnected && (
                    <div
                      style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        background: "rgba(34, 197, 94, 0.1)",
                        border: "1px solid rgba(34, 197, 94, 0.2)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "12px",
                      }}
                    >
                      <span style={{ color: "#22c55e" }}>✓</span>
                      <span style={{ opacity: 0.9 }}>
                        {stripeBusinessName && <strong>{stripeBusinessName}</strong>}
                        {stripeBusinessName && stripeAccountEmail && " · "}
                        {stripeAccountEmail || "Stripe connected"}
                      </span>
                    </div>
                  )}

                  {/* Price and Currency */}
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
                      Price & Currency
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 120px",
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
                          Ticket Price{" "}
                          <span style={{ color: "#ef4444" }}>*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={ticketPrice}
                          onChange={(e) => setTicketPrice(e.target.value)}
                          placeholder="0.00"
                          required={sellTicketsEnabled}
                          style={{
                            ...inputStyle,
                            fontSize: "14px",
                            padding: "12px 14px",
                            width: "100%",
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
                          Currency <span style={{ color: "#ef4444" }}>*</span>
                        </label>
                        <select
                          value={ticketCurrency}
                          onChange={(e) => setTicketCurrency(e.target.value)}
                          required={sellTicketsEnabled}
                          style={{
                            ...inputStyle,
                            fontSize: "14px",
                            padding: "12px 14px",
                            width: "100%",
                            cursor: "pointer",
                            appearance: "none",
                            backgroundImage:
                              "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23ffffff' stroke-width='1.5' stroke-linecap='round' stroke-opacity='0.5'/%3E%3C/svg%3E\")",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "right 8px center",
                            paddingRight: "28px",
                          }}
                        >
                          <option value="USD">USD ($)</option>
                          <option value="EUR">EUR (€)</option>
                          <option value="GBP">GBP (£)</option>
                          <option value="SEK">SEK (kr)</option>
                          <option value="DKK">DKK (kr)</option>
                          <option value="NOK">NOK (kr)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Info about automatic Stripe creation */}
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: "8px",
                      background: "rgba(192, 192, 192, 0.1)",
                      border: "1px solid rgba(192, 192, 192, 0.2)",
                      fontSize: "12px",
                      opacity: 0.8,
                      lineHeight: "1.5",
                    }}
                  >
                    <strong>
                      <SilverIcon
                        as={Lightbulb}
                        size={14}
                        style={{ verticalAlign: "middle", marginRight: 4 }}
                      />{" "}
                      Automatic Setup:
                    </strong>{" "}
                    When you create this event, a Stripe product and price will
                    be automatically created using the event name, description,
                    and ticket price you've entered above. No manual setup
                    required!
                  </div>
                </div>
              )}

              {/* Submit Button - Mobile-first, prominent */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: "40px",
                  width: "100%",
                  padding: "18px 24px",
                  borderRadius: "14px",
                  border: "none",
                  background: loading
                    ? "#666"
                    : "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "17px",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: loading
                    ? "none"
                    : "0 8px 24px rgba(192, 192, 192, 0.5)",
                  transition: "all 0.3s ease",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  opacity: loading ? 0.7 : 1,
                  minHeight: "56px", // Better touch target
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.target.style.transform = "translateY(-2px)";
                    e.target.style.boxShadow =
                      "0 12px 32px rgba(192, 192, 192, 0.6)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow =
                      "0 8px 24px rgba(192, 192, 192, 0.5)";
                  }
                }}
                onTouchStart={(e) => {
                  if (!loading) {
                    e.target.style.transform = "scale(0.98)";
                  }
                }}
                onTouchEnd={(e) => {
                  if (!loading) {
                    e.target.style.transform = "scale(1)";
                  }
                }}
              >
                {loading ? (isEditMode ? "Saving…" : "Creating…") : (isEditMode ? "SAVE CHANGES" : "CREATE EVENT")}
              </button>
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
                width: desktopPreviewMode === "phone" ? "390px" : "100%",
                height: desktopPreviewMode === "phone" ? "calc(100% - 60px)" : "100%",
                marginTop: desktopPreviewMode === "phone" ? "50px" : "0",
                borderRadius: desktopPreviewMode === "phone" ? "24px" : "0",
                overflow: "hidden",
                border: desktopPreviewMode === "phone"
                  ? "1px solid rgba(255,255,255,0.1)"
                  : "none",
                boxShadow: desktopPreviewMode === "phone"
                  ? "0 20px 60px rgba(0, 0, 0, 0.5)"
                  : "none",
                transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
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
                  : { mode: "carousel", autoscroll: carouselAutoscroll, interval: carouselInterval, loop: carouselLoop }}
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
                rsvpContent={({ onClose }) => (
                  <RsvpForm
                    event={{
                      slug: null,
                      dinnerEnabled: dinnerEnabled,
                      dinnerBookingEmail: dinnerBookingEmail || null,
                      waitlistEnabled: waitlistEnabled,
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
              : { mode: "carousel", autoscroll: carouselAutoscroll, interval: carouselInterval, loop: carouselLoop }}
            ticketType={sellTicketsEnabled ? "paid" : "free"}
            compact
            instagram={instagram}
            spotify={spotify}
            ticketPrice={
              sellTicketsEnabled && ticketPrice
                ? Math.round(parseFloat(ticketPrice) * 100)
                : null
            }
            ticketCurrency={sellTicketsEnabled ? ticketCurrency : null}
            rsvpContent={({ onClose }) => (
              <RsvpForm
                event={{
                  slug: null,
                  dinnerEnabled: dinnerEnabled,
                  dinnerBookingEmail: dinnerBookingEmail || null,
                  waitlistEnabled: waitlistEnabled,
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
        padding: "14px 16px",
        background: "rgba(20, 16, 30, 0.25)",
        borderRadius: "12px",
        marginBottom: "8px",
        border: "1px solid rgba(255,255,255,0.06)",
        transition: "all 0.2s ease",
        minHeight: "56px", // Better touch target for mobile
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
          minWidth: 0, // Allow text to shrink
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
