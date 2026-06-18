-- ════════════════════════════════════════════════════════════════════════
-- 108_host_digest_send_time.sql
--
-- Let each host choose WHEN their daily summary lands — in THEIR timezone.
--
-- Until now the digest tick fired hourly and sent to every due host on a
-- single UTC schedule (whenever they first became due). This adds three
-- columns so a host can say "8:00 in my morning" and have it be correct
-- through DST, anywhere on earth:
--
--   send_hour   — local hour-of-day (0–23) to send at
--   send_minute — local minute (only :00 / :30 in the UI; column allows 0–59)
--   timezone    — IANA name (e.g. 'Europe/Stockholm'). NOT an offset — the
--                 name is what makes Postgres/Intl handle DST automatically.
--                 Auto-captured from the host's browser; they never pick it.
--
-- Defaults (08:00 'UTC') keep already-enabled hosts behaving sanely until the
-- next time they open notification settings, at which point the frontend
-- silently adopts their real browser timezone.
--
-- Idempotent: safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════

alter table public.host_notification_prefs
  add column if not exists send_hour   smallint not null default 8,
  add column if not exists send_minute smallint not null default 0,
  add column if not exists timezone    text     not null default 'UTC';

-- Sanity bounds. Guard so re-running is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'host_notification_prefs_send_hour_chk'
  ) then
    alter table public.host_notification_prefs
      add constraint host_notification_prefs_send_hour_chk
      check (send_hour between 0 and 23);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'host_notification_prefs_send_minute_chk'
  ) then
    alter table public.host_notification_prefs
      add constraint host_notification_prefs_send_minute_chk
      check (send_minute between 0 and 59);
  end if;
end $$;

comment on column public.host_notification_prefs.send_hour is
  'Local hour-of-day (0–23) the daily digest should send at, in `timezone`.';
comment on column public.host_notification_prefs.send_minute is
  'Local minute the digest sends at (UI uses :00 / :30).';
comment on column public.host_notification_prefs.timezone is
  'IANA timezone name (e.g. Europe/Stockholm) — auto-captured from the host browser. Name not offset, so DST is handled automatically.';
