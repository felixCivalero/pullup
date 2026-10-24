// The admin side of the event platform (owner only): every event on PullUp,
// create/edit, the guest list, the CRM of everyone across all events, and
// mail to a list. Sending has no paywall yet — that comes with going live
// (Stripe → PullUp pays Resend). See lib/eventPlatform.js.
import crypto from "crypto";
import { requireOwner } from "../middleware/requireOwner.js";
import { supabase } from "../supabase.js";
import { sendEmail } from "../email/index.js";
import { selectAllPaged } from "../lib/selectAllPaged.js";
import { EVENT_IMAGE_BUCKET, eventText, imageUrl, makeSlug, sectionsFor, summarizePeople, pickAudience } from "../lib/eventPlatform.js";
import { broadcastEmail } from "../lib/eventEmails.js";
import { renderFollowUpEmailTemplate, renderTemplateSubject, renderTemplateText } from "../services/followUpTemplateService.js";
import { apiBase, eventUrl } from "./events.js";

// New events belong to Felix's host account from the old app (36 events there).
const HOST_ID = process.env.EVENT_HOST_ID || "f3394b03-c5a0-4e8a-b001-8ae2175c85ff";
const EVENT_COLUMNS =
  "id, host_id, slug, title, description, sections, location, starts_at, ends_at, timezone, image_url, cover_image_url, total_capacity, status, kind, created_at";
const PEOPLE_COLUMNS =
  "id, name, email, phone, phone_e164, instagram, created_at, acquisition_channel, import_source, marketing_consent, marketing_unsubscribed_at, do_not_contact, anonymized_at, marketing_unsubscribe_token";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const STATUS = { not_found: 404, invalid: 400, empty: 400 };

function handle(fn, okStatus = 200) {
  return [
    requireOwner,
    async (req, res) => {
      try {
        const out = await fn(req, res);
        if (res.headersSent) return undefined;
        if (out?.error) return res.status(STATUS[out.error] || 500).json({ error: out.error, ...(out.detail ? { detail: out.detail } : {}) });
        return res.status(okStatus).json(out);
      } catch (err) {
        console.error(`[admin/events] ${req.method} ${req.path}:`, err?.message);
        return res.status(500).json({ error: "failed" });
      }
    },
  ];
}

const loadEvents = () =>
  selectAllPaged(() => supabase.from("events").select(EVENT_COLUMNS).or("kind.is.null,kind.eq.event").order("starts_at", { ascending: false }));
const loadRsvps = () => selectAllPaged(() => supabase.from("rsvps").select("id, event_id, person_id, status, pulled_up, created_at, marketing_opt_in").order("created_at", { ascending: true }));
const loadPeople = () => selectAllPaged(() => supabase.from("people").select(PEOPLE_COLUMNS).order("created_at", { ascending: true }));
const loadPullups = () => selectAllPaged(() => supabase.from("pullups").select("event_id, person_id"));

function adminShape(ev, counts = {}, hosts = new Map()) {
  return {
    id: ev.id,
    slug: ev.slug,
    title: ev.title,
    text: eventText(ev),
    location: ev.location,
    startsAt: ev.starts_at,
    endsAt: ev.ends_at,
    timezone: ev.timezone || "Europe/Stockholm",
    imagePath: ev.cover_image_url || ev.image_url || null,
    imageUrl: imageUrl(ev.cover_image_url || ev.image_url, process.env.SUPABASE_URL),
    capacity: ev.total_capacity,
    status: ev.status,
    mine: ev.host_id === HOST_ID,
    host: hosts.get(ev.host_id) || null,
    url: eventUrl(ev.slug),
    attending: counts.attending || 0,
    waitlist: counts.waitlist || 0,
    pulledUp: counts.pulledUp || 0,
  };
}

// Only these can be set from the admin form; everything else stays as is.
function eventPatch(body) {
  const patch = {};
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 160);
  if (typeof body.text === "string") {
    patch.description = body.text.trim().slice(0, 8000);
    patch.sections = sectionsFor(patch.description);
  }
  if (typeof body.location === "string") patch.location = body.location.trim().slice(0, 300);
  for (const [k, col] of [["startsAt", "starts_at"], ["endsAt", "ends_at"]]) {
    if (body[k] === null || body[k] === "") patch[col] = null;
    else if (typeof body[k] === "string" && !Number.isNaN(Date.parse(body[k]))) patch[col] = new Date(body[k]).toISOString();
  }
  if (typeof body.timezone === "string" && body.timezone) patch.timezone = body.timezone.slice(0, 64);
  if (body.capacity === null || body.capacity === "") patch.total_capacity = null;
  else if (Number.isInteger(Number(body.capacity)) && Number(body.capacity) > 0) patch.total_capacity = Number(body.capacity);
  if (typeof body.imagePath === "string" || body.imagePath === null) {
    patch.image_url = body.imagePath || null;
    patch.cover_image_url = body.imagePath || null;
  }
  if (body.status === "PUBLISHED" || body.status === "DRAFT") patch.status = body.status;
  return patch;
}

