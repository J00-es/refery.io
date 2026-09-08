-- Applied to prod on 2026-09-08 as three migrations (protect_desk_jobs_from_cleaning_sweep,
-- protect_desk_jobs_from_automation, desk_jobs_immune_to_cleaning_sweep). This file is the
-- final state.
--
-- Why: the nightly cleaning sweep (public.run_cleaning_sweep, called by refery-automation's
-- nightly_run.py with the service-role key) drafts any job touched in the last three days
-- that looks junior, pays under $150K ($200K for engineering), sits outside the US, or is
-- off-category, and deletes newer duplicate titles per company. Those rules are for the
-- 70k ingested rows. On 2026-09-08 they drafted Livo's two euro-band searches (€60K and
-- €70K read as sub-$150K); earlier they drafted three Augustus searches, and the weekly
-- ingester closed Hilbert's field GTM seat because it is not on their board.
--
-- Rule: a job with a live partner_roles row is one of Lily's mandates. It keeps its status
-- against any update that would draft or close it, and it is never deleted while a
-- partner_roles row points at it (the FKs from partner_roles, search_assignments and
-- role_submissions all cascade on delete). To close such a job on purpose, switch the
-- search off the desk first (partner_roles.is_live = false).
--
-- The sweep's reported counts still include the reverted rows, so the nightly digest can
-- say "2 low-salary" for jobs that stayed open.

create or replace function public.keep_desk_jobs_open()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'open' and new.status in ('draft', 'closed')
     and exists (select 1 from public.partner_roles pr where pr.job_id = new.id and pr.is_live) then
    new.status := 'open';
  end if;
  return new;
end;
$$;

drop trigger if exists keep_desk_jobs_open on public.jobs;
create trigger keep_desk_jobs_open
  before update of status on public.jobs
  for each row
  execute function public.keep_desk_jobs_open();

create or replace function public.keep_desk_jobs()
returns trigger
language plpgsql
as $$
begin
  -- Returning null skips the delete for this row and lets the statement go on.
  if exists (select 1 from public.partner_roles pr where pr.job_id = old.id) then
    return null;
  end if;
  return old;
end;
$$;

drop trigger if exists keep_desk_jobs on public.jobs;
create trigger keep_desk_jobs
  before delete on public.jobs
  for each row
  execute function public.keep_desk_jobs();
