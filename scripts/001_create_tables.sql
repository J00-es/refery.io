-- Jobs table for storing job listings
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  department TEXT,
  location TEXT,
  remote_policy TEXT CHECK (remote_policy IN ('remote', 'hybrid', 'onsite')),
  description TEXT NOT NULL,
  requirements TEXT[],
  skills_required TEXT[],
  experience_years_min INTEGER DEFAULT 0,
  experience_years_max INTEGER,
  salary_min INTEGER,
  salary_max INTEGER,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'draft')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Candidates/Resumes table
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  resume_blob_pathname TEXT NOT NULL,
  resume_filename TEXT,
  parsed_data JSONB,
  skills TEXT[],
  experience_years INTEGER,
  location TEXT,
  remote_preference TEXT,
  salary_expectation_min INTEGER,
  salary_expectation_max INTEGER,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'shortlisted', 'rejected', 'hired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Job-Candidate matches with AI scores
CREATE TABLE IF NOT EXISTS job_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  overall_score DECIMAL(5,2) NOT NULL,
  skills_score DECIMAL(5,2),
  experience_score DECIMAL(5,2),
  keywords_score DECIMAL(5,2),
  location_score DECIMAL(5,2),
  salary_score DECIMAL(5,2),
  ai_reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, candidate_id)
);

-- Enable RLS on all tables
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;

-- RLS policies for jobs
CREATE POLICY "jobs_select_own" ON jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "jobs_insert_own" ON jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "jobs_update_own" ON jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "jobs_delete_own" ON jobs FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for candidates
CREATE POLICY "candidates_select_own" ON candidates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "candidates_insert_own" ON candidates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "candidates_update_own" ON candidates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "candidates_delete_own" ON candidates FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for job_matches (join with jobs/candidates to check ownership)
CREATE POLICY "job_matches_select_own" ON job_matches FOR SELECT 
  USING (EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_matches.job_id AND jobs.user_id = auth.uid()));
CREATE POLICY "job_matches_insert_own" ON job_matches FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_matches.job_id AND jobs.user_id = auth.uid()));
CREATE POLICY "job_matches_delete_own" ON job_matches FOR DELETE 
  USING (EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_matches.job_id AND jobs.user_id = auth.uid()));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
CREATE INDEX IF NOT EXISTS idx_job_matches_job_id ON job_matches(job_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_candidate_id ON job_matches(candidate_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_overall_score ON job_matches(overall_score DESC);
