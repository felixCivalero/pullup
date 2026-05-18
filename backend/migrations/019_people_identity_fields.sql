-- Promote identity-style RSVP form fields (Instagram, Twitter, TikTok,
-- LinkedIn, Company, Birthday) from rsvps.custom_answers JSONB into typed
-- columns on people. These values describe the PERSON, not a single RSVP,
-- so they belong on the contact record where the CRM can read/filter them
-- directly. Free-form "custom" questions stay in rsvps.custom_answers.
--
-- Idempotent: safe to re-run. Backfills from existing custom_answers using
-- the most-recent non-empty value per person (last write wins), then strips
-- the promoted keys out of custom_answers so it only holds truly custom Qs.

-- 1. Add columns ---------------------------------------------------------
ALTER TABLE people ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS twitter   TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS tiktok    TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS linkedin  TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS company   TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS birthday  TEXT;

-- Helpful for CRM search/filter.
CREATE INDEX IF NOT EXISTS idx_people_instagram_lower
  ON people (LOWER(instagram));
CREATE INDEX IF NOT EXISTS idx_people_company_lower
  ON people (LOWER(company));

-- 2. Backfill from rsvps.custom_answers ---------------------------------
-- Flatten { rsvp -> { fieldId -> value } } into rows keyed by preset type,
-- with rsvp.created_at as the recency signal. Then pick the most-recent
-- non-empty value per (person, type) and write it onto people.
WITH expanded AS (
  SELECT
    r.person_id,
    r.created_at,
    LOWER(NULLIF(f->>'type', '')) AS field_type,
    NULLIF(BTRIM(r.custom_answers->>(f->>'id')), '') AS value
  FROM rsvps r
  JOIN events e ON e.id = r.event_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.form_fields, '[]'::jsonb)) AS f
  WHERE r.custom_answers IS NOT NULL
    AND jsonb_typeof(r.custom_answers) = 'object'
    AND r.person_id IS NOT NULL
),
ranked AS (
  SELECT
    person_id,
    field_type,
    value,
    ROW_NUMBER() OVER (
      PARTITION BY person_id, field_type
      ORDER BY created_at DESC
    ) AS rn
  FROM expanded
  WHERE value IS NOT NULL
    AND field_type IN ('instagram','twitter','tiktok','linkedin','company','birthday','phone')
),
latest AS (
  SELECT person_id, field_type, value
  FROM ranked
  WHERE rn = 1
)
UPDATE people p
SET
  instagram = COALESCE(p.instagram, (SELECT value FROM latest WHERE person_id = p.id AND field_type = 'instagram')),
  twitter   = COALESCE(p.twitter,   (SELECT value FROM latest WHERE person_id = p.id AND field_type = 'twitter')),
  tiktok    = COALESCE(p.tiktok,    (SELECT value FROM latest WHERE person_id = p.id AND field_type = 'tiktok')),
  linkedin  = COALESCE(p.linkedin,  (SELECT value FROM latest WHERE person_id = p.id AND field_type = 'linkedin')),
  company   = COALESCE(p.company,   (SELECT value FROM latest WHERE person_id = p.id AND field_type = 'company')),
  birthday  = COALESCE(p.birthday,  (SELECT value FROM latest WHERE person_id = p.id AND field_type = 'birthday')),
  phone     = COALESCE(p.phone,     (SELECT value FROM latest WHERE person_id = p.id AND field_type = 'phone'))
WHERE EXISTS (SELECT 1 FROM latest WHERE person_id = p.id);

-- 3. Strip promoted keys out of rsvps.custom_answers --------------------
-- After the backfill, identity values live on people. Keep custom_answers
-- for free-form "custom"-typed questions only.
UPDATE rsvps r
SET custom_answers = COALESCE((
    SELECT jsonb_object_agg(kv.key, kv.value)
    FROM jsonb_each(r.custom_answers) AS kv(key, value)
    WHERE NOT EXISTS (
      SELECT 1
      FROM events e
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.form_fields, '[]'::jsonb)) AS f
      WHERE e.id = r.event_id
        AND f->>'id' = kv.key
        AND LOWER(COALESCE(f->>'type', '')) IN
              ('instagram','twitter','tiktok','linkedin','company','birthday','phone')
    )
  ), '{}'::jsonb)
WHERE r.custom_answers IS NOT NULL
  AND jsonb_typeof(r.custom_answers) = 'object'
  AND r.custom_answers <> '{}'::jsonb
  AND EXISTS (
    SELECT 1
    FROM events e
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.form_fields, '[]'::jsonb)) AS f
    WHERE e.id = r.event_id
      AND r.custom_answers ? (f->>'id')
      AND LOWER(COALESCE(f->>'type', '')) IN
            ('instagram','twitter','tiktok','linkedin','company','birthday','phone')
  );
