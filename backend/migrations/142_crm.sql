-- 142_crm.sql
-- Felix's consultancy CRM. One person sells; Claude keeps the books.
--
--   crm_companies     who pays
--   crm_contacts      who Felix talks to (email = the join key for mail sync)
--   crm_deals         one piece of business moving through stages
--   crm_interactions  every email / meeting / call / note, newest wins
--   crm_tasks         follow-ups with a due date — what to chase next
--
-- Service-role only (RLS on, no policies): read and written by Claude via the
-- Supabase MCP and the one.com mail MCP (tools/mail-mcp). Old platform-era
-- `sales_leads` is left untouched.

create table if not exists crm_companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  website     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists crm_contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references crm_companies(id) on delete set null,
  name        text not null,
  email       text,
  phone       text,
  role        text,
  source      text,                       -- referral | inbound | site | cold | network
  tags        text[] not null default '{}',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists crm_contacts_email_uq on crm_contacts (lower(email)) where email is not null;
create index if not exists crm_contacts_company_idx on crm_contacts (company_id);

create table if not exists crm_deals (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references crm_companies(id) on delete set null,
  contact_id    uuid references crm_contacts(id) on delete set null,
  title         text not null,
  stage         text not null default 'lead'
                check (stage in ('lead','meeting','proposal','won','onboarding','active','paused','lost')),
  value_sek     integer,                  -- per month when recurring, else total
  recurring     boolean not null default true,
  next_step     text,
  next_step_on  date,
  closed_at     timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists crm_deals_stage_idx on crm_deals (stage, next_step_on);

create table if not exists crm_interactions (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid references crm_contacts(id) on delete cascade,
  deal_id      uuid references crm_deals(id) on delete set null,
  kind         text not null check (kind in ('email_in','email_out','meeting','call','note')),
  occurred_at  timestamptz not null default now(),
  subject      text,
  summary      text,
  message_id   text,                      -- RFC Message-ID for emails; dedupes mail sync
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create unique index if not exists crm_interactions_message_uq on crm_interactions (message_id);
create index if not exists crm_interactions_contact_idx on crm_interactions (contact_id, occurred_at desc);
create index if not exists crm_interactions_deal_idx on crm_interactions (deal_id, occurred_at desc);

create table if not exists crm_tasks (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid references crm_deals(id) on delete cascade,
  contact_id  uuid references crm_contacts(id) on delete cascade,
  title       text not null,
  due_on      date,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists crm_tasks_open_idx on crm_tasks (due_on) where done_at is null;

alter table crm_companies    enable row level security;
alter table crm_contacts     enable row level security;
alter table crm_deals        enable row level security;
alter table crm_interactions enable row level security;
alter table crm_tasks        enable row level security;
