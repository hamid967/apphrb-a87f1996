-- Legacy 'admin' role was migrated to 'super_admin', but these SELECT/ALL
-- policies still check the old role literal, so super_admin users can't
-- read subscription_payments or their approval trail. Rewrite them to use
-- the new role.

DROP POLICY IF EXISTS "super admin manage all payments" ON public.subscription_payments;
CREATE POLICY "super admin manage all payments"
  ON public.subscription_payments
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "org admins read own payments" ON public.subscription_payments;
CREATE POLICY "org admins read own payments"
  ON public.subscription_payments
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_admin(org_id, auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "read approvals for visible payments" ON public.payment_approvals;
CREATE POLICY "read approvals for visible payments"
  ON public.payment_approvals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subscription_payments sp
      WHERE sp.id = payment_approvals.payment_id
        AND (
          public.is_org_admin(sp.org_id, auth.uid())
          OR public.has_role(auth.uid(), 'super_admin'::app_role)
        )
    )
  );

DROP POLICY IF EXISTS "insert approvals as actor" ON public.payment_approvals;
CREATE POLICY "insert approvals as actor"
  ON public.payment_approvals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.subscription_payments sp
      WHERE sp.id = payment_approvals.payment_id
        AND (
          public.is_org_admin(sp.org_id, auth.uid())
          OR public.has_role(auth.uid(), 'super_admin'::app_role)
        )
    )
  );