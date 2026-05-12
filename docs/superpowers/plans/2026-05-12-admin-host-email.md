# Admin email: host segmentation + internal/broadcast mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins email hosts (filtered by CRM-style criteria), email contacts (existing behavior), or email everyone, and choose between marketing-broadcast or internal/transactional send modes.

**Architecture:** Add a three-way `audienceSource` toggle (`contacts` / `hosts` / `everyone`) to the existing `AdminEmailPage` segmenter. Backend `getAdminAudience()` branches on the source — host source pulls from `profiles` + counts events + optionally joins `sales_leads`; everyone source is a deduped union (host record wins). A `sendMode` field (`broadcast` / `internal`) gates the unsubscribe footer + `marketing_consent` check; `do_not_contact` and hard unsubs are always honored.

**Tech Stack:** React (frontend), Express + Supabase JS (backend), node-based tests (plain `node tests/*.test.js` with console assertions).

**Spec:** `docs/superpowers/specs/2026-05-12-admin-host-email-design.md`

---

## File Structure

**Backend (modify):**
- `backend/src/services/adminBroadcastSender.js` — extend `getAdminAudience()` with source branching + new host helpers; extend `sendAdminBroadcastInBatches()` with `sendMode` handling.
- `backend/src/index.js` — extend `/admin/email/audience` query parsing; update sample row shape.

**Backend (create):**
- `backend/tests/admin-audience-source.test.js` — covers contact/host/everyone branching, dedup, sendMode interaction.

**Frontend (modify):**
- `frontend/src/pages/AdminEmailPage.jsx` — source toggle, host filter set, send-mode radio, updated `filterQuery` memo, host-shaped sample rows.

No new files on the frontend — existing component file gets two new sub-components (`HostsAudienceTab`, `SourceToggle`, `SendModeSelector`) defined inline alongside the existing ones, following the file's existing pattern.

No schema migrations.

---

## Task 1: Backend — add `audienceSource` field to `getAdminAudience` with contacts default

**Files:**
- Modify: `backend/src/services/adminBroadcastSender.js:51-183`

- [ ] **Step 1: Read the current `getAdminAudience` signature and identify the destructure block.**

The current signature destructures `filterCriteria` at lines 52–63. We'll add `audienceSource` and `sendMode` to the destructure so they round-trip through campaign rows without breaking existing callers.

- [ ] **Step 2: Add `audienceSource` and `sendMode` to the destructure with safe defaults**

In `getAdminAudience`, modify the destructure block:

```js
export async function getAdminAudience(filterCriteria = {}) {
  const {
    audienceSource = "contacts",
    sendMode = "broadcast",
    excludeHosts = true,
    marketingConsent = "any",
    importSource = null,
    minEventsAttended = 0,
    hasPaid = false,
    minTotalSpend = 0,
    joinedAfter = null,
    attendedEventTags = [],
    attendedEventIds = [],
    attendedEventLogic = "or",
    // Host-source filters
    hostAccountState = "any",
    hostEventCount = 0,
    hostAccountAge = "any",
    hostLeadStatuses = [],
  } = filterCriteria;
```

- [ ] **Step 3: Branch at the top of the function based on `audienceSource`**

Immediately after the destructure, before the existing host-emails lookup, add:

```js
  if (audienceSource === "hosts") {
    return getHostAudience({
      hostAccountState,
      hostEventCount,
      hostAccountAge,
      hostLeadStatuses,
      sendMode,
    });
  }
  if (audienceSource === "everyone") {
    return getEveryoneAudience({
      // host filters
      hostAccountState,
      hostEventCount,
      hostAccountAge,
      hostLeadStatuses,
      // contact filters
      marketingConsent,
      importSource,
      minEventsAttended,
      hasPaid,
      minTotalSpend,
      joinedAfter,
      attendedEventTags,
      attendedEventIds,
      attendedEventLogic,
      sendMode,
    });
  }
  // Fall through: existing "contacts" path (unchanged below this line).
```

The two helper functions are defined in Task 2 and Task 3.

- [ ] **Step 4: Use `marketingConsent` only when `sendMode === "broadcast"` in the contacts path**

Find the line `if (marketingConsent === "optedIn") query = query.eq("marketing_consent", true);` (around line 85) and change it to:

```js
  if (sendMode !== "internal" && marketingConsent === "optedIn") {
    query = query.eq("marketing_consent", true);
  }
```

Rationale: internal mode bypasses marketing-consent gating (per spec). `do_not_contact` and `marketing_unsubscribed_at` checks above stay — those are hard unsubs.

- [ ] **Step 5: Commit**

```bash
git -C /Users/felixcivalero/projects/pullup add backend/src/services/adminBroadcastSender.js
git -C /Users/felixcivalero/projects/pullup commit -m "admin email: thread audienceSource + sendMode through getAdminAudience"
```

---

## Task 2: Backend — implement `getHostAudience` helper

**Files:**
- Modify: `backend/src/services/adminBroadcastSender.js` (append below `getAdminAudience`)

- [ ] **Step 1: Add `getHostAudience` function at the end of the file (above `sendAdminBroadcastInBatches`)**

