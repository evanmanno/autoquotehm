-- Pricr: join an invited team automatically.
-- Run this in the Supabase SQL Editor (paste the contents, not the file name).
--
-- Why: until now a teammate only joined if the invite LINK survived the
-- sign-up round trip. If they tapped the confirmation email in a different
-- browser or app, the link was lost and they landed on "set up your business".
-- Now, when a signed-in person has no company yet, the app asks this function
-- whether an unused invite exists for their (confirmed) email address, and
-- joins them to it. The link still works exactly as before.

create or replace function accept_my_invite()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  my_email text;
  confirmed timestamptz;
  inv invites%rowtype;
begin
  if auth.uid() is null then
    return null;
  end if;

  -- Already on a team: nothing to do.
  if exists (select 1 from members where user_id = auth.uid()) then
    return null;
  end if;

  select lower(email), email_confirmed_at into my_email, confirmed
    from auth.users where id = auth.uid();

  -- Only a confirmed email address can claim an invite sent to it.
  if my_email is null or confirmed is null then
    return null;
  end if;

  select * into inv
    from invites
   where lower(email) = my_email
     and accepted_at is null
     and expires_at > now()
   order by created_at desc
   limit 1;

  if not found then
    return null;
  end if;

  insert into members (company_id, user_id, role, email, display_name)
  values (inv.company_id, auth.uid(), inv.role, my_email, inv.display_name)
  on conflict (company_id, user_id) do nothing;

  update invites set accepted_at = now() where id = inv.id;

  return inv.company_id;
end;
$$;

revoke all on function accept_my_invite() from public;
grant execute on function accept_my_invite() to authenticated;
