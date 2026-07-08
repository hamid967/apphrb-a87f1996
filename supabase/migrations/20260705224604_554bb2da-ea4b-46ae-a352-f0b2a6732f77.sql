
DROP FUNCTION IF EXISTS public.admin_billing_series(integer);
DROP FUNCTION IF EXISTS public.admin_billing_metrics(integer);

CREATE OR REPLACE FUNCTION public.admin_billing_series(_months integer DEFAULT 12, _package_id uuid DEFAULT NULL)
RETURNS TABLE (
  month_start date,
  revenue numeric,
  paying_orgs integer,
  new_paying_orgs integer,
  churned_orgs integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  pays AS (
    SELECT sp.org_id,
           COALESCE(sp.transferred_at, sp.created_at::date) AS pay_date,
           sp.amount
    FROM subscription_payments sp
    WHERE sp.status = 'approved'
      AND (_package_id IS NULL OR sp.package_id = _package_id)
  ),
  first_pay AS (
    SELECT org_id, MIN(pay_date) AS first_date FROM pays GROUP BY org_id
  ),
  per_month AS (
    SELECT date_trunc('month', pay_date)::date AS month_start,
           SUM(amount) AS revenue,
           COUNT(DISTINCT org_id) AS paying_orgs
    FROM pays
    GROUP BY 1
  ),
  new_per_month AS (
    SELECT date_trunc('month', first_date)::date AS month_start,
           COUNT(*) AS new_paying_orgs
    FROM first_pay
    GROUP BY 1
  ),
  paying_by_month AS (
    SELECT DISTINCT date_trunc('month', pay_date)::date AS month_start, org_id
    FROM pays
  ),
  churn AS (
    SELECT md.month_start,
           COUNT(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM paying_by_month p
               WHERE p.org_id = md.org_id
                 AND p.month_start = (md.month_start - interval '1 month')::date
             )
             AND NOT EXISTS (
               SELECT 1 FROM paying_by_month p2
               WHERE p2.org_id = md.org_id
                 AND p2.month_start = md.month_start
             )
           ) AS churned_orgs
    FROM (
      SELECT DISTINCT p.org_id, m.month_start
      FROM paying_by_month p
      CROSS JOIN months_d m
    ) md
    GROUP BY md.month_start
  )
  SELECT md.month_start,
         COALESCE(pm.revenue, 0)::numeric AS revenue,
         COALESCE(pm.paying_orgs, 0)::integer AS paying_orgs,
         COALESCE(npm.new_paying_orgs, 0)::integer AS new_paying_orgs,
         COALESCE(ch.churned_orgs, 0)::integer AS churned_orgs
  FROM months_d md
  LEFT JOIN per_month pm       ON pm.month_start = md.month_start
  LEFT JOIN new_per_month npm  ON npm.month_start = md.month_start
  LEFT JOIN churn ch           ON ch.month_start = md.month_start
  ORDER BY md.month_start;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_billing_series(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_billing_series(integer, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_billing_metrics(_months integer DEFAULT 12, _package_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _series jsonb;
  _mrr numeric := 0;
  _mrr_prev numeric := 0;
  _paying_now integer := 0;
  _paying_prev integer := 0;
  _churned integer := 0;
  _new_paying integer := 0;
  _churn_rate numeric := 0;
  _arpu numeric := 0;
  _ltv numeric := NULL;
  _total_orgs integer := 0;
  _paying_ever integer := 0;
  _trial_cohort integer := 0;
  _trial_converted integer := 0;
  _trial_rate numeric := 0;
  _month_now date := date_trunc('month', now())::date;
  _month_prev date := (date_trunc('month', now()) - interval '1 month')::date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(row_to_json(t))
    INTO _series
    FROM (SELECT * FROM public.admin_billing_series(_months, _package_id)) t;

  SELECT COALESCE(revenue, 0), COALESCE(paying_orgs, 0), COALESCE(new_paying_orgs, 0), COALESCE(churned_orgs, 0)
    INTO _mrr, _paying_now, _new_paying, _churned
    FROM public.admin_billing_series(_months, _package_id)
    WHERE month_start = _month_now;

  SELECT COALESCE(revenue, 0), COALESCE(paying_orgs, 0)
    INTO _mrr_prev, _paying_prev
    FROM public.admin_billing_series(_months, _package_id)
    WHERE month_start = _month_prev;

  IF _paying_prev > 0 THEN
    _churn_rate := ROUND((_churned::numeric / _paying_prev) * 100, 2);
  END IF;

  IF _paying_now > 0 THEN
    _arpu := ROUND(_mrr / _paying_now, 2);
  END IF;

  IF _churn_rate > 0 AND _arpu > 0 THEN
    _ltv := ROUND(_arpu / (_churn_rate / 100), 2);
  END IF;

  IF _package_id IS NULL THEN
    SELECT COUNT(*) INTO _total_orgs FROM organizations;
    SELECT COUNT(DISTINCT org_id) INTO _paying_ever
      FROM subscription_payments WHERE status = 'approved';
    SELECT COUNT(*) INTO _trial_cohort
      FROM organizations o
      WHERE o.created_at <= now() - interval '14 days'
        AND o.created_at >= now() - interval '90 days';
    SELECT COUNT(*) INTO _trial_converted
      FROM organizations o
      WHERE o.created_at <= now() - interval '14 days'
        AND o.created_at >= now() - interval '90 days'
        AND EXISTS (
          SELECT 1 FROM subscription_payments sp
          WHERE sp.org_id = o.id AND sp.status = 'approved'
        );
  ELSE
    -- Scope org counts to organizations that ever had a subscription in this package.
    SELECT COUNT(DISTINCT s.org_id) INTO _total_orgs
      FROM subscriptions s WHERE s.package_id = _package_id;
    SELECT COUNT(DISTINCT sp.org_id) INTO _paying_ever
      FROM subscription_payments sp
      WHERE sp.status = 'approved' AND sp.package_id = _package_id;
    SELECT COUNT(DISTINCT o.id) INTO _trial_cohort
      FROM organizations o
      JOIN subscriptions s ON s.org_id = o.id AND s.package_id = _package_id
      WHERE o.created_at <= now() - interval '14 days'
        AND o.created_at >= now() - interval '90 days';
    SELECT COUNT(DISTINCT o.id) INTO _trial_converted
      FROM organizations o
      JOIN subscriptions s ON s.org_id = o.id AND s.package_id = _package_id
      WHERE o.created_at <= now() - interval '14 days'
        AND o.created_at >= now() - interval '90 days'
        AND EXISTS (
          SELECT 1 FROM subscription_payments sp
          WHERE sp.org_id = o.id AND sp.status = 'approved' AND sp.package_id = _package_id
        );
  END IF;

  IF _trial_cohort > 0 THEN
    _trial_rate := ROUND((_trial_converted::numeric / _trial_cohort) * 100, 2);
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'currency', 'SAR',
    'package_id', _package_id,
    'mrr_current', _mrr,
    'mrr_previous', _mrr_prev,
    'mrr_growth_pct', CASE WHEN _mrr_prev > 0 THEN ROUND(((_mrr - _mrr_prev) / _mrr_prev) * 100, 2) ELSE NULL END,
    'paying_orgs_current', _paying_now,
    'paying_orgs_previous', _paying_prev,
    'new_paying_orgs_current', _new_paying,
    'churned_orgs_current', _churned,
    'churn_rate_pct', _churn_rate,
    'arpu', _arpu,
    'ltv', _ltv,
    'total_orgs', _total_orgs,
    'paying_orgs_lifetime', _paying_ever,
    'trial_cohort', _trial_cohort,
    'trial_converted', _trial_converted,
    'trial_conversion_pct', _trial_rate,
    'series', COALESCE(_series, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_billing_metrics(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_billing_metrics(integer, uuid) TO authenticated, service_role;

-- Admin-only helper: list packages for filter dropdown
CREATE OR REPLACE FUNCTION public.admin_list_packages()
RETURNS TABLE (id uuid, code text, name text, active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT p.id, p.code, p.name, p.active FROM packages p ORDER BY p.price_monthly NULLS LAST, p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_packages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_packages() TO authenticated, service_role;
