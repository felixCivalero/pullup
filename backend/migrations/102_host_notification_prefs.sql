-- ════════════════════════════════════════════════════════════════════════
-- 102_host_notification_prefs.sql
--
-- Host NOTIFICATIONS — opt-in, default-OFF, email-only daily digest.
--
-- Hosts currently get no notifications. This table holds one row per host
-- carrying their preference: whether the daily summary is on, which activity
-- categories to include, and when we last sent it (the double-send guard for
-- the recurring digest tick).
--
-- Cost-conscious by design: email only, ONE batched digest per day, and only
-- when there was real activity in their world in the last ~24h. Default OFF —
-- existing hosts see no behavior change until they explicitly opt in.
--
-- `channel` is implied "email" for now; the column is intentionally NOT here —
-- the API reports channel:"email" as a constant so other channels can be
-- added later without a schema change being the blocker.
--
-- Idempotent: safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.host_notification_prefs (
  host_id      uuid primary key references auth.users (id) on delete cascade,

  -- Master switch. Default OFF — opt-in only.
  enabled      boolean not null default false,

  -- Cadence. Only "daily" exists today; column lets us add more later.
  frequency    text not null default 'daily',

  -- Which activity categories the digest covers. All true by default so a
  -- host who flips `enabled` on gets the full picture until they trim it.
  categories   jsonb not null default jsonb_build_object(
                 'rsvps',     true,
                 'messages',  true,
                 'waitlist',  true,
                 'community', true,
                 'pullups',   true
               ),

  -- Last successful digest send. NULL = never sent. The daily tick uses this
  -- as its double-send guard (only re-sends when older than ~20h).
  last_sent_at timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.host_notification_prefs is
  'Per-host opt-in daily email digest preferences. Default OFF, email-only.';
comment on column public.host_notification_prefs.last_sent_at is
  'Last digest send; NULL=never. The recurring tick re-sends only when older than ~20h.';

-- The daily tick scans for enabled hosts due for a send — index that path.
create index if not exists host_notification_prefs_enabled_due_idx
  on public.host_notification_prefs (enabled, last_sent_at)
  where enabled = true;
