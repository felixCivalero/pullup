-- 094_host_world_person_ids.sql
--
-- The Room used to derive "your people" from the most-recent 5000 timeline
-- events, so a host with more activity than that (e.g. 1500+ imported people)
-- only ever saw a slice. This returns the FULL set of distinct people in a
-- host's world — the same union as pullup_host_world_people_count (mig 088),
-- but the ids, not just the count — so the Room can render everyone.
--
-- p_limit is a generous safety ceiling (a single Room rendering 20k cards is
-- already extreme; true mega-hosts would need pagination, a separate concern).
-- Returns uuid[] (a single scalar) on purpose: a `returns table` would be
-- truncated by PostgREST's default 1000-row response cap. An array isn't.
create or replace function pullup_host_world_person_ids(p_host_id uuid, p_limit int default 20000)
returns uuid[]
language sql
stable
as $$
  select array(
    select u.person_id from (
      select r.person_id
        from rsvps r
        join events e on e.id = r.event_id
       where e.host_id = p_host_id
         and r.status <> 'cancelled'
         and r.person_id is not null
      union
      select pe.person_id
        from person_events pe
       where pe.host_id = p_host_id
         and pe.person_id is not null
    ) u
    limit p_limit
  );
$$;

revoke all on function pullup_host_world_person_ids(uuid, int) from public, anon, authenticated;
grant execute on function pullup_host_world_person_ids(uuid, int) to service_role;
