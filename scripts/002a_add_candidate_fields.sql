-- Add verdict and analysis columns to candidates table
ALTER TABLE candidates 
ADD COLUMN IF NOT EXISTS recruiter_verdict TEXT,
ADD COLUMN IF NOT EXISTS lily_verdict TEXT,
ADD COLUMN IF NOT EXISTS recruiter_verdict_by TEXT,
ADD COLUMN IF NOT EXISTS recruiter_verdict_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lily_verdict_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ai_analysis TEXT,
ADD COLUMN IF NOT EXISTS ai_analysis_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS brief TEXT;
