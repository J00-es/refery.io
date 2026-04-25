-- =====================================================
-- Migration: Add Candidate Verdicts, Company Contacts, Hiring Insights
-- =====================================================

-- 1. Add verdict columns to candidates table
-- Recruiter verdict and Lily (super admin) verdict for 5-stage assessment
ALTER TABLE candidates 
ADD COLUMN IF NOT EXISTS recruiter_verdict TEXT CHECK (recruiter_verdict IN ('very_strong', 'strong', 'moderate', 'weak', 'pass')),
ADD COLUMN IF NOT EXISTS lily_verdict TEXT CHECK (lily_verdict IN ('very_strong', 'strong', 'moderate', 'weak', 'pass')),
ADD COLUMN IF NOT EXISTS recruiter_verdict_by TEXT,
ADD COLUMN IF NOT EXISTS recruiter_verdict_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lily_verdict_at TIMESTAMPTZ;

-- 2. Add AI analysis field to candidates
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS ai_analysis TEXT,
ADD COLUMN IF NOT EXISTS ai_analysis_at TIMESTAMPTZ;

-- 3. Add brief field to candidates (for memorable summary)
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS brief TEXT;

-- 4. Add funding_raised to companies table
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS funding_raised TEXT,
ADD COLUMN IF NOT EXISTS hiring_insights TEXT;

-- 5. Create company_contacts table
CREATE TABLE IF NOT EXISTS company_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  linkedin_url TEXT,
  title TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_user_id UUID
);

-- Create index for company_contacts
CREATE INDEX IF NOT EXISTS idx_company_contacts_company_id ON company_contacts(company_id);

-- 6. Add hiring insights to jobs table (inherited from company but can be customized)
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS hiring_insights TEXT;

-- 7. Update availability_status check constraint to include 'not_qualified'
-- First drop the existing constraint if it exists, then add the new one
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_availability_status_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_availability_status_check 
  CHECK (availability_status IN ('active', 'off_market', 'not_yet_talked', 'not_qualified'));

-- Enable RLS on company_contacts
ALTER TABLE company_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies for company_contacts (allow authenticated users to manage)
DROP POLICY IF EXISTS "Allow authenticated users to read company_contacts" ON company_contacts;
CREATE POLICY "Allow authenticated users to read company_contacts" ON company_contacts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert company_contacts" ON company_contacts;
CREATE POLICY "Allow authenticated users to insert company_contacts" ON company_contacts
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update company_contacts" ON company_contacts;
CREATE POLICY "Allow authenticated users to update company_contacts" ON company_contacts
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete company_contacts" ON company_contacts;
CREATE POLICY "Allow authenticated users to delete company_contacts" ON company_contacts
  FOR DELETE TO authenticated USING (true);
