// backend/src/email/outbox/bouncePolicy.js
//
// When does a bouncing address get suppressed?
//
// Providers only sometimes tell us a bounce is permanent. Resend often reports
// Transient/Undetermined for an address that is simply wrong, and if we treat
// every unclear bounce as soft, a typo'd address stays on the list forever —
// the state this codebase was actually in: two mistyped addresses had been
// mailed 9 and 10 times, bouncing every single time, on every host campaign.
//
// Treating every unclear bounce as HARD is the opposite failure: one bad night
// at a mail host permanently silences a real guest, and the host never learns
// why their reach dropped.
//
// So: an explicit Permanent suppresses immediately, and anything softer has to
// earn it by history. An address that has bounced repeatedly and has never once
// been delivered to is not having a bad night — it does not exist.

export const BOUNCE_SUPPRESS_THRESHOLD = 3;

/**
 * Decide whether an address should go on the suppression list.
 *
 * @param {object} args
 * @param {boolean} args.permanent  provider explicitly said Permanent
 * @param {number}  args.bounced    lifetime bounced sends to this address
 * @param {number}  args.delivered  lifetime confirmed deliveries to this address
 * @returns {{suppress: boolean, reason: string}}
 */
export function bounceVerdict({ permanent = false, bounced = 0, delivered = 0 } = {}) {
  if (permanent) {
    return { suppress: true, reason: "explicit_permanent_bounce" };
  }

  // Ever landed? Then this address is real and today's failure is transient
  // until the provider says otherwise. Keep mailing it.
  if (delivered > 0) {
    return { suppress: false, reason: "has_prior_delivery" };
  }

  if (bounced >= BOUNCE_SUPPRESS_THRESHOLD) {
    return {
      suppress: true,
      reason: `${bounced}_bounces_zero_deliveries`,
    };
  }

  return { suppress: false, reason: "below_threshold" };
}
