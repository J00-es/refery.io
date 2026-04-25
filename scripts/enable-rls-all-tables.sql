-- Enable Row Level Security on all public tables
-- This fixes the security vulnerabilities detected by Supabase

-- Enable RLS on tables that have policies but RLS is not enabled
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Enable RLS on tables that don't have RLS enabled
ALTER TABLE public.job_candidate_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_candidate_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users_admin ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tables that don't have them yet
-- Allow authenticated users to read all data (for partner recruiters)

-- job_candidate_notes policies
DROP POLICY IF EXISTS "job_candidate_notes_select_policy" ON public.job_candidate_notes;
DROP POLICY IF EXISTS "job_candidate_notes_insert_policy" ON public.job_candidate_notes;
DROP POLICY IF EXISTS "job_candidate_notes_update_policy" ON public.job_candidate_notes;
DROP POLICY IF EXISTS "job_candidate_notes_delete_policy" ON public.job_candidate_notes;

CREATE POLICY "job_candidate_notes_select_policy" ON public.job_candidate_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "job_candidate_notes_insert_policy" ON public.job_candidate_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "job_candidate_notes_update_policy" ON public.job_candidate_notes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "job_candidate_notes_delete_policy" ON public.job_candidate_notes FOR DELETE TO authenticated USING (true);

-- job_candidate_pipeline policies
DROP POLICY IF EXISTS "job_candidate_pipeline_select_policy" ON public.job_candidate_pipeline;
DROP POLICY IF EXISTS "job_candidate_pipeline_insert_policy" ON public.job_candidate_pipeline;
DROP POLICY IF EXISTS "job_candidate_pipeline_update_policy" ON public.job_candidate_pipeline;
DROP POLICY IF EXISTS "job_candidate_pipeline_delete_policy" ON public.job_candidate_pipeline;

CREATE POLICY "job_candidate_pipeline_select_policy" ON public.job_candidate_pipeline FOR SELECT TO authenticated USING (true);
CREATE POLICY "job_candidate_pipeline_insert_policy" ON public.job_candidate_pipeline FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "job_candidate_pipeline_update_policy" ON public.job_candidate_pipeline FOR UPDATE TO authenticated USING (true);
CREATE POLICY "job_candidate_pipeline_delete_policy" ON public.job_candidate_pipeline FOR DELETE TO authenticated USING (true);

-- company_contacts policies
DROP POLICY IF EXISTS "company_contacts_select_policy" ON public.company_contacts;
DROP POLICY IF EXISTS "company_contacts_insert_policy" ON public.company_contacts;
DROP POLICY IF EXISTS "company_contacts_update_policy" ON public.company_contacts;
DROP POLICY IF EXISTS "company_contacts_delete_policy" ON public.company_contacts;

CREATE POLICY "company_contacts_select_policy" ON public.company_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_contacts_insert_policy" ON public.company_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "company_contacts_update_policy" ON public.company_contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "company_contacts_delete_policy" ON public.company_contacts FOR DELETE TO authenticated USING (true);

-- company_ai_insights policies
DROP POLICY IF EXISTS "company_ai_insights_select_policy" ON public.company_ai_insights;
DROP POLICY IF EXISTS "company_ai_insights_insert_policy" ON public.company_ai_insights;
DROP POLICY IF EXISTS "company_ai_insights_update_policy" ON public.company_ai_insights;
DROP POLICY IF EXISTS "company_ai_insights_delete_policy" ON public.company_ai_insights;

CREATE POLICY "company_ai_insights_select_policy" ON public.company_ai_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_ai_insights_insert_policy" ON public.company_ai_insights FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "company_ai_insights_update_policy" ON public.company_ai_insights FOR UPDATE TO authenticated USING (true);
CREATE POLICY "company_ai_insights_delete_policy" ON public.company_ai_insights FOR DELETE TO authenticated USING (true);

-- companies policies
DROP POLICY IF EXISTS "companies_select_policy" ON public.companies;
DROP POLICY IF EXISTS "companies_insert_policy" ON public.companies;
DROP POLICY IF EXISTS "companies_update_policy" ON public.companies;
DROP POLICY IF EXISTS "companies_delete_policy" ON public.companies;

