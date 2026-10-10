-- 137_deck_downloads.sql
--
-- Gated downloads (lead magnets). A visitor leaves an email on the agency
-- site, gets a personal token, and the PDF streams from GET /deck/:token —
-- the file itself is never public. One row per (email, deck); re-requests
-- reuse the row and keep the token stable.

create table if not exists deck_downloads (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  name               text,
  company            text,
  deck               text not null default 'production-core',
  source             text,
  token              uuid not null default gen_random_uuid() unique,
  download_count     integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  last_downloaded_at timestamptz,
  unique (email, deck)
);

create index if not exists deck_downloads_created_idx on deck_downloads (created_at desc);

-- Service-role only — reads/writes go through the API; no anon access to emails.
alter table deck_downloads enable row level security;
