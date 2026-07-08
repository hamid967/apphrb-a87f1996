
-- 1) Harden profiles: prevent self-assignment of owner_id/tenant_id via trigger.
CREATE OR REPLACE FUNCTION public.tg_profiles_block_link_selfassign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.owner_id IS DISTINCT FROM OLD.owner_id)
     OR (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only admins can change linked owner_id/tenant_id on profiles';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_block_link_selfassign ON public.profiles;
CREATE TRIGGER profiles_block_link_selfassign
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_block_link_selfassign();

-- Also block INSERT-time self linking (row-level: block if owner_id/tenant_id set by non-admin).
CREATE OR REPLACE FUNCTION public.tg_profiles_block_link_selfinsert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.owner_id IS NOT NULL OR NEW.tenant_id IS NOT NULL)
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.owner_id := NULL;
    NEW.tenant_id := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_block_link_selfinsert ON public.profiles;
CREATE TRIGGER profiles_block_link_selfinsert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_block_link_selfinsert();

-- 2) Strengthen linked-owner read policies: require the profile row was linked
--    (owner_id NOT NULL, which the trigger now guarantees can only be admin-set)
--    AND that the reader is a member of the same org as the record.
DROP POLICY IF EXISTS "contracts: linked owner read" ON public.contracts;
CREATE POLICY "contracts: linked owner read"
  ON public.contracts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.owner_id IS NOT NULL
         AND p.owner_id = contracts.owner_id
    )
    AND public.is_org_member(contracts.org_id, auth.uid())
  );

DROP POLICY IF EXISTS "payments: linked owner read" ON public.payments;
CREATE POLICY "payments: linked owner read"
  ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.contracts c
        JOIN public.profiles p ON p.id = auth.uid()
       WHERE c.id = payments.contract_id
         AND p.owner_id IS NOT NULL
         AND c.owner_id = p.owner_id
    )
    AND public.is_org_member(payments.org_id, auth.uid())
  );

DROP POLICY IF EXISTS "tenants: linked owner read" ON public.tenants;
CREATE POLICY "tenants: linked owner read"
  ON public.tenants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.contracts c
        JOIN public.profiles p ON p.id = auth.uid()
       WHERE c.tenant_id = tenants.id
         AND p.owner_id IS NOT NULL
         AND c.owner_id = p.owner_id
    )
    AND public.is_org_member(tenants.org_id, auth.uid())
  );

-- 3) Employees salary: enforce admin-only reads and remove any broader legacy policy.
--    Confirms only is_org_admin can SELECT employees (salary column included).
DROP POLICY IF EXISTS "employees_select" ON public.employees;
CREATE POLICY "employees_select"
  ON public.employees FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id, auth.uid()));

-- 4) Login events: re-affirm SELECT is authenticated-only and scoped to owner.
DROP POLICY IF EXISTS "own login events read" ON public.login_events;
DROP POLICY IF EXISTS "public login events read" ON public.login_events;
CREATE POLICY "own login events read"
  ON public.login_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 5) Profiles: ensure no permissive org-member SELECT policy exists.
--    (Self + app-admin only; drop any legacy org-member read if present.)
DROP POLICY IF EXISTS "profiles org member read" ON public.profiles;
DROP POLICY IF EXISTS "profiles: org member read" ON public.profiles;

-- 6) get_app_setting: allow anon access only to an explicit key allow-list.
CREATE OR REPLACE FUNCTION public.get_app_setting(_key text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
  anon_allowed text[] := ARRAY['allowed_email_domain'];
BEGIN
  IF auth.uid() IS NULL AND NOT (_key = ANY(anon_allowed)) THEN
    RETURN NULL;
  END IF;
  SELECT value INTO v FROM public.app_settings WHERE key = _key;
  RETURN v;
END $$;

-- 7) Lock down SECURITY DEFINER functions in public: revoke EXECUTE from PUBLIC
--    and anon, grant to authenticated by default, then re-grant to anon only for
--    the explicit anon-callable endpoints.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',   r.proname, r.args);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(%s) TO service_role',  r.proname, r.args);
  END LOOP;
END $$;

-- Anon-callable RPCs used by public pages (auth screen, invitation acceptance,
-- login instrumentation, public listing application, and access-status probe):
GRANT EXECUTE ON FUNCTION public.get_app_setting(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_login_event(text, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_rental_application(uuid, text, text, text, numeric, text, date, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.my_access_status() TO anon;
