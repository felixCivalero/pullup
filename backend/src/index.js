// backend/src/index.js
import express from "express";
import crypto from "crypto";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";

import { getUserProfile } from "./data.js";

// Route modules — registered below in mount order (order is load-bearing:
// the Stripe webhook must precede the global JSON parser).
import { registerStripeWebhookRoutes } from "./routes/stripeWebhook.js";
import { registerCanvasChatRoutes } from "./routes/canvasChat.js";
import { registerOauthRoutes } from "./routes/oauth.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerInstagramConnectRoutes } from "./routes/instagramConnect.js";
import { registerVerificationRoutes } from "./routes/verification.js";
import { registerWaitlistRoutes } from "./routes/waitlist.js";
import { registerCommunityRoutes } from "./routes/communities.js";
import { registerLinkRoutes } from "./routes/links.js";
import { registerEventsListRoutes } from "./routes/eventsList.js";
import { registerShareRoutes } from "./routes/share.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerRsvpRoutes } from "./routes/rsvp.js";
import { registerHostEventRoutes } from "./routes/hostEvents.js";
import { registerLocationRoutes } from "./routes/location.js";
import { registerHostRoomRoutes } from "./routes/hostRoom.js";
import { registerCommsRoutes } from "./routes/comms.js";
import { registerCheckinAccessRoutes } from "./routes/checkinAccess.js";
import { registerAdminMatchRoutes } from "./routes/adminMatches.js";
import { registerRoomRoutes } from "./routes/room.js";
import { registerRoomContentRoutes } from "./routes/roomContent.js";
import { registerHostSpaceRoutes } from "./routes/hostSpace.js";
import { registerGuestRoutes } from "./routes/guests.js";
import { registerCrmPeopleRoutes } from "./routes/crmPeople.js";
import { registerPlannerRoutes } from "./routes/planner.js";
import { registerCrmViewRoutes } from "./routes/crmViews.js";
import { registerPaymentRoutes } from "./routes/payments.js";
import { registerPaymentsV2Routes } from "./routes/paymentsV2.js";
import { registerProductDeliveryRoutes } from "./routes/productDelivery.js";
import { registerProductPlacementRoutes } from "./routes/productPlacement.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerSubscriptionRoutes, registerSubscriptionWebhookRoutes } from "./routes/subscriptions.js";
import { registerAccessRequestRoutes } from "./routes/accessRequests.js";
import { registerByoSupabaseRoutes } from "./routes/byoSupabase.js";
import { registerByoOauthRoutes } from "./routes/byoOauth.js";
import { registerTokenRoutes } from "./routes/tokens.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerEventImageRoutes } from "./routes/eventImages.js";
import { registerCrmRpcRoutes } from "./routes/crmRpc.js";
import { registerContextPackRoutes } from "./routes/contextPack.js";
import { registerMediaLinkRoutes } from "./routes/mediaLink.js";
import { registerEventMediaRoutes } from "./routes/eventMedia.js";
import { registerProfileMediaRoutes } from "./routes/profileMedia.js";
import { registerNewsletterRoutes } from "./routes/newsletter.js";
import { registerIdeaRoutes } from "./routes/ideas.js";
import { registerAdminAnalyticsOverviewRoutes } from "./routes/adminAnalyticsOverview.js";
import { registerHostAnalyticsRoutes } from "./routes/hostAnalytics.js";
import { registerAdminStockholmRoutes } from "./routes/adminStockholm.js";
import { registerTrackingEventRoutes } from "./routes/trackingEvents.js";
import { registerTrackBatchRoutes } from "./routes/trackBatch.js";
import { registerAdminAnalyticsLandingRoutes } from "./routes/adminAnalyticsLanding.js";
import { registerAdminAnalyticsRoomsRoutes } from "./routes/adminAnalyticsRooms.js";
import { registerHostExportRoutes } from "./routes/hostExport.js";
import { registerHostImportRoutes } from "./routes/hostImport.js";
import { registerHostEventStoryRoutes } from "./routes/hostEventStory.js";
import { registerAdminAnalyticsRoutes } from "./routes/adminAnalytics.js";
import { registerAdminCrmSalesRoutes } from "./routes/adminCrmSales.js";
import { registerAdminEcosystemRoutes } from "./routes/adminEcosystem.js";
import { registerAdminSystemInboxRoutes } from "./routes/adminSystemInbox.js";
import { registerAdminOverviewRoutes } from "./routes/adminOverview.js";
import { registerAdminPulseRoutes } from "./routes/adminPulse.js";
import { registerAdminIdeaRoutes } from "./routes/adminIdeas.js";
import { registerInternalMetricsRoutes } from "./routes/internalMetrics.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { requestMetrics } from "./middleware/requestMetrics.js";
import { captureError } from "./observability.js";
import { getFrontendUrl } from "./lib/urls.js";

