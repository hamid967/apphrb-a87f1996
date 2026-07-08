
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_reason text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
