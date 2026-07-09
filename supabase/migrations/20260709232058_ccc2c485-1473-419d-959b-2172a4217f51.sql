CREATE OR REPLACE FUNCTION public.admin_billing_metrics(_months integer DEFAULT 12, _package_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT COALESCE(s.revenue, 0), COALESCE(s.paying_orgs, 0), COALESCE(s.new_paying_orgs, 0), COALESCE(s.churned_orgs, 0)
    INTO _mrr, _paying_now, _new_paying, _churned
    FROM public.admin_billing_series(_months, _package_id) AS s
    WHERE s.month_start = _month_now;

  SELECT COALESCE(s.revenue, 0), COALESCE(s.paying_orgs, 0)
    INTO _mrr_prev, _paying_prev
    FROM public.admin_billing_series(_months, _package_id) AS s
    WHERE s.month_start = _month_prev;

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
$function$;