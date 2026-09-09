-- ============================================================================
-- 2026-09-09 engine release 1, part 4: the independent review's findings.
--
-- Applies after parts 1 to 3. Each block names the finding it closes
-- (Claude-Code-Release-1-review.md).
--
--   3. A panel rerun could move a human not_fit or dormant back to
--      decision_pending with source 'desk'. The guard now refuses any move
--      out of a closed or held state into an in-review state unless a human
--      made it; the application also stopped asking.
--   5. Human exceptions: a recorded 'waive_logistics' override lets a seat's
--      unresolved logistics not block client readiness.
--   7. claim_panel_queue could hand a targeted rerun an item another worker
--      still held; enqueue_candidate_panel reset a running row to queued;
--      the outbox was drained without a claim. Claims are now strict, leases
--      can be renewed (and must be, before a result is written), the outbox
--      is claimed under a lease.
--   1. The envelope counts this month's desk spend that predates the ledger.
-- ============================================================================

-- ── 3. A human's state stays put ───────────────────────────────────────────

create or replace function public.candidates_guard_journey_trg()
returns trigger
language plpgsql
as $$
begin
  -- Automation never undoes a desk or human move.
  if new.journey_stage_source = 'automation'
     and old.journey_stage_source in ('desk','human')
     and old.journey_stage not in ('uploaded','calibrating') then
    new.journey_stage := old.journey_stage;
    new.journey_stage_at := old.journey_stage_at;
    new.journey_stage_source := old.journey_stage_source;
  end if;
  -- Nothing but a human reopens a closed or held person. A panel rerun, a
  -- rule or a backfill that tries to put not_fit, post_committee_not_fit,
  -- dormant, placed, bench, intro_requested, intro_sent, committee_call or
  -- warm back to an in-review stage is refused and the old state kept.
  if old.journey_stage in ('not_fit','post_committee_not_fit','dormant','placed','bench','intro_requested','intro_sent','committee_call','warm')
     and new.journey_stage in ('uploaded','calibrating','decision_pending','ready_for_intro')
     and new.journey_stage is distinct from old.journey_stage
     and coalesce(new.journey_stage_source, '') <> 'human' then
    new.journey_stage := old.journey_stage;
    new.journey_stage_at := old.journey_stage_at;
    new.journey_stage_source := old.journey_stage_source;
    new.decision_pending_since := old.decision_pending_since;
  end if;
  -- A desk panel is the grade of record once it exists. The nightly panel
  -- may still fill a NULL, never replace.
  if old.panel_at is not null and new.panel_at is not distinct from old.panel_at
     and new.journey_stage_source is distinct from 'desk' then
    if new.panel_grade is distinct from old.panel_grade then new.panel_grade := old.panel_grade; end if;
    if new.recruiter_verdict is distinct from old.recruiter_verdict and old.recruiter_verdict is not null then new.recruiter_verdict := old.recruiter_verdict; end if;
  end if;
  return new;
end $$;

-- ── 5. A recorded exception for unresolved logistics ───────────────────────

alter table public.candidate_eligibility_overrides drop constraint if exists candidate_eligibility_overrides_effect_check;
alter table public.candidate_eligibility_overrides add constraint candidate_eligibility_overrides_effect_check
  check (effect in ('allow_match','block_match','allow_contact','block_contact','waive_logistics'));

-- ── 7. Claims that cannot steal, leases that can be renewed ────────────────

-- Targeting a candidate no longer bypasses ownership: a running item with a
-- live lease is not claimable by anyone until the lease expires.
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

-- A worker renews just before it writes; false means it no longer owns the item.
create or replace function public.renew_panel_lease(p_candidate_id uuid, p_lease uuid, p_lease_seconds integer default 300)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  update public.candidate_panel_queue q
     set lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   where q.candidate_id = p_candidate_id and q.lease_token = p_lease and q.status = 'running' and q.lease_expires_at > now();
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

create or replace function public.renew_match_lease(p_job_id uuid, p_lease uuid, p_lease_seconds integer default 300)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  update public.search_match_queue q
     set lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   where q.job_id = p_job_id and q.lease_token = p_lease and q.status = 'running' and q.lease_expires_at > now();
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- Queueing a rerun while a worker holds the item no longer resets it under
-- that worker; the request is kept as `rerun_requested` and the row returns
-- to queued when the current run completes (see complete_panel_queue).
alter table public.candidate_panel_queue add column if not exists rerun_requested text;

create or replace function public.enqueue_candidate_panel(p_candidate_id uuid, p_reason text default 'created')
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.candidate_panel_queue (candidate_id, reason, status, attempts, error, enqueued_at, started_at, finished_at)
  values (p_candidate_id, p_reason, 'queued', 0, null, now(), null, null)
  on conflict (candidate_id) do update
    set reason = case when candidate_panel_queue.status = 'running' and candidate_panel_queue.lease_expires_at > now() then candidate_panel_queue.reason else excluded.reason end,
        rerun_requested = case when candidate_panel_queue.status = 'running' and candidate_panel_queue.lease_expires_at > now() then excluded.reason else null end,
        status = case when candidate_panel_queue.status = 'running' and candidate_panel_queue.lease_expires_at > now() then 'running' else 'queued' end,
        attempts = case when candidate_panel_queue.status = 'running' and candidate_panel_queue.lease_expires_at > now() then candidate_panel_queue.attempts else 0 end,
        error = null,
        enqueued_at = now(),
        started_at = case when candidate_panel_queue.status = 'running' and candidate_panel_queue.lease_expires_at > now() then candidate_panel_queue.started_at else null end,
        finished_at = null;
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
     set status = case when q.rerun_requested is not null and p_status in ('done','skipped','failed') then 'queued' else p_status end,
         reason = case when q.rerun_requested is not null and p_status in ('done','skipped','failed') then q.rerun_requested else q.reason end,
         rerun_requested = null,
         outcome = coalesce(p_outcome, q.outcome),
         error = p_error,
         finished_at = case when p_status in ('done', 'failed', 'skipped') and q.rerun_requested is null then now() else null end,
         not_before = case when p_retry_in_seconds is not null then now() + make_interval(secs => p_retry_in_seconds) else null end,
         attempts = case when p_outcome = 'deferred_budget' then greatest(q.attempts - 1, 0) when q.rerun_requested is not null then 0 else q.attempts end,
         lease_token = null,
         lease_expires_at = null
   where q.candidate_id = p_candidate_id and q.lease_token = p_lease;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- The outbox: claimed under a lease, completed against it.
