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
  getPaymentsForUser,
  getPaymentsForEvent,
  findPersonByEmail,
  mapEventFromDb,
  getUserProfile,
  updateUserProfile,
} from "./data.js";

import { requireAuth, optionalAuth } from "./middleware/auth.js";

import {
  getOrCreateStripeCustomer,
  createPaymentIntent,
  handleStripeWebhook,
  createStripeProduct,
  createStripePrice,
} from "./stripe.js";

// Load environment-specific .env file
// In development, loads .env.development
// In production, loads .env (or .env.production if you create one)
const envFile =
  process.env.NODE_ENV === "development" ? ".env.development" : ".env";

dotenv.config({ path: envFile });

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
    console.log(
      `[${routeName}] OG image is not in event-images bucket, using as-is: ${imageUrl}`
    );
    return imageUrl;
  }

  const filePath = extractEventImagesFilePath(imageUrl);
  if (!filePath) {
    console.log(
      `[${routeName}] Could not extract event-images file path, using as-is: ${imageUrl}`
    );
    return imageUrl;
  }

  try {
    const { supabase } = await import("./supabase.js");
    const {
      data: { publicUrl },
    } = supabase.storage.from("event-images").getPublicUrl(filePath);

    if (publicUrl) {
      console.log(
        `[${routeName}] OG public image URL generated: ${publicUrl} (filePath: ${filePath})`
      );
      return publicUrl;
    }

    console.log(
      `[${routeName}] getPublicUrl returned empty, using original: ${imageUrl}`
    );
    return imageUrl;
  } catch (err) {
    console.error(
      `[${routeName}] Error generating OG public image URL, using original:`,
      err
    );
    return imageUrl;
  }
}

