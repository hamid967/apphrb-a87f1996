
-- Admin override for policy violations: record who cleared it, why, and when.
ALTER TABLE public.policy_violations
  ADD COLUMN IF NOT EXISTS overridden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS overridden_at timestamptz;

CREATE INDEX IF NOT EXISTS policy_violations_overridden_by_idx
  ON public.policy_violations (overridden_by)
  WHERE overridden_by IS NOT NULL;
