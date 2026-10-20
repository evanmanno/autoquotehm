-- Pricr: named crews (which employees work together).
-- Run once in the Supabase SQL Editor (paste the contents). Safe to run again.

alter table public.companies
  add column if not exists crews jsonb not null default '[]'::jsonb;
