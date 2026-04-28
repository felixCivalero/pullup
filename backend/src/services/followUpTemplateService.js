// Tokens supported in follow-up template content. Order: replace tokens with
// raw values, then HTML-escape the resulting string. This means user data and
// template text are escaped uniformly — no double-escape, no XSS via tokens.
//
// To add a token: extend buildTokenContext + the TOKENS array below, then add
// the matching pill to frontend/src/components/crm/TokenizedInput.jsx.

function formatEventDate(starts_at) {
  if (!starts_at) return "";
  const d = new Date(starts_at);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildTokenContext({ person, event }) {
  const firstName = (person?.first_name || "").trim();
  return {
    // first_name falls back to "there" so the default greeting reads naturally
    // for recipients without a captured first name. Other tokens stay empty.
    first_name: firstName || "there",
    last_name: (person?.last_name || "").trim(),
    event_title: (event?.title || "").trim(),
    event_date: formatEventDate(event?.starts_at),
  };
}

function applyTokens(text, ctx) {
  if (typeof text !== "string" || !text) return text || "";
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => {
    const k = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ctx, k) ? ctx[k] : "";
  });
}

export function renderFollowUpEmailTemplate({ templateContent, person, event /*, baseUrl */ }) {
  const blocks = Array.isArray(templateContent.blocks) ? templateContent.blocks : [];
  const ctx = buildTokenContext({ person, event });
  const t = (s) => applyTokens(s, ctx);

  // Greeting: undefined → use default "Hi {{first_name}},"; "" → no greeting line;
  // any other string → render that (with token substitution).
  const greetingRaw = templateContent.greeting !== undefined
    ? templateContent.greeting
    : "Hi {{first_name}},";
  const greeting = greetingRaw
    ? `<p style="margin:0 0 12px;">${escapeHtml(t(greetingRaw)).replace(/\n/g, "<br>")}</p>`
    : "";

  const body = blocks.map((b) => renderBlock(b, t)).filter(Boolean).join("");

  const signoffHtml = templateContent.signoff
    ? `<p style="margin:24px 0 0;">${escapeHtml(t(templateContent.signoff)).replace(/\n/g, "<br>")}</p>`
    : "";

  const previewText = templateContent.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(t(templateContent.previewText))}</div>`
    : "";

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0c0a12;color:#fff;padding:24px;">${previewText}<div style="max-width:600px;margin:0 auto;">${greeting}${body}${signoffHtml}</div></body></html>`;
}

function renderBlock(b, t) {
  if (!b || typeof b !== "object") return "";
  if (b.type === "text" && b.style === "heading") {
    return `<h2 style="font-size:22px;font-weight:700;margin:16px 0 8px;">${escapeHtml(t(b.text || ""))}</h2>`;
  }
  if (b.type === "text" && b.style === "paragraph") {
    return `<p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(t(b.text || "")).replace(/\n/g, "<br>")}</p>`;
  }
  if (b.type === "image" && b.url) {
    return `<img src="${escapeAttr(b.url)}" alt="${escapeAttr(t(b.alt || ""))}" style="display:block;width:100%;max-width:600px;height:auto;margin:16px auto;border-radius:8px;" />`;
  }
  if (b.type === "button" && b.url && b.text) {
    const captionRaw = b.caption ? t(b.caption) : "";
    const caption = captionRaw
      ? `<p class="caption-block" style="text-align:center;font-size:12px;opacity:0.7;margin:6px 0 18px;">${escapeHtml(captionRaw)}</p>`
      : "";
    return `<div style="text-align:center;margin:20px 0 0;"><a href="${escapeAttr(b.url)}" style="display:inline-block;padding:12px 24px;background:#d4af37;color:#0c0a12;text-decoration:none;border-radius:8px;font-weight:600;">${escapeHtml(t(b.text))}</a></div>${caption}`;
  }
  return "";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s) { return escapeHtml(s); }
