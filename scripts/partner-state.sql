-- The partner lifecycle, derived.
--
-- A candidate has journey_stage. A search has search_stage. A partner had
-- nothing, so the only way to answer "who is stuck, and on what" was to read a
-- month of Gmail by hand. This is that answer as a query.
--
-- Derived, never stored. Every fact below already exists somewhere: the
-- application, the account, the agreement, the submission terms, the searches
-- proposed, the candidates submitted. Writing a status column would mean
-- keeping it in step with six tables that already know, and the first stale row
-- would make the whole desk untrustworthy. A view cannot go stale.
--
-- Internal only. Nothing partner-facing reads this; it exists so Lily can see
-- where the funnel leaks. RLS is not applied to views, so the service role is
-- the only intended reader and the page that uses it gates on admin.

create or replace view public.partner_state_v as
with base as (
  select
    u.user_id,
    u.email,
    u.full_name,
    u.role,
    u.status as account_status,
    u.created_at as joined_at,
    u.accepted_terms_at,
    u.activation_email_sent_at,

    -- The application that started it, matched on email because an applicant
    -- becomes a user later and the two are never linked by id.
    (select min(sa.created_at) from public.scout_applications sa
      where lower(sa.email) = lower(u.email)) as applied_at,

    -- Submission terms are the real gate before a first candidate: a partner
    -- who never took them has never been shown a brief.
    (select max(a.accepted_at) from public.agreement_acceptances a
      where lower(a.user_email) = lower(u.email)
        and a.agreement_type = 'partner_submission') as submission_terms_at,

    (select max(a.accepted_at) from public.agreement_acceptances a
      where lower(a.user_email) = lower(u.email)
        and a.agreement_type in ('scout', 'recruiter')) as partner_terms_at,

    -- Searches. Proposed is what we asked of them; confirmed is what they took.
    (select count(*) from public.search_assignments s
      where s.user_id = u.user_id and s.declined_at is null) as searches_open,
    (select count(*) from public.search_assignments s
      where s.user_id = u.user_id and s.confirmed_at is not null) as searches_working,
    (select max(s.proposed_at) from public.search_assignments s
      where s.user_id = u.user_id) as last_search_proposed_at,
    (select max(s.confirmed_at) from public.search_assignments s
      where s.user_id = u.user_id) as last_search_confirmed_at,
    (select max(s.nudged_at) from public.search_assignments s
      where s.user_id = u.user_id) as last_nudged_at,

    -- Their work.
    (select count(*) from public.candidates c where c.owner_user_id = u.user_id) as submissions,
    (select max(c.created_at) from public.candidates c where c.owner_user_id = u.user_id) as last_submission_at,
    (select count(*) from public.candidates c
      where c.owner_user_id = u.user_id and c.journey_stage in ('client_review','client_interviewing','offer','hired')) as advanced,

    -- The last call, which is usually where a commitment was made.
    (select max(r.occurred_at) from public.call_recaps r
      where lower(coalesce(r.person_email, '')) = lower(u.email)) as last_call_at

  from public.users_admin u
  where u.role in ('scout', 'recruiter')
    -- Staff and test accounts live on our own domains and would otherwise sit
    -- at the top of the stalled list forever.
    and u.email not ilike '%@refery.io'
    and u.email not ilike '%@10kventures.co'
),
timed as (
  select
    base.*,
    -- The clock that matters is time since anything happened, not time since
    -- joining. A partner who submitted yesterday is not stalled however long
    -- ago they signed.
    greatest(
      coalesce(last_submission_at, joined_at),
      coalesce(last_search_confirmed_at, joined_at),
      coalesce(last_call_at, joined_at),
      joined_at
    ) as last_activity_at
  from base
)
select
  user_id,
  email,
  full_name,
  role,
  account_status,
  applied_at,
  joined_at,
  partner_terms_at,
  submission_terms_at,
  searches_open,
  searches_working,
  last_search_proposed_at,
  last_search_confirmed_at,
  last_nudged_at,
  submissions,
  advanced,
  last_submission_at,
  last_call_at,
  last_activity_at,
  floor(extract(epoch from (now() - last_activity_at)) / 86400)::int as days_quiet,

  -- One of six states, in the order a partner passes through them. The first
  -- matching branch wins, so the state is always the earliest thing that has
  -- not happened yet: that is the thing to act on.
  case
    when submissions > 0
      and last_submission_at > now() - interval '30 days'          then 'working'
    when submissions > 0                                            then 'lapsed'
    when searches_working > 0                                       then 'took_a_search'
    when searches_open > 0                                          then 'search_offered'
    when partner_terms_at is not null                               then 'signed_idle'
    else                                                                 'joined_unsigned'
  end as state,

  -- What to do about it, in Lily's terms rather than the schema's. Kept beside
  -- the state so the page never has to reimplement the reasoning.
  case
    when submissions > 0
      and last_submission_at > now() - interval '30 days'          then 'Nothing. They are working.'
    when submissions > 0                                            then 'Submitted before, gone quiet. Worth a note.'
    when searches_working > 0                                       then 'Took a search, nothing submitted yet.'
    when searches_open > 0                                          then 'Offered a search, has not answered.'
    when partner_terms_at is not null                               then 'Signed, never given a search.'
    else                                                                 'Account exists, never signed the terms.'
  end as needs,

  -- Stalled is a judgement, so it is defined once here rather than in every
  -- caller. Two weeks of silence with nothing submitted, or a month of silence
  -- from someone who used to submit.
  case
    when submissions = 0 and last_activity_at < now() - interval '14 days' then true
    when submissions > 0 and last_activity_at < now() - interval '30 days' then true
    else false
  end as stalled
from timed;

comment on view public.partner_state_v is
  'Partner lifecycle, derived from applications, accounts, agreements, search assignments and submissions. Internal: powers the partner desk and the Monday digest.';
