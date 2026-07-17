-- Phase 4: admin overview materialized view
-- Consolidates 16 KPI counters into one row for instant reads.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.admin_overview_mv AS
SELECT
  1::int AS singleton,
  (SELECT count(*) FROM public.profiles) AS users_total,
  (SELECT count(*) FROM public.profiles WHERE approval_status = 'pending') AS users_pending,
  (SELECT count(*) FROM public.organizations) AS orgs_total,
  (SELECT count(*) FROM public.contracts WHERE status = 'active' AND deleted_at IS NULL) AS active_contracts,
  (SELECT count(*) FROM public.login_events WHERE status = 'success' AND created_at > now() - interval '24 hours') AS login_success_24h,
  (SELECT count(*) FROM public.login_events WHERE status IN ('failed','blocked','rate_limited') AND created_at > now() - interval '24 hours') AS login_failed_24h,
  (SELECT count(*) FROM public.audit_log WHERE created_at > now() - interval '24 hours') AS events_24h,
  (SELECT count(*) FROM public.subscriptions WHERE status = 'active' AND deleted_at IS NULL) AS active_subs,
  (SELECT count(*) FROM public.subscriptions WHERE status = 'trial' AND deleted_at IS NULL) AS trial_subs,
  (SELECT count(*) FROM public.subscription_payments WHERE status = 'pending') AS pending_receipts,
  (SELECT count(*) FROM public.subscriptions WHERE status = 'pending' AND deleted_at IS NULL) AS pending_subs,
  (SELECT count(*) FROM public.portal_invitations WHERE accepted_at IS NULL AND expires_at > now()) AS pending_invites,
  (SELECT count(*) FROM public.subscriptions WHERE status = 'rejected' AND reviewed_at > now() - interval '24 hours') AS rejected_subs_24h,
  -- MRR (yearly cycle counted as amount/12)
  COALESCE((
    SELECT round(sum(CASE WHEN billing_cycle = 'yearly' THEN amount/12.0 ELSE amount END))::bigint
    FROM public.subscriptions
    WHERE status = 'active' AND deleted_at IS NULL
  ), 0) AS mrr,
  -- Revenue month-to-date
  COALESCE((
    SELECT round(sum(amount))::bigint
    FROM public.subscription_payments
    WHERE status = 'approved' AND reviewed_at >= date_trunc('month', now())
  ), 0) AS revenue_month,
  -- Revenue year-to-date
  COALESCE((
    SELECT round(sum(amount))::bigint
    FROM public.subscription_payments
    WHERE status = 'approved' AND reviewed_at >= date_trunc('year', now())
  ), 0) AS revenue_year,
  now() AS generated_at
;

-- Unique index enables REFRESH ... CONCURRENTLY (non-blocking).
CREATE UNIQUE INDEX IF NOT EXISTS admin_overview_mv_singleton_uk
  ON public.admin_overview_mv (singleton);

-- Populate now.
REFRESH MATERIALIZED VIEW public.admin_overview_mv;

-- Refresher — super_admin only via has_role check.
CREATE OR REPLACE FUNCTION public.refresh_admin_overview()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.admin_overview_mv;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_admin_overview() TO authenticated;

-- Reader — returns the single row. Bypasses direct-table grants (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.get_admin_overview()
RETURNS public.admin_overview_mv
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.admin_overview_mv;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;
  SELECT * INTO row FROM public.admin_overview_mv WHERE singleton = 1;
  RETURN row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_overview() TO authenticated;

-- No direct grants on the MV itself — access goes through get_admin_overview().
REVOKE ALL ON public.admin_overview_mv FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_overview_mv TO service_role;