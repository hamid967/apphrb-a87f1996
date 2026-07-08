-- 1) Fix rls_policy_always_true: replace WITH CHECK (true) on demo_requests with real validation
DROP POLICY IF EXISTS "public can submit demo request" ON public.demo_requests;
CREATE POLICY "public can submit demo request"
ON public.demo_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(btrim(name)) BETWEEN 1 AND 200
  AND char_length(btrim(email)) BETWEEN 3 AND 320
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND char_length(coalesce(phone, '')) <= 40
  AND char_length(coalesce(company, '')) <= 200
  AND char_length(coalesce(units, '')) <= 100
  AND char_length(coalesce(message, '')) <= 4000
  AND char_length(coalesce(source, '')) <= 100
);

-- 2) Revoke EXECUTE from PUBLIC/anon/authenticated on every SECURITY DEFINER function in public,
--    then grant back only to the roles that actually need each one.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      r.proname, r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
      r.proname, r.args
    );
  END LOOP;
END $$;

-- 3) Re-grant EXECUTE to authenticated on functions that end-user RLS/RPC paths depend on.
DO $$
DECLARE
  fn text;
  r record;
  needs_auth text[] := ARRAY[
    -- RLS helpers (referenced from policy expressions)
    'has_role','has_any_role','has_org_role','has_permission',
    'is_org_member','is_org_admin',
    'is_linked_tenant','is_linked_property_owner',
    'get_my_company_id','get_my_role',
    -- User-facing RPCs called from the app (browser/server functions with user JWT)
    'my_access_status','my_permissions',
    'register_company','verify_my_establishment',
    'provision_developer_workspace',
    'get_app_setting','set_app_setting',
    'log_assistant_access',
    'accept_org_invitation','accept_portal_invitation',
    'get_invitation_by_token','get_portal_invitation_by_token',
    'seed_demo_data','reset_demo_data','seed_expense_claims',
    'seed_spending_policies','seed_report_templates','seed_appfolio_demo',
    'bulk_apply_role_template',
    'approve_user_trial','reject_user','admin_regenerate_establishment_no',
    'generate_owner_statement','generate_rent_charges','tenant_pay_charge'
  ];
BEGIN
  FOREACH fn IN ARRAY needs_auth LOOP
    FOR r IN
      SELECT pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
    LOOP
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        fn, r.args
      );
    END LOOP;
  END LOOP;
END $$;

-- 4) Re-grant EXECUTE to anon on the small set of intentionally-anonymous endpoints.
DO $$
DECLARE
  fn text;
  r record;
  needs_anon text[] := ARRAY[
    'check_login_rate_limit',
    'record_login_event',
    'get_invitation_by_token',
    'get_portal_invitation_by_token',
    'accept_org_invitation',
    'accept_portal_invitation',
    'submit_rental_application'
  ];
BEGIN
  FOREACH fn IN ARRAY needs_anon LOOP
    FOR r IN
      SELECT pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
    LOOP
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon',
        fn, r.args
      );
    END LOOP;
  END LOOP;
END $$;