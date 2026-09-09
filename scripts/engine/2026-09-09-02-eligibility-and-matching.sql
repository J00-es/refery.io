-- ============================================================================
-- 2026-09-09 engine release 1, part 2: one eligibility policy, unambiguous
-- matching functions, grade-free bench retrieval, a guard on the pipeline.
--
-- Findings 3, 4, 10, 12 and 17 of the audit, all reproduced on 2026-09-09:
--   * bench_candidates_for_job admits A+/A/A- or warm only; 8 B+ candidates
--     pass every other condition and are excluded by grade alone.
--   * 76 of 887 pipeline rows created in the last 7 days were created after
--     the candidate entered not_fit / post_committee_not_fit / dormant / placed.
--   * match_jobs_for_candidate exists as a 3-argument and a 4-argument
--     overload with defaults; even a fully typed 3-argument call fails with
--     42725 (function is not unique).
--   * "met" on the bench means lily_verdict is not null: 100 of 159 pool
--     members are met only by that field.
--
-- Everything here is additive except the drop of the plain 3-argument
-- match_jobs_for_candidate(uuid, double precision, integer) overload, whose
-- only caller (the match-candidate skill) has been failing with 42725 since
-- the 4-argument overload was added. The legacy 3-argument CALL keeps working
-- and now resolves to the filtered implementation.
--
-- Policy version: eligibility-v1. The TypeScript twin is lib/engine/policy.ts;
-- tests/engine/policy-parity.test.ts checks the two agree on every candidate.
-- ============================================================================

-- ── 1. Human decisions, normalised ─────────────────────────────────────────
-- One row per attributable human decision about a person. Machine
-- suggestions never go here. lily_verdict on candidates is left untouched as
-- history; part 3 seeds this table from it with provenance = legacy_unverified.

create table if not exists public.candidate_human_decisions (
  id               uuid primary key default gen_random_uuid(),
  candidate_id     uuid not null references public.candidates(id) on delete cascade,
  job_id           uuid references public.jobs(id) on delete set null,
  -- capability: an opinion on ability (very_strong .. pass)
  -- role_decision: intro_now / bench / not_fit / route_elsewhere, pre-call
  -- availability: off_market_hold, active
  -- contact: do_not_contact, contact_ok
  -- met: a call happened (value = evidence kind)
  kind             text not null check (kind in ('capability','role_decision','availability','contact','met')),
  value            text not null,
  scope            text not null default 'global' check (scope in ('global','job')),
  actor            text not null,
  source_event     text not null,
  source_ref       jsonb not null default '{}'::jsonb,
  decided_at       timestamptz not null,
  candidate_source_version_id uuid,
  reason           text,
  raw_text         text,
  provenance       text not null check (provenance in ('verified','legacy_unverified')),
  dedupe_key       text not null unique,
  revoked_at       timestamptz,
  revoked_by       text,
  created_at       timestamptz not null default now()
);
create index if not exists candidate_human_decisions_candidate_idx on public.candidate_human_decisions (candidate_id, kind, decided_at desc);
alter table public.candidate_human_decisions enable row level security;

-- ── 2. Human overrides of the policy ───────────────────────────────────────
-- An AI rerun cannot reopen a person; a human can, and it is recorded with
-- actor, reason, time and scope. Expiry is optional.

create table if not exists public.candidate_eligibility_overrides (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  scope        text not null default 'global' check (scope in ('global','job')),
  job_id       uuid references public.jobs(id) on delete cascade,
  effect       text not null check (effect in ('allow_match','block_match','allow_contact','block_contact')),
  reason       text not null,
  actor        text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  revoked_by   text,
  check (scope = 'global' or job_id is not null)
);
create index if not exists candidate_eligibility_overrides_candidate_idx on public.candidate_eligibility_overrides (candidate_id) where revoked_at is null;
alter table public.candidate_eligibility_overrides enable row level security;

-- ── 3. The policy ──────────────────────────────────────────────────────────

