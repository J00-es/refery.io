-- Partner (scout/recruiter) clickwrap acceptances captured during sign-up have
-- no associated company. company_name/company_id were NOT NULL (the table was
-- originally shaped for the client services agreement), which silently failed
-- every partner acceptance insert — so partner legal records were never saved.
--
-- Make them nullable so partner acceptances record correctly. The sign-up route
-- (app/api/auth/sign-up/route.ts) now also generates the signed PDF, stores it
-- in the signed-agreements bucket, and emails it to the signer + agreements@refery.io.
--
-- Applied to production Supabase via MCP migration
-- "agreement_acceptances_nullable_company".

alter table public.agreement_acceptances
  alter column company_name drop not null,
  alter column company_id drop not null;
