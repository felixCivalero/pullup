import { useState, useEffect, useRef, useMemo } from "react";
import { getPageKind, PAGE_KINDS } from "../lib/pageKinds.js";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  Instagram,
  Lightbulb,
  Ticket,
  Tag,
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
  Trash2,
  Phone,
  Building2,
  Cake,
  AtSign,
  MessageSquare,
} from "lucide-react";
import { FaInstagram, FaSpotify, FaTiktok, FaSoundcloud } from "react-icons/fa";
import { FaXTwitter, FaLinkedinIn } from "react-icons/fa6";
import { EventPreview } from "../components/EventPreview";
import { DesktopEventLayout } from "../components/DesktopEventLayout";
import { VideoPlayer } from "../components/MediaCarousel";
import { normalizePhoneMode, normalizeDesktopMode } from "../components/mediaFormat";
import { RsvpForm } from "../components/RsvpForm";
import { useToast } from "../components/Toast";
import { AuthGate } from "../components/auth/AuthGate.jsx";
import { useHostActions } from "../lib/useHostActions.js";
import { useSetHostResource } from "../contexts/useHostResource.js";
import { useAuth } from "../contexts/AuthContext";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { CreateWizard } from "../components/CreateWizard.jsx";
import { EventAutoDmPanel } from "../components/EventAutoDmPanel.jsx";
import { ProductPricePanel } from "../components/ProductPricePanel.jsx";
import { SilverIcon } from "../components/ui/SilverIcon.jsx";
import { authenticatedFetch } from "../lib/api.js";
import { AI_CREATE_ENABLED } from "../lib/featureFlags.js";
import { colors } from "../theme/colors.js";
import { ChannelBadge, CHANNEL_BRAND } from "../components/ChannelBadge.jsx";
import {
  formatRelativeTime,
  formatReadableDateTime,
  formatEventTime,
} from "../lib/dateUtils.js";
import {
  uploadEventImage,
  validateMediaFile,
  uploadEventMedia,
  deleteEventMedia,
  reorderEventMedia,
  generateVideoThumbnail,
  compressImage,
  validateImageFile,
  uploadEventMediaDirect,
  uploadEventImageDirect,
  processImageForUpload,
} from "../lib/imageUtils.js";
import {
  isNetworkError,
  handleNetworkError,
  handleApiError,
} from "../lib/errorHandler.js";
import { fetchTimezoneForLocation } from "../lib/timezone.js";
import { parseCoordinates, formatCoordinates } from "../lib/urlUtils";

// Paste-coordinates field for the location editor. Lets a host who has the exact
// pin (but no precise street address) type/paste "59.3293, 18.0686" and have it
// flow into locationLat/locationLng. Keeps its own text state so the host can
// type freely; re-syncs when coords change from the map/search picker.
function CoordinatePaste({ lat, lng, colors, onApply }) {
  const [text, setText] = useState(() => formatCoordinates(lat, lng));
  const [error, setError] = useState(false);
  useEffect(() => {
    setText(formatCoordinates(lat, lng));
  }, [lat, lng]);
  const handle = (val) => {
    setText(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setError(false);
      return;
    }
    const parsed = parseCoordinates(trimmed);
    if (parsed) {
      setError(false);
      onApply(parsed);
    } else {
      setError(true);
    }
  };
  return (
    <div style={{ marginTop: "8px" }}>
      <input
        type="text"
        value={text}
        onChange={(e) => handle(e.target.value)}
        placeholder="Paste coordinates — e.g. 59.3293, 18.0686"
        style={{ width: "100%", boxSizing: "border-box", background: colors.surface, border: `1px solid ${error ? "rgba(239,68,68,0.6)" : colors.border}`, borderRadius: "8px", color: colors.text, fontSize: "12px", padding: "8px 10px", outline: "none", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
      />
      <div style={{ fontSize: "11px", color: error ? "rgba(239,68,68,0.9)" : colors.textFaded, marginTop: "5px", lineHeight: 1.4 }}>
        {error
          ? 'Couldn’t read that — try "lat, lng" like 59.3293, 18.0686'
          : "Shown on the page, in the RSVP email, and in shares."}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: `1px solid rgba(10,10,10,0.14)`,
  background: "#fff",
  color: "rgba(10,10,10,0.87)",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
};

const focusedInputStyle = {
  ...inputStyle,
  border: `1px solid rgba(236,23,143,0.40)`,
  boxShadow: "0 0 0 3px rgba(236,23,143,0.10)",
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

// ─── RSVP form-fields builder ───────────────────────────────────────
// Form fields collected at RSVP time. Name is always required; the
// contact field (email / phone / both) is driven by event.contactChannel.
// All locked fields render as drag-locked rows that can be reordered
// alongside custom fields. They live in the same array under sentinel ids.
const NAME_FIELD_ID = "__name__";
const EMAIL_FIELD_ID = "__email__";
const PHONE_FIELD_ID = "__phone__";
const LOCKED_FIELD_IDS = new Set([NAME_FIELD_ID, EMAIL_FIELD_ID, PHONE_FIELD_ID]);
const isLockedFieldId = (id) => LOCKED_FIELD_IDS.has(id);
const makeNameField  = () => ({ id: NAME_FIELD_ID,  type: "name",  label: "Full name", iconKey: "name",  required: true, locked: true });
const makeEmailField = () => ({ id: EMAIL_FIELD_ID, type: "email", label: "Email",     iconKey: "email", required: true, locked: true });
const makePhoneField = () => ({ id: PHONE_FIELD_ID, type: "phone", label: "WhatsApp number", iconKey: "phone", required: true, locked: true, verify: "whatsapp" });

// Normalise a fields array so the locked rows match the contact channel.
// 'email'    → locked: Name, Email
// 'whatsapp' → locked: Name, Phone (verified via WA magic-link at RSVP)
// 'both'     → locked: Name, Email, Phone
//
// Any pre-existing unlocked `phone`-preset field is removed when the
// channel locks Phone (it would duplicate); same for an old email field.
const withLockedFields = (fields, channel = "email") => {
  const list = Array.isArray(fields) ? [...fields] : [];
  const channelWantsEmail = channel === "email" || channel === "both";
  const channelWantsPhone = channel === "whatsapp" || channel === "both";

  // Drop any locked sentinels — we'll re-prepend below.
  const rest = list.filter((f) => f && !isLockedFieldId(f.id));

  // If the channel locks phone, drop any optional `phone`-preset duplicates.
  const cleaned = channelWantsPhone
    ? rest.filter((f) => f.type !== "phone")
    : rest;

  const prefix = [makeNameField()];
  if (channelWantsEmail) prefix.push(makeEmailField());
  if (channelWantsPhone) prefix.push(makePhoneField());
  return [...prefix, ...cleaned];
};

const FORM_FIELD_PRESETS = [
  { type: "instagram", label: "Instagram", placeholder: "Your Instagram username",        iconKey: "instagram", color: "#E1306C" },
  { type: "phone",     label: "Phone",     placeholder: "Phone number",                   iconKey: "phone",     color: "#a3e635" },
  { type: "twitter",   label: "X",         placeholder: "Your X username",                iconKey: "twitter",   color: "#fff"    },
  { type: "tiktok",    label: "TikTok",    placeholder: "Your TikTok username",           iconKey: "tiktok",    color: "#69C9D0" },
  { type: "linkedin",  label: "LinkedIn",  placeholder: "LinkedIn profile URL",           iconKey: "linkedin",  color: "#0A66C2" },
  { type: "company",   label: "Company",   placeholder: "Company / where you work",       iconKey: "company",   color: "#c0c0c0" },
  { type: "birthday",  label: "Birthday",  placeholder: "Birthday",                       iconKey: "birthday",  color: "#f59e0b", inputType: "date" },
  { type: "custom",    label: "Custom",    placeholder: "Your answer",                    iconKey: "custom",    color: "#a3e635" },
];

function FormFieldIcon({ iconKey, size = 16, color = "rgba(10,10,10,0.45)" }) {
  const map = {
    name: AtSign,
    email: AtSign,
    instagram: FaInstagram,
    twitter: FaXTwitter,
    tiktok: FaTiktok,
    linkedin: FaLinkedinIn,
    phone: Phone,
    company: Building2,
    birthday: Cake,
    custom: MessageSquare,
  };
  const Icon = map[iconKey] || MessageSquare;
  return <Icon size={size} style={{ color, flexShrink: 0 }} />;
}

function makeFieldId() {
  return "ff_" + Math.random().toString(36).slice(2, 10);
}

// Compact segmented control used by the Format/crop settings.
function SegmentedChoice({ value, onChange, options }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${options.length}, 1fr)`,
      gap: "3px",
      padding: "3px",
      background: colors.surfaceMuted,
      border: `1px solid ${colors.border}`,
      borderRadius: "8px",
    }}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              padding: "7px 4px",
              borderRadius: "5px",
              border: "none",
              background: active ? "#fff" : "transparent",
              color: active ? colors.text : colors.textSubtle,
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s ease, color 0.15s ease",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              boxShadow: active ? `0 1px 3px rgba(10,10,10,0.08)` : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Visual format picker — same job as SegmentedChoice, but each option renders
// the host's actual cover still inside a little window shaped/cropped exactly
// like that mode renders it on the real page. The picture IS the explanation:
// crop-vs-letterbox (phone) and tall-vs-wide window (desktop) are obvious at a
// glance, so "Fit / Real" stops being a guessing game. `thumb` is any still
// (image cover or video thumbnail); options carry their own frame geometry.
function FormatChoice({ value, onChange, options, thumb }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${options.length}, 1fr)`,
      gap: "8px",
    }}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              padding: "8px",
              textAlign: "left",
              borderRadius: "12px",
              cursor: "pointer",
              background: active ? colors.accentSoft : colors.surface,
              border: `1.5px solid ${active ? colors.accent : colors.border}`,
              boxShadow: active ? colors.accentShadow : "none",
              transition: "background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
            }}
          >
            {/* Stage: neutral backdrop so the window's shape reads clearly */}
            <div style={{
              height: "84px",
              borderRadius: "8px",
              background: colors.surfaceMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              boxShadow: active
                ? `inset 0 0 0 1.5px ${colors.accentBorder}`
                : "inset 0 0 0 1px rgba(10,10,10,0.05)",
              transition: "box-shadow 0.18s ease",
            }}>
              {/* The window — shaped (4:5 / 16:9 / phone) per option */}
              <div style={{
                ...opt.frameStyle,
                borderRadius: "5px",
                overflow: "hidden",
                background: "#0a0913",
                boxShadow: "0 2px 6px rgba(10,10,10,0.18)",
                flexShrink: 0,
              }}>
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: opt.objectFit,
                      display: "block",
                    }}
                  />
                ) : (
                  <div style={{
                    width: "100%",
                    height: "100%",
                    background: "radial-gradient(circle at 35% 30%, rgba(236,23,143,0.22), transparent 70%), #14111c",
                  }} />
                )}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{
                fontSize: "12px",
                fontWeight: 700,
                color: active ? colors.accent : colors.text,
              }}>
                {opt.label}
              </span>
              <span style={{ fontSize: "10.5px", lineHeight: 1.3, color: colors.textSubtle }}>
                {opt.caption}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// focus key → editor step number. Used by the floating PullUp widget: when
// the host clicks "Add interactive widgets like Spotify" from inside the
// editor, the widget rewrites the URL to ?focus=details, this map sends the
// editor to step 2, and the host lands where they need to be.
const FOCUS_TO_STEP = {
  media: 1,    // cover / video upload
  details: 2,  // title, location, date, description, sections (incl. vibe links)
  form: 3,     // RSVP form fields
  tickets: 5,  // capacity, plus-ones, paid ticketing
};
const FOCUS_TO_FIELD_FLASH = {
  media: "media",
  // details/form/tickets don't have a single field to flash — the tab
  // switch is the cue.
};

// The parts rail — the editor's spine, reframed. Instead of abstract "steps,"
// the left rail is a table-of-contents of the page itself: the visible PARTS
// you point at up top, the behind-the-scenes SIGN-UP behaviours below. Each
// entry routes into the existing step editor (step), optionally scrolling to a
// specific sub-part (anchor). Items can share a step — `id` disambiguates which
// one the rail highlights.
const RAIL_GROUPS = [
  {
    group: "The page",
    items: [
      { id: "cover", label: "Cover", icon: ImageIcon, step: 1 },
      // Title, date, place, links, text all live as reorderable blocks in the
      // sections builder — so this one editor IS the page body.
      { id: "content", label: "Content", icon: Type, step: 2, anchor: "part-sections" },
    ],
  },
  {
    group: "Sign-up",
    items: [
      // Capacity + access live here now (tickets are paused, and the essentials
      // are captured up front in the new-event wizard). Kept reachable so
      // existing events can still tweak the form, capacity and options.
      { id: "collect", label: "Sign-up & access", icon: ClipboardList, step: 3 },
    ],
  },
  {
    group: "Sell",
    items: [
      // Product pages only (registry: product.parts includes "price"). Price +
      // currency + the four delivery forms. Shares step 3, own panel via
      // activePartId === "price".
      { id: "price", label: "Price & delivery", icon: Tag, step: 3 },
    ],
  },
  {
    group: "Promote",
    items: [
      // Auto-DM lives in the same step as sign-up (step 3) but toggles its own
      // panel via activePartId; tinted Instagram so it reads as the IG feature.
      { id: "autoDm", label: "Instagram Auto-DM", icon: Instagram, step: 3, tint: colors.instagram },
    ],
  },
];
const RAIL_ITEMS = RAIL_GROUPS.flatMap((g) => g.items);
const firstPartForStep = (step) => RAIL_ITEMS.find((it) => it.step === step)?.id || null;

