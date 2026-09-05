-- Post-call recaps: one row per Granola note we have acted on.
--
-- The unique index on signal_id is the whole idempotency story. The poller runs
-- every ten minutes over a rolling window, so it sees the same call many times.
-- Claiming the row before doing any work is what stops a second run posting a
-- second card, drafting a second email, or paying for a second summary.
--
-- RLS on with no policies, matching ingested_signals: this table holds
-- transcript-derived content and a draft email body, and nothing in the app is
-- meant to read it. The service role bypasses RLS, which is the only access.

create table if not exists public.call_recaps (
  id uuid primary key default gen_random_uuid(),

  -- The Granola note this recap is about. Kept as the natural key rather than
  -- signal_id alone so a recap can be claimed before the signal row exists.
  granola_note_id text not null,
  signal_id uuid references public.ingested_signals(id) on delete set null,

  -- Who the call was with. entity_type mirrors ingested_signals' vocabulary.
  -- entity_id is nullable: a call with someone not yet in the CRM is exactly
  -- the call that still needs a recap email, and Granola supplies the name and
  -- address regardless.
  entity_type text not null,
  entity_id uuid,
  person_name text,
  person_email text,

  occurred_at timestamptz not null,
  title text,

  -- The Slack card.
  slack_channel_id text,
  slack_message_ts text,

  -- The card body, kept so a redraft can reuse it without re-reading the
  -- transcript, and so a bad summary can be inspected after the fact.
  summary jsonb,
  model text,

  -- The Gmail draft. Never sent by us: draft_id is the handle Lily opens.
  gmail_draft_id text,
  gmail_thread_id text,
  email_subject text,
  email_body text,
  email_error text,

  -- pending -> posted, or failed with a reason. A failed row is retried by the
  -- next run only if it is still inside the polling window.
  status text not null default 'pending'
    check (status in ('pending', 'posted', 'failed')),
  error text,
  -- Bounded retries. Without this a note the model reliably chokes on is
  -- re-summarised every ten minutes for a day, which is the one way this
  -- feature could cost real money.
  attempts integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists call_recaps_note_uniq
  on public.call_recaps (granola_note_id);

create index if not exists call_recaps_entity
  on public.call_recaps (entity_type, entity_id);

-- The reaction and comment handlers resolve a candidate from a Slack message,
-- exactly as the intake tables do, so this is the lookup that has to be fast.
create index if not exists call_recaps_slack
  on public.call_recaps (slack_channel_id, slack_message_ts);

drop trigger if exists call_recaps_touch_updated_at on public.call_recaps;
create trigger call_recaps_touch_updated_at
  before update on public.call_recaps
  for each row execute function vf.touch_updated_at();

alter table public.call_recaps enable row level security;
