-- 125_access_request_type.sql
--
-- Early-access requests (Instagram, Agency tier, Products…) were logged as
-- message_in thread-starters, which made the dock render system words as if
-- the PERSON typed them ("Requested Agency tier early access" in a gray
-- bubble). The timeline vocabulary learns "access_request": a system log line
-- woven into the thread — honest about who authored it — that still counts as
-- an inbound contact awaiting the host's reply.

alter table person_events drop constraint if exists person_events_type_enum;
alter table person_events add constraint person_events_type_enum check (
  type = any (array[
    'page_view', 'rsvp', 'rsvp_cancel', 'waitlist_join', 'attended',
    'payment', 'message_in', 'message_out', 'auto_dm_sent', 'host_logged',
    'identity_linked', 'acquired', 'note', 'import', 'access_request'
  ]::text[])
);

-- Retype the stubs already written under the old shape so existing threads
-- re-render as logs, not person speech.
update person_events
set type = 'access_request', direction = null
where type = 'message_in'
  and metadata->>'source' in ('ig_early_access', 'agency_tier_interest', 'product_early_access');