export function CreateEventPage() {
  const navigate = useNavigate();
  const { id: editEventId } = useParams(); // present when editing
  const [searchParams, setSearchParams] = useSearchParams();
  const isEditMode = !!editEventId;
  const { showToast } = useToast();
  const { setEventNav } = useEventNav();
  const { user } = useAuth();
  const [editLoading, setEditLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  // Event identity for the header "Live" button (edit mode). Status drives its
  // label: DRAFT -> "Show preview", PUBLISHED -> "Live" (+ "preview changes"
  // once there are unsaved edits).
  const [eventTitle, setEventTitle] = useState(null);
  const [eventSlug, setEventSlug] = useState(null);
  const [eventStatus, setEventStatus] = useState(null);
  // Page kind ('event' default). A loaded kind='community' row turns this editor
  // into the community page editor: no date/location, "Join" CTA. Set from the
  // loaded row (community pages are always edited, never freshly created here).
  // Read the kind from the create picker (?kind=product) SYNCHRONOUSLY so the
  // editor opens product-shaped on the first paint — no event-wizard flash. Edit
  // mode overrides this from the loaded row.
  const [eventKind, setEventKind] = useState(() => {
    if (typeof window === "undefined") return "event";
    const k = new URLSearchParams(window.location.search).get("kind");
    return k && PAGE_KINDS[k] ? k : "event";
  });
  const isCommunity = eventKind === "community";
  // A community has no room of its own — it IS the creator's main room. So
  // publishing/leaving the community editor lands in the main room, not an
  // event room.
  const mainRoomPath = user?.id ? `/r/${user.id}` : "/room";
  const afterPublishPath = (eventId) => (isCommunity ? mainRoomPath : `/events/${eventId}/room`);
  const publishToast = () => (isCommunity ? "Your community is live!" : "Published — your event is live!");
  // The rail, filtered to this kind's parts (registry-driven). Events get the
  // full rail unchanged; a community drops the event-only tools (e.g. Auto-DM).
  const railGroups = useMemo(() => {
    if (eventKind === "event") return RAIL_GROUPS;
    const allowed = new Set(getPageKind(eventKind).parts);
    return RAIL_GROUPS
      .map((g) => ({ ...g, items: g.items.filter((it) => allowed.has(it.id)) }))
      .filter((g) => g.items.length);
  }, [eventKind]);

  // New page from the create picker: ?kind=product opens the editor in product
  // mode (community has its own /community route). The kind is pinned at draft
  // creation (POST /events) — never edited after. On an existing page the kind
  // comes from the loaded row, so this only applies to fresh creates.
  useEffect(() => {
    if (isEditMode) return;
    const k = searchParams.get("kind");
    if (k && PAGE_KINDS[k] && k !== "event") setEventKind(k);
  }, [isEditMode, searchParams]);

  // PullUp coach widget hands off into the editor by appending ?focus=<key>.
  // Read it, flip to the matching tab, briefly gold-flash a relevant field
  // for media (the only step with a single visual cue), then clear the param
  // so a refresh doesn't re-fire the jump.
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus || !isEditMode) return;
    const stepNum = FOCUS_TO_STEP[focus];
    if (stepNum) {
      setStepDirection("forward");
      setCurrentStep(stepNum);
    }
    const flashField = FOCUS_TO_FIELD_FLASH[focus];
    if (flashField) {
      setGoldFlash((prev) => ({ ...prev, [flashField]: true }));
      setTimeout(() => {
        setGoldFlash((prev) => {
          const next = { ...prev };
          delete next[flashField];
          return next;
        });
      }, 1400);
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("focus");
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isEditMode]);

  // Returning from the Instagram connect round-trip (Settings or this editor's
  // Auto-DM panel both come back here): ?panel=<railId> re-opens that rail panel
  // so the host lands exactly where they left off, and ?ig=<status> surfaces the
  // connect outcome. Both params are cleared afterwards so a refresh won't refire.
  useEffect(() => {
    const panel = searchParams.get("panel");
    const ig = searchParams.get("ig");
    if (!panel && !ig) return;

    if (panel && RAIL_ITEMS.some((it) => it.id === panel)) {
      // Pinning syncs currentStep + activePartId via the openPartId effect below.
      setPinnedPartId(panel);
    }

    if (ig) {
      const outcome = {
        connected: ["Instagram connected", "success"],
        denied: ["Instagram connection cancelled", "error"],
        error: ["Couldn't finish connecting Instagram — try again", "error"],
        bad_state: ["That connection link expired — try again", "error"],
        no_code: ["Couldn't finish connecting Instagram — try again", "error"],
      }[ig];
      if (outcome) showToast(outcome[0], outcome[1]);
    }

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("panel");
        next.delete("ig");
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // (Coach-widget resource registration lives lower, after draftEventId is
  // declared, so create-mode drafts can register too — see below.)

  // Live notice when MCP edits/publishes this event from chat. The editor
  // is the one surface where auto-overwrite would clobber in-flight edits,
  // so we surface a banner instead — host chooses when to refresh.
  const [chatActivity, setChatActivity] = useState(null);
  useHostActions({
    enabled: isEditMode && !!editEventId,
    targetType: "event",
    targetId: editEventId,
    tools: [
      "update_event",
      "publish_event",
      "unpublish_event",
      "upload_event_image",
      "upload_event_media",
    ],
    onInsert: (row) => setChatActivity(row),
  });
  const [profileChecked, setProfileChecked] = useState(true);
  const [showPublishAuth, setShowPublishAuth] = useState(false);
  const [pendingPublishAfterAuth, setPendingPublishAfterAuth] = useState(false);
  const [detailsTabPulse, setDetailsTabPulse] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // After OAuth redirect: pick up the pendingPublish flag and auto-resume.
  // Profile is guaranteed complete by onboarding, so no profile gate here.
  useEffect(() => {
    if (!user || isEditMode) return;
    try {
      const raw = localStorage.getItem("pullup_event_draft");
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.pendingPublish) {
        draft.pendingPublish = false;
        localStorage.setItem("pullup_event_draft", JSON.stringify(draft));
        setPendingPublishAfterAuth(true);
      }
    } catch {}
  }, [user, isEditMode]);

  // Auto-publish after OAuth redirect when profile is already complete
  const publishRef = useRef(false);
  useEffect(() => {
    if (pendingPublishAfterAuth && !publishRef.current) {
      publishRef.current = true;
      // Small delay to ensure form state is restored from draft
      setTimeout(() => handleCreate(null), 300);
    }
  }, [pendingPublishAfterAuth]);

  const [showStartDateTimePicker, setShowStartDateTimePicker] = useState(false);
  const [showEndDateTimePicker, setShowEndDateTimePicker] = useState(false);
  const fileInputRef = useRef(null);
  const startDateTimeInputRef = useRef(null);
  const endDateTimeInputRef = useRef(null);
  const dinnerStartTimeInputRef = useRef(null);
  const dinnerEndTimeInputRef = useRef(null);

  // "Create event" ALWAYS starts a brand-new event. The only reason to restore
  // a saved localStorage draft is the OAuth publish round-trip — Google sign-in
  // redirects back to /create with `pendingPublish` set, and we need the form
  // state back to finish publishing. Any other saved draft is from a previous
  // session and is already a real DRAFT in the Room (we persist on naming), so
  // resuming it belongs to the Room's "Finish & publish" card (edit mode), not
  // here. Discard it so every create is genuinely fresh.
  const draft = !isEditMode ? (() => {
    try {
      const raw = localStorage.getItem("pullup_event_draft");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const stale = parsed._savedAt && Date.now() - parsed._savedAt > 24 * 60 * 60 * 1000;
      if (!parsed.pendingPublish || stale) {
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

  const [title, setTitle] = useState(draft?.title || "Event Name");
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
        { type: "text", title: "Headline", text: "A short description about something that describes something in short.\n\nCan also be longer if you like it." },
      ];
    }
    return [...defaults, ...saved];
  });
  // showSectionPicker state removed — grid is always visible
  const [location, setLocation] = useState(draft?.location || "Slakthusomr\u00e5det");
  const [locationLat, setLocationLat] = useState(draft?.locationLat || null);
  const [locationLng, setLocationLng] = useState(draft?.locationLng || null);
  const [locationPlaceId, setLocationPlaceId] = useState(draft?.locationPlaceId || null);
  const [hideLocation, setHideLocation] = useState(draft?.hideLocation || false);
  const [showCoordinates, setShowCoordinates] = useState(draft?.showCoordinates || false);
  const [startsAt, setStartsAt] = useState(() => {
    // Always start at tomorrow 19:00 local — overwritten by the load path in
    // edit mode. Intentionally ignores any stale draft value.
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T19:00`;
  });
  const [endsAt, setEndsAt] = useState(draft?.endsAt || "");
  const [timezone, setTimezone] = useState(draft?.timezone || getUserTimezone());
  const [maxAttendees, setMaxAttendees] = useState(draft?.maxAttendees || "");

  // Tickets (payments v2). The ticket surface only exists when the backend
  // says the rail-agnostic checkout is live — otherwise events stay free
  // exactly as during the paid-tickets pause. The sellTicketsEnabled /
  // ticketPrice / ticketCurrency states (major units) already exist below;
  // this flag is what un-hides them.
  const [paymentsV2Live, setPaymentsV2Live] = useState(false);
  useEffect(() => {
    let alive = true;
    import("../lib/api.js").then(({ publicFetch }) =>
      publicFetch("/payments/v2/config")
        .then((r) => r.json())
        .then((cfg) => { if (alive) setPaymentsV2Live(!!cfg?.enabled); })
        .catch(() => {})
    );
    return () => { alive = false; };
  }, []);
  const [waitlistEnabled, setWaitlistEnabled] = useState(draft?.waitlistEnabled || false);
  const [instantWaitlist, setInstantWaitlist] = useState(draft?.instantWaitlist || false);
  const [hideDate, setHideDate] = useState(draft?.hideDate || false);
  const [revealHint, setRevealHint] = useState(draft?.revealHint || "");
  const [dateRevealHint, setDateRevealHint] = useState(draft?.dateRevealHint || "");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]); // [{file, preview, mediaType, id}]
  const [mediaMode, setMediaMode] = useState(null); // null | "images" | "video"
  // Video settings
  const [videoLoop, setVideoLoop] = useState(true);
  const [videoAutoplay, setVideoAutoplay] = useState(true);
  const [videoAudio, setVideoAudio] = useState(false);
  const [customThumbnail, setCustomThumbnail] = useState(null); // { file, preview }

  // AI scene (events.scene). Generated by the assistant / MCP set_event_scene
  // and rendered here in the preview. null = standard cover/no scene. The old
  // host "brand design" theming (colors/fonts) has been removed.
  const [scene, setScene] = useState(draft?.scene || null);

  // Create-mode: a DRAFT event is lazily created the moment the first media
  // is added, so media uploads straight to storage (no in-memory-only files,
  // no "leaving page loses your media", and the preview shows real content).
  // Publish = flip this draft DRAFT→PUBLISHED. Edit mode ignores all this.
  const [draftEventId, setDraftEventId] = useState(draft?.draftEventId || null);
  // Draft slug (for the header's "Preview" link) + server-sync status (for the
  // "saved/saving" indicator). Surfaced to the header via pullup:draft-status.
  const [draftSlug, setDraftSlug] = useState(draft?.draftSlug || null);
  const [draftSaveStatus, setDraftSaveStatus] = useState("idle"); // idle | saving | saved
  const draftEventIdRef = useRef(null);   // sync mirror for async upload paths
  const draftCreationRef = useRef(null);  // in-flight creation promise (dedupe)
  // Bumped when the canvas chat builds something server-side, so the live
  // preview re-pulls from the server (see the loadEvent effect deps).
  const [canvasRefresh, setCanvasRefresh] = useState(0);

  // Declare this page's resource to the floating coach widget so it can flip
  // to "PullUp coach" mode if chat has recently touched this event. Covers
  // BOTH the event being edited and the create-mode draft — so the AI canvas
  // gets the same coach suggestions whether you're creating or updating.
  useSetHostResource(
    (() => {
      const id = isEditMode ? editEventId : draftEventId;
      return id ? { type: "event", id } : null;
    })(),
  );
  const thumbnailInputRef = useRef(null);
  // Carousel settings
  const [carouselAutoscroll, setCarouselAutoscroll] = useState(true);
  const [carouselInterval, setCarouselInterval] = useState(5);
  const [carouselLoop, setCarouselLoop] = useState(true);
  const [carouselTransitions, setCarouselTransitions] = useState([]); // per-gap: "slide"|"fade"|"zoom"|"pixelate"
  // Upload progress — keyed by mediaItem.id; 0–100 while in-flight.
  const [uploadProgress, setUploadProgress] = useState({});
  // Aggregate status shown on the Publish button while uploads run.
  const [uploadStatus, setUploadStatus] = useState(null); // null | { done: number, total: number }
  // Crop/format settings — independent per screen, nested under mediaSettings.
  // mode is one of width | height | card (see components/mediaFormat.js):
  //   width  → frame takes the media's own aspect (whole, no crop, no bars)
  //   height → fill the available height, crop the sides (drag to reposition)
  //   card   → fixed 4:5 card, crop to fill (drag to reposition)
  // Focus is stored as percentages (0–100). 50/50 = center; only meaningful in
  // the crop modes (height/card).
  const [phoneMode, setPhoneMode] = useState("height"); // width | height | card
  const [phoneFocusX, setPhoneFocusX] = useState(50);
  const [phoneFocusY, setPhoneFocusY] = useState(50);
  const [desktopMode, setDesktopMode] = useState("card"); // width | height | card
  const [desktopFocusX, setDesktopFocusX] = useState(50);
  const [desktopFocusY, setDesktopFocusY] = useState(50);

  // Build the mediaSettings object — single source of truth for both save and preview.
  function buildMediaSettings() {
    const playback = mediaMode === "video"
      ? { mode: "video", loop: videoLoop, autoplay: videoAutoplay, audio: videoAudio }
      : mediaMode === "images" && mediaFiles.length > 1
        ? { mode: "carousel", autoscroll: carouselAutoscroll, interval: carouselInterval, loop: carouselLoop, transitions: carouselTransitions }
        : {};
    return {
      ...playback,
      phone: { mode: phoneMode, focusX: phoneFocusX, focusY: phoneFocusY },
      desktop: { mode: desktopMode, focusX: desktopFocusX, focusY: desktopFocusY },
    };
  }

  // Drag-to-pan callback factory. Renderers call this with pixel deltas and the
  // frame size; we convert to a percent change in the focus point and clamp.
  // Drag direction is inverted (pan), matching how users expect to scroll the
  // visible window across an image.
  function makeFocusDragHandler(view) {
    return (dx, dy, frameW, frameH) => {
      const dxPct = -((dx / Math.max(frameW, 1)) * 100);
      const dyPct = -((dy / Math.max(frameH, 1)) * 100);
      if (view === "phone") {
        setPhoneFocusX((v) => Math.max(0, Math.min(100, v + dxPct)));
        setPhoneFocusY((v) => Math.max(0, Math.min(100, v + dyPct)));
      } else {
        setDesktopFocusX((v) => Math.max(0, Math.min(100, v + dxPct)));
        setDesktopFocusY((v) => Math.max(0, Math.min(100, v + dyPct)));
      }
    };
  }
  const [theme] = useState("minimal");
  const [calendar] = useState("personal");
  const [visibility] = useState("public");
  const [sellTicketsEnabled, setSellTicketsEnabled] = useState(draft?.sellTicketsEnabled || false);
  const [ticketPrice, setTicketPrice] = useState(draft?.ticketPrice || "");
  const [ticketCurrency, setTicketCurrency] = useState(draft?.ticketCurrency || "SEK");
  // Digital-product delivery config (kind='product'). Authored in the price
  // part; reuses ticketPrice/ticketCurrency for the charge, adds the four
  // delivery forms. See ProductPricePanel + events.fulfillment (mig 095).
  const [fulfillment, setFulfillment] = useState(draft?.fulfillment || null);
  // A product IS inherently paid (no sell-tickets toggle): a real price alone
  // makes it paid. An event still gates behind the explicit sell toggle.
  const isProductKind = eventKind === "product";
  const isPaidEvent =
    (isProductKind ? true : sellTicketsEnabled) && ticketPrice && parseFloat(ticketPrice) > 0;
  // Paid only when payments v2 is live AND a real price is set — the payload
  // and previews key off this so flag-off behavior stays identical to the pause.
  const ticketsArePaid = paymentsV2Live && isPaidEvent;

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
  const [contactChannel, setContactChannelRaw] = useState(
    ["email", "whatsapp", "both"].includes(draft?.contactChannel) ? draft.contactChannel : "email",
  );
  const [formFields, setFormFields] = useState(
    withLockedFields(draft?.formFields, draft?.contactChannel || "email"),
  );
  // RSVP form: Name is always required. Email + WhatsApp are the reach floor —
  // at least one MUST be required so every guest is reachable (enforced at
  // publish). Email defaults to required; WhatsApp / Instagram default optional.
  const [requireEmail, setRequireEmail] = useState(draft?.requireEmail !== false);
  const [requirePhone, setRequirePhone] = useState(!!draft?.requirePhone);
  const [requireInstagram, setRequireInstagram] = useState(!!draft?.requireInstagram);
  // Whether WhatsApp / Instagram are collected at all (false = Off, removed from
  // the form). With require* this gives each a 3-state Off/Optional/Required.
  const [collectPhone, setCollectPhone] = useState(draft?.collectPhone !== false);
  const [collectInstagram, setCollectInstagram] = useState(draft?.collectInstagram !== false);
  // On-page sign-up surface control (mig 096). hidden suppresses the inline
  // block AND the sticky bottom bar together; the two strings override the
  // eyebrow ("Free to join") and the button text. Empty = kind-derived default.
  const [signupHidden, setSignupHidden] = useState(!!draft?.signupHidden);
  const [signupLabelText, setSignupLabelText] = useState(draft?.signupLabel || "");
  const [signupCtaText, setSignupCtaText] = useState(draft?.signupCta || "");
  // Host-authored enrichment questions (mig 077) — free-text prompts shown below
  // the four sacred anchors. NOT identity; answers ride home in custom_answers.
  const [enrichmentQuestions, setEnrichmentQuestions] = useState(
    Array.isArray(draft?.enrichmentQuestions) ? draft.enrichmentQuestions : [],
  );

  const [loading, setLoading] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isMounted, setIsMounted] = useState(false);
  const [expandAnim, setExpandAnim] = useState(() => {
    try {
      const raw = sessionStorage.getItem("pullup_editor_origin");
      if (raw) {
        sessionStorage.removeItem("pullup_editor_origin");
        return JSON.parse(raw);
      }
    } catch {}
    return null;
  });
  const [mobileView, setMobileView] = useState("edit"); // "edit" or "preview"
  const [desktopPreviewMode, setDesktopPreviewMode] = useState("phone"); // "desktop" or "phone"
  // The flyout panel is a floating OVERLAY on desktop (so opening it never
  // reflows the preview — no left/right jump). On mobile the editor stays
  // in-flow (always-open), matching responsive.css. 969px = the create-layout
  // breakpoint.
  const [isDesktopEditor, setIsDesktopEditor] = useState(() => window.innerWidth >= 969);
  useEffect(() => {
    const onResize = () => setIsDesktopEditor(window.innerWidth >= 969);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [currentStep, setCurrentStep] = useState(draft?.currentStep || 1);
  const [stepDirection, setStepDirection] = useState("forward");
  // The guided first-run wizard fronts a brand-new event (name/when/where/who)
  // before the editor. Only for fresh creates — edit + duplicate skip it. Once
  // dismissed (done or "set up later") it's marked done in the draft so a
  // refresh mid-create doesn't re-trap the host.
  const [wizardDone, setWizardDone] = useState(!!draft?.wizardDone);
  const [wizardActive, setWizardActive] = useState(!isEditMode && !draft?.wizardDone);
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

  // --- Unsaved-edit tracking (edit mode) -------------------------------------
  // Serialize the editable fields into one string. We snapshot this once the
  // event finishes loading; any later divergence means the host has unsaved
  // edits, which the header "Live" button surfaces as "preview changes".
  const formSnapshot = JSON.stringify({
    title, titleVisible, titleAlign, titleFont, titleSize, titleColor,
    detailsColor, detailsGradient, detailsGradientEnabled, description, sections,
    location, locationLat, locationLng, locationPlaceId, hideLocation, showCoordinates, hideDate, revealHint,
    dateRevealHint, startsAt, endsAt, timezone, maxAttendees, waitlistEnabled,
    instantWaitlist, sellTicketsEnabled, ticketPrice, ticketCurrency, fulfillment,
    allowPlusOnes, maxPlusOnesPerGuest, dinnerEnabled, dinnerStartTime,
    dinnerEndTime, dinnerMaxSeatsPerSlot, dinnerOverflowAction, dinnerBookingEmail,
    hideDinnerRemaining, dinnerSlotsConfig, instagram, spotify, tiktok, soundcloud,
    formFields, contactChannel, requireEmail, requirePhone, requireInstagram, collectPhone, collectInstagram, enrichmentQuestions, mediaIds: mediaFiles.map((m) => m.serverId || m.id),
    signupHidden, signupLabelText, signupCtaText,
    customThumbnail: !!customThumbnail,
  });
  const baselineSnapshot = useRef(null);
  useEffect(() => {
    if (isEditMode && !editLoading && eventSlug && baselineSnapshot.current === null) {
      baselineSnapshot.current = formSnapshot;
    }
  }, [isEditMode, editLoading, eventSlug, formSnapshot]);
  const hasUnsavedEdits =
    isEditMode && baselineSnapshot.current !== null && formSnapshot !== baselineSnapshot.current;

  // Feed event identity + stage into the navbar so the header "Live" button can
  // reflect it AND so the draft carries its own Room/Guests/Insights menu while
  // you build it. Fires for both edit mode and /create — on /create the id only
  // exists once the draft has autosaved, which is exactly when the menu should
  // light up. myRole is owner here: you're editing your own event in the editor.
  useEffect(() => {
    const navId = isEditMode ? editEventId : draftEventId;
    if (!navId) return;
    setEventNav({
      id: navId,
      title: eventTitle,
      slug: eventSlug,
      status: isEditMode ? eventStatus : "DRAFT",
      myRole: "owner",
      kind: eventKind,
      dirty: hasUnsavedEdits,
      guestsCount: null,
      // Published-event Edit puts its "Save changes" control in the top nav (same
      // as the draft's Publish), so feed the validation gap + save state up to the
      // header where the button now lives.
      missing: hasAttemptedPublish ? missingCount : 0,
      saving: loading,
      saveLabel: loading
        ? (uploadStatus ? `Uploading ${uploadStatus.done}/${uploadStatus.total}…` : "Saving…")
        : "Save changes",
    });
  }, [isEditMode, editEventId, draftEventId, eventSlug, eventStatus, eventTitle, eventKind, hasUnsavedEdits, hasAttemptedPublish, missingCount, loading, uploadStatus, setEventNav]);

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
  // Media now uploads to storage the moment it's added (to a draft event in
  // create mode), so the only "unsaved" media is something still uploading or
  // that failed to upload — those are the only cases worth warning about.
  const hasUnsavedMedia = mediaFiles.some((m) => m.file && !m.serverId);
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
          scene,
          draftEventId: draftEventIdRef.current,
          description, location, locationLat, locationLng, locationPlaceId, hideLocation, showCoordinates, hideDate, revealHint, dateRevealHint,
          startsAt, endsAt, timezone, maxAttendees, waitlistEnabled, instantWaitlist,
          sellTicketsEnabled, ticketPrice, ticketCurrency, fulfillment,
          allowPlusOnes, maxPlusOnesPerGuest,
          dinnerEnabled, dinnerStartTime, dinnerEndTime,
          dinnerMaxSeatsPerSlot, dinnerMaxGuestsPerBooking,
          dinnerOverflowAction, dinnerBookingEmail, hideDinnerRemaining,
          dinnerSlotsConfig,
          instagram, spotify, tiktok, soundcloud,
          formFields,
          contactChannel,
          requireEmail,
          requirePhone,
          requireInstagram,
          collectPhone,
          collectInstagram,
          enrichmentQuestions,
          signupHidden,
          signupLabel: signupLabelText,
          signupCta: signupCtaText,
          currentStep,
          wizardDone,
          _savedAt: Date.now(),
        };
        localStorage.setItem("pullup_event_draft", JSON.stringify(draftData));
      } catch { /* storage full or unavailable */ }
    }, 500);
    return () => clearTimeout(timeout);
  }, [
    isEditMode, title, description, location, locationLat, locationLng, locationPlaceId, showCoordinates,
    startsAt, endsAt, timezone, maxAttendees, waitlistEnabled,
    sellTicketsEnabled, ticketPrice, ticketCurrency, fulfillment,
    allowPlusOnes, maxPlusOnesPerGuest,
    dinnerEnabled, dinnerStartTime, dinnerEndTime,
    dinnerMaxSeatsPerSlot, dinnerMaxGuestsPerBooking,
    dinnerOverflowAction, dinnerBookingEmail, hideDinnerRemaining,
    dinnerSlotsConfig,
    instagram, spotify, tiktok, soundcloud,
    formFields, contactChannel, enrichmentQuestions,
    signupHidden, signupLabelText, signupCtaText,
    currentStep, wizardDone, detailsColor, detailsGradient, detailsGradientEnabled,
    // These are saved in the payload but were missing here, so changes to them
    // (esp. `scene`, the AI scene) never re-fired the save → reload restored a
    // stale draft and the hero fell back to uploaded media.
    scene, titleVisible, titleAlign, titleFont, titleSize, titleColor,
    hideLocation, hideDate, revealHint, dateRevealHint, instantWaitlist,
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

  // Which rail part is highlighted. Tracked separately from currentStep because
  // several parts (date / content) can share one step editor.
  const [activePartId, setActivePartId] = useState(firstPartForStep(draft?.currentStep || 1));
  const [aiOfferDismissed, setAiOfferDismissed] = useState(false);
  const editorScrollRef = useRef(null);
  const formRef = useRef(null);

  // The header's "Publish" button lives outside this component (ProtectedLayout),
  // so it asks us to submit via an event rather than a shared callback.
  useEffect(() => {
    const onReq = () => formRef.current?.requestSubmit();
    window.addEventListener("pullup:request-publish", onReq);
    return () => window.removeEventListener("pullup:request-publish", onReq);
  }, []);

  // Flyout panel model (desktop): the editor for a part is HIDDEN by default —
  // you just see the thin icon rail. Hovering a rail icon (or a region in the
  // live preview) PEEKS its panel open; moving away collapses it. Clicking PINS
  // it open; clicking outside closes it. The visible part is hover || pinned.
  const [pinnedPartId, setPinnedPartId] = useState(null);
  const [hoverPartId, setHoverPartId] = useState(null);
  const railNavRef = useRef(null);
  const panelRef = useRef(null);
  const publishPillRef = useRef(null);
  const peekCloseTimer = useRef(null);
  // Preview region kind → rail part id.
  const PART_FROM_KIND = { cover: "cover", section: "content", rsvp: "collect" };

  // The two-track offer: hand the creative track to AI while the host does the
  // logistics. Opens the canvas dock with a ready-to-send "build the look"
  // prompt, seeded with whatever the event is already called.
  function offerAiBuildLook() {
    const named = (title || "").trim();
    const prompt = named
      ? `Build the look for "${named}" — design the cover/scene and write the section copy to match its vibe. I'll handle the logistics (date, place, sign-up).`
      : `Build the look for this event — design a cover/scene and draft the section copy. I'll handle the logistics (date, place, sign-up).`;
    window.dispatchEvent(new CustomEvent("pullup:ai-build-look", { detail: { prompt, key: `${currentStep}-${named.length}-${sections.length}` } }));
  }
  function goToStep(step) {
    setStepDirection(step > currentStep ? "forward" : "backward");
    setCurrentStep(step);
    setActivePartId(firstPartForStep(step));
    (editorScrollRef.current || sidebarRef.current)?.scrollTo({ top: 0, behavior: "smooth" });
  }
  // Parts rail: jump to the editor that owns a page-part / behaviour, then (if
  // it lives partway down a longer step) scroll that exact part into view. The
  // scroll waits a beat so the step has switched to display:block first.
  function goToPart(item) {
    const sameStep = item.step === currentStep;
    setStepDirection(item.step > currentStep ? "forward" : "backward");
    setCurrentStep(item.step);
    setActivePartId(item.id);
    const scroller = editorScrollRef.current || sidebarRef.current;
    const doScroll = () => {
      if (!item.anchor) { scroller?.scrollTo({ top: 0, behavior: "smooth" }); return; }
      document.getElementById(item.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    if (sameStep) doScroll();
    else setTimeout(doScroll, 60); // let the new step paint first
  }

  // The part whose panel is currently shown (transient hover wins over the pin),
  // and whether any panel is open at all.
  // CLICK-TO-OPEN ONLY. Hover-peek was annoying, so the panel now shows ONLY
  // what a click pins — hovering never opens it. Phone has no hover, so it
  // already behaved this way; desktop now matches.
  const openPartId = pinnedPartId;
  const panelOpen = !!openPartId;

  function cancelPeekClose() {
    if (peekCloseTimer.current) { clearTimeout(peekCloseTimer.current); peekCloseTimer.current = null; }
  }
  // Hover-to-open is OFF (click only). These stay as harmless no-ops so the
  // existing onMouseEnter / onMouseLeave handlers don't need touching — they
  // just don't open the panel anymore.
  function schedulePeekClose() { cancelPeekClose(); }
  function peekPart() { /* no-op: click to open, not hover */ }
  function togglePin(id) { setPinnedPartId((cur) => (cur === id ? null : id)); }
  function closePanel() { setPinnedPartId(null); setHoverPartId(null); }

  // When the open part changes (hover or pin), render its editor — switch the
  // step + active id. Kept light (no scroll) so hover-peeking stays smooth; the
  // click paths (goToPart / handleEditPart) still do the nice scroll-to-part.
  useEffect(() => {
    if (!openPartId) return;
    const it = RAIL_ITEMS.find((i) => i.id === openPartId);
    if (!it) return;
    setActivePartId(it.id);
    setCurrentStep((s) => (s === it.step ? s : it.step));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPartId]);

  // Click anywhere outside the rail / panel / publish → unpin (close).
  useEffect(() => {
    if (!pinnedPartId) return;
    function onDown(e) {
      const t = e.target;
      if (railNavRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      if (publishPillRef.current?.contains(t)) return;
      setPinnedPartId(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pinnedPartId]);

  // Point-at-the-preview → open that part's editor. The mirror of hoveredSection
  // (editor→preview): now preview→editor. Cover opens media, the RSVP box opens
  // "what you collect," and a section opens the sections builder scrolled to —
  // and briefly glowing — that exact block.
  function flashEditor(el) {
    if (!el) return;
    el.style.transition = "box-shadow 0.25s ease";
    el.style.boxShadow = "0 0 0 2px #ec178f";
    setTimeout(() => { el.style.boxShadow = "none"; }, 1100);
  }
  function handleEditPart(part) {
    // Clicking a preview region pins its panel open (stays until click-outside).
    const pinId = PART_FROM_KIND[part.kind];
    if (pinId) setPinnedPartId(pinId);
    if (part.kind === "cover") { goToPart(RAIL_ITEMS.find((i) => i.id === "cover")); return; }
    if (part.kind === "rsvp") { goToPart(RAIL_ITEMS.find((i) => i.id === "collect")); return; }
    if (part.kind === "section") {
      const wasStep2 = currentStep === 2;
      setStepDirection(2 > currentStep ? "forward" : "backward");
      setCurrentStep(2);
      setActivePartId("content");
      setTimeout(() => {
        const el = editorScrollRef.current?.querySelector(`[data-section-editor="${part.index}"]`);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); flashEditor(el); }
      }, wasStep2 ? 0 : 70);
    }
  }
  // Preview region hover → peek that part's panel (the hover mirror of the click
  // above). null on mouse-out schedules the collapse.
  function handleHoverPart(part) {
    if (!part) { schedulePeekClose(); return; }
    const id = PART_FROM_KIND[part.kind];
    if (id) peekPart(id);
  }

  function validateStep() {
    // Check date logic errors (these are hard errors, not missing fields).
    // Skip the past-date check for TBA events — the date is a private
    // placeholder for sorting/reminders, not the public time.
    if (!hideDate && startsAt && new Date(startsAt) < new Date()) {
      goToStep(2);
      showToast("Event start date cannot be in the past", "error");
      return false;
    }
    if (!hideDate && endsAt && new Date(endsAt) < new Date()) {
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
    // Reach floor: at least one of Email / WhatsApp must be required, so every
    // guest leaves a channel you can actually reach them on.
    if (!requireEmail && !requirePhone) {
      setHasAttemptedPublish(true);
      showToast("Require at least one way to reach guests — Email or WhatsApp", "error");
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

  // Create-mode reload: reconnect to the DRAFT event saved in localStorage and
  // hydrate its already-uploaded media, so the preview shows real content and
  // newly added media attaches to the SAME draft (no orphans).
  useEffect(() => {
    if (isEditMode) return;
    const id = draft?.draftEventId;
    if (!id) return;
    draftEventIdRef.current = id;
    let cancelled = false;
    (async () => {
      try {
        const res = await authenticatedFetch(`/host/events/${id}`);
        if (!res.ok) throw new Error("draft gone");
        const ev = await res.json();
        if (cancelled) return;
        if (ev.media && ev.media.length > 0) {
          setMediaMode(ev.media[0].mediaType === "video" ? "video" : "images");
          const loaded = ev.media.map((m) => ({
            id: m.id,
            serverId: m.id,
            file: null,
            preview: m.thumbnailUrl || m.url,
            previewUrl: m.url,
            mediaType: m.mediaType || "image",
            url: m.url,
          }));
          setMediaFiles(loaded);
          setImagePreview(loaded[0].previewUrl || loaded[0].preview);
        }
      } catch {
        // Draft was published/deleted in the meantime — start fresh.
        if (!cancelled) {
          draftEventIdRef.current = null;
          setDraftEventId(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Create mode: pre-allocate the DRAFT event the moment the page opens, so the
  // AI canvas dock (IdeaWidget) has an eventId to attach to immediately — chat
  // can build the event from nothing, exactly the way it edits an existing one.
  // Reuses the on-demand draft path (also used by media upload), so there's
  // never more than one draft. No-op when a draft is already restored from
  // localStorage. If it fails (offline/auth) the canvas just stays dormant
  // until the first manual save, as before.
  useEffect(() => {
    if (isEditMode || !user) return;
    if (draftEventIdRef.current || draftEventId) return;
    ensureDraftEvent().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, user]);

  // Hydrate the full form from the server event.
  // - Edit mode: on mount, and whenever the canvas builds (canvasRefresh).
  // - Create mode: the form is local-first, so only RE-hydrate the draft AFTER
  //   a canvas build (canvasRefresh > 0) — never on first draft creation, which
  //   would wipe what the host is typing. The canvas flushes the form into the
  //   draft before it acts, so the state we read here already includes the
  //   host's manual edits plus whatever the AI just built.
  useEffect(() => {
    const hydrateId = editEventId || draftEventIdRef.current;
    if (!hydrateId) return;
    if (!editEventId && canvasRefresh === 0) return;
    let cancelled = false;
    async function loadEvent() {
      if (editEventId) setEditLoading(true);
      try {
        const res = await authenticatedFetch(`/host/events/${hydrateId}`);
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
        // AI scene (events.scene). null → standard cover / no scene.
        setScene(ev.scene || null);
        setDescription(ev.description || "");
        (() => {
          // A community page has no date or place, so we never seed the
          // location/datetime sections (and drop any that snuck in). Everything
          // else — title, text, Spotify, hosted-by — is shared with events.
          const community = (ev.kind || "event") === "community";
          const saved = community
            ? (ev.sections || []).filter(s => s.type !== "location" && s.type !== "datetime")
            : (ev.sections || []);
          const hasT = saved.some(s => s.type === "title");
          const hasLoc = saved.some(s => s.type === "location");
          const hasDt = saved.some(s => s.type === "datetime");
          const defaults = [];
          if (!hasT) defaults.push({ type: "title" });
          if (!community && !hasLoc) defaults.push({ type: "location" });
          if (!community && !hasDt) defaults.push({ type: "datetime" });
          setSections([...defaults, ...saved]);
        })();
        setLocation(ev.location || "");
        setLocationLat(ev.locationLat || null);
        setLocationLng(ev.locationLng || null);
        setLocationPlaceId(ev.locationPlaceId || null);
        setHideLocation(ev.hideLocation || false);
        setShowCoordinates(ev.showCoordinates || false);
        setHideDate(ev.hideDate || false);
        setInstantWaitlist(ev.instantWaitlist || false);
        setRevealHint(ev.revealHint || "");
        setDateRevealHint(ev.dateRevealHint || "");
        setStartsAt(ev.startsAt || "");
        setEndsAt(ev.endsAt || "");
        setTimezone(ev.timezone || getUserTimezone());
        setMaxAttendees(ev.cocktailCapacity ? String(ev.cocktailCapacity) : "");
        setWaitlistEnabled(!!ev.waitlistEnabled);

        // Tickets — hydrate from the event. When payments v2 is live the host
        // can edit price/currency; when it's off the pause behavior holds (the
        // payload forces free and the backend guard backs it up).
        setSellTicketsEnabled(ev.ticketType === "paid");
        setTicketPrice(ev.ticketPrice ? String(ev.ticketPrice / 100) : "");
        setTicketCurrency((ev.ticketCurrency || "SEK").toUpperCase());
        // Digital-product delivery config (kind='product').
        setFulfillment(ev.fulfillment || null);

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

        // RSVP form fields — pad with the right locked rows for this event's channel.
        const loadedChannel = ["email", "whatsapp", "both"].includes(ev.contactChannel)
          ? ev.contactChannel
          : "email";
        setContactChannelRaw(loadedChannel);
        setRequireEmail(ev.requireEmail !== false);
        setRequirePhone(!!ev.requirePhone);
        setRequireInstagram(!!ev.requireInstagram);
        setCollectPhone(ev.collectPhone !== false);
        setCollectInstagram(ev.collectInstagram !== false);
        setEnrichmentQuestions(Array.isArray(ev.enrichmentQuestions) ? ev.enrichmentQuestions : []);
        setFormFields(withLockedFields(ev.formFields, loadedChannel));

        // On-page sign-up surface control (mig 096).
        setSignupHidden(!!ev.signupSettings?.hidden);
        setSignupLabelText(ev.signupSettings?.label || "");
        setSignupCtaText(ev.signupSettings?.cta || "");

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
        // Crop/format settings — read nested with fallback to legacy flat fields.
        const phoneMs = ms.phone || {};
        const desktopMs = ms.desktop || {};
        // Legacy "top"|"center"|"bottom" → numeric Y. X stays at 50 since the
        // old schema had no horizontal control.
        const focusStrToY = (s) => (s === "top" ? 0 : s === "bottom" ? 100 : 50);
        setPhoneMode(normalizePhoneMode(phoneMs, ms));
        setPhoneFocusX(
          typeof phoneMs.focusX === "number" ? phoneMs.focusX : 50,
        );
        setPhoneFocusY(
          typeof phoneMs.focusY === "number"
            ? phoneMs.focusY
            : focusStrToY(phoneMs.focus || ms.focus),
        );
        // Desktop mode: read new "mode" field; map legacy fit/real/aspect onto
        // the width|height|card model.
        setDesktopMode(normalizeDesktopMode(desktopMs, ms));
        setDesktopFocusX(
          typeof desktopMs.focusX === "number" ? desktopMs.focusX : 50,
        );
        setDesktopFocusY(
          typeof desktopMs.focusY === "number"
            ? desktopMs.focusY
            : focusStrToY(desktopMs.focus || ms.focus),
        );

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

        // Stash identity + stage; the navbar effect picks these up so the
        // header "Live" button can reflect draft/live/unsaved-edits state.
        setEventTitle(ev.title);
        setEventSlug(ev.slug);
        setEventStatus(ev.status || "PUBLISHED");
        setEventKind(ev.kind || "event");
      } catch (err) {
        console.error("Error loading event for edit:", err);
        showToast("Failed to load event", "error");
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    }
    loadEvent();
    return () => { cancelled = true; };
  }, [editEventId, canvasRefresh]);

  // Wire the create-canvas dock (IdeaWidget): tell it which event is being
  // built, and reload from the server when it builds something so the live
  // preview reflects the change.
  useEffect(() => {
    const id = editEventId || draftEventId || null;
    window.dispatchEvent(new CustomEvent("pullup:canvas-context", { detail: { eventId: id } }));
    return () => {
      window.dispatchEvent(new CustomEvent("pullup:canvas-context", { detail: { eventId: null } }));
    };
  }, [editEventId, draftEventId]);

  useEffect(() => {
    const onBuilt = () => setCanvasRefresh((n) => n + 1);
    window.addEventListener("pullup:canvas-built", onBuilt);
    return () => window.removeEventListener("pullup:canvas-built", onBuilt);
  }, []);

  // Always-current builder, so the flush listener (attached once) reads live
  // form state instead of a stale closure.
  const buildPayloadRef = useRef(buildEventPayload);
  buildPayloadRef.current = buildEventPayload;

  // Flush the form into the draft on demand. The canvas fires
  // `pullup:canvas-flush-request` right before each turn and waits for
  // `pullup:canvas-flush-done`, so the AI always builds on top of the host's
  // latest manual edits (the server draft is the AI's source of truth). Create
  // mode only — in edit mode the host saves explicitly, and we never want a
  // chat turn to silently push unsaved edits onto a live event.
  useEffect(() => {
    async function onFlushRequest() {
      try {
        const id = draftEventIdRef.current;
        if (isEditMode || !id) return;
        const payload = buildPayloadRef.current();
        if (!payload.startsAt) delete payload.startsAt; // keep the draft's own
        await authenticatedFetch(`/host/events/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } catch {
        // best-effort — the canvas can still build on slightly stale state
      } finally {
        window.dispatchEvent(new CustomEvent("pullup:canvas-flush-done"));
      }
    }
    window.addEventListener("pullup:canvas-flush-request", onFlushRequest);
    return () => window.removeEventListener("pullup:canvas-flush-request", onFlushRequest);
  }, [isEditMode]);

  // Keep the SERVER draft in step with what's been entered, so a DRAFT genuinely
  // holds the wizard's name/when/where/who and any later edits — not just
  // localStorage. Runs for BOTH create-mode drafts and editing an existing draft
  // (so editing a draft autosaves, exactly like create — no manual "Save"). A
  // PUBLISHED event is NEVER autosaved (its host saves explicitly). Debounced;
  // mirrors the canvas flush's PUT (no status → keeps it a draft).
  const autosaveTargetId = !isEditMode ? draftEventId : (eventStatus === "DRAFT" ? editEventId : null);
  useEffect(() => {
    if (!autosaveTargetId) return;
    const t = setTimeout(async () => {
      try {
        setDraftSaveStatus("saving");
        const payload = buildPayloadRef.current();
        if (!payload.startsAt) delete payload.startsAt; // keep the draft's own default
        const res = await authenticatedFetch(`/host/events/${autosaveTargetId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        try { const d = await res.clone().json(); if (d?.slug) setDraftSlug(d.slug); } catch { /* no body */ }
        setDraftSaveStatus("saved");
      } catch (e) {
        console.warn("[draft] sync failed:", e?.message);
        setDraftSaveStatus("idle");
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autosaveTargetId,
    title, description, sections,
    startsAt, endsAt, timezone, hideDate, dateRevealHint,
    location, locationLat, locationLng, locationPlaceId, hideLocation, showCoordinates, revealHint,
    collectPhone, requirePhone, requireEmail, collectInstagram, requireInstagram, formFields, contactChannel, enrichmentQuestions,
    maxAttendees, waitlistEnabled, instantWaitlist, allowPlusOnes, maxPlusOnesPerGuest,
    dinnerEnabled, dinnerSlotsConfig, scene, instagram, spotify, tiktok, soundcloud,
    ticketPrice, ticketCurrency, fulfillment,
  ]);

  // Make sure we have the draft's slug for the header "Preview" link, even if
  // the create/sync responses didn't carry it.
  useEffect(() => {
    if (isEditMode || !draftEventId || draftSlug) return;
    let alive = true;
    authenticatedFetch(`/host/events/${draftEventId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((ev) => { if (alive && ev?.slug) setDraftSlug(ev.slug); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isEditMode, draftEventId, draftSlug]);

  // Surface draft autosave state + slug to the header (the Publish button lives
  // there). Only meaningful once a draft row exists.
  useEffect(() => {
    // Broadcast for create AND editing a draft (both autosave + Publish in the
    // header). A published-event edit never autosaves, so no draft status.
    const draftEditing = isEditMode && eventStatus === "DRAFT";
    if (isEditMode && !draftEditing) return;
    window.dispatchEvent(new CustomEvent("pullup:draft-status", {
      detail: {
        saveStatus: autosaveTargetId ? draftSaveStatus : "idle",
        slug: isEditMode ? eventSlug : draftSlug,
        hasDraft: !!autosaveTargetId,
      },
    }));
  }, [isEditMode, eventStatus, autosaveTargetId, draftSaveStatus, draftSlug, eventSlug]);

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

  // Patch one media item in place (by local id).
  const patchMediaItem = (id, patch) =>
    setMediaFiles((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  // Resolve the event id media should attach to. Edit mode → the event being
  // edited. Create mode → a DRAFT event, created on demand exactly once
  // (concurrent first-adds share the same in-flight promise).
  async function ensureDraftEvent() {
    if (isEditMode) return editEventId;
    if (draftEventIdRef.current) return draftEventIdRef.current;
    // Don't mint a draft — and therefore a slug — until there's a REAL name.
    // Otherwise the slug locks in as "untitled-xxxx" forever. Callers tolerate
    // null: media stays held locally and uploads once the event is named/published.
    const realTitle = (title || "").trim();
    if (!realTitle || realTitle === "Event Name") return null;
    if (draftCreationRef.current) return draftCreationRef.current;

    draftCreationRef.current = (async () => {
      // startsAt has a sensible default; guard against empty/past so the
      // DRAFT passes POST /events validation. Real values land on publish.
      let draftStartsAt;
      try {
        const d = startsAt ? new Date(startsAt) : null;
        draftStartsAt = d && d > new Date() ? d : new Date(Date.now() + 7 * 24 * 3600 * 1000);
      } catch {
        draftStartsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      }
      // Guaranteed real by the guard above — the draft + slug are born named.
      const cleanTitle = (title || "").trim();
      const res = await authenticatedFetch("/events", {
        method: "POST",
        body: JSON.stringify({
          title: cleanTitle,
          startsAt: draftStartsAt.toISOString(),
          timezone,
          createdVia: "create",
          status: "DRAFT",
          // Pin the page kind at birth (route-controlled, never editable after)
          // and apply the kind's registry defaults so a product/community is born
          // dateless/locationless instead of showing event-only fields.
          ...(eventKind && eventKind !== "event"
            ? { kind: eventKind, hideDate: getPageKind(eventKind).hideDate, hideLocation: getPageKind(eventKind).hideLocation }
            : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start draft");
      }
      const created = await res.json();
      draftEventIdRef.current = created.id;
      setDraftEventId(created.id);
      if (created.slug) setDraftSlug(created.slug);
      return created.id;
    })();

    try {
      return await draftCreationRef.current;
    } catch (err) {
      draftCreationRef.current = null; // allow retry on next add
      throw err;
    }
  }

  // Persist a real DRAFT the moment the event has a name — so the wizard flow
  // genuinely IS "a new event in draft": it shows up in the Room and survives a
  // closed tab, not just localStorage. Idempotent (ensureDraftEvent creates once)
  // and debounced so we don't POST on every keystroke.
  useEffect(() => {
    if (isEditMode) return;
    const named = (title || "").trim();
    if (!named || named === "Event Name") return;
    if (draftEventIdRef.current || draftCreationRef.current) return;
    const t = setTimeout(() => {
      ensureDraftEvent().catch((e) => console.warn("[draft] auto-create failed:", e?.message));
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, isEditMode]);

  // Flush media that was added BEFORE the event had a name (so it had no draft
  // to upload to). The moment a draft is born — i.e. once you name the event —
  // any locally-held files upload, so nothing is lost on refresh.
  const pendingFlushedRef = useRef(false);
  useEffect(() => {
    if (isEditMode || !draftEventId || pendingFlushedRef.current) return;
    const pending = mediaFiles.filter((m) => m?.file && !m.serverId && !m.uploading && !m.uploadError);
    if (!pending.length) return;
    pendingFlushedRef.current = true;
    pending.forEach((item) => {
      const idx = mediaFiles.findIndex((m) => m.id === item.id);
      patchMediaItem(item.id, { uploading: true, uploadError: false });
      uploadQueuedMedia(draftEventId, item, idx >= 0 ? idx : 0)
        .then((row) => patchMediaItem(item.id, { uploading: false, serverId: row.id, url: row.url || item.preview }))
        .catch((err) => {
          console.error("[draft] pending media flush failed", err);
          patchMediaItem(item.id, { uploading: false, uploadError: true });
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftEventId, isEditMode]);

  async function handleMediaAdd(files) {
    const fileList = Array.isArray(files) ? files : [files];
    const maxItems = 10;
    const addedItems = [];          // items accepted this batch, in order
    const baseIndex = mediaFiles.length; // their positions start here

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

      // A .mov is a QuickTime container, but almost always holds H.264/AAC —
      // the same codecs as MP4. Chrome/Firefox refuse to decode a
      // `video/quicktime` source, so the thumbnail, the editor preview, and
      // the live <video> all come back blank (the "video disappeared" bug).
      // The identical bytes labelled `video/mp4` play fine. The old base64
      // upload path relabelled server-side; the direct-upload path dropped it,
      // so normalise here and let the whole pipeline treat it as mp4.
      const uploadFile =
        isVideo && file.type === "video/quicktime"
          ? new File([file], file.name.replace(/\.mov$/i, ".mp4"), { type: "video/mp4" })
          : file;

      // Generate preview. For images, pre-process here so HEIC files (which
      // browsers can't render natively) are converted to JPEG/WebP up-front,
      // giving an immediate, renderable preview. We stash the processed Blob
      // on the media item so the upload pipeline reuses it instead of
      // re-encoding the file at publish time.
      let preview;
      let processedBlob = null;
      let processedMime = null;
      if (isVideo) {
        try {
          const thumbBlob = await generateVideoThumbnail(uploadFile);
          preview = URL.createObjectURL(thumbBlob);
        } catch {
          preview = null;
        }
      } else if (validation.mediaType === "image") {
        try {
          const processed = await processImageForUpload(uploadFile);
          processedBlob = processed.blob;
          processedMime = processed.mimeType;
          preview = URL.createObjectURL(processedBlob);
        } catch (err) {
          console.error("[handleMediaAdd] image processing failed", err);
          preview = URL.createObjectURL(uploadFile); // fall back to raw blob URL
        }
      } else {
        // GIF — leave untouched to preserve animation.
        preview = URL.createObjectURL(uploadFile);
      }

      const mediaItem = {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file: uploadFile,
        preview,
        mediaType: validation.mediaType,
        previewUrl: isVideo ? URL.createObjectURL(uploadFile) : preview,
        processedBlob,
        processedMime,
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
      addedItems.push(mediaItem);
    }

    if (addedItems.length === 0) return;

    // Persist immediately. Create mode lazily spins up a DRAFT event so the
    // direct-to-storage pipeline (same as edit mode) has an id to attach to.
    let eventId;
    try {
      eventId = await ensureDraftEvent();
    } catch (err) {
      console.error("[handleMediaAdd] could not start draft", err);
      showToast("Couldn't start the upload — it'll retry when you create the event", "warning");
      return; // items stay in mediaFiles without serverId → submit uploads them
    }

    // No name yet → no draft yet (so the slug isn't born "untitled"). The media
    // sits in the preview locally and uploads the moment you name it / publish.
    if (!eventId) {
      showToast("Name your event and your media uploads automatically", "info");
      return;
    }

    addedItems.forEach((item, k) => {
      patchMediaItem(item.id, { uploading: true, uploadError: false });
      uploadQueuedMedia(eventId, item, baseIndex + k)
        .then((row) =>
          patchMediaItem(item.id, {
            uploading: false,
            serverId: row.id,
            url: row.url || item.preview,
          }),
        )
        .catch((err) => {
          console.error("[handleMediaAdd] upload failed", err);
          patchMediaItem(item.id, { uploading: false, uploadError: true });
          showToast("A file failed to upload — it'll retry when you save", "error");
        });
    });
  }

  // Upload a single queued media item via the direct-to-Supabase pipeline.
  // Wraps processImageForUpload (for images) and generateVideoThumbnail (for
  // videos), reporting per-item progress 0–100 into uploadProgress[item.id].
  async function uploadQueuedMedia(eventId, item, position) {
    const setItemProgress = (pct) =>
      setUploadProgress((prev) => ({ ...prev, [item.id]: Math.max(prev[item.id] || 0, pct) }));
    setItemProgress(1);

    let blob;
    let mimeType;
    let thumbnailBlob = null;

    if (item.mediaType === "video") {
      blob = item.file;
      mimeType = item.file.type;
      try {
        thumbnailBlob = await generateVideoThumbnail(item.file);
      } catch (e) {
        // Best-effort thumbnail; backend will still save the video.
        console.warn("[upload] video thumbnail generation failed", e);
      }
    } else if (item.mediaType === "gif") {
      blob = item.file;
      mimeType = item.file.type || "image/gif";
    } else if (item.processedBlob) {
      // Already processed at add-time (e.g. HEIC → JPEG).
      blob = item.processedBlob;
      mimeType = item.processedMime || item.processedBlob.type || "image/jpeg";
    } else {
      const processed = await processImageForUpload(item.file);
      blob = processed.blob;
      mimeType = processed.mimeType;
    }

    // uploadEventMediaDirect wants a File-like object; wrap the Blob if needed.
    const fileForUpload = blob instanceof File
      ? blob
      : new File(
          [blob],
          `${item.id}.${(mimeType.split("/")[1] || "bin")}`,
          { type: mimeType },
        );

    return uploadEventMediaDirect({
      eventId,
      file: fileForUpload,
      mediaType: item.mediaType,
      position,
      thumbnailBlob,
      onProgress: setItemProgress,
    });
  }

  function handleMediaRemove(id) {
    // If the item is already on the server (edit event OR the create-mode
    // draft), delete it there too.
    const item = mediaFiles.find((m) => m.id === id);
    const ownerEventId = isEditMode ? editEventId : draftEventIdRef.current;
    if (item?.serverId && ownerEventId) {
      deleteEventMedia(ownerEventId, item.serverId).catch((err) =>
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

  // Build the full event payload from current form state. Shared by publish
  // (handleCreate) and the canvas draft-sync flush, so the server draft the AI
  // reads is always a faithful mirror of the form — no split-brain between what
  // the host typed and what the canvas sees. The caller adds status/createdVia.
  // startsAt is null-safe: the flush can run before a date is picked.
  function buildEventPayload() {
    const parsedMaxPlus =
      allowPlusOnes && maxPlusOnesPerGuest
        ? Math.max(1, Math.min(5, parseInt(maxPlusOnesPerGuest, 10) || 1))
        : 0;

    const cocktailCapacity = maxAttendees ? Number(maxAttendees) : null;

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

    let totalCapacity = null;
    if (cocktailCapacity !== null || foodCapacity !== null) {
      totalCapacity = (cocktailCapacity || 0) + (foodCapacity || 0);
    }

    // null-safe: an empty/invalid date yields null so the flush can omit it
    // (handleCreate gates on validateStep, so it's always valid there).
    const startsAtIso = (() => {
      if (!startsAt) return null;
      const d = new Date(startsAt);
      return isNaN(d.getTime()) ? null : d.toISOString();
    })();

    return {
      title,
      titleSettings: { visible: titleVisible, align: titleAlign, font: titleFont, size: titleSize, color: titleColor, detailsColor, detailsGradient, detailsGradientEnabled },
      description,
      sections: sections.filter(s => {
        if (s.type === "title" || s.type === "location" || s.type === "datetime") return true;
        if (s.type === "socials") return s.instagram || s.spotify || s.tiktok || s.soundcloud;
        if (s.type === "hostedby") return (s.name || "").trim();
        if (s.type === "spotify" || s.type === "applemusic" || s.type === "soundcloud" || s.type === "youtube") return (s.url || "").trim();
        return (s.title || "").trim() || (s.text || "").trim();
      }),
      formFields: (formFields || []).filter(f => f && f.id && (isLockedFieldId(f.id) || (f.label || "").trim())),
      contactChannel,
      requireEmail,
      requirePhone,
      requireInstagram,
      collectPhone,
      collectInstagram,
      // On-page sign-up surface (mig 096). Only persist a real config when the
      // host has changed something; otherwise leave it null = kind-default.
      signupSettings: (signupHidden || signupLabelText.trim() || signupCtaText.trim())
        ? { hidden: signupHidden, label: signupLabelText.trim() || null, cta: signupCtaText.trim() || null }
        : null,
      enrichmentQuestions: (enrichmentQuestions || [])
        .filter((q) => q && q.id && (q.label || "").trim())
        .map((q) => ({ id: q.id, label: q.label.trim(), required: !!q.required })),
      location,
      locationLat: locationLat || null,
      locationLng: locationLng || null,
      locationPlaceId: locationPlaceId || null,
      hideLocation,
      showCoordinates,
      hideDate,
      revealHint: revealHint.trim() || null,
      dateRevealHint: dateRevealHint.trim() || null,
      startsAt: startsAtIso,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      timezone,
      maxAttendees: maxAttendees ? Number(maxAttendees) : null,
      cocktailCapacity,
      foodCapacity,
      totalCapacity,
      waitlistEnabled,
      instantWaitlist,
      theme,
      calendar,
      visibility,
      // Tickets: paid only when payments v2 is live AND a real price is set —
      // otherwise free, exactly like during the paid-tickets pause.
      ticketType: ticketsArePaid ? "paid" : "free",
      ticketPrice: ticketsArePaid ? Math.round(Number(ticketPrice) * 100) : null,
      ticketCurrency: ticketsArePaid ? ticketCurrency.toLowerCase() : null,
      // Digital-product delivery config (kind='product'). Sent for products
      // only; null elsewhere keeps event/community payloads untouched.
      fulfillment: isProductKind ? (fulfillment || null) : undefined,
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
      instagram: instagram || null,
      spotify: spotify || null,
      tiktok: tiktok || null,
      soundcloud: soundcloud || null,
      mediaSettings: buildMediaSettings(),
    };
  }

  async function handleCreate(e) {
    if (e) e.preventDefault();
    if (!validateStep()) return;

    // Auth gate: if not logged in, save draft and show auth modal
    if (!user && !isEditMode) {
      // Save current draft with pendingPublish flag
      try {
        const raw = localStorage.getItem("pullup_event_draft");
        if (raw) {
          const d = JSON.parse(raw);
          d.pendingPublish = true;
          localStorage.setItem("pullup_event_draft", JSON.stringify(d));
        }
      } catch {}
      setShowPublishAuth(true);
      return;
    }

    setLoading(true);

    try {
      const requestBody = buildEventPayload();

      if (isEditMode) {
        // --- EDIT MODE ---
        // Editing a DRAFT behaves like the create flow: the primary action
        // PUBLISHES it (flip DRAFT → PUBLISHED). Editing a PUBLISHED event just
        // saves the changes, keeping it live.
        const publishing = eventStatus === "DRAFT";
        const res = await authenticatedFetch(`/host/events/${editEventId}`, {
          method: "PUT",
          body: JSON.stringify(publishing ? { ...requestBody, status: "PUBLISHED" } : requestBody),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update event");
        }

        const updated = await res.json();

        // Upload any NEW media items (ones without serverId) in parallel.
        const newMedia = mediaFiles.filter((m) => !m.serverId && m.file);
        if (newMedia.length > 0) {
          setUploadStatus({ done: 0, total: newMedia.length });
          let done = 0;
          const tasks = newMedia.map((m) => {
            const position = mediaFiles.indexOf(m);
            return uploadQueuedMedia(editEventId, m, position).then(
              (result) => {
                done += 1;
                setUploadStatus({ done, total: newMedia.length });
                return result;
              },
              (err) => {
                console.error("Error uploading media item:", err);
                throw err;
              },
            );
          });
          const settled = await Promise.allSettled(tasks);
          const failed = settled.filter((s) => s.status === "rejected").length;
          if (failed > 0) {
            showToast(`Event saved, but ${failed} of ${newMedia.length} files failed to upload`, "warning");
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

        // Upload custom thumbnail if provided (direct, with progress)
        if (customThumbnail?.file) {
          try {
            await uploadEventImageDirect({ eventId: editEventId, file: customThumbnail.file });
          } catch (err) {
            console.error("Error uploading custom thumbnail:", err);
          }
        }

        setUploadStatus(null);
        if (publishing) {
          showToast(publishToast(), "success");
          navigate(afterPublishPath(editEventId));
        } else {
          // Saving changes keeps the host in the editor — it shouldn't kick them
          // out to the Guests page mid-edit. Re-baseline the unsaved-edits
          // snapshot to NOW so the header stops showing "unsaved changes" and the
          // Save button settles (the finally{} setLoading re-render applies it).
          baselineSnapshot.current = formSnapshot;
          showToast("Changes saved", "success");
        }
      } else if (draftEventIdRef.current) {
        // --- CREATE MODE (draft exists): publish the draft ---
        // Media already uploaded straight to this draft as it was added; here
        // we just save the final fields and flip DRAFT → PUBLISHED.
        const draftId = draftEventIdRef.current;
        let finalEvent;

        // Safety net: persist any media that didn't upload on-add.
        const pending = mediaFiles.filter((m) => m.file && !m.serverId);
        if (pending.length > 0) {
          setUploadStatus({ done: 0, total: pending.length });
          let done = 0;
          const settled = await Promise.allSettled(
            pending.map((m) =>
              uploadQueuedMedia(draftId, m, mediaFiles.indexOf(m)).then((r) => {
                patchMediaItem(m.id, { uploading: false, serverId: r.id });
                done += 1;
                setUploadStatus({ done, total: pending.length });
                return r;
              }),
            ),
          );
          const failed = settled.filter((s) => s.status === "rejected").length;
          if (failed > 0) showToast(`${failed} of ${pending.length} files failed to upload`, "warning");
        }

        const res = await authenticatedFetch(`/host/events/${draftId}`, {
          method: "PUT",
          body: JSON.stringify({ ...requestBody, createdVia: "create", status: "PUBLISHED" }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to publish event");
        }
        finalEvent = await res.json();

        // Reorder media to match the current UI order.
        const serverItems = mediaFiles.filter((m) => m.serverId);
        if (serverItems.length > 1) {
          try {
            await reorderEventMedia(
              draftId,
              serverItems.map((m) => ({ id: m.serverId, position: mediaFiles.indexOf(m) })),
            );
          } catch (e) {
            console.error("Error reordering media:", e);
          }
        }

        // Custom thumbnail (overrides auto cover).
        if (customThumbnail?.file) {
          try {
            await uploadEventImageDirect({ eventId: draftId, file: customThumbnail.file });
          } catch (e) {
            console.error("Error uploading custom thumbnail:", e);
          }
        }

        // Refresh so the success page gets final media order + thumbnail.
        try {
          const r2 = await authenticatedFetch(`/host/events/${draftId}`);
          if (r2.ok) finalEvent = await r2.json();
        } catch (_) {}

        setUploadStatus(null);
        clearDraft();
        showToast("Event created successfully!", "success");
        // New host lands inside their own event's Room — the same surface their
        // guests will see — so they immediately get what they built. (Host is
        // signed in, so the room auto-enters via their session identity.)
        navigate(afterPublishPath(finalEvent.id));
      } else {
        // --- CREATE MODE (no media): POST new event ---
        const res = await authenticatedFetch("/events", {
          method: "POST",
          body: JSON.stringify({ ...requestBody, createdVia: "create", status: "PUBLISHED" }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to create event");
        }

        const created = await res.json();

        // Upload all queued media items in parallel via the direct-to-Supabase
        // pipeline. Each item reports its own progress.
        let finalEvent = created;
        if (mediaFiles.length > 0) {
          setUploadStatus({ done: 0, total: mediaFiles.length });
          let done = 0;
          const tasks = mediaFiles.map((m, i) =>
            uploadQueuedMedia(created.id, m, i).then(
              (result) => {
                done += 1;
                setUploadStatus({ done, total: mediaFiles.length });
                return result;
              },
              (err) => {
                console.error("Error uploading media item:", err);
                throw err;
              },
            ),
          );
          const settled = await Promise.allSettled(tasks);
          const failed = settled.filter((s) => s.status === "rejected").length;
          if (failed > 0) {
            showToast(`Event created, but ${failed} of ${mediaFiles.length} files failed to upload`, "warning");
          }
          // Refresh event with media URLs.
          const updatedRes = await authenticatedFetch(`/host/events/${created.id}`);
          if (updatedRes.ok) {
            finalEvent = await updatedRes.json();
          }
        } else if (imageFile) {
          // Fallback for legacy single image input.
          try {
            finalEvent = await uploadEventImageDirect({ eventId: created.id, file: imageFile });
          } catch (imageError) {
            console.error("Error uploading image:", imageError);
            showToast("Event created, but image upload failed", "warning");
          }
        }

        // Upload custom thumbnail if provided (overrides auto-generated one)
        if (customThumbnail?.file) {
          try {
            finalEvent = await uploadEventImageDirect({ eventId: created.id, file: customThumbnail.file });
          } catch (err) {
            console.error("Error uploading custom thumbnail:", err);
          }
        }

        setUploadStatus(null);
        clearDraft();
        showToast("Event created successfully!", "success");
        // New host lands inside their own event's Room — the same surface their
        // guests will see — so they immediately get what they built. (Host is
        // signed in, so the room auto-enters via their session identity.)
        navigate(afterPublishPath(finalEvent.id));
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
        background: colors.surface,
        color: colors.textSubtle,
        fontSize: "14px",
      }}>
        Loading event...
      </div>
    );
  }

  return (
    <>
    {/* Guided first-run for a brand-new EVENT only (name/when/where/who). A
        product has no date/place/guest-list, so it skips straight into the
        product-shaped editor — never the event wizard. */}
    {wizardActive && eventKind === "event" && (
      <CreateWizard
        title={title} setTitle={setTitle}
        startsAt={startsAt} setStartsAt={setStartsAt}
        endsAt={endsAt} setEndsAt={setEndsAt}
        hideDate={hideDate} setHideDate={setHideDate}
        dateRevealHint={dateRevealHint} setDateRevealHint={setDateRevealHint}
        location={location} setLocation={setLocation}
        locationLat={locationLat} locationLng={locationLng}
        setLocationLat={setLocationLat} setLocationLng={setLocationLng} setLocationPlaceId={setLocationPlaceId}
        setTimezone={setTimezone}
        hideLocation={hideLocation} setHideLocation={setHideLocation}
        revealHint={revealHint} setRevealHint={setRevealHint}
        collectPhone={collectPhone} setCollectPhone={setCollectPhone}
        requirePhone={requirePhone} setRequirePhone={setRequirePhone}
        collectInstagram={collectInstagram} setCollectInstagram={setCollectInstagram}
        requireInstagram={requireInstagram} setRequireInstagram={setRequireInstagram}
        maxAttendees={maxAttendees} setMaxAttendees={setMaxAttendees}
        waitlistEnabled={waitlistEnabled} setWaitlistEnabled={setWaitlistEnabled}
        instantWaitlist={instantWaitlist} setInstantWaitlist={setInstantWaitlist}
        allowPlusOnes={allowPlusOnes} setAllowPlusOnes={setAllowPlusOnes}
        maxPlusOnesPerGuest={maxPlusOnesPerGuest} setMaxPlusOnesPerGuest={setMaxPlusOnesPerGuest}
        dinnerEnabled={dinnerEnabled} setDinnerEnabled={setDinnerEnabled}
        onDone={() => {
          setWizardDone(true);
          setStepDirection("forward");
          setCurrentStep(1);
          setActivePartId("cover");
          setWizardActive(false);
          // If they named it, make the draft real right away so it's waiting in
          // the Room even if they bounce before publishing.
          const named = (title || "").trim();
          if (named && named !== "Event Name") {
            ensureDraftEvent().catch((e) => console.warn("[draft] create-on-finish failed:", e?.message));
          }
        }}
      />
    )}
    {/* Expand-from-landing-page animation */}
    {expandAnim && (() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Calculate the transform origin and scale from the source rect
      const originX = ((expandAnim.left + expandAnim.width / 2) / vw) * 100;
      const originY = ((expandAnim.top + expandAnim.height / 2) / vh) * 100;
      const scaleX = expandAnim.width / vw;
      const scaleY = expandAnim.height / vh;
      const scale = Math.min(scaleX, scaleY);
      return (
        <style>{`
          @keyframes editorExpandIn {
            0% {
              transform: scale(${(scale * 0.92).toFixed(4)});
              border-radius: 16px;
            }
            55% {
              transform: scale(1.025);
              border-radius: 0px;
            }
            75% {
              transform: scale(0.994);
            }
            88% {
              transform: scale(1.003);
            }
            100% {
              transform: scale(1);
              border-radius: 0px;
            }
          }
        `}</style>
      );
    })()}
    <div
      className="page-with-header create-event-page"
      style={{
        height: "100dvh",
        position: "relative",
        background: colors.surface,
        overflow: "hidden",
        ...(expandAnim ? {
          transformOrigin: `${((expandAnim.left + expandAnim.width / 2) / window.innerWidth * 100).toFixed(1)}% ${((expandAnim.top + expandAnim.height / 2) / window.innerHeight * 100).toFixed(1)}%`,
          animation: "editorExpandIn 0.85s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        } : {}),
      }}
      onAnimationEnd={() => setExpandAnim(null)}
    >
      {/* No dark animated glows on the light canvas */}

      <style>{`
        @keyframes goldFlash {
          0% { border-color: ${colors.accent}; box-shadow: 0 0 0 3px ${colors.accentSoftStrong}; }
          50% { border-color: ${colors.accent}; box-shadow: 0 0 0 4px ${colors.accentSoft}; }
          100% { border-color: ${colors.border}; box-shadow: none; }
        }
        @keyframes stepSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes stepSlideInReverse {
          from { opacity: 0; transform: translateX(-24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes detailsTabGlow {
          0% { color: ${colors.textFaded}; }
          30% { color: ${colors.accent}; }
          60% { color: ${colors.accent}; }
          100% { color: ${colors.text}; }
        }
      `}</style>

      <div
        className="create-event-layout"
        style={{
          position: "relative",
          zIndex: 2,
          opacity: isMounted ? 1 : 0,
          transition: "opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          height: "calc(100dvh - 56px)",
        }}
      >
        <form ref={formRef} onSubmit={handleCreate} style={{ height: "100%" }}>
          {/* PUBLISHED-event edit's "Save changes" lives in the top nav now
              (ProtectedLayout), right where the draft's Publish sits — one clean
              control cluster across draft + published, no floating pill over the
              canvas. The header asks us to submit via the request-publish event. */}
          <div
            className="create-event-grid"
            style={{
              display: "flex",
              height: "100%",
            }}
          >
          {/* LEFT SIDE: parts rail + the active part's editor, side by side. */}
          <div
            ref={sidebarRef}
            className="create-event-sidebar"
            style={{
              // Desktop: just the 58px rail in the flex flow — the editor panel
              // floats over the preview as an absolute overlay (positioned
              // against this relative box), so opening it never reflows the
              // preview. Mobile CSS forces 100% (always-open, in-flow).
              position: "relative",
              width: "58px",
              minWidth: "58px",
              height: "100%",
              overflow: "visible",
              padding: "0",
              boxSizing: "border-box",
              background: colors.background,
              display: mobileView === "preview" ? "none" : "flex",
              flexDirection: "row",
            }}
          >
            {/* PARTS RAIL — a slim icon tool-strip (Illustrator-style): each
                page-part is an icon-only tool; the active one's name shows in the
                top action bar. Tooltip carries the label on hover. */}
            <nav
              ref={railNavRef}
              className="create-event-parts-rail"
              style={{
                width: "58px",
                minWidth: "58px",
                flexShrink: 0,
                height: "100%",
                overflowY: "auto",
                overflowX: "hidden",
                borderRight: `1px solid ${colors.border}`,
                background: colors.backgroundOverlay,
                padding: "14px 0",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
              }}
            >
              {railGroups.map((grp, gi) => (
                <div key={grp.group} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", width: "100%" }}>
                  {/* Hairline divider between tool groups (skip before the first). */}
                  {gi > 0 && <div style={{ width: "28px", height: "1px", background: colors.border, margin: "2px 0 4px" }} />}
                  {grp.items.map((it) => {
                    const active = openPartId === it.id;
                    const pinned = pinnedPartId === it.id;
                    const missing = hasAttemptedPublish && tabHasMissing[it.step];
                    const Icon = it.icon;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => {
                          if (loading) return;
                          if (pinnedPartId === it.id) { closePanel(); return; }
                          setPinnedPartId(it.id);
                          goToPart(it);
                        }}
                        onMouseEnter={() => { if (!loading) peekPart(it.id); }}
                        onMouseLeave={() => schedulePeekClose()}
                        disabled={loading}
                        title={it.label}
                        aria-label={it.label}
                        style={{
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "40px",
                          height: "40px",
                          borderRadius: "11px",
                          border: `1px solid ${active ? (it.tint ? colors.instagramBorder : colors.accentBorder) : "transparent"}`,
                          cursor: loading ? "not-allowed" : "pointer",
                          WebkitTapHighlightColor: "transparent",
                          background: active ? (it.tint ? colors.instagramSoft : colors.accentSoft) : "transparent",
                          // Tinted items (Auto-DM) keep their brand color even when idle, so the feature pops in the rail.
                          color: it.tint || (active ? colors.accent : colors.textMuted),
                          transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                          ...(detailsTabPulse && it.step === 2 ? { animation: "detailsTabGlow 1s ease forwards" } : {}),
                        }}
                      >
                        {Icon && <Icon size={20} style={{ flexShrink: 0, opacity: active ? 1 : 0.8 }} />}
                        {/* Pinned dot — a subtle cue this panel is locked open. */}
                        {pinned && (
                          <span style={{ position: "absolute", bottom: "4px", left: "50%", transform: "translateX(-50%)", width: "4px", height: "4px", borderRadius: "50%", background: colors.accent }} />
                        )}
                        {missing && (
                          <span style={{ position: "absolute", top: "5px", right: "5px", width: "6px", height: "6px", borderRadius: "50%", background: "#ef4444", border: `1.5px solid ${colors.backgroundOverlay}` }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* Editor column — the flyout panel for the open part. Hovering it
                keeps it open (cancels the peek-close); leaving schedules the
                collapse. Publish lives in a persistent floating pill, not here. */}
            <div
              ref={panelRef}
              onMouseEnter={cancelPeekClose}
              onMouseLeave={schedulePeekClose}
              style={isDesktopEditor ? {
                // Floating overlay — slides in over the preview with a composited
                // transform (no width change → no preview reflow → no jump).
                position: "absolute", left: "58px", top: 0, bottom: 0, width: "418px", zIndex: 35,
                background: colors.background, borderRight: `1px solid ${colors.border}`,
                display: "flex", flexDirection: "column",
                transform: panelOpen ? "translateX(0)" : "translateX(-14px)",
                opacity: panelOpen ? 1 : 0,
                pointerEvents: panelOpen ? "auto" : "none",
                boxShadow: panelOpen ? "10px 0 34px rgba(10,10,10,0.12)" : "none",
                transition: "transform 0.22s cubic-bezier(0.22,1,0.36,1), opacity 0.16s ease, box-shadow 0.22s ease",
              } : {
                // Mobile: in-flow, always visible (matches responsive.css).
                flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column",
              }}
            >
            {/* Panel header — the part you're editing on the left, a close on the
                right (un-pins). */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px 10px 20px", borderBottom: `1px solid ${colors.border}`, background: colors.background }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: colors.text, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {RAIL_ITEMS.find((i) => i.id === openPartId)?.label || "Edit"}
              </div>
              <button
                type="button"
                onClick={closePanel}
                title="Close"
                aria-label="Close panel"
                style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: "none", background: "transparent", color: colors.textSubtle, cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.surface; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <X size={17} />
              </button>
            </div>
            {/* Step content — the editor for the active part. */}
            <div ref={editorScrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "24px" }}>
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
            {/* Two-track AI offer — hand the look to AI, keep the logistics.
                Lives at the top of the creative step; dismissible. */}
            {AI_CREATE_ENABLED && !aiOfferDismissed && (
              <div style={{
                position: "relative",
                marginBottom: "20px",
                padding: "13px 14px",
                borderRadius: "12px",
                border: `1px solid ${colors.accentBorder}`,
                background: colors.accentSoft,
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: colors.text }}>
                    ✦ Let AI build the look
                  </div>
                  <div style={{ fontSize: "12px", lineHeight: 1.4, color: colors.textMuted, marginTop: "2px" }}>
                    It drafts the cover &amp; copy while you do the details.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={offerAiBuildLook}
                  style={{ flexShrink: 0, fontSize: "12px", fontWeight: 700, color: "#fff", background: colors.accent, border: "none", borderRadius: "999px", padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Build it
                </button>
                <button
                  type="button"
                  onClick={() => setAiOfferDismissed(true)}
                  aria-label="Dismiss"
                  style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", border: "none", background: "transparent", color: colors.textFaded, cursor: "pointer", fontSize: 15, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            )}
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
              {/* Main drop zone / first item preview — accepts anything;
                  type (image, multi-image carousel, or video) is detected
                  from the actual files dropped. */}
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16/9",
                  borderRadius: "16px",
                  overflow: "hidden",
                  background: isDragging
                    ? colors.accentSoft
                    : mediaFiles.length > 0
                      ? "transparent"
                      : colors.surface,
                  border: isDragging
                    ? `2px dashed ${colors.accentBorder}`
                    : mediaFiles.length > 0
                      ? `1px solid ${colors.border}`
                      : `1px solid ${colors.border}`,
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
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
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
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
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
                      gap: "12px",
                      background: isDragging ? colors.accentSoft : colors.surface,
                    }}
                  >
                    <div style={{ color: isDragging ? colors.accent : colors.textFaded }}>
                      <ImageIcon size={32} />
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: colors.textMuted,
                        textAlign: "center",
                        padding: "0 16px",
                      }}
                    >
                      {isDragging ? "Drop files here" : "Click or drag to upload"}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: colors.textFaded,
                        textAlign: "center",
                        padding: "0 16px",
                      }}
                    >
                      Image, multiple images, or video
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
                          ? `2px solid ${colors.accent}`
                          : `1px solid ${colors.border}`,
                        cursor: mediaMode === "images" ? "grab" : "default",
                      }}
                    >
                      {item.mediaType === "video" ? (
                        item.preview ? (
                          <img src={item.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: colors.surface }}>
                            <Film size={18} color={colors.textFaded} />
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
                          border: `1px solid ${colors.border}`,
                          cursor: "pointer",
                          padding: 0,
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.9)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.75)"; }}
                      >
                        <X size={10} color="#fff" />
                      </button>
                      {/* Per-item upload progress overlay */}
                      {typeof uploadProgress[item.id] === "number" && uploadProgress[item.id] < 100 && (
                        <>
                          <div style={{
                            position: "absolute", inset: 0,
                            background: "rgba(0,0,0,0.35)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "10px", fontWeight: 700, color: "#fff",
                            letterSpacing: "0.05em",
                          }}>
                            {Math.round(uploadProgress[item.id])}%
                          </div>
                          <div style={{
                            position: "absolute", bottom: 0, left: 0,
                            height: "3px",
                            width: `${uploadProgress[item.id]}%`,
                            background: "linear-gradient(90deg, #fbbf24, #f59e0b)",
                            transition: "width 0.2s ease",
                          }} />
                        </>
                      )}
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
                            border: `1px solid ${colors.border}`,
                            background: colors.surface,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            padding: 0,
                            transition: "all 0.15s ease",
                            WebkitTapHighlightColor: "transparent",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = colors.accentSoft;
                            e.currentTarget.style.borderColor = colors.accentBorder;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = colors.surface;
                            e.currentTarget.style.borderColor = colors.border;
                          }}
                        >
                          <TIcon size={12} color={colors.textSubtle} />
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
                        border: `1px dashed ${colors.borderStrong}`,
                        background: colors.surface,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "2px",
                        cursor: "pointer",
                        flexShrink: 0,
                        transition: "all 0.2s ease",
                        color: colors.textSubtle,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = colors.accent;
                        e.currentTarget.style.color = colors.accent;
                        e.currentTarget.style.background = colors.accentSoft;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = colors.borderStrong;
                        e.currentTarget.style.color = colors.textSubtle;
                        e.currentTarget.style.background = colors.surface;
                      }}
                    >
                      <Plus size={16} />
                      <span style={{ fontSize: "8px", fontWeight: 600 }}>ADD</span>
                    </button>
                  )}
                </div>
              )}

              {/* Media settings — appear once at least one file is uploaded;
                  panel content adapts to the detected mode + count. */}
              {mediaFiles.length > 0 && (
                <div
                  style={{
                    marginTop: "14px",
                    padding: "14px 16px",
                    borderRadius: "12px",
                    background: "#fff",
                    border: `1px solid ${colors.border}`,
                    boxShadow: "0 2px 8px rgba(10,10,10,0.04)",
                  }}
                >
                  <div style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    fontWeight: 700,
                    color: colors.textSubtle,
                    marginBottom: "12px",
                  }}>
                    {mediaMode === "video"
                      ? "Video Settings"
                      : mediaFiles.length > 1
                        ? "Carousel Settings"
                        : "Media Settings"}
                  </div>

                  {mediaMode === "video" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {/* Loop */}
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <span style={{ fontSize: "13px", color: colors.textMuted }}>Loop</span>
                        <div
                          onClick={() => setVideoLoop(!videoLoop)}
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: videoLoop ? colors.accent : colors.surfaceMuted,
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
                            background: "#fff",
                            transition: "all 0.2s ease",
                            boxShadow: "0 1px 3px rgba(10,10,10,0.15)",
                          }} />
                        </div>
                      </label>
                      {/* Autoplay */}
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <span style={{ fontSize: "13px", color: colors.textMuted }}>Autoplay</span>
                        <div
                          onClick={() => setVideoAutoplay(!videoAutoplay)}
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: videoAutoplay ? colors.accent : colors.surfaceMuted,
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
                            background: "#fff",
                            transition: "all 0.2s ease",
                            boxShadow: "0 1px 3px rgba(10,10,10,0.15)",
                          }} />
                        </div>
                      </label>
                      {/* Audio */}
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <span style={{ fontSize: "13px", color: colors.textMuted }}>Audio</span>
                        <div
                          onClick={() => setVideoAudio(!videoAudio)}
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: videoAudio ? colors.accent : colors.surfaceMuted,
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
                            background: "#fff",
                            transition: "all 0.2s ease",
                            boxShadow: "0 1px 3px rgba(10,10,10,0.15)",
                          }} />
                        </div>
                      </label>

                      {/* Thumbnail */}
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        paddingTop: "6px", borderTop: `1px solid ${colors.border}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "13px", color: colors.textMuted }}>Thumbnail</span>
                          {(customThumbnail?.preview || mediaFiles[0]?.preview) && (
                            <div style={{
                              width: "40px", height: "28px", borderRadius: "4px",
                              overflow: "hidden", background: "rgba(0,0,0,0.3)",
                              border: `1px solid ${colors.border}`,
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
                                padding: "4px 8px", borderRadius: "6px", border: `1px solid ${colors.dangerRgba}`,
                                background: colors.dangerRgba, color: colors.danger,
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
                              padding: "4px 10px", borderRadius: "6px", border: `1px solid ${colors.border}`,
                              background: colors.surface, color: colors.textMuted,
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
                      <div style={{ fontSize: "11px", color: colors.textFaded, marginTop: "4px" }}>
                        Used in dashboard, emails, and link previews
                      </div>
                    </div>
                  )}

                  {mediaMode === "images" && mediaFiles.length > 1 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {/* Autoscroll */}
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <span style={{ fontSize: "13px", color: colors.textMuted }}>Autoscroll</span>
                        <div
                          onClick={() => setCarouselAutoscroll(!carouselAutoscroll)}
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: carouselAutoscroll ? colors.accent : colors.surfaceMuted,
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
                            background: "#fff",
                            transition: "all 0.2s ease",
                            boxShadow: "0 1px 3px rgba(10,10,10,0.15)",
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
                            <span style={{ fontSize: "13px", color: colors.textMuted }}>Interval</span>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: colors.textMuted, fontVariantNumeric: "tabular-nums" }}>
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
                                background: `linear-gradient(to right, ${colors.accent} ${((carouselInterval - 0.2) / 7.8) * 100}%, ${colors.surfaceMuted} ${((carouselInterval - 0.2) / 7.8) * 100}%)`,
                                borderRadius: "2px",
                                outline: "none",
                                cursor: "pointer",
                              }}
                            />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: colors.textFaded, fontWeight: 600 }}>
                            <span>FAST</span>
                            <span>SLOW</span>
                          </div>
                        </div>
                      )}
                      {/* Loop mode — only shown when autoscroll is on */}
                      {carouselAutoscroll && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "13px", color: colors.textMuted }}>
                              {carouselLoop ? "Loop" : "Bounce"}
                            </span>
                            <span style={{ fontSize: "10px", color: colors.textFaded }}>
                              {carouselLoop ? "Infinite scroll forward" : "Reverses at each end"}
                            </span>
                          </div>
                          <div
                            onClick={() => setCarouselLoop(!carouselLoop)}
                            style={{
                              width: "36px",
                              height: "20px",
                              borderRadius: "10px",
                              background: carouselLoop ? colors.accent : colors.surfaceMuted,
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
                              background: "#fff",
                              transition: "all 0.2s ease",
                              boxShadow: "0 1px 3px rgba(10,10,10,0.15)",
                            }} />
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: "11px", color: colors.textFaded, paddingTop: "6px", borderTop: `1px solid ${colors.border}` }}>
                        First image is used as thumbnail in dashboard, emails, and link previews
                      </div>
                    </div>
                  )}

                  {/* Single image — just a note */}
                  {mediaMode === "images" && mediaFiles.length === 1 && (
                    <div style={{ fontSize: "11px", color: colors.textFaded }}>
                      This image is used as thumbnail in dashboard, emails, and link previews. Add more to create a carousel.
                    </div>
                  )}

                  {/* ─── Format — independent per screen ─── */}
                  {mediaFiles.length > 0 && (
                    <div style={{
                      marginTop: "14px",
                      paddingTop: "14px",
                      borderTop: `1px solid ${colors.border}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    }}>
                      <div style={{
                        fontSize: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        fontWeight: 700,
                        color: colors.textSubtle,
                      }}>
                        Format
                      </div>

                      {/* PHONE */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{
                          fontSize: "11px",
                          color: colors.textSubtle,
                          fontWeight: 600,
                          display: "flex",
                          justifyContent: "space-between",
                        }}>
                          <span>Phone</span>
                          {phoneMode !== "width" && (
                            <span style={{ color: colors.textFaded }}>drag preview to reposition</span>
                          )}
                        </div>
                        <FormatChoice
                          value={phoneMode}
                          thumb={mediaFiles[0]?.preview || imagePreview || null}
                          onChange={(v) => {
                            setPhoneMode(v);
                            setDesktopPreviewMode("phone");
                          }}
                          options={[
                            {
                              value: "width",
                              label: "Fit width",
                              caption: "Whole clip, no crop",
                              objectFit: "cover",
                              frameStyle: { height: "100%", aspectRatio: "4 / 5" },
                            },
                            {
                              value: "height",
                              label: "Fit height",
                              caption: "Fills screen, crops sides",
                              objectFit: "cover",
                              frameStyle: { height: "100%", aspectRatio: "9 / 16" },
                            },
                            {
                              value: "card",
                              label: "Card",
                              caption: "Whole media, padded",
                              objectFit: "contain",
                              frameStyle: { height: "100%", aspectRatio: "4 / 5", padding: "5px", boxSizing: "border-box" },
                            },
                          ]}
                        />
                      </div>

                      {/* DESKTOP */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{
                          fontSize: "11px",
                          color: colors.textSubtle,
                          fontWeight: 600,
                          display: "flex",
                          justifyContent: "space-between",
                        }}>
                          <span>Desktop</span>
                          {desktopMode !== "width" && (
                            <span style={{ color: colors.textFaded }}>drag preview to reposition</span>
                          )}
                        </div>
                        <FormatChoice
                          value={desktopMode}
                          thumb={mediaFiles[0]?.preview || imagePreview || null}
                          onChange={(v) => {
                            setDesktopMode(v);
                            setDesktopPreviewMode("desktop");
                          }}
                          options={[
                            {
                              value: "width",
                              label: "Fit width",
                              caption: "Whole — frame fits it",
                              objectFit: "cover",
                              frameStyle: { width: "92%", aspectRatio: "16 / 9" },
                            },
                            {
                              value: "height",
                              label: "Fit height",
                              caption: "Fills height, crops sides",
                              objectFit: "cover",
                              frameStyle: { height: "100%", aspectRatio: "3 / 4" },
                            },
                            {
                              value: "card",
                              label: "Card",
                              caption: "Whole media, padded",
                              objectFit: "contain",
                              frameStyle: { height: "100%", aspectRatio: "4 / 5", padding: "5px", boxSizing: "border-box" },
                            },
                          ]}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                /* Accept any image or video; once one is uploaded we further
                   restrict (e.g. only images can be added to an image set). */
                accept={
                  mediaMode === "video"
                    ? "video/mp4,video/quicktime,video/webm"
                    : mediaMode === "images"
                      ? "image/*"
                      : "image/*,video/mp4,video/quicktime,video/webm"
                }
                multiple
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
                color: colors.textSubtle,
                letterSpacing: "0.15em",
                fontWeight: 600,
                marginBottom: "16px",
              }}
            >
              {isEditMode ? "PULLUP · EDIT EVENT" : "PULLUP · CREATE EVENT"}
            </div>

            {chatActivity && activePartId !== "theme" && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "rgba(232, 200, 102, 0.08)",
                  border: "1px solid rgba(232, 200, 102, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 12,
                  fontSize: 13,
                }}
              >
                <span style={{ opacity: 0.9 }}>
                  Chat just{" "}
                  <strong style={{ color: "#f0d878" }}>
                    {chatActivity.tool.replace(/_/g, " ")}
                  </strong>
                  {" "}on this event. Refresh to see the latest.
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(232, 200, 102, 0.5)",
                      background: "rgba(232, 200, 102, 0.18)",
                      color: "#f0d878",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatActivity(null)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: `1px solid ${colors.border}`,
                      background: "transparent",
                      color: colors.textMuted,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Draft restored banner */}
            {showDraftBanner && !isEditMode && activePartId !== "theme" && (
              <div
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  background: colors.accentSoft,
                  border: `1px solid ${colors.accentBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "8px",
                }}
              >
                <span style={{ fontSize: "13px", color: colors.textMuted }}>
                  Draft restored from your last session
                </span>
                <button
                  type="button"
                  onClick={discardDraft}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "6px",
                    border: `1px solid ${colors.accentBorder}`,
                    background: "transparent",
                    color: colors.accent,
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = colors.accentSoftStrong;
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
                        ? colors.surfaceMuted
                        : colors.surface,
                    borderRadius: "12px",
                    border:
                      focusedField === "location"
                        ? `1px solid ${colors.accentBorder}`
                        : `1px solid ${colors.border}`,
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
                      setLocationPlaceId(locationData.placeId || null);

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
                            background: colors.surface,
                          }
                        : {
                            ...inputStyle,
                            background: colors.surface,
                            border: `1px solid ${colors.border}`,
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
                      color: startsAt ? colors.text : colors.textMuted,
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
                            background: colors.surface,
                          }
                        : {
                            ...inputStyle,
                            background: colors.surface,
                            border: `1px solid ${colors.border}`,
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
                      color: endsAt ? colors.text : colors.textMuted,
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

            {/* Content sections builder — the page body. Lives under "Content". */}
            <div id="part-sections" style={{ marginBottom: "16px", display: activePartId === "theme" ? "none" : "block" }}>
              {sections.map((section, i) => (
                <div key={i}
                  data-section-card
                  data-section-editor={i}
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
                    background: dragIndex === i ? colors.accentSoft : "#fff",
                    border: hoveredSection === i ? `1px solid ${colors.secondary}` : `1px solid ${colors.border}`,
                    borderRadius: "12px",
                    marginBottom: "8px",
                    transition: dragIndex !== null ? "none" : "border-color 0.15s ease",
                    opacity: dragIndex === i ? 0.5 : 1,
                    position: "relative",
                    boxShadow: "0 1px 4px rgba(10,10,10,0.04)",
                  }}>
                  {/* Drop indicator line */}
                  {dragIndex !== null && dragOverIndex === i && dragIndex !== i && dragIndex !== i - 1 && (
                    <div style={{
                      position: "absolute",
                      top: "-5px",
                      left: "8px",
                      right: "8px",
                      height: "2px",
                      background: colors.secondary,
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
                      background: colors.secondary,
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
                      }} style={{ background: "none", border: "none", color: i === 0 ? colors.borderStrong : colors.textSubtle, cursor: i === 0 ? "default" : "pointer", padding: 0, fontSize: "12px", lineHeight: 1 }}>&#9650;</button>
                      <button type="button" draggable={false} disabled={i === sections.length - 1} onClick={() => {
                        const u = [...sections]; [u[i], u[i+1]] = [u[i+1], u[i]]; setSections(u);
                        setHoveredSection(i + 1);
                      }} style={{ background: "none", border: "none", color: i === sections.length - 1 ? colors.borderStrong : colors.textSubtle, cursor: i === sections.length - 1 ? "default" : "pointer", padding: 0, fontSize: "12px", lineHeight: 1 }}>&#9660;</button>
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.textFaded, flexShrink: 0, userSelect: "none" }}>
                      {({ title: "Title", location: "Location", datetime: "Date & Time", socials: "Social Links", spotify: "Spotify", applemusic: "Apple Music", soundcloud: "SoundCloud", youtube: "YouTube", hostedby: "Hosted By", text: "Text" })[section.type] || "Text"}
                    </span>
                    <div style={{ flex: 1 }} />
                    {section.type !== "title" && section.type !== "location" && section.type !== "datetime" && (
                      <button type="button" draggable={false} onClick={() => setSections(sections.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: colors.textFaded, fontSize: "18px", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>
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
                      style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", color: colors.text, fontSize: "18px", fontWeight: 700, outline: "none", padding: 0, fontFamily: "inherit" }}
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
                          setLocationPlaceId(locationData.placeId || null);
                          const tz = await fetchTimezoneForLocation(locationData.lat, locationData.lng);
                          if (tz) setTimezone(tz);
                        }}
                        onFocus={() => setFocusedField("location")}
                        onBlur={() => setFocusedField(null)}
                        style={{ flex: 1, background: "transparent", border: "none", color: colors.text, fontSize: "15px", outline: "none", padding: 0, width: "100%", fontFamily: "inherit" }}
                        placeholder="Where's the event?"
                        disabled={loading}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                        <button
                          type="button"
                          onClick={() => setHideLocation(!hideLocation)}
                          style={{
                            width: "36px", height: "20px", borderRadius: "10px", border: "none",
                            background: hideLocation ? colors.accent : colors.surfaceMuted,
                            position: "relative", cursor: "pointer", transition: "background 0.2s ease", flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: "16px", height: "16px", borderRadius: "50%", background: "#fff",
                            position: "absolute", top: "2px",
                            left: hideLocation ? "18px" : "2px",
                            transition: "left 0.2s ease",
                            boxShadow: "0 1px 3px rgba(10,10,10,0.12)",
                          }} />
                        </button>
                        <span style={{ fontSize: "12px", color: colors.textSubtle, fontWeight: 500 }}>Reveal later</span>
                      </div>
                      {hideLocation && (
                        <input
                          type="text"
                          value={revealHint}
                          onChange={(e) => setRevealHint(e.target.value)}
                          placeholder="e.g. Location drops Friday"
                          maxLength={80}
                          style={{ width: "100%", boxSizing: "border-box", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", color: colors.text, fontSize: "12px", padding: "8px 10px", outline: "none", fontFamily: "inherit", marginTop: "8px" }}
                        />
                      )}
                      {/* Show exact coordinates — for spots an address can't pin
                          precisely. Flips on automatically when a host pastes
                          coordinates; once on, the lat/lng pair shows everywhere. */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                        <button
                          type="button"
                          onClick={() => setShowCoordinates(!showCoordinates)}
                          style={{
                            width: "36px", height: "20px", borderRadius: "10px", border: "none",
                            background: showCoordinates ? colors.accent : colors.surfaceMuted,
                            position: "relative", cursor: "pointer", transition: "background 0.2s ease", flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: "16px", height: "16px", borderRadius: "50%", background: "#fff",
                            position: "absolute", top: "2px",
                            left: showCoordinates ? "18px" : "2px",
                            transition: "left 0.2s ease",
                            boxShadow: "0 1px 3px rgba(10,10,10,0.12)",
                          }} />
                        </button>
                        <span style={{ fontSize: "12px", color: colors.textSubtle, fontWeight: 500 }}>Show exact coordinates</span>
                      </div>
                      {showCoordinates && (
                        <CoordinatePaste
                          lat={locationLat}
                          lng={locationLng}
                          colors={colors}
                          onApply={async ({ lat, lng }) => {
                            setLocationLat(lat);
                            setLocationLng(lng);
                            const tz = await fetchTimezoneForLocation(lat, lng);
                            if (tz) setTimezone(tz);
                          }}
                        />
                      )}
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
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", color: startsAt ? colors.text : colors.textSubtle, fontSize: "14px" }}>
                          <Clock size={16} color={colors.secondary} />
                          <span>{startsAt ? formatReadableDateTime(new Date(startsAt), timezone) : "Event start"}</span>
                          {startsAt && <span style={{ marginLeft: "auto", fontSize: "11px", color: colors.textFaded }}>{formatRelativeTime(new Date(startsAt))}</span>}
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
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", color: endsAt ? colors.text : colors.textSubtle, fontSize: "14px" }}>
                          <Clock size={16} color={colors.secondary} />
                          <span>{endsAt ? formatReadableDateTime(new Date(endsAt), timezone) : "Event end"}</span>
                          {endsAt && <span style={{ marginLeft: "auto", fontSize: "11px", color: colors.textFaded }}>{formatRelativeTime(new Date(endsAt))}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            const next = !hideDate;
                            setHideDate(next);
                            // When enabling Reveal-later with no date set, drop in a
                            // private placeholder (today + 30d) so the event can be
                            // published. It's used for sorting/reminders only and
                            // never shown publicly — the page and shares both
                            // honor hideDate.
                            if (next && !startsAt) {
                              const placeholder = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                              setStartsAt(placeholder.toISOString());
                            }
                          }}
                          style={{
                            width: "36px", height: "20px", borderRadius: "10px", border: "none",
                            background: hideDate ? colors.accent : colors.surfaceMuted,
                            position: "relative", cursor: "pointer", transition: "background 0.2s ease", flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: "16px", height: "16px", borderRadius: "50%", background: "#fff",
                            position: "absolute", top: "2px",
                            left: hideDate ? "18px" : "2px",
                            transition: "left 0.2s ease",
                            boxShadow: "0 1px 3px rgba(10,10,10,0.12)",
                          }} />
                        </button>
                        <span style={{ fontSize: "12px", color: colors.textSubtle, fontWeight: 500 }}>Reveal later</span>
                      </div>
                      {hideDate && (
                        <>
                          <input
                            type="text"
                            value={dateRevealHint}
                            onChange={(e) => setDateRevealHint(e.target.value)}
                            placeholder="e.g. Date announced soon"
                            maxLength={80}
                            style={{ width: "100%", boxSizing: "border-box", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", color: colors.text, fontSize: "12px", padding: "8px 10px", outline: "none", fontFamily: "inherit", marginTop: "8px" }}
                          />
                          <div style={{ fontSize: "11px", color: colors.textFaded, marginTop: "6px", lineHeight: 1.4 }}>
                            Date above is a private placeholder for sorting and reminders. Public shares show your reveal hint instead.
                          </div>
                        </>
                      )}
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
                        style={{ width: "100%", boxSizing: "border-box", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", color: colors.text, fontSize: "13px", padding: "10px 12px", outline: "none", fontFamily: "inherit" }}
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
                        style={{ width: "100%", boxSizing: "border-box", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", color: colors.text, fontSize: "13px", padding: "10px 12px", outline: "none", fontFamily: "inherit" }}
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
                        style={{ width: "100%", boxSizing: "border-box", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", color: colors.text, fontSize: "13px", padding: "10px 12px", outline: "none", fontFamily: "inherit" }}
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
                        style={{ width: "100%", boxSizing: "border-box", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", color: colors.text, fontSize: "13px", padding: "10px 12px", outline: "none", fontFamily: "inherit" }}
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
                          <span style={{ fontSize: "12px", color: colors.textSubtle, width: "76px", flexShrink: 0 }}>{label}</span>
                          <input
                            type="url"
                            value={section[key] || ""}
                            onChange={(e) => {
                              const u = [...sections]; u[i] = { ...u[i], [key]: e.target.value }; setSections(u);
                            }}
                            placeholder={placeholder}
                            style={{ flex: 1, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", color: colors.text, fontSize: "13px", padding: "8px 10px", outline: "none", fontFamily: "inherit", minWidth: 0 }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : section.type === "hostedby" ? (
                    /* Hosted by section */
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {/* Logo upload */}
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <label style={{
                          width: "48px", height: "48px", borderRadius: "8px", flexShrink: 0,
                          border: `1px dashed ${colors.borderStrong}`, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          overflow: "hidden", background: colors.surface,
                        }}>
                          {section.logo ? (
                            <img src={section.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: "4px", boxSizing: "border-box" }} />
                          ) : (
                            <span style={{ fontSize: "18px", color: colors.textFaded }}>+</span>
                          )}
                          <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const validation = validateImageFile(file, 2);
                            if (!validation.valid) { alert(validation.error); return; }
                            const compressed = await compressImage(file, 200, 200, 0.85, "image/png");
                            const u = [...sections]; u[i] = { ...u[i], logo: compressed }; setSections(u);
                          }} />
                        </label>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.textFaded, marginBottom: "4px" }}>Logo</div>
                          <div style={{ fontSize: "11px", color: colors.textSubtle }}>{section.logo ? "Click to change" : "Click to upload"}</div>
                        </div>
                        {section.logo && (
                          <button type="button" onClick={() => { const u = [...sections]; u[i] = { ...u[i], logo: "" }; setSections(u); }}
                            style={{ background: "none", border: "none", color: colors.textFaded, fontSize: "14px", cursor: "pointer", padding: "4px" }}>&times;</button>
                        )}
                      </div>
                      {/* Name */}
                      <input
                        type="text"
                        value={section.name || ""}
                        onChange={(e) => { const u = [...sections]; u[i] = { ...u[i], name: e.target.value }; setSections(u); }}
                        placeholder="Host or agency name"
                        style={{ width: "100%", boxSizing: "border-box", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", color: colors.text, fontSize: "14px", padding: "10px 12px", outline: "none", fontFamily: "inherit" }}
                      />
                      {/* Email */}
                      <input
                        type="email"
                        value={section.email || ""}
                        onChange={(e) => { const u = [...sections]; u[i] = { ...u[i], email: e.target.value }; setSections(u); }}
                        placeholder="Contact email"
                        style={{ width: "100%", boxSizing: "border-box", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", color: colors.text, fontSize: "13px", padding: "8px 12px", outline: "none", fontFamily: "inherit" }}
                      />
                      {/* Website */}
                      <input
                        type="url"
                        value={section.website || ""}
                        onChange={(e) => { const u = [...sections]; u[i] = { ...u[i], website: e.target.value }; setSections(u); }}
                        placeholder="Website URL"
                        style={{ width: "100%", boxSizing: "border-box", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", color: colors.text, fontSize: "13px", padding: "8px 12px", outline: "none", fontFamily: "inherit" }}
                      />
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
                        style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", color: colors.text, fontSize: "15px", fontWeight: 600, outline: "none", padding: 0, marginBottom: "8px", fontFamily: "inherit" }}
                      />
                      <textarea
                        value={section.text || ""}
                        onChange={(e) => {
                          const u = [...sections]; u[i] = { ...u[i], text: e.target.value }; setSections(u);
                        }}
                        placeholder="Write your content..."
                        style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", color: colors.textMuted, fontSize: "14px", lineHeight: "1.6", outline: "none", resize: "vertical", minHeight: "60px", padding: 0, fontFamily: "inherit" }}
                      />
                    </>
                  )}

                </div>
              ))}

              {/* Add section grid — always visible */}
              <div style={{
                borderRadius: "12px", border: `1px dashed ${colors.border}`,
                background: colors.surface, padding: "10px 8px 8px",
              }}>
                <div style={{ fontSize: "11px", fontWeight: 500, color: colors.textFaded, textAlign: "center", marginBottom: "8px" }}>Add section</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
                  {[
                    { data: { type: "text", title: "Heading", text: "Write something here..." }, icon: "T", label: "Text", color: colors.accent },
                    { data: { type: "spotify", url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT" }, icon: "\u266B", label: "Spotify", color: "#1DB954" },
                    { data: { type: "applemusic", url: "https://music.apple.com/us/album/blinding-lights/1499378108?i=1499378615" }, icon: "\u266A", label: "Apple", color: "#FC3C44" },
                    { data: { type: "soundcloud", url: "https://soundcloud.com/fredagain" }, icon: "\u266A", label: "SoundCloud", color: "#FF5500" },
                    { data: { type: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }, icon: "\u25B6", label: "YouTube", color: "#FF0000" },
                    { data: { type: "socials", instagram: "https://instagram.com/pullup", spotify: "https://open.spotify.com/artist/example", tiktok: "https://tiktok.com/@pullup", soundcloud: "" }, icon: "@", label: "Socials", color: "#E1306C" },
                    { data: { type: "hostedby", name: "", logo: "", email: "", website: "" }, icon: "\u2605", label: "Hosted by", color: "#a3e635" },
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
                        e.currentTarget.style.background = colors.accentSoft;
                        e.currentTarget.querySelector("[data-icon]").style.color = item.color;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.querySelector("[data-icon]").style.color = colors.textFaded;
                      }}
                    >
                      <span data-icon style={{ fontSize: "20px", color: colors.textFaded, transition: "color 0.15s ease", lineHeight: 1 }}>{item.icon}</span>
                      <span style={{ fontSize: "9px", fontWeight: 500, color: colors.textSubtle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{item.label}</span>
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
                  color: colors.textSubtle,
                  fontWeight: 600,
                  marginBottom: "20px",
                }}
              >
                SOCIALS
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {[
                  { icon: FaInstagram, value: instagram, onChange: setInstagram, placeholder: "Instagram URL" },
                  { icon: FaSpotify, value: spotify, onChange: setSpotify, placeholder: "Spotify URL" },
                  { icon: FaTiktok, value: tiktok, onChange: setTiktok, placeholder: "TikTok URL" },
                  { icon: FaSoundcloud, value: soundcloud, onChange: setSoundcloud, placeholder: "SoundCloud URL" },
                ].map(({ icon: Icon, value, onChange, placeholder }) => (
                  <div
                    key={placeholder}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 16px",
                      background: "#fff",
                      borderRadius: "12px",
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    <Icon size={20} style={{ flexShrink: 0, color: colors.textSubtle }} />
                    <input
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder={placeholder}
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        color: colors.text,
                        fontSize: "14px",
                        outline: "none",
                        padding: 0,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Auto-DM panel — same step as the form, toggled by the rail's
                Instagram icon (activePartId === "autoDm"). Scoped to THIS event. */}
            <div
              style={{
                display: currentStep === 3 && activePartId === "autoDm" ? "block" : "none",
              }}
            >
              <EventAutoDmPanel eventId={editEventId} eventStatus={eventStatus} isEditMode={isEditMode} kind={eventKind} />
            </div>

            {/* Product price & delivery panel — product pages only, same step,
                toggled by the rail's "Price & delivery" item. */}
            <div
              style={{
                display: currentStep === 3 && activePartId === "price" ? "block" : "none",
              }}
            >
              <ProductPricePanel
                eventId={isEditMode ? editEventId : draftEventId}
                paymentsV2Live={paymentsV2Live}
                price={ticketPrice}
                setPrice={setTicketPrice}
                currency={ticketCurrency}
                setCurrency={setTicketCurrency}
                fulfillment={fulfillment}
                setFulfillment={setFulfillment}
                ensureDraft={ensureDraftEvent}
              />
            </div>

            {/* === STEP 4 (tab position): FORM === */}
            <div
              style={{
                display: currentStep === 3 && activePartId !== "autoDm" && activePartId !== "price" ? "block" : "none",
              }}
            >

            {/* Sign-up display — show/hide the on-page sign-up surface (the
                inline "Free to join" block + the sticky bottom bar move
                together) and override the eyebrow + button text. */}
            <div style={{ marginBottom: "28px" }}>
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  color: colors.textSubtle,
                  fontWeight: 600,
                  marginBottom: "12px",
                }}
              >
                SIGN-UP ON THE PAGE
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  background: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: "8px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: colors.text }}>
                    Sign-up block
                  </div>
                  <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "2px" }}>
                    {signupHidden ? "Hidden from the page" : "Shown on the page"}
                  </div>
                </div>
                <div style={{ display: "inline-flex", gap: "2px", padding: "2px", background: colors.background, border: `1px solid ${colors.border}`, borderRadius: "8px", flexShrink: 0 }}>
                  {[{ key: false, label: "Show" }, { key: true, label: "Hide" }].map((opt) => {
                    const active = signupHidden === opt.key;
                    return (
                      <button
                        key={String(opt.key)}
                        type="button"
                        onClick={() => setSignupHidden(opt.key)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "6px",
                          border: "none",
                          background: active ? colors.accent : "transparent",
                          color: active ? "#fff" : colors.textMuted,
                          fontSize: "13px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {!signupHidden && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
                  <label style={{ display: "block" }}>
                    <span style={{ display: "block", fontSize: "12px", color: colors.textMuted, marginBottom: "4px" }}>Eyebrow text</span>
                    <input
                      type="text"
                      value={signupLabelText}
                      onChange={(e) => setSignupLabelText(e.target.value)}
                      placeholder={eventKind === "community" ? "Free to join" : "Free entry"}
                      style={{
                        width: "100%", boxSizing: "border-box", padding: "10px 12px",
                        background: colors.surface, border: `1px solid ${colors.border}`,
                        borderRadius: "8px", color: colors.text, fontSize: "14px",
                      }}
                    />
                  </label>
                  <label style={{ display: "block" }}>
                    <span style={{ display: "block", fontSize: "12px", color: colors.textMuted, marginBottom: "4px" }}>Button text</span>
                    <input
                      type="text"
                      value={signupCtaText}
                      onChange={(e) => setSignupCtaText(e.target.value)}
                      placeholder={eventKind === "community" ? "Join the community" : "Sign-up"}
                      style={{
                        width: "100%", boxSizing: "border-box", padding: "10px 12px",
                        background: colors.surface, border: `1px solid ${colors.border}`,
                        borderRadius: "8px", color: colors.text, fontSize: "14px",
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Form Section */}
            <div>
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  color: colors.textSubtle,
                  fontWeight: 600,
                  marginBottom: "20px",
                }}
              >
                FORM
              </div>

              {/* Contact channel — drives the locked rows below and the
                  channel reminders / confirms go out on. WhatsApp captures
                  a verified phone via the magic-link flow; Email keeps the
                  classic path; Both lets the host meet every guest where
                  they live. */}
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: colors.textSubtle,
                    marginBottom: 6,
                  }}
                >
                  RSVP form
                </div>
                <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
                  Name is always required. Email and WhatsApp are how you reach people — at least one must be required. Instagram is a bonus.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[
                    { label: "Name", channel: "name", fixed: true },
                    // Email is the reach floor — it can't be turned Off, only
                    // Required ↔ Optional (so a host can hand the floor to WhatsApp).
                    { label: "Email", channel: "email", floor: true, collect: true, require: requireEmail, set: (_c, r) => setRequireEmail(r) },
                    { label: "WhatsApp", channel: "whatsapp", collect: collectPhone, require: requirePhone, set: (c, r) => { setCollectPhone(c); setRequirePhone(r); } },
                    { label: "Instagram", channel: "instagram", collect: collectInstagram, require: requireInstagram, set: (c, r) => { setCollectInstagram(c); setRequireInstagram(r); } },
                  ].map((row) => {
                    const mode = row.fixed ? "required" : !row.collect ? "off" : row.require ? "required" : "optional";
                    const brandAccent = CHANNEL_BRAND[row.channel]?.accent || colors.accent;
                    const toggleOpts = row.floor
                      ? [{ key: "optional", label: "Optional" }, { key: "required", label: "Required" }]
                      : [{ key: "off", label: "Off" }, { key: "optional", label: "Optional" }, { key: "required", label: "Required" }];
                    return (
                    <div
                      key={row.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        background: colors.surface,
                        border: `1px solid ${colors.border}`,
                        borderRadius: "8px",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
                        <ChannelBadge channel={row.channel} size={28} />
                        <span style={{ fontSize: "14px", fontWeight: 500, color: colors.text }}>{row.label}</span>
                      </span>
                      {row.fixed ? (
                        <span style={{ fontSize: "12px", color: colors.textMuted }}>Always required</span>
                      ) : (
                        <div style={{ display: "inline-flex", gap: "2px", padding: "2px", background: colors.background, border: `1px solid ${colors.border}`, borderRadius: "8px" }}>
                          {toggleOpts.map((opt) => {
                            const active = mode === opt.key;
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => row.set(opt.key !== "off", opt.key === "required")}
                                style={{
                                  padding: "5px 10px",
                                  borderRadius: "6px",
                                  border: "none",
                                  background: active ? (opt.key === "off" ? colors.border : brandAccent) : "transparent",
                                  color: active ? (opt.key === "off" ? colors.text : "#fff") : colors.textMuted,
                                  fontSize: "12px",
                                  fontWeight: active ? 600 : 500,
                                  cursor: "pointer",
                                  transition: "background 120ms ease, color 120ms ease",
                                }}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>

              {/* enrichment questions — host-authored free-text prompts, shown
                  below the four anchors. Not identity; pure enrichment. */}
              <div style={{ marginTop: "24px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.textSubtle, marginBottom: 6 }}>
                  Your questions
                </div>
                <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
                  Ask anything — you write the question. "Allergies?", "Which restaurant are you from?". Free text, shown below the fields above. Answers land on each guest and follow them across your events.
                </div>
                {(enrichmentQuestions || []).length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {(enrichmentQuestions || []).map((q, idx) => (
                      <div key={q.id || idx} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px" }}>
                        <input
                          type="text"
                          value={q.label || ""}
                          onChange={(e) => { const v = e.target.value; setEnrichmentQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, label: v } : x))); }}
                          placeholder="Type your question…"
                          style={{ flex: 1, minWidth: 0, padding: "7px 9px", border: `1px solid ${colors.border}`, borderRadius: "6px", background: "#fff", color: colors.text, fontSize: "14px", outline: "none" }}
                        />
                        <button
                          type="button"
                          onClick={() => setEnrichmentQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, required: !x.required } : x)))}
                          title={q.required ? "Required — guests must answer" : "Optional — guests can skip"}
                          style={{ padding: "5px 10px", borderRadius: "6px", border: `1px solid ${q.required ? colors.accent : colors.border}`, background: q.required ? colors.accent : "transparent", color: q.required ? "#fff" : colors.textMuted, fontSize: "12px", fontWeight: q.required ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          {q.required ? "Required" : "Optional"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEnrichmentQuestions((prev) => prev.filter((x) => x.id !== q.id))}
                          aria-label="Remove question"
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "6px", border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", flexShrink: 0 }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setEnrichmentQuestions((prev) => [...(prev || []), { id: `q_${Math.random().toString(36).slice(2, 9)}`, label: "", required: false }])}
                  style={{ marginTop: (enrichmentQuestions || []).length ? "8px" : 0, display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderRadius: "8px", border: `1px dashed ${colors.border}`, background: "transparent", color: colors.accent, fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  <Plus size={15} /> Add a question
                </button>
              </div>

              {/* event options */}
              <div style={{ marginTop: "28px", marginBottom: "16px" }}>
                <h3
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    marginBottom: "10px",
                    color: colors.textSubtle,
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
                        border: `1px solid ${colors.border}`,
                        background: "#fff",
                        color: colors.text,
                        fontSize: "16px",
                        textAlign: "right",
                        outline: "none",
                      }}
                    />
                  }
                />
                {/* tickets — only when the rail-agnostic checkout is live */}
                {paymentsV2Live && (
                  <OptionRow
                    icon={<SilverIcon as={Ticket} size={20} />}
                    label="Paid tickets"
                    description={sellTicketsEnabled ? "Guests pay when they register — Swish, M-Pesa or card by currency." : null}
                    right={
                      <Toggle
                        checked={sellTicketsEnabled}
                        onChange={setSellTicketsEnabled}
                      />
                    }
                  />
                )}
                {paymentsV2Live && sellTicketsEnabled && (
                  <OptionRow
                    icon={<span style={{ width: 20 }} />}
                    label="Price per person"
                    right={
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={ticketPrice}
                          onChange={(e) => setTicketPrice(e.target.value)}
                          placeholder="150"
                          style={{
                            width: "80px",
                            padding: "5px 10px",
                            borderRadius: "8px",
                            border: `1px solid ${colors.border}`,
                            background: "#fff",
                            color: colors.text,
                            fontSize: "16px",
                            textAlign: "right",
                            outline: "none",
                          }}
                        />
                        <select
                          value={ticketCurrency}
                          onChange={(e) => setTicketCurrency(e.target.value)}
                          style={{
                            padding: "6px 8px",
                            borderRadius: "8px",
                            border: `1px solid ${colors.border}`,
                            background: "#fff",
                            color: colors.text,
                            fontSize: "13px",
                            outline: "none",
                          }}
                        >
                          <option value="SEK">SEK</option>
                          <option value="KES">KES</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                    }
                  />
                )}
                {/* waitlist — only show when capacity is set */}
                {maxAttendees && (
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
                )}
                {/* instant waitlist */}
                <OptionRow
                  icon={<SilverIcon as={Clock} size={20} />}
                  label="Waitlist-only"
                  description="Everyone registers interest. You approve who gets in."
                  right={
                    <Toggle
                      checked={instantWaitlist}
                      onChange={setInstantWaitlist}
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
                          background: colors.surface, borderRadius: "8px",
                          border: `1px solid ${colors.border}`, padding: "2px",
                        }}>
                          <button type="button" onClick={() => {
                            const c = parseInt(maxPlusOnesPerGuest, 10) || 1;
                            if (c > 1) setMaxPlusOnesPerGuest(String(c - 1));
                          }} disabled={parseInt(maxPlusOnesPerGuest, 10) <= 1} style={{
                            width: "28px", height: "28px", borderRadius: "6px", border: "none",
                            background: parseInt(maxPlusOnesPerGuest, 10) <= 1 ? "transparent" : colors.accentSoft,
                            color: colors.text, fontSize: "16px", fontWeight: 600,
                            cursor: parseInt(maxPlusOnesPerGuest, 10) <= 1 ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            opacity: parseInt(maxPlusOnesPerGuest, 10) <= 1 ? 0.3 : 1, transition: "all 0.15s ease",
                          }}>−</button>
                          <div style={{
                            minWidth: "24px", textAlign: "center", fontSize: "14px",
                            fontWeight: 600, color: colors.text, padding: "0 2px",
                          }}>{maxPlusOnesPerGuest}</div>
                          <button type="button" onClick={() => {
                            const c = parseInt(maxPlusOnesPerGuest, 10) || 1;
                            if (c < 5) setMaxPlusOnesPerGuest(String(c + 1));
                          }} disabled={parseInt(maxPlusOnesPerGuest, 10) >= 5} style={{
                            width: "28px", height: "28px", borderRadius: "6px", border: "none",
                            background: parseInt(maxPlusOnesPerGuest, 10) >= 5 ? "transparent" : colors.accentSoft,
                            color: colors.text, fontSize: "16px", fontWeight: 600,
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
                      border: `1px solid ${colors.border}`,
                      background: "#fff",
                      boxShadow: "0 2px 8px rgba(10,10,10,0.04)",
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
                          color: colors.text,
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
                              <span style={{ fontSize: "10px", color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                              {labelExtra}
                            </div>
                            <div style={{
                              display: "flex", alignItems: "center", gap: "2px",
                              background: colors.surface, borderRadius: "8px",
                              border: `1px solid ${colors.border}`, padding: "2px",
                            }}>
                              <button type="button" onClick={onMinus} disabled={disableMinus} style={{
                                width: "28px", height: "28px", borderRadius: "6px", border: "none",
                                background: disableMinus ? "transparent" : colors.accentSoft,
                                color: colors.text, fontSize: "16px", fontWeight: 600, cursor: disableMinus ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                opacity: disableMinus ? 0.3 : 1, transition: "all 0.15s ease",
                              }}>−</button>
                              <div style={{
                                flex: 1, textAlign: "center", fontSize: "14px",
                                fontWeight: 600, color: colors.text, padding: "0 4px",
                              }}>{value || "—"}</div>
                              <button type="button" onClick={onPlus} disabled={disablePlus} style={{
                                width: "28px", height: "28px", borderRadius: "6px", border: "none",
                                background: disablePlus ? "transparent" : colors.accentSoft,
                                color: colors.text, fontSize: "16px", fontWeight: 600, cursor: disablePlus ? "not-allowed" : "pointer",
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
                                  background: colors.surface, borderRadius: "12px",
                                  border: `1px solid ${colors.border}`, padding: "12px",
                                  display: "flex", flexDirection: "column", gap: "10px",
                                }}>
                                  {/* Row 1: Time input */}
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <div style={{
                                      fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                                      letterSpacing: "0.05em", color: colors.textSubtle, minWidth: "16px",
                                    }}>
                                      {slotCount > 1 ? `${index + 1}` : ""}
                                    </div>
                                    {(() => {
                                      const timeVal = dinnerSlotsConfig[index]?.time || "18:00";
                                      const [hh, mm] = timeVal.split(":");
                                      const selStyle = {
                                        flex: 1, height: "38px", borderRadius: "10px",
                                        border: `1px solid ${colors.border}`,
                                        background: "#fff",
                                        color: colors.text, fontSize: "14px", fontWeight: 600,
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
                                          <span style={{ fontSize: "16px", fontWeight: 700, color: colors.textSubtle }}>:</span>
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
                                        background: colors.dangerRgba, color: colors.danger,
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
                                            color: hideDinnerRemaining ? colors.textFaded : colors.textSubtle,
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
                                padding: "8px 14px", borderRadius: "10px", border: `1px dashed ${colors.border}`,
                                background: "transparent", color: colors.textMuted, fontSize: "13px",
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
                        color: colors.textSubtle, marginBottom: "8px",
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
                          background: "#fff",
                          border: `1px solid ${colors.border}`,
                          borderRadius: "10px",
                        }}
                      />
                      <div style={{ fontSize: "11px", color: colors.textFaded, marginTop: "6px" }}>
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
              <div style={{ fontSize: "13px", color: colors.textFaded, marginBottom: "16px" }}>
                Every event is free to attend right now.
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "16px",
                  borderRadius: "12px",
                  border: `1px solid ${colors.border}`,
                  background: colors.surface,
                }}
              >
                <SilverIcon as={AlertTriangle} size={18} style={{ color: colors.textFaded, flexShrink: 0, marginTop: "1px" }} />
                <div style={{ fontSize: "13px", lineHeight: 1.5, color: colors.textMuted }}>
                  <div style={{ fontWeight: 600, color: colors.text, marginBottom: "4px" }}>
                    Paid tickets are paused
                  </div>
                  We're rebuilding payments around Swish and M-Pesa so they actually
                  fit how people pay. Until then, events go out free — and you'll be
                  first to know when selling is back.
                </div>
              </div>

            </div>
            {/* end animation wrapper */}
            </div>
            {/* end step content wrapper */}
            </div>

            {/* Primary action (Publish / Save) now lives in the top action bar.
                Only the destructive Delete keeps a quiet home at the foot, in
                edit mode. */}
            {isEditMode && (
              <div
                style={{
                  flexShrink: 0,
                  padding: "10px 20px",
                  paddingBottom: "max(10px, env(safe-area-inset-bottom))",
                  borderTop: `1px solid ${colors.border}`,
                  background: colors.background,
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    padding: "7px 12px",
                    borderRadius: "9px",
                    border: "none",
                    background: "transparent",
                    color: "rgba(239, 68, 68, 0.7)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <Trash2 size={15} />
                  Delete event
                </button>
              </div>
            )}
            </div>{/* end editor column */}
          </div>

          {/* RIGHT SIDE: Live Preview (desktop only) — stays dark; it IS the guest page */}
          <div
            className="create-event-preview-desktop"
            style={{
              flex: 1,
              height: "100%",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#0d0b12",
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
                background: "rgba(255,255,255,0.10)",
                backdropFilter: "blur(16px)",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.14)",
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
                      ? "rgba(255,255,255,0.16)"
                      : "transparent",
                  color:
                    desktopPreviewMode === "desktop"
                      ? "#fff"
                      : "rgba(255,255,255,0.45)",
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
                      ? "rgba(255,255,255,0.16)"
                      : "transparent",
                  color:
                    desktopPreviewMode === "phone"
                      ? "#fff"
                      : "rgba(255,255,255,0.45)",
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
                    background: colors.surfaceMuted,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    color: colors.textMuted,
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
                    background: colors.surface, display: "flex", alignItems: "center",
                    padding: "0 10px", fontSize: "10px", color: colors.textFaded,
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
              {(() => {
                const previewProps = {
                  title,
                  kind: eventKind,
                  autoShowRsvp: currentStep === 3 || currentStep === 5,
                  activeStep: currentStep,
                  description,
                  location,
                  locationLat,
                  locationLng,
                  showCoordinates,
                  startsAt,
                  endsAt,
                  timezone,
                  imagePreview,
                  media: mediaFiles.length > 0 ? mediaFiles.map((m, i) => ({
                    id: m.id,
                    url: m.previewUrl || m.preview,
                    mediaType: m.mediaType,
                    position: i,
                  })) : null,
                  mediaSettings: buildMediaSettings(),
                  ticketType: ticketsArePaid ? "paid" : "free",
                  instagram,
                  spotify,
                  tiktok,
                  soundcloud,
                  ticketPrice: ticketsArePaid ? Math.round(Number(ticketPrice) * 100) : null,
                  ticketCurrency: ticketsArePaid ? ticketCurrency.toLowerCase() : null,
                  sections,
                  design: scene || null,
                  hoveredSection,
                  onEditPart: handleEditPart,
                  onHoverPart: handleHoverPart,
                  hideLocation,
                  hideDate,
                  revealHint: revealHint || null,
                  dateRevealHint: dateRevealHint || null,
                  instantWaitlist,
                  hideSignup: signupHidden,
                  signupLabel: signupLabelText.trim() || null,
                  signupCta: signupCtaText.trim() || null,
                  rsvpContent: ({ onClose }) => (
                    <RsvpForm
                      preview
                      event={{
                        slug: null,
                        dinnerEnabled: dinnerEnabled,
                        dinnerBookingEmail: dinnerBookingEmail || null,
                        waitlistEnabled: waitlistEnabled,
                        hideDinnerRemaining: hideDinnerRemaining,
                        maxPlusOnesPerGuest: allowPlusOnes ? parseInt(maxPlusOnesPerGuest, 10) || 0 : 0,
                        timezone: timezone,
                        formFields,
                        enrichmentQuestions,
                        contactChannel,
                        requirePhone,
                        requireInstagram,
                        collectPhone,
                        collectInstagram,
                      }}
                      previewSlots={previewDinnerSlots}
                      onSubmit={async () => {
                        onClose();
                        showToast("This is a preview — no RSVP was submitted", "info");
                      }}
                      loading={false}
                      onClose={onClose}
                    />
                  ),
                };
                return (
                  <div className="brand-scope" style={{ display: "contents" }}>
                    {desktopPreviewMode === "desktop"
                      ? <DesktopEventLayout {...previewProps} onFocusDrag={makeFocusDragHandler("desktop")} />
                      : <EventPreview {...previewProps} compact onFocusDrag={makeFocusDragHandler("phone")} />}
                  </div>
                );
              })()}
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
          className="create-event-preview-mobile brand-scope"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100dvh",
            zIndex: 100,
            background: "#05040a",
          }}
        >
          <EventPreview
            onFocusDrag={makeFocusDragHandler("phone")}
            title={title}
            kind={eventKind}
            description={description}
            location={location}
            locationLat={locationLat}
            locationLng={locationLng}
            showCoordinates={showCoordinates}
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
            mediaSettings={buildMediaSettings()}
            ticketType={ticketsArePaid ? "paid" : "free"}
            compact
            autoShowRsvp={currentStep === 4 || currentStep === 5}
            activeStep={currentStep}
            instagram={instagram}
            spotify={spotify}
            ticketPrice={ticketsArePaid ? Math.round(Number(ticketPrice) * 100) : null}
            ticketCurrency={ticketsArePaid ? ticketCurrency.toLowerCase() : null}
            sections={sections}
            design={scene || null}
            hideSignup={signupHidden}
            signupLabel={signupLabelText.trim() || null}
            signupCta={signupCtaText.trim() || null}
            rsvpContent={({ onClose }) => (
              <RsvpForm
                preview
                event={{
                  slug: null,
                  dinnerEnabled: dinnerEnabled,
                  dinnerBookingEmail: dinnerBookingEmail || null,
                  waitlistEnabled: waitlistEnabled,
                  hideDinnerRemaining: hideDinnerRemaining,
                  maxPlusOnesPerGuest: allowPlusOnes ? parseInt(maxPlusOnesPerGuest, 10) || 0 : 0,
                  formFields,
                  enrichmentQuestions,
                  contactChannel,
                  requirePhone,
                  requireInstagram,
                  collectPhone,
                  collectInstagram,
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
          background: colors.background,
          borderRadius: "14px",
          border: `1px solid ${colors.border}`,
          padding: "4px",
          boxShadow: "0 8px 30px rgba(10,10,10,0.12)",
        }}
      >
        <button
          type="button"
          onClick={() => setMobileView("edit")}
          style={{
            padding: "10px 20px",
            borderRadius: "10px",
            border: "none",
            background: mobileView === "edit" ? colors.accent : "transparent",
            color: mobileView === "edit" ? "#fff" : colors.textMuted,
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
            background: mobileView === "preview" ? colors.accent : "transparent",
            color: mobileView === "preview" ? "#fff" : colors.textMuted,
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

      {/* Publish auth — the one door. Google returns to /create so the
          pendingPublish resume (see effect above) fires and auto-publishes;
          for in-place auth (WhatsApp/email link) onAuthed just closes the
          modal and that same resume does the publish. */}
      {showPublishAuth && (
        <AuthGate
          redirectTo="/create"
          onDismiss={() => setShowPublishAuth(false)}
          onAuthed={() => setShowPublishAuth(false)}
        />
      )}

      {/* Delete event confirmation */}
      {showDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            style={{
              background: colors.background,
              border: `1px solid ${colors.border}`,
              borderRadius: "20px",
              padding: "28px 24px 20px",
              maxWidth: "320px",
              width: "100%",
              boxShadow: "0 8px 30px rgba(10,10,10,0.12)",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              fontSize: "17px",
              fontWeight: 700,
              color: colors.text,
              marginBottom: "6px",
            }}>
              Delete this event?
            </div>
            <div style={{
              fontSize: "14px",
              color: colors.textSubtle,
              marginBottom: "24px",
            }}>
              This action cannot be undone. The event and all its data will be permanently removed.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                type="button"
                disabled={deleting}
                onClick={async (e) => {
                  e.stopPropagation();
                  setDeleting(true);
                  try {
                    const res = await authenticatedFetch(`/host/events/${editEventId}`, { method: "DELETE" });
                    const data = await res.json();
                    if (!res.ok) {
                      showToast(data.message || "Could not delete event", "error");
                      setShowDeleteConfirm(false);
                      return;
                    }
                    showToast("Event deleted", "success");
                    navigate("/room");
                  } catch (err) {
                    console.error(err);
                    showToast("Could not delete event", "error");
                  } finally {
                    setDeleting(false);
                    setShowDeleteConfirm(false);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "12px",
                  border: "none",
                  background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  color: "#fff",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.7 : 1,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {deleting ? "Deleting..." : "Delete event"}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "12px",
                  border: `1px solid ${colors.border}`,
                  background: "transparent",
                  color: colors.textMuted,
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
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
        background: "#fff",
        borderRadius: "10px",
        marginBottom: "6px",
        border: `1px solid ${colors.border}`,
        transition: "all 0.2s ease",
        minHeight: "44px",
        boxShadow: "0 1px 3px rgba(10,10,10,0.03)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = colors.borderStrong;
        e.currentTarget.style.boxShadow = "0 2px 6px rgba(10,10,10,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = colors.border;
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(10,10,10,0.03)";
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
              color: colors.text,
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
                color: colors.textSubtle,
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
          background: checked ? colors.accent : colors.surfaceMuted,
          borderRadius: "10px",
          transition: "all 0.3s ease",
          border: checked ? "none" : `1px solid ${colors.border}`,
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
            boxShadow: "0 1px 3px rgba(10,10,10,0.15)",
          }}
        />
      </span>
    </label>
  );
}
