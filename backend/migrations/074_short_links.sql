-- 074_short_links.sql
--
-- Short links for outbound messages. Instagram (and any other) DMs paste a raw
-- URL as plain text — IG can't render anchor text — so a signup link with its
-- acquisition params (src/ig_ref/ig_uid/ig handle) reads as a wall of query
-- string. We mint a short opaque code that 302-redirects to the FULL canonical
-- URL, so the message shows `pullup.se/api/i/ab12cd` while every existing
-- attribution-stamping code path on the destination page is untouched.
--
-- Additive + nothing reads it until the app ships the resolver, so this is safe
-- to apply ahead of the deploy.

create table if not exists short_links (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  target_url      text not null,
  kind            text not null default 'ig_signup',
  host_profile_id uuid references profiles(id) on delete set null,
  metadata        jsonb not null default '{}'::jsonb,
  clicks          integer not null default 0,
  last_clicked_at timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists short_links_kind_idx on short_links (kind);
create index if not exists short_links_host_idx on short_links (host_profile_id);

-- Atomic resolve+count: one round trip bumps the click counter and returns the
-- destination, so the redirect never has to read-then-write (no lost updates
-- under concurrent taps). Returns NULL for an unknown code → caller 302s home.
create or replace function bump_short_link(p_code text)
returns text
language sql
as $$
  update short_links
     set clicks = clicks + 1,
         last_clicked_at = now()
   where code = p_code
  returning target_url;
$$;
