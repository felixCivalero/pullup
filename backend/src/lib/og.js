// Crawler detection + Open Graph share-page rendering (used by /share and /e/:slug).
import { logger } from "../logger.js";
import { getFrontendUrl, getBackendUrlFromReq } from "./urls.js";
import { formatCoordinates } from "./coordinates.js";
// ---------------------------
// Helper: Detect if request is from a crawler/bot
// ---------------------------
function isCrawler(req) {
  const userAgent = req.get("user-agent") || "";
  const crawlerPatterns = [
    "facebookexternalhit",
    "Twitterbot",
    "LinkedInBot",
    "WhatsApp",
    "Applebot",
    "Googlebot",
    "Slackbot",
    "Discordbot",
    "TelegramBot",
    "SkypeUriPreview",
    "bingbot",
    "Slurp",
  ];
  return crawlerPatterns.some((pattern) =>
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  );
}

// ---------------------------
// OG helpers (clean + reliable)
// ---------------------------

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatOgDateTime(startsAt, tz) {
  if (!startsAt) return "";
  try {
    const d = new Date(startsAt);
    const opts = tz ? { timeZone: tz } : {};

    // Derive locale from timezone — European timezones use 24h
    const twelve = ["America/", "Australia/", "Pacific/Auckland", "Pacific/Fiji"];
    const is12h = !tz || twelve.some((p) => tz.startsWith(p));
    const locale = is12h ? "en-US" : "en-GB";

    const date = d.toLocaleDateString(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      ...opts,
    });

    const time = d.toLocaleTimeString(is12h ? "en-US" : "sv-SE", {
      hour: "numeric",
      minute: "2-digit",
      ...opts,
    });

    return `${date} at ${time}`;
  } catch {
    return "";
  }
}

/**
 * Extracts `filePath` from:
 * - Signed:  .../object/sign/event-images/<filePath>?token=...
 * - Public:  .../object/public/event-images/<filePath>
 * - Any URL containing: event-images/<filePath>
 */
function extractEventImagesFilePath(imageUrl) {
  if (!imageUrl) return null;
  const m = String(imageUrl).match(/event-images\/([^?]+)/);
  return m?.[1] || null;
}

// OG canonical image dimensions. Facebook/Instagram crawlers validate that
// declared og:image:width/height match the actual image — declaring 1200x630
// while serving a 1080x1920 phone upload caused Instagram DM previews to drop
// the image (WhatsApp's crawler is more lenient, which is why it still worked).
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

/**
 * Convert signed/public supabase URL into a permanent, OG-friendly public URL.
 * For event-images, applies Supabase's render transform to produce a 1200x630
 * cover-cropped image so the og:image:width/height tags are truthful and the
 * payload is small enough for strict crawlers (Instagram in particular).
 * Falls back to the original URL on any failure.
 */
async function toOgPublicImageUrl(imageUrl, routeName = "Share") {
  if (!imageUrl) return null;

  // If it's not from the event-images bucket, just use it as-is
  if (!String(imageUrl).includes("event-images/")) {
    logger.debug(
      `[${routeName}] OG image is not in event-images bucket, using as-is`,
      { imageUrl }
    );
    return imageUrl;
  }

  const filePath = extractEventImagesFilePath(imageUrl);
  if (!filePath) {
    logger.warn(
      `[${routeName}] Could not extract event-images file path, using as-is`,
      { imageUrl }
    );
    return imageUrl;
  }

  try {
    const { supabase } = await import("../supabase.js");
    const {
      data: { publicUrl },
    } = supabase.storage.from("event-images").getPublicUrl(filePath, {
      transform: {
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        resize: "cover",
        quality: 80,
      },
    });

    if (publicUrl) {
      logger.info(`[${routeName}] OG public image URL generated`, {
        publicUrl,
        filePath,
      });
      return publicUrl;
    }

    logger.warn(`[${routeName}] getPublicUrl returned empty, using original`, {
      imageUrl,
    });
    return imageUrl;
  } catch (err) {
    logger.error(
      `[${routeName}] Error generating OG public image URL, using original`,
      { error: err?.message }
    );
    return imageUrl;
  }
}

// Pick the best static source image to use for OG previews.
// Preference: full-res image from media[] > cover/image fields.
// We avoid the events.cover_image_url / events.image_url for video covers
// because those fields hold a low-res client-generated video thumbnail
// (see /host/events/:eventId/media upload handler), and upscaling a tiny
// thumbnail to 1200x630 yields a blurry preview.
function pickOgSourceImage(event) {
  const media = Array.isArray(event?.media) ? event.media : [];
  const images = media.filter((m) => m?.mediaType === "image" && m?.url);
  const coverImage = images.find((m) => m.isCover) || images[0];
  if (coverImage?.url) return coverImage.url;
  // Prefer image_url over cover_image_url: a user-uploaded custom thumbnail
  // lands in image_url but cover_image_url may still hold the auto-generated
  // low-res video thumbnail from the original media upload.
  return event?.imageUrl || event?.coverImageUrl || null;
}

