-- 088_host_world_people_count.sql
--
-- Accurate "people in a host's world" count, computed SERVER-SIDE.
--
-- The masthead count was being derived by pulling person_id rows through
-- PostgREST and counting distinct in JS — but PostgREST caps REST responses at
-- 1000 rows, so a host with 1553 people showed 1038 (newest 1000 timeline rows
-- + 39 rsvp − overlap). Counting must be an aggregate, not a row pull.
--
-- World = distinct people who RSVP'd/are on the host's events UNION everyone in
-- the host's person_events timeline (imports, page views, messages — the same
-- substrate getRoomForHost and the "new people" moment read). Matches the route's
-- unionWorldPersonIds() semantics exactly.

create or replace function pullup_host_world_people_count(p_host_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::int from (
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
  ) u;
$$;

-- Backend calls this with the service-role client; nobody else needs it.
revoke all on function pullup_host_world_people_count(uuid) from public;
grant execute on function pullup_host_world_people_count(uuid) to service_role;
