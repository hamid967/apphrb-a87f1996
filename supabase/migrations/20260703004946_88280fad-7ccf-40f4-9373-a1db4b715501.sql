
-- ============ login_events ============
DROP POLICY IF EXISTS "insert login events" ON public.login_events;
CREATE POLICY "insert login events auth"
  ON public.login_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============ logs ============
DROP POLICY IF EXISTS "logs insert org member" ON public.logs;
CREATE POLICY "logs insert org member"
  ON public.logs FOR INSERT TO authenticated
  WITH CHECK (
    (org_id IS NOT NULL AND public.is_org_member(org_id, auth.uid()))
    OR (org_id IS NULL AND public.has_role(auth.uid(), 'admin'))
  );

-- ============ rental_applications: remove public direct insert ============
DROP POLICY IF EXISTS "apps_public_insert" ON public.rental_applications;

-- Rate-limited public submission RPC
CREATE OR REPLACE FUNCTION public.submit_rental_application(
  _listing_id uuid,
  _applicant_name text,
  _email text,
  _phone text,
  _monthly_income numeric DEFAULT NULL,
  _employer text DEFAULT NULL,
  _move_in_date date DEFAULT NULL,
  _credit_check_consent boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing record;
  v_recent int;
BEGIN
  IF _applicant_name IS NULL OR length(trim(_applicant_name)) < 2 THEN
    RAISE EXCEPTION 'Invalid applicant name';
  END IF;
  IF _email IS NULL OR _email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  SELECT id, org_id, published INTO v_listing
    FROM public.listings WHERE id = _listing_id;
  IF v_listing IS NULL OR NOT v_listing.published THEN
    RAISE EXCEPTION 'Listing not available';
  END IF;

  -- Rate limit: max 3 submissions per email per listing per 24h
  SELECT count(*) INTO v_recent
    FROM public.rental_applications
   WHERE lower(email) = lower(_email)
     AND listing_id = _listing_id
     AND created_at >= now() - interval '24 hours';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'Too many submissions — try again later';
  END IF;

  INSERT INTO public.rental_applications(
    org_id, listing_id, applicant_name, email, phone,
    monthly_income, employer, move_in_date, credit_check_consent, status
  ) VALUES (
    v_listing.org_id, _listing_id, _applicant_name, _email, _phone,
    _monthly_income, _employer, _move_in_date, COALESCE(_credit_check_consent,false), 'new'
  );

  RETURN jsonb_build_object('ok', true);
END $$;

-- ============ user_roles: explicit admin-only writes ============
DROP POLICY IF EXISTS "roles admin manage" ON public.user_roles;
CREATE POLICY "user_roles admin insert"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles admin update"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles admin delete"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ SECURITY DEFINER function EXECUTE hardening ============
-- Revoke from PUBLIC (covers anon + authenticated) then re-grant selectively.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, r.args);
  END LOOP;
END $$;

-- Re-grant to authenticated only where signed-in users legitimately call
GRANT EXECUTE ON FUNCTION
  public.accept_org_invitation(text),
  public.bulk_apply_role_template(uuid, text, text, text, text[], rbac_scope_type, uuid[]),
  public.check_login_rate_limit(text, integer, integer),
  public.generate_owner_statement(uuid, date, numeric),
  public.generate_rent_charges(uuid, integer),
  public.get_app_setting(text),
  public.has_permission(uuid, text, uuid, uuid, uuid),
  public.log_assistant_access(uuid, text, jsonb),
  public.my_permissions(uuid),
  public.notify_user(uuid, text, text, text, text),
  public.provision_developer_workspace(),
  public.record_login_event(text, text, text, text, text, text),
  public.reset_demo_data(),
  public.seed_appfolio_demo(),
  public.seed_demo_data(),
  public.seed_expense_claims(),
  public.seed_report_templates(),
  public.seed_spending_policies(),
  public.set_app_setting(text, text),
  public.tenant_pay_charge(uuid, uuid),
  public.has_role(uuid, app_role),
  public.has_any_role(uuid, app_role[]),
  public.is_org_admin(uuid, uuid),
  public.is_org_member(uuid, uuid),
  public.has_org_role(uuid, uuid, org_role[]),
  public.is_linked_tenant(uuid, uuid),
  public.is_linked_property_owner(uuid, uuid)
TO authenticated;

-- Public/anon callable: invitation lookup, rate-limit check for login page, and rental submission
GRANT EXECUTE ON FUNCTION
  public.get_invitation_by_token(text),
  public.check_login_rate_limit(text, integer, integer),
  public.record_login_event(text, text, text, text, text, text),
  public.submit_rental_application(uuid, text, text, text, numeric, text, date, boolean)
TO anon, authenticated;

-- Trigger functions and internal helpers: no direct callers needed
-- (already revoked above; leave them without any grant)