// ---------------------------
// Helper: Generate OG HTML for an event (uses permanent public image URL)
// ---------------------------
async function generateOgHtmlForEvent(event, routeName = "Share") {
  console.log(
    `[${routeName}] Found event: ${event?.title} (slug: ${event?.slug}, id: ${event?.id})`
  );
  console.log(
    `[${routeName}] Event image URL (raw): ${event?.imageUrl || "none"}`
  );

  const ogImageUrl = await toOgPublicImageUrl(event?.imageUrl, routeName);

  console.log(
    `[${routeName}] Final OG image URL: ${
      ogImageUrl || "none (will use default)"
    }`
  );

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
  const baseUrl = process.env.FRONTEND_URL || "https://pullup.se";

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

// Allow base64 images in body
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ---------------------------
// PROTECTED: List user's events (requires auth)
// ---------------------------
app.get("/events", requireAuth, async (req, res) => {
  try {
    // Fetch only events for the authenticated user
    const { supabase } = await import("./supabase.js");
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("host_id", req.user.id)
      .order("starts_at", { ascending: false });

    if (error) {
      console.error("Error fetching events:", error);
      return res.status(500).json({ error: "Failed to fetch events" });
    }

    // Map to application format using the existing helper
    const mappedEvents = await Promise.all(
      events.map((dbEvent) => mapEventFromDb(dbEvent))
    );

    res.json(mappedEvents);
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

    if (!event) return res.status(404).json({ error: "Event not found" });

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
// PROTECTED: Create event (requires auth)
// ---------------------------
app.post("/events", requireAuth, async (req, res) => {
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

    // Stripe fields
    ticketPrice,
    ticketCurrency = "USD",
    stripeProductId, // Optional - will be auto-created if not provided
    stripePriceId, // Optional - will be auto-created if not provided

    // Dual personality fields
    createdVia,
    status,
  } = req.body;

  if (!title || !startsAt) {
    return res.status(400).json({ error: "title and startsAt are required" });
  }

  // If paid tickets, automatically create Stripe product and price
  let finalStripeProductId = stripeProductId;
  let finalStripePriceId = stripePriceId;

  // Create the event first to get its ID (with host_id from authenticated user)
  const event = await createEvent({
    hostId: req.user.id, // Set host_id from authenticated user
    title,
    description,
    location,
    locationLat: locationLat || null,
    locationLng: locationLng || null,
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
    stripeProductId: finalStripeProductId,
    stripePriceId: finalStripePriceId,
    cocktailCapacity,
    foodCapacity,
    totalCapacity,
    createdVia: createdVia || "legacy",
    status: status || "PUBLISHED",
  });

  // If paid tickets and Stripe IDs weren't provided, create them automatically
  if (
    ticketType === "paid" &&
    ticketPrice &&
    !stripeProductId &&
    !stripePriceId
  ) {
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
app.post("/events/:slug/rsvp", async (req, res) => {
  try {
    const { slug } = req.params;
    const {
      name,
      email,
      plusOnes = 0, // NEW: how many guests they bring (0–3)
      wantsDinner = false, // NEW: opt-in to dinner
      dinnerTimeSlot = null, // NEW: selected dinner time slot (ISO string)
      dinnerPartySize = null, // NEW: party size for dinner (can differ from event party size)
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const result = await addRsvp({
      slug,
      name,
      email,
      plusOnes,
      wantsDinner,
      dinnerTimeSlot,
      dinnerPartySize,
    });

    if (result.error === "not_found") {
      return res.status(404).json({ error: "Event not found" });
    }

    if (result.error === "invalid_email") {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (result.error === "duplicate") {
      return res.status(409).json({
        error: "duplicate",
        message: "You've already RSVP'd to this event",
        status: result.rsvp.status,
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

    // Return detailed RSVP information including status details
    res.status(201).json({
      event: result.event,
      rsvp: result.rsvp,
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

    // Verify ownership
    if (event.hostId !== req.user.id) {
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
// PROTECTED: Update event (requires auth, verifies ownership)
// ---------------------------
app.put("/host/events/:id", requireAuth, async (req, res) => {
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
    stripeProductId,
    stripePriceId,

    // Capacity fields
    cocktailCapacity,
    foodCapacity,
    totalCapacity,

    // Dual personality fields
    status,
  } = req.body;

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
    stripeProductId,
    stripePriceId,
    cocktailCapacity,
    foodCapacity,
    totalCapacity,
    status,
  });

  if (!updated) return res.status(404).json({ error: "Event not found" });

  res.json(updated);
});

// ---------------------------
// PROTECTED: Publish event (requires auth, verifies ownership)
// ---------------------------
app.put("/host/events/:id/publish", requireAuth, async (req, res) => {
  const { id } = req.params;
  const event = await findEventById(id);

  if (!event || event.hostId !== req.user.id) {
    return res.status(404).json({ error: "Event not found" });
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

    // Verify ownership
    if (event.hostId !== req.user.id) {
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

    // getAllPeopleWithStats will filter by user's events via backend queries
    const people = await getAllPeopleWithStats(req.user.id);
    res.json({ people });
  } catch (error) {
    console.error("Error fetching people:", error);
    res.status(500).json({ error: "Failed to fetch people" });
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

      // Create payment intent
      const paymentIntent = await createPaymentIntent({
        customerId,
        amount: event.ticketPrice,
        eventId: event.id,
        eventTitle: event.title,
        personId: person.id,
      });

      // Create payment record
      const payment = await createPayment({
        userId: person.id, // Using personId as userId for now
        eventId: event.id,
        rsvpId: rsvpId || null,
        stripePaymentIntentId: paymentIntent.id,
        stripeCustomerId: customerId,
        amount: event.ticketPrice,
        currency: "usd",
        status: "pending",
        description: `Ticket for ${event.title}`,
      });

      res.json({
        client_secret: paymentIntent.client_secret,
        payment_id: payment.id,
        payment_intent_id: paymentIntent.id,
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
    if (event.hostId !== req.user.id) {
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
// WEBHOOKS: Stripe webhook handler
// ---------------------------
app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    let event;

    try {
      const stripe = (await import("stripe")).default;
      const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY || "");
      event = stripeInstance.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      const result = await handleStripeWebhook(event);
      res.json({ received: true, processed: result.processed });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  }
);

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
// PROTECTED: Upload event image
// ---------------------------
app.post("/host/events/:eventId/image", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { imageData } = req.body; // Base64 image data

    if (!imageData) {
      return res.status(400).json({ error: "imageData is required" });
    }

    // Verify event ownership
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    if (event.hostId !== req.user.id) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
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
