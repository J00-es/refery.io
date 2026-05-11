-- Aggregations for jobs list (admins) and companies list pages.
-- All objects use security_invoker so RLS applies for non-service-role callers.

-- 1) Global per-job pipeline stage counts (used by admins on jobs list)
create or replace view public.job_pipeline_stats
with (security_invoker = true)
as
select
  job_id,
  count(*) filter (where stage = 'sourced')   as sourced,
  count(*) filter (where stage = 'screening') as screening,
  count(*) filter (where stage = 'interview') as interview,
  count(*) filter (where stage = 'offer')     as offer,
  count(*) filter (where stage = 'hired')     as hired,
  count(*)                                    as total
from public.job_candidate_pipeline
group by job_id;

grant select on public.job_pipeline_stats to anon, authenticated, service_role;

-- 2) Per-user pipeline stats (non-admins): counts only pipeline rows whose
-- candidate is owned by the given user, matching the existing JS filter.
create or replace function public.user_job_pipeline_stats(uid uuid)
returns table (
  job_id    uuid,
  sourced   bigint,
  screening bigint,
  interview bigint,
  "offer"   bigint,
  hired     bigint,
  total     bigint
)
language sql
stable
security invoker
as $$
  select
    p.job_id,
    count(*) filter (where p.stage = 'sourced')   as sourced,
    count(*) filter (where p.stage = 'screening') as screening,
    count(*) filter (where p.stage = 'interview') as interview,
    count(*) filter (where p.stage = 'offer')     as "offer",
    count(*) filter (where p.stage = 'hired')     as hired,
    count(*)                                       as total
  from public.job_candidate_pipeline p
  join public.candidates c on c.id = p.candidate_id
  where c.owner_user_id = uid
  group by p.job_id;
$$;

grant execute on function public.user_job_pipeline_stats(uuid) to anon, authenticated, service_role;

-- 3) Active job counts per company (used by companies list page).
-- Keyed by lower(company_name) to match the existing JS Map semantics; the
-- preserved company_name column gives a representative original-cased name.
create or replace view public.company_active_job_counts
with (security_invoker = true)
as
select
  lower(company_name)  as company_name_lower,
  min(company_name)    as company_name,
  count(*)             as job_count
from public.jobs
where status in ('open', 'active')
  and company_name is not null
group by lower(company_name);

grant select on public.company_active_job_counts to anon, authenticated, service_role;
