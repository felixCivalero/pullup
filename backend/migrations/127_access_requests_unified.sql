-- 127_access_requests_unified.sql
--
-- One table for every "request early access" ask — Instagram, Agency tier,
-- Products, and whatever comes next. Replaces ig_access_requests (mig 123)
-- and tier_access_requests (mig 124), which were the same loop built twice.
-- The loop is: row here + an access_request log line in the host's PullUp
-- system thread. NO email — the admin dashboard's System inbox is both the
-- notification and the reply surface.
--
-- kind-specific fields live in payload (instagram: igHandle/email/name/note;
-- agency/product: note) so a new kind is a code change, not a schema change.

create table if not exists access_requests (
  host_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null, -- 'instagram' | 'agency' | 'product' | future kinds
  payload    jsonb not null default '{}'::jsonb,
  status     text not null default 'pending', -- pending | onboarded | declined
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (host_id, kind)
);

-- Service-role only (host reads/writes go through the API) — no anon leakage.
alter table access_requests enable row level security;

-- Carry the existing requests over, shape-preserving.
insert into access_requests (host_id, kind, payload, status, created_at, updated_at)
select host_id, 'instagram',
       jsonb_strip_nulls(jsonb_build_object(
         'igHandle', ig_handle, 'email', email, 'name', name, 'note', note)),
       status, created_at, updated_at
from ig_access_requests
on conflict (host_id, kind) do nothing;

insert into access_requests (host_id, kind, payload, status, created_at, updated_at)
select host_id, tier,
       jsonb_strip_nulls(jsonb_build_object('note', note)),
       status, created_at, updated_at
from tier_access_requests
on conflict (host_id, kind) do nothing;

drop table if exists ig_access_requests;
drop table if exists tier_access_requests;
