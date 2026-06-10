// Crawler share pages + OG image proxy + /e/:slug UA-routed event page.
// Public endpoints that serve OG-tagged HTML / a stable JPEG preview image.

import {
  isCrawler,
  generateOgHtmlForEvent,
  pickOgSourceImage,
  toOgPublicImageUrl,
} from "../lib/og.js";
import { getFrontendUrl } from "../lib/urls.js";
import { findEventBySlug } from "../data.js";

export function registerShareRoutes(app) {
  // ---------------------------
  // PUBLIC: Share endpoint - Always returns HTML with OG tags
  // ---------------------------
  app.get("/share/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      console.log(`[Share] Request for slug: ${slug}`);

      const event = await findEventBySlug(slug);

      if (!event) {
        console.log(`[Share] Event not found for slug: ${slug}`);
        return res.status(404).send("Event not found");
      }

      // Forward UTM params through the redirect so tracking works
      const qs = new URLSearchParams(req.query).toString();
      const ogHtml = await generateOgHtmlForEvent(event, "Share", qs, req);
      res.setHeader("Content-Type", "text/html");
      res.send(ogHtml);
    } catch (error) {
      console.error("Error generating share page:", error);
      res.status(500).send("Error generating share page");
    }
  });

  // ---------------------------
  // PUBLIC: OG image proxy — serves a stable, JPEG-only preview image for
  // crawlers. Three reasons we proxy instead of pointing crawlers at Supabase:
  //   1. Content-Type guarantee. Supabase's render service serves image/jpeg
  //      regardless of source format, but the URL extension may be .png/.webp,
  //      which causes downstream confusion. Pinning Content-Type here means
  //      og:image:type=image/jpeg is always truthful → Instagram/Facebook stop
  //      silently dropping the preview.
  //   2. Cache invalidation. We embed event.updatedAt as a ?v= cache-buster on
  //      the og:image URL so reshares of edited events get a fresh preview
  //      without waiting on multi-day crawler caches.
  //   3. Routability. Production nginx forwards /share/* to this backend but
  //      /og/* and /events/* go to the static SPA; hence the URL lives here.
  // ---------------------------
  app.get("/share/og-image/:slug/image.jpg", async (req, res) => {
    const { slug } = req.params;
    const fallback = `${getFrontendUrl()}/og-image.jpg`;

    try {
      const event = await findEventBySlug(slug);
      if (!event) return res.redirect(302, fallback);

      const sourceImage = pickOgSourceImage(event);
      const supabaseUrl = sourceImage
        ? await toOgPublicImageUrl(sourceImage, "OgImage")
        : null;
      if (!supabaseUrl) return res.redirect(302, fallback);

      // ETag based on event.updatedAt + source image path so crawlers can
      // revalidate cheaply. Skip body on If-None-Match match.
      const etagSource = `${event.updatedAt || event.createdAt || ""}:${sourceImage}`;
      const etag = `"${Buffer.from(etagSource).toString("base64").slice(0, 32)}"`;
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }

      const upstream = await fetch(supabaseUrl);
      if (!upstream.ok) {
        console.error(
          `[OgImage] Upstream fetch failed for ${slug}: ${upstream.status}`
        );
        return res.redirect(302, fallback);
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());

      // Hard-pin Content-Type. Cache for a day at the edge but allow revalidation
      // via ETag — `stale-while-revalidate` keeps previews snappy even while we
      // refresh in the background after an edit.
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader(
        "Cache-Control",
        "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800"
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Length", String(buffer.length));
      return res.status(200).send(buffer);
    } catch (error) {
      console.error(`[OgImage] Error for slug ${slug}:`, error);
      return res.redirect(302, fallback);
    }
  });

  // ---------------------------
  // PUBLIC: Event page endpoint - Returns HTML with OG tags
  // This ensures /e/:slug shares show the same rich preview as /share/:slug
  // ---------------------------
  app.get("/e/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      console.log(`[EventPage] Request for slug: ${slug}`);

      const event = await findEventBySlug(slug);

      if (!event) {
        console.log(`[EventPage] Event not found for slug: ${slug}`);
        // For browsers, let frontend handle 404
        // For crawlers, return 404 HTML
        if (isCrawler(req)) {
          return res.status(404).send("Event not found");
        }
        // Redirect browsers to frontend (which will handle 404)
        return res.redirect(`${getFrontendUrl()}/e/${slug}`);
      }

      // Always return OG HTML (crawlers get OG tags, browsers get redirected via meta refresh)
      const qs = new URLSearchParams(req.query).toString();
      const ogHtml = await generateOgHtmlForEvent(event, "EventPage", qs, req);
      res.setHeader("Content-Type", "text/html");
      res.send(ogHtml);
    } catch (error) {
      console.error("Error generating event page OG:", error);
      res.status(500).send("Error generating event page");
    }
  });
}