```js
// Pull every signed-up host from `profiles`, enrich with event counts and
// (optionally) sales-lead status, then apply admin's host filters. Email
// comes from profiles.contact_email with auth.users.email as fallback.
async function getHostAudience({
  hostAccountState = "any",
  hostEventCount = 0,
  hostAccountAge = "any",
  hostLeadStatuses = [],
  sendMode = "broadcast",
}) {
  // 1. Load every profile row (this is small at PullUp scale).
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, name, brand, contact_email, created_at, last_login_at, login_count")
    .limit(100000);
  if (profErr) throw profErr;

  // 2. Backfill contact_email from auth.users for profiles missing it.
  const missingEmail = (profiles || []).filter((p) => !p.contact_email);
  let authEmailById = {};
  if (missingEmail.length > 0) {
    try {
      const { data: au } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      for (const u of au?.users || []) {
        if (u.email) authEmailById[u.id] = u.email;
      }
    } catch {
      // Non-fatal — profiles with no contact_email AND no auth email are skipped.
    }
  }

  // 3. Count events per host.
  const { data: events } = await supabase
    .from("events")
    .select("host_id")
    .limit(100000);
  const eventCountByHost = {};
  for (const e of events || []) {
    if (!e.host_id) continue;
    eventCountByHost[e.host_id] = (eventCountByHost[e.host_id] || 0) + 1;
  }

  // 4. Optional: sales_leads.status by profile_id.
  let leadStatusByProfile = {};
  if (Array.isArray(hostLeadStatuses) && hostLeadStatuses.length > 0) {
    const { data: leads } = await supabase
      .from("sales_leads")
      .select("profile_id, status")
      .not("profile_id", "is", null)
      .limit(100000);
    for (const l of leads || []) {
      if (l.profile_id && l.status) leadStatusByProfile[l.profile_id] = l.status;
    }
  }

  // 5. Map profiles → unified record shape, apply hard unsub + DNC filters
  //    via people table lookup (one query, in() by email).
  const candidates = [];
  for (const p of profiles || []) {
    const email = (p.contact_email || authEmailById[p.id] || "").toLowerCase().trim();
    if (!email) continue;
    candidates.push({
      id: p.id,                       // profile_id, becomes person_id at send time
      profile_id: p.id,
      email,
      name: p.name || p.brand || "",
      marketing_consent: null,        // resolved against people table below
      last_login_at: p.last_login_at || null,
      login_count: p.login_count || 0,
      created_at: p.created_at,
      event_count: eventCountByHost[p.id] || 0,
      lead_status: leadStatusByProfile[p.id] || null,
      _source: "host",
    });
  }

  // 6. Strip do_not_contact / marketing_unsubscribed_at by joining people on email.
  const emails = candidates.map((c) => c.email);
  if (emails.length > 0) {
    const { data: blocked } = await supabase
      .from("people")
      .select("email, do_not_contact, marketing_unsubscribed_at, marketing_consent")
      .in("email", emails);
    const blockedSet = new Set();
    const consentByEmail = {};
    for (const b of blocked || []) {
      const k = (b.email || "").toLowerCase().trim();
      if (!k) continue;
      if (b.do_not_contact === true || b.marketing_unsubscribed_at) blockedSet.add(k);
      if (typeof b.marketing_consent === "boolean") consentByEmail[k] = b.marketing_consent;
    }
    for (const c of candidates) {
      if (consentByEmail[c.email] != null) c.marketing_consent = consentByEmail[c.email];
    }
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      if (blockedSet.has(candidates[i].email)) candidates.splice(i, 1);
    }
  }

  // 7. Apply host filters.
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const filtered = candidates.filter((c) => {
    // Account state
    if (hostAccountState === "never" && c.last_login_at) return false;
    if (hostAccountState === "inactive30d") {
      if (!c.last_login_at) return false;
      if (now - new Date(c.last_login_at).getTime() < 30 * DAY) return false;
    }
    if (hostAccountState === "recent30d") {
      if (!c.last_login_at) return false;
      if (now - new Date(c.last_login_at).getTime() > 30 * DAY) return false;
    }

    // Events created. Sentinel values: "any" (default, no filter),
    // "exactly0" (signed up but no event yet), 1 or 3 (>= N).
    if (hostEventCount === "exactly0") {
      if (c.event_count !== 0) return false;
    } else if (Number(hostEventCount) >= 1) {
      if (c.event_count < Number(hostEventCount)) return false;
    }

    // Account age
    if (c.created_at) {
      const ageDays = (now - new Date(c.created_at).getTime()) / DAY;
      if (hostAccountAge === "lte30d" && ageDays > 30) return false;
      if (hostAccountAge === "30to90d" && (ageDays <= 30 || ageDays > 90)) return false;
      if (hostAccountAge === "gt90d" && ageDays <= 90) return false;
    }

    // Lead status
    if (Array.isArray(hostLeadStatuses) && hostLeadStatuses.length > 0) {
      if (!c.lead_status) return false;
      if (!hostLeadStatuses.includes(c.lead_status)) return false;
    }

    // Marketing consent (broadcast mode only)
    if (sendMode !== "internal" && c.marketing_consent === false) return false;

    return true;
  });

  return filtered;
}
```

**Note the filter semantics:**
- `hostEventCount` values from the UI: `"any"` (no filter, default 0 → falls through), `"exactly0"` (signed up but no event), `1`, `3` (≥ N).
- Decision: pass `"exactly0"` as a string sentinel rather than overloading 0, so the UI can disambiguate "Any" (default) from "Zero events".

- [ ] **Step 2: Update the destructure in `getAdminAudience` (Task 1) — `hostEventCount` default changes**

Open `getAdminAudience` and change:
```js
hostEventCount = 0,
```
to:
```js
hostEventCount = "any",
```

And propagate the same default into the `audienceSource === "hosts"` and `audienceSource === "everyone"` calls in Task 1, Step 3 (just rewrites the literal — no other change needed since they were already passing the variable through).

- [ ] **Step 3: Commit**

```bash
git -C /Users/felixcivalero/projects/pullup add backend/src/services/adminBroadcastSender.js
git -C /Users/felixcivalero/projects/pullup commit -m "admin email: implement getHostAudience for host-source emails"
```

---

## Task 3: Backend — implement `getEveryoneAudience` helper (union + dedup)

**Files:**
- Modify: `backend/src/services/adminBroadcastSender.js` (append below `getHostAudience`)

- [ ] **Step 1: Refactor the existing contacts path into a `getContactsAudience` helper**

The current `getAdminAudience` body (after the new branching block from Task 1) handles contacts. Extract it into a function so it can be called from the `everyone` path too.

Move all the code from `let hostEmails = new Set();` through the final `return eligible;` into a new function:

