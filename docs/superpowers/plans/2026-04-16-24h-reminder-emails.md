# 24-Hour Event Reminder Emails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically send reminder emails to confirmed guests 24 hours before published events start.

**Architecture:** A `setInterval` sweep job (every 15 min) queries upcoming events and their confirmed RSVPs, then enqueues reminder emails via the existing outbox with idempotency keys to prevent duplicates. Reuses existing email template, Supabase query patterns, and Resend provider.

**Tech Stack:** Express (Node.js), Supabase (PostgreSQL), email outbox + Resend

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/src/emails/signupConfirmation.js` | Modify | Rename `reminder8hEmail` → `reminder24hEmail`, update copy + params |
| `backend/src/index.js` | Modify | Update import, add `sendEventReminders()` function + `setInterval` |

---

### Task 1: Update the reminder email template

**Files:**
- Modify: `backend/src/emails/signupConfirmation.js:223-283`

- [ ] **Step 1: Rename function and update parameters**

Replace the existing `reminder8hEmail` function (lines 223–283) with the updated 24h version. Changes: rename to `reminder24hEmail`, replace `time` param with `startsAt` + `timezone`, use `niceDate()` formatter, update copy from "8 hours" to "tomorrow".

```js
/* ══════════════════════════════════════════
   24-HOUR REMINDER EMAIL
   ══════════════════════════════════════════ */
