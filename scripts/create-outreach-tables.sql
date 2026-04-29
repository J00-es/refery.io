-- Outreach Hub Database Schema
-- Version 1.0 - Creates tables for email/message tracking

-- Recipients table - stores contacts (recruiters, candidates, hiring managers)
CREATE TABLE IF NOT EXISTS outreach_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,
  title TEXT,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('recruiter', 'candidate', 'hiring_manager', 'other')),
  -- Link to existing entities
  recruiter_id UUID REFERENCES prospect_recruiters(id) ON DELETE SET NULL,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  -- Aggregated stats (updated by triggers)
  total_threads INTEGER DEFAULT 0,
  total_messages_sent INTEGER DEFAULT 0,
  total_messages_received INTEGER DEFAULT 0,
  last_contacted_at TIMESTAMPTZ,
  last_reply_at TIMESTAMPTZ,
  avg_response_time_hours NUMERIC,
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email threads table
CREATE TABLE IF NOT EXISTS outreach_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'awaiting_reply', 'replied', 'closed', 'bounced')),
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'linkedin', 'sms', 'other')),
  -- Primary recipient
  recipient_id UUID NOT NULL REFERENCES outreach_recipients(id) ON DELETE CASCADE,
  -- Thread stats
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message_direction TEXT CHECK (last_message_direction IN ('outbound', 'inbound')),
  -- Response tracking
  first_response_at TIMESTAMPTZ,
  response_time_hours NUMERIC,
  -- Ownership
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Related entities
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual messages within threads
CREATE TABLE IF NOT EXISTS outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES outreach_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  -- Content
  body_text TEXT,
  body_html TEXT,
  -- Sender/recipient info for this specific message
  from_email TEXT,
  from_name TEXT,
  to_email TEXT,
  to_name TEXT,
  cc TEXT[],
  bcc TEXT[],
  -- Tracking
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  bounce_reason TEXT,
  -- For inbound messages
  received_at TIMESTAMPTZ,
  -- Metadata
  external_message_id TEXT,
  headers JSONB DEFAULT '{}',
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Templates for outreach messages
CREATE TABLE IF NOT EXISTS outreach_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  category TEXT DEFAULT 'general',
  -- Variables that can be replaced: {{name}}, {{company}}, {{job_title}}, etc.
  variables TEXT[] DEFAULT '{}',
  -- Usage stats
  times_used INTEGER DEFAULT 0,
  avg_open_rate NUMERIC,
  avg_reply_rate NUMERIC,
  -- Ownership
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_shared BOOLEAN DEFAULT false,
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sequences for multi-step outreach campaigns
CREATE TABLE IF NOT EXISTS outreach_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  -- Sequence settings
  steps JSONB NOT NULL DEFAULT '[]',
  -- Example step: { "delay_days": 3, "template_id": "uuid", "condition": "no_reply" }
  -- Stats
  total_enrolled INTEGER DEFAULT 0,
  total_completed INTEGER DEFAULT 0,
  total_replied INTEGER DEFAULT 0,
  -- Ownership
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track recipients enrolled in sequences
CREATE TABLE IF NOT EXISTS outreach_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES outreach_recipients(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES outreach_threads(id) ON DELETE SET NULL,
  -- Progress
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed')),
  next_action_at TIMESTAMPTZ,
  -- Metadata
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(sequence_id, recipient_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_outreach_recipients_email ON outreach_recipients(email);
CREATE INDEX IF NOT EXISTS idx_outreach_recipients_type ON outreach_recipients(recipient_type);
CREATE INDEX IF NOT EXISTS idx_outreach_recipients_recruiter ON outreach_recipients(recruiter_id) WHERE recruiter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_recipients_candidate ON outreach_recipients(candidate_id) WHERE candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_threads_recipient ON outreach_threads(recipient_id);
CREATE INDEX IF NOT EXISTS idx_outreach_threads_status ON outreach_threads(status);
CREATE INDEX IF NOT EXISTS idx_outreach_threads_owner ON outreach_threads(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_threads_job ON outreach_threads(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_threads_last_message ON outreach_threads(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_thread ON outreach_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_direction ON outreach_messages(direction);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_sent ON outreach_messages(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_sequence_enrollments_sequence ON outreach_sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_outreach_sequence_enrollments_recipient ON outreach_sequence_enrollments(recipient_id);
CREATE INDEX IF NOT EXISTS idx_outreach_sequence_enrollments_next_action ON outreach_sequence_enrollments(next_action_at) WHERE status = 'active';

-- Function to update thread stats when messages are added
CREATE OR REPLACE FUNCTION update_thread_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE outreach_threads
  SET 
    message_count = (SELECT COUNT(*) FROM outreach_messages WHERE thread_id = NEW.thread_id),
    last_message_at = NEW.sent_at,
    last_message_direction = NEW.direction,
    first_response_at = CASE 
      WHEN NEW.direction = 'inbound' AND first_response_at IS NULL THEN NEW.received_at
      ELSE first_response_at
    END,
    response_time_hours = CASE
      WHEN NEW.direction = 'inbound' AND first_response_at IS NULL THEN
        EXTRACT(EPOCH FROM (NEW.received_at - created_at)) / 3600
      ELSE response_time_hours
    END,
    status = CASE
      WHEN NEW.direction = 'inbound' THEN 'replied'
      WHEN NEW.direction = 'outbound' THEN 'awaiting_reply'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = NEW.thread_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for message stats
DROP TRIGGER IF EXISTS trigger_update_thread_stats ON outreach_messages;
CREATE TRIGGER trigger_update_thread_stats
AFTER INSERT ON outreach_messages
FOR EACH ROW
EXECUTE FUNCTION update_thread_stats();

-- Function to update recipient stats
CREATE OR REPLACE FUNCTION update_recipient_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_recipient_id UUID;
BEGIN
  SELECT recipient_id INTO v_recipient_id FROM outreach_threads WHERE id = NEW.thread_id;
  
  UPDATE outreach_recipients
  SET
    total_messages_sent = (
      SELECT COUNT(*) FROM outreach_messages m
      JOIN outreach_threads t ON m.thread_id = t.id
      WHERE t.recipient_id = v_recipient_id AND m.direction = 'outbound'
    ),
    total_messages_received = (
      SELECT COUNT(*) FROM outreach_messages m
      JOIN outreach_threads t ON m.thread_id = t.id
      WHERE t.recipient_id = v_recipient_id AND m.direction = 'inbound'
    ),
    last_contacted_at = CASE 
      WHEN NEW.direction = 'outbound' THEN GREATEST(last_contacted_at, NEW.sent_at)
      ELSE last_contacted_at
    END,
    last_reply_at = CASE
      WHEN NEW.direction = 'inbound' THEN GREATEST(last_reply_at, NEW.received_at)
      ELSE last_reply_at
    END,
    updated_at = NOW()
  WHERE id = v_recipient_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for recipient stats
DROP TRIGGER IF EXISTS trigger_update_recipient_stats ON outreach_messages;
CREATE TRIGGER trigger_update_recipient_stats
AFTER INSERT ON outreach_messages
FOR EACH ROW
EXECUTE FUNCTION update_recipient_stats();
