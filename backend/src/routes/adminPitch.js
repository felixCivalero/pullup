// Share links for pitches (mig 160). A pitch lives in the frontend
// (pitch/<slug>.jsx); a link is a random token that opens it at
// pullup.se/s/<token> without signing in, until it expires or is closed.
//   POST   /admin/pitch-links          { slug, prospectId?, days? } → { token, expiresAt }
//   GET    /admin/pitch-links          → { links: [...] } (open and closed, newest first)
//   DELETE /admin/pitch-links/:token   → closes it now
//   GET    /pitch-links/:token         (public) → { slug, expiresAt } or 404; counts the view
import crypto from "crypto";
import { requireOwner } from "../middleware/requireOwner.js";
import { supabase } from "../supabase.js";

const SLUG = /^[a-z0-9-]{1,60}$/;
const TOKEN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_DAYS = 90;

const shape = (r) => ({
  token: r.token,
  slug: r.slug,
  prospectId: r.prospect_id,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  views: r.views,
  lastViewedAt: r.last_viewed_at,
});

export function registerAdminPitchRoutes(app) {
  app.post("/admin/pitch-links", requireOwner, async (req, res) => {
    const { slug, prospectId } = req.body || {};
    const days = Math.min(MAX_DAYS, Math.max(1, Math.round(Number(req.body?.days) || 7)));
    if (!SLUG.test(String(slug || ""))) return res.status(400).json({ error: "bad_slug" });
    try {
      const token = crypto.randomBytes(12).toString("base64url");
      const expiresAt = new Date(Date.now() + days * 864e5).toISOString();
      const { data, error } = await supabase
        .from("pitch_links")
        .insert({ token, slug, prospect_id: prospectId ? String(prospectId).slice(0, 20) : null, expires_at: expiresAt })
        .select()
        .single();
      if (error) throw error;
      return res.json(shape(data));
    } catch (err) {
      console.error("[admin/pitch-links] create:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  app.get("/admin/pitch-links", requireOwner, async (req, res) => {
    try {
      const { data, error } = await supabase.from("pitch_links").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return res.json({ links: (data || []).map(shape) });
    } catch (err) {
      console.error("[admin/pitch-links] list:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  app.delete("/admin/pitch-links/:token", requireOwner, async (req, res) => {
    if (!TOKEN.test(req.params.token)) return res.status(400).json({ error: "bad_token" });
    try {
      const { error } = await supabase.from("pitch_links").update({ revoked_at: new Date().toISOString() }).eq("token", req.params.token).is("revoked_at", null);
      if (error) throw error;
      return res.json({ ok: true });
    } catch (err) {
      console.error("[admin/pitch-links] close:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // Public: the token is the key. Same answer for unknown, expired and closed.
  app.get("/pitch-links/:token", async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex");
    if (!TOKEN.test(req.params.token)) return res.status(404).json({ error: "not_found" });
    try {
      const { data, error } = await supabase.from("pitch_links").select("*").eq("token", req.params.token).maybeSingle();
      if (error) throw error;
      if (!data || data.revoked_at || new Date(data.expires_at) <= new Date()) return res.status(404).json({ error: "not_found" });
      await supabase.from("pitch_links").update({ views: (data.views || 0) + 1, last_viewed_at: new Date().toISOString() }).eq("token", data.token);
      return res.json({ slug: data.slug, expiresAt: data.expires_at });
    } catch (err) {
      console.error("[pitch-links] open:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
}
