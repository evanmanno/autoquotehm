-- Run in the Supabase SQL Editor. Adds the optional sales tax % shown on the customer PDF.
alter table companies add column if not exists sales_tax_rate numeric;
