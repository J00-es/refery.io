-- The sourcing desk: find people for a live search, read them against a
-- versioned brief, write to them from our own Workspace mailboxes, and keep
-- every decision, send and reply on the record.
-- Proposal: docs/proposals/2026-09-11-sourcing-desk.md
-- Super-admin only; every table is service-role only (RLS on, no policies).

-- ── 1. The brief, versioned ─────────────────────────────────────────────────
-- One row per version. A new version is drafted whenever a source changes
-- (job row, HM brief, questions, call, rejections) and carries the diff to
-- the previous approved one, so Lily reads what moved, not the whole thing.
create table if not exists public.sourcing_briefs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  version integer not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  spec jsonb not null,
  sources jsonb not null default '[]'::jsonb,
  changes jsonb,
  overrides jsonb not null default '[]'::jsonb,
  model text,
  approved_by text,
  approved_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, version)
);
create index if not exists sourcing_briefs_job_idx on public.sourcing_briefs (job_id, version desc);

-- ── 2. People: one evidence record per human, reused across searches ────────
create table if not exists public.sourcing_people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  first_name text,
  last_name text,
  headline text,
  current_title text,
  current_employer text,
  employer_domain text,
  location text,
  relocation text not null default 'unknown' check (relocation in ('unknown', 'willing', 'unwilling')),
  links jsonb not null default '{}'::jsonb,
  emails jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  education jsonb not null default '[]'::jsonb,
  facts jsonb not null default '[]'::jsonb,
  apollo_id text,
  specter_id text,
  candidate_id uuid references public.candidates(id) on delete set null,
  do_not_contact boolean not null default false,
  do_not_contact_reason text,
  last_contacted_at timestamptz,
  last_enriched_at timestamptz,
  enrichment_credits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sourcing_people_apollo_idx on public.sourcing_people (apollo_id) where apollo_id is not null;
create unique index if not exists sourcing_people_candidate_idx on public.sourcing_people (candidate_id) where candidate_id is not null;
create unique index if not exists sourcing_people_linkedin_idx on public.sourcing_people (lower(links->>'linkedin')) where links->>'linkedin' is not null;
create index if not exists sourcing_people_name_idx on public.sourcing_people (lower(full_name));

-- ── 3. The pool: one person read against one search ─────────────────────────
-- Fit, contact, relationship and decision are four separate fields on
-- purpose. "Ready" is computed from all four and never stored as a shortcut.
create table if not exists public.sourcing_pool (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  person_id uuid not null references public.sourcing_people(id) on delete cascade,
  brief_version integer,
  source text not null check (source in ('apollo', 'bench', 'manual', 'partner')),
  source_meta jsonb not null default '{}'::jsonb,
  screen text not null default 'pending' check (screen in ('pending', 'promising', 'screened_out')),
  screen_reason text,
  grade text check (grade in ('A', 'B', 'C')),
  fit_status text not null default 'unknown' check (fit_status in ('unknown', 'fit', 'near_miss', 'not_fit')),
  requirements jsonb not null default '[]'::jsonb,
  why jsonb not null default '[]'::jsonb,
  watch_for text,
  hook text,
  hook_evidence text,
  hook_ok boolean not null default false,
  contact_status text not null default 'none' check (contact_status in ('none', 'guessed', 'found', 'verified')),
  relationship_status text not null default 'unchecked'
    check (relationship_status in ('unchecked', 'clear', 'client_employee', 'protected', 'do_not_contact', 'contacted_recently', 'in_sequence', 'on_desk')),
  relationship_note text,
  decision text not null default 'none' check (decision in ('none', 'ready', 'held', 'not_fit')),
  decision_reason text,
  decided_by text,
  decided_at timestamptz,
  graded_at timestamptz,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, person_id)
);
create index if not exists sourcing_pool_job_idx on public.sourcing_pool (job_id, decision, fit_status);

