// backend/src/instagram/commentTriggers.js
//
// The comment→DM engine. A comment lands on a connected host's media; if it
// matches one of the host's keyword rules, we fire a Private Reply (one per
// comment, 7-day window) containing a signup link stamped with the entry
// path — so when the person taps it, their account is born already knowing
// it came from an IG comment (acquisition_channel = ig_comment).
//
// Idempotency: ig_comment_triggers has a UNIQUE(comment_id). We insert FIRST
// and treat a unique-violation as "already handled" — so Meta's webhook
// redelivery can never double-DM, even under a race.

import { supabase } from "../supabase.js";
import { getRoutingContextByIgUserId } from "./repos/instagramConnectionsRepo.js";
import { getLiveTriggersForHost } from "./repos/eventCommentTriggersRepo.js";
import { sendPrivateReply, sendMessage } from "./providers/igGraphClient.js";
import { APP_BASE_URL } from "../whatsapp/config.js";
import { logger } from "../logger.js";

const PG_UNIQUE_VIOLATION = "23505";

/** First enabled rule that matches this comment, or null. */
export function matchRule(rules, { text, mediaId }) {
  if (!Array.isArray(rules)) return null;
  const haystack = (text || "").trim().toLowerCase();
  if (!haystack) return null;

  for (const rule of rules) {
    if (!rule || rule.enabled === false) continue;
    if (rule.media_id && rule.media_id !== mediaId) continue;
    const kw = String(rule.keyword || "").trim().toLowerCase();
    if (!kw) continue;
    const hit =
      rule.match === "exact" ? haystack === kw : haystack.includes(kw);
    if (hit) return rule;
  }
  return null;
}

/**
 * Build the stamped signup link. Carries the entry path + a ref so the signup
 * handler can set acquisition_channel/acquisition_ref + bind the sender's IGSID
 * to the new account. `src` is the entry surface ('ig_comment' or 'ig_dm');
 * `ref` is the comment id (comments) or inbound message id (DMs).
 */
export function buildSignupLink({ eventSlug, src = "ig_comment", ref = null, igId = null, username = null }) {
  const base = APP_BASE_URL || "https://pullup.se";
  const path = eventSlug ? `/e/${encodeURIComponent(eventSlug)}` : "/join";
  const params = new URLSearchParams({ src });
  if (ref) params.set("ig_ref", ref);
  if (igId) params.set("ig_uid", igId);
  // The verified handle (Meta gives us from.username) so the RSVP form can
  // prefill the Instagram field, read-only — they see what we have.
  if (username) params.set("ig", String(username).replace(/^@+/, ""));
  return `${base}${path}?${params.toString()}`;
}

// Base for short signup links. Today they resolve via the /api proxy (zero
// nginx change needed); set SHORTLINK_BASE=https://pullup.se/i once a bare-path
// nginx location is added to drop the /api segment.
const SHORTLINK_BASE =
  process.env.SHORTLINK_BASE ||
  `${(APP_BASE_URL || "https://pullup.se").replace(/\/+$/, "")}/api/i`;

/**
 * Shorten a stamped signup URL to `${SHORTLINK_BASE}/<code>`. Instagram DMs are
 * plain text (no anchors), so the full URL otherwise shows as a wall of
 * acquisition params; the short code 302-redirects to the SAME full URL, so
 * every attribution code path on the destination is untouched. Falls back to
 * the full URL if minting fails — a long link beats a dropped message.
 */
async function shortenSignupLink(fullUrl, { hostProfileId = null } = {}) {
  try {
    const { mintShortLink } = await import("../services/shortLinks.js");
    const code = await mintShortLink(fullUrl, { kind: "ig_signup", hostProfileId });
    if (code) return `${SHORTLINK_BASE}/${code}`;
  } catch (e) {
    logger?.warn?.("[instagram/commentTriggers] short-link mint failed, using full url", { err: e?.message });
  }
  return fullUrl;
}

/**
 * Build a stamped signup link AND shorten it in one call — the shared primitive
 * for any auto-DM that wants a clean, attribution-carrying link (used by the
 * conversational-flow answers too). Falls back to the full URL if minting fails.
 */
