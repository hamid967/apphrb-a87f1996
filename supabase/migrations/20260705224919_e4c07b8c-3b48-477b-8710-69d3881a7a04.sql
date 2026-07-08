
-- Track last MV refresh timestamp
CREATE TABLE IF NOT EXISTS public.mv_refresh_log (
  mv_name text PRIMARY KEY,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer,
  row_count bigint
);
GRANT SELECT ON public.mv_refresh_log TO authenticated;
GRANT ALL ON public.mv_refresh_log TO service_role;
ALTER TABLE public.mv_refresh_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read mv refresh log" ON public.mv_refresh_log;
CREATE POLICY "admins read mv refresh log" ON public.mv_refresh_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Materialized aggregate of approved subscription payments per (month, org, package)
DROP MATERIALIZED VIEW IF EXISTS public.mv_billing_pay_om;
CREATE MATERIALIZED VIEW public.mv_billing_pay_om AS
SELECT
  date_trunc('month', COALESCE(sp.transferred_at, sp.created_at::date))::date AS month_start,
  sp.org_id,
  COALESCE(sp.package_id, '00000000-0000-0000-0000-000000000000'::uuid) AS package_key,
  sp.package_id,
  SUM(sp.amount)::numeric AS revenue,
  COUNT(*)::integer AS payment_count
FROM public.subscription_payments sp
WHERE sp.status = 'approved'
GROUP BY 1, sp.org_id, COALESCE(sp.package_id, '00000000-0000-0000-0000-000000000000'::uuid), sp.package_id;

CREATE UNIQUE INDEX mv_billing_pay_om_uidx
  ON public.mv_billing_pay_om (month_start, org_id, package_key);
CREATE INDEX mv_billing_pay_om_pkg_idx
  ON public.mv_billing_pay_om (package_id, month_start);
CREATE INDEX mv_billing_pay_om_month_idx
  ON public.mv_billing_pay_om (month_start);

GRANT SELECT ON public.mv_billing_pay_om TO authenticated, service_role;

-- Refresh helper (concurrent since unique index exists)
CREATE OR REPLACE FUNCTION public.refresh_billing_mvs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t0 timestamptz := clock_timestamp();
  n bigint;
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_billing_pay_om;
  SELECT count(*) INTO n FROM public.mv_billing_pay_om;
  INSERT INTO public.mv_refresh_log (mv_name, refreshed_at, duration_ms, row_count)
  VALUES ('mv_billing_pay_om', now(),
          (extract(epoch FROM (clock_timestamp() - t0)) * 1000)::int, n)
  ON CONFLICT (mv_name) DO UPDATE
    SET refreshed_at = EXCLUDED.refreshed_at,
        duration_ms = EXCLUDED.duration_ms,
        row_count   = EXCLUDED.row_count;
  RETURN jsonb_build_object('mv','mv_billing_pay_om','rows',n,'duration_ms',
    (extract(epoch FROM (clock_timestamp() - t0)) * 1000)::int);
END $$;

REVOKE ALL ON FUNCTION public.refresh_billing_mvs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_billing_mvs() TO service_role;

-- Expose last-refresh timestamp to admins
CREATE OR REPLACE FUNCTION public.admin_billing_last_refresh()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT refreshed_at, duration_ms, row_count INTO r
    FROM public.mv_refresh_log WHERE mv_name = 'mv_billing_pay_om';
  RETURN jsonb_build_object(
    'refreshed_at', r.refreshed_at,
    'duration_ms', r.duration_ms,
    'row_count', r.row_count,
    'refresh_interval_minutes', 15
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_billing_last_refresh() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_billing_last_refresh() TO authenticated, service_role;

-- Rewrite the series function to read from the MV
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
  filtered AS (
    SELECT mv.month_start, mv.org_id, mv.revenue
      FROM public.mv_billing_pay_om mv
     WHERE (_package_id IS NULL OR mv.package_id = _package_id)
  ),
  per_org_month AS (
    -- Collapse across packages when no filter so an org counts once per month
    SELECT month_start, org_id, SUM(revenue) AS revenue
      FROM filtered GROUP BY month_start, org_id
  ),
  first_pay AS (
    SELECT org_id, MIN(month_start) AS first_month FROM per_org_month GROUP BY org_id
  ),
  per_month AS (
    SELECT month_start, SUM(revenue) AS revenue, COUNT(*)::int AS paying_orgs
      FROM per_org_month GROUP BY month_start
  ),
  new_per_month AS (
    SELECT first_month AS month_start, COUNT(*)::int AS new_paying_orgs
      FROM first_pay GROUP BY first_month
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
$$;

REVOKE ALL ON FUNCTION public.admin_billing_series(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_billing_series(integer, uuid) TO authenticated, service_role;

-- Metrics function: also switch paying_ever counter to MV
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
  _refreshed timestamptz;
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
    SELECT COUNT(DISTINCT org_id) INTO _paying_ever FROM public.mv_billing_pay_om;
    SELECT COUNT(*) INTO _trial_cohort
      FROM organizations o
      WHERE o.created_at <= now() - interval '14 days'
        AND o.created_at >= now() - interval '90 days';
    SELECT COUNT(*) INTO _trial_converted
      FROM organizations o
      WHERE o.created_at <= now() - interval '14 days'
        AND o.created_at >= now() - interval '90 days'
        AND EXISTS (SELECT 1 FROM public.mv_billing_pay_om mv WHERE mv.org_id = o.id);
  ELSE
    SELECT COUNT(DISTINCT s.org_id) INTO _total_orgs
      FROM subscriptions s WHERE s.package_id = _package_id;
    SELECT COUNT(DISTINCT org_id) INTO _paying_ever
      FROM public.mv_billing_pay_om WHERE package_id = _package_id;
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
        AND EXISTS (SELECT 1 FROM public.mv_billing_pay_om mv WHERE mv.org_id = o.id AND mv.package_id = _package_id);
  END IF;

  IF _trial_cohort > 0 THEN
    _trial_rate := ROUND((_trial_converted::numeric / _trial_cohort) * 100, 2);
  END IF;

  SELECT refreshed_at INTO _refreshed FROM public.mv_refresh_log WHERE mv_name='mv_billing_pay_om';

  RETURN jsonb_build_object(
    'generated_at', now(),
    'data_refreshed_at', _refreshed,
    'refresh_interval_minutes', 15,
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

-- Initial population
SELECT public.refresh_billing_mvs();

-- Schedule refresh every 15 minutes (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-billing-mvs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'refresh-billing-mvs',
  '*/15 * * * *',
  $$SELECT public.refresh_billing_mvs();$$
);
