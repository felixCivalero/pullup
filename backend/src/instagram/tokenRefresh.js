// backend/src/instagram/tokenRefresh.js
//
// Keep Instagram connections alive. Meta issues long-lived IG tokens that last
// a fixed 60 days; the refresh endpoint mints a NEW 60-day token from a still-
// valid one. Without this, every connection silently dies at day 60 and the
// host has to reconnect. A daily tick refreshes tokens a comfortable margin
// before expiry.
//
// NOT a security rotation: Instagram does not invalidate the previous token on
// refresh, so a leaked token stays usable until ITS OWN expiry regardless of
// how often we rotate our stored copy. Refresh is purely about connection
// longevity. Blast radius is limited by encryption-at-rest + revoke, not by
// refresh cadence — and there's no way to request a token shorter than 60 days.

import { refreshLongLivedToken } from "./providers/igGraphClient.js";
import { decryptSecret } from "../utils/encryption.js";
import {
  getConnectionsDueForRefresh,
  updateConnectionToken,
} from "./repos/instagramConnectionsRepo.js";
import { logger } from "../logger.js";

// Refresh a token once it's within this many days of expiry. With 60-day
// tokens and a daily tick, every connection gets ~10 chances to refresh before
// it can lapse — resilient to the odd transient Graph error or a day of downtime.
export const REFRESH_WITHIN_DAYS = 10;

// PURE: should this token refresh now? Due when it expires within the window
// and hasn't already expired. (Instagram also requires a long-lived token to be
// ≥24h old to refresh — always true for a 60-day token within 10 days of expiry,
// so no separate age gate is needed.) Unit-tested without a clock or DB.
export function isTokenRefreshDue(tokenExpiresAt, { now = Date.now(), withinDays = REFRESH_WITHIN_DAYS } = {}) {
  if (!tokenExpiresAt) return false;
  const exp = new Date(tokenExpiresAt).getTime();
  if (!Number.isFinite(exp)) return false;
  if (exp <= now) return false; // already expired — can't refresh; needs reconnect
  return exp - now <= withinDays * 24 * 60 * 60 * 1000;
}

// The daily job body: refresh every connection nearing expiry. A failure on one
// connection is logged and skipped (left "connected" so the next tick retries —
// we don't expire a still-valid connection on a transient Graph blip; the send
// path's 190 handling marks genuinely-dead tokens). Exported for the scheduler.
export async function runInstagramTokenRefreshTick({ now = Date.now() } = {}) {
  const due = await getConnectionsDueForRefresh(REFRESH_WITHIN_DAYS, now);
  let refreshed = 0;
  let failed = 0;
  for (const c of due) {
    try {
      const current = decryptSecret(c.access_token);
      const { accessToken, expiresInSeconds } = await refreshLongLivedToken(current);
      if (!accessToken) throw new Error("refresh response had no access_token");
      await updateConnectionToken(c.ig_user_id, accessToken, expiresInSeconds);
      refreshed += 1;
    } catch (e) {
      failed += 1;
      logger?.error?.("[ig-token-refresh] failed for one connection", {
        igUserId: c.ig_user_id,
        error: e.message,
      });
    }
  }
  if (refreshed || failed) {
    logger?.info?.("[ig-token-refresh] tick", { due: due.length, refreshed, failed });
  }
  return { due: due.length, refreshed, failed };
}
