
-- 1) profiles: restrict owner_id/tenant_id self-changes; tighten cross-org staff read
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
CREATE POLICY "profiles self update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND owner_id  IS NOT DISTINCT FROM (SELECT p.owner_id  FROM public.profiles p WHERE p.id = auth.uid())
    AND tenant_id IS NOT DISTINCT FROM (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "profiles self read" ON public.profiles;
CREATE POLICY "profiles self read" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- 2) employees: restrict SELECT to org admins (salary exposure)
DROP POLICY IF EXISTS employees_select ON public.employees;
CREATE POLICY employees_select ON public.employees
  FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()));

-- 3) login_events: scope SELECT to authenticated role explicitly
DROP POLICY IF EXISTS "own login events read" ON public.login_events;
CREATE POLICY "own login events read" ON public.login_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 4) notify_user: add authz — only self or org admin/staff, block arbitrary targeting
CREATE OR REPLACE FUNCTION public.notify_user(_user_id uuid, _title text, _body text, _type text DEFAULT 'info'::text, _link text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE nid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT EXISTS (
       SELECT 1
         FROM public.organization_members me
         JOIN public.organization_members target ON target.org_id = me.org_id
        WHERE me.user_id = auth.uid()
          AND target.user_id = _user_id
          AND me.role IN ('owner','admin')
     )
  THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (_user_id, _title, _body, _type, _link) RETURNING id INTO nid;
  RETURN nid;
END; $function$;

-- 5) invitation token PII: require authentication to look up an invite
REVOKE EXECUTE ON FUNCTION public.get_invitation_by_token(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO authenticated;

-- 6) SECURITY DEFINER linter: revoke public/anon/authenticated on internal-only fns.
-- Trigger functions (invoked implicitly, do not need role EXECUTE)
DO $$
DECLARE fn record;
  internal_fns text[] := ARRAY[
    'handle_new_user','handle_new_organization','grant_site_owner_hamid','grant_hamid_new_org',
    'tg_audit_row','tg_check_spending_policy','tg_validate_autopay_day','set_updated_at',
    'soft_delete','notify_user','seed_demo_data','seed_expense_claims','seed_report_templates',
    'seed_spending_policies','seed_appfolio_demo','reset_demo_data','generate_owner_statement',
    'generate_rent_charges','tenant_pay_charge','bulk_apply_role_template',
    'provision_developer_workspace','set_app_setting','record_login_event'
  ];
BEGIN
  FOR fn IN
    SELECT n.nspname AS s, p.proname AS f, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY(internal_fns)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon', fn.s, fn.f, fn.args);
    -- keep authenticated only for user-callable ones
    IF fn.f NOT IN ('provision_developer_workspace','set_app_setting','record_login_event',
                    'seed_demo_data','seed_expense_claims','seed_report_templates',
                    'seed_spending_policies','seed_appfolio_demo','reset_demo_data',
                    'generate_owner_statement','generate_rent_charges','tenant_pay_charge',
                    'bulk_apply_role_template','notify_user')
    THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated', fn.s, fn.f, fn.args);
    END IF;
  END LOOP;
END $$;
