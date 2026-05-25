-- 030_drop_people_notes.sql
-- Remove the legacy people.notes free-text column.
--
-- It predated the CRM UI, was never surfaced anywhere a host could see, and
-- held 0 rows across the whole table. The per-host timeline (person_notes,
-- migration 029) replaces it. Keeping both around is just confusing.
--
-- ORDER MATTERS: apply this ONLY AFTER the backend that stops reading/writing
-- people.notes is deployed. The previous backend inserts `notes: NULL` on every
-- person create (the RSVP hot path); dropping the column out from under it would
-- break person creation. Code first, then this.
--
-- Idempotent: safe to re-run.

ALTER TABLE people DROP COLUMN IF EXISTS notes;
