// backend/src/index.js
import express from "express";
import crypto from "crypto";
import cors from "cors";
import dotenv from "dotenv";

import {
  createEvent,
  findEventBySlug,
  addRsvp,
  findEventById,
  updateEvent,
  getRsvpsForEvent,
  generateDinnerTimeSlots,
  getDinnerSlotCounts,
  getEventCounts,
  getCocktailsOnlyCount,
  findRsvpById,
  updateRsvp,
  deleteRsvp,
  getAllPeopleWithStats,
  updatePerson,
  createPayment,
  updatePayment,
  getPaymentsForUser,
  getPaymentsForEvent,
  findPersonByEmail,
  mapEventFromDb,
  getUserProfile,
  updateUserProfile,
  findPaymentById,
  getUserEventIds,
  isUserEventHost,
  isUserEventOwner,
  canManageHosts,
  canEditEvent,
  canEditGuests,
  canCheckIn,
  getEventHostRole,
  HOST_ROLES,
  findPersonById,
  createEventHostInvitation,
  getPendingInvitationsForEvent,
  claimPendingInvitationsForUser,
  createVipInvite,
  findVipInviteById,
  markVipInviteUsed,
  updateVipInvite,
  getVipInvitesForEvent,
  deleteEvent,
  listHostEventImageGallery,
  createPersonalAccessToken,
  listPersonalAccessTokensForUser,
  revokePersonalAccessToken,
} from "./data.js";

import { requireAuth, optionalAuth, requireAdmin } from "./middleware/auth.js";
import {
  validateEventData,
  validateRsvpData,
  validateRsvpUpdateData,
} from "./middleware/validation.js";

import {
  getOrCreateStripeCustomer,
  createPaymentIntent,
  handleStripeWebhook,
  createStripeProduct,
  createStripePrice,
  getStripeSecretKey,
  createRefund,
} from "./stripe.js";
import {
  initiateConnectOnboarding,
  getConnectedAccountStatus,
  disconnectStripeAccount,
} from "./stripeConnect.js";
import { logger } from "./logger.js";

import {
  sendEmail,
  coHostAddedEmailBody,
  coHostInvitedEmailBody,
  coHostAddedEmailHtml,
  coHostInvitedEmailHtml,
} from "./services/emailService.js";
import {
  signupConfirmationEmail,
  reminder24hEmail,
  reservationEmail,
  waitlistOfferEmail,
  refundEmail,
  cancellationEmail,
} from "./emails/signupConfirmation.js";
import {
  generateWaitlistToken,
  verifyWaitlistToken,
} from "./utils/waitlistTokens.js";
import { processSesEvent } from "./email/events/processSesEvent.js";
import { handleProviderEvent, enqueueOutbox, sendEmail as infraSendEmail } from "./email/index.js";
import trackingRoutes from "./email/tracking/trackingRoutes.js";
import { emitIntent, sourceFromRequest } from "./services/intentLog.js";
import { handleMcp, mcpCorsPreflight } from "./mcp/httpHandler.js";
import {
  metadataPRM,
  metadataAS,
  register as oauthRegister,
  authorize as oauthAuthorize,
  consent as oauthConsent,
  describeConsent as oauthDescribeConsent,
  token as oauthToken,
  oauthCorsPreflight,
  setOauthCorsHeaders,
} from "./oauth/routes.js";

// Load environment variables once. NODE_ENV can come from the process
// (PM2, npm scripts) or from .env.
dotenv.config();

// Determine environment mode (supports NODE_ENV set via env or .env)
const nodeEnv = process.env.NODE_ENV || "development";
const isDevelopment = nodeEnv === "development";

// Helper: Get frontend URL based on environment
function getFrontendUrl() {
  if (isDevelopment) {
    // Development mode: prefer TEST_ variables, fallback to regular, then dev default
    return (
      process.env.TEST_FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5173"
    );
  }

  // In production, FRONTEND_URL must be explicitly configured
  if (!process.env.FRONTEND_URL) {
    throw new Error(
      "FRONTEND_URL environment variable is required in production.",
    );
  }

  return process.env.FRONTEND_URL;
}

// Helper: Build absolute backend URL from the incoming crawler request. Works
// regardless of where the server is hosted because we read the actual Host
// header (and respect X-Forwarded-Proto behind a proxy/CDN).
function getBackendUrlFromReq(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.get("host");
  return `${proto}://${host}`;
}

const app = express();

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
    const { supabase } = await import("./supabase.js");
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
  const where = hideLocation
    ? (event?.revealHint || "Location revealed later")
    : (event?.location ? String(event.location).trim() : "");

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

  <title>${ogTitle} — Pull Up</title>
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
  <meta property="og:site_name" content="Pull Up">

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

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : ["http://localhost:3000", "http://localhost:5173"], // Default dev origins
  credentials: true,
  optionsSuccessStatus: 200,
};
// /mcp + /oauth/* + /.well-known/oauth-* are reached from AI clients
// (claude.ai, ChatGPT, etc.) which aren't on the website's origin
// allowlist. Bypass the global cors() for those paths and let each
// handler set its own permissive CORS headers — every one is auth-gated
// by either a bearer token (PKCE-issued or manually minted) or PKCE
// itself at the token endpoint, so an open Allow-Origin is safe.
const _globalCors = cors(corsOptions);
function isMcpOauthPath(p) {
  return (
    p === "/mcp" ||
    p.startsWith("/mcp/") ||
    p.startsWith("/oauth/") ||
    p.startsWith("/.well-known/oauth-")
  );
}
app.use((req, res, next) => {
  if (isMcpOauthPath(req.path)) return next();
  return _globalCors(req, res, next);
});

// ---------------------------
// WEBHOOKS: Stripe webhook handler (MUST be before express.json() middleware)
// ---------------------------
app.post(
  "/webhooks/stripe",
  // CRITICAL: Use express.raw() to preserve raw body for signature verification
  // Must match Stripe's exact body format (no JSON parsing)
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => {
      // Store raw body for signature verification
      req.rawBody = buf;
    },
  }),
  async (req, res) => {
    // Log that webhook endpoint was hit
    console.log("[Webhook] ⚡ Webhook endpoint hit!");
    console.log("[Webhook] Request method:", req.method);
    console.log("[Webhook] Request headers:", {
      "content-type": req.headers["content-type"],
      "stripe-signature": req.headers["stripe-signature"]
        ? "present"
        : "missing",
    });

    const sig = req.headers["stripe-signature"];

    // Get webhook secret - prefer TEST_ prefixed in development
    const webhookSecret = isDevelopment
      ? process.env.TEST_STRIPE_WEBHOOK_SECRET ||
        process.env.STRIPE_WEBHOOK_SECRET
      : process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      const missingVar = isDevelopment
        ? "TEST_STRIPE_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET"
        : "STRIPE_WEBHOOK_SECRET";
      console.error(`[Webhook] ❌ ${missingVar} not configured`);
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    if (isDevelopment && process.env.TEST_STRIPE_WEBHOOK_SECRET) {
      console.log("🔧 [DEV] Using TEST Stripe webhook secret");
      console.log(
        "[Webhook] Secret starts with:",
        webhookSecret?.substring(0, 10) + "..."
      );
    }

    // Verify body is raw buffer
    console.log("[Webhook] Body type:", typeof req.body);
    console.log("[Webhook] Body is Buffer:", Buffer.isBuffer(req.body));
    console.log("[Webhook] Body length:", req.body?.length);

    let event;

    try {
      const stripe = (await import("stripe")).default;
      const stripeInstance = new stripe(getStripeSecretKey());

      // Use raw body (Buffer) for signature verification
      // req.body should already be a Buffer from express.raw()
      const rawBody = req.rawBody || req.body;

      if (!Buffer.isBuffer(rawBody)) {
        console.error(
          "[Webhook] ❌ Body is not a Buffer! Type:",
          typeof rawBody
        );
        return res
          .status(400)
          .send("Webhook Error: Invalid request body format");
      }

      event = stripeInstance.webhooks.constructEvent(
        rawBody,
        sig,
        webhookSecret
      );
      console.log("[Webhook] ✅ Signature verified successfully");
      console.log("[Webhook] Event type:", event.type);
      console.log("[Webhook] Event ID:", event.id);
    } catch (err) {
      console.error("[Webhook] ❌ Signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Respond 200 immediately so Stripe never times out, then process in background
    res.json({ received: true });

    // Process asynchronously — errors are logged but don't affect the HTTP response
    handleStripeWebhook(event)
      .then((result) => {
        console.log("[Webhook] ✅ Event processed:", {
          type: event.type,
          id: event.id,
          processed: result.processed,
          error: result.error,
        });
      })
      .catch((error) => {
        console.error("[Webhook] ❌ Processing error:", {
          type: event.type,
          id: event.id,
          error: error.message,
          stack: error.stack,
        });
      });
  }
);

// /mcp JSON-RPC bodies get a stricter cap than the global json parser —
// MCP messages are normally <100KB, occasional inline base64 images may
// reach a few MB. 50MB is generous defense-in-depth without blocking
// legitimate use. Mounted BEFORE the global parser so it wins for /mcp
// (the global parser short-circuits when req.body is already set).
app.use("/mcp", express.json({ limit: "50mb" }));

// Convert body-parser errors on /mcp to a JSON-RPC envelope so clients
// don't get raw Express HTML on 413 / malformed JSON.
app.use("/mcp", (err, req, res, next) => {
  if (!err) return next();
  const status = err.statusCode || err.status || 400;
  const code = status === 413 ? -32600 : -32700; // invalid-request vs parse-error
  return res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message: err.message || "Bad request" },
    id: null,
  });
});

// Lightweight no-auth heartbeat so uptime monitors / load balancers can
// probe the MCP endpoint without minting a PAT. Returns the server name
// + protocol version; intentionally NOT the tool list.
app.get("/mcp/health", (req, res) => {
  res.json({ ok: true, server: "pullup-mcp", version: "0.3.0" });
});

// Allow base64 images in body
app.use(
  express.json({
    limit: "100mb",
    verify: (req, res, buf) => {
      // Preserve raw body for HMAC verification on webhooks.
      req.rawBody = buf;
    },
  }),
);
app.use(express.text({ limit: "50mb", type: "text/csv" })); // For CSV import
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ---------------------------
// MCP: Model Context Protocol endpoint for any MCP-capable AI client
// (claude.ai, ChatGPT, Cursor, Claude Desktop/Code, etc.). Authenticated
// via PATs — issued either manually in Settings or via the OAuth flow
// below. See src/mcp/ and src/oauth/.
// ---------------------------
app.options("/mcp", mcpCorsPreflight);
app.all("/mcp", handleMcp);

// ---------------------------
// OAuth 2.1 for the MCP endpoint. RFC 6749 + 7591 (DCR) + 7636 (PKCE) +
// 8414 (AS metadata) + 9728 (PRM). Lets claude.ai's "Add custom connector"
// flow auto-authenticate without the user pasting tokens.
// ---------------------------
app.use(["/oauth", "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"], (req, res, next) => {
  setOauthCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/.well-known/oauth-protected-resource", metadataPRM);
app.get("/.well-known/oauth-authorization-server", metadataAS);

app.post("/oauth/register", oauthRegister);
app.get("/oauth/authorize", oauthAuthorize);
app.post("/oauth/token", express.urlencoded({ extended: false }), oauthToken);
// describeConsent and consent are called by the pullup.se SPA (same
// origin via /api/) — JWT-authenticated.
app.get("/oauth/describe-consent", oauthDescribeConsent);
app.post("/oauth/consent", requireAuth, oauthConsent);

// ---------------------------
// WEBHOOKS: SES SNS webhook
// ---------------------------
app.post("/webhooks/ses", async (req, res) => {
  try {
    const result = await handleProviderEvent({
      provider: "ses",
      rawHeaders: req.headers,
      rawBody: req.body,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[Webhook][SES] Error processing webhook", error);
    res.status(500).json({ error: "Failed to process SES webhook" });
  }
});

// ---------------------------
// WEBHOOKS: SES EventBridge (raw SES notifications)
// ---------------------------
app.post("/webhooks/ses-eventbridge", async (req, res) => {
  try {
    const secret = process.env.EVENTS_WEBHOOK_SECRET;
    const signatureHeader =
      req.headers["x-pullup-signature"] || req.headers["X-Pullup-Signature"];

    if (!secret || !signatureHeader || signatureHeader !== secret) {
      console.warn("[Webhook][SES-EventBridge] Unauthorized request", {
        hasSecret: !!secret,
        hasSignature: !!signatureHeader,
      });
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const notification = req.body;

    if (!notification || typeof notification !== "object") {
      console.warn(
        "[Webhook][SES-EventBridge] Invalid body, expected object",
        typeof notification,
      );
      return res
        .status(400)
        .json({ ok: false, error: "invalid_body" });
    }

    const mail = notification.mail || {};
    const tags = mail.tags || {};
    const eventType = notification.eventType || null;
    const messageId = mail.messageId || null;
    const outboxIdTag = tags.outbox_id;
    const outboxId = Array.isArray(outboxIdTag)
      ? outboxIdTag[0]
      : outboxIdTag || null;

    console.log("[Webhook][SES-EventBridge] Incoming SES event", {
      eventType,
      messageId,
      outboxId,
    });

    const result = await processSesEvent(notification);

    return res.json({
      ok: true,
      eventType: result?.eventType ?? null,
    });
  } catch (error) {
    console.error(
      "[Webhook][SES-EventBridge] Error processing EventBridge webhook",
      error,
    );
    res.status(500).json({
      ok: false,
      error: "Failed to process SES EventBridge webhook",
    });
  }
});

// ---------------------------
// INTERNAL: SES EventBridge forwarder
// ---------------------------
app.post("/internal/webhooks/ses-eventbridge", async (req, res) => {
  try {
    const secret = process.env.EVENTS_WEBHOOK_SECRET;

    if (secret) {
      const signatureHeader =
        req.headers["x-events-signature"] ||
        req.headers["X-Events-Signature"];

      if (!signatureHeader) {
        console.warn(
          "[Webhook][SES-EventBridge] Missing x-events-signature header",
        );
        return res.status(401).json({ error: "Missing events signature" });
      }

      const rawBody =
        req.rawBody || Buffer.from(JSON.stringify(req.body), "utf8");
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");

      const expectedBuf = Buffer.from(expectedSignature, "hex");
      const providedBuf = Buffer.from(String(signatureHeader), "hex");

      if (
        expectedBuf.length !== providedBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, providedBuf)
      ) {
        console.warn(
          "[Webhook][SES-EventBridge] Invalid events signature",
        );
        return res.status(401).json({ error: "Invalid events signature" });
      }
    }

    const notification = req.body;
    const result = await processSesEvent(notification);

    res.json({ ok: true, eventType: result.eventType });
  } catch (error) {
    console.error(
      "[Webhook][SES-EventBridge] Error processing webhook",
      error,
    );
    res.status(500).json({ error: "Failed to process SES EventBridge webhook" });
  }
});

// ---------------------------
// EMAIL TRACKING: open pixel + click redirect
// ---------------------------
app.use(trackingRoutes);

// ---------------------------
// PARTNER CLICK TRACKING
// ---------------------------
app.post("/partner-clicks", optionalAuth, async (req, res) => {
  try {
    const { partnerSlug, eventId, placement } = req.body;

    if (!partnerSlug || !eventId || !placement) {
      return res.status(400).json({ error: "partnerSlug, eventId, and placement are required" });
    }

    const userId = req.user?.id || null;
    const userAgent = (req.headers["user-agent"] || "").slice(0, 500);
    const ipAddress = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;

    const { supabase } = await import("./supabase.js");
    const { error } = await supabase.from("partner_clicks").insert({
      partner_slug: partnerSlug,
      user_id: userId,
      event_id: eventId,
      placement,
      user_agent: userAgent,
      ip_address: ipAddress,
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: "Failed to record click" });
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Error recording partner click:", err);
    res.status(500).json({ error: "Failed to record click" });
  }
});

// ---------------------------
// PROTECTED: List user's events (requires auth)
// ---------------------------
app.get("/events", requireAuth, async (req, res) => {
  try {
    // Claim any pending co-host invitations for this user (by email)
    try {
      await claimPendingInvitationsForUser(req.user.id, req.user.email);
    } catch (claimErr) {
      console.error("Error claiming pending invitations:", claimErr.message);
    }

    // Fetch events where the authenticated user is a host (owner or co-host)
    const eventIds = await getUserEventIds(req.user.id);

    if (!eventIds || eventIds.length === 0) {
      return res.json([]);
    }

    const { supabase } = await import("./supabase.js");
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .in("id", eventIds)
      .order("starts_at", { ascending: false });

    if (error) {
      console.error("Error fetching events:", error);
      return res.status(500).json({ error: "Failed to fetch events" });
    }

    // Map to application format using the existing helper
    const mappedEvents = await Promise.all(
      (events || []).map((dbEvent) => mapEventFromDb(dbEvent))
    );

    // Add stats and role to each event
    const { getEventCounts } = await import("./data.js");

    // Batch-fetch page view counts for all events in one query
    let viewCountMap = {};
    try {
      const allIds = mappedEvents.map((e) => e.id);
      if (allIds.length > 0) {
        const { data: viewRows } = await supabase
          .from("event_page_views")
          .select("event_id")
          .in("event_id", allIds);
        if (viewRows) {
          for (const row of viewRows) {
            viewCountMap[row.event_id] = (viewCountMap[row.event_id] || 0) + 1;
          }
        }
      }
    } catch (err) {
      console.error("Failed to batch-fetch view counts:", err.message);
    }

    const eventsWithStats = await Promise.all(
      mappedEvents.map(async (event) => {
        const [{ confirmed }, myRole] = await Promise.all([
          getEventCounts(event.id),
          getEventHostRole(req.user.id, event.id),
        ]);
        return {
          ...event,
          myRole,
          _stats: {
            confirmed,
            totalCapacity: event.totalCapacity ?? null,
            views: viewCountMap[event.id] || 0,
          },
        };
      })
    );

    // Optional filtering: ?filter=upcoming|past|all
    const filter = (req.query.filter || "all").toString().toLowerCase();
    let filteredEvents = eventsWithStats;

    const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours
    if (filter === "upcoming") {
      const now = new Date();
      filteredEvents = eventsWithStats.filter((event) => {
        if (!event.startsAt) return true;
        const start = new Date(event.startsAt);
        const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + DEFAULT_DURATION_MS);
        if (now > end) return false; // past
        return true; // upcoming or ongoing
      });
    } else if (filter === "past") {
      const now = new Date();
      filteredEvents = eventsWithStats.filter((event) => {
        if (!event.startsAt) return false;
        const start = new Date(event.startsAt);
        const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + DEFAULT_DURATION_MS);
        return now > end;
      });
    }

    res.json(filteredEvents);
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// ---------------------------
// PUBLIC: Share endpoint - Always returns HTML with OG tags
// ---------------------------
app.get("/share/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`[Share] Request for slug: ${slug}`);

    const event = await findEventBySlug(slug);

    if (!event) {
      console.log(`[Share] Event not found for slug: ${slug}`);
      return res.status(404).send("Event not found");
    }

    // Forward UTM params through the redirect so tracking works
    const qs = new URLSearchParams(req.query).toString();
    const ogHtml = await generateOgHtmlForEvent(event, "Share", qs, req);
    res.setHeader("Content-Type", "text/html");
    res.send(ogHtml);
  } catch (error) {
    console.error("Error generating share page:", error);
    res.status(500).send("Error generating share page");
  }
});

// ---------------------------
// PUBLIC: OG image proxy — serves a stable, JPEG-only preview image for
// crawlers. Three reasons we proxy instead of pointing crawlers at Supabase:
//   1. Content-Type guarantee. Supabase's render service serves image/jpeg
//      regardless of source format, but the URL extension may be .png/.webp,
//      which causes downstream confusion. Pinning Content-Type here means
//      og:image:type=image/jpeg is always truthful → Instagram/Facebook stop
//      silently dropping the preview.
//   2. Cache invalidation. We embed event.updatedAt as a ?v= cache-buster on
//      the og:image URL so reshares of edited events get a fresh preview
//      without waiting on multi-day crawler caches.
//   3. Routability. Production nginx forwards /share/* to this backend but
//      /og/* and /events/* go to the static SPA; hence the URL lives here.
// ---------------------------
app.get("/share/og-image/:slug/image.jpg", async (req, res) => {
  const { slug } = req.params;
  const fallback = `${getFrontendUrl()}/og-image.jpg`;

  try {
    const event = await findEventBySlug(slug);
    if (!event) return res.redirect(302, fallback);

    const sourceImage = pickOgSourceImage(event);
    const supabaseUrl = sourceImage
      ? await toOgPublicImageUrl(sourceImage, "OgImage")
      : null;
    if (!supabaseUrl) return res.redirect(302, fallback);

    // ETag based on event.updatedAt + source image path so crawlers can
    // revalidate cheaply. Skip body on If-None-Match match.
    const etagSource = `${event.updatedAt || event.createdAt || ""}:${sourceImage}`;
    const etag = `"${Buffer.from(etagSource).toString("base64").slice(0, 32)}"`;
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    const upstream = await fetch(supabaseUrl);
    if (!upstream.ok) {
      console.error(
        `[OgImage] Upstream fetch failed for ${slug}: ${upstream.status}`
      );
      return res.redirect(302, fallback);
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    // Hard-pin Content-Type. Cache for a day at the edge but allow revalidation
    // via ETag — `stale-while-revalidate` keeps previews snappy even while we
    // refresh in the background after an edit.
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader(
      "Cache-Control",
      "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800"
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", String(buffer.length));
    return res.status(200).send(buffer);
  } catch (error) {
    console.error(`[OgImage] Error for slug ${slug}:`, error);
    return res.redirect(302, fallback);
  }
});

// ---------------------------
// PUBLIC: Event page endpoint - Returns HTML with OG tags
// This ensures /e/:slug shares show the same rich preview as /share/:slug
// ---------------------------
app.get("/e/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`[EventPage] Request for slug: ${slug}`);

    const event = await findEventBySlug(slug);

    if (!event) {
      console.log(`[EventPage] Event not found for slug: ${slug}`);
      // For browsers, let frontend handle 404
      // For crawlers, return 404 HTML
      if (isCrawler(req)) {
        return res.status(404).send("Event not found");
      }
      // Redirect browsers to frontend (which will handle 404)
      return res.redirect(`${getFrontendUrl()}/e/${slug}`);
    }

    // Always return OG HTML (crawlers get OG tags, browsers get redirected via meta refresh)
    const qs = new URLSearchParams(req.query).toString();
    const ogHtml = await generateOgHtmlForEvent(event, "EventPage", qs, req);
    res.setHeader("Content-Type", "text/html");
    res.send(ogHtml);
  } catch (error) {
    console.error("Error generating event page OG:", error);
    res.status(500).send("Error generating event page");
  }
});

// ---------------------------
// PUBLIC: Track event page view
// ---------------------------
app.post("/events/:slug/view", async (req, res) => {
  try {
    const { slug } = req.params;
    const { visitorId, referrer, utm_source, utm_medium, utm_campaign, utm_content, deviceType, userAgent, isVip } = req.body || {};

    // Resolve event ID from slug
    const event = await findEventBySlug(slug);
    if (!event) return res.status(404).json({ error: "not_found" });

    const { supabase: sb } = await import("./supabase.js");

    // Deduplicate: skip if same visitor viewed this event from the same source in the last 30 minutes
    // Different UTM sources are always recorded (so switching from instagram to linkedin link counts)
    if (visitorId) {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      let query = sb
        .from("event_page_views")
        .select("id")
        .eq("event_id", event.id)
        .eq("visitor_id", visitorId)
        .gte("created_at", thirtyMinAgo);

      // If this view has a UTM source, only dedup against same source
      if (utm_source) {
        query = query.eq("utm_source", utm_source);
      } else {
        query = query.is("utm_source", null);
      }

      const { data: recent } = await query.limit(1);

      if (recent && recent.length > 0) {
        return res.json({ ok: true, deduplicated: true });
      }
    }

    await sb.from("event_page_views").insert({
      event_id: event.id,
      visitor_id: visitorId || null,
      referrer: (referrer || "").slice(0, 2000) || null,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_content: utm_content || null,
      device_type: deviceType || null,
      user_agent: (userAgent || "").slice(0, 1000) || null,
      is_vip: !!isVip,
    });

    return res.json({ ok: true });
  } catch (err) {
    // Page view tracking should never break the user experience
    console.error("[page-view] Error:", err.message);
    return res.json({ ok: false });
  }
});

// ---------------------------
// PUBLIC: Get event by slug
// Returns HTML for crawlers, JSON for API calls
// ---------------------------
app.get("/events/:slug", optionalAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    // Pass userId if authenticated (for DRAFT visibility check)
    const userId = req.user?.id || null;
    const event = await findEventBySlug(slug, userId);

    if (!event) {
      // Log for debugging
      console.log(
        `[Events] Event not found for slug: ${slug}, userId: ${
          userId || "none"
        }`
      );
      return res.status(404).json({ error: "Event not found" });
    }

    // If request is from a crawler, return HTML with OG tags
    if (isCrawler(req)) {
      console.log(`[Events] Crawler detected for slug: ${slug}`);
      const ogHtml = await generateOgHtmlForEvent(event, "EventsAPI", "", req);
      res.setHeader("Content-Type", "text/html");
      return res.send(ogHtml);
    }

    // Otherwise, return JSON (existing behavior for API/frontend)
    const { confirmed, waitlist } = await getEventCounts(event.id);
    // Calculate cocktails-only (people attending cocktails but not confirmed for dinner)
    const cocktailsOnly = await getCocktailsOnlyCount(event.id);
    const cocktailSpotsLeft =
      event.cocktailCapacity != null
        ? Math.max(0, event.cocktailCapacity - cocktailsOnly)
        : null;

    // Strip hidden fields from public response (hosts still see everything)
    const hostEventIds = userId ? await getUserEventIds(userId) : [];
    const isHost = hostEventIds.includes(event.id);
    const publicEvent = { ...event };
    if (!isHost) {
      if (publicEvent.hideLocation) {
        publicEvent.location = null;
        publicEvent.locationLat = null;
        publicEvent.locationLng = null;
      }
      if (publicEvent.hideDate) {
        publicEvent.startsAt = null;
        publicEvent.endsAt = null;
      }
    }

    res.json({
      ...publicEvent,
      _attendance: {
        confirmed,
        waitlist,
        cocktailSpotsLeft,
      },
    });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

// ---------------------------
// PUBLIC: Validate waitlist payment link token
// ---------------------------
app.get("/events/:slug/waitlist-offer", async (req, res) => {
  try {
    const { slug } = req.params;
    const { wl: token } = req.query;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyWaitlistToken(token);
    } catch (error) {
      return res.status(400).json({
        error: "Invalid or expired token",
        message: error.message,
      });
    }

    // Validate token structure
    if (
      decoded.type !== "waitlist_offer" ||
      !decoded.eventId ||
      !decoded.rsvpId ||
      !decoded.email
    ) {
      return res.status(400).json({ error: "Invalid token structure" });
    }

    // Verify event exists - try by ID from token first (most reliable)
    // The backend uses service role, so RLS shouldn't block this
    let event = await findEventById(decoded.eventId);

    if (!event) {
      // Try by slug as fallback (in case ID lookup fails)
      console.log("[waitlist-offer] Event not found by ID, trying slug", {
        eventId: decoded.eventId,
        slug,
      });
      event = await findEventBySlug(slug);
    }

    // Verify event exists and matches token's eventId
    if (!event) {
      console.error("[waitlist-offer] Event not found", {
        eventId: decoded.eventId,
        slug,
        tokenDecoded: {
          type: decoded.type,
          eventId: decoded.eventId,
          rsvpId: decoded.rsvpId,
          email: decoded.email,
        },
      });
      return res.status(404).json({
        error: "Event not found",
        message:
          "The event associated with this waitlist link could not be found",
      });
    }

    if (event.id !== decoded.eventId) {
      console.error("[waitlist-offer] Event ID mismatch", {
        tokenEventId: decoded.eventId,
        foundEventId: event.id,
        slug,
        foundSlug: event.slug,
      });
      return res.status(400).json({
        error: "Event ID mismatch",
        message: "The event in the link does not match the URL",
      });
    }

    console.log("[waitlist-offer] Event found successfully", {
      eventId: event.id,
      slug: event.slug,
      title: event.title,
    });

    // If slug doesn't match, that's okay - use the event's actual slug
    // The frontend will handle redirecting to the correct slug if needed

    // Verify RSVP exists and matches token
    const rsvp = await findRsvpById(decoded.rsvpId);
    if (!rsvp) {
      return res.status(404).json({ error: "RSVP not found" });
    }

    if (
      rsvp.eventId !== decoded.eventId ||
      rsvp.bookingStatus !== "WAITLIST" ||
      rsvp.email?.toLowerCase() !== decoded.email.toLowerCase()
    ) {
      return res.status(400).json({
        error: "RSVP mismatch",
        message: "This link is not valid for this RSVP",
      });
    }

    // Check if link has expired
    if (decoded.expiresAt && new Date(decoded.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Token expired" });
    }

    // Get person details
    const person = await findPersonById(rsvp.personId);

    // Recalculate party size using DPCS to ensure correctness
    // partySize = dinnerPartySize (includes booker) + plusOnes (cocktails-only) if dinner selected
    // partySize = 1 (booker) + plusOnes (cocktails-only) if no dinner
    const wantsDinner = rsvp.wantsDinner || false;
    // Handle null/undefined dinnerPartySize - convert to 0 if not a valid number
    const dinnerPartySize =
      rsvp.dinnerPartySize !== null && rsvp.dinnerPartySize !== undefined
        ? Number(rsvp.dinnerPartySize) || 0
        : 0;
    const plusOnes = Number(rsvp.plusOnes) || 0;
    let calculatedPartySize;
    if (wantsDinner && dinnerPartySize > 0) {
      // Dinner selected: partySize = dinnerPartySize (includes booker) + plusOnes
      calculatedPartySize = dinnerPartySize + plusOnes;
    } else {
      // No dinner: partySize = 1 (booker) + plusOnes
      calculatedPartySize = 1 + plusOnes;
    }

    console.log("[Waitlist Offer] Party size calculation:", {
      wantsDinner,
      dinnerPartySize,
      plusOnes,
      calculatedPartySize,
      storedPartySize: rsvp.partySize,
      rawDinnerPartySize: rsvp.dinnerPartySize,
      rawPlusOnes: rsvp.plusOnes,
    });

    // Return offer data with RSVP details
    // Include full event data so frontend can use it directly
    res.json({
      valid: true,
      event: {
        id: event.id,
        slug: event.slug, // Use actual slug from database
        title: event.title,
        ticketType: event.ticketType,
        ticketPrice: event.ticketPrice,
        ticketCurrency: event.ticketCurrency,
        // Include full event for frontend to use
        ...event,
      },
      rsvpDetails: {
        id: rsvp.id,
        name: rsvp.name || person?.name || null,
        email: rsvp.email || person?.email || null,
        plusOnes: plusOnes,
        partySize: calculatedPartySize, // Use recalculated party size
        wantsDinner: wantsDinner,
        dinnerTimeSlot: rsvp.dinnerTimeSlot || null,
        dinnerPartySize: wantsDinner ? dinnerPartySize : null,
      },
      expiresAt: decoded.expiresAt,
    });
  } catch (error) {
    console.error("Error validating waitlist offer:", error);
    res.status(500).json({ error: "Failed to validate waitlist offer" });
  }
});

// ---------------------------
// PUBLIC: VIP invite offer (validate VIP token)
// ---------------------------
app.get("/events/:slug/vip-offer", async (req, res) => {
  const { slug } = req.params;
  const { vip: token } = req.query;

  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  try {
    // Verify token
    let decoded;
    try {
      decoded = verifyWaitlistToken(token);
    } catch (error) {
      return res.status(400).json({
        error: "Invalid or expired token",
        message: error.message,
      });
    }

    if (!decoded || decoded.type !== "vip_invite") {
      return res.status(400).json({ error: "Invalid token type" });
    }

    const { inviteId, eventId, email, maxGuests, freeEntry, discountPercent } =
      decoded;

    if (!inviteId || !eventId || !email) {
      return res.status(400).json({ error: "Invalid token structure" });
    }

    // Load event (prefer ID, fall back to slug)
    let event = await findEventById(eventId);
    if (!event) {
      event = await findEventBySlug(slug);
    }

    if (!event) {
      return res.status(404).json({
        error: "Event not found",
        message:
          "The event associated with this VIP link could not be found",
      });
    }

    if (event.id !== eventId) {
      return res.status(400).json({
        error: "Event ID mismatch",
        message: "The event in the link does not match the URL",
      });
    }

    // Load invite from database
    const invite = await findVipInviteById(inviteId);
    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    // Basic consistency checks
    if (
      invite.event_id !== event.id ||
      invite.email.toLowerCase() !== String(email).toLowerCase()
    ) {
      return res.status(400).json({
        error: "Invite mismatch",
        message: "This VIP link is not valid for this event or email",
      });
    }

    // Check if already used
    if (invite.used_at) {
      return res.status(400).json({
        error: "invite_used",
        message: "This VIP link has already been used.",
      });
    }

    // Check expiration (prefer DB expires_at, fall back to token.expiresAt)
    const expiresAt =
      invite.expires_at || (decoded.expiresAt && new Date(decoded.expiresAt));
    if (expiresAt && new Date(expiresAt) < new Date()) {
      return res.status(400).json({
        error: "invite_expired",
        message: "This VIP link has expired.",
      });
    }

    // Build response
    return res.json({
      valid: true,
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        ticketType: event.ticketType,
        ticketPrice: event.ticketPrice,
        ticketCurrency: event.ticketCurrency,
        ...event,
      },
      invite: {
        id: invite.id,
        email: invite.email,
        maxGuests: invite.max_guests,
        freeEntry: invite.free_entry,
        discountPercent: invite.discount_percent,
      },
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
  } catch (error) {
    console.error("Error validating VIP offer:", error);
    res.status(500).json({ error: "Failed to validate VIP offer" });
  }
});

// ---------------------------
// PROTECTED: Create event (requires auth)
// ---------------------------
app.post("/events", requireAuth, async (req, res) => {
  const {
    title,
    description,
    location,
    locationLat,
    locationLng,
    startsAt,
    endsAt,
    timezone,
    maxAttendees,
    waitlistEnabled,
    imageUrl,
    theme,
    calendar,
    visibility,
    ticketType,
    requireApproval,

    // NEW fields
    maxPlusOnesPerGuest,
    dinnerEnabled,
    dinnerStartTime,
    dinnerEndTime,
    dinnerSeatingIntervalHours,
    dinnerMaxSeatsPerSlot,
    dinnerOverflowAction,
    dinnerSlots,
    dinnerBookingEmail,
    hideDinnerRemaining,

    // Capacity fields
    cocktailCapacity,
    foodCapacity,
    totalCapacity,
    // Stripe fields (simplified)
    ticketPrice,
    ticketCurrency = "USD",

    // Dual personality fields
    createdVia,
    status,

    // Media settings
    mediaSettings,

    // Title settings
    titleSettings,

    // Social links
    instagram,
    spotify,
    tiktok,
    soundcloud,

    // Sections (event builder blocks)
    sections,

    // Custom RSVP form fields
    formFields,

    // Reveal & waitlist features
    hideLocation,
    hideDate,
    instantWaitlist,
    revealHint,
    dateRevealHint,
  } = req.body;

  if (!title || !startsAt) {
    return res.status(400).json({ error: "title and startsAt are required" });
  }

  // For TBA events (hideDate=true), startsAt is a private placeholder used for
  // sorting/reminders only — the public never sees it. Don't reject when the
  // placeholder is in the past; the host shouldn't have to babysit it.
  if (!hideDate && new Date(startsAt) < new Date()) {
    return res.status(400).json({ error: "Event start date cannot be in the past" });
  }
  if (!hideDate && endsAt && new Date(endsAt) < new Date()) {
    return res.status(400).json({ error: "Event end date cannot be in the past" });
  }

  // Create the event first to get its ID (with host_id from authenticated user)
  const _createEventBody = req.body;
  const event = await createEvent({
    hostId: req.user.id, // Set host_id from authenticated user
    title,
    description,
    location,
    locationLat,
    locationLng,
    startsAt,
    endsAt,
    timezone,
    maxAttendees,
    waitlistEnabled,
    imageUrl,
    theme,
    calendar,
    visibility,
    ticketType,
    requireApproval,
    maxPlusOnesPerGuest,
    dinnerEnabled,
    dinnerStartTime,
    dinnerEndTime,
    dinnerSeatingIntervalHours,
    dinnerMaxSeatsPerSlot,
    dinnerOverflowAction,
    dinnerSlots,
    dinnerBookingEmail,
    hideDinnerRemaining,
    ticketPrice,
    ticketCurrency: ticketCurrency || "USD",
    cocktailCapacity,
    foodCapacity,
    totalCapacity,
    createdVia: createdVia || "legacy",
    status: status || "PUBLISHED",
    mediaSettings,
    titleSettings,
    instagram,
    spotify,
    tiktok,
    soundcloud,
    sections,
    formFields,
    hideLocation,
    hideDate,
    instantWaitlist,
    revealHint,
    dateRevealHint,
  });

  emitIntent({
    hostId: req.user.id,
    tool: "create_event",
    args: _createEventBody,
    source: sourceFromRequest(req),
    target: { type: "event", id: event.id },
    result: { slug: event.slug, status: event.status },
  });

  // Upload any hostedby logos from sections to storage (now that we have event.id)
  if (sections && Array.isArray(sections)) {
    try {
      const processedSections = await processHostedByLogos(event.id, sections);
      if (processedSections !== sections) {
        await updateEvent(event.id, { sections: processedSections });
        event.sections = processedSections;
      }
    } catch (err) {
      console.warn("[POST /host/events] Hosted-by logo upload failed:", err.message);
    }
  }

  // If paid tickets, automatically create Stripe product and price (internal only)
  if (ticketType === "paid" && ticketPrice) {
    try {
      // Create Stripe product
      const product = await createStripeProduct({
        eventTitle: title,
        eventDescription: description || "",
        eventId: event.id,
        startsAt,
        endsAt,
      });

      // Create Stripe price
      const price = await createStripePrice({
        productId: product.id,
        amount: ticketPrice, // Already in cents
        currency: ticketCurrency || "usd",
        eventId: event.id,
      });

      // Update the event with the created Stripe IDs
      const updatedEvent = await updateEvent(event.id, {
        stripeProductId: product.id,
        stripePriceId: price.id,
      });

      res.status(201).json(updatedEvent);
      return;
    } catch (error) {
      console.error("Error creating Stripe product/price:", error);
      // If Stripe creation fails, still return the event but without Stripe IDs
      // This allows the event to be created even if Stripe is misconfigured
      // The user can manually add Stripe IDs later if needed
      res.status(201).json(event);
      return;
    }
  }

  res.status(201).json(event);
});

// ---------------------------
// PUBLIC: RSVP
// ---------------------------
app.post("/events/:slug/rsvp", validateRsvpData, async (req, res) => {
  try {
    const { slug } = req.params;
    const {
      name,
      email,
      plusOnes = 0, // NEW: how many guests they bring (0–3)
      wantsDinner = false, // NEW: opt-in to dinner
      dinnerTimeSlot = null, // NEW: selected dinner time slot (ISO string)
      dinnerPartySize = null, // NEW: party size for dinner (can differ from event party size)
      waitlistRsvpId = null, // NEW: RSVP ID for waitlist upgrade
      waitlistToken = null, // NEW: JWT token for waitlist upgrade
      vipToken = null, // NEW: JWT token for VIP invite
      marketingOptIn = false, // NEW: opt-in to newsletter from RSVP form
      visitorId = null, // Links browsing session to RSVP
      joinWaitlist = false, // If true, join waitlist when event is full
      customAnswers = {}, // Answers to event-defined custom form fields
    } = req.body;

    if (!email && !vipToken) {
      return res.status(400).json({ error: "email is required" });
    }

    // Handle VIP invite flow
    let vipInvite = null;
    let vipDecoded = null;
    if (vipToken && !waitlistToken && !waitlistRsvpId) {
      try {
        vipDecoded = verifyWaitlistToken(vipToken);
        if (!vipDecoded || vipDecoded.type !== "vip_invite") {
          return res.status(400).json({ error: "Invalid VIP token" });
        }

        if (!vipDecoded.inviteId || !vipDecoded.eventId || !vipDecoded.email) {
          return res.status(400).json({ error: "Invalid VIP token structure" });
        }

        // Load event and ensure it matches slug + token
        const event = await findEventBySlug(slug);
        if (!event || event.id !== vipDecoded.eventId) {
          return res.status(400).json({
            error: "vip_event_mismatch",
            message: "VIP link is for a different event",
          });
        }

        // Load invite
        const invite = await findVipInviteById(vipDecoded.inviteId);
        if (!invite) {
          return res.status(404).json({ error: "VIP invite not found" });
        }

        if (
          invite.event_id !== event.id ||
          invite.email.toLowerCase() !==
            String(vipDecoded.email).toLowerCase()
        ) {
          return res.status(400).json({
            error: "vip_invite_mismatch",
            message: "VIP invite does not match this event or email",
          });
        }

        if (invite.used_at) {
          return res.status(400).json({
            error: "vip_invite_used",
            message: "This VIP link has already been used.",
          });
        }

        const expiresAt =
          invite.expires_at ||
          (vipDecoded.expiresAt && new Date(vipDecoded.expiresAt));
        if (expiresAt && new Date(expiresAt) < new Date()) {
          return res.status(400).json({
            error: "vip_invite_expired",
            message: "This VIP link has expired.",
          });
        }

        vipInvite = invite;
      } catch (tokenError) {
        return res.status(400).json({
          error: "Invalid or expired VIP token",
          message: tokenError.message,
        });
      }
    }

    const effectiveEmail = vipInvite ? vipInvite.email : email;

    // Enforce VIP max guests (server-side)
    if (vipInvite && typeof vipInvite.max_guests === "number") {
      const maxGuests =
        vipInvite.max_guests && vipInvite.max_guests > 0
          ? vipInvite.max_guests
          : 1;

      const plus = Number(plusOnes) || 0;
      let requestedPartySize = 1 + plus;

      if (
        wantsDinner &&
        dinnerPartySize !== null &&
        dinnerPartySize !== undefined
      ) {
        const parsedDinnerPartySize = Math.max(
          1,
          Math.floor(Number(dinnerPartySize) || 1)
        );
        requestedPartySize = parsedDinnerPartySize + plus;
      }

      if (requestedPartySize > maxGuests) {
        return res.status(400).json({
          error: "vip_max_guests_exceeded",
          message: `This VIP link allows up to ${maxGuests} guests in total.`,
        });
      }
    }

    // Handle waitlist upgrade flow
    let existingWaitlistRsvp = null;
    if (waitlistRsvpId && waitlistToken) {
      try {
        // Verify token
        const decoded = verifyWaitlistToken(waitlistToken);
        if (
          decoded.type !== "waitlist_offer" ||
          decoded.rsvpId !== waitlistRsvpId ||
          decoded.email?.toLowerCase() !== email.toLowerCase()
        ) {
          return res.status(400).json({
            error: "Invalid waitlist token",
            message: "Token does not match RSVP or email",
          });
        }

        // Fetch existing waitlist RSVP
        existingWaitlistRsvp = await findRsvpById(waitlistRsvpId);
        if (
          !existingWaitlistRsvp ||
          existingWaitlistRsvp.bookingStatus !== "WAITLIST" ||
          existingWaitlistRsvp.eventId !== decoded.eventId
        ) {
          return res.status(400).json({
            error: "Invalid waitlist RSVP",
            message: "RSVP is not on waitlist or does not match event",
          });
        }

        // Verify event matches slug
        const event = await findEventBySlug(slug);
        if (!event || event.id !== decoded.eventId) {
          return res.status(400).json({
            error: "Event mismatch",
            message: "Token is for a different event",
          });
        }

        // Validate that submitted name matches original (if provided)
        if (name && existingWaitlistRsvp.name) {
          const normalizedSubmitted = name.trim().toLowerCase();
          const normalizedOriginal = existingWaitlistRsvp.name
            .trim()
            .toLowerCase();
          if (normalizedSubmitted !== normalizedOriginal) {
            return res.status(400).json({
              error: "Name mismatch",
              message: "Name must match original waitlist request",
            });
          }
        }
      } catch (tokenError) {
        return res.status(400).json({
          error: "Invalid or expired token",
          message: tokenError.message,
        });
      }
    }

    // Validate custom form fields against event's required form fields
    let resolvedCustomAnswers = {};
    if (!existingWaitlistRsvp) {
      const eventForFields = await findEventBySlug(slug);
      const fields = Array.isArray(eventForFields?.formFields)
        ? eventForFields.formFields
        : [];
      const incoming =
        customAnswers && typeof customAnswers === "object" ? customAnswers : {};
      const missing = [];
      for (const f of fields) {
        if (!f || !f.id) continue;
        const val = incoming[f.id];
        const trimmed = typeof val === "string" ? val.trim() : "";
        if (f.required && !trimmed) {
          missing.push(f.label || f.id);
        }
        if (trimmed) resolvedCustomAnswers[f.id] = trimmed.slice(0, 1000);
      }
      if (missing.length > 0) {
        return res.status(400).json({
          error: "missing_required_fields",
          message: `Please fill in: ${missing.join(", ")}`,
          fields: missing,
        });
      }
    }

    // For waitlist upgrades, use existing RSVP details (all fields locked)
    const rsvpData = existingWaitlistRsvp
      ? {
          slug,
          name: existingWaitlistRsvp.name,
          email: existingWaitlistRsvp.email,
          plusOnes: existingWaitlistRsvp.plusOnes || 0,
          wantsDinner: existingWaitlistRsvp.wantsDinner || false,
          dinnerTimeSlot: existingWaitlistRsvp.dinnerTimeSlot || null,
          dinnerPartySize: existingWaitlistRsvp.dinnerPartySize || null,
          marketingOptIn: marketingOptIn || false,
          isVip: !!vipInvite,
          visitorId: visitorId || null,
        }
      : {
          slug,
          name,
          email: effectiveEmail,
          plusOnes,
          wantsDinner,
          dinnerTimeSlot,
          dinnerPartySize,
          marketingOptIn: marketingOptIn || false,
          isVip: !!vipInvite,
          visitorId: visitorId || null,
          joinWaitlist: !!joinWaitlist,
          customAnswers: resolvedCustomAnswers,
        };

    const result = await addRsvp(rsvpData);

    const isEventPaid =
      result.event?.ticketType === "paid" && result.event?.ticketPrice;
    const isVipFreeEntry =
      !!vipInvite && vipInvite.free_entry === true && isEventPaid;

    // Mark VIP invite as used immediately for free-entry or non-paid events
    if (
      vipInvite &&
      result.rsvp &&
      !existingWaitlistRsvp &&
      (!isEventPaid || isVipFreeEntry)
    ) {
      try {
        await markVipInviteUsed(vipInvite.id, result.rsvp.id);
      } catch (err) {
        console.error("[VIP] Failed to mark invite as used:", err);
      }
    }

    if (result.error === "not_found") {
      return res.status(404).json({ error: "Event not found" });
    }

    if (result.error === "invalid_email") {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (result.error === "duplicate") {
      // Special handling for waitlist upgrade flow
      if (existingWaitlistRsvp && waitlistRsvpId && waitlistToken) {
        // This is a waitlist link - verify the RSVP is still WAITLIST
        if (result.rsvp && result.rsvp.id === existingWaitlistRsvp.id) {
          // Check if RSVP is still WAITLIST (required for waitlist upgrade)
          if (result.rsvp.bookingStatus !== "WAITLIST") {
            return res.status(400).json({
              error: "rsvp_already_confirmed",
              message:
                "This RSVP has already been confirmed. You cannot use this waitlist link.",
              rsvp: result.rsvp,
            });
          }

          // RSVP is WAITLIST - use it and proceed to payment
          result.rsvp = existingWaitlistRsvp;

          // Ensure event is loaded (might not be set from addRsvp duplicate response)
          if (!result.event) {
            result.event = await findEventBySlug(slug);
          }

          if (!result.event) {
            return res.status(404).json({
              error: "event_not_found",
              message: "Event not found",
            });
          }

          console.log("[Waitlist Payment] Waitlist upgrade validated:", {
            rsvpId: result.rsvp.id,
            rsvpStatus: result.rsvp.bookingStatus,
            eventId: result.event.id,
            eventTicketType: result.event.ticketType,
            eventTicketPrice: result.event.ticketPrice,
          });

          // For waitlist upgrades, we MUST proceed to payment (don't return duplicate error)
          // The payment creation logic below will handle it
        } else {
          // RSVP ID mismatch - shouldn't happen if token is valid
          return res.status(400).json({
            error: "rsvp_mismatch",
            message: "RSVP does not match waitlist link",
          });
        }
      }

      // For paid events, if RSVP exists but payment is unpaid/pending, allow proceeding to payment
      // OR if this is a waitlist upgrade (existingWaitlistRsvp exists and RSVP is WAITLIST)
      const isWaitlistUpgrade =
        existingWaitlistRsvp &&
        waitlistRsvpId &&
        waitlistToken &&
        result.rsvp?.bookingStatus === "WAITLIST";

      // Also handle PENDING_PAYMENT RSVPs (user started payment flow but didn't complete)
      const isPendingPaymentRsvp =
        result.rsvp?.bookingStatus === "PENDING_PAYMENT";

      if (
        !isVipFreeEntry &&
        result.event?.ticketType === "paid" &&
        result.event?.ticketPrice &&
        (isWaitlistUpgrade || // Waitlist upgrade - always allow if RSVP is WAITLIST
          isPendingPaymentRsvp || // User returning to complete payment
          (result.rsvp?.paymentStatus &&
            (result.rsvp.paymentStatus === "unpaid" ||
              result.rsvp.paymentStatus === "pending")))
      ) {
        // Check if payment already exists for this RSVP
        let existingPayment = null;
        if (result.rsvp.paymentId) {
          try {
            existingPayment = await findPaymentById(result.rsvp.paymentId);
          } catch (err) {
            console.error("Error finding existing payment:", err);
          }
        }

        // If existing payment is still pending, try to reuse its PaymentIntent
        if (existingPayment && existingPayment.status === "pending" && existingPayment.stripePaymentIntentId) {
          try {
            const Stripe = (await import("stripe")).default;
            const stripe = new Stripe(getStripeSecretKey());
            const existingPI = await stripe.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);

            // If the PaymentIntent is still usable, return it directly
            if (existingPI.status === "requires_payment_method" || existingPI.status === "requires_confirmation") {
              console.log("[Payment] Reusing existing PaymentIntent:", {
                paymentIntentId: existingPI.id,
                status: existingPI.status,
                rsvpId: result.rsvp.id,
              });

              return res.json({
                event: result.event,
                rsvp: result.rsvp,
                payment: existingPayment,
                stripe: {
                  clientSecret: existingPI.client_secret,
                  paymentId: existingPayment.id,
                },
                paymentBreakdown: {
                  ticketAmount: existingPayment.amount - Math.round(existingPayment.amount * (parseFloat(process.env.TEST_PLATFORM_FEE_PERCENTAGE || process.env.PLATFORM_FEE_PERCENTAGE || "3") / 100 / (1 + parseFloat(process.env.TEST_PLATFORM_FEE_PERCENTAGE || process.env.PLATFORM_FEE_PERCENTAGE || "3") / 100))),
                  platformFeeAmount: Math.round(existingPayment.amount * (parseFloat(process.env.TEST_PLATFORM_FEE_PERCENTAGE || process.env.PLATFORM_FEE_PERCENTAGE || "3") / 100 / (1 + parseFloat(process.env.TEST_PLATFORM_FEE_PERCENTAGE || process.env.PLATFORM_FEE_PERCENTAGE || "3") / 100))),
                  customerTotalAmount: existingPayment.amount,
                  platformFeePercentage: parseFloat(process.env.TEST_PLATFORM_FEE_PERCENTAGE || process.env.PLATFORM_FEE_PERCENTAGE || "3"),
                },
                statusDetails: {
                  bookingStatus: result.rsvp.bookingStatus,
                },
              });
            }
            // PaymentIntent is no longer usable (cancelled, succeeded, etc.) - create a new one
            console.log("[Payment] Existing PaymentIntent not reusable:", existingPI.status);
          } catch (piError) {
            console.warn("[Payment] Could not retrieve existing PaymentIntent:", piError.message);
            // Fall through to create a new one
          }
        }

        // If no payment exists or payment is failed/unusable, create new payment
        if (
          !existingPayment ||
          existingPayment.status === "pending" ||
          existingPayment.status === "failed"
        ) {
          try {
            // Load host profile to get connected account ID
            const hostProfile = await getUserProfile(result.event.hostId);
            const connectedAccountId =
              hostProfile?.stripeConnectedAccountId || null;

            console.log("[Waitlist Payment] Payment creation check:", {
              isWaitlistUpgrade,
              hasConnectedAccount: !!connectedAccountId,
              eventId: result.event?.id,
              eventTicketType: result.event?.ticketType,
              eventTicketPrice: result.event?.ticketPrice,
              rsvpId: result.rsvp?.id,
              rsvpBookingStatus: result.rsvp?.bookingStatus,
            });

            if (connectedAccountId) {
              // Get or create Stripe customer
              const customerId = await getOrCreateStripeCustomer(
                result.rsvp.email,
                result.rsvp.name
              );

              // Calculate amounts
              // For waitlist upgrades, ensure partySize is calculated correctly using DPCS
              // partySize = dinnerPartySize (includes booker) + plusOnes (cocktails-only) if dinner selected
              // partySize = 1 (booker) + plusOnes (cocktails-only) if no dinner
              let partySize = Number(result.rsvp.partySize) || 1;

              // Recalculate partySize using DPCS to ensure correctness
              const wantsDinner = result.rsvp.wantsDinner || false;
              // Handle null/undefined dinnerPartySize - convert to 0 if not a valid number
              const dinnerPartySize =
                result.rsvp.dinnerPartySize !== null &&
                result.rsvp.dinnerPartySize !== undefined
                  ? Number(result.rsvp.dinnerPartySize) || 0
                  : 0;
              const plusOnes = Number(result.rsvp.plusOnes) || 0;

              console.log("[Waitlist Payment] RSVP values:", {
                storedPartySize: result.rsvp.partySize,
                wantsDinner,
                dinnerPartySize,
                plusOnes,
                rawDinnerPartySize: result.rsvp.dinnerPartySize,
                rawPlusOnes: result.rsvp.plusOnes,
                rsvpId: result.rsvp.id,
                rsvpData: {
                  wantsDinner: result.rsvp.wantsDinner,
                  dinnerPartySize: result.rsvp.dinnerPartySize,
                  plusOnes: result.rsvp.plusOnes,
                  partySize: result.rsvp.partySize,
                },
              });

              if (wantsDinner && dinnerPartySize > 0) {
                // Dinner selected: partySize = dinnerPartySize (includes booker) + plusOnes
                partySize = dinnerPartySize + plusOnes;
              } else {
                // No dinner: partySize = 1 (booker) + plusOnes
                partySize = 1 + plusOnes;
              }

              const ticketPrice = Number(result.event.ticketPrice);
              if (!ticketPrice || ticketPrice <= 0) {
                throw new Error("Invalid ticket price");
              }
              const ticketAmount = ticketPrice * partySize;

              console.log("[Waitlist Payment] Price calculation:", {
                calculatedPartySize: partySize,
                ticketPrice,
                ticketAmount,
                platformFeePercentage:
                  parseFloat(
                    process.env.TEST_PLATFORM_FEE_PERCENTAGE ||
                      process.env.PLATFORM_FEE_PERCENTAGE ||
                      "3"
                  ) / 100,
              });

              const platformFeePercentage =
                parseFloat(
                  process.env.TEST_PLATFORM_FEE_PERCENTAGE ||
                    process.env.PLATFORM_FEE_PERCENTAGE ||
                    "3"
                ) / 100;
              const platformFeeAmount = Math.round(
                ticketAmount * platformFeePercentage
              );
              const customerTotalAmount = ticketAmount + platformFeeAmount;

              // Create PaymentIntent
              const currency = (
                result.event.ticketCurrency || "usd"
              ).toLowerCase();
              const paymentIntent = await createPaymentIntent({
                customerId,
                amount: customerTotalAmount,
                eventId: result.event.id,
                eventTitle: result.event.title,
                personId: result.rsvp.personId,
                connectedAccountId,
                applicationFeeAmount: platformFeeAmount,
                currency,
              });

              // Create or update payment record
              let payment;
              if (existingPayment) {
                // Update existing payment
                const updateResult = await updatePayment(existingPayment.id, {
                  stripePaymentIntentId: paymentIntent.id,
                  status: "pending",
                });
                payment = updateResult.payment;
              } else {
                // Create new payment for waitlist upgrade
                // Mark in description that this is a waitlist upgrade
                console.log(
                  "[Waitlist Payment] Creating payment for waitlist RSVP:",
                  {
                    rsvpId: result.rsvp.id,
                    rsvpBookingStatus: result.rsvp.bookingStatus,
                    isWaitlistUpgrade: !!existingWaitlistRsvp,
                  }
                );

                payment = await createPayment({
                  userId: result.event.hostId,
                  eventId: result.event.id,
                  rsvpId: result.rsvp.id, // CRITICAL: Link payment to waitlist RSVP
                  stripePaymentIntentId: paymentIntent.id,
                  stripeCustomerId: customerId,
                  amount: customerTotalAmount,
                  currency,
                  status: "pending",
                  description: `Ticket${
                    partySize > 1 ? `s (${partySize}x)` : ""
                  } for ${result.event.title} (Waitlist Upgrade)`,
                });
              }

              // Update RSVP with payment ID
              await updateRsvp(result.rsvp.id, {
                paymentId: payment.id,
                paymentStatus: "pending",
              });

              return res.json({
                event: result.event,
                rsvp: {
                  ...result.rsvp,
                  paymentId: payment.id,
                  paymentStatus: "pending",
                },
                payment,
                stripe: {
                  clientSecret: paymentIntent.client_secret,
                  paymentId: payment.id,
                },
                paymentBreakdown: {
                  ticketAmount,
                  platformFeeAmount,
                  customerTotalAmount,
                  platformFeePercentage: platformFeePercentage * 100,
                },
                statusDetails: {
                  bookingStatus:
                    result.rsvp.bookingStatus ||
                    result.rsvp.status === "attending"
                      ? "CONFIRMED"
                      : "WAITLIST",
                  dinnerBookingStatus:
                    result.rsvp.dinner?.bookingStatus ||
                    (result.rsvp.dinnerStatus === "confirmed"
                      ? "CONFIRMED"
                      : result.rsvp.dinnerStatus === "waitlist"
                      ? "WAITLIST"
                      : null),
                  wantsDinner:
                    result.rsvp.dinner?.enabled || result.rsvp.wantsDinner,
                },
              });
            } else {
              // No connected account - this shouldn't happen for paid events
              console.error("[Waitlist Payment] No Stripe connected account:", {
                eventId: result.event?.id,
                hostId: result.event?.hostId,
                isWaitlistUpgrade,
                eventTicketType: result.event?.ticketType,
                eventTicketPrice: result.event?.ticketPrice,
              });

              // For waitlist upgrades, return a specific error
              if (isWaitlistUpgrade) {
                return res.status(400).json({
                  error: "waitlist_upgrade_failed",
                  message:
                    "Event host has not connected their Stripe account. Please contact the event organizer.",
                  rsvp: result.rsvp,
                });
              }
              // For normal duplicates, fall through to duplicate error
            }
          } catch (paymentError) {
            console.error(
              "Error creating payment for existing RSVP:",
              paymentError
            );

            // For waitlist upgrades, return specific error instead of generic duplicate
            if (isWaitlistUpgrade) {
              return res.status(400).json({
                error: "waitlist_upgrade_failed",
                message: `Unable to create payment: ${paymentError.message}`,
                rsvp: result.rsvp,
              });
            }
            // Fall through to return duplicate error if payment creation fails
          }
        } else {
          // Payment already exists and is succeeded - for waitlist upgrades, this is an error
          if (isWaitlistUpgrade) {
            return res.status(400).json({
              error: "payment_already_succeeded",
              message:
                "Payment for this waitlist upgrade has already been completed.",
              rsvp: result.rsvp,
              payment: existingPayment,
            });
          }
        }
      } else {
        // Not a paid event or conditions not met
        console.log("[Waitlist Payment] Payment conditions not met:", {
          isWaitlistUpgrade,
          eventTicketType: result.event?.ticketType,
          eventTicketPrice: result.event?.ticketPrice,
          rsvpPaymentStatus: result.rsvp?.paymentStatus,
        });

        // For waitlist upgrades, this shouldn't happen - event should be paid
        if (isWaitlistUpgrade) {
          return res.status(400).json({
            error: "waitlist_upgrade_failed",
            message:
              "This event is not configured for payments. Please contact support.",
            rsvp: result.rsvp,
          });
        }
      }

      // Return duplicate error for free events or if payment creation failed
      // BUT: If this is a waitlist upgrade, don't return duplicate error - we should have handled it above
      if (existingWaitlistRsvp && waitlistRsvpId && waitlistToken) {
        // This shouldn't happen if logic above is correct, but handle it gracefully
        return res.status(400).json({
          error: "waitlist_upgrade_failed",
          message:
            "Unable to process waitlist upgrade. Please contact support.",
          rsvp: result.rsvp,
        });
      }

      return res.status(409).json({
        error: "duplicate",
        message: "You've already RSVP'd to this event",
        status: result.rsvp.status,
        rsvp: result.rsvp,
      });
    }

    if (result.error === "full") {
      return res.status(409).json({
        error: "full",
        event: result.event,
      });
    }

    if (result.error === "capacity_exceeded") {
      return res.status(409).json({
        error: "capacity_exceeded",
        event: result.event,
      });
    }

    if (result.error === "invalid_slot") {
      return res.status(400).json({
        error: "invalid_slot",
        message: result.message || "Invalid dinner time slot",
      });
    }

    if (result.error === "database_error") {
      return res.status(500).json({
        error: "database_error",
        message: result.message || "Failed to create RSVP",
      });
    }

    // If this is a paid event and the host has a connected Stripe account,
    // automatically create a PaymentIntent + payment record for this RSVP.
    // BUT: Skip payment creation if RSVP is on waitlist (they'll pay later via waitlist link)
    let stripePayment = null;
    let stripeClientSecret = null;

    // Check if RSVP is on waitlist
    const isWaitlistRsvp =
      result.rsvp.bookingStatus === "WAITLIST" ||
      result.rsvp.status === "waitlist";

    try {
      if (
        !isVipFreeEntry &&
        result.event?.ticketType === "paid" &&
        result.event?.ticketPrice &&
        result.event?.hostId &&
        !isWaitlistRsvp // Only create payment if NOT on waitlist
      ) {
        // Load host profile to get connected account ID
        const hostProfile = await getUserProfile(result.event.hostId);
        const connectedAccountId =
          hostProfile?.stripeConnectedAccountId || null;

        if (connectedAccountId) {
          // Get or create Stripe customer based on RSVP email
          const customerId = await getOrCreateStripeCustomer(
            result.rsvp.email,
            result.rsvp.name
          );

          // Calculate ticket amount (what host receives): ticket price per person * party size
          // Use DPCS to ensure correct party size calculation
          let partySize = Number(result.rsvp.partySize) || 1;

          // Recalculate partySize using DPCS to ensure correctness
          const wantsDinner = result.rsvp.wantsDinner || false;
          // Handle null/undefined dinnerPartySize - convert to 0 if not a valid number
          const dinnerPartySize =
            result.rsvp.dinnerPartySize !== null &&
            result.rsvp.dinnerPartySize !== undefined
              ? Number(result.rsvp.dinnerPartySize) || 0
              : 0;
          const plusOnes = Number(result.rsvp.plusOnes) || 0;

          console.log("[Payment] RSVP values:", {
            storedPartySize: result.rsvp.partySize,
            wantsDinner,
            dinnerPartySize,
            plusOnes,
            rawDinnerPartySize: result.rsvp.dinnerPartySize,
            rawPlusOnes: result.rsvp.plusOnes,
            rsvpId: result.rsvp.id,
            rsvpData: {
              wantsDinner: result.rsvp.wantsDinner,
              dinnerPartySize: result.rsvp.dinnerPartySize,
              plusOnes: result.rsvp.plusOnes,
              partySize: result.rsvp.partySize,
            },
          });

          if (wantsDinner && dinnerPartySize > 0) {
            // Dinner selected: partySize = dinnerPartySize (includes booker) + plusOnes
            partySize = dinnerPartySize + plusOnes;
          } else {
            // No dinner: partySize = 1 (booker) + plusOnes
            partySize = 1 + plusOnes;
          }

          const ticketPrice = Number(result.event.ticketPrice);
          if (!ticketPrice || ticketPrice <= 0) {
            throw new Error("Invalid ticket price");
          }
          const ticketAmount = ticketPrice * partySize;

          console.log("[Payment] Price calculation:", {
            calculatedPartySize: partySize,
            ticketPrice,
            ticketAmount,
          });

          // Calculate platform service fee (paid by customer, not deducted from host)
          // Platform fee percentage from environment variable (default: 3%)
          // In development, prefer TEST_ prefixed, fallback to regular
          const platformFeePercentage =
            parseFloat(
              process.env.TEST_PLATFORM_FEE_PERCENTAGE ||
                process.env.PLATFORM_FEE_PERCENTAGE ||
                "3"
            ) / 100;
          const platformFeeAmount = Math.round(
            ticketAmount * platformFeePercentage
          );

          // Customer pays: ticket amount + platform service fee
          const customerTotalAmount = ticketAmount + platformFeeAmount;

          console.log("[Payment] Platform fee calculation:", {
            ticketAmount,
            platformFeePercentage: `${(platformFeePercentage * 100).toFixed(
              1
            )}%`,
            platformFeeAmount,
            customerTotalAmount,
            amountToHost: ticketAmount, // Host receives full ticket amount
          });

          // Create PaymentIntent routed to host's connected account
          const currency = (result.event.ticketCurrency || "usd").toLowerCase();
          const paymentIntent = await createPaymentIntent({
            customerId,
            amount: customerTotalAmount, // Customer pays ticket + service fee
            eventId: result.event.id,
            eventTitle: result.event.title,
            personId: result.rsvp.personId,
            connectedAccountId,
            applicationFeeAmount: platformFeeAmount, // Platform fee (customer pays this)
            currency,
          });

          // Persist payment record in Supabase and link to RSVP
          // Store customer total amount (what they pay)
          const payment = await createPayment({
            // Payments are owned by the host (auth user),
            // attendees are linked via rsvpId.
            userId: result.event.hostId,
            eventId: result.event.id,
            rsvpId: result.rsvp.id,
            stripePaymentIntentId: paymentIntent.id,
            stripeCustomerId: customerId,
            amount: customerTotalAmount, // Customer pays: ticket + service fee
            currency: (result.event.ticketCurrency || "usd").toLowerCase(),
            status: "pending",
            description: `Ticket${
              partySize > 1 ? `s (${partySize}x)` : ""
            } for ${result.event.title}`,
          });

          stripePayment = payment;
          stripeClientSecret = paymentIntent.client_secret;

          // Include fee breakdown in response for frontend display
          result.paymentBreakdown = {
            ticketAmount,
            platformFeeAmount,
            customerTotalAmount,
            platformFeePercentage: platformFeePercentage * 100,
          };
        }
      }
    } catch (paymentError) {
      console.error("Error creating Stripe payment for RSVP:", paymentError);

      // For paid events, payment creation failure should block the RSVP
      // BUT: If RSVP is on waitlist, don't block (they'll pay later via waitlist link)
      if (
        result.event.ticketType === "paid" &&
        result.event.ticketPrice > 0 &&
        !isWaitlistRsvp
      ) {
        // Rollback: delete the RSVP that was created
        try {
          await deleteRsvp(result.rsvp.id);
        } catch (deleteError) {
          console.error(
            "Error deleting RSVP after payment failure:",
            deleteError
          );
        }

        // Return error to frontend
        return res.status(500).json({
          error: "payment_failed",
          message:
            paymentError.message ||
            "Failed to create payment. Please try again.",
          details: paymentError.raw?.message || paymentError.message,
        });
      }

      // For free events, don't block the RSVP on payment issues
      // (This shouldn't happen for free events, but just in case)
    }

    // Send confirmation email — but NOT for paid events with pending payment.
    // For paid events, the confirmation email is sent from the webhook
    // handler once payment_intent.succeeded fires.
    const isPendingPayment =
      result.rsvp.bookingStatus === "PENDING_PAYMENT" ||
      (stripeClientSecret && stripePayment);

    // Fetch host branding for email footers
    let hostBrand = {};
    try {
      const hostProfile = await getUserProfile(result.event.hostId);
      hostBrand = {
        brandName: hostProfile?.brand || "",
        brandWebsite: hostProfile?.brandWebsite || "",
        contactEmail: hostProfile?.contactEmail || "",
      };
    } catch {}

    if (!isPendingPayment) {
      try {
        const isWaitlistEmail =
          result.rsvp.bookingStatus === "WAITLIST" ||
          result.rsvp.status === "waitlist";

        await sendEmail({
          to: result.rsvp.email,
          subject: isWaitlistEmail
            ? "You’re on the waitlist"
            : "Your spot is confirmed",
          html: signupConfirmationEmail({
            name: result.rsvp.name || name,
            eventTitle: result.event.title,
            date: new Date(result.event.startsAt).toLocaleString(),
            isWaitlist: isWaitlistEmail,
            imageUrl: result.event.coverImageUrl || result.event.imageUrl || "",
            location: result.event.location || "",
            startsAt: result.event.startsAt || "",
            endsAt: result.event.endsAt || "",
            timezone: result.event.timezone || "",
            plusOnes: Number(result.rsvp.plusOnes) || 0,
            slug: result.event.slug || "",
            frontendUrl: getFrontendUrl(),
            spotifyUrl: result.event.spotify || "",
            ticketPrice: result.event.ticketPrice ? (Number(result.event.ticketPrice) / 100).toFixed(2) : 0,
            ticketCurrency: result.event.ticketCurrency || "",
            hideDate: result.event.hideDate || false,
            hideLocation: result.event.hideLocation || false,
            dateRevealHint: result.event.dateRevealHint || "",
            revealHint: result.event.revealHint || "",
            ...hostBrand,
          }),
        });
      } catch (emailErr) {
        logger?.error?.("Failed to send signup confirmation email", {
          error: emailErr?.message,
          rsvpId: result.rsvp.id,
        });
        // Don’t block the RSVP on email failure
      }
    } else {
      // Send reservation email for paid events with pending payment
      try {
        await sendEmail({
          to: result.rsvp.email,
          subject: "Your spot is reserved",
          html: reservationEmail({
            name: result.rsvp.name || name,
            eventTitle: result.event.title,
            imageUrl: result.event.coverImageUrl || result.event.imageUrl || "",
            location: result.event.location || "",
            startsAt: result.event.startsAt || "",
            endsAt: result.event.endsAt || "",
            timezone: result.event.timezone || "",
            plusOnes: Number(result.rsvp.plusOnes) || 0,
            slug: result.event.slug || "",
            frontendUrl: getFrontendUrl(),
            holdMinutes: 30,
            hideDate: result.event.hideDate || false,
            hideLocation: result.event.hideLocation || false,
            dateRevealHint: result.event.dateRevealHint || "",
            revealHint: result.event.revealHint || "",
            ...hostBrand,
          }),
        });
      } catch (emailErr) {
        logger?.error?.("Failed to send reservation email", {
          error: emailErr?.message,
          rsvpId: result.rsvp.id,
        });
      }
    }

    // If user opted in to marketing, upsert into newsletter_subscriptions
    // AND mirror the consent flag onto people.marketing_consent so the
    // admin email audience ("Opted in only") sees them. The terms/privacy
    // checkbox on the RSVP form is treated as marketing opt-in for
    // PullUp's purposes — every guest who RSVP'd has explicitly agreed.
    if (marketingOptIn === true && result.rsvp?.email) {
      try {
        const { supabase } = await import("./supabase.js");
        const rsvpEmail = result.rsvp.email.trim().toLowerCase();
        const rsvpNow = new Date().toISOString();
        const unsubToken = generateUnsubscribeToken();

        await supabase
          .from("newsletter_subscriptions")
          .upsert(
            {
              email: rsvpEmail,
              status: "confirmed",
              source: "rsvp_opt_in",
              confirmed_at: rsvpNow,
              created_at: rsvpNow,
              updated_at: rsvpNow,
              unsubscribe_token: unsubToken,
              consent_given: true,
              consent_at: rsvpNow,
            },
            { onConflict: "email" }
          );

        // Set marketing_consent on the master people row(s) — only when not
        // already set, so we don't overwrite an admin-set false.
        await supabase
          .from("people")
          .update({
            marketing_consent: true,
            marketing_consent_at: rsvpNow,
          })
          .eq("email", rsvpEmail)
          .is("marketing_consent", null);
        await supabase
          .from("people")
          .update({
            marketing_consent: true,
            marketing_consent_at: rsvpNow,
          })
          .eq("email", rsvpEmail)
          .eq("marketing_consent", false);
      } catch (nlErr) {
        console.error("[rsvp] Failed to upsert newsletter subscription:", nlErr);
        // Don't block the RSVP on newsletter failure
      }
    }

    // Return detailed RSVP information including status details
    res.status(201).json({
      event: result.event,
      rsvp: result.rsvp,
      payment: stripePayment,
      paymentBreakdown: result.paymentBreakdown || null, // Fee breakdown for frontend display
      stripe:
        stripeClientSecret && stripePayment
          ? {
              clientSecret: stripeClientSecret,
              paymentId: stripePayment.id,
            }
          : null,
      statusDetails: {
        bookingStatus:
          result.rsvp.bookingStatus ||
          (result.rsvp.status === "attending" ? "CONFIRMED" : "WAITLIST"), // "CONFIRMED" | "WAITLIST"
        dinnerBookingStatus:
          result.rsvp.dinner?.bookingStatus ||
          (result.rsvp.dinnerStatus === "confirmed"
            ? "CONFIRMED"
            : result.rsvp.dinnerStatus === "waitlist"
            ? "WAITLIST"
            : null), // "CONFIRMED" | "WAITLIST" | null
        wantsDinner: result.rsvp.dinner?.enabled || result.rsvp.wantsDinner,
        // Backward compatibility
        cocktailStatus: result.rsvp.status,
        dinnerStatus: result.rsvp.dinnerStatus,
      },
    });
  } catch (error) {
    console.error("Error creating RSVP:", error);
    res.status(500).json({ error: "Failed to create RSVP" });
  }
});

// ---------------------------
// PROTECTED: Get single event by id or slug (requires auth, verifies ownership)
// ---------------------------
app.get("/host/events/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Try to find by ID first (UUID format)
    let event = await findEventById(id);

    // If not found by ID, try to find by slug
    if (!event) {
      event = await findEventBySlug(id);
    }

    if (!event) return res.status(404).json({ error: "Event not found" });

    // Verify access (any host role)
    const { isHost } = await isUserEventHost(req.user.id, event.id);
    if (!isHost) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    const myRole = await getEventHostRole(req.user.id, event.id);
    res.json({ ...event, myRole });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

// ---------------------------
// PROTECTED: Manage event hosts (arrangers)
// ---------------------------

// Build full host list for an event: owner first (from events.host_id), then event_hosts. Owner is never removable.
async function getHostsForEvent(event) {
  const { supabase } = await import("./supabase.js");

  async function enrichHost(userId, role, createdAt = null) {
    try {
      const profile = await getUserProfile(userId);
      let email = null;
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.admin.getUserById(userId);
        if (!userError && user) {
          email = user.email || null;
        } else if (userError) {
          console.error("Error fetching auth user for host:", userId, userError);
        }
      } catch (authErr) {
        console.error("Unexpected error fetching auth user for host:", userId, authErr);
      }
      return {
        userId,
        email,
        role: role || "co_host",
        createdAt,
        profile,
      };
    } catch (err) {
      console.error("Error fetching profile for host:", userId, err);
      return {
        userId,
        email: null,
        role: role || "co_host",
        createdAt,
        profile: null,
      };
    }
  }

  const hosts = [];

  if (event.hostId) {
    const ownerHost = await enrichHost(event.hostId, "owner", null);
    hosts.push(ownerHost);
  }

  const { data: hostRows, error } = await supabase
    .from("event_hosts")
    .select("id, event_id, user_id, role, created_at")
    .eq("event_id", event.id)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "PGRST205") return hosts; // table missing
    throw error;
  }

  for (const row of hostRows || []) {
    if (row.user_id === event.hostId) continue;
    const enriched = await enrichHost(row.user_id, row.role, row.created_at);
    hosts.push(enriched);
  }

  return hosts;
}

// List hosts for an event
app.get("/host/events/:id/hosts", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const event = await findEventById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const { isHost } = await isUserEventHost(req.user.id, event.id);
    if (!isHost) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    const hosts = await getHostsForEvent(event);
    const pendingInvitations = await getPendingInvitationsForEvent(event.id).catch(() => []);
    res.json({ hosts, pendingInvitations });
  } catch (error) {
    console.error("Error listing event hosts:", error);
    if (error.code === "PGRST205") {
      return res.json({ hosts: [] });
    }
    res.status(500).json({ error: "Failed to list event hosts" });
  }
});

// Add a host to an event (owner or admin).
// If the email has an account: add to event_hosts and send "added" email.
// If not: create pending invitation and send "invited" email (they'll see the event when they sign up).
app.post("/host/events/:id/hosts", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId: rawUserId, email, role = "editor" } = req.body || {};

    const event = await findEventById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const { isHost } = await isUserEventHost(req.user.id, event.id);
    if (!isHost || !(await canManageHosts(req.user.id, event.id))) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only the event owner or admin can add hosts",
      });
    }

    const allowedRoles = [
      HOST_ROLES.ADMIN,
      HOST_ROLES.EDITOR,
      HOST_ROLES.RECEPTION,
      HOST_ROLES.ANALYTICS,
      HOST_ROLES.VIEWER,
    ];
    const roleToInsert =
      role && allowedRoles.includes(role) ? role : HOST_ROLES.EDITOR;

    let userId = rawUserId;

    if (!userId && email) {
      const normalizedEmail = String(email).trim().toLowerCase();

      try {
        const { supabase } = await import("./supabase.js");

        const {
          data: { users },
          error: authError,
        } = await supabase.auth.admin.listUsers();

        if (authError) {
          console.error("Error listing auth users:", authError);
        } else if (users && users.length > 0) {
          const matchingUser = users.find(
            (u) => u.email?.toLowerCase() === normalizedEmail
          );
          if (matchingUser?.id) userId = matchingUser.id;
        }

        if (!userId) {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("id, additional_emails")
            .contains("additional_emails", [normalizedEmail])
            .maybeSingle();

          if (!profileError && profile?.id) userId = profile.id;
        }
      } catch (lookupError) {
        console.error("Error looking up user by email:", lookupError);
        return res.status(500).json({
          error: "user_lookup_failed",
          message: "Failed to look up user by email",
        });
      }
    }

    if (userId) {
      // User exists: add to event_hosts and send "added" email
      const { supabase } = await import("./supabase.js");
      const { error } = await supabase.from("event_hosts").insert({
        event_id: event.id,
        user_id: userId,
        role: roleToInsert,
      });

      if (error) {
        if (error.code === "23505") {
          return res.status(400).json({
            error: "already_host",
            message: "This user is already an arranger for this event",
          });
        }
        if (error.code === "PGRST205") {
          return res.status(400).json({
            error: "hosts_not_enabled",
            message:
              "Hosts feature is not enabled in this environment yet (missing event_hosts table).",
          });
        }
        console.error("Error adding event host:", error);
        return res.status(500).json({ error: "Failed to add event host" });
      }

      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.admin.getUserById(userId);
        const toEmail = authUser?.email;
        if (toEmail) {
          await sendEmail({
            to: toEmail,
            subject: `You've been added as ${roleToInsert} to "${event.title}"`,
            html: coHostAddedEmailHtml({
              eventTitle: event.title,
              role: roleToInsert,
              imageUrl: event.coverImageUrl || event.imageUrl || "",
              slug: event.slug || "",
            }),
            text: coHostAddedEmailBody({
              eventTitle: event.title,
              role: roleToInsert,
            }),
          });
        }
      } catch (emailErr) {
        console.error("Failed to send co-host added email:", emailErr.message);
      }

      const hosts = await getHostsForEvent(event);
      const pendingInvitations = await getPendingInvitationsForEvent(event.id).catch(() => []);
      return res.status(201).json({ hosts, pendingInvitations });
    }

    // No account yet: create pending invitation and send "invited" email
    if (!email) {
      return res.status(400).json({
        error: "email_required",
        message: "Email is required to invite someone who doesn't have an account yet",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    try {
      await createEventHostInvitation({
        eventId: event.id,
        email: normalizedEmail,
        role: roleToInsert,
        invitedByUserId: req.user.id,
      });
    } catch (invErr) {
      if (invErr.code === "23505") {
        return res.status(400).json({
          error: "already_invited",
          message: "This email has already been invited to this event",
        });
      }
      console.error("Error creating invitation:", invErr);
      return res.status(500).json({ error: "Failed to create invitation" });
    }

    try {
      await sendEmail({
        to: normalizedEmail,
        subject: `You're invited to co-host "${event.title}"`,
        html: coHostInvitedEmailHtml({
          eventTitle: event.title,
          role: roleToInsert,
          imageUrl: event.coverImageUrl || event.imageUrl || "",
          slug: event.slug || "",
        }),
        text: coHostInvitedEmailBody({
          eventTitle: event.title,
          role: roleToInsert,
        }),
      });
    } catch (emailErr) {
      console.error("Failed to send co-host invitation email:", emailErr.message);
    }

    const hosts = await getHostsForEvent(event);
    const pendingInvitations = await getPendingInvitationsForEvent(event.id).catch(() => []);
    return res.status(201).json({ hosts, pendingInvitations });
  } catch (error) {
    console.error("Error adding event host:", error);
    res.status(500).json({ error: "Failed to add event host" });
  }
});

// Revoke a pending co-host invitation (owner or admin)
app.delete(
  "/host/events/:eventId/invitations/:email",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, email } = req.params;
      const normalizedEmail = decodeURIComponent(email).trim().toLowerCase();

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost || !(await canManageHosts(req.user.id, event.id))) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Only the event owner or admin can revoke invitations",
        });
      }

      const { supabase } = await import("./supabase.js");
      const { error } = await supabase
        .from("event_host_invitations")
        .delete()
        .eq("event_id", event.id)
        .eq("email", normalizedEmail)
        .eq("status", "pending");

      if (error) {
        if (error.code === "PGRST205") return res.status(404).json({ error: "Not found" });
        return res.status(500).json({ error: "Failed to revoke invitation" });
      }

      const hosts = await getHostsForEvent(event);
      const pendingInvitations = await getPendingInvitationsForEvent(event.id).catch(() => []);
      return res.json({ hosts, pendingInvitations });
    } catch (err) {
      console.error("Error revoking invitation:", err);
      res.status(500).json({ error: "Failed to revoke invitation" });
    }
  }
);

// Remove a host from an event (owner only)
app.delete(
  "/host/events/:eventId/hosts/:userId",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, userId } = req.params;

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const { isHost, role: currentRole } = await isUserEventHost(
        req.user.id,
        event.id
      );
      if (!isHost || !(await canManageHosts(req.user.id, event.id))) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Only the event owner or admin can remove hosts",
        });
      }

      const { supabase } = await import("./supabase.js");
      const { error } = await supabase
        .from("event_hosts")
        .delete()
        .eq("event_id", event.id)
        .eq("user_id", userId);

      if (error) {
        console.error("Error deleting event host:", error);
        return res.status(500).json({ error: "Failed to delete event host" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting event host:", error);
      res.status(500).json({ error: "Failed to delete event host" });
    }
  }
);

// Update a host's role (owner or admin only). Only non-owner hosts can be updated.
app.patch(
  "/host/events/:eventId/hosts/:userId",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, userId } = req.params;
      const { role } = req.body || {};

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost || !(await canManageHosts(req.user.id, event.id))) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Only the event owner or admin can update host roles",
        });
      }

      const allowedRoles = [
        HOST_ROLES.ADMIN,
        HOST_ROLES.EDITOR,
        HOST_ROLES.RECEPTION,
        HOST_ROLES.ANALYTICS,
        HOST_ROLES.VIEWER,
      ];
      if (!role || !allowedRoles.includes(role)) {
        return res.status(400).json({
          error: "Invalid role",
          message: "Role must be one of: admin, editor, reception, analytics, viewer",
        });
      }

      // Cannot change owner's role (owner is from events.host_id, not in event_hosts for this event's owner)
      if (event.hostId === userId) {
        return res.status(400).json({
          error: "Cannot change owner role",
          message: "Event owner role cannot be changed",
        });
      }

      const { supabase } = await import("./supabase.js");
      const { data, error } = await supabase
        .from("event_hosts")
        .update({ role })
        .eq("event_id", event.id)
        .eq("user_id", userId)
        .select()
        .maybeSingle();

      if (error) {
        console.error("Error updating event host role:", error);
        return res.status(500).json({ error: "Failed to update host role" });
      }
      if (!data) {
        return res.status(404).json({
          error: "Host not found",
          message: "No host record found for this user on this event",
        });
      }

      const hosts = await getHostsForEvent(event);
      res.json({ hosts });
    } catch (error) {
      console.error("Error updating event host role:", error);
      res.status(500).json({ error: "Failed to update host role" });
    }
  }
);
// ---------------------------
app.post(
  "/host/events/:eventId/waitlist-link/:rsvpId",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, rsvpId } = req.params;

      // Verify host owns event
      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Verify RSVP exists and is WAITLIST
      const rsvp = await findRsvpById(rsvpId);
      if (!rsvp) {
        return res.status(404).json({ error: "RSVP not found" });
      }

      if (rsvp.bookingStatus !== "WAITLIST") {
        return res.status(400).json({
          error: "RSVP is not on waitlist",
          message: "Only waitlisted RSVPs can have links generated",
        });
      }

      const isFreeEvent = event.ticketType !== "paid" || !event.ticketPrice;

      // Verify RSVP belongs to this event
      if (rsvp.eventId !== eventId) {
        return res.status(400).json({
          error: "RSVP mismatch",
          message: "RSVP does not belong to this event",
        });
      }

      // Get person email
      const person = await findPersonById(rsvp.personId);
      if (!person || !person.email) {
        return res.status(400).json({
          error: "Person email not found",
          message: "Cannot generate link without email address",
        });
      }

      const frontendUrl = getFrontendUrl();

      // Fetch host branding for email footers
      let hostBrand = {};
      try {
        const hostProfile = await getUserProfile(event.hostId);
        hostBrand = {
          brandName: hostProfile?.brand || "",
          brandWebsite: hostProfile?.brandWebsite || "",
          contactEmail: hostProfile?.contactEmail || "",
        };
      } catch {}

      // FREE EVENTS: Immediately confirm the guest (no payment needed)
      if (isFreeEvent) {
        await updateRsvp(rsvpId, {
          bookingStatus: "CONFIRMED",
          status: "attending",
        }, { forceConfirm: true });

        // Send confirmation email
        try {
          await sendEmail({
            to: person.email,
            subject: "Your spot is confirmed",
            html: signupConfirmationEmail({
              name: rsvp.name || person.name || "there",
              eventTitle: event.title,
              date: event.startsAt ? new Date(event.startsAt).toLocaleString() : "",
              isWaitlist: false,
              imageUrl: event.coverImageUrl || event.imageUrl || "",
              location: event.location || "",
              startsAt: event.startsAt || "",
              endsAt: event.endsAt || "",
              timezone: event.timezone || "",
              plusOnes: Number(rsvp.plusOnes) || 0,
              slug: event.slug || "",
              frontendUrl,
              spotifyUrl: event.spotify || "",
              hideDate: event.hideDate || false,
              hideLocation: event.hideLocation || false,
              dateRevealHint: event.dateRevealHint || "",
              revealHint: event.revealHint || "",
              ...hostBrand,
            }),
          });
        } catch (emailErr) {
          console.error("Failed to send confirmation email:", emailErr);
        }

        return res.json({
          link: null,
          token: null,
          expiresAt: null,
          email: person.email,
          isFreeEvent: true,
          promoted: true,
          emailSent: true,
        });
      }

      // PAID EVENTS: Generate payment link for the guest
      // Host can set custom expiry (in minutes), otherwise smart default
      const { expiresInMinutes: customMinutes } = req.body || {};
      let expiresAt;
      if (customMinutes && Number(customMinutes) > 0) {
        expiresAt = new Date(Date.now() + Number(customMinutes) * 60 * 1000);
      } else {
        // Smart default based on time until event
        const now = Date.now();
        const eventStart = event.startsAt ? new Date(event.startsAt).getTime() : null;
        const minutesUntilEvent = eventStart ? (eventStart - now) / (60 * 1000) : null;

        if (minutesUntilEvent === null || minutesUntilEvent > 24 * 60) {
          // No start time or > 24h away: 6 hours
          expiresAt = new Date(now + 6 * 60 * 60 * 1000);
        } else if (minutesUntilEvent > 6 * 60) {
          // 6-24h away: 2h before event
          expiresAt = new Date(eventStart - 2 * 60 * 60 * 1000);
        } else if (minutesUntilEvent > 2 * 60) {
          // 2-6h away: 1h before event
          expiresAt = new Date(eventStart - 1 * 60 * 60 * 1000);
        } else {
          // < 2h away or already started: 30 minutes (urgent)
          expiresAt = new Date(now + 30 * 60 * 1000);
        }
      }
      const token = generateWaitlistToken({
        type: "waitlist_offer",
        eventId: event.id,
        rsvpId: rsvp.id,
        email: person.email.toLowerCase(),
        expiresAt: expiresAt.toISOString(),
        rsvpDetails: {
          name: rsvp.name || person.name || null,
          email: person.email.toLowerCase(),
          plusOnes: rsvp.plusOnes || 0,
          partySize: rsvp.partySize || 1,
          wantsDinner: rsvp.wantsDinner || false,
          dinnerTimeSlot: rsvp.dinnerTimeSlot || null,
          dinnerPartySize: rsvp.dinnerPartySize || null,
        },
      });

      // Update RSVP with link generation timestamp
      await updateRsvp(rsvpId, {
        waitlistLinkGeneratedAt: new Date().toISOString(),
        waitlistLinkExpiresAt: expiresAt.toISOString(),
        waitlistLinkToken: token,
      });

      const link = `${frontendUrl}/e/${event.slug}?wl=${token}`;

      // Send waitlist offer email with payment link
      try {
        await sendEmail({
          to: person.email,
          subject: "A spot has opened up!",
          html: waitlistOfferEmail({
            name: rsvp.name || person.name || "there",
            eventTitle: event.title,
            imageUrl: event.coverImageUrl || event.imageUrl || "",
            location: event.location || "",
            startsAt: event.startsAt || "",
            endsAt: event.endsAt || "",
            timezone: event.timezone || "",
            plusOnes: Number(rsvp.plusOnes) || 0,
            slug: event.slug || "",
            frontendUrl,
            offerLink: link,
            isPaidEvent: true,
            expiresInMinutes: Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / (60 * 1000))),
            hideDate: event.hideDate || false,
            hideLocation: event.hideLocation || false,
            dateRevealHint: event.dateRevealHint || "",
            revealHint: event.revealHint || "",
            ...hostBrand,
          }),
        });
      } catch (emailErr) {
        console.error("Failed to send waitlist offer email:", emailErr);
      }

      return res.json({
        link,
        token,
        expiresAt: expiresAt.toISOString(),
        email: person.email,
        isFreeEvent: false,
        emailSent: true,
      });
    } catch (error) {
      console.error("Error generating waitlist link:", error);
      res.status(500).json({
        error: "Failed to generate waitlist link",
        message: error.message,
      });
    }
  }
);

// ---------------------------
// PROTECTED: Create VIP invite (requires auth, verifies ownership)
// ---------------------------
app.post(
  "/host/events/:eventId/vip-invites",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId } = req.params;
      const {
        email,
        maxGuests = 1,
        freeEntry = false,
        discountPercent = null,
      } = req.body || {};

      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Valid email is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ error: "Valid email is required" });
      }

      const maxGuestsInt =
        typeof maxGuests === "number"
          ? Math.max(1, Math.floor(maxGuests))
          : 1;

      // Verify event exists
      const event = await findEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Verify user is a host for this event
      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const eventIsPaid =
        event.ticketType === "paid" && event.ticketPrice && event.ticketPrice > 0;
      const effectiveFreeEntry = eventIsPaid && !!freeEntry;

      // Compute expiration: default to event start time; fallback to +48h from now
      let expiresAt = null;
      if (event.startsAt) {
        const start = new Date(event.startsAt);
        if (!isNaN(start.getTime())) {
          expiresAt = start;
        }
      }
      if (!expiresAt) {
        expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      }

      // Create invite record (without token first)
      const invite = await createVipInvite({
        eventId: event.id,
        email: normalizedEmail,
        maxGuests: maxGuestsInt,
        freeEntry: effectiveFreeEntry,
        discountPercent:
          typeof discountPercent === "number" ? discountPercent : null,
        expiresAt: expiresAt.toISOString(),
        token: null,
      });

      // Generate signed token
      const token = generateWaitlistToken({
        type: "vip_invite",
        inviteId: invite.id,
        eventId: event.id,
        email: normalizedEmail,
        maxGuests: maxGuestsInt,
        freeEntry: effectiveFreeEntry,
        discountPercent:
          typeof discountPercent === "number" ? discountPercent : null,
        expiresAt: expiresAt.toISOString(),
      });

      // Store token on invite (best-effort)
      await updateVipInvite(invite.id, { token });

      const frontendUrl = getFrontendUrl();
      const link = `${frontendUrl}/e/${event.slug}?vip=${token}`;

      // Load host profile for contact info
      let hostProfile = null;
      try {
        hostProfile = await getUserProfile(req.user.id);
      } catch (e) { /* ignore */ }
      const hostContactEmail = hostProfile?.contactEmail || null;
      const hostBrandWebsite = hostProfile?.brandWebsite || null;
      const hostBrandName = hostProfile?.brand || null;

      // Send VIP link via email to the guest
      try {
        const niceDate = expiresAt.toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        });

        // Format event date nicely
        const eventDate = event.startsAt ? (() => {
          const d = new Date(event.startsAt);
          if (isNaN(d.getTime())) return "";
          const opts = event.timezone ? { timeZone: event.timezone } : {};
          const datePart = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", ...opts });
          const timePart = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", ...opts });
          return `${datePart} · ${timePart}`;
        })() : "";

        const subject = `You're on the VIP list`;

        // Plaintext version
        const textParts = [`You've been invited as a VIP to "${event.title}".`];
        if (eventDate) textParts.push(`When: ${eventDate}`);
        if (event.location) textParts.push(`Where: ${event.location}`);
        if (maxGuestsInt > 1) textParts.push(`You can bring up to ${maxGuestsInt - 1} guest${maxGuestsInt > 2 ? "s" : ""}.`);
        if (effectiveFreeEntry) textParts.push("Your entry is complimentary.");
        if (event.description) textParts.push("", event.description.slice(0, 300));
        textParts.push("", `RSVP here: ${link}`, "", `Valid until ${niceDate}.`);
        if (hostContactEmail) textParts.push(`Questions? ${hostContactEmail}`);
        if (hostBrandWebsite) textParts.push(hostBrandWebsite);
        const textBody = textParts.join("\n");

        // Build rich HTML email
        const imageUrl = event.coverImageUrl || event.imageUrl || "";
        const desc = event.description
          ? event.description.length > 200
            ? event.description.slice(0, 200).trimEnd() + "…"
            : event.description
          : "";
        const spotifyUrl = event.spotify || "";
        const plusOnesText = maxGuestsInt > 1
          ? `You + ${maxGuestsInt - 1} guest${maxGuestsInt > 2 ? "s" : ""}`
          : "You";
        const freeEntryBadge = effectiveFreeEntry
          ? `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:#fbbf24;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-left:8px;">COMP</span>`
          : "";

        const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body style="margin:0;padding:0;background:#05040a;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:#05040a;">
<tr><td align="center" style="padding:20px 16px;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:#05040a;">

<!-- VIP Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  <span style="display:inline-block;padding:6px 20px;border-radius:999px;background:linear-gradient(135deg,#fbbf24 0%,#f59e0b 45%,#d97706 100%);color:#05040a;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">VIP INVITE</span>
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0 0 0;">
  <img src="${imageUrl}" alt="${event.title.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 translate="no" class="notranslate" style="margin:0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3;">${event.title}</h1>
</td></tr>

<!-- Date & Location -->
<tr><td align="center" style="padding:8px 0;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation">
  ${eventDate ? `<tr><td style="padding:3px 0;font-size:14px;color:rgba(255,255,255,0.6);text-align:center;">${eventDate}</td></tr>` : ""}
  ${event.location ? `<tr><td style="padding:3px 0;font-size:14px;color:rgba(255,255,255,0.6);text-align:center;">${event.location}</td></tr>` : ""}
  </table>
</td></tr>

${desc ? `<!-- Description -->
<tr><td style="padding:12px 20px;text-align:center;">
  <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.7);line-height:1.6;">${desc.replace(/\n/g, "<br>")}</p>
</td></tr>` : ""}

<!-- Guest info -->
<tr><td align="center" style="padding:16px 0 4px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
    <tr>
      <td style="padding:12px 20px;font-size:13px;color:rgba(255,255,255,0.8);text-align:center;">
        <strong>${plusOnesText}</strong>${freeEntryBadge}
      </td>
    </tr>
  </table>
</td></tr>

${spotifyUrl ? `<!-- Spotify -->
<tr><td align="center" style="padding:12px 0;">
  <a href="${spotifyUrl}" target="_blank" style="display:inline-flex;align-items:center;text-decoration:none;padding:8px 16px;border-radius:999px;background:rgba(30,215,96,0.12);border:1px solid rgba(30,215,96,0.3);color:#1ed760;font-size:13px;font-weight:600;">
    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Spotify_icon.svg/232px-Spotify_icon.svg.png" alt="" width="16" height="16" style="border:0;margin-right:6px;vertical-align:middle;" />Listen on Spotify
  </a>
</td></tr>` : ""}

<!-- CTA Button -->
<tr><td align="center" style="padding:24px 0;">
  <a href="${link}" target="_blank" style="display:inline-block;text-decoration:none;padding:14px 36px;border-radius:999px;background-color:#f59e0b;background-image:linear-gradient(135deg,#fbbf24 0%,#f59e0b 45%,#d97706 100%);color:#05040a;font-size:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border:1px solid rgba(245,158,11,0.9);">GET VIP ACCESS</a>
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 0 8px;border-top:1px solid rgba(255,255,255,0.06);">
  <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);text-align:center;line-height:1.6;">
    This invite is valid until ${niceDate}.<br>
    ${hostContactEmail ? `Questions? <a href="mailto:${hostContactEmail}" style="color:rgba(255,255,255,0.4);text-decoration:none;">${hostContactEmail}</a><br>` : ""}
    ${hostBrandWebsite ? `<a href="${hostBrandWebsite}" target="_blank" style="color:rgba(255,255,255,0.4);text-decoration:none;">${hostBrandWebsite.replace(/^https?:\/\//, "")}</a>` : `<a href="${getFrontendUrl()}" target="_blank" style="color:rgba(255,255,255,0.4);text-decoration:none;">pullup.se</a>`}
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;

        const senderName = event.title.replace(/"/g, "");
        const outboxRow = await sendEmail({
          to: normalizedEmail,
          subject,
          text: textBody,
          html: htmlBody,
          from: `"${senderName} VIP" <no-reply@pullup.se>`,
        });

        // Apply email tracking (open pixel + click redirect links)
        if (outboxRow?.tracking_id) {
          try {
            const { addTracking } = await import("./email/tracking/linkRewriter.js");
            const backendBaseUrl = isDevelopment
              ? "http://localhost:3001"
              : `${process.env.FRONTEND_URL || "https://pullup.se"}/api`;
            const campaignTag = `vip_invite_${event.slug}`;

            const trackedHtml = addTracking(htmlBody, {
              trackingId: outboxRow.tracking_id,
              baseUrl: backendBaseUrl,
              campaignTag,
            });

            const { supabase: sb } = await import("./supabase.js");
            await sb
              .from("email_outbox")
              .update({ html_body: trackedHtml, campaign_tag: campaignTag })
              .eq("id", outboxRow.id);
          } catch (trackErr) {
            console.error("[VIP] Tracking injection failed:", trackErr.message);
          }
        }
      } catch (emailError) {
        console.error("Error sending VIP invite email:", emailError);
        // Don't fail the API if email sending fails
      }

      return res.status(201).json({
        link,
        token,
        invite: {
          id: invite.id,
          email: normalizedEmail,
          maxGuests: maxGuestsInt,
          freeEntry: effectiveFreeEntry,
          discountPercent:
            typeof discountPercent === "number" ? discountPercent : null,
        },
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("Error creating VIP invite:", error);
      res.status(500).json({
        error: "Failed to create VIP invite",
        message: error.message,
      });
    }
  }
);

// ---------------------------
// PROTECTED: List VIP invites for event (requires auth, verifies ownership)
// ---------------------------
app.get(
  "/host/events/:eventId/vip-invites",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId } = req.params;

      const event = await findEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const invites = await getVipInvitesForEvent(event.id);
      const frontendUrl = getFrontendUrl();

      // Fetch per-invite email tracking stats
      const { supabase: sb } = await import("./supabase.js");
      const campaignTag = `vip_invite_${event.slug}`;

      // Get all outbox rows for this VIP campaign to map email→tracking stats
      const { data: outboxRows } = await sb
        .from("email_outbox")
        .select("id, tracking_id, to_email, status")
        .eq("campaign_tag", campaignTag);

      let opensMap = {};
      let clicksMap = {};
      if (outboxRows && outboxRows.length > 0) {
        const trackingIds = outboxRows.map((r) => r.tracking_id).filter(Boolean);

        const [opensResult, clicksResult] = await Promise.all([
          trackingIds.length > 0
            ? sb.from("email_opens").select("tracking_id").in("tracking_id", trackingIds)
            : { data: [] },
          trackingIds.length > 0
            ? sb.from("email_clicks").select("tracking_id, link_label").in("tracking_id", trackingIds)
            : { data: [] },
        ]);

        // Build email → stats mapping
        const trackingToEmail = {};
        for (const row of outboxRows) {
          if (row.tracking_id) trackingToEmail[row.tracking_id] = row.to_email?.toLowerCase();
        }

        for (const o of (opensResult.data || [])) {
          const email = trackingToEmail[o.tracking_id];
          if (email) opensMap[email] = true;
        }
        for (const c of (clicksResult.data || [])) {
          const email = trackingToEmail[c.tracking_id];
          if (email) {
            if (!clicksMap[email]) clicksMap[email] = { total: 0, cta: false };
            clicksMap[email].total++;
            if (c.link_label === "cta") clicksMap[email].cta = true;
          }
        }
      }

      // Aggregate stats
      const totalSent = outboxRows?.length || 0;
      const totalOpened = Object.keys(opensMap).length;
      const totalClicked = Object.keys(clicksMap).length;

      const mappedInvites = (invites || []).map((inv) => {
        const email = inv.email?.toLowerCase();
        return {
          id: inv.id,
          email: inv.email,
          maxGuests: inv.max_guests,
          freeEntry: inv.free_entry,
          createdAt: inv.created_at,
          expiresAt: inv.expires_at,
          link:
            inv.token && event.slug
              ? `${frontendUrl}/e/${event.slug}?vip=${inv.token}`
              : null,
          opened: !!opensMap[email],
          clicked: !!clicksMap[email],
        };
      });

      return res.json({
        invites: mappedInvites,
        stats: {
          totalSent,
          totalOpened,
          totalClicked,
          openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 1000) / 10 : 0,
          clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 1000) / 10 : 0,
        },
      });
    } catch (error) {
      console.error("Error listing VIP invites:", error);
      return res.status(500).json({
        error: "Failed to list VIP invites",
        message: error.message,
      });
    }
  }
);

// ---------------------------
// PROTECTED: Delete VIP invite (requires auth, verifies ownership)
// ---------------------------
app.delete(
  "/host/events/:eventId/vip-invites/:inviteId",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, inviteId } = req.params;

      const event = await findEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { supabase } = await import("./supabase.js");
      const { error } = await supabase
        .from("vip_invites")
        .delete()
        .eq("id", inviteId)
        .eq("event_id", event.id);

      if (error) {
        if (error.code === "PGRST205") {
          return res.status(404).json({ error: "Invite not found" });
        }
        console.error("Error deleting VIP invite:", error);
        return res.status(500).json({ error: "Failed to delete invite" });
      }

      return res.status(204).send();
    } catch (error) {
      console.error("Error deleting VIP invite:", error);
      return res.status(500).json({
        error: "Failed to delete invite",
        message: error.message,
      });
    }
  }
);

// ---------------------------
// PROTECTED: Update event (requires auth, verifies ownership)
// ---------------------------
app.put(
  "/host/events/:id",
  requireAuth,
  validateEventData,
  async (req, res) => {
    const { id } = req.params;

    // Allow updating both old and new fields
    const {
      title,
      description,
      location,
      locationLat,
      locationLng,
      startsAt,
      endsAt,
      timezone,
      maxAttendees,
      waitlistEnabled,
      imageUrl,
      theme,
      calendar,
      visibility,
      ticketType,
      requireApproval,
      maxPlusOnesPerGuest,
      dinnerEnabled,
      dinnerStartTime,
      dinnerEndTime,
      dinnerSeatingIntervalHours,
      dinnerMaxSeatsPerSlot,
      dinnerOverflowAction,
      dinnerSlots,
      dinnerBookingEmail,
      hideDinnerRemaining,

      // Stripe fields
      ticketPrice,
      ticketCurrency,
      stripeProductId,
      stripePriceId,

      // Capacity fields
      cocktailCapacity,
      foodCapacity,
      totalCapacity,

      // Dual personality fields
      status,

      // Media settings
      mediaSettings,

      // Title settings
      titleSettings,

      // Social links
      instagram,
      spotify,
      tiktok,
      soundcloud,

      // Sections (event builder blocks)
      sections,

      // Custom RSVP form fields
      formFields,

      // Reveal & waitlist features
      hideLocation,
      hideDate,
      instantWaitlist,
      revealHint,
      dateRevealHint,
    } = req.body;

    // Get current event to check if price/currency changed
    const currentEvent = await findEventById(id);
    if (!currentEvent) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Validate dates are not in the past. For TBA events the date is a private
    // placeholder, so skip the check — fall back to currentEvent.hideDate when
    // the request didn't include hideDate (partial update).
    const effectiveHideDate = hideDate !== undefined ? hideDate : currentEvent.hideDate;
    if (!effectiveHideDate && startsAt && new Date(startsAt) < new Date()) {
      return res.status(400).json({ error: "Event start date cannot be in the past" });
    }
    if (!effectiveHideDate && endsAt && new Date(endsAt) < new Date()) {
      return res.status(400).json({ error: "Event end date cannot be in the past" });
    }

    // Only owner or admin can edit event details (Stripe, pricing, etc.)
    const allowed = await canEditEvent(req.user.id, id);
    if (!allowed) {
      return res.status(403).json({
        error: "Forbidden",
        message:
          "Only the event owner or admin can edit event details.",
      });
    }

    // Check if ticket price or currency changed (for Stripe Price update)
    const priceChanged =
      ticketType === "paid" &&
      ticketPrice &&
      (currentEvent.ticketPrice !== ticketPrice ||
        (currentEvent.ticketCurrency || "usd").toLowerCase() !==
          (ticketCurrency || "usd").toLowerCase());

    // If price changed and event has Stripe product, create new Stripe Price
    // (Stripe Prices are immutable - we must create a new one)
    let newStripePriceId = stripePriceId;
    if (
      priceChanged &&
      currentEvent.stripeProductId &&
      ticketType === "paid" &&
      ticketPrice
    ) {
      try {
        const { createStripePrice } = await import("./stripe.js");
        const newPrice = await createStripePrice({
          productId: currentEvent.stripeProductId,
          amount: ticketPrice, // Already in cents
          currency: ticketCurrency || currentEvent.ticketCurrency || "usd",
          eventId: id,
        });
        newStripePriceId = newPrice.id;
        console.log(
          `[Stripe] Created new price ${newPrice.id} for event ${id} (old: ${currentEvent.stripePriceId})`
        );
      } catch (error) {
        console.error("Error creating new Stripe price:", error);
        // Continue with update even if Stripe price creation fails
        // The old price will still work, but new payments will use the new price from DB
      }
    }

    // If switching to paid and no Stripe product exists, create one
    if (ticketType === "paid" && ticketPrice && !currentEvent.stripeProductId) {
      try {
        const { createStripeProduct, createStripePrice } = await import(
          "./stripe.js"
        );
        const product = await createStripeProduct({
          eventTitle: currentEvent.title || title,
          eventDescription: currentEvent.description || description || "",
          eventId: id,
          startsAt: currentEvent.startsAt || startsAt,
          endsAt: currentEvent.endsAt || endsAt,
        });
        const price = await createStripePrice({
          productId: product.id,
          amount: ticketPrice,
          currency: ticketCurrency || "usd",
          eventId: id,
        });
        stripeProductId = product.id;
        newStripePriceId = price.id;
        console.log(
          `[Stripe] Created product ${product.id} and price ${price.id} for event ${id}`
        );
      } catch (error) {
        console.error("Error creating Stripe product/price:", error);
        // Continue with update - Stripe IDs can be added later
      }
    }

    // Upload any hostedby logos from sections to storage before saving
    let processedSections = sections;
    if (sections && Array.isArray(sections)) {
      try {
        processedSections = await processHostedByLogos(id, sections);
      } catch (err) {
        console.warn(`[PUT /host/events/${id}] Hosted-by logo upload failed:`, err.message);
      }
    }

    let updated;
    try {
      updated = await updateEvent(id, {
        title,
        description,
        location,
        locationLat,
        locationLng,
        startsAt,
        endsAt,
        timezone,
        maxAttendees,
        waitlistEnabled,
        imageUrl,
        theme,
        calendar,
        visibility,
        ticketType,
        requireApproval,
        maxPlusOnesPerGuest,
        dinnerEnabled,
        dinnerStartTime,
        dinnerEndTime,
        dinnerSeatingIntervalHours,
        dinnerMaxSeatsPerSlot,
        dinnerOverflowAction,
        dinnerSlots,
        dinnerBookingEmail,
        hideDinnerRemaining,
        ticketPrice,
        ticketCurrency: ticketCurrency
          ? String(ticketCurrency).toLowerCase()
          : undefined,
        stripeProductId: stripeProductId || currentEvent.stripeProductId,
        stripePriceId: newStripePriceId || currentEvent.stripePriceId,
        cocktailCapacity,
        foodCapacity,
        totalCapacity,
        status,
        mediaSettings,
        titleSettings,
        instagram,
        spotify,
        tiktok,
        soundcloud,
        sections: processedSections,
        formFields,
        hideLocation,
        hideDate,
        instantWaitlist,
        revealHint,
        dateRevealHint,
      });
    } catch (err) {
      console.error(`[PUT /host/events/${id}] Update failed:`, err.message);
      return res.status(500).json({
        error: "Failed to update event",
        message: err.message,
      });
    }

    if (!updated) return res.status(404).json({ error: "Event not found" });

    // If status flipped to DRAFT, log as unpublish; otherwise as update.
    const wasUnpublish = req.body?.status === "DRAFT" && updated.status === "DRAFT";
    emitIntent({
      hostId: req.user.id,
      tool: wasUnpublish ? "unpublish_event" : "update_event",
      args: req.body,
      source: sourceFromRequest(req),
      target: { type: "event", id: updated.id },
      result: { slug: updated.slug, status: updated.status },
    });

    res.json(updated);
  }
);

// ---------------------------
// PROTECTED: Publish event (requires auth, verifies ownership)
// ---------------------------
app.put("/host/events/:id/publish", requireAuth, async (req, res) => {
  const { id } = req.params;
  const event = await findEventById(id);

  if (!event) {
    return res.status(404).json({ error: "Event not found" });
  }

  // Only owner or admin can publish/unpublish
  const allowed = await canEditEvent(req.user.id, id);
  if (!allowed) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Only the event owner or admin can publish events.",
    });
  }

  const updated = await updateEvent(id, { status: "PUBLISHED" });
  if (!updated) {
    return res.status(404).json({ error: "Event not found" });
  }

  emitIntent({
    hostId: req.user.id,
    tool: "publish_event",
    args: { id },
    source: sourceFromRequest(req),
    target: { type: "event", id: updated.id },
    result: { slug: updated.slug, status: updated.status },
  });

  res.json(updated);
});

// ---------------------------
// PROTECTED: Delete event (requires auth, owner only, no RSVPs)
// ---------------------------
app.delete("/host/events/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const event = await findEventById(id);

  if (!event) {
    return res.status(404).json({ error: "Event not found" });
  }

  const isOwner = await isUserEventOwner(req.user.id, id);
  if (!isOwner) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Only the event owner can delete an event.",
    });
  }

  const result = await deleteEvent(id);

  if (result.error === "has_registrations") {
    return res.status(400).json({ error: result.error, message: result.message });
  }

  if (result.error) {
    return res.status(500).json({ error: result.error, message: result.message });
  }

  emitIntent({
    hostId: req.user.id,
    tool: "delete_event",
    args: { id },
    source: sourceFromRequest(req),
    target: { type: "event", id },
    result: { slug: event.slug },
  });

  res.json({ success: true });
});

// ---------------------------
// PROTECTED: Guest list (requires auth, verifies ownership)
// ---------------------------
// ---------------------------
// Location Autocomplete Endpoint
// Uses Google Places API if available, falls back to Nominatim (free)
// Supports optional lat/lng for location-biased results.
// ---------------------------
app.get("/api/location/autocomplete", async (req, res) => {
  try {
    const { query, lat, lng } = req.query;

    if (!query || query.length < 2) {
      return res.json({ predictions: [] });
    }

    const GOOGLE_PLACES_API_KEY =
      process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

    // Try Google Places API first if API key is available
    if (GOOGLE_PLACES_API_KEY) {
      try {
        let googleUrl =
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?` +
          `input=${encodeURIComponent(query)}&` +
          `key=${GOOGLE_PLACES_API_KEY}&` +
          `types=establishment|geocode&` +
          `components=country:us|country:se`;

        // If we have user coordinates, bias results near them
        if (lat && lng) {
          const latNum = Number(lat);
          const lngNum = Number(lng);
          if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
            googleUrl += `&locationbias=point:${latNum},${lngNum}`;
          }
        }

        const response = await fetch(googleUrl);

        if (response.ok) {
          const data = await response.json();
          if (data.status === "OK" && data.predictions) {
            return res.json({
              predictions: data.predictions.map((pred) => ({
                place_id: pred.place_id,
                description: pred.description,
                main_text:
                  pred.structured_formatting?.main_text || pred.description,
                secondary_text:
                  pred.structured_formatting?.secondary_text || "",
                source: "google",
              })),
            });
          }
        }
      } catch (error) {
        console.error("Google Places API error:", error);
        // Fall through to Nominatim
      }
    }

    // Fallback to Nominatim (OpenStreetMap) - free, no API key needed
    let nominatimUrl =
      `https://nominatim.openstreetmap.org/search?` +
      `format=json&` +
      `q=${encodeURIComponent(query)}&` +
      `limit=5&` +
      `addressdetails=1&` +
      `extratags=1`;

    // If we have user coordinates, try to bias Nominatim around them using a bounding box
    if (lat && lng) {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
        const delta = 0.5; // ~50km; rough bounding box
        const left = lngNum - delta;
        const right = lngNum + delta;
        const top = latNum + delta;
        const bottom = latNum - delta;
        nominatimUrl += `&viewbox=${left},${top},${right},${bottom}&bounded=1`;
      }
    }

    const nominatimResponse = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "PullUp App",
      },
    });

    if (nominatimResponse.ok) {
      const data = await nominatimResponse.json();
      return res.json({
        predictions: data.map((item) => ({
          place_id: item.place_id,
          description: item.display_name,
          main_text:
            item.name || item.display_name?.split(",")[0] || "Location",
          secondary_text:
            item.display_name?.split(",").slice(1, 3).join(", ").trim() || "",
          lat: item.lat,
          lon: item.lon,
          source: "nominatim",
        })),
      });
    }

    return res.json({ predictions: [] });
  } catch (error) {
    console.error("Location autocomplete error:", error);
    res.status(500).json({ error: "Failed to fetch location suggestions" });
  }
});

// ---------------------------
// Get Place Details (for coordinates)
// ---------------------------
app.get("/api/location/details", async (req, res) => {
  try {
    const { place_id, source } = req.query;

    if (!place_id) {
      return res.status(400).json({ error: "place_id is required" });
    }

    const GOOGLE_PLACES_API_KEY =
      process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

    if (source === "google" && GOOGLE_PLACES_API_KEY) {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?` +
            `place_id=${encodeURIComponent(place_id)}&` +
            `key=${GOOGLE_PLACES_API_KEY}&` +
            `fields=geometry,formatted_address,name`
        );

        if (response.ok) {
          const data = await response.json();
          if (data.status === "OK" && data.result) {
            const result = data.result;
            return res.json({
              address: result.formatted_address || result.name,
              lat: result.geometry?.location?.lat,
              lng: result.geometry?.location?.lng,
            });
          }
        }
      } catch (error) {
        console.error("Google Places Details API error:", error);
      }
    }

    // For Nominatim, we already have lat/lon from autocomplete
    // But we can fetch details if needed
    return res.status(404).json({ error: "Place details not found" });
  } catch (error) {
    console.error("Location details error:", error);
    res.status(500).json({ error: "Failed to fetch location details" });
  }
});

app.get("/host/events/:id/guests", requireAuth, async (req, res) => {
  try {
    const event = await findEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Verify ownership (owner or co-host)
    const { isHost } = await isUserEventHost(req.user.id, event.id);
    if (!isHost) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    const myRole = await getEventHostRole(req.user.id, event.id);
    if (myRole === "analytics" || myRole === "viewer") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Your role does not have access to guest data",
      });
    }

    const guests = await getRsvpsForEvent(event.id);
    res.json({ event: { ...event, myRole }, guests });
  } catch (error) {
    console.error("Error fetching guests:", error);
    res.status(500).json({ error: "Failed to fetch guests" });
  }
});

// ---------------------------
// PROTECTED: Export event guests as CSV
// ---------------------------
app.get("/host/events/:id/guests/export", requireAuth, async (req, res) => {
  try {
    const event = await findEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Any host can export (including viewer)
    const { isHost } = await isUserEventHost(req.user.id, event.id);
    if (!isHost) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    const myRole = await getEventHostRole(req.user.id, event.id);
    if (myRole === "analytics" || myRole === "viewer") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Your role does not have access to guest data",
      });
    }

    const guests = await getRsvpsForEvent(event.id);

    // Identity columns the host opted to collect on this event's form.
    // Order follows event.formFields so the CSV mirrors the signup form.
    // Each entry: { header, accessor: guest => value }.
    const IDENTITY_FIELD_TO_GUEST_KEY = {
      instagram: "instagram",
      twitter: "twitter",
      tiktok: "tiktok",
      linkedin: "linkedin",
      company: "company",
      birthday: "birthday",
      phone: "phone",
    };
    const identityColumns = (event.formFields || [])
      .map((f) => {
        const type = String(f?.type || "").toLowerCase();
        const key = IDENTITY_FIELD_TO_GUEST_KEY[type];
        if (!key) return null;
        return {
          header: f.label || type.charAt(0).toUpperCase() + type.slice(1),
          accessor: (guest) => guest[key] || "",
        };
      })
      .filter(Boolean);

    // Custom (non-identity) form fields are answered per-RSVP — emit them
    // as their own columns from rsvps.custom_answers, keyed by field id.
    const customColumns = (event.formFields || [])
      .filter((f) => String(f?.type || "").toLowerCase() === "custom" && f?.id)
      .map((f) => ({
        header: f.label || "Custom",
        accessor: (guest) => (guest.customAnswers || {})[f.id] || "",
      }));

    // CSV header
    const headers = [
      "Name",
      "Email",
      "Booking Status",
      "Party Size",
      "Plus Ones",
      "Wants Dinner",
      "Dinner Party Size",
      "Dinner Time Slot",
      "Dinner Status",
      "Dinner Pull Up Count",
      "Cocktails Pull Up Count",
      "RSVP Date",
      ...identityColumns.map((c) => c.header),
      ...customColumns.map((c) => c.header),
    ];

    // CSV rows
    const rows = guests.map((guest) => {
      const escapeCsv = (value) => {
        if (value === null || value === undefined) return "";
        const str = String(value);
        // If contains comma, quote, or newline, wrap in quotes and escape quotes
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const formatDate = (dateString) => {
        if (!dateString) return "";
        return new Date(dateString).toLocaleString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      };

      return [
        escapeCsv(guest.name),
        escapeCsv(guest.email),
        escapeCsv(guest.bookingStatus || guest.status || ""),
        escapeCsv(guest.partySize || ""),
        escapeCsv(guest.plusOnes || 0),
        escapeCsv(guest.wantsDinner ? "Yes" : "No"),
        escapeCsv(guest.dinnerPartySize || guest.dinner?.partySize || ""),
        escapeCsv(
          guest.dinnerTimeSlot || guest.dinner?.slotTime
            ? formatDate(guest.dinnerTimeSlot || guest.dinner?.slotTime)
            : ""
        ),
        escapeCsv(
          guest.dinner?.bookingStatus ||
            (guest.dinnerStatus === "confirmed"
              ? "CONFIRMED"
              : guest.dinnerStatus === "waitlist"
              ? "WAITLIST"
              : "")
        ),
        escapeCsv(guest.dinnerPullUpCount || 0),
        escapeCsv(guest.cocktailOnlyPullUpCount || 0),
        escapeCsv(guest.createdAt ? formatDate(guest.createdAt) : ""),
        ...identityColumns.map((c) => escapeCsv(c.accessor(guest))),
        ...customColumns.map((c) => escapeCsv(c.accessor(guest))),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    // Set headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="event-guests-${event.slug || event.id}-${
        new Date().toISOString().split("T")[0]
      }.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting guests:", error);
    res.status(500).json({ error: "Failed to export guests data" });
  }
});

// ---------------------------
// PUBLIC: Get dinner time slots for event
// ---------------------------
app.get("/events/:slug/dinner-slots", async (req, res) => {
  try {
    const { slug } = req.params;
    const event = await findEventBySlug(slug);

    if (!event) return res.status(404).json({ error: "Event not found" });

    if (!event.dinnerEnabled) {
      return res.json({ slots: [], slotCounts: {} });
    }

    const slots = generateDinnerTimeSlots(event);
    const slotCounts = await getDinnerSlotCounts(event.id);

    // Enrich slots with availability info
    const enrichedSlots = slots.map((slotTime) => {
      // Look up per-slot configuration if available
      let configuredCapacity = null;
      let maxGuestsPerBooking = null;
      if (Array.isArray(event.dinnerSlots) && event.dinnerSlots.length > 0) {
        const match = event.dinnerSlots.find((slot) => {
          if (!slot) return false;
          const slotValue =
            typeof slot === "string" ? slot : slot.time || null;
          if (!slotValue) return false;
          try {
            return new Date(slotValue).getTime() === new Date(slotTime).getTime();
          } catch {
            return false;
          }
        });
        if (match && typeof match === "object") {
          if (typeof match.capacity === "number") {
            configuredCapacity = match.capacity;
          }
          if (typeof match.maxGuestsPerBooking === "number") {
            maxGuestsPerBooking = match.maxGuestsPerBooking;
          }
        }
      }

      const counts = slotCounts[slotTime] || { confirmed: 0, waitlist: 0 };
      const slotCapacity =
        configuredCapacity != null
          ? configuredCapacity
          : event.dinnerMaxSeatsPerSlot ?? null;
      const available =
        !slotCapacity || counts.confirmed < slotCapacity;
      const remaining = slotCapacity
        ? Math.max(0, slotCapacity - counts.confirmed)
        : null;

      return {
        time: slotTime,
        capacity: slotCapacity,
        maxGuestsPerBooking,
        available,
        remaining,
        confirmed: counts.confirmed,
        waitlist: counts.waitlist,
      };
    });

    res.json({
      slots: enrichedSlots,
      maxSeatsPerSlot: event.dinnerMaxSeatsPerSlot,
    });
  } catch (error) {
    console.error("Error fetching dinner slots:", error);
    res.status(500).json({ error: "Failed to fetch dinner slots" });
  }
});

// ---------------------------
// PROTECTED: Update RSVP (requires auth, verifies ownership)
// ---------------------------
app.put(
  "/host/events/:eventId/rsvps/:rsvpId",
  requireAuth,
  validateRsvpUpdateData,
  async (req, res) => {
    try {
      const { eventId, rsvpId } = req.params;
      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      // Only owner, admin, or editor can update RSVPs (guest list edits)
      const canEdit = await canEditGuests(req.user.id, event.id);
      if (!canEdit) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have permission to edit guests for this event.",
        });
      }

      const rsvp = await findRsvpById(rsvpId);
      if (!rsvp || rsvp.eventId !== eventId) {
        return res.status(404).json({ error: "RSVP not found" });
      }

      const {
        name,
        email,
        plusOnes,
        bookingStatus,
        status, // Backward compatibility
        wantsDinner,
        dinnerTimeSlot,
        "dinner.slotTime": dinnerSlotTime,
        dinnerPartySize,
        "dinner.bookingStatus": dinnerBookingStatus,
        dinnerPullUpCount,
        cocktailOnlyPullUpCount,
        pulledUpForDinner, // Backward compatibility
        pulledUpForCocktails, // Backward compatibility
        forceConfirm, // Admin override flag
      } = req.body;

      // BUSINESS RULE: Cannot move paid/confirmed guests to waitlist
      // If guest has paid and is confirmed, they cannot be moved to waitlist
      // This would require a refund, which is a separate process
      const isPaidEvent = event.ticketType === "paid";
      const isPaidAndConfirmed =
        isPaidEvent &&
        rsvp.paymentStatus === "paid" &&
        rsvp.bookingStatus === "CONFIRMED";
      const tryingToMoveToWaitlist =
        (bookingStatus === "WAITLIST" || (status && status === "waitlist")) &&
        rsvp.bookingStatus === "CONFIRMED";

      if (isPaidAndConfirmed && tryingToMoveToWaitlist) {
        return res.status(400).json({
          error: "cannot_move_paid_guest_to_waitlist",
          message:
            "Cannot move a paid and confirmed guest to waitlist. This would require a refund. Please process a refund first if you need to remove this guest.",
        });
      }

      const result = await updateRsvp(
        rsvpId,
        {
          name,
          email,
          plusOnes,
          bookingStatus,
          status, // Backward compatibility
          wantsDinner,
          dinnerTimeSlot: dinnerTimeSlot || dinnerSlotTime,
          "dinner.slotTime": dinnerSlotTime,
          dinnerPartySize,
          "dinner.bookingStatus": dinnerBookingStatus,
          dinnerPullUpCount,
          cocktailOnlyPullUpCount,
          pulledUpForDinner, // Backward compatibility
          pulledUpForCocktails, // Backward compatibility
        },
        { forceConfirm: !!forceConfirm }
      );

      if (result.error === "not_found") {
        return res.status(404).json({ error: "RSVP not found" });
      }

      if (result.error === "invalid_email") {
        return res.status(400).json({ error: "Invalid email format" });
      }

      if (result.error === "full") {
        return res.status(409).json({
          error: "full",
          message: "Event is full and waitlist is disabled",
        });
      }

      if (result.error === "database_error") {
        return res.status(500).json({
          error: "database_error",
          message: result.message || "Failed to update RSVP",
        });
      }

      emitIntent({
        hostId: req.user.id,
        tool: "update_rsvp",
        args: { eventId: req.params.eventId, rsvpId: req.params.rsvpId, ...req.body },
        source: sourceFromRequest(req),
        target: { type: "rsvp", id: req.params.rsvpId },
        result: { status: result.rsvp?.status },
      });

      res.json(result.rsvp);
    } catch (error) {
      console.error("Error updating RSVP:", error);
      res.status(500).json({ error: "Failed to update RSVP" });
    }
  }
);

// ---------------------------
// PROTECTED: Delete RSVP (requires auth, verifies ownership)
// ---------------------------
app.delete(
  "/host/events/:eventId/rsvps/:rsvpId",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, rsvpId } = req.params;
      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      // Only owner, admin, or editor can delete RSVPs
      const canEdit = await canEditGuests(req.user.id, event.id);
      if (!canEdit) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have permission to edit guests for this event.",
        });
      }

      const rsvp = await findRsvpById(rsvpId);
      if (!rsvp || rsvp.eventId !== eventId) {
        return res.status(404).json({ error: "RSVP not found" });
      }

      // Get person email before deletion
      const person = await findPersonById(rsvp.personId);

      const result = await deleteRsvp(rsvpId);

      if (result.error === "not_found") {
        return res.status(404).json({ error: "RSVP not found" });
      }

      if (result.error === "database_error") {
        return res.status(500).json({
          error: "database_error",
          message: result.message || "Failed to delete RSVP",
        });
      }

      // Send cancellation email to guest
      if (person?.email) {
        try {
          let hostBrand = {};
          try {
            const hostProfile = await getUserProfile(event.hostId);
            hostBrand = {
              brandName: hostProfile?.brand || "",
              brandWebsite: hostProfile?.brandWebsite || "",
              contactEmail: hostProfile?.contactEmail || "",
            };
          } catch {}

          await sendEmail({
            to: person.email,
            subject: "Your booking has been cancelled",
            html: cancellationEmail({
              name: rsvp.name || person.name || "there",
              eventTitle: event.title,
              imageUrl: event.coverImageUrl || event.imageUrl || "",
              slug: event.slug || "",
              frontendUrl: getFrontendUrl(),
              ...hostBrand,
            }),
          });
        } catch (emailErr) {
          console.error("Failed to send cancellation email:", emailErr);
        }
      }

      res.json({ success: true, emailSent: !!person?.email });
    } catch (error) {
      console.error("Error deleting RSVP:", error);
      res.status(500).json({ error: "Failed to delete RSVP" });
    }
  }
);

// ---------------------------
// PROTECTED: Promote waitlisted RSVP to confirmed (requires auth, verifies ownership)
// ---------------------------
app.post(
  "/host/events/:eventId/rsvps/:rsvpId/promote",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, rsvpId } = req.params;
      const { sendEmail: shouldSendEmail } = req.body || {};

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const canEdit = await canEditGuests(req.user.id, event.id);
      if (!canEdit) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have permission to edit guests for this event.",
        });
      }

      const rsvp = await findRsvpById(rsvpId);
      if (!rsvp || rsvp.eventId !== eventId) {
        return res.status(404).json({ error: "RSVP not found" });
      }

      if (rsvp.bookingStatus !== "WAITLIST") {
        return res.status(400).json({
          error: "not_waitlisted",
          message: "Only waitlisted RSVPs can be promoted.",
        });
      }

      const result = await updateRsvp(
        rsvpId,
        { bookingStatus: "CONFIRMED", status: "attending" },
        { forceConfirm: true }
      );

      if (result.error) {
        return res.status(500).json({
          error: result.error,
          message: result.message || "Failed to promote RSVP",
        });
      }

      // Optionally send confirmation email
      if (shouldSendEmail) {
        try {
          const person = await findPersonById(rsvp.personId);
          const email = person?.email || rsvp.email;
          if (email) {
            let hostBrand = {};
            try {
              const hostProfile = await getUserProfile(event.hostId);
              hostBrand = {
                brandName: hostProfile?.brand || "",
                brandWebsite: hostProfile?.brandWebsite || "",
                contactEmail: hostProfile?.contactEmail || "",
              };
            } catch {}

            await sendEmail({
              to: email,
              subject: "Your spot is confirmed",
              html: signupConfirmationEmail({
                name: rsvp.name || person?.name || "",
                eventTitle: event.title,
                date: new Date(event.startsAt).toLocaleString(),
                isWaitlist: false,
                imageUrl: event.coverImageUrl || event.imageUrl || "",
                location: event.location || "",
                startsAt: event.startsAt || "",
                endsAt: event.endsAt || "",
                timezone: event.timezone || "",
                plusOnes: Number(rsvp.plusOnes) || 0,
                slug: event.slug || "",
                frontendUrl: getFrontendUrl(),
                spotifyUrl: event.spotify || "",
                ticketPrice: event.ticketPrice ? (Number(event.ticketPrice) / 100).toFixed(2) : 0,
                ticketCurrency: event.ticketCurrency || "",
                hideDate: event.hideDate || false,
                hideLocation: event.hideLocation || false,
                dateRevealHint: event.dateRevealHint || "",
                revealHint: event.revealHint || "",
                ...hostBrand,
              }),
            });
          }
        } catch (emailErr) {
          console.error("Failed to send promotion confirmation email:", emailErr);
          // Don't block the promotion on email failure
        }
      }

      res.json(result.rsvp);
    } catch (error) {
      console.error("Error promoting RSVP:", error);
      res.status(500).json({ error: "Failed to promote RSVP" });
    }
  }
);

// ---------------------------
// PROTECTED: Bulk promote waitlisted RSVPs (requires auth, verifies ownership)
// ---------------------------
app.post(
  "/host/events/:eventId/rsvps/promote-bulk",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId } = req.params;
      const { rsvpIds, sendEmail: shouldSendEmail } = req.body || {};

      if (!Array.isArray(rsvpIds) || rsvpIds.length === 0) {
        return res.status(400).json({
          error: "invalid_input",
          message: "rsvpIds must be a non-empty array.",
        });
      }

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const canEdit = await canEditGuests(req.user.id, event.id);
      if (!canEdit) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have permission to edit guests for this event.",
        });
      }

      // Fetch all RSVPs and filter to valid waitlisted ones for this event
      const rsvps = [];
      for (const id of rsvpIds) {
        const rsvp = await findRsvpById(id);
        if (rsvp && rsvp.eventId === eventId && rsvp.bookingStatus === "WAITLIST") {
          rsvps.push(rsvp);
        }
      }

      // Sort FIFO by RSVP creation date
      rsvps.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      // Fetch host branding once for all emails
      let hostBrand = {};
      try {
        const hostProfile = await getUserProfile(event.hostId);
        hostBrand = {
          brandName: hostProfile?.brand || "",
          brandWebsite: hostProfile?.brandWebsite || "",
          contactEmail: hostProfile?.contactEmail || "",
        };
      } catch {}

      let promoted = 0;
      for (const rsvp of rsvps) {
        const result = await updateRsvp(
          rsvp.id,
          { bookingStatus: "CONFIRMED", status: "attending" },
          { forceConfirm: true }
        );

        if (!result.error) {
          promoted++;

          if (shouldSendEmail) {
            try {
              const person = await findPersonById(rsvp.personId);
              const email = person?.email || rsvp.email;
              if (email) {
                await sendEmail({
                  to: email,
                  subject: "Your spot is confirmed",
                  html: signupConfirmationEmail({
                    name: rsvp.name || person?.name || "",
                    eventTitle: event.title,
                    date: new Date(event.startsAt).toLocaleString(),
                    isWaitlist: false,
                    imageUrl: event.coverImageUrl || event.imageUrl || "",
                    location: event.location || "",
                    startsAt: event.startsAt || "",
                    endsAt: event.endsAt || "",
                    timezone: event.timezone || "",
                    plusOnes: Number(rsvp.plusOnes) || 0,
                    slug: event.slug || "",
                    frontendUrl: getFrontendUrl(),
                    spotifyUrl: event.spotify || "",
                    ticketPrice: event.ticketPrice ? (Number(event.ticketPrice) / 100).toFixed(2) : 0,
                    ticketCurrency: event.ticketCurrency || "",
                    hideDate: event.hideDate || false,
                    hideLocation: event.hideLocation || false,
                    dateRevealHint: event.dateRevealHint || "",
                    revealHint: event.revealHint || "",
                    ...hostBrand,
                  }),
                });
              }
            } catch (emailErr) {
              console.error("Failed to send bulk promotion email:", emailErr);
            }
          }
        }
      }

      res.json({ promoted, total: rsvpIds.length });
    } catch (error) {
      console.error("Error bulk promoting RSVPs:", error);
      res.status(500).json({ error: "Failed to bulk promote RSVPs" });
    }
  }
);

// ---------------------------
// PROTECTED: Cancel RSVP (requires auth, verifies ownership)
// ---------------------------
app.post(
  "/host/events/:eventId/rsvps/:rsvpId/cancel",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, rsvpId } = req.params;

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const canEdit = await canEditGuests(req.user.id, event.id);
      if (!canEdit) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have permission to edit guests for this event.",
        });
      }

      const rsvp = await findRsvpById(rsvpId);
      if (!rsvp || rsvp.eventId !== eventId) {
        return res.status(404).json({ error: "RSVP not found" });
      }

      // For paid + confirmed guests, require refund first
      const isPaid = event.ticketType === "paid" && event.ticketPrice > 0;
      if (
        isPaid &&
        rsvp.bookingStatus === "CONFIRMED" &&
        rsvp.paymentStatus === "paid"
      ) {
        return res.status(400).json({
          error: "refund_required",
          message:
            "This guest has a confirmed payment. Please process a refund before cancelling.",
        });
      }

      const result = await updateRsvp(rsvpId, {
        bookingStatus: "CANCELLED",
        status: "cancelled",
      });

      if (result.error) {
        return res.status(500).json({
          error: result.error,
          message: result.message || "Failed to cancel RSVP",
        });
      }

      // Send cancellation email to guest
      const person = await findPersonById(rsvp.personId);
      if (person?.email) {
        try {
          let hostBrand = {};
          try {
            const hostProfile = await getUserProfile(event.hostId);
            hostBrand = {
              brandName: hostProfile?.brand || "",
              brandWebsite: hostProfile?.brandWebsite || "",
              contactEmail: hostProfile?.contactEmail || "",
            };
          } catch {}

          await sendEmail({
            to: person.email,
            subject: "Your booking has been cancelled",
            html: cancellationEmail({
              name: rsvp.name || person.name || "there",
              eventTitle: event.title,
              imageUrl: event.coverImageUrl || event.imageUrl || "",
              slug: event.slug || "",
              frontendUrl: getFrontendUrl(),
              ...hostBrand,
            }),
          });
        } catch (emailErr) {
          console.error("Failed to send cancellation email:", emailErr);
        }
      }

      res.json({ ...result.rsvp, emailSent: !!person?.email });
    } catch (error) {
      console.error("Error cancelling RSVP:", error);
      res.status(500).json({ error: "Failed to cancel RSVP" });
    }
  }
);

// ---------------------------
// PROTECTED: Get all people (CRM) - filtered by user's events
// ---------------------------
app.get("/host/crm/people", requireAuth, async (req, res) => {
  try {
    // Assign orphaned events to this user on first access (one-time migration)
    const { assignOrphanedEventsToUser } = await import("./migrations.js");
    try {
      await assignOrphanedEventsToUser(req.user.id);
    } catch (migrationError) {
      // Log but don't fail - migration is optional
      console.log("Migration note:", migrationError.message);
    }

    // Check for query parameters for filtering
    const {
      search,
      email,
      name,
      totalSpendMin,
      totalSpendMax,
      paymentCountMin,
      paymentCountMax,
      subscriptionType,
      interestedIn,
      tags,
      hasStripeCustomerId,
      attendedEventId,
      attendedEventIds,
      attendedEventTags,
      hasDinner,
      attendanceStatus,
      eventsAttendedMin,
      eventsAttendedMax,
      sortBy = "created_at",
      sortOrder = "desc",
      limit = 50,
      offset = 0,
    } = req.query;

    // If filters provided, use getPeopleWithFilters
    if (
      search ||
      email ||
      name ||
      totalSpendMin ||
      totalSpendMax ||
      paymentCountMin ||
      paymentCountMax ||
      subscriptionType ||
      interestedIn ||
      tags ||
      hasStripeCustomerId !== undefined ||
      attendedEventId ||
      attendedEventIds ||
      attendedEventTags ||
      hasDinner !== undefined ||
      attendanceStatus ||
      eventsAttendedMin ||
      eventsAttendedMax
    ) {
      const { getPeopleWithFilters } = await import("./data.js");
      const filters = {
        search,
        email,
        name,
        totalSpendMin: totalSpendMin ? parseInt(totalSpendMin, 10) : undefined,
        totalSpendMax: totalSpendMax ? parseInt(totalSpendMax, 10) : undefined,
        paymentCountMin: paymentCountMin
          ? parseInt(paymentCountMin, 10)
          : undefined,
        paymentCountMax: paymentCountMax
          ? parseInt(paymentCountMax, 10)
          : undefined,
        subscriptionType,
        interestedIn,
        tags: tags ? tags.split(",") : undefined,
        hasStripeCustomerId:
          hasStripeCustomerId !== undefined
            ? hasStripeCustomerId === "true"
            : undefined,
        attendedEventId,
        attendedEventIds: attendedEventIds
          ? attendedEventIds.split(",")
          : undefined,
        attendedEventTags: attendedEventTags
          ? attendedEventTags.split(",")
          : undefined,
        hasDinner: hasDinner !== undefined ? hasDinner === "true" : undefined,
        attendanceStatus,
        eventsAttendedMin: eventsAttendedMin
          ? parseInt(eventsAttendedMin, 10)
          : undefined,
        eventsAttendedMax: eventsAttendedMax
          ? parseInt(eventsAttendedMax, 10)
          : undefined,
      };

      const result = await getPeopleWithFilters(
        req.user.id,
        filters,
        sortBy,
        sortOrder,
        parseInt(limit, 10),
        parseInt(offset, 10)
      );

      return res.json({
        people: result.people,
        total: result.total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      });
    }

    // Otherwise use getAllPeopleWithStats (backward compatibility)
    // and apply simple in-memory pagination so the frontend only
    // renders a page of results at a time.
    const people = await getAllPeopleWithStats(req.user.id);
    const limitNum = parseInt(limit, 10) || 50;
    const offsetNum = parseInt(offset, 10) || 0;
    const pagedPeople = people.slice(offsetNum, offsetNum + limitNum);

    res.json({
      people: pagedPeople,
      total: people.length,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    console.error("Error fetching people:", error);
    res.status(500).json({ error: "Failed to fetch people" });
  }
});

// GET /host/crm/people-filter-index — lightweight per-person summary that
// lets the frontend compute filtered audience size client-side in real time
// without paying for a full paginated /people round-trip on every click.
// Returns just what the segment filters need: id, attended event IDs, the
// admin_tags of those events, and a hadDinner boolean. ~50–150 bytes per
// person, fine for hosts well into the tens of thousands.
app.get("/host/crm/people-filter-index", requireAuth, async (req, res) => {
  try {
    const people = await getAllPeopleWithStats(req.user.id);

    // Batch-check the suppression list once for everyone in the host's
    // CRM. This lets the frontend show a live recipient count that already
    // excludes unsendable contacts (no email, unsubscribed, bounced).
    const emails = people.map((p) => p.email).filter(Boolean);
    const { getSuppressedEmailSet } = await import(
      "./email/repos/emailSuppressionsRepo.js"
    );
    const suppressed = await getSuppressedEmailSet(emails);

    const index = people.map((p) => {
      const eventIds = [];
      let hadDinner = false;
      for (const h of p.eventHistory || []) {
        if (h.eventId) eventIds.push(h.eventId);
        if (h.wantsDinner) hadDinner = true;
      }
      const sendable =
        !!p.email &&
        !p.marketingUnsubscribedAt &&
        !suppressed.has(String(p.email).toLowerCase());
      return { id: p.id, eventIds, hadDinner, sendable };
    });
    return res.json({ index, total: index.length });
  } catch (error) {
    console.error("Error building people filter index:", error);
    return res.status(500).json({ error: "Failed to build filter index" });
  }
});

// ---------------------------
// PROTECTED: Get person details with touchpoints
// ---------------------------
app.get("/host/crm/people/:personId", requireAuth, async (req, res) => {
  try {
    const { personId } = req.params;
    const { getPersonTouchpoints, findPersonById } = await import("./data.js");

    const person = await findPersonById(personId);
    if (!person) {
      return res.status(404).json({ error: "Person not found" });
    }

    const touchpoints = await getPersonTouchpoints(personId, req.user.id);

    res.json({
      person,
      touchpoints,
    });
  } catch (error) {
    console.error("Error fetching person details:", error);
    res.status(500).json({ error: "Failed to fetch person details" });
  }
});

// ---------------------------
// PROTECTED: Export CRM people as CSV
// ---------------------------
// NOTE: This export respects the same filters as GET /host/crm/people.
// If query parameters are provided, we export ONLY the filtered segment.
// Otherwise we export all people with stats for this host.
app.get("/host/crm/people/export", requireAuth, async (req, res) => {
  try {
    const {
      search,
      email,
      name,
      totalSpendMin,
      totalSpendMax,
      paymentCountMin,
      paymentCountMax,
      subscriptionType,
      interestedIn,
      tags,
      hasStripeCustomerId,
      attendedEventId,
      attendedEventIds,
      attendedEventTags,
      hasDinner,
      attendanceStatus,
      eventsAttendedMin,
      eventsAttendedMax,
    } = req.query;

    let people;

    // If any filter is present, export the filtered segment
    if (
      search ||
      email ||
      name ||
      totalSpendMin ||
      totalSpendMax ||
      paymentCountMin ||
      paymentCountMax ||
      subscriptionType ||
      interestedIn ||
      tags ||
      hasStripeCustomerId !== undefined ||
      attendedEventId ||
      attendedEventIds ||
      attendedEventTags ||
      hasDinner !== undefined ||
      attendanceStatus ||
      eventsAttendedMin ||
      eventsAttendedMax
    ) {
      const { getPeopleWithFilters } = await import("./data.js");
      const filters = {
        search,
        email,
        name,
        totalSpendMin: totalSpendMin ? parseInt(totalSpendMin, 10) : undefined,
        totalSpendMax: totalSpendMax ? parseInt(totalSpendMax, 10) : undefined,
        paymentCountMin: paymentCountMin
          ? parseInt(paymentCountMin, 10)
          : undefined,
        paymentCountMax: paymentCountMax
          ? parseInt(paymentCountMax, 10)
          : undefined,
        subscriptionType,
        interestedIn,
        tags: tags ? tags.split(",") : undefined,
        hasStripeCustomerId:
          hasStripeCustomerId !== undefined
            ? hasStripeCustomerId === "true"
            : undefined,
        attendedEventId,
        attendedEventIds: attendedEventIds
          ? attendedEventIds.split(",")
          : undefined,
        attendedEventTags: attendedEventTags
          ? attendedEventTags.split(",")
          : undefined,
        hasDinner: hasDinner !== undefined ? hasDinner === "true" : undefined,
        attendanceStatus,
        eventsAttendedMin: eventsAttendedMin
          ? parseInt(eventsAttendedMin, 10)
          : undefined,
        eventsAttendedMax: eventsAttendedMax
          ? parseInt(eventsAttendedMax, 10)
          : undefined,
      };

      // For export we want the full segment, not paginated,
      // so request a large limit with offset 0.
      const result = await getPeopleWithFilters(
        req.user.id,
        filters,
        "created_at",
        "desc",
        10000,
        0
      );
      people = result.people || [];
    } else {
      // No filters: export all people with stats
      people = await getAllPeopleWithStats(req.user.id);
    }

    // CSV header
    const headers = [
      "Name",
      "Email",
      "Phone",
      "Notes",
      "Tags",
      "Total Events",
      "Events Attended",
      "Events Waitlisted",
      "Total Guests Brought",
      "Total Dinners",
      "Total Dinner Guests",
      "First Seen",
    ];

    // CSV rows
    const rows = people.map((person) => {
      const escapeCsv = (value) => {
        if (value === null || value === undefined) return "";
        const str = String(value);
        // If contains comma, quote, or newline, wrap in quotes and escape quotes
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escapeCsv(person.name),
        escapeCsv(person.email),
        escapeCsv(person.phone),
        escapeCsv(person.notes),
        escapeCsv(person.tags?.join(", ") || ""),
        escapeCsv(person.stats?.totalEvents || 0),
        escapeCsv(person.stats?.eventsAttended || 0),
        escapeCsv(person.stats?.eventsWaitlisted || 0),
        escapeCsv(person.stats?.totalGuestsBrought || 0),
        escapeCsv(person.stats?.totalDinners || 0),
        escapeCsv(person.stats?.totalDinnerGuests || 0),
        escapeCsv(
          person.createdAt
            ? new Date(person.createdAt).toLocaleDateString("en-US")
            : ""
        ),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    // Set headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="crm-contacts-${
        new Date().toISOString().split("T")[0]
      }.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting CRM people:", error);
    res.status(500).json({ error: "Failed to export CRM data" });
  }
});

// ---------------------------
// PROTECTED: Update person (requires auth)
// ---------------------------
app.put("/host/crm/people/:personId", requireAuth, async (req, res) => {
  try {
    const { personId } = req.params;
    const {
      name,
      phone,
      notes,
      tags,
      // Identity fields collected via event form_fields. Editable here so
      // hosts can fill in details they already know (e.g. an Instagram
      // handle they grabbed in person).
      instagram,
      twitter,
      tiktok,
      linkedin,
      company,
      birthday,
    } = req.body;

    const result = await updatePerson(personId, {
      name,
      phone,
      notes,
      tags,
      instagram,
      twitter,
      tiktok,
      linkedin,
      company,
      birthday,
    });

    if (result.error === "not_found") {
      return res.status(404).json({ error: "Person not found" });
    }

    emitIntent({
      hostId: req.user.id,
      tool: "update_person",
      args: { personId: req.params.personId, ...req.body },
      source: sourceFromRequest(req),
      target: { type: "person", id: req.params.personId },
      result: { name: result.person?.name },
    });

    res.json(result.person);
  } catch (error) {
    console.error("Error updating person:", error);
    res.status(500).json({ error: "Failed to update person" });
  }
});

// ---------------------------
// PROTECTED: Import CSV (requires auth)
// ---------------------------
app.post("/host/crm/import-csv", requireAuth, async (req, res) => {
  try {
    // Accept JSON body with csv and optional eventId
    let csvText;
    let eventId = null;

    // Support both old format (CSV as text) and new format (JSON with csv and eventId)
    if (typeof req.body === "string") {
      csvText = req.body;
    } else if (req.body && typeof req.body.csv === "string") {
      csvText = req.body.csv;
      eventId = req.body.eventId || null;
    } else {
      return res.status(400).json({
        error: "invalid_request",
        message:
          "CSV text is required in request body (as 'csv' field in JSON or as plain text)",
      });
    }

    if (!csvText || csvText.length === 0) {
      return res.status(400).json({
        error: "invalid_request",
        message: "CSV text cannot be empty",
      });
    }

    // Verify event ownership if eventId is provided
    let event = null;
    if (eventId) {
      const { findEventById } = await import("./data.js");
      event = await findEventById(eventId);

      if (!event) {
        return res.status(404).json({
          error: "event_not_found",
          message: "Event not found",
        });
      }

      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({
          error: "forbidden",
          message: "You don't have access to this event",
        });
      }
    }

    // Import CSV service
    const { importPeopleFromCsv } = await import(
      "./services/csvImportService.js"
    );

    // Import people from CSV
    const results = await importPeopleFromCsv(csvText, req.user.id);

    // Create RSVPs for imported people if eventId is provided
    let rsvpsCreated = 0;
    if (eventId && event) {
      const { supabase } = await import("./supabase.js");
      const { findPersonByEmail } = await import("./data.js");

      // Get all successfully imported people (created or updated)
      // We need to find them by email from the CSV
      const { parseCsv } = await import("./services/csvImportService.js");
      const rows = parseCsv(csvText);

      for (const row of rows) {
        const email = row["Email"] || row["email"] || row.Email;
        if (!email) continue;

        try {
          const normalizedEmail = email.trim().toLowerCase();
          const person = await findPersonByEmail(normalizedEmail);

          if (person) {
            // Check if RSVP already exists
            const { data: existingRsvp } = await supabase
              .from("rsvps")
              .select("id")
              .eq("event_id", eventId)
              .eq("person_id", person.id)
              .single();

            if (!existingRsvp) {
              // Create RSVP with CONFIRMED status (historical import)
              const { error: rsvpError } = await supabase.from("rsvps").insert({
                person_id: person.id,
                event_id: eventId,
                slug: event.slug,
                booking_status: "CONFIRMED",
                status: "attending",
                plus_ones: 0,
                party_size: 1,
                wants_dinner: false,
              });

              if (!rsvpError) {
                rsvpsCreated++;
              }
            }
          }
        } catch (err) {
          console.error(`Error creating RSVP for ${email}:`, err);
          // Continue with next person
        }
      }
    }

    res.json({
      success: true,
      summary: {
        total: results.created + results.updated + results.errors.length,
        created: results.created,
        updated: results.updated,
        errors: results.errors.length,
        rsvpsCreated: rsvpsCreated,
      },
      errors: results.errors.slice(0, 100), // Limit to first 100 errors
    });
  } catch (error) {
    console.error("Error importing CSV:", error);
    res.status(500).json({
      error: "import_failed",
      message: error.message || "Failed to import CSV",
    });
  }
});

// ---------------------------
// PROTECTED: CRM Views (requires auth)
// ---------------------------
app.get("/host/crm/views", requireAuth, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { data, error } = await supabase
      .from("crm_views")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ views: data || [] });
  } catch (error) {
    console.error("Error fetching CRM views:", error);
    res.status(500).json({ error: "Failed to fetch views" });
  }
});

app.post("/host/crm/views", requireAuth, async (req, res) => {
  try {
    const { name, filters, sortBy, sortOrder, isDefault } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const { supabase } = await import("./supabase.js");

    // If this is set as default, unset other defaults
    if (isDefault) {
      await supabase
        .from("crm_views")
        .update({ is_default: false })
        .eq("user_id", req.user.id);
    }

    const { data, error } = await supabase
      .from("crm_views")
      .insert({
        user_id: req.user.id,
        name,
        filters: filters || {},
        sort_by: sortBy || "created_at",
        sort_order: sortOrder || "desc",
        is_default: isDefault || false,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Error creating CRM view:", error);
    res.status(500).json({ error: "Failed to create view" });
  }
});

app.put("/host/crm/views/:viewId", requireAuth, async (req, res) => {
  try {
    const { viewId } = req.params;
    const { name, filters, sortBy, sortOrder, isDefault } = req.body;

    const { supabase } = await import("./supabase.js");

    // Verify ownership
    const { data: existing } = await supabase
      .from("crm_views")
      .select("user_id")
      .eq("id", viewId)
      .single();

    if (!existing || existing.user_id !== req.user.id) {
      return res.status(404).json({ error: "View not found" });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      await supabase
        .from("crm_views")
        .update({ is_default: false })
        .eq("user_id", req.user.id)
        .neq("id", viewId);
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (filters !== undefined) updates.filters = filters;
    if (sortBy !== undefined) updates.sort_by = sortBy;
    if (sortOrder !== undefined) updates.sort_order = sortOrder;
    if (isDefault !== undefined) updates.is_default = isDefault;

    const { data, error } = await supabase
      .from("crm_views")
      .update(updates)
      .eq("id", viewId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Error updating CRM view:", error);
    res.status(500).json({ error: "Failed to update view" });
  }
});

app.delete("/host/crm/views/:viewId", requireAuth, async (req, res) => {
  try {
    const { viewId } = req.params;
    const { supabase } = await import("./supabase.js");

    // Verify ownership
    const { data: existing } = await supabase
      .from("crm_views")
      .select("user_id")
      .eq("id", viewId)
      .single();

    if (!existing || existing.user_id !== req.user.id) {
      return res.status(404).json({ error: "View not found" });
    }

    const { error } = await supabase
      .from("crm_views")
      .delete()
      .eq("id", viewId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting CRM view:", error);
    res.status(500).json({ error: "Failed to delete view" });
  }
});

// ---------------------------
// PROTECTED: Email Campaigns (requires auth)
// ---------------------------

function validateFollowupTemplateContent(tc) {
  if (!tc || typeof tc !== "object") return "templateContent must be an object";
  if (tc.previewText !== undefined && typeof tc.previewText !== "string") return "previewText must be a string";
  if (tc.fromName !== undefined && tc.fromName !== null) {
    if (typeof tc.fromName !== "string") return "fromName must be a string";
    if (tc.fromName.length > 80) return "fromName too long (max 80 chars)";
  }
  if (!Array.isArray(tc.blocks)) return "blocks must be an array";
  for (let i = 0; i < tc.blocks.length; i += 1) {
    const b = tc.blocks[i];
    if (!b || typeof b !== "object") return `block ${i}: not an object`;
    if (b.type === "text") {
      if (b.style !== "heading" && b.style !== "paragraph") return `block ${i}: invalid text style`;
      if (typeof b.text !== "string") return `block ${i}: text must be a string`;
      if (b.align !== undefined && !["left", "center", "right"].includes(b.align)) return `block ${i}: align must be left/center/right`;
    } else if (b.type === "image") {
      if (typeof b.url !== "string" || !/^https?:\/\//.test(b.url)) return `block ${i}: image url must be http(s)`;
      if (b.alt !== undefined && typeof b.alt !== "string") return `block ${i}: alt must be a string`;
      if (b.width !== undefined && (typeof b.width !== "number" || b.width < 25 || b.width > 100)) return `block ${i}: width must be 25-100`;
      if (b.align !== undefined && !["left", "center", "right"].includes(b.align)) return `block ${i}: align must be left/center/right`;
      if (b.aspectRatio !== undefined && !["original", "banner", "square", "portrait"].includes(b.aspectRatio)) return `block ${i}: aspectRatio must be original/banner/square/portrait`;
    } else if (b.type === "socials") {
      if (!Array.isArray(b.links)) return `block ${i}: socials.links must be an array`;
      for (let j = 0; j < b.links.length; j += 1) {
        const l = b.links[j];
        if (!l || typeof l !== "object") return `block ${i}: socials.links[${j}] not an object`;
        if (typeof l.label !== "string" || l.label.trim() === "") return `block ${i}: socials.links[${j}].label required`;
        if (typeof l.url !== "string" || !/^https?:\/\//i.test(l.url)) return `block ${i}: socials.links[${j}].url must be http(s)`;
      }
      if (b.align !== undefined && !["left", "center", "right"].includes(b.align)) return `block ${i}: align must be left/center/right`;
    } else if (b.type === "button") {
      if (typeof b.text !== "string" || b.text.trim() === "") return `block ${i}: button text required`;
      if (typeof b.url !== "string" || !/^https?:\/\//.test(b.url)) return `block ${i}: button url must be http(s)`;
      if (b.caption !== undefined && b.caption !== null && typeof b.caption !== "string") return `block ${i}: caption must be string or null`;
      if (b.size !== undefined) {
        const okSize = typeof b.size === "number"
          ? b.size >= 50 && b.size <= 150
          : ["small", "medium", "large"].includes(b.size);
        if (!okSize) return `block ${i}: size must be a number 50-150`;
      }
      if (b.bgColor !== undefined && b.bgColor !== null && !/^#[0-9a-f]{6}$/i.test(b.bgColor)) return `block ${i}: bgColor must be #RRGGBB hex`;
      if (b.align !== undefined && !["left", "center", "right"].includes(b.align)) return `block ${i}: align must be left/center/right`;
    } else if (b.type === "pullup_event" || b.type === "discover_event") {
      // Event-card snapshot block. Two shapes accepted:
      //   1. Multi-event:  { events: [{ title, imageUrl, url, spotifyUrl, ... }, ...] }
      //   2. Legacy single: top-level { title, imageUrl, url, spotifyUrl, ... }
      if (b.layout !== undefined && !["big", "grid2", "list"].includes(b.layout)) {
        return `block ${i}: layout must be big | grid2 | list`;
      }
      function checkOne(ev, prefix) {
        if (!ev || typeof ev !== "object") return `${prefix}: must be an object`;
        if (typeof ev.title !== "string" || ev.title.trim() === "") return `${prefix}: title required`;
        if (ev.imageUrl !== undefined && ev.imageUrl !== null && ev.imageUrl !== "" && !/^https?:\/\//i.test(ev.imageUrl)) return `${prefix}: imageUrl must be http(s)`;
        if (ev.url !== undefined && ev.url !== null && ev.url !== "" && !/^https?:\/\//i.test(ev.url)) return `${prefix}: url must be http(s)`;
        if (ev.spotifyUrl !== undefined && ev.spotifyUrl !== null && ev.spotifyUrl !== "" && !/^https?:\/\//i.test(ev.spotifyUrl)) return `${prefix}: spotifyUrl must be http(s)`;
        if (ev.hostedBy !== undefined && ev.hostedBy !== null && typeof ev.hostedBy !== "string") return `${prefix}: hostedBy must be a string`;
        return null;
      }
      if (Array.isArray(b.events)) {
        if (b.events.length === 0) return `block ${i}: at least one event required`;
        if (b.events.length > 12) return `block ${i}: too many events (max 12)`;
        for (let j = 0; j < b.events.length; j += 1) {
          const err = checkOne(b.events[j], `block ${i}.events[${j}]`);
          if (err) return err;
        }
      } else {
        const err = checkOne(b, `block ${i}`);
        if (err) return err;
      }
    } else {
      return `block ${i}: unknown type "${b.type}"`;
    }
  }
  if (tc.signoff !== undefined && typeof tc.signoff !== "string") return "signoff must be a string";
  if (tc.greeting !== undefined && typeof tc.greeting !== "string") return "greeting must be a string";
  if (tc.greetingAlign !== undefined && !["left", "center", "right"].includes(tc.greetingAlign)) return "greetingAlign must be left/center/right";
  return null;
}

// POST /host/crm/campaigns - Create email campaign
app.post("/host/crm/campaigns", requireAuth, async (req, res) => {
  try {
    const {
      templateType = "event",
      eventId,
      subject,
      templateContent = {},
      filterCriteria = {},
    } = req.body;

    // Validate required fields
    if (!subject) {
      return res.status(400).json({ error: "Subject is required" });
    }

    if (templateType === "event" && !eventId) {
      return res
        .status(400)
        .json({ error: "Event ID is required for event campaigns" });
    }

    if (templateType === "followup" || templateType === "event") {
      if (templateType === "followup" && !eventId) {
        return res.status(400).json({ error: "eventId is required for follow-up campaigns" });
      }
      // Block-based payloads (both event and followup) share validation.
      // Legacy event campaigns without blocks bypass this check.
      if (Array.isArray(templateContent?.blocks)) {
        const err = validateFollowupTemplateContent(templateContent);
        if (err) {
          return res.status(400).json({ error: "Invalid templateContent", message: err });
        }
      }
    } else {
      return res.status(400).json({ error: `Unknown templateType: ${templateType}` });
    }

    // Get event for name generation
    let event = null;
    let campaignName = `Campaign - ${new Date().toLocaleDateString()}`;

    if (eventId) {
      const { findEventById } = await import("./data.js");
      event = await findEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      campaignName = `Event Campaign - ${
        event.title
      } - ${new Date().toLocaleDateString()}`;
    }

    // Get recipients count using filterCriteria — count only deliverable
    // contacts (has email, not unsubscribed, not on suppression list) so the
    // number the host sees on the confirm dialog matches what actually sends.
    const { getPeopleWithFilters } = await import("./data.js");
    const result = await getPeopleWithFilters(
      req.user.id,
      filterCriteria,
      "created_at",
      "desc",
      1, // Just need count
      0,
      { sendableOnly: true },
    );

    const totalRecipients = result.total || 0;

    // Create campaign
    const { createEmailCampaign } = await import("./data.js");
    const campaign = await createEmailCampaign({
      userId: req.user.id,
      name: campaignName,
      templateType,
      eventId,
      subject,
      templateContent,
      filterCriteria,
      totalRecipients,
    });

    emitIntent({
      hostId: req.user.id,
      tool: "draft_campaign",
      args: { templateType, eventId, subject, templateContent, filterCriteria },
      source: sourceFromRequest(req),
      target: { type: "campaign", id: campaign.id },
      result: { totalRecipients, status: campaign.status },
    });

    res.status(201).json({
      campaignId: campaign.id,
      totalRecipients,
      status: campaign.status,
    });
  } catch (error) {
    console.error("Error creating email campaign:", error);
    res.status(500).json({
      error: "Failed to create campaign",
      message: error.message,
    });
  }
});

// PATCH /host/crm/campaigns/:campaignId - Update a campaign that hasn't sent
// yet. Lets the host (or the MCP coach) save edits to a draft without
// recreating the row. Only writes the columns the client sends.
app.patch("/host/crm/campaigns/:campaignId", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { getEmailCampaign } = await import("./data.js");
    const existing = await getEmailCampaign(campaignId, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    if (existing.status === "sent" || existing.status === "sending") {
      return res.status(409).json({
        error: "Campaign already sent",
        message: "Sent or sending campaigns can't be edited.",
      });
    }

    const allowed = ["subject", "templateType", "templateContent", "filterCriteria", "eventId"];
    const updates = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        updates[key] = req.body[key];
      }
    }

    if (updates.templateContent && Array.isArray(updates.templateContent.blocks)) {
      const err = validateFollowupTemplateContent(updates.templateContent);
      if (err) {
        return res.status(400).json({ error: "Invalid templateContent", message: err });
      }
    }

    // If the filter changed, recompute totalRecipients so the host sees the
    // count that matches what would actually send right now.
    let totalRecipients = existing.totalRecipients;
    if (updates.filterCriteria) {
      const { getPeopleWithFilters } = await import("./data.js");
      const result = await getPeopleWithFilters(
        req.user.id,
        updates.filterCriteria,
        "created_at",
        "desc",
        1,
        0,
        { sendableOnly: true },
      );
      totalRecipients = result.total || 0;
    }

    const dbPatch = { updated_at: new Date().toISOString() };
    if ("subject" in updates) dbPatch.subject = updates.subject;
    if ("templateType" in updates) dbPatch.template_type = updates.templateType;
    if ("templateContent" in updates) dbPatch.template_content = updates.templateContent;
    if ("filterCriteria" in updates) {
      dbPatch.filter_criteria = updates.filterCriteria;
      dbPatch.total_recipients = totalRecipients;
    }
    if ("eventId" in updates) dbPatch.event_id = updates.eventId;

    const { supabase } = await import("./supabase.js");
    const { data, error } = await supabase
      .from("campaign_campaigns")
      .update(dbPatch)
      .eq("id", campaignId)
      .eq("user_id", req.user.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating campaign:", error);
      return res.status(500).json({ error: "Failed to update campaign", message: error.message });
    }

    emitIntent({
      hostId: req.user.id,
      tool: "update_campaign",
      args: { campaignId, ...updates },
      source: sourceFromRequest(req),
      target: { type: "campaign", id: data.id },
      result: { totalRecipients: data.total_recipients || 0, status: data.status },
    });

    res.json({
      campaignId: data.id,
      totalRecipients: data.total_recipients || 0,
      status: data.status,
    });
  } catch (error) {
    console.error("Error patching campaign:", error);
    res.status(500).json({ error: "Failed to update campaign", message: error.message });
  }
});

// POST /host/crm/campaigns/:campaignId/send - Send campaign
app.post(
  "/host/crm/campaigns/:campaignId/send",
  requireAuth,
  async (req, res) => {
    try {
      const { campaignId } = req.params;
      const { sendCampaignInBatches } = await import(
        "./services/campaignSender.js"
      );
      const { getEmailCampaign } = await import("./data.js");

      // Verify campaign ownership
      const campaign = await getEmailCampaign(campaignId, req.user.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Check if already sent
      if (campaign.status === "sent") {
        return res.status(400).json({
          error: "Campaign has already been sent",
        });
      }

      // Update status to "sending" and start async sending
      // Don't await - return immediately and let it process in background
      sendCampaignInBatches(campaignId, req.user.id).catch((error) => {
        console.error("Error sending campaign in background:", error);
        // Status will be updated to "failed" by sendCampaignInBatches
      });

      emitIntent({
        hostId: req.user.id,
        tool: "send_campaign",
        args: { campaignId },
        source: sourceFromRequest(req),
        target: { type: "campaign", id: campaignId },
        result: { subject: campaign.subject, totalRecipients: campaign.totalRecipients },
      });

      res.json({
        message: "Campaign sending started",
        campaignId,
        status: "sending",
      });
    } catch (error) {
      console.error("Error starting campaign send:", error);
      res.status(500).json({
        error: "Failed to start campaign send",
        message: error.message,
      });
    }
  }
);

// GET /host/crm/campaigns - List campaigns for the authenticated host.
// Newest first. Optional ?status=draft|sending|sent|failed|scheduled.
app.get("/host/crm/campaigns", requireAuth, async (req, res) => {
  try {
    const { listEmailCampaigns } = await import("./data.js");
    const status = req.query.status ? String(req.query.status) : undefined;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const items = await listEmailCampaigns(req.user.id, { status, limit, offset });
    res.json(items);
  } catch (error) {
    console.error("Error listing campaigns:", error);
    res.status(500).json({ error: "Failed to list campaigns", message: error.message });
  }
});

// GET /host/crm/campaigns/:campaignId - Get campaign status
app.get("/host/crm/campaigns/:campaignId", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { getEmailCampaign } = await import("./data.js");

    const campaign = await getEmailCampaign(campaignId, req.user.id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Per-link click breakdown — join email_clicks to email_outbox via tracking_id,
    // filter by the same campaign_tag the sender writes (`host_campaign_${id}`).
    const { supabase } = await import("./supabase.js");
    const campaignTag = `host_campaign_${campaign.id}`;
    let linkBreakdown = [];
    try {
      const { data: outboxRows = [] } = await supabase
        .from("email_outbox")
        .select("tracking_id")
        .eq("campaign_tag", campaignTag);
      const trackingIds = outboxRows.map((r) => r.tracking_id).filter(Boolean);
      if (trackingIds.length > 0) {
        const { data: clickRows = [] } = await supabase
          .from("email_clicks")
          .select("link_url, link_label")
          .in("tracking_id", trackingIds);
        const map = new Map();
        for (const r of clickRows || []) {
          const label = r.link_label || "";
          const url = r.link_url || "";
          const key = label + "|" + url;
          const existing = map.get(key) || { linkLabel: label, linkUrl: url, clicks: 0 };
          existing.clicks += 1;
          map.set(key, existing);
        }
        linkBreakdown = Array.from(map.values()).sort((a, b) => b.clicks - a.clicks);
      }
    } catch (err) {
      console.error("[campaign-detail] linkBreakdown query failed:", err.message);
    }

    res.json({
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      status: campaign.status,
      totalRecipients: campaign.totalRecipients,
      totalSent: campaign.totalSent,
      totalFailed: campaign.totalFailed,
      createdAt: campaign.createdAt,
      sentAt: campaign.sentAt,
      linkBreakdown,
      templateType: campaign.templateType,
      templateContent: campaign.templateContent,
      eventId: campaign.eventId,
    });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    res.status(500).json({
      error: "Failed to fetch campaign",
      message: error.message,
    });
  }
});

// ---------------------------
// PROTECTED: Create payment intent for event (requires auth, verifies ownership)
// ---------------------------
app.post(
  "/host/events/:eventId/create-payment",
  requireAuth,
  async (req, res) => {
    const { eventId } = req.params;
    const { email, name, rsvpId } = req.body;

    try {
      // Get event
      const event = await findEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Only owner, admin, or editor can create payment links for guests
      const canEdit = await canEditGuests(req.user.id, event.id);
      if (!canEdit) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have permission to create payments for this event.",
        });
      }

      if (event.ticketType !== "paid" || !event.ticketPrice) {
        return res.status(400).json({ error: "Event is not a paid event" });
      }

      // Get or create Stripe customer
      const customerId = await getOrCreateStripeCustomer(email, name);

      // Find person to get personId
      const person = await findPersonByEmail(email);
      if (!person) {
        return res.status(404).json({ error: "Person not found" });
      }

      // Get host's Stripe connected account ID (if connected)
      const hostProfile = await getUserProfile(event.hostId);
      const connectedAccountId = hostProfile.stripeConnectedAccountId || null;

      // Calculate ticket amount (what host receives)
      const ticketAmount = Number(event.ticketPrice);
      if (!ticketAmount || ticketAmount <= 0) {
        return res.status(400).json({ error: "Invalid ticket price" });
      }

      // Calculate platform service fee (paid by customer, not deducted from host)
      // Platform fee percentage from environment variable (default: 3%)
      const platformFeePercentage =
        parseFloat(
          process.env.TEST_PLATFORM_FEE_PERCENTAGE ||
            process.env.PLATFORM_FEE_PERCENTAGE ||
            "3"
        ) / 100;
      const platformFeeAmount = Math.round(
        ticketAmount * platformFeePercentage
      );

      // Customer pays: ticket amount + platform service fee
      const customerTotalAmount = ticketAmount + platformFeeAmount;

      console.log("[Payment] Platform fee calculation:", {
        ticketAmount,
        platformFeePercentage: `${(platformFeePercentage * 100).toFixed(1)}%`,
        platformFeeAmount,
        customerTotalAmount,
        amountToHost: ticketAmount, // Host receives full ticket amount
      });

      // Create payment intent with connected account if available
      const currency = (event.ticketCurrency || "usd").toLowerCase();
      const paymentIntent = await createPaymentIntent({
        customerId,
        amount: customerTotalAmount, // Customer pays ticket + service fee
        eventId: event.id,
        eventTitle: event.title,
        personId: person.id,
        connectedAccountId: connectedAccountId,
        applicationFeeAmount: platformFeeAmount, // Platform fee (customer pays this)
        currency,
      });

      // Create payment record
      const payment = await createPayment({
        // Payments are owned by the host (auth user),
        // attendees are linked via rsvpId.
        userId: event.hostId,
        eventId: event.id,
        rsvpId: rsvpId || null,
        stripePaymentIntentId: paymentIntent.id,
        stripeCustomerId: customerId,
        amount: customerTotalAmount, // Customer pays: ticket + service fee
        currency,
        status: "pending",
        description: `Ticket for ${event.title}`,
      });

      // Include fee breakdown in response for frontend display
      const paymentBreakdown = {
        ticketAmount,
        platformFeeAmount,
        customerTotalAmount,
        platformFeePercentage: platformFeePercentage * 100,
      };

      res.json({
        client_secret: paymentIntent.client_secret,
        payment_id: payment.id,
        payment_intent_id: paymentIntent.id,
        payment_breakdown: paymentBreakdown, // Fee breakdown for frontend display
      });
    } catch (error) {
      console.error("Payment creation error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to create payment" });
    }
  }
);

// ---------------------------
// PROTECTED: Get payments for user (requires auth)
// ---------------------------
app.get("/host/payments", requireAuth, async (req, res) => {
  try {
    // Use authenticated user's ID
    const userId = req.user.id;

    const userPayments = await getPaymentsForUser(userId);
    res.json({ payments: userPayments });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// ---------------------------
// PROTECTED: Get payments for event (requires auth, verifies ownership)
// ---------------------------
app.get("/host/events/:eventId/payments", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;

    // Verify ownership
    const event = await findEventById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });
    const { isHost } = await isUserEventHost(req.user.id, event.id);
    if (!isHost) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    const eventPayments = await getPaymentsForEvent(eventId);
    res.json({ payments: eventPayments });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// ---------------------------
// PUBLIC: Lightweight payment status lookup by payment ID
// Used by attendee-side frontend to wait for webhook-confirmed status
// ---------------------------
app.get("/payments/:paymentId/status", async (req, res) => {
  try {
    const { paymentId } = req.params;
    if (!paymentId) {
      return res.status(400).json({ error: "paymentId is required" });
    }

    const payment = await findPaymentById(paymentId);
    if (!payment) {
      return res.status(404).json({ error: "not_found" });
    }

    // Only expose non-sensitive fields needed by the public frontend
    res.json({
      id: payment.id,
      status: payment.status, // "pending" | "succeeded" | "failed" | "refunded" | "canceled"
      amount: payment.amount,
      currency: payment.currency,
      eventId: payment.eventId,
      rsvpId: payment.rsvpId,
    });
  } catch (error) {
    console.error("Error fetching payment status:", error);
    res.status(500).json({ error: "Failed to fetch payment status" });
  }
});

// ---------------------------
// PROTECTED: Create refund for a payment
// Requires auth, verifies event ownership
// ---------------------------
app.post(
  "/host/events/:eventId/payments/:paymentId/refund",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, paymentId } = req.params;
      const { amount = null, reason = null, moveToWaitlist = true } = req.body;

      // Verify event exists
      const event = await findEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Verify ownership - only owner or admin can process refunds (or editor; use canEditGuests)
      const canEdit = await canEditGuests(req.user.id, event.id);
      if (!canEdit) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have permission to refund for this event.",
        });
      }
      const payment = await findPaymentById(paymentId);
      if (!payment || payment.eventId !== eventId) {
        return res.status(404).json({ error: "Payment not found" });
      }

      // Verify payment can be refunded
      if (payment.status !== "succeeded") {
        return res.status(400).json({
          error: "invalid_payment_status",
          message: `Payment status is "${payment.status}". Only succeeded payments can be refunded.`,
        });
      }

      if (
        payment.status === "refunded" &&
        payment.refundedAmount >= payment.amount
      ) {
        return res.status(400).json({
          error: "already_refunded",
          message: "Payment is already fully refunded",
        });
      }

      // Calculate refund amount (null/undefined = full refund)
      // If amount is provided, it should be in dollars/cents format - convert to cents
      // If null/undefined, pass null to createRefund to calculate remaining amount
      let refundAmountInCents = null;
      if (amount !== null && amount !== undefined && amount !== "") {
        const amountNum = Number(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
          return res.status(400).json({
            error: "invalid_amount",
            message: "Refund amount must be a positive number",
          });
        }
        // Assume amount is in dollars, convert to cents
        refundAmountInCents = Math.round(amountNum * 100);
      }

      // Map refund reason to Stripe's accepted values
      // Stripe only accepts: 'duplicate', 'fraudulent', or 'requested_by_customer'
      const stripeReason =
        reason === "requested_by_host"
          ? "requested_by_customer" // Map host-initiated refunds to customer-requested
          : reason === "duplicate" || reason === "fraudulent"
          ? reason
          : "requested_by_customer"; // Default fallback

      // Create refund via Stripe
      console.log("[Refund] Initiating refund:", {
        paymentId: payment.id,
        paymentIntentId: payment.stripePaymentIntentId,
        refundAmount: refundAmountInCents
          ? `${refundAmountInCents / 100} (${refundAmountInCents} cents)`
          : "full (null - will calculate remaining)",
        originalReason: reason,
        stripeReason: stripeReason,
      });

      let refund;
      try {
        refund = await createRefund(
          payment.stripePaymentIntentId,
          refundAmountInCents, // Pass null for full refund, or amount in cents
          stripeReason
        );

        console.log("[Refund] Refund created successfully:", {
          refundId: refund.id,
          amount: refund.amount,
          status: refund.status,
        });
      } catch (error) {
        // Handle "already refunded" errors (both from our checks and Stripe)
        if (
          error.message?.includes("already been refunded") ||
          error.message?.includes("already fully refunded") ||
          error.message === "Charge has already been refunded"
        ) {
          return res.status(400).json({
            error: "already_refunded",
            message: "This payment has already been fully refunded.",
          });
        }

        // Handle specific Stripe errors
        if (error.type === "StripeInvalidRequestError") {
          if (error.code === "charge_already_refunded") {
            return res.status(400).json({
              error: "already_refunded",
              message: "This payment has already been fully refunded.",
            });
          }
          if (error.code === "parameter_invalid_integer") {
            return res.status(400).json({
              error: "invalid_amount",
              message: `Invalid refund amount: ${error.param || "amount"}`,
            });
          }
          // Generic Stripe validation error
          return res.status(400).json({
            error: "stripe_error",
            message: error.message || "Stripe validation error",
            code: error.code,
          });
        }
        // Re-throw other errors to be handled by global error handler
        throw error;
      }

      // Update payment status immediately (webhook will also update it)
      // This provides immediate feedback, webhook ensures consistency
      const isFullRefund =
        !refundAmountInCents || refund.amount >= payment.amount;
      await updatePayment(payment.id, {
        status: isFullRefund ? "refunded" : "succeeded", // Partial refunds stay "succeeded"
        refundedAmount: refund.amount,
        refundedAt: new Date().toISOString(),
      });

      // Update RSVP status if payment is linked to an RSVP
      if (payment.rsvpId) {
        const rsvp = await findRsvpById(payment.rsvpId);
        if (rsvp) {
          // Update payment status in RSVP
          await updateRsvp(
            payment.rsvpId,
            {
              paymentStatus: isFullRefund ? "refunded" : "paid",
            },
            { isOnlyPaymentUpdate: true }
          );

          // If full refund and moveToWaitlist is true, move guest to waitlist
          if (isFullRefund && moveToWaitlist) {
            console.log("[Refund] Moving RSVP to waitlist after full refund:", {
              rsvpId: payment.rsvpId,
            });
            await updateRsvp(
              payment.rsvpId,
              {
                bookingStatus: "WAITLIST",
                status: "waitlist",
              },
              { forceConfirm: false }
            );
          }
        }
      }

      // Send refund notification email to guest
      if (payment.rsvpId) {
        try {
          const rsvpForEmail = await findRsvpById(payment.rsvpId);
          const personForEmail = rsvpForEmail ? await findPersonById(rsvpForEmail.personId) : null;
          if (personForEmail?.email) {
            let hostBrand = {};
            try {
              const hostProfile = await getUserProfile(event.hostId);
              hostBrand = {
                brandName: hostProfile?.brand || "",
                brandWebsite: hostProfile?.brandWebsite || "",
                contactEmail: hostProfile?.contactEmail || "",
              };
            } catch {}

            await sendEmail({
              to: personForEmail.email,
              subject: isFullRefund ? "Your payment has been refunded" : "Partial refund processed",
              html: refundEmail({
                name: rsvpForEmail.name || personForEmail.name || "there",
                eventTitle: event.title,
                imageUrl: event.coverImageUrl || event.imageUrl || "",
                slug: event.slug || "",
                frontendUrl: getFrontendUrl(),
                refundAmount: (refund.amount / 100).toFixed(2),
                currency: refund.currency || event.ticketCurrency || "usd",
                isFullRefund,
                ...hostBrand,
              }),
            });
          }
        } catch (emailErr) {
          console.error("Failed to send refund email:", emailErr);
        }
      }

      emitIntent({
        hostId: req.user.id,
        tool: "refund_payment",
        args: { eventId: req.params.eventId, paymentId: req.params.paymentId, amount: req.body?.amount },
        source: sourceFromRequest(req),
        target: { type: "payment", id: req.params.paymentId },
        result: { refundId: refund.id, amount: refund.amount, isFullRefund },
      });

      return res.json({
        success: true,
        refund: {
          id: refund.id,
          amount: refund.amount,
          status: refund.status,
          currency: refund.currency,
        },
        payment: {
          id: payment.id,
          status: isFullRefund ? "refunded" : "succeeded",
          refundedAmount: refund.amount,
        },
        isFullRefund,
        emailSent: true,
      });
    } catch (error) {
      console.error("Error creating refund:", error);
      return res.status(500).json({
        error: "refund_failed",
        message: error.message || "Failed to create refund",
      });
    }
  }
);

// ---------------------------
// PUBLIC: Get full payment details (including receipt URL)
// Used by success page to display complete payment information
// ---------------------------
app.get("/payments/:paymentId/details", async (req, res) => {
  try {
    const { paymentId } = req.params;
    if (!paymentId) {
      return res.status(400).json({ error: "paymentId is required" });
    }

    const payment = await findPaymentById(paymentId);
    if (!payment) {
      return res.status(404).json({ error: "not_found" });
    }

    // Return full payment details (non-sensitive fields only)
    res.json({
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      description: payment.description,
      receiptUrl: payment.receiptUrl, // Stripe receipt URL
      paidAt: payment.paidAt, // ISO timestamp from database
      eventId: payment.eventId,
      rsvpId: payment.rsvpId,
    });
  } catch (error) {
    console.error("Error fetching payment details:", error);
    res.status(500).json({ error: "Failed to fetch payment details" });
  }
});

// ---------------------------
// PUBLIC: Verify PaymentIntent status from Stripe and update payment
// Fallback when webhook doesn't arrive (e.g., in local development)
// ---------------------------
app.post("/payments/verify/:paymentIntentId", async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    if (!paymentIntentId) {
      return res.status(400).json({ error: "paymentIntentId is required" });
    }

    console.log(
      "[Payment Verify] Checking PaymentIntent status:",
      paymentIntentId
    );

    // Retrieve PaymentIntent from Stripe
    const { getStripeSecretKey } = await import("./stripe.js");
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(getStripeSecretKey());

    let paymentIntent;
    try {
      // Expand charges to get receipt URL
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["charges"], // Expand charges to access receipt_url
      });
      console.log(
        "[Payment Verify] PaymentIntent status:",
        paymentIntent.status
      );
    } catch (error) {
      console.error("[Payment Verify] Error retrieving PaymentIntent:", error);
      return res.status(400).json({ error: "Invalid PaymentIntent ID" });
    }

    // If payment succeeded, manually trigger webhook handler logic
    if (paymentIntent.status === "succeeded") {
      console.log("[Payment Verify] Payment succeeded, triggering update...");
      const { handleStripeWebhook } = await import("./stripe.js");

      // Create a mock webhook event (with all required fields)
      const mockEvent = {
        type: "payment_intent.succeeded",
        id: `evt_verify_${Date.now()}`,
        created: Math.floor(Date.now() / 1000), // Unix timestamp
        livemode: false, // Test mode
        data: {
          object: paymentIntent,
        },
      };

      const result = await handleStripeWebhook(mockEvent);

      // Import data functions for payment lookup (used for receipt URL and redirect-based payments)
      const { findPaymentByStripePaymentIntentId, updatePayment } =
        await import("./data.js");

      // Extract receipt URL from charge if available and update payment
      // Stripe generates receipt URLs asynchronously, so we check here too
      const receiptUrl = paymentIntent.charges?.data?.[0]?.receipt_url || null;
      if (receiptUrl) {
        console.log(
          "[Payment Verify] Found receipt URL, ensuring it's stored:",
          receiptUrl
        );
        const payment = await findPaymentByStripePaymentIntentId(
          paymentIntentId
        );
        if (payment) {
          // Update receipt URL if not already set
          if (!payment.receiptUrl) {
            await updatePayment(payment.id, { receiptUrl });
            console.log("[Payment Verify] ✅ Receipt URL stored in database");
          } else {
            console.log("[Payment Verify] Receipt URL already stored");
          }
        }
      } else {
        console.log(
          "[Payment Verify] Receipt URL not yet available (Stripe generates it asynchronously)"
        );
      }

      if (result.processed) {
        console.log("[Payment Verify] ✅ Payment updated successfully");

        // Fetch full RSVP + event data for redirect-based payment methods (Klarna etc.)
        let rsvpData = null;
        let eventData = null;
        let paymentData = null;
        try {
          const dbPayment = await findPaymentByStripePaymentIntentId(paymentIntentId);
          if (dbPayment) {
            paymentData = {
              id: dbPayment.id,
              status: dbPayment.status,
              amount: dbPayment.amount,
              currency: dbPayment.currency,
              receiptUrl: receiptUrl || dbPayment.receiptUrl || null,
            };
            if (dbPayment.rsvpId) {
              const rsvp = await findRsvpById(dbPayment.rsvpId);
              if (rsvp) {
                const person = await findPersonById(rsvp.personId);
                rsvpData = {
                  name: rsvp.name || person?.name || null,
                  email: person?.email || null,
                  bookingStatus: rsvp.bookingStatus || "CONFIRMED",
                  wantsDinner: rsvp.wantsDinner || false,
                  partySize: rsvp.partySize || 1,
                  plusOnes: rsvp.plusOnes || 0,
                  dinnerPartySize: rsvp.dinnerPartySize || null,
                  dinnerTimeSlot: rsvp.dinnerTimeSlot || null,
                };
                eventData = await findEventById(rsvp.eventId);
              }
            }
          }
        } catch (lookupErr) {
          console.error("[Payment Verify] Error fetching RSVP/event data:", lookupErr);
        }

        return res.json({
          success: true,
          message: "Payment verified and updated",
          paymentIntentId: paymentIntent.id,
          status: paymentIntent.status,
          receiptUrl: receiptUrl || null,
          rsvp: rsvpData,
          event: eventData,
          payment: paymentData,
        });
      } else {
        console.error(
          "[Payment Verify] ❌ Failed to update payment:",
          result.error
        );
        return res.status(500).json({
          error: "Failed to update payment",
          details: result.error,
        });
      }
    } else {
      // Payment not succeeded yet
      console.log(
        "[Payment Verify] Payment not succeeded, status:",
        paymentIntent.status
      );
      return res.json({
        success: false,
        message: "Payment not succeeded yet",
        status: paymentIntent.status,
      });
    }
  } catch (error) {
    console.error("[Payment Verify] Error:", error);
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

// ---------------------------
// PROTECTED: Personal Access Tokens (PATs)
// ---------------------------
// Tokens are issued from a logged-in browser session and used by clients
// that can't run a browser-based Supabase flow (the PullUp MCP server, CLI
// scripts, etc.). Plaintext is returned ONCE at mint time and never again.
//
// Mint/list/revoke require a Supabase JWT (req.authType === "jwt"), not a
// PAT, so a stolen PAT can't escalate by spawning more PATs.
function requireJwtAuth(req, res, next) {
  if (req.authType !== "jwt") {
    return res.status(403).json({
      error: "forbidden",
      message: "Token management requires a browser session, not a PAT.",
    });
  }
  next();
}

app.post("/host/tokens", requireAuth, requireJwtAuth, async (req, res) => {
  try {
    const { name, expiresInDays } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name_required", message: "name is required" });
    }
    const days = expiresInDays != null ? Number(expiresInDays) : null;
    if (days != null && (!Number.isFinite(days) || days <= 0 || days > 3650)) {
      return res.status(400).json({
        error: "invalid_expires_in_days",
        message: "expiresInDays must be a positive number ≤ 3650.",
      });
    }
    const created = await createPersonalAccessToken({
      userId: req.user.id,
      name,
      expiresInDays: days,
    });
    // Plaintext is in `token` — surface it to the user immediately. We never
    // store it and can't recover it later.
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating PAT:", error);
    res.status(500).json({ error: "Failed to create token" });
  }
});

// GET /host/mcp/status — does this host have an MCP connection live?
// Used by the floating PullUp widget to decide between the "Connect MCP"
// promo and the "PullUp · N" coach pill. Cheap: counts active (not
// revoked, not expired) PATs — both manual and OAuth flows mint PATs, so
// one query covers both connection paths.
app.get("/host/mcp/status", requireAuth, async (req, res) => {
  try {
    const { listPersonalAccessTokensForUser } = await import("./data.js");
    const tokens = await listPersonalAccessTokensForUser(req.user.id);
    const now = Date.now();
    const active = tokens.filter((t) => {
      if (t.revokedAt) return false;
      if (t.expiresAt && new Date(t.expiresAt).getTime() <= now) return false;
      return true;
    });
    const lastUsedAt = active
      .map((t) => t.lastUsedAt)
      .filter(Boolean)
      .sort()
      .pop() || null;
    res.json({
      connected: active.length > 0,
      activeCount: active.length,
      lastUsedAt,
    });
  } catch (err) {
    console.error("Error in /host/mcp/status:", err);
    res.status(500).json({ error: "Failed to read MCP status" });
  }
});

app.get("/host/tokens", requireAuth, requireJwtAuth, async (req, res) => {
  try {
    const tokens = await listPersonalAccessTokensForUser(req.user.id);
    res.json(tokens);
  } catch (error) {
    console.error("Error listing PATs:", error);
    res.status(500).json({ error: "Failed to list tokens" });
  }
});

app.delete("/host/tokens/:id", requireAuth, requireJwtAuth, async (req, res) => {
  try {
    const ok = await revokePersonalAccessToken({ userId: req.user.id, tokenId: req.params.id });
    if (!ok) return res.status(404).json({ error: "not_found" });
    res.json({ revoked: true });
  } catch (error) {
    console.error("Error revoking PAT:", error);
    res.status(500).json({ error: "Failed to revoke token" });
  }
});

// ---------------------------
// PROTECTED: Get user profile
// ---------------------------
app.get("/host/profile", requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.id);
    res.json(profile);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ---------------------------
// PROTECTED: Update user profile
// ---------------------------
app.put("/host/profile", requireAuth, async (req, res) => {
  try {
    // Ensure the profile row exists. updateUserProfile is plain UPDATE — for
    // a brand-new user finishing onboarding, the row may not have been
    // lazy-created yet, which would silently no-op the save. getUserProfile
    // creates the default row if missing AND back-links any matching
    // sales_leads by email at the same time.
    await getUserProfile(req.user.id);
    const updates = req.body;
    const updated = await updateUserProfile(req.user.id, updates);

    // host_brief changes are the one profile field with a dedicated MCP tool
    // (set_host_brief), so log them distinctly. Other profile edits aren't
    // mirrored in MCP today; emit them under update_profile for completeness.
    if (Object.prototype.hasOwnProperty.call(updates || {}, "hostBrief")) {
      emitIntent({
        hostId: req.user.id,
        tool: "set_host_brief",
        args: { brief: updates.hostBrief },
        source: sourceFromRequest(req),
        target: { type: "profile", id: req.user.id },
        result: { length: (updates.hostBrief || "").length },
      });
    } else {
      emitIntent({
        hostId: req.user.id,
        tool: "update_profile",
        args: Object.keys(updates || {}).reduce((acc, k) => {
          // Don't log raw image data or sensitive fields verbatim.
          if (k === "avatarUrl" || k === "logoUrl") acc[k] = updates[k];
          else if (typeof updates[k] !== "string" || updates[k].length < 500) acc[k] = updates[k];
          return acc;
        }, {}),
        source: sourceFromRequest(req),
        target: { type: "profile", id: req.user.id },
      });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ---------------------------
// STRIPE CONNECT: Initiate onboarding via Account Links
// ---------------------------
app.post("/host/stripe/connect/initiate", requireAuth, async (req, res) => {
  try {
    const result = await initiateConnectOnboarding(req.user.id);

    if (result.alreadyComplete) {
      return res.json({
        alreadyComplete: true,
        accountId: result.accountId,
      });
    }

    res.json({ authorizationUrl: result.onboardingUrl });
  } catch (error) {
    console.error("Error initiating Stripe Connect onboarding:", error);
    res.status(500).json({ error: "Failed to initiate Stripe Connect" });
  }
});

// ---------------------------
// STRIPE CONNECT: Get connection status
// ---------------------------
app.get("/host/stripe/connect/status", requireAuth, async (req, res) => {
  try {
    const status = await getConnectedAccountStatus(req.user.id);
    res.json(status);
  } catch (error) {
    console.error("Error getting Stripe Connect status:", error);
    res.status(500).json({ error: "Failed to get Stripe Connect status" });
  }
});

// ---------------------------
// STRIPE CONNECT: Disconnect account
// ---------------------------
app.post("/host/stripe/connect/disconnect", requireAuth, async (req, res) => {
  try {
    const result = await disconnectStripeAccount(req.user.id);
    res.json(result);
  } catch (error) {
    console.error("Error disconnecting Stripe account:", error);
    res.status(500).json({ error: "Failed to disconnect Stripe account" });
  }
});

// ---------------------------
// Helper: Upload hostedby logos from sections to Supabase Storage
// Replaces base64 data URLs with storage URLs so JSONB stays small
// ---------------------------
async function processHostedByLogos(eventId, sections) {
  if (!Array.isArray(sections)) return sections;

  const hostedByIdx = sections.findIndex(
    (s) => s.type === "hostedby" && s.logo && s.logo.startsWith("data:image/")
  );
  if (hostedByIdx === -1) return sections; // nothing to upload

  const section = sections[hostedByIdx];
  const base64Data = section.logo.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  // Enforce 500KB limit
  if (buffer.length > 512 * 1024) {
    throw new Error("Hosted-by logo must be under 500KB. Please use a smaller image.");
  }

  const mimeMatch = section.logo.match(/data:image\/(\w+);base64/);
  const extension = mimeMatch ? mimeMatch[1] : "png";
  const fileName = `${eventId}/hostedby_logo.${extension}`;

  const { supabase } = await import("./supabase.js");
  const { error } = await supabase.storage
    .from("event-images")
    .upload(fileName, buffer, {
      contentType: `image/${extension}`,
      upsert: true,
    });

  if (error) {
    console.error("Hosted-by logo upload error:", error);
    throw new Error("Failed to upload hosted-by logo");
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from("event-images")
    .getPublicUrl(fileName);

  const updated = [...sections];
  updated[hostedByIdx] = { ...updated[hostedByIdx], logo: publicUrl };
  return updated;
}

// ---------------------------
// PROTECTED: Upload event image
// ---------------------------
app.post("/host/events/:eventId/image", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { imageData, storagePath } = req.body;

    if (!imageData && !storagePath) {
      return res.status(400).json({ error: "imageData or storagePath is required" });
    }

    // Verify event ownership - only owners can upload event images
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    // Only owner or admin can upload event images
    const allowed = await canEditEvent(req.user.id, eventId);
    if (!allowed) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only the event owner or admin can upload event images.",
      });
    }

    const { supabase } = await import("./supabase.js");
    let fileName;

    if (storagePath) {
      // Direct-upload flow: client already uploaded; we just record the path.
      if (!storagePath.startsWith(`${eventId}/`)) {
        return res.status(400).json({ error: "Invalid storage path" });
      }
      fileName = storagePath;
    } else {
      // Legacy base64 path.
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      const mimeMatch = imageData.match(/data:image\/(\w+);base64/);
      const extension = mimeMatch ? mimeMatch[1] : "png";
      fileName = `${eventId}/image.${extension}`;

      const { error } = await supabase.storage
        .from("event-images")
        .upload(fileName, buffer, {
          contentType: `image/${extension}`,
          upsert: true,
        });

      if (error) {
        console.error("Storage upload error:", error);
        return res.status(500).json({ error: "Failed to upload image" });
      }
    }

    // Store just the file path in the database. Sync cover_image_url too so
    // that a user-uploaded custom thumbnail overrides any auto-generated low-res
    // video thumb (otherwise OG previews/emails keep using the old thumbnail).
    await supabase
      .from("events")
      .update({ cover_image_url: fileName })
      .eq("id", eventId);
    const updated = await updateEvent(eventId, {
      imageUrl: fileName,
    });

    // Generate URL for immediate return (try signed first, fallback to public)
    let imageUrl = null;
    try {
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from("event-images")
        .createSignedUrl(fileName, 3600); // 1 hour for response

      if (!urlError && signedUrlData?.signedUrl) {
        imageUrl = signedUrlData.signedUrl;
      }
    } catch (error) {
      console.error("Signed URL error:", error);
    }

    // Fallback to public URL if signed URL fails
    if (!imageUrl) {
      const {
        data: { publicUrl },
      } = supabase.storage.from("event-images").getPublicUrl(fileName);
      imageUrl = publicUrl;
    }

    // Return event with the generated URL
    const eventWithUrl = {
      ...updated,
      imageUrl: imageUrl,
    };

    emitIntent({
      hostId: req.user.id,
      tool: "upload_event_image",
      // Strip the binary payload — replay-by-reference uses imageUrl only.
      args: { eventId: req.params.eventId, imageUrl },
      source: sourceFromRequest(req),
      target: { type: "event", id: req.params.eventId },
      result: { imageUrl },
    });

    res.json(eventWithUrl);
  } catch (error) {
    console.error("Error uploading event image:", error);
    res.status(500).json({ error: "Failed to upload event image" });
  }
});

// GET /host/crm/event-image-gallery - List host's event cover/media images for the picker
app.get("/host/crm/event-image-gallery", requireAuth, async (req, res) => {
  try {
    const items = await listHostEventImageGallery(req.user.id, { limit: 200 });
    return res.json({ items });
  } catch (err) {
    console.error("Event-image gallery error:", err);
    return res.status(500).json({ error: "Failed to load gallery" });
  }
});

// ---------------------------
// PROTECTED: Aggregate summaries for the MCP.
// ---------------------------
// All five endpoints below are thin wrappers around Postgres functions in
// migrations/022 and 023. Each is a single round-trip — no Node-side
// aggregation, no per-event fan-out. Used by the MCP get_*_summary tools
// so Claude can answer questions like "how much have I made", "are my
// events growing", "what happened this week" in one shot.
function clampInt(raw, def, min, max) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function makeRpcHandler(funcName, paramShape) {
  // paramShape: { topN: { default, min, max } } or { months: ... } etc.
  return async (req, res) => {
    try {
      const params = { p_user_id: req.user.id };
      for (const [key, spec] of Object.entries(paramShape)) {
        params[spec.pgName] = clampInt(req.query[key], spec.default, spec.min, spec.max);
      }
      const { supabase } = await import("./supabase.js");
      const { data, error } = await supabase.rpc(funcName, params);
      if (error) {
        console.error(`${funcName} RPC error:`, error);
        return res.status(500).json({ error: `Failed to load ${funcName}` });
      }
      return res.json(data || {});
    } catch (err) {
      console.error(`${funcName} handler error:`, err);
      return res.status(500).json({ error: `Failed to load ${funcName}` });
    }
  };
}

app.get("/host/crm/summary",  requireAuth, makeRpcHandler("host_crm_summary",        { topN:   { pgName: "p_top_n",  default: 5,  min: 1, max: 20 } }));
app.get("/host/crm/revenue",  requireAuth, makeRpcHandler("host_revenue_summary",    { topN:   { pgName: "p_top_n",  default: 5,  min: 1, max: 20 } }));
app.get("/host/crm/trends",   requireAuth, makeRpcHandler("host_attendance_trends",  { months: { pgName: "p_months", default: 12, min: 1, max: 60 } }));
app.get("/host/crm/segments", requireAuth, makeRpcHandler("host_audience_segments",  { topN:   { pgName: "p_top_n",  default: 5,  min: 1, max: 20 } }));
app.get("/host/crm/recent",   requireAuth, makeRpcHandler("host_recent_activity",    { days:   { pgName: "p_days",   default: 30, min: 1, max: 365 } }));
app.get("/host/crm/emails",   requireAuth, makeRpcHandler("host_email_summary",      { topN:   { pgName: "p_top_n",  default: 5,  min: 1, max: 20 } }));

// GET /host/actions/recent — the host's own action log (UI + chat), newest
// first. Backs the MCP get_recent_actions tool and the (future) "what did I
// do this week?" surface inside the app.
app.get("/host/actions/recent", requireAuth, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const sinceParam = req.query.since;
    let q = supabase
      .from("host_actions")
      .select("id, tool, args, source, target_type, target_id, result, created_at")
      .eq("host_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (sinceParam) {
      const sinceIso = new Date(sinceParam).toISOString();
      q = q.gte("created_at", sinceIso);
    }
    if (req.query.targetType) q = q.eq("target_type", String(req.query.targetType));
    if (req.query.targetId) q = q.eq("target_id", String(req.query.targetId));
    if (req.query.source) q = q.eq("source", String(req.query.source));
    const { data, error } = await q;
    if (error) {
      console.error("Error fetching host actions:", error);
      return res.status(500).json({ error: "Failed to fetch actions", message: error.message });
    }
    res.json({ items: data || [] });
  } catch (err) {
    console.error("Error in /host/actions/recent:", err);
    res.status(500).json({ error: "Failed to fetch actions", message: err.message });
  }
});

// GET /host/coach/actions — surface-aware one-tap action suggestions.
//
// Wraps the suggestion engine (analyzeEvent / analyzeCampaign /
// analyzeCrmSignals) and maps each suggestion key to a UI-friendly intent
// (navigate / modal / mcp). Returns up to `limit` items, top by score.
//
// Used by the in-product CoachActions widget — same brain that produces the
// MCP banner's "Next:" line, now rendered as buttons.
app.get("/host/coach/actions", requireAuth, async (req, res) => {
  try {
    const surface = String(req.query.surface || "").toLowerCase();
    const id = req.query.id ? String(req.query.id) : null;
    const limit = Math.min(5, Math.max(1, Number(req.query.limit) || 3));

    const {
      analyzeEvent,
      analyzeCampaign,
      analyzeCrmSignals,
    } = await import("./mcp/suggestions.js");
    const {
      keyToEventIntent,
      keyToCampaignIntent,
      keyToCrmIntent,
    } = await import("./services/coachIntents.js");
    const {
      findEventBySlug,
      findEventById,
      getEmailCampaign,
      getUserProfile,
    } = await import("./data.js");

    async function loadBrief() {
      try {
        const p = await getUserProfile(req.user.id);
        return p?.hostBrief || "";
      } catch {
        return "";
      }
    }

    let suggestions = [];
    let mapper = () => null;
    let ctx = {};

    if (surface === "event") {
      if (!id) return res.status(400).json({ error: "id required for surface=event" });
      const ev = (await findEventBySlug(id)) || (await findEventById(id));
      if (!ev) return res.status(404).json({ error: "Event not found" });
      const brief = await loadBrief();
      // Pull analytics for PUBLISHED events so perf_* suggestions surface
      // (capped waitlist, filling-up, quiet promo, weak campaigns). Loopback
      // through the auth'd REST endpoint so the analytics math stays in one
      // place. Best-effort — if it fails the non-perf keys still work.
      let analytics = null;
      if (ev.status === "PUBLISHED") {
        try {
          const PORT = process.env.PORT || 3001;
          const base = (
            process.env.PULLUP_INTERNAL_API_BASE || `http://127.0.0.1:${PORT}`
          ).replace(/\/+$/, "");
          const periodEnd = new Date();
          const periodStart = new Date(periodEnd.getTime() - 30 * 86400000);
          const q = new URLSearchParams({
            startDate: periodStart.toISOString(),
            endDate: periodEnd.toISOString(),
          });
          const r = await fetch(`${base}/host/events/${ev.id}/analytics?${q}`, {
            headers: { Authorization: req.headers.authorization || "" },
          });
          if (r.ok) analytics = await r.json();
        } catch (e) {
          console.warn("[coach] analytics fetch failed:", e?.message);
        }
      }
      const result = analyzeEvent({ event: ev, brief, media: [], allEvents: [], analytics });
      suggestions = result.suggestions || [];
      mapper = keyToEventIntent;
      ctx = { event: ev };
    } else if (surface === "campaign") {
      if (!id) return res.status(400).json({ error: "id required for surface=campaign" });
      const campaign = await getEmailCampaign(id, req.user.id);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const ev = campaign.eventId ? await findEventById(campaign.eventId).catch(() => null) : null;
      const brief = await loadBrief();
      const result = analyzeCampaign({ campaign, event: ev, history: {}, brief });
      suggestions = result.suggestions || [];
      mapper = keyToCampaignIntent;
      ctx = { campaign, event: ev };
    } else if (surface === "crm") {
      const brief = await loadBrief();
      // The CRM analyzer reads from segments + recent. Skip the heavy fetches
      // for v1 — pass empty defaults; the analyzer's brief-aware paths still
      // emit useful signals.
      const result = analyzeCrmSignals({ segments: null, recent: null, brief });
      suggestions = result.suggestions || [];
      mapper = keyToCrmIntent;
      ctx = {};
    } else {
      return res.status(400).json({
        error: "Unknown surface",
        message: "surface must be one of: event, campaign, crm",
      });
    }

    const items = [];
    for (const s of suggestions) {
      const intent = mapper(s.key, s, ctx);
      if (!intent) continue;
      items.push({
        key: s.key,
        headline: s.headline,
        why: s.why || null,
        intent,
        // destructive: false in v1 — none of today's suggestion keys map to a
        // destructive intent (no send/publish/delete buttons surfaced yet).
        destructive: false,
      });
      if (items.length >= limit) break;
    }

    res.json({ items, surface });
  } catch (err) {
    console.error("Coach actions error:", err);
    res.status(500).json({ error: "Failed to load coach actions", message: err.message });
  }
});

// POST /host/crm/follow-up-images - Upload an image for a follow-up campaign block
app.post("/host/crm/follow-up-images", requireAuth, async (req, res) => {
  try {
    const { imageData } = req.body;
    if (!imageData || typeof imageData !== "string") {
      return res.status(400).json({ error: "imageData is required" });
    }
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: "Image must be under 2MB" });
    }
    const mimeMatch = imageData.match(/data:image\/(\w+);base64/);
    const extension = mimeMatch ? mimeMatch[1] : "png";
    const fileName = `crm/${req.user.id}/${crypto.randomUUID()}.${extension}`;
    const { supabase } = await import("./supabase.js");
    const { error } = await supabase.storage
      .from("event-images")
      .upload(fileName, buffer, { contentType: `image/${extension}`, upsert: false });
    if (error) {
      console.error("CRM image upload error:", error);
      return res.status(500).json({ error: "Failed to upload image" });
    }
    const { data: { publicUrl } } = supabase.storage.from("event-images").getPublicUrl(fileName);
    return res.json({ url: publicUrl });
  } catch (err) {
    console.error("CRM image upload exception:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ---------------------------
// PROTECTED: Upload event media (image/video/gif) for carousel
// ---------------------------
// ---------------------------
// Helper: pick a file extension from an uploaded MIME type.
// ---------------------------
function extensionFromMime(mimeType) {
  if (!mimeType) return "jpg";
  const ext = mimeType.split("/")[1];
  if (ext === "quicktime") return "mov";
  if (ext === "webm") return "webm";
  if (ext === "mp4") return "mp4";
  if (ext === "gif") return "gif";
  if (ext === "png") return "png";
  if (ext === "webp") return "webp";
  if (ext === "jpeg") return "jpg";
  return ext || "jpg";
}

// ---------------------------
// PROTECTED: Mint a Supabase signed upload URL for direct-to-storage upload.
// The browser then PUTs the file straight to Supabase, bypassing Express
// entirely — no base64, no body buffering, real progress events, much bigger
// files supported.
// ---------------------------
app.post("/host/events/:eventId/storage-token", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { mimeType, kind = "main", position } = req.body || {};

    const event = await findEventById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const allowed = await canEditEvent(req.user.id, eventId);
    if (!allowed) return res.status(403).json({ error: "Forbidden" });

    // Server controls the path so the signed URL is bound to a known location.
    const ext = kind === "thumb" ? "jpg" : extensionFromMime(mimeType);
    const pos = Number.isFinite(position) ? position : 0;
    const slug = kind === "thumb" ? "thumb" : "media";
    const path = `${eventId}/${slug}_${pos}_${Date.now()}.${ext}`;

    const { supabase } = await import("./supabase.js");
    const { data, error } = await supabase.storage
      .from("event-images")
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("[storage-token] createSignedUploadUrl failed", error);
      return res.status(500).json({ error: "Could not mint upload URL" });
    }

    res.json({
      path,
      token: data.token,
      uploadUrl: data.signedUrl,
    });
  } catch (err) {
    console.error("[storage-token] error", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/host/events/:eventId/media", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const {
      mediaData,
      mediaType,
      mimeType,
      position,
      thumbnailData,
      // New direct-upload flow: client has already uploaded the file(s) to
      // Supabase Storage and supplies the resulting paths instead of base64.
      storagePath,
      thumbnailStoragePath,
    } = req.body;

    const usingDirectUpload = !!storagePath;
    if (!mediaData && !usingDirectUpload) {
      return res.status(400).json({ error: "mediaData or storagePath is required" });
    }

    const event = await findEventById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const allowed = await canEditEvent(req.user.id, eventId);
    if (!allowed) return res.status(403).json({ error: "Forbidden" });

    const { supabase } = await import("./supabase.js");

    const type = mediaType || "image";
    const extension = extensionFromMime(mimeType);
    const pos = position ?? 0;

    let fileName;
    if (usingDirectUpload) {
      // Trust the client-supplied path only after verifying it lives under
      // this event's folder — prevents a malicious caller from claiming
      // someone else's storage object.
      if (!storagePath.startsWith(`${eventId}/`)) {
        return res.status(400).json({ error: "Invalid storage path" });
      }
      fileName = storagePath;
    } else {
      fileName = `${eventId}/media_${pos}_${Date.now()}.${extension}`;

      // Legacy base64 path — still here so older clients keep working.
      const base64Data = mediaData.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      let uploadContentType = mimeType || `image/${extension}`;
      if (uploadContentType === "video/quicktime") {
        uploadContentType = "video/mp4";
      }

      const { error: uploadError } = await supabase.storage
        .from("event-images")
        .upload(fileName, buffer, {
          contentType: uploadContentType,
          upsert: true,
        });

      if (uploadError) {
        console.error("Media upload error:", uploadError);
        return res.status(500).json({ error: "Failed to upload media" });
      }
    }

    // Thumbnail handling
    let thumbnailPath = null;
    if (thumbnailStoragePath) {
      if (!thumbnailStoragePath.startsWith(`${eventId}/`)) {
        return res.status(400).json({ error: "Invalid thumbnail path" });
      }
      thumbnailPath = thumbnailStoragePath;
    } else if (thumbnailData && (type === "video" || type === "gif")) {
      const thumbFileName = `${eventId}/thumb_${pos}_${Date.now()}.jpg`;
      const thumbBase64 = thumbnailData.replace(/^data:[^;]+;base64,/, "");
      const thumbBuffer = Buffer.from(thumbBase64, "base64");

      const { error: thumbError } = await supabase.storage
        .from("event-images")
        .upload(thumbFileName, thumbBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (!thumbError) {
        thumbnailPath = thumbFileName;
      }
    }

    // Check if this is the first media item (make it cover)
    const { data: existingMedia } = await supabase
      .from("event_media")
      .select("id")
      .eq("event_id", eventId);

    const isCover = !existingMedia || existingMedia.length === 0;

    // Insert into event_media table
    const { data: mediaRow, error: insertError } = await supabase
      .from("event_media")
      .insert({
        event_id: eventId,
        media_type: type,
        storage_path: fileName,
        thumbnail_path: thumbnailPath,
        position: pos,
        is_cover: isCover,
        mime_type: mimeType || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Media insert error:", insertError);
      return res.status(500).json({ error: "Failed to save media record" });
    }

    // If this is the cover, update events.cover_image_url and image_url
    if (isCover) {
      const coverPath = (type === "video" || type === "gif") && thumbnailPath ? thumbnailPath : fileName;
      await supabase.from("events").update({
        cover_image_url: coverPath,
        image_url: coverPath, // Always sync image_url so dashboard/emails/OG tags work
      }).eq("id", eventId);
    }

    // Generate public URL for response
    const { data: { publicUrl } } = supabase.storage.from("event-images").getPublicUrl(fileName);
    let thumbnailUrl = null;
    if (thumbnailPath) {
      const { data: { publicUrl: tUrl } } = supabase.storage.from("event-images").getPublicUrl(thumbnailPath);
      thumbnailUrl = tUrl;
    }

    emitIntent({
      hostId: req.user.id,
      tool: "upload_event_media",
      // Replay-by-reference: log the resulting URL, not the binary payload.
      args: { eventId: req.params.eventId, mediaUrl: publicUrl, mediaType: type, setAsCover: isCover },
      source: sourceFromRequest(req),
      target: { type: "event", id: req.params.eventId },
      result: { mediaId: mediaRow.id, url: publicUrl, isCover },
    });

    res.json({
      id: mediaRow.id,
      mediaType: type,
      url: publicUrl,
      thumbnailUrl,
      position: pos,
      isCover,
      mimeType: mimeType || null,
    });
  } catch (error) {
    console.error("Error uploading event media:", error);
    res.status(500).json({ error: "Failed to upload event media" });
  }
});

// ---------------------------
// PROTECTED: Mint a one-time browser upload link for a host who can't reach
// the file via the MCP envelope (claude.ai web, large videos, etc).
// The returned URL opens a tiny public page that talks to /public/upload-links
// endpoints below — the JWT is the only auth.
// ---------------------------
app.post("/host/events/:eventId/upload-link", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { expiresInHours } = req.body || {};

    const event = await findEventById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const allowed = await canEditEvent(req.user.id, eventId);
    if (!allowed) return res.status(403).json({ error: "Forbidden" });

    const hours = Math.min(24, Math.max(1, Number(expiresInHours) || 2));
    const token = generateWaitlistToken(
      { type: "media_upload", eventId },
      { expiresIn: `${hours}h` }
    );

    const baseUrl = getFrontendUrl();
    const uploadUrl = `${baseUrl}/upload/${encodeURIComponent(token)}`;
    res.json({ uploadUrl, expiresInHours: hours });
  } catch (err) {
    console.error("[upload-link] error", err);
    res.status(500).json({ error: "Failed to mint upload link" });
  }
});

// ---------------------------
// PUBLIC: token-protected upload-link endpoints. The JWT carries the eventId
// and a short expiry; no user session needed. Used by the /upload/:token
// browser page (MediaUploadPage.jsx) so a host can drop a local video onto
// an event without bouncing through claude.ai or logging in again.
// ---------------------------
function verifyMediaUploadToken(token) {
  const decoded = verifyWaitlistToken(token);
  if (!decoded || decoded.type !== "media_upload" || !decoded.eventId) {
    throw new Error("Invalid token");
  }
  return decoded;
}

app.get("/public/upload-links/:token", async (req, res) => {
  try {
    const decoded = verifyMediaUploadToken(req.params.token);
    const event = await findEventById(decoded.eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json({
      eventId: event.id,
      title: event.title,
      slug: event.slug,
      coverImageUrl: event.imageUrl || event.coverImageUrl || null,
      mediaSettings: event.mediaSettings || null,
    });
  } catch (err) {
    res.status(401).json({ error: err.message || "Invalid or expired token" });
  }
});

app.post("/public/upload-links/:token/storage-token", async (req, res) => {
  try {
    const decoded = verifyMediaUploadToken(req.params.token);
    const { mimeType, kind = "main", position } = req.body || {};

    const ext = kind === "thumb" ? "jpg" : extensionFromMime(mimeType);
    const pos = Number.isFinite(position) ? position : 0;
    const slug = kind === "thumb" ? "thumb" : "media";
    const path = `${decoded.eventId}/${slug}_${pos}_${Date.now()}.${ext}`;

    const { supabase } = await import("./supabase.js");
    const { data, error } = await supabase.storage
      .from("event-images")
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("[public-upload storage-token] createSignedUploadUrl", error);
      return res.status(500).json({ error: "Could not mint upload URL" });
    }
    res.json({ path, token: data.token, uploadUrl: data.signedUrl });
  } catch (err) {
    res.status(401).json({ error: err.message || "Invalid or expired token" });
  }
});

app.post("/public/upload-links/:token/register", async (req, res) => {
  try {
    const decoded = verifyMediaUploadToken(req.params.token);
    const {
      storagePath,
      thumbnailStoragePath,
      mediaType,
      mimeType,
      position,
      mediaSettings,
    } = req.body || {};

    if (!storagePath) {
      return res.status(400).json({ error: "storagePath is required" });
    }
    if (!storagePath.startsWith(`${decoded.eventId}/`)) {
      return res.status(400).json({ error: "Invalid storage path" });
    }
    if (thumbnailStoragePath && !thumbnailStoragePath.startsWith(`${decoded.eventId}/`)) {
      return res.status(400).json({ error: "Invalid thumbnail path" });
    }

    const { supabase } = await import("./supabase.js");
    const type = mediaType || "image";
    const pos = Number.isFinite(position) ? position : 0;

    const { data: existingMedia } = await supabase
      .from("event_media")
      .select("id")
      .eq("event_id", decoded.eventId);
    const isCover = !existingMedia || existingMedia.length === 0;

    const { data: mediaRow, error: insertError } = await supabase
      .from("event_media")
      .insert({
        event_id: decoded.eventId,
        media_type: type,
        storage_path: storagePath,
        thumbnail_path: thumbnailStoragePath || null,
        position: pos,
        is_cover: isCover,
        mime_type: mimeType || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[public-upload register] insert", insertError);
      return res.status(500).json({ error: "Failed to save media record" });
    }

    // First media item also seeds the event's cover so the dashboard,
    // emails, and OG tags pick it up immediately.
    const patchEvent = {};
    if (isCover) {
      const coverPath =
        (type === "video" || type === "gif") && thumbnailStoragePath
          ? thumbnailStoragePath
          : storagePath;
      patchEvent.cover_image_url = coverPath;
      patchEvent.image_url = coverPath;
    }
    if (mediaSettings && typeof mediaSettings === "object") {
      patchEvent.media_settings = mediaSettings;
    }
    if (Object.keys(patchEvent).length > 0) {
      await supabase.from("events").update(patchEvent).eq("id", decoded.eventId);
    }

    const { data: { publicUrl } } = supabase.storage
      .from("event-images")
      .getPublicUrl(storagePath);
    let thumbnailUrl = null;
    if (thumbnailStoragePath) {
      const { data: { publicUrl: tUrl } } = supabase.storage
        .from("event-images")
        .getPublicUrl(thumbnailStoragePath);
      thumbnailUrl = tUrl;
    }

    res.json({
      id: mediaRow.id,
      mediaType: type,
      url: publicUrl,
      thumbnailUrl,
      position: pos,
      isCover,
      mimeType: mimeType || null,
    });
  } catch (err) {
    console.error("[public-upload register] error", err);
    res.status(401).json({ error: err.message || "Invalid or expired token" });
  }
});

// ---------------------------
// PROTECTED: List event media
// ---------------------------
app.get("/host/events/:eventId/media", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { supabase } = await import("./supabase.js");

    const { data: mediaRows, error } = await supabase
      .from("event_media")
      .select("*")
      .eq("event_id", eventId)
      .order("position", { ascending: true });

    if (error) {
      return res.status(500).json({ error: "Failed to fetch media" });
    }

    const media = (mediaRows || []).map((m) => {
      const { data: { publicUrl } } = supabase.storage.from("event-images").getPublicUrl(m.storage_path);
      let thumbnailUrl = null;
      if (m.thumbnail_path) {
        const { data: { publicUrl: tUrl } } = supabase.storage.from("event-images").getPublicUrl(m.thumbnail_path);
        thumbnailUrl = tUrl;
      }
      return {
        id: m.id,
        mediaType: m.media_type,
        url: publicUrl,
        thumbnailUrl,
        position: m.position,
        isCover: m.is_cover,
        mimeType: m.mime_type,
      };
    });

    res.json(media);
  } catch (error) {
    console.error("Error fetching event media:", error);
    res.status(500).json({ error: "Failed to fetch event media" });
  }
});

// ---------------------------
// PROTECTED: Delete event media
// ---------------------------
app.delete("/host/events/:eventId/media/:mediaId", requireAuth, async (req, res) => {
  try {
    const { eventId, mediaId } = req.params;

    const event = await findEventById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const allowed = await canEditEvent(req.user.id, eventId);
    if (!allowed) return res.status(403).json({ error: "Forbidden" });

    const { supabase } = await import("./supabase.js");

    // Get the media row first
    const { data: mediaRow } = await supabase
      .from("event_media")
      .select("*")
      .eq("id", mediaId)
      .eq("event_id", eventId)
      .single();

    if (!mediaRow) return res.status(404).json({ error: "Media not found" });

    // Delete from storage
    await supabase.storage.from("event-images").remove([mediaRow.storage_path]);
    if (mediaRow.thumbnail_path) {
      await supabase.storage.from("event-images").remove([mediaRow.thumbnail_path]);
    }

    // Delete from database
    await supabase.from("event_media").delete().eq("id", mediaId);

    // If this was the cover, assign cover to the next item
    if (mediaRow.is_cover) {
      const { data: remaining } = await supabase
        .from("event_media")
        .select("*")
        .eq("event_id", eventId)
        .order("position", { ascending: true })
        .limit(1);

      if (remaining && remaining.length > 0) {
        await supabase.from("event_media").update({ is_cover: true }).eq("id", remaining[0].id);
        const coverPath = (remaining[0].media_type === "video") && remaining[0].thumbnail_path
          ? remaining[0].thumbnail_path : remaining[0].storage_path;
        await supabase.from("events").update({ cover_image_url: coverPath, image_url: coverPath }).eq("id", eventId);
      } else {
        await supabase.from("events").update({ cover_image_url: null, image_url: null }).eq("id", eventId);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting event media:", error);
    res.status(500).json({ error: "Failed to delete event media" });
  }
});

// ---------------------------
// PROTECTED: Reorder event media
// ---------------------------
app.put("/host/events/:eventId/media/reorder", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { ordering } = req.body; // [{id, position}]

    const allowed = await canEditEvent(req.user.id, eventId);
    if (!allowed) return res.status(403).json({ error: "Forbidden" });

    const { supabase } = await import("./supabase.js");

    for (const item of ordering) {
      await supabase.from("event_media").update({ position: item.position }).eq("id", item.id).eq("event_id", eventId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error reordering event media:", error);
    res.status(500).json({ error: "Failed to reorder media" });
  }
});

// ---------------------------
// PROTECTED: Set cover media
// ---------------------------
app.put("/host/events/:eventId/media/:mediaId/cover", requireAuth, async (req, res) => {
  try {
    const { eventId, mediaId } = req.params;

    const allowed = await canEditEvent(req.user.id, eventId);
    if (!allowed) return res.status(403).json({ error: "Forbidden" });

    const { supabase } = await import("./supabase.js");

    // Unset all covers for this event
    await supabase.from("event_media").update({ is_cover: false }).eq("event_id", eventId);

    // Set new cover
    const { data: mediaRow } = await supabase
      .from("event_media")
      .update({ is_cover: true })
      .eq("id", mediaId)
      .eq("event_id", eventId)
      .select()
      .single();

    if (!mediaRow) return res.status(404).json({ error: "Media not found" });

    // Update events.cover_image_url and image_url
    const coverPath = (mediaRow.media_type === "video" || mediaRow.media_type === "gif") && mediaRow.thumbnail_path
      ? mediaRow.thumbnail_path : mediaRow.storage_path;
    await supabase.from("events").update({ cover_image_url: coverPath, image_url: coverPath }).eq("id", eventId);

    res.json({ success: true });
  } catch (error) {
    console.error("Error setting cover media:", error);
    res.status(500).json({ error: "Failed to set cover" });
  }
});

// ---------------------------
// PROTECTED: Upload profile picture
// ---------------------------
app.post("/host/profile/picture", requireAuth, async (req, res) => {
  try {
    const { imageData } = req.body; // Base64 image data

    if (!imageData) {
      return res.status(400).json({ error: "imageData is required" });
    }

    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Determine file extension from data URL
    const mimeMatch = imageData.match(/data:image\/(\w+);base64/);
    const extension = mimeMatch ? mimeMatch[1] : "png";
    const fileName = `${req.user.id}/profile.${extension}`;

    // Upload to Supabase Storage
    const { supabase } = await import("./supabase.js");
    const { data, error } = await supabase.storage
      .from("profile-pictures")
      .upload(fileName, buffer, {
        contentType: `image/${extension}`,
        upsert: true, // Overwrite if exists
      });

    if (error) {
      console.error("Storage upload error:", error);
      return res.status(500).json({ error: "Failed to upload image" });
    }

    // Store just the file path in the database
    // We'll generate the appropriate URL (public or signed) when fetching
    // This allows us to switch between public/private buckets easily
    const updated = await updateUserProfile(req.user.id, {
      profilePicture: fileName, // Store path, not full URL
    });

    // Generate URL for immediate return (try signed first, fallback to public)
    let imageUrl = null;
    try {
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from("profile-pictures")
        .createSignedUrl(fileName, 3600); // 1 hour for response

      if (!urlError && signedUrlData?.signedUrl) {
        imageUrl = signedUrlData.signedUrl;
      }
    } catch (error) {
      console.error("Signed URL error:", error);
    }

    // Fallback to public URL if signed URL fails
    if (!imageUrl) {
      const {
        data: { publicUrl },
      } = supabase.storage.from("profile-pictures").getPublicUrl(fileName);
      imageUrl = publicUrl;
    }

    // Return profile with the generated URL
    const profileWithUrl = {
      ...updated,
      profilePicture: imageUrl,
    };

    res.json(profileWithUrl);
  } catch (error) {
    console.error("Error uploading profile picture:", error);
    res.status(500).json({ error: "Failed to upload profile picture" });
  }
});

// Upload brand logo
app.post("/host/profile/logo", requireAuth, async (req, res) => {
  try {
    const { imageData } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: "imageData is required" });
    }

    // Enforce max size: ~500KB after base64 decoding
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    if (buffer.length > 512 * 1024) {
      return res.status(400).json({ error: "Logo must be under 500KB. Please use a smaller image." });
    }

    const mimeMatch = imageData.match(/data:image\/(\w+);base64/);
    const extension = mimeMatch ? mimeMatch[1] : "png";
    const fileName = `${req.user.id}/logo.${extension}`;

    const { supabase } = await import("./supabase.js");
    const { error } = await supabase.storage
      .from("profile-pictures")
      .upload(fileName, buffer, {
        contentType: `image/${extension}`,
        upsert: true,
      });

    if (error) {
      console.error("Storage upload error:", error);
      return res.status(500).json({ error: "Failed to upload logo" });
    }

    const updated = await updateUserProfile(req.user.id, {
      brandLogo: fileName,
    });

    // Generate URL for immediate return
    let logoUrl = null;
    try {
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from("profile-pictures")
        .createSignedUrl(fileName, 3600);
      if (!urlError && signedUrlData?.signedUrl) {
        logoUrl = signedUrlData.signedUrl;
      }
    } catch (err) {
      console.error("Signed URL error:", err);
    }

    if (!logoUrl) {
      const { data: { publicUrl } } = supabase.storage.from("profile-pictures").getPublicUrl(fileName);
      logoUrl = publicUrl;
    }

    res.json({ ...updated, brandLogo: logoUrl });
  } catch (error) {
    console.error("Error uploading brand logo:", error);
    res.status(500).json({ error: "Failed to upload brand logo" });
  }
});

// Delete brand logo
app.delete("/host/profile/logo", requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.id);
    if (profile.brandLogo) {
      let filePath = profile.brandLogo;
      if (filePath.includes("profile-pictures/")) {
        const urlMatch = filePath.match(/profile-pictures\/([^?]+)/);
        if (urlMatch) filePath = urlMatch[1];
      }
      const { supabase } = await import("./supabase.js");
      await supabase.storage.from("profile-pictures").remove([filePath]);
    }

    const updated = await updateUserProfile(req.user.id, { brandLogo: null });
    res.json(updated);
  } catch (error) {
    console.error("Error deleting brand logo:", error);
    res.status(500).json({ error: "Failed to delete brand logo" });
  }
});

// ---------------------------
// PUBLIC: CRM marketing unsubscribe (per-recipient token)
// ---------------------------
// Token is generated lazily in campaignSender; this endpoint flips
// people.marketing_unsubscribed_at without requiring auth — the token
// itself is the auth. Recipients can re-subscribe from the same page.

app.get("/u/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { findPersonByUnsubscribeToken } = await import("./data.js");
    const person = await findPersonByUnsubscribeToken(token);
    if (!person) {
      return res.status(404).json({ error: "Invalid or expired link" });
    }
    res.json({
      id: person.id,
      email: person.email,
      name: person.name,
      isUnsubscribed: Boolean(person.marketing_unsubscribed_at),
      unsubscribedAt: person.marketing_unsubscribed_at,
    });
  } catch (err) {
    console.error("[unsubscribe] lookup error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/u/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const subscribed = req.body?.subscribed === true;
    const { findPersonByUnsubscribeToken, setMarketingUnsubscribed } = await import("./data.js");
    const person = await findPersonByUnsubscribeToken(token);
    if (!person) {
      return res.status(404).json({ error: "Invalid or expired link" });
    }
    await setMarketingUnsubscribed(person.id, !subscribed);
    res.json({ ok: true, isUnsubscribed: !subscribed });
  } catch (err) {
    console.error("[unsubscribe] toggle error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ---------------------------
// PUBLIC: Newsletter subscription & unsubscribe
// ---------------------------

function generateUnsubscribeToken() {
  return crypto.randomBytes(32).toString("hex");
}

app.post("/newsletter", optionalAuth, async (req, res) => {
  try {
    const rawEmail = req.body?.email;
    const source = req.body?.source || "landing_newsletter";
    const interests = Array.isArray(req.body?.interests) ? req.body.interests.filter(i => typeof i === "string") : [];
    const consent = req.body?.consent;

    if (!rawEmail || typeof rawEmail !== "string") {
      return res.status(400).json({
        code: "invalid_email",
        message: "Email is required.",
      });
    }

    const normalizedEmail = rawEmail.trim().toLowerCase();

    // Very lightweight email validation to avoid obviously bad input
    if (
      !normalizedEmail ||
      !normalizedEmail.includes("@") ||
      normalizedEmail.length > 320
    ) {
      return res.status(400).json({
        code: "invalid_email",
        message: "Enter a valid email address to continue.",
      });
    }

    const { supabase } = await import("./supabase.js");

    const {
      data: existing,
      error: selectError,
    } = await supabase
      .from("newsletter_subscriptions")
      .select("id, status, user_id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (selectError) {
      // Table missing or other structural issue
      if (selectError.code === "PGRST116" || selectError.code === "42P01") {
        console.error(
          "[newsletter] newsletter_subscriptions table missing:",
          selectError
        );
        return res.status(500).json({
          code: "newsletter_not_configured",
          message: "Newsletter is not configured yet.",
        });
      }

      console.error("[newsletter] Error fetching subscription:", selectError);
      return res.status(500).json({
        code: "newsletter_error",
        message: "Failed to subscribe.",
      });
    }

    const userId = req.user?.id || existing?.user_id || null;
    const now = new Date().toISOString();

    // Helper to map Supabase auth/rate-limit errors into HTTP responses
    function handleSupabaseWriteError(err, defaultStatus = 500) {
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("rate limit") || msg.includes("too many requests")) {
        return res.status(429).json({
          code: "rate_limited",
          message:
            "Too many attempts for this email. Wait a moment and try again.",
        });
      }

      console.error("[newsletter] Write error:", err);
      return res.status(defaultStatus).json({
        code: "newsletter_error",
        message: "Failed to update subscription.",
      });
    }

    // No existing subscription: create a new confirmed subscription
    if (!existing) {
      const unsubscribeToken = generateUnsubscribeToken();

      const { error: insertError } = await supabase
        .from("newsletter_subscriptions")
        .insert({
          email: normalizedEmail,
          user_id: userId,
          status: "confirmed",
          source,
          confirmed_at: now,
          created_at: now,
          updated_at: now,
          unsubscribe_token: unsubscribeToken,
          ...(interests.length > 0 ? { interests } : {}),
          consent_given: consent === true,
          consent_at: consent === true ? now : null,
        });

      if (insertError) {
        return handleSupabaseWriteError(insertError);
      }

      return res.json({ status: "subscribed", created: true });
    }

    // Existing subscription: branch on status
    if (existing.status === "bounced" || existing.status === "suppressed") {
      return res.status(400).json({
        code: "suppressed",
        message: "We can't subscribe this address right now.",
      });
    }

    let nextStatus = existing.status;
    let responseStatus = "already_subscribed";
    const patch = {
      user_id: userId,
      updated_at: now,
      ...(interests.length > 0 ? { interests } : {}),
      consent_given: consent === true,
      consent_at: consent === true ? now : null,
    };

    if (existing.status === "unsubscribed") {
      nextStatus = "confirmed";
      responseStatus = "resubscribed";
      const unsubscribeToken = generateUnsubscribeToken();
      Object.assign(patch, {
        status: nextStatus,
        confirmed_at: now,
        unsubscribed_at: null,
        unsubscribe_token: unsubscribeToken,
      });
    } else if (existing.status === "pending") {
      nextStatus = "confirmed";
      responseStatus = "resubscribed";
      Object.assign(patch, {
        status: nextStatus,
        confirmed_at: now,
      });
    } else {
      // confirmed / other non-terminal statuses
      Object.assign(patch, {
        status: existing.status || "confirmed",
      });
    }

    const { error: updateError } = await supabase
      .from("newsletter_subscriptions")
      .update(patch)
      .eq("id", existing.id);

    if (updateError) {
      return handleSupabaseWriteError(updateError);
    }

    return res.json({ status: responseStatus, created: false });
  } catch (error) {
    console.error("[newsletter] Unexpected error:", error);
    return res.status(500).json({
      code: "newsletter_error",
      message: "Failed to subscribe.",
    });
  }
});

app.post("/newsletter/unsubscribe-token", async (req, res) => {
  try {
    const rawToken = req.body?.token;
    if (!rawToken || typeof rawToken !== "string") {
      return res.status(400).json({
        code: "invalid_token",
        message: "Invalid unsubscribe link.",
      });
    }

    const token = rawToken.trim();
    if (!token) {
      return res.status(400).json({
        code: "invalid_token",
        message: "Invalid unsubscribe link.",
      });
    }

    const { supabase } = await import("./supabase.js");

    const {
      data: existing,
      error: selectError,
    } = await supabase
      .from("newsletter_subscriptions")
      .select("id, status")
      .eq("unsubscribe_token", token)
      .maybeSingle();

    if (selectError) {
      if (selectError.code === "PGRST116" || selectError.code === "42P01") {
        console.error(
          "[newsletter] newsletter_subscriptions table missing on unsubscribe:",
          selectError
        );
        return res.status(400).json({
          code: "invalid_token",
          message: "This unsubscribe link is no longer valid.",
        });
      }

      console.error(
        "[newsletter] Error fetching unsubscribe token:",
        selectError
      );
      return res.status(400).json({
        code: "invalid_token",
        message: "This unsubscribe link is no longer valid.",
      });
    }

    if (!existing) {
      return res.status(400).json({
        code: "invalid_token",
        message: "This unsubscribe link is no longer valid.",
      });
    }

    if (existing.status === "unsubscribed") {
      return res.json({ status: "already_unsubscribed" });
    }

    if (existing.status === "bounced" || existing.status === "suppressed") {
      return res.json({ status: "suppressed" });
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("newsletter_subscriptions")
      .update({
        status: "unsubscribed",
        unsubscribed_at: now,
        updated_at: now,
      })
      .eq("id", existing.id);

    if (updateError) {
      console.error(
        "[newsletter] Error updating unsubscribe status:",
        updateError
      );
      return res.status(500).json({
        code: "newsletter_error",
        message: "Failed to update subscription.",
      });
    }

    return res.json({ status: "unsubscribed" });
  } catch (error) {
    console.error("[newsletter] Unexpected unsubscribe error:", error);
    return res.status(500).json({
      code: "newsletter_error",
      message: "Failed to update subscription.",
    });
  }
});

// ---------------------------
// PROTECTED: Record auth consent (sign-up / sign-in)
// ---------------------------

app.post("/auth/record-consent", requireAuth, async (req, res) => {
  try {
    const rawEmail = req.user?.email;
    if (!rawEmail) return res.json({ ok: false });

    const email = String(rawEmail).trim().toLowerCase();
    if (!email) return res.json({ ok: false });

    const { supabase } = await import("./supabase.js");
    const now = new Date().toISOString();

    // Upsert into newsletter_subscriptions
    await supabase
      .from("newsletter_subscriptions")
      .upsert(
        {
          email,
          user_id: req.user.id,
          consent_given: true,
          consent_at: now,
          source: "account_signup",
          updated_at: now,
        },
        { onConflict: "email" }
      );

    // Update people table if record exists
    await supabase
      .from("people")
      .update({
        marketing_consent: true,
        marketing_consent_at: now,
      })
      .eq("email", email);

    return res.json({ ok: true });
  } catch (error) {
    console.error("[consent] Unexpected record-consent error:", error);
    return res.status(500).json({ ok: false, code: "consent_error" });
  }
});

// ---------------------------
// PROTECTED: Link newsletter subscriptions to authenticated user
// ---------------------------

app.post("/auth/link-newsletter", requireAuth, async (req, res) => {
  try {
    const rawEmail = req.user?.email;
    if (!rawEmail) {
      return res.json({ linked: false });
    }

    const email = String(rawEmail).trim().toLowerCase();
    if (!email) {
      return res.json({ linked: false });
    }

    const { supabase } = await import("./supabase.js");
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("newsletter_subscriptions")
      .update({
        user_id: req.user.id,
        updated_at: now,
      })
      .eq("email", email)
      .is("user_id", null);

    if (error) {
      console.error("[newsletter] Error linking subscription to user:", error);
      return res.status(500).json({
        linked: false,
        code: "newsletter_link_error",
      });
    }

    return res.json({ linked: true });
  } catch (error) {
    console.error("[newsletter] Unexpected link-newsletter error:", error);
    return res.status(500).json({
      linked: false,
      code: "newsletter_link_error",
    });
  }
});

// ---------------------------
// PUBLIC: Ideas / feedback
// ---------------------------

const ideasRateLimit = new Map(); // IP -> { count, resetAt }
// Prune expired rate-limit entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ideasRateLimit) {
    if (entry.resetAt <= now) ideasRateLimit.delete(ip);
  }
}, 10 * 60 * 1000);

app.post("/ideas", optionalAuth, async (req, res) => {
  try {
    // Rate limit: 5 per hour per IP
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
    const now = Date.now();
    const entry = ideasRateLimit.get(ip);
    if (entry && entry.resetAt > now) {
      if (entry.count >= 5) {
        return res.status(429).json({ error: "Too many ideas submitted. Try again later." });
      }
      entry.count++;
    } else {
      ideasRateLimit.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    }

    const { body, pageUrl } = req.body || {};
    if (!body || typeof body !== "string" || !body.trim()) {
      return res.status(400).json({ error: "body is required" });
    }
    if (body.length > 2000) {
      return res.status(400).json({ error: "body must be 2000 characters or fewer" });
    }

    const row = {
      body: body.trim(),
      page_url: pageUrl || null,
      status: "new",
    };

    if (req.user) {
      row.user_id = req.user.id;
      row.user_email = req.user.email;
      try {
        const profile = await getUserProfile(req.user.id);
        row.user_name = profile?.name || null;
      } catch (_) {
        row.user_name = null;
      }
    }

    const { supabase } = await import("./supabase.js");
    const { error } = await supabase.from("ideas").insert(row);
    if (error) throw error;

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("[ideas] Error submitting idea:", error);
    return res.status(500).json({ error: "Failed to submit idea" });
  }
});

// ---------------------------
// ADMIN: Newsletter preview & send
// ---------------------------

app.post("/admin/newsletter/preview", requireAdmin, async (req, res) => {
  try {
    const targetCategories = Array.isArray(req.body?.targetCategories) ? req.body.targetCategories : [];
    const { getNewsletterSubscribers } = await import("./data.js");
    const { subscribers, total, unfilteredTotal } = await getNewsletterSubscribers({
      status: "confirmed",
      targetCategories,
    });

    return res.json({
      totalRecipients: total,
      unfilteredTotal,
      targetCategories,
      subscribers: (subscribers || []).map((s) => ({
        id: s.id,
        email: s.email,
        userId: s.user_id || null,
        status: s.status,
        interests: s.interests || [],
      })),
    });
  } catch (error) {
    console.error("[admin] Newsletter preview error:", error);
    return res.status(500).json({
      error: "newsletter_preview_failed",
      message: "Failed to load newsletter preview.",
    });
  }
});

app.post("/admin/newsletter/send", requireAdmin, async (req, res) => {
  try {
    const {
      subject,
      templateType = "event",
      templateName = "event",
      templateContent = {},
      htmlBody,
      textBody,
      excludeSubscriberIds,
      targetCategories,
    } = req.body || {};

    if (!subject || typeof subject !== "string") {
      return res.status(400).json({
        error: "invalid_request",
        message: "Subject is required.",
      });
    }

    const { getNewsletterSubscribers } = await import("./data.js");
    const { findEventById } = await import("./data.js");
    const { renderEventEmailTemplate, renderWeeklyHappeningsTemplate } = await import(
      "./services/emailTemplateService.js"
    );
    const { subscribers, total } = await getNewsletterSubscribers({
      status: "confirmed",
      targetCategories: Array.isArray(targetCategories) ? targetCategories : [],
    });

    if (!subscribers.length) {
      return res.json({
        totalRecipients: 0,
        enqueued: 0,
        failed: 0,
      });
    }

    const excludedIdSet = new Set(
      Array.isArray(excludeSubscriberIds) ? excludeSubscriberIds : []
    );

    // Generate a human-readable campaign tag for tracking
    const now = new Date();
    const weekNum = Math.ceil(((now - new Date(now.getFullYear(), 0, 1)) / 86400000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7);
    const campaignTag = templateType === "weekly_happenings"
      ? `weekly_happenings_${now.getFullYear()}_w${weekNum}`
      : `newsletter_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}_${String(now.getDate()).padStart(2, "0")}`;
    const campaignId = `admin-${Date.now()}`;
    let enqueued = 0;
    let failed = 0;

    // Resolve backing event from Supabase, hard-coded to Pull up 53 for now.
    // This mirrors the CRM "event" email template usage.
    let event = null;
    if (templateType === "event" && templateName === "event") {
      try {
        // Use the concrete event ID provided for the newsletter template
        event = await findEventById("5e7abfb7-70a5-4bd3-b820-42dd04d1e0c7");
      } catch (e) {
        console.error("[admin] Failed to load event for newsletter template:", e);
      }
    }

    // Per-subscriber unsubscribe URLs require rendering inside the loop;
    // shared content is precomputed here, the renderer is called below.
    const finalTextBody = textBody || null;

    let eventTemplateContent = null;
    if (templateType === "event" && event) {
      eventTemplateContent = {
        heroImageUrl: templateContent.heroImageUrl || event.coverImageUrl || event.imageUrl || "",
        headline: templateContent.headline || event.title || "",
        introQuote: templateContent.introQuote || "",
        introBody:
          templateContent.introBody ||
          "Skriv om du vill komma så får du länk till gästlistan!",
        introGreeting: templateContent.introGreeting || "",
        introNote: templateContent.introNote || "",
        signoffText: templateContent.signoffText || "",
        ctaLabel: templateContent.ctaLabel || "TO EVENT",
        ctaUrl: templateContent.ctaUrl || undefined,
      };
    }

    const weeklyEventsList = templateType === "weekly_happenings" && Array.isArray(templateContent.events)
      ? templateContent.events
      : null;
    const weeklyContent = templateType === "weekly_happenings"
      ? {
          headline: templateContent.headline || "This Week in Stockholm",
          body: templateContent.body || "",
        }
      : null;

    // Frontend URL for the newsletter-side unsubscribe page
    const frontendBaseUrl = isDevelopment
      ? "http://localhost:5173"
      : (process.env.FRONTEND_URL || "https://pullup.se");

    function renderForSubscriber(subscriber) {
      const unsubscribeUrl = subscriber.unsubscribe_token
        ? `${frontendBaseUrl}/newsletter?token=${encodeURIComponent(subscriber.unsubscribe_token)}&intent=unsubscribe`
        : null;
      if (templateType === "event" && event) {
        return renderEventEmailTemplate({
          event,
          templateContent: eventTemplateContent,
          person: null,
          unsubscribeUrl,
        });
      }
      if (templateType === "weekly_happenings") {
        return renderWeeklyHappeningsTemplate({
          events: weeklyEventsList || [],
          templateContent: weeklyContent,
          unsubscribeUrl,
        });
      }
      return htmlBody || null;
    }

    // Import tracking link rewriter (additive — wraps links + injects open pixel)
    let addTracking = null;
    try {
      const trackingModule = await import("./email/tracking/linkRewriter.js");
      addTracking = trackingModule.addTracking;
    } catch (trackingErr) {
      console.warn("[admin] Email tracking module not available, sending without tracking:", trackingErr.message);
    }

    // Backend base URL for tracking endpoints
    // In production, backend is proxied behind /api on the frontend domain
    const backendBaseUrl = isDevelopment
      ? "http://localhost:3001"
      : `${process.env.FRONTEND_URL || "https://pullup.se"}/api`;

    for (const subscriber of subscribers) {
      try {
        if (excludedIdSet.has(subscriber.id)) {
          continue;
        }

        // Render per-subscriber so each recipient's unsubscribe URL carries
        // their own newsletter token.
        const perRecipientHtml = renderForSubscriber(subscriber);

        // Enqueue first to get the tracking_id from the outbox row
        const outboxRow = await enqueueOutbox({
          toEmail: subscriber.email,
          subject,
          htmlBody: perRecipientHtml,
          textBody: finalTextBody,
          campaignSendId: null,
          idempotencyKey: `${campaignId}:${subscriber.id}`,
          category: "newsletter",
        });

        // Add per-subscriber tracking (unique open pixel + click redirects)
        if (addTracking && outboxRow?.tracking_id && perRecipientHtml) {
          try {
            const trackedHtml = addTracking(perRecipientHtml, {
              trackingId: outboxRow.tracking_id,
              baseUrl: backendBaseUrl,
              campaignTag,
            });

            // Update outbox row with tracked HTML + campaign tag
            const { supabase: sb } = await import("./supabase.js");
            await sb
              .from("email_outbox")
              .update({ html_body: trackedHtml, campaign_tag: campaignTag })
              .eq("id", outboxRow.id);
          } catch (trackErr) {
            // Tracking failure should never block email sending
            console.error("[admin] Tracking injection failed for", subscriber.email, trackErr.message);
          }
        } else if (outboxRow?.id) {
          // Still tag the campaign even without tracking
          try {
            const { supabase: sb } = await import("./supabase.js");
            await sb.from("email_outbox").update({ campaign_tag: campaignTag }).eq("id", outboxRow.id);
          } catch {}
        }

        enqueued += 1;
      } catch (error) {
        failed += 1;
        console.error(
          "[admin] Failed to enqueue newsletter email:",
          subscriber.email,
          error
        );
      }
    }

    console.log(
      `[admin] Newsletter send complete by user ${req.user.id}: total=${total}, enqueued=${enqueued}, failed=${failed}`
    );

    // Stamp newsletter_sent_at on weekly happenings events after successful send
    if (templateType === "weekly_happenings" && enqueued > 0) {
      const eventIds = (Array.isArray(templateContent.events) ? templateContent.events : [])
        .map((ev) => ev.id)
        .filter(Boolean);
      if (eventIds.length > 0) {
        try {
          const { supabase: sb } = await import("./supabase.js");
          const { error: stampError } = await sb
            .from("stockholm_events")
            .update({ newsletter_sent_at: new Date().toISOString() })
            .in("id", eventIds);
          if (stampError) {
            console.error("[admin] Failed to stamp newsletter_sent_at:", stampError.message);
          } else {
            console.log(`[admin] Stamped newsletter_sent_at on ${eventIds.length} events`);
          }
        } catch (stampErr) {
          console.error("[admin] Exception while stamping newsletter_sent_at:", stampErr);
        }
      }
    }

    return res.json({
      totalRecipients: total,
      enqueued,
      failed,
    });
  } catch (error) {
    console.error("[admin] Newsletter send error:", error);
    return res.status(500).json({
      error: "newsletter_send_failed",
      message: "Failed to send newsletter.",
    });
  }
});

// Admin helper: fetch event used for newsletter template preview
app.get("/admin/newsletter/event-template", requireAdmin, async (req, res) => {
  try {
    const { findEventById } = await import("./data.js");
    const event = await findEventById("5e7abfb7-70a5-4bd3-b820-42dd04d1e0c7");

    if (!event) {
      return res.status(404).json({
        error: "event_not_found",
        message: "Event for newsletter template not found.",
      });
    }

    return res.json({
      id: event.id,
      title: event.title,
      imageUrl: event.imageUrl || null,
      slug: event.slug,
      description: event.description || "",
    });
  } catch (error) {
    console.error("[admin] Newsletter event template error:", error);
    return res.status(500).json({
      error: "newsletter_event_template_failed",
      message: "Failed to load newsletter event template.",
    });
  }
});

// GET /admin/newsletter/weekly-events — fetch approved newsletter events for a week
// Returns events within date range + events without dates that are flagged for newsletter
app.get("/admin/newsletter/weekly-events", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({
        error: "invalid_request",
        message: "Query params 'from' and 'to' (ISO date strings) are required.",
      });
    }

    // Fetch approved events whose date range overlaps with the selected week
    // (starts before week ends AND ends after week starts), not yet sent
    const { data: dated, error: e1 } = await supabase
      .from("stockholm_events")
      .select("*")
      .eq("status", "approved")
      .lte("starts_at", to)
      .or(`ends_at.gte.${from},ends_at.is.null`)
      .is("newsletter_sent_at", null)
      .order("starts_at", { ascending: true });

    if (e1) throw e1;

    // Also fetch approved events without dates that haven't been sent yet
    const { data: undated, error: e2 } = await supabase
      .from("stockholm_events")
      .select("*")
      .eq("status", "approved")
      .is("starts_at", null)
      .is("newsletter_sent_at", null);

    if (e2) throw e2;

    const events = [...(dated || []), ...(undated || [])];
    return res.json({ events });
  } catch (err) {
    console.error("[admin] weekly-events fetch error:", err.message);
    return res.status(500).json({ error: "Failed to fetch weekly events" });
  }
});

// ---------------------------
// Newsletter Analytics (admin)
// ---------------------------

// GET /admin/analytics/overview — aggregate stats over a date range.
// Range comes from the admin date picker via resolveAnalyticsRange. We
// restrict campaigns to those SENT in the range (created_at on outbox);
// opens/clicks attributed to those sends count regardless of when they
// fired, which matches how email marketing dashboards typically work.
app.get("/admin/analytics/overview", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");
    const { periodStart, periodEnd } = resolveAnalyticsRange(req);

    const { data: outboxRows } = await sb
      .from("email_outbox")
      .select("id, tracking_id, campaign_tag")
      .not("campaign_tag", "is", null)
      .gte("created_at", periodStart.toISOString())
      .lte("created_at", periodEnd.toISOString());

    const allOutbox = outboxRows || [];
    const totalSent = allOutbox.length;
    const totalCampaigns = new Set(allOutbox.map(r => r.campaign_tag)).size;
    const campaignTrackingIds = allOutbox.map(r => r.tracking_id);

    // Fetch opens and clicks scoped to campaign tracking_ids in this range.
    // Top-link aggregation must use the SAME tracking_id scope so "Top
    // event views" reflects only the campaigns sent in the picker's
    // window — otherwise it leaks lifetime clicks into a windowed view.
    const [opensRes, clicksRes, topLinksRes] = await Promise.all([
      campaignTrackingIds.length > 0
        ? sb.from("email_opens").select("tracking_id").in("tracking_id", campaignTrackingIds)
        : Promise.resolve({ data: [] }),
      campaignTrackingIds.length > 0
        ? sb.from("email_clicks").select("tracking_id").in("tracking_id", campaignTrackingIds)
        : Promise.resolve({ data: [] }),
      campaignTrackingIds.length > 0
        ? sb.from("email_clicks").select("link_url, link_label").in("tracking_id", campaignTrackingIds)
        : Promise.resolve({ data: [] }),
    ]);

    const uniqueOpens = new Set((opensRes.data || []).map(o => o.tracking_id)).size;
    const uniqueClicks = new Set((clicksRes.data || []).map(c => c.tracking_id)).size;

    // Aggregate clicks per URL
    const linkClickMap = {};
    for (const c of (topLinksRes.data || [])) {
      const key = c.link_url;
      if (!linkClickMap[key]) {
        linkClickMap[key] = { link_url: c.link_url, link_label: c.link_label, clicks: 0 };
      }
      linkClickMap[key].clicks++;
    }
    const allLinks = Object.values(linkClickMap);

    // Collect slugs and external URLs for title resolution
    const ovSlugSet = new Set();
    const ovExternalUrls = [];
    for (const l of allLinks) {
      try {
        const u = new URL(l.link_url);
        const m = u.pathname.match(/^\/e\/([^/?]+)/);
        if (m) {
          ovSlugSet.add(m[1]);
        } else if (l.link_label === "view_event" || l.link_label === "link") {
          ovExternalUrls.push(l.link_url);
        }
      } catch {}
    }

    const ovUrlToTitle = {};
    if (ovSlugSet.size > 0) {
      try {
        const { data: evs } = await sb.from("events").select("slug, title").in("slug", [...ovSlugSet]);
        for (const ev of (evs || [])) {
          if (ev.slug && ev.title) ovUrlToTitle[`slug:${ev.slug}`] = ev.title;
        }
      } catch {}
    }
    if (ovExternalUrls.length > 0) {
      try {
        const { data: sthlmEvs } = await sb.from("stockholm_events").select("title, url").in("url", ovExternalUrls);
        for (const ev of (sthlmEvs || [])) {
          if (ev.url && ev.title) ovUrlToTitle[`url:${ev.url}`] = ev.title;
        }
      } catch {}
    }

    // Resolve title for each link and group by event
    function resolveTitle(l) {
      try {
        const u = new URL(l.link_url);
        const m = u.pathname.match(/^\/e\/([^/?]+)/);
        if (m && ovUrlToTitle[`slug:${m[1]}`]) return ovUrlToTitle[`slug:${m[1]}`];
        if (ovUrlToTitle[`url:${l.link_url}`]) return ovUrlToTitle[`url:${l.link_url}`];
      } catch {}
      return null;
    }

    // Group by event title for event views (view_event, link, cta labels)
    const eventViewMap = {};
    const spotifyMap = {};
    for (const l of allLinks) {
      const title = resolveTitle(l);
      const displayTitle = title || l.link_url;
      if (l.link_label === "spotify") {
        if (!spotifyMap[displayTitle]) spotifyMap[displayTitle] = { title: displayTitle, clicks: 0 };
        spotifyMap[displayTitle].clicks += l.clicks;
      } else if (["view_event", "link", "cta"].includes(l.link_label)) {
        if (!eventViewMap[displayTitle]) eventViewMap[displayTitle] = { title: displayTitle, clicks: 0 };
        eventViewMap[displayTitle].clicks += l.clicks;
      }
    }

    const topEventViews = Object.values(eventViewMap)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5);
    const topSpotifyClicks = Object.values(spotifyMap)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5);

    return res.json({
      total_campaigns: totalCampaigns,
      total_sent: totalSent,
      total_opens: uniqueOpens,
      total_clicks: uniqueClicks,
      avg_open_rate: totalSent > 0 ? Math.round((uniqueOpens / totalSent) * 1000) / 10 : 0,
      avg_click_rate: totalSent > 0 ? Math.round((uniqueClicks / totalSent) * 1000) / 10 : 0,
      top_event_views: topEventViews,
      top_spotify_clicks: topSpotifyClicks,
    });
  } catch (err) {
    console.error("[admin] analytics overview error:", err.message);
    return res.status(500).json({ error: "Failed to fetch analytics overview" });
  }
});

// GET /admin/analytics/campaigns — list campaigns sent in the date range
// with open/click stats. Filtered by outbox.created_at so admin can scope
// the campaign list to the same window the rest of the page is showing.
app.get("/admin/analytics/campaigns", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");
    const { periodStart, periodEnd } = resolveAnalyticsRange(req);

    const { data: campaigns, error } = await sb
      .from("email_outbox")
      .select("campaign_tag, id, tracking_id, status, created_at")
      .not("campaign_tag", "is", null)
      .gte("created_at", periodStart.toISOString())
      .lte("created_at", periodEnd.toISOString())
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Group by campaign_tag
    const campaignMap = {};
    for (const row of (campaigns || [])) {
      if (!row.campaign_tag) continue;
      if (!campaignMap[row.campaign_tag]) {
        campaignMap[row.campaign_tag] = {
          campaign_tag: row.campaign_tag,
          sent_at: row.created_at,
          total_sent: 0,
          delivered: 0,
          outbox_ids: [],
          tracking_ids: [],
        };
      }
      const c = campaignMap[row.campaign_tag];
      c.total_sent++;
      if (["sent", "delivered"].includes(row.status)) c.delivered++;
      c.outbox_ids.push(row.id);
      c.tracking_ids.push(row.tracking_id);
    }

    const tags = Object.keys(campaignMap);
    if (tags.length === 0) {
      return res.json({ campaigns: [] });
    }

    // Get all tracking_ids across all campaigns for scoped queries
    const allTrackingIds = Object.values(campaignMap).flatMap((c) => c.tracking_ids);

    // Fetch only opens/clicks for these tracking_ids (scoped, not full table)
    const [opensRes, clicksRes] = await Promise.all([
      sb.from("email_opens").select("tracking_id").in("tracking_id", allTrackingIds),
      sb.from("email_clicks").select("tracking_id").in("tracking_id", allTrackingIds),
    ]);

    const opensByTracking = new Set((opensRes.data || []).map((o) => o.tracking_id));
    const clicksByTracking = new Set((clicksRes.data || []).map((c) => c.tracking_id));

    // Build response
    const result = tags.map((tag) => {
      const c = campaignMap[tag];
      const uniqueOpens = c.tracking_ids.filter((t) => opensByTracking.has(t)).length;
      const uniqueClicks = c.tracking_ids.filter((t) => clicksByTracking.has(t)).length;
      return {
        campaign_tag: tag,
        sent_at: c.sent_at,
        total_sent: c.total_sent,
        delivered: c.delivered,
        unique_opens: uniqueOpens,
        unique_clicks: uniqueClicks,
        open_rate: c.total_sent > 0 ? Math.round((uniqueOpens / c.total_sent) * 1000) / 10 : 0,
        click_rate: c.total_sent > 0 ? Math.round((uniqueClicks / c.total_sent) * 1000) / 10 : 0,
      };
    });

    // Sort by sent_at descending
    result.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

    return res.json({ campaigns: result });
  } catch (err) {
    console.error("[admin] analytics campaigns error:", err.message);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// GET /admin/analytics/campaigns/:tag — detail for a single campaign (per-link breakdown)
app.get("/admin/analytics/campaigns/:tag", requireAdmin, async (req, res) => {
  try {
    const { tag } = req.params;
    const { supabase: sb } = await import("./supabase.js");

    // Get outbox rows for this campaign
    const { data: outboxRows, error: e1 } = await sb
      .from("email_outbox")
      .select("id, tracking_id, status, created_at, to_email")
      .eq("campaign_tag", tag);

    if (e1) throw e1;
    if (!outboxRows || outboxRows.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const outboxIds = outboxRows.map((r) => r.id);
    const trackingIds = outboxRows.map((r) => r.tracking_id);

    // Get opens
    const { data: opens } = await sb
      .from("email_opens")
      .select("tracking_id, opened_at")
      .in("tracking_id", trackingIds);

    const uniqueOpenTrackingIds = new Set((opens || []).map((o) => o.tracking_id));

    // Get clicks with link details
    const { data: clicks } = await sb
      .from("email_clicks")
      .select("tracking_id, link_url, link_label, link_index, clicked_at")
      .in("tracking_id", trackingIds);

    // Per-link breakdown
    const linkMap = {};
    const uniqueClickTrackingIds = new Set();
    for (const click of (clicks || [])) {
      uniqueClickTrackingIds.add(click.tracking_id);
      const key = `${click.link_label}::${click.link_url}`;
      if (!linkMap[key]) {
        linkMap[key] = {
          link_url: click.link_url,
          link_label: click.link_label,
          total_clicks: 0,
          unique_clicks: new Set(),
        };
      }
      linkMap[key].total_clicks++;
      linkMap[key].unique_clicks.add(click.tracking_id);
    }

    const linksRaw = Object.values(linkMap)
      .map((l) => ({
        link_url: l.link_url,
        link_label: l.link_label,
        total_clicks: l.total_clicks,
        unique_clicks: l.unique_clicks.size,
      }))
      .sort((a, b) => b.total_clicks - a.total_clicks);

    // Resolve event/page titles from click URLs
    const urlToTitle = {};
    const slugSet = new Set();
    const externalUrls = [];

    for (const l of linksRaw) {
      try {
        const u = new URL(l.link_url);
        const m = u.pathname.match(/^\/e\/([^/?]+)/);
        if (m) {
          slugSet.add(m[1]);
        } else if (l.link_label === "view_event" || l.link_label === "link") {
          externalUrls.push(l.link_url);
        }
      } catch {}
    }

    // Resolve PullUp event slugs
    if (slugSet.size > 0) {
      try {
        const { data: events } = await sb
          .from("events")
          .select("slug, title")
          .in("slug", [...slugSet]);
        for (const ev of (events || [])) {
          if (ev.slug && ev.title) urlToTitle[`slug:${ev.slug}`] = ev.title;
        }
      } catch {}
    }

    // Resolve external URLs from stockholm_events
    if (externalUrls.length > 0) {
      try {
        const { data: sthlmEvents } = await sb
          .from("stockholm_events")
          .select("title, url")
          .in("url", externalUrls);
        for (const ev of (sthlmEvents || [])) {
          if (ev.url && ev.title) urlToTitle[`url:${ev.url}`] = ev.title;
        }
      } catch {}
    }

    const links = linksRaw.map((l) => {
      let eventTitle = null;
      try {
        const u = new URL(l.link_url);
        const m = u.pathname.match(/^\/e\/([^/?]+)/);
        if (m && urlToTitle[`slug:${m[1]}`]) {
          eventTitle = urlToTitle[`slug:${m[1]}`];
        } else if (urlToTitle[`url:${l.link_url}`]) {
          eventTitle = urlToTitle[`url:${l.link_url}`];
        }
      } catch {}
      return { ...l, event_title: eventTitle };
    });

    // Per-event breakdown: build from raw clicks for accurate unique counting
    // Helper to resolve a click URL to an event title
    function resolveClickTitle(clickUrl) {
      try {
        const u = new URL(clickUrl);
        const m = u.pathname.match(/^\/e\/([^/?]+)/);
        if (m && urlToTitle[`slug:${m[1]}`]) return { key: m[1], title: urlToTitle[`slug:${m[1]}`] };
        if (urlToTitle[`url:${clickUrl}`]) return { key: clickUrl, title: urlToTitle[`url:${clickUrl}`] };
      } catch {}
      return null;
    }

    const eventMap = {};
    for (const click of (clicks || [])) {
      const resolved = resolveClickTitle(click.link_url);
      if (!resolved) continue;
      const { key, title } = resolved;
      if (!eventMap[key]) {
        eventMap[key] = { slug: key, title, total_clicks: 0, unique_clickers: new Set(), linkMap: {} };
      }
      eventMap[key].total_clicks++;
      eventMap[key].unique_clickers.add(click.tracking_id);
      // Per-link-type within event
      const label = click.link_label || "link";
      if (!eventMap[key].linkMap[label]) {
        eventMap[key].linkMap[label] = { label, total_clicks: 0, unique_clickers: new Set() };
      }
      eventMap[key].linkMap[label].total_clicks++;
      eventMap[key].linkMap[label].unique_clickers.add(click.tracking_id);
    }
    const events_breakdown = Object.values(eventMap)
      .map((ev) => ({
        slug: ev.slug,
        title: ev.title,
        total_clicks: ev.total_clicks,
        unique_clicks: ev.unique_clickers.size,
        links: Object.values(ev.linkMap).map((l) => ({
          label: l.label,
          total_clicks: l.total_clicks,
          unique_clicks: l.unique_clickers.size,
        })).sort((a, b) => b.total_clicks - a.total_clicks),
      }))
      .sort((a, b) => b.total_clicks - a.total_clicks);

    const totalSent = outboxRows.length;
    const delivered = outboxRows.filter((r) => ["sent", "delivered"].includes(r.status)).length;

    // Per-recipient activity
    const trackingToEmail = {};
    for (const row of outboxRows) {
      trackingToEmail[row.tracking_id] = row.to_email;
    }

    // Build click list per tracking_id with resolved titles
    const clicksByTracking = {};
    for (const click of (clicks || [])) {
      if (!clicksByTracking[click.tracking_id]) clicksByTracking[click.tracking_id] = [];
      const resolved = resolveClickTitle(click.link_url);
      clicksByTracking[click.tracking_id].push({
        event_title: resolved ? resolved.title : null,
        link_label: click.link_label,
        link_url: click.link_url,
      });
    }

    // Build recipients: only those who opened or clicked (active recipients)
    const activeTrackingIds = new Set([...uniqueOpenTrackingIds, ...uniqueClickTrackingIds]);
    const recipients = [...activeTrackingIds].map((tid) => {
      const email = trackingToEmail[tid] || "unknown";
      const opened = uniqueOpenTrackingIds.has(tid);
      const clickList = clicksByTracking[tid] || [];
      // Deduplicate clicks by event_title + link_label
      const seen = new Set();
      const uniqueClicks = [];
      for (const c of clickList) {
        const key = `${c.event_title || c.link_url}::${c.link_label}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueClicks.push(c);
        }
      }
      return {
        email,
        opened,
        clicked: clickList.length > 0,
        clicks: uniqueClicks,
      };
    }).sort((a, b) => b.clicks.length - a.clicks.length);

    return res.json({
      campaign_tag: tag,
      sent_at: outboxRows[0].created_at,
      total_sent: totalSent,
      delivered,
      unique_opens: uniqueOpenTrackingIds.size,
      unique_clicks: uniqueClickTrackingIds.size,
      open_rate: totalSent > 0 ? Math.round((uniqueOpenTrackingIds.size / totalSent) * 1000) / 10 : 0,
      click_rate: totalSent > 0 ? Math.round((uniqueClickTrackingIds.size / totalSent) * 1000) / 10 : 0,
      links,
      events_breakdown,
      recipients,
      total_opens: (opens || []).length,
      total_clicks: (clicks || []).length,
    });
  } catch (err) {
    console.error("[admin] analytics campaign detail error:", err.message);
    return res.status(500).json({ error: "Failed to fetch campaign analytics" });
  }
});

// GET /host/analytics — aggregate analytics across all host's events
app.get("/host/analytics", requireAuth, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");

    // Get all event IDs where user is a host
    const eventIds = await getUserEventIds(req.user.id);
    if (!eventIds || eventIds.length === 0) {
      return res.json({ events: [], total_views: 0, total_unique_visitors: 0, total_rsvps: 0 });
    }

    // Get page views for all host events
    const { data: views } = await sb
      .from("event_page_views")
      .select("event_id, visitor_id, utm_source, utm_campaign, referrer, device_type, created_at")
      .in("event_id", eventIds);

    // Get event details + RSVP counts
    const { data: events } = await sb
      .from("events")
      .select("id, title, slug, starts_at, ends_at, cover_image_url, image_url, host_id, total_capacity, cocktail_capacity, ticket_type, ticket_price, ticket_currency, dinner_enabled, dinner_max_seats_per_slot, dinner_slots, dinner_start_time, dinner_end_time, dinner_seating_interval_hours")
      .in("id", eventIds)
      .order("starts_at", { ascending: false });

    // Batch-fetch RSVP counts for all events in one query instead of N+1
    const { data: rsvpRows } = await sb
      .from("rsvps")
      .select("id, event_id, party_size, total_guests, booking_status, status, visitor_id, created_at, pulled_up, pulled_up_count, wants_dinner, dinner, dinner_party_size, dinner_status")
      .in("event_id", eventIds);

    // Date range filtering — supports ?startDate=&endDate= or ?days=
    const now = new Date();
    let periodStart, periodEnd, days;
    if (req.query.startDate && req.query.endDate) {
      periodStart = new Date(req.query.startDate + "T00:00:00");
      periodEnd = new Date(req.query.endDate + "T23:59:59.999");
      days = Math.round((periodEnd - periodStart) / (1000 * 60 * 60 * 24)) + 1;
    } else {
      days = parseInt(req.query.days) || 30;
      periodEnd = new Date(now);
      periodEnd.setHours(23, 59, 59, 999);
      periodStart = new Date(periodEnd);
      periodStart.setDate(periodStart.getDate() - days + 1);
      periodStart.setHours(0, 0, 0, 0);
    }
    const prevEnd = new Date(periodStart);
    prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    prevStart.setHours(0, 0, 0, 0);

    // Build event title lookup
    const eventTitleMap = {};
    for (const e of (events || [])) {
      eventTitleMap[e.id] = e.title;
    }

    // Aggregate views filtered by selected period
    const eventViewMap = {};
    const eventSourceMap = {}; // { eventId: { source: count } }
    const eventDailyMap = {}; // { eventId: { "2026-03-10": count } }
    const eventDailySourceMap = {}; // { eventId: { "2026-03-10": { source: count } } }
    const allVisitors = new Set();
    let newsletterViews = 0;
    const eventDeviceMap = {}; // { eventId: { mobile: Set, desktop: Set, unknown: Set } }

    // Daily views per event + totals (current period)
    const currentDays = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(periodStart);
      d.setDate(d.getDate() + i);
      currentDays.push(d.toISOString().slice(0, 10));
    }

    const dailyPerEvent = {};
    const dailyTotal = {};
    const prevDailyTotal = {};

    for (const v of (views || [])) {
      const day = v.created_at.slice(0, 10);
      const vDate = new Date(v.created_at);

      if (vDate >= periodStart && vDate <= periodEnd) {
        // Period-filtered per-event aggregation
        if (!eventViewMap[v.event_id]) {
          eventViewMap[v.event_id] = { views: 0, visitors: new Set() };
        }
        eventViewMap[v.event_id].views++;
        eventViewMap[v.event_id].visitors.add(v.visitor_id);
        // Device split tracked via visitor sets (unique per device)
        if (!eventDeviceMap[v.event_id]) eventDeviceMap[v.event_id] = { mobile: new Set(), desktop: new Set(), unknown: new Set() };
        const vid = v.visitor_id || v.event_id + v.created_at;
        if (v.device_type === "mobile") eventDeviceMap[v.event_id].mobile.add(vid);
        else if (v.device_type === "desktop") eventDeviceMap[v.event_id].desktop.add(vid);
        else eventDeviceMap[v.event_id].unknown.add(vid);
        allVisitors.add(v.visitor_id);
        if (v.utm_source === "pullup_newsletter") newsletterViews++;

        // Per-event source tracking
        let source = "direct";
        if (v.utm_source) {
          source = v.utm_source;
        } else if (v.referrer) {
          try {
            const host = new URL(v.referrer).hostname.replace("www.", "");
            if (host.includes("instagram")) source = "instagram";
            else if (host.includes("facebook") || host.includes("fb.")) source = "facebook";
            else if (host.includes("twitter") || host.includes("x.com")) source = "twitter";
            else if (host.includes("linkedin")) source = "linkedin";
            else if (host.includes("pullup")) source = "pullup";
            else source = host;
          } catch { source = "other"; }
        }
        if (!eventSourceMap[v.event_id]) eventSourceMap[v.event_id] = {};
        if (!eventSourceMap[v.event_id][source]) eventSourceMap[v.event_id][source] = new Set();
        eventSourceMap[v.event_id][source].add(v.visitor_id || v.event_id + v.created_at);

        // Per-event daily-by-source (unique visitors)
        if (!eventDailySourceMap[v.event_id]) eventDailySourceMap[v.event_id] = {};
        if (!eventDailySourceMap[v.event_id][day]) eventDailySourceMap[v.event_id][day] = {};
        if (!eventDailySourceMap[v.event_id][day][source]) eventDailySourceMap[v.event_id][day][source] = new Set();
        eventDailySourceMap[v.event_id][day][source].add(vid);

        // Per-event daily unique visitors
        if (!eventDailyMap[v.event_id]) eventDailyMap[v.event_id] = {};
        if (!eventDailyMap[v.event_id][day]) eventDailyMap[v.event_id][day] = new Set();
        eventDailyMap[v.event_id][day].add(vid);

        // Daily breakdown for chart (unique visitors)
        if (!dailyTotal[day]) dailyTotal[day] = new Set();
        dailyTotal[day].add(vid);
        if (!dailyPerEvent[v.event_id]) dailyPerEvent[v.event_id] = {};
        if (!dailyPerEvent[v.event_id][day]) dailyPerEvent[v.event_id][day] = new Set();
        dailyPerEvent[v.event_id][day].add(vid);
      } else if (vDate >= prevStart && vDate <= prevEnd) {
        const dayOffset = Math.floor((vDate - prevStart) / (1000 * 60 * 60 * 24));
        const mappedDay = currentDays[dayOffset] || day;
        prevDailyTotal[mappedDay] = (prevDailyTotal[mappedDay] || 0) + 1;
      }
    }

    // RSVPs filtered by period
    const rsvpCountMap = {};
    let totalRsvps = 0;
    for (const r of (rsvpRows || [])) {
      if (r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending") {
        const rDate = new Date(r.created_at);
        if (rDate >= periodStart && rDate <= periodEnd) {
          const count = r.total_guests ?? r.party_size ?? 1;
          rsvpCountMap[r.event_id] = (rsvpCountMap[r.event_id] || 0) + count;
        }
      }
    }

    // Per-event RSVP daily breakdown (+ VIP RSVP daily)
    const rsvpDailyMap = {}; // { eventId: { "2026-03-10": count } }
    const vipRsvpDailyMap = {}; // { eventId: { "2026-03-10": count } }
    for (const r of (rsvpRows || [])) {
      if (r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending") {
        const rDate = new Date(r.created_at);
        if (rDate >= periodStart && rDate <= periodEnd) {
          const day = r.created_at.slice(0, 10);
          const count = r.total_guests ?? r.party_size ?? 1;
          if (!rsvpDailyMap[r.event_id]) rsvpDailyMap[r.event_id] = {};
          rsvpDailyMap[r.event_id][day] = (rsvpDailyMap[r.event_id][day] || 0) + count;
        }
      }
    }

    // Batch-fetch VIP invites for all events
    const { data: vipRows } = await sb
      .from("vip_invites")
      .select("id, event_id, email, max_guests, free_entry, used_at, used_rsvp_id, created_at")
      .in("event_id", eventIds);

    // Group VIP invites per event
    const vipByEvent = {};
    for (const v of (vipRows || [])) {
      if (!vipByEvent[v.event_id]) vipByEvent[v.event_id] = [];
      vipByEvent[v.event_id].push({
        email: v.email,
        maxGuests: v.max_guests,
        freeEntry: v.free_entry,
        redeemed: !!v.used_at,
        createdAt: v.created_at,
      });
    }

    // Build set of VIP RSVP IDs for golden-dot tracking
    const vipRsvpIds = new Set();
    for (const v of (vipRows || [])) {
      if (v.used_rsvp_id) vipRsvpIds.add(v.used_rsvp_id);
    }

    // Now populate VIP RSVP daily map using the vipRsvpIds set
    // Count VIP bookings (not total guests) — each redeemed VIP invite = 1 VIP RSVP
    for (const r of (rsvpRows || [])) {
      if (r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending") {
        const rDate = new Date(r.created_at);
        if (rDate >= periodStart && rDate <= periodEnd && vipRsvpIds.has(r.id)) {
          const day = r.created_at.slice(0, 10);
          if (!vipRsvpDailyMap[r.event_id]) vipRsvpDailyMap[r.event_id] = {};
          vipRsvpDailyMap[r.event_id][day] = (vipRsvpDailyMap[r.event_id][day] || 0) + 1;
        }
      }
    }

    // Compute pulled_up counts per event (period-filtered like rsvpCountMap)
    const pulledUpMap = {};
    for (const r of (rsvpRows || [])) {
      if (r.pulled_up === true && (r.booking_status === "CONFIRMED" || r.status === "attending")) {
        const rDate = new Date(r.created_at);
        if (rDate >= periodStart && rDate <= periodEnd) {
          const count = r.pulled_up_count ?? r.total_guests ?? r.party_size ?? 1;
          pulledUpMap[r.event_id] = (pulledUpMap[r.event_id] || 0) + count;
        }
      }
    }

    // Compute dinner counts per event (period-filtered)
    const dinnerMap = {};
    const dinnerEventIds = new Set((events || []).filter(e => e.dinner_enabled).map(e => e.id));
    for (const r of (rsvpRows || [])) {
      if (!dinnerEventIds.has(r.event_id)) continue;
      const hasDinner = ((r.dinner && r.dinner.enabled) || r.wants_dinner) &&
        (r.dinner_status === "confirmed" || (r.dinner && r.dinner.bookingStatus === "CONFIRMED"));
      if (hasDinner && (r.booking_status === "CONFIRMED" || r.status === "attending")) {
        const rDate = new Date(r.created_at);
        if (rDate >= periodStart && rDate <= periodEnd) {
          const count = r.dinner_party_size ?? r.total_guests ?? r.party_size ?? 1;
          dinnerMap[r.event_id] = (dinnerMap[r.event_id] || 0) + count;
        }
      }
    }

    // Batch-query payments for paid events
    const paidEventIds = (events || []).filter(e => e.ticket_type === "paid").map(e => e.id);
    const revenueMap = {};
    if (paidEventIds.length > 0) {
      const { data: paymentRows } = await sb
        .from("payments")
        .select("event_id, amount")
        .in("event_id", paidEventIds)
        .eq("status", "succeeded");
      for (const p of (paymentRows || [])) {
        revenueMap[p.event_id] = (revenueMap[p.event_id] || 0) + (p.amount || 0);
      }
    }

    // Build events list filtered by period
    const eventsWithAnalytics = (events || []).map((e) => {
      const rsvps = rsvpCountMap[e.id] || 0;
      totalRsvps += rsvps;
      const ev = eventViewMap[e.id] || { views: 0, visitors: new Set() };

      // Per-event sources (unique visitors)
      const srcMap = eventSourceMap[e.id] || {};
      const uniqueCount = ev.visitors.size;
      const sources = Object.entries(srcMap)
        .map(([source, visitors]) => ({ source, count: visitors.size, percentage: uniqueCount > 0 ? Math.round((visitors.size / uniqueCount) * 1000) / 10 : 0 }))
        .sort((a, b) => b.count - a.count);

      // Per-event daily unique visitors + RSVPs + per-source breakdown for the period
      const dailySourceData = eventDailySourceMap[e.id] || {};
      const dailyViews = currentDays.map(date => {
        const bySourceSets = dailySourceData[date] || {};
        const bySource = {};
        for (const [src, visitors] of Object.entries(bySourceSets)) {
          bySource[src] = visitors.size;
        }
        return {
          date,
          views: (eventDailyMap[e.id] && eventDailyMap[e.id][date]) ? eventDailyMap[e.id][date].size : 0,
          rsvps: (rsvpDailyMap[e.id] && rsvpDailyMap[e.id][date]) || 0,
          vipRsvps: (vipRsvpDailyMap[e.id] && vipRsvpDailyMap[e.id][date]) || 0,
          bySource,
        };
      });

      const capacity = e.total_capacity || e.cocktail_capacity || 0;
      const pulledUp = pulledUpMap[e.id] || 0;
      const dinnerCount = dinnerMap[e.id] || 0;
      const isPaid = e.ticket_type === "paid";
      const revenue = revenueMap[e.id] || 0;
      const showRate = rsvps > 0 ? Math.round((pulledUp / rsvps) * 1000) / 10 : 0;

      // Compute dinner capacity from slot config
      let dinnerCapacity = 0;
      if (e.dinner_enabled) {
        const slots = generateDinnerTimeSlots({
          dinnerEnabled: true,
          dinnerStartTime: e.dinner_start_time,
          dinnerEndTime: e.dinner_end_time,
          dinnerSeatingIntervalHours: e.dinner_seating_interval_hours,
          dinnerSlots: e.dinner_slots,
        });
        for (const slotTime of slots) {
          let slotCap = e.dinner_max_seats_per_slot || 0;
          if (Array.isArray(e.dinner_slots)) {
            const match = e.dinner_slots.find(s => {
              if (!s || typeof s === 'string') return false;
              try { return new Date(s.time).getTime() === new Date(slotTime).getTime(); } catch { return false; }
            });
            if (match && typeof match.capacity === 'number') slotCap = match.capacity;
          }
          dinnerCapacity += slotCap;
        }
      }

      return {
        id: e.id,
        title: e.title,
        slug: e.slug,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        cover_image_url: e.cover_image_url || e.image_url,
        views: ev.visitors.size,
        unique_visitors: ev.visitors.size,
        rsvps,
        dinner: dinnerCount,
        dinner_enabled: !!e.dinner_enabled,
        dinner_capacity: dinnerCapacity,
        pulled_up: pulledUp,
        capacity,
        is_paid: isPaid,
        ticket_price: e.ticket_price || 0,
        ticket_currency: e.ticket_currency || "sek",
        revenue,
        show_rate: showRate,
        conversion_rate: uniqueCount > 0
          ? Math.round((rsvps / uniqueCount) * 1000) / 10
          : 0,
        sources,
        daily: dailyViews,
        device_split: (() => {
          const dm = eventDeviceMap[e.id];
          if (!dm) return { mobile: 0, desktop: 0, unknown: 0 };
          return { mobile: dm.mobile.size, desktop: dm.desktop.size, unknown: dm.unknown.size };
        })(),
      };
    });
    eventsWithAnalytics.sort((a, b) => b.unique_visitors - a.unique_visitors);

    // Build chart data arrays
    const current = currentDays.map((date) => ({
      date,
      views: dailyTotal[date] ? dailyTotal[date].size : 0,
    }));
    const previous = currentDays.map((date) => ({
      date,
      views: prevDailyTotal[date] || 0,
    }));

    // Build per-event stacked data (top events only)
    const topEventIds = eventsWithAnalytics.filter(e => e.unique_visitors > 0).slice(0, 8).map(e => e.id);
    const stackedData = currentDays.map((date) => {
      const entry = { date };
      let accounted = 0;
      for (const eid of topEventIds) {
        const val = (dailyPerEvent[eid] && dailyPerEvent[eid][date]) ? dailyPerEvent[eid][date].size : 0;
        entry[eid] = val;
        accounted += val;
      }
      entry._other = Math.max(0, (dailyTotal[date] ? dailyTotal[date].size : 0) - accounted);
      return entry;
    });

    // Previous period aggregate stats
    const prevViews = (views || []).filter(v => {
      const d = new Date(v.created_at);
      return d >= prevStart && d <= prevEnd;
    });
    // Use sum of per-event unique visitors (not global deduped) to match event list totals
    const currentUniqueVisitors = eventsWithAnalytics.reduce((s, e) => s + e.unique_visitors, 0);

    // For previous period, compute per-event unique visitors the same way
    const prevEventVisitors = {};
    for (const v of (views || [])) {
      const d = new Date(v.created_at);
      if (d >= prevStart && d <= prevEnd) {
        if (!prevEventVisitors[v.event_id]) prevEventVisitors[v.event_id] = new Set();
        prevEventVisitors[v.event_id].add(v.visitor_id);
      }
    }
    const prevUniqueVisitors = Object.values(prevEventVisitors).reduce((s, set) => s + set.size, 0);

    const viewsChange = prevUniqueVisitors > 0
      ? Math.round(((currentUniqueVisitors - prevUniqueVisitors) / prevUniqueVisitors) * 100)
      : null;
    const uniqueChange = viewsChange;

    const totalPeriodViews = Object.values(dailyTotal).reduce((s, v) => s + v.size, 0);

    // Aggregate device split from per-event unique visitor sets
    const deviceCounts = { mobile: 0, desktop: 0, unknown: 0 };
    for (const dm of Object.values(eventDeviceMap)) {
      deviceCounts.mobile += dm.mobile.size;
      deviceCounts.desktop += dm.desktop.size;
      deviceCounts.unknown += dm.unknown.size;
    }

    // ── Campaign funnel tracking ──
    // Fetch email_outbox for campaigns related to this host's events
    // Get all event slugs for campaign_tag matching
    const eventSlugMap = {};
    for (const e of (events || [])) {
      eventSlugMap[e.id] = e.slug;
    }
    const allSlugs = Object.values(eventSlugMap);

    // Restrict campaigns to those THIS host actually sent. Without this,
    // every host saw the union of every host's campaigns because the
    // campaign_tag prefix is shared platform-wide. Look up the user's
    // own campaign ids first, build the matching tag list, then scope
    // the outbox query to those tags only.
    const { data: ownedCampaigns } = await sb
      .from("email_campaigns")
      .select("id")
      .eq("user_id", req.user.id);
    const ownedTagList = (ownedCampaigns || []).map(
      (c) => `host_campaign_${c.id}`,
    );

    const { data: outboxRows } = ownedTagList.length === 0
      ? { data: [] }
      : await sb
          .from("email_outbox")
          .select("id, tracking_id, to_email, campaign_tag, status, created_at")
          .in("campaign_tag", ownedTagList)
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString());

    // Build campaign data if we have outbox rows
    let campaigns = [];
    if (outboxRows && outboxRows.length > 0) {
      // Group by campaign_tag
      const campaignMap = {};
      const allTrackingIds = [];
      for (const row of outboxRows) {
        if (!row.campaign_tag) continue;
        if (!campaignMap[row.campaign_tag]) {
          campaignMap[row.campaign_tag] = { sent: 0, emails: new Set(), trackingIds: [] };
        }
        campaignMap[row.campaign_tag].sent++;
        campaignMap[row.campaign_tag].emails.add(row.to_email);
        if (row.tracking_id) {
          campaignMap[row.campaign_tag].trackingIds.push(row.tracking_id);
          allTrackingIds.push(row.tracking_id);
        }
      }

      // Batch fetch opens and clicks for all tracking IDs
      let opensSet = new Set();
      let clicksSet = new Set();
      if (allTrackingIds.length > 0) {
        const { data: openRows } = await sb
          .from("email_opens")
          .select("tracking_id")
          .in("tracking_id", allTrackingIds);
        for (const o of (openRows || [])) opensSet.add(o.tracking_id);

        const { data: clickRows } = await sb
          .from("email_clicks")
          .select("tracking_id")
          .in("tracking_id", allTrackingIds);
        for (const c of (clickRows || [])) clicksSet.add(c.tracking_id);
      }

      // Count page views and RSVPs per campaign using utm_campaign
      // Also build per-event campaign view counts
      const campaignViewMap = {}; // { campaign_tag: count }
      const campaignVisitorMap = {}; // { campaign_tag: Set<visitor_id> }
      const eventCampaignMap = {}; // { event_id: { campaign_tag: count } }
      for (const v of (views || [])) {
        if (!v.utm_campaign) continue;
        // Only count host campaign views, skip admin/VIP campaigns
        if (!v.utm_campaign.startsWith("host_campaign_")) continue;
        const vDate = new Date(v.created_at);
        if (vDate >= periodStart && vDate <= periodEnd) {
          campaignViewMap[v.utm_campaign] = (campaignViewMap[v.utm_campaign] || 0) + 1;
          if (!campaignVisitorMap[v.utm_campaign]) campaignVisitorMap[v.utm_campaign] = new Set();
          campaignVisitorMap[v.utm_campaign].add(v.visitor_id);

          // Per-event campaign breakdown
          if (!eventCampaignMap[v.event_id]) eventCampaignMap[v.event_id] = {};
          eventCampaignMap[v.event_id][v.utm_campaign] = (eventCampaignMap[v.event_id][v.utm_campaign] || 0) + 1;
        }
      }

      // Match RSVPs to campaigns via visitor_id
      const campaignRsvpMap = {}; // { campaign_tag: count }
      for (const r of (rsvpRows || [])) {
        if (!(r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending")) continue;
        if (!r.visitor_id) continue;
        const rDate = new Date(r.created_at);
        if (rDate < periodStart || rDate > periodEnd) continue;
        // Check which campaigns this visitor came from
        for (const [tag, visitors] of Object.entries(campaignVisitorMap)) {
          if (visitors.has(r.visitor_id)) {
            campaignRsvpMap[tag] = (campaignRsvpMap[tag] || 0) + 1;
          }
        }
      }

      // Batch-fetch campaign names
      const hostCampaignIds = Object.keys(campaignMap)
        .filter(t => t.startsWith("host_campaign_"))
        .map(t => t.replace("host_campaign_", ""));
      let campaignNameMap = {};
      if (hostCampaignIds.length > 0) {
        try {
          const { data: campaignRows } = await sb
            .from("campaign_campaigns")
            .select("id, name, subject")
            .in("id", hostCampaignIds);
          for (const row of (campaignRows || [])) {
            campaignNameMap[row.id] = row.name || row.subject || `host_campaign_${row.id}`;
          }
        } catch {}
      }

      // Build campaign array
      for (const [tag, data] of Object.entries(campaignMap)) {
        const opened = data.trackingIds.filter(t => opensSet.has(t)).length;
        const clicked = data.trackingIds.filter(t => clicksSet.has(t)).length;
        const visited = campaignViewMap[tag] || 0;
        const rsvps = campaignRsvpMap[tag] || 0;

        let name = tag;
        if (tag.startsWith("host_campaign_")) {
          const cId = tag.replace("host_campaign_", "");
          if (campaignNameMap[cId]) name = campaignNameMap[cId];
        }

        campaigns.push({
          tag,
          name,
          sent: data.sent,
          opened,
          clicked,
          visited,
          rsvps,
          openRate: data.sent > 0 ? Math.round((opened / data.sent) * 1000) / 10 : 0,
          clickRate: opened > 0 ? Math.round((clicked / opened) * 1000) / 10 : 0,
          visitRate: clicked > 0 ? Math.round((visited / clicked) * 1000) / 10 : 0,
          conversionRate: visited > 0 ? Math.round((rsvps / visited) * 1000) / 10 : 0,
        });
      }
      campaigns.sort((a, b) => b.sent - a.sent);

      // Attach campaign breakdowns to events
      for (const ev of eventsWithAnalytics) {
        const ecm = eventCampaignMap[ev.id];
        if (ecm) {
          ev.campaignBreakdown = Object.entries(ecm)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);
        }
      }
    }

    // Also need utm_campaign in the views query — it's already selected, let's add it to per-event source tracking
    // (utm_campaign is captured but we need to pass it through the event source data)

    return res.json({
      events: eventsWithAnalytics,
      total_views: eventsWithAnalytics.reduce((s, e) => s + e.unique_visitors, 0),
      total_unique_visitors: eventsWithAnalytics.reduce((s, e) => s + e.unique_visitors, 0),
      total_rsvps: totalRsvps,
      total_pulled_up: Object.values(pulledUpMap).reduce((s, v) => s + v, 0),
      total_dinner: Object.values(dinnerMap).reduce((s, v) => s + v, 0),
      has_dinner_events: dinnerEventIds.size > 0,
      total_revenue: Object.values(revenueMap).reduce((s, v) => s + v, 0),
      revenue_by_currency: (() => {
        const byCur = {};
        for (const e of (events || [])) {
          if (e.ticket_type === "paid" && revenueMap[e.id]) {
            const cur = e.ticket_currency || "sek";
            byCur[cur] = (byCur[cur] || 0) + revenueMap[e.id];
          }
        }
        return byCur;
      })(),
      has_paid_events: paidEventIds.length > 0,
      avg_show_rate: totalRsvps > 0
        ? Math.round((Object.values(pulledUpMap).reduce((s, v) => s + v, 0) / totalRsvps) * 1000) / 10
        : 0,
      newsletter_views: newsletterViews,
      device_split: deviceCounts,
      campaigns,
      daily_views: dailyTotal,
      avg_conversion: totalPeriodViews > 0
        ? Math.round((totalRsvps / totalPeriodViews) * 1000) / 10
        : 0,
      chart: {
        current,
        previous,
        stacked: stackedData,
        eventLabels: topEventIds.map(id => ({ id, title: eventTitleMap[id] || "Unknown" })),
      },
      period: {
        days,
        currentViews: currentUniqueVisitors,
        currentUnique: currentUniqueVisitors,
        prevViews: prevUniqueVisitors,
        prevUnique: prevUniqueVisitors,
        viewsChange,
        uniqueChange,
      },
    });
  } catch (err) {
    console.error("[host] aggregate analytics error:", err.message);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// GET /host/events/:id/analytics — page view analytics for hosts
app.get("/host/events/:id/analytics", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify the user has access to this event
    const { isHost } = await isUserEventHost(req.user.id, id);
    if (!isHost) {
      return res.status(403).json({ error: "Forbidden", message: "You don't have access to this event" });
    }

    const { supabase: sb } = await import("./supabase.js");

    // Date range (default last 30 days)
    const days = 30;
    const periodEnd = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const periodStart = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(periodEnd.getTime() - days * 86400000);
    const periodLenMs = periodEnd.getTime() - periodStart.getTime();
    const prevEnd = new Date(periodStart.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodLenMs);

    // Get page views for current + previous period (filter at DB level)
    const [{ data: views, error: viewsErr }, { data: prevViews, error: prevViewsErr }] = await Promise.all([
      sb.from("event_page_views")
        .select("id, visitor_id, referrer, utm_source, utm_medium, utm_campaign, utm_content, device_type, created_at")
        .eq("event_id", id)
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString())
        .order("created_at", { ascending: false }),
      sb.from("event_page_views")
        .select("id, visitor_id, referrer, utm_source, utm_medium, utm_campaign, utm_content, device_type, created_at")
        .eq("event_id", id)
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString())
        .order("created_at", { ascending: false }),
    ]);

    if (viewsErr) throw viewsErr;

    const totalViews = views.length;
    const uniqueVisitors = new Set(views.map(v => v.visitor_id).filter(Boolean)).size;
    const prevUniqueVisitors = new Set(prevViews.map(v => v.visitor_id).filter(Boolean)).size;

    // Period comparison (based on unique visitors)
    const viewsChange = prevUniqueVisitors > 0
      ? Math.round(((uniqueVisitors - prevUniqueVisitors) / prevUniqueVisitors) * 1000) / 10
      : uniqueVisitors > 0 ? 100 : 0;
    const uniqueChange = viewsChange;

    // Device split (unique visitors per device)
    const device_split = { mobile: 0, desktop: 0, unknown: 0 };
    const deviceVisitors = { mobile: new Set(), desktop: new Set(), unknown: new Set() };
    for (const v of views) {
      const dt = (v.device_type || "").toLowerCase();
      const vid = v.visitor_id || v.id;
      if (dt === "mobile") deviceVisitors.mobile.add(vid);
      else if (dt === "desktop") deviceVisitors.desktop.add(vid);
      else deviceVisitors.unknown.add(vid);
    }
    device_split.mobile = deviceVisitors.mobile.size;
    device_split.desktop = deviceVisitors.desktop.size;
    device_split.unknown = deviceVisitors.unknown.size;

    // Source detection helper
    function detectSource(v) {
      let source = "direct";
      if (v.utm_source) {
        source = v.utm_source;
      } else if (v.referrer) {
        try {
          const host = new URL(v.referrer).hostname.replace("www.", "");
          if (host.includes("instagram")) source = "instagram";
          else if (host.includes("facebook") || host.includes("fb.")) source = "facebook";
          else if (host.includes("twitter") || host.includes("x.com")) source = "twitter";
          else if (host.includes("linkedin")) source = "linkedin";
          else if (host.includes("pullup")) source = "pullup";
          else source = host;
        } catch {
          source = "other";
        }
      }
      return source;
    }

    // Traffic sources breakdown (unique visitors per source)
    const sourceVisitorMap = {};
    for (const v of views) {
      const source = detectSource(v);
      if (!sourceVisitorMap[source]) sourceVisitorMap[source] = new Set();
      sourceVisitorMap[source].add(v.visitor_id || v.id);
    }
    const sources = Object.entries(sourceVisitorMap)
      .map(([source, visitors]) => ({ source, count: visitors.size, percentage: uniqueVisitors > 0 ? Math.round((visitors.size / uniqueVisitors) * 1000) / 10 : 0 }))
      .sort((a, b) => b.count - a.count);

    // Fetch RSVPs
    const { data: rsvpRows } = await sb
      .from("rsvps")
      .select("id, event_id, party_size, total_guests, booking_status, status, visitor_id, created_at, pulled_up, pulled_up_count, wants_dinner, dinner, dinner_party_size, dinner_status")
      .eq("event_id", id);

    const validRsvps = (rsvpRows || []).filter(r =>
      r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending"
    );
    const periodRsvps = validRsvps.filter(r => {
      const d = new Date(r.created_at);
      return d >= periodStart && d <= periodEnd;
    });

    // Get RSVP count for conversion funnel
    const counts = await getEventCounts(id);
    const rsvp_count = (counts?.confirmed || 0) + (counts?.waitlist || 0);

    // Pulled up count
    const pulledUpCount = validRsvps.filter(r => r.pulled_up === true)
      .reduce((s, r) => s + (r.pulled_up_count ?? r.total_guests ?? r.party_size ?? 1), 0);

    // Get event details for capacity and ticket info
    const eventDetails = await findEventById(id);
    const capacity = eventDetails?.total_capacity || eventDetails?.cocktail_capacity || 0;
    const isPaid = eventDetails?.ticket_type === "paid" || eventDetails?.ticketType === "paid";
    const ticketPrice = eventDetails?.ticket_price || eventDetails?.ticketPrice || 0;
    const ticketCurrency = eventDetails?.ticket_currency || eventDetails?.ticketCurrency || "sek";
    const dinnerEnabled = eventDetails?.dinnerEnabled || eventDetails?.dinner_enabled || false;

    // Dinner count + capacity
    let dinnerCount = 0;
    let dinnerCapacity = 0;
    if (dinnerEnabled) {
      dinnerCount = validRsvps.filter(r => {
        const d = r.dinner || {};
        return ((d.enabled) || r.wants_dinner) &&
          (r.dinner_status === "confirmed" || (d.bookingStatus === "CONFIRMED"));
      }).reduce((s, r) => s + (r.dinner_party_size ?? r.total_guests ?? r.party_size ?? 1), 0);

      const dinnerSlots = generateDinnerTimeSlots({
        dinnerEnabled: true,
        dinnerStartTime: eventDetails?.dinnerStartTime || eventDetails?.dinner_start_time,
        dinnerEndTime: eventDetails?.dinnerEndTime || eventDetails?.dinner_end_time,
        dinnerSeatingIntervalHours: eventDetails?.dinnerSeatingIntervalHours || eventDetails?.dinner_seating_interval_hours,
        dinnerSlots: eventDetails?.dinnerSlots || eventDetails?.dinner_slots,
      });
      const defaultSlotCap = eventDetails?.dinnerMaxSeatsPerSlot || eventDetails?.dinner_max_seats_per_slot || 0;
      const slotsConfig = eventDetails?.dinnerSlots || eventDetails?.dinner_slots;
      for (const slotTime of dinnerSlots) {
        let slotCap = defaultSlotCap;
        if (Array.isArray(slotsConfig)) {
          const match = slotsConfig.find(s => {
            if (!s || typeof s === 'string') return false;
            try { return new Date(s.time).getTime() === new Date(slotTime).getTime(); } catch { return false; }
          });
          if (match && typeof match.capacity === 'number') slotCap = match.capacity;
        }
        dinnerCapacity += slotCap;
      }
    }

    // Revenue for paid events
    let revenue = 0;
    if (isPaid) {
      const { data: paymentRows } = await sb
        .from("payments")
        .select("amount")
        .eq("event_id", id)
        .eq("status", "succeeded");
      revenue = (paymentRows || []).reduce((s, p) => s + (p.amount || 0), 0);
    }

    // VIP invites — only need rsvp IDs for golden dots on chart
    let vipRsvpIds = new Set();
    try {
      const { data: vipRows } = await sb
        .from("vip_invites")
        .select("used_rsvp_id")
        .eq("event_id", id)
        .not("used_rsvp_id", "is", null);
      for (const v of (vipRows || [])) {
        if (v.used_rsvp_id) vipRsvpIds.add(v.used_rsvp_id);
      }
    } catch (e) {
      console.error("[host] vip invites fetch error:", e.message);
    }

    // Daily data with unique visitors per source + RSVPs + VIP RSVPs
    const dailyMap = {};
    const dailyVisitorSets = {};
    // Initialize all days in range
    const cursor = new Date(periodStart);
    while (cursor <= periodEnd) {
      const day = cursor.toISOString().slice(0, 10);
      dailyMap[day] = { date: day, views: 0, rsvps: 0, vipRsvps: 0, bySource: {} };
      dailyVisitorSets[day] = { total: new Set(), bySource: {} };
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const v of views) {
      const day = v.created_at.slice(0, 10);
      if (!dailyMap[day]) {
        dailyMap[day] = { date: day, views: 0, rsvps: 0, vipRsvps: 0, bySource: {} };
        dailyVisitorSets[day] = { total: new Set(), bySource: {} };
      }
      const vid = v.visitor_id || v.id;
      dailyVisitorSets[day].total.add(vid);
      const src = detectSource(v);
      if (!dailyVisitorSets[day].bySource[src]) dailyVisitorSets[day].bySource[src] = new Set();
      dailyVisitorSets[day].bySource[src].add(vid);
    }
    // Convert sets to counts
    for (const day of Object.keys(dailyMap)) {
      dailyMap[day].views = dailyVisitorSets[day].total.size;
      for (const [src, visitors] of Object.entries(dailyVisitorSets[day].bySource)) {
        dailyMap[day].bySource[src] = visitors.size;
      }
    }
    for (const r of periodRsvps) {
      const day = r.created_at.slice(0, 10);
      if (!dailyMap[day]) continue;
      dailyMap[day].rsvps++;
      if (vipRsvpIds.has(r.id)) dailyMap[day].vipRsvps++;
    }
    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Newsletter impact
    const newsletterViews = views.filter(v => v.utm_source === "pullup_newsletter").length;

    // VIP email views on event page
    const vipViews = views.filter(v =>
      v.utm_campaign && v.utm_campaign.startsWith("vip_invite_")
    ).length;

    // VIP invite email impact (existing VIP stats)
    const event = eventDetails;
    let vipStats = null;
    if (event?.slug) {
      try {
        const campaignTag = `vip_invite_${event.slug}`;
        const { data: vipOutbox } = await sb
          .from("email_outbox")
          .select("id, tracking_id")
          .eq("campaign_tag", campaignTag);

        if (vipOutbox && vipOutbox.length > 0) {
          const trackingIds = vipOutbox.map(r => r.tracking_id).filter(Boolean);
          const [opensRes, clicksRes] = await Promise.all([
            trackingIds.length > 0
              ? sb.from("email_opens").select("tracking_id").in("tracking_id", trackingIds)
              : { data: [] },
            trackingIds.length > 0
              ? sb.from("email_clicks").select("tracking_id").in("tracking_id", trackingIds)
              : { data: [] },
          ]);
          const uniqueOpens = new Set((opensRes.data || []).map(o => o.tracking_id)).size;
          const uniqueClicks = new Set((clicksRes.data || []).map(c => c.tracking_id)).size;
          vipStats = {
            totalSent: vipOutbox.length,
            uniqueOpens,
            uniqueClicks,
            openRate: vipOutbox.length > 0 ? Math.round((uniqueOpens / vipOutbox.length) * 1000) / 10 : 0,
            clickRate: vipOutbox.length > 0 ? Math.round((uniqueClicks / vipOutbox.length) * 1000) / 10 : 0,
          };
        }
      } catch (vipErr) {
        console.error("[host] vip analytics error:", vipErr.message);
      }
    }

    // Host campaign funnel — only campaigns that featured THIS event
    let campaigns = [];
    try {
      // First, find campaign IDs that are linked to this event
      const { data: eventCampaigns } = await sb
        .from("campaign_campaigns")
        .select("id")
        .eq("event_id", id);

      const eventCampaignTags = (eventCampaigns || []).map(c => `host_campaign_${c.id}`);

      // Only fetch outbox rows for campaigns that include this event
      let outboxRows = [];
      if (eventCampaignTags.length > 0) {
        const { data: rows } = await sb
          .from("email_outbox")
          .select("id, tracking_id, to_email, campaign_tag, status, created_at")
          .in("campaign_tag", eventCampaignTags)
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString());
        outboxRows = rows || [];
      }

      if (outboxRows && outboxRows.length > 0) {
        const campaignMap = {};
        const allTrackingIds = [];
        for (const row of outboxRows) {
          if (!row.campaign_tag) continue;
          if (!campaignMap[row.campaign_tag]) {
            campaignMap[row.campaign_tag] = { sent: 0, emails: new Set(), trackingIds: [] };
          }
          campaignMap[row.campaign_tag].sent++;
          campaignMap[row.campaign_tag].emails.add(row.to_email);
          if (row.tracking_id) {
            campaignMap[row.campaign_tag].trackingIds.push(row.tracking_id);
            allTrackingIds.push(row.tracking_id);
          }
        }

        let opensSet = new Set();
        let clicksSet = new Set();
        // Per-tracking-id breakdown: tracking_id -> array of { link_label, link_url }
        const clicksByTracking = new Map();
        if (allTrackingIds.length > 0) {
          const { data: openRows } = await sb
            .from("email_opens")
            .select("tracking_id")
            .in("tracking_id", allTrackingIds);
          for (const o of (openRows || [])) opensSet.add(o.tracking_id);

          const { data: clickRows } = await sb
            .from("email_clicks")
            .select("tracking_id, link_url, link_label")
            .in("tracking_id", allTrackingIds);
          for (const c of (clickRows || [])) {
            clicksSet.add(c.tracking_id);
            if (!clicksByTracking.has(c.tracking_id)) clicksByTracking.set(c.tracking_id, []);
            clicksByTracking.get(c.tracking_id).push({ link_url: c.link_url, link_label: c.link_label });
          }
        }

        // Count page views and RSVPs per campaign using utm_campaign
        const campaignViewMap = {};
        const campaignVisitorMap = {};
        for (const v of views) {
          if (!v.utm_campaign || !v.utm_campaign.startsWith("host_campaign_")) continue;
          campaignViewMap[v.utm_campaign] = (campaignViewMap[v.utm_campaign] || 0) + 1;
          if (!campaignVisitorMap[v.utm_campaign]) campaignVisitorMap[v.utm_campaign] = new Set();
          campaignVisitorMap[v.utm_campaign].add(v.visitor_id);
        }

        // Match RSVPs to campaigns via visitor_id
        const campaignRsvpMap = {};
        for (const r of periodRsvps) {
          if (!r.visitor_id) continue;
          for (const [tag, visitors] of Object.entries(campaignVisitorMap)) {
            if (visitors.has(r.visitor_id)) {
              campaignRsvpMap[tag] = (campaignRsvpMap[tag] || 0) + 1;
            }
          }
        }

        // Batch-fetch campaign names + template_type
        const campaignIds = Object.keys(campaignMap)
          .filter(t => t.startsWith("host_campaign_"))
          .map(t => t.replace("host_campaign_", ""));
        let campaignNameMap = {};
        let campaignTemplateTypeMap = {};
        if (campaignIds.length > 0) {
          try {
            const { data: campaignRows } = await sb
              .from("campaign_campaigns")
              .select("id, name, subject, template_type")
              .in("id", campaignIds);
            for (const row of (campaignRows || [])) {
              campaignNameMap[row.id] = row.name || row.subject || `host_campaign_${row.id}`;
              campaignTemplateTypeMap[row.id] = row.template_type || "event";
            }
          } catch {}
        }

        // Build campaign array
        for (const [tag, data] of Object.entries(campaignMap)) {
          const opened = data.trackingIds.filter(t => opensSet.has(t)).length;
          const clicked = data.trackingIds.filter(t => clicksSet.has(t)).length;
          const visited = campaignViewMap[tag] || 0;
          const rsvps = campaignRsvpMap[tag] || 0;

          let name = tag;
          let templateType = "event";
          if (tag.startsWith("host_campaign_")) {
            const cId = tag.replace("host_campaign_", "");
            if (campaignNameMap[cId]) name = campaignNameMap[cId];
            if (campaignTemplateTypeMap[cId]) templateType = campaignTemplateTypeMap[cId];
          }

          // Per-link breakdown across this campaign's recipients
          const linkMap = new Map();
          for (const tid of data.trackingIds) {
            const rows = clicksByTracking.get(tid) || [];
            for (const r of rows) {
              const label = r.link_label || "";
              const url = r.link_url || "";
              const key = label + "|" + url;
              const existing = linkMap.get(key) || { linkLabel: label, linkUrl: url, clicks: 0 };
              existing.clicks += 1;
              linkMap.set(key, existing);
            }
          }
          const linkBreakdown = Array.from(linkMap.values()).sort((a, b) => b.clicks - a.clicks);

          campaigns.push({
            tag,
            name,
            templateType,
            sent: data.sent,
            opened,
            clicked,
            visited,
            rsvps,
            openRate: data.sent > 0 ? Math.round((opened / data.sent) * 1000) / 10 : 0,
            clickRate: opened > 0 ? Math.round((clicked / opened) * 1000) / 10 : 0,
            visitRate: clicked > 0 ? Math.round((visited / clicked) * 1000) / 10 : 0,
            conversionRate: visited > 0 ? Math.round((rsvps / visited) * 1000) / 10 : 0,
            linkBreakdown,
          });
        }
        campaigns.sort((a, b) => b.sent - a.sent);
      }
    } catch (campErr) {
      console.error("[host] campaign funnel error:", campErr.message);
    }

    return res.json({
      total_views: uniqueVisitors,
      unique_visitors: uniqueVisitors,
      sources,
      daily,
      device_split,
      newsletter_views: newsletterViews,
      vip_stats: vipStats,
      vip_views: vipViews,
      campaigns,
      rsvp_count,
      pulled_up: pulledUpCount,
      dinner: dinnerCount,
      dinner_enabled: dinnerEnabled,
      dinner_capacity: dinnerCapacity,
      capacity,
      is_paid: isPaid,
      ticket_price: ticketPrice,
      ticket_currency: ticketCurrency,
      revenue,
      show_rate: rsvp_count > 0 ? Math.round((pulledUpCount / rsvp_count) * 1000) / 10 : 0,
      fill_rate: capacity > 0 ? Math.round((rsvp_count / capacity) * 1000) / 10 : 0,
      conversion_rate: uniqueVisitors > 0
        ? Math.round((rsvp_count / uniqueVisitors) * 1000) / 10
        : 0,
      period: {
        currentViews: uniqueVisitors,
        currentUnique: uniqueVisitors,
        prevViews: prevUniqueVisitors,
        prevUnique: prevUniqueVisitors,
        viewsChange,
        uniqueChange,
      },
    });
  } catch (err) {
    console.error("[host] event analytics error:", err.message);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// ---------------------------
// Stockholm Events (admin)
// ---------------------------

// GET /admin/stockholm-events — list events with optional filter
app.get("/admin/stockholm-events", requireAdmin, async (req, res) => {
  try {
    const { status, newsletter } = req.query;
    const { supabase } = await import('./supabase.js');
    let query = supabase
      .from("stockholm_events")
      .select("*")
      .order("starts_at", { ascending: true, nullsFirst: false });

    if (status) query = query.eq("status", status);
    if (newsletter === "true") query = query.not("newsletter_sent_at", "is", null);

    const { data, error } = await query;
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("[stockholm] list error:", err.message);
    return res.status(500).json({ error: "Failed to fetch stockholm events" });
  }
});

// POST /admin/stockholm-events — manually create a single event
app.post("/admin/stockholm-events", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { title, description, image_url, starts_at, ends_at, location, url, source, category, spotify_url } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const { data, error } = await supabase
      .from("stockholm_events")
      .upsert({ title, description, image_url, starts_at, ends_at, location, url, source: source || "manual", category: category || "culture", spotify_url: spotify_url || null }, { onConflict: "url", ignoreDuplicates: false })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    console.error("[stockholm] create error:", err.message);
    return res.status(500).json({ error: "Failed to create event" });
  }
});

// PATCH /admin/stockholm-events/:id — update status or newsletter flag
app.patch("/admin/stockholm-events/:id", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { id } = req.params;
    const { status, spotify_url } = req.body;
    const updates = {};
    if (status !== undefined) updates.status = status;
    if (spotify_url !== undefined) updates.spotify_url = spotify_url;

    const { data, error } = await supabase
      .from("stockholm_events")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("[stockholm] patch error:", err.message);
    return res.status(500).json({ error: "Failed to update stockholm event" });
  }
});

// DELETE /admin/stockholm-events/:id — remove an event
app.delete("/admin/stockholm-events/:id", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { id } = req.params;
    const { error } = await supabase
      .from("stockholm_events")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return res.status(204).send();
  } catch (err) {
    console.error("[stockholm] delete error:", err.message);
    return res.status(500).json({ error: "Failed to delete stockholm event" });
  }
});

// =========================================================================
// Scrape Sources CRUD
// =========================================================================

// GET /admin/scrape-sources — list all sources
app.get("/admin/scrape-sources", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { data, error } = await supabase
      .from("scrape_sources")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("[scrape-sources] list error:", err.message);
    return res.status(500).json({ error: "Failed to list scrape sources" });
  }
});

// POST /admin/scrape-sources — add a new source
app.post("/admin/scrape-sources", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { name, source_key, scrape_url, location, category, strategy, link_selector, image_attr, enabled } = req.body;
    if (!name || !source_key || !scrape_url) {
      return res.status(400).json({ error: "name, source_key, and scrape_url are required" });
    }
    const { data, error } = await supabase
      .from("scrape_sources")
      .insert({
        name,
        source_key,
        scrape_url,
        location: location || "Stockholm",
        category: category || "culture",
        strategy: strategy || "auto",
        link_selector: link_selector || null,
        image_attr: image_attr || null,
        enabled: enabled !== false,
      })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    console.error("[scrape-sources] create error:", err.message);
    return res.status(500).json({ error: err.message || "Failed to create scrape source" });
  }
});

// PATCH /admin/scrape-sources/:id — update a source
app.patch("/admin/scrape-sources/:id", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { id } = req.params;
    const updates = {};
    const allowed = ["name", "source_key", "scrape_url", "location", "category", "strategy", "link_selector", "image_attr", "enabled"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    const { data, error } = await supabase
      .from("scrape_sources")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("[scrape-sources] update error:", err.message);
    return res.status(500).json({ error: "Failed to update scrape source" });
  }
});

// DELETE /admin/scrape-sources/:id — remove a source
app.delete("/admin/scrape-sources/:id", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { id } = req.params;
    const { error } = await supabase
      .from("scrape_sources")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return res.status(204).send();
  } catch (err) {
    console.error("[scrape-sources] delete error:", err.message);
    return res.status(500).json({ error: "Failed to delete scrape source" });
  }
});

// POST /admin/stockholm-events/fetch-url — scrape a single URL and return event data
app.post("/admin/stockholm-events/fetch-url", requireAdmin, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });

    const { load } = await import("cheerio");

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const $ = load(html);

    // Extract via Open Graph / meta tags first (most reliable)
    const og = (name) =>
      $(`meta[property="og:${name}"]`).attr("content") ||
      $(`meta[name="og:${name}"]`).attr("content") ||
      null;
    const meta = (name) => $(`meta[name="${name}"]`).attr("content") || null;

    // JSON-LD structured data
    let jsonLd = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html());
        if (parsed["@type"] === "Event" || parsed?.["@type"]?.includes?.("Event")) {
          jsonLd = parsed;
        }
      } catch {}
    });

    // __NEXT_DATA__ (Luma, Partiful, etc.)
    let nextData = null;
    try {
      const raw = $("#__NEXT_DATA__").text();
      if (raw) nextData = JSON.parse(raw);
    } catch {}

    const title =
      og("title") ||
      jsonLd?.name ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      null;

    const description =
      og("description") ||
      meta("description") ||
      jsonLd?.description ||
      $("p").first().text().trim().slice(0, 500) ||
      null;

    const image_url =
      og("image") ||
      jsonLd?.image?.url ||
      jsonLd?.image ||
      $('link[rel="image_src"]').attr("href") ||
      null;

    const starts_at =
      $('meta[property="event:start_time"]').attr("content") ||
      jsonLd?.startDate ||
      null;

    const ends_at =
      $('meta[property="event:end_time"]').attr("content") ||
      jsonLd?.endDate ||
      null;

    const location =
      og("location") ||
      jsonLd?.location?.name ||
      jsonLd?.location?.address?.streetAddress ||
      null;

    return res.json({ title, description, image_url, starts_at, ends_at, location, url });
  } catch (err) {
    console.error("[stockholm] fetch-url error:", err.message);
    return res.status(500).json({ error: "Failed to fetch URL: " + err.message });
  }
});

// POST /admin/stockholm-events/scrape — trigger scraper
app.post("/admin/stockholm-events/scrape", requireAdmin, async (req, res) => {
  try {
    // Run scraper as a child process so it doesn't block the request
    const { spawn } = await import("child_process");
    const { fileURLToPath } = await import("url");
    const { dirname, join } = await import("path");
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const scraperPath = join(__dirname, "../../scripts/scrape-stockholm-events.js");

    const child = spawn(process.execPath, [scraperPath], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.unref();

    return res.json({ message: "Scrape started in background" });
  } catch (err) {
    console.error("[stockholm] scrape trigger error:", err.message);
    return res.status(500).json({ error: "Failed to trigger scrape" });
  }
});

// ---------------------------
// Page View Tracking
// ---------------------------

// POST /t/pageview — public, no auth, records a page view
app.post("/t/pageview", async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { page, visitorId, referrer, deviceType } = req.body;
    if (!page) return res.status(400).json({ error: "page is required" });

    if (page === "landing" && visitorId) {
      // Detect source from referrer
      let source = "direct";
      if (referrer) {
        try {
          const host = new URL(referrer).hostname.replace("www.", "");
          if (host.includes("instagram")) source = "instagram";
          else if (host.includes("facebook") || host.includes("fb.")) source = "facebook";
          else if (host.includes("twitter") || host.includes("x.com")) source = "twitter";
          else if (host.includes("linkedin")) source = "linkedin";
          else if (host.includes("google")) source = "google";
          else if (host.includes("pullup")) source = "pullup";
          else source = host;
        } catch {
          source = "other";
        }
      }

      // Try new per-row table
      let inserted = false;
      try {
        // Dedup: same visitor + source within 30 min
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: existing } = await supabase
          .from("landing_page_views")
          .select("id")
          .eq("visitor_id", visitorId)
          .eq("source", source)
          .gte("created_at", thirtyMinAgo)
          .limit(1);

        if (existing && existing.length > 0) {
          return res.json({ ok: true, deduplicated: true });
        }

        const { error: insertErr } = await supabase.from("landing_page_views").insert({
          visitor_id: visitorId,
          referrer: referrer ? referrer.slice(0, 2000) : null,
          source,
          device_type: deviceType || null,
        });

        if (!insertErr) inserted = true;
      } catch (e) {
        // Table doesn't exist yet — fall through to legacy
      }

      if (inserted) return res.json({ ok: true });
      // Fall through to legacy tracking below
    }

    // Legacy aggregate tracking
    const today = new Date().toISOString().slice(0, 10);
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
    const ua = req.headers["user-agent"] || "unknown";
    const { createHash } = await import("crypto");
    const visitorHash = createHash("sha256").update(`${ip}:${ua}:${today}`).digest("hex").slice(0, 16);

    const { error } = await supabase.rpc("increment_page_view", {
      p_page: page,
      p_date: today,
      p_visitor_hash: visitorHash,
    });

    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    console.error("[pageview] error:", err.message);
    return res.status(500).json({ error: "Failed to record pageview" });
  }
});

// POST /t/event — public, no auth, records a landing-page funnel event.
// Keyed by the same visitor_id localStorage value used by /t/pageview so the
// funnel can be joined together in landing_page_events.
app.post("/t/event", async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { visitorId, eventName, source, deviceType, props } = req.body || {};
    if (!visitorId || !eventName) {
      return res.status(400).json({ error: "visitorId and eventName are required" });
    }
    // Whitelist: prevents a compromised frontend from flooding the table
    // with arbitrary event names.
    const ALLOWED = new Set([
      "cta_click",
      "onboarding_step_view",
      "onboarding_skip",
      "auth_start",
      "signed_in",
    ]);
    if (!ALLOWED.has(eventName)) {
      return res.status(400).json({ error: "unknown eventName" });
    }
    // Dedup: same visitor + event within 2s absorbs double-taps.
    const twoSecAgo = new Date(Date.now() - 2000).toISOString();
    const { data: recent } = await supabase
      .from("landing_page_events")
      .select("id")
      .eq("visitor_id", visitorId)
      .eq("event_name", eventName)
      .gte("created_at", twoSecAgo)
      .limit(1);
    if (recent && recent.length > 0) {
      return res.json({ ok: true, deduplicated: true });
    }
    const { error: insertErr } = await supabase.from("landing_page_events").insert({
      visitor_id: visitorId,
      event_name: eventName,
      source: source || null,
      device_type: deviceType || null,
      props: props || null,
    });
    if (insertErr) throw insertErr;
    return res.json({ ok: true });
  } catch (err) {
    console.error("[event] error:", err.message);
    return res.status(500).json({ error: "Failed to record event" });
  }
});

// GET /admin/analytics/pageviews — daily page views for a date range
app.get("/admin/analytics/pageviews", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { periodStart, periodEnd, days: numDays } = resolveAnalyticsRange(req);

    // Previous period of equal length, immediately before the current range,
    // so the change-indicator math compares like-for-like.
    const prevEnd = new Date(periodStart.getTime() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - numDays + 1);
    prevStart.setHours(0, 0, 0, 0);

    // Try new per-row table first
    let currentRows = [];
    let prevRows = [];
    let useNewTable = false;

    try {
      const [{ data: views, error: viewsErr }, { data: pv, error: pvErr }] = await Promise.all([
        supabase.from("landing_page_views")
          .select("id, visitor_id, referrer, source, device_type, created_at")
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString())
          .order("created_at", { ascending: false }),
        supabase.from("landing_page_views")
          .select("id, visitor_id, source, created_at")
          .gte("created_at", prevStart.toISOString())
          .lte("created_at", prevEnd.toISOString()),
      ]);
      if (!viewsErr && views && views.length > 0) {
        currentRows = views;
        prevRows = pv || [];
        useNewTable = true;
      }
    } catch (e) {
      // Table doesn't exist yet — fall through to legacy
    }

    // Fallback to legacy page_views_daily if new table empty/missing
    if (!useNewTable) {
      const startStr = periodStart.toISOString().slice(0, 10);
      const prevStartStr = prevStart.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("page_views_daily")
        .select("date, views, unique_visitors")
        .eq("page", "landing")
        .gte("date", prevStartStr)
        .order("date", { ascending: true });

      if (error) throw error;

      const rows = data || [];
      const daily = [];
      for (let i = 0; i < numDays; i++) {
        const d = new Date(periodStart);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const row = rows.find((r) => r.date === dateStr);
        daily.push({
          date: dateStr,
          views: row?.unique_visitors || row?.views || 0,
          bySource: (row?.unique_visitors || row?.views) ? { direct: row?.unique_visitors || row?.views || 0 } : {},
        });
      }

      const totalViews = daily.reduce((s, r) => s + r.views, 0);
      const prevDaily = [];
      for (let i = 0; i < numDays; i++) {
        const d = new Date(prevStart);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const row = rows.find((r) => r.date === dateStr);
        prevDaily.push({ views: row?.unique_visitors || row?.views || 0 });
      }
      const prevTotalViews = prevDaily.reduce((s, r) => s + r.views, 0);

      return res.json({
        daily,
        sources: totalViews > 0 ? [{ source: "direct", count: totalViews, percentage: 100 }] : [],
        totalViews,
        uniqueVisitors: totalViews,
        prevTotalViews,
        prevUniqueVisitors: prevTotalViews,
        viewsChange: prevTotalViews > 0 ? Math.round(((totalViews - prevTotalViews) / prevTotalViews) * 100) : null,
        uniqueChange: prevTotalViews > 0 ? Math.round(((totalViews - prevTotalViews) / prevTotalViews) * 100) : null,
        device_split: null,
        legacy: true,
      });
    }

    // --- New table path: full source-per-day analytics ---
    const uniqueVisitors = new Set(currentRows.map(v => v.visitor_id).filter(Boolean)).size;
    const prevUniqueVisitors = new Set(prevRows.map(v => v.visitor_id).filter(Boolean)).size;

    // Source breakdown
    const sourceVisitorMap = {};
    for (const v of currentRows) {
      const src = v.source || "direct";
      if (!sourceVisitorMap[src]) sourceVisitorMap[src] = new Set();
      sourceVisitorMap[src].add(v.visitor_id || v.id);
    }
    const sources = Object.entries(sourceVisitorMap)
      .map(([source, visitors]) => ({
        source,
        count: visitors.size,
        percentage: uniqueVisitors > 0 ? Math.round((visitors.size / uniqueVisitors) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Daily data with source stacking
    const dailyMap = {};
    const dailyVisitorSets = {};
    const cursor = new Date(periodStart);
    while (cursor <= periodEnd) {
      const day = cursor.toISOString().slice(0, 10);
      dailyMap[day] = { date: day, views: 0, bySource: {} };
      dailyVisitorSets[day] = { total: new Set(), bySource: {} };
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const v of currentRows) {
      const day = v.created_at.slice(0, 10);
      if (!dailyMap[day]) {
        dailyMap[day] = { date: day, views: 0, bySource: {} };
        dailyVisitorSets[day] = { total: new Set(), bySource: {} };
      }
      const vid = v.visitor_id || v.id;
      const src = v.source || "direct";
      dailyVisitorSets[day].total.add(vid);
      if (!dailyVisitorSets[day].bySource[src]) dailyVisitorSets[day].bySource[src] = new Set();
      dailyVisitorSets[day].bySource[src].add(vid);
    }
    for (const day of Object.keys(dailyMap)) {
      dailyMap[day].views = dailyVisitorSets[day].total.size;
      for (const [src, visitors] of Object.entries(dailyVisitorSets[day].bySource)) {
        dailyMap[day].bySource[src] = visitors.size;
      }
    }
    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Device split
    const deviceVisitors = { mobile: new Set(), desktop: new Set() };
    for (const v of currentRows) {
      const dt = (v.device_type || "").toLowerCase();
      const vid = v.visitor_id || v.id;
      if (dt === "mobile") deviceVisitors.mobile.add(vid);
      else deviceVisitors.desktop.add(vid);
    }

    const totalViews = currentRows.length;
    const prevTotalViews = prevRows.length;

    return res.json({
      daily,
      sources,
      totalViews,
      uniqueVisitors,
      prevTotalViews,
      prevUniqueVisitors,
      viewsChange: prevTotalViews > 0 ? Math.round(((totalViews - prevTotalViews) / prevTotalViews) * 100) : null,
      uniqueChange: prevUniqueVisitors > 0 ? Math.round(((uniqueVisitors - prevUniqueVisitors) / prevUniqueVisitors) * 100) : null,
      device_split: { mobile: deviceVisitors.mobile.size, desktop: deviceVisitors.desktop.size },
    });
  } catch (err) {
    console.error("[pageviews] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch pageviews" });
  }
});

// ---------------------------
// Admin: Platform-wide events overview
// ---------------------------
app.get("/admin/platform-events", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");
    const { filter = "upcoming" } = req.query;

    const now = new Date().toISOString();
    let query = sb
      .from("events")
      .select("id, slug, title, starts_at, ends_at, location, status, host_id, total_capacity, cocktail_capacity, ticket_type, created_at, admin_tags")
      .order("starts_at", { ascending: filter === "upcoming" });

    if (filter === "upcoming") {
      query = query.gte("starts_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()); // include recently started
    } else if (filter === "past") {
      query = query.lt("starts_at", now).order("starts_at", { ascending: false }).limit(50);
    }
    // filter === "all" — no date filter

    const { data: events, error } = await query;
    if (error) throw error;

    // Batch-fetch RSVP counts + host info
    const eventIds = (events || []).map(e => e.id);
    const hostIds = [...new Set((events || []).map(e => e.host_id).filter(Boolean))];

    const [{ data: rsvps }, { data: hosts }, { data: eventHosts }] = await Promise.all([
      eventIds.length > 0
        ? sb.from("rsvps").select("event_id, party_size, total_guests, booking_status, status").in("event_id", eventIds)
        : { data: [] },
      hostIds.length > 0
        ? sb.from("profiles").select("id, name, brand, contact_email").in("id", hostIds)
        : { data: [] },
      eventIds.length > 0
        ? sb.from("event_hosts").select("event_id, user_id, role").in("event_id", eventIds)
        : { data: [] },
    ]);

    const hostMap = {};
    for (const h of (hosts || [])) hostMap[h.id] = h;

    // Count confirmed RSVPs per event
    const rsvpCountMap = {};
    for (const r of (rsvps || [])) {
      if (r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending") {
        if (!rsvpCountMap[r.event_id]) rsvpCountMap[r.event_id] = 0;
        rsvpCountMap[r.event_id] += (r.total_guests ?? r.party_size ?? 1);
      }
    }

    const result = (events || []).map(ev => {
      const host = hostMap[ev.host_id];
      const capacity = ev.total_capacity || ev.cocktail_capacity || 0;
      return {
        id: ev.id,
        slug: ev.slug,
        title: ev.title,
        startsAt: ev.starts_at,
        endsAt: ev.ends_at,
        location: ev.location,
        status: ev.status,
        ticketType: ev.ticket_type,
        createdAt: ev.created_at,
        capacity,
        confirmedGuests: rsvpCountMap[ev.id] || 0,
        adminTags: Array.isArray(ev.admin_tags) ? ev.admin_tags : [],
        hostId: ev.host_id || null,
        host: host ? { id: host.id, name: host.name, brand: host.brand, email: host.contact_email } : null,
      };
    });

    return res.json({ events: result });
  } catch (err) {
    console.error("[admin/platform-events] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch events" });
  }
});

// Admin: PATCH /admin/platform-events/:id/tags — set internal classification
// tags for an event. Admin-only metadata; never exposed to hosts or guests.
// Body: { tags: string[] }  (also accepts comma-separated string for convenience)
app.patch("/admin/platform-events/:id/tags", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");
    const { id } = req.params;
    const raw = req.body?.tags;
    let tags = [];
    if (Array.isArray(raw)) {
      tags = raw;
    } else if (typeof raw === "string") {
      tags = raw.split(",");
    }
    tags = tags
      .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
      .filter(Boolean);
    // Dedupe, cap to 32 tags per event so a stray paste can't blow the row up.
    tags = [...new Set(tags)].slice(0, 32);

    const { data, error } = await sb
      .from("events")
      .update({ admin_tags: tags })
      .eq("id", id)
      .select("id, admin_tags")
      .single();
    if (error) throw error;
    return res.json({ id: data.id, adminTags: data.admin_tags || [] });
  } catch (err) {
    console.error("[admin/platform-events/tags] error:", err.message);
    return res.status(500).json({ error: "Failed to update tags" });
  }
});

// Admin: POST /admin/platform-events/:id/auto-tag — let Claude generate tags
// for an event and merge them with whatever's already there. Never destroys
// manual edits.
app.post("/admin/platform-events/:id/auto-tag", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");
    const { generateTagsForEvent, getTagVocabulary, mergeTags } = await import(
      "./services/aiTaggingService.js"
    );

    const { id } = req.params;
    const { data: dbEvent, error: fetchErr } = await sb
      .from("events")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchErr || !dbEvent) {
      return res.status(404).json({ error: "Event not found" });
    }

    const event = await mapEventFromDb(dbEvent);
    const vocabulary = await getTagVocabulary(sb);
    const generated = await generateTagsForEvent(event, vocabulary);
    const merged = mergeTags(event.adminTags, generated);

    const { data, error } = await sb
      .from("events")
      .update({ admin_tags: merged })
      .eq("id", id)
      .select("id, admin_tags")
      .single();
    if (error) throw error;

    return res.json({
      id: data.id,
      adminTags: data.admin_tags || [],
      generatedTags: generated,
      addedCount: (data.admin_tags || []).length - (event.adminTags || []).length,
    });
  } catch (err) {
    console.error("[admin/platform-events/auto-tag] error:", err.message);
    return res.status(500).json({ error: err.message || "Auto-tag failed" });
  }
});

// Host: POST /events/:id/auto-tag — host-facing version of the same flow.
// Ownership-gated: the requester must be a host of the event.
app.post("/events/:id/auto-tag", requireAuth, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");
    const { generateTagsForEvent, getTagVocabulary, mergeTags } = await import(
      "./services/aiTaggingService.js"
    );

    const { id } = req.params;
    const userEventIds = await getUserEventIds(req.user.id);
    if (!userEventIds.includes(id)) {
      return res.status(403).json({ error: "Not a host of this event" });
    }

    const { data: dbEvent, error: fetchErr } = await sb
      .from("events")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchErr || !dbEvent) {
      return res.status(404).json({ error: "Event not found" });
    }

    const event = await mapEventFromDb(dbEvent);
    const vocabulary = await getTagVocabulary(sb);
    const generated = await generateTagsForEvent(event, vocabulary);
    const merged = mergeTags(event.adminTags, generated);

    const { data, error } = await sb
      .from("events")
      .update({ admin_tags: merged })
      .eq("id", id)
      .select("id, admin_tags")
      .single();
    if (error) throw error;

    return res.json({
      id: data.id,
      adminTags: data.admin_tags || [],
      generatedTags: generated,
      addedCount: (data.admin_tags || []).length - (event.adminTags || []).length,
    });
  } catch (err) {
    console.error("[events/auto-tag] error:", err.message);
    return res.status(500).json({ error: err.message || "Auto-tag failed" });
  }
});

// Admin: View guest list for any event (bypasses host ownership check)
app.get("/admin/platform-events/:id/guests", requireAdmin, async (req, res) => {
  try {
    const event = await findEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const guests = await getRsvpsForEvent(event.id);
    res.json({ event, guests });
  } catch (err) {
    console.error("[admin/platform-events/guests] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch guests" });
  }
});

// ---------------------------
// Admin: Landing page conversion funnel
// ---------------------------
// GET /admin/analytics/landing-funnel?days=14
// Returns unique-visitor counts for each funnel stage over the period,
// plus a by-source breakdown so we can see which channels convert.
//
// Stages (ordered):
//   1. view         — unique visitors in landing_page_views
//   2. cta_click    — clicked the hero or nav CTA
//   3. auth_start   — submitted email form OR clicked Continue with Google
//   4. signed_in    — actually made it to /events signed in
//
// Same visitor_id is counted at most once per stage, so the numbers are
// strictly monotonically non-increasing — later stages only count visitors
// who also hit the earlier ones.
app.get("/admin/analytics/landing-funnel", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { periodStart, periodEnd, days: numDays } = resolveAnalyticsRange(req);

    const [viewsRes, eventsRes] = await Promise.all([
      supabase
        .from("landing_page_views")
        .select("visitor_id, source")
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString()),
      supabase
        .from("landing_page_events")
        .select("visitor_id, event_name, props")
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString()),
    ]);

    if (viewsRes.error) throw viewsRes.error;
    if (eventsRes.error) throw eventsRes.error;

    const views = viewsRes.data || [];
    const events = eventsRes.data || [];

    // Build per-stage visitor sets. Enforce monotonic funnel: a visitor
    // only counts at a later stage if they also hit the earlier ones.
    const viewers = new Set(views.map((v) => v.visitor_id).filter(Boolean));
    const visitorSource = {};
    for (const v of views) {
      if (!v.visitor_id) continue;
      // first seen source wins (landing_page_views inserts are ordered by time)
      if (!(v.visitor_id in visitorSource)) visitorSource[v.visitor_id] = v.source || "direct";
    }

    const clickers = new Set();
    // 3 onboarding step buckets: 0 = Name, 1 = Brand, 2 = Auth screen.
    const stepViews = [new Set(), new Set(), new Set()];
    const authStarters = new Set();
    const signedIn = new Set();
    for (const e of events) {
      if (!e.visitor_id) continue;
      if (!viewers.has(e.visitor_id)) continue; // enforce funnel — must have viewed
      if (e.event_name === "cta_click") clickers.add(e.visitor_id);
      else if (e.event_name === "onboarding_step_view") {
        const step = Number(e.props?.step);
        if (Number.isInteger(step) && step >= 0 && step < stepViews.length) {
          stepViews[step].add(e.visitor_id);
        }
      } else if (e.event_name === "auth_start") authStarters.add(e.visitor_id);
      else if (e.event_name === "signed_in") signedIn.add(e.visitor_id);
    }
    // Strict monotonic funnel — every downstream stage is a subset of the
    // immediately upstream stage. This prevents traffic from outside the
    // onboarding flow (e.g. PublishAuthModal sign-ins from /create, or old
    // pre-redesign auth events still in the 30-day window) from inflating
    // counts below the auth-screen step.
    const clickersFinal = clickers;
    const step0Final = new Set([...stepViews[0]].filter((v) => clickersFinal.has(v)));
    const step1Final = new Set([...stepViews[1]].filter((v) => step0Final.has(v)));
    const step2Final = new Set([...stepViews[2]].filter((v) => step1Final.has(v)));
    const authStartersFinal = new Set([...authStarters].filter((v) => step2Final.has(v)));
    const signedInFinal = new Set([...signedIn].filter((v) => authStartersFinal.has(v)));

    const stages = [
      { key: "view", label: "Viewed landing", count: viewers.size },
      { key: "cta_click", label: "Clicked CTA", count: clickersFinal.size },
      { key: "step_name", label: "Step 1 · Name", count: step0Final.size },
      { key: "step_brand", label: "Step 2 · Brand", count: step1Final.size },
      { key: "step_auth", label: "Step 3 · Claim it", count: step2Final.size },
      { key: "auth_start", label: "Pressed sign-in", count: authStartersFinal.size },
      { key: "signed_in", label: "Account created", count: signedInFinal.size },
    ];
    for (let i = 0; i < stages.length; i++) {
      const prev = i === 0 ? stages[0].count : stages[i - 1].count;
      stages[i].pctOfView = stages[0].count > 0
        ? Math.round((stages[i].count / stages[0].count) * 1000) / 10
        : 0;
      stages[i].pctOfPrev = prev > 0
        ? Math.round((stages[i].count / prev) * 1000) / 10
        : 0;
    }

    // By-source breakdown: split each stage by the visitor's first-seen source
    const sourceOf = (visitorId) => visitorSource[visitorId] || "direct";
    const bySource = {};
    const upsert = (src, key) => {
      if (!bySource[src]) bySource[src] = { view: 0, cta_click: 0, auth_start: 0, signed_in: 0 };
      bySource[src][key] += 1;
    };
    for (const vid of viewers) upsert(sourceOf(vid), "view");
    for (const vid of clickersFinal) upsert(sourceOf(vid), "cta_click");
    for (const vid of authStartersFinal) upsert(sourceOf(vid), "auth_start");
    for (const vid of signedInFinal) upsert(sourceOf(vid), "signed_in");
    const sources = Object.entries(bySource)
      .map(([source, counts]) => ({ source, ...counts }))
      .sort((a, b) => b.view - a.view);

    return res.json({
      periodDays: numDays,
      stages,
      sources,
    });
  } catch (err) {
    console.error("[admin/landing-funnel] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch funnel" });
  }
});

// Resolve a query-string date range for any admin-analytics endpoint.
// Accepts either:
//   ?startDate=ISO&endDate=ISO   (preferred — driven by the date picker)
//   ?days=N                       (fallback — legacy callers)
// Falls back to last-30-days if neither is provided. Always returns
// midnight-local-anchored start/end so daily buckets line up cleanly.
function resolveAnalyticsRange(req) {
  let periodStart;
  let periodEnd;
  if (req.query.startDate && req.query.endDate) {
    periodStart = new Date(req.query.startDate);
    periodEnd = new Date(req.query.endDate);
  } else {
    const days = Math.min(
      Math.max(parseInt(req.query.days) || 30, 1),
      365,
    );
    periodEnd = new Date();
    periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - days + 1);
  }
  periodStart.setHours(0, 0, 0, 0);
  periodEnd.setHours(23, 59, 59, 999);
  const days = Math.max(
    1,
    Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000),
  );
  return { periodStart, periodEnd, days };
}

// ---------------------------
// Admin Email Broadcast — platform-wide marketing email sends.
// Mirrors /host/crm/* shape so the admin email page can clone the host
// CRM layout exactly. Audience is the entire `people` table minus host
// accounts and unsubscribers; tag is `admin_broadcast_<id>` so analytics
// flows naturally into the existing email tracking surface.
// ---------------------------

// GET /admin/email/event-options — pullup events OR discover events for the
// admin email picker modal. Source determines which table we read from;
// both come back as a unified card-shape so the frontend block editor and
// the email renderer can treat them identically.
app.get("/admin/email/event-options", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");
    const source = req.query.source === "discover" ? "discover" : "pullup";
    const search = (req.query.q || "").trim().toLowerCase();
    const frontendBaseUrl =
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL || "https://pullup.se"
        : "http://localhost:5173";

    if (source === "discover") {
      const { data, error } = await sb
        .from("stockholm_events")
        .select(
          "id, title, image_url, starts_at, location, url, spotify_url, status, category, source",
        )
        .order("starts_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const events = (data || [])
        .filter(
          (e) => !search || (e.title || "").toLowerCase().includes(search),
        )
        .map((e) => ({
          id: e.id,
          title: e.title || "Untitled",
          imageUrl: e.image_url || null,
          startsAt: e.starts_at || null,
          location: e.location || null,
          url: e.url || null,
          spotifyUrl: e.spotify_url || null,
          // Discover events don't have admin_tags; surface category as a
          // single-element tag list so the filter chips work for both
          // sources uniformly.
          tags: e.category ? [String(e.category).toLowerCase()] : [],
          // hostedBy comes from the scrape source name (e.g. "soho-house").
          hostedBy: e.source || null,
          source: "discover",
        }));
      return res.json({ events });
    }

    const { data, error } = await sb
      .from("events")
      .select(
        "id, slug, title, cover_image_url, image_url, starts_at, location, spotify, admin_tags, host_id, sections",
      )
      .order("starts_at", { ascending: false })
      .limit(300);
    if (error) throw error;

    // Resolve PullUp event images from storage paths AND look up host
    // brand/name so the email card can show "Hosted by ...".
    function resolveEventImage(raw) {
      if (!raw) return null;
      if (raw.startsWith("http")) return raw;
      try {
        const { data: { publicUrl } } = sb.storage
          .from("event-images")
          .getPublicUrl(raw);
        return publicUrl || null;
      } catch {
        return null;
      }
    }

    const hostIds = [...new Set((data || []).map((e) => e.host_id).filter(Boolean))];
    const hostMap = {};
    if (hostIds.length) {
      try {
        const { data: hosts } = await sb
          .from("profiles")
          .select("id, name, brand")
          .in("id", hostIds);
        for (const h of hosts || []) {
          hostMap[h.id] = h.brand || h.name || null;
        }
      } catch {
        // Optional enrichment.
      }
    }

    // Sections is a jsonb array on each event. The actual rich data —
    // Spotify links, host name, music links — is buried in there as
    // typed sub-blocks. Walk it to surface what we need for the email
    // card. Falls back to event/profile columns when sections are empty.
    function extractFromSections(sections) {
      if (!Array.isArray(sections)) return {};
      let spotify = null;
      let hostedBy = null;
      for (const s of sections) {
        if (!s || typeof s !== "object") continue;
        if (s.type === "spotify" && typeof s.url === "string") {
          spotify = spotify || s.url;
        }
        if (s.type === "socials" && typeof s.spotify === "string" && s.spotify.trim()) {
          spotify = spotify || s.spotify;
        }
        if (s.type === "hostedby" && typeof s.name === "string" && s.name.trim()) {
          hostedBy = hostedBy || s.name.trim();
        }
      }
      return { spotify, hostedBy };
    }

    const events = (data || [])
      .filter((e) => !search || (e.title || "").toLowerCase().includes(search))
      .map((e) => {
        const fromSections = extractFromSections(e.sections);
        return {
          id: e.id,
          title: e.title || "Untitled",
          imageUrl: resolveEventImage(e.cover_image_url || e.image_url),
          startsAt: e.starts_at || null,
          location: e.location || null,
          url: e.slug ? `${frontendBaseUrl}/e/${e.slug}` : null,
          // Sections-derived value wins because hosts configure per-event
          // music there. Top-level spotify column is a legacy fallback.
          spotifyUrl: fromSections.spotify || e.spotify || null,
          tags: Array.isArray(e.admin_tags) ? e.admin_tags : [],
          // Hosted-by section (admin-set per-event) takes precedence over
          // the host's profile brand/name. This avoids showing
          // placeholder strings when a profile.brand isn't set yet.
          hostedBy:
            fromSections.hostedBy ||
            (e.host_id ? hostMap[e.host_id] || null : null),
          source: "pullup",
        };
      });
    return res.json({ events });
  } catch (err) {
    console.error("[admin/email/event-options] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch event options" });
  }
});

function balancedSample(rows, max) {
  const hosts = rows.filter((r) => r._source === "host");
  const others = rows.filter((r) => r._source !== "host");
  if (hosts.length === 0 || others.length === 0) return rows.slice(0, max);
  const half = Math.floor(max / 2);
  const hostsTake = Math.min(half, hosts.length);
  const othersTake = Math.min(max - hostsTake, others.length);
  return [...hosts.slice(0, hostsTake), ...others.slice(0, othersTake)].sort(
    (a, b) => (a.name || "").localeCompare(b.name || ""),
  );
}

// GET /admin/email/audience — total + sample of platform emails matching
// the given filters. Used for the audience tab's live count display.
app.get("/admin/email/audience", requireAdmin, async (req, res) => {
  try {
    const { getAdminAudience } = await import("./services/adminBroadcastSender.js");

    // attendedEventTags arrives as a comma-separated string in the URL
    // (e.g. ?attendedEventTags=dinner,art) — split + lowercase it.
    const tagsParam = req.query.attendedEventTags;
    const attendedEventTags = tagsParam
      ? String(tagsParam)
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      : [];

    // Specific-event filter — comma-separated UUIDs from the typeahead.
    const idsParam = req.query.attendedEventIds;
    const attendedEventIds = idsParam
      ? String(idsParam)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const attendedEventLogic =
      String(req.query.attendedEventLogic).toLowerCase() === "and"
        ? "and"
        : "or";

    const audienceSource =
      req.query.source === "hosts" || req.query.source === "everyone"
        ? req.query.source
        : "contacts";
    const sendMode = req.query.sendMode === "internal" ? "internal" : "broadcast";

    const hostAccountState =
      ["any", "never", "inactive30d", "recent30d"].includes(req.query.hostAccountState)
        ? req.query.hostAccountState
        : "any";

    const hostEventCount = (() => {
      const v = req.query.hostEventCount;
      if (v === "exactly0") return "exactly0";
      const n = Number(v);
      if (n === 1 || n === 3) return n;
      return "any";
    })();

    const hostAccountAge =
      ["any", "lte30d", "30to90d", "gt90d"].includes(req.query.hostAccountAge)
        ? req.query.hostAccountAge
        : "any";

    const hostLeadStatusesParam = req.query.hostLeadStatuses;
    const hostLeadStatuses = hostLeadStatusesParam
      ? String(hostLeadStatusesParam)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const hostEventTagsParam = req.query.hostEventTags;
    const hostEventTags = hostEventTagsParam
      ? String(hostEventTagsParam)
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const filterCriteria = {
      audienceSource,
      sendMode,
      excludeHosts: req.query.excludeHosts !== "false",
      marketingConsent: req.query.marketingConsent || "any",
      importSource: req.query.importSource || null,
      minEventsAttended: Number(req.query.minEventsAttended) || 0,
      hasPaid: req.query.hasPaid === "true",
      minTotalSpend: Number(req.query.minTotalSpend) || 0,
      joinedAfter: req.query.joinedAfter || null,
      attendedEventTags,
      attendedEventIds,
      attendedEventLogic,
      hostAccountState,
      hostEventCount,
      hostAccountAge,
      hostLeadStatuses,
      hostEventTags,
      excludedEmails: req.query.excludedEmails
        ? String(req.query.excludedEmails)
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
        : [],
    };
    const audience = await getAdminAudience(filterCriteria);

    // limit=all (or anything > 30) returns the full audience in the sample.
    // Default 30 keeps the lightweight count-card use case fast.
    const limitParam = String(req.query.limit || "").toLowerCase();
    const showAll = limitParam === "all";
    const sampleSize = showAll
      ? audience.length
      : Math.min(Number(limitParam) || 30, audience.length);
    const sampleRows = showAll
      ? audience
      : balancedSample(audience, sampleSize);

    return res.json({
      total: audience.length,
      filterCriteria,
      sample: sampleRows.map((p) => ({
        id: p.id,
        email: p.email,
        name: p.name,
        marketingConsent: p.marketing_consent,
        paymentCount: p.payment_count || 0,
        totalSpend: p.total_spend || 0,
        importSource: p.import_source || null,
        source: p._source || "contact",
        lastLoginAt: p.last_login_at || null,
        eventCount: p.event_count || 0,
        leadStatus: p.lead_status || null,
      })),
    });
  } catch (err) {
    console.error("[admin/email/audience] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch audience" });
  }
});

// GET /admin/email/tag-options — list of every admin_tag in use across
// the platform's events, sorted by frequency. Powers the "interested in"
// chip cloud in the admin email segmenter so admins know what tags are
// even available before trying to segment by them.
app.get("/admin/email/tag-options", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");
    const { data, error } = await sb
      .from("events")
      .select("admin_tags")
      .not("admin_tags", "is", null);
    if (error) throw error;
    const counts = {};
    for (const row of data || []) {
      for (const t of row.admin_tags || []) {
        if (typeof t !== "string") continue;
        const norm = t.trim().toLowerCase();
        if (!norm) continue;
        counts[norm] = (counts[norm] || 0) + 1;
      }
    }
    const tags = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
    return res.json({ tags });
  } catch (err) {
    console.error("[admin/email/tag-options] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch tag options" });
  }
});

// GET /admin/email/host-lead-options — distinct sales_leads.status values
// for leads linked to a host profile, with counts. Powers the "pipeline"
// chip cloud in the host filters so admin can see what stages exist.
app.get("/admin/email/host-lead-options", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");
    const { data, error } = await sb
      .from("sales_leads")
      .select("status")
      .not("profile_id", "is", null)
      .not("status", "is", null);
    if (error) throw error;
    const counts = {};
    for (const row of data || []) {
      const s = (row.status || "").trim();
      if (!s) continue;
      counts[s] = (counts[s] || 0) + 1;
    }
    const statuses = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({ status, count }));
    return res.json({ statuses });
  } catch (err) {
    console.error("[admin/email/host-lead-options] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch lead options" });
  }
});

// POST /admin/email/campaigns — create a draft broadcast campaign.
app.post("/admin/email/campaigns", requireAdmin, async (req, res) => {
  try {
    const { subject, templateContent = {}, filterCriteria = {} } = req.body;
    if (!subject) return res.status(400).json({ error: "Subject is required" });
    if (!Array.isArray(templateContent.blocks) || templateContent.blocks.length === 0) {
      return res.status(400).json({ error: "At least one block is required" });
    }

    const { getAdminAudience } = await import("./services/adminBroadcastSender.js");
    const audience = await getAdminAudience(filterCriteria);

    const { createEmailCampaign } = await import("./data.js");
    const campaign = await createEmailCampaign({
      userId: req.user.id,
      name: `Admin Broadcast — ${new Date().toLocaleDateString()}`,
      templateType: "admin_broadcast",
      eventId: null,
      subject,
      templateContent,
      filterCriteria,
      totalRecipients: audience.length,
    });

    return res.status(201).json({
      campaignId: campaign.id,
      totalRecipients: audience.length,
      status: campaign.status,
    });
  } catch (err) {
    console.error("[admin/email/campaigns] create error:", err.message);
    return res.status(500).json({ error: "Failed to create broadcast" });
  }
});

// POST /admin/email/campaigns/:id/send — kick off async send.
app.post("/admin/email/campaigns/:id/send", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { getEmailCampaign } = await import("./data.js");
    const campaign = await getEmailCampaign(id, req.user.id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status === "sent") {
      return res.status(400).json({ error: "Already sent" });
    }
    const { sendAdminBroadcastInBatches } = await import(
      "./services/adminBroadcastSender.js"
    );
    sendAdminBroadcastInBatches(id, req.user.id).catch((err) => {
      console.error("[admin/email/send] background error:", err);
    });
    return res.json({ message: "Sending started", campaignId: id, status: "sending" });
  } catch (err) {
    console.error("[admin/email/send] error:", err.message);
    return res.status(500).json({ error: "Failed to start send" });
  }
});

// GET /admin/email/campaigns/:id — status polling for the send dialog.
app.get("/admin/email/campaigns/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { getEmailCampaign } = await import("./data.js");
    const campaign = await getEmailCampaign(id, req.user.id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    return res.json({
      id: campaign.id,
      status: campaign.status,
      totalRecipients: campaign.totalRecipients,
      totalSent: campaign.totalSent,
      totalFailed: campaign.totalFailed,
    });
  } catch (err) {
    console.error("[admin/email/status] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch status" });
  }
});

// ---------------------------
// Admin: Activity time-series — events CREATED per day (bars) + RSVPs
// collected per day (line). The two velocity KPIs: are hosts publishing,
// are guests engaging across the platform.
//
// Bars are keyed by events.created_at (publication moment) — not
// starts_at — because the question we're answering is "are users
// creating events", not "are there events scheduled to occur today".
//
// "Emails collected" counts every RSVP row created that day across every
// event on PullUp. We deliberately don't dedupe by email — each RSVP is
// an email-submission event regardless of whether that person has RSVP'd
// before. (For unique contact-list growth there's the `people` table,
// but raw RSVP volume is the truer engagement signal.)
// ---------------------------
app.get("/admin/analytics/activity-series", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");
    const { periodStart, periodEnd, days } = resolveAnalyticsRange(req);

    // Previous period of equal length for like-for-like change indicators.
    const prevEnd = new Date(periodStart.getTime() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    prevStart.setHours(0, 0, 0, 0);

    const [eventsRes, rsvpsRes, prevEventsRes, prevRsvpsRes] = await Promise.all([
      sb
        .from("events")
        .select("created_at")
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString()),
      sb
        .from("rsvps")
        .select("created_at")
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString()),
      sb
        .from("events")
        .select("*", { count: "exact", head: true })
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString()),
      sb
        .from("rsvps")
        .select("*", { count: "exact", head: true })
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString()),
    ]);

    const eventCounts = {};
    for (const e of eventsRes.data || []) {
      const d = (e.created_at || "").slice(0, 10);
      if (d) eventCounts[d] = (eventCounts[d] || 0) + 1;
    }

    const rsvpCounts = {};
    for (const r of rsvpsRes.data || []) {
      const d = (r.created_at || "").slice(0, 10);
      if (d) rsvpCounts[d] = (rsvpCounts[d] || 0) + 1;
    }

    const buckets = [];
    for (
      let t = periodStart.getTime();
      t <= periodEnd.getTime();
      t += 24 * 60 * 60 * 1000
    ) {
      const d = new Date(t).toISOString().slice(0, 10);
      buckets.push({
        date: d,
        eventsCreated: eventCounts[d] || 0,
        rsvps: rsvpCounts[d] || 0,
      });
    }

    const totalEvents = (eventsRes.data || []).length;
    const totalRsvps = (rsvpsRes.data || []).length;
    const prevTotalEvents = prevEventsRes.count || 0;
    const prevTotalRsvps = prevRsvpsRes.count || 0;
    const eventsChange = prevTotalEvents > 0
      ? Math.round(((totalEvents - prevTotalEvents) / prevTotalEvents) * 100)
      : null;
    const rsvpsChange = prevTotalRsvps > 0
      ? Math.round(((totalRsvps - prevTotalRsvps) / prevTotalRsvps) * 100)
      : null;

    return res.json({
      periodDays: days,
      totalEvents,
      totalRsvps,
      prevTotalEvents,
      prevTotalRsvps,
      eventsChange,
      rsvpsChange,
      buckets,
    });
  } catch (err) {
    console.error("[activity-series] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch activity series" });
  }
});

// ---------------------------
// Admin: New-account signups time-series. Pairs with the landing-page
// conversion funnel — answers "how many people actually finished signup
// each day?". Bars for daily count, a cumulative line for momentum.
// ---------------------------
app.get("/admin/analytics/signups-series", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");
    const { periodStart, periodEnd, days } = resolveAnalyticsRange(req);

    // Previous period of equal length, immediately before the current range,
    // so the change indicator compares like-for-like (matches /pageviews).
    const prevEnd = new Date(periodStart.getTime() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    prevStart.setHours(0, 0, 0, 0);

    const [{ data: profiles }, { count: prevCount }, { count: preCount }] = await Promise.all([
      sb.from("profiles")
        .select("created_at")
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString()),
      sb.from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString()),
      sb.from("profiles")
        .select("*", { count: "exact", head: true })
        .lt("created_at", periodStart.toISOString()),
    ]);

    const dailyCounts = {};
    for (const p of profiles || []) {
      const d = (p.created_at || "").slice(0, 10);
      if (d) dailyCounts[d] = (dailyCounts[d] || 0) + 1;
    }

    let cumulative = preCount || 0;
    const buckets = [];
    for (
      let t = periodStart.getTime();
      t <= periodEnd.getTime();
      t += 24 * 60 * 60 * 1000
    ) {
      const d = new Date(t).toISOString().slice(0, 10);
      const daily = dailyCounts[d] || 0;
      cumulative += daily;
      buckets.push({
        date: d,
        signups: daily,
        cumulativeSignups: cumulative,
      });
    }

    const totalSignups = (profiles || []).length;
    const prevTotalSignups = prevCount || 0;
    const signupsChange = prevTotalSignups > 0
      ? Math.round(((totalSignups - prevTotalSignups) / prevTotalSignups) * 100)
      : null;

    return res.json({
      periodDays: days,
      preCumulativeSignups: preCount || 0,
      totalSignups,
      prevTotalSignups,
      signupsChange,
      buckets,
    });
  } catch (err) {
    console.error("[signups-series] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch signups series" });
  }
});

// ---------------------------
// Admin: Partner CTA click analytics
// ---------------------------
app.get("/admin/analytics/partner-clicks", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { periodStart, periodEnd, days: numDays } = resolveAnalyticsRange(req);

    const { data: clicks, error } = await supabase
      .from("partner_clicks")
      .select("id, partner_slug, event_id, placement, clicked_at, ip_address")
      .gte("clicked_at", periodStart.toISOString())
      .lte("clicked_at", periodEnd.toISOString())
      .order("clicked_at", { ascending: false });

    if (error) throw error;

    const rows = clicks || [];

    // Per-partner breakdown
    const partnerMap = {};
    for (const c of rows) {
      const slug = c.partner_slug;
      if (!partnerMap[slug]) partnerMap[slug] = { total: 0, unique: new Set(), daily: {} };
      partnerMap[slug].total++;
      partnerMap[slug].unique.add(c.ip_address || c.id);
      const day = c.clicked_at.slice(0, 10);
      if (!partnerMap[slug].daily[day]) partnerMap[slug].daily[day] = 0;
      partnerMap[slug].daily[day]++;
    }

    const partners = Object.entries(partnerMap).map(([slug, data]) => ({
      slug,
      total: data.total,
      unique: data.unique.size,
      daily: data.daily,
    })).sort((a, b) => b.total - a.total);

    // Top events driving clicks
    const eventClickMap = {};
    for (const c of rows) {
      if (!c.event_id) continue;
      if (!eventClickMap[c.event_id]) eventClickMap[c.event_id] = { total: 0, byPartner: {} };
      eventClickMap[c.event_id].total++;
      if (!eventClickMap[c.event_id].byPartner[c.partner_slug]) eventClickMap[c.event_id].byPartner[c.partner_slug] = 0;
      eventClickMap[c.event_id].byPartner[c.partner_slug]++;
    }

    // Fetch event titles for top events
    const topEventIds = Object.entries(eventClickMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([id]) => id);

    let eventTitles = {};
    if (topEventIds.length > 0) {
      const { data: events } = await supabase
        .from("events")
        .select("id, title, slug")
        .in("id", topEventIds);
      for (const e of (events || [])) eventTitles[e.id] = { title: e.title, slug: e.slug };
    }

    const topEvents = topEventIds.map(id => ({
      id,
      title: eventTitles[id]?.title || "Unknown",
      slug: eventTitles[id]?.slug,
      clicks: eventClickMap[id].total,
      byPartner: eventClickMap[id].byPartner,
    }));

    return res.json({
      totalClicks: rows.length,
      uniqueClickers: new Set(rows.map(c => c.ip_address || c.id)).size,
      partners,
      topEvents,
    });
  } catch (err) {
    console.error("[partner-clicks analytics] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch partner click analytics" });
  }
});

// ---------------------------
// Sales Leads (admin CRM)
// ---------------------------

// GET /admin/crm/hosts — customer-understanding view.
//
// One row per profile (every signed-up user) enriched with everything we
// know about how they use PullUp: events created, capacity patterns,
// confirmed-guest totals, hosting frequency, the admin-set tag distribution
// across their events, plus their sales pipeline state if any.
//
// Designed for the new /admin/crm page that replaces the per-lead /admin/sales
// lens with a per-host one. Keeps the existing sales_leads table as the
// source of truth for pipeline status / notes / source / internal sales
// contact info; all of that surfaces here as `sales: { ... }`.
app.get("/admin/crm/hosts", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");

    const [profilesRes, eventsRes, leadsRes] = await Promise.all([
      sb
        .from("profiles")
        .select(
          "id, name, brand, contact_email, mobile_number, city, visitor_id, created_at, last_login_at, login_count",
        ),
      sb
        .from("events")
        .select(
          "id, host_id, title, slug, starts_at, total_capacity, cocktail_capacity, admin_tags, dinner_enabled, food_capacity, ticket_type, ticket_price, ticket_currency, require_approval",
        ),
      sb
        .from("sales_leads")
        .select(
          "id, profile_id, name, email, status, source, notes, city, phone, company, priority, created_at",
        ),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (eventsRes.error) throw eventsRes.error;
    if (leadsRes.error) throw leadsRes.error;

    const profiles = profilesRes.data || [];
    const events = eventsRes.data || [];
    const leads = leadsRes.data || [];

    // RSVP, VIP, and team-host counts per event.
    const eventIds = events.map((e) => e.id);
    const rsvpsByEvent = {};
    const vipCountByEvent = {};
    const hostCountByEvent = {};
    if (eventIds.length) {
      const [rsvpsRes, vipRes, ehRes] = await Promise.all([
        sb
          .from("rsvps")
          .select("event_id, party_size, total_guests, booking_status, status")
          .in("event_id", eventIds),
        sb.from("vip_invites").select("event_id").in("event_id", eventIds),
        sb.from("event_hosts").select("event_id").in("event_id", eventIds),
      ]);
      for (const r of rsvpsRes.data || []) {
        if (
          r.booking_status === "CONFIRMED" ||
          r.booking_status === "PENDING_PAYMENT" ||
          r.status === "attending"
        ) {
          rsvpsByEvent[r.event_id] =
            (rsvpsByEvent[r.event_id] || 0) +
            (r.total_guests ?? r.party_size ?? 1);
        }
      }
      for (const v of vipRes.data || []) {
        vipCountByEvent[v.event_id] = (vipCountByEvent[v.event_id] || 0) + 1;
      }
      for (const h of ehRes.data || []) {
        hostCountByEvent[h.event_id] = (hostCountByEvent[h.event_id] || 0) + 1;
      }
    }

    // Email backfill from auth.users for profiles that haven't set
    // contact_email explicitly (most users today).
    const authEmails = {};
    try {
      const { data: au } = await sb.auth.admin.listUsers({ perPage: 1000 });
      for (const u of au?.users || []) {
        if (u.email) authEmails[u.id] = u.email;
      }
    } catch {
      // listUsers can fail in some environments; fall through gracefully.
    }

    // Pre-signup engagement signal: how many times did this person hit
    // the landing page before they signed up? Keyed by visitor_id which
    // we capture on the profile during onboarding finalize. We aggregate
    // total visits + first/last visit dates per known visitor_id.
    const visitorIds = profiles
      .map((p) => p.visitor_id)
      .filter(Boolean);
    const landingByVisitor = {};
    if (visitorIds.length) {
      try {
        const { data: views } = await sb
          .from("landing_page_views")
          .select("visitor_id, created_at")
          .in("visitor_id", visitorIds);
        for (const v of views || []) {
          if (!v.visitor_id) continue;
          const slot =
            landingByVisitor[v.visitor_id] ||
            (landingByVisitor[v.visitor_id] = {
              count: 0,
              first: v.created_at,
              last: v.created_at,
            });
          slot.count += 1;
          if (!slot.first || v.created_at < slot.first) slot.first = v.created_at;
          if (!slot.last || v.created_at > slot.last) slot.last = v.created_at;
        }
      } catch {
        // Optional enrichment — safe to fall through.
      }
    }

    const eventsByHost = {};
    for (const e of events) {
      if (!e.host_id) continue;
      if (!eventsByHost[e.host_id]) eventsByHost[e.host_id] = [];
      eventsByHost[e.host_id].push(e);
    }

    const leadByProfile = {};
    for (const l of leads) {
      if (l.profile_id) leadByProfile[l.profile_id] = l;
    }

    const now = Date.now();
    const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;

    const hosts = profiles.map((p) => {
      const evList = eventsByHost[p.id] || [];
      const total = evList.length;
      const upcoming = evList.filter(
        (e) => new Date(e.starts_at).getTime() >= now,
      ).length;
      const past = total - upcoming;

      const dates = evList
        .map((e) => new Date(e.starts_at).getTime())
        .filter((t) => Number.isFinite(t));
      const firstEventAt = dates.length
        ? new Date(Math.min(...dates)).toISOString()
        : null;
      const lastEventAt = dates.length
        ? new Date(Math.max(...dates)).toISOString()
        : null;

      const capacities = evList
        .map((e) => Number(e.total_capacity || e.cocktail_capacity || 0))
        .filter((c) => c > 0);
      const totalCapacity = capacities.reduce((a, b) => a + b, 0);
      const avgCapacity = capacities.length
        ? Math.round(totalCapacity / capacities.length)
        : 0;

      const totalConfirmedGuests = evList.reduce(
        (sum, e) => sum + (rsvpsByEvent[e.id] || 0),
        0,
      );

      // Frequency: events per month over their active span. Floor at 1 month
      // so a host with one event today doesn't read as "30 events/month".
      let monthsActive = 1;
      if (firstEventAt) {
        const span = (now - new Date(firstEventAt).getTime()) / MS_PER_MONTH;
        monthsActive = Math.max(1, Math.round(span));
      }
      const frequencyPerMonth =
        total > 0 ? Math.round((total / monthsActive) * 10) / 10 : 0;

      // Tag distribution across all their events. Top 10 only — the long
      // tail isn't useful in a row view.
      const tagCounts = {};
      for (const e of evList) {
        for (const t of e.admin_tags || []) {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        }
      }
      const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count }));

      const lead = leadByProfile[p.id];

      // Activity tier — useful filter chip on the frontend.
      let activity = "lurker";
      if (total >= 5) activity = "repeat";
      else if (total >= 1) activity = "active";

      const landing = p.visitor_id ? landingByVisitor[p.visitor_id] : null;

      return {
        id: p.id,
        name: p.name || null,
        brand: p.brand || null,
        email: p.contact_email || authEmails[p.id] || null,
        phone: p.mobile_number || null,
        city: p.city || null,
        createdAt: p.created_at,
        lastLoginAt: p.last_login_at || null,
        loginCount: p.login_count || 0,
        activity,
        landing: landing
          ? {
              visits: landing.count,
              firstVisitAt: landing.first,
              lastVisitAt: landing.last,
            }
          : null,
        sales: lead
          ? {
              leadId: lead.id,
              status: lead.status,
              source: lead.source,
              notes: lead.notes,
              priority: lead.priority || "normal",
              internalCity: lead.city,
              internalPhone: lead.phone,
              internalCompany: lead.company,
            }
          : null,
        events: {
          total,
          upcoming,
          past,
          firstEventAt,
          lastEventAt,
          totalCapacity,
          avgCapacity,
          totalConfirmedGuests,
          frequencyPerMonth,
          // Compact list for the expanded panel — full details available via
          // /admin/platform-events when needed. Surfaces lightweight
          // feature signals (dinner / VIP / team / ticket / approval) so
          // admin can read each event's shape at a glance.
          list: evList
            .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
            .map((e) => ({
              id: e.id,
              slug: e.slug,
              title: e.title,
              startsAt: e.starts_at,
              capacity: e.total_capacity || e.cocktail_capacity || 0,
              confirmedGuests: rsvpsByEvent[e.id] || 0,
              adminTags: Array.isArray(e.admin_tags) ? e.admin_tags : [],
              dinnerEnabled: !!e.dinner_enabled,
              dinnerSeats: Number(e.food_capacity || 0),
              vipCount: vipCountByEvent[e.id] || 0,
              teamCount: hostCountByEvent[e.id] || 0,
              ticketType: e.ticket_type || "free",
              ticketPrice: e.ticket_price || 0,
              ticketCurrency: e.ticket_currency || null,
              requireApproval: !!e.require_approval,
            })),
        },
        topTags,
      };
    });

    // Surface unlinked sales_leads (manual prospects who haven't signed up
    // yet) as synthetic rows so the CRM is a single pane for the entire
    // pipeline. They get id "lead:<uuid>" and isLead=true so the frontend
    // knows to expose the full identity-edit form for them. When they
    // eventually sign up, createDefaultProfile() back-links them by email
    // and they merge into a profile row automatically.
    for (const l of leads) {
      if (l.profile_id) continue; // already attached to a profile row above
      hosts.push({
        id: `lead:${l.id}`,
        isLead: true,
        name: l.name || null,
        brand: l.company || null,
        email: l.email || null,
        phone: l.phone || null,
        city: l.city || null,
        createdAt: l.created_at || null,
        lastLoginAt: null,
        loginCount: 0,
        activity: "lurker",
        landing: null,
        sales: {
          leadId: l.id,
          status: l.status,
          source: l.source,
          notes: l.notes,
          priority: l.priority || "normal",
          internalCity: l.city,
          internalPhone: l.phone,
          internalCompany: l.company,
        },
        events: {
          total: 0,
          upcoming: 0,
          past: 0,
          firstEventAt: null,
          lastEventAt: null,
          totalCapacity: 0,
          avgCapacity: 0,
          totalConfirmedGuests: 0,
          frequencyPerMonth: 0,
          list: [],
        },
        topTags: [],
      });
    }

    // Default sort: last event desc, then last login, then created desc.
    hosts.sort((a, b) => {
      const ta = new Date(
        a.events.lastEventAt || a.lastLoginAt || a.createdAt || 0,
      ).getTime();
      const tb = new Date(
        b.events.lastEventAt || b.lastLoginAt || b.createdAt || 0,
      ).getTime();
      return tb - ta;
    });

    return res.json({ hosts });
  } catch (err) {
    console.error("[admin/crm/hosts] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch CRM hosts" });
  }
});

// GET /admin/sales/leads — list all leads with linked profile + event counts
app.get("/admin/sales/leads", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { status } = req.query;

    let query = supabase
      .from("sales_leads")
      .select("*")
      .order("updated_at", { ascending: false });

    if (status && status !== "all") query = query.eq("status", status);

    const { data: leads, error } = await query;
    if (error) throw error;

    // Gather profile_ids and emails for matching
    const profileIds = leads.filter((l) => l.profile_id).map((l) => l.profile_id);
    const unlinkedLeads = leads.filter((l) => l.email && !l.profile_id);
    const emails = [...new Set(unlinkedLeads.map((l) => l.email.toLowerCase()))];

    // Fetch linked profiles (includes login tracking)
    let profileMap = {};
    if (profileIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, brand, created_at, last_login_at, login_count")
        .in("id", profileIds);
      if (profiles) profiles.forEach((p) => (profileMap[p.id] = p));
    }

    // Auto-match unlinked leads by email via auth.users
    let emailToUserId = {};
    if (emails.length) {
      // Fetch all auth users in one call and match by email
      const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const allUsers = authData?.users || [];
      const usersByEmail = {};
      allUsers.forEach((u) => {
        if (u.email) usersByEmail[u.email.toLowerCase()] = u;
      });

      for (const email of emails) {
        const user = usersByEmail[email];
        if (user) {
          emailToUserId[email] = user.id;
          // Auto-link all leads with this email (case-insensitive)
          const leadIds = unlinkedLeads
            .filter((l) => l.email.toLowerCase() === email)
            .map((l) => l.id);
          if (leadIds.length) {
            await supabase
              .from("sales_leads")
              .update({ profile_id: user.id, updated_at: new Date().toISOString() })
              .in("id", leadIds);
          }
          // Fetch profile
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, name, brand, created_at, last_login_at, login_count")
            .eq("id", user.id)
            .single();
          if (prof) profileMap[prof.id] = prof;
        }
      }
    }

    // Count events per profile
    const allProfileIds = [...new Set([...profileIds, ...Object.values(emailToUserId)])];
    let eventCounts = {};
    if (allProfileIds.length) {
      const { data: events } = await supabase
        .from("events")
        .select("host_id")
        .in("host_id", allProfileIds);
      if (events) {
        events.forEach((e) => {
          eventCounts[e.host_id] = (eventCounts[e.host_id] || 0) + 1;
        });
      }
    }

    // Fetch admin names for created_by / updated_by attribution
    const adminIds = [...new Set(
      leads.flatMap((l) => [l.created_by, l.updated_by]).filter(Boolean)
    )];
    let adminMap = {};
    if (adminIds.length) {
      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", adminIds);
      if (adminProfiles) adminProfiles.forEach((p) => (adminMap[p.id] = p.name));
    }

    // Enrich leads
    const enriched = leads.map((lead) => {
      const pid = lead.profile_id || emailToUserId[lead.email?.toLowerCase()];
      return {
        ...lead,
        profile_id: pid || null,
        profile: pid ? profileMap[pid] || null : null,
        event_count: pid ? eventCounts[pid] || 0 : 0,
        last_sign_in_at: pid ? profileMap[pid]?.last_login_at || null : null,
        sign_in_count: pid ? profileMap[pid]?.login_count || 0 : 0,
        created_by_name: adminMap[lead.created_by] || null,
        updated_by_name: adminMap[lead.updated_by] || null,
      };
    });

    // Also surface signed-up users who don't have a sales_leads row yet,
    // so admins can see real product users (events created, last login, etc.)
    // without first manually adding them as a lead.
    // Only when the status filter is "all" or "user" — other filters target real lead statuses.
    const wantsUsers = !status || status === "all" || status === "user";
    if (wantsUsers) {
      const linkedProfileIds = new Set(
        enriched.map((l) => l.profile_id).filter(Boolean)
      );

      // Fetch every profile + their event counts (independent of which leads exist).
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, name, brand, contact_email, mobile_number, created_at, last_login_at, login_count");

      const orphanProfiles = (allProfiles || []).filter(
        (p) => !linkedProfileIds.has(p.id)
      );

      if (orphanProfiles.length) {
        // Event counts for orphans
        const orphanIds = orphanProfiles.map((p) => p.id);
        const { data: orphanEvents } = await supabase
          .from("events")
          .select("host_id")
          .in("host_id", orphanIds);
        const orphanEventCounts = {};
        (orphanEvents || []).forEach((e) => {
          orphanEventCounts[e.host_id] = (orphanEventCounts[e.host_id] || 0) + 1;
        });

        // Backfill emails from auth.users where profiles.contact_email is empty.
        const missingEmailIds = orphanProfiles
          .filter((p) => !p.contact_email)
          .map((p) => p.id);
        const authEmailById = {};
        if (missingEmailIds.length) {
          const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
          (authData?.users || []).forEach((u) => {
            if (u.email) authEmailById[u.id] = u.email;
          });
        }

        for (const p of orphanProfiles) {
          const email = p.contact_email || authEmailById[p.id] || null;
          enriched.push({
            id: `user:${p.id}`,
            is_user_only: true,
            name: p.name || p.brand || (email ? email.split("@")[0] : "Unknown"),
            company: p.brand || null,
            email,
            phone: p.mobile_number || null,
            status: "user",
            notes: null,
            city: null,
            source: null,
            profile_id: p.id,
            profile: {
              id: p.id,
              name: p.name,
              brand: p.brand,
              created_at: p.created_at,
              last_login_at: p.last_login_at,
              login_count: p.login_count,
            },
            event_count: orphanEventCounts[p.id] || 0,
            last_sign_in_at: p.last_login_at || null,
            sign_in_count: p.login_count || 0,
            created_at: p.created_at,
            updated_at: p.created_at,
            created_by: null,
            updated_by: null,
            created_by_name: null,
            updated_by_name: null,
          });
        }
      }

      // When the user explicitly filters to "user", drop the real leads.
      if (status === "user") {
        return res.json(enriched.filter((l) => l.is_user_only));
      }

      // Sort: most-recent activity first. Users use created_at, leads use updated_at.
      enriched.sort((a, b) => {
        const ad = new Date(a.updated_at || a.created_at || 0).getTime();
        const bd = new Date(b.updated_at || b.created_at || 0).getTime();
        return bd - ad;
      });
    }

    return res.json(enriched);
  } catch (err) {
    console.error("[sales] list error:", err.message);
    return res.status(500).json({ error: "Failed to fetch sales leads" });
  }
});

// POST /admin/sales/leads — create a new lead
app.post("/admin/sales/leads", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { name, company, email, phone, status, notes, city, source, priority } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const { data, error } = await supabase
      .from("sales_leads")
      .insert({
        name,
        company: company || null,
        email: email ? email.toLowerCase().trim() : null,
        phone: phone || null,
        status: status || "new",
        notes: notes || null,
        city: city || null,
        source: source || null,
        priority: priority || "normal",
        created_by: req.user.id,
        updated_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    console.error("[sales] create error:", err.message);
    return res.status(500).json({ error: "Failed to create lead" });
  }
});

// PATCH /admin/sales/leads/:id — update a lead.
//
// Accepts two ID forms:
//   - real UUIDs       → updates the existing sales_leads row.
//   - "user:<uuid>"    → synthetic ID for an auto-surfaced profile row that
//                        doesn't have a sales_leads record yet. Lazily creates
//                        the row tied to the profile_id and applies the
//                        admin-internal updates. This is how "edit any user"
//                        works without forcing admins to manually add leads
//                        for every signup.
//
// For user-linked rows (profile_id present) we restrict updates to truly
// internal fields (status/source/notes/phone/city/company) — never name or
// email, since those belong to the user's profile and admin overrides would
// silently diverge from what the user sees in /settings.
app.patch("/admin/sales/leads/:id", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { id } = req.params;

    // Fields admin may set on a fully-unlinked lead row.
    const ALL_FIELDS = [
      "name",
      "company",
      "email",
      "phone",
      "status",
      "notes",
      "city",
      "source",
      "priority",
    ];
    // For profile-linked rows we LOCK the fields the user controls
    // themselves: name (profile.name), email (auth + profile.contact_email),
    // and brand (profile.brand — admin sees this as "company" on the lead).
    // The user-set values in /settings are the source of truth; admin must
    // never silently override them.
    //
    // Phone and city ARE admin-editable on linked rows (the user can't
    // change those in /settings) — but to keep the CRM display honest we
    // mirror those edits to the user's profile so /admin/crm and the user's
    // own data stay in sync. Status / source / notes / priority are pure
    // sales-internal and never touch the profile.
    const USER_OWNED = ["name", "email", "company"];
    const ADMIN_LINKED_ALLOWED = ALL_FIELDS.filter(
      (f) => !USER_OWNED.includes(f),
    );
    const MIRROR_TO_PROFILE = ["phone", "city"]; // not user-owned but lives on profile too

    async function mirrorToProfile(profileId, body) {
      const profileUpdates = {};
      if (body.phone !== undefined)
        profileUpdates.mobile_number = body.phone || null;
      if (body.city !== undefined) profileUpdates.city = body.city || null;
      if (Object.keys(profileUpdates).length === 0) return;
      try {
        await supabase
          .from("profiles")
          .update(profileUpdates)
          .eq("id", profileId);
      } catch (err) {
        console.warn("[sales] profile mirror failed:", err.message);
      }
    }

    const userOnlyMatch = /^user:([0-9a-f-]{36})$/i.exec(id);
    if (userOnlyMatch) {
      const profileId = userOnlyMatch[1];
      const updates = {};
      for (const key of ADMIN_LINKED_ALLOWED) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name, brand, contact_email")
        .eq("id", profileId)
        .single();

      let seedEmail = profile?.contact_email || null;
      if (!seedEmail) {
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(profileId);
          seedEmail = authUser?.user?.email || null;
        } catch {}
      }

      // Mirror phone/city to the profile so the value renders consistently.
      await mirrorToProfile(profileId, req.body);

      const { data: existing } = await supabase
        .from("sales_leads")
        .select("id")
        .eq("profile_id", profileId)
        .maybeSingle();

      if (existing) {
        updates.updated_at = new Date().toISOString();
        updates.updated_by = req.user.id;
        const { data, error } = await supabase
          .from("sales_leads")
          .update(updates)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return res.json(data);
      }

      const { data, error } = await supabase
        .from("sales_leads")
        .insert({
          // Identity columns are seeded from the profile and never from
          // req.body — defense against client tampering on user-owned fields.
          name:
            profile?.name ||
            profile?.brand ||
            (seedEmail ? seedEmail.split("@")[0] : "User"),
          company: profile?.brand || null,
          email: seedEmail,
          status: updates.status || "new",
          source: updates.source || null,
          notes: updates.notes || null,
          phone: updates.phone || null,
          city: updates.city || null,
          priority: updates.priority || "normal",
          profile_id: profileId,
          created_by: req.user.id,
          updated_by: req.user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    // Real lead row path. Determine whether it's profile-linked and apply
    // the matching allowlist + profile mirror.
    const { data: existing } = await supabase
      .from("sales_leads")
      .select("profile_id")
      .eq("id", id)
      .single();
    const isUserLinked = !!existing?.profile_id;
    const allowed = isUserLinked ? ADMIN_LINKED_ALLOWED : ALL_FIELDS;

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.email) updates.email = updates.email.toLowerCase().trim();
    updates.updated_at = new Date().toISOString();
    updates.updated_by = req.user.id;

    if (isUserLinked) {
      await mirrorToProfile(existing.profile_id, req.body);
    }

    const { data, error } = await supabase
      .from("sales_leads")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("[sales] patch error:", err.message);
    return res.status(500).json({ error: "Failed to update lead" });
  }
});

// DELETE /admin/sales/leads/:id — remove a lead.
// Synthetic "user:<uuid>" IDs are auto-surfaced rows with no underlying
// sales_leads record — there's nothing to delete, so reject explicitly so
// the UI doesn't pretend it succeeded.
app.delete("/admin/sales/leads/:id", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { id } = req.params;
    if (/^user:/i.test(id)) {
      return res.status(400).json({ error: "Cannot delete an auto-surfaced user row." });
    }
    const { error } = await supabase.from("sales_leads").delete().eq("id", id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error("[sales] delete error:", err.message);
    return res.status(500).json({ error: "Failed to delete lead" });
  }
});

// ---------------------------
// ADMIN: Ideas management
// ---------------------------

app.get("/admin/ideas", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    let query = supabase.from("ideas").select("*").order("created_at", { ascending: false });

    const { status } = req.query;
    if (status && ["new", "read", "done", "archived"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("[admin] ideas list error:", err.message);
    return res.status(500).json({ error: "Failed to fetch ideas" });
  }
});

app.patch("/admin/ideas/:id", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status || !["new", "read", "done", "archived"].includes(status)) {
      return res.status(400).json({ error: "status must be one of: new, read, done, archived" });
    }

    const { supabase } = await import("./supabase.js");
    const { data, error } = await supabase
      .from("ideas")
      .update({ status })
      .eq("id", req.params.id)
      .select("id")
      .single();

    if (error && error.code === "PGRST116") {
      return res.status(404).json({ error: "Idea not found" });
    }
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin] ideas update error:", err.message);
    return res.status(500).json({ error: "Failed to update idea" });
  }
});

// ---------------------------
// Server
// ---------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`PullUp API running on http://localhost:${PORT}`);
  try {
    const { backfillEventHostsCoHostToEditor } = await import("./migrations.js");
    const updated = await backfillEventHostsCoHostToEditor();
    if (updated?.length) console.log(`Migration: backfilled ${updated.length} event_hosts co_host -> editor`);
  } catch (e) {
    console.log("Migration note:", e.message);
  }

  // Cleanup abandoned PENDING_PAYMENT RSVPs every 10 minutes
  // Frees spots held by users who started but never completed payment
  const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  const PENDING_PAYMENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

  setInterval(async () => {
    try {
      const { supabase } = await import("./supabase.js");
      const cutoff = new Date(Date.now() - PENDING_PAYMENT_TTL_MS).toISOString();

      const { data: staleRsvps, error } = await supabase
        .from("rsvps")
        .select("id, person_id, event_id, created_at")
        .eq("booking_status", "PENDING_PAYMENT")
        .lt("created_at", cutoff);

      if (error) {
        console.error("[Cleanup] Error fetching stale PENDING_PAYMENT RSVPs:", error.message);
        return;
      }

      if (staleRsvps && staleRsvps.length > 0) {
        const ids = staleRsvps.map((r) => r.id);

        // Cancel associated Stripe PaymentIntents to prevent late payments
        try {
          const { data: payments } = await supabase
            .from("payments")
            .select("id, stripe_payment_intent_id")
            .in("rsvp_id", ids)
            .eq("status", "pending");

          if (payments && payments.length > 0) {
            const { getStripeSecretKey } = await import("./stripe.js");
            const Stripe = (await import("stripe")).default;
            const stripe = new Stripe(getStripeSecretKey());

            for (const p of payments) {
              try {
                await stripe.paymentIntents.cancel(p.stripe_payment_intent_id);
                console.log(`[Cleanup] Cancelled PaymentIntent ${p.stripe_payment_intent_id}`);
              } catch (cancelErr) {
                // PaymentIntent may already be cancelled/succeeded — that's fine
                console.warn(`[Cleanup] Could not cancel PI ${p.stripe_payment_intent_id}: ${cancelErr.message}`);
              }
            }

            // Delete payment records
            await supabase.from("payments").delete().in("id", payments.map((p) => p.id));
          }
        } catch (paymentErr) {
          console.error("[Cleanup] Error cancelling payments:", paymentErr.message);
          // Continue with RSVP deletion even if payment cleanup fails
        }

        const { error: deleteError } = await supabase
          .from("rsvps")
          .delete()
          .in("id", ids);

        if (deleteError) {
          console.error("[Cleanup] Error deleting stale RSVPs:", deleteError.message);
        } else {
          console.log(`[Cleanup] Deleted ${ids.length} abandoned PENDING_PAYMENT RSVP(s)`);
        }
      }
    } catch (err) {
      console.error("[Cleanup] Unexpected error:", err.message);
    }
  }, CLEANUP_INTERVAL_MS);

  /* ── 24-hour event reminder emails ────────────────────── */
  const REMINDER_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  const REMINDER_WINDOW_MS  = 25 * 60 * 60 * 1000; // 25 hours

  async function sendEventReminders() {
    try {
      const { supabase } = await import("./supabase.js");
      const now = new Date();
      const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);

      // 1. Find published events starting in the next 25 hours
      const { data: events, error: eventsErr } = await supabase
        .from("events")
        .select("id, title, slug, starts_at, timezone, location, cover_image_url, image_url, host_id")
        .eq("status", "PUBLISHED")
        .gt("starts_at", now.toISOString())
        .lt("starts_at", windowEnd.toISOString());

      if (eventsErr) {
        console.error("[Reminders] Error fetching events:", eventsErr.message);
        return;
      }
      if (!events || events.length === 0) return;

      for (const event of events) {
        // 2. Get confirmed RSVPs with person details
        const { data: rsvps, error: rsvpErr } = await supabase
          .from("rsvps")
          .select(`
            id, person_id,
            people:person_id ( id, name, email )
          `)
          .eq("event_id", event.id)
          .eq("booking_status", "CONFIRMED");

        if (rsvpErr) {
          console.error(`[Reminders] Error fetching RSVPs for event ${event.id}:`, rsvpErr.message);
          continue;
        }
        if (!rsvps || rsvps.length === 0) continue;

        // 3. Fetch host branding
        let hostBrand = {};
        try {
          const hostProfile = await getUserProfile(event.host_id);
          hostBrand = {
            brandName: hostProfile?.brand || "",
            brandWebsite: hostProfile?.brandWebsite || "",
            contactEmail: hostProfile?.contactEmail || "",
          };
        } catch {}

        // 4. Resolve cover image to full public URL (DB stores relative paths)
        let resolvedImageUrl = event.cover_image_url || event.image_url || "";
        if (resolvedImageUrl && !resolvedImageUrl.startsWith("http")) {
          try {
            let imgPath = resolvedImageUrl;
            if (resolvedImageUrl.includes("event-images/")) {
              const match = resolvedImageUrl.match(/event-images\/([^?]+)/);
              if (match) imgPath = match[1];
            }
            const { data: { publicUrl } } = supabase.storage.from("event-images").getPublicUrl(imgPath);
            if (publicUrl) resolvedImageUrl = publicUrl;
          } catch (e) {
            console.error(`[Reminders] Error resolving image URL for event ${event.id}:`, e.message);
          }
        }

        // 5. Send reminder to each guest. Reminders are transactional — the
        // recipient explicitly RSVP'd to this event — so we do NOT filter by
        // people.marketing_unsubscribed_at. We do still expose the unsubscribe
        // link in the footer so they can opt out of future marketing.
        const { ensureUnsubscribeToken } = await import("./data.js");
        const frontendBase = getFrontendUrl();
        for (const rsvp of rsvps) {
          const person = rsvp.people;
          if (!person?.email) continue;

          let unsubscribeUrl = "";
          try {
            const token = await ensureUnsubscribeToken(person.id);
            unsubscribeUrl = `${frontendBase}/u/${token}`;
          } catch (e) {
            console.error(`[Reminders] Failed to mint unsubscribe token for ${person.email}:`, e.message);
          }

          const idempotencyKey = `reminder-24h-${event.id}-${person.id}`;
          try {
            await infraSendEmail({
              to: person.email,
              subject: `"${event.title}" is tomorrow!`,
              html: reminder24hEmail({
                name: person.name || "there",
                eventTitle: event.title,
                startsAt: event.starts_at,
                timezone: event.timezone || "",
                imageUrl: resolvedImageUrl,
                location: event.location || "",
                slug: event.slug || "",
                frontendUrl: frontendBase,
                unsubscribeUrl,
                hideDate: event.hide_date || false,
                hideLocation: event.hide_location || false,
                dateRevealHint: event.date_reveal_hint || "",
                revealHint: event.reveal_hint || "",
                ...hostBrand,
              }),
              idempotencyKey,
            });
          } catch (err) {
            console.error(`[Reminders] Failed to send reminder to ${person.email} for event ${event.id}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error("[Reminders] Unexpected error in sendEventReminders:", err.message);
    }
  }

  // setInterval(sendEventReminders, REMINDER_INTERVAL_MS); // PAUSED — uncomment to re-enable reminder emails
});
