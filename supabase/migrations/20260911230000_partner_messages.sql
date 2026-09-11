-- Partners write to their candidates from the portal.
-- Proposal: docs/proposals/2026-09-11-write-to-a-candidate.md

alter table public.candidate_emails
  add column if not exists sent_by_user_id uuid,
  add column if not exists direction text not null default 'out',
  add column if not exists provider text,
  add column if not exists provider_id text,
  add column if not exists reply_to text,
  add column if not exists thread_alias text,
  add column if not exists read_at timestamptz;

create index if not exists candidate_emails_thread_alias_idx on public.candidate_emails (thread_alias) where thread_alias is not null;
create index if not exists candidate_emails_sent_by_idx on public.candidate_emails (sent_by_user_id, created_at desc) where sent_by_user_id is not null;
create index if not exists candidate_emails_unread_in_idx on public.candidate_emails (candidate_id) where direction = 'in' and read_at is null;

alter table public.users_admin
  add column if not exists signature text,
  add column if not exists messages_per_day integer;

create table if not exists public.candidate_contact_state (
  candidate_id uuid primary key references public.candidates(id) on delete cascade,
  bounced_at timestamptz,
  bounced_email text,
  opted_out_at timestamptz,
  opt_out_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidate_contact_state enable row level security;
