// Planning canvases (content meetings): one jsonb doc per board.
//
//   GET    /canvas/boards                 – my boards (owner)
//   POST   /canvas/boards                 – create (open: no login needed)
//   GET    /canvas/boards/:id             – open (owner)
//   PUT    /canvas/boards/:id             – save { doc?, title?, version }
//   DELETE /canvas/boards/:id             – delete (owner)
//   POST   /canvas/boards/:id/share/rotate – new share link (revokes the old)
//   GET    /canvas/shared/:token          – open via share link (no login)
//   PUT    /canvas/shared/:token          – save via share link
//   GET    /canvas/resolve?url=           – expand social short links
//
// The canvas is open: a board created without login has no owner, and its
// share link is the board (edit + rename). Creation is throttled per IP.
//
// Saves are optimistic: a write carrying a stale `version` gets 409 with the
// latest board, and the client merges by item id before retrying.
import { randomUUID } from "node:crypto";
import { supabase } from "../supabase.js";
import { logger } from "../logger.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DOC_BYTES = 1_000_000;
const BOARD_COLS = "id, owner_id, title, doc, version, share_token, created_at, updated_at";

const publicBoard = (row, { owner }) => ({
  id: row.id,
  title: row.title,
  doc: row.doc,
  version: row.version,
  updatedAt: row.updated_at,
  isOwner: owner,
  open: !row.owner_id,
  shareToken: owner ? row.share_token : undefined,
});

function cleanTitle(v) {
  const s = (v == null ? "" : String(v)).trim().slice(0, 120);
  return s || null;
}

function validDoc(doc) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.items)) return false;
  return JSON.stringify(doc).length <= MAX_DOC_BYTES;
}

// Version-guarded write shared by owner + share-link saves.
async function saveBoard(res, row, body, { owner }) {
  const version = Number(body.version);
  if (!Number.isInteger(version)) return res.status(400).json({ error: "version_required" });
  const patch = { version: row.version + 1, updated_at: new Date().toISOString() };
  if (body.doc !== undefined) {
    if (!validDoc(body.doc)) return res.status(400).json({ error: "invalid_doc" });
    patch.doc = body.doc;
  }
  if (body.title !== undefined) patch.title = cleanTitle(body.title) || "Untitled board";

  if (version !== row.version) {
    return res.status(409).json({ error: "conflict", board: publicBoard(row, { owner }) });
  }
  const { data, error } = await supabase
    .from("canvas_boards")
    .update(patch)
    .eq("id", row.id)
    .eq("version", version)
    .select(BOARD_COLS)
    .maybeSingle();
  if (error) {
    logger?.error?.("[canvas] save failed", { error: error.message });
    return res.status(500).json({ error: "save_failed" });
  }
  if (!data) {
    // Lost the race between our read and write — hand back the winner.
    const { data: latest } = await supabase.from("canvas_boards").select(BOARD_COLS).eq("id", row.id).maybeSingle();
    return res.status(409).json({ error: "conflict", board: latest ? publicBoard(latest, { owner }) : null });
  }
  return res.json({ board: publicBoard(data, { owner }) });
}

async function ownedBoard(req, res) {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  const { data, error } = await supabase.from("canvas_boards").select(BOARD_COLS).eq("id", id).maybeSingle();
  if (error || !data || data.owner_id !== req.user.id) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  return data;
}

async function sharedBoard(req, res) {
  const token = String(req.params.token || "");
  if (!UUID_RE.test(token)) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  const { data, error } = await supabase.from("canvas_boards").select(BOARD_COLS).eq("share_token", token).maybeSingle();
  if (error || !data) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  return data;
}

// Short-link expansion, restricted to social hosts so it can't be pointed at
// arbitrary (internal) URLs. Follows up to 5 redirects manually and checks
// every hop against the allowlist.
const RESOLVE_HOSTS = ["tiktok.com", "instagram.com", "instagr.am", "facebook.com", "fb.watch", "fb.com", "youtube.com", "youtu.be"];
const allowedHost = (h) => RESOLVE_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));

