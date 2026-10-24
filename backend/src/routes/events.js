// The public side of the event platform (see lib/eventPlatform.js):
//   GET  /events/:slug               the event page's data
//   POST /events/:slug/rsvp          sign up → person + rsvp + confirmation mail
//   GET  /events/:slug/calendar.ics  add to Apple Calendar / Outlook
//   GET  /e/:slug                    share previews (nginx sends crawlers here)
//   GET|POST /unsubscribe/:token     stop mail from PullUp (POST = one-click)
import { supabase } from "../supabase.js";
import { sendEmail } from "../email/index.js";
import { getFrontendUrl, isDevelopment } from "../lib/urls.js";
import { isValidEmail, normalizeEmail } from "../lib/emailAddress.js";
import { eventText, imageUrl, formatWhen, isOpenForSignup, personPatch } from "../lib/eventPlatform.js";
import { icsFor, googleCalendarUrl } from "../lib/eventCalendar.js";
import { confirmationEmail } from "../lib/eventEmails.js";
import { loadEventMedia } from "./adminEventMedia.js";

const EVENT_COLUMNS =
  "id, slug, title, description, sections, location, starts_at, ends_at, timezone, image_url, cover_image_url, total_capacity, status, kind, hide_location, hide_date, " +
  "media_settings, title_settings, reveal_hint, date_reveal_hint, signup_settings, show_coordinates, location_lat, location_lng";

export const apiBase = () => process.env.PUBLIC_API_URL || (isDevelopment ? "http://localhost:3001" : `${getFrontendUrl()}/api`);
export const eventUrl = (slug) => `${getFrontendUrl()}/e/${slug}`;

// Per-IP throttle on sign-ups: 20 an hour is plenty for a human.
const hits = new Map();
function limited(req) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  const entry = hits.get(ip) || { count: 0, resetAt: now + 3600000 };
  entry.count += 1;
  hits.set(ip, entry);
  return entry.count > 20;
}

const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function findEvent(slug) {
  const { data, error } = await supabase.from("events").select(EVENT_COLUMNS).eq("slug", String(slug).slice(0, 120)).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "PUBLISHED" || (data.kind && data.kind !== "event")) return null;
  return data;
}

async function attendingCount(eventId) {
  const { count, error } = await supabase.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "attending");
  if (error) throw error;
  return count || 0;
}

// What a guest sees — nothing about other guests. The design fields are in
// the shape the event page components read (components/event/*).
function publicShape(ev, attending, media = []) {
  const spotsLeft = ev.total_capacity ? Math.max(0, ev.total_capacity - attending) : null;
  const hidden = !!ev.hide_location;
  return {
    slug: ev.slug,
    title: ev.title,
    text: eventText(ev),
    location: hidden ? null : ev.location,
    locationLat: hidden ? null : ev.location_lat ?? null,
    locationLng: hidden ? null : ev.location_lng ?? null,
    showCoordinates: !hidden && !!ev.show_coordinates,
    startsAt: ev.starts_at,
    endsAt: ev.ends_at,
    timezone: ev.timezone || "Europe/Stockholm",
    imageUrl: imageUrl(ev.cover_image_url || ev.image_url, process.env.SUPABASE_URL),
    media,
    mediaSettings: ev.media_settings || {},
    titleSettings: ev.title_settings || {},
    sections: Array.isArray(ev.sections) ? ev.sections : [],
    hideLocation: hidden,
    hideDate: !!ev.hide_date,
    revealHint: ev.reveal_hint || null,
    dateRevealHint: ev.date_reveal_hint || null,
    signupSettings: ev.signup_settings || {},
    open: isOpenForSignup(ev),
    full: spotsLeft === 0,
    spotsLeft,
  };
}

function calendarLinks(ev) {
  const withText = { ...ev, text: eventText(ev) };
  return {
    google: googleCalendarUrl(withText, { url: eventUrl(ev.slug) }),
    ics: `${apiBase()}/events/${ev.slug}/calendar.ics`,
  };
}

// The person behind an email: the existing row (any casing) or a new one.
async function upsertPerson({ email, name, consent }) {
  const { data: found, error } = await supabase
    .from("people")
    .select("id, name, email, marketing_consent, marketing_unsubscribed_at, do_not_contact, anonymized_at")
    .ilike("email", email.replace(/([%_\\])/g, "\\$1"))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (found) {
    const patch = personPatch(found, { name, consent });
    if (Object.keys(patch).length) {
      const { error: upErr } = await supabase.from("people").update(patch).eq("id", found.id);
      if (upErr) throw upErr;
    }
    return found.id;
  }
  const row = { email, name, acquisition_channel: "direct", ...personPatch(null, { name, consent }) };
  const { data: created, error: insErr } = await supabase.from("people").insert(row).select("id").single();
  if (insErr) {
    // Two sign-ups racing on the same address: the other one won, use it.
    if (insErr.code === "23505") return upsertPerson({ email, name, consent });
    throw insErr;
  }
  // The identity graph the old app keys people on — best effort.
  await supabase.from("person_identities").insert({ person_id: created.id, kind: "email", value: email, value_norm: email, source: "event_rsvp", is_primary: true }).then(() => {}, () => {});
  return created.id;
}

