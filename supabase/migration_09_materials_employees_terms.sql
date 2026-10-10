-- Pricr: custom materials, employees (with wages) and quote terms.
-- Run once in the Supabase SQL Editor. Safe to run again.

alter table public.companies
  add column if not exists custom_materials jsonb not null default '[]'::jsonb,
  add column if not exists employees        jsonb not null default '[]'::jsonb,
  add column if not exists terms            text  not null default '';
