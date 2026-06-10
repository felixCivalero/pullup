// Comms routes — host comms settings (Settings → Comms studio), Instagram
// comment→DM rules, and per-event comment→DM triggers (the Auto-DM page).

import { getUserProfile } from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import { getFrontendUrl } from "../lib/urls.js";

export function registerCommsRoutes(app) {
  // ─────────────────────────────────────────────────────────────────────────
  // COMMS STUDIO — preview + customize every automatic send-out, and the
  // Instagram automated-DM (comment→DM) flows. Powers Settings → Comms.
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/host/comms", requireAuth, async (req, res) => {
    try {
      const { renderComms } = await import("../services/commsCatalog.js");
      const { supabase } = await import("../supabase.js");
      const profile = await getUserProfile(req.user.id).catch(() => ({}));
      const { data: row } = await supabase
        .from("profiles").select("comms_overrides").eq("id", req.user.id).maybeSingle();
      const messages = renderComms({
        hostProfile: profile,
        overrides: row?.comms_overrides || {},
        frontendUrl: getFrontendUrl(),
      });
      res.json({
        messages,
        signature: profile?.whatsappSignature || profile?.whatsapp_signature || "",
        whatsappEnabled: profile?.whatsappEnabled ?? profile?.whatsapp_enabled ?? true,
      });
    } catch (e) {
      console.error("[host/comms:get]", e.message);
      res.status(500).json({ error: "failed" });
    }
  });

  app.put("/host/comms", requireAuth, async (req, res) => {
    try {
      const { overrides, signature } = req.body || {};
      const { supabase } = await import("../supabase.js");
      const patch = {};
      if (overrides && typeof overrides === "object") patch.comms_overrides = overrides;
      if (typeof signature === "string") patch.whatsapp_signature = signature.slice(0, 120);
      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        const { error } = await supabase.from("profiles").update(patch).eq("id", req.user.id);
        if (error) throw error;
      }
      res.json({ ok: true });
    } catch (e) {
      console.error("[host/comms:put]", e.message);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });

  // Send a test of one message to the host themselves (email rail).
  app.post("/host/comms/test", requireAuth, async (req, res) => {
    try {
      const { messageKey } = req.body || {};
      const { renderComms } = await import("../services/commsCatalog.js");
      const { supabase } = await import("../supabase.js");
      const profile = await getUserProfile(req.user.id).catch(() => ({}));
      const { data: row } = await supabase
        .from("profiles").select("comms_overrides").eq("id", req.user.id).maybeSingle();
      const messages = renderComms({
        hostProfile: profile, overrides: row?.comms_overrides || {}, frontendUrl: getFrontendUrl(),
      });
      const msg = messages.find((m) => m.key === messageKey);
      if (!msg) return res.status(400).json({ ok: false, error: "unknown_message" });
      const to = profile?.contactEmail || profile?.contact_email || req.user.email;
      if (!to) return res.status(400).json({ ok: false, error: "no_email_on_file" });
      const { sendEmail } = await import("../services/emailService.js");
      await sendEmail({ to, subject: `[Test] ${msg.email.subject}`, html: msg.email.html });
      res.json({ ok: true, sentTo: to });
    } catch (e) {
      console.error("[host/comms/test]", e.message);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });

  // Instagram automated DMs — the comment→DM rules (keyword → event → reply).
  app.get("/host/instagram/comment-rules", requireAuth, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { data } = await supabase
        .from("instagram_connections")
        .select("id, ig_username, is_default, comment_rules")
        .eq("host_profile_id", req.user.id)
        .eq("status", "connected")
        .order("is_default", { ascending: false });
      res.json({
        accounts: (data || []).map((c) => ({
          id: c.id, username: c.ig_username, isDefault: !!c.is_default, rules: c.comment_rules || [],
        })),
      });
    } catch (e) {
      console.error("[ig/comment-rules:get]", e.message);
      res.status(500).json({ error: "failed" });
    }
  });

  app.put("/host/instagram/comment-rules", requireAuth, async (req, res) => {
    try {
      const { rules } = req.body || {};
      if (!Array.isArray(rules)) return res.status(400).json({ ok: false, error: "rules_must_be_array" });
      // Sanitize each rule to the known shape.
      const clean = rules.slice(0, 50).map((r) => ({
        id: String(r.id || "").slice(0, 64) || Math.random().toString(36).slice(2, 10),
        keyword: String(r.keyword || "").slice(0, 80),
        match: r.match === "exact" ? "exact" : "contains",
        media_id: r.media_id ? String(r.media_id).slice(0, 64) : null,
        event_slug: String(r.event_slug || "").slice(0, 120),
        reply_text: String(r.reply_text || "").slice(0, 900),
        enabled: r.enabled !== false,
      })).filter((r) => r.keyword && r.event_slug);
      const { setCommentRules } = await import("../instagram/repos/instagramConnectionsRepo.js");
      await setCommentRules(req.user.id, clean);
      res.json({ ok: true, rules: clean });
    } catch (e) {
      console.error("[ig/comment-rules:put]", e.message);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PER-EVENT Instagram comment→DM triggers (migration 068) — the Auto-DM page.
  // Each trigger is anchored to an event and fires only while that event hasn't
  // ended (expiry computed in the repo). Keyword uniqueness is enforced among
  // LIVE triggers, so a keyword frees itself up once its event passes. Supersedes
  // the global comment-rules model above.
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/host/comment-triggers", requireAuth, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const repo = await import("../instagram/repos/eventCommentTriggersRepo.js");
      const { data: conns } = await supabase
        .from("instagram_connections")
        .select("ig_username, is_default")
        .eq("host_profile_id", req.user.id)
        .eq("status", "connected")
        .order("is_default", { ascending: false });
      const account = conns?.[0] || null;
      const [triggers, events] = await Promise.all([
        repo.listTriggersForHost(req.user.id),
        repo.getEligibleEventsForHost(req.user.id),
      ]);
      res.json({
        ok: true,
        igConnected: !!account,
        account: account ? { username: account.ig_username } : null,
        triggers,
        events,
      });
    } catch (e) {
      console.error("[comment-triggers:get]", e.message);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });

  app.post("/host/comment-triggers", requireAuth, async (req, res) => {
    try {
      const { eventId, keyword, match, replyText, mediaId, triggerType, flow } = req.body || {};
      const TYPES = new Set(["comment", "rsvp_success", "dm_keyword"]);
      const type = TYPES.has(triggerType) ? triggerType : "comment";
      const { normalizeFlow } = await import("../instagram/conversationFlows.js");
      const normalizedFlow = type === "comment" ? normalizeFlow(flow) : null;
      const isRsvp = type === "rsvp_success";
      const isKeyword = type === "comment" || type === "dm_keyword";
      const kw = String(keyword || "").trim();
      if (!eventId) {
        return res.status(400).json({ ok: false, error: "event_required" });
      }
      // Keyword triggers (comment / dm_keyword) need a keyword; RSVP fires on the RSVP itself.
      if (isKeyword && !kw) {
        return res.status(400).json({ ok: false, error: "event_and_keyword_required" });
      }
      const { supabase } = await import("../supabase.js");
      const { data: ev } = await supabase
        .from("events")
        .select("id, host_id")
        .eq("id", eventId)
        .maybeSingle();
      if (!ev || ev.host_id !== req.user.id) {
        return res.status(404).json({ ok: false, error: "event_not_found" });
      }
      const repo = await import("../instagram/repos/eventCommentTriggersRepo.js");
      if (isKeyword) {
        // Uniqueness is per-surface: a comment keyword and a DM keyword may share text.
        const conflict = await repo.findLiveKeywordConflict(req.user.id, kw, null, { type });
        if (conflict) {
          return res.status(409).json({ ok: false, error: "keyword_conflict", conflict });
        }
      }
      let trigger;
      try {
        trigger = await repo.createTrigger({
          eventId,
          hostProfileId: req.user.id,
          triggerType: type,
          keyword: kw,
          match,
          replyText,
          mediaId,
          flow: normalizedFlow,
        });
      } catch (insErr) {
        // The partial unique index (one rsvp_success per event) surfaces here.
        if (isRsvp && insErr?.code === "23505") {
          return res.status(409).json({ ok: false, error: "rsvp_trigger_exists" });
        }
        throw insErr;
      }
      res.json({ ok: true, trigger });
    } catch (e) {
      console.error("[comment-triggers:post]", e.message);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });

  app.patch("/host/comment-triggers/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { keyword, match, replyText, enabled, mediaId, flow } = req.body || {};
      const repo = await import("../instagram/repos/eventCommentTriggersRepo.js");
      const existing = await repo.getTriggerById(id, req.user.id);
      if (!existing) return res.status(404).json({ ok: false, error: "not_found" });
      // Re-check live uniqueness when the trigger will be enabled (keyword may
      // change). Scope to this trigger's own surface — RSVP triggers have no
      // keyword, so they skip the check entirely.
      const nextKeyword = keyword !== undefined ? String(keyword).trim() : existing.keyword;
      const willEnable = enabled !== undefined ? enabled !== false : existing.enabled;
      const isKeyword = existing.triggerType === "comment" || existing.triggerType === "dm_keyword";
      if (willEnable && isKeyword && nextKeyword) {
        const conflict = await repo.findLiveKeywordConflict(req.user.id, nextKeyword, id, { type: existing.triggerType });
        if (conflict) return res.status(409).json({ ok: false, error: "keyword_conflict", conflict });
      }
      // Only a comment trigger carries a flow. `flow: null` explicitly clears it
      // (revert to immediate-link); omitting it leaves the existing flow untouched.
      let flowPatch;
      if (flow !== undefined && existing.triggerType === "comment") {
        const { normalizeFlow } = await import("../instagram/conversationFlows.js");
        flowPatch = normalizeFlow(flow);
      }
      const trigger = await repo.updateTrigger(id, req.user.id, {
        keyword,
        match,
        replyText,
        enabled,
        mediaId,
        ...(flowPatch !== undefined ? { flow: flowPatch } : {}),
      });
      res.json({ ok: true, trigger });
    } catch (e) {
      console.error("[comment-triggers:patch]", e.message);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });

  app.delete("/host/comment-triggers/:id", requireAuth, async (req, res) => {
    try {
      const repo = await import("../instagram/repos/eventCommentTriggersRepo.js");
      await repo.deleteTrigger(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (e) {
      console.error("[comment-triggers:delete]", e.message);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });
}
