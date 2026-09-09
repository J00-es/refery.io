-- ============================================================================
-- 2026-09-09 engine release 1, part 3: records the engine can be audited by.
--
--   * A shared cost authority: every paid call from the desk, the parser, the
--     transcript reader and the Brain reserves and finalises in brain_ai_usage,
--     against one envelope (engine_settings). Audit finding 14.
--   * Atomic queue claims with a lease, so two workers cannot buy the same
--     assessment. Audit finding 15.
--   * Versioned sources, facts, scorecards, assessments and slates; all pair
--     decisions stored, the displayed subset stored separately. Audit finding 14.
--   * An outbox for Slack and email effects, retried without repurchasing the
--     model call.
--   * A normalised human-decision table seeded from what exists, with
--     provenance. lily_verdict text is left untouched. Audit finding 1.
--
-- Additive only. No candidate is regraded; no message is sent.
-- ============================================================================

-- ── 1. One cost authority ──────────────────────────────────────────────────

create table if not exists public.engine_settings (
  id              integer primary key default 1 check (id = 1),
  hard_limit_usd  numeric(12,4) not null default 95,
  defer_usd       numeric(12,4) not null default 85,
  alert_usd       numeric(12,4) not null default 70,
  updated_at      timestamptz not null default now()
);
insert into public.engine_settings (id) values (1) on conflict (id) do nothing;
alter table public.engine_settings enable row level security;

alter table public.brain_ai_usage
  add column if not exists source               text not null default 'brain',
  add column if not exists task                 text,
  add column if not exists provider_request_id  text,
  add column if not exists cached_tokens        integer,
  add column if not exists reasoning_tokens     integer,
  add column if not exists attempts             integer not null default 1,
  add column if not exists versions             jsonb not null default '{}'::jsonb,
  add column if not exists estimate_usd         numeric(12,6);
create index if not exists brain_ai_usage_month_source_idx on public.brain_ai_usage (month_start, source, status);
-- 'deferred': a discretionary call held back past the defer line, never billed.
alter table public.brain_ai_usage drop constraint if exists brain_ai_usage_status_check;
alter table public.brain_ai_usage add constraint brain_ai_usage_status_check
  check (status = any (array['reserved'::text, 'completed'::text, 'failed'::text, 'blocked'::text, 'deferred'::text]));

