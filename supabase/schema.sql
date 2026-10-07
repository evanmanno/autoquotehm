-- Pricr multi-tenant schema
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query -> paste -> Run)

create extension if not exists "pgcrypto";

-- One row per business account, tied 1:1 to a Supabase auth user
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  business_name text not null default '',
  shop_address text not null default '',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  crew_member_name text not null default '',
  your_email text not null default '',
  your_phone text not null default '',
  labor_rate numeric not null default 0,
  mileage_rate numeric not null default 0,
  dump_fee numeric not null default 0,
  min_job_charge numeric not null default 0,
  trip_minimum numeric not null default 0,
  default_margin numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  unit text not null default '',
  rate numeric not null default 0,
  note text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  rate numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_name text not null default '',
  customer_email text not null default '',
  customer_phone text not null default '',
  job_address text not null default '',
  line_items jsonb not null default '[]'::jsonb,
  margin numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'draft',
  flagged boolean not null default false,
  flag_note text,
  created_at timestamptz not null default now()
);

-- keep updated_at current on companies
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists companies_set_updated_at on companies;
create trigger companies_set_updated_at
  before update on companies
  for each row execute function set_updated_at();

-- Row Level Security: every business can only ever see its own data
alter table companies enable row level security;
alter table materials enable row level security;
alter table equipment enable row level security;
alter table quotes enable row level security;

drop policy if exists "own company" on companies;
create policy "own company" on companies
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own materials" on materials;
create policy "own materials" on materials
  for all using (company_id in (select id from companies where owner_id = auth.uid()))
  with check (company_id in (select id from companies where owner_id = auth.uid()));

drop policy if exists "own equipment" on equipment;
create policy "own equipment" on equipment
  for all using (company_id in (select id from companies where owner_id = auth.uid()))
  with check (company_id in (select id from companies where owner_id = auth.uid()));

drop policy if exists "own quotes" on quotes;
create policy "own quotes" on quotes
  for all using (company_id in (select id from companies where owner_id = auth.uid()))
  with check (company_id in (select id from companies where owner_id = auth.uid()));
