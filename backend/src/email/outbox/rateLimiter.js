// backend/src/email/outbox/rateLimiter.js

import { EMAIL_SEND_RATE_PER_SEC } from "../config.js";

const windowMs = 1000;
let sendTimestamps = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function throttle(limitPerSecond = EMAIL_SEND_RATE_PER_SEC) {
  if (!limitPerSecond || limitPerSecond <= 0) return;

  const now = Date.now();
  // Drop entries older than 1 second
  sendTimestamps = sendTimestamps.filter(
    (ts) => now - ts < windowMs,
  );

  if (sendTimestamps.length < limitPerSecond) {
    sendTimestamps.push(now);
    return;
  }

  // Oldest timestamp in the 1-second window
  const oldest = sendTimestamps[0];
  const waitMs = windowMs - (now - oldest);

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  const later = Date.now();
  sendTimestamps = sendTimestamps.filter(
    (ts) => later - ts < windowMs,
  );
  sendTimestamps.push(later);
}