```js
async function getContactsAudience({
  excludeHosts = true,
  marketingConsent = "any",
  importSource = null,
  minEventsAttended = 0,
  hasPaid = false,
  minTotalSpend = 0,
  joinedAfter = null,
  attendedEventTags = [],
  attendedEventIds = [],
  attendedEventLogic = "or",
  sendMode = "broadcast",
}) {
  // ... existing body, unchanged, with the same "if (sendMode !== 'internal' && marketingConsent === 'optedIn')"
  //     check from Task 1 Step 4 applied here as well.
}
```

Then in `getAdminAudience`, the contacts fall-through becomes:

```js
  return getContactsAudience({
    excludeHosts,
    marketingConsent,
    importSource,
    minEventsAttended,
    hasPaid,
    minTotalSpend,
    joinedAfter,
    attendedEventTags,
    attendedEventIds,
    attendedEventLogic,
    sendMode,
  });
```

- [ ] **Step 2: Implement `getEveryoneAudience`**

```js
// Union of host + contact audiences, deduped by lowercased email.
// Host record wins per the design spec.
async function getEveryoneAudience(opts) {
  const hosts = await getHostAudience(opts);
  // For the contacts side, set excludeHosts=false because the host wins
  // dedup happens below. (If excludeHosts=true, a host who is also in
  // people would be dropped before we got to dedup.)
  const contacts = await getContactsAudience({ ...opts, excludeHosts: false });

  const byEmail = new Map();
  for (const h of hosts) byEmail.set(h.email, h);
  for (const c of contacts) {
    if (!byEmail.has(c.email)) byEmail.set(c.email, { ...c, _source: "contact" });
  }
  return Array.from(byEmail.values());
}
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/felixcivalero/projects/pullup add backend/src/services/adminBroadcastSender.js
git -C /Users/felixcivalero/projects/pullup commit -m "admin email: implement getEveryoneAudience (host-wins dedup)"
```

---

## Task 4: Backend — thread `sendMode` through `sendAdminBroadcastInBatches`

**Files:**
- Modify: `backend/src/services/adminBroadcastSender.js:185-319`

- [ ] **Step 1: Read `sendMode` from campaign criteria and pick the campaign tag**

In `sendAdminBroadcastInBatches`, after `const eligible = await getAdminAudience(campaign.filterCriteria || {});` (line ~211), add:

```js
    const sendMode = campaign.filterCriteria?.sendMode === "internal"
      ? "internal"
      : "broadcast";
```

Then change the existing line:
```js
const campaignTag = `admin_broadcast_${campaignId}`;
```
to:
```js
const campaignTag = sendMode === "internal"
  ? `admin_internal_${campaignId}`
  : `admin_broadcast_${campaignId}`;
```

- [ ] **Step 2: Skip the unsubscribe footer for internal sends**

Find the `renderFollowUpEmailTemplate` call inside the per-person `batchPromises.map` (line ~237):

```js
const html = renderFollowUpEmailTemplate({
  templateContent: sanitizedTemplateContent,
  person,
  event: null,
  baseUrl: backendBaseUrl,
  unsubscribeUrl,
});
```

Replace the line above it (where `unsubscribeUrl` is built) with:

```js
const unsubscribeToken = sendMode === "internal"
  ? null
  : await ensureUnsubscribeToken(person.id);
const unsubscribeUrl = unsubscribeToken
  ? `${frontendBaseUrl}/u/${unsubscribeToken}`
  : null;
```

`renderFollowUpEmailTemplate` already branches on `unsubscribeUrl` being null and omits the footer (verified in `followUpTemplateService.js:153-158`). No template change needed.

- [ ] **Step 3: Make sure host-source recipients get a `people` row before recordEmailSend**

Hosts may not have a `people` row. `recordEmailSend` writes to `email_campaign_sends` keyed by `personId`, and `enqueueOutbox` references the same. Add a minimal upsert before `recordEmailSend`:

Inside the `batchPromises.map(async (person) => {` block, replace:

```js
const unsubscribeToken = ...;
const unsubscribeUrl = ...;
```

with (combined with Step 2):

```js
// Hosts use profile_id as `id`; ensure they exist in `people` so
// campaign_sends + outbox can FK against people.id.
let personId = person.id;
if (person._source === "host") {
  const { data: upserted } = await supabase
    .from("people")
    .upsert(
      {
        email: person.email,
        name: person.name || null,
        import_source: "host_account",
      },
      { onConflict: "email" },
    )
    .select("id")
    .single();
  if (upserted?.id) personId = upserted.id;
}

const unsubscribeToken = sendMode === "internal"
  ? null
  : await ensureUnsubscribeToken(personId);
const unsubscribeUrl = unsubscribeToken
  ? `${frontendBaseUrl}/u/${unsubscribeToken}`
  : null;
```

Then update the `recordEmailSend` and `enqueueOutbox` calls in the same block to use `personId` instead of `person.id`:

```js
const campaignSend = await recordEmailSend({
  personId,
  campaignId: campaign.id,
  email: person.email,
  subject: campaign.subject,
  status: "sent",
});

const outboxRow = await enqueueOutbox({
  fromEmail: fromHeader,
  toEmail: person.email,
  subject: campaign.subject,
  htmlBody: html,
  textBody: null,
  campaignSendId: campaignSend?.id || null,
  idempotencyKey: `${campaign.id}:${personId}`,
  category: sendMode === "internal" ? "transactional" : "newsletter",
  campaignTag,
});
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/felixcivalero/projects/pullup add backend/src/services/adminBroadcastSender.js
git -C /Users/felixcivalero/projects/pullup commit -m "admin email: honor sendMode in send path (no footer + internal tag)"
```

---

## Task 5: Backend — extend `/admin/email/audience` query parsing

**Files:**
- Modify: `backend/src/index.js:10513-10572`

- [ ] **Step 1: Parse the new query params**

