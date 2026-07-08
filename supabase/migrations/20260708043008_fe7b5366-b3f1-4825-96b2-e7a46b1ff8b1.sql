-- Tighten DELETE authorization on autopay_schedules, payment_methods_saved, listings.
-- Existing ALL policies allow any org member via USING; DELETE ignores WITH CHECK,
-- so any member could delete. Add explicit restrictive DELETE policies.

CREATE POLICY "ap_delete_admin_only"
  ON public.autopay_schedules
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (is_linked_tenant(tenant_id, auth.uid()) OR is_org_admin(org_id, auth.uid()));

CREATE POLICY "pm_saved_delete_admin_only"
  ON public.payment_methods_saved
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (is_linked_tenant(tenant_id, auth.uid()) OR is_org_admin(org_id, auth.uid()));

CREATE POLICY "listings_delete_admin_only"
  ON public.listings
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (is_org_admin(org_id, auth.uid()));