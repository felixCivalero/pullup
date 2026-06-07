-- 064_person_source_profiles.sql
-- External-data capture, linked not merged. One raw profile snapshot per
-- (person, source) — Instagram / WhatsApp / email / RSVP form / Google /
-- manual / import — kept exactly as the source gave it. Each source upserts
-- ONLY its own row, so canonical people.* is never destructively overwritten
-- and we keep full provenance forever. The resolver derives the displayed
-- name/handle/avatar from these by precedence
-- (manual > rsvp > instagram > whatsapp > email). Sits beside person_identities
-- (links) + person_events (timeline) on the same person-as-atom spine.
CREATE TABLE IF NOT EXISTS person_source_profiles (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         UUID        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  source            TEXT        NOT NULL,   -- instagram | whatsapp | email | rsvp | google | manual | import
  source_id         TEXT,                   -- external id: IGSID, phone E164, email, google sub…
  handle            TEXT,                   -- username/handle as the source provides
  display_name      TEXT,                   -- name as the source provides
  avatar_url        TEXT,
  data              JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- full raw snapshot, untouched
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (person_id, source)
);
CREATE INDEX IF NOT EXISTS idx_psp_person ON person_source_profiles (person_id);
CREATE INDEX IF NOT EXISTS idx_psp_source ON person_source_profiles (source, source_id);
