CREATE OR REPLACE FUNCTION public.verify_my_establishment(_est_no text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(auth.uid(),'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.companies c
        JOIN public.organization_members m ON m.org_id = c.org_id
       WHERE upper(trim(c.establishment_no)) = upper(trim(_est_no))
         AND m.user_id = auth.uid()
         AND c.deleted_at IS NULL)
    OR EXISTS (
      -- Portal tenants/owners: verify against the company that owns their tenant/owner record
      SELECT 1 FROM public.profiles p
        JOIN public.companies c ON (
          (p.tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p.tenant_id AND t.org_id = c.org_id))
          OR (p.owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.owners o WHERE o.id = p.owner_id AND o.org_id = c.org_id))
        )
       WHERE p.id = auth.uid()
         AND upper(trim(c.establishment_no)) = upper(trim(_est_no))
         AND c.deleted_at IS NULL);
$function$;