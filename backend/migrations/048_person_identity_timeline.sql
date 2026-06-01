-- 048_person_identity_timeline.sql
--
-- THE ROOM FOUNDATION — person-centric identity resolution + an append-only
-- timeline. (See product north star "The Room IS PullUp", 2026-05-31.)
--
-- The problem this solves: today a person who arrives by email-RSVP, by
-- Instagram DM, and by WhatsApp becomes THREE separate `people` rows, because
-- each channel resolves on its own flat column (email / ig_user_id / phone_e164)
-- with no linking. The Room's entire value rests on those being ONE person.
--
-- This migration is ADDITIVE and non-destructive: the existing flat columns on
-- `people` stay exactly as they are (nothing reads differently yet). We add a
-- resolution layer beside them and backfill it from what's already there.
--
-- Four tables:
--   person_identities       — (kind,value) -> person_id. The lookup index that
--                             makes "any channel handle resolves to one human"
--                             real. Unique per (kind, value_norm).
--   person_events           — append-only per-person timeline. Every touch
--                             (viewed / rsvp'd / dm in-out / called / attended)
--                             lands here; the Room reads over it.
--   person_merges           — audit trail when two rows collapse into one.
--   person_match_candidates — fuzzy "are these the same person?" suggestions
--                             surfaced in the Room for one-tap manual combine.
--
-- People are already GLOBAL (no host_id on `people`) — the inversion is half
-- done in the schema. Host scoping stays where it belongs: on the touchpoints
-- (an rsvp/event/whatsapp_thread is host-scoped), not on the human.

BEGIN;

-- ── 1. person_identities ────────────────────────────────────────────
-- One row per (person, identifier). A person can carry many identities; each
-- identifier value resolves to exactly one person (the unique index enforces
-- it). `value_norm` is the normalized form we actually match on.
CREATE TABLE IF NOT EXISTS person_identities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,            -- 'email' | 'phone' | 'ig_user_id' | 'ig_handle' | 'tiktok' | 'twitter'
  value       TEXT NOT NULL,            -- as captured (display form)
  value_norm  TEXT NOT NULL,            -- normalized for matching (lowercased / stripped)
  verified_at TIMESTAMPTZ,              -- when we confirmed it's really them (e.g. magic-link for phone)
  source      TEXT,                     -- 'rsvp' | 'whatsapp' | 'ig' | 'import' | 'manual' | 'backfill'
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE person_identities
  DROP CONSTRAINT IF EXISTS person_identities_kind_enum;
ALTER TABLE person_identities
  ADD  CONSTRAINT person_identities_kind_enum
  CHECK (kind IN ('email', 'phone', 'ig_user_id', 'ig_handle', 'tiktok', 'twitter'));

-- The keystone: a given identifier points to ONE person. This is what stops
-- the same human becoming N rows — the next channel that sees this value
-- resolves to the existing person instead of creating a new one.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_person_identities_kind_value
  ON person_identities (kind, value_norm);
CREATE INDEX IF NOT EXISTS idx_person_identities_person
  ON person_identities (person_id);

COMMENT ON TABLE person_identities IS
  'Resolution layer: (kind,value_norm) -> one person. Collapses email/phone/IG/TikTok handles for the same human into a single identity. Unique per (kind,value_norm).';

-- ── 2. person_events (append-only timeline) ─────────────────────────
-- Every interaction with a person, one row, never overwritten. The Room's
-- brief / warmth / suggested-move are all READS over this stream.
CREATE TABLE IF NOT EXISTS person_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  host_id     UUID,                     -- whose world this happened in (nullable for system)
  event_id    UUID,                     -- the capital-E Event it relates to, if any
  type        TEXT NOT NULL,            -- see enum below
  channel     TEXT,                     -- 'instagram' | 'whatsapp' | 'email' | 'web' | null
  direction   TEXT,                     -- 'in' | 'out' | null (for messages)
  body        TEXT,                     -- human-readable summary or message text
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE person_events
  DROP CONSTRAINT IF EXISTS person_events_type_enum;
ALTER TABLE person_events
  ADD  CONSTRAINT person_events_type_enum
  CHECK (type IN (
    'page_view', 'rsvp', 'rsvp_cancel', 'waitlist_join', 'attended', 'payment',
    'message_in', 'message_out', 'auto_dm_sent', 'host_logged',
    'identity_linked', 'acquired', 'note'
  ));

ALTER TABLE person_events
  DROP CONSTRAINT IF EXISTS person_events_channel_enum;
ALTER TABLE person_events
  ADD  CONSTRAINT person_events_channel_enum
  CHECK (channel IS NULL OR channel IN ('instagram', 'whatsapp', 'email', 'web', 'phone', 'system'));

CREATE INDEX IF NOT EXISTS idx_person_events_person_time
  ON person_events (person_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_person_events_host_time
  ON person_events (host_id, occurred_at DESC)
  WHERE host_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_person_events_event
  ON person_events (event_id)
  WHERE event_id IS NOT NULL;

COMMENT ON TABLE person_events IS
  'Append-only per-person timeline. Every touchpoint (view/rsvp/message/call/attend) across all channels and events. The Room is a read over this; never updated in place.';

-- ── 3. person_merges (audit) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS person_merges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_person_id UUID NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  merged_person_id    UUID NOT NULL,    -- the row that was absorbed (kept for audit; may be gone)
  merged_by           UUID,             -- host/admin who confirmed; null = system
  reason              TEXT,             -- 'manual' | 'exact_email' | 'exact_phone' | 'auto'
  snapshot            JSONB,            -- the merged row's data at merge time (reversibility)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_person_merges_canonical
  ON person_merges (canonical_person_id);

COMMENT ON TABLE person_merges IS
  'Audit trail for identity merges. snapshot holds the absorbed row so a merge can be explained or reversed.';

-- ── 4. person_match_candidates (the "are these the same?" queue) ─────
-- Fuzzy matches we are NOT confident enough to auto-merge. Surfaced in the
-- Room for the host to confirm/reject with one tap. Crucial once handles get
-- chaotic (TikTok), where exact matching can't catch everything.
CREATE TABLE IF NOT EXISTS person_match_candidates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_a     UUID NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  person_b     UUID NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  score        REAL NOT NULL,           -- 0..1 confidence
  reason       TEXT,                    -- 'similar_name' | 'similar_handle' | 'shared_phone_unverified' | ...
  status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'confirmed' | 'rejected'
  resolved_by  UUID,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE person_match_candidates
  DROP CONSTRAINT IF EXISTS person_match_candidates_status_enum;
ALTER TABLE person_match_candidates
  ADD  CONSTRAINT person_match_candidates_status_enum
  CHECK (status IN ('pending', 'confirmed', 'rejected'));

-- Don't queue the same pair twice (order-independent via least/greatest).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_person_match_pair
  ON person_match_candidates (LEAST(person_a, person_b), GREATEST(person_a, person_b));
CREATE INDEX IF NOT EXISTS idx_person_match_pending
  ON person_match_candidates (status)
  WHERE status = 'pending';

COMMENT ON TABLE person_match_candidates IS
  'Fuzzy duplicate suggestions for human confirmation in the Room. Exact matches auto-merge; uncertain ones land here.';

-- ── 5. Backfill person_identities from existing flat columns ────────
-- Seed the resolution layer from what we already know, so nothing is lost and
-- resolution works for the existing audience from day one. ON CONFLICT skips
-- collisions (first writer wins; collisions become match candidates later).

-- email
INSERT INTO person_identities (person_id, kind, value, value_norm, verified_at, source, is_primary)
SELECT id, 'email', email, lower(btrim(email)),
       NULL, 'backfill', TRUE
FROM people
WHERE email IS NOT NULL AND btrim(email) <> ''
ON CONFLICT (kind, value_norm) DO NOTHING;

-- phone (e164, normalized; verified flag carried over)
INSERT INTO person_identities (person_id, kind, value, value_norm, verified_at, source)
SELECT id, 'phone', phone_e164, phone_e164,
       phone_verified_at, 'backfill'
FROM people
WHERE phone_e164 IS NOT NULL AND btrim(phone_e164) <> ''
ON CONFLICT (kind, value_norm) DO NOTHING;

-- instagram user id (IGSID — the real messaging identity)
INSERT INTO person_identities (person_id, kind, value, value_norm, source)
SELECT id, 'ig_user_id', ig_user_id, ig_user_id, 'backfill'
FROM people
WHERE ig_user_id IS NOT NULL AND btrim(ig_user_id) <> ''
ON CONFLICT (kind, value_norm) DO NOTHING;

-- instagram display handle (lowercased, @ stripped)
INSERT INTO person_identities (person_id, kind, value, value_norm, source)
SELECT id, 'ig_handle', instagram, lower(btrim(ltrim(instagram, '@'))), 'backfill'
FROM people
WHERE instagram IS NOT NULL AND btrim(instagram) <> ''
ON CONFLICT (kind, value_norm) DO NOTHING;

-- tiktok handle
INSERT INTO person_identities (person_id, kind, value, value_norm, source)
SELECT id, 'tiktok', tiktok, lower(btrim(ltrim(tiktok, '@'))), 'backfill'
FROM people
WHERE tiktok IS NOT NULL AND btrim(tiktok) <> ''
ON CONFLICT (kind, value_norm) DO NOTHING;

COMMIT;