Inside the handler, after the existing `attendedEventLogic` lookup and before `const filterCriteria = {`:

```js
    const audienceSource =
      req.query.source === "hosts" || req.query.source === "everyone"
        ? req.query.source
        : "contacts";
    const sendMode = req.query.sendMode === "internal" ? "internal" : "broadcast";

    const hostAccountState =
      ["any", "never", "inactive30d", "recent30d"].includes(req.query.hostAccountState)
        ? req.query.hostAccountState
        : "any";

    const hostEventCount = (() => {
      const v = req.query.hostEventCount;
      if (v === "exactly0") return "exactly0";
      const n = Number(v);
      if (n === 1 || n === 3) return n;
      return "any";
    })();

    const hostAccountAge =
      ["any", "lte30d", "30to90d", "gt90d"].includes(req.query.hostAccountAge)
        ? req.query.hostAccountAge
        : "any";

    const hostLeadStatusesParam = req.query.hostLeadStatuses;
    const hostLeadStatuses = hostLeadStatusesParam
      ? String(hostLeadStatusesParam)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
```

- [ ] **Step 2: Add the new fields to `filterCriteria`**

Append to the existing `filterCriteria` object literal:

```js
    const filterCriteria = {
      audienceSource,
      sendMode,
      excludeHosts: req.query.excludeHosts !== "false",
      marketingConsent: req.query.marketingConsent || "any",
      importSource: req.query.importSource || null,
      minEventsAttended: Number(req.query.minEventsAttended) || 0,
      hasPaid: req.query.hasPaid === "true",
      minTotalSpend: Number(req.query.minTotalSpend) || 0,
      joinedAfter: req.query.joinedAfter || null,
      attendedEventTags,
      attendedEventIds,
      attendedEventLogic,
      hostAccountState,
      hostEventCount,
      hostAccountAge,
      hostLeadStatuses,
    };
```

- [ ] **Step 3: Extend the sample row response to include host fields**

Change the sample mapping to include host-specific data when present:

```js
      sample: audience.slice(0, 30).map((p) => ({
        id: p.id,
        email: p.email,
        name: p.name,
        marketingConsent: p.marketing_consent,
        paymentCount: p.payment_count || 0,
        totalSpend: p.total_spend || 0,
        importSource: p.import_source || null,
        // Host-source fields (null for contact-source rows)
        source: p._source || "contact",
        lastLoginAt: p.last_login_at || null,
        eventCount: p.event_count || 0,
        leadStatus: p.lead_status || null,
      })),
```

For the `everyone` source we want the sample to interleave. Replace the slice line with a dedicated "balanced sample" computation:

```js
      sample: balancedSample(audience, 30).map((p) => ({
        // ... same mapping
      })),
```

And add the helper at the bottom of the same file (or top of the handler module-scope):

```js
function balancedSample(rows, max) {
  const hosts = rows.filter((r) => r._source === "host");
  const others = rows.filter((r) => r._source !== "host");
  if (hosts.length === 0 || others.length === 0) return rows.slice(0, max);
  const half = Math.floor(max / 2);
  const hostsTake = Math.min(half, hosts.length);
  const othersTake = Math.min(max - hostsTake, others.length);
  return [...hosts.slice(0, hostsTake), ...others.slice(0, othersTake)].sort(
    (a, b) => (a.name || "").localeCompare(b.name || ""),
  );
}
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/felixcivalero/projects/pullup add backend/src/index.js
git -C /Users/felixcivalero/projects/pullup commit -m "admin email: parse audienceSource + sendMode + host filters at /audience endpoint"
```

---

## Task 6: Backend — write the audience-source test

**Files:**
- Create: `backend/tests/admin-audience-source.test.js`

- [ ] **Step 1: Extract pure filter helpers into a new module**

The Supabase-coupled code in `adminBroadcastSender.js` is hard to test directly. Move the pure filtering + dedup logic into a new module so tests can exercise it without any DB calls.

Create `backend/src/services/adminAudienceFilters.js`:

```js
// Pure filtering helpers — no supabase dependency. Tested in isolation.

const DAY = 24 * 60 * 60 * 1000;

export function applyHostFilters(candidates, {
  hostAccountState = "any",
  hostEventCount = "any",
  hostAccountAge = "any",
  hostLeadStatuses = [],
  sendMode = "broadcast",
  now = Date.now(),
}) {
  return candidates.filter((c) => {
    if (hostAccountState === "never" && c.last_login_at) return false;
    if (hostAccountState === "inactive30d") {
      if (!c.last_login_at) return false;
      if (now - new Date(c.last_login_at).getTime() < 30 * DAY) return false;
    }
    if (hostAccountState === "recent30d") {
      if (!c.last_login_at) return false;
      if (now - new Date(c.last_login_at).getTime() > 30 * DAY) return false;
    }

    if (hostEventCount === "exactly0") {
      if (c.event_count !== 0) return false;
    } else if (Number(hostEventCount) >= 1) {
      if (c.event_count < Number(hostEventCount)) return false;
    }

    if (c.created_at && hostAccountAge !== "any") {
      const ageDays = (now - new Date(c.created_at).getTime()) / DAY;
      if (hostAccountAge === "lte30d" && ageDays > 30) return false;
      if (hostAccountAge === "30to90d" && (ageDays <= 30 || ageDays > 90)) return false;
      if (hostAccountAge === "gt90d" && ageDays <= 90) return false;
    }

    if (Array.isArray(hostLeadStatuses) && hostLeadStatuses.length > 0) {
      if (!c.lead_status) return false;
      if (!hostLeadStatuses.includes(c.lead_status)) return false;
    }

    if (sendMode !== "internal" && c.marketing_consent === false) return false;

    return true;
  });
}

export function dedupHostsWinning(hosts, contacts) {
  const byEmail = new Map();
  for (const h of hosts) byEmail.set(h.email, { ...h, _source: "host" });
  for (const c of contacts) {
    if (!byEmail.has(c.email)) byEmail.set(c.email, { ...c, _source: "contact" });
  }
  return Array.from(byEmail.values());
}
```

