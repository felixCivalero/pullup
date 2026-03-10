// backend/src/email/tracking/trackingRoutes.js
//
// Express routes for email open & click tracking.
// Mounted on the main app: app.use(trackingRoutes)
//
// GET /t/o/:trackingId  — open tracking pixel (returns 1x1 transparent GIF)
// GET /t/c/:trackingId  — click redirect (logs click, 302 to destination)

import { Router } from "express";
import { supabase } from "../../supabase.js";
import { b64urlDecode, verifySignature } from "./linkRewriter.js";

const router = Router();

// 1x1 transparent GIF
const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// Known bot user-agents to filter out
const BOT_UA_PATTERNS = [
  /bot/i, /crawler/i, /spider/i, /preview/i, /fetch/i,
  /HeadlessChrome/i, /Phantom/i, /wget/i, /curl/i,
  /GoogleImageProxy/i, /YahooMailProxy/i,
];

function isBot(ua) {
  if (!ua) return false;
  return BOT_UA_PATTERNS.some((p) => p.test(ua));
}

/**
 * Resolve outbox row by tracking_id. Returns { id, tracking_id, to_email, campaign_tag } or null.
 */
async function resolveOutbox(trackingId) {
  if (!trackingId) return null;
  const { data, error } = await supabase
    .from("email_outbox")
    .select("id, tracking_id, to_email, campaign_tag")
    .eq("tracking_id", trackingId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.error("[tracking] resolveOutbox error:", error.message);
  }
  return data || null;
}

/**
 * Try to extract a PullUp event slug from a URL.
 * Matches patterns like: pullup.se/e/{slug}, /e/{slug}
 */
function extractEventSlug(url) {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/^\/e\/([a-z0-9-]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ─── Open Tracking Pixel ───────────────────────────────────────────

router.get("/t/o/:trackingId", async (req, res) => {
  // Always return the pixel immediately — tracking is fire-and-forget
  res.set({
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.send(PIXEL_GIF);

  // Record open asynchronously (don't block response)
  try {
    const { trackingId } = req.params;
    const ua = req.headers["user-agent"] || "";
    if (isBot(ua)) return;

    const outbox = await resolveOutbox(trackingId);
    if (!outbox) return;

    // Deduplicate: only record one open per tracking_id (per recipient)
    const { data: existing } = await supabase
      .from("email_opens")
      .select("id")
      .eq("tracking_id", trackingId)
      .limit(1);

    if (existing && existing.length > 0) return;

    await supabase.from("email_opens").insert({
      outbox_id: outbox.id,
      tracking_id: trackingId,
      user_agent: ua.slice(0, 500),
      ip_address: req.ip || req.headers["x-forwarded-for"] || null,
    });
  } catch (err) {
    console.error("[tracking] open pixel error:", err.message);
  }
});

// ─── Click Redirect ────────────────────────────────────────────────

router.get("/t/c/:trackingId", async (req, res) => {
  const { trackingId } = req.params;
  const { u: encodedUrl, l: encodedLabel, i: linkIndex, s: sig } = req.query;

  // Decode destination URL
  let destinationUrl;
  try {
    destinationUrl = b64urlDecode(encodedUrl || "");
  } catch {
    return res.status(400).send("Invalid link");
  }

  if (!destinationUrl || !destinationUrl.startsWith("http")) {
    return res.status(400).send("Invalid link");
  }

  // Verify HMAC signature to prevent open redirect abuse
  if (!verifySignature(trackingId, destinationUrl, sig)) {
    console.warn("[tracking] invalid click signature for", trackingId);
    return res.status(403).send("Invalid link signature");
  }

  // Append UTM parameters to destination URL
  let finalUrl = destinationUrl;
  try {
    const outbox = await resolveOutbox(trackingId);
    const campaignTag = outbox?.campaign_tag || "newsletter";
    const label = encodedLabel ? b64urlDecode(encodedLabel) : "link";

    const urlObj = new URL(destinationUrl);
    if (!urlObj.searchParams.has("utm_source")) urlObj.searchParams.set("utm_source", "pullup_newsletter");
    if (!urlObj.searchParams.has("utm_medium")) urlObj.searchParams.set("utm_medium", "email");
    if (!urlObj.searchParams.has("utm_campaign")) urlObj.searchParams.set("utm_campaign", campaignTag);
    if (!urlObj.searchParams.has("utm_content")) urlObj.searchParams.set("utm_content", label);
    finalUrl = urlObj.toString();

    // Record click asynchronously (don't block redirect)
    const ua = req.headers["user-agent"] || "";
    if (!isBot(ua) && outbox) {
      // A click implies an open — record open if not already recorded
      // (many email clients block tracking pixels, so this ensures opens are counted)
      supabase
        .from("email_opens")
        .select("id")
        .eq("tracking_id", trackingId)
        .limit(1)
        .then(({ data: existingOpen }) => {
          if (!existingOpen || existingOpen.length === 0) {
            return supabase.from("email_opens").insert({
              outbox_id: outbox.id,
              tracking_id: trackingId,
              user_agent: ua.slice(0, 500),
              ip_address: req.ip || req.headers["x-forwarded-for"] || null,
            });
          }
        })
        .catch(() => {});

      // Try to extract event slug from PullUp event links
      const eventSlug = extractEventSlug(destinationUrl);
      let eventId = null;

      if (eventSlug) {
        // Look up event_id by slug
        supabase
          .from("events")
          .select("id")
          .eq("slug", eventSlug)
          .maybeSingle()
          .then(({ data }) => {
            const resolvedEventId = data?.id || null;
            return supabase.from("email_clicks").insert({
              outbox_id: outbox.id,
              tracking_id: trackingId,
              link_url: destinationUrl,
              link_label: label,
              link_index: parseInt(linkIndex, 10) || 0,
              event_id: resolvedEventId,
              user_agent: ua.slice(0, 500),
              ip_address: req.ip || req.headers["x-forwarded-for"] || null,
            });
          })
          .then(({ error }) => {
            if (error) console.error("[tracking] click insert error:", error.message);
          })
          .catch((err) => {
            console.error("[tracking] click insert error:", err.message);
          });
      } else {
        // External link — insert directly without event_id
        supabase.from("email_clicks").insert({
          outbox_id: outbox.id,
          tracking_id: trackingId,
          link_url: destinationUrl,
          link_label: label,
          link_index: parseInt(linkIndex, 10) || 0,
          event_id: eventId,
          user_agent: ua.slice(0, 500),
          ip_address: req.ip || req.headers["x-forwarded-for"] || null,
        }).then(({ error }) => {
          if (error) console.error("[tracking] click insert error:", error.message);
        });
      }
    }
  } catch (err) {
    console.error("[tracking] click processing error:", err.message);
  }

  return res.redirect(302, finalUrl);
});

export default router;
