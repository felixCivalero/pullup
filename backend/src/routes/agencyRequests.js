// "Start a conversation" — requests from the agency site.
//
//   POST /agency-requests  – public: name, email, description (+ company,
//                            preferred time, picked superpowers, attribution
//                            metadata) → stored, then emailed to felix@pullup.se.
import { supabase } from "../supabase.js";
import { logger } from "../logger.js";
import { sendEmail } from "../email/index.js";
import { normalizeEmail, isValidEmail } from "../lib/emailAddress.js";

const INBOX = process.env.AGENCY_REQUESTS_TO || "felix@pullup.se";
const POWERS = {
  crm: { name: "Real People CRM", price: 750 },
  room: { name: "The Room", price: 500 },
  tracking: { name: "Deep Tracking", price: 400 },
  app: { name: "Your Own App", price: 1500, from: true },
};
const BASE_MONTHLY = 30000; // SEK, mirrors frontend agencyData
// Bundle ladder — mirrors frontend agencyData BUNDLE_OFF: more powers, less each.
const BUNDLE_OFF = [0, 0, 0.1, 0.15, 0.2];
const bundleOff = (n) => BUNDLE_OFF[Math.min(n, BUNDLE_OFF.length - 1)] || 0;
// All four powers = the Full Service package at one fixed price (mirrors FULL_SERVICE).
const FULL_SERVICE = { name: "Full Service", price: 5500 };
const isFull = (ids) => Object.keys(POWERS).every((id) => ids.includes(id));
const powerPrice = (id, n) => Math.round((POWERS[id].price * (1 - bundleOff(n))) / 5) * 5;

// Per-IP throttle: 6 requests / hour is plenty for a human.
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
  return entry.count > 6;
}

function clip(v, max) {
  const s = (v == null ? "" : String(v)).trim();
  return s ? s.slice(0, max) : null;
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const usd = (n) => `${Number(n).toLocaleString("sv-SE")} kr`; // priced in SEK

// Only known, short, string-valued attribution keys survive.
const META_KEYS = [
  "page", "pageTitle", "referrer", "landingPage", "firstReferrer",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "language", "siteLang", "screen", "device", "visitStartedAt",
];
function cleanMeta(raw) {
  const out = {};
  if (raw && typeof raw === "object") {
    for (const k of META_KEYS) {
      const v = clip(raw[k], 300);
      if (v) out[k] = v;
    }
  }
  return out;
}

function stockholmTime(d) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm", dateStyle: "long", timeStyle: "short",
  }).format(d);
}

function row(label, value) {
  if (!value) return "";
  return `<tr><td style="padding:8px 16px 8px 0;vertical-align:top;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(0,0,0,0.45);white-space:nowrap;">${esc(label)}</td><td style="padding:8px 0;font-size:14px;line-height:1.5;color:#000;word-break:break-word;">${esc(value)}</td></tr>`;
}

