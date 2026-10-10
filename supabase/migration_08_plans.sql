-- Run this in the Supabase SQL Editor. Adds plans and a monthly quote limit.
--
-- plan:  starter | pro | business (limits: 50 / 150 / 500 new quotes a month).
-- The trigger refuses a NEW quote once the company has started its plan's
-- limit this calendar month, so the cap holds even if someone bypasses the app.
-- Editing an existing quote is never blocked.
--
-- NOTE: until Stripe is connected, the app lets the owner switch plans freely.
-- Before charging real money, change plans only from a Stripe webhook (service
-- role) and block clients from updating companies.plan.

alter table companies add column if not exists plan text not null default 'starter';
alter table companies drop constraint if exists companies_plan_check;
alter table companies add constraint companies_plan_check
  check (plan in ('starter', 'pro', 'business'));

create or replace function enforce_quote_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit int;
  v_used int;
begin
  select plan into v_plan from companies where id = new.company_id;
  v_limit := case coalesce(v_plan, 'starter')
    when 'business' then 500
    when 'pro' then 150
    else 50
  end;
  select count(*) into v_used
    from quotes
    where company_id = new.company_id
      and created_at >= date_trunc('month', now());
  if v_used >= v_limit then
    raise exception 'quote_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_enforce_limit on quotes;
create trigger quotes_enforce_limit
  before insert on quotes
  for each row execute function enforce_quote_limit();
