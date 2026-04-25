-- Enable RLS on all tables (simple version)
-- This enables RLS and creates basic policies for authenticated users

-- Enable RLS on all tables
ALTER TABLE IF EXISTS public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_candidate_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_candidate_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pipeline_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prospect_recruiters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prospect_recruiter_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prospect_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agreement_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agreement_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.client_agreement_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.client_agreement_signatures ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users (using DO block to handle existing policies)
DO $$
BEGIN
  -- candidates
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'candidates' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.candidates FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- jobs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- job_candidate_notes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_candidate_notes' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.job_candidate_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- job_candidate_pipeline
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_candidate_pipeline' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.job_candidate_pipeline FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- company_contacts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_contacts' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.company_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- company_ai_insights
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_ai_insights' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.company_ai_insights FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- companies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companies' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- company_notes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_notes' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.company_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- job_internal_notes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_internal_notes' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.job_internal_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- company_employees
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_employees' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.company_employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- pipeline_stage_history
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pipeline_stage_history' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.pipeline_stage_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- users_admin
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users_admin' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.users_admin FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- prospect_recruiters
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prospect_recruiters' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.prospect_recruiters FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- prospect_recruiter_notes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prospect_recruiter_notes' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.prospect_recruiter_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- prospect_stage_history
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prospect_stage_history' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.prospect_stage_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- agreement_links
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreement_links' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.agreement_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  
  -- agreement_signatures
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreement_signatures' AND policyname = 'Allow authenticated access') THEN
    CREATE POLICY "Allow authenticated access" ON public.agreement_signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
