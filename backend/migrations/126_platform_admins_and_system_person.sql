-- 126_platform_admins_and_system_person.sql
--
-- The admin world separates from the host world. Admin = a @pullup.se account
-- granted a row here; it signs in like anyone (email OTP) and lands on the
-- admin dashboard. Hosts are just hosts — profiles.is_admin is retired (the
-- column stays, the code stops honoring it), so felix.civalero@gmail.com is a
-- plain host from now on.
--
-- Keyed by EMAIL, not user_id: Felix grants an address before that person has
-- ever signed in; user_id is stamped on their first authenticated visit.
--   role   'super' — sees everything (the hello@ shared inbox), grants others
--          'admin' — dashboard access; scopes refine what they see
--   scopes jsonb, e.g. {"inbox": true} — room to grow without new columns

create table if not exists platform_admins (
  email      text primary key check (email = lower(email) and email like '%@pullup.se'),
  role       text not null default 'admin' check (role in ('super', 'admin')),
  scopes     jsonb not null default '{"inbox": true}'::jsonb,
  user_id    uuid references auth.users(id) on delete set null,
  granted_by text,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security; -- service-role only

insert into platform_admins (email, role, granted_by) values
  ('felix@pullup.se', 'super', 'seed'),
  ('hello@pullup.se', 'super', 'seed')
on conflict (email) do nothing;

-- ── The system person: "PullUp" as a contact in hosts' Messages ──────────
-- One global person; each host that talks to the system gets person_events
-- rows anchored (host_id = that host, person_id = this person). The dock
-- already renders this identity specially (eyes avatar, "PullUp", Official).
-- Both platform addresses resolve to it, so an inbound email from either is
-- classified as the system speaking.

insert into people (name, email)
select 'PullUp', 'hello@pullup.se'
where not exists (select 1 from people where lower(email) = 'hello@pullup.se');

insert into person_identities (person_id, kind, value, value_norm, source, verified_at)
select p.id, 'email', v.addr, v.addr, 'system', now()
from people p
cross join (values ('hello@pullup.se'), ('felix@pullup.se')) as v(addr)
where lower(p.email) = 'hello@pullup.se'
  and not exists (
    select 1 from person_identities pi
    where pi.kind = 'email' and pi.value_norm = v.addr
  );
