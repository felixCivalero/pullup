-- 077_identity_backfill_and_rsvp_uniqueness.sql
--
-- Tier 0 follow-up (milestone "Trustworthy Spine").
--
-- (a) IDENTITY BACKFILL — make the EXISTING base resolvable by phone / IG too,
--     not just by the email that migration 048 backfilled. The live RSVP/WhatsApp
--     paths now write these identities going forward (commit dfd706f8); this seeds
--     history from the people.* columns. ON CONFLICT DO NOTHING: an identifier
--     already owned by another person is left alone — historical collisions are
--     never force-merged here (they surface as merge candidates from live
--     activity, triaged in /admin/matches).
--
-- (b) ONE RSVP PER (event, person) AS A DB INVARIANT — the QR pull-up is already
--     strictly bound via pullups' UNIQUE(person_id, event_id); this gives rsvps
--     the same guarantee so the pull-up write-through (recordPullUp →
--     rsvps.pulled_up) is race-proof and a guest can't double-RSVP. Dedupe the one
--     historical double-RSVP first (keep the earliest; both FKs to rsvps are
--     ON DELETE SET NULL, so the delete is safe).
--
-- Idempotent / re-runnable. APPLIED TO PROD 2026-06-09.

-- (a) ---------------------------------------------------------------------------
INSERT INTO person_identities (person_id, kind, value, value_norm, source)
SELECT id, 'phone', btrim(phone_e164), btrim(phone_e164), 'backfill'
FROM people WHERE phone_e164 IS NOT NULL AND btrim(phone_e164) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO person_identities (person_id, kind, value, value_norm, source)
SELECT id,
       'ig_handle',
       regexp_replace(btrim(instagram), '^@+', ''),
       lower(regexp_replace(btrim(instagram), '^@+', '')),
       'backfill'
FROM people
WHERE instagram IS NOT NULL
  AND regexp_replace(btrim(instagram), '^@+', '') <> ''
ON CONFLICT DO NOTHING;

INSERT INTO person_identities (person_id, kind, value, value_norm, source)
SELECT id, 'ig_user_id', btrim(ig_user_id), btrim(ig_user_id), 'backfill'
FROM people WHERE ig_user_id IS NOT NULL AND btrim(ig_user_id) <> ''
ON CONFLICT DO NOTHING;

-- (b) ---------------------------------------------------------------------------
DELETE FROM rsvps r USING (
  SELECT id, row_number() OVER (PARTITION BY event_id, person_id ORDER BY created_at, id) AS rn
  FROM rsvps WHERE person_id IS NOT NULL
) d
WHERE r.id = d.id AND d.rn > 1;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rsvps_event_person_key') THEN
    ALTER TABLE rsvps ADD CONSTRAINT rsvps_event_person_key UNIQUE (event_id, person_id);
  END IF;
END $$;