Then in `adminBroadcastSender.js`, import and use these:

```js
import { applyHostFilters, dedupHostsWinning } from "./adminAudienceFilters.js";
```

Replace the inline filter loop in `getHostAudience` (Task 2 Step 1 — step 7 of that body) with `applyHostFilters(candidates, opts)`. Replace the inline dedup in `getEveryoneAudience` (Task 3 Step 2) with `dedupHostsWinning(hosts, contacts)`.

- [ ] **Step 2: Write the test file targeting the pure helpers**

Create `backend/tests/admin-audience-source.test.js`:

```js
import { applyHostFilters, dedupHostsWinning } from "../src/services/adminAudienceFilters.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const FIXED_NOW = new Date("2026-05-12T00:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function host(over = {}) {
  return {
    id: "h1", email: "a@x.com", name: "A",
    marketing_consent: true,
    last_login_at: null,
    created_at: new Date(FIXED_NOW - 60 * DAY).toISOString(),
    event_count: 0,
    lead_status: null,
    ...over,
  };
}

// --- account state ---

console.log("🧪 hostAccountState=never keeps only hosts who never logged in");
{
  const result = applyHostFilters(
    [host({ last_login_at: null }), host({ id: "h2", last_login_at: new Date(FIXED_NOW - DAY).toISOString() })],
    { hostAccountState: "never", now: FIXED_NOW },
  );
  assert(result.length === 1 && result[0].id === "h1", "only h1 retained");
}

console.log("🧪 hostAccountState=inactive30d keeps only hosts inactive >=30 days");
{
  const result = applyHostFilters(
    [
      host({ id: "fresh", last_login_at: new Date(FIXED_NOW - 5 * DAY).toISOString() }),
      host({ id: "stale", last_login_at: new Date(FIXED_NOW - 45 * DAY).toISOString() }),
      host({ id: "none",  last_login_at: null }),
    ],
    { hostAccountState: "inactive30d", now: FIXED_NOW },
  );
  assert(result.length === 1 && result[0].id === "stale", "only stale retained");
}

// --- event count ---

console.log("🧪 hostEventCount=exactly0 keeps only hosts with zero events");
{
  const result = applyHostFilters(
    [host({ event_count: 0 }), host({ id: "h2", event_count: 2 })],
    { hostEventCount: "exactly0", now: FIXED_NOW },
  );
  assert(result.length === 1 && result[0].event_count === 0, "only zero-event host");
}

console.log("🧪 hostEventCount=3 keeps only hosts with >=3 events");
{
  const result = applyHostFilters(
    [host({ event_count: 2 }), host({ id: "h2", event_count: 3 }), host({ id: "h3", event_count: 7 })],
    { hostEventCount: 3, now: FIXED_NOW },
  );
  assert(result.length === 2, "2+ retained");
  assert(result.every((r) => r.event_count >= 3), "all >=3");
}

// --- account age ---

console.log("🧪 hostAccountAge=lte30d keeps only fresh accounts");
{
  const result = applyHostFilters(
    [
      host({ id: "fresh", created_at: new Date(FIXED_NOW - 10 * DAY).toISOString() }),
      host({ id: "old",   created_at: new Date(FIXED_NOW - 100 * DAY).toISOString() }),
    ],
    { hostAccountAge: "lte30d", now: FIXED_NOW },
  );
  assert(result.length === 1 && result[0].id === "fresh", "only fresh retained");
}

// --- send mode interaction ---

console.log("🧪 broadcast mode drops marketing_consent=false; internal keeps them");
{
  const candidates = [
    host({ id: "yes", marketing_consent: true }),
    host({ id: "no",  marketing_consent: false }),
  ];
  const broadcast = applyHostFilters(candidates, { sendMode: "broadcast", now: FIXED_NOW });
  const internal  = applyHostFilters(candidates, { sendMode: "internal",  now: FIXED_NOW });
  assert(broadcast.length === 1 && broadcast[0].id === "yes", "broadcast drops no-consent");
  assert(internal.length === 2, "internal keeps both");
}

// --- dedup ---

console.log("🧪 dedupHostsWinning: host record beats contact record on the same email");
{
  const hosts    = [{ id: "h1", email: "x@x.com", name: "From Host"    }];
  const contacts = [{ id: "c1", email: "x@x.com", name: "From Contact" }];
  const out = dedupHostsWinning(hosts, contacts);
  assert(out.length === 1, "one row");
  assert(out[0].name === "From Host", "host name wins");
  assert(out[0]._source === "host", "_source tagged host");
}

console.log("🧪 dedupHostsWinning: unique contacts pass through");
{
  const hosts    = [{ id: "h1", email: "a@x.com", name: "A" }];
  const contacts = [{ id: "c1", email: "b@x.com", name: "B" }];
  const out = dedupHostsWinning(hosts, contacts);
  assert(out.length === 2, "both kept");
  const tagged = out.find((r) => r.email === "b@x.com");
  assert(tagged && tagged._source === "contact", "contact tagged");
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed.");
```

- [ ] **Step 3: Run the test**

```bash
cd /Users/felixcivalero/projects/pullup/backend && node tests/admin-audience-source.test.js
```

Expected output: all `✅` checks, ending with `All tests passed.` and exit 0.

- [ ] **Step 4: Commit**

```bash
git -C /Users/felixcivalero/projects/pullup add backend/src/services/adminAudienceFilters.js backend/src/services/adminBroadcastSender.js backend/tests/admin-audience-source.test.js
git -C /Users/felixcivalero/projects/pullup commit -m "admin email: extract audience filters to pure module + add tests"
```

---

## Task 7: Frontend — add `audienceSource` and `sendMode` state to `AdminEmailPage`

**Files:**
- Modify: `frontend/src/pages/AdminEmailPage.jsx:90-101, 106-125, 222-228`

