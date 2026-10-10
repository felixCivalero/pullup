-- 138_canvas_boards.sql
--
-- Planning canvases for content meetings: pasted social posts (playable
-- embeds), text boxes and sticky notes on a pan/zoom board. The whole board
-- is one jsonb document; `version` gives optimistic concurrency so two
-- people editing in a meeting never silently overwrite each other (the API
-- rejects a stale write with 409 + the latest doc, the client merges by item).
-- `share_token` = "anyone with the link can edit"; rotating it revokes.

create table if not exists canvas_boards (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'Untitled board',
  doc         jsonb not null default '{"items": []}'::jsonb,
  version     integer not null default 0,
  share_token uuid not null default gen_random_uuid() unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists canvas_boards_owner_idx on canvas_boards (owner_id, updated_at desc);

-- Service-role only — every read/write goes through the API.
alter table canvas_boards enable row level security;
