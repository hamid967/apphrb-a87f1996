
-- Security hardening migration

-- 1) Lock policy_violations writes behind a SECURITY DEFINER fn.
DROP POLICY IF EXISTS "violations system insert" ON public.policy_violations;
REVOKE INSERT ON public.policy_violations FROM authenticated;

CREATE OR REPLACE FUNCTION public.apply_policy_violations(
  _expense_id uuid,
  _violations jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT user_id INTO _owner FROM public.expenses WHERE id = _expense_id;
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;
  IF _owner <> auth.uid()
     AND NOT public.has_any_role(auth.uid(), ARRAY['manager','finance','admin']::app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  DELETE FROM public.policy_violations WHERE expense_id = _expense_id;
  IF _violations IS NOT NULL AND jsonb_typeof(_violations) = 'array' THEN
    INSERT INTO public.policy_violations (expense_id, policy_id, policy_name, severity, message)
    SELECT _expense_id,
           NULLIF(v->>'policy_id','')::uuid,
           v->>'policy_name',
           v->>'severity',
           v->>'message'
      FROM jsonb_array_elements(_violations) v;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.apply_policy_violations(uuid, jsonb) TO authenticated;

-- 2) profiles self update: forbid users from changing their own manager_id.
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
CREATE POLICY "profiles self update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND manager_id IS NOT DISTINCT FROM (
      SELECT manager_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Admin / finance can edit any profile (including manager_id assignment).
DROP POLICY IF EXISTS "profiles staff update" ON public.profiles;
CREATE POLICY "profiles staff update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','finance']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','finance']::app_role[]));

-- 3) user_roles SELECT: managers/finance/admin need to read others' roles
-- (e.g. assertStaffActionOn). Employees still only see their own row.
DROP POLICY IF EXISTS "roles self read" ON public.user_roles;
CREATE POLICY "roles self or staff read" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin','finance','manager']::app_role[])
  );