-- Reserve a worst-case cost before dispatch. `deferred` means the call is
-- discretionary and the month is past the defer line: queue it, do not fail
-- the person. `allowed = false, deferred = false` means the hard line.
create or replace function public.engine_reserve_budget(
  p_source text,
  p_task text,
  p_model text,
  p_estimated_usd numeric,
  p_discretionary boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns table(allowed boolean, deferred boolean, usage_id uuid, remaining_usd numeric, hard_limit_usd numeric, reason text)
language plpgsql
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_month     date := date_trunc('month', now())::date;
  v_settings  public.engine_settings%rowtype;
  v_spent     numeric(12,6);
  v_reserved  numeric(12,6);
  v_estimate  numeric(12,6) := greatest(coalesce(p_estimated_usd, 0), 0);
  v_usage_id  uuid;
  v_source_cap numeric(12,4);
  v_source_used numeric(12,6);
  v_reason    text;
begin
  select * into v_settings from public.engine_settings where id = 1;
  if not found then
    raise exception 'engine_settings row is missing';
  end if;

  insert into public.brain_budget_months (month_start, hard_limit_usd)
  values (v_month, v_settings.hard_limit_usd)
  on conflict (month_start) do update set hard_limit_usd = excluded.hard_limit_usd;

  select b.spent_usd, b.reserved_usd into v_spent, v_reserved
  from public.brain_budget_months b
  where b.month_start = v_month
  for update;

  -- The Brain keeps its own allocation inside the envelope.
  if p_source = 'brain' then
    select monthly_budget_usd into v_source_cap from public.brain_settings where id = 1;
    select coalesce(sum(case when u.status = 'reserved' then u.reservation_usd else u.actual_usd end), 0)
      into v_source_used
    from public.brain_ai_usage u
    where u.month_start = v_month and u.source = 'brain' and u.status in ('reserved', 'completed');
    if v_source_cap is not null and v_source_used + v_estimate > v_source_cap then
      v_reason := 'brain_allocation';
    end if;
  end if;

  if v_reason is null and v_spent + v_reserved + v_estimate > v_settings.hard_limit_usd then
    v_reason := 'hard_limit';
  end if;

  if v_reason is not null then
    insert into public.brain_ai_usage (month_start, request_kind, model, reservation_usd, actual_usd, status, metadata, finalized_at, source, task, estimate_usd)
    values (v_month, coalesce(p_task, 'unknown'), p_model, 0, 0, 'blocked', coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('reason', v_reason), now(), p_source, p_task, v_estimate)
    returning id into v_usage_id;
    update public.brain_budget_months b set blocked_calls = b.blocked_calls + 1 where b.month_start = v_month;
    return query select false, false, v_usage_id, greatest(v_settings.hard_limit_usd - v_spent - v_reserved, 0), v_settings.hard_limit_usd, v_reason;
    return;
  end if;

  if p_discretionary and v_spent + v_reserved + v_estimate > v_settings.defer_usd then
    insert into public.brain_ai_usage (month_start, request_kind, model, reservation_usd, actual_usd, status, metadata, finalized_at, source, task, estimate_usd)
    values (v_month, coalesce(p_task, 'unknown'), p_model, 0, 0, 'deferred', coalesce(p_metadata, '{}'::jsonb), now(), p_source, p_task, v_estimate)
    returning id into v_usage_id;
    return query select false, true, v_usage_id, greatest(v_settings.hard_limit_usd - v_spent - v_reserved, 0), v_settings.hard_limit_usd, 'defer_line';
    return;
  end if;

  insert into public.brain_ai_usage (month_start, request_kind, model, reservation_usd, status, metadata, source, task, estimate_usd)
  values (v_month, coalesce(p_task, 'unknown'), p_model, v_estimate, 'reserved', coalesce(p_metadata, '{}'::jsonb), p_source, p_task, v_estimate)
  returning id into v_usage_id;

  update public.brain_budget_months b set reserved_usd = b.reserved_usd + v_estimate where b.month_start = v_month;

  return query select true, false, v_usage_id,
    greatest(v_settings.hard_limit_usd - v_spent - v_reserved - v_estimate, 0), v_settings.hard_limit_usd, 'ok';
end;
$$;

-- The Brain's existing entry point keeps its signature and now goes through
-- the shared authority (its own $20 allocation still applies).
create or replace function public.brain_reserve_budget(
  p_request_kind text,
  p_model text,
  p_estimated_usd numeric,
  p_event_id uuid default null,
  p_draft_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(allowed boolean, usage_id uuid, remaining_usd numeric, hard_limit_usd numeric)
language plpgsql
set search_path to 'public', 'pg_catalog'
as $$
declare
  r record;
begin
  select * into r from public.engine_reserve_budget('brain', p_request_kind, p_model, p_estimated_usd, false, coalesce(p_metadata, '{}'::jsonb));
  update public.brain_ai_usage set event_id = p_event_id, draft_id = p_draft_id where id = r.usage_id;
  return query select r.allowed, r.usage_id, r.remaining_usd, r.hard_limit_usd;
end;
$$;

-- Finalise with everything the ledger needs to reconcile against the
-- provider's usage export. 'uncertain' keeps the reservation (a timeout after
-- dispatch may still have been billed) and marks it for reconciliation.
create or replace function public.engine_finalize_budget(
  p_usage_id uuid,
  p_actual_usd numeric,
  p_input_tokens integer,
  p_output_tokens integer,
  p_status text default 'completed',
  p_cached_tokens integer default null,
  p_reasoning_tokens integer default null,
  p_provider_request_id text default null,
  p_attempts integer default null
)
returns void
language plpgsql
set search_path to 'public', 'pg_catalog'
as $$
begin
  if p_status = 'uncertain' then
    update public.brain_ai_usage
       set metadata = metadata || jsonb_build_object('uncertain_at', now()),
           attempts = coalesce(p_attempts, attempts),
           provider_request_id = coalesce(p_provider_request_id, provider_request_id)
     where id = p_usage_id and status = 'reserved';
    return;
  end if;
  perform public.brain_finalize_budget(p_usage_id, p_actual_usd, p_input_tokens, p_output_tokens, p_status);
  update public.brain_ai_usage
     set cached_tokens = coalesce(p_cached_tokens, cached_tokens),
         reasoning_tokens = coalesce(p_reasoning_tokens, reasoning_tokens),
         provider_request_id = coalesce(p_provider_request_id, provider_request_id),
         attempts = coalesce(p_attempts, attempts)
   where id = p_usage_id;
end;
$$;

create or replace function public.engine_budget_status()
returns jsonb
language sql
stable
set search_path to 'public', 'pg_catalog'
as $$
  with m as (
    select * from public.brain_budget_months where month_start = date_trunc('month', now())::date
  ), s as (
    select * from public.engine_settings where id = 1
  ), by_source as (
    select u.source,
           round(sum(u.actual_usd), 4) as spent,
           round(sum(case when u.status = 'reserved' then u.reservation_usd else 0 end), 4) as reserved,
           count(*) filter (where u.status = 'blocked') as blocked,
           count(*) filter (where u.status = 'deferred') as deferred,
           count(*) filter (where u.metadata ? 'uncertain_at') as uncertain
    from public.brain_ai_usage u
    where u.month_start = date_trunc('month', now())::date
    group by u.source
  )
  select jsonb_build_object(
    'month', to_char(date_trunc('month', now()), 'YYYY-MM'),
    'spent_usd', coalesce((select spent_usd from m), 0),
    'reserved_usd', coalesce((select reserved_usd from m), 0),
    'hard_limit_usd', (select hard_limit_usd from s),
    'defer_usd', (select defer_usd from s),
    'alert_usd', (select alert_usd from s),
    'over_alert', coalesce((select spent_usd + reserved_usd from m), 0) >= (select alert_usd from s),
    'over_defer', coalesce((select spent_usd + reserved_usd from m), 0) >= (select defer_usd from s),
    'by_source', coalesce((select jsonb_object_agg(source, jsonb_build_object('spent', spent, 'reserved', reserved, 'blocked', blocked, 'deferred', deferred, 'uncertain', uncertain)) from by_source), '{}'::jsonb)
  );
$$;

revoke execute on function public.engine_reserve_budget(text, text, text, numeric, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.engine_finalize_budget(uuid, numeric, integer, integer, text, integer, integer, text, integer) from public, anon, authenticated;
revoke execute on function public.engine_budget_status() from public, anon, authenticated;
grant execute on function public.engine_reserve_budget(text, text, text, numeric, boolean, jsonb) to service_role;
grant execute on function public.engine_finalize_budget(uuid, numeric, integer, integer, text, integer, integer, text, integer) to service_role;
grant execute on function public.engine_budget_status() to service_role;

-- ── 2. Queue claims with a lease ───────────────────────────────────────────

alter table public.candidate_panel_queue
  add column if not exists lease_token      uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists not_before       timestamptz,
  add column if not exists outcome          text;
alter table public.search_match_queue
  add column if not exists lease_token      uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists not_before       timestamptz,
  add column if not exists outcome          text;

-- One statement, FOR UPDATE SKIP LOCKED: two workers get disjoint rows.
create or replace function public.claim_panel_queue(p_limit integer, p_lease_seconds integer default 360, p_candidate_id uuid default null, p_max_attempts integer default 3)
returns setof public.candidate_panel_queue
language sql
volatile
security definer
set search_path to 'public'
as $$
  with pick as (
    select q.candidate_id
    from public.candidate_panel_queue q
    where (p_candidate_id is null or q.candidate_id = p_candidate_id)
      and (
        (q.status = 'queued' and q.attempts < p_max_attempts and (q.not_before is null or q.not_before <= now()))
        or (q.status = 'running' and q.lease_expires_at is not null and q.lease_expires_at < now())
        or (p_candidate_id is not null)
      )
    order by q.enqueued_at
    limit greatest(p_limit, 1)
    for update skip locked
  )
  update public.candidate_panel_queue q
     set status = 'running',
         started_at = now(),
         attempts = q.attempts + 1,
         lease_token = gen_random_uuid(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         not_before = null
  from pick
  where q.candidate_id = pick.candidate_id
  returning q.*;
$$;

create or replace function public.complete_panel_queue(p_candidate_id uuid, p_lease uuid, p_status text, p_outcome text default null, p_error text default null, p_retry_in_seconds integer default null)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  update public.candidate_panel_queue q
     set status = p_status,
         outcome = coalesce(p_outcome, q.outcome),
         error = p_error,
         finished_at = case when p_status in ('done', 'failed', 'skipped') then now() else null end,
         not_before = case when p_retry_in_seconds is not null then now() + make_interval(secs => p_retry_in_seconds) else null end,
         -- a budget deferral is not an attempt
         attempts = case when p_outcome = 'deferred_budget' then greatest(q.attempts - 1, 0) else q.attempts end,
         lease_token = null,
         lease_expires_at = null
   where q.candidate_id = p_candidate_id and q.lease_token = p_lease;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

create or replace function public.claim_match_queue(p_limit integer, p_lease_seconds integer default 480, p_max_attempts integer default 3)
returns setof public.search_match_queue
language sql
volatile
security definer
set search_path to 'public'
as $$
  with pick as (
    select q.job_id
    from public.search_match_queue q
    where (q.status = 'queued' and q.attempts < p_max_attempts and (q.not_before is null or q.not_before <= now()))
       or (q.status = 'running' and q.lease_expires_at is not null and q.lease_expires_at < now())
    order by q.enqueued_at
    limit greatest(p_limit, 1)
    for update skip locked
  )
  update public.search_match_queue q
     set status = 'running',
         attempts = q.attempts + 1,
         lease_token = gen_random_uuid(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         not_before = null
  from pick
  where q.job_id = pick.job_id
  returning q.*;
$$;

create or replace function public.complete_match_queue(p_job_id uuid, p_lease uuid, p_status text, p_outcome text default null, p_error text default null, p_retry_in_seconds integer default null)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  update public.search_match_queue q
     set status = p_status,
         outcome = coalesce(p_outcome, q.outcome),
         error = p_error,
         finished_at = case when p_status in ('done', 'failed') then now() else null end,
         not_before = case when p_retry_in_seconds is not null then now() + make_interval(secs => p_retry_in_seconds) else null end,
         attempts = case when p_outcome = 'deferred_budget' then greatest(q.attempts - 1, 0) else q.attempts end,
         lease_token = null,
         lease_expires_at = null
   where q.job_id = p_job_id and q.lease_token = p_lease;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.claim_panel_queue(integer, integer, uuid, integer)',
    'public.complete_panel_queue(uuid, uuid, text, text, text, integer)',
    'public.claim_match_queue(integer, integer, integer)',
    'public.complete_match_queue(uuid, uuid, text, text, text, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ── 3. Versioned evidence ──────────────────────────────────────────────────

create table if not exists public.candidate_source_versions (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  kind          text not null check (kind in ('resume_text','parsed_data','transcript','note','facts')),
  content_hash  text not null,
  source_ref    jsonb not null default '{}'::jsonb,
  source_at     timestamptz,
  ingested_at   timestamptz not null default now(),
  chars         integer,
  unique (candidate_id, kind, content_hash)
);
create index if not exists candidate_source_versions_candidate_idx on public.candidate_source_versions (candidate_id, kind, ingested_at desc);
alter table public.candidate_source_versions enable row level security;

create table if not exists public.candidate_facts (
  id                 uuid primary key default gen_random_uuid(),
  candidate_id       uuid not null references public.candidates(id) on delete cascade,
  source_version_id  uuid references public.candidate_source_versions(id) on delete set null,
  fact_key           text not null,
  fact_value         jsonb,
  status             text not null check (status in ('supported','self_reported','contradicted','unknown','not_applicable')),
  span               text,
  observed_at        timestamptz,
  recorded_by        text not null,               -- model:<route> | human:<actor> | import:<what>
  run_id             uuid,
  created_at         timestamptz not null default now()
);
create index if not exists candidate_facts_candidate_idx on public.candidate_facts (candidate_id, fact_key, created_at desc);
alter table public.candidate_facts enable row level security;

create table if not exists public.role_scorecard_versions (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.jobs(id) on delete cascade,
  version       integer not null,
  content       jsonb not null,
  content_hash  text not null,
  mandate_state text not null default 'live',
  confirmed_by  text,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (job_id, version),
  unique (job_id, content_hash)
);
alter table public.role_scorecard_versions enable row level security;

create table if not exists public.engine_runs (
  id              uuid primary key default gen_random_uuid(),
  task            text not null,
  status          text not null check (status in ('queued','running','succeeded','empty','deferred_budget','input_error','provider_error','policy_excluded','failed')),
  input_versions  jsonb not null default '{}'::jsonb,
  attempts        integer not null default 1,
  error           text,
  cost_usd        numeric(12,6),
  usage_id        uuid,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);
alter table public.engine_runs enable row level security;

create table if not exists public.candidate_assessments (
  id                 uuid primary key default gen_random_uuid(),
  candidate_id       uuid not null references public.candidates(id) on delete cascade,
  source_version_id  uuid references public.candidate_source_versions(id) on delete set null,
  rubric_version     text not null,
  family             text,
  subfamily          text,
  scope              text,                          -- ic | manager | executive | unknown
  ratings            jsonb not null default '{}'::jsonb,   -- {dimension: 0..4 | null}
  coverage           numeric(5,4),
  unknowns           jsonb not null default '[]'::jsonb,
  evidence           jsonb not null default '[]'::jsonb,
  grade_compat       text,                          -- rubric label, compatibility only
  reviewer           text not null,                 -- model:<route> | human:<actor>
  run_id             uuid references public.engine_runs(id) on delete set null,
  panel_id           uuid references public.candidate_panels(id) on delete set null,
  is_current         boolean not null default true,
  created_at         timestamptz not null default now()
);
create index if not exists candidate_assessments_candidate_idx on public.candidate_assessments (candidate_id, created_at desc);
alter table public.candidate_assessments enable row level security;

create table if not exists public.match_assessments (
  id                     uuid primary key default gen_random_uuid(),
  job_id                 uuid not null references public.jobs(id) on delete cascade,
  candidate_id           uuid not null references public.candidates(id) on delete cascade,
  candidate_version_id   uuid references public.candidate_source_versions(id) on delete set null,
  scorecard_version_id   uuid references public.role_scorecard_versions(id) on delete set null,
  policy_version         text not null,
  rubric_version         text,
  retrieval_routes       text[] not null default '{}',
  retrieval_rank         integer,
  requirement_decisions  jsonb not null default '[]'::jsonb,
  eligibility            jsonb not null default '{}'::jsonb,
  role_fit               text not null check (role_fit in ('strong','possible','not_supported','not_assessed')),
  blockers               jsonb not null default '[]'::jsonb,
  next_action            text not null check (next_action in ('screening_call','request_information','human_review','client_intro','hold','no_current_role')),
  client_intro_ready     boolean not null default false,
  model                  text,
  run_id                 uuid,
  search_match_run_id    uuid references public.search_match_runs(id) on delete set null,
  panel_id               uuid references public.candidate_panels(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index if not exists match_assessments_job_idx on public.match_assessments (job_id, created_at desc);
create index if not exists match_assessments_candidate_idx on public.match_assessments (candidate_id, created_at desc);
alter table public.match_assessments enable row level security;

create table if not exists public.match_slates (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references public.jobs(id) on delete cascade,
  search_match_run_id   uuid references public.search_match_runs(id) on delete set null,
  audience              text not null default 'desk',
  assessment_ids        uuid[] not null default '{}',
  ordering              jsonb not null default '[]'::jsonb,
  shown_at              timestamptz not null default now(),
  feedback              jsonb not null default '{}'::jsonb
);
alter table public.match_slates enable row level security;

-- The panel row points at its inputs and keeps the deterministic derivation.
alter table public.candidate_panels
  add column if not exists input_hash         text,
  add column if not exists source_version_id  uuid references public.candidate_source_versions(id) on delete set null,
  add column if not exists policy_version     text,
  add column if not exists engine             jsonb not null default '{}'::jsonb,
  add column if not exists usage_id           uuid,
  add column if not exists reused_from        uuid references public.candidate_panels(id) on delete set null;
create index if not exists candidate_panels_input_hash_idx on public.candidate_panels (candidate_id, prompt_version, input_hash);

-- The bench run keeps the whole pool and the displayed slate apart; `results`
-- is never overwritten again.
alter table public.search_match_runs
  add column if not exists pool               jsonb,
  add column if not exists pool_size          integer,
  add column if not exists shown              jsonb,
  add column if not exists retrieval_version  text,
  add column if not exists policy_version     text,
  add column if not exists shadow             jsonb,
  add column if not exists usage_id           uuid;

alter table public.candidates
  add column if not exists embedding_input_hash text,
  add column if not exists embedding_version    text;

-- ── 4. Outbox for side effects ─────────────────────────────────────────────

create table if not exists public.desk_outbox (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null,                     -- bench_card | decision_card | thread_reply
  idempotency_key  text not null unique,
  payload          jsonb not null,
  status           text not null default 'queued' check (status in ('queued','delivered','failed')),
  attempts         integer not null default 0,
  last_error       text,
  next_attempt_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  delivered_at     timestamptz
);
create index if not exists desk_outbox_due_idx on public.desk_outbox (next_attempt_at) where status = 'queued';
alter table public.desk_outbox enable row level security;

-- ── 5. Seed the human-decision table from what exists ──────────────────────
-- Provenance is explicit. Nothing is deleted or rewritten on candidates.

-- 5a. Legacy lily_verdict text: the first-line token is a migration aid, not a
--     verified label. decided_at is approximated from candidates.updated_at
--     and says so.
insert into public.candidate_human_decisions
  (candidate_id, kind, value, scope, actor, source_event, source_ref, decided_at, reason, raw_text, provenance, dedupe_key)
select
  c.id,
  'capability',
  case lower(trim(split_part(trim(c.lily_verdict), E'\n', 1)))
    when 'very_strong' then 'very_strong'
    when 'strong' then 'strong'
    when 'moderate' then 'moderate'
    when 'weak' then 'weak'
    when 'low' then 'weak'
    when 'pass' then 'pass'
    else 'prose'
  end,
  'global',
  'unknown',
  'candidates.lily_verdict',
  jsonb_build_object('first_line', left(split_part(trim(c.lily_verdict), E'\n', 1), 200), 'alias', case when lower(trim(split_part(trim(c.lily_verdict), E'\n', 1))) = 'low' then 'low->weak' else null end),
  coalesce(c.updated_at, c.created_at, now()),
  'Legacy field. Authorship and whether a call happened are not established; decided_at approximated from candidates.updated_at.',
  c.lily_verdict,
  'legacy_unverified',
  'legacy:lily_verdict:' || c.id::text
from public.candidates c
where nullif(trim(c.lily_verdict), '') is not null
on conflict (dedupe_key) do nothing;

-- 5b. Desk decisions and post-call verdicts (actor and time recorded).
insert into public.candidate_human_decisions
  (candidate_id, job_id, kind, value, scope, actor, source_event, source_ref, decided_at, reason, provenance, dedupe_key)
select
  d.candidate_id,
  null,
  case
    when d.decision in ('verdict_very_strong','verdict_strong','verdict_not_fit') then 'capability'
    when d.decision = 'verdict_hold' then 'availability'
    else 'role_decision'
  end,
  case d.decision
    when 'verdict_very_strong' then 'very_strong'
    when 'verdict_strong' then 'strong'
    when 'verdict_not_fit' then 'weak'
    when 'verdict_hold' then 'off_market_hold'
    else d.decision
  end,
  'global',
  coalesce(d.decided_by, 'unknown'),
  'candidate_decisions',
  jsonb_build_object('id', d.id, 'via', d.via, 'job_ids', d.job_ids),
  d.created_at,
  d.reason,
  'verified',
  'candidate_decisions:' || d.id::text
from public.candidate_decisions d
on conflict (dedupe_key) do nothing;

-- 5c. Evidence that a call happened.
insert into public.candidate_human_decisions
  (candidate_id, kind, value, scope, actor, source_event, source_ref, decided_at, provenance, dedupe_key)
select r.candidate_id, 'met', 'call_note', 'global', coalesce(r.user_id::text, 'unknown'), 'recruiter_notes', jsonb_build_object('id', r.id), r.created_at, 'verified', 'recruiter_notes:' || r.id::text
from public.recruiter_notes r
where r.note_type = 'call' and r.candidate_id is not null
on conflict (dedupe_key) do nothing;

insert into public.candidate_human_decisions
  (candidate_id, kind, value, scope, actor, source_event, source_ref, decided_at, provenance, dedupe_key)
select a.candidate_id, 'met', 'call_transcript', 'global', coalesce(a.performed_by::text, 'system'), 'candidate_activity_log', jsonb_build_object('id', a.id), a.created_at, 'verified', 'candidate_activity_log:' || a.id::text
from public.candidate_activity_log a
where a.activity_type = 'call_transcript' and a.candidate_id is not null
on conflict (dedupe_key) do nothing;

insert into public.candidate_human_decisions
  (candidate_id, kind, value, scope, actor, source_event, source_ref, decided_at, provenance, dedupe_key)
select c.entity_id, 'met', 'call_recap', 'global', 'granola', 'call_recaps', jsonb_build_object('id', c.id), coalesce(c.occurred_at, c.created_at), 'verified', 'call_recaps:' || c.id::text
from public.call_recaps c
join public.candidates cd on cd.id = c.entity_id
where c.entity_type = 'candidate'
on conflict (dedupe_key) do nothing;

-- 5d. Role-specific rejections already on record.
insert into public.candidate_human_decisions
  (candidate_id, job_id, kind, value, scope, actor, source_event, source_ref, decided_at, reason, provenance, dedupe_key)
select s.candidate_id, s.job_id, 'role_decision', 'declined', 'job',
       coalesce(s.acted_by_user_id::text, s.reviewed_by::text, 'unknown'),
       'role_submissions', jsonb_build_object('id', s.id), coalesce(s.decided_at, s.updated_at, s.created_at), s.decline_reason, 'verified',
       'role_submissions:' || s.id::text
from public.role_submissions s
where s.status = 'declined'
on conflict (dedupe_key) do nothing;

-- ── 6. Verification (run after applying) ───────────────────────────────────
-- select provenance, kind, value, count(*) from candidate_human_decisions group by 1,2,3 order by 1,2,3;
-- select * from public.engine_budget_status();
-- select count(*) from public.claim_panel_queue(0);                         -- 0, nothing queued
