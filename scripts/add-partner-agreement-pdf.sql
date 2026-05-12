-- Partner (scout/recruiter) agreement PDF storage.
--
-- Adds the pdf_url column to agreement_signatures so the signing flow can
-- record where the signed PDF lives in the signed-agreements bucket. The
-- bucket itself was created with the client services agreement migration
-- (scripts/add-client-services-agreement-signing.sql); partner PDFs use the
-- "partner-agreements/" path prefix to keep them separate.
--
-- Applied to production Supabase via MCP migration
-- "partner_agreement_pdf_url".

alter table public.agreement_signatures
  add column if not exists pdf_url text;
