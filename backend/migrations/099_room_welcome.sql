-- 099_room_welcome.sql
-- A host-editable welcome message shown to everyone who lands in the event Room.
-- Plain text (rendered as the room's opening card). NULL/empty = no card for guests;
-- the host still sees an "add a welcome" prompt inline.
alter table events add column if not exists room_welcome text;
