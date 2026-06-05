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
import { enqueueOutbox } from "../email/index.js";
import { SES_FROM_EMAIL } from "../email/config.js";
import { logPersonEvent } from "./personTimeline.js";
import { sendText } from "../whatsapp/index.js";
import { isConversationWindowOpen } from "../whatsapp/repos/whatsappThreadsRepo.js";
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

function logRoomEvent({ personId, hostId, channel, body, attachments = [], eventTitle }) {
  const atts = Array.isArray(attachments) ? attachments : [];
  const bits = [];
  if (eventTitle) bits.push(`📅 ${eventTitle}`);
  const note = bits.length ? ` (${bits.join(", ")})` : "";
  logPersonEvent({
    personId,
    hostId,
    type: "message_out",
    channel,
    direction: "out",
    body: (body || (atts.length ? "" : "(message)")) + note,
    // Persist the real attachments (url/name/isImage) so they render in the
    // thread and survive reloads — not just a count.
    metadata: { source: "room", attachments: atts },
  }).catch(() => {});
}

/**
 * Send one message from a host to a person in their world. Optionally include a
 * specific event (eventId): an inline card on email, a link on WhatsApp/IG.
 * @returns {Promise<{ok:boolean, error?:string, channel?:string}>}
 */
export async function sendRoomMessage({ hostId, personId, channel = "email", text, subject, attachments = [], eventId = null, event = null }) {
  const body = (text || "").trim();
  const atts = normalizeAttachments(attachments);
  if (!hostId || !personId) return { ok: false, error: "bad_request" };
  if (!body && !atts.length && !eventId) return { ok: false, error: "empty" };

  // Scope: a host may only message someone already in their world.
  const allowed = await personBelongsToHost(personId, hostId);
  if (!allowed) return { ok: false, error: "not_in_world" };

  const person = await findPersonById(personId);
  if (!person) return { ok: false, error: "no_person" };

  const profile = await getUserProfile(hostId).catch(() => null);
  const fromName = ((profile?.name || profile?.brand || "") || "").trim() || null;
  const subj = (subject || "").trim() || `A note from ${fromName || "your host"}`;
  const evt = eventId ? (event || (await getEventForEmail(eventId))) : null;
  const htmlBody = emailHtmlFor(body, atts, evt);
  const key = () => `room:${hostId}:${personId}:${Date.now()}:${_sendSeq++}`;
  const logArgs = { personId, hostId, body, attachments: atts, eventTitle: evt?.title };

  // ── WhatsApp rail — only when the person is honestly reachable there. ──
  const waReachable = !!(person.phone_e164 && person.phone_verified_at);
  if (channel === "whatsapp" && waReachable) {
    try {
      const open = await isConversationWindowOpen({ personId, hostProfileId: hostId });
      if (open) {
        // Inside the 24h window: a real, free-text WhatsApp in the host's voice.
        await sendText({
          to: person.phone_e164,
          body: whatsappBody(body, atts, evt),
          personId,
          hostProfileId: hostId,
          legalBasis: "consent",
          idempotencyKey: key(),
        });
        logRoomEvent({ ...logArgs, channel: "whatsapp" });
        return { ok: true, channel: "whatsapp" };
      }
      // Window closed: the only WhatsApp-legal path is a template. dispatch()
      // re-checks opt-in/suppression and falls to the email floor if WA can't
      // deliver (e.g. template not yet Meta-approved) — graceful by design.
      const sig = ((profile?.whatsappSignature || (fromName ? `It's ${fromName}` : "PullUp")) || "").trim();
      const r = await dispatch({
        recipient: {
          id: personId,
          email: person.email,
          phone_e164: person.phone_e164,
          phone_verified_at: person.phone_verified_at,
        },
        hostProfile: profile,
        whatsapp: {
          templateKey: "host_broadcast",
          variables: { host_signature: sig, body: whatsappBody(body, atts, evt) },
        },
        email: {
          subject: subj,
          htmlBody,
          textBody: textBodyWith(body, atts, evt),
          category: "transactional",
        },
        context: { personId, hostProfileId: hostId, legalBasis: "consent", idempotencyKey: key() },
      });
      const used = r.channel === "whatsapp" ? "whatsapp" : "email";
      logRoomEvent({ ...logArgs, channel: used });
      return { ok: true, channel: used };
    } catch {
      // Any WhatsApp error → fall through to the email floor below.
    }
  }

  // ── Instagram rail — in-window live chat ONLY. Meta has no IG message
  //    templates + a 24h rolling window, so a reply is legal only while the
  //    window (opened by the guest's inbound DM) is open; otherwise we fall to
  //    the email floor. Never a "template" on IG. ──
  const igId = person.ig_user_id || person.igUserId || null;
  if (channel === "instagram" && igId) {
    try {
      const { isConversationWindowOpen: igWindowOpen, upsertThreadFromMessage: igUpsert } =
        await import("../instagram/repos/instagramThreadsRepo.js");
      if (await igWindowOpen({ personId, hostProfileId: hostId })) {
        const { getConnectionForHost, getCredentialsByIgUserId } =
          await import("../instagram/repos/instagramConnectionsRepo.js");
        const conn = await getConnectionForHost(hostId);
        const creds = conn?.ig_user_id ? await getCredentialsByIgUserId(conn.ig_user_id) : null;
        if (creds?.accessToken) {
          const { sendMessage } = await import("../instagram/providers/igGraphClient.js");
          await sendMessage({
            igUserId: creds.igUserId,
            accessToken: creds.accessToken,
            recipientId: igId,
            text: whatsappBody(body, atts, evt),
          });
          await igUpsert({
            personId, hostProfileId: hostId, igUserId: igId,
            direction: "outbound", preview: body || "[media]",
          });
          logRoomEvent({ ...logArgs, channel: "instagram" });
          return { ok: true, channel: "instagram" };
        }
      }
      // Window closed (or no creds) → fall through to the email floor.
    } catch {
      // Any IG error → fall through to email.
    }
  }

  // ── Email rail (default + fallback). ──
  if (!person.email) return { ok: false, error: "no_email" };
  await enqueueOutbox({
    fromEmail: buildFromHeader(fromName),
    toEmail: person.email,
    subject: subj,
    htmlBody,
    textBody: textBodyWith(body, atts, evt),
    category: "transactional",
    idempotencyKey: key(),
    // Host's own message to a guest — make the reply route back to this thread.
    personId,
    hostProfileId: hostId,
  });
  logRoomEvent({ ...logArgs, channel: "email" });
  return { ok: true, channel: "email" };
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
