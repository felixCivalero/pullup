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
import { sendPrivateReply } from "./providers/igGraphClient.js";
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
 * Build the stamped signup link. Carries the entry path + the comment id so
 * the signup handler can set acquisition_channel/acquisition_ref + bind the
 * commenter's IGSID to the new account.
 */
export function buildSignupLink({ eventSlug, commentId, commenterIgId }) {
  const base = APP_BASE_URL || "https://pullup.se";
  const path = eventSlug ? `/e/${encodeURIComponent(eventSlug)}` : "/join";
  const params = new URLSearchParams({ src: "ig_comment" });
  if (commentId) params.set("ig_ref", commentId);
  if (commenterIgId) params.set("ig_uid", commenterIgId);
  return `${base}${path}?${params.toString()}`;
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
  const rule = matchRule(ctx.commentRules, { text: comment?.text, mediaId });
  if (!rule) return { status: "skipped", reason: "no_rule_match" };

  const commenterIgId = comment?.from?.id || null;
  const commenterUsername = comment?.from?.username || null;
  const signupLink = buildSignupLink({
    eventSlug: rule.event_slug,
    commentId,
    commenterIgId,
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

  const replyText = `${rule.reply_text || "Tap to grab your spot:"}\n${signupLink}`;
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
    return { status: "sent", messageId: res.message_id, signupLink };
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
