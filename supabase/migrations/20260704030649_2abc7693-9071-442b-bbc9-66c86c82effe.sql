-- Format check: enforce HBS- followed by 6+ digits (case-insensitive)
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_establishment_no_format_chk;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_establishment_no_format_chk
  CHECK (establishment_no ~ '^HBS-[0-9]{6,}$');

-- Case-insensitive uniqueness (defensive; column already has UNIQUE)
CREATE UNIQUE INDEX IF NOT EXISTS companies_establishment_no_ci_uniq
  ON public.companies (upper(establishment_no))
  WHERE deleted_at IS NULL;

-- Fast lookup for verify_my_establishment(upper(trim(...))) filter path
CREATE INDEX IF NOT EXISTS companies_establishment_no_lookup_idx
  ON public.companies (upper(btrim(establishment_no)))
  WHERE deleted_at IS NULL;