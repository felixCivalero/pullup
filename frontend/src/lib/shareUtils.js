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
export function buildShareText({
  event,
  url,
  variant = "default",
  booking = null,
}) {
  if (!event) return url || "";

  const title = event.title || "Pull Up";
  const when = formatWhen(event.startsAt);
  const where = event.location ? String(event.location).trim() : "";

  // Core template (your preferred standard)
  const standard = () =>
    [`Pull up to ${title}! 🍸`, "", [when, where].filter(Boolean).join("\n")]
      .filter(Boolean)
      .join("\n");

  switch (variant) {
    case "casual": {
      // Keep it short, still only one link
      const casual = [
        when ? `${when} — pull up 🍸` : "Pull up 🍸",
        where ? `📍 ${where}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      return enforceSingleUrl(casual, url);
    }

    case "invite": {
      // Invite = same as standard, no extras, no image, one link.
      return enforceSingleUrl(standard(), url);
    }

    case "dinner": {
      // Dinner variant: still standardized. Optionally add “Dinner” line if you want.
      const dinnerLine = "🍽️ Dinner available";
      const dinnerText = [standard(), "", dinnerLine].join("\n");
      return enforceSingleUrl(dinnerText, url);
    }

    case "confirmation": {
      // Share after RSVP: slightly different headline, still one link.
      const status =
        booking?.bookingStatus === "CONFIRMED"
          ? "✅ I'm in."
          : booking?.bookingStatus === "WAITLIST"
          ? "⏳ I'm on the waitlist."
          : null;

      const party =
        booking?.partySize && booking.partySize > 1
          ? `👥 Party: ${booking.partySize}`
          : null;

      const confirmText = [
        `I’m going to ${title}! 🎉`,
        "",
        [when, where].filter(Boolean).join("\n"),
        "",
        [status, party].filter(Boolean).join("\n"),
      ]
        .filter(Boolean)
        .join("\n");

      return enforceSingleUrl(confirmText, url);
    }

    case "default":
    default: {
      return enforceSingleUrl(standard(), url);
    }
  }
}
