// backend/src/instagram/providers/igGraphClient.js
//
// Thin client over the "Instagram API with Instagram Login" Graph endpoints.
// Mirrors the role whatsapp/providers/metaCloudClient.js plays for WhatsApp.
//
// Every network call short-circuits in sandbox mode (IG_SANDBOX_MODE) and
// returns a synthetic, shape-correct response so the connect flow + comment
// triggers are fully exercisable in dev/CI before App Review lands.
//
// Endpoints used:
//   OAuth code → short-lived token   POST  api.instagram.com/oauth/access_token
//   short → long-lived (60d)         GET   graph.instagram.com/access_token
//   refresh long-lived               GET   graph.instagram.com/refresh_access_token
//   who am I (id + username)         GET   graph.instagram.com/me
//   send message / private reply     POST  graph.instagram.com/{ig-id}/messages

import {
  IG_SANDBOX_MODE,
  IG_APP_ID,
  IG_APP_SECRET,
  IG_OAUTH_REDIRECT_URI,
  IG_TOKEN_URL,
  IG_GRAPH_HOST,
  META_GRAPH_VERSION,
} from "../config.js";
import { logger } from "../../logger.js";

// Strip secrets (access_token, client_secret, code) out of a URL before it
// ever lands in an error message or log. Without this, the token rides along in
// the thrown string → Sentry's data scrubber flags the whole value as a secret
// and replaces it with "[Filtered]", so the REAL Meta error becomes invisible
// (exactly what hid the Instagram connect failures). Redacting keeps the Meta
// status + message readable and stops us leaking live tokens into logs.
function redactUrl(url) {
  try {
    const u = new URL(url);
    for (const k of ["access_token", "client_secret", "code"]) {
      if (u.searchParams.has(k)) u.searchParams.set(k, "REDACTED");
    }
    return u.toString();
  } catch {
    return String(url).replace(/(access_token|client_secret|code)=[^&]+/gi, "$1=REDACTED");
  }
}

async function postForm(url, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `[igGraphClient] POST ${redactUrl(url)} → ${res.status} ${json?.error_message || json?.error?.message || ""}`.trim(),
    );
  }
  return json;
}

async function getJson(url) {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `[igGraphClient] GET ${redactUrl(url)} → ${res.status} ${json?.error?.message || json?.error_message || ""}`.trim(),
    );
  }
  return json;
}

/**
 * Exchange an OAuth `code` (from the redirect) for a short-lived token +
 * the connected IG user id. Then immediately upgrade to a 60-day token.
 * Returns { igUserId, accessToken, expiresInSeconds }.
 */
export async function exchangeCodeForToken(code) {
  if (IG_SANDBOX_MODE) {
    return {
      igUserId: "sbx-ig-17841400000000000",
      accessToken: "sbx-ig-longlived-token",
      expiresInSeconds: 60 * 24 * 3600,
      sandbox: true,
    };
  }

  // 1. code → short-lived token (+ user_id)
  const short = await postForm(IG_TOKEN_URL, {
    client_id: IG_APP_ID,
    client_secret: IG_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: IG_OAUTH_REDIRECT_URI,
    code,
  });
  // Instagram Login returns the short-lived token EITHER flat
  // ({ access_token, user_id }) OR wrapped in a data[] array
  // ({ data: [{ access_token, user_id }] }) depending on the app/API rollout.
  // Reading only the flat shape left shortToken undefined for wrapped
  // responses → step 2 was sent a blank access_token → Meta 400 "Unsupported
  // request - method type: get". Accept both shapes.
  const tokenNode =
    short.access_token ? short : (Array.isArray(short.data) ? short.data[0] : null) || short;
  const shortToken = tokenNode?.access_token;
  const igUserId = String(tokenNode?.user_id ?? short.user_id ?? "");

  if (!shortToken) {
    // Surface WHICH keys came back (never the values) so a future shape change
    // is diagnosable from one log line instead of a blind 400 downstream.
    throw new Error(
      `[igGraphClient] short-lived token missing in response; keys=${Object.keys(short).join(",")}` +
        (Array.isArray(short.data) ? ` data[0].keys=${Object.keys(short.data[0] || {}).join(",")}` : ""),
    );
  }

  // 2. short → long-lived (60 days)
  const longUrl =
    `${IG_GRAPH_HOST}/access_token?grant_type=ig_exchange_token` +
    `&client_secret=${encodeURIComponent(IG_APP_SECRET)}` +
    `&access_token=${encodeURIComponent(shortToken)}`;
  const long = await getJson(longUrl);

  return {
    igUserId,
    accessToken: long.access_token || shortToken,
    expiresInSeconds: long.expires_in || 60 * 24 * 3600,
  };
}

