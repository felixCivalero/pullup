// frontend/src/lib/shareUtils.js
// Share message templates for different contexts

/**
 * Build share text for an event
 * @param {Object} params
 * @param {Object} params.event - Event object with title, description, startsAt, location, imageUrl
 * @param {string} params.url - Full URL to share
 * @param {string} params.variant - Template variant: 'default' | 'casual' | 'invite' | 'dinner' | 'confirmation'
 * @param {Object} params.booking - Booking details (for confirmation variant)
 * @returns {string} Formatted share text
 */
export function buildShareText({
  event,
  url,
  variant = "default",
  booking = null,
}) {
  if (!event) return url;

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const eventDate = formatDate(event.startsAt);
  const eventTime = formatTime(event.startsAt);
  const eventDateTime = formatDateTime(event.startsAt);

  switch (variant) {
    case "casual":
      // "Tonight at 19 — pull up 🍸"
      return `${
        eventTime ? `Tonight at ${eventTime}` : "Tonight"
      } — pull up 🍸\n\n${url}`;

    case "invite":
      // "You're invited to [Event]! [Date] [Location] [Image if available] Details + RSVP: [url]"
      let inviteText = `You're invited to ${event.title}!`;
      if (eventDateTime) {
        inviteText += `\n\n${eventDateTime}`;
      }
      if (event.location) {
        inviteText += `\n📍 ${event.location}`;
      }
      // Include event image URL if available (for platforms that support it)
      if (event.imageUrl) {
        inviteText += `\n\n${event.imageUrl}`;
      }
      inviteText += `\n\nDetails + RSVP: ${url}`;
      return inviteText;

    case "dinner":
      // For dinner-specific shares
      return `${event.title} — ${eventDate || "Dinner event"}\n\n${
        event.description?.substring(0, 100) || ""
      }${event.description?.length > 100 ? "..." : ""}\n\nRSVP: ${url}`;

    case "confirmation":
      // Booking confirmation: "I'm going to [Event]! [Date] [Booking details]"
      if (!booking) {
        return buildShareText({ event, url, variant: "casual" });
      }

      let confirmText = `I'm going to ${event.title}! 🎉\n\n`;

      if (eventDateTime) {
        confirmText += `📅 ${eventDateTime}\n`;
      }
      if (event.location) {
        confirmText += `📍 ${event.location}\n`;
      }

      // Booking status
      if (booking.bookingStatus === "CONFIRMED") {
        confirmText += `\n✅ Confirmed`;
        if (booking.partySize > 1) {
          confirmText += ` for ${booking.partySize} ${
            booking.partySize === 1 ? "person" : "people"
          }`;
        }
      } else if (booking.bookingStatus === "WAITLIST") {
        confirmText += `\n⏳ On waitlist`;
      }

      // Dinner details if applicable
      if (booking.wantsDinner && booking.dinnerBookingStatus === "CONFIRMED") {
        const dinnerTime = booking.dinnerTimeSlot
          ? new Date(booking.dinnerTimeSlot).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })
          : null;
        if (dinnerTime) {
          confirmText += `\n🍽️ Dinner at ${dinnerTime}`;
          if (booking.dinnerPartySize > 1) {
            confirmText += ` (${booking.dinnerPartySize} people)`;
          }
        }
      }

      confirmText += `\n\nJoin me: ${url}`;
      return confirmText;

    case "default":
    default:
      // Default: Event title, date, description preview, image, URL
      let defaultText = `${event.title}`;
      if (eventDateTime) {
        defaultText += ` — ${eventDateTime}`;
      }
      if (event.description) {
        const descPreview = event.description.substring(0, 100);
        defaultText += `\n\n${descPreview}${
          event.description.length > 100 ? "..." : ""
        }`;
      }
      // Include event image URL if available
      if (event.imageUrl) {
        defaultText += `\n\n${event.imageUrl}`;
      }
      defaultText += `\n\nRSVP: ${url}`;
      return defaultText;
  }
}
