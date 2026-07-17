
CREATE OR REPLACE VIEW public.lease_payments
WITH (security_invoker = on) AS
SELECT
  rc.id,
  rc.org_id,
  rc.contract_id,
  rc.tenant_id,
  c.unit_id,
  b.property_id,
  rc.due_date,
  rc.amount,
  COALESCE((
    SELECT SUM(pt.amount)
      FROM public.payment_transactions pt
     WHERE pt.charge_id = rc.id
       AND pt.status = 'succeeded'
  ), 0)::numeric(14,2) AS paid_amount,
  rc.paid_at,
  NULL::text AS payment_method,
  NULL::text AS receipt_number,
  rc.status::text AS status,
  NULL::text AS notes
FROM public.rent_charges rc
LEFT JOIN public.contracts c ON c.id = rc.contract_id
LEFT JOIN public.units u ON u.id = c.unit_id
LEFT JOIN public.buildings b ON b.id = u.building_id;

GRANT SELECT ON public.lease_payments TO authenticated;
GRANT SELECT ON public.lease_payments TO service_role;
