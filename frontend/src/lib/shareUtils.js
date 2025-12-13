// frontend/src/lib/shareUtils.js
// Share message templates (social-first, one link, no image URLs)

/**
 * Format: Sunday, December 14 at 2:00 PM
 */
function formatWhen(dateString) {
  if (!dateString) return "";
  try {
    const d = new Date(dateString);

    const date = d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    const time = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    return `${date} at ${time}`;
  } catch {
    return "";
  }
}

/**
 * Guarantees the returned string contains EXACTLY one URL:
 * the provided `url` at the end.
 */
function enforceSingleUrl(text, url) {
  const cleaned = String(text)
    // Remove any accidental URLs already inside
    .replace(/https?:\/\/\S+/g, "")
    // Trim trailing spaces on lines
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return `${cleaned}\n\nDetails + RSVP: ${url}`;
}

/**
 * Build share text for an event (human share copy)
 * - No image URLs.
 * - Exactly one link.
 * - Multiline, social-native.
 *
 * @param {Object} params
 * @param {Object} params.event
 * @param {string} params.url - Single URL to share (should be /share/:slug)
 * @param {string} params.variant - 'default' | 'casual' | 'invite' | 'dinner' | 'confirmation'
 * @param {Object} params.booking - Booking details (for confirmation variant)
 */
