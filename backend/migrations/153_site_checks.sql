-- Every run of the free site check: which brands are curious, and how they
-- scored. Domains only, nothing about the person who ran it.
create table if not exists public.site_checks (
  id bigint generated always as identity primary key,
  domain text not null,
  score integer not null,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists site_checks_created_idx on public.site_checks (created_at desc);

alter table public.site_checks enable row level security;
revoke all on public.site_checks from anon, authenticated;