import { composedMessageEmail } from "./emails/signupConfirmation.js";
import trackingRoutes from "./email/tracking/trackingRoutes.js";
import { handleMcp, mcpCorsPreflight } from "./mcp/httpHandler.js";
import { dispatch as dispatchMessage } from "./messaging/index.js";

// Load environment variables once. override:true makes .env authoritative —
// PM2 bakes a snapshot of env into ~/.pm2/dump.pm2 and re-injects it on every
// restart, and plain dotenv.config() will NOT replace an already-set var. That
// silently pinned a rotated RESEND_API_KEY to the stale value. .env is our
// source of truth, so let it win.
dotenv.config({ override: true });

const app = express();

// nginx sits in front of node on EC2 and forwards x-forwarded-for. Without
// trust proxy=1, req.ip is always 127.0.0.1 (nginx) and any rate-limit /
// IP-logging code sees one client. With trust proxy=1, we trust exactly
// one upstream hop (our nginx). NEVER set this to true — that would
// trust any x-forwarded-for value an attacker injects.
app.set("trust proxy", 1);

// Security headers via helmet. CSP is intentionally disabled here — our
// event pages embed Spotify/Apple/SoundCloud/YouTube iframes and call
// Supabase + Stripe directly, so a meaningful CSP needs careful per-route
// tuning we haven't done yet. The remaining helmet defaults still give us
// HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN,
// Referrer-Policy, X-DNS-Prefetch-Control, etc. — all wins over the
// "no security headers anywhere" the audit flagged.
//
// crossOriginEmbedderPolicy is also disabled: it'd break the OG image
// proxy that crawlers embed cross-origin.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    strictTransportSecurity: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: false, // flip to true only after submitting to hstspreload.org
    },
  }),
);

