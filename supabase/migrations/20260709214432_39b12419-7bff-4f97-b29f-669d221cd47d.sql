-- Security hardening: SECURITY DEFINER audit + Materialized View exposure
-- Baseline: revoke EXECUTE from PUBLIC, anon, authenticated on every
-- SECURITY DEFINER function in public. Then grant back deliberately:
--   * anon: only endpoints that legitimately run before sign-in
--   * authenticated: RLS helpers + user-facing RPCs
--   * service_role: privileged/admin/cron
-- Trigger functions and internal cron helpers keep no EXECUTE grants.

-- ============================================================
-- 1. Sweep: revoke EXECUTE from PUBLIC / anon / authenticated
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS ns, p.proname AS fn,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.ns, r.fn, r.args
    );
  END LOOP;
END $$;

-- ============================================================
-- 2. Materialized view: remove Data API exposure
-- ============================================================
REVOKE ALL ON public.mv_billing_pay_om FROM anon, authenticated;
GRANT SELECT ON public.mv_billing_pay_om TO service_role;

-- ============================================================
-- 3. anon-callable (pre-signin endpoints only)
-- ============================================================
GRANT EXECUTE ON FUNCTION public.accept_org_invitation(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_portal_invitation(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_invitation_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_event(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_rental_application(uuid, text, text, text, numeric, text, date, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_rental_application(uuid, text, text, text, numeric, text, date, boolean, text, text, text, smallint, numeric) TO anon, authenticated;

-- ============================================================
-- 4. authenticated: RLS helpers + user-facing RPCs
-- ============================================================
-- RLS/permission helpers (called by policies as the invoker)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, org_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_linked_property_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_linked_tenant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_of_contract(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_access_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_subscription_payments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_setting(text) TO authenticated;

-- Admin/manager RPCs (server-side role checks inside; still user-invoked)
GRANT EXECUTE ON FUNCTION public.admin_billing_churned_orgs(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_billing_last_refresh() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_billing_metrics(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_billing_series(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_billing_trial_orgs(integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_filter_analytics_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_filter_analytics_hourly(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_filter_analytics_overview(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_filter_analytics_top_filters(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_filter_analytics_top_paths(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_packages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_regenerate_establishment_no(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_rental_application(uuid, uuid, date, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_subscription_payment(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_user_trial(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_subscription_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_apply_role_template(uuid, text, text, text, text[], rbac_scope_type, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_owner_statement(uuid, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_rent_charges(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_org_sequence(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_assistant_access(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, uuid, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_soft_delete(text, text, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_company(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_developer_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_pay_charge(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_my_establishment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_apply_bid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_setting(text, text) TO authenticated;

-- ============================================================
-- 5. service_role only: cron / privileged / seeding / queues
-- ============================================================
GRANT EXECUTE ON FUNCTION public.activate_scheduled_auctions() TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_expired_auctions() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_user_roles() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_daily_transitions() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_reminders_scan() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_billing_mvs() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_pending_notifications(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_site_owner(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_hamid_new_org() TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_site_owner_hamid() TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_demo_data() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_appfolio_demo() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_core_system() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_core_system_plan() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_demo_data() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_expense_claims() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_portal_test_users(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_report_templates() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_spending_policies() TO service_role;

-- Trigger functions (tg_*, handle_*, recalc_*, update_auction_high) intentionally
-- receive NO EXECUTE grants. Postgres invokes them directly on row events;
-- they must not be callable from any client role.
