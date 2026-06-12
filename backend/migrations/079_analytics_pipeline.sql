-- 079_analytics_pipeline.sql
--
-- The analytics spine for the Room-era platform. Replaces the ad-hoc landing
-- tables (landing_page_views / landing_page_events) with one append-only
-- event stream + daily rollups, and stamps every account with how it was
-- born (landing signup vs RSVP side-effect).
--
--   analytics_events   — append-only spine. Exactly-once by client_event_id
--                        (the client mints a UUID per event; batch ingest
--                        upserts with ON CONFLICT DO NOTHING), sessionized
--                        client-side (session_id rotates after 30 min idle).
--   analytics_daily    — idempotent per-day rollups (delete+insert), kept
--                        fresh by pg_cron hourly. Admin reads = rollups for
--                        closed days + a live scan of today only.
--   profiles.signup_origin — 'landing' | 'rsvp', stamped at profile creation
--                        (lazy-create checks whether a linked people row
--                        existed first). Existing rows backfilled with the
--                        heuristic below and flagged signup_origin_inferred.
--
-- History is preserved: the legacy landing tables are backfilled INTO
-- analytics_events using their own row ids as client_event_id, so re-running
-- the backfill is a no-op and the old and new worlds never double-count.

-- ---------------------------------------------------------------------------
-- 1. The event spine
-- ---------------------------------------------------------------------------

create table if not exists analytics_events (
  id              uuid primary key default gen_random_uuid(),
  client_event_id uuid not null unique,
  visitor_id      text not null,
  session_id      text,
  event_name      text not null,
  page            text not null default 'landing',
  props           jsonb,
  source          text,
  referrer        text,
  utm             jsonb,
  device_type     text,
  occurred_at     timestamptz not null,
  received_at     timestamptz not null default now()
);

create index if not exists analytics_events_name_time_idx
  on analytics_events (event_name, occurred_at);
create index if not exists analytics_events_visitor_idx
  on analytics_events (visitor_id, occurred_at);
create index if not exists analytics_events_session_idx
  on analytics_events (session_id);
-- BRIN keeps time-range scans cheap forever on an append-only table.
create index if not exists analytics_events_time_brin
  on analytics_events using brin (occurred_at);

-- ---------------------------------------------------------------------------
-- 2. Daily rollups
-- ---------------------------------------------------------------------------

create table if not exists analytics_daily (
  day         date   not null,
  page        text   not null default 'landing',
  event_name  text   not null,
  source      text   not null default '',
  device_type text   not null default '',
  section     text   not null default '',
  events      bigint not null default 0,
  visitors    bigint not null default 0,
  sessions    bigint not null default 0,
  primary key (day, page, event_name, source, device_type, section)
);

-- Idempotent per-day rebuild: delete+insert means a re-run (or a late event
-- arriving before the next cron tick) can never double-count.
create or replace function rollup_analytics_daily(p_day date)
returns void
language sql
security definer
set search_path = public
as $$
  delete from analytics_daily where day = p_day;
  insert into analytics_daily
    (day, page, event_name, source, device_type, section, events, visitors, sessions)
  select
    p_day,
    page,
    event_name,
    coalesce(source, ''),
    coalesce(device_type, ''),
    coalesce(props->>'section', ''),
    count(*),
    count(distinct visitor_id),
    count(distinct session_id)
  from analytics_events
  where occurred_at >= p_day::timestamptz
    and occurred_at <  (p_day + 1)::timestamptz
  group by page, event_name, coalesce(source, ''), coalesce(device_type, ''),
           coalesce(props->>'section', '');
$$;

-- ---------------------------------------------------------------------------
-- 3. Signup origin on profiles
-- ---------------------------------------------------------------------------

alter table profiles
  add column if not exists signup_origin text,
  add column if not exists signup_origin_inferred boolean not null default false;

