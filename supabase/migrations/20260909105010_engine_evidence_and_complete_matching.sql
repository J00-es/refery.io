-- Apply AFTER release-1 migrations 01..04. Additive, dormant until called.
-- Daily retrieval searches the entire current job board. A progress row means
-- proposals and evidence were committed, never MAX(pipeline.created_at).
alter table public.candidate_source_versions add column if not exists snapshot jsonb;
alter table public.candidate_facts add column if not exists source_path text;
create unique index if not exists candidate_facts_import_identity
 on public.candidate_facts(source_version_id,fact_key,recorded_by) where recorded_by='import:structured-facts-v1';

create or replace function public.engine_save_fact_bundle(p_candidate_id uuid,p_parsed jsonb,p_hash text,p_facts jsonb)
returns uuid language plpgsql set search_path='public','pg_catalog' as $$
declare v_id uuid; v_parsed jsonb;
begin
 select parsed_data into v_parsed from candidates where id=p_candidate_id for update;
 if not found or v_parsed is distinct from p_parsed then raise exception 'candidate source changed'; end if;
 if jsonb_typeof(p_facts)<>'array' then raise exception 'facts must be an array'; end if;
 insert into candidate_source_versions(candidate_id,kind,content_hash,source_ref,snapshot)
 values(p_candidate_id,'parsed_data',p_hash,'{"builder":"structured-facts-v1"}',p_parsed)
 on conflict(candidate_id,kind,content_hash) do update set snapshot=excluded.snapshot returning id into v_id;
 insert into candidate_facts(candidate_id,source_version_id,fact_key,fact_value,status,span,source_path,recorded_by)
 select p_candidate_id,v_id,f->>'fact_key',f->'fact_value','self_reported',f->>'span',f->>'source_path','import:structured-facts-v1'
 from jsonb_array_elements(p_facts) f
 on conflict(source_version_id,fact_key,recorded_by) where recorded_by='import:structured-facts-v1' do nothing;
 return v_id;
end $$;

create or replace function public.engine_save_scorecard_draft(p_job_id uuid,p_source jsonb,p_content jsonb,p_hash text)
returns uuid language plpgsql set search_path='public','pg_catalog' as $$
declare v_job jsonb; v_id uuid;
begin
 select to_jsonb(j) into v_job from jobs j where id=p_job_id for update;
 if not found or not v_job @> p_source then raise exception 'job source changed'; end if;
 -- This importer cannot forge hiring-manager confirmation.
 if p_content->>'priorities_confirmed' is distinct from 'false'
    or exists(select 1 from jsonb_array_elements(p_content->'requirements') r where r->>'hard_gate' is distinct from 'false')
 then raise exception 'drafts cannot confirm hard requirements'; end if;
 insert into role_scorecard_versions(job_id,version,content,content_hash,mandate_state)
 select p_job_id,coalesce(max(version),0)+1,p_content,p_hash,'draft' from role_scorecard_versions where job_id=p_job_id
 on conflict(job_id,content_hash) do nothing returning id into v_id;
 if v_id is null then select id into v_id from role_scorecard_versions where job_id=p_job_id and content_hash=p_hash; end if;
 return v_id;
end $$;

