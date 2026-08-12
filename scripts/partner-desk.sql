-- ────────────────────────────────────────────────────────────────────────────
-- Partner desk: the companies we are actually retained by, and the exact
-- roles we are working for them.
--
-- The jobs board holds ~80k rows, almost all of it a sourced watchlist that
-- nobody has an agreement on (29,260 open roles carry internal_deal_type
-- 'public', which is what the ingester writes by default). Twelve companies in
-- client_companies are real relationships, and only *some* of each one's open
-- roles are ours to recruit on. That selection did not exist anywhere, so this
-- migration gives it a home:
--
--   partner_roles           the super-admin's per-role selection ("this one is
--                           a mandate"), plus the commercial terms that come
--                           with it.
--   company_assignments     who may see a partner company in full. Access is
--                           granted at company level, never per role.
--   partner_briefs          the scout brief, stored as structured content so
--                           the same document renders in the app and as a
--                           standalone page.
--   role_submissions        a scout formally putting one of their candidates
--                           forward, with the rationale attached. Distinct
--                           from job_candidate_pipeline, which is 96% machine
--                           matches nobody has vouched for.
--   company_access_requests the ask-to-be-assigned loop, so an anonymised card
--                           is never a dead end.
--
-- Every table is service-role only: RLS is enabled with no permissive policy,
-- and the API handlers gate in code (see lib/partners.ts). That matches how
-- candidates are already protected — service-role bypasses RLS, so the check
-- has to live in the handler either way.
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. client_companies gains a published, anonymised identity ──────────────
-- Scouts see every published partner company, but an unassigned one shows only
-- the alias. Publishing is a deliberate act, so it defaults to false.
alter table public.client_companies
  add column if not exists is_published boolean not null default false,
  add column if not exists anon_alias   text,
  add column if not exists public_blurb text;

comment on column public.client_companies.is_published is
  'Whether this relationship appears on the partner desk at all.';
comment on column public.client_companies.anon_alias is
  'What an unassigned scout sees instead of the company name, e.g. "Series A AI infra company". Falls back to a stage/industry phrase when null.';
comment on column public.client_companies.public_blurb is
  'One or two sentences about the company that are safe to show before assignment.';

-- ── 2. company assignments ─────────────────────────────────────────────────
create table if not exists public.company_assignments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  note        text,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index if not exists company_assignments_user_idx on public.company_assignments(user_id);
comment on table public.company_assignments is
  'Company-level access grant for scouts and recruiters. Access is never granted per role: a scout who can see the company can see all of its live mandates.';

