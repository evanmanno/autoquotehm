-- AutoQuoteHM: teams (multi-user), invites, and saved quotes.
--
-- Run this ONCE in the Supabase SQL Editor (Project -> SQL Editor -> New query
-- -> paste -> Run). Safe to re-run. BACK UP FIRST (Project Settings -> Database
-- -> Backups, or run `pg_dump`), because this rewrites the access rules.
--
-- What it does
--   * members   : who belongs to which company (one company per login)
--   * invites   : owner invites a teammate by email; they join via a link
--   * quotes    : gains the columns the app needs to save + reopen a quote
--   * Row Level Security is switched from "you own this company" to
--     "you are a member of this company". Existing accounts keep working:
--     every current company's owner is added as its first member.
--
-- Roles: 'owner' (the company's creator: settings, team, billing, can delete)
--        'estimator' (can quote and see the company's saved quotes)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------
create table if not exists members (
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'estimator' check (role in ('owner', 'estimator')),
  email text not null default '',
  display_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- One company per login (for now).
create unique index if not exists members_one_company_per_user on members (user_id);

-- Backfill: every existing company's owner becomes its first member.
insert into members (company_id, user_id, role, email, display_name, phone)
select c.id, c.owner_id, 'owner', coalesce(u.email, ''), c.crew_member_name, c.your_phone
from companies c
left join auth.users u on u.id = c.owner_id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER so policies can check membership without
-- tripping over the members table's own policies.
-- ---------------------------------------------------------------------------
create or replace function is_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from members where company_id = cid and user_id = auth.uid()
  );
$$;

create or replace function is_owner(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from companies where id = cid and owner_id = auth.uid()
  );
$$;

-- New company -> its creator is automatically the owner-member.
create or replace function add_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into members (company_id, user_id, role, email, display_name, phone)
  values (
    new.id,
    new.owner_id,
    'owner',
    coalesce((select email from auth.users where id = new.owner_id), ''),
    new.crew_member_name,
    new.your_phone
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists companies_add_owner on companies;
create trigger companies_add_owner
  after insert on companies
  for each row execute function add_owner_member();

-- Keep the owner's member row in step with the "Sign In" fields in Settings.
create or replace function sync_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update members
     set display_name = new.crew_member_name,
         phone = new.your_phone
   where company_id = new.id and user_id = new.owner_id;
  return new;
end;
$$;

drop trigger if exists companies_sync_owner on companies;
create trigger companies_sync_owner
  after update of crew_member_name, your_phone on companies
  for each row execute function sync_owner_member();

-- ---------------------------------------------------------------------------
-- invites
-- ---------------------------------------------------------------------------
create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'estimator' check (role = 'estimator'),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz
);

create index if not exists invites_company_idx on invites (company_id);

-- Joins the signed-in user to the company that issued the invite. The invite
-- must be unused, unexpired, and sent to the same email the user signed up with.
create or replace function accept_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invites%rowtype;
  my_email text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  select * into inv from invites where token = p_token;
  if not found then
    raise exception 'This invite link is not valid.';
  end if;
  if inv.accepted_at is not null then
    raise exception 'This invite has already been used.';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invite has expired. Ask your admin for a new one.';
  end if;

  select lower(email) into my_email from auth.users where id = auth.uid();
  if my_email is distinct from lower(inv.email) then
    raise exception 'This invite was sent to %. Sign in with that email address.', inv.email;
  end if;

  if exists (
    select 1 from members where user_id = auth.uid() and company_id <> inv.company_id
  ) then
    raise exception 'This account already belongs to another company.';
  end if;

  insert into members (company_id, user_id, role, email, display_name)
  values (inv.company_id, auth.uid(), 'estimator', my_email, inv.display_name)
  on conflict (company_id, user_id) do nothing;

  update invites set accepted_at = now() where id = inv.id;

  return inv.company_id;
end;
$$;

-- Lets a teammate update their own name/phone (the "prepared by" on quotes).
create or replace function set_my_profile(p_name text, p_phone text)
returns void
language sql
security definer
set search_path = public
as $$
  update members
     set display_name = coalesce(p_name, display_name),
         phone = coalesce(p_phone, phone)
   where user_id = auth.uid();
$$;

revoke all on function accept_invite(uuid) from public;
revoke all on function set_my_profile(text, text) from public;
grant execute on function accept_invite(uuid) to authenticated;
grant execute on function set_my_profile(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- quotes: columns the app uses to save and reopen a quote
-- ---------------------------------------------------------------------------
-- Make sure the quotes table and updated_at helper exist (no-ops if they do).
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
alter table quotes enable row level security;

alter table quotes add column if not exists job jsonb;
alter table quotes add column if not exists estimate jsonb;
alter table quotes add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table quotes add column if not exists created_by_name text not null default '';
alter table quotes add column if not exists updated_at timestamptz not null default now();

create index if not exists quotes_company_created_idx on quotes (company_id, created_at desc);

drop trigger if exists quotes_set_updated_at on quotes;
create trigger quotes_set_updated_at
  before update on quotes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: from "you own it" to "you're a member of it"
-- ---------------------------------------------------------------------------
alter table members enable row level security;
alter table invites enable row level security;

-- companies: members can read; only the owner can change or delete.
drop policy if exists "own company" on companies;
drop policy if exists "company read" on companies;
drop policy if exists "company insert" on companies;
drop policy if exists "company update" on companies;
drop policy if exists "company delete" on companies;

create policy "company read" on companies
  for select using (owner_id = auth.uid() or is_member(id));
create policy "company insert" on companies
  for insert with check (owner_id = auth.uid());
create policy "company update" on companies
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "company delete" on companies
  for delete using (owner_id = auth.uid());

-- legacy per-row tables (the app now keeps these as JSON on companies, but
-- keep them locked down consistently)
-- Only applied if those tables exist in your database (many setups don't have them).
do $$
begin
  if to_regclass('public.materials') is not null then
    execute 'drop policy if exists "own materials" on materials';
    execute 'create policy "own materials" on materials for all using (is_member(company_id)) with check (is_owner(company_id))';
  end if;
  if to_regclass('public.equipment') is not null then
    execute 'drop policy if exists "own equipment" on equipment';
    execute 'create policy "own equipment" on equipment for all using (is_member(company_id)) with check (is_owner(company_id))';
  end if;
end $$;

-- quotes: every member sees the company's quotes; anyone can save under their
-- own name; owner (or the quote's author) can delete.
drop policy if exists "own quotes" on quotes;
drop policy if exists "quotes read" on quotes;
drop policy if exists "quotes insert" on quotes;
drop policy if exists "quotes update" on quotes;
drop policy if exists "quotes delete" on quotes;

create policy "quotes read" on quotes
  for select using (is_member(company_id));
create policy "quotes insert" on quotes
  for insert with check (is_member(company_id) and created_by = auth.uid());
create policy "quotes update" on quotes
  for update using (is_member(company_id)) with check (is_member(company_id));
create policy "quotes delete" on quotes
  for delete using (is_owner(company_id) or created_by = auth.uid());

-- members: everyone on the team can see the team; owner removes people;
-- an estimator can leave. (Rows are added only by the trigger / accept_invite.)
drop policy if exists "members read" on members;
drop policy if exists "members delete" on members;

create policy "members read" on members
  for select using (is_member(company_id));
create policy "members delete" on members
  for delete using (
    (is_owner(company_id) and user_id <> auth.uid())
    or (user_id = auth.uid() and not is_owner(company_id))
  );

-- invites: owner only.
drop policy if exists "invites owner" on invites;
create policy "invites owner" on invites
  for all using (is_owner(company_id)) with check (is_owner(company_id));
