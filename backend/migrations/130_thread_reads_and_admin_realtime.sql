-- 129_thread_reads_and_admin_realtime.sql
--
-- Two pieces that make chat notifications truthful and live:
--
-- 1. thread_reads — per-thread read watermarks, so an unread dot means "new
--    since you last LOOKED", not "new since you last replied". One row per
--    (host, person, seat):
--      seat 'host'  — the host reading a person's thread in their dock
--      seat 'admin' — the operator seat reading a host's PullUp system thread
--                     (shared across admins: PullUp is one voice, one read state)
--
-- 2. An RLS SELECT path on person_events for platform admins, so the admin
--    dashboard can subscribe to Supabase Realtime on the system person's rows
--    (Realtime respects RLS; without this the admin socket receives nothing).
--    platform_admins itself is service-role-only, so the check needs a
--    SECURITY DEFINER helper.

create table if not exists thread_reads (
  host_id      uuid not null references auth.users(id) on delete cascade,
  person_id    uuid not null references people(id) on delete cascade,
  seat         text not null default 'host', -- 'host' | 'admin'
  last_read_at timestamptz not null default now(),
  primary key (host_id, person_id, seat)
);

-- Service-role only (reads/writes go through the API).
alter table thread_reads enable row level security;

-- Is the CALLING user a platform admin? SECURITY DEFINER so the check can read
-- platform_admins (service-role-only) from inside an RLS policy.
create or replace function pullup_is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins pa where pa.user_id = auth.uid());
$$;

drop policy if exists person_events_admin_select on person_events;
create policy person_events_admin_select on person_events
  for select using (pullup_is_platform_admin());
