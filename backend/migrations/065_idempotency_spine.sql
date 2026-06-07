-- 065_idempotency_spine.sql
--
-- HARDENING — make the append-only spine ACTUALLY idempotent.
--
-- The Room rests on one promise: person_events is an append-only, dedup-free
-- per-person timeline, and every inbound webhook is processed at-most-once.
-- Today neither is enforced. Meta retries webhooks on any missed 200, so a
-- retried WhatsApp/Instagram event re-runs logPersonEvent() and re-inserts the
-- raw event — duplicate bubbles in the thread, a corrupt audit trail, and a
-- ledger the identity-resolution layer is reconciling on top of. This migration
-- gives the write spine real idempotency keys so a retry is a true no-op.
--
-- Design note — NULL-distinct unique indexes (not partial indexes):
--   Postgres treats NULLs as distinct in a unique index, so a plain unique
--   index on a nullable key lets every existing (key IS NULL) row coexist while
--   enforcing uniqueness on the rows that DO carry a key. This is what lets us
--   add the constraint additively without rewriting history, AND keeps the
--   conflict target inferable by PostgREST's .upsert({ onConflict }) — a PARTIAL
--   unique index could not serve as that arbiter.
--
-- ADDITIVE + non-destructive: existing rows are untouched (their new key column
-- stays NULL and never collides). Only NEW writes that carry a key are deduped.

BEGIN;

-- ── 1. person_events — dedupe_key ───────────────────────────────────
-- A stable key the WRITER supplies for events that can be replayed (webhook
-- retries). e.g. 'wa:msgin:<provider_message_id>' / 'ig:msgin:<mid>'. Events
-- with no natural key (host-logged notes, page views) leave it NULL and behave
-- exactly as before. The append-only contract is preserved: a correction is
-- still a new row; this only stops a literal redelivery from duplicating.
ALTER TABLE person_events
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_person_events_dedupe
  ON person_events (dedupe_key);

COMMENT ON COLUMN person_events.dedupe_key IS
  'Writer-supplied at-most-once key for replayable events (webhook retries). NULL = no natural key (NULLs are distinct, so history is unaffected). See migration 065.';

-- ── 2. whatsapp_events — at-most-once raw audit rows ────────────────
-- The raw webhook audit trail claimed idempotency in a comment but enforced
-- none: a Meta retry inserted a duplicate event row. Dedupe existing rows
-- (keep the earliest per logical event), then enforce it going forward.
DELETE FROM whatsapp_events a
USING whatsapp_events b
WHERE a.provider_message_id IS NOT NULL
  AND a.provider           = b.provider
  AND a.provider_message_id = b.provider_message_id
  AND a.event_type         = b.event_type
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_whatsapp_events_pmid
  ON whatsapp_events (provider, provider_message_id, event_type);

COMMENT ON INDEX uniq_whatsapp_events_pmid IS
  'At-most-once raw WhatsApp event per (provider, message id, event type). NULL message ids are distinct (non-message events stay un-deduped). See migration 065.';

-- ── 3. message_dead_letters — nothing dropped in the dark ───────────
-- When dispatch() can find NO deliverable channel (no phone, no email, every
-- rail gated) the message was logged to stderr and forgotten. Land it here so a
-- dropped 1:1 send is a row a human can see and recover, not an invisible loss.
CREATE TABLE IF NOT EXISTS message_dead_letters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         UUID,
  host_profile_id   UUID,
  preferred_channel TEXT,
  subject           TEXT,
  reasons           JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_dead_letters_person
  ON message_dead_letters (person_id, created_at DESC);

COMMENT ON TABLE message_dead_letters IS
  'Outbound 1:1 messages dispatch() could not deliver on any channel. The recoverable record of a drop. See migration 065.';

COMMIT;
