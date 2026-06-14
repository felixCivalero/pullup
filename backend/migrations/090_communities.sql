-- 090_communities.sql
--
-- COMMUNITIES — the public front door to a host's world.
--
-- The Room (a host's persistent world of people) finally gets a shareable join
-- page. A community is the host's world itself (one per host for v1): people
-- JOIN it via a link, which is a durable membership signal sitting next to RSVPs
-- as a second kind of edge on the same person atom. Events stay content that
-- happens inside the community.
--
-- This is NOT the event-RSVP waitlist (rsvps.booking_status) nor the creator
-- sign-up waitlist (creator_waitlist) — it's host↔person membership.

create table if not exists communities (
  id          uuid primary key default gen_random_uuid(),
  -- one community per host for v1 (UNIQUE). Drop the unique later for multiple.
  host_id     uuid not null references profiles(id) on delete cascade,
  slug        text not null,
  title       text,
  blurb       text,
  -- per-community theme snapshot, same shape as events.brand jsonb
  brand       jsonb,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists communities_host_uniq on communities (host_id);
create unique index if not exists communities_slug_uniq on communities (lower(slug));

-- The join edge: which person joined which community.
create table if not exists community_members (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references communities(id) on delete cascade,
  person_id     uuid not null references people(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  -- where the join came from: 'link' | 'instagram' | 'whatsapp' | 'manual' ...
  source        text,
  status        text not null default 'active',
  unique (community_id, person_id)
);

create index if not exists community_members_community_idx
  on community_members (community_id, joined_at desc);
create index if not exists community_members_person_idx
  on community_members (person_id);

-- Allow the new 'community_join' timeline event (kept in sync with
-- PERSON_EVENT_TYPES in services/personTimeline.js).
alter table person_events drop constraint if exists person_events_type_enum;
alter table person_events add constraint person_events_type_enum check (
  type = any (array[
    'page_view','rsvp','rsvp_cancel','waitlist_join','attended','payment',
    'message_in','message_out','auto_dm_sent','host_logged','identity_linked',
    'acquired','note','import','community_join'
  ])
);
