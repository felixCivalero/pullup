-- 116: Backfill empty host profile identity from what we already know.
--
-- 145 of 158 prod profiles had no display name (the room header rendered
-- "SOMEONE") even though the name existed elsewhere: Google OAuth puts
-- full_name/name in auth.users.raw_user_meta_data, and RSVP-born accounts
-- have a people row with the name they signed up with. Same story for the
-- Instagram handle (people.instagram -> branding_links.instagram).
--
-- Data-fix only, no DDL. Idempotent: only ever fills BLANK fields, so a
-- host who has since typed their own name/IG in Settings is never touched.
-- Going forward createDefaultProfile() seeds these at account creation.

-- 1. Display name: auth metadata first (what they told Google), else the
--    people row matched by auth link or email (what they told an RSVP form).
UPDATE profiles p
SET name = src.new_name, updated_at = now()
FROM (
  SELECT p2.id,
         coalesce(
           nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
           nullif(trim(u.raw_user_meta_data->>'name'), ''),
           pe.name
         ) AS new_name
  FROM profiles p2
  JOIN auth.users u ON u.id = p2.id
  LEFT JOIN LATERAL (
    SELECT name FROM people
    WHERE (auth_user_id = p2.id OR lower(email) = lower(u.email))
      AND coalesce(trim(name), '') <> ''
    ORDER BY (auth_user_id = p2.id) DESC, created_at ASC
    LIMIT 1
  ) pe ON true
  WHERE coalesce(trim(p2.name), '') = ''
) src
WHERE p.id = src.id AND src.new_name IS NOT NULL;

-- 2. Instagram handle into branding_links when the slot is blank.
UPDATE profiles p
SET branding_links = jsonb_set(coalesce(p.branding_links, '{}'::jsonb), '{instagram}', to_jsonb(src.ig), true),
    updated_at = now()
FROM (
  SELECT p2.id, pe.instagram AS ig
  FROM profiles p2
  JOIN auth.users u ON u.id = p2.id
  JOIN LATERAL (
    SELECT instagram FROM people
    WHERE (auth_user_id = p2.id OR lower(email) = lower(u.email))
      AND coalesce(trim(instagram), '') <> ''
    ORDER BY (auth_user_id = p2.id) DESC, created_at ASC
    LIMIT 1
  ) pe ON true
  WHERE coalesce(trim(p2.branding_links->>'instagram'), '') = ''
) src
WHERE p.id = src.id;
