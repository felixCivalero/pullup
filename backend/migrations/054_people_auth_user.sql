-- 054_people_auth_user.sql
-- The unification spine. A guest IS a (passwordless) Supabase auth user from
-- their first RSVP — so "guest" and "host" are one account that simply gains
-- powers, never two systems we have to reconcile. This links the `people` row
-- (the relational / timeline identity) to its `auth.users` row (the login
-- identity). Nullable + additive: legacy people rows backfill lazily the next
-- time they authenticate.
--
-- Additive + idempotent.

ALTER TABLE people ADD COLUMN IF NOT EXISTS auth_user_id UUID;
CREATE INDEX IF NOT EXISTS idx_people_auth_user_id ON people (auth_user_id);
COMMENT ON COLUMN people.auth_user_id IS
  'Links this person to their Supabase auth.users row (passwordless account). Set at first RSVP/login; nullable for legacy/unverified rows.';

-- Resolve an existing auth user id by email from server code. auth.users is not
-- exposed through PostgREST, so the service-role client can''t SELECT it via
-- .from(); this SECURITY DEFINER function is the clean, scalable way to look it
-- up (vs paginating admin.listUsers). Email match is case-insensitive.
CREATE OR REPLACE FUNCTION auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;
