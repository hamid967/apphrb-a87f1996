CREATE OR REPLACE VIEW public.v_occupancy WITH (security_invoker = true) AS
SELECT
  u.org_id, b.id AS building_id, b.name AS building_name,
  u.id AS unit_id, u.code AS unit_code, u.type AS unit_type, u.status AS unit_status,
  u.rent_amount, u.currency_code,
  c.id AS active_contract_id, c.contract_number, c.start_date, c.end_date,
  c.tenant_id, c.owner_id,
  (c.id IS NOT NULL) AS is_occupied,
  CASE WHEN c.end_date IS NOT NULL THEN GREATEST(0, (c.end_date - CURRENT_DATE)) END AS days_to_expiry
FROM public.units u
LEFT JOIN public.buildings b ON b.id = u.building_id
LEFT JOIN LATERAL (
  SELECT id, contract_number, start_date, end_date, tenant_id, owner_id
    FROM public.contracts
   WHERE unit_id = u.id AND status = 'active'
   ORDER BY start_date DESC LIMIT 1
) c ON true;

GRANT SELECT ON public.v_occupancy TO authenticated;
GRANT SELECT ON public.v_occupancy TO service_role;

CREATE OR REPLACE VIEW public.v_ar_aging WITH (security_invoker = true) AS
SELECT
  i.org_id, i.id AS invoice_id, i.number AS invoice_number,
  i.issue_date, i.due_date, i.total, i.currency, i.status,
  GREATEST(0, (CURRENT_DATE - i.due_date))::int AS days_overdue,
  CASE
    WHEN i.paid_at IS NOT NULL           THEN 'paid'
    WHEN i.due_date >= CURRENT_DATE      THEN 'current'
    WHEN CURRENT_DATE - i.due_date <= 30 THEN '1-30'
    WHEN CURRENT_DATE - i.due_date <= 60 THEN '31-60'
    WHEN CURRENT_DATE - i.due_date <= 90 THEN '61-90'
    ELSE '90+'
  END AS bucket
FROM public.invoices i
WHERE i.status <> 'paid' AND i.paid_at IS NULL;

GRANT SELECT ON public.v_ar_aging TO authenticated;
GRANT SELECT ON public.v_ar_aging TO service_role;

CREATE OR REPLACE VIEW public.v_owner_statement WITH (security_invoker = true) AS
WITH pay AS (
  SELECT c.org_id, c.owner_id,
         COALESCE(SUM(p.amount),0) AS total_collected,
         COUNT(p.*)                AS payments_count
    FROM public.contracts c
    LEFT JOIN public.payments p ON p.contract_id = c.id AND p.org_id = c.org_id
   WHERE c.owner_id IS NOT NULL
   GROUP BY c.org_id, c.owner_id
),
exp AS (
  SELECT c.org_id, c.owner_id,
         COALESCE(SUM(e.amount),0) AS total_expenses
    FROM public.contracts c
    JOIN public.units u ON u.id = c.unit_id
    LEFT JOIN public.expenses e ON e.property_id = u.id AND e.org_id = c.org_id
   WHERE c.owner_id IS NOT NULL
   GROUP BY c.org_id, c.owner_id
),
ct AS (
  SELECT org_id, owner_id,
         COUNT(*)                                        AS contracts_count,
         COUNT(*) FILTER (WHERE status='active')         AS active_contracts,
         COALESCE(SUM(amount) FILTER (WHERE status='active'),0) AS active_value
    FROM public.contracts
   WHERE owner_id IS NOT NULL
   GROUP BY org_id, owner_id
)
SELECT
  o.org_id, o.id AS owner_id, o.full_name AS owner_name, o.email, o.phone,
  COALESCE(ct.contracts_count,0)   AS contracts_count,
  COALESCE(ct.active_contracts,0)  AS active_contracts,
  COALESCE(ct.active_value,0)      AS active_value,
  COALESCE(pay.payments_count,0)   AS payments_count,
  COALESCE(pay.total_collected,0)  AS total_collected,
  COALESCE(exp.total_expenses,0)   AS total_expenses,
  COALESCE(pay.total_collected,0) - COALESCE(exp.total_expenses,0) AS net_balance
FROM public.owners o
LEFT JOIN pay ON pay.owner_id = o.id AND pay.org_id = o.org_id
LEFT JOIN exp ON exp.owner_id = o.id AND exp.org_id = o.org_id
LEFT JOIN ct  ON ct.owner_id  = o.id AND ct.org_id  = o.org_id;

GRANT SELECT ON public.v_owner_statement TO authenticated;
GRANT SELECT ON public.v_owner_statement TO service_role;