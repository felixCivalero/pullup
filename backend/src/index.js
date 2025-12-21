// backend/src/index.js
import express from "express";
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
  findPersonById,
} from "./data.js";

import { requireAuth, optionalAuth } from "./middleware/auth.js";
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
} from "./stripe.js";
import {
  initiateConnectOAuth,
  handleConnectCallback,
  getConnectedAccountStatus,
  disconnectStripeAccount,
} from "./stripeConnect.js";
import { logger } from "./logger.js";

import { sendEmail } from "./services/emailService.js";
import {
  signupConfirmationEmail,
  reminder8hEmail,
} from "./emails/signupConfirmation.js";
import {
  generateWaitlistToken,
  verifyWaitlistToken,
} from "./utils/waitlistTokens.js";

// Load environment-specific .env file
// In development, loads .env.development
// In production, loads .env (or .env.production if you create one)
const envFile =
  process.env.NODE_ENV === "development" ? ".env.development" : ".env";

dotenv.config({ path: envFile });

// Determine environment mode
const isDevelopment = process.env.NODE_ENV === "development";

// Helper: Get frontend URL based on environment
function getFrontendUrl() {
  if (isDevelopment) {
    // Development mode: prefer TEST_ variables, fallback to regular, then dev default
    return (
      process.env.TEST_FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5173"
    );
  } else {
    // Production mode: use regular variable or production default
    return process.env.FRONTEND_URL || "https://pullup.se";
  }
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

function formatOgDateTime(startsAt) {
  if (!startsAt) return "";
  try {
    const d = new Date(startsAt);

    // Sunday, December 14 at 2:00 PM
    const date = d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    const time = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
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
async function generateOgHtmlForEvent(event, routeName = "Share") {
  logger.debug(`[${routeName}] Found event`, {
    title: event?.title,
    slug: event?.slug,
    id: event?.id,
  });
  logger.debug(`[${routeName}] Event image URL (raw)`, {
    imageUrl: event?.imageUrl || "none",
  });

  const ogImageUrl = await toOgPublicImageUrl(event?.imageUrl, routeName);

  logger.debug(`[${routeName}] Final OG image URL`, {
    imageUrl: ogImageUrl || "none (will use default)",
  });

  return generateOgHtml({
    ...event,
    imageUrl: ogImageUrl,
  });
}

// ---------------------------
// Helper: Generate HTML with dynamic OG tags for an event
// Notes:
// - OG description is clean and does NOT include links.
// - Canonical og:url points to /e/:slug (not /share/:slug).
// - Humans get redirected immediately.
// ---------------------------
function generateOgHtml(event) {
  const baseUrl = getFrontendUrl();

  // Canonical URL for the event page (clean for OG)
  const eventUrl = `${baseUrl}/e/${event.slug}`;

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

  const when = formatOgDateTime(event?.startsAt);
  const where = event?.location ? String(event.location).trim() : "";

  // Format date for OG title: "Event Title — Wednesday, December 17 at 12:00 PM"
  // This matches the rich preview format shown in iMessage screenshots
  let ogTitle = titleRaw;
  if (when && event?.startsAt) {
    try {
      const d = new Date(event.startsAt);
      // Get day of week (e.g., "Wednesday")
      const dayOfWeek = d.toLocaleDateString("en-US", { weekday: "long" });
      // Get date and time (e.g., "December 17 at 12:00 PM")
      const dateTime = d.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      });
      const time = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      ogTitle = `${titleRaw} — ${dayOfWeek}, ${dateTime} at ${time}`;
    } catch (e) {
      // Fallback to simple format if date parsing fails
      ogTitle = when ? `${titleRaw} — ${when}` : titleRaw;
    }
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
  <meta http-equiv="refresh" content="0;url=${eventUrl}">
  <script>window.location.href = "${eventUrl}";</script>
</head>
<body>
  <p>Redirecting to <a href="${eventUrl}">${escapedTitle}</a>...</p>
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
app.use(express.json({ limit: "50mb" }));
app.use(express.text({ limit: "50mb", type: "text/csv" })); // For CSV import
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ---------------------------
// PROTECTED: List user's events (requires auth)
// ---------------------------
app.get("/events", requireAuth, async (req, res) => {
  try {
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

    // Add stats to each event
    const { getEventCounts } = await import("./data.js");
    const eventsWithStats = await Promise.all(
      mappedEvents.map(async (event) => {
        const { confirmed } = await getEventCounts(event.id);
        return {
          ...event,
          _stats: {
            confirmed,
            totalCapacity: event.totalCapacity ?? null,
          },
        };
      })
    );

    res.json(eventsWithStats);
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

    const ogHtml = await generateOgHtmlForEvent(event, "Share");
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
      return res.redirect(`https://pullup.se/e/${slug}`);
    }

    // Always return OG HTML (crawlers get OG tags, browsers get redirected via meta refresh)
    const ogHtml = await generateOgHtmlForEvent(event, "EventPage");
    res.setHeader("Content-Type", "text/html");
    res.send(ogHtml);
  } catch (error) {
    console.error("Error generating event page OG:", error);
    res.status(500).send("Error generating event page");
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
    ticketPrice,
    ticketCurrency: ticketCurrency || "USD",
    cocktailCapacity,
    foodCapacity,
    totalCapacity,
    createdVia: createdVia || "legacy",
    status: status || "PUBLISHED",
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
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email is required" });
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
          email,
          plusOnes,
          wantsDinner,
          dinnerTimeSlot,
          dinnerPartySize,
        };

    const result = await addRsvp(rsvpData);

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

    // Verify ownership (owner or co-host)
    const { isHost } = await isUserEventHost(req.user.id, event.id);
    if (!isHost) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    res.json(event);
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

// ---------------------------
// PROTECTED: Manage event hosts (arrangers)
// ---------------------------

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

    const { supabase } = await import("./supabase.js");
    const { data: hostRows, error } = await supabase
      .from("event_hosts")
      .select("id, event_id, user_id, role, created_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching event hosts:", error);
      // If event_hosts table doesn't exist in this environment yet,
      // fail gracefully and pretend there are no extra hosts.
      if (error.code === "PGRST205") {
        return res.json({ hosts: [] });
      }
      return res.status(500).json({ error: "Failed to fetch event hosts" });
    }

    // Enrich with profile data + auth email
    const hosts = await Promise.all(
      (hostRows || []).map(async (row) => {
        try {
          const profile = await getUserProfile(row.user_id);
          let email = null;
          try {
            const {
              data: { user },
              error: userError,
            } = await supabase.auth.admin.getUserById(row.user_id);
            if (!userError && user) {
              email = user.email || null;
            } else if (userError) {
              console.error(
                "Error fetching auth user for host:",
                row.user_id,
                userError
              );
            }
          } catch (authErr) {
            console.error(
              "Unexpected error fetching auth user for host:",
              row.user_id,
              authErr
            );
          }
          return {
            userId: row.user_id,
            email,
            role: row.role,
            createdAt: row.created_at,
            profile,
          };
        } catch (err) {
          console.error("Error fetching profile for host:", row.user_id, err);
          return {
            userId: row.user_id,
            email: null,
            role: row.role,
            createdAt: row.created_at,
            profile: null,
          };
        }
      })
    );

    res.json({ hosts });
  } catch (error) {
    console.error("Error listing event hosts:", error);
    res.status(500).json({ error: "Failed to list event hosts" });
  }
});

