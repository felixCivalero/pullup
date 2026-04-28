// Tokens supported by the follow-up email template. Mirrors
// backend/src/services/followUpTemplateService.js — keep in sync.

export const TOKENS = [
  { key: "first_name", label: "First name", scope: "person" },
  { key: "last_name", label: "Last name", scope: "person" },
  { key: "event_title", label: "Event title", scope: "event" },
  { key: "event_date", label: "Event date", scope: "event" },
];

// Returns the token list filtered to what the current composer state can
// actually fill. With no associated event, hide event_* so the host doesn't
// insert a token that will render empty.
export function availableTokens({ hasEvent }) {
  return TOKENS.filter((t) => t.scope !== "event" || hasEvent);
}

// Convert stored value (with {{token}}) → display value (with [Label]).
// Used when populating an input's visible value.
export function tokensToLabels(text, tokens = TOKENS) {
  if (typeof text !== "string" || !text) return text || "";
  const byKey = Object.fromEntries(tokens.map((t) => [t.key, t.label]));
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => {
    const k = key.toLowerCase();
    return byKey[k] ? `[${byKey[k]}]` : `{{${key}}}`;
  });
}

// Convert display value (with [Label]) → stored value (with {{token}}).
// Used when reading an input's value back into state.
export function labelsToTokens(text, tokens = TOKENS) {
  if (typeof text !== "string" || !text) return text || "";
  // Build a regex that matches any [Label] from the token list, longest-first
  // so multi-word labels match before any prefix.
  const sorted = [...tokens].sort((a, b) => b.label.length - a.label.length);
  let out = text;
  for (const t of sorted) {
    const escaped = t.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\[${escaped}\\]`, "g"), `{{${t.key}}}`);
  }
  return out;
}

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
