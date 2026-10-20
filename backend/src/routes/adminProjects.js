// /admin/projects — a client's project: the board (free-form, for developing
// formats in meetings) and the strategy deck. The timeline is /admin/planner.
// Owner only. Saves carry the version they were based on; a stale one gets
// 409 with the latest so the page can merge and retry.
import { requireOwner } from "../middleware/requireOwner.js";
import { getProjectDoc, isDocKind, saveProjectDoc } from "../repos/projectDocs.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DOC_BYTES = 1_000_000;

// Short links (vm.tiktok.com, fb.watch…) hide the post; expand them, but only
// across social hosts so this can't be pointed at arbitrary URLs. Every hop
// is checked against the allowlist.
const RESOLVE_HOSTS = ["tiktok.com", "instagram.com", "instagr.am", "facebook.com", "fb.watch", "fb.com", "youtube.com", "youtu.be"];
const allowedHost = (h) => RESOLVE_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
async function expandUrl(raw) {
  let current = new URL(raw);
  for (let hop = 0; hop < 5; hop++) {
    if (current.protocol !== "https:" || !allowedHost(current.hostname)) return null;
    const r = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" },
      signal: AbortSignal.timeout(6000),
    });
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) {
      current = new URL(loc, current);
      continue;
    }
    return current.toString();
  }
  return current.toString();
}

export function registerAdminProjectRoutes(app) {
  const params = (req, res) => {
    const { clientId, kind } = req.params;
    if (!UUID.test(clientId) || !isDocKind(kind)) {
      res.status(404).json({ error: "not_found" });
      return null;
    }
    return { clientId, kind };
  };

  app.get("/admin/projects/:clientId/:kind", requireOwner, async (req, res) => {
    const p = params(req, res);
    if (!p) return undefined;
    try {
      return res.json(await getProjectDoc(p.clientId, p.kind));
    } catch (err) {
      console.error("[admin/projects] load:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  app.put("/admin/projects/:clientId/:kind", requireOwner, async (req, res) => {
    const p = params(req, res);
    if (!p) return undefined;
    const { doc, version } = req.body || {};
    if (!doc || typeof doc !== "object" || !Number.isInteger(version) || version < 0) return res.status(400).json({ error: "invalid" });
    if (JSON.stringify(doc).length > MAX_DOC_BYTES) return res.status(413).json({ error: "too_large" });
    try {
      const r = await saveProjectDoc(p.clientId, p.kind, doc, version);
      if (r.conflict) return res.status(409).json({ error: "conflict", ...r.latest });
      return res.json({ doc: r.doc, version: r.version, updatedAt: r.updatedAt });
    } catch (err) {
      console.error("[admin/projects] save:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // GET /admin/resolve-url?url= — expand a social short link.
  app.get("/admin/resolve-url", requireOwner, async (req, res) => {
    try {
      const url = await expandUrl(String(req.query.url || ""));
      if (!url) return res.status(400).json({ error: "unsupported_url" });
      return res.json({ url });
    } catch {
      return res.status(400).json({ error: "unresolvable" });
    }
  });
}
