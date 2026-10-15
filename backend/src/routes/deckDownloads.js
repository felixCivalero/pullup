// Gated deck downloads — the agency site's lead magnet.
//
//   POST /deck-downloads   – public: email (+ optional name/company) → a
//                            personal token; the deck link is also emailed.
//   GET  /deck/:token      – streams the PDF for a known token and counts it.
//
// The PDF lives in backend/assets (built from docs/deck/production-core.html)
// and is never served publicly; only a token minted here unlocks it.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { supabase } from "../supabase.js";
import { logger } from "../logger.js";
import { sendEmail } from "../email/index.js";
import { normalizeEmail, isValidEmail } from "../services/account.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DECKS = {
  "production-core": {
    file: path.join(here, "../../assets/the-production-core.pdf"),
    filename: "The Production Core - PullUp booklet.pdf",
    title: "The Production Core",
  },
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public base the emailed link resolves against (prod goes through nginx /api).
function publicApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://localhost:3001";
  return `${process.env.FRONTEND_URL || "https://pullup.se"}/api`;
}

// Per-IP throttle: 10 requests / hour is plenty for a human.
const hits = new Map(); // ip -> { count, resetAt }
function limited(req) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  const entry = hits.get(ip);
  if (!entry) {
    hits.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

function clip(v, max) {
  const s = (v == null ? "" : String(v)).trim();
  return s ? s.slice(0, max) : null;
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function deckEmail({ name, url, title }) {
  const hi = name ? `Hi ${esc(name.split(" ")[0])},` : "Hi,";
  return `<!doctype html><html><body style="margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000;">
    <div style="max-width:520px;margin:0 auto;padding:44px 28px;">
      <p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(0,0,0,0.45);margin:0 0 20px;">PullUp</p>
      <h1 style="font-size:28px;line-height:1.1;font-weight:700;letter-spacing:-0.02em;margin:0 0 18px;">${esc(title)}</h1>
      <p style="font-size:15px;line-height:1.6;color:rgba(0,0,0,0.72);margin:0 0 14px;">${hi}</p>
      <p style="font-size:15px;line-height:1.6;color:rgba(0,0,0,0.72);margin:0 0 24px;">
        Here is your copy. It starts where personal development starts — where do we want to go, and how do we get there — and lands on the answer: by deciding who we are, every day. A brand is held by many people, so that decision is taken together. That is the alignment.
      </p>
      <p style="margin:0 0 28px;">
        <a href="${url}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 24px;border-radius:999px;">Download the booklet (PDF)</a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:rgba(0,0,0,0.55);margin:0 0 6px;">Want the engine built, or run for you? Just reply to this email.</p>
      <p style="font-size:13px;line-height:1.6;color:rgba(0,0,0,0.45);margin:22px 0 0;">— PullUp · pullup.se</p>
    </div>
  </body></html>`;
}

export function registerDeckDownloadRoutes(app) {
  app.post("/deck-downloads", async (req, res) => {
    try {
      if (limited(req)) return res.status(429).json({ ok: false, error: "rate_limited" });
      const body = req.body || {};
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: "invalid_email" });
      const deck = DECKS[body.deck] ? body.deck : "production-core";

      const row = {
        email,
        deck,
        name: clip(body.name, 120),
        company: clip(body.company, 160),
        source: clip(body.source, 80),
        updated_at: new Date().toISOString(),
      };
      // Upsert on (email, deck): a repeat request keeps the same token.
      const { data, error } = await supabase
        .from("deck_downloads")
        .upsert(row, { onConflict: "email,deck", ignoreDuplicates: false })
        .select("token")
        .maybeSingle();
      if (error || !data?.token) {
        logger?.error?.("[deck] upsert failed", { error: error?.message });
        return res.status(500).json({ ok: false, error: "save_failed" });
      }

      const url = `${publicApiBase()}/deck/${data.token}`;
      // The booklet is email-only: the emailed link is the one way in.
      sendEmail({
        to: email,
        subject: `${DECKS[deck].title} — your booklet`,
        html: deckEmail({ name: row.name, url, title: DECKS[deck].title }),
        idempotencyKey: `deck:${deck}:${email}:${new Date().toISOString().slice(0, 10)}`,
      }).catch((err) => logger?.warn?.("[deck] email failed", { error: err?.message }));

      // The link only travels by email — the page never gets the token.
      return res.json({ ok: true });
    } catch (err) {
      logger?.error?.("[deck] error", { error: err?.message });
      return res.status(500).json({ ok: false, error: "failed" });
    }
  });

  app.get("/deck/:token", async (req, res) => {
    const token = String(req.params.token || "");
    if (!UUID_RE.test(token)) return res.status(404).send("Not found");
    try {
      const { data: row, error } = await supabase
        .from("deck_downloads")
        .select("id, deck, download_count")
        .eq("token", token)
        .maybeSingle();
      if (error || !row) return res.status(404).send("Not found");
      const deck = DECKS[row.deck];
      if (!deck || !fs.existsSync(deck.file)) return res.status(404).send("Not found");

      supabase
        .from("deck_downloads")
        .update({ download_count: (row.download_count || 0) + 1, last_downloaded_at: new Date().toISOString() })
        .eq("id", row.id)
        .then(({ error: e }) => e && logger?.warn?.("[deck] count failed", { error: e.message }));

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${deck.filename}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Robots-Tag", "noindex");
      return fs.createReadStream(deck.file).pipe(res);
    } catch (err) {
      logger?.error?.("[deck] download error", { error: err?.message });
      return res.status(500).send("Failed");
    }
  });
}
