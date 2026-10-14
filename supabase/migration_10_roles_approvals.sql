-- Pricr: roles (owner / manager / estimator) and quote approvals.
--
-- Run this ONCE in the Supabase SQL Editor (Project -> SQL Editor -> New query
-- -> paste -> Run). Safe to re-run. Run it AFTER migration_06 / 08 / 09.
--
-- What it does
--   * members.role / invites.role : adds 'manager' next to 'owner' and 'estimator'
--       owner     = created the company: settings, prices, team, billing
--       manager   = can approve quotes and send them without approval
--       estimator = builds quotes and sends them for approval
--   * quotes.status : adds 'pending' (waiting for approval), 'changes' (sent
--       back with a note) and 'approved' next to draft / sent / won / lost
--   * quotes gets: approval_note (from the estimator), review_note (from the
--       approver), reviewed_by, reviewed_by_name, reviewed_at
--   * A database guard so the rules hold even if someone bypasses the app:
--       - only an owner or manager can mark a quote approved / sent back
--       - an estimator can only mark a quote sent once it has been approved
--       - if an estimator changes the price or lines of an approved quote it
--         goes back to 'pending'
--   * set_member_role(): the owner changes a teammate between manager and
--       estimator

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.members'::regclass, 'public.invites'::regclass)
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table members add constraint members_role_check
  check (role in ('owner', 'manager', 'estimator'));
alter table invites add constraint invites_role_check
  check (role in ('manager', 'estimator'));

-- True when the signed-in user is an owner or manager of the company.
create or replace function is_approver(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from members
    where company_id = cid
      and user_id = auth.uid()
      and role in ('owner', 'manager')
  );
$$;

-- Same as before, but the new member gets the role the invite carried.
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
  values (inv.company_id, auth.uid(), inv.role, my_email, inv.display_name)
  on conflict (company_id, user_id) do nothing;

  update invites set accepted_at = now() where id = inv.id;

  return inv.company_id;
end;
$$;

-- Owner changes a teammate between 'manager' and 'estimator'.
create or replace function set_member_role(p_company uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner(p_company) then
    raise exception 'Only the owner can change roles.';
  end if;
  if p_role not in ('manager', 'estimator') then
    raise exception 'Role must be manager or estimator.';
  end if;
  update members
     set role = p_role
   where company_id = p_company
     and user_id = p_user
     and role <> 'owner';
end;
$$;

revoke all on function set_member_role(uuid, uuid, text) from public;
grant execute on function set_member_role(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Quote approvals
-- ---------------------------------------------------------------------------
alter table quotes add column if not exists approval_note text not null default '';
alter table quotes add column if not exists review_note text not null default '';
alter table quotes add column if not exists reviewed_by uuid references auth.users(id);
alter table quotes add column if not exists reviewed_by_name text not null default '';
alter table quotes add column if not exists reviewed_at timestamptz;

-- NOT VALID: old rows are left alone, new and changed rows must use these.
alter table quotes drop constraint if exists quotes_status_check;
alter table quotes add constraint quotes_status_check
  check (status in ('draft', 'pending', 'changes', 'approved', 'sent', 'won', 'lost')) not valid;

create or replace function guard_quote_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  approver boolean := is_approver(new.company_id);
begin
  if tg_op = 'INSERT' then
    if not approver and new.status not in ('draft', 'pending') then
      raise exception 'A new quote has to start as a draft or be sent for approval.';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('approved', 'changes') and not approver then
      raise exception 'Only an owner or manager can approve a quote or send it back.';
    end if;
    if new.status = 'sent' and not approver and old.status <> 'approved' then
      raise exception 'This quote needs approval before it can be sent.';
    end if;
  elsif not approver
        and old.status = 'approved'
        and (new.total is distinct from old.total or new.line_items is distinct from old.line_items) then
    -- price or lines changed after approval: needs a fresh look
    new.status := 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists quotes_guard_status on quotes;
create trigger quotes_guard_status
  before insert or update on quotes
  for each row execute function guard_quote_status();