CREATE POLICY "companies_select_policy" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "companies_insert_policy" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "companies_update_policy" ON public.companies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "companies_delete_policy" ON public.companies FOR DELETE TO authenticated USING (true);

-- company_notes policies
DROP POLICY IF EXISTS "company_notes_select_policy" ON public.company_notes;
DROP POLICY IF EXISTS "company_notes_insert_policy" ON public.company_notes;
DROP POLICY IF EXISTS "company_notes_update_policy" ON public.company_notes;
DROP POLICY IF EXISTS "company_notes_delete_policy" ON public.company_notes;

CREATE POLICY "company_notes_select_policy" ON public.company_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_notes_insert_policy" ON public.company_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "company_notes_update_policy" ON public.company_notes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "company_notes_delete_policy" ON public.company_notes FOR DELETE TO authenticated USING (true);

-- job_internal_notes policies
DROP POLICY IF EXISTS "job_internal_notes_select_policy" ON public.job_internal_notes;
DROP POLICY IF EXISTS "job_internal_notes_insert_policy" ON public.job_internal_notes;
DROP POLICY IF EXISTS "job_internal_notes_update_policy" ON public.job_internal_notes;
DROP POLICY IF EXISTS "job_internal_notes_delete_policy" ON public.job_internal_notes;

CREATE POLICY "job_internal_notes_select_policy" ON public.job_internal_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "job_internal_notes_insert_policy" ON public.job_internal_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "job_internal_notes_update_policy" ON public.job_internal_notes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "job_internal_notes_delete_policy" ON public.job_internal_notes FOR DELETE TO authenticated USING (true);

-- company_employees policies
DROP POLICY IF EXISTS "company_employees_select_policy" ON public.company_employees;
DROP POLICY IF EXISTS "company_employees_insert_policy" ON public.company_employees;
DROP POLICY IF EXISTS "company_employees_update_policy" ON public.company_employees;
DROP POLICY IF EXISTS "company_employees_delete_policy" ON public.company_employees;

CREATE POLICY "company_employees_select_policy" ON public.company_employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_employees_insert_policy" ON public.company_employees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "company_employees_update_policy" ON public.company_employees FOR UPDATE TO authenticated USING (true);
CREATE POLICY "company_employees_delete_policy" ON public.company_employees FOR DELETE TO authenticated USING (true);

-- pipeline_stage_history policies
DROP POLICY IF EXISTS "pipeline_stage_history_select_policy" ON public.pipeline_stage_history;
DROP POLICY IF EXISTS "pipeline_stage_history_insert_policy" ON public.pipeline_stage_history;
DROP POLICY IF EXISTS "pipeline_stage_history_update_policy" ON public.pipeline_stage_history;
DROP POLICY IF EXISTS "pipeline_stage_history_delete_policy" ON public.pipeline_stage_history;

CREATE POLICY "pipeline_stage_history_select_policy" ON public.pipeline_stage_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "pipeline_stage_history_insert_policy" ON public.pipeline_stage_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pipeline_stage_history_update_policy" ON public.pipeline_stage_history FOR UPDATE TO authenticated USING (true);
CREATE POLICY "pipeline_stage_history_delete_policy" ON public.pipeline_stage_history FOR DELETE TO authenticated USING (true);

-- users_admin policies
DROP POLICY IF EXISTS "users_admin_select_policy" ON public.users_admin;
DROP POLICY IF EXISTS "users_admin_insert_policy" ON public.users_admin;
DROP POLICY IF EXISTS "users_admin_update_policy" ON public.users_admin;
DROP POLICY IF EXISTS "users_admin_delete_policy" ON public.users_admin;

CREATE POLICY "users_admin_select_policy" ON public.users_admin FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_admin_insert_policy" ON public.users_admin FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "users_admin_update_policy" ON public.users_admin FOR UPDATE TO authenticated USING (true);
CREATE POLICY "users_admin_delete_policy" ON public.users_admin FOR DELETE TO authenticated USING (true);

-- Fix the function search path issue
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.users_admin WHERE id = user_id;
  RETURN COALESCE(user_role, 'user');
END;
$$;
