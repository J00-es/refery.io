-- ────────────────────────────────────────────────────────────────────────────
-- Searches: the role is the unit a partner works.
--
-- The first desk granted access per company (company_assignments) and showed
-- each role's live submission count. Two things the partner calls taught us:
--
--   partners choose roles, not clients   Gina took FDE Research and not RL
--                                        Environments; Alexis took two of
--                                        Augustus's eight. Supply, comp and the
--                                        bar all differ per seat.
--   counts leak                          "4 in play" tells a partner how many
--                                        other partners are on it, which is not
--                                        theirs to know. How far the search has
--                                        got is.
--
-- So this migration adds:
--
--   search_assignments   a partner on a role, with a propose → working /
--                        declined loop. The client unlocks (name, brief) the
--                        moment a partner holds any assignment there.
--                        company_assignments stays as a legacy grant.
--   search stage         derived per role from its submissions: sourcing,
--                        shortlisting, client_interviewing, offer_out, filled,
--                        closed. Shown instead of any count.
--   role detail          hard_requirements, intake_notes, not_for,
--                        interview_steps, decision_days on partner_roles.
--   submission detail    work_authorization, comp, spoken_to_candidate,
--                        fresh_introduction, hm_rating, hm_note, decline_reason.
--   search_questions     a partner's question on a role, answered once for
--                        everyone on it.
--
-- Every new table is service-role only, gated in code, like the rest of the desk.
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. search_assignments ──────────────────────────────────────────────────
create table if not exists public.search_assignments (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'proposed'
                  check (status in ('proposed', 'working', 'declined', 'paused')),
  why             text,
  proposed_by     uuid references auth.users(id),
  proposed_at     timestamptz not null default now(),
  expires_at      timestamptz,
  confirmed_at    timestamptz,
  declined_at     timestamptz,
  declined_reason text,
  paused_at       timestamptz,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (job_id, user_id)
);
create index if not exists search_assignments_user_idx on public.search_assignments(user_id);
create index if not exists search_assignments_job_idx on public.search_assignments(job_id);
create index if not exists search_assignments_company_idx on public.search_assignments(company_id);
comment on table public.search_assignments is
  'A partner on one search (a role). Proposed by Refery with a why; the partner confirms (working) or declines with a reason. Holding any non-declined row at a company unlocks that client''s name and brief.';
comment on column public.search_assignments.expires_at is
  'A proposal unanswered past this point drops back to "open to you, on request". Set to proposed_at + 7 days by the handler.';

alter table public.search_assignments enable row level security;

-- ── 2. partner_roles: what a partner reads before they source ───────────────
alter table public.partner_roles
  add column if not exists hard_requirements text[] not null default '{}',
  add column if not exists intake_notes      text[] not null default '{}',
  add column if not exists not_for           text,
  add column if not exists interview_steps   jsonb  not null default '[]'::jsonb,
  add column if not exists decision_days     integer check (decision_days is null or decision_days > 0);

comment on column public.partner_roles.hard_requirements is 'From the JD. One line each.';
comment on column public.partner_roles.intake_notes is 'From the intake call. One line each. The part the JD does not say.';
comment on column public.partner_roles.not_for is 'Who will not clear, in one sentence.';
comment on column public.partner_roles.interview_steps is 'Array of {title, detail}. The process a candidate goes through.';
comment on column public.partner_roles.decision_days is 'Typical days from first call to a decision.';

-- ── 3. role_submissions: what clients ask every time, structured ────────────
alter table public.role_submissions
  add column if not exists work_authorization  text,
  add column if not exists current_base        numeric,
  add column if not exists target_base         numeric,
  add column if not exists spoken_to_candidate text,
  add column if not exists fresh_introduction  boolean,
  add column if not exists hm_rating           integer check (hm_rating is null or hm_rating between 1 and 4),
  add column if not exists hm_note             text,
  add column if not exists decline_reason      text;

comment on column public.role_submissions.hm_rating is
  'The hiring manager''s read, 1 (strong no) to 4 (strong yes). Relayed to the partner with hm_note.';
comment on column public.role_submissions.decline_reason is
  'Why a submission was declined. Required by the UI; the single loudest complaint about split-fee networks is a no with no reason.';