/** Refresh a long-lived token (call before token_expires_at). */
export async function refreshLongLivedToken(accessToken) {
  if (IG_SANDBOX_MODE) {
    return { accessToken: "sbx-ig-longlived-token-refreshed", expiresInSeconds: 60 * 24 * 3600 };
  }
  const url =
    `${IG_GRAPH_HOST}/refresh_access_token?grant_type=ig_refresh_token` +
    `&access_token=${encodeURIComponent(accessToken)}`;
  const json = await getJson(url);
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

/** Fetch the connected account's id + username for display. */
export async function fetchAccount(accessToken) {
  if (IG_SANDBOX_MODE) {
    return { id: "sbx-ig-17841400000000000", username: "sandbox_creator" };
  }
  const url = `${IG_GRAPH_HOST}/me?fields=user_id,username&access_token=${encodeURIComponent(accessToken)}`;
  const json = await getJson(url);
  return { id: String(json.user_id || json.id), username: json.username || null };
}

/**
 * Fetch a MESSAGE SENDER's public profile by their Instagram-scoped id (IGSID),
 * using the connected host's token. This is the only way to get a name/username/
 * picture for an inbound DM — the messaging webhook carries just the IGSID.
 * Requires `instagram_business_manage_messages`; consent is implied by the DM.
 * Returns a normalized snapshot (null fields where IG didn't supply one).
 */
export async function fetchUserProfile({ igsid, accessToken }) {
  if (IG_SANDBOX_MODE) {
    return {
      id: String(igsid), username: "sandbox_user", name: "Sandbox User",
      profilePic: null, followerCount: 0,
      isUserFollowBusiness: false, isBusinessFollowUser: false,
    };
  }
  const fields = "name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user";
  const url = `${IG_GRAPH_HOST}/${META_GRAPH_VERSION}/${igsid}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;
  const json = await getJson(url);
  return {
    id: String(igsid),
    username: json.username || null,
    name: json.name || null,
    profilePic: json.profile_pic || null,
    followerCount: typeof json.follower_count === "number" ? json.follower_count : null,
    isUserFollowBusiness: json.is_user_follow_business ?? null,
    isBusinessFollowUser: json.is_business_follow_user ?? null,
  };
}

/**
 * List the connected account's media — for the comment-trigger post picker
 * ("any post" vs scope to one). Cursor-paginated, NEWEST FIRST: pass the
 * returned `nextCursor` as `after` to page back through the whole catalog
 * (the host isn't stuck with just the latest posts).
 *
 * What the IG (Instagram-Login) API gives us per item:
 *   • media_type: IMAGE | VIDEO | CAROUSEL_ALBUM  (the only types here)
 *   • thumbnail_url: VIDEO only → for IMAGE/CAROUSEL_ALBUM we fall back to
 *     media_url (the cover). These CDN URLs are short-lived — fine to render
 *     in the picker, but we persist only the stable `id` (media_id).
 *   • NOTE: media_product_type (FEED/REELS/STORY) is NOT exposed on the
 *     Instagram-Login token (Facebook-Login only), so we label by media_type
 *     and don't claim "Reel" we can't verify. Stories aren't here at all —
 *     they're ephemeral (24h) and can't carry comments, so they can't anchor
 *     a comment trigger; a story automation would be a reply-keyword (DM)
 *     trigger, not this.
 *
 * Returns { media: [...], nextCursor: string|null }.
 */
export async function fetchRecentMedia({ accessToken, limit = 24, after = null }) {
  if (IG_SANDBOX_MODE) {
    return {
      media: Array.from({ length: 6 }, (_, i) => ({
        id: `sbx-media-${i + 1}`,
        caption: i % 2 ? "Sandbox post caption " + (i + 1) : "",
        mediaType: i % 3 === 0 ? "VIDEO" : i % 3 === 1 ? "CAROUSEL_ALBUM" : "IMAGE",
        thumbnailUrl: null,
        permalink: `https://instagram.com/p/sbx${i + 1}`,
        timestamp: null,
      })),
      nextCursor: null,
    };
  }
  const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
  let url =
    `${IG_GRAPH_HOST}/${META_GRAPH_VERSION}/me/media` +
    `?fields=${fields}&limit=${Math.max(1, Math.min(50, limit))}` +
    `&access_token=${encodeURIComponent(accessToken)}`;
  if (after) url += `&after=${encodeURIComponent(after)}`;
  const json = await getJson(url);
  const data = Array.isArray(json?.data) ? json.data : [];
  return {
    media: data.map((m) => ({
      id: String(m.id),
      caption: m.caption || "",
      mediaType: m.media_type || null,
      // VIDEO exposes thumbnail_url; IMAGE/CAROUSEL_ALBUM use media_url (cover).
      thumbnailUrl: m.thumbnail_url || m.media_url || null,
      permalink: m.permalink || null,
      timestamp: m.timestamp || null,
    })),
    nextCursor: json?.paging?.cursors?.after || null,
  };
}

