-- Add referral_bonus_type column to jobs table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'jobs' AND column_name = 'referral_bonus_type'
  ) THEN
    ALTER TABLE public.jobs
    ADD COLUMN referral_bonus_type TEXT DEFAULT 'usd';
    
    -- Add constraint after column creation
    ALTER TABLE public.jobs
    ADD CONSTRAINT check_referral_bonus_type CHECK (referral_bonus_type IN ('usd', 'percent'));
  END IF;
END $$;

-- Backfill existing rows: if referral_bonus is set and type is null, set it to 'usd'
UPDATE public.jobs
SET referral_bonus_type = 'usd'
WHERE referral_bonus IS NOT NULL AND referral_bonus_type IS NULL;
