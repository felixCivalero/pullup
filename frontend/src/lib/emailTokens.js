// Tokens supported by the follow-up email template. Mirrors
// backend/src/services/followUpTemplateService.js — keep in sync.

export const TOKENS = [
  { key: "first_name", label: "First name", scope: "person" },
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
// Skip any [Label] immediately followed by `(` so markdown-style links
// (e.g. `[click here](https://...)`) are preserved as-is.
export function labelsToTokens(text, tokens = TOKENS) {
  if (typeof text !== "string" || !text) return text || "";
  const sorted = [...tokens].sort((a, b) => b.label.length - a.label.length);
  let out = text;
  for (const t of sorted) {
    const escaped = t.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\[${escaped}\\](?!\\()`, "g"), `{{${t.key}}}`);
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
// host as a stand-in for first_name and the selected event for
// event_title/event_date. Frontend event objects are camelCase (startsAt);
// fall back to snake_case for safety.
export function buildPreviewContext({ currentUserFirstName, event }) {
  const startsAt = event?.startsAt || event?.starts_at;
  return {
    first_name: (currentUserFirstName || "").trim() || "there",
    event_title: (event?.title || "").trim() || "[event title]",
    event_date: formatEventDate(startsAt) || "[event date]",
  };
}

export function applyTokens(text, ctx) {
  if (typeof text !== "string" || !text) return text || "";
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => {
    const k = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ctx, k) ? ctx[k] : "";
  });
}

export function isAllowedUrl(url) {
  return typeof url === "string" && /^(https?:|mailto:)/i.test(url.trim());
}

// Parse a string into an array of segments — either { type: "text", text }
// or { type: "link", label, url, safe }. Used by the canvas to render
// tokens + [label](url) links as React nodes.
export function parseInlineSegments(text, ctx) {
  const substituted = applyTokens(text || "", ctx);
  const linkRe = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  const out = [];
  let lastIdx = 0;
  let m;
  while ((m = linkRe.exec(substituted)) !== null) {
    if (m.index > lastIdx) {
      out.push({ type: "text", text: substituted.slice(lastIdx, m.index) });
    }
    const safe = isAllowedUrl(m[2]);
    if (safe) {
      out.push({ type: "link", label: m[1], url: m[2].trim() });
    } else {
      out.push({ type: "text", text: m[0] });
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < substituted.length) {
    out.push({ type: "text", text: substituted.slice(lastIdx) });
  }
  return out;
}
