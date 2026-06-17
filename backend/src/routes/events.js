// Event routes: public event page payload (slug → JSON or crawler OG HTML), view tracking,
// waitlist/VIP offer token validation, and authenticated POST /events creation.
import {
  createEvent,
  findEventBySlug,
  findEventById,
  updateEvent,
  pickEventFields,
  getEventCounts,
  getCocktailsOnlyCount,
  findRsvpById,
  getUserEventIds,
  findPersonById,
  findVipInviteById,
} from "../data.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { processHostedByLogos } from "../services/hostedByLogos.js";
import { isCrawler, generateOgHtmlForEvent } from "../lib/og.js";
import { logger } from "../logger.js";
import { verifyWaitlistToken } from "../utils/waitlistTokens.js";
import { emitIntent, sourceFromRequest } from "../services/intentLog.js";

export function registerEventRoutes(app) {
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

      const { supabase: sb } = await import("../supabase.js");

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
      // Digital-product delivery: derive a SAFE summary (what forms exist, the
      // public external link) and never leak the secrets (download path, secret
      // value, protected body). Hosts keep the full `fulfillment` for the editor.
      const f = event.fulfillment && typeof event.fulfillment === "object" ? event.fulfillment : null;
      publicEvent.productDelivery = f
        ? {
            hasDownload: !!f.download?.enabled,
            secretKind: f.secret?.enabled ? (f.secret.kind || "link") : null,
            unlock: f.unlock?.enabled ? { title: f.unlock.title || "Members-only" } : null,
            external: f.external?.enabled && f.external.url ? { url: f.external.url } : null,
          }
        : null;
      if (!isHost) {
        delete publicEvent.fulfillment;
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

      // Host identity for the event page in one round-trip. Host-customizable
      // visual theming was removed — the only surviving custom visual is the
      // generative AI hero `scene` (events.scene), exposed verbatim above via
      // publicEvent. Identity (hostName / signature) is read live from the
      // profile (the host's current name/voice, not a snapshot).
      let hostIdentity = { hostName: null, signature: null };
      if (event.hostId) {
        try {
          // The GET handler never declared a supabase client (the `sb` at the top
          // of POST /events/:slug/view is a different scope) — so this lookup was
          // throwing "sb is not defined" and silently dropping host name/voice on
          // every event page. Import it here.
          const { supabase: sb } = await import("../supabase.js");
          const { data: hostProfile } = await sb
            .from("profiles")
            .select("name, brand, whatsapp_signature")
            .eq("id", event.hostId)
            .maybeSingle();
          if (hostProfile) {
            hostIdentity.hostName  = hostProfile.name || hostProfile.brand || null;
            // Voice carrier (already used elsewhere; exposed here too so
            // event-page hero can lead with "Hosted by …" naturally).
            hostIdentity.signature = hostProfile.whatsapp_signature || null;
          }
        } catch (identityErr) {
          // Identity lookup never blocks event rendering.
          console.warn("[events/:slug] host identity lookup failed", identityErr?.message);
        }
      }

      res.json({
        ...publicEvent,
        hostName: hostIdentity.hostName,
        signature: hostIdentity.signature,
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
    // Only what this route's own logic needs. Every other event field is
    // forwarded verbatim via pickEventFields (the shared allowlist) — so a new
    // field never has to be added here. createdVia/status are lifecycle fields
    // the route sets explicitly.
    // sections/ticketType are read again below (hostedby logo upload + the
    // paid-tickets-paused rollback guard) — they must stay in this destructure.
    const { title, startsAt, endsAt, hideDate, createdVia, status, sections, ticketType, kind } = req.body;

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

    // Create the event first to get its ID (with host_id from authenticated user).
    // All content fields flow through the shared allowlist; the route only pins
    // host + lifecycle. createEvent applies its own per-field defaults/coercion.
    const _createEventBody = req.body;
    let event;
    try {
      event = await createEvent({
        hostId: req.user.id,
        ...pickEventFields(req.body),
        // Page kind is route-controlled at creation only (never editable after —
        // deliberately absent from EDITABLE_EVENT_FIELDS). createEvent validates
        // it against the kind allowlist and defaults to "event".
        ...(kind ? { kind } : {}),
        createdVia: createdVia || "legacy",
        status: status || "PUBLISHED",
      });
    } catch (err) {
      console.error("[POST /events] createEvent failed:", err.message);
      const status = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
      return res.status(status).json({
        error: status === 400 ? "invalid_input" : "Failed to create event",
        message: err.message,
      });
    }

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

    // Paid tickets are PAUSED (money-hole guard): never mint a Stripe product via
    // the API/MCP create path. The event was just created — if it came in paid,
    // roll it back to free so no guest can pay into an un-set-up account. (The few
    // events that took real payments before the pause aren't created through here,
    // so they keep their Stripe config untouched.)
    // PAYMENTS V2 lifts the pause: the rail-agnostic checkout has its own
    // no-rails 503 guard at RSVP time, so a paid event can never silently
    // confirm unpaid — the exact condition this pause existed to prevent.
    const { paymentsV2Enabled } = await import("../config/billing.js");
    if (ticketType === "paid" && !paymentsV2Enabled()) {
      const freed = await updateEvent(event.id, { ticketType: "free", ticketPrice: null });
      logger?.warn?.("[POST /events] paid tickets paused — coerced new event to free", { eventId: event.id });
      res.status(201).json(freed || { ...event, ticketType: "free", ticketPrice: null });
      return;
    }

    res.status(201).json(event);
  });
}