// A send runs after the response: 100 mails at a time, a pause of ~600 ms
// between chunks (under Resend's rate limit). Each mail is logged in
// email_outbox under one campaign_tag. `compose(recipient, unsubscribeUrl)`
// builds each mail ({ subject, html, text }).
async function deliver({ recipients, subject, compose, logBody, from: fromOverride, tag }) {
  const unsub = new Map();
  const needToken = recipients.filter((r) => r.personId && !r.token);
  for (const r of needToken) {
    const token = crypto.randomBytes(18).toString("base64url");
    const { error } = await supabase.from("people").update({ marketing_unsubscribe_token: token }).eq("id", r.personId);
    if (!error) unsub.set(r.personId, token);
  }
  const from = fromOverride || process.env.EVENT_FROM_EMAIL || '"PullUp" <no-reply@pullup.se>';
  const replyTo = process.env.EVENT_REPLY_TO || "felix@pullup.se";
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100);
    const rows = [];
    await Promise.all(chunk.map(async (r) => {
      const token = r.token || unsub.get(r.personId);
      const unsubscribeUrl = token ? `${apiBase()}/unsubscribe/${token}` : `${apiBase()}/unsubscribe/none`;
      const mail = compose(r, unsubscribeUrl);
      try {
        const out = await sendEmail({
          from,
          to: r.email,
          ...mail,
          replyTo,
          headers: token ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : null,
        });
        sent += 1;
        rows.push({ to_email: r.email, person_id: r.personId, subject: mail.subject, status: "sent", provider_message_id: out?.messageId || null, legal_basis: r.basis });
      } catch (err) {
        failed += 1;
        rows.push({ to_email: r.email, person_id: r.personId, subject: mail.subject, status: "failed", last_error_message: String(err?.message || "").slice(0, 300), legal_basis: r.basis });
      }
    }));
    const now = new Date().toISOString();
    await supabase.from("email_outbox").insert(rows.map((row) => ({
      provider: "resend",
      from_email: from,
      subject,
      ...row,
      text_body: logBody,
      attempts: 1,
      category: "event_broadcast",
      campaign_tag: tag,
      created_at: now,
      updated_at: now,
    }))).then(({ error }) => error && console.error("[admin/events] outbox log failed:", error.message));
    if (i + 100 < recipients.length) await new Promise((r) => setTimeout(r, 600));
  }
  console.log(`[admin/events] send ${tag}: ${sent} sent, ${failed} failed`);
}

