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
  initiateConnectOAuth,
  handleConnectCallback,
  getConnectedAccountStatus,
  disconnectStripeAccount,
} from "./stripeConnect.js";
import { logger } from "./logger.js";

import {
  sendEmail,
  coHostAddedEmailBody,
  coHostInvitedEmailBody,
} from "./services/emailService.js";
import {
  signupConfirmationEmail,
  reminder8hEmail,
} from "./emails/signupConfirmation.js";
import {
  generateWaitlistToken,
  verifyWaitlistToken,
} from "./utils/waitlistTokens.js";
import { processSesEvent } from "./email/events/processSesEvent.js";
import { handleProviderEvent, enqueueOutbox } from "./email/index.js";
import trackingRoutes from "./email/tracking/trackingRoutes.js";

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

/**
 * Convert signed/public supabase URL into permanent public URL for OG tags
 * If we can't, fall back to original.
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
    } = supabase.storage.from("event-images").getPublicUrl(filePath);

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

// ---------------------------
// Helper: Generate OG HTML for an event (uses permanent public image URL)
// ---------------------------
async function generateOgHtmlForEvent(event, routeName = "Share", queryString = "") {
  logger.debug(`[${routeName}] Found event`, {
    title: event?.title,
    slug: event?.slug,
    id: event?.id,
  });
  logger.debug(`[${routeName}] Event image URL (raw)`, {
    imageUrl: event?.imageUrl || "none",
  });

  const ogImageUrl = await toOgPublicImageUrl(event?.coverImageUrl || event?.imageUrl, routeName);

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

  const when = formatOgDateTime(event?.startsAt, event?.timezone);
  const where = event?.location ? String(event.location).trim() : "";

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
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="Pull Up">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${ogTitle}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">

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
app.use(cors(corsOptions));

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

    try {
      console.log("[Webhook] Processing event:", event.type);
      const result = await handleStripeWebhook(event);
      console.log("[Webhook] ✅ Event processed:", {
        processed: result.processed,
        error: result.error,
      });
      res.json({ received: true, processed: result.processed });
    } catch (error) {
      console.error("[Webhook] ❌ Processing error:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  }
);

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

    if (filter === "upcoming") {
      const now = new Date();
      filteredEvents = eventsWithStats.filter((event) => {
        if (!event.startsAt) return true;
        const start = new Date(event.startsAt);
        const end = event.endsAt ? new Date(event.endsAt) : null;
        // Match frontend getEventStatus: treat "ongoing" as not past
        if (end && now > end) return false; // past
        return true; // upcoming or ongoing
      });
    } else if (filter === "past") {
      const now = new Date();
      filteredEvents = eventsWithStats.filter((event) => {
        if (!event.startsAt) return false;
        const end = event.endsAt ? new Date(event.endsAt) : null;
        // Match frontend getEventStatus "past" definition
        return !!end && now > end;
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
    const ogHtml = await generateOgHtmlForEvent(event, "Share", qs);
    res.setHeader("Content-Type", "text/html");
    res.send(ogHtml);
  } catch (error) {
    console.error("Error generating share page:", error);
    res.status(500).send("Error generating share page");
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
    const ogHtml = await generateOgHtmlForEvent(event, "EventPage", qs);
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
    const { visitorId, referrer, utm_source, utm_medium, utm_campaign, utm_content, deviceType } = req.body || {};

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
      const ogHtml = await generateOgHtmlForEvent(event, "EventsAPI");
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

    res.json({
      ...event,
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

    // Social links
    instagram,
    spotify,
    tiktok,
    soundcloud,
  } = req.body;

  if (!title || !startsAt) {
    return res.status(400).json({ error: "title and startsAt are required" });
  }

  // Create the event first to get its ID (with host_id from authenticated user)
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
    ticketPrice,
    ticketCurrency: ticketCurrency || "USD",
    cocktailCapacity,
    foodCapacity,
    totalCapacity,
    createdVia: createdVia || "legacy",
    status: status || "PUBLISHED",
    mediaSettings,
    instagram,
    spotify,
    tiktok,
    soundcloud,
  });

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
        }
      : {
          slug,
          name,
          email: effectiveEmail,
          plusOnes,
          wantsDinner,
          dinnerTimeSlot,
          dinnerPartySize,
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

      if (
        !isVipFreeEntry &&
        result.event?.ticketType === "paid" &&
        result.event?.ticketPrice &&
        (isWaitlistUpgrade || // Waitlist upgrade - always allow if RSVP is WAITLIST
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

        // If no payment exists or payment is unpaid/pending, create/update payment
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

    // After all result.error checks and before res.status(201)...
    try {
      const isWaitlistEmail =
        result.rsvp.bookingStatus === "WAITLIST" ||
        result.rsvp.status === "waitlist";

      await sendEmail({
        to: result.rsvp.email,
        subject: isWaitlistEmail
          ? "You're on the waitlist"
          : "Your spot is confirmed",
        html: signupConfirmationEmail({
          name: result.rsvp.name || name,
          eventTitle: result.event.title,
          date: new Date(result.event.startsAt).toLocaleString(),
          isWaitlist: isWaitlistEmail,
        }),
      });
    } catch (emailErr) {
      logger?.error?.("Failed to send signup confirmation email", {
        error: emailErr?.message,
        rsvpId: result.rsvp.id,
      });
      // Don’t block the RSVP on email failure
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
        HOST_ROLES.VIEWER,
      ];
      if (!role || !allowedRoles.includes(role)) {
        return res.status(400).json({
          error: "Invalid role",
          message: "Role must be one of: admin, editor, reception, viewer",
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
          message: "Only waitlisted RSVPs can have payment links generated",
        });
      }

      // Check if event is paid
      if (event.ticketType !== "paid" || !event.ticketPrice) {
        return res.status(400).json({
          error: "Event is not a paid event",
          message: "Payment links can only be generated for paid events",
        });
      }

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

      // Generate signed token (JWT)
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
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
        waitlistLinkToken: token, // Store token for tracking (optional)
      });

      // Generate link using environment-aware frontend URL
      const frontendUrl = getFrontendUrl();
      const link = `${frontendUrl}/e/${event.slug}?wl=${token}`;

      return res.json({
        link,
        token,
        expiresAt: expiresAt.toISOString(),
        email: person.email,
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
  <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3;">${event.title}</h1>
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
    <a href="${getFrontendUrl()}" target="_blank" style="color:rgba(255,255,255,0.4);text-decoration:none;">pullup.se</a>
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

      // Social links
      instagram,
      spotify,
      tiktok,
      soundcloud,
    } = req.body;

    // Get current event to check if price/currency changed
    const currentEvent = await findEventById(id);
    if (!currentEvent) {
      return res.status(404).json({ error: "Event not found" });
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
        instagram,
        spotify,
        tiktok,
        soundcloud,
      });
    } catch (err) {
      console.error(`[PUT /host/events/${id}] Update failed:`, err.message);
      return res.status(500).json({
        error: "Failed to update event",
        message: err.message,
      });
    }

    if (!updated) return res.status(404).json({ error: "Event not found" });

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

  res.json(updated);
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

    const guests = await getRsvpsForEvent(event.id);

    const myRole = await getEventHostRole(req.user.id, event.id);
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

    const guests = await getRsvpsForEvent(event.id);

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

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting RSVP:", error);
      res.status(500).json({ error: "Failed to delete RSVP" });
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
    const { name, phone, notes, tags } = req.body;

    const result = await updatePerson(personId, {
      name,
      phone,
      notes,
      tags,
    });

    if (result.error === "not_found") {
      return res.status(404).json({ error: "Person not found" });
    }

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

    // Get recipients count using filterCriteria
    const { getPeopleWithFilters } = await import("./data.js");
    const result = await getPeopleWithFilters(
      req.user.id,
      filterCriteria,
      "created_at",
      "desc",
      1, // Just need count
      0
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

// GET /host/crm/campaigns/:campaignId - Get campaign status
app.get("/host/crm/campaigns/:campaignId", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { getEmailCampaign } = await import("./data.js");

    const campaign = await getEmailCampaign(campaignId, req.user.id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
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

      // Extract receipt URL from charge if available and update payment
      // Stripe generates receipt URLs asynchronously, so we check here too
      const receiptUrl = paymentIntent.charges?.data?.[0]?.receipt_url || null;
      if (receiptUrl) {
        console.log(
          "[Payment Verify] Found receipt URL, ensuring it's stored:",
          receiptUrl
        );
        const { findPaymentByStripePaymentIntentId, updatePayment } =
          await import("./data.js");
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
        return res.json({
          success: true,
          message: "Payment verified and updated",
          paymentIntentId: paymentIntent.id,
          status: paymentIntent.status,
          receiptUrl: receiptUrl || null,
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
    const updates = req.body;
    const updated = await updateUserProfile(req.user.id, updates);
    res.json(updated);
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ---------------------------
// STRIPE CONNECT: Initiate OAuth flow
// ---------------------------
app.post("/host/stripe/connect/initiate", requireAuth, async (req, res) => {
  try {
    const { authorizationUrl } = await initiateConnectOAuth(req.user.id);
    res.json({ authorizationUrl });
  } catch (error) {
    console.error("Error initiating Stripe Connect:", error);
    res.status(500).json({ error: "Failed to initiate Stripe Connect" });
  }
});

// ---------------------------
// STRIPE CONNECT: OAuth callback handler
// Note: No auth middleware here; we trust the signed state token instead.
// ---------------------------
app.get("/host/stripe/connect/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({
        error: "Missing required parameters",
        message: "Authorization code and state are required",
      });
    }

    const result = await handleConnectCallback(code, state);

    // Redirect to frontend with success status
    const redirectUrl = `${getFrontendUrl()}/events?stripe_connect=success&account_id=${result.connectedAccountId}`;

    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Error handling Stripe Connect callback:", error);

    // Redirect to frontend with error status
    const redirectUrl = `${getFrontendUrl()}/events?stripe_connect=error&message=${encodeURIComponent(
      error.message
    )}`;

    res.redirect(redirectUrl);
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
// PROTECTED: Upload event image
// ---------------------------
app.post("/host/events/:eventId/image", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { imageData } = req.body; // Base64 image data

    if (!imageData) {
      return res.status(400).json({ error: "imageData is required" });
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

    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Determine file extension from data URL
    const mimeMatch = imageData.match(/data:image\/(\w+);base64/);
    const extension = mimeMatch ? mimeMatch[1] : "png";
    const fileName = `${eventId}/image.${extension}`;

    // Upload to Supabase Storage
    const { supabase } = await import("./supabase.js");
    const { data, error } = await supabase.storage
      .from("event-images")
      .upload(fileName, buffer, {
        contentType: `image/${extension}`,
        upsert: true, // Overwrite if exists
      });

    if (error) {
      console.error("Storage upload error:", error);
      return res.status(500).json({ error: "Failed to upload image" });
    }

    // Store just the file path in the database
    const updated = await updateEvent(eventId, {
      imageUrl: fileName, // Store path, not full URL
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

    res.json(eventWithUrl);
  } catch (error) {
    console.error("Error uploading event image:", error);
    res.status(500).json({ error: "Failed to upload event image" });
  }
});

// ---------------------------
// PROTECTED: Upload event media (image/video/gif) for carousel
// ---------------------------
app.post("/host/events/:eventId/media", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { mediaData, mediaType, mimeType, position, thumbnailData } = req.body;

    if (!mediaData) {
      return res.status(400).json({ error: "mediaData is required" });
    }

    const event = await findEventById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const allowed = await canEditEvent(req.user.id, eventId);
    if (!allowed) return res.status(403).json({ error: "Forbidden" });

    const { supabase } = await import("./supabase.js");

    // Determine type and extension
    const type = mediaType || "image";
    let extension = "jpg";
    if (mimeType) {
      const ext = mimeType.split("/")[1];
      if (ext === "quicktime") extension = "mov";
      else if (ext === "webm") extension = "webm";
      else if (ext === "mp4") extension = "mp4";
      else if (ext === "gif") extension = "gif";
      else if (ext === "png") extension = "png";
      else if (ext === "webp") extension = "webp";
      else extension = ext || "jpg";
    }

    const pos = position ?? 0;
    const fileName = `${eventId}/media_${pos}_${Date.now()}.${extension}`;

    // Convert base64 to buffer
    const base64Data = mediaData.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Supabase Storage doesn't support video/quicktime — map to video/mp4
    let uploadContentType = mimeType || `image/${extension}`;
    if (uploadContentType === "video/quicktime") {
      uploadContentType = "video/mp4";
    }

    // Upload to Supabase Storage
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

    // Handle video thumbnail
    let thumbnailPath = null;
    if (thumbnailData && (type === "video" || type === "gif")) {
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
// ADMIN: Newsletter preview & send
// ---------------------------

app.post("/admin/newsletter/preview", requireAdmin, async (req, res) => {
  try {
    const { getNewsletterSubscribers } = await import("./data.js");
    const { subscribers, total } = await getNewsletterSubscribers({
      status: "confirmed",
    });

    return res.json({
      totalRecipients: total,
      subscribers: (subscribers || []).map((s) => ({
        id: s.id,
        email: s.email,
        userId: s.user_id || null,
        status: s.status,
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

    // Render template HTML once (same content for all subscribers)
    let baseHtmlBody = htmlBody || null;
    let finalTextBody = textBody || null;

    if (templateType === "event" && event) {
      const content = {
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

      baseHtmlBody = renderEventEmailTemplate({
        event,
        templateContent: content,
        person: null,
      });
    }

    if (templateType === "weekly_happenings") {
      baseHtmlBody = renderWeeklyHappeningsTemplate({
        events: Array.isArray(templateContent.events) ? templateContent.events : [],
        templateContent: {
          headline: templateContent.headline || "This Week in Stockholm",
          body: templateContent.body || "",
        },
      });
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

        // Enqueue first to get the tracking_id from the outbox row
        const outboxRow = await enqueueOutbox({
          toEmail: subscriber.email,
          subject,
          htmlBody: baseHtmlBody,
          textBody: finalTextBody,
          campaignSendId: null,
          idempotencyKey: `${campaignId}:${subscriber.id}`,
          category: "newsletter",
        });

        // Add per-subscriber tracking (unique open pixel + click redirects)
        if (addTracking && outboxRow?.tracking_id && baseHtmlBody) {
          try {
            const trackedHtml = addTracking(baseHtmlBody, {
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

// GET /admin/analytics/overview — aggregate stats
app.get("/admin/analytics/overview", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");

    // Get all campaign outbox rows (scoped to campaign emails only)
    const { data: outboxRows } = await sb
      .from("email_outbox")
      .select("id, tracking_id, campaign_tag")
      .not("campaign_tag", "is", null);

    const allOutbox = outboxRows || [];
    const totalSent = allOutbox.length;
    const totalCampaigns = new Set(allOutbox.map(r => r.campaign_tag)).size;
    const campaignTrackingIds = allOutbox.map(r => r.tracking_id);

    // Fetch opens and clicks scoped to campaign tracking_ids
    const [opensRes, clicksRes, topLinksRes] = await Promise.all([
      campaignTrackingIds.length > 0
        ? sb.from("email_opens").select("tracking_id").in("tracking_id", campaignTrackingIds)
        : Promise.resolve({ data: [] }),
      campaignTrackingIds.length > 0
        ? sb.from("email_clicks").select("tracking_id").in("tracking_id", campaignTrackingIds)
        : Promise.resolve({ data: [] }),
      sb.from("email_clicks").select("link_url, link_label").limit(5000),
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

// GET /admin/analytics/campaigns — list all campaigns with open/click stats
app.get("/admin/analytics/campaigns", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("./supabase.js");

    // Get all distinct campaign_tags with their send counts
    const { data: campaigns, error } = await sb
      .from("email_outbox")
      .select("campaign_tag, id, tracking_id, status, created_at")
      .not("campaign_tag", "is", null)
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
      .select("event_id, visitor_id, utm_source, created_at")
      .in("event_id", eventIds);

    // Aggregate per event
    const eventViewMap = {};
    const allVisitors = new Set();
    let newsletterViews = 0;
    for (const v of (views || [])) {
      if (!eventViewMap[v.event_id]) {
        eventViewMap[v.event_id] = { views: 0, visitors: new Set() };
      }
      eventViewMap[v.event_id].views++;
      eventViewMap[v.event_id].visitors.add(v.visitor_id);
      allVisitors.add(v.visitor_id);
      if (v.utm_source === "pullup_newsletter") newsletterViews++;
    }

    // Get event details + RSVP counts
    const { data: events } = await sb
      .from("events")
      .select("id, title, slug, starts_at, cover_image_url, image_url")
      .in("id", eventIds)
      .order("starts_at", { ascending: false });

    // Batch-fetch RSVP counts for all events in one query instead of N+1
    const { data: rsvpRows } = await sb
      .from("rsvps")
      .select("event_id, party_size, total_guests, booking_status, status")
      .in("event_id", eventIds);

    const rsvpCountMap = {};
    for (const r of (rsvpRows || [])) {
      if (r.booking_status === "CONFIRMED" || r.status === "attending") {
        rsvpCountMap[r.event_id] = (rsvpCountMap[r.event_id] || 0) + (r.total_guests ?? r.party_size ?? 1);
      }
    }

    let totalRsvps = 0;
    const eventsWithAnalytics = (events || []).map((e) => {
      const rsvps = rsvpCountMap[e.id] || 0;
      totalRsvps += rsvps;
      const ev = eventViewMap[e.id] || { views: 0, visitors: new Set() };
      return {
        id: e.id,
        title: e.title,
        slug: e.slug,
        starts_at: e.starts_at,
        cover_image_url: e.cover_image_url || e.image_url,
        views: ev.views,
        unique_visitors: ev.visitors.size,
        rsvps,
        conversion_rate: ev.views > 0
          ? Math.round((rsvps / ev.views) * 1000) / 10
          : 0,
      };
    });

    // Sort by views descending
    eventsWithAnalytics.sort((a, b) => b.views - a.views);

    // Daily views across all events (last 30 days)
    const dailyViews = {};
    for (const v of (views || [])) {
      const day = v.created_at.slice(0, 10);
      dailyViews[day] = (dailyViews[day] || 0) + 1;
    }

    return res.json({
      events: eventsWithAnalytics,
      total_views: (views || []).length,
      total_unique_visitors: allVisitors.size,
      total_rsvps: totalRsvps,
      newsletter_views: newsletterViews,
      daily_views: dailyViews,
      avg_conversion: (views || []).length > 0
        ? Math.round((totalRsvps / (views || []).length) * 1000) / 10
        : 0,
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
    const hasAccess = await isUserEventHost(req.user.id, id);
    if (!hasAccess) {
      return res.status(403).json({ error: "forbidden" });
    }

    const { supabase: sb } = await import("./supabase.js");

    // Get page views
    const { data: views, error: viewsErr } = await sb
      .from("event_page_views")
      .select("id, visitor_id, referrer, utm_source, utm_medium, utm_campaign, utm_content, device_type, created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: false });

    if (viewsErr) throw viewsErr;

    const totalViews = (views || []).length;
    const uniqueVisitors = new Set((views || []).map((v) => v.visitor_id).filter(Boolean)).size;

    // Traffic sources breakdown
    const sourceMap = {};
    for (const v of (views || [])) {
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
      sourceMap[source] = (sourceMap[source] || 0) + 1;
    }

    const sources = Object.entries(sourceMap)
      .map(([source, count]) => ({ source, count, percentage: Math.round((count / totalViews) * 1000) / 10 }))
      .sort((a, b) => b.count - a.count);

    // Get RSVP count for conversion funnel
    const counts = await getEventCounts(id);

    // Views per day (last 30 days)
    const dailyViews = {};
    for (const v of (views || [])) {
      const day = v.created_at.slice(0, 10);
      dailyViews[day] = (dailyViews[day] || 0) + 1;
    }

    // Newsletter impact: how many views came from newsletters
    const newsletterViews = (views || []).filter((v) => v.utm_source === "pullup_newsletter").length;
    const newsletterCampaigns = [...new Set(
      (views || []).filter((v) => v.utm_campaign).map((v) => v.utm_campaign)
    )];

    // VIP invite email impact
    const event = await findEventById(id);
    let vipStats = null;
    if (event?.slug) {
      try {
        const campaignTag = `vip_invite_${event.slug}`;
        const { data: vipOutbox } = await sb
          .from("email_outbox")
          .select("id, tracking_id")
          .eq("campaign_tag", campaignTag);

        if (vipOutbox && vipOutbox.length > 0) {
          const trackingIds = vipOutbox.map((r) => r.tracking_id).filter(Boolean);
          const [opensRes, clicksRes] = await Promise.all([
            trackingIds.length > 0
              ? sb.from("email_opens").select("tracking_id").in("tracking_id", trackingIds)
              : { data: [] },
            trackingIds.length > 0
              ? sb.from("email_clicks").select("tracking_id").in("tracking_id", trackingIds)
              : { data: [] },
          ]);
          const uniqueOpens = new Set((opensRes.data || []).map((o) => o.tracking_id)).size;
          const uniqueClicks = new Set((clicksRes.data || []).map((c) => c.tracking_id)).size;
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

    // VIP email views on event page
    const vipViews = (views || []).filter((v) =>
      v.utm_campaign && v.utm_campaign.startsWith("vip_invite_")
    ).length;

    return res.json({
      total_views: totalViews,
      unique_visitors: uniqueVisitors,
      sources,
      daily_views: dailyViews,
      newsletter_views: newsletterViews,
      newsletter_campaigns: newsletterCampaigns,
      vip_stats: vipStats,
      vip_views: vipViews,
      rsvp_count: (counts?.confirmed || 0) + (counts?.waitlist || 0),
      conversion_rate: totalViews > 0
        ? Math.round((((counts?.confirmed || 0) + (counts?.waitlist || 0)) / totalViews) * 1000) / 10
        : 0,
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
// Sales Leads (admin CRM)
// ---------------------------

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

    // Fetch linked profiles
    let profileMap = {};
    if (profileIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, brand, created_at")
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
            .select("id, name, brand, created_at")
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

    // Enrich leads
    const enriched = leads.map((lead) => {
      const pid = lead.profile_id || emailToUserId[lead.email?.toLowerCase()];
      return {
        ...lead,
        profile_id: pid || null,
        profile: pid ? profileMap[pid] || null : null,
        event_count: pid ? eventCounts[pid] || 0 : 0,
      };
    });

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
    const { name, company, email, phone, status, notes, city, source } = req.body;
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

// PATCH /admin/sales/leads/:id — update a lead
app.patch("/admin/sales/leads/:id", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { id } = req.params;
    const allowed = ["name", "company", "email", "phone", "status", "notes", "city", "source"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    // Normalize email to lowercase
    if (updates.email) updates.email = updates.email.toLowerCase().trim();
    updates.updated_at = new Date().toISOString();

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

// DELETE /admin/sales/leads/:id — remove a lead
app.delete("/admin/sales/leads/:id", requireAdmin, async (req, res) => {
  try {
    const { supabase } = await import("./supabase.js");
    const { id } = req.params;
    const { error } = await supabase.from("sales_leads").delete().eq("id", id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error("[sales] delete error:", err.message);
    return res.status(500).json({ error: "Failed to delete lead" });
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
});
