-- Hiring-manager briefs: the note we send a founder before sourcing starts,
-- published at a short public URL they can open without an account.
--
-- Applied to production on 2026-08-13. Kept here as the record.
--
-- Read access is the link itself: `slug` carries a random suffix so the URL
-- reads as the company but cannot be enumerated. Nothing here is reachable by
-- the anon key -- RLS is on with no policies, so every read and write goes
-- through a service-role route that can apply its own rules.

create table public.hm_briefs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- e.g. 'alcor-labs-9x4m2qk'. Rotating this revokes every link already sent.
  slug text not null unique,
  title text not null,
  status text not null default 'draft',
  content jsonb not null default '{}'::jsonb,
  -- Who it was written for, so a Slack ping can say whose desk it landed on.
  recipient_name text,
  recipient_email text,
  ribbon_note text,
  version integer not null default 1,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hm_briefs_status_check check (status in ('draft', 'published', 'revoked')),
  constraint hm_briefs_slug_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 6 and 80)
);

create index hm_briefs_company_idx on public.hm_briefs (company_id);

create trigger hm_briefs_touch
  before update on public.hm_briefs
  for each row execute function vf.touch_updated_at();

-- Corrections from the hiring manager, written without an account.
--
-- `author_token` is a secret the composer mints and keeps in the viewer's
-- browser; it is the only thing that authorises a later edit or delete, so it
-- is never returned by the read endpoint.
create table public.hm_brief_comments (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.hm_briefs(id) on delete cascade,
  -- Null means the general thread at the foot of the document.
  section_id text,
  section_label text,
  -- The checklist question being answered, when the comment came from one.
  prompt text,
  author_name text,
  body text not null,
  author_token text not null,
  status text not null default 'active',
  ip text,
  country text,
  region text,
  city text,
  user_agent text,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hm_brief_comments_status_check check (status in ('active', 'deleted')),
  constraint hm_brief_comments_body_check check (char_length(body) between 1 and 4000),
  constraint hm_brief_comments_name_check check (author_name is null or char_length(author_name) <= 80)
);

create index hm_brief_comments_brief_idx on public.hm_brief_comments (brief_id, created_at);
-- Serves the per-IP flood check on write.
create index hm_brief_comments_ip_idx on public.hm_brief_comments (ip, created_at desc);

create trigger hm_brief_comments_touch
  before update on public.hm_brief_comments
  for each row execute function vf.touch_updated_at();

-- Every open, how far it got, and where from.
--
-- One row per beat rather than a rolled-up counter, because the useful question
-- is "where did they stop reading" and that only survives if the trail is kept.
create table public.hm_brief_events (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.hm_briefs(id) on delete cascade,
  -- Per-tab, minted client side. Groups the beats of one sitting.
  session_id text not null,
  kind text not null,
  section_id text,
  furthest_section text,
  furthest_label text,
  scroll_pct integer,
  dwell_ms integer,
  ip text,
  country text,
  region text,
  city text,
  timezone text,
  latitude text,
  longitude text,
  user_agent text,
  referrer text,
  device text,
  -- Set once a Slack ping has gone out for this row, so a retried beacon
  -- cannot double-post.
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hm_brief_events_kind_check check (kind in ('view', 'progress', 'close', 'comment'))
);

create index hm_brief_events_brief_idx on public.hm_brief_events (brief_id, created_at desc);
create index hm_brief_events_session_idx on public.hm_brief_events (brief_id, session_id, kind);

-- A sitting gets exactly one "finished reading" summary.
--
-- Two things race to write it: the browser's unload beacon, and the sweep that
-- closes out sessions whose beacon never arrived (a killed tab, a phone that
-- slept). Both are needed -- the beacon is timely, the sweep is reliable -- so
-- the database decides which one wins rather than the application guessing.
create unique index hm_brief_events_one_close_per_session
  on public.hm_brief_events (brief_id, session_id)
  where kind = 'close';

alter table public.hm_briefs enable row level security;
alter table public.hm_brief_comments enable row level security;
alter table public.hm_brief_events enable row level security;
