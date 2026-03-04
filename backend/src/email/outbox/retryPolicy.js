// backend/src/email/outbox/retryPolicy.js

import { EMAIL_MAX_RETRIES, EMAIL_RETRY_BASE_SECONDS } from "../config.js";

export function getRetryDelaySeconds({
  attempt,
  baseSeconds = EMAIL_RETRY_BASE_SECONDS,
  maxRetries = EMAIL_MAX_RETRIES,
}) {
  const safeAttempt = Math.max(1, Math.min(attempt, maxRetries));
  const delay = baseSeconds * Math.pow(2, safeAttempt - 1);
  // Cap at e.g. ~1 hour
  return Math.min(delay, 3600);
}