alter table public.desk_outbox
  add column if not exists lease_token      uuid,
  add column if not exists lease_expires_at timestamptz;
alter table public.desk_outbox drop constraint if exists desk_outbox_status_check;
alter table public.desk_outbox add constraint desk_outbox_status_check
  check (status in ('queued','delivered','failed','uncertain'));

create or replace function public.claim_outbox(p_limit integer, p_lease_seconds integer default 120)
returns setof public.desk_outbox
language sql
volatile
security definer
set search_path to 'public'
as $$
  with pick as (
    select o.id
    from public.desk_outbox o
    where o.status = 'queued'
      and o.next_attempt_at <= now()
      and (o.lease_expires_at is null or o.lease_expires_at < now())
    order by o.created_at
    limit greatest(p_limit, 1)
    for update skip locked
  )
  update public.desk_outbox o
     set lease_token = gen_random_uuid(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         attempts = o.attempts + 1
  from pick
  where o.id = pick.id
  returning o.*;
$$;

-- 'uncertain' parks the item for a human: the send may have landed, so it is not retried.
create or replace function public.complete_outbox(p_id uuid, p_lease uuid, p_status text, p_error text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  update public.desk_outbox o
     set status = case when p_status = 'queued' and o.attempts >= 8 then 'failed' else p_status end,
         last_error = p_error,
         delivered_at = case when p_status = 'delivered' then now() else o.delivered_at end,
         next_attempt_at = case when p_status = 'queued' then now() + make_interval(mins => least(60, power(2, o.attempts))::integer) else o.next_attempt_at end,
         lease_token = null,
         lease_expires_at = null
   where o.id = p_id and o.lease_token = p_lease;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.renew_panel_lease(uuid, uuid, integer)',
    'public.renew_match_lease(uuid, uuid, integer)',
    'public.claim_outbox(integer, integer)',
    'public.complete_outbox(uuid, uuid, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ── 1. This month's spend that predates the ledger ─────────────────────────
-- The desk recorded its own costs on candidate_panels and search_match_runs
-- before the shared ledger existed. Those rows are imported once, keyed by
-- their source row, so the envelope starts from what was really spent.

insert into public.brain_ai_usage (month_start, request_kind, model, reservation_usd, actual_usd, input_tokens, output_tokens, status, metadata, finalized_at, source, task, estimate_usd, created_at)
select date_trunc('month', p.created_at)::date, 'panel', p.model, 0, coalesce(p.cost_usd, 0), p.tokens_in, p.tokens_out, 'completed',
       jsonb_build_object('import_key', 'candidate_panels:' || p.id::text, 'imported_at', now()), p.created_at, 'desk', 'panel', coalesce(p.cost_usd, 0), p.created_at
from public.candidate_panels p
where p.created_at >= date_trunc('month', now())
  and p.cost_usd is not null
  and not exists (select 1 from public.brain_ai_usage u where u.metadata->>'import_key' = 'candidate_panels:' || p.id::text);

insert into public.brain_ai_usage (month_start, request_kind, model, reservation_usd, actual_usd, status, metadata, finalized_at, source, task, estimate_usd, created_at)
select date_trunc('month', r.created_at)::date, 'bench', coalesce(r.model, 'unknown'), 0, coalesce(r.cost_usd, 0), 'completed',
       jsonb_build_object('import_key', 'search_match_runs:' || r.id::text, 'imported_at', now()), r.created_at, 'desk', 'bench', coalesce(r.cost_usd, 0), r.created_at
from public.search_match_runs r
where r.created_at >= date_trunc('month', now())
  and r.cost_usd is not null
  and not exists (select 1 from public.brain_ai_usage u where u.metadata->>'import_key' = 'search_match_runs:' || r.id::text);

-- The month row's spent total is the sum of every completed row, imported or not.
insert into public.brain_budget_months (month_start, hard_limit_usd)
select date_trunc('month', now())::date, s.hard_limit_usd from public.engine_settings s where s.id = 1
on conflict (month_start) do nothing;

update public.brain_budget_months b
   set spent_usd = (select coalesce(sum(u.actual_usd), 0) from public.brain_ai_usage u where u.month_start = b.month_start and u.status = 'completed')
 where b.month_start = date_trunc('month', now())::date;

-- ── Verification (run after applying) ──────────────────────────────────────
-- select public.engine_budget_status();
-- select count(*) from public.claim_panel_queue(1, 60, '<running candidate id>');   -- 0 while its lease is live
-- update candidates set journey_stage='decision_pending', journey_stage_source='desk' where journey_stage='not_fit' and id='<id>'; select journey_stage from candidates where id='<id>';  -- still not_fit
