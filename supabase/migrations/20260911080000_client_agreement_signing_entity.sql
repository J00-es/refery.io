-- The signer can be asked to name the entity they sign for (an agency, a
-- holding company) instead of the client company on the link. The document,
-- the signature row, the PDF and the emails are then bound to that name.
alter table public.client_agreement_links
  add column if not exists entity_editable boolean not null default false,
  add column if not exists signing_entity text;
alter table public.client_agreement_signatures
  add column if not exists signing_entity text;
comment on column public.client_agreement_links.entity_editable is 'The signer types the legal entity they sign for; the document is bound to that name.';
comment on column public.client_agreement_links.signing_entity is 'The entity name the signer gave at signature.';
comment on column public.client_agreement_signatures.signing_entity is 'The entity name the agreement was signed for, when it differs from the client company.';