export function registerAdminEventRoutes(app) {
  // Every event on the platform, newest first, with sign-up counts.
  app.get("/admin/events", ...handle(async () => {
    const [events, rsvps, hostsRes] = await Promise.all([
      loadEvents(),
      loadRsvps(),
      supabase.from("profiles").select("id, name, brand"),
    ]);
    const hosts = new Map((hostsRes.data || []).map((p) => [p.id, p.brand || p.name || null]));
    const counts = new Map();
    for (const r of rsvps) {
      const c = counts.get(r.event_id) || { attending: 0, waitlist: 0, pulledUp: 0 };
      if (r.status === "attending") c.attending += 1;
      if (r.status === "waitlist") c.waitlist += 1;
      if (r.pulled_up) c.pulledUp += 1;
      counts.set(r.event_id, c);
    }
    return { events: events.map((e) => adminShape(e, counts.get(e.id), hosts)) };
  }));

  app.post("/admin/events", ...handle(async (req) => {
    const patch = eventPatch(req.body || {});
    if (!patch.title) return { error: "invalid", detail: "title" };
    if (!patch.starts_at) return { error: "invalid", detail: "startsAt" };
    const row = {
      host_id: HOST_ID,
      slug: makeSlug(patch.title),
      kind: "event",
      visibility: "public",
      status: "DRAFT",
      timezone: "Europe/Stockholm",
      created_via: "create",
      require_email: true,
      sections: sectionsFor(patch.description || ""),
      ...patch,
    };
    const { data, error } = await supabase.from("events").insert(row).select(EVENT_COLUMNS).single();
    if (error) throw error;
    return { event: adminShape(data) };
  }, 201));

  // One event with its guest list.
  app.get("/admin/events/:id", ...handle(async (req) => {
    const { data: ev, error } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", req.params.id).maybeSingle();
    if (error) throw error;
    if (!ev) return { error: "not_found" };
    const rsvps = await selectAllPaged(() =>
      supabase.from("rsvps").select("id, person_id, status, pulled_up, created_at, marketing_opt_in").eq("event_id", ev.id).order("created_at", { ascending: true }),
    );
    const ids = [...new Set(rsvps.map((r) => r.person_id).filter(Boolean))];
    const people = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error: pErr } = await supabase.from("people").select(PEOPLE_COLUMNS).in("id", ids.slice(i, i + 200));
      if (pErr) throw pErr;
      people.push(...(data || []));
    }
    const byId = new Map(people.map((p) => [p.id, p]));
    const guests = rsvps
      .map((r) => {
        const p = byId.get(r.person_id) || {};
        return {
          rsvpId: r.id,
          personId: r.person_id,
          name: p.anonymized_at ? "(anonymiserad)" : p.name || "",
          email: p.anonymized_at ? "" : p.email || "",
          status: r.status,
          pulledUp: !!r.pulled_up,
          signedUpAt: r.created_at,
          consent: !!p.marketing_consent && !p.marketing_unsubscribed_at && !p.do_not_contact,
        };
      });
    const counts = { attending: 0, waitlist: 0, pulledUp: 0 };
    for (const g of guests) {
      if (g.status === "attending") counts.attending += 1;
      if (g.status === "waitlist") counts.waitlist += 1;
      if (g.pulledUp) counts.pulledUp += 1;
    }
    return { event: adminShape(ev, counts), guests };
  }));

  app.patch("/admin/events/:id", ...handle(async (req) => {
    const patch = eventPatch(req.body || {});
    if ("title" in patch && !patch.title) return { error: "invalid", detail: "title" };
    if (!Object.keys(patch).length) return { error: "empty" };
    const { data, error } = await supabase.from("events").update(patch).eq("id", req.params.id).select(EVENT_COLUMNS).maybeSingle();
    if (error) throw error;
    if (!data) return { error: "not_found" };
    return { event: adminShape(data) };
  }));

  // Move a guest between attending / waitlist / cancelled, or mark them as came.
  app.patch("/admin/rsvps/:id", ...handle(async (req) => {
    const patch = {};
    const { status, pulledUp } = req.body || {};
    if (["attending", "waitlist", "cancelled"].includes(status)) {
      patch.status = status;
      patch.booking_status = { attending: "CONFIRMED", waitlist: "WAITLIST", cancelled: "CANCELLED" }[status];
    }
    if (typeof pulledUp === "boolean") patch.pulled_up = pulledUp;
    if (!Object.keys(patch).length) return { error: "empty" };
    const { data, error } = await supabase.from("rsvps").update(patch).eq("id", req.params.id).select("id, status, pulled_up").maybeSingle();
    if (error) throw error;
    if (!data) return { error: "not_found" };
    return { rsvp: data };
  }));

  // Signed upload URL: the browser uploads the cover straight to Storage.
  app.post("/admin/events/upload-url", ...handle(async (req) => {
    const ext = EXT[req.body?.mimeType] || "jpg";
    const path = `admin/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage.from(EVENT_IMAGE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error || new Error("upload_url_failed");
    return { bucket: EVENT_IMAGE_BUCKET, path, token: data.token, publicUrl: imageUrl(path, process.env.SUPABASE_URL) };
  }));

  // The CRM: every person on PullUp, with their events.
  app.get("/admin/people", ...handle(async () => {
    const [people, rsvps, events, pullups] = await Promise.all([loadPeople(), loadRsvps(), loadEvents(), loadPullups()]);
    const rows = summarizePeople({ people, rsvps, events, pullups });
    return {
      people: rows,
      events: events.map((e) => ({ id: e.id, title: e.title, startsAt: e.starts_at, mine: e.host_id === HOST_ID })),
    };
  }));

  // How many a send would reach, before sending.
  app.post("/admin/sends/preview", ...handle(async (req) => {
    const [people, rsvps, pullups] = await Promise.all([loadPeople(), loadRsvps(), loadPullups()]);
    const recipients = pickAudience({ audience: req.body?.audience, people, rsvps, pullups });
    return { count: recipients.length, sample: recipients.slice(0, 5).map((r) => r.name || r.email) };
  }));

  // Send. `test: true` sends one copy to the owner only.
  // Two kinds of mail: a plain message (`body`, from an event's page) or the
  // mail module's blocks (`blocks` + previewText + fromName, /admin/mail).
  app.post("/admin/sends", ...handle(async (req) => {
    const { audience, subject, body, blocks, previewText, fromName, eventId, test } = req.body || {};
    const cleanSubject = typeof subject === "string" ? subject.trim().slice(0, 200) : "";
    const cleanBody = typeof body === "string" ? body.trim().slice(0, 20000) : "";
    const cleanBlocks = Array.isArray(blocks) ? blocks.slice(0, 60) : null;
    if (!cleanSubject || (!cleanBody && !cleanBlocks?.length)) return { error: "invalid", detail: "subject_body" };
    if (cleanBlocks && JSON.stringify(cleanBlocks).length > 200000) return { error: "invalid", detail: "too_large" };
    let event = null;
    if (eventId) {
      const { data } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle();
      event = data || null;
    }
    const tokenEvent = event ? { title: event.title, startsAt: event.starts_at } : null;
    const name = typeof fromName === "string" ? fromName.replace(/["<>\r\n]/g, "").trim().slice(0, 60) : "";
    const from = name ? `"${name}" <no-reply@pullup.se>` : undefined;
    const templateContent = cleanBlocks ? { blocks: cleanBlocks, previewText: typeof previewText === "string" ? previewText.slice(0, 200) : "" } : null;
    const compose = templateContent
      ? (r, unsubscribeUrl) => {
          const person = { name: r.name };
          return {
            subject: renderTemplateSubject(r.basis === "test" ? `[Test] ${cleanSubject}` : cleanSubject, { person, event: tokenEvent }),
            html: renderFollowUpEmailTemplate({ templateContent, person, event: tokenEvent, unsubscribeUrl }),
            text: renderTemplateText({ templateContent, person, event: tokenEvent, unsubscribeUrl }),
          };
        }
      : (r, unsubscribeUrl) => broadcastEmail({
          subject: r.basis === "test" ? `[Test] ${cleanSubject}` : cleanSubject,
          body: cleanBody,
          unsubscribeUrl,
          event,
          eventUrl: event ? eventUrl(event.slug) : null,
        });
    const logBody = cleanBody || renderTemplateText({ templateContent, person: { name: "" }, event: tokenEvent });
    const tag = `event_broadcast:${new Date().toISOString().slice(0, 16)}:${crypto.randomBytes(3).toString("hex")}`;
    if (test) {
      const to = req.user.email;
      await deliver({ recipients: [{ personId: null, email: to, name: "Felix", basis: "test", token: "test" }], subject: cleanSubject, compose, logBody, from, tag: `${tag}:test` });
      return { ok: true, test: true, to };
    }
    const [people, rsvps, pullups] = await Promise.all([loadPeople(), loadRsvps(), loadPullups()]);
    const tokens = new Map(people.map((p) => [p.id, p.marketing_unsubscribe_token]));
    const recipients = pickAudience({ audience, people, rsvps, pullups }).map((r) => ({ ...r, token: tokens.get(r.personId) || null }));
    if (!recipients.length) return { error: "empty", detail: "no_recipients" };
    deliver({ recipients, subject: cleanSubject, compose, logBody, from, tag }).catch((err) => console.error("[admin/events] send failed:", err?.message));
    return { ok: true, queued: recipients.length, tag };
  }, 202));

  // Earlier sends from here, newest first.
  app.get("/admin/sends", ...handle(async () => {
    const rows = await selectAllPaged(() =>
      supabase.from("email_outbox").select("campaign_tag, subject, status, created_at").eq("category", "event_broadcast").order("created_at", { ascending: false }),
    );
    const by = new Map();
    for (const r of rows) {
      if (r.campaign_tag?.endsWith(":test")) continue;
      const s = by.get(r.campaign_tag) || { tag: r.campaign_tag, subject: r.subject, at: r.created_at, sent: 0, failed: 0 };
      if (r.status === "sent") s.sent += 1;
      else s.failed += 1;
      by.set(r.campaign_tag, s);
    }
    return { sends: [...by.values()].slice(0, 50) };
  }));
}
