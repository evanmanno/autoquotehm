-- AutoQuoteHM: AI concept renderings (photo + quote -> projected-result image).
--
-- Run ONCE in the Supabase SQL Editor after migration_06. Safe to re-run.
--
--   renderings : one row per generation request (prompt, status, image paths)
--   storage    : private bucket "renderings"; files live under <company_id>/...
--                and are only readable by members of that company.
--
-- The Edge Function (generate-rendering) writes rows and files with the
-- service role; the app only reads them (via short-lived signed URLs).

create table if not exists renderings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  quote_id uuid references quotes(id) on delete set null,
  prompt text not null default '',
  status text not null default 'done' check (status in ('pending', 'done', 'failed')),
  image_paths text[] not null default '{}',
  error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists renderings_company_created_idx on renderings (company_id, created_at desc);
create index if not exists renderings_quote_idx on renderings (quote_id);

alter table renderings enable row level security;

drop policy if exists "renderings read" on renderings;
drop policy if exists "renderings delete" on renderings;
create policy "renderings read" on renderings
  for select using (is_member(company_id));
create policy "renderings delete" on renderings
  for delete using (is_owner(company_id) or created_by = auth.uid());

-- Private storage bucket for the generated images.
insert into storage.buckets (id, name, public)
values ('renderings', 'renderings', false)
on conflict (id) do nothing;

drop policy if exists "renderings files read" on storage.objects;
create policy "renderings files read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'renderings'
    and is_member(((storage.foldername(name))[1])::uuid)
  );