export async function buildSignupShortLink({ eventSlug, src = "ig_comment", ref = null, igId = null, username = null, hostProfileId = null }) {
  const full = buildSignupLink({ eventSlug, src, ref, igId, username });
  return shortenSignupLink(full, { hostProfileId });
}

/**
 * Handle one inbound comment. Safe to call on every comment webhook — it
 * resolves the host, checks rules, dedupes, and only DMs on a match.
 *
 * @param {object} args
 * @param {string} args.igAccountId  the receiving IG account (entry.id)
 * @param {object} args.comment      { id, text, media:{id}, from:{id,username} }
 */
export async function handleCommentEvent({ igAccountId, comment }) {
  const commentId = comment?.id;
  if (!commentId) return { status: "skipped", reason: "no_comment_id" };

  const ctx = await getRoutingContextByIgUserId(igAccountId);
  if (!ctx) return { status: "skipped", reason: "host_not_connected" };

  // Never reply to the host's own comments.
  if (comment?.from?.id && String(comment.from.id) === String(ctx.igUserId)) {
    return { status: "skipped", reason: "self_comment" };
  }

  const mediaId = comment?.media?.id || comment?.media_id || null;
  // Per-event model (migration 068): match against the host's LIVE triggers
  // (enabled + event not yet ended), pre-sorted by soonest end so a keyword
  // collision resolves deterministically to the most imminent event. A trigger
  // for a finished event is simply absent from this list — it goes silent on
  // its own with no cron.
  const liveTriggers = await getLiveTriggersForHost(ctx.hostProfileId);
  const rule = matchRule(liveTriggers, { text: comment?.text, mediaId });
  if (!rule) return { status: "skipped", reason: "no_rule_match" };

  const commenterIgId = comment?.from?.id || null;
  const commenterUsername = comment?.from?.username || null;
  const signupLink = buildSignupLink({
    eventSlug: rule.event_slug,
    src: "ig_comment",
    ref: commentId,
    igId: commenterIgId,
    username: commenterUsername,
  });

  // Claim the comment FIRST (idempotency). If another delivery already
  // inserted it, bail before sending.
  const claim = await supabase
    .from("ig_comment_triggers")
    .insert({
      host_profile_id: ctx.hostProfileId,
      ig_user_id: ctx.igUserId,
      comment_id: commentId,
      media_id: mediaId,
      commenter_ig_id: commenterIgId,
      commenter_username: commenterUsername,
      matched_keyword: rule.keyword || null,
      signup_link: signupLink,
      status: "sent", // optimistic; corrected to 'error' below on failure
    })
    .select("id")
    .single();

  if (claim.error) {
    if (claim.error.code === PG_UNIQUE_VIOLATION) {
      return { status: "skipped", reason: "already_handled" };
    }
    logger?.error?.("[instagram/commentTriggers] claim insert failed", {
      err: claim.error.message,
    });
    return { status: "error", reason: "claim_failed" };
  }

  // ── Conversational flow ────────────────────────────────────────────
  // The trigger asks a question/CTA first. Send the host's OPENER as the one
  // private reply the comment grants us, then wait — the link is NOT sent yet.
  // Their DM reply (handled by the inbound webhook → conversationFlows) opens
  // the window, branches, and captures their answer.
  if (rule.flow && rule.flow.opener) {
    const openerText = String(rule.flow.opener);
    try {
      const res = await sendPrivateReply({
        igUserId: ctx.igUserId, accessToken: ctx.accessToken, commentId, text: openerText,
      });
      await supabase
        .from("ig_comment_triggers")
        .update({ reply_message_id: res.message_id || null })
        .eq("id", claim.data.id);
      // Resolve the commenter, open the awaiting session, log the opener so the
      // Room thread shows the question we asked. Best-effort (opener already sent).
      try {
        const { resolvePersonByIdentity } = await import("../services/personResolution.js");
        const { personId } = await resolvePersonByIdentity({
          identifiers: { igUserId: commenterIgId ? String(commenterIgId) : null, igHandle: commenterUsername || null },
          profile: { acquisition_channel: "ig_comment", name: commenterUsername || null, instagram: commenterUsername || null },
          source: "ig",
        });
        if (personId) {
          const { createFlowSession } = await import("./repos/flowSessionsRepo.js");
          const { logPersonEvent } = await import("../services/personTimeline.js");
          const { upsertThreadFromMessage } = await import("./repos/instagramThreadsRepo.js");
          const { dedupeKey } = await import("../lib/idempotency.js");
          await createFlowSession({
            hostProfileId: ctx.hostProfileId, personId, triggerId: rule.id,
            eventId: rule.event_id || null, eventSlug: rule.event_slug || null,
            openerCommentId: commentId, flow: rule.flow,
          });
          await logPersonEvent({
            personId, hostId: ctx.hostProfileId, eventId: rule.event_id || null,
            type: "auto_dm_sent", channel: "instagram", direction: "out",
            body: openerText, dedupeKey: dedupeKey("ig:opener", commentId),
            metadata: { source: "comment_flow_opener", comment_id: commentId, mid: res.message_id || null },
          });
          await upsertThreadFromMessage({
            personId, hostProfileId: ctx.hostProfileId,
            igUserId: commenterIgId ? String(commenterIgId) : ctx.igUserId,
            direction: "outbound", preview: openerText,
          });
        }
      } catch (e) {
        logger?.error?.("[instagram/commentTriggers] flow opener session failed", { commentId, err: e?.message });
      }
      logger?.info?.("[instagram/commentTriggers] opener sent", { commentId, keyword: rule.keyword });
      return { status: "sent", messageId: res.message_id, flow: true };
    } catch (err) {
      await supabase
        .from("ig_comment_triggers")
        .update({ status: "error", detail: { message: err.message } })
        .eq("id", claim.data.id);
      logger?.error?.("[instagram/commentTriggers] opener send failed", { commentId, err: err.message });
      return { status: "error", reason: "send_failed" };
    }
  }

  const shortLink = await shortenSignupLink(signupLink, { hostProfileId: ctx.hostProfileId });
  const replyText = `${rule.reply_text || "Tap to grab your spot:"}\n${shortLink}`;
  try {
    const res = await sendPrivateReply({
      igUserId: ctx.igUserId,
      accessToken: ctx.accessToken,
      commentId,
      text: replyText,
    });
    await supabase
      .from("ig_comment_triggers")
      .update({ reply_message_id: res.message_id || null })
      .eq("id", claim.data.id);
    logger?.info?.("[instagram/commentTriggers] replied", {
      commentId,
      keyword: rule.keyword,
      username: commenterUsername,
    });

    // Record the auto-DM on the commenter's timeline so the Room thread shows
    // what we sent — without this the conversation looks empty even though the
    // DM went out. Mirrors the dm_keyword path (metaIgWebhook.js). The IGSID on
    // a comment is Meta-issued → a hard identity link. Best-effort: the DM is
    // already delivered, so a logging hiccup must never read as a send failure.
    try {
      const { resolvePersonByIdentity } = await import("../services/personResolution.js");
      const { personId } = await resolvePersonByIdentity({
        identifiers: {
          igUserId: commenterIgId ? String(commenterIgId) : null,
          igHandle: commenterUsername || null,
        },
        profile: {
          acquisition_channel: "ig_comment",
          name: commenterUsername || null,
          instagram: commenterUsername || null,
        },
        source: "ig",
      });
      if (personId) {
        const { logPersonEvent } = await import("../services/personTimeline.js");
        const { upsertThreadFromMessage } = await import("./repos/instagramThreadsRepo.js");
        const { dedupeKey } = await import("../lib/idempotency.js");
        await logPersonEvent({
          personId,
          hostId: ctx.hostProfileId,
          type: "auto_dm_sent",
          channel: "instagram",
          direction: "out",
          body: replyText,
          // Deduped on the comment id so a webhook redelivery doesn't double-log.
          dedupeKey: dedupeKey("ig:cmtreply", commentId),
          metadata: { source: "comment_trigger", comment_id: commentId, mid: res.message_id || null, signup_link: signupLink },
        });
        await upsertThreadFromMessage({
          personId,
          hostProfileId: ctx.hostProfileId,
          igUserId: commenterIgId ? String(commenterIgId) : ctx.igUserId,
          direction: "outbound",
          preview: replyText,
        });
      }
    } catch (e) {
      logger?.error?.("[instagram/commentTriggers] timeline log failed", { commentId, err: e?.message });
    }

    return { status: "sent", messageId: res.message_id, signupLink: shortLink };
  } catch (err) {
    await supabase
      .from("ig_comment_triggers")
      .update({ status: "error", detail: { message: err.message } })
      .eq("id", claim.data.id);
    logger?.error?.("[instagram/commentTriggers] private reply failed", {
      commentId,
      err: err.message,
    });
    return { status: "error", reason: "send_failed" };
  }
}

