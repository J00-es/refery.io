-- ============================================================================
-- 2026-08-02 — two production defects
--
-- 1. Approved partners were shown "Your application is being reviewed".
--    Supabase Auth stores auth.users.email lower-cased; users_admin.email was
--    stored as typed on the sign-up form. Three active partners had a
--    mixed-case users_admin row, so every `.eq('email', user.email)` lookup
--    missed, the row read back as NULL, and the app defaulted the account to
--    `pending` and bounced them to /auth/pending-approval.
--
-- 2. Every authenticated user could read (and update, and delete) every
--    candidate. `candidates` carried both an owner-scoped policy AND a blanket
--    `USING (true)` policy for the `authenticated` role. Postgres OR-s
--    permissive policies, so the blanket one won and the owner scope was dead
--    code. Same shape on job_candidate_pipeline and pipeline_stage_history.
-- ============================================================================

-- ── 1. Email identity ────────────────────────────────────────────────────────

update users_admin
set email = lower(btrim(email))
where email is distinct from lower(btrim(email));

create or replace function public.normalize_users_admin_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

drop trigger if exists users_admin_normalize_email on public.users_admin;
create trigger users_admin_normalize_email
  before insert or update of email on public.users_admin
  for each row execute function public.normalize_users_admin_email();

-- ── 2. Authorization helpers ────────────────────────────────────────────────
-- SECURITY DEFINER on purpose: a policy subquery runs as the *querying* user,
-- so reading users_admin from inside a users_admin policy recurses, and reading
-- it from any other policy returns nothing. These run as the owner instead.

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from users_admin
    where user_id = auth.uid()
      and role in ('super_admin', 'admin')
      and coalesce(status, 'pending') = 'active'
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from users_admin
    where user_id = auth.uid()
      and coalesce(status, 'pending') = 'active'
  );
$$;

-- A candidate is yours if you own it, uploaded it, or created it.
create or replace function public.can_access_candidate(cand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin() or exists (
    select 1 from candidates c
    where c.id = cand_id
      and auth.uid() in (c.owner_user_id, c.uploaded_by_user_id, c.user_id)
  );
$$;

revoke all on function public.is_app_admin() from public;
revoke all on function public.is_active_user() from public;
revoke all on function public.can_access_candidate(uuid) from public;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.can_access_candidate(uuid) to authenticated;

-- ── 3. users_admin — policies were keyed on the wrong column ────────────────
-- `ua.id` is the table PK; the auth id lives in `ua.user_id`. Comparing
-- id = auth.uid() never matched, so nobody could read even their own row.

drop policy if exists super_admins_can_manage_users on public.users_admin;
drop policy if exists admins_can_read_all_users on public.users_admin;
drop policy if exists users_can_read_own_record on public.users_admin;

create policy users_admin_select on public.users_admin
  for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

create policy users_admin_admin_write on public.users_admin
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- ── 4. candidates — drop the blanket policies, keep the owner scope ─────────

drop policy if exists authenticated_read_candidates on public.candidates;
drop policy if exists authenticated_insert_candidates on public.candidates;
drop policy if exists authenticated_update_candidates on public.candidates;
drop policy if exists authenticated_delete_candidates on public.candidates;

drop policy if exists candidates_select_policy on public.candidates;
drop policy if exists candidates_insert_policy on public.candidates;
drop policy if exists candidates_update_policy on public.candidates;
drop policy if exists candidates_delete_policy on public.candidates;

create policy candidates_select_policy on public.candidates
  for select to authenticated
  using (
    public.is_app_admin()
    or auth.uid() in (owner_user_id, uploaded_by_user_id, user_id)
  );

create policy candidates_insert_policy on public.candidates
  for insert to authenticated
  with check (
    public.is_app_admin()
    or (public.is_active_user() and auth.uid() in (owner_user_id, uploaded_by_user_id, user_id))
  );

create policy candidates_update_policy on public.candidates
  for update to authenticated
  using (
    public.is_app_admin()
    or auth.uid() in (owner_user_id, uploaded_by_user_id, user_id)
  )
  with check (
    public.is_app_admin()
    or auth.uid() in (owner_user_id, uploaded_by_user_id, user_id)
  );

create policy candidates_delete_policy on public.candidates
  for delete to authenticated
  using (
    public.is_app_admin()
    or auth.uid() in (owner_user_id, uploaded_by_user_id, user_id)
  );

-- ── 5. job_candidate_pipeline ───────────────────────────────────────────────
-- Pipeline rows are created by the matching automation and owned by the
-- automation account, so ownership has to be read through the candidate as
-- well as off the row itself.

drop policy if exists authenticated_all_job_candidate_pipeline on public.job_candidate_pipeline;

create policy jcp_select on public.job_candidate_pipeline
  for select to authenticated
  using (
    public.is_app_admin()
    or auth.uid() in (owner_user_id, added_by_user_id)
    or public.can_access_candidate(candidate_id)
  );

create policy jcp_write on public.job_candidate_pipeline
  for all to authenticated
  using (
    public.is_app_admin()
    or auth.uid() in (owner_user_id, added_by_user_id)
    or public.can_access_candidate(candidate_id)
  )
  with check (
    public.is_app_admin()
    or (public.is_active_user() and public.can_access_candidate(candidate_id))
  );

-- ── 6. Candidate-adjacent history and notes ─────────────────────────────────

drop policy if exists authenticated_all_pipeline_stage_history on public.pipeline_stage_history;

create policy psh_select on public.pipeline_stage_history
  for select to authenticated
  using (public.can_access_candidate(candidate_id));

create policy psh_insert on public.pipeline_stage_history
  for insert to authenticated
  with check (public.can_access_candidate(candidate_id));

drop policy if exists authenticated_all_job_candidate_notes on public.job_candidate_notes;

create policy jcn_all on public.job_candidate_notes
  for all to authenticated
  using (
    public.is_app_admin()
    or exists (
      select 1 from job_candidate_pipeline p
      where p.id = job_candidate_notes.job_candidate_pipeline_id
        and (auth.uid() in (p.owner_user_id, p.added_by_user_id)
             or public.can_access_candidate(p.candidate_id))
    )
  )
  with check (
    public.is_app_admin()
    or exists (
      select 1 from job_candidate_pipeline p
      where p.id = job_candidate_notes.job_candidate_pipeline_id
        and (auth.uid() in (p.owner_user_id, p.added_by_user_id)
             or public.can_access_candidate(p.candidate_id))
    )
  );

drop policy if exists "Recruiters and admins can read notes" on public.recruiter_notes;
drop policy if exists "Recruiters can create notes" on public.recruiter_notes;

create policy recruiter_notes_select on public.recruiter_notes
  for select to authenticated
  using (public.can_access_candidate(candidate_id));

create policy recruiter_notes_insert on public.recruiter_notes
  for insert to authenticated
  with check (auth.uid() = user_id and public.can_access_candidate(candidate_id));

drop policy if exists "Users can view candidate activity" on public.candidate_activity_log;
drop policy if exists "Users can insert candidate activity" on public.candidate_activity_log;

create policy candidate_activity_select on public.candidate_activity_log
  for select to authenticated
  using (public.can_access_candidate(candidate_id));

create policy candidate_activity_insert on public.candidate_activity_log
  for insert to authenticated
  with check (public.can_access_candidate(candidate_id));
