-- Pricr: let people delete their own account (Apple App Store requirement).
-- Run once in the Supabase SQL Editor (paste the contents). Safe to run again.
--
-- What it removes:
--   * An OWNER: their business and everything in it (services, rates, quotes,
--     team, invites, AI previews) and their login.
--   * A TEAMMATE: their spot on the team and their login. Quotes they made for
--     someone else's business stay with that business, without their name on it.

create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  -- The business they own, and everything under it (cascades).
  delete from companies where owner_id = uid;

  -- Their spot on any other team.
  delete from members where user_id = uid;

  -- Keep other businesses' history, just drop the link to this login.
  -- Each step is skipped if that column doesn't exist yet.
  begin update quotes set created_by = null where created_by = uid;
  exception when undefined_column or undefined_table then null; end;
  begin update quotes set reviewed_by = null where reviewed_by = uid;
  exception when undefined_column or undefined_table then null; end;
  begin update invites set invited_by = null where invited_by = uid;
  exception when undefined_column or undefined_table then null; end;
  begin update renderings set created_by = null where created_by = uid;
  exception when undefined_column or undefined_table then null; end;

  -- Uploaded files (logos) keep working for the business but lose the owner link.
  begin
    execute 'update storage.objects set owner = null where owner = $1' using uid;
  exception when others then null;
  end;

  -- Finally the login itself.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function delete_my_account() from public;
grant execute on function delete_my_account() to authenticated;
