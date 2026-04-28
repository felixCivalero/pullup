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

  // Greeting is now just a regular text block prepended to the blocks
  // array (host can move/delete it). Legacy templateContent.greeting is
  // still honored as a prepended paragraph for in-flight campaigns from
  // before the refactor.
  const legacyGreeting = templateContent.greeting !== undefined && templateContent.greeting
    ? `<p class="pu-text" style="margin:0 0 12px;color:#0c0a12;text-align:${textAlign(templateContent.greetingAlign)};">${renderInline(templateContent.greeting, t)}</p>`
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

  return emailShell(`${previewText}<div style="max-width:600px;margin:0 auto;">${legacyGreeting}${body}${signoffHtml}${footer}</div>`);
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
      const icon = socialIconSvg(l.key);
      // Fixed-size cell so filled vs outline icons all line up the same.
      // Outlook can be twitchy with inline-flex on <a>, so use line-height
      // + text-align as the centering mechanism for max compatibility.
      return `<a href="${escapeAttr(l.url)}" aria-label="${escapeAttr(l.label || l.key)}" title="${escapeAttr(l.label || l.key)}" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;color:inherit;text-decoration:none;margin:0 4px;">${icon}</a>`;
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

// Inline SVG glyphs for the social platforms. Two render modes:
//   - "outline": lucide-style stroke icons (currentColor stroke, no fill)
//   - "filled":  brand-mark shapes from simpleicons.org (currentColor fill,
//                no stroke) — use these for platforms whose recognition
//                depends on the actual logo silhouette (Spotify, TikTok).
// Both inherit currentColor so the pu-text class flips them light/dark.
const SOCIAL_ICONS = {
  instagram: { mode: "filled",  svg: '<path d="M12 2.16c3.2 0 3.58.012 4.85.07 1.17.054 1.81.249 2.23.413.56.218.96.477 1.38.896.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.81-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.81-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.81.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.91.33 4.14.63a5.88 5.88 0 0 0-2.13 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.28.26 2.15.56 2.91a5.88 5.88 0 0 0 1.38 2.13 5.88 5.88 0 0 0 2.13 1.38c.77.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.28-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.77.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.28-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63c-.77-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z"/>' },
  spotify:   { mode: "filled",  svg: '<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12A12 12 0 0 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>' },
  tiktok:    { mode: "filled",  svg: '<path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.55a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.18Z"/>' },
  soundcloud:{ mode: "outline", svg: '<path d="M3 14v4"/><path d="M5 12v6"/><path d="M7 11v7"/><path d="M9 9v9"/><path d="M11 11v7"/><path d="M13 8v10a3 3 0 0 0 3 3h3a4 4 0 0 0 0-8h-1a5 5 0 0 0-5-5z"/>' },
  youtube:   { mode: "filled",  svg: '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>' },
  website:   { mode: "outline", svg: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>' },
};

function socialIconSvg(key) {
  const icon = SOCIAL_ICONS[key];
  if (!icon) return "";
  if (icon.mode === "filled") {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;display:inline-block;">${icon.svg}</svg>`;
  }
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;">${icon.svg}</svg>`;
}

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
