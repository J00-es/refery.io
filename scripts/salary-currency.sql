-- Salary currency on jobs, so Barcelona and London mandates stop rendering in
-- dollars on the desk. Unset means USD, which is what every ingested row is.
alter table public.jobs
  add column if not exists salary_currency text not null default 'USD'
  check (salary_currency in ('USD', 'EUR', 'GBP'));

create or replace view public.partner_roles_v as
SELECT pr.job_id, pr.company_id, pr.is_live, pr.priority, pr.headline, pr.context,
    pr.fee_percentage, pr.fee_flat, pr.scout_payout, pr.scout_share, pr.payout_note,
    pr.exclusivity, pr.submission_cap, pr.target_start, pr.added_at, pr.updated_at,
    j.title, j.department, j.location, j.remote_policy, j.status AS job_status,
    j.salary_min, j.salary_max, j.visa_requirement, j.job_post_url, j.description,
    j.requirements, j.skills_required, j.experience_years_min, j.experience_years_max,
    j.hiring_manager_name, j.referral_bonus, j.referral_bonus_type,
    j.created_at AS job_created_at,
    job_seniority(j.title) AS seniority,
    job_location_buckets(j.location) AS location_buckets,
    c.name AS company_name, c.logo_url AS company_logo_url, c.stage AS company_stage,
    b.id AS brief_id, b.status AS brief_status,
    COALESCE(s.total, 0) AS submission_count,
    COALESCE(s.live, 0) AS live_submission_count,
    COALESCE(s.submitter_ids, '{}'::uuid[]) AS submitter_ids,
    COALESCE(s.candidate_ids, '{}'::uuid[]) AS submitted_candidate_ids,
    pr.hard_requirements, pr.intake_notes, pr.not_for, pr.interview_steps, pr.decision_days,
    CASE
        WHEN COALESCE(s.placed, 0) > 0 THEN 'filled'::text
        WHEN NOT pr.is_live OR j.status <> 'open'::text THEN 'closed'::text
        WHEN COALESCE(s.offers, 0) > 0 THEN 'offer_out'::text
        WHEN COALESCE(s.with_client, 0) > 0 THEN 'client_interviewing'::text
        WHEN COALESCE(s.shortlisted, 0) > 0 THEN 'shortlisting'::text
        ELSE 'sourcing'::text
    END AS search_stage,
    COALESCE(s.moved_at, pr.updated_at, pr.added_at) AS stage_moved_at,
    j.salary_currency
   FROM partner_roles pr
     JOIN jobs j ON j.id = pr.job_id
     LEFT JOIN companies c ON c.id = pr.company_id
     LEFT JOIN partner_briefs b ON b.job_id = pr.job_id
     LEFT JOIN ( SELECT role_submissions.job_id,
            count(*)::integer AS total,
            count(*) FILTER (WHERE role_submissions.status <> ALL (ARRAY['declined'::text, 'withdrawn'::text]))::integer AS live,
            count(*) FILTER (WHERE role_submissions.status = 'placed'::text)::integer AS placed,
            count(*) FILTER (WHERE role_submissions.status = 'offer'::text)::integer AS offers,
            count(*) FILTER (WHERE role_submissions.status = ANY (ARRAY['sent_to_client'::text, 'client_interview'::text]))::integer AS with_client,
            count(*) FILTER (WHERE role_submissions.status = 'shortlisted'::text)::integer AS shortlisted,
            max(role_submissions.updated_at) FILTER (WHERE role_submissions.status <> 'withdrawn'::text) AS moved_at,
            array_agg(DISTINCT role_submissions.submitted_by_user_id) AS submitter_ids,
            array_agg(DISTINCT role_submissions.candidate_id) AS candidate_ids
           FROM role_submissions
          GROUP BY role_submissions.job_id) s ON s.job_id = pr.job_id;
