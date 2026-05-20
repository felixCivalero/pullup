// HostBar widget endpoints.
//
// The widget is the floating pill that appears on /e/:slug (and the
// campaign preview page) when the URL carries ?pv=<jwt>. It shows the
// host a [Publish] / [Send] / [Back to chat] surface without making them
// flip back to their MCP client.
//
// GET  /widget/config?token=<jwt>
//   Token-only. Returns the widget's display state — which buttons to
//   render, what the current published/draft/sent state is. Anyone with
//   the link can fetch this; the response intentionally carries no PII.
//
// POST /widget/action
//   Body: { token, action, payload? }
//   Requires token AND a host session. Actions: publish, unpublish, send.
//   The token's hostId MUST match the session user id — otherwise a
//   leaked link couldn't be used to act on someone else's account, but
//   could be used to fire actions if the recipient is themselves a host.

import { Router } from "express";
import { requireAuth } from "./middleware/auth.js";
import {
  verifyPreviewToken,
  tokenAllows,
  PREVIEW_SCOPE_EVENT,
  PREVIEW_SCOPE_CAMPAIGN,
} from "./utils/previewTokens.js";
import {
  findEventById,
  updateEvent,
  canEditEvent,
  getEmailCampaign,
} from "./data.js";
import { supabase } from "./supabase.js";
import { sendCampaignInBatches } from "./services/campaignSender.js";

const router = Router();

// ── Config ──────────────────────────────────────────────────────────
router.get("/widget/config", async (req, res) => {
  const token = (req.query?.token || "").toString();
  let payload;
  try {
    payload = verifyPreviewToken(token);
  } catch (err) {
    return res.status(401).json({ ok: false, error: err.message });
  }

  if (payload.scope === PREVIEW_SCOPE_EVENT) {
    const event = await findEventById(payload.resourceId);
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });
    // hasCover lets the widget decide whether to nudge for a cover upload.
    // We check the legacy single-image columns AND look for any attached
    // media — same logic the page uses to decide what to render.
    let hasCover = !!(event.imageUrl || event.coverImageUrl);
    if (!hasCover) {
      try {
        const { count } = await supabase
          .from("event_media")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id);
        hasCover = (count || 0) > 0;
      } catch { /* non-fatal */ }
    }
    return res.json({
      ok: true,
      scope: payload.scope,
      capabilities: payload.capabilities || [],
      resource: {
        kind: "event",
        id: event.id,
        slug: event.slug,
        title: event.title,
        status: event.status,
        hasCover,
      },
    });
  }

  if (payload.scope === PREVIEW_SCOPE_CAMPAIGN) {
    // Config is token-only; intentionally do NOT cross-check user_id here
    // (the JWT already named the host, and the response carries nothing
    // a non-owner couldn't already see from the campaign preview page).
    const { data: camp, error } = await supabase
      .from("campaign_campaigns")
      .select("id, subject, status, total_recipients, total_sent")
      .eq("id", payload.resourceId)
      .maybeSingle();
    if (error || !camp) {
      return res.status(404).json({ ok: false, error: "campaign_not_found" });
    }
    return res.json({
      ok: true,
      scope: payload.scope,
      capabilities: payload.capabilities || [],
      resource: {
        kind: "campaign",
        id: camp.id,
        subject: camp.subject,
        status: camp.status,
        totalRecipients: camp.total_recipients,
        sentCount: camp.total_sent,
      },
    });
  }

  return res.status(400).json({ ok: false, error: "unknown_scope" });
});

// ── Action ──────────────────────────────────────────────────────────
router.post("/widget/action", requireAuth, async (req, res) => {
  const { token, action, payload: actionPayload } = req.body || {};
  let claims;
  try {
    claims = verifyPreviewToken(token);
  } catch (err) {
    return res.status(401).json({ ok: false, error: err.message });
  }

  // The token names a host. Anyone signed in is *some* host — only the
  // named one can act.
  if (claims.hostId !== req.user?.id) {
    return res.status(403).json({ ok: false, error: "wrong_host" });
  }

  // ── Event actions ───────────────────────────────────────────────
  if (claims.scope === PREVIEW_SCOPE_EVENT) {
    const event = await findEventById(claims.resourceId);
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

    // Authorization belt-and-suspenders: the token says the user can act
    // on this event, but verify again against the live ownership table —
    // hosts may have been removed since the token was minted.
    const allowed = await canEditEvent(req.user.id, event.id);
    if (!allowed) return res.status(403).json({ ok: false, error: "not_owner" });

    if (action === "publish") {
      if (!tokenAllows(claims, "publish")) {
        return res.status(403).json({ ok: false, error: "capability_missing" });
      }
      const updated = await updateEvent(event.id, { status: "PUBLISHED" });
      return res.json({ ok: true, status: updated?.status || "PUBLISHED" });
    }
    if (action === "unpublish") {
      if (!tokenAllows(claims, "unpublish")) {
        return res.status(403).json({ ok: false, error: "capability_missing" });
      }
      const updated = await updateEvent(event.id, { status: "DRAFT" });
      return res.json({ ok: true, status: updated?.status || "DRAFT" });
    }
    return res.status(400).json({ ok: false, error: "unknown_action" });
  }

  // ── Campaign actions ────────────────────────────────────────────
  if (claims.scope === PREVIEW_SCOPE_CAMPAIGN) {
    if (action !== "send") {
      return res.status(400).json({ ok: false, error: "unknown_action" });
    }
    if (!tokenAllows(claims, "send")) {
      return res.status(403).json({ ok: false, error: "capability_missing" });
    }
    // getEmailCampaign already enforces ownership: returns null when the
    // campaign doesn't belong to the signed-in user.
    const camp = await getEmailCampaign(claims.resourceId, req.user.id);
    if (!camp) return res.status(404).json({ ok: false, error: "campaign_not_found" });
    if ((camp.status || "").toLowerCase() === "sent") {
      return res.status(409).json({ ok: false, error: "already_sent" });
    }
    // Fire-and-forget: the batcher updates status as it progresses; the
    // widget polls /widget/config to see the new state.
    sendCampaignInBatches(camp.id, req.user.id).catch((err) => {
      console.error("[widget] campaign send failed:", err);
    });
    return res.json({ ok: true, status: "sending" });
  }

  return res.status(400).json({ ok: false, error: "unknown_scope" });
});

export default router;
