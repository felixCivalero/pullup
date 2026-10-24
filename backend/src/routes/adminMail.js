// The mail module's helpers (owner only), restored with the composer
// (frontend components/crm/*, removed 2026-06-02 in b34e7b50):
//   GET  /admin/mail/event-options?source=pullup|discover  events for the
//        event-card block (PullUp events, or Stockholm events from the scraper)
//   GET  /admin/mail/event-images   covers from events, for the image picker
//   POST /admin/mail/images         upload an image for an image block
// Sending goes through POST /admin/sends (routes/adminEvents.js).
import crypto from "crypto";
import express from "express";
import { requireOwner } from "../middleware/requireOwner.js";
import { supabase } from "../supabase.js";
import { getFrontendUrl } from "../lib/urls.js";
import { EVENT_IMAGE_BUCKET, imageUrl } from "../lib/eventPlatform.js";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// Magic bytes, so a renamed file can't pass as an image.
const SIGNATURES = [
  { mime: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", ext: "gif", test: (b) => b.slice(0, 3).toString("ascii") === "GIF" },
  { mime: "image/webp", ext: "webp", test: (b) => b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP" },
];

// The upload carries the image as a data URL, bigger than the API's 1 MB
// JSON limit; index.js mounts this parser for the path before the global one.
export const mailImageBodyParser = express.json({ limit: "4mb" });

// The old event editor kept Spotify links and "hosted by" in typed sections.
function fromSections(sections) {
  let spotify = null;
  let hostedBy = null;
  for (const s of Array.isArray(sections) ? sections : []) {
    if (!s || typeof s !== "object") continue;
    if (s.type === "spotify" && typeof s.url === "string") spotify = spotify || s.url;
    if (s.type === "socials" && typeof s.spotify === "string" && s.spotify.trim()) spotify = spotify || s.spotify;
    if (s.type === "hostedby" && typeof s.name === "string" && s.name.trim()) hostedBy = hostedBy || s.name.trim();
  }
  return { spotify, hostedBy };
}

export function registerAdminMailRoutes(app) {
  app.get("/admin/mail/event-options", requireOwner, async (req, res) => {
    try {
      const source = req.query.source === "discover" ? "discover" : "pullup";
      const search = String(req.query.q || "").trim().toLowerCase();
      const matches = (title) => !search || String(title || "").toLowerCase().includes(search);

      if (source === "discover") {
        const { data, error } = await supabase
          .from("stockholm_events")
          .select("id, title, image_url, starts_at, location, url, spotify_url, category, source")
          .order("starts_at", { ascending: false })
          .limit(300);
        if (error) throw error;
        return res.json({
          events: (data || []).filter((e) => matches(e.title)).map((e) => ({
            id: e.id,
            title: e.title || "Untitled",
            imageUrl: e.image_url || null,
            startsAt: e.starts_at || null,
            location: e.location || null,
            url: e.url || null,
            spotifyUrl: e.spotify_url || null,
            tags: e.category ? [String(e.category).toLowerCase()] : [],
            hostedBy: e.source || null,
            source: "discover",
          })),
        });
      }

      const { data, error } = await supabase
        .from("events")
        .select("id, slug, title, cover_image_url, image_url, starts_at, location, spotify, admin_tags, host_id, sections, kind")
        .or("kind.is.null,kind.eq.event")
        .order("starts_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const hostIds = [...new Set((data || []).map((e) => e.host_id).filter(Boolean))];
      const hosts = new Map();
      if (hostIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, name, brand").in("id", hostIds);
        for (const p of profiles || []) hosts.set(p.id, p.brand || p.name || null);
      }
      const base = getFrontendUrl();
      return res.json({
        events: (data || []).filter((e) => matches(e.title)).map((e) => {
          const s = fromSections(e.sections);
          return {
            id: e.id,
            title: e.title || "Untitled",
            imageUrl: imageUrl(e.cover_image_url || e.image_url, process.env.SUPABASE_URL),
            startsAt: e.starts_at || null,
            location: e.location || null,
            url: e.slug ? `${base}/e/${e.slug}` : null,
            spotifyUrl: s.spotify || e.spotify || null,
            tags: Array.isArray(e.admin_tags) ? e.admin_tags : [],
            hostedBy: s.hostedBy || hosts.get(e.host_id) || null,
            source: "pullup",
          };
        }),
      });
    } catch (err) {
      console.error("[admin/mail] event-options:", err?.message);
      return res.status(500).json({ error: "Failed to fetch event options" });
    }
  });

  app.get("/admin/mail/event-images", requireOwner, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("title, cover_image_url, image_url, starts_at")
        .order("starts_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const seen = new Set();
      const items = [];
      for (const e of data || []) {
        const url = imageUrl(e.cover_image_url || e.image_url, process.env.SUPABASE_URL);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        items.push({ url, eventTitle: e.title || "Event", kind: "cover" });
        if (items.length >= 200) break;
      }
      return res.json({ items });
    } catch (err) {
      console.error("[admin/mail] event-images:", err?.message);
      return res.status(500).json({ error: "Failed to load gallery" });
    }
  });

  app.post("/admin/mail/images", requireOwner, async (req, res) => {
    try {
      const m = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(String(req.body?.imageData || ""));
      if (!m) return res.status(400).json({ error: "Image must be a PNG, JPEG, GIF or WebP." });
      const buffer = Buffer.from(m[2], "base64");
      if (buffer.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: "Image must be under 2 MB." });
      const kind = SIGNATURES.find((s) => s.test(buffer));
      if (!kind) return res.status(400).json({ error: "Image must be a PNG, JPEG, GIF or WebP." });
      const path = `mail/${crypto.randomUUID()}.${kind.ext}`;
      const { error } = await supabase.storage.from(EVENT_IMAGE_BUCKET).upload(path, buffer, { contentType: kind.mime, upsert: false });
      if (error) throw error;
      return res.json({ url: imageUrl(path, process.env.SUPABASE_URL) });
    } catch (err) {
      console.error("[admin/mail] image upload:", err?.message);
      return res.status(500).json({ error: "Failed to upload image" });
    }
  });
}
