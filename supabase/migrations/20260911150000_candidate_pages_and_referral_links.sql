-- Candidate pages (a candidate-safe version of each search at /j/<slug>) and
-- per-partner referral links (/r/<code>). Service-role only: every table is
-- RLS-on with no policies, as hm_briefs and candidate_profiles are.

-- ── the original JD, kept ────────────────────────────────────────────────────
-- Onboarding overwrites jobs.description with a summary; nothing kept the
-- posting. From now on the original is captured once and never overwritten.
alter table public.jobs
  add column if not exists description_original text,
  add column if not exists description_source text
    check (description_source is null or description_source in ('posting', 'onboarding', 'pasted', 'unknown'));

-- ── candidate pages ──────────────────────────────────────────────────────────
create table if not exists public.candidate_pages (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  -- Seven characters, no confusable letters, never the company. Same alphabet
  -- as hm_briefs slugs.
  slug text not null unique check (slug ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{7}$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'revoked')),
  headline text,
  company_line text,
  company_blurb text,
  jd_text text,
  requirements text[] not null default '{}',
  good_to_know text[] not null default '{}',
  good_to_know_offered text[] not null default '{}',
  interview_steps jsonb not null default '[]'::jsonb,
  show_salary boolean not null default true,
  show_equity boolean not null default true,
  draft_flags jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  drafted_at timestamptz,
  drafted_by text,
  published_at timestamptz,
  revoked_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.candidate_pages enable row level security;
drop trigger if exists candidate_pages_touch on public.candidate_pages;
create trigger candidate_pages_touch before update on public.candidate_pages
  for each row execute function vf.touch_updated_at();

create table if not exists public.candidate_page_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  slug text not null,
  via_code text,
  kind text not null check (kind in ('view', 'interested', 'submitted')),
  session_id text,
  ip_hash text,
  country text,
  device text,
  created_at timestamptz not null default now()
);
create index if not exists candidate_page_events_job_idx on public.candidate_page_events (job_id, created_at desc);
create index if not exists candidate_page_events_code_idx on public.candidate_page_events (via_code, created_at desc);
alter table public.candidate_page_events enable row level security;

-- ── share codes ──────────────────────────────────────────────────────────────
-- One active code per person; retired codes keep resolving (a renamed link
-- still works), revoked ones (abuse) show the closed page.
create table if not exists public.share_codes (
  code text primary key check (code ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'retired', 'revoked')),
  kind text not null default 'minted' check (kind in ('minted', 'chosen', 'rotated')),
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
create unique index if not exists share_codes_one_active on public.share_codes (user_id) where status = 'active';
create index if not exists share_codes_user_idx on public.share_codes (user_id);
alter table public.share_codes enable row level security;

-- ── referrals ────────────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  source text not null check (source in ('link', 'jd')),
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'disowned', 'duplicate', 'escalated')),
  relationship text,
  why text,
  candidate_note text,
  token text not null unique,
  token_expires_at timestamptz not null,
  confirmed_at timestamptz,
  disowned_at timestamptz,
  reminded_at timestamptz,
  escalated_at timestamptz,
  purge_after timestamptz,
  purged_at timestamptz,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id, status);
create index if not exists referrals_candidate_idx on public.referrals (candidate_id);
create index if not exists referrals_code_idx on public.referrals (code, created_at desc);
alter table public.referrals enable row level security;
drop trigger if exists referrals_touch on public.referrals;
create trigger referrals_touch before update on public.referrals
  for each row execute function vf.touch_updated_at();