// CORS configuration.
//
// If CORS_ORIGIN is unset in production, fail fast on boot rather than
// silently fall back to the dev-only localhost allowlist. The audit
// flagged the previous quiet-fallback behavior as a real foot-gun: a
// prod deploy that forgot the env would 200 the OPTIONS preflight but
// then deny actual cross-origin requests, breaking every browser
// client without any backend error.
if (process.env.NODE_ENV === "production" && !process.env.CORS_ORIGIN) {
  throw new Error(
    "CORS_ORIGIN must be set in production. Example: CORS_ORIGIN=https://pullup.se,https://www.pullup.se",
  );
}
const corsOptions = {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : ["http://localhost:3000", "http://localhost:5173"], // dev default
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

// Metrics first: every response (webhooks included) lands in the per-route
// aggregate behind GET /internal/metrics.
app.use(requestMetrics);

registerStripeWebhookRoutes(app);
registerSubscriptionWebhookRoutes(app); // Creator-tier subscription events — raw body, own secret

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

// Global JSON parser. The previous 100mb default was vastly more than any
// non-attack request needs and made it easy to slow the process with
// large payloads. 15mb still comfortably accommodates every image-upload
// route (each has its own code-side cap: profile pic 5MB raw → ~6.7MB
// base64 in JSON; event image 10MB → ~13.3MB; CRM image 2MB; logo
// 500KB). Routes that legitimately need more (e.g. some future bulk
// import) can mount their own express.json with a higher limit BEFORE
// this global middleware.
app.use(
  express.json({
    limit: "15mb",
    verify: (req, res, buf) => {
      // Preserve raw body for HMAC verification on webhooks.
      req.rawBody = buf;
    },
  }),
);
app.use(express.text({ limit: "10mb", type: "text/csv" })); // CSV import
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ---------------------------
// MCP: Model Context Protocol endpoint for any MCP-capable AI client
// (claude.ai, ChatGPT, Cursor, Claude Desktop/Code, etc.). Authenticated
// via PATs — issued either manually in Settings or via the OAuth flow
// below. See src/mcp/ and src/oauth/.
// ---------------------------
app.options("/mcp", mcpCorsPreflight);
app.all("/mcp", handleMcp);

// Scoped surfaces: /mcp/create (event-builder head), /mcp/crm (relationship
// ops). Same auth + handler; the profile segment just narrows the tool slice.
// Express 5 dropped inline param regexes, so we accept any :profile and let the
// handler validate it (an unknown segment falls back to the full surface).
// /mcp/health is registered earlier, so its GET still wins over this.
app.options("/mcp/:profile", mcpCorsPreflight);
app.all("/mcp/:profile", handleMcp);

registerCanvasChatRoutes(app);

registerOauthRoutes(app);

registerWebhookRoutes(app);

registerInstagramConnectRoutes(app);

registerVerificationRoutes(app);

registerWaitlistRoutes(app);

registerCommunityRoutes(app);

// ---------------------------
// EMAIL TRACKING: open pixel + click redirect
// ---------------------------
app.use(trackingRoutes);

registerLinkRoutes(app);

registerEventsListRoutes(app);

registerShareRoutes(app);

registerEventRoutes(app);

registerRsvpRoutes(app);

registerHostEventRoutes(app);

registerLocationRoutes(app);

registerHostRoomRoutes(app);

registerCommsRoutes(app);

registerCheckinAccessRoutes(app);

registerAdminMatchRoutes(app);

registerRoomRoutes(app);

registerRoomContentRoutes(app);

registerHostSpaceRoutes(app);

registerGuestRoutes(app);

registerCrmPeopleRoutes(app);

registerPlannerRoutes(app);

registerCrmViewRoutes(app);

registerPaymentRoutes(app);

// Transaction layer (rail-agnostic checkout + metered-motion billing) — every
// endpoint is inert until PAYMENTS_V2_ENABLED / BILLING_METERING_ENABLED flip.
registerPaymentsV2Routes(app);

// Digital-product delivery: host upload-URL minting + the gated buyer endpoint
// that serves download/secret/unlock only after a product RSVP settles.
registerProductDeliveryRoutes(app);
registerProductPlacementRoutes(app);

registerBillingRoutes(app);
registerSubscriptionRoutes(app);
// Unified early-access requests (Instagram / Agency / Products) — one row +
// a PullUp system-thread seed; the admin System inbox IS the notification.
registerAccessRequestRoutes(app);

// BYO-Supabase (creator owns their data) — connect/status/disconnect spine.
// Inert until BYO_SUPABASE_ENABLED flips.
registerByoSupabaseRoutes(app);

// BYO keyless connect (Supabase OAuth) — inert until the OAuth app is configured.
registerByoOauthRoutes(app);

registerTokenRoutes(app);

registerProfileRoutes(app);

registerEventImageRoutes(app);

registerCrmRpcRoutes(app);

registerContextPackRoutes(app);

registerMediaLinkRoutes(app);

registerEventMediaRoutes(app);

registerProfileMediaRoutes(app);

registerNewsletterRoutes(app);

registerIdeaRoutes(app);

registerAdminAnalyticsOverviewRoutes(app);

registerAdminSystemInboxRoutes(app);
registerAdminOverviewRoutes(app);
registerAdminPulseRoutes(app);

registerHostAnalyticsRoutes(app);

registerAdminStockholmRoutes(app);

registerTrackingEventRoutes(app);

registerTrackBatchRoutes(app);

registerAdminAnalyticsLandingRoutes(app);

registerAdminAnalyticsRoomsRoutes(app);

registerHostExportRoutes(app);

registerHostImportRoutes(app);

registerHostEventStoryRoutes(app);

registerAdminAnalyticsRoutes(app);

registerAdminCrmSalesRoutes(app);

registerAdminEcosystemRoutes(app);

// Admin "Act as" impersonation REMOVED (ease of use + privacy) — the routes
// file remains on disk, unmounted; re-register here to resurrect deliberately.

registerAdminIdeaRoutes(app);

registerInternalMetricsRoutes(app);

// Host notifications — opt-in, default-OFF, email-only daily digest prefs + test.
registerNotificationRoutes(app);

// ---------------------------
// 404 + global error handlers
// ---------------------------
//
// Anything not matched by a route above falls through to this 404. JSON
// shape so the SPA fetch wrappers don't choke on HTML.
app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.path });
});

