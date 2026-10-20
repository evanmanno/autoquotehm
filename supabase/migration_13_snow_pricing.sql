-- Pricr: each business's own snow depth and building class multipliers.
-- Run once in the Supabase SQL Editor (paste the contents). Safe to run again.

alter table public.companies
  add column if not exists snow_pricing jsonb not null default '{}'::jsonb;
