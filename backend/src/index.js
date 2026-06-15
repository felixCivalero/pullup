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
import { registerHostSpaceRoutes } from "./routes/hostSpace.js";
import { registerGuestRoutes } from "./routes/guests.js";
import { registerCrmPeopleRoutes } from "./routes/crmPeople.js";
import { registerPlannerRoutes } from "./routes/planner.js";
import { registerCrmViewRoutes } from "./routes/crmViews.js";
import { registerPaymentRoutes } from "./routes/payments.js";
import { registerPaymentsV2Routes } from "./routes/paymentsV2.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerByoSupabaseRoutes } from "./routes/byoSupabase.js";
import { registerByoOauthRoutes } from "./routes/byoOauth.js";
import { registerTokenRoutes } from "./routes/tokens.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerEventImageRoutes } from "./routes/eventImages.js";
import { registerCrmRpcRoutes } from "./routes/crmRpc.js";
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
import { registerAdminIdeaRoutes } from "./routes/adminIdeas.js";
import { registerInternalMetricsRoutes } from "./routes/internalMetrics.js";
import { requestMetrics } from "./middleware/requestMetrics.js";
import { captureError } from "./observability.js";
import { getFrontendUrl } from "./lib/urls.js";

import { reminder24hEmail } from "./emails/signupConfirmation.js";
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

registerHostSpaceRoutes(app);

registerGuestRoutes(app);

registerCrmPeopleRoutes(app);

registerPlannerRoutes(app);

registerCrmViewRoutes(app);

registerPaymentRoutes(app);

// Transaction layer (rail-agnostic checkout + metered-motion billing) — every
// endpoint is inert until PAYMENTS_V2_ENABLED / BILLING_METERING_ENABLED flip.
registerPaymentsV2Routes(app);

registerBillingRoutes(app);

// BYO-Supabase (creator owns their data) — connect/status/disconnect spine.
// Inert until BYO_SUPABASE_ENABLED flips.
registerByoSupabaseRoutes(app);

// BYO keyless connect (Supabase OAuth) — inert until the OAuth app is configured.
registerByoOauthRoutes(app);

registerTokenRoutes(app);

registerProfileRoutes(app);

registerEventImageRoutes(app);

registerCrmRpcRoutes(app);

registerMediaLinkRoutes(app);

registerEventMediaRoutes(app);

registerProfileMediaRoutes(app);

registerNewsletterRoutes(app);

registerIdeaRoutes(app);

registerAdminAnalyticsOverviewRoutes(app);

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

registerAdminIdeaRoutes(app);

registerInternalMetricsRoutes(app);

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
        .select("id, title, slug, starts_at, timezone, location, cover_image_url, image_url, host_id, brand")
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
            people:person_id ( id, name, email, phone_e164, phone_verified_at )
          `)
          .eq("event_id", event.id)
          .eq("booking_status", "CONFIRMED");

        if (rsvpErr) {
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
          const reminderHtml = reminder24hEmail({
            name: person.name || "there",
            eventTitle: event.title,
            startsAt: event.starts_at,
            timezone: event.timezone || "",
            imageUrl: resolvedImageUrl,
            location: event.location || "",
            locationLat: event.location_lat ?? null,
            locationLng: event.location_lng ?? null,
            slug: event.slug || "",
            frontendUrl: frontendBase,
            unsubscribeUrl,
            hideDate: event.hide_date || false,
            hideLocation: event.hide_location || false,
            dateRevealHint: event.date_reveal_hint || "",
            revealHint: event.reveal_hint || "",
            ...hostBrand,
            brand: event.brand
              ? {
                  background:   event.brand.backgroundColor || null,
                  primaryColor: event.brand.buttonColor || null,
                }
              : {},
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
                subject: `"${event.title}" is tomorrow!`,
                htmlBody: reminderHtml,
                category: "transactional",
              },
              context: {
                personId: person.id,
                hostProfileId: event.host_id,
                idempotencyKey,
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
});
