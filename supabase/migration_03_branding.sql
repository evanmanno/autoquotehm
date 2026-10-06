-- Run this in the Supabase SQL Editor. Adds logo + brand color to each
-- business, and a public storage bucket for logo images (scoped per-owner
-- for uploads, public for reads so the PDF/browser can display them).

alter table companies add column if not exists brand_color text not null default '#1f6f45';
alter table companies add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "logo owner write" on storage.objects;
create policy "logo owner write"
  on storage.objects for all
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "logo public read" on storage.objects;
create policy "logo public read"
  on storage.objects for select
  using (bucket_id = 'logos');
