-- 081_rooms_analytics.sql
--
-- Room presence lands on the analytics spine. Room visitors are signed in,
-- so unlike landing traffic their events are IDENTIFIED: analytics_events
-- gains nullable user_id (auth user) + event_id columns, and the room page
-- fires room_view stamped with both. That identification is what makes the
-- thesis metric computable — "of the people who pulled up, who came BACK
-- after the night ended" — by joining views → people.auth_user_id → the
-- dual-rail pull-up truth (rsvps.pulled_up ∪ pullups).
--
-- analytics_rooms_overview(p_from, p_to) returns the admin Rooms payload in
-- one round trip: platform KPIs + a per-room table (reach, pulse from
-- event_space_messages, afterlife, host-drop-after-the-night).

alter table analytics_events
  add column if not exists user_id uuid,
  add column if not exists event_id uuid;

create index if not exists analytics_events_event_idx
  on analytics_events (event_id, event_name, occurred_at)
  where event_id is not null;
create index if not exists analytics_events_user_idx
  on analytics_events (user_id)
  where user_id is not null;

create or replace function analytics_rooms_overview(p_from date, p_to date)
returns jsonb
language sql
security definer
set search_path = public
as $$
with bounds as (
  select p_from::timestamptz as t_from,
         (p_to + 1)::timestamptz as t_to
),
ev as (
  select e.id, e.title, e.starts_at, e.ends_at, e.status, e.host_id,
         -- "the night ended": explicit end, else 6h after start, else null
         -- (undated events can't have an afterlife)
         coalesce(e.ends_at, e.starts_at + interval '6 hours') as door_close
    from events e
   where lower(coalesce(e.status, '')) <> 'draft'
),
rsvp_counts as (
  select event_id, count(*) as n from rsvps group by 1
),
-- The dual-rail pull-up truth: host check-in OR QR door scan, one person once.
pulled as (
  select event_id, person_id from rsvps
   where pulled_up = true and person_id is not null
  union
  select event_id, person_id from pullups where person_id is not null
),
pulled_counts as (
  select event_id, count(distinct person_id) as n from pulled group by 1
),
views as (
  select ae.event_id, ae.user_id, ae.occurred_at
    from analytics_events ae
   where ae.event_name = 'room_view' and ae.event_id is not null
),
-- Reach: distinct signed-in non-host people who ever entered the room.
entered as (
  select v.event_id, count(distinct v.user_id) as n
    from views v
    join ev on ev.id = v.event_id
   where v.user_id is not null and v.user_id <> ev.host_id
   group by 1
),
-- Afterlife, the honest version: returners are counted among people who
-- actually PULLED UP (views → people.auth_user_id → pulled).
returned as (
  select v.event_id,
         count(distinct v.user_id) filter (
           where v.occurred_at >= ev.door_close + interval '1 day') as back_any_1d,
         count(distinct pe.id) filter (
           where pu.person_id is not null
             and v.occurred_at >= ev.door_close + interval '1 day') as back_pulled_1d,
         count(distinct pe.id) filter (
           where pu.person_id is not null
             and v.occurred_at >= ev.door_close + interval '7 days') as back_pulled_7d
    from views v
    join ev on ev.id = v.event_id and ev.door_close is not null
    left join people pe on pe.auth_user_id = v.user_id
    left join pulled pu on pu.event_id = v.event_id and pu.person_id = pe.id
   where v.user_id is not null and v.user_id <> ev.host_id
   group by 1
),
msgs as (
  select m.event_id,
         count(*) filter (
           where m.created_at >= b.t_from and m.created_at < b.t_to) as in_range,
         count(*) filter (
           where m.created_at >= b.t_from and m.created_at < b.t_to
             and not coalesce(m.is_host, false)) as guest_in_range,
         count(*) as all_time,
         max(m.created_at) as last_msg_at,
         bool_or(coalesce(m.is_host, false)
             and e2.door_close is not null
             and m.created_at >= e2.door_close) as host_after
    from event_space_messages m
    join ev e2 on e2.id = m.event_id
    cross join bounds b
   where m.deleted_at is null
   group by m.event_id
),
views_range as (
  select v.event_id, count(*) as n, count(distinct v.user_id) as people,
         max(v.occurred_at) as last_view_at
    from views v, bounds b
   where v.occurred_at >= b.t_from and v.occurred_at < b.t_to
   group by 1
),
rooms as (
  select ev.id, ev.title, ev.starts_at, ev.ends_at, ev.status, ev.door_close,
         coalesce(rc.n, 0) as rsvps,
         coalesce(pc.n, 0) as pulled_up,
         coalesce(en.n, 0) as entered,
         coalesce(r.back_any_1d, 0) as back_any_1d,
         coalesce(r.back_pulled_1d, 0) as back_pulled_1d,
         coalesce(r.back_pulled_7d, 0) as back_pulled_7d,
         coalesce(m.in_range, 0) as msgs_in_range,
         coalesce(m.guest_in_range, 0) as guest_msgs_in_range,
         coalesce(m.all_time, 0) as msgs_all_time,
         coalesce(m.host_after, false) as host_after,
         coalesce(vr.n, 0) as views_in_range,
         greatest(coalesce(m.last_msg_at, '-infinity'),
                  coalesce(vr.last_view_at, '-infinity'),
                  coalesce(ev.starts_at, '-infinity')) as last_activity
    from ev
    left join rsvp_counts rc on rc.event_id = ev.id
    left join pulled_counts pc on pc.event_id = ev.id
    left join entered en on en.event_id = ev.id
    left join returned r on r.event_id = ev.id
    left join msgs m on m.event_id = ev.id
    left join views_range vr on vr.event_id = ev.id
   where coalesce(rc.n, 0) > 0 or coalesce(m.all_time, 0) > 0 or coalesce(en.n, 0) > 0
),
kpis as (
  select
    (select count(*) from views v, bounds b
      where v.occurred_at >= b.t_from and v.occurred_at < b.t_to) as room_views,
    (select count(distinct v.user_id) from views v, bounds b
      where v.user_id is not null
        and v.occurred_at >= b.t_from and v.occurred_at < b.t_to) as room_people,
    (select count(distinct r2.id) from rooms r2
      where r2.msgs_in_range > 0 or r2.views_in_range > 0) as rooms_alive,
    (select coalesce(sum(r3.msgs_in_range), 0) from rooms r3) as msgs_total,
    (select coalesce(sum(r3.guest_msgs_in_range), 0) from rooms r3) as msgs_guest,
    -- Platform afterlife: across rooms whose night ended >1 day ago,
    -- returners-who-pulled-up over everyone-who-pulled-up.
    (select coalesce(sum(r4.pulled_up), 0) from rooms r4
      where r4.door_close is not null and r4.door_close < now() - interval '1 day') as afterlife_base,
    (select coalesce(sum(r4.back_pulled_1d), 0) from rooms r4
      where r4.door_close is not null and r4.door_close < now() - interval '1 day') as afterlife_back
)
select jsonb_build_object(
  'kpis', (select jsonb_build_object(
      'roomViews', room_views,
      'roomPeople', room_people,
      'roomsAlive', rooms_alive,
      'messages', msgs_total,
      'guestMessages', msgs_guest,
      'afterlifeBase', afterlife_base,
      'afterlifeBack', afterlife_back
    ) from kpis),
  'rooms', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id,
      'title', title,
      'startsAt', starts_at,
      'endsAt', ends_at,
      'status', status,
      'ended', door_close is not null and door_close < now(),
      'rsvps', rsvps,
      'pulledUp', pulled_up,
      'entered', entered,
      'backAny1d', back_any_1d,
      'backPulled1d', back_pulled_1d,
      'backPulled7d', back_pulled_7d,
      'msgsInRange', msgs_in_range,
      'guestMsgsInRange', guest_msgs_in_range,
      'msgsAllTime', msgs_all_time,
      'hostAfter', host_after
    ) order by last_activity desc)
    from (select * from rooms order by last_activity desc limit 40) t), '[]'::jsonb)
);
$$;