// Last-resort error handler. The audit flagged synchronous throws
// leaking stack traces via Express's default HTML error page, plus
// per-route `res.status(500).json({ message: error.message })` echoing
// Supabase errors that contain schema/column names. Catch everything
// here, log the real error server-side, return a generic message
// client-side.
//
// 4-arg signature is what flags this as an error handler to Express.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const requestId = crypto.randomBytes(6).toString("hex");
  console.error("[globalError]", {
    requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode: err.statusCode || err.status,
    name: err.name,
    message: err.message,
    stack: err.stack,
  });
  // Every uncaught route error funnels through here — report real failures
  // (5xx) to the tracker; intentional 4xx stay local noise.
  if ((Number(err.statusCode || err.status) || 500) >= 500) {
    captureError(err, { requestId, method: req.method, path: req.originalUrl });
  }
  if (res.headersSent) return; // Express handles the rest
  const status = Number(err.statusCode || err.status) || 500;
  // Only surface the actual message when it's clearly an intentional
  // 4xx (a route that set .statusCode = 400/401/403/404 etc.). 5xx
  // messages are kept opaque because they typically wrap Supabase /
  // Stripe / internal errors that name fields we don't want public.
  const body =
    status < 500 && err.message
      ? { error: err.message, requestId }
      : { error: "Internal server error", requestId };
  res.status(status).json(body);
});