function requestEmail(r, received) {
  const m = r.meta;
  const utm = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
    .filter((k) => m[k]).map((k) => `${k.slice(4)}=${m[k]}`).join(" · ");
  const powers = r.powers.map((id) => POWERS[id]).filter(Boolean);
  const n = r.powers.length;
  const off = bundleOff(n);
  const plan = isFull(r.powers)
    ? `${FULL_SERVICE.name} — core engine + all four powers, fixed`
    : powers.length
    ? `Core engine ${usd(BASE_MONTHLY)} + ${r.powers.map((id) => `${POWERS[id].name} (${POWERS[id].from ? "from " : ""}+${usd(powerPrice(id, n))})`).join(" + ")}${off ? ` — bundle −${Math.round(off * 100)}%` : ""}`
    : `Core engine ${usd(BASE_MONTHLY)}`;
  const reply = `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent("Re: your PullUp request")}`;
  return `<!doctype html><html><body style="margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000;">
    <div style="max-width:600px;margin:0 auto;padding:36px 24px;">
      <p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(0,0,0,0.45);margin:0 0 16px;">New request · pullup.se</p>
      <h1 style="font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;margin:0 0 6px;">${esc(r.name)}${r.company ? ` · ${esc(r.company)}` : ""}</h1>
      <p style="font-size:14px;color:rgba(0,0,0,0.55);margin:0 0 22px;">${esc(r.email)} · ${esc(received)}</p>
      <div style="border-left:3px solid #000;padding:4px 0 4px 16px;margin:0 0 24px;font-size:16px;line-height:1.6;white-space:pre-wrap;">${esc(r.description)}</div>
      <table style="border-collapse:collapse;width:100%;border-top:1px solid rgba(0,0,0,0.1);margin:0 0 26px;">
        ${row("Wants", plan)}
        ${row("Monthly", r.monthly_total ? `${!isFull(r.powers) && powers.some((p) => p.from) ? "from " : ""}${usd(r.monthly_total)} / month` : "")}
        ${row("Can talk", r.preferred_time)}
        ${row("Their timezone", r.timezone)}
        ${row("Clicked", r.source)}
      </table>
      <p style="margin:0 0 30px;"><a href="${reply}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 22px;border-radius:999px;">Reply to ${esc(r.name.split(" ")[0])}</a></p>
      <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(0,0,0,0.45);margin:0 0 6px;">Where it came from</p>
      <table style="border-collapse:collapse;width:100%;border-top:1px solid rgba(0,0,0,0.1);">
        ${row("Sent from", m.page)}
        ${row("Page", m.pageTitle)}
        ${row("Referrer", m.referrer)}
        ${row("First landed", m.landingPage)}
        ${row("First referrer", m.firstReferrer)}
        ${row("Campaign", utm)}
        ${row("Visit started", m.visitStartedAt)}
        ${row("Country", m.country)}
        ${row("Device", m.device)}
        ${row("Screen", m.screen)}
        ${row("Read the site in", { en: "English", sv: "Swedish", sw: "Swahili" }[m.siteLang] || m.siteLang)}
        ${row("Language", m.language)}
        ${row("Browser", m.userAgent)}
      </table>
      <p style="font-size:12px;color:rgba(0,0,0,0.4);margin:22px 0 0;">Request ${esc(r.id)}</p>
    </div>
  </body></html>`;
}

export function registerAgencyRequestRoutes(app) {
  app.post("/agency-requests", async (req, res) => {
    try {
      if (limited(req)) return res.status(429).json({ ok: false, error: "rate_limited" });
      const body = req.body || {};
      // Honeypot: real people never fill the hidden field.
      if (clip(body.website, 200)) return res.json({ ok: true });

      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: "invalid_email" });
      const name = clip(body.name, 120);
      if (!name) return res.status(400).json({ ok: false, error: "missing_name" });
      const description = clip(body.description, 4000);
      if (!description || description.length < 10) return res.status(400).json({ ok: false, error: "missing_description" });

      const powers = Array.isArray(body.powers)
        ? [...new Set(body.powers.map(String))].filter((id) => POWERS[id])
        : [];
      const meta = {
        ...cleanMeta(body.meta),
        country: clip(req.get("cf-ipcountry"), 8),
        userAgent: clip(req.get("user-agent"), 300),
      };
      const record = {
        name,
        email,
        company: clip(body.company, 160),
        description,
        preferred_time: clip(body.preferredTime, 200),
        timezone: clip(body.timezone, 80),
        powers,
        monthly_total: isFull(powers)
          ? FULL_SERVICE.price
          : BASE_MONTHLY + powers.reduce((a, id) => a + powerPrice(id, powers.length), 0),
        source: clip(body.source, 80),
        meta,
      };

      const { data, error } = await supabase.from("agency_requests").insert(record).select("id, created_at").single();
      if (error || !data) {
        logger?.error?.("[agency-request] insert failed", { error: error?.message });
        return res.status(500).json({ ok: false, error: "save_failed" });
      }

      const received = stockholmTime(new Date(data.created_at));
      const subjectPowers = isFull(powers)
        ? ` — ${FULL_SERVICE.name}`
        : powers.length ? ` — ${powers.map((id) => POWERS[id].name).join(" + ")}` : "";
      sendEmail({
        to: INBOX,
        subject: `Request: ${name}${record.company ? ` (${record.company})` : ""}${subjectPowers}`,
        html: requestEmail({ ...record, id: data.id }, received),
        idempotencyKey: `agency-request:${data.id}`,
      }).catch((err) => logger?.error?.("[agency-request] email failed", { id: data.id, error: err?.message }));

      return res.json({ ok: true, id: data.id });
    } catch (err) {
      logger?.error?.("[agency-request] error", { error: err?.message });
      return res.status(500).json({ ok: false, error: "failed" });
    }
  });
}
