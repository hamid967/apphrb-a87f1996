
CREATE OR REPLACE FUNCTION public.admin_billing_series(_months integer DEFAULT 12, _package_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(month_start date, revenue numeric, paying_orgs integer, new_paying_orgs integer, churned_orgs integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _n integer := GREATEST(1, LEAST(_months, 36));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT date_trunc('month', (now() AT TIME ZONE 'UTC'))::date
           - (make_interval(months => g))::interval AS m
    FROM generate_series(0, _n - 1) AS g
  ),
  months_d AS (SELECT m::date AS month_start FROM months),
  filtered AS (
    SELECT mv.month_start, mv.org_id, mv.revenue
      FROM public.mv_billing_pay_om mv
     WHERE (_package_id IS NULL OR mv.package_id = _package_id)
  ),
  per_org_month AS (
    SELECT f.month_start, f.org_id, SUM(f.revenue) AS revenue
      FROM filtered f GROUP BY f.month_start, f.org_id
  ),
  first_pay AS (
    SELECT p.org_id, MIN(p.month_start) AS first_month FROM per_org_month p GROUP BY p.org_id
  ),
  per_month AS (
    SELECT p.month_start, SUM(p.revenue) AS revenue, COUNT(*)::int AS paying_orgs
      FROM per_org_month p GROUP BY p.month_start
  ),
  new_per_month AS (
    SELECT fp.first_month AS month_start, COUNT(*)::int AS new_paying_orgs
      FROM first_pay fp GROUP BY fp.first_month
  ),
  churn AS (
    SELECT md.month_start,
           COUNT(*)::int AS churned_orgs
      FROM months_d md
      JOIN per_org_month prev
        ON prev.month_start = (md.month_start - interval '1 month')::date
     WHERE NOT EXISTS (
       SELECT 1 FROM per_org_month cur
        WHERE cur.org_id = prev.org_id AND cur.month_start = md.month_start
     )
     GROUP BY md.month_start
  )
  SELECT md.month_start,
         COALESCE(pm.revenue, 0)::numeric,
         COALESCE(pm.paying_orgs, 0)::integer,
         COALESCE(npm.new_paying_orgs, 0)::integer,
         COALESCE(ch.churned_orgs, 0)::integer
    FROM months_d md
    LEFT JOIN per_month pm       ON pm.month_start = md.month_start
    LEFT JOIN new_per_month npm  ON npm.month_start = md.month_start
    LEFT JOIN churn ch           ON ch.month_start = md.month_start
   ORDER BY md.month_start;
END;
$function$;
