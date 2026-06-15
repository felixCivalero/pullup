// Context-pack export routes — the portable "smart twin".
//
// Data ownership that carries the intelligence, not just the rows. Two surfaces,
// deliberately separate so a host (or their AI) can pull EITHER or BOTH:
//   GET /host/context-pack                       → HIM (the creator twin)
//   GET /host/context-pack/people/:personId      → ONE person's resolved record
//
// Each returns { data, markdown } as JSON by default, or the raw markdown as a
// downloadable .md when ?format=markdown — that markdown IS the thing you feed
// an AI. The creator pack embeds the people of his world when ?people=true.
// See services/contextPack.js.

import { buildCreatorPack, buildPersonPack } from "../services/contextPack.js";
import { requireAuth } from "../middleware/auth.js";

function sendPack(res, pack, filename) {
  const format = (res.req.query.format || "json").toString().toLowerCase();
  if (format === "markdown" || format === "md") {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pack.markdown);
  }
  return res.json(pack);
}

export function registerContextPackRoutes(app) {
  // The creator twin — who he is + the shape of his world + the intelligence.
  // ?people=true embeds the people of his world; ?limit caps them.
  app.get("/host/context-pack", requireAuth, async (req, res) => {
    try {
      const includePeople = req.query.people === "true" || req.query.people === "1";
      const peopleLimit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 100, 2000));
      const pack = await buildCreatorPack(req.user.id, { includePeople, peopleLimit });
      const day = new Date().toISOString().slice(0, 10);
      return sendPack(res, pack, `pullup-context-pack-${day}.md`);
    } catch (error) {
      console.error("Error building creator context pack:", error);
      return res.status(500).json({ error: "Failed to build context pack" });
    }
  });

  // One person's resolved record — identity fused across channels + full
  // history + IG signals + private notes + who they're closest to.
  app.get("/host/context-pack/people/:personId", requireAuth, async (req, res) => {
    try {
      const timelineLimit = Math.max(1, Math.min(parseInt(req.query.timelineLimit, 10) || 100, 1000));
      const pack = await buildPersonPack(req.user.id, req.params.personId, { timelineLimit });
      if (!pack) return res.status(404).json({ error: "Person not found" });
      const day = new Date().toISOString().slice(0, 10);
      const slug = (pack.data.person.name || "person").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return sendPack(res, pack, `pullup-person-${slug || "person"}-${day}.md`);
    } catch (error) {
      console.error("Error building person context pack:", error);
      return res.status(500).json({ error: "Failed to build person pack" });
    }
  });
}