-- ── 3. partner_roles ───────────────────────────────────────────────────────
create table if not exists public.partner_roles (
  job_id         uuid primary key references public.jobs(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  is_live        boolean not null default true,
  priority       text not null default 'normal' check (priority in ('urgent', 'high', 'normal')),
  headline       text,
  context        text,
  fee_percentage numeric,
  fee_flat       numeric,
  scout_payout   numeric,
  payout_note    text,
  exclusivity    text check (exclusivity in ('exclusive', 'shared')),
  submission_cap integer check (submission_cap is null or submission_cap > 0),
  target_start   date,
  added_by       uuid references auth.users(id),
  added_at       timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists partner_roles_company_idx on public.partner_roles(company_id);
comment on table public.partner_roles is
  'The roles a super admin has confirmed are ours to recruit on. A row here is what separates a mandate from the sourced watchlist the rest of public.jobs is made of.';
comment on column public.partner_roles.scout_payout is
  'What the referring scout earns on a placement, in USD. Shown on the role card — fee transparency is the thing marketplace recruiters ask for first.';
comment on column public.partner_roles.submission_cap is
  'Maximum submissions in flight at once. Honest scarcity beats an open firehose: it stops the role turning into a dumping ground and tells a scout whether it is worth their evening.';

-- ── 4. partner_briefs ──────────────────────────────────────────────────────
-- A brief is scoped to the company (covering all its roles, which is how they
-- are actually written) or to one role. `content` holds the structured
-- document; `source_html` keeps whatever was imported so the original is never
-- lost. Nothing is ever rendered from source_html — see components/partners/
-- brief-document.tsx.
create table if not exists public.partner_briefs (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  job_id       uuid references public.jobs(id) on delete cascade,
  title        text not null,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  content      jsonb not null default '{}'::jsonb,
  source_html  text,
  version      integer not null default 1,
  published_at timestamptz,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists partner_briefs_company_scope_uniq
  on public.partner_briefs(company_id) where job_id is null;
create unique index if not exists partner_briefs_job_scope_uniq
  on public.partner_briefs(job_id) where job_id is not null;

-- ── 5. role_submissions ────────────────────────────────────────────────────
-- `pitch` is not nullable on purpose. A submission without a stated reason is
-- what makes a marketplace worthless to the company on the other end.
create table if not exists public.role_submissions (
  id                   uuid primary key default gen_random_uuid(),
  job_id               uuid not null references public.jobs(id) on delete cascade,
  candidate_id         uuid not null references public.candidates(id) on delete cascade,
  company_id           uuid not null references public.companies(id) on delete cascade,
  submitted_by_user_id uuid not null references auth.users(id),
  status               text not null default 'submitted' check (status in (
                         'submitted', 'shortlisted', 'sent_to_client', 'client_interview',
                         'offer', 'placed', 'declined', 'withdrawn')),
  pitch                text not null,
  highlights           text[] not null default '{}',
  reviewed_by          uuid references auth.users(id),
  reviewed_at          timestamptz,
  review_note          text,
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (job_id, candidate_id)
);
create index if not exists role_submissions_job_idx on public.role_submissions(job_id);
create index if not exists role_submissions_submitter_idx on public.role_submissions(submitted_by_user_id);
comment on table public.role_submissions is
  'A scout formally putting a candidate forward for a mandate, with the why attached. The unique (job_id, candidate_id) is what stops two scouts claiming the same person on the same role.';

create table if not exists public.role_submission_events (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.role_submissions(id) on delete cascade,
  from_status   text,
  to_status     text not null,
  note          text,
  actor_user_id uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists role_submission_events_submission_idx
  on public.role_submission_events(submission_id, created_at);
comment on table public.role_submission_events is
  'Status trail for a submission. Exists so the scout who sourced someone can see what happened to them without asking — the single loudest complaint about split-fee networks.';

-- ── 6. company_access_requests ─────────────────────────────────────────────
create table if not exists public.company_access_requests (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  message    text,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists company_access_requests_pending_uniq
  on public.company_access_requests(company_id, user_id) where status = 'pending';

-- ── 7. RLS: service role only, gated in code ───────────────────────────────
alter table public.company_assignments      enable row level security;
alter table public.partner_roles            enable row level security;
alter table public.partner_briefs           enable row level security;
alter table public.role_submissions         enable row level security;
alter table public.role_submission_events   enable row level security;
alter table public.company_access_requests  enable row level security;

-- ── 8. views ───────────────────────────────────────────────────────────────
-- security_invoker so the views inherit the caller's RLS rather than the
-- owner's. The app reads them with the service role, which bypasses RLS
-- anyway; this just means an anon key cannot read around the empty policy set.

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
  c.name                          as company_name,
  c.logo_url                      as company_logo_url,
  c.stage                         as company_stage,
  b.id                            as brief_id,
  b.status                        as brief_status,
  coalesce(s.total, 0)            as submission_count,
  coalesce(s.live, 0)             as live_submission_count,
  coalesce(s.submitter_ids, '{}'::uuid[]) as submitter_ids,
  coalesce(s.candidate_ids, '{}'::uuid[]) as submitted_candidate_ids
from public.partner_roles pr
  join public.jobs j on j.id = pr.job_id
  left join public.companies c on c.id = pr.company_id
  left join public.partner_briefs b on b.job_id = pr.job_id
  left join (
    select
      job_id,
      count(*)::int as total,
      count(*) filter (
        where status not in ('declined', 'withdrawn')
      )::int as live,
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
  left join (
    select company_id, array_agg(user_id) as user_ids
    from public.company_assignments
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
  u.email                 as submitted_by_email
from public.role_submissions rs
  join public.candidates cand on cand.id = rs.candidate_id
  join public.jobs j on j.id = rs.job_id
  left join public.companies c on c.id = rs.company_id
  left join public.users_admin u on u.user_id = rs.submitted_by_user_id;
