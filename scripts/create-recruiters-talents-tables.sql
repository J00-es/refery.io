-- Create prospect_recruiters table for tracking external recruiters
CREATE TABLE IF NOT EXISTS prospect_recruiters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  linkedin_url TEXT,
  company TEXT,
  location TEXT,
  notes TEXT,
  outreach_status TEXT DEFAULT 'prospect' CHECK (outreach_status IN ('prospect', 'cold_reach_email', 'cold_reach_linkedin', 'in_conversation', 'onboarded', 'lost', 'not_interested')),
  assessment TEXT CHECK (assessment IN ('very_strong', 'strong', 'moderate', 'not_fit', 'not_interested')),
  owner_user_id UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create prospect_talents table for tracking external talents (pre-candidates)
CREATE TABLE IF NOT EXISTS prospect_talents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  linkedin_url TEXT,
  current_company TEXT,
  current_title TEXT,
  location TEXT,
  skills TEXT[],
  notes TEXT,
  outreach_status TEXT DEFAULT 'prospect' CHECK (outreach_status IN ('prospect', 'cold_reach_email', 'cold_reach_linkedin', 'in_conversation', 'onboarded', 'lost', 'not_interested')),
  assessment TEXT CHECK (assessment IN ('very_strong', 'strong', 'moderate', 'not_fit', 'not_interested')),
  owner_user_id UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_prospect_recruiters_status ON prospect_recruiters(outreach_status);
CREATE INDEX IF NOT EXISTS idx_prospect_recruiters_assessment ON prospect_recruiters(assessment);
CREATE INDEX IF NOT EXISTS idx_prospect_talents_status ON prospect_talents(outreach_status);
CREATE INDEX IF NOT EXISTS idx_prospect_talents_assessment ON prospect_talents(assessment);

-- Enable RLS
ALTER TABLE prospect_recruiters ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_talents ENABLE ROW LEVEL SECURITY;

-- RLS policies - only admins can access
CREATE POLICY "Admins can view prospect_recruiters" ON prospect_recruiters
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users_admin 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'admin')
      AND status = 'active'
    )
  );

CREATE POLICY "Admins can insert prospect_recruiters" ON prospect_recruiters
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users_admin 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'admin')
      AND status = 'active'
    )
  );

CREATE POLICY "Admins can update prospect_recruiters" ON prospect_recruiters
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users_admin 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'admin')
      AND status = 'active'
    )
  );

CREATE POLICY "Admins can delete prospect_recruiters" ON prospect_recruiters
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users_admin 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'admin')
      AND status = 'active'
    )
  );

CREATE POLICY "Admins can view prospect_talents" ON prospect_talents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users_admin 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'admin')
      AND status = 'active'
    )
  );

CREATE POLICY "Admins can insert prospect_talents" ON prospect_talents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users_admin 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'admin')
      AND status = 'active'
    )
  );

CREATE POLICY "Admins can update prospect_talents" ON prospect_talents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users_admin 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'admin')
      AND status = 'active'
    )
  );

CREATE POLICY "Admins can delete prospect_talents" ON prospect_talents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users_admin 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'admin')
      AND status = 'active'
    )
  );
