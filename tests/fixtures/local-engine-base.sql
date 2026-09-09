-- Synthetic local harness for policy, budget, leases and lifecycle tests.
-- Not a production schema dump, and not a substitute for hosted Supabase/RLS UI tests.
create role anon;
create role authenticated;
create role service_role bypassrls;
create table candidates (
 id uuid primary key default gen_random_uuid(), name text, parsed_data jsonb, embedding boolean,
 journey_stage text default 'uploaded', journey_stage_source text, journey_stage_at timestamptz,
 decision_pending_since timestamptz, panel_at timestamptz, panel_grade text, recruiter_verdict text,
 availability_status text default 'active', person_type text default 'job_seeker', intake_source text,
 consent_told_candidate boolean, lily_verdict text, updated_at timestamptz default now(), created_at timestamptz default now()
);
create table companies (id uuid primary key default gen_random_uuid(),do_not_contact boolean default false);
create table jobs (id uuid primary key default gen_random_uuid(),company_id uuid references companies(id),title text,requirements text,status text default 'open');
create table candidate_panels (id uuid primary key default gen_random_uuid(),candidate_id uuid references candidates(id),model text,cost_usd numeric,prompt_version text,tokens_in integer,tokens_out integer,created_at timestamptz default now());
create table search_match_runs (id uuid primary key default gen_random_uuid(),job_id uuid references jobs(id),model text,cost_usd numeric,created_at timestamptz default now());
create table candidate_panel_queue (candidate_id uuid primary key references candidates(id),reason text,status text default 'queued',attempts int default 0,error text,enqueued_at timestamptz default now(),started_at timestamptz,finished_at timestamptz);
create table search_match_queue (job_id uuid primary key references jobs(id),trigger text,status text default 'queued',attempts int default 0,error text,enqueued_at timestamptz default now(),finished_at timestamptz);
create table brain_settings (id smallint primary key,monthly_budget_usd numeric default 20);
insert into brain_settings values (1,20);
create table brain_budget_months (month_start date primary key,hard_limit_usd numeric default 20,reserved_usd numeric default 0,spent_usd numeric default 0,blocked_calls int default 0,updated_at timestamptz default now());
create table brain_ai_usage (id uuid primary key default gen_random_uuid(),month_start date references brain_budget_months(month_start),event_id uuid,draft_id uuid,request_kind text,model text,reservation_usd numeric default 0,actual_usd numeric default 0,input_tokens int,output_tokens int,status text,metadata jsonb default '{}',created_at timestamptz default now(),finalized_at timestamptz);
create table candidate_decisions (id uuid primary key default gen_random_uuid(),candidate_id uuid references candidates(id),decision text,decided_by text,via text,job_ids uuid[],created_at timestamptz default now(),reason text);
create table recruiter_notes (id uuid primary key default gen_random_uuid(),candidate_id uuid references candidates(id),note_type text,created_by uuid,user_id uuid,created_at timestamptz default now());
create table call_recaps (id uuid primary key default gen_random_uuid(),entity_id uuid,entity_type text,occurred_at timestamptz,created_at timestamptz default now());
create table candidate_activity_log (id uuid primary key default gen_random_uuid(),candidate_id uuid references candidates(id),activity_type text,performed_by uuid,created_at timestamptz default now());
create table role_submissions (id uuid primary key default gen_random_uuid(),candidate_id uuid references candidates(id),job_id uuid references jobs(id),status text,reviewed_by uuid,acted_by_user_id uuid,reviewed_at timestamptz,decided_at timestamptz,updated_at timestamptz,created_at timestamptz default now(),decline_reason text);
create table job_candidate_pipeline (id uuid primary key default gen_random_uuid(),candidate_id uuid references candidates(id),job_id uuid references jobs(id),stage text,match_reason text,owner_user_id uuid,unique(candidate_id,job_id));
create table pipeline_internal_state (pipeline_id uuid,internal_stage text);
-- Exact pre-release budget finalizer behavior, read from the live definition.
create function brain_finalize_budget(p_usage_id uuid,p_actual_usd numeric,p_input_tokens integer,p_output_tokens integer,p_status text default 'completed') returns void language plpgsql set search_path='public','pg_catalog' as $$
declare v_usage public.brain_ai_usage%rowtype; v_actual numeric(12,6):=greatest(coalesce(p_actual_usd,0),0);
begin
 if p_status not in ('completed','failed') then raise exception 'invalid final budget status'; end if;
 select * into v_usage from public.brain_ai_usage where id=p_usage_id for update;
 if not found or v_usage.status <> 'reserved' then return; end if;
 update public.brain_budget_months set reserved_usd=greatest(reserved_usd-v_usage.reservation_usd,0),spent_usd=spent_usd+case when p_status='completed' then v_actual else 0 end where month_start=v_usage.month_start;
 update public.brain_ai_usage set actual_usd=case when p_status='completed' then v_actual else 0 end,input_tokens=p_input_tokens,output_tokens=p_output_tokens,status=p_status,finalized_at=now() where id=p_usage_id;
end $$;