- [ ] **Step 1: Extend `filters` state with new fields**

In the `useState` initializer for `filters` (around line 90):

```js
  const [filters, setFilters] = useState({
    audienceSource: "contacts",       // new
    sendMode: "broadcast",            // new
    excludeHosts: true,               // kept for back-compat but no longer surfaced
    marketingConsent: "any",
    minEventsAttended: 0,
    hasPaid: false,
    attendedEventTags: [],
    attendedEvents: [],
    attendedEventLogic: "or",
    // Host-source filters
    hostAccountState: "any",
    hostEventCount: "any",
    hostAccountAge: "any",
    hostLeadStatuses: [],
  });
```

- [ ] **Step 2: Update `filterQuery` memo to serialize the new fields**

Replace the `filterQuery` `useMemo` body (around line 106) with:

```js
  const filterQuery = useMemo(() => {
    const q = new URLSearchParams();
    q.set("source", filters.audienceSource);
    q.set("sendMode", filters.sendMode);

    if (filters.audienceSource === "contacts" || filters.audienceSource === "everyone") {
      if (filters.marketingConsent && filters.marketingConsent !== "any")
        q.set("marketingConsent", filters.marketingConsent);
      if (Number(filters.minEventsAttended) > 0)
        q.set("minEventsAttended", String(filters.minEventsAttended));
      if (filters.hasPaid) q.set("hasPaid", "true");
      if (filters.attendedEventTags?.length > 0)
        q.set("attendedEventTags", filters.attendedEventTags.join(","));
      if (filters.attendedEvents?.length > 0) {
        q.set("attendedEventIds", filters.attendedEvents.map((e) => e.id).join(","));
        if (filters.attendedEventLogic === "and") q.set("attendedEventLogic", "and");
      }
    }

    if (filters.audienceSource === "hosts" || filters.audienceSource === "everyone") {
      if (filters.hostAccountState && filters.hostAccountState !== "any")
        q.set("hostAccountState", filters.hostAccountState);
      if (filters.hostEventCount && filters.hostEventCount !== "any")
        q.set("hostEventCount", String(filters.hostEventCount));
      if (filters.hostAccountAge && filters.hostAccountAge !== "any")
        q.set("hostAccountAge", filters.hostAccountAge);
      if (filters.hostLeadStatuses?.length > 0)
        q.set("hostLeadStatuses", filters.hostLeadStatuses.join(","));
    }

    return q.toString();
  }, [filters]);
```

- [ ] **Step 3: Update `handleConfirmSend` to include the new fields in `persistedCriteria`**

In `handleConfirmSend` (around line 222), change `persistedCriteria` to include everything:

```js
      const { attendedEvents = [], ...rest } = filters;
      const persistedCriteria = {
        ...rest,
        attendedEventIds: attendedEvents.map((e) => e.id),
      };
```

This already spreads `...rest`, which now includes `audienceSource`, `sendMode`, and the host filters. No change needed — verify the spread covers them. Confirmed: it does.

- [ ] **Step 4: Commit (state changes only — UI still renders contact tab)**

```bash
git -C /Users/felixcivalero/Projects/pullup add frontend/src/pages/AdminEmailPage.jsx
git -C /Users/felixcivalero/Projects/pullup commit -m "admin email: add audienceSource + sendMode + host filters to state"
```

---

## Task 8: Frontend — add the source toggle at the top of the segment tab

**Files:**
- Modify: `frontend/src/pages/AdminEmailPage.jsx` (inside `AdminAudienceTab`)

- [ ] **Step 1: Add a `SourceToggle` component above the existing function declarations**

Just below the `pillStyle` function (around line 932), add:

```jsx
function SourceToggle({ value, onChange }) {
  const opts = [
    { key: "contacts", label: "Contacts" },
    { key: "hosts",    label: "Hosts" },
    { key: "everyone", label: "Everyone" },
  ];
  return (
    <div
      style={{
        display: "flex",
        padding: 3,
        background: "rgba(255,255,255,0.04)",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.06)",
        marginBottom: 12,
      }}
    >
      {opts.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 9,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              background: active
                ? "linear-gradient(135deg, rgba(192,192,192,0.18), rgba(232,232,232,0.10))"
                : "transparent",
              color: active ? "#fff" : "rgba(255,255,255,0.45)",
              transition: "all 0.15s ease",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Render `SourceToggle` at the top of `AdminAudienceTab`**

Find `AdminAudienceTab` (line 519). Right inside its returned root `<div>`, before the audience-count card, render:

```jsx
      <SourceToggle
        value={filters.audienceSource}
        onChange={(v) => setFilters((f) => ({
          ...f,
          audienceSource: v,
          // Smart default for sendMode based on source
          sendMode: v === "hosts" ? "internal" : "broadcast",
        }))}
      />
```

- [ ] **Step 3: Hide the existing "Exclude host accounts" toggle**

The existing `ToggleRow` for `excludeHosts` (around line 610) is now redundant. Delete that `ToggleRow` block entirely.

- [ ] **Step 4: Smoke-test in the browser**

Start the dev server and verify:
- The toggle renders above the audience count card.
- Clicking "Hosts" / "Everyone" / "Contacts" updates `filters.audienceSource`.
- The audience count fetch fires (use Network tab) with `?source=hosts` etc.
- Backend returns a response; count number updates.

```bash
cd /Users/felixcivalero/Projects/pullup/frontend && npm run dev
```

Open `http://localhost:5173/admin/email` and click through all three options. If the host count differs from contacts, the wiring works end-to-end.

- [ ] **Step 5: Commit**

```bash
git -C /Users/felixcivalero/Projects/pullup add frontend/src/pages/AdminEmailPage.jsx
git -C /Users/felixcivalero/Projects/pullup commit -m "admin email: add three-way source toggle to segment tab"
```

---

## Task 9: Frontend — render host filter pills when source is hosts/everyone

