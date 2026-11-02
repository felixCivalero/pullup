-- Every try of the free site check, tied to the visit it came from, so
-- Statistik can show what was typed and follow that visitor's journey.
-- `input` = what was typed (trimmed, capped); `outcome` = scored / unreadable
-- / invalid; a try that didn't score has no domain or score.
alter table public.site_checks
  add column if not exists input text,
  add column if not exists outcome text not null default 'scored',
  add column if not exists visit_id text;
alter table public.site_checks alter column domain drop not null;
alter table public.site_checks alter column score drop not null;
create index if not exists site_checks_visit_idx on public.site_checks (visit_id);
