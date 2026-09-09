-- ============================================================================
-- 2026-09-09 engine release 1, part 1: access hardening
--
-- Findings 16 in Refery-core-engine-audit.md, verified against production on
-- 2026-09-09 before this file was written:
--
--   * public.bench_candidates_for_job(uuid, integer) is SECURITY DEFINER,
--     executable by anon and authenticated, has no caller check, and returns
--     candidate names, grades, journey stages and owner ids. Its only caller
--     is lib/desk/bench.ts through the service-role client.
--   * public.tmp_investors and public.deletion_log have RLS disabled and
--     anon SELECT. deletion_log is the erasure suppression list (email hashes);
--     its only readers are lib/retention.ts through the service-role client.
--   * A further 21 SECURITY DEFINER functions are anon-executable with no
--     caller check. Every one of them either mutates jobs/companies in bulk,
--     spends money (enqueue_candidate_panel queues a paid model call,
--     desk_cron_post fires any cron with the vault secret) or leaks prospect
--     data. None is called from browser code (grep of app/, lib/, components/,
--     hooks/ and C:/scripts on 2026-09-09: all callers use the service role).
--
-- Left alone on purpose, because they are legitimately public or are the RLS
-- helpers the policies themselves call: submit_hiring_lead,
-- submit_scout_application, can_access_candidate, can_view_all_candidates,
-- is_active_user, is_app_admin, get_user_role, candidate_pulse,
-- refery_client_dashboard, refery_partner_health, newsletter_dashboard_*
-- (the last five carry their own shared-secret argument).
--
-- Rollback: grant execute ... to anon, authenticated; alter table ... disable
-- row level security; grant select ... to anon, authenticated.
-- ============================================================================

-- ── 1. Candidate retrieval is server-only ───────────────────────────────────

revoke execute on function public.bench_candidates_for_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.bench_candidates_for_job(uuid, integer) to service_role;

-- ── 2. Other privileged functions with no caller check ─────────────────────

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.batch_update_job_status(uuid[], text)',
    'public.bulk_insert_companies(jsonb)',
    'public.bulk_insert_founders(jsonb)',
    'public.bulk_insert_jobs_phase2(jsonb)',
    'public.clean_jobs_step1_junior()',
    'public.clean_jobs_step2_salary()',
    'public.clean_jobs_step3_eng_salary()',
    'public.clean_jobs_step4_non_us()',
    'public.clean_jobs_step5_off_category()',
    'public.clean_jobs_step6_duplicates()',
    'public.clean_jobs_step7_delete_closed()',
    'public.desk_cron_post(text, integer)',
    'public.enqueue_candidate_panel(uuid, text)',
    'public.get_company_jobs(uuid)',
    'public.get_prospects_needing_email()',
    'public.insert_job_generic(jsonb)',
    'public.insert_scale_ai_job(jsonb)',
    'public.backfill_set_ats(uuid, text, text, text, text)',
    'public.mark_company_ingested(uuid, text)',
    'public.update_ats_detection(jsonb)',
    'public.linkedin_connections_bulk_upsert(jsonb)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ── 3. Tables with RLS off and anon SELECT ──────────────────────────────────

-- No policies on purpose: both are read and written only by server code with
-- the service role, which bypasses RLS. The advisor will report
-- "RLS enabled, no policy" at INFO level; that is the intended state.
alter table public.tmp_investors enable row level security;
alter table public.deletion_log  enable row level security;
revoke all on table public.tmp_investors from public, anon, authenticated;
revoke all on table public.deletion_log  from public, anon, authenticated;

-- ── 4. Verification (run after applying) ───────────────────────────────────
-- select has_function_privilege('anon','public.bench_candidates_for_job(uuid,integer)','EXECUTE');            -- false
-- select has_function_privilege('service_role','public.bench_candidates_for_job(uuid,integer)','EXECUTE');    -- true
-- select relname, relrowsecurity from pg_class where relname in ('tmp_investors','deletion_log');              -- true, true
-- set local role anon; select * from public.bench_candidates_for_job('00000000-0000-0000-0000-000000000000', 1); -- permission denied
