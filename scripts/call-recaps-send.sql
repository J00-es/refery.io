-- The recap draft can now be sent and rewritten from the Slack card.
--
-- :outbox_tray: on the card sends the Gmail draft as it stands. "edit: …" in
-- the thread replaces the body, "redo: …" asks the model to rewrite it. The
-- status column is the lock: the send claims draft -> sending in one update,
-- so Slack's retried deliveries cannot send the same email twice.

alter table public.call_recaps
  add column if not exists email_status text not null default 'draft'
    check (email_status in ('draft', 'sending', 'sent', 'failed')),
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_sent_by text,
  add column if not exists gmail_message_id text,
  add column if not exists email_edited_at timestamptz;