// Add a host to an event (owner only)
// Accepts either a userId (auth.users.id) OR an email address for lookup.
app.post("/host/events/:id/hosts", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId: rawUserId, email, role = "co_host" } = req.body || {};

    let userId = rawUserId;

    if (!userId && email) {
      const normalizedEmail = String(email).trim().toLowerCase();

      try {
        const { supabase } = await import("./supabase.js");

        // 1) Try to find auth user by email using Admin API
        // Note: We need to list users and filter, as there's no direct "get by email" method
        const {
          data: { users },
          error: authError,
        } = await supabase.auth.admin.listUsers();

        if (authError) {
          console.error("Error listing auth users:", authError);
        } else if (users && users.length > 0) {
          // Find user with matching email (case-insensitive)
          const matchingUser = users.find(
            (u) => u.email?.toLowerCase() === normalizedEmail
          );
          if (matchingUser?.id) {
            userId = matchingUser.id;
          }
        }

        // 2) If not found in auth.users, try to find profile where additional_emails contains this email
        if (!userId) {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("id, additional_emails")
            .contains("additional_emails", [normalizedEmail])
            .maybeSingle();

          if (profileError) {
            console.error(
              "Error looking up profile by additional_emails:",
              profileError
            );
          }

          if (profile?.id) {
            userId = profile.id;
          }
        }
      } catch (lookupError) {
        console.error(
          "Unexpected error looking up user by email:",
          lookupError
        );
        return res.status(500).json({
          error: "user_lookup_failed",
          message: "Failed to look up user by email",
        });
      }
    }

    if (!userId) {
      return res.status(400).json({
        error: "user_not_found",
        message:
          "Could not find a PullUp user with that email. Ask them to sign up first.",
      });
    }

    const event = await findEventById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const { isHost, role: currentRole } = await isUserEventHost(
      req.user.id,
      event.id
    );
    if (!isHost || currentRole !== "owner") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only event owners can add hosts",
      });
    }

    const { supabase } = await import("./supabase.js");
    const { error } = await supabase.from("event_hosts").insert({
      event_id: event.id,
      user_id: userId,
      role,
    });

    if (error) {
      console.error("Error adding event host:", error);
      if (error.code === "PGRST205") {
        return res.status(400).json({
          error: "hosts_not_enabled",
          message:
            "Hosts feature is not enabled in this environment yet (missing event_hosts table).",
        });
      }
      return res.status(500).json({ error: "Failed to add event host" });
    }

    // Return updated host list (same enriched shape as GET /host/events/:id/hosts)
    const { data: hostRows, error: fetchError } = await supabase
      .from("event_hosts")
      .select("id, event_id, user_id, role, created_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true });

    if (fetchError) {
      console.error("Error fetching event hosts after insert:", fetchError);
      if (fetchError.code === "PGRST205") {
        // Table missing but insert just worked? Unlikely, but fail gracefully.
        return res.status(201).json({ hosts: [] });
      }
      return res.status(500).json({ error: "Host added, but fetch failed" });
    }

    const hosts = await Promise.all(
      (hostRows || []).map(async (row) => {
        try {
          const profile = await getUserProfile(row.user_id);
          let email = null;
          try {
            const {
              data: { user },
              error: userError,
            } = await supabase.auth.admin.getUserById(row.user_id);
            if (!userError && user) {
              email = user.email || null;
            } else if (userError) {
              console.error(
                "Error fetching auth user for host:",
                row.user_id,
                userError
              );
            }
          } catch (authErr) {
            console.error(
              "Unexpected error fetching auth user for host:",
              row.user_id,
              authErr
            );
          }
          return {
            userId: row.user_id,
            email,
            role: row.role,
            createdAt: row.created_at,
            profile,
          };
        } catch (err) {
          console.error("Error fetching profile for host:", row.user_id, err);
          return {
            userId: row.user_id,
            email: null,
            role: row.role,
            createdAt: row.created_at,
            profile: null,
          };
        }
      })
    );

    res.status(201).json({ hosts });
  } catch (error) {
    console.error("Error adding event host:", error);
    res.status(500).json({ error: "Failed to add event host" });
  }
});

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
      if (!isHost || currentRole !== "owner") {
        return res.status(403).json({
          error: "Forbidden",
          message: "Only event owners can remove hosts",
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

// ---------------------------
// PROTECTED: Generate waitlist payment link
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
    } = req.body;

    // Get current event to check if price/currency changed
    const currentEvent = await findEventById(id);
    if (!currentEvent) {
      return res.status(404).json({ error: "Event not found" });
    }

    // CRITICAL: Only owners can edit events (Stripe Connect, pricing, etc.)
    const isOwner = await isUserEventOwner(req.user.id, id);
    if (!isOwner) {
      return res.status(403).json({
        error: "Forbidden",
        message:
          "Only the event owner can edit event details. Co-hosts can manage guests but cannot modify the event.",
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

    const updated = await updateEvent(id, {
      title,
      description,
      location,
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
    });

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

  // CRITICAL: Only owners can publish/unpublish events
  const isOwner = await isUserEventOwner(req.user.id, id);
  if (!isOwner) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Only the event owner can publish events.",
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
// ---------------------------
app.get("/api/location/autocomplete", async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.json({ predictions: [] });
    }

    const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

    // Try Google Places API first if API key is available
    if (GOOGLE_PLACES_API_KEY) {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?` +
            `input=${encodeURIComponent(query)}&` +
            `key=${GOOGLE_PLACES_API_KEY}&` +
            `types=establishment|geocode&` +
            `components=country:us|country:se&` + // Restrict to US and Sweden for better results
            `fields=place_id,description,structured_formatting`
        );

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
    const nominatimResponse = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
        `format=json&` +
        `q=${encodeURIComponent(query)}&` +
        `limit=5&` +
        `addressdetails=1&` +
        `extratags=1`,
      {
        headers: {
          "User-Agent": "PullUp App",
        },
      }
    );

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

    const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

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

    res.json({ event, guests });
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

    // Verify ownership
    if (event.hostId !== req.user.id) {
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
      const counts = slotCounts[slotTime] || { confirmed: 0, waitlist: 0 };
      const available =
        !event.dinnerMaxSeatsPerSlot ||
        counts.confirmed < event.dinnerMaxSeatsPerSlot;
      const remaining = event.dinnerMaxSeatsPerSlot
        ? Math.max(0, event.dinnerMaxSeatsPerSlot - counts.confirmed)
        : null;

      return {
        time: slotTime,
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

      // Verify ownership (owner or co-host)
      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have access to this event",
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

      // Verify ownership
      if (event.hostId !== req.user.id) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have access to this event",
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
    const people = await getAllPeopleWithStats(req.user.id);
    res.json({ people, total: people.length });
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
app.get("/host/crm/people/export", requireAuth, async (req, res) => {
  try {
    const people = await getAllPeopleWithStats(req.user.id);

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

      // Verify ownership
      if (event.hostId !== req.user.id) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have access to this event",
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
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const redirectUrl = `${frontendUrl}/home?stripe_connect=success&account_id=${result.connectedAccountId}`;

    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Error handling Stripe Connect callback:", error);

    // Redirect to frontend with error status
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const redirectUrl = `${frontendUrl}/home?stripe_connect=error&message=${encodeURIComponent(
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
    const isOwner = await isUserEventOwner(req.user.id, eventId);
    if (!isOwner) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only the event owner can upload event images.",
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
// Server
// ---------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`PullUp API running on http://localhost:${PORT}`);
});
