-- 1) auction_bids: drop the org-wide read policy that leaks bidder identity/amount
DROP POLICY IF EXISTS "bids read on published" ON public.auction_bids;

-- 2) profiles: restrict global read to super_admin only (tight control)
DROP POLICY IF EXISTS "profiles self read" ON public.profiles;
CREATE POLICY "profiles self read"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- 3) storage: receipts bucket — remove role bypass on UPDATE/DELETE, owner-only
DROP POLICY IF EXISTS "receipts owner delete" ON storage.objects;
DROP POLICY IF EXISTS "receipts user update" ON storage.objects;

CREATE POLICY "receipts owner delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "receipts owner update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'receipts'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 4) SECURITY DEFINER admin functions: revoke EXECUTE from authenticated.
--    Keep the helper functions used inside RLS (has_role, has_permission, is_*, get_my_*) callable.
REVOKE EXECUTE ON FUNCTION public.admin_billing_churned_orgs(integer, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_billing_last_refresh() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_billing_metrics(integer, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_billing_series(integer, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_billing_trial_orgs(integer, integer, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_filter_analytics_health() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_filter_analytics_hourly(integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_filter_analytics_overview(integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_filter_analytics_top_filters(integer, integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_filter_analytics_top_paths(integer, integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_packages() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_regenerate_establishment_no(uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.approve_site_owner(text, integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.approve_subscription_payment(uuid, text, text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.approve_user_trial(uuid, integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.refresh_billing_mvs() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.reject_subscription_payment(uuid, text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.reject_user(uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.set_app_setting(text, text) FROM authenticated, anon;