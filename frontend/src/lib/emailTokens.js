// Tokens supported by the follow-up email template. Mirrors
// backend/src/services/followUpTemplateService.js — keep in sync.

export const TOKENS = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "event_title", label: "Event title" },
  { key: "event_date", label: "Event date" },
];

function formatEventDate(starts_at) {
  if (!starts_at) return "";
  const d = new Date(starts_at);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Build the substitution context used in the live preview. Uses the current
// host as a stand-in for first/last name and the selected follow-up event
// for event_title/event_date.
export function buildPreviewContext({ currentUserFirstName, currentUserLastName, event }) {
  return {
    first_name: (currentUserFirstName || "").trim() || "there",
    last_name: (currentUserLastName || "").trim(),
    event_title: (event?.title || "").trim() || "[event title]",
    event_date: formatEventDate(event?.starts_at) || "[event date]",
  };
}

export function applyTokens(text, ctx) {
  if (typeof text !== "string" || !text) return text || "";
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => {
    const k = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ctx, k) ? ctx[k] : "";
  });
}
