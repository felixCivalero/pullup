// Admin identity-match cockpit — grade every person's cross-channel fusion
// (hard-verified → soft-claim → collision) with confirm / edit / split / merge tools.

import { requireAdmin } from "../middleware/auth.js";

export function registerAdminMatchRoutes(app) {
  // Admin-only people search — powers the "View as" user picker. requireAdmin
  // gates it; the query is sanitized before going into the PostgREST filter.
  app.get("/admin/people-search", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const q = (req.query.q || "").toString().replace(/[^a-zA-Z0-9 @._-]/g, "").trim().slice(0, 60);
      let query = supabase.from("people").select("id, name, email, auth_user_id").order("name").limit(25);
      if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
      const { data } = await query;
      res.json({
        // authUserId (the account behind the person) is what "Act as" needs to
        // mint a session; person id stays for the room-lens navigate.
        people: (data || []).map((p) => ({ id: p.id, name: p.name || p.email || "Someone", email: p.email, hasAccount: !!p.auth_user_id, authUserId: p.auth_user_id || null })),
      });
    } catch (err) {
      console.error("[admin-people-search] error:", err.message);
      res.status(500).json({ error: "search_failed" });
    }
  });

  // ── ADMIN MATCH REVIEW COCKPIT ──────────────────────────────────────
  // Full visibility over how every person was fused across IG / WhatsApp / email /
  // PullUp, graded hard-verified → soft-claim → collision, with confirm / edit /
  // split / merge tools. All actions audited in match_reviews (mig 066).
  // See services/adminMatching.js + [[project_external_data_system]].

  // The ledger — every person, confidence-sorted, search + filter.
  app.get("/admin/matches", requireAdmin, async (req, res) => {
    try {
      const { listMatches } = await import("../services/adminMatching.js");
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const result = await listMatches({
        q: (req.query.q || "").toString().slice(0, 80),
        filter: (req.query.filter || "all").toString(),
        limit, offset,
      });
      res.json(result);
    } catch (err) {
      console.error("[admin-matches] list error:", err.message);
      res.status(500).json({ error: "matches_failed" });
    }
  });

  // Full detail for one person — every parameter on every side.
  app.get("/admin/matches/:personId", requireAdmin, async (req, res) => {
    try {
      const { getMatchDetail } = await import("../services/adminMatching.js");
      const detail = await getMatchDetail(req.params.personId);
      if (!detail) return res.status(404).json({ error: "not_found" });
      res.json(detail);
    } catch (err) {
      console.error("[admin-matches] detail error:", err.message);
      res.status(500).json({ error: "detail_failed" });
    }
  });

  // Confirm: admin signed off on this person's links.
  app.post("/admin/matches/:personId/confirm", requireAdmin, async (req, res) => {
    try {
      const { confirmLinks } = await import("../services/adminMatching.js");
      res.json(await confirmLinks(req.params.personId, req.user.id));
    } catch (err) {
      console.error("[admin-matches] confirm error:", err.message);
      res.status(500).json({ error: "confirm_failed", message: err.message });
    }
  });

  // Edit canonical params (name, instagram, email, phone, tiktok, twitter).
  app.patch("/admin/matches/:personId/params", requireAdmin, async (req, res) => {
    try {
      const { editParams } = await import("../services/adminMatching.js");
      res.json(await editParams(req.params.personId, req.body || {}, req.user.id));
    } catch (err) {
      console.error("[admin-matches] edit error:", err.message);
      res.status(500).json({ error: "edit_failed", message: err.message });
    }
  });

  // Split one identifier off onto a fresh person (undo a wrong claim).
  app.post("/admin/matches/:personId/split", requireAdmin, async (req, res) => {
    try {
      const { splitIdentity } = await import("../services/adminMatching.js");
      const { identityId } = req.body || {};
      if (!identityId) return res.status(400).json({ error: "identityId required" });
      res.json(await splitIdentity(identityId, req.user.id));
    } catch (err) {
      console.error("[admin-matches] split error:", err.message);
      res.status(400).json({ error: "split_failed", message: err.message });
    }
  });

  // Merge two people (canonical absorbs merged). Atomic + audited in DB.
  app.post("/admin/matches/merge", requireAdmin, async (req, res) => {
    try {
      const { mergePeople } = await import("../services/adminMatching.js");
      const { canonicalId, mergedId, candidateId } = req.body || {};
      res.json(await mergePeople({ canonicalId, mergedId, candidateId: candidateId || null, actorId: req.user.id }));
    } catch (err) {
      console.error("[admin-matches] merge error:", err.message);
      res.status(400).json({ error: "merge_failed", message: err.message });
    }
  });

  // Reject a collision suggestion — not the same human.
  app.post("/admin/match-candidates/:id/reject", requireAdmin, async (req, res) => {
    try {
      const { rejectCandidate } = await import("../services/adminMatching.js");
      res.json(await rejectCandidate(req.params.id, req.user.id));
    } catch (err) {
      console.error("[admin-matches] reject error:", err.message);
      res.status(500).json({ error: "reject_failed", message: err.message });
    }
  });
}
