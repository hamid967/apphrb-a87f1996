CREATE OR REPLACE FUNCTION public.admin_list_packages()
 RETURNS TABLE(id uuid, code text, name text, active boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT p.id, p.code, p.name, p.active FROM packages p ORDER BY p.price_monthly NULLS LAST, p.name;
END;
$function$;