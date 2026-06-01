// backend/src/services/roomMessaging.js
//
// Outbound 1:1 (and bulk) messaging straight from The Room composer.
//
// Email is the rail that's fully wired today: we drop a personal, plain note
// into the existing email outbox (transactional category — NOT a newsletter, so
// no campaign tracking/unsubscribe chrome; it reads like a real message, not
// marketing) and log it to the person's timeline so it shows in their thread.
//
// Instagram / WhatsApp outbound need the live channel tokens, so those rails
// honestly report "not available yet" rather than pretend to send.

import { findPersonById, personBelongsToHost, getUserProfile } from "../data.js";
import { enqueueOutbox } from "../email/index.js";
import { buildFromHeader } from "./campaignSender.js";
import { logPersonEvent } from "./personTimeline.js";

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// A personal note reads best plain — a light wrapper, no banners or buttons.
function textToHtml(text) {
  const safe = escapeHtml(text).replace(/\n/g, "<br>");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;">${safe}</div>`;
}

let _sendSeq = 0; // disambiguates two sends to the same person in the same ms

/**
 * Send one message from a host to a person in their world.
 * @returns {Promise<{ok:boolean, error?:string, channel?:string}>}
 */
export async function sendRoomMessage({ hostId, personId, channel = "email", text, subject }) {
  const body = (text || "").trim();
  if (!hostId || !personId) return { ok: false, error: "bad_request" };
  if (!body) return { ok: false, error: "empty" };

  // Scope: a host may only message someone already in their world.
  const allowed = await personBelongsToHost(personId, hostId);
  if (!allowed) return { ok: false, error: "not_in_world" };

  // Only email is wired for real outbound right now.
  if (channel && channel !== "email") {
    return { ok: false, error: "channel_unavailable", channel };
  }

  const person = await findPersonById(personId);
  if (!person) return { ok: false, error: "no_person" };
  if (!person.email) return { ok: false, error: "no_email" };

  const profile = await getUserProfile(hostId).catch(() => null);
  const fromName = ((profile?.name || profile?.brand || "") || "").trim() || null;
  const subj = (subject || "").trim() || `A note from ${fromName || "your host"}`;

  await enqueueOutbox({
    fromEmail: buildFromHeader(fromName),
    toEmail: person.email,
    subject: subj,
    htmlBody: textToHtml(body),
    textBody: body,
    category: "transactional",
    idempotencyKey: `room:${hostId}:${personId}:${Date.now()}:${_sendSeq++}`,
  });

  // The actual message text lands in the timeline, so the thread shows what was
  // really said (not a summary). Best-effort — never blocks the send.
  logPersonEvent({
    personId,
    hostId,
    type: "message_out",
    channel: "email",
    direction: "out",
    body,
    metadata: { source: "room" },
  }).catch(() => {});

  return { ok: true };
}

/**
 * Bulk send — one private message each (not a group). Email-reachable people
 * get it now; the rest are reported so nothing fails silently.
 * @returns {Promise<{sent:number, noEmail:number, failed:number}>}
 */
export async function sendRoomBulk({ hostId, personIds, text, subject }) {
  const ids = Array.isArray(personIds) ? personIds : [];
  const out = { sent: 0, noEmail: 0, failed: 0 };
  for (const pid of ids) {
    try {
      const r = await sendRoomMessage({ hostId, personId: pid, channel: "email", text, subject });
      if (r.ok) out.sent++;
      else if (r.error === "no_email") out.noEmail++;
      else out.failed++;
    } catch {
      out.failed++;
    }
  }
  return out;
}
