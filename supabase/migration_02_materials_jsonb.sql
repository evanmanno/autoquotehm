-- Run this second, after schema.sql. The app keeps materials/equipment as
-- arrays nested inside one company object (matches how it worked with
-- localStorage), so we store them as JSON columns on companies rather than
-- the separate normalized tables from schema.sql. Safe to run even if you
-- already ran schema.sql; it only adds columns, nothing is dropped.

alter table companies add column if not exists materials jsonb not null default '[]'::jsonb;
alter table companies add column if not exists equipment jsonb not null default '[]'::jsonb;
