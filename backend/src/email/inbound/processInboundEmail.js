// backend/src/email/inbound/processInboundEmail.js
//
// Takes a parsed inbound reply + its reply token and threads it into the host's
// Room. The host-visible copy is a person_events row (type='message_in',
// channel='email') — the SAME spine WhatsApp/Instagram inbound writes to, so it
// shows in the Room inbox with no new read-path. A raw audit copy + idempotency
// guard live in email_inbound.

import { supabase } from "../../supabase.js";
import { logPersonEvent } from "../../services/personTimeline.js";
import { stripQuotedReply, isAutoReply } from "./parseInboundEmail.js";

// email (verified or not) → person id, via the identity graph.
async function resolvePersonByEmail(email) {
  if (!email) return null;
  const { data } = await supabase
    .from("person_identities")
    .select("person_id")
    .eq("kind", "email")
    .eq("value_norm", String(email).toLowerCase().trim())
    .maybeSingle();
  return data?.person_id || null;
}

// token (= an outbox row's tracking_id) → that row's (person, host, id).
async function resolveToken(token) {
  if (!token) return null;
  const { data } = await supabase
    .from("email_outbox")
    .select("id, person_id, host_profile_id, to_email, campaign_tag")
    .eq("tracking_id", token)
    .maybeSingle();
  return data || null;
}

// Is this sender THE HOST behind the thread? Matches the host's auth email,
// profile contact_email, and additional_emails — so a host replying from
// their own mailbox is recognized as themselves, never as the guest.
async function isHostOwnAddress(hostProfileId, fromEmail) {
  const from = String(fromEmail || "").toLowerCase().trim();
  if (!from || !hostProfileId) return false;
  try {
    const [{ data: profile }, authRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("contact_email, additional_emails")
        .eq("id", hostProfileId)
        .maybeSingle(),
      supabase.auth.admin.getUserById(hostProfileId).catch(() => null),
    ]);
    const candidates = new Set(
      [
        profile?.contact_email,
        ...(Array.isArray(profile?.additional_emails) ? profile.additional_emails : []),
        authRes?.data?.user?.email,
      ]
        .filter(Boolean)
        .map((e) => String(e).toLowerCase().trim()),
    );
    return candidates.has(from);
  } catch {
    return false; // unknowable → treat as the guest (the safe default)
  }
}

// Is this sender THE PERSON in the thread? When the from-address is the
// person's own email, they are speaking — even if that address ALSO matches
// one of the host's addresses (host testing their own loop, host messaging
// themselves). The person outranks the host on their own address; the host
// speaks as the host from any OTHER address of theirs (e.g. felix@pullup.se).
async function isPersonOwnAddress(personId, fromEmail) {
  const from = String(fromEmail || "").toLowerCase().trim();
  if (!from || !personId) return false;
  try {
    const [{ data: person }, { data: ids }] = await Promise.all([
      supabase.from("people").select("email").eq("id", personId).maybeSingle(),
      supabase.from("person_identities").select("value_norm").eq("person_id", personId).eq("kind", "email"),
    ]);
    const candidates = new Set(
      [person?.email, ...(ids || []).map((r) => r.value_norm)]
        .filter(Boolean)
        .map((e) => String(e).toLowerCase().trim()),
    );
    return candidates.has(from);
  } catch {
    return false;
  }
}

async function alreadyProcessed(sesMessageId) {
  if (!sesMessageId) return false;
  const { data } = await supabase
    .from("email_inbound")
    .select("id")
    .eq("ses_message_id", sesMessageId)
    .maybeSingle();
  return !!data;
}

async function recordInbound(fields) {
  // ses_message_id is UNIQUE → a redelivered SNS notification is a no-op.
  const { error } = await supabase.from("email_inbound").insert(fields);
  if (error && error.code !== "23505") {
    console.error("[processInboundEmail] email_inbound insert error", error.message);
  }
}

/**
 * @param {object} args
 * @param {object} args.parsed   from parseRawEmail()
 * @param {string} args.token    extracted reply token (may be null)
 * @param {string} args.toAddress the matched recipient address (for audit)
 * @returns {Promise<{status:string, personId?:string, hostProfileId?:string}>}
 */
