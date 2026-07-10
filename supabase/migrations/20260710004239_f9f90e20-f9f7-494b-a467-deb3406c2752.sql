
-- =========================================================================
-- M2: Inject super_admin guard into unguarded admin SECURITY DEFINER fns
-- =========================================================================
DO $migration$
DECLARE
  target_names  text[] := ARRAY[
    'admin_billing_churned_orgs',
    'admin_billing_last_refresh',
    'admin_billing_metrics',
    'admin_billing_series',
    'admin_billing_trial_orgs',
    'approve_subscription_payment',
    'approve_user_trial',
    'grant_hamid_new_org',
    'grant_site_owner_hamid',
    'refresh_billing_mvs',
    'reject_subscription_payment',
    'reset_demo_data',
    'seed_appfolio_demo',
    'seed_core_system',
    'seed_core_system_plan',
    'seed_demo_data',
    'seed_expense_claims',
    'seed_report_templates',
    'seed_spending_policies'
  ];
  guard_block   text := E'\n  IF NOT public.has_role(auth.uid(), ''super_admin''::public.app_role) THEN\n    RAISE EXCEPTION ''forbidden: super_admin role required'' USING ERRCODE = ''42501'';\n  END IF;\n';
  rec           RECORD;
  def_text      text;
  new_def       text;
BEGIN
  FOR rec IN
    SELECT p.oid, p.oid::regprocedure::text AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(target_names)
      AND p.prosecdef = true
      AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
  LOOP
    -- Skip if already guarded (idempotent re-runs).
    IF pg_get_functiondef(rec.oid) ~* '(has_role\s*\(\s*auth\.uid\(\)\s*,\s*''super_admin|is_super_admin\s*\()' THEN
      RAISE NOTICE 'skip %(): already guarded', rec.sig;
      CONTINUE;
    END IF;

    def_text := pg_get_functiondef(rec.oid);

    -- Inject the guard right after the outer BEGIN of the plpgsql body.
    -- Matches the first standalone BEGIN keyword (start of line / after
    -- newline), which is the outer block for every function above.
    new_def := regexp_replace(
      def_text,
      '(\nBEGIN)(\s|\n)',
      '\1' || guard_block || '\2',
      ''
    );

    IF new_def = def_text THEN
      RAISE EXCEPTION 'failed to inject guard into %(): no outer BEGIN matched', rec.sig;
    END IF;

    EXECUTE new_def;
    RAISE NOTICE 'guarded %()', rec.sig;
  END LOOP;
END
$migration$;

-- Re-grant EXECUTE to authenticated for ALL admin functions (guarded + already-guarded).
-- The in-function guard is the source of truth; RPC access is required so admins
-- can call from the client via `context.supabase.rpc(...)`.
DO $regrant$
DECLARE
  admin_names text[] := ARRAY[
    'admin_billing_churned_orgs','admin_billing_last_refresh','admin_billing_metrics',
    'admin_billing_series','admin_billing_trial_orgs','admin_filter_analytics_health',
    'admin_filter_analytics_hourly','admin_filter_analytics_overview',
    'admin_filter_analytics_top_filters','admin_filter_analytics_top_paths',
    'admin_list_packages','admin_regenerate_establishment_no','approve_site_owner',
    'approve_subscription_payment','approve_user_trial','reject_subscription_payment',
    'reject_user','refresh_billing_mvs','set_app_setting'
    -- Note: grant_hamid_*, seed_*, reset_demo_data intentionally stay
    -- authenticated-blocked; they are one-shot maintenance and should be
    -- invoked via server functions using supabaseAdmin, not from clients.
  ];
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = ANY(admin_names)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', r.sig,
      'M2-guarded: requires has_role(auth.uid(), ''super_admin''). RPC-callable by authenticated; guard enforces role at runtime.');
  END LOOP;
END
$regrant$;

-- Maintenance / seed / grant functions: explicitly document that they are
-- service_role-only and must be invoked from server functions via supabaseAdmin
-- after an application-level has_role check.
DO $maint$
DECLARE
  maint_names text[] := ARRAY[
    'grant_hamid_new_org','grant_site_owner_hamid','reset_demo_data',
    'seed_appfolio_demo','seed_core_system','seed_core_system_plan',
    'seed_demo_data','seed_expense_claims','seed_report_templates',
    'seed_spending_policies'
  ];
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = ANY(maint_names)
  LOOP
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', r.sig,
      'M2-guarded: super_admin in-function guard + service_role-only RPC. Invoke from server fn via supabaseAdmin after has_role check.');
  END LOOP;
END
$maint$;