-- Backfill the pre-stamp population. Heuristic (agreed with Felix):
--   created >= 1 event          -> 'landing'  (they're hosts; the front door)
--   linked people row exists    -> 'rsvp'     (account born as a guest)
--   otherwise                   -> 'landing'  (signed up, never RSVP'd)
-- All flagged inferred so the admin UI can mark them honestly.
update profiles p
   set signup_origin = case
         when exists (select 1 from events e where e.host_id = p.id) then 'landing'
         when exists (select 1 from people pe where pe.auth_user_id = p.id) then 'rsvp'
         else 'landing'
       end,
       signup_origin_inferred = true
 where p.signup_origin is null;

-- ---------------------------------------------------------------------------
-- 4. Backfill legacy landing tables into the spine
-- ---------------------------------------------------------------------------
-- Old row ids become client_event_id, so this is idempotent and the legacy
-- tables can freeze in place (nothing writes them after the app deploy).

insert into analytics_events
  (client_event_id, visitor_id, session_id, event_name, page, props, source,
   referrer, device_type, occurred_at, received_at)
select id, coalesce(visitor_id, 'legacy:' || id::text), null, 'page_view',
       'landing', null, source, referrer, device_type, created_at, created_at
  from landing_page_views
on conflict (client_event_id) do nothing;

insert into analytics_events
  (client_event_id, visitor_id, session_id, event_name, page, props, source,
   referrer, device_type, occurred_at, received_at)
select id, coalesce(visitor_id, 'legacy:' || id::text), null, event_name,
       'landing', props, source, null, device_type, created_at, created_at
  from landing_page_events
on conflict (client_event_id) do nothing;

-- Roll up every day that now has events (history + today).
select rollup_analytics_daily(d)
  from (select distinct (occurred_at at time zone 'utc')::date as d
          from analytics_events) days;

-- ---------------------------------------------------------------------------
-- 5. The one-call admin overview
-- ---------------------------------------------------------------------------
-- Whole landing page payload in a single round trip. Closed days come from
-- analytics_daily; today is scanned live from analytics_events; range-level
-- unique visitors/sessions and the funnels are computed from the spine
-- directly (distinct-across-days can't be summed from rollups).

create or replace function analytics_landing_overview(p_from date, p_to date)
returns jsonb
language sql
security definer
set search_path = public
as $$
with bounds as (
  select p_from::timestamptz as t_from,
         (p_to + 1)::timestamptz as t_to,
         (p_to - p_from + 1) as n_days,
         (p_from - (p_to - p_from + 1))::timestamptz as prev_t_from,
         p_from::timestamptz as prev_t_to
),
-- Daily series: rollups for closed days, live for today.
daily_rolled as (
  select day, source, sum(visitors) as visitors, sum(events) as views
    from analytics_daily
   where event_name = 'page_view' and page = 'landing'
     and day >= p_from and day <= p_to
     and day < (now() at time zone 'utc')::date
   group by day, source
),
daily_live as (
  select (occurred_at at time zone 'utc')::date as day,
         coalesce(source, '') as source,
         count(distinct visitor_id) as visitors,
         count(*) as views
    from analytics_events, bounds
   where event_name = 'page_view' and page = 'landing'
     and occurred_at >= greatest(t_from, ((now() at time zone 'utc')::date)::timestamptz)
     and occurred_at < t_to
   group by 1, 2
),
daily_series as (
  select * from daily_rolled union all select * from daily_live
),
-- Range-level uniques + device split, straight from the spine.
range_events as (
  select visitor_id, session_id, device_type, event_name, props
    from analytics_events, bounds
   where page = 'landing'
     and occurred_at >= t_from and occurred_at < t_to
),
prev_range_events as (
  select visitor_id
    from analytics_events, bounds
   where page = 'landing' and event_name = 'page_view'
     and occurred_at >= prev_t_from and occurred_at < prev_t_to
),
kpis as (
  select
    (select count(*) from range_events where event_name = 'page_view') as views,
    (select count(distinct visitor_id) from range_events where event_name = 'page_view') as visitors,
    (select count(distinct visitor_id) from prev_range_events) as prev_visitors,
    (select count(distinct session_id) from range_events where session_id is not null) as sessions,
    -- bounce = sessions that produced a page_view and nothing else
    (select count(*) from (
       select session_id
         from range_events
        where session_id is not null
        group by session_id
       having count(*) = 1
          and max(event_name) = 'page_view'
     ) b) as bounced_sessions
),
device_split as (
  select coalesce(device_type, 'unknown') as device,
         count(distinct visitor_id) as visitors
    from range_events
   where event_name = 'page_view'
   group by 1
),
-- Scroll story: unique visitors per landing section, ordered by the
-- section's position on the page (props.order stamped by the client).
section_funnel as (
  select props->>'section' as section,
         min((props->>'order')::int) as ord,
         count(distinct visitor_id) as visitors
    from range_events
   where event_name = 'section_view' and props ? 'section'
   group by 1
),
-- CTA funnel: saw page -> clicked CTA -> started auth -> signed in.
cta_funnel as (
  select
    (select count(distinct visitor_id) from range_events where event_name = 'page_view') as viewed,
    (select count(distinct visitor_id) from range_events where event_name = 'cta_click') as cta_clicked,
    (select count(distinct visitor_id) from range_events where event_name = 'auth_start') as auth_started,
    (select count(distinct visitor_id) from range_events where event_name = 'signed_in') as signed_in
),
cta_locations as (
  select props->>'location' as location, count(distinct visitor_id) as visitors
    from range_events
   where event_name = 'cta_click' and props ? 'location'
   group by 1 order by 2 desc limit 12
),
-- Signups: landing-born profiles per day vs RSVP-born accounts per day.
signup_series as (
  select (created_at at time zone 'utc')::date as day,
         coalesce(signup_origin, 'landing') as origin,
         count(*) as signups
    from profiles, bounds
   where created_at >= t_from and created_at < t_to
   group by 1, 2
),
rsvp_account_series as (
  select (created_at at time zone 'utc')::date as day, count(*) as accounts
    from people, bounds
   where created_at >= t_from and created_at < t_to
   group by 1
),
signup_kpis as (
  select
    (select count(*) from profiles, bounds
      where created_at >= t_from and created_at < t_to
        and coalesce(signup_origin, 'landing') = 'landing') as landing_signups,
    (select count(*) from profiles, bounds
      where created_at >= prev_t_from and created_at < prev_t_to
        and coalesce(signup_origin, 'landing') = 'landing') as prev_landing_signups
),
-- Origin x hostness matrix over ALL TIME (population truth, not range-bound):
--   hosts = profiles with >= 1 created event, guests = people rows that
--   never opened the dashboard (no linked profile).
matrix as (
  select
    count(*) filter (where p.signup_origin = 'landing' and h.has_events) as landing_hosts,
    count(*) filter (where p.signup_origin = 'landing' and not h.has_events) as landing_dormant,
    count(*) filter (where p.signup_origin = 'rsvp' and h.has_events) as rsvp_hosts,
    count(*) filter (where p.signup_origin = 'rsvp' and not h.has_events) as rsvp_dormant,
    count(*) filter (where p.signup_origin_inferred) as inferred
  from profiles p
  cross join lateral (
    select exists (select 1 from events e where e.host_id = p.id) as has_events
  ) h
),
guest_pool as (
  select count(*) as guests_without_profile
    from people pe
   where not exists (select 1 from profiles pr where pr.id = pe.auth_user_id)
)
select jsonb_build_object(
  'range', jsonb_build_object('from', p_from, 'to', p_to,
                              'days', (select n_days from bounds)),
  'kpis', (select jsonb_build_object(
      'views', views,
      'visitors', visitors,
      'prevVisitors', prev_visitors,
      'sessions', sessions,
      'bouncedSessions', bounced_sessions,
      'landingSignups', (select landing_signups from signup_kpis),
      'prevLandingSignups', (select prev_landing_signups from signup_kpis)
    ) from kpis),
  'deviceSplit', coalesce((select jsonb_object_agg(device, visitors) from device_split), '{}'::jsonb),
  'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'day', day, 'source', source, 'visitors', visitors, 'views', views)
      order by day, source) from daily_series), '[]'::jsonb),
  'sections', coalesce((select jsonb_agg(jsonb_build_object(
      'section', section, 'order', ord, 'visitors', visitors)
      order by ord) from section_funnel), '[]'::jsonb),
  'ctaFunnel', (select jsonb_build_object(
      'viewed', viewed, 'ctaClicked', cta_clicked,
      'authStarted', auth_started, 'signedIn', signed_in) from cta_funnel),
  'ctaLocations', coalesce((select jsonb_agg(jsonb_build_object(
      'location', location, 'visitors', visitors)) from cta_locations), '[]'::jsonb),
  'signupSeries', coalesce((select jsonb_agg(jsonb_build_object(
      'day', day, 'origin', origin, 'signups', signups)
      order by day) from signup_series), '[]'::jsonb),
  'rsvpAccountSeries', coalesce((select jsonb_agg(jsonb_build_object(
      'day', day, 'accounts', accounts) order by day) from rsvp_account_series), '[]'::jsonb),
  'originMatrix', (select jsonb_build_object(
      'landingHosts', landing_hosts,
      'landingDormant', landing_dormant,
      'rsvpHosts', rsvp_hosts,
      'rsvpDormant', rsvp_dormant,
      'inferredCount', inferred,
      'guestsWithoutProfile', (select guests_without_profile from guest_pool)
    ) from matrix)
);
$$;

-- ---------------------------------------------------------------------------
-- 6. pg_cron: keep today's + yesterday's rollups fresh, hourly
-- ---------------------------------------------------------------------------
-- Yesterday is re-rolled so events that arrive around midnight (beacon
-- retries, clock skew) still land in the right bucket.

create extension if not exists pg_cron;

select cron.schedule(
  'analytics-rollup-hourly',
  '7 * * * *',
  $cron$
    select rollup_analytics_daily((now() at time zone 'utc')::date);
    select rollup_analytics_daily((now() at time zone 'utc')::date - 1);
  $cron$
);