-- ── 4. search_questions ─────────────────────────────────────────────────────
create table if not exists public.search_questions (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  asked_by    uuid not null references auth.users(id),
  question    text not null,
  answer      text,
  answered_by uuid references auth.users(id),
  answered_at timestamptz,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists search_questions_job_idx on public.search_questions(job_id, created_at);
comment on table public.search_questions is
  'A partner''s question on a search, answered by Refery once and shown to everyone on it. The asker is never named to other partners.';

alter table public.search_questions enable row level security;

-- ── 5. views ────────────────────────────────────────────────────────────────
-- Existing columns keep their names and order so `create or replace` is legal;
-- new columns are appended.

create or replace view public.partner_roles_v
with (security_invoker = true) as
select
  pr.job_id,
  pr.company_id,
  pr.is_live,
  pr.priority,
  pr.headline,
  pr.context,
  pr.fee_percentage,
  pr.fee_flat,
  pr.scout_payout,
  pr.scout_share,
  pr.payout_note,
  pr.exclusivity,
  pr.submission_cap,
  pr.target_start,
  pr.added_at,
  pr.updated_at,
  j.title,
  j.department,
  j.location,
  j.remote_policy,
  j.status                        as job_status,
  j.salary_min,
  j.salary_max,
  j.visa_requirement,
  j.job_post_url,
  j.description,
  j.requirements,
  j.skills_required,
  j.experience_years_min,
  j.experience_years_max,
  j.hiring_manager_name,
  j.referral_bonus,
  j.referral_bonus_type,
  j.created_at                    as job_created_at,
  public.job_seniority(j.title)   as seniority,
  public.job_location_buckets(j.location) as location_buckets,
  c.name                          as company_name,
  c.logo_url                      as company_logo_url,
  c.stage                         as company_stage,
  b.id                            as brief_id,
  b.status                        as brief_status,
  coalesce(s.total, 0)            as submission_count,
  coalesce(s.live, 0)             as live_submission_count,
  coalesce(s.submitter_ids, '{}'::uuid[]) as submitter_ids,
  coalesce(s.candidate_ids, '{}'::uuid[]) as submitted_candidate_ids,
  -- appended
  pr.hard_requirements,
  pr.intake_notes,
  pr.not_for,
  pr.interview_steps,
  pr.decision_days,
  case
    when coalesce(s.placed, 0) > 0                      then 'filled'
    when not pr.is_live or j.status <> 'open'           then 'closed'
    when coalesce(s.offers, 0) > 0                      then 'offer_out'
    when coalesce(s.with_client, 0) > 0                 then 'client_interviewing'
    when coalesce(s.shortlisted, 0) > 0                 then 'shortlisting'
    else 'sourcing'
  end                             as search_stage,
  coalesce(s.moved_at, pr.updated_at, pr.added_at) as stage_moved_at
from public.partner_roles pr
  join public.jobs j on j.id = pr.job_id
  left join public.companies c on c.id = pr.company_id
  left join public.partner_briefs b on b.job_id = pr.job_id
  left join (
    select
      job_id,
      count(*)::int as total,
      count(*) filter (where status not in ('declined', 'withdrawn'))::int as live,
      count(*) filter (where status = 'placed')::int                          as placed,
      count(*) filter (where status = 'offer')::int                           as offers,
      count(*) filter (where status in ('sent_to_client', 'client_interview'))::int as with_client,
      count(*) filter (where status = 'shortlisted')::int                     as shortlisted,
      max(updated_at) filter (where status not in ('withdrawn'))              as moved_at,
      array_agg(distinct submitted_by_user_id) as submitter_ids,
      array_agg(distinct candidate_id)         as candidate_ids
    from public.role_submissions
    group by job_id
  ) s on s.job_id = pr.job_id;

create or replace view public.partner_companies_v
with (security_invoker = true) as
select
  cc.company_id,
  cc.display_name,
  cc.relationship,
  cc.is_active,
  cc.is_published,
  cc.anon_alias,
  cc.public_blurb,
  cc.engagement_notes,
  cc.convo_stage,
  cc.next_step,
  cc.channel,
  cc.contact_name,
  cc.contact_email,
  cc.last_contact,
  cc.added_at,
  c.name                          as company_name,
  c.logo_url,
  c.website,
  c.stage,
  c.industry,
  c.location,
  c.employee_count,
  c.description,
  c.last_funding_amount_usd,
  c.last_funding_type,
  c.last_funding_date,
  c.top_investors,
  coalesce(r.live_roles, 0)               as live_roles,
  coalesce(r.role_titles, '{}'::text[])   as live_role_titles,
  coalesce(sub.total, 0)                  as submission_count,
  coalesce(asg.user_ids, '{}'::uuid[])    as assigned_user_ids,
  cb.id                                   as company_brief_id,
  cb.status                               as company_brief_status
from public.client_companies cc
  join public.companies c on c.id = cc.company_id
  left join (
    select pr.company_id,
           count(*)::int                as live_roles,
           array_agg(j.title order by j.title) as role_titles
    from public.partner_roles pr
      join public.jobs j on j.id = pr.job_id
    where pr.is_live and j.status = 'open'
    group by pr.company_id
  ) r on r.company_id = cc.company_id
  left join (
    select company_id, count(*)::int as total
    from public.role_submissions
    group by company_id
  ) sub on sub.company_id = cc.company_id
  -- Anyone holding a legacy company grant or any live search assignment at
  -- the client. This is what unlocks the name and the brief.
  left join (
    select company_id, array_agg(distinct user_id) as user_ids
    from (
      select company_id, user_id from public.company_assignments
      union
      select company_id, user_id from public.search_assignments where status <> 'declined'
    ) u
    group by company_id
  ) asg on asg.company_id = cc.company_id
  left join public.partner_briefs cb
    on cb.company_id = cc.company_id and cb.job_id is null;

create or replace view public.role_submissions_v
with (security_invoker = true) as
select
  rs.id,
  rs.job_id,
  rs.candidate_id,
  rs.company_id,
  rs.submitted_by_user_id,
  rs.status,
  rs.pitch,
  rs.highlights,
  rs.reviewed_by,
  rs.reviewed_at,
  rs.review_note,
  rs.decided_at,
  rs.created_at,
  rs.updated_at,
  cand.name               as candidate_name,
  cand.panel_grade        as candidate_grade,
  cand.location           as candidate_location,
  cand.availability_status as candidate_availability,
  cand.experience_years   as candidate_experience_years,
  cand.owner_user_id      as candidate_owner_id,
  j.title                 as job_title,
  c.name                  as company_name,
  u.full_name             as submitted_by_name,
  u.email                 as submitted_by_email,
  -- appended
  rs.work_authorization,
  rs.current_base,
  rs.target_base,
  rs.spoken_to_candidate,
  rs.fresh_introduction,
  rs.hm_rating,
  rs.hm_note,
  rs.decline_reason,
  -- appended 2026-09-05 (migration desk_act_on_behalf)
  rs.acted_by_user_id,
  actor.full_name         as acted_by_name
from public.role_submissions rs
  join public.candidates cand on cand.id = rs.candidate_id
  join public.jobs j on j.id = rs.job_id
  left join public.companies c on c.id = rs.company_id
  left join public.users_admin u on u.user_id = rs.submitted_by_user_id
  left join public.users_admin actor on actor.user_id = rs.acted_by_user_id;

-- ── act on behalf (2026-09-05) ─────────────────────────────────────────────
-- A super admin viewing the desk as a partner may act for them. The row stays
-- the partner's; this column says who really pressed the button. Null when the
-- partner acted themselves.
alter table public.role_submissions   add column if not exists acted_by_user_id uuid references auth.users(id);
alter table public.search_assignments add column if not exists acted_by_user_id uuid references auth.users(id);
alter table public.search_questions   add column if not exists acted_by_user_id uuid references auth.users(id);

-- ── beta users and Slack-decided access requests (2026-09-05) ──────────────
-- Applied to prod as migration beta_users_and_slack_access_requests.
-- Beta is a per-user switch on /admin/users, orthogonal to role and status.
alter table public.users_admin add column if not exists is_beta boolean not null default false;
-- An access request is also a Slack card decided by reaction; remember where
-- the card landed and how the decision was made ("web" or "slack:<user id>").
alter table public.company_access_requests
  add column if not exists slack_channel_id text,
  add column if not exists slack_message_ts text,
  add column if not exists decided_via text;

-- ── questions answered from Slack (2026-09-06) ──────────────────────────────
-- Applied to prod as migration search_questions_slack_loop. A question is also
-- a card in #refery-search-questions; Pep drafts in the thread (suggested_*),
-- and :+1: on the draft or a typed thread reply publishes the answer.
alter table public.search_questions
  add column if not exists slack_channel_id   text,
  add column if not exists slack_message_ts   text,
  add column if not exists suggested_answer   text,
  add column if not exists suggested_ts       text,
  add column if not exists answered_via       text,
  add column if not exists asker_notified_at  timestamptz,
  add column if not exists updated_at         timestamptz not null default now();
