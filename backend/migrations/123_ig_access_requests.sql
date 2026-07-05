-- Instagram early-access requests: while Meta reviews the app, only accounts
-- added as internal testers can connect. Hosts request access with the exact
-- info Felix needs to add them in the Meta app (their IG handle + a contact),
-- instead of a mailto. One row per host; re-submitting updates it.
-- FK to auth.users, NOT profiles: a brand-new host can ask before their lazy
-- profile row exists (mig ig_access_requests_fk_auth_users re-pointed it).
create table if not exists ig_access_requests (
  host_id uuid primary key references auth.users(id) on delete cascade,
  ig_handle text not null,
  email text,
  name text,
  note text,
  status text not null default 'pending', -- pending | onboarded | declined
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Service-role only (host reads/writes go through the API) — no anon leakage.
alter table ig_access_requests enable row level security;