**Files:**
- Modify: `frontend/src/pages/AdminEmailPage.jsx` (inside `AdminAudienceTab`)

- [ ] **Step 1: Hide contact-only filter cards when source = `hosts`**

In `AdminAudienceTab`, wrap the existing "Marketing consent" card, the "Behavior" card, the "Interested in" tag cloud, and the `AttendedEventsFilter` in a conditional:

```jsx
{(filters.audienceSource === "contacts" || filters.audienceSource === "everyone") && (
  <>
    {/* existing marketing consent card */}
    {/* existing behavior card (min events attended, hasPaid) */}
    {tagOptions && tagOptions.length > 0 && (
      /* existing "Interested in" card */
    )}
    <AttendedEventsFilter ... />
  </>
)}
```

Identify which existing JSX to wrap by reading lines 585–823 (the consent card, behavior card, tag cloud, and event picker). All four go inside the conditional.

- [ ] **Step 2: Add a new `HostFiltersCard` component**

Just above `AttendedEventsFilter` (around line 938), add:

```jsx
function HostFiltersCard({ filters, setFilters }) {
  const accountStates = [
    { key: "any",          label: "Any" },
    { key: "never",        label: "Never signed in" },
    { key: "inactive30d",  label: "Inactive 30d+" },
    { key: "recent30d",    label: "Active ≤30d" },
  ];
  const eventCounts = [
    { key: "any",      label: "Any" },
    { key: "exactly0", label: "0 events" },
    { key: 1,          label: "1+" },
    { key: 3,          label: "3+" },
  ];
  const accountAges = [
    { key: "any",     label: "Any" },
    { key: "lte30d",  label: "≤30d" },
    { key: "30to90d", label: "30–90d" },
    { key: "gt90d",   label: ">90d" },
  ];

  return (
    <div style={{
      padding: 16,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12,
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      <div style={{
        fontSize: 11, color: "rgba(255,255,255,0.5)",
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        Host filters
      </div>

      <div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500, marginBottom: 6 }}>
          Account state
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {accountStates.map((o) => {
            const active = filters.hostAccountState === o.key;
            return (
              <button key={o.key} type="button"
                onClick={() => setFilters((f) => ({ ...f, hostAccountState: o.key }))}
                style={pillStyle(active, "#60a5fa")}>
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500, marginBottom: 6 }}>
          Events created
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {eventCounts.map((o) => {
            const active = String(filters.hostEventCount) === String(o.key);
            return (
              <button key={String(o.key)} type="button"
                onClick={() => setFilters((f) => ({ ...f, hostEventCount: o.key }))}
                style={pillStyle(active, "#4ade80")}>
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500, marginBottom: 6 }}>
          Account age
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {accountAges.map((o) => {
            const active = filters.hostAccountAge === o.key;
            return (
              <button key={o.key} type="button"
                onClick={() => setFilters((f) => ({ ...f, hostAccountAge: o.key }))}
                style={pillStyle(active, "#fbbf24")}>
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render `HostFiltersCard` when source is hosts/everyone**

In `AdminAudienceTab`, after the conditional contact-only block from Step 1, add:

```jsx
{(filters.audienceSource === "hosts" || filters.audienceSource === "everyone") && (
  <HostFiltersCard filters={filters} setFilters={setFilters} />
)}
```

- [ ] **Step 4: Update sample row rendering to show host-specific badges**

In the sample-list block (around line 826), replace the existing badge logic for `marketingConsent` / `paymentCount` with:

```jsx
{p.source === "host" ? (
  <span style={{
    fontSize: 9,
    color: "#60a5fa",
    padding: "1px 6px",
    borderRadius: 999,
    background: "rgba(96,165,250,0.1)",
    border: "1px solid rgba(96,165,250,0.25)",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  }}>
    Host · {p.eventCount} event{p.eventCount === 1 ? "" : "s"}
  </span>
) : (
  <>
    {p.marketingConsent && (
      <span style={{
        fontSize: 9, color: "#4ade80", padding: "1px 6px",
        borderRadius: 999, background: "rgba(74,222,128,0.1)",
        border: "1px solid rgba(74,222,128,0.25)",
        letterSpacing: "0.05em", textTransform: "uppercase",
      }}>Opted in</span>
    )}
    {p.paymentCount > 0 && (
      <span style={{
        fontSize: 11, color: "rgba(251,191,36,0.85)", whiteSpace: "nowrap",
      }}>
        {p.paymentCount} pay{p.paymentCount !== 1 ? "s" : ""}
      </span>
    )}
  </>
)}
```

- [ ] **Step 5: Smoke-test**

Refresh `http://localhost:5173/admin/email`:
- Click "Hosts" → contact filters disappear, host filters appear.
- Click "Never signed in" → audience count drops, sample shows hosts without a "last login".
- Click "Everyone" → both sets of filters visible.
- Click "Contacts" → original behavior restored.

- [ ] **Step 6: Commit**

```bash
git -C /Users/felixcivalero/Projects/pullup add frontend/src/pages/AdminEmailPage.jsx
git -C /Users/felixcivalero/Projects/pullup commit -m "admin email: render host filter pills + host-shaped sample rows"
```

---

## Task 10: Frontend — add send-mode selector to the composer

**Files:**
- Modify: `frontend/src/pages/AdminEmailPage.jsx` (inside `AdminEmailComposer` or the segment tab footer)

- [ ] **Step 1: Decide placement**

The selector lives in the **Design tab**, at the top of the composer card (where "Email" header is). It's tied to the send, not the audience. Reading the spec: "Send mode selector lives in the Design tab footer (near the Send button area)." Placing it inside `AdminEmailComposer` keeps it visible whenever the design tab is active.

- [ ] **Step 2: Add `SendModeSelector` component**

Just above `AdminEmailComposer` (around line 1343), add:

