-- 093_events_kind.sql
--
-- The page-kind discriminator that turns the event editor + event page into a
-- general PAGE engine. Existing rows + every future event default to 'event' →
-- zero behavior change. Other kinds: 'community','product','waitlist','widget'.
-- A community is an events row with kind='community' (dateless, "Join" CTA),
-- edited by the same editor and rendered by the same page.
alter table events add column if not exists kind text not null default 'event';
create index if not exists events_kind_host_idx on events (kind, host_id);
