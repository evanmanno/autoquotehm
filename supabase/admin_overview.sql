-- Pricr admin overview. READ-ONLY: it only SELECTs, it changes nothing.
-- Paste into the Supabase SQL Editor and Run. Only you can see this (the SQL
-- Editor runs as the database owner); app users can never see other companies.
--
-- 1) Every account that has signed up, newest first, including people who
--    signed up but never finished setting up a company.
select
  u.created_at::date                                  as signed_up,
  u.email                                             as login_email,
  coalesce(nullif(c.business_name, ''), '(no company yet)') as company,
  c.plan,
  (select count(*) from members m where m.company_id = c.id) as people,
  (select count(*) from quotes q where q.company_id = c.id)  as quotes_total,
  (select count(*) from quotes q
     where q.company_id = c.id
       and q.created_at >= date_trunc('month', now()))       as quotes_this_month,
  (select max(q.created_at)::date from quotes q
     where q.company_id = c.id)                              as last_quote,
  u.last_sign_in_at::date                             as last_login,
  u.raw_user_meta_data->>'data_consent_at'            as market_data_agreed_at
from auth.users u
left join companies c on c.owner_id = u.id
order by u.created_at desc;

-- 2) Quick totals.
select
  (select count(*) from auth.users)  as accounts,
  (select count(*) from companies)   as companies,
  (select count(*) from members)     as logins_incl_invited,
  (select count(*) from quotes)      as quotes_total,
  (select count(*) from quotes where created_at >= now() - interval '7 days') as quotes_last_7_days;
