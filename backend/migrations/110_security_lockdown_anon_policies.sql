-- 110_security_lockdown_anon_policies.sql
-- 2026-06-19 SECURITY: close live PII leak + row forgery via the public REST API.
--
-- These tables had RLS enabled but with policies granted to role `public`
-- (which includes anon). The anon key ships in the frontend bundle, so anyone
-- could hit https://<project>.supabase.co/rest/v1/<table> directly and:
--   - read every contact's email/phone (people)
--   - read the full email outbox (recipients, subjects, HTML bodies, tracking)
--   - read/write email suppressions
--   - forge people/rsvps/payments rows, bypassing all backend logic
-- Mig 109 only enabled RLS on tables that had it OFF; these slipped through
-- because they had RLS ON with wide-open policies.
--
-- All access to these tables is backend-mediated via the service role, which
-- bypasses RLS. The frontend only uses the anon client for auth, storage, and
-- Realtime on person_events/host_actions -- never these tables. So dropping
-- these policies denies anon/authenticated while leaving the app unaffected.
--
-- ALREADY APPLIED TO PROD via Supabase MCP (migration
-- "close_anon_pii_and_forgery_policies"). This file documents/reproduces it.
-- Idempotent: safe to re-run.

-- people: anon could read ALL contacts, update & insert rows
drop policy if exists "Users can view people"    on public.people;
drop policy if exists "Users can update people"  on public.people;
drop policy if exists "Public can create people" on public.people;

-- rsvps / payments: anon could forge rows directly
drop policy if exists "Public can create RSVPs"   on public.rsvps;
drop policy if exists "Users can create payments" on public.payments;

-- email_*: policies were named "Service role can manage" but mis-granted to
-- public. Service role bypasses RLS, so no replacement policy is needed.
drop policy if exists "Service role can manage email_events"       on public.email_events;
drop policy if exists "Service role can manage email_outbox"       on public.email_outbox;
drop policy if exists "Service role can manage email_suppressions" on public.email_suppressions;