export function reminder24hEmail({
  name,
  eventTitle,
  startsAt = "",
  timezone = "",
  imageUrl = "",
  location = "",
  slug = "",
  frontendUrl = "https://pullup.se",
  brandName = "",
  brandWebsite = "",
  contactEmail = "",
}) {
  const dateFormatted = startsAt ? niceDate(startsAt, timezone) : "";
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;

  const content = `
<!-- Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("HAPPENING SOON")}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:${WHITE};line-height:1.3;">${eventTitle}</h1>
</td></tr>

<!-- Message -->
<tr><td style="padding:8px 20px;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.7);line-height:1.5;">
    Hi ${name}, <strong>${eventTitle}</strong> is tomorrow!
  </p>
</td></tr>

<!-- Details Card -->
<tr><td align="center" style="padding:16px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(255,255,255,0.04);border:1px solid ${SUBTLE};border-radius:12px;">
    <tr><td style="padding:14px 20px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation">
        ${dateFormatted ? `<tr><td style="padding:2px 10px 2px 0;font-size:14px;color:${MUTED};">When</td><td style="font-size:14px;color:${WHITE};font-weight:600;">${dateFormatted}</td></tr>` : ""}
        ${location ? `<tr><td style="padding:2px 10px 2px 0;font-size:14px;color:${MUTED};">Where</td><td style="font-size:14px;color:${WHITE};font-weight:600;">${location}</td></tr>` : ""}
      </table>
    </td></tr>
  </table>
</td></tr>

<!-- CTA -->
<tr><td align="center" style="padding:20px 0;">
  ${ctaButton(eventUrl, "VIEW EVENT")}
</td></tr>

${emailFooter({ message: "See you tomorrow!", brandName, brandWebsite, contactEmail, frontendUrl })}`;

  return emailShell(content);
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/emails/signupConfirmation.js
git commit -m "rename reminder8hEmail to reminder24hEmail, update copy and params"
```

---

### Task 2: Add the sweep job to index.js

**Files:**
- Modify: `backend/src/index.js:85` (import)
- Modify: `backend/src/index.js` (after the existing payment-cleanup `setInterval` near line 10050)

- [ ] **Step 1: Update the import**

In `backend/src/index.js`, change the import at line 85 from `reminder8hEmail` to `reminder24hEmail`:

```js
// Line 83-90: change reminder8hEmail to reminder24hEmail
import {
  signupConfirmationEmail,
  reminder24hEmail,
  reservationEmail,
  waitlistOfferEmail,
  refundEmail,
  cancellationEmail,
} from "./emails/signupConfirmation.js";
```

- [ ] **Step 2: Add the infra sendEmail import**

Add an import for the infra-level `sendEmail` (which supports `idempotencyKey`) from `./email/index.js`. The app already imports `sendEmail` from `./services/emailService.js` (which does NOT support idempotencyKey), so import the infra one under an alias. Find the existing import block around lines 1-15 and add:

```js
import { sendEmail as infraSendEmail } from "./email/index.js";
```

- [ ] **Step 3: Add the `sendEventReminders` function and setInterval**

Add this after the existing payment-cleanup `setInterval` block (around line 10050). Follow the same async pattern used by the payment cleanup job:

```js
/* ── 24-hour event reminder emails ────────────────────── */
const REMINDER_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const REMINDER_WINDOW_MS  = 25 * 60 * 60 * 1000; // 25 hours

async function sendEventReminders() {
  try {
    const { supabase } = await import("./supabase.js");
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);

    // 1. Find published events starting in the next 25 hours
    const { data: events, error: eventsErr } = await supabase
      .from("events")
      .select("id, title, slug, starts_at, timezone, location, cover_image_url, image_url, host_id")
      .eq("status", "PUBLISHED")
      .gt("starts_at", now.toISOString())
      .lt("starts_at", windowEnd.toISOString());

    if (eventsErr) {
      console.error("[Reminders] Error fetching events:", eventsErr.message);
      return;
    }
    if (!events || events.length === 0) return;

    for (const event of events) {
      // 2. Get confirmed RSVPs with person details
      const { data: rsvps, error: rsvpErr } = await supabase
        .from("rsvps")
        .select(`
          id, person_id,
          people:person_id ( id, name, email )
        `)
        .eq("event_id", event.id)
        .eq("booking_status", "CONFIRMED");

      if (rsvpErr) {
        console.error(`[Reminders] Error fetching RSVPs for event ${event.id}:`, rsvpErr.message);
        continue;
      }
      if (!rsvps || rsvps.length === 0) continue;

      // 3. Fetch host branding
      let hostBrand = {};
      try {
        const hostProfile = await getUserProfile(event.host_id);
        hostBrand = {
          brandName: hostProfile?.brand || "",
          brandWebsite: hostProfile?.brandWebsite || "",
          contactEmail: hostProfile?.contactEmail || "",
        };
      } catch {}

      // 4. Send reminder to each guest
      for (const rsvp of rsvps) {
        const person = rsvp.people;
        if (!person?.email) continue;

        const idempotencyKey = `reminder-24h-${event.id}-${person.id}`;
        try {
          await infraSendEmail({
            to: person.email,
            subject: `"${event.title}" is tomorrow!`,
            html: reminder24hEmail({
              name: person.name || "there",
              eventTitle: event.title,
              startsAt: event.starts_at,
              timezone: event.timezone || "",
              imageUrl: event.cover_image_url || event.image_url || "",
              location: event.location || "",
              slug: event.slug || "",
              frontendUrl: getFrontendUrl(),
              ...hostBrand,
            }),
            idempotencyKey,
          });
        } catch (err) {
          console.error(`[Reminders] Failed to send reminder to ${person.email} for event ${event.id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error("[Reminders] Unexpected error in sendEventReminders:", err.message);
  }
}

setInterval(sendEventReminders, REMINDER_INTERVAL_MS);
```

- [ ] **Step 4: Verify the server starts without errors**

Run: `cd backend && npm run dev`

Expected: Server starts, no import errors, logs show normal startup. Kill it after confirming.

- [ ] **Step 5: Commit**

```bash
git add backend/src/index.js
git commit -m "add 24h reminder email sweep job"
```

---

### Task 3: End-to-end verification

- [ ] **Step 1: Check for an upcoming event in the database**

Query Supabase to find a published event with `starts_at` in the next 25 hours that has confirmed RSVPs. If none exist, temporarily update a test event's `starts_at` to be ~24 hours from now.

- [ ] **Step 2: Trigger the sweep manually**

In a Node REPL or by temporarily reducing `REMINDER_INTERVAL_MS` to 5 seconds, confirm:
- The sweep finds the event
- It queries confirmed RSVPs
- It enqueues an email in `email_outbox` with `idempotency_key = 'reminder-24h-{eventId}-{personId}'`

- [ ] **Step 3: Verify idempotency**

Run the sweep again and confirm no duplicate row is created in `email_outbox` — the upsert on `idempotency_key` should silently skip it.

- [ ] **Step 4: Check the email was delivered**

Query `email_outbox` for the reminder row and verify its `status` progresses from `queued` → `sent`. Check the recipient's inbox for the email with subject `"{eventTitle}" is tomorrow!`.

- [ ] **Step 5: Restore any test data changes and final commit**

If you modified a test event's `starts_at`, restore it. Ensure the interval is back to 15 minutes.

```bash
git add -A
git commit -m "verified 24h reminder emails working end-to-end"
```