/**
 * Handle one inbound DM for keyword triggers — Instagram's OTHER keyword
 * surface. A story reply arrives here too (Meta delivers it as a message).
 * If the text matches one of the host's LIVE dm_keyword triggers, we reply in
 * the SAME 24h window the inbound message just opened (plain free text, no
 * template), DMing the stamped event link.
 *
 * Idempotency: ig_dm_triggers has UNIQUE(host_profile_id, inbound_mid). We
 * claim the message id FIRST and treat a unique-violation as already-handled,
 * so Meta's webhook redelivery can never double-DM, even under a race.
 *
 * The caller (the messaging webhook) has already resolved the host + person, so
 * we take them as input rather than re-resolving.
 *
 * @returns {Promise<{status:string, reason?:string, messageId?:string, signupLink?:string}>}
 */
export async function handleDmKeywordEvent({
  hostProfileId, igUserId, accessToken, senderId, senderUsername, text, mid, personId,
}) {
  if (!mid) return { status: "skipped", reason: "no_mid" };
  if (!text || !String(text).trim()) return { status: "skipped", reason: "no_text" };
  if (!hostProfileId || !accessToken) return { status: "skipped", reason: "host_not_connected" };

  const liveTriggers = await getLiveTriggersForHost(hostProfileId, "dm_keyword");
  if (!liveTriggers.length) return { status: "skipped", reason: "no_triggers" };
  const rule = matchRule(liveTriggers, { text }); // DMs aren't post-scoped → no mediaId
  if (!rule) return { status: "skipped", reason: "no_rule_match" };

  // Claim the inbound message FIRST (idempotency). A redelivery (or a race)
  // hits the unique index and bails before sending a second DM.
  const claim = await supabase
    .from("ig_dm_triggers")
    .insert({
      host_profile_id: hostProfileId,
      inbound_mid: mid,
      trigger_id: rule.id,
      person_id: personId || null,
      matched_keyword: rule.keyword || null,
      status: "sent", // optimistic; corrected to 'error' below on failure
    })
    .select("id")
    .single();

  if (claim.error) {
    if (claim.error.code === PG_UNIQUE_VIOLATION) {
      return { status: "skipped", reason: "already_handled" };
    }
    logger?.error?.("[instagram/dmTriggers] claim insert failed", { err: claim.error.message });
    return { status: "error", reason: "claim_failed" };
  }

  const signupLink = buildSignupLink({
    eventSlug: rule.event_slug,
    src: "ig_dm",
    ref: mid,
    igId: senderId,
    username: senderUsername,
  });
  const shortLink = await shortenSignupLink(signupLink, { hostProfileId });
  const replyText = `${rule.reply_text || "Tap to grab your spot:"}\n${shortLink}`;

  try {
    const res = await sendMessage({
      igUserId,
      accessToken,
      recipientId: senderId,
      text: replyText,
    });
    await supabase
      .from("ig_dm_triggers")
      .update({ reply_message_id: res?.message_id || null })
      .eq("id", claim.data.id);
    logger?.info?.("[instagram/dmTriggers] replied", { keyword: rule.keyword, username: senderUsername });
    return { status: "sent", messageId: res?.message_id, signupLink: shortLink };
  } catch (err) {
    await supabase
      .from("ig_dm_triggers")
      .update({ status: "error", detail: { message: err.message } })
      .eq("id", claim.data.id);
    logger?.error?.("[instagram/dmTriggers] dm reply failed", { err: err.message });
    return { status: "error", reason: "send_failed" };
  }
}
