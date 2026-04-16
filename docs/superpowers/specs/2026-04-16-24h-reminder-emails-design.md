# 24-Hour Event Reminder Emails

**Date:** 2026-04-16
**Status:** Draft

## Overview

Automatically send reminder emails to confirmed guests 24 hours before an event starts. Uses the existing `setInterval` sweep pattern and Resend (default transactional email provider).

## Approach: Periodic Sweep Job

A `setInterval` job runs every 15 minutes. Each run finds events starting within the next 24–25 hours and sends reminders to confirmed guests. Idempotency keys in the `email_outbox` table prevent duplicate sends across runs.

### Why a sweep instead of schedule-at-RSVP-time

- Resilient to event time changes — no need to update/cancel pre-scheduled emails
- Handles RSVP cancellations naturally (only queries currently-confirmed guests)
- Works for events that already exist before this feature ships
- Follows the existing `setInterval` pattern used for rate-limit cleanup and payment-hold expiry

## Sweep Job Logic

**Runs:** Every 15 minutes via `setInterval` in `index.js`

**Each tick:**

1. Query `events` where:
   - `status = 'PUBLISHED'`
   - `starts_at` is between `now()` and `now() + 25 hours`
2. For each event, query RSVPs where:
   - `event_id` matches
   - `booking_status = 'CONFIRMED'`
   - Join with `people` table to get `name` and `email`
3. For each confirmed guest, call `sendEmail()` with:
   - `to`: guest email
   - `subject`: `"{eventTitle}" is tomorrow!`
   - `html`: output of `reminder24hEmail({ ... })`
   - `idempotencyKey`: `reminder-24h-{eventId}-{personId}`
4. The outbox dedup on idempotency key silently skips already-queued reminders

**The 25-hour window** (not 24) provides a 1-hour buffer so guests aren't missed between sweep intervals. Since the idempotency key prevents duplicates, a slightly wider window is safe.

## Template Changes

Rename `reminder8hEmail` → `reminder24hEmail` in `signupConfirmation.js`:

- Update copy: "starts in about 8 hours" → "is tomorrow"
- Replace `time` string parameter with `startsAt` + `timezone`, using the existing `niceDate()` formatter (consistent with confirmation email)
- Keep everything else: same `emailShell`, `badge("HAPPENING SOON")`, event image, details card (time + location), `ctaButton("VIEW EVENT")`, `emailFooter`

### Parameter signature (updated)

```js
reminder24hEmail({
  name,
  eventTitle,
  startsAt,
  timezone,
  imageUrl,
  location,
  slug,
  frontendUrl,
  brandName,
  brandWebsite,
  contactEmail,
})
```

## Email Provider

Reminders use `sendEmail()` from `emailService.js`, which routes through **Resend** (the default transactional provider). SES is only used for newsletter campaigns.

## Edge Cases

| Scenario | Behavior |
|---|---|
| Event rescheduled | If reminder already sent, won't re-send (idempotency key). Acceptable — rescheduling is rare. |
| Guest cancels after reminder | Harmless — already received. |
| Server restart | Job restarts with server. Idempotency keys prevent duplicates. |
| Past events | `starts_at > now()` excludes them. |
| Event in < 24h when feature ships | Caught by next sweep if still within the 25h window. |
| Draft/unpublished events | Excluded by `status = 'PUBLISHED'` filter. |

## Files Changed

1. **`backend/src/emails/signupConfirmation.js`** — Rename `reminder8hEmail` → `reminder24hEmail`, update copy and parameters
2. **`backend/src/index.js`** — Update import, add `sendEventReminders()` function and `setInterval` call

## Not in Scope

- Reminder preferences / opt-out (can be added later)
- Multiple reminders (e.g., 24h + 1h) — just 24h for now
- Reminders for waitlisted guests
