-- 140_agency_requests.sql
--
-- "Start a conversation" requests from the agency site. Each row is one
-- request: who, what they want (description + picked superpowers), when they
-- can talk, and where they came from (page, referrer, UTM, device). The API
-- emails every new row to hello@pullup.se.

create table if not exists agency_requests (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  company       text,
  description   text not null,
  preferred_time text,
  timezone      text,
  powers        text[] not null default '{}',
  monthly_total integer,
  source        text,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists agency_requests_created_idx on agency_requests (created_at desc);

-- Service-role only — reads/writes go through the API.
alter table agency_requests enable row level security;
