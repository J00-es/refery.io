-- Add scout/partner agreement tracking to users_admin table
ALTER TABLE users_admin 
ADD COLUMN IF NOT EXISTS accepted_scout_agreement_at TIMESTAMP WITH TIME ZONE;
