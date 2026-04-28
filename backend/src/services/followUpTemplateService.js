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
  // The people table stores a single `name` field; derive first_name as the
  // first whitespace-separated word ("Felix Civalero" → "Felix"). Falls back
  // to "there" so the default greeting still reads naturally when name is empty.
  const fullName = (person?.name || "").trim();
  const firstWord = fullName ? fullName.split(/\s+/)[0] : "";
  return {
    first_name: firstWord || "there",
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

// Only http(s) and mailto links are turned into anchors; anything else stays
// as literal escaped text (defense against javascript:/data:/etc URLs the
// host could paste).
function isAllowedUrl(url) {
  return typeof url === "string" && /^(https?:|mailto:)/i.test(url.trim());
}

// Render inline content for body fields: substitute tokens, then turn
// [label](url) into <a>, then escape and convert newlines on the surrounding
// text segments. Built piece-by-piece so user-controlled label/URL is
// independently escaped without double-escaping the anchor we emit.
function renderInline(text, t) {
  const substituted = t(text || "");
  const linkRe = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let result = "";
  let lastIdx = 0;
  let m;
  while ((m = linkRe.exec(substituted)) !== null) {
    result += escapeHtml(substituted.slice(lastIdx, m.index)).replace(/\n/g, "<br>");
    if (isAllowedUrl(m[2])) {
      result += `<a class="pu-link" href="${escapeAttr(m[2].trim())}" style="color:#0670DB;text-decoration:underline;">${escapeHtml(m[1])}</a>`;
    } else {
      result += escapeHtml(m[0]).replace(/\n/g, "<br>");
    }
    lastIdx = m.index + m[0].length;
  }
  result += escapeHtml(substituted.slice(lastIdx)).replace(/\n/g, "<br>");
  return result;
}

// Adaptive shell — light by default (matches inbox norms), with
// prefers-color-scheme: dark overrides for clients that report dark mode.
// Targeted via class names because most email clients keep <style> in head
// but strip it from body; classes also let us flip text/footer colors
// without changing inline button/link choices the host made.
function emailShell(innerHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin:0; padding:0; }
  .pu-body { background:#ffffff; color:#0c0a12; }
  .pu-text, .pu-heading, .pu-greeting, .pu-signoff { color:#0c0a12; }
  .pu-footer { color:rgba(12,10,18,0.55); border-top-color:rgba(0,0,0,0.08) !important; }
  .pu-footer a { color:#0670DB; }
  .pu-link { color:#0670DB; }

  @media (prefers-color-scheme: dark) {
    body, .pu-body { background:#0c0a12 !important; color:#ffffff !important; }
    .pu-text, .pu-heading, .pu-greeting, .pu-signoff { color:#ffffff !important; }
    .pu-footer { color:rgba(255,255,255,0.55) !important; border-top-color:rgba(255,255,255,0.1) !important; }
    .pu-footer a, .pu-link { color:#74b6ff !important; }
  }
  /* Outlook.com / hotmail dark-mode hooks */
  [data-ogsc] body, [data-ogsc] .pu-body { background:#0c0a12 !important; color:#ffffff !important; }
  [data-ogsc] .pu-text, [data-ogsc] .pu-heading, [data-ogsc] .pu-greeting, [data-ogsc] .pu-signoff { color:#ffffff !important; }
  [data-ogsc] .pu-footer { color:rgba(255,255,255,0.55) !important; }
  [data-ogsc] .pu-footer a, [data-ogsc] .pu-link { color:#74b6ff !important; }
</style>
</head>
<body class="pu-body" style="background:#ffffff;color:#0c0a12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;">
${innerHtml}
</body>
</html>`;
}

export function renderFollowUpEmailTemplate({ templateContent, person, event, unsubscribeUrl /*, baseUrl */ }) {
  const blocks = Array.isArray(templateContent.blocks) ? templateContent.blocks : [];
  const ctx = buildTokenContext({ person, event });
  const t = (s) => applyTokens(s, ctx);

  // Greeting: undefined → use default "Hi {{first_name}},"; "" → no greeting line;
  // any other string → render that (with token substitution + inline links).
  const greetingRaw = templateContent.greeting !== undefined
    ? templateContent.greeting
    : "Hi {{first_name}},";
  const greetingAlign = textAlign(templateContent.greetingAlign);
  const greeting = greetingRaw
    ? `<p class="pu-greeting" style="margin:0 0 12px;color:#0c0a12;text-align:${greetingAlign};">${renderInline(greetingRaw, t)}</p>`
    : "";

  const body = blocks.map((b) => renderBlock(b, t)).filter(Boolean).join("");

  const signoffHtml = templateContent.signoff
    ? `<p class="pu-signoff" style="margin:24px 0 0;color:#0c0a12;">${renderInline(templateContent.signoff, t)}</p>`
    : "";

  const previewText = templateContent.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(t(templateContent.previewText))}</div>`
    : "";

  // Footer with the per-recipient unsubscribe link. The link is required for
  // CAN-SPAM/GDPR compliance and the campaignSender filters out anyone who
  // has clicked it. Marked ses:no-track so click tracking doesn't redirect
  // through the tracker (one-click unsubscribe needs a direct hop).
  const footer = unsubscribeUrl
    ? `<div class="pu-footer" style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(0,0,0,0.08);font-size:12px;text-align:center;line-height:1.6;color:rgba(12,10,18,0.55);">
        <p style="margin:0;">You are receiving this email because you opted in via our site.<br>Want to change how you receive these emails?<br>You can <a href="${escapeAttr(unsubscribeUrl)}#ses:no-track" style="color:#0670DB;text-decoration:underline;">unsubscribe from this list</a>.</p>
        <p style="margin:12px 0 0;">Pullup.se<br>Lorensbergsgatan 3b<br>117 33, Stockholm</p>
      </div>`
    : "";

  return emailShell(`${previewText}<div style="max-width:600px;margin:0 auto;">${greeting}${body}${signoffHtml}${footer}</div>`);
}

function renderBlock(b, t) {
  if (!b || typeof b !== "object") return "";
  if (b.type === "text" && b.style === "heading") {
    const align = textAlign(b.align);
    return `<h2 class="pu-heading" style="font-size:22px;font-weight:700;margin:16px 0 8px;color:#0c0a12;text-align:${align};">${renderInline(b.text || "", t)}</h2>`;
  }
  if (b.type === "text" && b.style === "paragraph") {
    const align = textAlign(b.align);
    return `<p class="pu-text" style="margin:0 0 12px;line-height:1.5;color:#0c0a12;text-align:${align};">${renderInline(b.text || "", t)}</p>`;
  }
  if (b.type === "image" && b.url) {
    const widthPct = clampPercent(b.width);
    const align = b.align === "left" || b.align === "right" ? b.align : "center";
    const marginLeft = align === "left" ? "0" : "auto";
    const marginRight = align === "right" ? "0" : "auto";
    const ratio = ASPECT_RATIO_CSS[b.aspectRatio];
    const maxW = Math.round(600 * widthPct / 100);
    if (ratio) {
      // Crop via aspect-ratio container with object-fit: cover. Modern email
      // clients (Gmail web/iOS Mail/Apple Mail) honor aspect-ratio; legacy
      // clients will fall through to natural height — acceptable degradation.
      return `<div style="display:block;width:${widthPct}%;max-width:${maxW}px;aspect-ratio:${ratio};overflow:hidden;margin:16px ${marginRight} 16px ${marginLeft};border-radius:8px;"><img src="${escapeAttr(b.url)}" alt="${escapeAttr(t(b.alt || ""))}" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`;
    }
    return `<img src="${escapeAttr(b.url)}" alt="${escapeAttr(t(b.alt || ""))}" style="display:block;width:${widthPct}%;max-width:${maxW}px;height:auto;margin:16px ${marginRight} 16px ${marginLeft};border-radius:8px;" />`;
  }
  if (b.type === "socials" && Array.isArray(b.links) && b.links.length > 0) {
    const align = textAlign(b.align);
    const valid = b.links.filter((l) => l && typeof l.url === "string" && /^https?:\/\//i.test(l.url) && SOCIAL_ICONS[l.key]);
    if (valid.length === 0) return "";
    const items = valid.map((l) => {
      const icon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;">${SOCIAL_ICONS[l.key]}</svg>`;
      return `<a href="${escapeAttr(l.url)}" aria-label="${escapeAttr(l.label || l.key)}" title="${escapeAttr(l.label || l.key)}" style="display:inline-block;padding:6px 10px;color:inherit;text-decoration:none;">${icon}</a>`;
    });
    return `<div class="pu-text" style="text-align:${align};margin:20px 0;color:#0c0a12;">${items.join("")}</div>`;
  }
  if (b.type === "button" && b.url && b.text) {
    const captionRaw = b.caption ? t(b.caption) : "";
    const align = b.align === "left" || b.align === "right" ? b.align : "center";
    const caption = captionRaw
      ? `<p class="caption-block" style="text-align:${align};font-size:12px;opacity:0.7;margin:6px 0 18px;">${escapeHtml(captionRaw)}</p>`
      : "";
    const { padding, fontSize } = buttonSizeStyle(b.size);
    const bg = isHexColor(b.bgColor) ? b.bgColor : "#d4af37";
    const fg = readableTextColor(bg);
    return `<div style="text-align:${align};margin:20px 0 0;"><a href="${escapeAttr(b.url)}" style="display:inline-block;padding:${padding};background:${bg};color:${fg};text-decoration:none;border-radius:8px;font-weight:600;font-size:${fontSize}px;">${escapeHtml(t(b.text))}</a></div>${caption}`;
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

const ASPECT_RATIO_CSS = {
  banner: "16/9",
  square: "1/1",
  portrait: "4/5",
};

function textAlign(v) {
  return v === "center" || v === "right" ? v : "left";
}

// Inline SVG glyphs for the social platforms — lucide-style outlines so
// each icon inherits currentColor from its parent <a>. The pu-text class
// on the wrapper flips that color across light/dark mode automatically.
// Email clients that strip SVG (Gmail web) fall back to the link being
// clickable but visually empty; the aria-label/title still describe it.
const SOCIAL_ICONS = {
  instagram: '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>',
  spotify:   '<circle cx="12" cy="12" r="10"/><path d="M7.5 9.5C10.5 8.5 14 8.5 17 10"/><path d="M8 12.5c2.5-.8 5.5-.8 8 .5"/><path d="M8.5 15.5c2-.5 4-.5 6 .3"/>',
  tiktok:    '<path d="M9 7v10a3 3 0 1 1-3-3"/><path d="M15 3v3a4 4 0 0 0 4 4"/>',
  soundcloud:'<path d="M3 14v4"/><path d="M5 12v6"/><path d="M7 11v7"/><path d="M9 9v9"/><path d="M11 11v7"/><path d="M13 8v10a3 3 0 0 0 3 3h3a4 4 0 0 0 0-8h-1a5 5 0 0 0-5-5z"/>',
  youtube:   '<rect x="2" y="6" width="20" height="12" rx="3" ry="3"/><polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none"/>',
  website:   '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
};

function clampPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 100;
  return Math.max(25, Math.min(100, Math.round(n)));
}

// Numeric size is a percentage scale (50-150) applied to a base padding
// (12 24) and font (14). Tolerates legacy string values for safety.
function buttonSizeStyle(size) {
  let pct;
  if (typeof size === "number") pct = size;
  else if (size === "small") pct = 75;
  else if (size === "large") pct = 130;
  else pct = 100;
  pct = Math.max(50, Math.min(150, pct));
  const scale = pct / 100;
  const padY = Math.max(6, Math.round(12 * scale));
  const padX = Math.max(12, Math.round(24 * scale));
  const fontSize = Math.max(11, Math.round(14 * scale));
  return { padding: `${padY}px ${padX}px`, fontSize };
}

function isHexColor(s) {
  return typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
}

// Pick black or white text based on perceived luminance so it stays readable
// across whatever background the host picks.
function readableTextColor(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0c0a12" : "#ffffff";
}