create table if not exists public.engine_nightly_candidates (
 run_key text not null, candidate_id uuid not null references candidates(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','done','excluded','missing_embedding')),
 evaluated integer not null default 0, proposed integer not null default 0,
 completed_at timestamptz, primary key(run_key,candidate_id)
);
alter table public.engine_nightly_candidates enable row level security;
create index if not exists engine_nightly_due on public.engine_nightly_candidates(run_key,candidate_id) where status='queued';

create or replace function public.engine_start_nightly_match(p_run_key text)
returns integer language plpgsql set search_path='public','pg_catalog' as $$
declare n integer;
begin
 if length(p_run_key) not between 1 and 100 then raise exception 'invalid run key'; end if;
 insert into engine_nightly_candidates(run_key,candidate_id) select p_run_key,id from candidates
 on conflict do nothing;
 get diagnostics n=row_count; return n;
end $$;

create or replace function public.engine_process_next_candidate(p_run_key text,p_owner_user_id uuid default null)
returns jsonb language plpgsql set search_path='public','pg_catalog' as $$
declare q record; c record; r record; pol jsonb; n integer:=0; v_proposed integer:=0; inserted_id uuid; v_run uuid:=gen_random_uuid();
begin
 select * into q from engine_nightly_candidates where run_key=p_run_key and status='queued'
 order by candidate_id limit 1 for update skip locked;
 if not found then return jsonb_build_object('available',false); end if;
 -- Keep the lifecycle check and proposal write in the same transaction.
 select * into c from candidates where id=q.candidate_id for update;
 pol:=candidate_eligibility(c.id);
 if not coalesce((pol->>'can_match')::boolean,false) then
   update engine_nightly_candidates set status='excluded',completed_at=now() where run_key=p_run_key and candidate_id=c.id;
   return jsonb_build_object('available',true,'status','excluded');
 end if;
 if c.embedding is null then
   update engine_nightly_candidates set status='missing_embedding',completed_at=now() where run_key=p_run_key and candidate_id=c.id;
   return jsonb_build_object('available',true,'status','missing_embedding');
 end if;
 -- Existing validated retrieval, all open jobs, no grade tier or date cutoff.
 -- Threshold is a retrieval setting, never a probability or acceptance rule.
 for r in select * from match_jobs_for_candidate_v2(c.id,0.60,100,2) loop
   n:=n+1;
   pol:=candidate_eligibility(c.id,r.job_id);
   if not coalesce((pol->>'can_match')::boolean,false) then continue; end if;
   if not exists(select 1 from jobs j left join companies co on co.id=j.company_id
                 where j.id=r.job_id and j.status='open' and not coalesce(co.do_not_contact,false)) then continue; end if;
   insert into match_assessments(job_id,candidate_id,policy_version,retrieval_routes,retrieval_rank,eligibility,role_fit,next_action,client_intro_ready,run_id)
   values(r.job_id,c.id,pol->>'policy_version',array['embedding'],n,pol,'not_assessed','human_review',false,v_run);
   if v_proposed<30 and not exists(select 1 from job_candidate_pipeline where candidate_id=c.id and job_id=r.job_id) then
     inserted_id:=null;
     insert into job_candidate_pipeline(candidate_id,job_id,stage,match_reason,owner_user_id)
     values(c.id,r.job_id,'auto_matched','Retrieval proposal; role fit and logistics require review. Similarity is not a hiring probability.',coalesce((to_jsonb(c)->>'owner_user_id')::uuid,(to_jsonb(c)->>'uploaded_by_user_id')::uuid,p_owner_user_id))
     on conflict do nothing returning id into inserted_id;
     if inserted_id is not null then v_proposed:=v_proposed+1; end if;
   end if;
 end loop;
 update engine_nightly_candidates set status='done',evaluated=n,proposed=v_proposed,completed_at=now()
 where run_key=p_run_key and candidate_id=c.id;
 return jsonb_build_object('available',true,'status','done','evaluated',n,'proposed',v_proposed);
end $$;

create or replace function public.engine_nightly_status(p_run_key text)
returns jsonb language sql stable set search_path='public','pg_catalog' as $$
 select jsonb_build_object('queued',count(*) filter(where status='queued'),'done',count(*) filter(where status='done'),
 'excluded',count(*) filter(where status='excluded'),'missing_embedding',count(*) filter(where status='missing_embedding'),
 'evaluated',coalesce(sum(evaluated),0),'proposed',coalesce(sum(proposed),0))
 from engine_nightly_candidates where run_key=p_run_key;
$$;

-- A read-only preflight, called before the scheduled worker writes anything.
create or replace function public.engine_worker_contract()
returns jsonb language sql stable set search_path='public','pg_catalog' as $$
 select jsonb_build_object('version','nightly-v2','budget',engine_budget_status(),
   'retrieval','all-open-jobs','automatic_acceptance',false,'facts','structured-facts-v1');
$$;
do $$ declare f text; begin
 foreach f in array array[
 'engine_save_fact_bundle(uuid,jsonb,text,jsonb)','engine_save_scorecard_draft(uuid,jsonb,jsonb,text)',
 'engine_start_nightly_match(text)','engine_process_next_candidate(text,uuid)','engine_nightly_status(text)','engine_worker_contract()'
 ] loop execute format('revoke all on function public.%s from public,anon,authenticated',f);
 execute format('grant execute on function public.%s to service_role',f); end loop;
end $$;

-- SHADOW VECTOR STORAGE: the active vectors are not replaced by this migration.
alter table public.candidates add column if not exists capability_embedding vector(1536),
 add column if not exists capability_hash text, add column if not exists capability_version text;
alter table public.jobs add column if not exists capability_embedding vector(1536),
 add column if not exists capability_hash text, add column if not exists capability_version text;

create or replace function public.engine_save_capability_embedding(p_kind text,p_id uuid,p_source jsonb,p_embedding vector(1536),p_hash text,p_version text)
returns boolean language plpgsql set search_path='public','pg_catalog' as $$
declare v_source jsonb; target_table text;
begin
 target_table:=case p_kind when 'candidate' then 'candidates' when 'job' then 'jobs' else null end;
 if target_table is null or p_version<>'capabilities-v1' then raise exception 'invalid capability contract'; end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 for update',target_table) into v_source using p_id;
 if v_source is null or not v_source @> p_source then return false; end if;
 execute format('update public.%I set capability_embedding=$1,capability_hash=$2,capability_version=$3 where id=$4',target_table)
 using p_embedding,p_hash,p_version,p_id;
 return true;
end $$;
revoke all on function public.engine_save_capability_embedding(text,uuid,jsonb,vector,text,text) from public,anon,authenticated;
grant execute on function public.engine_save_capability_embedding(text,uuid,jsonb,vector,text,text) to service_role;
