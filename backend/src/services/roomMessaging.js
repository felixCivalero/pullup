// backend/src/services/roomMessaging.js
//
// Outbound 1:1 (and bulk) messaging straight from The Room composer.
//
// The Room talks to a PERSON, not a channel. The host picks a rail; we send on
// the best honest version of it and log the real channel to the timeline:
//
//   * email     — a personal, plain note (transactional category, no newsletter
//                 chrome). Optionally "dressed up" with the host's brand when the
//                 host opts in (brand lives on what you send, not how you send).
//   * whatsapp  — free text when the 24h conversation window is open (they
//                 messaged recently); otherwise a template via dispatch(), which
//                 re-checks opt-in/suppression and falls to the email floor when
//                 WhatsApp can't deliver (incl. templates not yet Meta-approved).
//
// Instagram outbound still needs the live send path; it honestly reports "not
// available yet" rather than pretend to send.

import { findPersonById, personBelongsToHost, getUserProfile } from "../data.js";
import { enqueueOutbox } from "../email/index.js";
import { buildFromHeader } from "./campaignSender.js";
import { logPersonEvent } from "./personTimeline.js";
import { sendText } from "../whatsapp/index.js";
import { isConversationWindowOpen } from "../whatsapp/repos/whatsappThreadsRepo.js";
import { dispatch } from "../messaging/dispatch.js";

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

// A personal note reads best plain — a light wrapper, no banners or buttons.
// Images embed inline (they render in the email); other files ride as a clean
// download link. No raw-MIME attachments — simpler and more reliable in clients.
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

