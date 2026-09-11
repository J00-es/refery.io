-- The first name the CV itself uses when it differs from the record name
-- (e.g. Nora for Yunxuan). Set by the panel read or by hand; every email and
-- page greets with it. Applied to production 2026-09-11.
alter table public.candidates add column if not exists preferred_name text;
