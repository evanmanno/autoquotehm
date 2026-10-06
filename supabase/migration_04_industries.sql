-- Run this in the Supabase SQL Editor. Adds the list of trades/industries a
-- business picked during onboarding, so Business Settings can remember which
-- starter service templates were applied.

alter table companies add column if not exists industries jsonb not null default '[]'::jsonb;
