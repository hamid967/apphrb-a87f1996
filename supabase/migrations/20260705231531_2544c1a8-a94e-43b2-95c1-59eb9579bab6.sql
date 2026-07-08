ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_layout JSONB NOT NULL DEFAULT '{}'::jsonb;