-- Short, readable slugs for the URLs people actually see.
--
--   /searches/<company slug>/roles/<role slug>   e.g. /searches/k7m2qxf/roles/applied-ai-engineer-7kq3
--   /candidates/<candidate slug>                  e.g. /candidates/frznf6z
--
-- Company and candidate slugs are random on purpose: a partner who is not on
-- a search sees the client anonymised, and a candidate's name never belongs in
-- a URL. The role slug carries the title, which the anonymised card shows anyway.
-- Slugs are minted by the database so every insert path gets one; UUID URLs
-- keep working through a redirect in the app.

create or replace function public.short_slug(len int default 7)
returns text language plpgsql volatile as $$
declare
  alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz'; -- no 0/o/1/l/i, same as brief links
  result text := '';
  i int;
begin
  for i in 1..len loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end $$;

create or replace function public.slugify(txt text)
returns text language sql immutable as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(txt, '')), '[^a-z0-9]+', '-', 'g')), ''), 'role')
$$;

-- candidates
alter table public.candidates add column if not exists slug text not null default public.short_slug(7);
create unique index if not exists candidates_slug_key on public.candidates (slug);

-- desk clients
alter table public.client_companies add column if not exists slug text not null default public.short_slug(7);
create unique index if not exists client_companies_slug_key on public.client_companies (slug);

-- desk roles: <title>-<4 chars>, minted from the job title on insert
alter table public.partner_roles add column if not exists slug text;

create or replace function public.partner_roles_set_slug()
returns trigger language plpgsql as $$
declare
  base text;
  attempt text;
  n int := 0;
begin
  if new.slug is not null and new.slug <> '' then return new; end if;
  select public.slugify(j.title) into base from public.jobs j where j.id = new.job_id;
  base := coalesce(base, 'role');
  -- cut long titles at a word boundary, never mid-word
  if length(base) > 40 then base := regexp_replace(left(base, 41), '-[^-]*$', ''); end if;
  base := trim(both '-' from left(base, 40));
  loop
    attempt := base || '-' || public.short_slug(4);
    exit when not exists (select 1 from public.partner_roles where slug = attempt);
    n := n + 1;
    if n > 20 then attempt := base || '-' || public.short_slug(7); exit; end if;
  end loop;
  new.slug := attempt;
  return new;
end $$;

drop trigger if exists partner_roles_set_slug on public.partner_roles;
create trigger partner_roles_set_slug before insert on public.partner_roles
  for each row execute function public.partner_roles_set_slug();

-- backfill existing roles one by one so the collision check sees each new slug
do $$
declare r record; base text; attempt text;
begin
  for r in select pr.job_id, j.title from public.partner_roles pr join public.jobs j on j.id = pr.job_id where pr.slug is null loop
    base := public.slugify(r.title);
    if length(base) > 40 then base := regexp_replace(left(base, 41), '-[^-]*$', ''); end if;
    base := trim(both '-' from left(base, 40));
    loop
      attempt := base || '-' || public.short_slug(4);
      exit when not exists (select 1 from public.partner_roles where slug = attempt);
    end loop;
    update public.partner_roles set slug = attempt where job_id = r.job_id;
  end loop;
end $$;

alter table public.partner_roles alter column slug set not null;
create unique index if not exists partner_roles_slug_key on public.partner_roles (slug);

-- views: columns appended at the end, so create or replace is allowed
create or replace view public.partner_companies_v with (security_invoker = true) as
 SELECT cc.company_id, cc.display_name, cc.relationship, cc.is_active, cc.is_published, cc.anon_alias, cc.public_blurb,
    cc.engagement_notes, cc.convo_stage, cc.next_step, cc.channel, cc.contact_name, cc.contact_email, cc.last_contact, cc.added_at,
    c.name AS company_name, c.logo_url, c.website, c.stage, c.industry, c.location, c.employee_count, c.description,
    c.last_funding_amount_usd, c.last_funding_type, c.last_funding_date, c.top_investors,
    COALESCE(r.live_roles, 0) AS live_roles,
    COALESCE(r.role_titles, '{}'::text[]) AS live_role_titles,
    COALESCE(sub.total, 0) AS submission_count,
    COALESCE(asg.user_ids, '{}'::uuid[]) AS assigned_user_ids,
    cb.id AS company_brief_id,
    cb.status AS company_brief_status,
    cc.slug
   FROM client_companies cc
     JOIN companies c ON c.id = cc.company_id
     LEFT JOIN ( SELECT pr.company_id, count(*)::integer AS live_roles, array_agg(j.title ORDER BY j.title) AS role_titles
           FROM partner_roles pr JOIN jobs j ON j.id = pr.job_id
          WHERE pr.is_live AND j.status = 'open'::text GROUP BY pr.company_id) r ON r.company_id = cc.company_id
     LEFT JOIN ( SELECT role_submissions.company_id, count(*)::integer AS total FROM role_submissions GROUP BY role_submissions.company_id) sub ON sub.company_id = cc.company_id
     LEFT JOIN ( SELECT u.company_id, array_agg(DISTINCT u.user_id) AS user_ids
           FROM ( SELECT company_assignments.company_id, company_assignments.user_id FROM company_assignments
                UNION
                 SELECT search_assignments.company_id, search_assignments.user_id FROM search_assignments WHERE search_assignments.status <> 'declined'::text) u
          GROUP BY u.company_id) asg ON asg.company_id = cc.company_id
     LEFT JOIN partner_briefs cb ON cb.company_id = cc.company_id AND cb.job_id IS NULL;

create or replace view public.partner_roles_v as
 SELECT pr.job_id, pr.company_id, pr.is_live, pr.priority, pr.headline, pr.context, pr.fee_percentage, pr.fee_flat, pr.scout_payout,
    pr.scout_share, pr.payout_note, pr.exclusivity, pr.submission_cap, pr.target_start, pr.added_at, pr.updated_at,
    j.title, j.department, j.location, j.remote_policy, j.status AS job_status, j.salary_min, j.salary_max, j.visa_requirement,
    j.job_post_url, j.description, j.requirements, j.skills_required, j.experience_years_min, j.experience_years_max,
    j.hiring_manager_name, j.referral_bonus, j.referral_bonus_type, j.created_at AS job_created_at,
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
    j.salary_currency,
    pr.slug,
    cc.slug AS company_slug
   FROM partner_roles pr
     JOIN jobs j ON j.id = pr.job_id
     LEFT JOIN companies c ON c.id = pr.company_id
     LEFT JOIN client_companies cc ON cc.company_id = pr.company_id
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
           FROM role_submissions GROUP BY role_submissions.job_id) s ON s.job_id = pr.job_id;
