-- 082_person_events_import_type.sql
--
-- The timeline vocabulary learns the word "import": one entry per person
-- landed by the universal-dump importer ("dump your data from <brand>"),
-- dedupe-keyed import:<source>:<email> so re-dumps are no-ops. A first-class
-- type, not a masquerade as host_logged/acquired — the spine's vocabulary
-- should say what actually happened.

alter table person_events drop constraint if exists person_events_type_enum;
alter table person_events add constraint person_events_type_enum check (
  type = any (array[
    'page_view', 'rsvp', 'rsvp_cancel', 'waitlist_join', 'attended',
    'payment', 'message_in', 'message_out', 'auto_dm_sent', 'host_logged',
    'identity_linked', 'acquired', 'note', 'import'
  ]::text[])
);
