
CREATE OR REPLACE FUNCTION public.admin_billing_churned_orgs(_months integer DEFAULT 12, _package_id uuid DEFAULT NULL)
RETURNS TABLE (
  month_start date,
  org_id uuid,
  org_name text,
  last_payment_at date,
  last_amount numeric,
  tenure_months integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer := GREATEST(1, LEAST(_months, 36));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT (date_trunc('month', (now() AT TIME ZONE 'UTC'))
            - (make_interval(months => g))::interval)::date AS m
      FROM generate_series(0, _n - 1) AS g
  ),
  filtered AS (
    SELECT mv.month_start, mv.org_id, mv.revenue
      FROM public.mv_billing_pay_om mv
     WHERE (_package_id IS NULL OR mv.package_id = _package_id)
  ),
  per_org_month AS (
    SELECT month_start, org_id, SUM(revenue) AS revenue
      FROM filtered GROUP BY month_start, org_id
  ),
  churn_rows AS (
    SELECT md.m::date AS churn_month, prev.org_id, prev.month_start AS last_month,
           prev.revenue AS last_amount
      FROM months md
      JOIN per_org_month prev
        ON prev.month_start = (md.m - interval '1 month')::date
     WHERE NOT EXISTS (
       SELECT 1 FROM per_org_month cur
        WHERE cur.org_id = prev.org_id AND cur.month_start = md.m::date
     )
  ),
  tenure AS (
    SELECT org_id, COUNT(DISTINCT month_start)::int AS n FROM per_org_month GROUP BY org_id
  )
  SELECT cr.churn_month AS month_start,
         cr.org_id,
         o.name AS org_name,
         cr.last_month AS last_payment_at,
         cr.last_amount,
         COALESCE(t.n, 0) AS tenure_months
    FROM churn_rows cr
    JOIN public.organizations o ON o.id = cr.org_id
    LEFT JOIN tenure t ON t.org_id = cr.org_id
   ORDER BY cr.churn_month DESC, cr.last_amount DESC;
END $$;

REVOKE ALL ON FUNCTION public.admin_billing_churned_orgs(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_billing_churned_orgs(integer, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_billing_trial_orgs(_days_min integer DEFAULT 14, _days_max integer DEFAULT 90, _package_id uuid DEFAULT NULL)
RETURNS TABLE (
  org_id uuid,
  org_name text,
  created_at timestamptz,
  cohort_month date,
  converted boolean,
  first_payment_at date,
  first_amount numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH cohort AS (
    SELECT o.id, o.name, o.created_at
      FROM public.organizations o
     WHERE o.created_at <= now() - make_interval(days => GREATEST(1,_days_min))
       AND o.created_at >= now() - make_interval(days => GREATEST(_days_min+1,_days_max))
       AND (_package_id IS NULL
            OR EXISTS (SELECT 1 FROM public.subscriptions s
                        WHERE s.org_id = o.id AND s.package_id = _package_id))
  ),
  first_pay AS (
    SELECT mv.org_id, MIN(mv.month_start) AS first_month, SUM(mv.revenue) AS first_month_rev
      FROM public.mv_billing_pay_om mv
     WHERE (_package_id IS NULL OR mv.package_id = _package_id)
     GROUP BY mv.org_id
  )
  SELECT c.id AS org_id,
         c.name AS org_name,
         c.created_at,
         date_trunc('month', c.created_at)::date AS cohort_month,
         (fp.first_month IS NOT NULL) AS converted,
         fp.first_month AS first_payment_at,
         fp.first_month_rev AS first_amount
    FROM cohort c
    LEFT JOIN first_pay fp ON fp.org_id = c.id
   ORDER BY c.created_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.admin_billing_trial_orgs(integer, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_billing_trial_orgs(integer, integer, uuid) TO authenticated, service_role;
