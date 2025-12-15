// frontend/src/lib/dateUtils.js
// Centralized date/time formatting helpers

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
 * Format event date (e.g., "Dec 23, 2025")
 */
export function formatEventDate(value, locale = "en-US") {
  const d = toDate(value);
  if (!d) return "";
  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format event time (e.g., "10:58 PM")
 */
export function formatEventTime(value, locale = "en-US") {
  const d = toDate(value);
  if (!d) return "";
  return d.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format combined readable date/time
 */
export function formatReadableDateTime(value, locale = "en-US") {
  const d = toDate(value);
  if (!d) return "";
  return `${formatEventDate(d, locale)} ${formatEventTime(d, locale)}`;
}

/**
 * Format relative time (rough)
 */
export function formatRelativeTime(value, locale = "en-US") {
  const d = toDate(value);
  if (!d) return "";
  const diffMs = d.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (60 * 1000));

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

/**
 * Format date for calendar services (YYYYMMDDTHHmmssZ)
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
