-- Remove prior over-broad ALL policies + redundant restrictive DELETE policies
DROP POLICY IF EXISTS "listings_org_all" ON public.listings;
DROP POLICY IF EXISTS "listings_delete_admin_only" ON public.listings;
DROP POLICY IF EXISTS "pm_tenant_manage" ON public.payment_methods_saved;
DROP POLICY IF EXISTS "pm_saved_delete_admin_only" ON public.payment_methods_saved;

-- listings: any org member can read; only admins can write/update/delete
CREATE POLICY "listings_org_select"
  ON public.listings FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY "listings_admin_insert"
  ON public.listings FOR INSERT TO authenticated
  WITH CHECK (is_org_admin(org_id, auth.uid()));

CREATE POLICY "listings_admin_update"
  ON public.listings FOR UPDATE TO authenticated
  USING (is_org_admin(org_id, auth.uid()))
  WITH CHECK (is_org_admin(org_id, auth.uid()));

CREATE POLICY "listings_admin_delete"
  ON public.listings FOR DELETE TO authenticated
  USING (is_org_admin(org_id, auth.uid()));

-- payment_methods_saved: linked tenant or org admin only, across all ops
CREATE POLICY "pm_saved_select"
  ON public.payment_methods_saved FOR SELECT TO authenticated
  USING (is_linked_tenant(tenant_id, auth.uid()) OR is_org_admin(org_id, auth.uid()));

CREATE POLICY "pm_saved_insert"
  ON public.payment_methods_saved FOR INSERT TO authenticated
  WITH CHECK (is_linked_tenant(tenant_id, auth.uid()) OR is_org_admin(org_id, auth.uid()));

CREATE POLICY "pm_saved_update"
  ON public.payment_methods_saved FOR UPDATE TO authenticated
  USING (is_linked_tenant(tenant_id, auth.uid()) OR is_org_admin(org_id, auth.uid()))
  WITH CHECK (is_linked_tenant(tenant_id, auth.uid()) OR is_org_admin(org_id, auth.uid()));

CREATE POLICY "pm_saved_delete"
  ON public.payment_methods_saved FOR DELETE TO authenticated
  USING (is_linked_tenant(tenant_id, auth.uid()) OR is_org_admin(org_id, auth.uid()));