export function registerEventRoutes(app) {
  app.get("/events/:slug", async (req, res) => {
    try {
      const ev = await findEvent(req.params.slug);
      if (!ev) return res.status(404).json({ error: "not_found" });
      const [attending, media] = await Promise.all([attendingCount(ev.id), loadEventMedia(ev.id)]);
      return res.json({ event: publicShape(ev, attending, media), calendar: calendarLinks(ev) });
    } catch (err) {
      console.error("[events] get:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  app.post("/events/:slug/rsvp", async (req, res) => {
    try {
      if (limited(req)) return res.status(429).json({ error: "rate_limited" });
      const body = req.body || {};
      if (clip(body.website, 200)) return res.json({ ok: true, status: "attending" }); // honeypot
      const email = normalizeEmail(body.email);
      const name = clip(body.name, 120);
      if (!name) return res.status(400).json({ error: "missing_name" });
      if (!isValidEmail(email)) return res.status(400).json({ error: "invalid_email" });

      const ev = await findEvent(req.params.slug);
      if (!ev) return res.status(404).json({ error: "not_found" });
      if (!isOpenForSignup(ev)) return res.status(409).json({ error: "closed" });

      const personId = await upsertPerson({ email, name, consent: body.consent === true });

      // Already signed up: same answer again, no second mail.
      const { data: existing, error: exErr } = await supabase.from("rsvps").select("id, status").eq("event_id", ev.id).eq("person_id", personId).maybeSingle();
      if (exErr) throw exErr;
      if (existing && existing.status !== "cancelled") {
        return res.json({ ok: true, already: true, status: existing.status, calendar: calendarLinks(ev) });
      }

      const full = ev.total_capacity ? (await attendingCount(ev.id)) >= ev.total_capacity : false;
      const status = full ? "waitlist" : "attending";
      const row = {
        event_id: ev.id,
        person_id: personId,
        slug: ev.slug,
        status,
        booking_status: full ? "WAITLIST" : "CONFIRMED",
        plus_ones: 0,
        party_size: 1,
        total_guests: 1,
        marketing_opt_in: body.consent === true,
        visitor_id: clip(body.visitId, 128) || null,
      };
      const write = existing
        ? supabase.from("rsvps").update(row).eq("id", existing.id).select("id").single()
        : supabase.from("rsvps").insert(row).select("id").single();
      const { error: wErr } = await write;
      if (wErr) throw wErr;

      const calendar = calendarLinks(ev);
      const mail = confirmationEmail({
        event: ev,
        name,
        status,
        eventUrl: eventUrl(ev.slug),
        googleUrl: calendar.google,
        icsUrl: calendar.ics,
        imageUrl: imageUrl(ev.cover_image_url || ev.image_url, process.env.SUPABASE_URL),
      });
      sendEmail({
        to: email,
        ...mail,
        replyTo: process.env.EVENT_REPLY_TO || "felix@pullup.se",
        attachments: status === "attending"
          ? [{ filename: "event.ics", content: Buffer.from(icsFor({ ...ev, text: eventText(ev) }, { url: eventUrl(ev.slug) })).toString("base64"), content_type: "text/calendar" }]
          : undefined,
      }).catch((err) => console.error("[events] confirmation mail failed:", err?.message));

      return res.json({ ok: true, status, calendar });
    } catch (err) {
      console.error("[events] rsvp:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  app.get("/events/:slug/calendar.ics", async (req, res) => {
    try {
      const ev = await findEvent(req.params.slug);
      if (!ev) return res.status(404).send("Not found");
      res.set("Content-Type", "text/calendar; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="${ev.slug}.ics"`);
      return res.send(icsFor({ ...ev, text: eventText(ev) }, { url: eventUrl(ev.slug) }));
    } catch (err) {
      console.error("[events] ics:", err?.message);
      return res.status(500).send("Error");
    }
  });

  // Share previews: nginx routes crawlers on /e/ here; people get the SPA.
  app.get("/e/:slug", async (req, res) => {
    try {
      const ev = await findEvent(req.params.slug);
      const url = eventUrl(req.params.slug);
      if (!ev) return res.redirect(302, getFrontendUrl());
      const title = ev.title;
      const desc = [formatWhen(ev), ev.hide_location ? "" : ev.location].filter(Boolean).join(" · ");
      const img = imageUrl(ev.cover_image_url || ev.image_url, process.env.SUPABASE_URL);
      res.set("Content-Type", "text/html; charset=utf-8");
      return res.send(`<!doctype html><html lang="sv"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
${img ? `<meta property="og:image" content="${esc(img)}"><meta name="twitter:image" content="${esc(img)}">` : ""}
<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">
<meta http-equiv="refresh" content="0;url=${esc(url)}"></head><body><a href="${esc(url)}">${esc(title)}</a></body></html>`);
    } catch (err) {
      console.error("[events] og:", err?.message);
      return res.redirect(302, getFrontendUrl());
    }
  });

  const unsubscribe = async (req, res) => {
    const token = String(req.params.token || "").slice(0, 200);
    let ok = false;
    try {
      const { data } = await supabase.from("people").select("id").eq("marketing_unsubscribe_token", token).maybeSingle();
      if (data) {
        const { error } = await supabase.from("people").update({ marketing_consent: false, marketing_unsubscribed_at: new Date().toISOString() }).eq("id", data.id);
        ok = !error;
      }
    } catch (err) {
      console.error("[events] unsubscribe:", err?.message);
    }
    if (req.method === "POST") return res.status(ok ? 200 : 404).json({ ok });
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.status(ok ? 200 : 404).send(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Avregistrering</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box;">
<div style="max-width:420px;"><h1 style="font-size:24px;margin:0 0 8px;">${ok ? "Du är avregistrerad" : "Länken fungerar inte"}</h1>
<p style="font-size:15px;line-height:1.5;color:#6e6e73;margin:0;">${ok ? "Du får inga fler utskick från PullUp. Anmäler du dig till ett event igen får du fortfarande bekräftelsen." : "Den här avregistreringslänken är ogiltig eller redan använd."}</p></div></body></html>`);
  };
  app.get("/unsubscribe/:token", unsubscribe);
  app.post("/unsubscribe/:token", unsubscribe);
}
