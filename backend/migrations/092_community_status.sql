-- 092_community_status.sql
--
-- Draft → Published lifecycle for a community, mirroring events. A community is
-- DRAFT until the host publishes it; the public /c/:slug only resolves when
-- published (so a half-built community isn't publicly reachable). Lets the host
-- "see if it's live" the same way an event does.
alter table communities add column if not exists status text not null default 'draft';
