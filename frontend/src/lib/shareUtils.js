// frontend/src/lib/shareUtils.js
// Share message templates for different contexts

/**
 * Build share text for an event
 * @param {Object} params
 * @param {Object} params.event - Event object with title, description, startsAt, location
 * @param {string} params.url - Full URL to share
 * @param {string} params.variant - Template variant: 'default' | 'casual' | 'invite' | 'dinner'
 * @returns {string} Formatted share text
 */
export function buildShareText({ event, url, variant = "default" }) {
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
      // "You're invited to [Event]! [Date] [Location] Details + RSVP: [url]"
      let inviteText = `You're invited to ${event.title}!`;
      if (eventDateTime) {
        inviteText += `\n\n${eventDateTime}`;
      }
      if (event.location) {
        inviteText += `\n${event.location}`;
      }
      inviteText += `\n\nDetails + RSVP: ${url}`;
      return inviteText;

    case "dinner":
      // For dinner-specific shares
      return `${event.title} — ${eventDate || "Dinner event"}\n\n${
        event.description?.substring(0, 100) || ""
      }${event.description?.length > 100 ? "..." : ""}\n\nRSVP: ${url}`;

    case "default":
    default:
      // Default: Event title, date, description preview, URL
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
      defaultText += `\n\nRSVP: ${url}`;
      return defaultText;
  }
}
