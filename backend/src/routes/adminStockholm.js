// Admin → Stockholm: what's on in Stockholm's culture scene. stockholm_events
// CRUD, scrape_sources CRUD, single-URL fetch (OG/JSON-LD extraction) and the
// scraper trigger (scripts/scrape-stockholm-events.js). Owner only.

import { requireOwner as requireAdmin } from "../middleware/requireOwner.js";

// One scrape at a time; the page polls /scrape-status to know when it's done.
const scrapeState = { running: false, startedAt: null, finishedAt: null, exitCode: null };

export function registerAdminStockholmRoutes(app) {
  // GET /admin/stockholm-events — what's on now or coming up (ended events are
  // left out), optionally by status / newsletter. Paged past the 1000-row cap.
  app.get("/admin/stockholm-events", requireAdmin, async (req, res) => {
    try {
      const { status, newsletter } = req.query;
      const { supabase } = await import("../supabase.js");
      const today = new Date().toISOString().slice(0, 10);
      const all = [];
      for (let from = 0; ; from += 1000) {
        let query = supabase
          .from("stockholm_events")
          .select("*")
          .or(`ends_at.gte.${today},and(ends_at.is.null,starts_at.gte.${today}),and(ends_at.is.null,starts_at.is.null)`)
          .order("starts_at", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, from + 999);
        if (status) query = query.eq("status", status);
        if (newsletter === "true") query = query.not("newsletter_sent_at", "is", null);
        const { data, error } = await query;
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      // Running events count as "today", so tonight's gig sorts next to an
      // exhibition that opened last year. Undated ones go last.
      const eff = (e) => (e.starts_at ? (e.starts_at.slice(0, 10) < today ? today : e.starts_at) : "9999");
      all.sort((a, b) => (eff(a) < eff(b) ? -1 : eff(a) > eff(b) ? 1 : 0));
      return res.json(all);
    } catch (err) {
      console.error("[stockholm] list error:", err.message);
      return res.status(500).json({ error: "Failed to fetch stockholm events" });
    }
  });

  // POST /admin/stockholm-events — manually create a single event
  app.post("/admin/stockholm-events", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { title, description, image_url, starts_at, ends_at, location, url, source, category, spotify_url } = req.body;
      if (!title) return res.status(400).json({ error: "title is required" });

      const { data, error } = await supabase
        .from("stockholm_events")
        .upsert({ title, description, image_url, starts_at, ends_at, location, url, source: source || "manual", category: category || "culture", spotify_url: spotify_url || null }, { onConflict: "url", ignoreDuplicates: false })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    } catch (err) {
      console.error("[stockholm] create error:", err.message);
      return res.status(500).json({ error: "Failed to create event" });
    }
  });

  // PATCH /admin/stockholm-events/:id — update status or newsletter flag
  app.patch("/admin/stockholm-events/:id", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { id } = req.params;
      const { status, spotify_url } = req.body;
      const updates = {};
      if (status !== undefined) updates.status = status;
      if (spotify_url !== undefined) updates.spotify_url = spotify_url;

      const { data, error } = await supabase
        .from("stockholm_events")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      return res.json(data);
    } catch (err) {
      console.error("[stockholm] patch error:", err.message);
      return res.status(500).json({ error: "Failed to update stockholm event" });
    }
  });

  // DELETE /admin/stockholm-events/:id — remove an event
  app.delete("/admin/stockholm-events/:id", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { id } = req.params;
      const { error } = await supabase
        .from("stockholm_events")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return res.status(204).send();
    } catch (err) {
      console.error("[stockholm] delete error:", err.message);
      return res.status(500).json({ error: "Failed to delete stockholm event" });
    }
  });

  // =========================================================================
  // Scrape Sources CRUD
  // =========================================================================

  // GET /admin/scrape-sources — list all sources
  app.get("/admin/scrape-sources", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase
        .from("scrape_sources")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return res.json(data);
    } catch (err) {
      console.error("[scrape-sources] list error:", err.message);
      return res.status(500).json({ error: "Failed to list scrape sources" });
    }
  });

  // POST /admin/scrape-sources — add a new source
  app.post("/admin/scrape-sources", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { name, source_key, scrape_url, location, category, strategy, link_selector, image_attr, enabled } = req.body;
      if (!name || !source_key || !scrape_url) {
        return res.status(400).json({ error: "name, source_key, and scrape_url are required" });
      }
      const { data, error } = await supabase
        .from("scrape_sources")
        .insert({
          name,
          source_key,
          scrape_url,
          location: location || "Stockholm",
          category: category || "culture",
          strategy: strategy || "auto",
          link_selector: link_selector || null,
          image_attr: image_attr || null,
          enabled: enabled !== false,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    } catch (err) {
      console.error("[scrape-sources] create error:", err.message);
      return res.status(500).json({ error: err.message || "Failed to create scrape source" });
    }
  });

  // PATCH /admin/scrape-sources/:id — update a source
  app.patch("/admin/scrape-sources/:id", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { id } = req.params;
      const updates = {};
      const allowed = ["name", "source_key", "scrape_url", "location", "category", "strategy", "link_selector", "image_attr", "enabled"];
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: "No valid fields to update" });
      }
      const { data, error } = await supabase
        .from("scrape_sources")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return res.json(data);
    } catch (err) {
      console.error("[scrape-sources] update error:", err.message);
      return res.status(500).json({ error: "Failed to update scrape source" });
    }
  });

  // DELETE /admin/scrape-sources/:id — remove a source
  app.delete("/admin/scrape-sources/:id", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { id } = req.params;
      const { error } = await supabase
        .from("scrape_sources")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return res.status(204).send();
    } catch (err) {
      console.error("[scrape-sources] delete error:", err.message);
      return res.status(500).json({ error: "Failed to delete scrape source" });
    }
  });

  // POST /admin/stockholm-events/fetch-url — scrape a single URL and return event data
  app.post("/admin/stockholm-events/fetch-url", requireAdmin, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "url is required" });

      const { load } = await import("cheerio");

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const $ = load(html);

      // Extract via Open Graph / meta tags first (most reliable)
      const og = (name) =>
        $(`meta[property="og:${name}"]`).attr("content") ||
        $(`meta[name="og:${name}"]`).attr("content") ||
        null;
      const meta = (name) => $(`meta[name="${name}"]`).attr("content") || null;

      // JSON-LD structured data
      let jsonLd = null;
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const parsed = JSON.parse($(el).html());
          if (parsed["@type"] === "Event" || parsed?.["@type"]?.includes?.("Event")) {
            jsonLd = parsed;
          }
        } catch {}
      });

      // __NEXT_DATA__ (Luma, Partiful, etc.)
      let nextData = null;
      try {
        const raw = $("#__NEXT_DATA__").text();
        if (raw) nextData = JSON.parse(raw);
      } catch {}

      const title =
        og("title") ||
        jsonLd?.name ||
        $("h1").first().text().trim() ||
        $("title").text().trim() ||
        null;

      const description =
        og("description") ||
        meta("description") ||
        jsonLd?.description ||
        $("p").first().text().trim().slice(0, 500) ||
        null;

      const image_url =
        og("image") ||
        jsonLd?.image?.url ||
        jsonLd?.image ||
        $('link[rel="image_src"]').attr("href") ||
        null;

      const starts_at =
        $('meta[property="event:start_time"]').attr("content") ||
        jsonLd?.startDate ||
        null;

      const ends_at =
        $('meta[property="event:end_time"]').attr("content") ||
        jsonLd?.endDate ||
        null;

      const location =
        og("location") ||
        jsonLd?.location?.name ||
        jsonLd?.location?.address?.streetAddress ||
        null;

      return res.json({ title, description, image_url, starts_at, ends_at, location, url });
    } catch (err) {
      console.error("[stockholm] fetch-url error:", err.message);
      return res.status(500).json({ error: "Failed to fetch URL: " + err.message });
    }
  });

  // POST /admin/stockholm-events/scrape — run the scraper in the background
  app.post("/admin/stockholm-events/scrape", requireAdmin, async (req, res) => {
    try {
      if (scrapeState.running) return res.json({ message: "Already running", ...scrapeState });
      const { spawn } = await import("child_process");
      const { fileURLToPath } = await import("url");
      const { dirname, join } = await import("path");
      const here = dirname(fileURLToPath(import.meta.url));
      const scraperPath = join(here, "../../scripts/scrape-stockholm-events.js");

      const child = spawn(process.execPath, [scraperPath], { stdio: "ignore", env: { ...process.env } });
      Object.assign(scrapeState, { running: true, startedAt: new Date().toISOString(), finishedAt: null, exitCode: null });
      child.on("exit", (code) => {
        Object.assign(scrapeState, { running: false, finishedAt: new Date().toISOString(), exitCode: code });
      });
      child.on("error", (err) => {
        console.error("[stockholm] scraper failed to start:", err.message);
        Object.assign(scrapeState, { running: false, finishedAt: new Date().toISOString(), exitCode: -1 });
      });

      return res.json({ message: "Scrape started in background", ...scrapeState });
    } catch (err) {
      console.error("[stockholm] scrape trigger error:", err.message);
      return res.status(500).json({ error: "Failed to trigger scrape" });
    }
  });

  // GET /admin/stockholm-events/scrape-status — is a scrape running / when did it finish
  app.get("/admin/stockholm-events/scrape-status", requireAdmin, (req, res) => {
    res.json(scrapeState);
  });
}
