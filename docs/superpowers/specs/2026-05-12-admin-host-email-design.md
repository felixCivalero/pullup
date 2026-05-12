# Admin email: host segmentation + internal/broadcast mode

**Date:** 2026-05-12
**Surface:** `AdminEmailPage` (frontend) · `adminBroadcastSender.js` (backend)
**Status:** Design — pending implementation plan

## Problem

`AdminEmailPage` today emails the platform-wide contact list (`people` table), with hosts excluded by default. There is no way to:

1. Target hosts as recipients (e.g., "hosts who signed up but never created an event")
2. Send a relational/transactional message to hosts that bypasses marketing-consent gating and the unsubscribe footer
3. Email hosts and contacts together as one combined audience

The need is for both **marketing broadcasts** and **internal CRM emails** to flow through the same composer.

## Design

### Audience source toggle

A three-way toggle at the top of the Segment tab swaps the filter set:

```
┌─ Audience ─────────────────────────────────┐
│  [ Contacts ]  [ Hosts ]  [ Everyone ]    │
└────────────────────────────────────────────┘
```

| Source      | Pool                                                                       | Filters shown                                                                  |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `contacts`  | `people` rows minus signed-up host emails (current behavior)              | Marketing consent, behavior, tags, attended events (unchanged)                 |
| `hosts`     | `profiles` rows (every signed-up host)                                     | Account state, events created, account age, sales lead status                  |
| `everyone`  | Union of contacts ∪ hosts, deduped by lowercased email                     | Shared only: marketing consent, send mode                                      |

The existing "Exclude hosts" toggle in the contacts filter card is removed — the source toggle replaces it.

### Host filter set

Pills, single-select unless noted.

- **Account state** — `Any` · `Never signed in` · `Inactive 30d+` · `Recently active (≤30d)`
  - Derived from `profiles.last_login_at`.
- **Events created** — `Any` · `0 events` · `1+` · `3+`
  - Count of `events.host_id = profile.id`.
- **Account age** — `Any` · `≤30d` · `30–90d` · `90d+`
  - Derived from `profiles.created_at`.
- **Sales lead status** — chip cloud from distinct `sales_leads.status` values for the joined leads
  - Renders only if at least one lead row exists for any host in the candidate set.

Sample list rows show `Name · 2 events · Last login 5d ago` (replaces the contact-style `2 pays` row).

### Send mode selector

Lives in the Design tab footer (near the Send button area):

```
Send as:  ⦿ Marketing broadcast    ◯ Internal / transactional
          (consent-gated + unsub footer)   (no consent gate, no footer)
```

Default driven by source choice:

- `contacts` → `broadcast`
- `hosts` → `internal`
- `everyone` → `broadcast`

Admin can override either default per send.

**Mode semantics:**

| Concern                           | Broadcast               | Internal                |
| --------------------------------- | ----------------------- | ----------------------- |
| `marketing_consent` filter        | Applied (if `optedIn`)  | Skipped                 |
| `marketing_unsubscribed_at` check | Excluded                | Excluded                |
| `do_not_contact` check            | Excluded                | Excluded                |
| Unsubscribe footer in HTML        | Included                | Omitted                 |
| Campaign tag                      | `admin_broadcast_<id>`  | `admin_internal_<id>`   |
| Tracking pixel + click rewrite    | Yes                     | Yes                     |

Hard unsubscribes and `do_not_contact` are **always** honored — compliance line, no admin override.

### Dedup rule (Everyone)

When the same lowercased email appears as both a host and a contact, the host record wins:
- `id`, `name`, `email` come from `profiles`
- The contact-side record is dropped from the candidate set
- Send is recorded once against the host's `people` row (or a host-stub `people` row if none exists)

### Backend changes

#### `adminBroadcastSender.js` — `getAdminAudience(filterCriteria)`

