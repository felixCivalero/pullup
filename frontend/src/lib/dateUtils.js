// frontend/src/lib/dateUtils.js
// Centralized date/time formatting helpers — timezone-aware

/**
 * Parse input into Date
 */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Derive a display locale from an IANA timezone.
 * European / most-of-world timezones → locale that uses 24h clock.
 * US / Canada / Australia etc. → locale that uses 12h clock.
 */
function localeForTimezone(tz) {
  if (!tz) return "en-US";
  // Regions that predominantly use 12-hour clocks
  const twelve = ["America/", "Australia/", "Pacific/Auckland", "Pacific/Fiji"];
  const is12h = twelve.some((prefix) => tz.startsWith(prefix));
  // sv-SE naturally uses 24h, en-US naturally uses 12h
  return is12h ? "en-US" : "sv-SE";
}

/**
 * Build Intl options, injecting timeZone when provided.
 */
function withTz(opts, tz) {
  if (tz) opts.timeZone = tz;
  return opts;
}

/**
 * Format event date (e.g., "Dec 23, 2025" or "23 dec. 2025")
 * Always shown in the EVENT's timezone so guests see the correct local date.
 */
export function formatEventDate(value, tz) {
  const d = toDate(value);
  if (!d) return "";
  const locale = localeForTimezone(tz);
  return d.toLocaleDateString(locale, withTz({
    month: "short",
    day: "numeric",
    year: "numeric",
  }, tz));
}

/**
 * Format event time (e.g., "19:00" or "7:00 PM")
 * Uses 24h for European timezones, 12h for American.
 */
export function formatEventTime(value, tz) {
  const d = toDate(value);
  if (!d) return "";
  const locale = localeForTimezone(tz);
  return d.toLocaleTimeString(locale, withTz({
    hour: "numeric",
    minute: "2-digit",
  }, tz));
}

/**
 * Format combined readable date/time
 */
export function formatReadableDateTime(value, tz) {
  const d = toDate(value);
  if (!d) return "";
  return `${formatEventDate(d, tz)} ${formatEventTime(d, tz)}`;
}

/**
 * Format relative time (rough)
 */
export function formatRelativeTime(value) {
  const d = toDate(value);
  if (!d) return "";
  const diffMs = d.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (60 * 1000));

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

/**
 * Format date for calendar services (YYYYMMDDTHHmmssZ)
 * Uses UTC — calendar apps understand the Z suffix.
 */
export function formatDateForCalendar(value) {
  const d = toDate(value);
  if (!d) return "";
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/**
 * Convenience: add hours to date
 */
export function addHours(value, hours = 2) {
  const d = toDate(value);
  if (!d) return null;
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}
