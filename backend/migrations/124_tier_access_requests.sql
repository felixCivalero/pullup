-- 124_tier_access_requests.sql
--
-- The Agency tier is functionally identical to Creator today, so it isn't
-- directly purchasable — it's shown as a potential tier with "request early
-- access", which doubles as the desire-meter Felix reads before building the
-- real agency feature set. One row per host per tier; re-request updates.
-- Same concierge loop as ig_access_requests: dock thread + repliable email.

create table if not exists tier_access_requests (
  host_id    uuid not null references auth.users(id) on delete cascade,
  tier       text not null, -- 'agency' (future tiers reuse the table)
  note       text,
  status     text not null default 'pending', -- pending | onboarded | declined
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (host_id, tier)
);

-- Service-role only (host reads/writes go through the API).
alter table tier_access_requests enable row level security;
