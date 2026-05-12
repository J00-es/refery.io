-- Client (company) Recruitment Services Agreement clickwrap signing.
-- Adds the columns / constraint / storage bucket the new flow expects.
--
-- Applied to production Supabase via MCP migration "client_services_agreement_signing".
-- Kept here so other environments can replay the change.

-- 1) New columns on the signature table
alter table public.client_agreement_signatures
  add column if not exists signer_title text,
  add column if not exists pdf_url     text;

-- 2) Fee range constraint on links (1..50)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'client_agreement_links_fee_percentage_range'
  ) then
    alter table public.client_agreement_links
      add constraint client_agreement_links_fee_percentage_range
      check (fee_percentage between 1 and 50);
  end if;
end$$;

-- 3) Private storage bucket for signed agreement PDFs
insert into storage.buckets (id, name, public)
values ('signed-agreements', 'signed-agreements', false)
on conflict (id) do nothing;
