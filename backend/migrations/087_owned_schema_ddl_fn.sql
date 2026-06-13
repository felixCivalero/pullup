-- 087_owned_schema_ddl_fn.sql
--
-- BYO increment 2b: provisioning the owned schema. Rather than freeze a static
-- DDL snapshot (which drifts the moment the central schema changes), we derive
-- the creator-owned schema from the LIVE central catalog at provision time.
--
-- pullup_owned_schema_ddl() returns the complete CREATE TABLE DDL for the 8
-- owned tables (people, events, event_channels, rsvps, pullups,
-- person_events, person_notes, event_space_messages), in FK-safe order, with:
--   • real columns / types / defaults / NOT NULL,
--   • PRIMARY KEY / UNIQUE / CHECK constraints,
--   • INTRA-SET foreign keys only — FKs pointing at central tables (profiles,
--     brands, auth) are omitted, because a creator's project has no such tables.
--
-- The provisioner (services/byo/provisioner.js) fetches this and runs it on the
-- creator's project via the Management API. One source of truth; no drift.

begin;

create or replace function pullup_owned_schema_ddl()
returns text
language sql
stable
as $fn$
  with owned(t, ord) as (values
    ('people',1),('events',2),('event_channels',3),('rsvps',4),
    ('pullups',5),('person_events',6),('person_notes',7),('event_space_messages',8)
  ),
  cols as (
    select c.relname as tbl,
      string_agg(
        format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
          case when a.attnotnull then ' NOT NULL' else '' end,
          case when ad.adbin is not null then ' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid) else '' end),
        E',\n' order by a.attnum) as coldefs
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum
    where c.relname in (select t from owned) group by c.relname
  ),
  cons as (
    select c.relname as tbl, string_agg('  ' || pg_get_constraintdef(con.oid), E',\n') as condefs
    from pg_constraint con join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    where c.relname in (select t from owned) and con.contype in ('p','u','c') group by c.relname
  ),
  fks as (
    select c.relname as tbl, string_agg('  ' || pg_get_constraintdef(con.oid), E',\n') as fkdefs
    from pg_constraint con join pg_class c on c.oid=con.conrelid
    join pg_class rc on rc.oid=con.confrelid
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    where c.relname in (select t from owned) and con.contype='f'
      and rc.relname in (select t from owned) group by c.relname
  )
  select string_agg(
    format(E'CREATE TABLE IF NOT EXISTS %I (%s%s%s\n);',
      owned.t, E'\n' || cols.coldefs,
      case when cons.condefs is not null then E',\n' || cons.condefs else '' end,
      case when fks.fkdefs is not null then E',\n' || fks.fkdefs else '' end),
    E'\n\n' order by owned.ord)
  from owned join cols on cols.tbl=owned.t
  left join cons on cons.tbl=owned.t left join fks on fks.tbl=owned.t;
$fn$;

commit;
