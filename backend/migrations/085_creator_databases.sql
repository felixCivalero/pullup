-- 085_creator_databases.sql
--
-- THE BYO-SUPABASE SPINE. The routing registry for "creators own their data":
-- one row per creator who has connected (or graduated to) their OWN Supabase
-- project. This table lives in PullUp's CENTRAL DB on purpose — it IS the
-- routing table; the connection router reads it to decide, per host, which
-- database that host's reads/writes go to.
--
-- The lifecycle a row walks (status):
--   connecting  → host kicked off the connect flow
--   connected   → we hold a validated, encrypted service key to their project
--   provisioning→ running the PullUp schema migrations into their project
--   mirroring   → copying their data slice across (shared → owned)
--   live        → their project is populated + verified
--   revoked     → host pulled the kill switch (or we were locked out)
--   error       → last operation failed (see last_error)
--
-- system_of_record is the CUTOVER bit: false = their project is a mirror, the
-- shared PullUp DB is still authoritative (stage 2). true = their project is
-- authoritative, the router sends reads/writes there (stage 3). It starts
-- false for everyone, so this table is inert until a deliberate cutover.
--
-- The service key is NEVER stored in plaintext — encrypted_service_key holds
-- the AES-256-GCM envelope from utils/encryption.js (same as IG tokens). The
-- creator's real power is the kill switch: rotate/revoke the key in their own
-- Supabase dashboard (or hit our disconnect endpoint) and the router falls
-- back to shared instantly.
--
-- ADDITIVE: a brand-new table, empty, referenced by nothing existing. Prod is
-- untouched until BYO_SUPABASE_ENABLED flips AND a host connects.

begin;

create table if not exists creator_databases (
  host_id               uuid primary key,
  provider              text not null default 'supabase',
  project_ref           text,
  db_url                text not null,
  encrypted_service_key text not null,
  status                text not null default 'connecting'
    check (status in ('connecting','connected','provisioning','mirroring','live','revoked','error')),
  schema_version        integer not null default 0,
  system_of_record      boolean not null default false,
  connected_at          timestamptz not null default now(),
  last_verified_at      timestamptz,
  last_error            text,
  updated_at            timestamptz not null default now()
);

-- The router's hot lookup is by host_id (the PK already covers it). A partial
-- index on the graduated set keeps "who is live + cut over" cheap to scan for
-- fleet operations (migrations, health sweeps) later.
create index if not exists creator_databases_live_idx
  on creator_databases (status)
  where system_of_record = true;

commit;
