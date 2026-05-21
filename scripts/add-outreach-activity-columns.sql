-- The outreach hub filtered and sorted every KPI by outreach_messages.sent_at
-- and the stale-thread list by outreach_threads.last_touch_at. In practice ~41%
-- of messages had a NULL sent_at — inbound replies carry their time in
-- replied_at, and bulk-imported outbound rows only had created_at — so recent
-- outreach was silently dropped from the dashboard (touches 7d showed 3 when the
-- real number was 48).
--
-- These STORED generated columns always resolve to a real moment, for existing
-- and future rows alike, regardless of which timestamp the importer populated.
-- The outreach pages now filter/sort on these columns.
--
-- Applied to production Supabase via MCP migration
-- "outreach_activity_at_generated_columns".

alter table public.outreach_messages
  add column if not exists activity_at timestamptz
  generated always as (coalesce(sent_at, replied_at, created_at)) stored;

create index if not exists idx_outreach_messages_activity_at
  on public.outreach_messages (activity_at desc);

alter table public.outreach_threads
  add column if not exists last_activity_at timestamptz
  generated always as (coalesce(last_touch_at, updated_at, created_at)) stored;

create index if not exists idx_outreach_threads_last_activity_at
  on public.outreach_threads (last_activity_at desc);
