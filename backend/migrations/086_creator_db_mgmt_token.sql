-- 086_creator_db_mgmt_token.sql
--
-- BYO increment 2: the Management API credential. Provisioning the schema into
-- a creator's project (DDL) needs Supabase's control plane, not the data-plane
-- service key — so we store a second, encrypted secret: the creator's Supabase
-- Management API token (a PAT now; an OAuth token later, same column). Used for
-- provisioning + reading their project's tier (which feeds the 30% billing
-- line). Encrypted at rest like the service key; never returned by sanitized
-- reads. Nullable — a host who only ever mirrors (no provisioning) needn't have
-- one, and prod is untouched until BYO flips.

begin;
alter table creator_databases add column if not exists encrypted_mgmt_token text;
commit;
