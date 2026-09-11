-- The desk MCP (lib/mcp): one record per tool call, and nothing else new.
--
-- The key that authenticates the server and the per-verb write switches live
-- in desk_settings ('mcp_token', 'mcp_writes'), next to the desk's other
-- settings. This table is the "last calls" list on /admin/settings#mcp and the
-- audit trail behind it. Service-role only: RLS on, no policies.

create table if not exists public.desk_mcp_calls (
  id uuid primary key default gen_random_uuid(),
  tool text not null,
  kind text not null check (kind in ('read', 'write')),
  -- What was asked, with long strings cut short. Never a CV, never an email body.
  args jsonb not null default '{}'::jsonb,
  ok boolean not null,
  -- One line a person can read: "10 benched", "draft returned, nothing sent".
  summary text,
  duration_ms integer,
  actor text not null default 'lily',
  created_at timestamptz not null default now()
);

create index if not exists desk_mcp_calls_created_at_idx on public.desk_mcp_calls (created_at desc);

alter table public.desk_mcp_calls enable row level security;