Add `audienceSource: "contacts" | "hosts" | "everyone"` (default `"contacts"`, preserving today's behavior for existing callers).

New host-specific fields on `filterCriteria`:

- `hostAccountState: "any" | "never" | "inactive30d" | "recent30d"`
- `hostEventCount: 0 | 1 | 3` (interpreted as "≥ this")
- `hostAccountAge: "any" | "lte30d" | "30to90d" | "gt90d"`
- `hostLeadStatuses: string[]` (OR over `sales_leads.status`)

New send-mode field on `filterCriteria` (kept here, not a separate column, to avoid a migration):

- `sendMode: "broadcast" | "internal"` (default `"broadcast"`)

Branching:

```
if source === "contacts":   existing path (unchanged)
if source === "hosts":      query profiles, count events, optional join sales_leads
if source === "everyone":   run both paths, union, dedup by email (host wins)
```

For `hosts` and `everyone`, the host-side query selects:
`id, email (via contact_email fallback to auth.users.email), name, last_login_at, created_at, login_count`

`auth.users.email` fallback uses the existing `supabase.auth.admin.listUsers({ perPage: 1000 })` pattern already in the file.

#### `/admin/email/audience` endpoint

Same route — pass `source`, `sendMode`, and the host filters as query params. Backend reads them and dispatches.

#### `sendAdminBroadcastInBatches`

- Reads `sendMode` from `campaign.filterCriteria`.
- Passes `unsubscribeUrl: null` to `renderFollowUpEmailTemplate` when internal.
- Builds `campaignTag` as `admin_internal_<id>` when internal, `admin_broadcast_<id>` otherwise (current default).

#### Email template

`renderFollowUpEmailTemplate` already takes `unsubscribeUrl`. Confirm it conditionally renders the footer when `unsubscribeUrl` is null; if not, add a short branch.

### Frontend changes

- `AdminEmailPage.jsx`: add `audienceSource` state, render source toggle, swap filter rendering, add send-mode radio.
- New component `HostAudienceTab` for host filters (mirrors `AdminAudienceTab` structure).
- `filterQuery` memo: serialize host filters when source is `hosts` or `everyone`.
- `handleConfirmSend`: include `audienceSource` and `sendMode` in `persistedCriteria`.

### Edge cases

- **Host with no contact_email**: fall back to `auth.users.email`. Existing pattern at `index.js:10965`.
- **Host whose email is also unsubscribed in `people`**: still excluded (hard unsub respected).
- **Zero sales leads in DB**: hide the lead-status filter card entirely.
- **`Everyone` + `internal` mode**: legitimate (e.g., a product-shutdown notice) — supported. Marketing consent is skipped for both halves.
- **Sample preview**: shows up to 30 names. For `everyone`, take the first 15 from each side (or fewer if one side is empty), then sort by name so admin sees both groups represented without an obvious split point.
- **Recording sends for hosts with no `people` row**: `recordEmailSend` requires a `personId`. When sending to a host whose email has no matching `people` row, insert a minimal `people` row first (`email`, `name`, `marketing_consent = false`, `import_source = 'host_account'`) and use its id. This row already gets created today via existing flows for most hosts; this fallback covers the remainder.

### Data flow

```
[source toggle] ──┐
[host pills]     ─┼─► filterCriteria { audienceSource, sendMode, ...filters }
[contact pills]  ─┘            │
                               ▼
              GET /admin/email/audience?source=&sendMode=&...
                               │
                               ▼
              getAdminAudience() branches on source
                               │
                               ▼
              { total, sample: [{id, email, name, ...}] }
                               │
   admin clicks Send           ▼
              POST /admin/email/campaigns { templateContent, filterCriteria }
                               │
                               ▼
              sendAdminBroadcastInBatches()
                  - re-resolves audience
                  - sendMode toggles unsub footer + consent gate
                  - campaign_tag uses admin_internal_* when internal
```

### Schema

No migrations.

- `email_campaigns.filter_criteria` (JSON) gains new keys: `audienceSource`, `sendMode`, `hostAccountState`, `hostEventCount`, `hostAccountAge`, `hostLeadStatuses`.
- All host filter data is derived from existing columns: `profiles.last_login_at`, `profiles.created_at`, `profiles.login_count`, `events.host_id`, `sales_leads.status`.

### Testing

- Audience counts: contacts-only count matches today's baseline (regression).
- Hosts-only count matches a hand-counted Supabase query.
- Everyone count = unique union of the two.
- Internal mode: rendered HTML has no unsubscribe footer.
- Internal mode: bypasses `marketing_consent` but excludes `do_not_contact` and hard unsubs.
- Dedup: host + contact with the same email yields one send.

### Out of scope (v2)

- Per-host send history view ("when did we last email this host")
- Saved segments
- Scheduled sends
- Per-host send throttling (don't email same host twice in 7d)
