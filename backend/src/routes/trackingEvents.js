// Public pageview/event analytics ingest — landing-page views (per-row + legacy
// aggregate) and whitelisted funnel events, keyed by a localStorage visitor_id.

export function registerTrackingEventRoutes(app) {
  // POST /t/pageview — public, no auth, records a page view
  app.post("/t/pageview", async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { page, visitorId, referrer, deviceType } = req.body;
      if (!page) return res.status(400).json({ error: "page is required" });

      if (page === "landing" && visitorId) {
        // Detect source from referrer
        let source = "direct";
        if (referrer) {
          try {
            const host = new URL(referrer).hostname.replace("www.", "");
            if (host.includes("instagram")) source = "instagram";
            else if (host.includes("facebook") || host.includes("fb.")) source = "facebook";
            else if (host.includes("twitter") || host.includes("x.com")) source = "twitter";
            else if (host.includes("linkedin")) source = "linkedin";
            else if (host.includes("google")) source = "google";
            else if (host.includes("pullup")) source = "pullup";
            else source = host;
          } catch {
            source = "other";
          }
        }

        // Try new per-row table
        let inserted = false;
        try {
          // Dedup: same visitor + source within 30 min
          const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          const { data: existing } = await supabase
            .from("landing_page_views")
            .select("id")
            .eq("visitor_id", visitorId)
            .eq("source", source)
            .gte("created_at", thirtyMinAgo)
            .limit(1);

          if (existing && existing.length > 0) {
            return res.json({ ok: true, deduplicated: true });
          }

          const { error: insertErr } = await supabase.from("landing_page_views").insert({
            visitor_id: visitorId,
            referrer: referrer ? referrer.slice(0, 2000) : null,
            source,
            device_type: deviceType || null,
          });

          if (!insertErr) inserted = true;
        } catch (e) {
          // Table doesn't exist yet — fall through to legacy
        }

        if (inserted) return res.json({ ok: true });
        // Fall through to legacy tracking below
      }

      // Legacy aggregate tracking
      const today = new Date().toISOString().slice(0, 10);
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
      const ua = req.headers["user-agent"] || "unknown";
      const { createHash } = await import("crypto");
      const visitorHash = createHash("sha256").update(`${ip}:${ua}:${today}`).digest("hex").slice(0, 16);

      const { error } = await supabase.rpc("increment_page_view", {
        p_page: page,
        p_date: today,
        p_visitor_hash: visitorHash,
      });

      if (error) throw error;
      return res.json({ ok: true });
    } catch (err) {
      console.error("[pageview] error:", err.message);
      return res.status(500).json({ error: "Failed to record pageview" });
    }
  });

  // POST /t/event — public, no auth, records a landing-page funnel event.
  // Keyed by the same visitor_id localStorage value used by /t/pageview so the
  // funnel can be joined together in landing_page_events.
  app.post("/t/event", async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { visitorId, eventName, source, deviceType, props } = req.body || {};
      if (!visitorId || !eventName) {
        return res.status(400).json({ error: "visitorId and eventName are required" });
      }
      // Whitelist: prevents a compromised frontend from flooding the table
      // with arbitrary event names.
      const ALLOWED = new Set([
        "cta_click",
        "onboarding_step_view",
        "onboarding_skip",
        "auth_start",
        "signed_in",
      ]);
      if (!ALLOWED.has(eventName)) {
        return res.status(400).json({ error: "unknown eventName" });
      }
      // Dedup: same visitor + event within 2s absorbs double-taps.
      const twoSecAgo = new Date(Date.now() - 2000).toISOString();
      const { data: recent } = await supabase
        .from("landing_page_events")
        .select("id")
        .eq("visitor_id", visitorId)
        .eq("event_name", eventName)
        .gte("created_at", twoSecAgo)
        .limit(1);
      if (recent && recent.length > 0) {
        return res.json({ ok: true, deduplicated: true });
      }
      const { error: insertErr } = await supabase.from("landing_page_events").insert({
        visitor_id: visitorId,
        event_name: eventName,
        source: source || null,
        device_type: deviceType || null,
        props: props || null,
      });
      if (insertErr) throw insertErr;
      return res.json({ ok: true });
    } catch (err) {
      console.error("[event] error:", err.message);
      return res.status(500).json({ error: "Failed to record event" });
    }
  });
}
