// Archi (the SpaceFill 3D viewer from ~/Projects/archi.pullup), simplest
// version behind the admin: the venue models live in the private "archi"
// Storage bucket (one folder per venue, optimized GLB files), and the owner
// gets short-lived signed links to load them in /admin/archi.
//   GET /admin/archi/models → [{ id, venue, name, size, url }]
import { requireOwner } from "../middleware/requireOwner.js";
import { supabase } from "../supabase.js";

const BUCKET = "archi";
const LINK_SECONDS = 60 * 60;
// "forbindelsehallen-v2.glb" → "Förbindelsehallen v2"
const NAMES = { slakthus: "Slakthusområdet", forbindelsehallen: "Förbindelsehallen" };
const pretty = (s) => s.replace(/\.glb$/i, "").split("-").map((w) => NAMES[w] || w).join(" ").replace(/^./, (c) => c.toUpperCase());

export function registerAdminArchiRoutes(app) {
  app.get("/admin/archi/models", requireOwner, async (req, res) => {
    try {
      const { data: folders, error } = await supabase.storage.from(BUCKET).list("", { limit: 100 });
      if (error) throw error;
      const models = [];
      for (const folder of folders || []) {
        if (folder.id) continue; // a file at the root, not a venue folder
        const { data: files, error: fErr } = await supabase.storage.from(BUCKET).list(folder.name, { limit: 100, sortBy: { column: "name", order: "asc" } });
        if (fErr) throw fErr;
        for (const f of files || []) {
          if (!/\.glb$/i.test(f.name)) continue;
          const path = `${folder.name}/${f.name}`;
          const { data: link, error: lErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, LINK_SECONDS);
          if (lErr) throw lErr;
          models.push({ id: path, venue: pretty(folder.name), name: pretty(f.name), size: f.metadata?.size || null, url: link.signedUrl });
        }
      }
      return res.json({ models });
    } catch (err) {
      console.error("[admin/archi] models:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
}