-- ── 4. Mailboxes ────────────────────────────────────────────────────────────
-- credential: {"kind":"desk"} reuses the desk's own Google token
-- (lily@refery.io); {"kind":"refresh_token","refresh_token":"..."} is a
-- mailbox connected through /api/admin/google/connect?mailbox=1;
-- {"kind":"service_account"} impersonates the address through domain-wide
-- delegation (GOOGLE_SERVICE_ACCOUNT_JSON). reserved_other is the number of
-- sends a day the mailbox is assumed to make outside this desk (recaps,
-- desk emails), so the cap counts them without reading every thread.
create table if not exists public.sourcing_mailboxes (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  display_name text not null,
  signs_as text not null,
  owner_email text,
  credential jsonb not null default '{"kind":"desk"}'::jsonb,
  daily_cap integer not null default 10,
  cap_ceiling integer not null default 50,
  ramp_step integer not null default 5,
  ramp_started_at timestamptz,
  reserved_other integer not null default 0,
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  last_error text,
  last_sync_at timestamptz,
  last_sync_ok boolean,
  last_history_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 5. Sequences: one per search ────────────────────────────────────────────
create table if not exists public.sourcing_sequences (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  version integer not null default 1,
  steps jsonb not null,
  mailbox_ids uuid[] not null default '{}'::uuid[],
  address_preference text not null default 'personal_first' check (address_preference in ('personal_first', 'work_first', 'work_only')),
  send_days integer[] not null default '{2,3,4}'::integer[],
  followup_days integer[] not null default '{1,2,3,4,5}'::integer[],
  window_start text not null default '08:30',
  window_end text not null default '11:00',
  mode text not null default 'learning' check (mode in ('learning', 'batches', 'auto')),
  sending boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 6. Batches: what one approval covers, exactly ───────────────────────────
-- items freeze the person, the mailbox, the address and the rendered drafts
-- with a hash. An approval applies to this list and nothing else; a person
-- added later or a draft edited later is a new batch.
create table if not exists public.sourcing_batches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  sequence_id uuid references public.sourcing_sequences(id) on delete set null,
  sequence_version integer,
  brief_version integer,
  items jsonb not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'cancelled')),
  slack_batch_id uuid,
  slack_channel text,
  slack_ts text,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sourcing_batches_job_idx on public.sourcing_batches (job_id, status);

-- ── 7. Runs: one person's sequence, and the events on it ────────────────────
create table if not exists public.sourcing_runs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.sourcing_batches(id) on delete set null,
  job_id uuid not null references public.jobs(id) on delete cascade,
  person_id uuid not null references public.sourcing_people(id) on delete cascade,
  pool_id uuid references public.sourcing_pool(id) on delete set null,
  mailbox_id uuid not null references public.sourcing_mailboxes(id),
  address text not null,
  sequence_version integer,
  drafts jsonb not null,
  step integer not null default 0,
  state text not null default 'queued'
    check (state in ('queued', 'active', 'replied', 'bounced', 'ooo', 'paused', 'stopped', 'done', 'error')),
  stopped_reason text,
  reply_kind text,
  reply_summary text,
  next_at timestamptz,
  gmail_thread_id text,
  gmail_message_ids text[] not null default '{}'::text[],
  first_subject text,
  first_message_id text,
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sourcing_runs_due_idx on public.sourcing_runs (next_at) where state in ('queued', 'active', 'ooo');
create index if not exists sourcing_runs_thread_idx on public.sourcing_runs (gmail_thread_id) where gmail_thread_id is not null;
create index if not exists sourcing_runs_job_idx on public.sourcing_runs (job_id, state);
create index if not exists sourcing_runs_person_idx on public.sourcing_runs (person_id);

create table if not exists public.sourcing_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.sourcing_runs(id) on delete cascade,
  job_id uuid,
  person_id uuid,
  mailbox_id uuid,
  kind text not null,
  step integer,
  gmail_message_id text,
  classification text,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sourcing_events_run_idx on public.sourcing_events (run_id, created_at desc);
create index if not exists sourcing_events_kind_idx on public.sourcing_events (kind, created_at desc);
create unique index if not exists sourcing_events_gmail_idx on public.sourcing_events (gmail_message_id, kind) where gmail_message_id is not null;

-- ── 8. The never list, and the spend record ─────────────────────────────────
create table if not exists public.sourcing_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  person_id uuid references public.sourcing_people(id) on delete set null,
  reason text not null,
  source text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.sourcing_lookups (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  person_id uuid,
  provider text not null,
  kind text not null,
  credits integer not null default 0,
  found boolean,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists sourcing_lookups_month_idx on public.sourcing_lookups (created_at desc);

-- ── 9. Housekeeping ─────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['sourcing_briefs', 'sourcing_people', 'sourcing_pool', 'sourcing_mailboxes', 'sourcing_sequences', 'sourcing_batches', 'sourcing_runs']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function vf.touch_updated_at()', t, t);
  end loop;
  foreach t in array array['sourcing_briefs', 'sourcing_people', 'sourcing_pool', 'sourcing_mailboxes', 'sourcing_sequences', 'sourcing_batches', 'sourcing_runs', 'sourcing_events', 'sourcing_suppressions', 'sourcing_lookups']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Slack batch cards learn one more kind: a slate of people to write to.
alter table public.slack_batches drop constraint if exists slack_batches_kind_check;
alter table public.slack_batches add constraint slack_batches_kind_check
  check (kind = any (array['scout_backlog', 'lead_backlog', 'agreement_chase', 'founder_outreach', 'sourcing_outreach']));

-- Every ten minutes: read replies on every mailbox, then send what is due.
select cron.unschedule('sourcing-run') where exists (select 1 from cron.job where jobname = 'sourcing-run');
select cron.schedule('sourcing-run', '*/10 * * * *', $$select public.desk_cron_post('/api/cron/sourcing', 280000);$$);
