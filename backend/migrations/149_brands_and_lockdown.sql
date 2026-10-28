-- 149: brands under one login + the database closed to everything but the API.
--
-- 1. Lockdown. The browser never reads or writes a table: every request goes
--    through the API (service_role), which checks who is asking. The anon key
--    ships in the site's bundle, so until now the only thing between it and
--    the data was each table's RLS policies (one of them, "Public can view
--    events", showed drafts to anyone). Now anon and authenticated have no
--    grants at all in public — no table, sequence or function — and new
--    objects don't get them either. RLS stays on as a second wall.
--
-- 2. Brands. One account (a login) can run several brands — an agency, a
--    drinks company with Aperol and Hendrick's. Events belong to a brand; the
--    guests, the CRM and the mail follow the brand (a guest who said yes to
--    Aperol's invitations said yes to Aperol, not to everything the account
--    runs). Mail credits stay per account. The table is the old planner's
--    (mig 031): one row per host already exists, most named "Default".

-- ── 1. Lockdown ─────────────────────────────────────────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, PUBLIC;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'supabase_admin default privileges left as they are';
END $$;

DROP POLICY IF EXISTS "Public can view events" ON events;

-- The event images bucket is public (guest pages show the pictures): it takes
-- pictures and video only, so it can't host someone's HTML page or file.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime']
WHERE id = 'event-images';

-- Events made by an assistant (actions/events.js) say so.
ALTER TABLE events DROP CONSTRAINT IF EXISTS check_created_via;
ALTER TABLE events ADD CONSTRAINT check_created_via
  CHECK (created_via::text = ANY (ARRAY['post', 'create', 'legacy', 'agent']));

-- ── 2. Brands ───────────────────────────────────────────────────────────
-- "Default" lanes get the name the host gave their brand (or themselves).
UPDATE brands b
SET name = left(coalesce(nullif(btrim(p.brand), ''), nullif(btrim(p.name), ''), 'Mitt varumärke'), 80), updated_at = now()
FROM profiles p
WHERE p.id = b.host_id AND b.name = 'Default';

UPDATE brands SET name = left(btrim(name), 80) WHERE name <> left(btrim(name), 80);
UPDATE brands SET name = 'Mitt varumärke' WHERE btrim(name) = '';

ALTER TABLE brands DROP CONSTRAINT IF EXISTS brands_name_length;
ALTER TABLE brands ADD CONSTRAINT brands_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 80);

-- Every host with events has a brand.
INSERT INTO brands (host_id, name)
SELECT DISTINCT e.host_id, left(coalesce(nullif(btrim(p.brand), ''), nullif(btrim(p.name), ''), 'Mitt varumärke'), 80)
FROM events e
LEFT JOIN profiles p ON p.id = e.host_id
WHERE e.host_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM brands b WHERE b.host_id = e.host_id);

-- An event's brand is always one of its host's brands; events without one
-- get the host's first.
UPDATE events e
SET brand_id = NULL
WHERE e.brand_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM brands b WHERE b.id = e.brand_id AND b.host_id = e.host_id);

UPDATE events e
SET brand_id = (SELECT b.id FROM brands b WHERE b.host_id = e.host_id ORDER BY b.sort_order, b.created_at LIMIT 1)
WHERE e.brand_id IS NULL AND e.host_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_brand ON events(brand_id);

-- The database itself refuses an event pointing at another account's brand,
-- whatever the API does.
CREATE OR REPLACE FUNCTION events_brand_same_host() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.brand_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM brands b WHERE b.id = NEW.brand_id AND b.host_id = NEW.host_id
  ) THEN
    RAISE EXCEPTION 'brand % does not belong to host %', NEW.brand_id, NEW.host_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION events_brand_same_host() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS events_brand_same_host ON events;
CREATE TRIGGER events_brand_same_host
  BEFORE INSERT OR UPDATE OF brand_id, host_id ON events
  FOR EACH ROW EXECUTE FUNCTION events_brand_same_host();