// Brand-as-opt-in: the SAME note, dressed in the host's identity. Used only when
// the host deliberately chooses "dress this up" — defaults stay bare/personal.
function igHandle(profile) {
  const raw = profile?.brandingLinks?.instagram || "";
  if (!raw) return null;
  const m = String(raw).match(/instagram\.com\/([^/?#]+)/i);
  const h = (m ? m[1] : raw).replace(/^@/, "").replace(/\/+$/, "").trim();
  return h ? `@${h}` : null;
}
function renderBrandedEmail(text, attachments, profile) {
  const accent = (profile?.brandPrimaryColor || "#ec178f").trim();
  const name = ((profile?.name || profile?.brand || "") || "").trim() || "Your host";
  const avatar = profile?.profilePicture || profile?.brandLogoUrl || null;
  const handle = igHandle(profile);
  const bio = (profile?.bio || "").trim();
  const font = (profile?.brandFontFamily || "").trim()
    || "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

  const header = avatar
    ? `<img src="${escapeAttr(avatar)}" width="44" height="44" alt="${escapeAttr(name)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;vertical-align:middle;border:2px solid rgba(255,255,255,.7);" />
       <span style="color:#fff;font-size:17px;font-weight:700;margin-left:10px;vertical-align:middle;">${escapeHtml(name)}</span>`
    : `<span style="color:#fff;font-size:17px;font-weight:700;">${escapeHtml(name)}</span>`;

  const body = escapeHtml(text).replace(/\n/g, "<br>");
  const footerBits = [handle, bio].filter(Boolean).map(escapeHtml).join(" · ");

  return `<div style="background:#f5f5f5;padding:24px 0;font-family:${escapeAttr(font)};">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);">
    <div style="background:${escapeAttr(accent)};padding:18px 24px;">${header}</div>
    <div style="padding:24px;font-size:15px;line-height:1.6;color:#1a1a1a;">${body}${attachmentsHtml(attachments)}</div>
    ${footerBits ? `<div style="border-top:1px solid #eee;padding:14px 24px;font-size:12px;color:#888;">${footerBits}</div>` : ""}
  </div>
</div>`;
}

function textBodyWith(text, attachments = []) {
  const atts = (attachments || []).filter((a) => a?.url);
  if (!atts.length) return text;
  return `${text}\n\nAttachments:\n${atts.map((a) => `- ${a.name || "file"}: ${a.url}`).join("\n")}`;
}
// WhatsApp is plain text — fold attachment URLs into the body (links preview).
function whatsappBody(text, attachments = []) {
  const atts = (attachments || []).filter((a) => a?.url);
  const base = text || "";
  if (!atts.length) return base;
  return `${base}${base ? "\n\n" : ""}${atts.map((a) => a.url).join("\n")}`.trim();
}

let _sendSeq = 0; // disambiguates two sends to the same person in the same ms

function normalizeAttachments(attachments) {
  return (Array.isArray(attachments) ? attachments : [])
    .filter((a) => a && typeof a.url === "string")
    .slice(0, 10)
    .map((a) => ({ url: a.url, name: a.name || "Attachment", isImage: !!a.isImage }));
}

/**
 * Render the email HTML exactly as it would ship (plain or branded), for the
 * composer's live preview — so the host sees their real brand (accent, avatar,
 * footer) on their real draft, not a blind toggle. Same renderers as the send.
 */
export async function renderRoomEmailHtml({ hostId, text = "", attachments = [], branded = false }) {
  const body = (text || "").trim() || "Hey — just thinking of you. Hope you're doing well!";
  const atts = normalizeAttachments(attachments);
  const profile = branded ? await getUserProfile(hostId).catch(() => null) : null;
  return branded ? renderBrandedEmail(body, atts, profile) : textToHtml(body, atts);
}

function logRoomEvent({ personId, hostId, channel, body, attCount }) {
  const attNote = attCount ? ` (+${attCount} attachment${attCount > 1 ? "s" : ""})` : "";
  logPersonEvent({
    personId,
    hostId,
    type: "message_out",
    channel,
    direction: "out",
    body: (body || "(attachment)") + attNote,
    metadata: { source: "room", attachments: attCount },
  }).catch(() => {});
}

/**
 * Send one message from a host to a person in their world.
 * @returns {Promise<{ok:boolean, error?:string, channel?:string}>}
 */
export async function sendRoomMessage({ hostId, personId, channel = "email", text, subject, attachments = [], branded = false }) {
  const body = (text || "").trim();
  const atts = normalizeAttachments(attachments);
  if (!hostId || !personId) return { ok: false, error: "bad_request" };
  if (!body && !atts.length) return { ok: false, error: "empty" };

  // Scope: a host may only message someone already in their world.
  const allowed = await personBelongsToHost(personId, hostId);
  if (!allowed) return { ok: false, error: "not_in_world" };

  const person = await findPersonById(personId);
  if (!person) return { ok: false, error: "no_person" };

  const profile = await getUserProfile(hostId).catch(() => null);
  const fromName = ((profile?.name || profile?.brand || "") || "").trim() || null;
  const subj = (subject || "").trim() || `A note from ${fromName || "your host"}`;
  const emailHtml = () => (branded ? renderBrandedEmail(body, atts, profile) : textToHtml(body, atts));
  const key = () => `room:${hostId}:${personId}:${Date.now()}:${_sendSeq++}`;

  // ── WhatsApp rail — only when the person is honestly reachable there. ──
  const waReachable = !!(person.phone_e164 && person.phone_verified_at);
  if (channel === "whatsapp" && waReachable) {
    try {
      const open = await isConversationWindowOpen({ personId, hostProfileId: hostId });
      if (open) {
        // Inside the 24h window: a real, free-text WhatsApp in the host's voice.
        await sendText({
          to: person.phone_e164,
          body: whatsappBody(body, atts),
          personId,
          hostProfileId: hostId,
          legalBasis: "consent",
          idempotencyKey: key(),
        });
        logRoomEvent({ personId, hostId, channel: "whatsapp", body, attCount: atts.length });
        return { ok: true, channel: "whatsapp" };
      }
      // Window closed: the only WhatsApp-legal path is a template. host_broadcast
      // carries arbitrary body + the host's signature. dispatch() re-checks
      // opt-in/suppression and falls to the email floor if WA can't deliver
      // (e.g. template not yet Meta-approved in prod) — graceful by design.
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
          variables: { host_signature: sig, body: whatsappBody(body, atts) },
        },
        email: {
          subject: subj,
          htmlBody: emailHtml(),
          textBody: textBodyWith(body, atts),
          category: "transactional",
        },
        context: { personId, hostProfileId: hostId, legalBasis: "consent", idempotencyKey: key() },
      });
      const used = r.channel === "whatsapp" ? "whatsapp" : "email";
      logRoomEvent({ personId, hostId, channel: used, body, attCount: atts.length });
      return { ok: true, channel: used };
    } catch {
      // Any WhatsApp error → fall through to the email floor below.
    }
  }

  // ── Email rail (default + fallback). ──
  if (!person.email) return { ok: false, error: "no_email" };
  await enqueueOutbox({
    fromEmail: buildFromHeader(fromName),
    toEmail: person.email,
    subject: subj,
    htmlBody: emailHtml(),
    textBody: textBodyWith(body, atts),
    category: "transactional",
    idempotencyKey: key(),
  });

  // The actual message text lands in the timeline, so the thread shows what was
  // really said (not a summary). Best-effort — never blocks the send.
  logRoomEvent({ personId, hostId, channel: "email", body, attCount: atts.length });
  return { ok: true, channel: "email" };
}

/**
 * Bulk send — one private message each (not a group). The chosen rail is honored
 * per person: WhatsApp-reachable people get WhatsApp, everyone else the email
 * floor. Nothing fails silently — unreachable people are tallied.
 * @returns {Promise<{sent:number, noEmail:number, failed:number, byChannel:object}>}
 */
export async function sendRoomBulk({ hostId, personIds, channel = "email", text, subject, attachments = [], branded = false }) {
  const ids = Array.isArray(personIds) ? personIds : [];
  const out = { sent: 0, noEmail: 0, failed: 0, byChannel: { email: 0, whatsapp: 0 } };
  for (const pid of ids) {
    try {
      const r = await sendRoomMessage({ hostId, personId: pid, channel, text, subject, attachments, branded });
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
