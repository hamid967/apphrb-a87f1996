DROP POLICY IF EXISTS pt_write ON public.payment_transactions;

CREATE POLICY pt_write_org ON public.payment_transactions
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY pt_write_tenant ON public.payment_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rent_charges rc
      WHERE rc.id = payment_transactions.charge_id
        AND is_linked_tenant(rc.tenant_id, auth.uid())
        AND payment_transactions.amount = rc.amount
    )
    AND payment_transactions.status = 'pending'
    AND payment_transactions.receipt_number IS NULL
  );