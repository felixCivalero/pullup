// backend/src/email/tracking/linkRewriter.js
//
// Post-processes rendered email HTML to:
//   1. Wrap all <a href="..."> links with a click-tracking redirect
//   2. Inject an open-tracking pixel before </body>
//
// This is purely additive — it runs AFTER template rendering is complete
// and does not modify the template files or rendering functions themselves.

import crypto from "crypto";

const HMAC_SECRET = process.env.EMAIL_TRACKING_HMAC_SECRET || "pullup-tracking-default-key";

if (!process.env.EMAIL_TRACKING_HMAC_SECRET && process.env.NODE_ENV === "production") {
  console.warn("[tracking] WARNING: EMAIL_TRACKING_HMAC_SECRET not set — using insecure default key");
}

/**
 * Create an HMAC signature for a tracking URL to prevent abuse.
 */
export function signUrl(trackingId, url) {
  return crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(`${trackingId}:${url}`)
    .digest("hex")
    .slice(0, 16); // 16 hex chars = 64 bits, sufficient for URL signing
}

/**
 * Verify an HMAC signature. Returns false on invalid input instead of throwing.
 */
export function verifySignature(trackingId, url, sig) {
  if (!sig || typeof sig !== "string" || !/^[0-9a-f]+$/i.test(sig)) {
    return false;
  }
  const expected = signUrl(trackingId, url);
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Encode a string for safe use in a query parameter (base64url).
 */
function b64url(str) {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode a base64url-encoded string.
 */
export function b64urlDecode(encoded) {
  if (!encoded || typeof encoded !== "string") return "";
  let s = encoded.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64").toString("utf-8");
}

/**
 * Build a click-tracking redirect URL.
 *
 * Format: {baseUrl}/t/c/{trackingId}?u={base64url(originalUrl)}&l={base64url(label)}&i={index}&s={hmacSig}
 */
function buildClickUrl(baseUrl, trackingId, originalUrl, label, index) {
  const sig = signUrl(trackingId, originalUrl);
  const params = new URLSearchParams({
    u: b64url(originalUrl),
    l: b64url(label || ""),
    i: String(index),
    s: sig,
  });
  return `${baseUrl}/t/c/${trackingId}?${params.toString()}`;
}

/**
 * Build an open-tracking pixel URL.
 */
function buildOpenPixelUrl(baseUrl, trackingId) {
  return `${baseUrl}/t/o/${trackingId}`;
}

// Links we should NOT rewrite (unsubscribe, mailto, tel, anchors, empty)
const SKIP_PATTERNS = [
  /^mailto:/i,
  /^tel:/i,
  /^#/,
  /^$/,
  /RESEND_UNSUBSCRIBE_URL/i,
  /ses:no-track/i,
  /^javascript:/i,
  /^data:/i,
];

function shouldSkipLink(href) {
  return SKIP_PATTERNS.some((p) => p.test(href));
}

/**
 * Rewrite all links in rendered HTML with click-tracking redirects
 * and inject an open-tracking pixel.
 *
 * @param {string} html - The fully rendered email HTML
 * @param {Object} options
 * @param {string} options.trackingId - UUID from email_outbox.tracking_id
 * @param {string} options.baseUrl - Backend base URL (e.g. https://api.pullup.se)
 * @param {string} options.campaignTag - Campaign identifier for UTM params
 * @returns {string} HTML with tracking links + open pixel
 */
export function addTracking(html, { trackingId, baseUrl, campaignTag }) {
  if (!trackingId || !baseUrl) return html;

  let linkIndex = 0;

  // Rewrite href attributes in <a> tags
  // Match the full <a ...>content</a> to extract labels from content
  const rewritten = html.replace(
    /<a\s([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*?)>([\s\S]*?)<\/a\s*>/gi,
    (fullMatch, before, href, after, content) => {
      // Skip unsubscribe links, mailto, etc.
      if (shouldSkipLink(href)) return fullMatch;

      // Only rewrite http/https links
      if (!href.startsWith("http://") && !href.startsWith("https://")) return fullMatch;

      // Extract link label from URL + content for analytics
      let label = "link";
      const contentLower = (content || "").toLowerCase();
      const hrefLower = href.toLowerCase();

      if (/<img\s/i.test(content)) {
        label = "image";
      } else if (/view\s*event/i.test(contentLower)) {
        label = "view_event";
      } else if (hrefLower.includes("spotify.com") || /listen/i.test(contentLower) || /spotify/i.test(contentLower)) {
        label = "spotify";
      } else if (/to\s*event/i.test(contentLower) || /cta/i.test(before + after)) {
        label = "cta";
      }

      const idx = linkIndex++;
      const trackUrl = buildClickUrl(baseUrl, trackingId, href, label, idx);
      return `<a ${before}href="${trackUrl}"${after}>${content}</a>`;
    }
  );

  // Inject open-tracking pixel before </body>
  const pixelUrl = buildOpenPixelUrl(baseUrl, trackingId);
  const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;

  const withPixel = rewritten.replace(
    /<\/body>/i,
    `${pixelHtml}</body>`
  );

  return withPixel;
}
