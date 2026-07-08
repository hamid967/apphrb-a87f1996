-- 1) Extend rental_applications with screening + review + conversion fields
ALTER TABLE public.rental_applications
  ADD COLUMN IF NOT EXISTS national_id text,
  ADD COLUMN IF NOT EXISTS id_type text CHECK (id_type IS NULL OR id_type IN ('national','iqama','passport')),
  ADD COLUMN IF NOT EXISTS employment_type text CHECK (employment_type IS NULL OR employment_type IN ('private','government','self','student','unemployed')),
  ADD COLUMN IF NOT EXISTS dependents smallint,
  ADD COLUMN IF NOT EXISTS current_rent numeric(12,2),
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS score smallint,
  ADD COLUMN IF NOT EXISTS score_reason jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

-- 2) Anon INSERT policy — only on published listings, in a pristine "new" state
GRANT INSERT ON public.rental_applications TO anon;
GRANT SELECT ON public.listings TO anon;  -- needed for the EXISTS check under RLS

DROP POLICY IF EXISTS apps_public_insert ON public.rental_applications;
CREATE POLICY apps_public_insert ON public.rental_applications
  FOR INSERT
  TO anon
  WITH CHECK (
    status = 'new'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND converted_tenant_id IS NULL
    AND converted_contract_id IS NULL
    AND score IS NULL
    AND EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = rental_applications.listing_id
        AND l.org_id = rental_applications.org_id
        AND l.published = true
    )
  );

-- 3) Score calculation trigger
CREATE OR REPLACE FUNCTION public.calculate_application_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  listing_price numeric;
  income_ratio numeric := 0;   -- 0..1
  income_component numeric := 0; -- 0..60
  completeness numeric := 0;     -- 0..40
  filled smallint := 0;
  total  smallint := 8;
  breakdown jsonb;
BEGIN
  SELECT price INTO listing_price FROM public.listings WHERE id = NEW.listing_id;

  IF listing_price IS NOT NULL AND listing_price > 0 AND NEW.monthly_income IS NOT NULL THEN
    -- Rule of thumb: rent ≤ 30% of income → full marks; scale linearly up to that.
    income_ratio := LEAST(1.0, (NEW.monthly_income / NULLIF(listing_price * 12 / 12, 0)) / 3.33);
    income_component := ROUND(income_ratio * 60);
  END IF;

  IF NEW.national_id      IS NOT NULL AND length(NEW.national_id) > 0 THEN filled := filled + 1; END IF;
  IF NEW.id_type          IS NOT NULL THEN filled := filled + 1; END IF;
  IF NEW.employment_type  IS NOT NULL THEN filled := filled + 1; END IF;
  IF NEW.employer         IS NOT NULL AND length(NEW.employer) > 0 THEN filled := filled + 1; END IF;
  IF NEW.monthly_income   IS NOT NULL THEN filled := filled + 1; END IF;
  IF NEW.move_in_date     IS NOT NULL THEN filled := filled + 1; END IF;
  IF NEW.phone            IS NOT NULL AND length(NEW.phone) > 0 THEN filled := filled + 1; END IF;
  IF jsonb_array_length(COALESCE(NEW.documents, '[]'::jsonb)) > 0 THEN filled := filled + 1; END IF;

  completeness := ROUND((filled::numeric / total) * 40);

  NEW.score := LEAST(100, GREATEST(0, (income_component + completeness)::smallint));
  breakdown := jsonb_build_object(
    'income_component', income_component,
    'income_ratio', income_ratio,
    'completeness_component', completeness,
    'filled_fields', filled,
    'total_fields', total
  );
  NEW.score_reason := breakdown;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apps_score ON public.rental_applications;
CREATE TRIGGER apps_score
  BEFORE INSERT OR UPDATE OF national_id, id_type, employment_type, employer, monthly_income, move_in_date, phone, documents, listing_id
  ON public.rental_applications
  FOR EACH ROW EXECUTE FUNCTION public.calculate_application_score();

-- 4) Approve RPC — org members only; creates tenant + draft contract, links both
CREATE OR REPLACE FUNCTION public.approve_rental_application(
  _app_id uuid,
  _unit_id uuid,
  _start_date date,
  _end_date date,
  _monthly_rent numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_row public.rental_applications%ROWTYPE;
  new_tenant_id uuid;
  new_contract_id uuid;
BEGIN
  SELECT * INTO app_row FROM public.rental_applications WHERE id = _app_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF NOT public.is_org_member(app_row.org_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF app_row.status = 'approved' AND app_row.converted_contract_id IS NOT NULL THEN
    RAISE EXCEPTION 'Application already approved and converted';
  END IF;

  -- Verify unit belongs to same org
  IF NOT EXISTS (SELECT 1 FROM public.units u WHERE u.id = _unit_id AND u.org_id = app_row.org_id) THEN
    RAISE EXCEPTION 'Unit does not belong to organization';
  END IF;

  -- Create tenant
  INSERT INTO public.tenants (org_id, full_name, email, phone, national_id)
  VALUES (app_row.org_id, app_row.applicant_name, app_row.email, app_row.phone, app_row.national_id)
  RETURNING id INTO new_tenant_id;

  -- Create draft contract
  INSERT INTO public.contracts (org_id, tenant_id, unit_id, start_date, end_date, monthly_rent, status)
  VALUES (app_row.org_id, new_tenant_id, _unit_id, _start_date, _end_date, _monthly_rent, 'draft')
  RETURNING id INTO new_contract_id;

  UPDATE public.rental_applications
     SET status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         converted_tenant_id = new_tenant_id,
         converted_contract_id = new_contract_id,
         updated_at = now()
   WHERE id = _app_id;

  RETURN jsonb_build_object(
    'tenant_id', new_tenant_id,
    'contract_id', new_contract_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_rental_application(uuid,uuid,date,date,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_rental_application(uuid,uuid,date,date,numeric) TO authenticated;

-- 5) Helpful indexes
CREATE INDEX IF NOT EXISTS rental_applications_org_status_idx
  ON public.rental_applications (org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS rental_applications_listing_idx
  ON public.rental_applications (listing_id);