async function expandUrl(raw) {
  let current = new URL(raw);
  for (let hop = 0; hop < 5; hop++) {
    if (current.protocol !== "https:" || !allowedHost(current.hostname)) return null;
    const r = await fetch(current, {
      method: "GET",
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

const resolveHits = new Map(); // ip -> { count, resetAt }
function resolveLimited(ip) {
  const now = Date.now();
  for (const [k, v] of resolveHits) if (v.resetAt <= now) resolveHits.delete(k);
  const e = resolveHits.get(ip);
  if (!e) {
    resolveHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  e.count += 1;
  return e.count > 30;
}

const createHits = new Map(); // ip -> { count, resetAt }
function createLimited(ip) {
  const now = Date.now();
  for (const [k, v] of createHits) if (v.resetAt <= now) createHits.delete(k);
  const e = createHits.get(ip);
  if (!e) {
    createHits.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  e.count += 1;
  return e.count > 20;
}

export function registerCanvasRoutes(app) {
  app.get("/canvas/boards", requireAuth, async (req, res) => {
    const { data, error } = await supabase
      .from("canvas_boards")
      .select("id, title, doc, updated_at")
      .eq("owner_id", req.user.id)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: "load_failed" });
    return res.json({
      boards: (data || []).map((b) => ({
        id: b.id,
        title: b.title,
        updatedAt: b.updated_at,
        itemCount: Array.isArray(b.doc?.items) ? b.doc.items.length : 0,
      })),
    });
  });

  app.post("/canvas/boards", optionalAuth, async (req, res) => {
    const ownerId = req.user?.id || null;
    if (!ownerId && createLimited(req.ip || "unknown")) return res.status(429).json({ error: "rate_limited" });
    const { data, error } = await supabase
      .from("canvas_boards")
      .insert({
        owner_id: ownerId,
        title: cleanTitle(req.body?.title) || "Untitled board",
        // A template can seed the board's first doc.
        ...(validDoc(req.body?.doc) ? { doc: req.body.doc } : {}),
      })
      .select(BOARD_COLS)
      .single();
    if (error) {
      logger?.error?.("[canvas] create failed", { error: error.message });
      return res.status(500).json({ error: "create_failed" });
    }
    // Without an owner the share link is the only key — hand it back.
    return res.json({ board: { ...publicBoard(data, { owner: Boolean(ownerId) }), shareToken: data.share_token } });
  });

  app.get("/canvas/boards/:id", requireAuth, async (req, res) => {
    const row = await ownedBoard(req, res);
    if (!row) return;
    if (req.query.since !== undefined && Number(req.query.since) === row.version) {
      return res.json({ unchanged: true, version: row.version });
    }
    return res.json({ board: publicBoard(row, { owner: true }) });
  });

  app.put("/canvas/boards/:id", requireAuth, async (req, res) => {
    const row = await ownedBoard(req, res);
    if (!row) return;
    return saveBoard(res, row, req.body || {}, { owner: true });
  });

  app.delete("/canvas/boards/:id", requireAuth, async (req, res) => {
    const row = await ownedBoard(req, res);
    if (!row) return;
    const { error } = await supabase.from("canvas_boards").delete().eq("id", row.id);
    if (error) return res.status(500).json({ error: "delete_failed" });
    return res.json({ ok: true });
  });

  app.post("/canvas/boards/:id/share/rotate", requireAuth, async (req, res) => {
    const row = await ownedBoard(req, res);
    if (!row) return;
    const { data, error } = await supabase
      .from("canvas_boards")
      .update({ share_token: randomUUID() })
      .eq("id", row.id)
      .select(BOARD_COLS)
      .single();
    if (error) return res.status(500).json({ error: "rotate_failed" });
    return res.json({ board: publicBoard(data, { owner: true }) });
  });

  app.get("/canvas/shared/:token", async (req, res) => {
    const row = await sharedBoard(req, res);
    if (!row) return;
    if (req.query.since !== undefined && Number(req.query.since) === row.version) {
      return res.json({ unchanged: true, version: row.version });
    }
    return res.json({ board: publicBoard(row, { owner: false }) });
  });

  app.put("/canvas/shared/:token", async (req, res) => {
    const row = await sharedBoard(req, res);
    if (!row) return;
    // A share link edits content; renaming stays with the owner — unless the
    // board has none (open boards), where the link is the board.
    const body = { ...(req.body || {}) };
    if (row.owner_id) delete body.title;
    return saveBoard(res, row, body, { owner: false });
  });

  app.get("/canvas/resolve", async (req, res) => {
    if (resolveLimited(req.ip || "unknown")) return res.status(429).json({ error: "rate_limited" });
    try {
      const url = await expandUrl(String(req.query.url || ""));
      if (!url) return res.status(400).json({ error: "unsupported_url" });
      return res.json({ url });
    } catch (err) {
      logger?.warn?.("[canvas] resolve failed", { error: err?.message });
      return res.status(400).json({ error: "unresolvable" });
    }
  });
}
