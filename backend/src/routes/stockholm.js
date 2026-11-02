// Stockholm for everyone: the guide's events and following it on mail.
//
//   GET  /stockholm/events                 – what's on now and coming up
//   POST /stockholm/follow                 – email + topics → a confirm mail
//   POST /stockholm/confirm/:token         – the mail's link, sent by the page
//                                            (a POST, so mail scanners that
//                                            open links confirm nobody)
//   GET|POST /stockholm/unsubscribe/:token – stop the Thursday mail
//
// startStockholmJobs() runs the two clocks in this one API process: the
// scraper every night and the mail on Thursdays. `stockholm_digests` has one
// row per week, so a restart never sends a second one.
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "../supabase.js";
import { sendEmail } from "../email/index.js";
import { normalizeEmail, isValidEmail } from "../lib/emailAddress.js";
import { humanCheck, over } from "../lib/abuse.js";
import { fillMissingImages } from "../lib/eventImages.js";
import { TOPICS, confirmEmail, digestEmail, isDigestTime, pickForDigest, publicEvent, weekKey } from "../lib/stockholmGuide.js";

const SITE = "https://pullup.se";
const API = `${SITE}/api`;
const FROM = `"PullUp Stockholm" <no-reply@pullup.se>`;
const HOUR = 3600_000;

// Published on the page, so kept a moment instead of read per visitor.
let cached = { at: 0, events: null };
async function guideEvents(now = new Date()) {
  if (cached.events && now.getTime() - cached.at < 5 * 60_000) return cached.events;
  const today = now.toISOString().slice(0, 10);
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("stockholm_events")
      .select("id, title, starts_at, ends_at, location, url, category, image_url")
      .neq("status", "rejected")
      .not("starts_at", "is", null)
      .or(`ends_at.gte.${today},and(ends_at.is.null,starts_at.gte.${today})`)
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const events = rows.map(publicEvent).filter(Boolean);
  cached = { at: now.getTime(), events };
  return events;
}

const cleanTopics = (list) => (Array.isArray(list) ? TOPICS.filter((t) => list.includes(t)) : []);

