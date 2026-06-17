-- 107_owned_schema_evolution.sql
--
-- Make the owned-schema DDL SELF-EVOLVING so a creator's own Supabase keeps up
-- when PullUp's central schema changes. mig 087 emitted only CREATE TABLE IF
-- NOT EXISTS — that stands up missing TABLES but never adds new COLUMNS to
-- tables that already exist. Here we additionally emit, per owned column,
--   ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <type>;
-- so re-running the DDL on a connected project is a full ADDITIVE sync: new
-- tables AND new columns land, idempotently, with zero effect on a project
-- that's already current. (Drops / type-changes / renames are out of scope —
-- additive covers the real case: PullUp adds a table or a column.)
--
-- Added columns are nullable (no NOT NULL / default) so the ALTER never fails
-- on a populated mirror; a freshly-provisioned table still gets full
-- constraints from the CREATE block above it. Pure create-or-replace of the fn.

create or replace function pullup_owned_schema_ddl()
returns text
language sql
stable
set search_path = public
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
  ),
  creates as (
    select string_agg(
      format(E'CREATE TABLE IF NOT EXISTS %I (%s%s%s\n);',
        owned.t, E'\n' || cols.coldefs,
        case when cons.condefs is not null then E',\n' || cons.condefs else '' end,
        case when fks.fkdefs is not null then E',\n' || fks.fkdefs else '' end),
      E'\n\n' order by owned.ord) as ddl
    from owned join cols on cols.tbl=owned.t
    left join cons on cons.tbl=owned.t left join fks on fks.tbl=owned.t
  ),
  alters as (
    select string_agg(
      format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I %s;',
        c.relname, a.attname, format_type(a.atttypid, a.atttypmod)),
      E'\n' order by c.relname, a.attnum) as ddl
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    where c.relname in (select t from owned)
  )
  select (select ddl from creates)
       || E'\n\n-- additive column sync (schema evolution) --\n'
       || coalesce((select ddl from alters), '');
$fn$;
