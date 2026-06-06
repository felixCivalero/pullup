-- 060_people_email_nullable.sql
-- Make people.email nullable. Email was the one hard-required identity field,
-- but a person can now enter the graph from a channel that carries no email —
-- an Instagram DM resolves to a person by IGSID alone (person is the atom;
-- identity is multi-channel via person_identities, mig 048). createPerson()
-- strips null fields, so an email-less IG contact hit the NOT NULL constraint
-- and the inbound DM never landed in the Room.
--
-- The UNIQUE index people_email_key is unaffected: Postgres treats NULLs as
-- distinct, so any number of email-less people coexist. Rows that DO have an
-- email keep their global uniqueness. Existing data is untouched.
-- Applied to prod via MCP 2026-06-06.
ALTER TABLE people ALTER COLUMN email DROP NOT NULL;
COMMENT ON COLUMN people.email IS
  'Optional. Null for people resolved from an email-less channel (e.g. Instagram DM by IGSID). Unique when present.';
