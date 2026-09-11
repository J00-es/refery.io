-- Notes Lily pastes on a seat (market research from Claude Desktop or
-- ChatGPT, a founder's aside, a correction), read by the profile builder
-- as a source of kind "note".
create table if not exists public.sourcing_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'market')),
  title text,
  text text not null,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists sourcing_notes_job_idx on public.sourcing_notes (job_id, created_at desc);
alter table public.sourcing_notes enable row level security;