export async function processInboundEmail({ parsed, token, toAddress, attachments = [] }) {
  if (!parsed) return { status: "unparseable" };

  const sesMessageId = parsed.messageId || null;
  if (await alreadyProcessed(sesMessageId)) {
    return { status: "duplicate" };
  }

  const outboxRow = await resolveToken(token);
  const hostProfileId = outboxRow?.host_profile_id || null;
  // Prefer who we sent to; fall back to resolving the sender's address.
  const personId =
    outboxRow?.person_id ||
    (await resolvePersonByEmail(parsed.from)) ||
    (await resolvePersonByEmail(outboxRow?.to_email)) ||
    null;

  const rawBody = parsed.text || "";
  const bodyText = stripQuotedReply(rawBody);

  // Attachments arrive already fetched + uploaded to durable storage (each with
  // a public url), so they persist on the message and survive reloads instead
  // of decaying to a plain-text note. Stored on the event metadata + rendered
  // in the dock. Shape: { name, url, contentType, isImage }.
  const atts = Array.isArray(attachments) ? attachments.filter((a) => a && a.url) : [];

  const baseRecord = {
    ses_message_id: sesMessageId,
    person_id: personId,
    host_profile_id: hostProfileId,
    outbox_id: outboxRow?.id || null,
    token: token || null,
    from_email: parsed.from || null,
    to_address: toAddress || null,
    subject: parsed.subject || null,
    body_text: bodyText || null,
    raw_body: rawBody || null,
  };

  // Auto-replies / bounces / list mail: record but never thread.
  if (isAutoReply(parsed.headers)) {
    await recordInbound({ ...baseRecord, status: "ignored" });
    return { status: "ignored" };
  }

  // ── Host-authored reply ─────────────────────────────────────────────────
  // The HOST answering from their own mail client (a reply to a thread-tagged
  // notification, e.g. an early-access request). Threading it as message_in
  // would put the host's words in the guest's mouth — instead DELIVER it to
  // the person as the host, through the normal send path: it emails them AND
  // lands in the chat thread, exactly as if typed in the dock.
  // The person's own address outranks the host's: if the sender IS the person
  // in this thread, it's them speaking (inbound), even when that address also
  // belongs to the host — the same-human-both-sides case.
  if (
    hostProfileId &&
    personId &&
    !(await isPersonOwnAddress(personId, parsed.from)) &&
    (await isHostOwnAddress(hostProfileId, parsed.from))
  ) {
    try {
      const { sendRoomMessage } = await import("../../services/roomMessaging.js");
      // Sender identity for the delivered mail: pass through the mailbox the
      // host actually wrote from (used only if it's their own platform-domain
      // address). Concierge threads (replies to a concierge-tagged
      // notification) always speak as PullUp — the system's own address —
      // even when the host replied from a personal mailbox.
      const conciergeThread = String(outboxRow?.campaign_tag || "").startsWith("concierge");
      const out = await sendRoomMessage({
        hostId: hostProfileId,
        personId,
        channel: "email",
        text: bodyText,
        subject: parsed.subject || undefined,
        fromAddress: parsed.from || null,
        systemVoice: conciergeThread,
      });
      await recordInbound({ ...baseRecord, status: out?.ok ? "host_sent" : "host_send_failed" });
      return { status: out?.ok ? "host_sent" : "host_send_failed", personId, hostProfileId };
    } catch (e) {
      console.error("[processInboundEmail] host-authored send failed", e?.message);
      await recordInbound({ ...baseRecord, status: "host_send_failed" });
      return { status: "host_send_failed", personId, hostProfileId };
    }
  }

  // Without a host we can't scope this to anyone's Room. Keep the audit row and
  // make the gap loud + alertable rather than dropping it into the void.
  if (!hostProfileId || !personId) {
    await recordInbound({ ...baseRecord, status: "unmatched" });
    console.error("[processInboundEmail] inbound reply could not be threaded", {
      event: "email_inbound_unmatched",
      token: token || null,
      from: parsed.from || null,
      has_host: !!hostProfileId,
      has_person: !!personId,
    });
    return { status: "unmatched" };
  }

  await logPersonEvent({
    personId,
    hostId: hostProfileId,
    type: "message_in",
    channel: "email",
    direction: "in",
    body: bodyText,
    occurredAt: parsed.date || new Date(),
    metadata: {
      source: "email_inbound",
      from: parsed.from || null,
      subject: parsed.subject || null,
      sesMessageId,
      outboxId: outboxRow?.id || null,
      ...(atts.length ? { attachments: atts } : {}),
    },
  });

  await recordInbound({ ...baseRecord, status: "threaded" });
  return { status: "threaded", personId, hostProfileId };
}