// ---------------------------
// Helper: Generate OG HTML for an event.
//
// Strategy: we hand crawlers a stable backend URL that we control
// (/og/event/:slug/image.jpg) instead of the raw Supabase render URL. That lets
// us guarantee Content-Type: image/jpeg (Supabase render outputs JPEG regardless
// of source format, but crawlers like Instagram via Facebook validate the
// declared og:image:type and silently drop the preview on a mismatch — which
// happened for any event with a .png/.webp source). The URL carries a `?v=`
// cache-buster derived from event.updatedAt so reshares of edited events get a
// fresh preview without waiting for crawler caches to expire.
// ---------------------------
async function generateOgHtmlForEvent(event, routeName = "Share", queryString = "", req = null) {
  logger.debug(`[${routeName}] Found event`, {
    title: event?.title,
    slug: event?.slug,
    id: event?.id,
  });

  // Use our own proxy endpoint as the og:image URL when we have a slug and a
  // request to derive the backend host from. Otherwise fall back to the raw
  // Supabase URL (e.g., emails, server-side rendering without req context).
  let ogImageUrl = null;
  if (event?.slug && req) {
    const backendUrl = getBackendUrlFromReq(req);
    const updatedAt = event?.updatedAt || event?.createdAt || "";
    const v = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
    // Path lives under /share/ because that prefix is already routed to this
    // backend by the production nginx; /og/* falls through to the static SPA.
    ogImageUrl = `${backendUrl}/share/og-image/${event.slug}/image.jpg${v}`;
  } else {
    const sourceImage = pickOgSourceImage(event);
    ogImageUrl = await toOgPublicImageUrl(sourceImage, routeName);
  }

  logger.debug(`[${routeName}] Final OG image URL`, {
    imageUrl: ogImageUrl || "none (will use default)",
  });

  return generateOgHtml({
    ...event,
    imageUrl: ogImageUrl,
  }, queryString);
}

// ---------------------------
// Helper: Generate HTML with dynamic OG tags for an event
// Notes:
// - OG description is clean and does NOT include links.
// - Canonical og:url points to /e/:slug (not /share/:slug).
// - Humans get redirected immediately.
// ---------------------------
function generateOgHtml(event, queryString = "") {
  const baseUrl = getFrontendUrl();

  // Canonical URL for the event page (clean for OG tags)
  const eventUrl = `${baseUrl}/e/${event.slug}`;
  // Redirect URL preserves UTM params so tracking works end-to-end
  const redirectUrl = queryString ? `${eventUrl}?${queryString}` : eventUrl;

  // Use event image if available, otherwise fallback to default OG image
  let imageUrl = event.imageUrl || `${baseUrl}/og-image.jpg`;

  // Ensure image URL is absolute
  if (imageUrl && !String(imageUrl).startsWith("http")) {
    imageUrl = `${baseUrl}${
      String(imageUrl).startsWith("/") ? "" : "/"
    }${imageUrl}`;
  }

  const titleRaw = event?.title || "Pull Up";
  const escapedTitle = escapeHtml(titleRaw);

  // Honor reveal-later flags so OG shares match what the page shows publicly.
  // Without this, the OG title/description leak the placeholder startsAt and
  // real location even for events the host marked as TBA.
  const hideDate = !!event?.hideDate;
  const hideLocation = !!event?.hideLocation;

  const realWhen = formatOgDateTime(event?.startsAt, event?.timezone);
  const when = hideDate
    ? (event?.dateRevealHint || "Date TBA")
    : realWhen;
  let where = hideLocation
    ? (event?.revealHint || "Location revealed later")
    : (event?.location ? String(event.location).trim() : "");
  // "Show coordinates" mode: append the exact lat/lng so a shared link carries
  // the precise pin, same as the page + emails. Honors hideLocation (above).
  if (!hideLocation && event?.showCoordinates) {
    const coords = formatCoordinates(
      event?.locationLat ?? event?.location_lat,
      event?.locationLng ?? event?.location_lng
    );
    if (coords) where = where ? `${where} (${coords})` : coords;
  }

  // Format date for OG title: "Event Title — Wednesday, December 17 at 18:00"
  // Uses the event's timezone so the preview shows the correct local time
  let ogTitle = titleRaw;
  if (when) {
    ogTitle = `${titleRaw} — ${when}`;
  }

  // Escape HTML for OG title
  ogTitle = escapeHtml(ogTitle);

  // OG description: short, readable, no links, no image URLs
  // Format: "Event Title — Date/Time — Location"
  // This matches the rich preview format
  const descParts = [titleRaw, when || null, where || null].filter(Boolean);

  const description = escapeHtml(descParts.join(" — ")).slice(0, 200);

  // og:image:type must match what the crawler actually downloads — mismatches
  // cause Instagram/Facebook to silently drop the preview. Our /og/event/:slug/
  // image.jpg proxy always serves JPEG; the only non-proxy fallback is the
  // bundled /og-image.jpg default, which is also JPEG. So this can be pinned.
  const imageMime = "image/jpeg";

  // Debug logging (keep it, but less noisy)
  console.log(`[OG] title: ${titleRaw}`);
  console.log(`[OG] url: ${eventUrl}`);
  console.log(`[OG] image: ${imageUrl}`);
  console.log(`[OG] desc: ${description}`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${ogTitle} — PullUp</title>
  <meta name="description" content="${description}">

  <meta property="og:type" content="website">
  <meta property="og:url" content="${eventUrl}">
  <meta property="og:title" content="${ogTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:secure_url" content="${imageUrl}">
  <meta property="og:image:type" content="${imageMime}">
  <meta property="og:image:width" content="${OG_IMAGE_WIDTH}">
  <meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">
  <meta property="og:image:alt" content="${escapedTitle}">
  <meta property="og:site_name" content="PullUp">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${ogTitle}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <meta name="twitter:image:alt" content="${escapedTitle}">

  <!-- Redirect humans immediately -->
  <meta http-equiv="refresh" content="0;url=${redirectUrl}">
  <script>window.location.href = "${redirectUrl}";</script>
</head>
<body>
  <p>Redirecting to <a href="${redirectUrl}">${escapedTitle}</a>...</p>
</body>
</html>`;
}
export { isCrawler, escapeHtml, formatOgDateTime, extractEventImagesFilePath, toOgPublicImageUrl, pickOgSourceImage, generateOgHtmlForEvent, generateOgHtml };
