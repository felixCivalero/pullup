// backend/src/instagram/conversationFlows.js
//
// Conversational comment→DM flows (migration 075). The product opinion: the DM
// is how you get in. A comment auto-DM never just drops the link — it asks
// something first (a CTA or a question), the guest REPLIES to unlock, and that
// reply both opens the 24h window (no Human Agent needed for the follow-up) and
// gives the host a real signal about the person.
//
// Two pure helpers (normalize on write, match on reply) + one orchestrator that
// the inbound-DM webhook calls when a person answers an opener.

import { logger } from "../logger.js";
import { buildSignupShortLink } from "./commentTriggers.js";
import { sendMessage } from "./providers/igGraphClient.js";
import { logPersonEvent } from "../services/personTimeline.js";
import { upsertThreadFromMessage } from "./repos/instagramThreadsRepo.js";
import { completeFlowSession } from "./repos/flowSessionsRepo.js";
import { dedupeKey } from "../lib/idempotency.js";

const clampText = (v, n = 900) => String(v ?? "").slice(0, n);

/**
 * Validate + shape a flow from raw request input. Returns null when there's no
 * opener (→ the trigger keeps today's immediate-link behaviour). Pure; safe to
 * call on untrusted body data.
 */
export function normalizeFlow(input) {
  if (!input || typeof input !== "object") return null;
  const opener = clampText(input.opener).trim();
  if (!opener) return null; // no opener → not a flow

  const answer = (a) =>
    a && typeof a === "object"
      ? { text: clampText(a.text).trim(), includeLink: a.includeLink !== false }
      : { text: "", includeLink: true };

  const answerA = answer(input.answerA);

  // Split is opt-in: only when the host gave a keyword to branch on. Otherwise
  // any reply gets answerA (the CTA/gate case).
  let split = null;
  let answerB = null;
  const splitKeyword = clampText(input?.split?.keyword, 200).trim();
  if (splitKeyword) {
    split = { keyword: splitKeyword, match: input.split.match === "exact" ? "exact" : "contains" };
    answerB = answer(input.answerB);
  }

  const capture = clampText(input.capture, 200).trim() || null;
  return { opener, capture, split, answerA, answerB };
}

/**
 * Given a normalized flow and the guest's reply text, pick the answer to send.
 * Pure. No split → answerA for any reply. Split → keyword match picks answerA,
 * else answerB (falling back to answerA so nobody is ever left without a reply).
 *
 * @returns {{ text:string, includeLink:boolean, branch:'A'|'B' }}
 */
export function matchFlowAnswer(flow, replyText) {
  const a = flow?.answerA || { text: "", includeLink: true };
  if (!flow?.split) return { ...a, branch: "A" };

  const haystack = String(replyText || "").trim().toLowerCase();
  const keywords = String(flow.split.keyword || "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  const hit = keywords.some((kw) =>
    flow.split.match === "exact" ? haystack === kw : haystack.includes(kw),
  );
  if (hit) return { ...a, branch: "A" };
  return { ...(flow.answerB || a), branch: "B" };
}

/**
 * Handle a guest's reply to an opener: branch, send the chosen answer in-window
 * (their reply just opened the 24h window), capture the Q→A as a signal on the
 * person, log the outbound, and complete the session. Best-effort throughout —
 * a logging hiccup must never strand the conversation.
 *
 * @param {object} args
 * @param {object} args.session   the awaiting ig_flow_sessions row (carries the flow snapshot)
 * @param {object} args.creds     { igUserId, accessToken } for the host's IG account
 * @param {string} args.personId  resolved person (the commenter who replied)
 * @param {string} args.senderId  the guest's IGSID (recipient of our answer)
 * @param {string} [args.senderUsername]
 * @param {string} [args.replyText]  what they wrote back
 * @param {string} [args.mid]        inbound message id (idempotency)
 */
export async function handleFlowReply({ session, creds, personId, senderId, senderUsername, replyText, mid }) {
  const flow = session?.flow || {};
  const chosen = matchFlowAnswer(flow, replyText);

  // Build the answer message: the host's text + (optionally) the stamped signup
  // short link. A short link keeps the DM clean and still carries attribution.
  let link = null;
  if (chosen.includeLink) {
    link = await buildSignupShortLink({
      eventSlug: session.event_slug,
      src: "ig_comment",
      ref: session.opener_comment_id || session.id,
      igId: senderId,
      username: senderUsername,
      hostProfileId: session.host_profile_id,
    });
  }
  let messageText = [chosen.text, link].filter(Boolean).join("\n").trim();
  // Safety net: never leave them hanging. If the host configured neither text
  // nor a link on this branch, fall back to the event link.
  if (!messageText) {
    link = link || (await buildSignupShortLink({
      eventSlug: session.event_slug, src: "ig_comment",
      ref: session.opener_comment_id || session.id, igId: senderId,
      username: senderUsername, hostProfileId: session.host_profile_id,
    }));
    messageText = link || chosen.text || "";
  }

  let messageId = null;
  try {
    const res = await sendMessage({
      igUserId: creds.igUserId,
      accessToken: creds.accessToken,
      recipientId: senderId,
      text: messageText,
    });
    messageId = res?.message_id || null;
  } catch (err) {
    logger?.error?.("[instagram/flows] answer send failed", { sessionId: session.id, err: err?.message });
    // Leave the session awaiting so a retry/another reply can still complete it.
    return { status: "error", branch: chosen.branch };
  }

  // Capture the answer as a signal on the person — the whole point of forcing a
  // reply. Reads in the Room as "we now know this about them", not just a bubble.
  const question = flow.capture || flow.opener || "asked";
  await logPersonEvent({
    personId,
    hostId: session.host_profile_id,
    eventId: session.event_id || null,
    type: "note",
    channel: "instagram",
    body: `Answered "${question}": ${String(replyText || "").trim() || "(no text)"}`,
    dedupeKey: dedupeKey("ig:flowans", mid),
    metadata: { kind: "flow_answer", question, answer: replyText || null, branch: chosen.branch, trigger_id: session.trigger_id || null },
  }).catch(() => {});

  // The answer we sent → the timeline + thread head.
  await logPersonEvent({
    personId,
    hostId: session.host_profile_id,
    eventId: session.event_id || null,
    type: "auto_dm_sent",
    channel: "instagram",
    direction: "out",
    body: messageText,
    dedupeKey: dedupeKey("ig:flowreply", mid),
    metadata: { source: "comment_flow", branch: chosen.branch, mid: messageId, session_id: session.id },
  }).catch(() => {});
  await upsertThreadFromMessage({
    personId, hostProfileId: session.host_profile_id, igUserId: senderId,
    direction: "outbound", preview: messageText,
  }).catch(() => {});

  await completeFlowSession({ id: session.id, replyText, branch: chosen.branch });
  logger?.info?.("[instagram/flows] answered", { sessionId: session.id, branch: chosen.branch });
  return { status: "sent", branch: chosen.branch, messageId };
}