create or replace function public.candidate_eligibility(p_candidate_id uuid, p_job_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  c          record;
  reasons    text[] := '{}';
  can_assess boolean := true;
  can_match  boolean := true;
  contact    text := 'yes';          -- yes | needs_review | no
  o          record;
  intro      boolean;
begin
  select journey_stage, journey_stage_source, availability_status, person_type, intake_source, consent_told_candidate
    into c
  from candidates
  where id = p_candidate_id;

  if not found then
    return jsonb_build_object(
      'policy_version', 'eligibility-v1', 'found', false,
      'can_assess', false, 'can_match', false, 'can_contact', 'no', 'client_intro_ready', false,
      'reasons', jsonb_build_array('candidate_not_found'));
  end if;

  -- permanent
  if coalesce(c.intake_source, '') = 'calibration' then
    reasons := array_append(reasons, 'calibration_sample'); can_assess := false; can_match := false; contact := 'no';
  end if;
  if exists (
    select 1 from candidate_human_decisions d
    where d.candidate_id = p_candidate_id and d.kind = 'contact' and d.value = 'do_not_contact' and d.revoked_at is null
  ) then
    reasons := array_append(reasons, 'do_not_contact'); can_match := false; contact := 'no';
  end if;

  -- who they are (profession is not intent; a human filing is)
  if c.availability_status = 'not_qualified' then
    reasons := array_append(reasons, 'filed_not_a_candidate'); can_match := false;
    if contact = 'yes' then contact := 'needs_review'; end if;
  elsif c.person_type is not null and c.person_type <> 'job_seeker' then
    reasons := array_append(reasons, 'job_seeking_intent_unconfirmed'); can_match := false;
    if contact = 'yes' then contact := 'needs_review'; end if;
  end if;

  -- journey (human decisions win; legacy stages are preserved but labelled)
  if c.journey_stage = 'not_fit' then
    if c.journey_stage_source in ('desk', 'human') then reasons := array_append(reasons, 'human_not_fit');
    else reasons := array_append(reasons, 'legacy_not_fit_unverified'); end if;
    can_match := false;
  elsif c.journey_stage = 'post_committee_not_fit' then
    reasons := array_append(reasons, 'human_not_fit_after_call'); can_match := false;
  elsif c.journey_stage = 'placed' then
    reasons := array_append(reasons, 'placed'); can_match := false;
  elsif c.journey_stage = 'dormant' then
    reasons := array_append(reasons, 'dormant_lost_touch'); can_match := false;
    if contact = 'yes' then contact := 'needs_review'; end if;
  end if;

  -- temporary
  if c.availability_status = 'off_market' then
    reasons := array_append(reasons, 'temporarily_off_market'); can_match := false;
    if contact = 'yes' then contact := 'needs_review'; end if;
  end if;

  -- unknowns (never adverse on their own; they gate client readiness)
  if c.consent_told_candidate is null then
    reasons := array_append(reasons, 'candidate_consent_unknown');
  elsif c.consent_told_candidate = false then
    reasons := array_append(reasons, 'candidate_not_told');
  end if;

  -- role-specific (only for the job asked about; never global)
  if p_job_id is not null and (
       exists (select 1 from role_submissions s where s.candidate_id = p_candidate_id and s.job_id = p_job_id and s.status = 'declined')
    or exists (select 1 from job_candidate_pipeline p where p.candidate_id = p_candidate_id and p.job_id = p_job_id and p.stage = 'rejected')
    or exists (select 1 from job_candidate_pipeline p join pipeline_internal_state i on i.pipeline_id = p.id
               where p.candidate_id = p_candidate_id and p.job_id = p_job_id and i.internal_stage in ('hm_passed'))
  ) then
    reasons := array_append(reasons, 'rejected_for_this_role'); can_match := false;
  end if;

  -- human overrides, applied last, oldest first
  for o in
    select effect from candidate_eligibility_overrides v
    where v.candidate_id = p_candidate_id
      and v.revoked_at is null
      and (v.expires_at is null or v.expires_at > now())
      and (v.scope = 'global' or (v.scope = 'job' and v.job_id = p_job_id))
    order by v.created_at
  loop
    if o.effect = 'allow_match' and can_assess then can_match := true; reasons := array_append(reasons, 'human_override_allow_match');
    elsif o.effect = 'block_match' then can_match := false; reasons := array_append(reasons, 'human_override_block_match');
    elsif o.effect = 'block_contact' then contact := 'no'; can_match := false; reasons := array_append(reasons, 'human_override_block_contact');
    elsif o.effect = 'allow_contact' and can_assess then contact := 'yes'; reasons := array_append(reasons, 'human_override_allow_contact');
    end if;
  end loop;

  if can_match and c.journey_stage is distinct from 'warm' then
    reasons := array_append(reasons, 'not_met_yet');
  end if;

  intro := can_match and contact = 'yes' and c.journey_stage = 'warm'
           and coalesce(c.availability_status, 'active') in ('active', 'not_yet_talked')
           and c.consent_told_candidate = true;

  return jsonb_build_object(
    'policy_version', 'eligibility-v1',
    'found', true,
    'can_assess', can_assess,
    'can_match', can_match,
    'can_contact', contact,
    'client_intro_ready', intro,
    'reasons', to_jsonb(reasons));
end;
$$;

revoke execute on function public.candidate_eligibility(uuid, uuid) from public, anon, authenticated;
grant execute on function public.candidate_eligibility(uuid, uuid) to service_role;

-- ── 4. The matching function, one implementation, no ambiguous overload ────

-- The plain overload: its only caller was already failing with 42725.
drop function if exists public.match_jobs_for_candidate(uuid, double precision, integer);

create or replace function public.match_jobs_for_candidate_v2(
  p_candidate_id uuid,
  p_similarity_threshold double precision,
  p_max_results integer,
  p_max_per_company integer
)
returns table(job_id uuid, title text, company_name text, location text, similarity double precision, retrieval_route text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_emb  vector(1536);
  v_fn   text;
  v_pool integer := greatest(coalesce(p_max_results, 100) * 6, 600);
begin
  -- Policy first: an excluded person gets no proposals from any caller.
  if not coalesce((public.candidate_eligibility(p_candidate_id)->>'can_match')::boolean, false) then
    return;
  end if;

  select c.embedding, public.detect_candidate_function(c.id)
    into v_emb, v_fn
  from candidates c
  where c.id = p_candidate_id and c.embedding is not null;

  if v_emb is null then
    return;
  end if;

  -- pgvector caps hnsw.ef_search at 1000; the production 4-argument version
  -- passed the raw pool size and failed for max_results above 166.
  perform set_config('hnsw.ef_search', least(1000, greatest(40, v_pool))::text, true);

  return query
  with pool as (
    select j.id, j.title, j.company_name, j.location,
           j.embedding <=> v_emb as dist
    from jobs j
    where j.embedding is not null
      and j.status = 'open'
    order by j.embedding <=> v_emb
    limit v_pool
  ),
  ranked as (
    select p.id, p.title, p.company_name, p.location,
           1 - p.dist as sim,
           row_number() over (partition by p.company_name order by p.dist asc, p.id asc) as company_rank
    from pool p
    where 1 - p.dist >= coalesce(p_similarity_threshold, 0.60)
      and not (v_fn = 'engineering' and
        lower(p.title) ~ 'recruit|talent acquisition|chief of staff|^marketing|growth marketing|brand designer|brand manager|brand director|brand strategist|head of marketing|sr field marketing|sr\. field marketing|account exec|^ae | ae |sales (manager|leader|director|lead)|business development|^bd |^sdr|bdr|customer success|head of cs |strategic customer success|^finance|financial controller|^accounting|controller|^cfo$|head of finance|head of legal|operations manager|head of people|people operations|chief marketing|^cmo| cmo$|^designer|head of design|product design|brand design|graphic design'
        and lower(p.title) !~ 'engineer|developer|architect|swe|infra|backend|frontend|fullstack|platform|sre|data scientist|machine learning|ml ')
      and not (v_fn = 'sales' and
        lower(p.title) ~ 'software engineer|backend engineer|frontend engineer|fullstack|infrastructure engineer|sre |platform engineer|swe |data scientist|machine learning engineer|^architect|product manager|head of product|^designer|brand designer')
  )
  select r.id, r.title, r.company_name, r.location, r.sim, 'embedding'::text
  from ranked r
  where r.company_rank <= coalesce(p_max_per_company, 2)
  order by r.sim desc, r.id asc
  limit coalesce(p_max_results, 100);
end;
$$;

comment on function public.match_jobs_for_candidate_v2(uuid, double precision, integer, integer) is
  'Canonical candidate-to-job retrieval. All four arguments explicit. Returns nothing for a candidate the eligibility policy excludes. Stable ordering: similarity desc, id asc.';

-- The surviving legacy signature delegates, so the 3-argument call works and
-- there is exactly one implementation.
create or replace function public.match_jobs_for_candidate(
  candidate_uuid uuid,
  similarity_threshold double precision default 0.60,
  max_results integer default 100,
  max_per_company integer default 2
)
returns table(job_id uuid, title text, company_name text, location text, similarity double precision)
language sql
stable
security definer
set search_path to 'public'
as $$
  select v.job_id, v.title, v.company_name, v.location, v.similarity
  from public.match_jobs_for_candidate_v2(candidate_uuid, similarity_threshold, max_results, max_per_company) v;
$$;

comment on function public.match_jobs_for_candidate(uuid, double precision, integer, integer) is
  'Deprecated 2026-09-09: compatibility wrapper over match_jobs_for_candidate_v2. Kept so the 3-argument legacy call resolves; migrate callers to v2.';

revoke execute on function public.match_jobs_for_candidate_v2(uuid, double precision, integer, integer) from public, anon, authenticated;
grant execute on function public.match_jobs_for_candidate_v2(uuid, double precision, integer, integer) to service_role;
revoke execute on function public.match_jobs_for_candidate(uuid, double precision, integer, integer) from public, anon, authenticated;
grant execute on function public.match_jobs_for_candidate(uuid, double precision, integer, integer) to service_role;

-- The nightly delta matcher: same guard, otherwise unchanged. Its body is the
-- production definition of 2026-09-09 with the policy check prepended.
create or replace function public.match_new_jobs_for_candidate(
  candidate_uuid uuid,
  since_timestamp timestamp with time zone,
  similarity_threshold double precision default 0.60,
  max_per_company integer default 2
)
returns table(job_id uuid, title text, company_name text, location text, similarity double precision, match_score numeric, job_function text, fn_affinity numeric, sen_fit numeric)
language plpgsql
stable
as $$
declare
  v_emb          vector(1536);
  v_fn           text;
  v_title        text;
  v_stages       text[];
  v_locations    text[];
  v_salary_min   integer;
begin
  if not coalesce((public.candidate_eligibility(candidate_uuid)->>'can_match')::boolean, false) then
    return;
  end if;

  select c.embedding,
         public.detect_candidate_function(c.id),
         coalesce(c.parsed_data->'work_history'->0->>'title', ''),
         c.allowed_stages,
         c.allowed_locations,
         c.salary_expectation_min
    into v_emb, v_fn, v_title, v_stages, v_locations, v_salary_min
  from candidates c
  where c.id = candidate_uuid and c.embedding is not null;

  if v_emb is null then
    return;
  end if;

  return query
  with pool as (
    select j.id, j.title, j.company_name, j.location, j.department,
           j.company_id, j.remote_policy, j.salary_max,
           1 - (j.embedding <=> v_emb) as sim
    from jobs j
    where j.embedding is not null
      and j.status = 'open'
      and j.created_at >= since_timestamp
    order by j.embedding <=> v_emb
    limit 600
  ),
  scored as (
    select p.*,
           public.detect_job_function(p.title, p.department) as job_fn,
           public.function_affinity(v_fn, public.detect_job_function(p.title, p.department)) as fn_aff,
           public.seniority_fit(v_title, p.title) as sen,
           least(1.0, greatest(0.0, (p.sim - 0.45) / 0.30))::numeric as sim_norm
    from pool p
  ),
  gated as (
    select s.id, s.title, s.company_name, s.location, s.sim, s.job_fn, s.fn_aff, s.sen,
           round(0.60 * s.sim_norm + 0.25 * s.fn_aff + 0.15 * s.sen, 3) as score,
           row_number() over (
             partition by s.company_name
             order by (0.60 * s.sim_norm + 0.25 * s.fn_aff + 0.15 * s.sen) desc
           ) as company_rank
    from scored s
    join companies co on co.id = s.company_id
    where s.sim >= similarity_threshold
      and s.fn_aff >= 0.3
      and coalesce(co.do_not_contact, false) = false
      and (v_stages is null or co.stage is null or co.stage = any(v_stages))
      and (
        v_locations is null
        or s.remote_policy = 'remote'
        or exists (
          select 1 from unnest(v_locations) loc
          where (loc = 'new-york' and (s.location ilike '%new york%' or s.location ilike '%NYC%' or s.location ilike '%, NY%'))
             or (loc = 'san-francisco' and s.location ilike '%san francisco%')
             or (loc in ('bay-area','south-bay') and (s.location ilike '%san francisco%' or s.location ilike '%bay area%' or s.location ilike '%palo alto%' or s.location ilike '%san mateo%' or s.location ilike '%menlo%' or s.location ilike '%mountain view%' or s.location ilike '%santa clara%' or s.location ilike '%san jose%' or s.location ilike '%sunnyvale%'))
             or (loc = 'sunnyvale' and s.location ilike '%sunnyvale%')
             or (loc = 'menlo-park' and s.location ilike '%menlo%')
             or (loc = 'los-angeles' and (s.location ilike '%los angeles%' or s.location ilike '%, LA%'))
             or (loc in ('remote-us','remote-east-coast','remote-west-coast') and s.remote_policy = 'remote')
        )
      )
      and (
        v_salary_min is null
        or s.salary_max is null
        or s.salary_max >= v_salary_min * 0.9
      )
  )
  select g.id, g.title, g.company_name, g.location, g.sim, g.score, g.job_fn, g.fn_aff, g.sen
  from gated g
  where g.company_rank <= max_per_company
  order by g.score desc;
end;
$$;

-- ── 5. Bench retrieval without the grade gate ──────────────────────────────
-- Two routes fused by reciprocal rank (k = 60): embedding similarity and a
-- lexical match of the seat's title and musts against the CV text. The
-- exclusion list is applied before the limit, so a seat that has already seen
-- forty people is shown the forty-first. Ordering is stable.

create or replace function public.bench_candidates_for_job_v2(
  p_job_id uuid,
  p_limit integer,
  p_exclude uuid[] default '{}'::uuid[]
)
returns table(
  candidate_id uuid,
  name text,
  panel_grade text,
  journey_stage text,
  owner_user_id uuid,
  similarity double precision,
  lexical_rank integer,
  embedding_rank integer,
  retrieval_routes text[],
  fused_score double precision
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with j as (
    select jb.embedding,
           plainto_tsquery('english', coalesce(jb.title, '') || ' ' || coalesce(array_to_string(pr.hard_requirements, ' '), '')) as q
    from jobs jb
    left join partner_roles pr on pr.job_id = jb.id
    where jb.id = p_job_id
  ),
  elig as (
    select c.id, c.name, c.panel_grade, c.journey_stage, c.owner_user_id, c.embedding,
           to_tsvector('english', left(coalesce(c.parsed_data->>'raw_text', '') || ' ' || coalesce(array_to_string(c.skills, ' '), '') || ' ' || coalesce(c.parsed_data->>'summary', ''), 20000)) as doc
    from candidates c
    where not (c.id = any(coalesce(p_exclude, '{}'::uuid[])))
      and coalesce((public.candidate_eligibility(c.id, p_job_id)->>'can_match')::boolean, false)
  ),
  emb as (
    select e.id, 1 - (e.embedding <=> j.embedding) as sim,
           row_number() over (order by e.embedding <=> j.embedding asc, e.id asc) as rk
    from elig e, j
    where e.embedding is not null and j.embedding is not null
  ),
  lex as (
    select e.id, ts_rank_cd(e.doc, j.q) as score,
           row_number() over (order by ts_rank_cd(e.doc, j.q) desc, e.id asc) as rk
    from elig e, j
    where j.q is not null and numnode(j.q) > 0 and e.doc @@ j.q
  ),
  fused as (
    select e.id,
           emb.sim,
           lex.rk as lexical_rank,
           emb.rk as embedding_rank,
           array_remove(array[case when emb.id is not null then 'embedding' end, case when lex.id is not null then 'lexical' end], null) as routes,
           coalesce(1.0 / (60 + emb.rk), 0) + coalesce(1.0 / (60 + lex.rk), 0) as fused
    from elig e
    left join emb on emb.id = e.id
    left join lex on lex.id = e.id
    where emb.id is not null or lex.id is not null
  )
  select e.id, e.name, e.panel_grade, e.journey_stage, e.owner_user_id,
         f.sim, f.lexical_rank::integer, f.embedding_rank::integer, f.routes, f.fused
  from fused f
  join elig e on e.id = f.id
  order by f.fused desc, f.sim desc nulls last, e.id asc
  limit p_limit;
$$;

revoke execute on function public.bench_candidates_for_job_v2(uuid, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.bench_candidates_for_job_v2(uuid, integer, uuid[]) to service_role;

comment on function public.bench_candidates_for_job(uuid, integer) is
  'Deprecated 2026-09-09: grade-gated retrieval. Use bench_candidates_for_job_v2. Kept while lib/desk/bench.ts runs v2 in shadow.';

-- ── 6. Execution-time guard on machine proposals ───────────────────────────
-- Retrieval checks the policy; so does the insert, because the person can
-- change between the two, and because callers outside this repo (the nightly
-- Python matcher) do not read the policy.

create or replace function public.pipeline_guard_eligibility_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  e jsonb;
begin
  if new.stage = 'auto_matched' then
    e := public.candidate_eligibility(new.candidate_id, new.job_id);
    if not coalesce((e->>'can_match')::boolean, false) then
      raise exception 'candidate_excluded: %', array_to_string(array(select jsonb_array_elements_text(e->'reasons')), ', ')
        using errcode = 'P0001', hint = 'eligibility-v1 blocks machine proposals for this person. A human override goes in candidate_eligibility_overrides.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pipeline_guard_eligibility on public.job_candidate_pipeline;
create trigger pipeline_guard_eligibility
  before insert on public.job_candidate_pipeline
  for each row execute function public.pipeline_guard_eligibility_trg();

-- ── 7. Verification (run after applying) ───────────────────────────────────
-- select count(*) from pg_proc where proname = 'match_jobs_for_candidate';                                  -- 1
-- explain select * from public.match_jobs_for_candidate('c1f61eea-c370-4f59-8f40-be2933ef6ece'::uuid, 0.55::double precision, 300::integer);  -- plans
-- select public.candidate_eligibility('3fbd8c77-bc14-44a8-9bed-c678d8122399');
-- select count(*) from public.bench_candidates_for_job_v2('<live job id>', 40, '{}');
