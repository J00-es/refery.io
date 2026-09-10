-- Tiered client fee: the signer picks the standard-IC rate from fee_options,
-- while leadership and Staff/Principal hires carry their own minimum. A short
-- slug gives the sign page a link a person can read aloud, and page_notes
-- holds the per-client wording shown above the options (from_lily, leadership).
alter table public.client_agreement_links
  add column if not exists short_slug text unique,
  add column if not exists leadership_fee_percentage numeric,
  add column if not exists page_notes jsonb;
alter table public.client_agreement_signatures
  add column if not exists leadership_fee_percentage numeric;
comment on column public.client_agreement_links.short_slug is 'Readable alias for the sign page: /sign/<short_slug>.';
comment on column public.client_agreement_links.leadership_fee_percentage is 'Minimum fee for Head/Director/VP/C-suite and Staff/Principal hires; null means one blanket fee.';
comment on column public.client_agreement_links.page_notes is 'Per-client copy on the sign page: { from_lily, leadership }.';
comment on column public.client_agreement_signatures.leadership_fee_percentage is 'Leadership and Staff/Principal minimum in force at signature, when tiered.';
