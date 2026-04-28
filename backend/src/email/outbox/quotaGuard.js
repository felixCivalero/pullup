// Daily provider quota helpers. Resend free tier caps at 100 emails/day;
// SES sandbox caps at 200/day; paid tiers vary. EMAIL_DAILY_LIMIT lets
// you set the cap; the worker calls these to know when to hold a row
// for tomorrow instead of hitting the provider and burning a 429 retry.

// UTC midnight of the current day.
export function startOfTodayUtc(now = new Date()) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Next UTC midnight + a 0-3600s random jitter so the entire deferred
// queue doesn't reactivate at exactly 00:00:00 (thundering herd against
// the provider the moment the quota refreshes).
export function nextSendWindowUtc(now = new Date(), randomFn = Math.random) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  // Jitter up to one hour past midnight UTC.
  const jitterSeconds = Math.floor(randomFn() * 3600);
  d.setUTCSeconds(jitterSeconds);
  return d;
}
