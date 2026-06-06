// backend/src/services/roomMessaging.js
//
// Outbound messaging from The Room — 1:1 and small, event-anchored multi-sends.
//
// PullUp comms are RELATIONSHIP-grade, not campaign-grade. Every message is
// native and simple: words, maybe an image, and optionally a specific event
// "included" so the recipient gets context. NO branded templates, NO block
// designer, NO mass-marketing styling — that lives in the past (export your
// contacts if you need to blast elsewhere). The styled lifecycle sends
// (confirmations, reminders) run automatically and aren't composed here.
//
//   * email     — a personal, plain note; an included event rides as a small
//                 inline card (cover, title, date, link). transactional.
//   * whatsapp  — free text inside the 24h window (else host_broadcast template
//                 via dispatch → email floor); an included event rides as its
//                 link (unfurls via the event's OG tags).
//
// Instagram outbound still needs the live send path; it honestly reports "not
// available yet" rather than pretend to send.

import { findPersonById, personBelongsToHost, getUserProfile } from "../data.js";
import { SES_FROM_EMAIL } from "../email/config.js";
import { logPersonEvent } from "./personTimeline.js";
import { dispatch } from "../messaging/dispatch.js";
import { supabase } from "../supabase.js";

// Build a "Name <addr>" From header from a display name. The address part
// always comes from SES_FROM_EMAIL — the host display name is the only thing
// we override (a warmer From without exposing the domain config). Inlined here
// when the campaign sender (its original home) was removed.
function buildFromHeader(displayName) {
  const m = SES_FROM_EMAIL.match(/<([^>]+)>/);
  const address = m ? m[1] : SES_FROM_EMAIL;
  if (displayName && typeof displayName === "string" && displayName.trim()) {
    const safe = displayName.replace(/["\r\n]/g, "").trim();
    return `"${safe}" <${address}>`;
  }
  return SES_FROM_EMAIL;
}

const FRONTEND_BASE =
  process.env.NODE_ENV === "production"
    ? (process.env.FRONTEND_URL || "https://pullup.se")
    : (process.env.FRONTEND_URL || "http://localhost:5173");

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

// A personal note reads best plain — a light wrapper, no banners or buttons.
// Images embed inline; other files ride as a clean download link.
function textToHtml(text, attachments = []) {
  const safe = escapeHtml(text).replace(/\n/g, "<br>");
  let html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;">${safe}</div>`;
  html += attachmentsHtml(attachments);
  return html;
}
function attachmentsHtml(attachments = []) {
  const images = attachments.filter((a) => a?.isImage && a?.url);
  const files = attachments.filter((a) => a?.url && !a?.isImage);
  let html = "";
  for (const img of images) {
    html += `<div style="margin-top:14px;"><img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.name || "")}" style="max-width:100%;height:auto;border-radius:10px;" /></div>`;
  }
  if (files.length) {
    html += `<div style="margin-top:14px;font-size:14px;line-height:1.8;">` +
      files.map((f) => `&#128206; <a href="${escapeAttr(f.url)}" style="color:#ec178f;text-decoration:none;">${escapeHtml(f.name || "Attachment")}</a>`).join("<br>") +
      `</div>`;
  }
  return html;
}

// A SMALL inline event card — context, not a campaign: cover thumb + title +
// date + a link. Deliberately neutral (this is convenience, not branding).
function eventCardHtml(event) {
  if (!event) return "";
  const url = event.slug ? `${FRONTEND_BASE}/e/${event.slug}` : null;
  const meta = [event.whenLabel, event.location].filter(Boolean).join(" · ");
  const cover = event.coverImageUrl
    ? `<img src="${escapeAttr(event.coverImageUrl)}" alt="" width="64" height="64" style="width:64px;height:64px;border-radius:10px;object-fit:cover;" />`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;border:1px solid #eee;border-radius:12px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <tr>
      ${cover ? `<td style="padding:12px 0 12px 12px;vertical-align:middle;">${cover}</td>` : ""}
      <td style="padding:12px;vertical-align:middle;">
        <div style="font-size:15px;font-weight:700;color:#1a1a1a;">${escapeHtml(event.title || "Event")}</div>
        ${meta ? `<div style="font-size:13px;color:#666;margin-top:2px;">${escapeHtml(meta)}</div>` : ""}
        ${url ? `<a href="${escapeAttr(url)}" style="display:inline-block;margin-top:6px;font-size:13px;font-weight:600;color:#ec178f;text-decoration:none;">View event →</a>` : ""}
      </td>
    </tr>
  </table>`;
}

// Plain-text form of an included event (for WhatsApp/IG + email text part).
function eventTextLine(event) {
  if (!event) return "";
  const url = event.slug ? `${FRONTEND_BASE}/e/${event.slug}` : "";
  const meta = [event.whenLabel, event.location].filter(Boolean).join(" · ");
  return `\n\n${event.title || "Event"}${meta ? ` — ${meta}` : ""}${url ? `\n${url}` : ""}`;
}

function textBodyWith(text, attachments = [], event = null) {
  const atts = (attachments || []).filter((a) => a?.url);
  let out = text || "";
  if (atts.length) out += `\n\nAttachments:\n${atts.map((a) => `- ${a.name || "file"}: ${a.url}`).join("\n")}`;
  out += eventTextLine(event);
  return out;
}
// WhatsApp/IG is plain text — fold attachment URLs + the event link into it.
function whatsappBody(text, attachments = [], event = null) {
  const atts = (attachments || []).filter((a) => a?.url);
  let base = text || "";
  if (atts.length) base += `${base ? "\n\n" : ""}${atts.map((a) => a.url).join("\n")}`;
  base += eventTextLine(event);
  return base.trim();
}

let _sendSeq = 0; // disambiguates two sends to the same person in the same ms

function normalizeAttachments(attachments) {
  return (Array.isArray(attachments) ? attachments : [])
    .filter((a) => a && typeof a.url === "string")
    .slice(0, 10)
    .map((a) => ({ url: a.url, name: a.name || "Attachment", isImage: !!a.isImage }));
}

// Resolve an event cover (stored as a bucket path) to a renderable URL.
function resolveCover(raw) {
  if (!raw) return null;
  if (String(raw).startsWith("http")) return raw;
  try {
    let fp = raw;
    if (raw.includes("event-images/")) { const m = raw.match(/event-images\/([^?]+)/); if (m) fp = m[1]; }
    const { data } = supabase.storage.from("event-images").getPublicUrl(fp);
    return data?.publicUrl || raw;
  } catch { return raw; }
}

// Load the bits of an event needed to "include" it in a message.
async function getEventForEmail(eventId) {
  if (!eventId) return null;
  const { data: e } = await supabase
    .from("events")
    .select("id, title, slug, starts_at, location, cover_image_url, image_url")
    .eq("id", eventId)
    .maybeSingle();
  if (!e) return null;
  let whenLabel = "";
  try {
    whenLabel = e.starts_at
      ? new Date(e.starts_at).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";
  } catch {}
  return {
    id: e.id,
    title: e.title || "the event",
    slug: e.slug || null,
    coverImageUrl: resolveCover(e.cover_image_url || e.image_url),
    whenLabel,
    location: e.location || "",
  };
}

const emailHtmlFor = (body, atts, event) => textToHtml(body, atts) + eventCardHtml(event);

function logRoomEvent({ personId, hostId, channel, body, attachments = [], event = null, location = null, providerMid = null, status = null }) {
  const atts = Array.isArray(attachments) ? attachments : [];
  logPersonEvent({
    personId,
    hostId,
    type: "message_out",
    channel,
    direction: "out",
    body: body || (atts.length || event || location ? "" : "(message)"),
    // Persist the real attachments + (when attached) the event so they render
    // as durable images / an event card in the thread, not a count or a note.
    metadata: {
      source: "room",
      attachments: atts,
      ...(status ? { status, sent_at: new Date().toISOString() } : {}),
      ...(providerMid ? { provider_mid: providerMid } : {}),
      ...(event
        ? {
            event: {
              id: event.id || null,
              title: event.title || null,
              slug: event.slug || null,
              coverImageUrl: event.coverImageUrl || null,
              whenLabel: event.whenLabel || null,
              location: event.location || null,
            },
          }
        : {}),
      ...(location ? { location: { label: location.label || null, url: location.url || null } } : {}),
    },
  }).catch(() => {});
}

/**
 * Send one message from a host to a person in their world. Optionally include a
 * specific event (eventId): an inline card on email, a link on WhatsApp/IG.
 * @returns {Promise<{ok:boolean, error?:string, channel?:string}>}
 */
export async function sendRoomMessage({ hostId, personId, channel = "email", text, subject, attachments = [], eventId = null, event = null, location = null }) {
  const body = (text || "").trim();
  const atts = normalizeAttachments(attachments);
  const loc = location && location.url ? { label: (location.label || "Location").trim() || "Location", url: location.url } : null;
  if (!hostId || !personId) return { ok: false, error: "bad_request" };
  if (!body && !atts.length && !eventId && !loc) return { ok: false, error: "empty" };

  // Scope: a host may only message someone already in their world.
  const allowed = await personBelongsToHost(personId, hostId);
  if (!allowed) return { ok: false, error: "not_in_world" };

  const person = await findPersonById(personId);
  if (!person) return { ok: false, error: "no_person" };

  const profile = await getUserProfile(hostId).catch(() => null);
  const fromName = ((profile?.name || profile?.brand || "") || "").trim() || null;
  const subj = (subject || "").trim() || `A note from ${fromName || "your host"}`;
  const evt = eventId ? (event || (await getEventForEmail(eventId))) : null;
  // Location renders as a clean clickable link, never a raw URL: an <a> on
  // email; the text rails (WA/IG) fold address + url into the body (they
  // linkify URLs natively).
  const locHtml = loc ? `<p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><a href="${escapeAttr(loc.url)}" style="color:#ec178f;font-weight:600;text-decoration:none;">📍 ${escapeHtml(loc.label)}</a></p>` : "";
  const bodyForText = loc ? `${body}${body ? "\n\n" : ""}📍 ${loc.label}\n${loc.url}` : body;
  const htmlBody = emailHtmlFor(body, atts, evt) + locHtml;
  const key = () => `room:${hostId}:${personId}:${Date.now()}:${_sendSeq++}`;
  const logArgs = { personId, hostId, body, attachments: atts, event: evt, location: loc };

  // ── One unified route for every rail. dispatch() owns the channel choice
  //    and every per-channel constraint — WhatsApp (24h window → free text,
  //    else approved template; opt-in/suppression), Instagram (24h standard +
  //    24h–7d human-agent windows, no templates), and the email floor — plus
  //    graceful fallback. Room messages are always host-typed, so
  //    humanComposed=true (lets the IG human-agent reply through). ──
  const sig = ((profile?.whatsappSignature || (fromName ? `It's ${fromName}` : "PullUp")) || "").trim();
  // Clean note (body + location + event link, NO attachment URLs) — each rail
  // composes attachments its own way: IG sends real images, WhatsApp folds the
  // URLs in, the template carries the folded text. Email embeds them in htmlBody.
  const cleanText = whatsappBody(bodyForText, [], evt);
  const foldedText = whatsappBody(bodyForText, atts, evt);
  const r = await dispatch({
    recipient: {
      id: personId,
      email: person.email,
      phone_e164: person.phone_e164,
      phone_verified_at: person.phone_verified_at,
      ig_user_id: person.ig_user_id || person.igUserId || null,
    },
    hostProfile: profile,
    preferredChannel: channel,
    text: cleanText,
    attachments: atts,
    whatsapp: {
      templateKey: "host_broadcast",
      variables: { host_signature: sig, body: foldedText },
    },
    email: {
      subject: subj,
      htmlBody,
      textBody: textBodyWith(bodyForText, atts, evt),
      fromEmail: buildFromHeader(fromName),
      category: "transactional",
    },
    humanComposed: true,
    context: { personId, hostProfileId: hostId, legalBasis: "consent", idempotencyKey: key() },
  });

  if (r.channel === "suppressed" || r.dropped) {
    // No rail worked and there's no email floor to catch it — surface the real
    // reason (e.g. ig window expired / not connected) instead of a vague 400.
    return { ok: false, error: "undeliverable", reasons: r.reasons };
  }
  // status starts at "sent"; IG read receipts flip it to "read" (foundation for
  // WhatsApp-style sent → delivered → read ticks, later pushable over a socket).
  logRoomEvent({ ...logArgs, channel: r.channel, providerMid: r.mid || null, status: "sent" });
  return { ok: true, channel: r.channel };
}

/**
 * Small, event-anchored multi-send — one private message each (not a group).
 * WhatsApp-reachable people get WhatsApp (native text + event link); everyone
 * else gets the email (with the inline event card). Nothing fails silently.
 * @returns {Promise<{sent:number, noEmail:number, failed:number, byChannel:object}>}
 */
export async function sendRoomBulk({ hostId, personIds, channel = "whatsapp", text, subject, attachments = [], eventId = null }) {
  const ids = Array.isArray(personIds) ? personIds : [];
  const out = { sent: 0, noEmail: 0, failed: 0, byChannel: { email: 0, whatsapp: 0 } };
  // Resolve the included event ONCE for the whole send.
  const event = eventId ? await getEventForEmail(eventId) : null;
  for (const pid of ids) {
    try {
      const r = await sendRoomMessage({ hostId, personId: pid, channel, text, subject, attachments, eventId, event });
      if (r.ok) {
        out.sent++;
        if (r.channel) out.byChannel[r.channel] = (out.byChannel[r.channel] || 0) + 1;
      } else if (r.error === "no_email") out.noEmail++;
      else out.failed++;
    } catch {
      out.failed++;
    }
  }
  return out;
}
