// frontend/src/lib/urlUtils.js
// Utility functions for URL handling (localhost vs production)
import { formatDateForCalendar, addHours } from "./dateUtils.js";

// Frontend and backend base URLs are driven by env, with sensible dev fallbacks.
// This keeps dev/prod/staging deploys aligned without hardcoding domains.
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || "";
const DEV_FRONTEND_FALLBACK = "http://localhost:5173";
const DEV_API_FALLBACK = "http://localhost:3001";

// Allow explicit control via VITE_NODE_ENV, but also respect Vite's DEV flag.
const VITE_NODE_ENV = import.meta.env.VITE_NODE_ENV || "";
const IS_DEV =
  VITE_NODE_ENV.toLowerCase() === "development" || import.meta.env.DEV;

export function getBaseUrl() {
  // In development, prefer the real browser origin when available
  if (IS_DEV) {
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin;
    }
    // Fallback if window isn't available (e.g. during SSR or tests)
    return FRONTEND_URL || DEV_FRONTEND_FALLBACK;
  }

  // In production-like builds, use explicit env when provided
  if (FRONTEND_URL) {
    return FRONTEND_URL;
  }

  // As a last resort, fall back to window.location.origin if available
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  throw new Error(
    "[getBaseUrl] VITE_FRONTEND_URL is not set and window.location.origin is unavailable.",
  );
}

function getShareOrigin() {
  // In dev, the backend serves /share/:slug directly.
  // Prefer an explicit share origin or API URL, then default to localhost backend.
  if (IS_DEV) {
    const apiBase =
      import.meta.env.VITE_API_URL ||
      (import.meta.env.DEV ? DEV_API_FALLBACK : "/api");
    return (
      import.meta.env.VITE_SHARE_ORIGIN ||
      apiBase.replace(/\/api\/?$/, "").replace(/\/$/, "")
    );
  }

  // In prod, nginx (or your proxy) usually serves /share/:slug on the same domain as the frontend.
  const baseUrl = getBaseUrl();
  return import.meta.env.VITE_SHARE_ORIGIN || baseUrl;
}

export function getEventUrl(slug) {
  return `${getBaseUrl()}/e/${slug}`;
}

/**
 * Share URL for link previews (ALWAYS use this in share text)
 * - Dev: {shareOrigin}/share/:slug (usually http://localhost:3001/share/:slug)
 * - Prod: {shareOrigin}/share/:slug (usually https://your-domain/share/:slug)
 */
export function getEventShareUrl(slug) {
  if (!slug) {
    console.error("[getEventShareUrl] No slug provided!");
    return "";
  }

  // Warn if UUID passed by mistake
  if (
    slug.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  ) {
    console.error(
      `[getEventShareUrl] WARNING: Received UUID instead of slug: ${slug}`
    );
  }

  const url = `${getShareOrigin()}/share/${slug}`;
  return url;
}

export function getSuccessUrl(slug) {
  return `${getBaseUrl()}/e/${slug}/success`;
}

export function getOgImageUrl() {
  return `${getBaseUrl()}/og-image.jpg`;
}

/**
 * Generate calendar URLs for an event
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.description
 * @param {string} params.location
 * @param {string} params.slug
 * @param {string|Date} params.startsAt
 * @param {string|Date} params.endsAt
 */
export function generateCalendarUrls({
  title,
  description = "",
  location = "",
  slug,
  startsAt,
  endsAt,
}) {
  const start = formatDateForCalendar(startsAt);
  if (!start) return {};

  // If no explicit end time is provided, default to 3 hours after start
  const end = formatDateForCalendar(endsAt || addHours(startsAt, 3));
  const encodedTitle = encodeURIComponent(title || "Event");
  const encodedLocation = encodeURIComponent(location || "");

  const baseUrl =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : getBaseUrl();
  const eventUrl = slug ? `${baseUrl}/e/${slug}` : baseUrl;
  const fullDescription = description
    ? `${description}\n\nEvent page: ${eventUrl}`
    : `Event page: ${eventUrl}`;
  const encodedDescription = encodeURIComponent(fullDescription);

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PullUp//Event//EN",
    "BEGIN:VEVENT",
    `UID:${slug || title || "event"}@pullup.se`,
    `DTSTAMP:${formatDateForCalendar(new Date())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title || "Event"}`,
    `DESCRIPTION:${fullDescription.replace(/\n/g, "\\n").replace(/,/g, "\\,")}`,
    location ? `LOCATION:${location}` : "",
    `URL:${eventUrl}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&dates=${start}/${end}&details=${encodedDescription}&location=${encodedLocation}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodedTitle}&startdt=${start}&enddt=${end}&body=${encodedDescription}&location=${encodedLocation}`,
    yahoo: `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${encodedTitle}&st=${start}&dur=${end}&desc=${encodedDescription}&in_loc=${encodedLocation}`,
    apple: `data:text/calendar;charset=utf8,${encodeURIComponent(icsContent)}`,
    icsContent,
  };
}

/**
 * Generate a Google Maps URL for a location
 * @param {string} location - The location text (e.g., "123 Main St, New York, NY")
 * @param {number|null} lat - Optional latitude coordinate
 * @param {number|null} lng - Optional longitude coordinate
 * @returns {string} Google Maps URL
 */
export function getGoogleMapsUrl(location, lat = null, lng = null) {
  if (lat !== null && lng !== null) {
    // Use coordinates if available (most precise)
    return `https://www.google.com/maps?q=${lat},${lng}`;
  } else if (location) {
    // Use location text as fallback
    const encodedLocation = encodeURIComponent(location);
    return `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`;
  }
  return null;
}

/**
 * Format location text to show "street name / city" format
 * @param {string} location - Full location string
 * @returns {string} Formatted location (e.g., "123 Main St / New York")
 */
export function formatLocationShort(location) {
  if (!location) return "";

  // Try to parse common location formats
  // Format: "Street Address, City, State" or "Street Address, City"
  const parts = location.split(",").map((p) => p.trim());

  if (parts.length >= 2) {
    // Return "Street / City"
    return `${parts[0]} / ${parts[1]}`;
  }

  // If no comma, return as-is
  return location;
}