// ---------------------------
// Server
// ---------------------------
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, async () => {
  console.log(`PullUp API running on http://${HOST}:${PORT}`);
  try {
    const { initObservability } = await import("./observability.js");
    await initObservability({ serviceName: "pullup-api" });
  } catch (e) {
    console.log("Observability init note:", e.message);
  }
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

  /* ── Pre-event reminders ──────────────────────────────────
   * Timing is now PER EVENT (events.comms_config.reminder.hoursBefore, default
   * 12h) instead of a hardcoded ~24h. We look ahead far enough to cover the max
   * configurable lead (72h) and let the per-event decision in eventComms.js
   * (reminderDue) pick the exact tick to fire. Idempotency dedupes the ticks.
   */
  const REMINDER_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  const REMINDER_WINDOW_MS  = 73 * 60 * 60 * 1000; // 73 hours (covers max 72h lead + slack)

  // Token resolution context for a composed message — the real {event name},
  // {time}, {location}, {coordinates}. Per-recipient links ({room link} /
  // {upload link}) are layered on in the guest loop. Time/location always
  // resolve to the real value (decoupled from the page's reveal-later flags).
  function buildCommsCtx(event) {
    let time = "";
    try {
      time = event.starts_at
        ? new Date(event.starts_at).toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: event.timezone || undefined })
        : "";
    } catch { time = ""; }
    const lat = event.location_lat, lng = event.location_lng;
    const hasCoords = lat != null && lng != null;
    const mapsByCoords = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : "";
    const mapsByAddr = event.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}` : "";
    return {
      eventName: event.title || "the event",
      time,
      location: event.location || "",
      locationUrl: mapsByCoords || mapsByAddr || "",
      coordinates: hasCoords ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : "",
      coordinatesUrl: mapsByCoords || "",
    };
  }

  async function sendEventReminders() {
    try {
      const { supabase } = await import("./supabase.js");
      const { getEventCommsConfig, reminderDue, resolveCommsHtml, bodyNeedsRoomKey, commsCampaignTag } = await import("./services/eventComms.js");
      const now = new Date();
      const nowMs = now.getTime();
      const windowEnd = new Date(nowMs + REMINDER_WINDOW_MS);

      // 1. Find published events starting within the look-ahead window.
      const { data: events, error: eventsErr } = await supabase
        .from("events")
        .select("id, title, slug, kind, starts_at, ends_at, timezone, location, location_lat, location_lng, show_coordinates, hide_date, hide_location, date_reveal_hint, reveal_hint, cover_image_url, image_url, host_id, comms_config")
        .eq("status", "PUBLISHED")
        .gt("starts_at", now.toISOString())
        .lt("starts_at", windowEnd.toISOString());

      if (eventsErr) {
        console.error("[Reminders] Error fetching events:", eventsErr.message);
        return;
      }
      if (!events || events.length === 0) return;

      for (const event of events) {
        // Dateless kinds (community, product) carry a placeholder starts_at —
        // never a real moment. No date, no reminder, whatever the config says.
        if (event.kind && event.kind !== "event") continue;
        // Per-event timing + opt-out. Skip the whole event unless THIS tick is
        // the reminder's moment (within the grace window after start-hoursBefore).
        const commsCfg = getEventCommsConfig
          ? (await getEventCommsConfig(event.id))
          : null;
        const reminderCfg = commsCfg?.reminder;
        const startMs = new Date(event.starts_at).getTime();
        if (reminderCfg && !reminderDue({ now: nowMs, startMs, hoursBefore: reminderCfg.hoursBefore, enabled: reminderCfg.enabled })) {
          continue;
        }
        // 2. Get confirmed RSVPs with person details. Paged so a >1000-guest
        // event doesn't silently drop everyone past row 1000 from the reminder
        // (a miss on a background timer nobody sees).
        let rsvps;
        try {
          const { selectAllPaged } = await import("./db/safeQuery.js");
          rsvps = await selectAllPaged(() =>
            supabase
              .from("rsvps")
              .select(`
            id, person_id,
            people:person_id ( id, name, email, phone_e164, phone_verified_at )
          `)
              .eq("event_id", event.id)
              .eq("booking_status", "CONFIRMED")
          );
        } catch (rsvpErr) {
          console.error(`[Reminders] Error fetching RSVPs for event ${event.id}:`, rsvpErr.message);
          continue;
        }
        if (!rsvps || rsvps.length === 0) continue;

        // 3. Fetch host branding + WhatsApp prefs (so the WA rail can fire).
        let hostBrand = {};
        let hostProfile = null;
        try {
          hostProfile = await getUserProfile(event.host_id);
          hostBrand = {
            brandName: hostProfile?.brand || "",
            brandWebsite: hostProfile?.brandWebsite || "",
            contactEmail: hostProfile?.contactEmail || "",
          };
        } catch {}
        const hostSig =
          hostProfile?.whatsappSignature ||
          (hostProfile?.name ? `It's me, ${hostProfile.name.split(/\s+/)[0]}` : "PullUp");
        const timePhrase = (() => {
          try {
            return new Date(event.starts_at).toLocaleString("en-US", { weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false });
          } catch { return "soon"; }
        })();

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

        // Token resolution context for the host's composed reminder. The {time}
        // and {location} tokens always resolve to the real value — DECOUPLED from
        // the event page's reveal-later flags — so a host can hand over the
        // details in the message even when the public page hides them.
        const ctxBase = buildCommsCtx(event, resolvedImageUrl);
        const needsRoomKey = bodyNeedsRoomKey(reminderCfg.body);

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

          // Mint a per-recipient room key only if the message links to the room.
          let roomUrl = "";
          if (needsRoomKey) {
            try {
              const { mintRoomKey } = await import("./services/roomKeys.js");
              const rawKey = await mintRoomKey({ email: person.email, eventId: event.id, personId: person.id });
              if (rawKey) roomUrl = `${frontendBase.replace(/\/$/, "")}/api/k/${rawKey}`;
            } catch {}
          }

          // Key kept as the historical "reminder-24h-…" string (not the lead
          // time) so it stays STABLE across this deploy: any event that already
          // sent a reminder under the old ~24h logic is deduped and won't fire a
          // second one when the new per-event timing crosses. One reminder per
          // guest per event, regardless of the configured hours.
          const idempotencyKey = `reminder-24h-${event.id}-${person.id}`;
          const reminderHtml = composedMessageEmail({
            eventTitle: event.title,
            badgeText: "HAPPENING SOON",
            imageUrl: resolvedImageUrl,
            bodyHtml: resolveCommsHtml(reminderCfg.body, { ...ctxBase, roomUrl, uploadUrl: roomUrl }),
            frontendUrl: frontendBase,
            unsubscribeUrl,
            ...hostBrand,
          });
          try {
            // Two-rail: a WhatsApp reminder for guests reachable + opted-in
            // there; dispatch() falls to this email for everyone else (and in
            // prod until event_reminder_24h is Meta-approved). Idempotency key
            // dedupes BOTH rails across the every-15-min ticks.
            await dispatchMessage({
              recipient: {
                id: person.id,
                email: person.email,
                phone_e164: person.phone_e164 || null,
                phone_verified_at: person.phone_verified_at || null,
              },
              hostProfile: hostProfile || { id: event.host_id },
              whatsapp: {
                templateKey: "event_reminder_24h",
                variables: {
                  event_title: event.title || "the event",
                  time_phrase: timePhrase,
                  host_signature: hostSig,
                },
              },
              email: {
                subject: `"${event.title}" is coming up`,
                htmlBody: reminderHtml,
                category: "transactional",
              },
              context: {
                personId: person.id,
                hostProfileId: event.host_id,
                idempotencyKey,
                campaignTag: commsCampaignTag("reminder", event.id),
                legalBasis: "legitimate_interest",
              },
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

  // Day-before event reminders — LIVE. Routed through dispatch() so they ship
  // on WhatsApp where the guest is reachable + opted-in, and on email otherwise.
  // The outbox idempotency key `reminder-24h-<eventId>-<personId>` dedupes BOTH
  // rails across the every-15-min ticks, so the recurring tick is safe.
  setInterval(sendEventReminders, REMINDER_INTERVAL_MS);

  /* ── Host broadcast drainer ───────────────────────────────
   * Delivers queued "send this event to your community" broadcasts off the
   * request thread (see services/roomBroadcast.js). enqueue kicks it once for
   * instant small-send delivery; this timer is the durability net that resumes
   * anything left after a restart, transient failure, or a huge broadcast that
   * spanned multiple passes. Overlap-guarded internally.
   */
  setInterval(() => {
    import("./services/roomBroadcast.js")
      .then((m) => m.drainRoomBroadcasts())
      .catch((err) => console.error("[broadcast] drain tick failed:", err?.message));
  }, 10 * 1000);

  /* ── Post-event messages ──────────────────────────────────
   * The third leg of the per-event communication arc: after the event, a
   * "thanks — upload your photos" note routed to the Room's content wall.
   * Per-event timing (events.comms_config.postEvent.hoursAfter, default 16h)
   * and opt-in (default ON). postEventDue() only fires inside a tight grace
   * window after the crossing, so deploying this never backfills a blast to
   * events that ended long ago. Idempotency dedupes the 15-min ticks.
   */
  const POST_EVENT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  // Look back far enough to cover the max configurable delay (a week) plus slack.
  const POST_EVENT_LOOKBACK_MS = (168 + 6) * 60 * 60 * 1000;

  async function sendPostEventMessages() {
    try {
      const { supabase } = await import("./supabase.js");
      const { getEventCommsConfig, postEventDue, effectiveEndMs, resolveCommsHtml, bodyNeedsRoomKey, commsCampaignTag } = await import("./services/eventComms.js");
      const { ensureUnsubscribeToken } = await import("./data.js");
      const now = new Date();
      const nowMs = now.getTime();
      const lookbackStart = new Date(nowMs - POST_EVENT_LOOKBACK_MS);
      const frontendBase = getFrontendUrl();

      // Published events that have already started within the look-back window
      // (an event ends after it starts, so this is a superset of "recently ended").
      const { data: events, error: eventsErr } = await supabase
        .from("events")
        .select("id, title, slug, kind, starts_at, ends_at, timezone, location, location_lat, location_lng, cover_image_url, image_url, host_id")
        .eq("status", "PUBLISHED")
        .lt("starts_at", now.toISOString())
        .gt("starts_at", lookbackStart.toISOString());
      if (eventsErr) {
        console.error("[PostEvent] Error fetching events:", eventsErr.message);
        return;
      }
      if (!events || events.length === 0) return;

      for (const event of events) {
        // Dateless kinds never "end" — their placeholder date must not trigger
        // a thank-you blast.
        if (event.kind && event.kind !== "event") continue;
        const cfg = await getEventCommsConfig(event.id);
        const peCfg = cfg.postEvent;
        const endMs = effectiveEndMs({ ends_at: event.ends_at, starts_at: event.starts_at });
        if (!postEventDue({ now: nowMs, endMs, hoursAfter: peCfg.hoursAfter, enabled: peCfg.enabled })) {
          continue;
        }

        // Paged so a >1000-guest event doesn't drop the tail from the thank-you.
        let rsvps;
        try {
          const { selectAllPaged } = await import("./db/safeQuery.js");
          rsvps = await selectAllPaged(() =>
            supabase
              .from("rsvps")
              .select(`id, person_id, people:person_id ( id, name, email, phone_e164, phone_verified_at )`)
              .eq("event_id", event.id)
              .eq("booking_status", "CONFIRMED")
          );
        } catch (rsvpErr) {
          console.error(`[PostEvent] Error fetching RSVPs for event ${event.id}:`, rsvpErr.message);
          continue;
        }
        if (!rsvps || rsvps.length === 0) continue;

        // Host voice + brand (same resolution as the reminder path).
        let hostBrand = {};
        let hostProfile = null;
        try {
          hostProfile = await getUserProfile(event.host_id);
          hostBrand = {
            brandName: hostProfile?.brand || "",
            brandWebsite: hostProfile?.brandWebsite || "",
            contactEmail: hostProfile?.contactEmail || "",
          };
        } catch {}
        const hostSig =
          hostProfile?.whatsappSignature ||
          (hostProfile?.name ? `It's me, ${hostProfile.name.split(/\s+/)[0]}` : "PullUp");

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
          } catch {}
        }
        const ctxBase = buildCommsCtx(event);
        const needsRoomKey = bodyNeedsRoomKey(peCfg.body);

        for (const rsvp of rsvps) {
          const person = rsvp.people;
          if (!person?.email) continue;

          let unsubscribeUrl = "";
          try {
            const token = await ensureUnsubscribeToken(person.id);
            unsubscribeUrl = `${frontendBase}/u/${token}`;
          } catch {}

          // Sign the guest straight into the Room (the upload destination), the
          // same way the signup confirmation does — only when the message links there.
          let roomUrl = "";
          if (needsRoomKey) {
            try {
              const { mintRoomKey } = await import("./services/roomKeys.js");
              const rawKey = await mintRoomKey({ email: person.email, eventId: event.id, personId: person.id });
              if (rawKey) roomUrl = `${frontendBase.replace(/\/$/, "")}/api/k/${rawKey}`;
            } catch {}
          }

          const idempotencyKey = `post-event-${event.id}-${person.id}`;
          const html = composedMessageEmail({
            eventTitle: event.title,
            badgeText: "THANK YOU",
            imageUrl: resolvedImageUrl,
            bodyHtml: resolveCommsHtml(peCfg.body, { ...ctxBase, roomUrl, uploadUrl: roomUrl }),
            frontendUrl: frontendBase,
            unsubscribeUrl,
            ...hostBrand,
          });
          try {
            await dispatchMessage({
              recipient: {
                id: person.id,
                email: person.email,
                phone_e164: person.phone_e164 || null,
                phone_verified_at: person.phone_verified_at || null,
              },
              hostProfile: hostProfile || { id: event.host_id },
              whatsapp: {
                templateKey: "post_event_thanks",
                variables: {
                  host_signature: hostSig,
                  event_title: event.title || "the event",
                },
              },
              email: {
                subject: `Thanks for coming to ${event.title}`,
                htmlBody: html,
                category: "transactional",
              },
              context: {
                personId: person.id,
                hostProfileId: event.host_id,
                idempotencyKey,
                campaignTag: commsCampaignTag("postEvent", event.id),
                legalBasis: "legitimate_interest",
              },
            });
          } catch (err) {
            console.error(`[PostEvent] Failed to send to ${person.email} for event ${event.id}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error("[PostEvent] Unexpected error in sendPostEventMessages:", err.message);
    }
  }
  setInterval(sendPostEventMessages, POST_EVENT_INTERVAL_MS);

  /* ── Host daily digest ─────────────────────────────────────
   * Opt-in, default-OFF, email-only. Each host chooses a local send time +
   * carries their IANA timezone; runDailyDigestTick sends only to hosts whose
   * local clock is at/past their send time and who haven't been sent yet on
   * their local day, and only when there's real activity in the last 24h. So
   * this is a near-no-op until a host opts in, and the per-local-day guard
   * makes the frequent cadence safe (no double-send). We tick every 15 min so
   * a :00/:30 send time lands within ~15 min of the host's chosen moment. One
   * batched email per host per day, built from their own world. */
  const DIGEST_INTERVAL_MS = 15 * 60 * 1000; // 15 min
  async function runDigestTick() {
    try {
      const { runDailyDigestTick } = await import("./services/notificationDigest.js");
      await runDailyDigestTick();
    } catch (err) {
      console.error("[Digest] Unexpected error in runDigestTick:", err.message);
    }
  }
  setInterval(runDigestTick, DIGEST_INTERVAL_MS);

  /* Owned-schema sync (BYO): once a day, re-apply PullUp's current owned schema
   * to every connected creator DB so schema changes (new tables/columns)
   * propagate automatically (additive, idempotent, status-preserving).
   * Self-gated on BYO_SUPABASE_ENABLED. */
  const SCHEMA_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
  async function runSchemaSyncTick() {
    try {
      const { runOwnedSchemaSync } = await import("./jobs/ownedSchemaSyncRun.js");
      await runOwnedSchemaSync();
    } catch (err) {
      console.error("[schemaSync] Unexpected error in tick:", err.message);
    }
  }
  setInterval(runSchemaSyncTick, SCHEMA_SYNC_INTERVAL_MS);

  /* Instagram token refresh: once a day, refresh long-lived IG tokens nearing
   * their 60-day expiry so connections don't silently die (and force a
   * reconnect). No-op until a host connects Instagram. Inbound-driven sends
   * already mark genuinely-dead tokens; this keeps live ones alive. */
  const IG_TOKEN_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
  async function runIgTokenRefreshTick() {
    try {
      const { runInstagramTokenRefreshTick } = await import("./instagram/tokenRefresh.js");
      await runInstagramTokenRefreshTick();
    } catch (err) {
      console.error("[ig-token-refresh] Unexpected error in tick:", err.message);
    }
  }
  setInterval(runIgTokenRefreshTick, IG_TOKEN_REFRESH_INTERVAL_MS);
});
