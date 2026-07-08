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

  IF NOT EXISTS (SELECT 1 FROM public.units u WHERE u.id = _unit_id AND u.org_id = app_row.org_id) THEN
    RAISE EXCEPTION 'Unit does not belong to organization';
  END IF;

  INSERT INTO public.tenants (org_id, full_name, email, phone)
  VALUES (app_row.org_id, app_row.applicant_name, app_row.email, app_row.phone)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.contracts (
    org_id, tenant_id, unit_id, start_date, end_date, amount, type, status, created_by
  ) VALUES (
    app_row.org_id, new_tenant_id, _unit_id, _start_date, _end_date,
    _monthly_rent, 'rent', 'draft', auth.uid()
  )
  RETURNING id INTO new_contract_id;

  UPDATE public.rental_applications
     SET status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         converted_tenant_id = new_tenant_id,
         converted_contract_id = new_contract_id,
         updated_at = now()
   WHERE id = _app_id;

  RETURN jsonb_build_object('tenant_id', new_tenant_id, 'contract_id', new_contract_id);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_rental_application(uuid,uuid,date,date,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_rental_application(uuid,uuid,date,date,numeric) TO authenticated;