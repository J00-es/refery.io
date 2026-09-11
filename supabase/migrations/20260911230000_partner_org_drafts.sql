-- What an existing partner typed about their firm on the sign-up form.
--
-- The sign-up form recognises an account at the email field and sends the
-- person to log in. Until now what they had typed about the firm lived only
-- in that tab's sessionStorage, so a password reset (a new tab, from an email)
-- or a second device lost it, and nothing inside the app ever mentioned the
-- firm again. This is the server's copy: written when the account is
-- recognised, read by /firm/new and the dashboard banner, deleted when the
-- firm is created. Service-role only: RLS on, no policies.

create table if not exists public.partner_org_drafts (
  email text primary key,
  -- The nine sign-up fields, strings only, trimmed and capped in code.
  draft jsonb not null default '{}'::jsonb,
  source text not null default 'sign-up',
  -- The account's state when the draft was saved: 'partner' or 'pending'.
  account_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.partner_org_drafts enable row level security;
