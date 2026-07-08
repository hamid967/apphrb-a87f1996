-- Establishment number for companies (used as login gate)
CREATE SEQUENCE IF NOT EXISTS public.hbs_establishment_no_seq START 1000;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS establishment_no text;

-- Backfill existing rows
UPDATE public.companies
   SET establishment_no = 'HBS-' || lpad(nextval('public.hbs_establishment_no_seq')::text, 6, '0')
 WHERE establishment_no IS NULL;

ALTER TABLE public.companies
  ALTER COLUMN establishment_no SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_establishment_no_key
  ON public.companies(establishment_no);

-- Auto-generate on insert when not provided
CREATE OR REPLACE FUNCTION public.tg_companies_set_establishment_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.establishment_no IS NULL OR length(trim(NEW.establishment_no)) = 0 THEN
    NEW.establishment_no := 'HBS-' || lpad(nextval('public.hbs_establishment_no_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_companies_set_establishment_no ON public.companies;
CREATE TRIGGER trg_companies_set_establishment_no
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_companies_set_establishment_no();

-- Verify the currently signed-in user belongs to a company with this establishment number.
-- Super admins bypass the check.
CREATE OR REPLACE FUNCTION public.verify_my_establishment(_est_no text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
        FROM public.companies c
        JOIN public.organization_members m ON m.org_id = c.org_id
       WHERE upper(trim(c.establishment_no)) = upper(trim(_est_no))
         AND m.user_id = auth.uid()
         AND c.deleted_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.verify_my_establishment(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.verify_my_establishment(text) TO authenticated;