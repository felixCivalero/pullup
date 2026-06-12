-- 083_event_story.sql
--
-- The per-event HOST analytics, Room-era: an event's life told in its four
-- real phases — FILL (reach → RSVPs by source), YOUR PEOPLE (returning vs
-- new, how each person entered your world), THE NIGHT (the dual-rail pull-up
-- truth), AFTERLIFE (does the room outlive it). Every rate ships with the
-- host's OWN average across their ended events — the only benchmark that
-- isn't vanity.
--
-- analytics_event_story(p_event_id) returns the whole payload in one round
-- trip. SECURITY DEFINER: the route MUST verify event ownership first.

create or replace function analytics_event_story(p_event_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
with ev as (
  select e.id, e.title, e.starts_at, e.ends_at, e.status, e.host_id,
         e.total_capacity as capacity,
         coalesce(e.ends_at, e.starts_at + interval '6 hours') as door_close
    from events e
   where e.id = p_event_id
),
views as (
  select v.id, v.visitor_id, v.device_type, v.created_at,
         coalesce(
           case
             when v.referrer ilike '%instagram%' then 'instagram'
             when v.referrer ilike '%facebook%' or v.referrer ilike '%fb.%' then 'facebook'
             when v.referrer ilike '%twitter%' or v.referrer ilike '%x.com%' then 'twitter'
             when v.referrer ilike '%linkedin%' then 'linkedin'
             when nullif(v.utm_source, '') is not null then lower(v.utm_source)
             when v.referrer ilike '%pullup%' then 'pullup'
             when v.referrer is null or v.referrer = '' then 'direct'
             else 'other'
           end, 'direct') as source
    from event_page_views v
   where v.event_id = p_event_id
),
rsvp_rows as (
  select r.id, r.person_id, r.created_at, r.party_size, r.total_guests,
         r.custom_answers, r.pulled_up
    from rsvps r
   where r.event_id = p_event_id
     and (r.booking_status in ('CONFIRMED', 'PENDING_PAYMENT') or r.status = 'attending')
),
-- Dual-rail pull-up truth for THIS event.
pulled as (
  select person_id from rsvps
   where event_id = p_event_id and pulled_up = true and person_id is not null
  union
  select person_id from pullups where event_id = p_event_id and person_id is not null
),
daily as (
  select day,
         coalesce(max(visitors), 0) as visitors,
         coalesce(max(rsvps), 0) as rsvps,
         source_map
    from (
      select d.day,
             (select count(distinct v.visitor_id) from views v
               where (v.created_at at time zone 'utc')::date = d.day) as visitors,
             (select count(*) from rsvp_rows r
               where (r.created_at at time zone 'utc')::date = d.day) as rsvps,
             (select jsonb_object_agg(s.source, s.n) from (
                select v.source, count(distinct v.visitor_id) as n from views v
                 where (v.created_at at time zone 'utc')::date = d.day
                 group by v.source) s) as source_map
        from (
          select distinct (created_at at time zone 'utc')::date as day from views
          union
          select distinct (created_at at time zone 'utc')::date from rsvp_rows
        ) d
    ) t
   group by day, source_map
),
sources_agg as (
  select source, count(distinct visitor_id) as visitors
    from views group by source order by 2 desc
),
fill as (
  select
    (select count(*) from views) as page_views,
    (select count(distinct visitor_id) from views) as unique_visitors,
    (select count(*) from rsvp_rows) as rsvp_count,
    (select coalesce(sum(greatest(coalesce(total_guests, party_size, 1), 1)), 0) from rsvp_rows) as party_total,
    (select count(*) from rsvps where event_id = p_event_id and booking_status = 'WAITLISTED') as waitlist,
    (select count(*) from rsvp_rows where created_at >= now() - interval '7 days') as rsvps_7d,
    (select count(*) from rsvp_rows
      where created_at >= now() - interval '14 days'
        and created_at < now() - interval '7 days') as rsvps_prev7d
),
-- Returning vs new, with the stronger cut (pulled up before) separated.
people_rows as (
  select r.person_id,
         exists (
           select 1 from rsvps r2
            join events e2 on e2.id = r2.event_id
           where r2.person_id = r.person_id and e2.host_id = (select host_id from ev)
             and r2.event_id <> p_event_id and r2.created_at < r.created_at
         ) as rsvped_before,
         exists (
           select 1 from rsvps r3
            join events e3 on e3.id = r3.event_id
           where r3.person_id = r.person_id and e3.host_id = (select host_id from ev)
             and r3.event_id <> p_event_id and r3.pulled_up = true
           union all
           select 1 from pullups pu
            join events e4 on e4.id = pu.event_id
           where pu.person_id = r.person_id and e4.host_id = (select host_id from ev)
             and pu.event_id <> p_event_id
         ) as pulled_before
    from rsvp_rows r
   where r.person_id is not null
),
people_agg as (
  select
    count(*) as total,
    count(*) filter (where pulled_before) as shown_up_before,
    count(*) filter (where rsvped_before and not pulled_before) as rsvped_before_only,
    count(*) filter (where not rsvped_before and not pulled_before) as new_faces
  from people_rows
),
channels as (
  select coalesce(nullif(pe.acquisition_channel, ''), 'direct') as channel,
         count(*) as n
    from rsvp_rows r join people pe on pe.id = r.person_id
   group by 1 order by 2 desc
),
enrichment as (
  select count(*) as answered from rsvp_rows
   where custom_answers is not null
     and custom_answers::text not in ('{}', '[]', 'null')
),
night as (
  select
    (select count(*) from pulled) as pulled_up,
    (select count(*) from rsvp_rows) as base
),
room_views as (
  select ae.user_id, ae.occurred_at
    from analytics_events ae, ev
   where ae.event_name = 'room_view' and ae.event_id = p_event_id
     and ae.user_id is not null and ae.user_id <> ev.host_id
),
afterlife as (
  select
    (select count(distinct user_id) from room_views) as entered,
    (select count(distinct pe.id) from room_views rv
       join people pe on pe.auth_user_id = rv.user_id
       join pulled pu on pu.person_id = pe.id, ev
      where ev.door_close is not null
        and rv.occurred_at >= ev.door_close + interval '1 day') as returned_1d,
    (select count(distinct pe.id) from room_views rv
       join people pe on pe.auth_user_id = rv.user_id
       join pulled pu on pu.person_id = pe.id, ev
      where ev.door_close is not null
        and rv.occurred_at >= ev.door_close + interval '7 days') as returned_7d,
    (select count(*) from event_space_messages m
      where m.event_id = p_event_id and m.deleted_at is null) as messages,
    (select count(*) from event_space_messages m
      where m.event_id = p_event_id and m.deleted_at is null
        and not coalesce(m.is_host, false)) as guest_messages,
    (select coalesce(bool_or(coalesce(m.is_host, false) and m.created_at >= ev.door_close), false)
       from event_space_messages m, ev
      where m.event_id = p_event_id and m.deleted_at is null and ev.door_close is not null) as host_dropped_after
),
money as (
  select coalesce(sum(amount - coalesce(refunded_amount, 0)), 0) as revenue,
         max(currency) as currency
    from payments
   where event_id = p_event_id and paid_at is not null
),
-- The host's own track record across their OTHER ended events — the only
-- honest comparator. One row per past event, averaged.
bench_events as (
  select e2.id,
         coalesce(e2.ends_at, e2.starts_at + interval '6 hours') as dc,
         (select count(distinct v.visitor_id) from event_page_views v where v.event_id = e2.id) as uniq,
         (select count(*) from rsvps r where r.event_id = e2.id
           and (r.booking_status in ('CONFIRMED', 'PENDING_PAYMENT') or r.status = 'attending')) as rs,
         (select count(*) from (
            select person_id from rsvps where event_id = e2.id and pulled_up = true and person_id is not null
            union
            select person_id from pullups where event_id = e2.id and person_id is not null) p) as pu
    from events e2, ev
   where e2.host_id = ev.host_id and e2.id <> p_event_id
     and lower(coalesce(e2.status, '')) <> 'draft'
     and coalesce(e2.ends_at, e2.starts_at + interval '6 hours') < now()
),
bench as (
  select count(*) as n,
         round(avg(rs::numeric / nullif(uniq, 0)) * 100, 1) as avg_conversion,
         round(avg(pu::numeric / nullif(rs, 0)) * 100, 1) as avg_showup
    from bench_events
)
select jsonb_build_object(
  'event', (select jsonb_build_object(
      'id', id, 'title', title, 'startsAt', starts_at, 'endsAt', ends_at,
      'status', status, 'capacity', capacity,
      'phase', case
        when lower(coalesce(status, '')) = 'draft' then 'draft'
        when starts_at is null then 'upcoming'
        when now() < starts_at then 'upcoming'
        when now() >= starts_at and now() < door_close then 'live'
        else 'ended'
      end
    ) from ev),
  'fill', (select jsonb_build_object(
      'pageViews', page_views,
      'uniqueVisitors', unique_visitors,
      'rsvps', rsvp_count,
      'partyTotal', party_total,
      'waitlist', waitlist,
      'conversionPct', round(rsvp_count::numeric / nullif(unique_visitors, 0) * 100, 1),
      'rsvps7d', rsvps_7d,
      'rsvpsPrev7d', rsvps_prev7d
    ) from fill),
  'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'day', day, 'visitors', visitors, 'rsvps', rsvps,
      'bySource', coalesce(source_map, '{}'::jsonb)) order by day) from daily), '[]'::jsonb),
  'sources', coalesce((select jsonb_agg(jsonb_build_object(
      'source', source, 'visitors', visitors)) from sources_agg), '[]'::jsonb),
  'people', (select jsonb_build_object(
      'total', total,
      'shownUpBefore', shown_up_before,
      'rsvpedBeforeOnly', rsvped_before_only,
      'newFaces', new_faces
    ) from people_agg),
  'channels', coalesce((select jsonb_agg(jsonb_build_object(
      'channel', channel, 'count', n)) from channels), '[]'::jsonb),
  'enrichmentAnswers', (select answered from enrichment),
  'night', (select jsonb_build_object(
      'pulledUp', pulled_up,
      'showUpPct', round(pulled_up::numeric / nullif(base, 0) * 100, 1)
    ) from night),
  'afterlife', (select jsonb_build_object(
      'entered', entered,
      'returned1d', returned_1d,
      'returned7d', returned_7d,
      'messages', messages,
      'guestMessages', guest_messages,
      'hostDroppedAfter', host_dropped_after
    ) from afterlife),
  'money', (select jsonb_build_object(
      'revenue', revenue, 'currency', coalesce(currency, 'sek')) from money),
  'benchmarks', (select jsonb_build_object(
      'eventsCompared', n,
      'avgConversionPct', avg_conversion,
      'avgShowUpPct', avg_showup
    ) from bench)
);
$$;
