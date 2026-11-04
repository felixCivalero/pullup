// POST /site-check — the front page's free check of a brand's own site.
// Anyone may call it, so per-IP limits and one result per domain and hour.
import { supabase } from "../supabase.js";
import { over } from "../lib/abuse.js";
import { fetchSite, gradeSite, normalizeSite, whyUnread } from "../lib/siteCheck.js";

const HOUR = 3600_000;
const cache = new Map(); // site → { at, result }

export function registerSiteCheckRoutes(app) {
  app.post("/site-check", async (req, res) => {
    // Every try is kept with the visit it came from (Statistik: what was
    // typed, and that visitor's journey) — the rate-limited ones aren't.
    const input = String(req.body?.site || "").trim().slice(0, 200);
    const visitId = typeof req.body?.visitId === "string" ? req.body.visitId.slice(0, 128) : null;
    const source = String(req.body?.source || "home").slice(0, 40);
    const log = (row) => supabase.from("site_checks").insert({ input, visit_id: visitId, source, ...row })
      .then(({ error }) => { if (error) console.error("[site-check] log:", error.message); });
    try {
      if (over(`sitecheck:ip:${req.ip}`, 12, HOUR)) return res.status(429).json({ error: "rate_limited" });
      const site = normalizeSite(req.body?.site);
      if (!site) {
        log({ outcome: "invalid" });
        return res.status(400).json({ error: "invalid_site" });
      }

      const hit = cache.get(site);
      if (hit && Date.now() - hit.at < HOUR) {
        log({ domain: hit.result.domain, score: hit.result.score, outcome: "scored" });
        return res.json(hit.result);
      }

      // Not graded: either a barrier we hit (blocked, with who put it up when
      // the answer says) or no real answer at all (unreachable).
      const domain = new URL(site).hostname.replace(/^www\./, "");
      const page = await fetchSite(site).catch(() => null);
      const why = whyUnread(page);
      if (why) {
        log({ domain, outcome: why.outcome });
        return res.status(422).json({ error: why.outcome, domain, by: why.by || null });
      }
      const result = gradeSite(page);

      if (cache.size > 2000) cache.clear();
      cache.set(site, { at: Date.now(), result });
      log({ domain: result.domain, score: result.score, outcome: "scored" });
      return res.json(result);
    } catch (err) {
      console.error("[site-check]", err?.message);
      log({ outcome: "unreadable" });
      return res.status(422).json({ error: "unreadable" });
    }
  });
}
