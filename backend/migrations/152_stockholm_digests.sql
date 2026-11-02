-- One row per week the Stockholm mail went out: the primary key is what stops
-- a restart from sending the same Thursday twice.
create table if not exists public.stockholm_digests (
  week text primary key,
  sent integer not null default 0,
  failed integer not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.stockholm_digests enable row level security;
revoke all on public.stockholm_digests from anon, authenticated;
