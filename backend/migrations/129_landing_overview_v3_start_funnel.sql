-- 129_landing_overview_v3_start_funnel.sql
--
-- The landing overview learns the POST-WAITLIST world. The waitlist is gone
-- (self-serve /start since 2026-07-05): the front-door conversion is now
--   visit -> cta_click -> reached /start (page_view page='start')
--        -> account created (landing-born profile) -> SUBSCRIBED
-- Waitlist series/KPIs are replaced by paying-subscriber truth read from
-- creator_billing_plans (stripe_subscription_id is the realness bar — probe
-- hosts can't fake it). Sections + CTA locations stay fully dynamic, so the
-- redesigned landing's beats flow through by their own names.

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
section_funnel as (
  select props->>'section' as section,
         min((props->>'order')::int) as ord,
         count(distinct visitor_id) as visitors
    from range_events
   where event_name = 'section_view' and props ? 'section'
   group by 1
),
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
-- /start is the paywall page — reaching it is the step between clicking a
-- CTA and owning an account. Counted from analytics_events directly (page
-- 'start' sits outside the landing-scoped range_events).
start_reached as (
  select
    (select count(distinct visitor_id) from analytics_events, bounds
      where page = 'start' and event_name = 'page_view'
        and occurred_at >= t_from and occurred_at < t_to) as reached,
    (select count(distinct visitor_id) from analytics_events, bounds
      where page = 'start' and event_name = 'page_view'
        and occurred_at >= prev_t_from and occurred_at < prev_t_to) as prev_reached
),
-- Paying subscribers, from the billing mirror: a row only counts with a real
-- Stripe subscription behind it (probe hosts can't fake this).
subscription_series as (
  select (created_at at time zone 'utc')::date as day,
         count(*) as subs
    from creator_billing_plans, bounds
   where created_at >= t_from and created_at < t_to
     and stripe_subscription_id is not null
   group by 1
),
subscription_kpis as (
  select
    (select count(*) from creator_billing_plans, bounds
      where created_at >= t_from and created_at < t_to
        and stripe_subscription_id is not null) as new_subscribers,
    (select count(*) from creator_billing_plans, bounds
      where created_at >= prev_t_from and created_at < prev_t_to
        and stripe_subscription_id is not null) as prev_new_subscribers
),
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
matrix as (
  select
    count(*) filter (where p.signup_origin = 'landing' and h.has_events) as landing_hosts,
    count(*) filter (where p.signup_origin = 'landing' and not h.has_events) as landing_dormant,
    count(*) filter (where p.signup_origin = 'rsvp' and h.has_events) as rsvp_hosts,
    count(*) filter (where p.signup_origin = 'rsvp' and not h.has_events) as rsvp_dormant,
    count(*) filter (where p.signup_origin_inferred) as inferred,
    count(*) as profiles_total,
    count(*) filter (where h.has_events) as event_creators
  from profiles p
  cross join lateral (
    select exists (select 1 from events e where e.host_id = p.id) as has_events
  ) h
),
guest_pool as (
  select count(*) as guests_without_profile
    from people pe
   where not exists (select 1 from profiles pr where pr.id = pe.auth_user_id)
),
baselines as (
  select
    (select count(*) from people, bounds where created_at < t_from) as guests_before,
    (select count(*) from profiles, bounds where created_at < t_from) as profiles_before
),
active_hosts as (
  select count(distinct host_id) as n
    from events
   where created_at >= now() - interval '90 days'
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
      'startReached', (select reached from start_reached),
      'prevStartReached', (select prev_reached from start_reached),
      'newSubscribers', (select new_subscribers from subscription_kpis),
      'prevNewSubscribers', (select prev_new_subscribers from subscription_kpis),
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
      'startReached', (select reached from start_reached),
      'signups', (select landing_signups from signup_kpis),
      'subscribed', (select new_subscribers from subscription_kpis)) from cta_funnel),
  'ctaLocations', coalesce((select jsonb_agg(jsonb_build_object(
      'location', location, 'visitors', visitors)) from cta_locations), '[]'::jsonb),
  'subscriptionSeries', coalesce((select jsonb_agg(jsonb_build_object(
      'day', day, 'subs', subs) order by day) from subscription_series), '[]'::jsonb),
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
    ) from matrix),
  'baselines', (select jsonb_build_object(
      'guests', guests_before,
      'profiles', profiles_before
    ) from baselines),
  'ladder', (select jsonb_build_object(
      'universe', (select guests_without_profile from guest_pool) + profiles_total,
      'openedApp', profiles_total,
      'createdEvent', event_creators,
      'activeHosts90d', (select n from active_hosts)
    ) from matrix)
);
$$;