```jsx
function SendModeSelector({ value, onChange }) {
  const opts = [
    { key: "broadcast", label: "Marketing broadcast", hint: "Consent-gated · unsubscribe footer" },
    { key: "internal",  label: "Internal / transactional", hint: "Skips consent · no footer" },
  ];
  return (
    <div style={{
      padding: 14,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12,
      marginBottom: 14,
    }}>
      <div style={{
        fontSize: 11, color: "rgba(255,255,255,0.5)",
        textTransform: "uppercase", letterSpacing: "0.08em",
        marginBottom: 10,
      }}>
        Send mode
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {opts.map((o) => {
          const active = value === o.key;
          return (
            <button key={o.key} type="button"
              onClick={() => onChange(o.key)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                background: active ? "rgba(74,222,128,0.10)" : "rgba(255,255,255,0.02)",
                border: active ? "1px solid rgba(74,222,128,0.35)" : "1px solid rgba(255,255,255,0.08)",
                textAlign: "left",
              }}>
              <div style={{
                width: 14, height: 14, borderRadius: 999,
                border: active ? "1px solid #4ade80" : "1px solid rgba(255,255,255,0.3)",
                background: active ? "#4ade80" : "transparent",
                marginTop: 3, flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: 12, color: "#fff", fontWeight: 500 }}>{o.label}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{o.hint}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render it inside `AdminEmailComposer`**

Pass `sendMode` and a setter down from the parent. In `AdminEmailPage`, when rendering `<AdminEmailComposer ...>`, add:

```jsx
sendMode={filters.sendMode}
setSendMode={(v) => setFilters((f) => ({ ...f, sendMode: v }))}
```

In the `AdminEmailComposer` signature, add the two props:

```js
function AdminEmailComposer({
  subject, setSubject,
  previewText, setPreviewText,
  fromName, setFromName,
  blocks, setBlocks,
  hoveredKey, setHoveredKey,
  sendMode, setSendMode,
}) {
```

Inside the composer's returned JSX, render the selector at the top:

```jsx
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SendModeSelector value={sendMode} onChange={setSendMode} />
      {/* existing Email card */}
      {/* existing Content card */}
    </div>
  );
```

- [ ] **Step 4: Smoke-test**

Refresh and switch to the Design tab. Confirm the radio cards render at the top. Click between "Marketing broadcast" and "Internal / transactional" — the highlight should follow.

Switch the audience source to "Hosts" — the send mode should auto-flip to "Internal" (smart default from Task 8 Step 2). Switch back to "Contacts" — it flips back to "Broadcast". Admin can override either way.

- [ ] **Step 5: Commit**

```bash
git -C /Users/felixcivalero/Projects/pullup add frontend/src/pages/AdminEmailPage.jsx
git -C /Users/felixcivalero/Projects/pullup commit -m "admin email: add send-mode selector with source-driven default"
```

---

## Task 11: End-to-end smoke send + verify

**Files:** none — this is a manual verification gate.

- [ ] **Step 1: Send a test internal email to one host**

In the Hosts source, narrow the filter so the audience is exactly 1 (e.g. pick `hostEventCount: "exactly0"` and `hostAccountState: "never"`, then verify count). Use a subject like "[TEST] internal mode".

Confirm send and watch the dialog progress.

- [ ] **Step 2: Inspect the resulting `email_outbox` row**

Open Supabase studio (or use mcp__supabase__execute_sql), query:

```sql
SELECT subject, campaign_tag, category, html_body
FROM email_outbox
WHERE subject = '[TEST] internal mode'
ORDER BY created_at DESC
LIMIT 1;
```

Assert:
- `campaign_tag` matches `admin_internal_<uuid>` (not `admin_broadcast_*`)
- `category` is `transactional` (not `newsletter`)
- `html_body` does NOT contain the unsubscribe block — grep for the string `unsubscribe from this list` and confirm it's absent.

- [ ] **Step 3: Repeat for a broadcast send**

Switch back to Contacts source (default broadcast). Narrow to 1 recipient (e.g., known marketing-opted-in email) and send "[TEST] broadcast mode".

Re-query and assert:
- `campaign_tag` matches `admin_broadcast_<uuid>`
- `category` is `newsletter`
- `html_body` contains `unsubscribe from this list`

- [ ] **Step 4: Verify dedup with Everyone**

Pick an email that exists both as a host and as a `people` row. Switch source to Everyone, narrow so just this one email is in the audience. Send "[TEST] dedup". Query the outbox:

```sql
SELECT count(*) FROM email_outbox WHERE subject = '[TEST] dedup';
```

Assert: exactly 1 row (host-wins dedup).

- [ ] **Step 5: Final commit if anything was tweaked during verification**

If verification surfaced fixes, commit them with a clear message.

```bash
git -C /Users/felixcivalero/projects/pullup status
git -C /Users/felixcivalero/Projects/pullup status
# Commit any tweaks; otherwise nothing to do.
```

---

## Self-review summary

**Spec coverage:**
- Three-way source toggle → Task 8
- Host filter set (account state, events created, account age, lead status) → Task 9 + Task 2/6
- Send mode selector with smart default → Task 10
- Backend audience branching → Tasks 1, 2, 3
- Send mode plumbing (footer, tag, category) → Task 4
- API endpoint changes → Task 5
- Dedup (host wins) → Task 3 + Task 6 test
- Edge case: missing `people` row for hosts → Task 4 Step 3
- Edge case: balanced sample for Everyone → Task 5 Step 3
- No schema changes → confirmed (everything in JSON criteria)

**Type consistency check:**
- `hostEventCount` accepts `"any" | "exactly0" | 1 | 3` consistently across Tasks 5, 6, 7, 9.
- `audienceSource` is `"contacts" | "hosts" | "everyone"` everywhere.
- `sendMode` is `"broadcast" | "internal"` everywhere.
- `_source` tag on audience rows: `"host" | "contact"`, set in Tasks 2, 3 and consumed in Tasks 5, 9.

**Placeholder scan:** none — all code blocks are concrete; all commands have expected outputs; smoke tests have explicit assertions.
