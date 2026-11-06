// Share links for pitches (mig 160). A pitch lives in the frontend
// (pitch/<slug>.jsx); a link is a random token that opens it at
// pullup.se/s/<token> without signing in, until it expires or is closed.
//   POST   /admin/pitch-links          { slug, prospectId?, days? } → { token, expiresAt }
//   GET    /admin/pitch-links          → { links: [...] } (open and closed, newest first)
//   DELETE /admin/pitch-links/:token   → closes it now
//   GET    /pitch-links/:token         (public) → { slug, expiresAt } or 404; counts the view
//   GET    /share/p/:token             the link people send: link previews (WhatsApp,
//                                      Messages…) get the pitch's own card, people go
//                                      on to /s/<token>. nginx sends /share/* here.
import crypto from "crypto";
import { requireOwner } from "../middleware/requireOwner.js";
import { supabase } from "../supabase.js";
import { getFrontendUrl } from "../lib/urls.js";

const SLUG = /^[a-z0-9-]{1,60}$/;
const TOKEN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_DAYS = 90;
// Link-preview fetchers (they don't run JavaScript). iMessage sends a
// facebookexternalhit/Twitterbot UA.
const PREVIEW_BOT = /facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|slackbot|discordbot|linkedinbot|applebot|skypeuripreview|pinterest|redditbot|embedly|vkshare|snapchat|viber|googlebot|bingbot|google-inspectiontool/i;
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);
// A preview image must be ours: a path on the site.
const sitePath = (v) => (typeof v === "string" && /^\/[A-Za-z0-9/_.?=&-]{1,200}$/.test(v) ? v : null);

function previewHtml({ title, description, image, url }) {
  const site = getFrontendUrl();
  const img = image ? `${site}${image}` : `${site}/og-image.jpg`;
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PullUp">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(img)}">
</head><body><p><a href="${esc(url)}">${esc(title)}</a></p></body></html>`;
}

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
    const { slug, prospectId, share } = req.body || {};
    const days = Math.min(MAX_DAYS, Math.max(1, Math.round(Number(req.body?.days) || 7)));
    if (!SLUG.test(String(slug || ""))) return res.status(400).json({ error: "bad_slug" });
    try {
      const token = crypto.randomBytes(12).toString("base64url");
      const expiresAt = new Date(Date.now() + days * 864e5).toISOString();
      const { data, error } = await supabase
        .from("pitch_links")
        .insert({
          token,
          slug,
          prospect_id: prospectId ? String(prospectId).slice(0, 20) : null,
          expires_at: expiresAt,
          og_title: clip(share?.title, 120),
          og_description: clip(share?.description, 300),
          og_image: sitePath(share?.image),
        })
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

  // The link people send. A preview fetcher gets the pitch's card (a closed or
  // unknown link gets plain PullUp, so it never says which pitch it was);
  // everyone else goes on to the pitch. Previews don't count as views.
  app.get("/share/p/:token", async (req, res) => {
    const token = TOKEN.test(req.params.token) ? req.params.token : null;
    const pitchUrl = `${getFrontendUrl()}/s/${token || "x"}`;
    if (!PREVIEW_BOT.test(String(req.get("user-agent") || ""))) return res.redirect(302, pitchUrl);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "public, max-age=300");
    res.set("X-Robots-Tag", "noindex");
    const shareUrl = `${getFrontendUrl()}/share/p/${token || "x"}`;
    try {
      const { data } = token ? await supabase.from("pitch_links").select("*").eq("token", token).maybeSingle() : { data: null };
      const open = data && !data.revoked_at && new Date(data.expires_at) > new Date();
      if (!open) return res.send(previewHtml({ title: "PullUp", description: "Den här länken är inte öppen längre.", url: shareUrl }));
      return res.send(previewHtml({
        title: data.og_title || "PullUp",
        description: data.og_description || "",
        image: data.og_image,
        url: shareUrl,
      }));
    } catch (err) {
      console.error("[share/p] preview:", err?.message);
      return res.send(previewHtml({ title: "PullUp", description: "", url: shareUrl }));
    }
  });
}
