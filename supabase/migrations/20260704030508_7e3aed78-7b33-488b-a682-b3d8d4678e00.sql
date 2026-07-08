CREATE OR REPLACE FUNCTION public.admin_regenerate_establishment_no(_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  v_new := 'HBS-' || lpad(nextval('public.hbs_establishment_no_seq')::text, 6, '0');
  UPDATE public.companies
     SET establishment_no = v_new, updated_at = now()
   WHERE id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
  RETURN v_new;
END $$;