/**
 * Send a DM from the connected IG account to a recipient (by IGSID).
 * Used both for direct DMs and as the delivery for a private reply.
 * `igUserId` is the sender (the host's connected account).
 *
 * `humanAgent: true` sends with the HUMAN_AGENT tag, which Meta allows up to
 * 7 days after the user's last message — but ONLY for a human-composed reply.
 * dispatch() sets it only inside the 24h–7d "human_agent" window.
 */
export async function sendMessage({ igUserId, accessToken, recipientId, text, attachment = null, humanAgent = false }) {
  if (IG_SANDBOX_MODE) {
    logger?.info?.("[igGraphClient] (sandbox) sendMessage", { recipientId, text, attachment, humanAgent });
    return { ok: true, sandbox: true, message_id: `sbx-msg-${recipientId}` };
  }
  // Instagram API with Instagram Login sends on graph.instagram.com — NOT
  // graph.facebook.com (that's the Facebook-Login/Page flow, which rejects our
  // IG-issued user token). Same host the token + OAuth came from.
  const url = `${IG_GRAPH_HOST}/${META_GRAPH_VERSION}/${igUserId}/messages`;
  // A message is EITHER text OR a single attachment (Meta doesn't allow both in
  // one send). Attachment delivers a real image/video by URL — Meta fetches it —
  // instead of pasting a link. type ∈ image | video | audio.
  const message = attachment
    ? { attachment: { type: attachment.type || "image", payload: { url: attachment.url, is_reusable: true } } }
    : { text };
  const params = {
    recipient: JSON.stringify({ id: recipientId }),
    message: JSON.stringify(message),
    access_token: accessToken,
  };
  if (humanAgent) {
    params.messaging_type = "MESSAGE_TAG";
    params.tag = "HUMAN_AGENT";
  }
  const json = await postForm(url, params);
  return { ok: true, message_id: json.message_id || json.id || null };
}

/**
 * Private Reply: DM a user in response to THEIR comment. The eligibility
 * key is the comment id (one reply per comment, 7-day window). This is the
 * "comment X → get a DM" primitive.
 */
export async function sendPrivateReply({ igUserId, accessToken, commentId, text }) {
  if (IG_SANDBOX_MODE) {
    logger?.info?.("[igGraphClient] (sandbox) sendPrivateReply", { commentId, text });
    return { ok: true, sandbox: true, message_id: `sbx-priv-${commentId}` };
  }
  // Instagram API with Instagram Login sends on graph.instagram.com — NOT
  // graph.facebook.com (that's the Facebook-Login/Page flow, which rejects our
  // IG-issued user token). Same host the token + OAuth came from.
  const url = `${IG_GRAPH_HOST}/${META_GRAPH_VERSION}/${igUserId}/messages`;
  const json = await postForm(url, {
    recipient: JSON.stringify({ comment_id: commentId }),
    message: JSON.stringify({ text }),
    access_token: accessToken,
  });
  return { ok: true, message_id: json.message_id || json.id || null };
}
