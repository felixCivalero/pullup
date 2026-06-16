-- 100_product_placement.sql
--
-- PRODUCT PLACEMENT — where a host's global products are showcased.
--
-- A product is an events row kind='product'. Products are created GLOBALLY (a
-- host's product library), not inside any room. Placement is two-layered:
--
--   1. MAIN ROOM (implicit): once a product is LIVE (status='PUBLISHED') it is
--      auto-showcased in the host's main room — UNLESS the host hides it. No row
--      needed; it's derived from status + the flag below.
--   2. EVENT ROOMS (explicit): the host walks into an event room and assigns
--      products to it. Each assignment is one room_products row.
--
-- The room IS the storefront — rooms are RSVP-gated, so visibility is handled by
-- room access, not by any per-product visibility setting. A product is simply
-- live or draft (status), plus these placement controls.

-- Opt a LIVE product out of the main-room showcase (default false → it shows).
alter table events add column if not exists hide_from_main_room boolean not null default false;

-- Explicit product ↔ event-room assignments. The main room is NOT stored here
-- (it's implicit: live && not hide_from_main_room).
create table if not exists room_products (
  id               uuid primary key default gen_random_uuid(),
  host_id          uuid not null references profiles(id) on delete cascade,
  -- the room it's placed in = the host's event (kind='event') whose room shows it
  event_id         uuid not null references events(id) on delete cascade,
  -- the product = an events row kind='product'
  product_event_id uuid not null references events(id) on delete cascade,
  sort             integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (event_id, product_event_id)
);

create index if not exists idx_room_products_event   on room_products (event_id);
create index if not exists idx_room_products_product on room_products (product_event_id);
create index if not exists idx_room_products_host    on room_products (host_id);