export function registerStockholmRoutes(app) {
  app.get("/stockholm/events", async (req, res) => {
    try {
      res.set("Cache-Control", "public, max-age=300");
      return res.json({ events: await guideEvents() });
    } catch (err) {
      console.error("[stockholm] events:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  app.post("/stockholm/follow", async (req, res) => {
    try {
      if (over(`follow:ip:${req.ip}`, 10, HOUR)) return res.status(429).json({ error: "rate_limited" });
      const body = req.body || {};
      if (body.website) return res.json({ ok: true }); // honeypot
      if (!(await humanCheck(body.turnstile, req.ip))) return res.status(403).json({ error: "bot_check" });
      const email = normalizeEmail(body.email);
      if (!email || !isValidEmail(email)) return res.status(400).json({ error: "invalid_email" });
      if (over(`follow:addr:${email}`, 3, HOUR)) return res.json({ ok: true });

      const interests = cleanTopics(body.topics);
      const { data: existing } = await supabase
        .from("newsletter_subscriptions")
        .select("id, status, unsubscribe_token")
        .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
        .maybeSingle();
      // Already following: same answer as for a new address, so the form can't
      // be used to find out who is on the list. Their topics stay as they are.
      if (existing?.status === "confirmed") return res.json({ ok: true });

      const token = existing?.unsubscribe_token || randomBytes(24).toString("hex");
      const row = { status: "pending", source: "stockholm_guide", interests, unsubscribe_token: token, unsubscribed_at: null, updated_at: new Date().toISOString() };
      const { error } = existing
        ? await supabase.from("newsletter_subscriptions").update(row).eq("id", existing.id)
        : await supabase.from("newsletter_subscriptions").insert({ ...row, email });
      if (error) throw error;

      await sendEmail({ from: FROM, to: email, ...confirmEmail({ confirmUrl: `${SITE}/stockholm?folj=${token}` }) });
      return res.json({ ok: true });
    } catch (err) {
      console.error("[stockholm] follow:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  app.post("/stockholm/confirm/:token", async (req, res) => {
    try {
      const token = String(req.params.token || "").slice(0, 200);
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("newsletter_subscriptions")
        .update({ status: "confirmed", confirmed_at: now, consent_given: true, consent_at: now, updated_at: now })
        .eq("unsubscribe_token", token)
        .eq("status", "pending")
        .select("id");
      if (error) throw error;
      if (data?.length) return res.json({ ok: true });
      const { data: already } = await supabase.from("newsletter_subscriptions").select("id").eq("unsubscribe_token", token).eq("status", "confirmed").maybeSingle();
      return res.status(already ? 200 : 404).json({ ok: !!already });
    } catch (err) {
      console.error("[stockholm] confirm:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  const stop = async (req, res) => {
    const token = String(req.params.token || "").slice(0, 200);
    let ok = false;
    try {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("newsletter_subscriptions")
        .update({ status: "unsubscribed", unsubscribed_at: now, updated_at: now })
        .eq("unsubscribe_token", token)
        .select("id");
      ok = !!data?.length;
    } catch (err) {
      console.error("[stockholm] unsubscribe:", err?.message);
    }
    if (req.method === "POST") return res.status(ok ? 200 : 404).json({ ok });
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.status(ok ? 200 : 404).send(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PullUp</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;display:grid;place-items:center;min-height:100vh;padding:24px;">
<div style="max-width:420px;"><h1 style="font-size:24px;margin:0 0 8px;">${ok ? "Klart" : "Länken fungerar inte"}</h1>
<p style="font-size:15px;line-height:1.5;color:#6e6e73;margin:0;">${ok ? "Du får inga fler mejl om Stockholm." : "Skriv till felix@pullup.se så hjälper vi dig."}</p></div></body></html>`);
  };
  app.get("/stockholm/unsubscribe/:token", stop);
  app.post("/stockholm/unsubscribe/:token", stop);
}

// The list needs a token each; the ones from before this page have none.
async function followers() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("newsletter_subscriptions")
      .select("id, email, interests, unsubscribe_token")
      .eq("status", "confirmed")
      .eq("consent_given", true)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  for (const r of rows) {
    if (r.unsubscribe_token) continue;
    r.unsubscribe_token = randomBytes(24).toString("hex");
    await supabase.from("newsletter_subscriptions").update({ unsubscribe_token: r.unsubscribe_token }).eq("id", r.id);
  }
  return rows;
}

export async function sendWeeklyDigest(now = new Date()) {
  // The week's row first: if two runs race, the unique key stops the second.
  const week = weekKey(now);
  const { error: claim } = await supabase.from("stockholm_digests").insert({ week });
  if (claim) return { week, skipped: true };

  const events = await guideEvents(now);
  let sent = 0;
  let failed = 0;
  for (const person of await followers()) {
    const days = pickForDigest(events, person.interests, { now });
    if (!days.length) continue;
    const unsubscribeUrl = `${API}/stockholm/unsubscribe/${person.unsubscribe_token}`;
    try {
      await sendEmail({
        from: FROM,
        to: person.email,
        ...digestEmail({ days, pageUrl: `${SITE}/stockholm`, unsubscribeUrl }),
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error("[stockholm] digest send:", err?.message);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  await supabase.from("stockholm_digests").update({ sent, failed, finished_at: new Date().toISOString() }).eq("week", week);
  return { week, sent, failed };
}

const here = dirname(fileURLToPath(import.meta.url));
function runScraper() {
  const child = spawn(process.execPath, [join(here, "../../scripts/scrape-stockholm-events.js")], { stdio: "ignore", env: { ...process.env } });
  child.on("error", (err) => console.error("[stockholm] nightly scrape:", err.message));
  // Then the pictures the scrapers missed, from each event's own page.
  child.on("exit", () => {
    fillMissingImages(supabase)
      .then((r) => console.log(`[stockholm] images: ${r.found} of ${r.looked} found`))
      .catch((err) => console.error("[stockholm] images:", err.message));
  });
}

export function startStockholmJobs() {
  // Only the API on the server (pm2): a laptop's dev server neither scrapes nor mails.
  if (process.env.pm_id === undefined) return;
  let lastScrape = null;
  const tick = async () => {
    try {
      const now = new Date();
      const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
      const hour = Number(now.toLocaleString("en-GB", { timeZone: "Europe/Stockholm", hour: "2-digit", hour12: false }));
      if (hour === 3 && lastScrape !== today) {
        lastScrape = today;
        runScraper();
      }
      // Paused by Felix 2026-11-02: the Thursday mail only goes out when the
      // server's env says STOCKHOLM_DIGEST=on. The scrape keeps running.
      if (process.env.STOCKHOLM_DIGEST === "on" && isDigestTime(now)) await sendWeeklyDigest(now);
    } catch (err) {
      console.error("[stockholm] jobs:", err?.message);
    }
  };
  setInterval(tick, 10 * 60_000).unref();
}
