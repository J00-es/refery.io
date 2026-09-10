-- A client agreement link can offer a choice of fee plans at signing time.
-- fee_options holds the percentages on offer (e.g. {10,15,20}); fee_percentage
-- stays the recommended default and becomes the chosen one on signature.
alter table public.client_agreement_links
  add column if not exists fee_options numeric[],
  add column if not exists fee_chosen_at timestamptz;
comment on column public.client_agreement_links.fee_options is 'Fee percentages the signer may pick from on the sign page; null means the fee is fixed.';
comment on column public.client_agreement_links.fee_chosen_at is 'When the signer picked a fee from fee_options (set on signature).';
