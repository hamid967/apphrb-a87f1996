
-- ============ manages() helper ============
CREATE OR REPLACE FUNCTION public.manages(_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT id, manager_id FROM public.profiles WHERE id = _target
    UNION ALL
    SELECT p.id, p.manager_id
    FROM public.profiles p
    JOIN chain c ON p.id = c.manager_id
  )
  SELECT auth.uid() IS NOT NULL
     AND auth.uid() <> _target
     AND EXISTS (SELECT 1 FROM chain WHERE manager_id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.manages(uuid) TO authenticated;

-- ============ record_audit() SECURITY DEFINER ============
CREATE OR REPLACE FUNCTION public.record_audit(
  _entity text,
  _entity_id uuid,
  _action text,
  _diff jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  INSERT INTO public.audit_log (actor, entity, entity_id, action, diff)
  VALUES (auth.uid(), _entity, _entity_id, _action, _diff);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_audit(text, uuid, text, jsonb) TO authenticated;

-- Block direct INSERT to audit_log (force usage of record_audit)
DROP POLICY IF EXISTS "audit insert" ON public.audit_log;
REVOKE INSERT ON public.audit_log FROM authenticated;

-- ============ expenses policies ============
DROP POLICY IF EXISTS "expenses own read" ON public.expenses;
DROP POLICY IF EXISTS "expenses own/staff update" ON public.expenses;

CREATE POLICY "expenses read"
ON public.expenses FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[])
  OR (public.has_role(auth.uid(), 'manager') AND public.manages(user_id))
);

CREATE POLICY "expenses owner draft update"
ON public.expenses FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND status IN ('draft','rejected'))
WITH CHECK (
  user_id = auth.uid()
  AND status IN ('draft','submitted')
);

CREATE POLICY "expenses staff update"
ON public.expenses FOR UPDATE TO authenticated
USING (
  user_id <> auth.uid()
  AND (
    public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[])
    OR (public.has_role(auth.uid(), 'manager') AND public.manages(user_id))
  )
)
WITH CHECK (
  user_id <> auth.uid()
  AND (
    public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[])
    OR (public.has_role(auth.uid(), 'manager') AND public.manages(user_id))
  )
);

-- ============ expense_reports policies ============
DROP POLICY IF EXISTS "reports own read" ON public.expense_reports;
DROP POLICY IF EXISTS "reports own update" ON public.expense_reports;

CREATE POLICY "reports read"
ON public.expense_reports FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[])
  OR (public.has_role(auth.uid(), 'manager') AND public.manages(user_id))
);

CREATE POLICY "reports owner draft update"
ON public.expense_reports FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND status IN ('draft','rejected'))
WITH CHECK (
  user_id = auth.uid()
  AND status IN ('draft','submitted')
);

CREATE POLICY "reports staff update"
ON public.expense_reports FOR UPDATE TO authenticated
USING (
  user_id <> auth.uid()
  AND (
    public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[])
    OR (public.has_role(auth.uid(), 'manager') AND public.manages(user_id))
  )
)
WITH CHECK (
  user_id <> auth.uid()
  AND (
    public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[])
    OR (public.has_role(auth.uid(), 'manager') AND public.manages(user_id))
  )
);

-- ============ policy_violations DELETE ============
DROP POLICY IF EXISTS "violations system delete" ON public.policy_violations;

CREATE POLICY "violations delete"
ON public.policy_violations FOR DELETE TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[])
  OR EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.id = policy_violations.expense_id
      AND e.user_id = auth.uid()
      AND e.status IN ('draft','rejected')
  )
);

-- ============ Storage: receipts DELETE ============
DROP POLICY IF EXISTS "receipts user delete" ON storage.objects;

CREATE POLICY "receipts delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'receipts'
  AND (
    public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[])
    OR (
      (storage.foldername(name))[1] = auth.uid()::text
      AND NOT EXISTS (
        SELECT 1 FROM public.expenses e
        WHERE e.receipt_path = storage.objects.name
          AND e.status NOT IN ('draft','rejected')
      )
    )
  )
);

-- ============ handle_new_user: domain allowlist ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_domain text := current_setting('app.allowed_email_domain', true);
  email_domain text;
BEGIN
  IF allowed_domain IS NOT NULL AND allowed_domain <> '' THEN
    email_domain := lower(split_part(new.email, '@', 2));
    IF email_domain <> lower(allowed_domain) THEN
      RAISE EXCEPTION 'Email domain "%" is not allowed', email_domain
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'employee');
  RETURN new;
END;
$$;
