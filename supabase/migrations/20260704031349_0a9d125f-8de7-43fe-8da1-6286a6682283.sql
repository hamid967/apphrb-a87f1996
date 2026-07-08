CREATE OR REPLACE FUNCTION public.admin_regenerate_establishment_no(_company_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_new text;
  v_old text;
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT establishment_no, org_id INTO v_old, v_org
    FROM public.companies WHERE id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;

  v_new := 'HBS-' || lpad(nextval('public.hbs_establishment_no_seq')::text, 6, '0');
  UPDATE public.companies
     SET establishment_no = v_new, updated_at = now()
   WHERE id = _company_id;

  INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
  VALUES (
    'companies',
    _company_id,
    auth.uid(),
    'regenerate_establishment_no',
    jsonb_build_object(
      'org_id', v_org,
      'old_establishment_no', v_old,
      'new_establishment_no', v_new,
      'at', now()
    )
  );

  RETURN v_new;
END $function$;