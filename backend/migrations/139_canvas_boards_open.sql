-- 139_canvas_boards_open.sql
--
-- The canvas is open: anyone can start a board without an account. Such a
-- board has no owner — its share link IS the board (anyone with it can edit
-- and rename). Boards created while logged in keep an owner as before.

alter table canvas_boards alter column owner_id drop not null;
