-- 128_person_events_community_join.sql
--
-- Align the person_events type CHECK with the service-level vocabulary
-- (services/personTimeline.js): community_join was in the code list but not
-- the constraint — any write would have violated it. The reverse mismatch
-- (access_request in the constraint but not the code list) is fixed in code
-- in the same change.

alter table person_events drop constraint if exists person_events_type_enum;
alter table person_events add constraint person_events_type_enum check (
  type = any (array[
    'page_view', 'rsvp', 'rsvp_cancel', 'waitlist_join', 'attended',
    'payment', 'message_in', 'message_out', 'auto_dm_sent', 'host_logged',
    'identity_linked', 'acquired', 'note', 'import', 'access_request',
    'community_join'
  ]::text[])
);
